"use client";

import { useReducedMotion } from "motion/react";
import {
  type KeyboardEvent,
  memo,
  type PointerEvent,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { cn } from "@/helpers/classname-helper";

export type TapeMeasureUnit = "cm" | "in";

export type TapeMeasureProps = {
  className?: string;
  /** Accessible name for the blade. */
  label?: string;
  /** Longest the blade can be pulled, in centimetres. It also stops at the edge of its container. */
  maxLength?: number;
  /** Called with the length showing, in millimetres, whenever it changes. */
  onLengthChange?: (millimetres: number) => void;
  /** Play the rasp, the lock click and the clack when the hook hits home. */
  sound?: boolean;
  /** Which scale the window on the case reads out. */
  unit?: TapeMeasureUnit;
};

// 1 mm of blade is 2 CSS pixels, so every millimetre tick lands on a whole pixel.
const PX_PER_MM = 2;
const PX_PER_CM = PX_PER_MM * 10;
const PX_PER_INCH = PX_PER_MM * 25.4;

const CASE_SIZE = 132;
const BLADE_HEIGHT = 40;
const BLADE_TOP = CASE_SIZE - BLADE_HEIGHT - 12;
// The blade's zero sits at the front of the case when it's wound in.
const SLOT_X = CASE_SIZE - 2;
const MOUTH_WIDTH = 14;
const HOOK_WIDTH = 6;
const HOOK_MARGIN = 28;
const LOCK_TOP = 10;
const ROOT_HEIGHT = CASE_SIZE + LOCK_TOP;

// The spring inside the case pulls harder the more blade is out.
const SPRING_PULL = 2400;
const SPRING_PULL_PER_PX = 7;
const TOP_SPEED = 3200;
const REBOUND = 0.17;

type Phase = "idle" | "held" | "retracting" | "settling";

let sharedAudioContext: AudioContext | null = null;
let sharedNoise: AudioBuffer | null = null;

function getAudioContext() {
  if (typeof window === "undefined" || !("AudioContext" in window)) {
    return null;
  }

  sharedAudioContext ??= new AudioContext();

  if (sharedAudioContext.state === "suspended") {
    void sharedAudioContext.resume();
  }

  return sharedAudioContext;
}

function getNoise(context: AudioContext) {
  if (!sharedNoise) {
    const length = context.sampleRate;
    sharedNoise = context.createBuffer(1, length, context.sampleRate);
    const data = sharedNoise.getChannelData(0);

    for (let index = 0; index < length; index += 1) {
      data[index] = Math.random() * 2 - 1;
    }
  }

  return sharedNoise;
}

function playBurst(
  context: AudioContext,
  {
    at = 0,
    decay,
    frequency,
    gain,
    q = 1,
    type = "bandpass",
  }: {
    at?: number;
    decay: number;
    frequency: number;
    gain: number;
    q?: number;
    type?: BiquadFilterType;
  },
) {
  const start = context.currentTime + at;
  const source = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const amp = context.createGain();

  source.buffer = getNoise(context);
  filter.type = type;
  filter.frequency.value = frequency;
  filter.Q.value = q;
  amp.gain.setValueAtTime(gain, start);
  amp.gain.exponentialRampToValueAtTime(0.0001, start + decay);

  source.connect(filter).connect(amp).connect(context.destination);
  source.start(start, Math.random() * 0.5);
  source.stop(start + decay + 0.02);
}

function playThump(context: AudioContext, gain: number) {
  const start = context.currentTime;
  const oscillator = context.createOscillator();
  const amp = context.createGain();

  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(170, start);
  oscillator.frequency.exponentialRampToValueAtTime(58, start + 0.09);
  amp.gain.setValueAtTime(gain, start);
  amp.gain.exponentialRampToValueAtTime(0.0001, start + 0.12);

  oscillator.connect(amp).connect(context.destination);
  oscillator.start(start);
  oscillator.stop(start + 0.14);
}

function playClack(strength: number) {
  const context = getAudioContext();

  if (!context) {
    return;
  }

  const amount = Math.min(1, strength);
  playBurst(context, {
    decay: 0.045,
    frequency: 2600,
    gain: 0.55 * amount,
    q: 0.7,
  });
  playBurst(context, {
    at: 0.012,
    decay: 0.07,
    frequency: 900,
    gain: 0.25 * amount,
    q: 1.4,
  });
  playThump(context, 0.5 * amount);
}

function playLockClick(engaged: boolean) {
  const context = getAudioContext();

  if (!context) {
    return;
  }

  playBurst(context, {
    decay: 0.018,
    frequency: engaged ? 3800 : 3000,
    gain: 0.3,
    q: 3,
  });

  if (engaged) {
    playBurst(context, {
      at: 0.035,
      decay: 0.03,
      frequency: 1500,
      gain: 0.22,
      q: 2,
    });
  }
}

function playStop() {
  const context = getAudioContext();

  if (!context) {
    return;
  }

  playBurst(context, { decay: 0.05, frequency: 700, gain: 0.3, q: 1.2 });
}

function buzz(duration: number) {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    navigator.vibrate?.(duration);
  }
}

