"use client";

import {
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
} from "motion/react";
import {
  type ComponentProps,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { cn } from "@/helpers/classname-helper";

/** Degrees either side of twelve o'clock that the knob can travel. */
const HALF_SWEEP = 135;
/** How far past an end stop the knob gives before it refuses to turn. */
const END_STOP_GIVE = 7;
/** How far the hand can keep turning past an end stop before it is ignored. */
const END_STOP_SLACK = 36;
const SETTLE_SPRING = { damping: 26, stiffness: 520, type: "spring" } as const;

type KnobCustomProperty = "--knob-lit";

type KnobStyle = CSSProperties & Partial<Record<KnobCustomProperty, string>>;

export type DetentKnobProps = {
  /** Visible name, also used as the slider's accessible label. */
  label: string;
  min?: number;
  max?: number;
  /** Distance between detents. Each detent is one click. */
  step?: number;
  value?: number;
  defaultValue?: number;
  onValueChange?: (value: number) => void;
  /**
   * Light the LEDs from the centre instead of from the minimum. Useful for
   * bipolar controls such as tone or balance.
   */
  bipolar?: boolean;
  /** Knob diameter in pixels. The LED bezel adds 30% around it. */
  size?: number;
  /** Play a short synthesised click on every detent. */
  sound?: boolean;
  formatValue?: (value: number) => string;
  className?: string;
};

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

function wrapDegrees(degrees: number) {
  return ((((degrees + 180) % 360) + 360) % 360) - 180;
}

/* -------------------------------------------------------------------------- */
/* Sound                                                                       */
/* -------------------------------------------------------------------------- */

let sharedAudioContext: AudioContext | null = null;
let clickBuffer: AudioBuffer | null = null;
let stopBuffer: AudioBuffer | null = null;
let lastClickAt = 0;

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

/** A few milliseconds of decaying noise sounds like a spring-loaded ball. */
function createClickBuffer(
  context: AudioContext,
  duration: number,
  decay: number,
) {
  const length = Math.floor(context.sampleRate * duration);
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);

  for (let index = 0; index < length; index += 1) {
    const t = index / context.sampleRate;
    data[index] = (Math.random() * 2 - 1) * Math.exp(-t / decay);
  }

  return buffer;
}

function playClick(kind: "detent" | "stop", pitch = 1) {
  const context = getAudioContext();

  if (!context) {
    return;
  }

  const now = context.currentTime;

  // Spinning fast through many detents should purr, not clip.
  if (kind === "detent" && now - lastClickAt < 0.016) {
    return;
  }

  lastClickAt = now;
  clickBuffer ??= createClickBuffer(context, 0.018, 0.0016);
  stopBuffer ??= createClickBuffer(context, 0.05, 0.006);

  const source = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const gain = context.createGain();

  source.buffer = kind === "detent" ? clickBuffer : stopBuffer;
  source.playbackRate.value = kind === "detent" ? 0.9 + pitch * 0.2 : 1;
  filter.type = "bandpass";
  filter.frequency.value = kind === "detent" ? 3400 : 900;
  filter.Q.value = kind === "detent" ? 1.4 : 0.9;
  gain.gain.value = kind === "detent" ? 0.55 : 0.8;

  source.connect(filter).connect(gain).connect(context.destination);
  source.start(now);
}

function buzz(duration: number) {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    navigator.vibrate?.(duration);
  }
}

/* -------------------------------------------------------------------------- */
/* Visual pieces                                                               */
/* -------------------------------------------------------------------------- */

/** The knob and its bezel are black in both themes. */
const knobThemeClassName = "[--knob-lit:#ff9a2e]";

/** The bezel's diameter as a multiple of the knob's. */
const BEZEL_SCALE = 1.3;

function detentAngle(index: number, count: number) {
  return count === 0 ? 0 : -HALF_SWEEP + (index / count) * HALF_SWEEP * 2;
}