/** A looping noise voice whose loudness and pitch follow the blade's speed. */
function createRasp() {
  const context = getAudioContext();

  if (!context) {
    return null;
  }

  const source = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const amp = context.createGain();

  source.buffer = getNoise(context);
  source.loop = true;
  filter.type = "bandpass";
  filter.frequency.value = 1200;
  filter.Q.value = 1.1;
  amp.gain.value = 0;

  source.connect(filter).connect(amp).connect(context.destination);
  source.start();

  return {
    set(speed: number, retracting: boolean) {
      const now = context.currentTime;
      const level = Math.min(1, speed / TOP_SPEED);
      amp.gain.setTargetAtTime(
        (retracting ? 0.16 : 0.09) * Math.sqrt(level),
        now,
        0.025,
      );
      filter.frequency.setTargetAtTime(
        (retracting ? 1600 : 900) + level * 2600,
        now,
        0.03,
      );
    },
    stop() {
      const now = context.currentTime;
      amp.gain.setTargetAtTime(0, now, 0.02);
      source.stop(now + 0.12);
    },
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function rubberBand(over: number, limit: number) {
  return limit * (1 - 1 / (over / limit + 1));
}

const FRACTION_GLYPHS: Record<number, string> = {
  1: "1⁄16",
  2: "1⁄8",
  3: "3⁄16",
  4: "1⁄4",
  5: "5⁄16",
  6: "3⁄8",
  7: "7⁄16",
  8: "1⁄2",
  9: "9⁄16",
  10: "5⁄8",
  11: "11⁄16",
  12: "3⁄4",
  13: "13⁄16",
  14: "7⁄8",
  15: "15⁄16",
};

function formatReading(millimetres: number, unit: TapeMeasureUnit) {
  if (unit === "cm") {
    const value = (millimetres / 10).toFixed(1);
    return { fraction: "", spoken: `${value} centimetres`, whole: value };
  }

  const sixteenths = Math.round((millimetres / 25.4) * 16);
  const whole = Math.floor(sixteenths / 16);
  const remainder = sixteenths % 16;
  const fraction = FRACTION_GLYPHS[remainder] ?? "";

  return {
    fraction,
    spoken: `${whole}${fraction ? ` and ${fraction.replace("⁄", "/")}` : ""} inches`,
    whole: String(whole),
  };
}

/**
 * The printed blade: millimetres along the top edge, inches along the bottom.
 * Its zero is the right-hand end, under the hook, and it counts up into the case.
 */
const BladeMarkings = memo(function BladeMarkings({
  lengthPx,
}: {
  lengthPx: number;
}) {
  const ticks: string[] = [];
  const cmLabels: { red: boolean; x: number; value: number }[] = [];
  const inchLabels: { x: number; value: number }[] = [];
  const totalMm = Math.floor(lengthPx / PX_PER_MM);

  for (let mm = 1; mm <= totalMm; mm += 1) {
    const x = lengthPx - mm * PX_PER_MM + 0.5;
    const height = mm % 10 === 0 ? 11 : mm % 5 === 0 ? 7 : 4;
    ticks.push(`M${x} 0v${height}`);

    if (mm % 10 === 0) {
      const value = mm / 10;
      cmLabels.push({ red: value % 10 === 0, value, x });
    }
  }

  const totalEighths = Math.floor((lengthPx / PX_PER_INCH) * 8);

  for (let eighth = 1; eighth <= totalEighths; eighth += 1) {
    const x = lengthPx - (eighth * PX_PER_INCH) / 8;
    const height =
      eighth % 8 === 0 ? 11 : eighth % 4 === 0 ? 7 : eighth % 2 === 0 ? 5 : 3;
    ticks.push(`M${x} ${BLADE_HEIGHT}v-${height}`);

    if (eighth % 8 === 0) {
      inchLabels.push({ value: eighth / 8, x });
    }
  }

  return (
    <svg
      aria-hidden="true"
      className="absolute inset-0 overflow-visible"
      height={BLADE_HEIGHT}
      viewBox={`0 0 ${lengthPx} ${BLADE_HEIGHT}`}
      width={lengthPx}
    >
      <path d={ticks.join("")} stroke="#1d1a12" strokeWidth={1} />
      {cmLabels.map((label) =>
        label.red ? (
          <g key={`cm-${label.value}`}>
            <rect
              fill="#c8321f"
              height={10}
              rx={1}
              width={label.value >= 10 ? 15 : 9}
              x={label.x - (label.value >= 10 ? 16.5 : 10.5)}
              y={12}
            />
            <text
              fill="#fff7dd"
              fontSize={8.5}
              fontWeight={700}
              textAnchor="end"
              x={label.x - 2}
              y={19.8}
            >
              {label.value}
            </text>
          </g>
        ) : (
          <text
            fill="#1d1a12"
            fontSize={8.5}
            fontWeight={700}
            key={`cm-${label.value}`}
            textAnchor="end"
            x={label.x - 2}
            y={19.8}
          >
            {label.value}
          </text>
        ),
      )}
      {inchLabels.map((label) => (
        <text
          fill="#c8321f"
          fontSize={10}
          fontWeight={800}
          key={`in-${label.value}`}
          textAnchor="end"
          x={label.x - 2.5}
          y={BLADE_HEIGHT - 3}
        >
          {label.value}
        </text>
      ))}
    </svg>
  );
});

export function TapeMeasure({
  className,
  label = "Tape measure blade",
  maxLength = 30,
  onLengthChange,
  sound = true,
  unit = "cm",
}: TapeMeasureProps) {
  const reduceMotion = useReducedMotion();
  const hintId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const caseRef = useRef<HTMLDivElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const hookRef = useRef<HTMLDivElement>(null);
  const dimensionRef = useRef<HTMLDivElement>(null);
  const dimensionLabelRef = useRef<HTMLDivElement>(null);

  const extRef = useRef(0);
  const velocityRef = useRef(0);
  const phaseRef = useRef<Phase>("idle");
  const targetRef = useRef(0);
  const lockedRef = useRef(false);
  const maxExtRef = useRef(maxLength * PX_PER_CM);
  const frameRef = useRef<number | null>(null);
  const lastTimeRef = useRef(0);
  const grabRef = useRef<{ offset: number; pointerId: number } | null>(null);
  const lastMoveRef = useRef({ ext: 0, time: 0 });
  const raspRef = useRef<ReturnType<typeof createRasp>>(null);
  const atStopRef = useRef(false);
  const soundRef = useRef(sound);
  const reduceMotionRef = useRef(reduceMotion);
  const onLengthChangeRef = useRef(onLengthChange);

  const [millimetres, setMillimetres] = useState(0);
  const [locked, setLocked] = useState(false);
  const [held, setHeld] = useState(false);
  const [maxMm, setMaxMm] = useState(maxLength * 10);

  const stripLength = (maxLength + 3) * PX_PER_CM;

  useEffect(() => {
    soundRef.current = sound;
    reduceMotionRef.current = reduceMotion;
    onLengthChangeRef.current = onLengthChange;
  });

  const apply = useCallback(() => {
    const ext = extRef.current;
    const strip = stripRef.current;
    const hook = hookRef.current;

    if (strip) {
      strip.style.transform = `translate3d(${ext - stripLength}px,0,0)`;
    }

    if (hook) {
      const speed = velocityRef.current;
      const whip =
        phaseRef.current === "retracting" && !reduceMotionRef.current
          ? Math.sin(ext / 9) * Math.min(1.6, Math.abs(speed) / 1600)
          : 0;
      const tilt =
        phaseRef.current === "held" ? -2.5 : clamp(speed / 900, -4, 0);
      hook.style.transform = `translate3d(${SLOT_X + ext}px,${whip}px,0) rotate(${tilt}deg)`;
    }

    if (dimensionRef.current) {
      dimensionRef.current.style.width = `${Math.max(0, ext)}px`;
    }

    if (dimensionLabelRef.current) {
      dimensionLabelRef.current.style.transform = `translate3d(${SLOT_X + ext / 2}px,0,0) translateX(-50%)`;
    }

    const mm = Math.round(clamp(ext, 0, maxExtRef.current) / PX_PER_MM);
    setMillimetres((current) => (current === mm ? current : mm));
  }, [stripLength]);

  useEffect(() => {
    onLengthChangeRef.current?.(millimetres);
  }, [millimetres]);

  const stopRasp = useCallback(() => {
    raspRef.current?.stop();
    raspRef.current = null;
  }, []);

  const shakeCase = useCallback((strength: number) => {
    const body = caseRef.current;

    if (!body || reduceMotionRef.current) {
      return;
    }

    const amount = Math.min(1, strength);
    body.animate(
      [
        { transform: "translateX(0) rotate(0deg)" },
        {
          transform: `translateX(${-4 * amount}px) rotate(${-3.2 * amount}deg)`,
        },
        {
          transform: `translateX(${1.6 * amount}px) rotate(${1.2 * amount}deg)`,
        },
        { transform: "translateX(0) rotate(0deg)" },
      ],
      { duration: 340, easing: "cubic-bezier(0.2, 0.8, 0.3, 1)" },
    );
  }, []);

  const step = useCallback(
    (time: number) => {
      const dt = Math.min(0.032, (time - lastTimeRef.current) / 1000 || 0.016);
      lastTimeRef.current = time;
      const phase = phaseRef.current;

      if (phase === "retracting") {
        if (reduceMotionRef.current) {
          extRef.current = Math.max(0, extRef.current - 2400 * dt);
          velocityRef.current = -2400;
        } else {
          const pull = SPRING_PULL + SPRING_PULL_PER_PX * extRef.current;
          velocityRef.current = Math.max(
            -TOP_SPEED,
            velocityRef.current - pull * dt,
          );
          extRef.current += velocityRef.current * dt;
        }

        if (soundRef.current) {
          raspRef.current ??= createRasp();
          raspRef.current?.set(Math.abs(velocityRef.current), true);
        }

        if (extRef.current <= 0) {
          const speed = Math.abs(velocityRef.current);
          extRef.current = 0;

          if (speed > 90 && !reduceMotionRef.current) {
            if (soundRef.current) {
              playClack(speed / 2200);
            }
            shakeCase(speed / 2600);
            buzz(speed > 900 ? 14 : 6);
          } else if (reduceMotionRef.current && soundRef.current) {
            playClack(0.35);
          }

          const rebound = speed * REBOUND;

          if (rebound > 40 && !reduceMotionRef.current) {
            velocityRef.current = rebound;
            extRef.current = 0.01;
          } else {
            velocityRef.current = 0;
            phaseRef.current = "idle";
            stopRasp();
          }
        }
      } else if (phase === "settling") {
        const target = targetRef.current;

        if (reduceMotionRef.current) {
          extRef.current = target;
          velocityRef.current = 0;
        } else {
          const force =
            900 * (target - extRef.current) - 42 * velocityRef.current;
          velocityRef.current += force * dt;
          extRef.current += velocityRef.current * dt;
        }

        if (
          Math.abs(target - extRef.current) < 0.15 &&
          Math.abs(velocityRef.current) < 4
        ) {
          extRef.current = target;
          velocityRef.current = 0;
          phaseRef.current = "idle";
        }
      }

      apply();

      if (
        phaseRef.current === "retracting" ||
        phaseRef.current === "settling"
      ) {
        frameRef.current = requestAnimationFrame(step);
      } else {
        frameRef.current = null;
      }
    },
    [apply, shakeCase, stopRasp],
  );

  const run = useCallback(
    (phase: "retracting" | "settling") => {
      phaseRef.current = phase;

      if (frameRef.current === null) {
        lastTimeRef.current = performance.now();
        frameRef.current = requestAnimationFrame(step);
      }
    },
    [step],
  );

  const letGo = useCallback(() => {
    setHeld(false);

    if (lockedRef.current) {
      targetRef.current = clamp(extRef.current, 0, maxExtRef.current);
      velocityRef.current = 0;
      stopRasp();
      run("settling");
      return;
    }

    if (extRef.current > 0) {
      velocityRef.current = Math.min(0, velocityRef.current);
      run("retracting");
    } else {
      phaseRef.current = "idle";
      stopRasp();
    }
  }, [run, stopRasp]);

  const setLock = useCallback(
    (next: boolean) => {
      if (lockedRef.current === next) {
        return;
      }

      lockedRef.current = next;
      setLocked(next);

      if (soundRef.current) {
        playLockClick(next);
      }
      buzz(next ? 8 : 4);

      if (phaseRef.current === "held") {
        return;
      }

      if (next) {
        // Brake: catch the blade where it is, with a little jolt from its speed.
        targetRef.current = clamp(extRef.current, 0, maxExtRef.current);
        velocityRef.current *= 0.22;
        stopRasp();

        if (extRef.current > 0) {
          run("settling");
        }
        return;
      }

      if (extRef.current > 0) {
        velocityRef.current = 0;
        run("retracting");
      }
    },
    [run, stopRasp],
  );

  // Fit the blade to the room it has.
  useLayoutEffect(() => {
    const root = rootRef.current;

    if (!root) {
      return;
    }

    const measure = () => {
      const room = root.clientWidth - SLOT_X - HOOK_MARGIN;
      const maxExt = clamp(
        Math.floor(room / PX_PER_CM) * PX_PER_CM,
        PX_PER_CM * 4,
        maxLength * PX_PER_CM,
      );
      maxExtRef.current = maxExt;
      setMaxMm(maxExt / PX_PER_MM);

      if (extRef.current > maxExt) {
        extRef.current = maxExt;
        targetRef.current = maxExt;
      }

      apply();
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(root);

    return () => observer.disconnect();
  }, [apply, maxLength]);

  useEffect(
    () => () => {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
      }
      stopRasp();
    },
    [stopRasp],
  );

  const pointerX = (event: PointerEvent) =>
    event.clientX - (rootRef.current?.getBoundingClientRect().left ?? 0);

  const handlePointerDown = (event: PointerEvent<HTMLElement>) => {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    hookRef.current?.focus({
      focusVisible: false,
      preventScroll: true,
    } as FocusOptions);
    event.currentTarget.setPointerCapture(event.pointerId);
    getAudioContext();

    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }

    grabRef.current = {
      offset: pointerX(event) - (SLOT_X + extRef.current),
      pointerId: event.pointerId,
    };
    lastMoveRef.current = { ext: extRef.current, time: event.timeStamp };
    targetRef.current = extRef.current;
    velocityRef.current = 0;
    phaseRef.current = "held";
    atStopRef.current = false;
    setHeld(true);
    apply();
  };

  const handlePointerMove = (event: PointerEvent<HTMLElement>) => {
    const grab = grabRef.current;

    if (!grab || grab.pointerId !== event.pointerId) {
      return;
    }

    const maxExt = maxExtRef.current;
    const raw = pointerX(event) - SLOT_X - grab.offset;
    let next: number;

    if (lockedRef.current) {
      // The brake is on: the blade only gives a hair either way.
      const anchor = targetRef.current;
      next = anchor + clamp((raw - anchor) * 0.08, -3, 3);
    } else if (raw > maxExt) {
      next = maxExt + rubberBand(raw - maxExt, 10);

      if (!atStopRef.current) {
        atStopRef.current = true;
        if (soundRef.current) {
          playStop();
        }
        buzz(6);
      }
    } else {
      next = Math.max(0, raw);
      atStopRef.current = false;
    }

    const elapsed = Math.max(1, event.timeStamp - lastMoveRef.current.time);
    const velocity = ((next - lastMoveRef.current.ext) / elapsed) * 1000;
    lastMoveRef.current = { ext: next, time: event.timeStamp };
    velocityRef.current = velocity;
    extRef.current = next;

    if (soundRef.current && !lockedRef.current) {
      raspRef.current ??= createRasp();
      raspRef.current?.set(Math.abs(velocity), false);
    }

    apply();
  };

  const handlePointerUp = (event: PointerEvent<HTMLElement>) => {
    const grab = grabRef.current;

    if (!grab || grab.pointerId !== event.pointerId) {
      return;
    }

    grabRef.current = null;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    letGo();
  };

  const holdAt = (ext: number) => {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }

    stopRasp();
    extRef.current = clamp(ext, 0, maxExtRef.current);
    targetRef.current = extRef.current;
    velocityRef.current = 0;
    phaseRef.current = lockedRef.current ? "idle" : "held";
    setHeld(!lockedRef.current);
    apply();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const stepMm = event.shiftKey ? 10 : 1;
    const current = Math.round(extRef.current / PX_PER_MM);

    getAudioContext();

    switch (event.key) {
      case "ArrowRight":
      case "ArrowUp":
        holdAt((current + stepMm) * PX_PER_MM);
        break;
      case "ArrowLeft":
      case "ArrowDown":
        holdAt((current - stepMm) * PX_PER_MM);
        break;
      case "PageUp":
        holdAt((current + 50) * PX_PER_MM);
        break;
      case "PageDown":
        holdAt((current - 50) * PX_PER_MM);
        break;
      case "End":
        holdAt(maxExtRef.current);
        break;
      case "Home":
        if (lockedRef.current) {
          holdAt(0);
        } else {
          letGo();
        }
        break;
      case "Escape":
        if (phaseRef.current === "held" && !grabRef.current) {
          letGo();
        }
        break;
      case " ":
      case "Enter":
      case "l":
      case "L":
        setLock(!lockedRef.current);
        break;
      default:
        return;
    }

    event.preventDefault();
  };

  const handleBlur = () => {
    if (phaseRef.current === "held" && !grabRef.current) {
      letGo();
    }
  };

  const reading = formatReading(millimetres, unit);
  const showDimension = locked && millimetres >= 20;

  return (
    <div
      className={cn("relative w-full select-none", className)}
      ref={rootRef}
      style={{ height: ROOT_HEIGHT }}
    >
      {/* Dimension line, drawn once the blade is locked. */}
      <div
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-x-0 transition-opacity duration-200",
          showDimension ? "opacity-100" : "opacity-0",
        )}
        style={{ top: LOCK_TOP + BLADE_TOP - 22 }}
      >
        <div
          className="absolute h-[9px] border-grayscale-9 border-x"
          ref={dimensionRef}
          style={{ left: SLOT_X, top: 0 }}
        >
          <div className="absolute inset-x-0 top-1 border-grayscale-9 border-t border-dashed" />
        </div>
        <div
          className="absolute -top-2 left-0 rounded-[5px] bg-grayscale-1 px-1.5 py-px font-medium font-mono text-[10px] text-grayscale-11 tabular-nums leading-4 ring-1 ring-grayscale-5 dark:bg-grayscale-2"
          ref={dimensionLabelRef}
        >
          {reading.whole}
          {reading.fraction ? ` ${reading.fraction}` : ""}
          {unit === "cm" ? " cm" : "″"}
        </div>
      </div>

      {/* The blade. Its window starts at the case mouth, so the case hides the rest. */}
      <div
        className="pointer-events-none absolute overflow-hidden"
        style={{
          height: BLADE_HEIGHT,
          left: SLOT_X,
          top: LOCK_TOP + BLADE_TOP,
          width: maxMm * PX_PER_MM + HOOK_MARGIN,
        }}
      >
        <div
          className={cn(
            "pointer-events-auto absolute top-0 left-0 touch-none will-change-transform",
            held ? "cursor-grabbing" : "cursor-grab",
          )}
          onLostPointerCapture={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          ref={stripRef}
          style={{
            background:
              "linear-gradient(180deg, #b98b10 0%, #f2c53a 9%, #ffe07a 30%, #f8d257 58%, #e9b625 86%, #a97c0b 100%)",
            boxShadow:
              "inset 0 1px 0 rgb(255 255 255 / 45%), inset 0 -1px 0 rgb(90 60 0 / 35%)",
            height: BLADE_HEIGHT,
            transform: `translate3d(${-stripLength}px,0,0)`,
            width: stripLength,
          }}
        >
          <BladeMarkings lengthPx={stripLength} />
          {/* A soft gloss band runs along the curved blade. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-[11px] h-[3px] bg-white/25 blur-[1px]"
          />
        </div>
      </div>

      {/* The end hook: the thing you grab. */}
      <div
        aria-describedby={hintId}
        aria-label={label}
        aria-orientation="horizontal"
        aria-valuemax={maxMm}
        aria-valuemin={0}
        aria-valuenow={millimetres}
        aria-valuetext={`${reading.spoken}${locked ? ", locked" : ""}`}
        className={cn(
          "absolute top-0 left-0 z-[2] touch-none rounded-[3px] outline-none will-change-transform",
          "focus-visible:ring-2 focus-visible:ring-grayscale-8 focus-visible:ring-offset-4 focus-visible:ring-offset-grayscale-1 dark:focus-visible:ring-offset-grayscale-2",
          held ? "cursor-grabbing" : "cursor-grab",
        )}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        onLostPointerCapture={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        ref={hookRef}
        role="slider"
        style={{
          height: BLADE_HEIGHT + 18,
          top: LOCK_TOP + BLADE_TOP - 6,
          transform: `translate3d(${SLOT_X}px,0,0)`,
          transformOrigin: "0 70%",
          width: HOOK_WIDTH + 18,
        }}
        tabIndex={0}
      >
        {/* Riveted tongue lying on the blade. */}
        <span
          aria-hidden="true"
          className="absolute rounded-l-[3px]"
          style={{
            background:
              "linear-gradient(180deg, #e9e7e1 0%, #b9b6ad 45%, #8d8a82 100%)",
            boxShadow:
              "0 1px 1px rgb(0 0 0 / 30%), inset 0 1px 0 rgb(255 255 255 / 70%)",
            height: 15,
            left: -16,
            top: 6 + (BLADE_HEIGHT - 15) / 2,
            width: 17,
          }}
        >
          {[4, 11].map((x) => (
            <span
              className="absolute top-1/2 size-[5px] -translate-y-1/2 rounded-full"
              key={x}
              style={{
                background:
                  "radial-gradient(circle at 35% 30%, #fff 0%, #cfcac0 35%, #6e6a62 100%)",
                boxShadow: "0 0.5px 0.5px rgb(0 0 0 / 40%)",
                left: x - 2.5,
              }}
            />
          ))}
        </span>
        {/* The bent lip that catches on edges. */}
        <span
          aria-hidden="true"
          className="absolute top-0 left-0 rounded-[2px]"
          style={{
            background:
              "linear-gradient(90deg, #6d6a63 0%, #d9d6ce 35%, #f4f2ec 55%, #8c897f 100%)",
            boxShadow:
              "1px 2px 3px rgb(0 0 0 / 22%), inset 0 0 0 0.5px rgb(0 0 0 / 25%)",
            height: BLADE_HEIGHT + 12,
            width: HOOK_WIDTH,
          }}
        />
      </div>

      {/* The case. */}
      <div
        className="absolute left-0 z-[1]"
        ref={caseRef}
        style={{
          height: CASE_SIZE,
          top: LOCK_TOP,
          transformOrigin: "30% 90%",
          width: CASE_SIZE,
        }}
      >
        {/* Lock: a thumb slide on top of the case. */}
        <button
          aria-label={locked ? "Release blade lock" : "Lock blade"}
          aria-pressed={locked}
          className="group/lock absolute z-[1] flex h-[22px] w-[34px] items-start justify-center rounded-t-[8px] rounded-b-[4px] outline-none focus-visible:ring-2 focus-visible:ring-grayscale-8"
          onClick={() => setLock(!lockedRef.current)}
          onPointerDown={() => getAudioContext()}
          style={{ left: CASE_SIZE - 58, top: -LOCK_TOP }}
          type="button"
        >
          <span
            aria-hidden="true"
            className={cn(
              "block h-[16px] w-[30px] rounded-t-[7px] rounded-b-[3px] transition-[transform,background-color] duration-150 ease-out motion-reduce:transition-none",
              locked
                ? "translate-x-[5px] translate-y-[5px] bg-[#e2552c]"
                : "translate-y-0 bg-[#3d3c39] group-hover/lock:-translate-y-px dark:bg-[#5a5955]",
            )}
            style={{
              backgroundImage:
                "repeating-linear-gradient(90deg, rgb(0 0 0 / 22%) 0 1px, transparent 1px 4px), linear-gradient(180deg, rgb(255 255 255 / 30%), transparent 70%)",
              boxShadow:
                "0 1px 0 rgb(0 0 0 / 35%), inset 0 1px 0 rgb(255 255 255 / 25%)",
            }}
          />
        </button>

        {/* Rubber grip. */}
        <div
          aria-hidden="true"
          className="absolute inset-0 rounded-[34px] rounded-br-[10px] bg-[#2b2a27] dark:bg-[#121211]"
          style={{
            boxShadow:
              "0 1px 0 rgb(255 255 255 / 8%) inset, 0 -3px 0 rgb(0 0 0 / 35%) inset, 0 10px 24px -8px rgb(0 0 0 / 35%), 0 2px 4px rgb(0 0 0 / 18%)",
          }}
        >
          <div
            className="absolute inset-y-[22px] left-[3px] w-[5px] rounded-full opacity-60"
            style={{
              backgroundImage:
                "repeating-linear-gradient(180deg, rgb(255 255 255 / 16%) 0 2px, transparent 2px 6px)",
            }}
          />
        </div>

        {/* Shell. */}
        <div
          aria-hidden="true"
          className="absolute inset-[7px] rounded-[28px] rounded-br-[5px] bg-[linear-gradient(160deg,#fbfaf6_0%,#e7e4dc_55%,#cfcbc1_100%)] dark:bg-[linear-gradient(160deg,#4a4945_0%,#34332f_55%,#262522_100%)]"
          style={{
            boxShadow:
              "inset 0 1px 0 rgb(255 255 255 / 55%), inset 0 -2px 3px rgb(0 0 0 / 18%), 0 1px 2px rgb(0 0 0 / 35%)",
          }}
        />

        {/* Mouth the blade runs out of. */}
        <div
          aria-hidden="true"
          className="absolute rounded-l-[3px] bg-[#141311]"
          style={{
            boxShadow: "inset 2px 0 3px rgb(0 0 0 / 60%)",
            height: BLADE_HEIGHT + 6,
            left: CASE_SIZE - MOUTH_WIDTH,
            top: BLADE_TOP - 3,
            width: MOUTH_WIDTH,
          }}
        />

        {/* Face plate with the readout. */}
        <div
          className="absolute top-[18px] left-[18px] flex size-[86px] items-center justify-center rounded-full"
          style={{
            background:
              "conic-gradient(from 210deg, #9a978f, #f1efe9, #a9a69d, #e7e4dd, #8f8c84, #f4f2ec, #9a978f)",
            boxShadow:
              "inset 0 0 0 1px rgb(0 0 0 / 22%), inset 0 2px 3px rgb(255 255 255 / 60%), 0 1px 0 rgb(255 255 255 / 40%), 0 -1px 0 rgb(0 0 0 / 15%)",
          }}
        >
          <div
            aria-hidden="true"
            className="absolute inset-[5px] rounded-full opacity-60"
            style={{
              background:
                "repeating-radial-gradient(circle, rgb(0 0 0 / 5%) 0 1px, transparent 1px 3px)",
            }}
          />
          <output
            aria-live="off"
            className="relative flex h-[26px] min-w-[62px] items-baseline justify-end gap-[3px] rounded-[5px] px-1.5 pt-[5px] font-mono text-[#e7f1c4] tabular-nums leading-none"
            style={{
              background: "linear-gradient(180deg, #23261d 0%, #171914 100%)",
              boxShadow:
                "inset 0 1px 3px rgb(0 0 0 / 70%), 0 1px 0 rgb(255 255 255 / 55%)",
              textShadow: "0 0 6px rgb(214 240 140 / 45%)",
            }}
          >
            <span className="font-semibold text-[14px] tracking-[-0.04em]">
              {reading.whole}
            </span>
            {reading.fraction ? (
              <span className="text-[9px]">{reading.fraction}</span>
            ) : null}
            <span className="text-[7px] uppercase opacity-70">
              {unit === "cm" ? "cm" : "in"}
            </span>
          </output>
          <span
            aria-hidden="true"
            className={cn(
              "absolute bottom-[15px] size-[5px] rounded-full transition-colors duration-150",
              locked
                ? "bg-[#e2552c] shadow-[0_0_6px_rgb(226_85_44/70%)]"
                : "bg-[#77746c]",
            )}
          />
        </div>
      </div>

      <p className="sr-only" id={hintId}>
        Arrow keys pull the blade out a millimetre at a time, with Shift for a
        centimetre. Space or L locks it. Escape or Home lets go, and it winds
        back in unless it is locked.
      </p>
    </div>
  );
}