/** Up to two dozen LEDs, spaced so that small knobs don't crowd them. */
function ledsPerDetent(count: number, arcLength: number, ledSize: number) {
  const fits = Math.min(24, arcLength / (ledSize * 3.2));
  return Math.max(1, Math.round(fits / count));
}

/** The black bezel ring with the LEDs set into it. */
function KnobBezel({
  bipolar,
  count,
  litIndex,
  size,
}: {
  bipolar: boolean;
  count: number;
  litIndex: number;
  size: number;
}) {
  const bezel = size * BEZEL_SCALE;
  const ledRadius = (size + bezel) / 4;
  const ledSize = Math.max(2.5, size * 0.032);
  const arcLength = ledRadius * ((HALF_SWEEP * 2 * Math.PI) / 180);
  const perDetent = ledsPerDetent(count, arcLength, ledSize);
  const ledCount = count * perDetent + 1;
  const centreIndex = count / 2;

  const isLit = (position: number) =>
    bipolar
      ? (position >= centreIndex && position <= litIndex) ||
        (position <= centreIndex && position >= litIndex)
      : position <= litIndex;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full dark:outline dark:outline-1 dark:outline-white/[0.07]"
      style={{
        background:
          "radial-gradient(circle at 50% 50%, #0b0b0c 0 70%, #1d1d20 100%)",
        boxShadow:
          "inset 0 2px 4px rgb(0 0 0 / 70%), inset 0 1px 0 rgb(255 255 255 / 10%), 0 0 0 1px rgb(0 0 0 / 30%), 0 2px 4px rgb(0 0 0 / 18%), 0 12px 28px rgb(0 0 0 / 16%), 0 28px 60px rgb(0 0 0 / 10%)",
        height: bezel,
        width: bezel,
      }}
    >
      {Array.from({ length: ledCount }, (_, led) => {
        const position = led / perDetent;
        const angle = (detentAngle(position, count) * Math.PI) / 180;
        const lit = isLit(position);

        return (
          <span
            className={cn(
              "absolute rounded-full transition-[background-color,box-shadow] duration-150 motion-reduce:transition-none",
              lit
                ? "bg-[#ffc27a] shadow-[0_0_2px_1px_var(--knob-lit),0_0_7px_1px_rgb(255_138_31_/_55%)]"
                : "bg-[#2a2a2e] shadow-[inset_0_1px_1px_rgb(0_0_0_/_80%),0_0.5px_0_rgb(255_255_255_/_8%)]",
            )}
            key={position}
            style={{
              height: ledSize,
              left: bezel / 2 + Math.sin(angle) * ledRadius - ledSize / 2,
              top: bezel / 2 - Math.cos(angle) * ledRadius - ledSize / 2,
              width: ledSize,
            }}
          />
        );
      })}
    </div>
  );
}