/** A small static tape that runs its blade out on hover, for thumbnails. */
export function TapeMeasurePreview({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn("relative h-[52px] w-[176px]", className)}
    >
      <div className="absolute top-[30px] left-[38px] h-[14px] w-[120px] overflow-hidden">
        <div
          className="absolute inset-y-0 left-0 w-[160px] -translate-x-[146px] transition-transform duration-300 ease-in group-hover:translate-x-[-40px] group-hover:duration-700 group-hover:ease-out motion-reduce:transition-none"
          style={{
            backgroundColor: "#f5cd4a",
            backgroundImage:
              "repeating-linear-gradient(270deg, #1d1a12 0 1px, transparent 1px 8px), linear-gradient(180deg, #c3940f, #ffe07a 35%, #e9b625 85%, #a97c0b)",
            backgroundPosition: "right top, 0 0",
            backgroundRepeat: "repeat-x, no-repeat",
            backgroundSize: "100% 4px, 100% 100%",
          }}
        >
          <span className="absolute top-0 right-0 h-full w-[3px] bg-[linear-gradient(90deg,#8c897f,#f4f2ec,#6d6a63)]" />
        </div>
      </div>
      <div className="absolute top-0 left-0 size-[50px] rounded-[14px] bg-[#2b2a27] shadow-[0_6px_14px_-6px_rgb(0_0_0/40%)] dark:bg-[#121211]">
        <div className="absolute inset-[3px] rounded-[11px] bg-[linear-gradient(160deg,#fbfaf6,#cfcbc1)] dark:bg-[linear-gradient(160deg,#4a4945,#262522)]" />
        <div className="absolute top-[8px] left-[8px] size-[30px] rounded-full bg-[conic-gradient(from_210deg,#9a978f,#f1efe9,#a9a69d,#e7e4dd,#8f8c84,#f4f2ec,#9a978f)] shadow-[inset_0_0_0_1px_rgb(0_0_0/20%)]" />
        <div className="absolute top-[-4px] right-[8px] h-[6px] w-[12px] rounded-t-[3px] bg-[#3d3c39] transition-[transform,background-color] duration-300 group-hover:translate-y-[2px] group-hover:bg-[#e2552c] dark:bg-[#5a5955]" />
      </div>
    </div>
  );
}