/** The matte black knob: a skirt, a raised cap and a glowing pointer slit. */
function KnobBody({
  pressed = false,
  rotation,
  size,
  turnClassName,
}: {
  pressed?: boolean;
  rotation?: ComponentProps<typeof motion.div>["style"];
  size: number;
  turnClassName?: string;
}) {
  return (
    <div
      className={cn(
        "relative rounded-full transition-[transform,box-shadow] duration-150 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none",
        pressed
          ? "scale-[0.985] shadow-[0_1px_2px_rgb(0_0_0_/_70%),0_2px_4px_rgb(0_0_0_/_45%)]"
          : "shadow-[0_2px_3px_rgb(0_0_0_/_60%),0_6px_12px_rgb(0_0_0_/_45%)]",
      )}
      style={{
        background: "linear-gradient(180deg, #3a3a3e, #19191b 55%, #0e0e10)",
        height: size,
        width: size,
      }}
    >
      {/* The light does not turn, so the shading sits outside the turning layer. */}
      <div
        aria-hidden="true"
        className="absolute rounded-full"
        style={{
          background:
            "radial-gradient(circle at 50% 18%, #39393d, #232326 48%, #18181a 100%)",
          boxShadow:
            "0 0 0 1px rgb(0 0 0 / 55%), 0 2px 4px rgb(0 0 0 / 55%), inset 0 1px 0 rgb(255 255 255 / 9%), inset 0 -1px 2px rgb(0 0 0 / 40%)",
          inset: size * 0.09,
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 rounded-full"
        style={{
          boxShadow:
            "inset 0 1px 0 rgb(255 255 255 / 16%), inset 0 -1px 1px rgb(0 0 0 / 60%)",
        }}
      />

      {/* The knob is smooth all the way round, so only the pointer turns. */}
      <motion.div
        className={cn("absolute inset-0 rounded-full", turnClassName)}
        style={rotation}
      >
        <div
          className="absolute left-1/2 rounded-full"
          style={{
            background:
              "linear-gradient(180deg, #ffd9a0, #ff9a2e 55%, #f07a12)",
            boxShadow:
              "0 0 3px 1px rgb(255 138 31 / 70%), 0 0 10px 2px rgb(255 138 31 / 35%)",
            height: size * 0.13,
            top: size * 0.17,
            transform: "translateX(-50%)",
            width: Math.max(2.5, size * 0.034),
          }}
        />
      </motion.div>
    </div>
  );
}

/** A decorative, non-interactive knob for thumbnails and previews. */
export function DetentKnobFace({
  angle,
  className,
  count = 10,
  litIndex = 5,
  size = 56,
  style,
  turnClassName,
}: {
  /** Fixed angle in degrees. Leave unset to rotate with `turnClassName`. */
  angle?: number;
  className?: string;
  count?: number;
  litIndex?: number;
  size?: number;
  style?: KnobStyle;
  /** Classes for the turning layer, e.g. to rotate it on hover. */
  turnClassName?: string;
}) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "relative grid place-items-center",
        knobThemeClassName,
        className,
      )}
      style={{
        height: size * BEZEL_SCALE,
        width: size * BEZEL_SCALE,
        ...style,
      }}
    >
      <KnobBezel
        bipolar={false}
        count={count}
        litIndex={litIndex}
        size={size}
      />
      <KnobBody
        rotation={angle === undefined ? undefined : { rotate: angle }}
        size={size}
        turnClassName={turnClassName}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* The knob                                                                    */
/* -------------------------------------------------------------------------- */

export function DetentKnob({
  bipolar = false,
  className,
  defaultValue,
  formatValue = String,
  label,
  max = 10,
  min = 0,
  onValueChange,
  size = 120,
  sound = true,
  step = 1,
  value: controlledValue,
}: DetentKnobProps) {
  const shouldReduceMotion = useReducedMotion();
  const labelId = useId();
  const count = Math.max(1, Math.round((max - min) / step));
  const stepAngle = (HALF_SWEEP * 2) / count;
  const indexOf = useCallback(
    (value: number) => clamp(Math.round((value - min) / step), 0, count),
    [count, min, step],
  );

  const [uncontrolledValue, setUncontrolledValue] = useState(
    () => defaultValue ?? (bipolar ? (min + max) / 2 : min),
  );
  const value = controlledValue ?? uncontrolledValue;
  const index = indexOf(value);
  const [pressed, setPressed] = useState(false);

  const angle = useMotionValue(detentAngle(index, count));
  const indexRef = useRef(index);
  const dragRef = useRef<{
    centreX: number;
    centreY: number;
    lastPointerAngle: number;
    pointerId: number;
    raw: number;
  } | null>(null);

  const settleTo = useCallback(
    (nextIndex: number) => {
      const target = detentAngle(nextIndex, count);

      if (shouldReduceMotion) {
        angle.set(target);
        return;
      }

      animate(angle, target, SETTLE_SPRING);
    },
    [angle, count, shouldReduceMotion],
  );

  // Follow controlled changes that did not come from the hand on the knob.
  useEffect(() => {
    if (dragRef.current || index === indexRef.current) {
      return;
    }

    indexRef.current = index;
    settleTo(index);
  }, [index, settleTo]);

  const commit = useCallback(
    (nextIndex: number, feedback: "detent" | "stop" | null) => {
      if (feedback && sound) {
        playClick(feedback, nextIndex / count);
      }

      if (feedback) {
        buzz(feedback === "detent" ? 4 : 12);
      }

      if (nextIndex === indexRef.current) {
        return;
      }

      indexRef.current = nextIndex;
      const nextValue = Number((min + nextIndex * step).toFixed(6));

      if (controlledValue === undefined) {
        setUncontrolledValue(nextValue);
      }

      onValueChange?.(nextValue);
    },
    [controlledValue, count, min, onValueChange, sound, step],
  );

  const stepBy = useCallback(
    (delta: number) => {
      const nextIndex = clamp(indexRef.current + delta, 0, count);

      if (nextIndex === indexRef.current) {
        if (sound) {
          playClick("stop");
        }

        if (!shouldReduceMotion) {
          // Nudge into the end stop and bounce back off it.
          const stop = detentAngle(nextIndex, count);
          animate(angle, [stop, stop + Math.sign(delta) * 4, stop], {
            duration: 0.22,
            ease: "easeOut",
          });
        }

        return;
      }

      commit(nextIndex, "detent");
      settleTo(nextIndex);
    },
    [angle, commit, count, settleTo, shouldReduceMotion, sound],
  );

  /**
   * Turn the hand's continuous angle into what a sprung ball in a notched ring
   * would do: hang on to the current notch, then fall into the next one.
   */
  const applyRaw = useCallback(
    (raw: number) => {
      const lowest = -HALF_SWEEP;
      const highest = HALF_SWEEP;

      if (raw < lowest || raw > highest) {
        const stop = raw < lowest ? lowest : highest;
        const over = raw - stop;
        const give =
          Math.sign(over) *
          END_STOP_GIVE *
          (1 - Math.exp(-Math.abs(over) / END_STOP_GIVE));
        const stopIndex = raw < lowest ? 0 : count;

        angle.set(stop + give);

        if (stopIndex !== indexRef.current) {
          commit(stopIndex, "detent");
        }

        return;
      }

      const nearestIndex = Math.round((raw - lowest) / stepAngle);
      const nearest = detentAngle(nearestIndex, count);
      const offset = (raw - nearest) / (stepAngle / 2);
      const held =
        nearest + Math.sign(offset) * Math.abs(offset) ** 2.2 * (stepAngle / 2);

      angle.set(held);

      if (nearestIndex !== indexRef.current) {
        commit(nearestIndex, "detent");
      }
    },
    [angle, commit, count, stepAngle],
  );

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) {
      return;
    }

    const bounds = event.currentTarget.getBoundingClientRect();
    const centreX = bounds.left + bounds.width / 2;
    const centreY = bounds.top + bounds.height / 2;

    event.currentTarget.setPointerCapture(event.pointerId);
    event.currentTarget.focus({ preventScroll: true });
    angle.stop();
    dragRef.current = {
      centreX,
      centreY,
      lastPointerAngle:
        (Math.atan2(event.clientY - centreY, event.clientX - centreX) * 180) /
        Math.PI,
      pointerId: event.pointerId,
      raw: detentAngle(indexRef.current, count),
    };
    setPressed(true);
    getAudioContext();
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;

    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    const dx = event.clientX - drag.centreX;
    const dy = event.clientY - drag.centreY;

    // Too close to the axle and the angle swings wildly; wait for a lever.
    if (Math.hypot(dx, dy) < size * 0.12) {
      return;
    }

    const pointerAngle = (Math.atan2(dy, dx) * 180) / Math.PI;
    const delta = wrapDegrees(pointerAngle - drag.lastPointerAngle);
    const wasPastStop = Math.abs(drag.raw) > HALF_SWEEP;

    drag.lastPointerAngle = pointerAngle;
    drag.raw = clamp(
      drag.raw + delta,
      -HALF_SWEEP - END_STOP_SLACK,
      HALF_SWEEP + END_STOP_SLACK,
    );

    if (!wasPastStop && Math.abs(drag.raw) > HALF_SWEEP && sound) {
      playClick("stop");
    }

    applyRaw(drag.raw);
  }

  function endDrag(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;

    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    dragRef.current = null;
    setPressed(false);
    settleTo(indexRef.current);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const big = Math.max(1, Math.round(count / 5));
    const deltas: Record<string, number> = {
      ArrowDown: -1,
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: 1,
      End: count,
      Home: -count,
      PageDown: -big,
      PageUp: big,
    };
    const delta = deltas[event.key];

    if (delta === undefined) {
      return;
    }

    event.preventDefault();

    if (event.key === "Home" || event.key === "End") {
      const target = event.key === "Home" ? 0 : count;

      if (target !== indexRef.current) {
        commit(target, "detent");
        settleTo(target);
      }

      return;
    }

    stepBy(delta);
  }

  // React's onWheel is passive, so attach a listener that may cancel scrolling.
  const surfaceRef = useRef<HTMLDivElement>(null);
  const wheelRef = useRef({ accumulated: 0, stepBy });
  wheelRef.current.stepBy = stepBy;

  useEffect(() => {
    const surface = surfaceRef.current;

    if (!surface) {
      return;
    }

    function handleWheel(event: WheelEvent) {
      event.preventDefault();
      const state = wheelRef.current;
      const delta =
        Math.abs(event.deltaY) >= Math.abs(event.deltaX)
          ? -event.deltaY
          : event.deltaX;

      state.accumulated += event.deltaMode === 1 ? delta * 40 : delta;

      // Trackpads send many tiny deltas; spend them one detent at a time.
      while (Math.abs(state.accumulated) >= 40) {
        const direction = Math.sign(state.accumulated);
        state.accumulated -= direction * 40;
        state.stepBy(direction);
      }
    }

    surface.addEventListener("wheel", handleWheel, { passive: false });
    return () => surface.removeEventListener("wheel", handleWheel);
  }, []);

  const valueText = formatValue(value);
  const bezelSize = size * BEZEL_SCALE;

  return (
    <div
      className={cn(
        "flex flex-col items-center gap-4",
        knobThemeClassName,
        className,
      )}
    >
      {/* The whole bezel is the slider, so there is plenty to grab. */}
      <div
        aria-labelledby={labelId}
        aria-valuemax={max}
        aria-valuemin={min}
        aria-valuenow={value}
        aria-valuetext={valueText}
        className="relative grid cursor-grab touch-none select-none place-items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-[var(--knob-lit)] focus-visible:ring-offset-4 focus-visible:ring-offset-grayscale-1 active:cursor-grabbing dark:focus-visible:ring-offset-grayscale-2"
        onKeyDown={handleKeyDown}
        onLostPointerCapture={endDrag}
        onPointerCancel={endDrag}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        ref={surfaceRef}
        role="slider"
        style={{ height: bezelSize, width: bezelSize }}
        tabIndex={0}
      >
        <KnobBezel
          bipolar={bipolar}
          count={count}
          litIndex={index}
          size={size}
        />
        <KnobBody pressed={pressed} rotation={{ rotate: angle }} size={size} />
      </div>

      <div className="flex flex-col items-center gap-0.5">
        <span
          className="font-medium font-sans text-[11px] text-grayscale-10 uppercase tracking-[0.2em]"
          id={labelId}
        >
          {label}
        </span>
        <output
          aria-hidden="true"
          className="font-medium font-mono text-grayscale-12 text-xs tabular-nums"
        >
          {valueText}
        </output>
      </div>
    </div>
  );
}
