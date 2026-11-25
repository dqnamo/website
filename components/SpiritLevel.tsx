"use client";

import NumberFlow from "@number-flow/react";
import {
  animate,
  type MotionValue,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useTransform,
} from "motion/react";
import {
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import { cn } from "@/helpers/classname-helper";

/* -------------------------------------------------------------------------- */
/* Geometry                                                                    */
/* -------------------------------------------------------------------------- */

/** The level is drawn at a fixed size; scale the wrapper to resize it. */
export const LEVEL_LENGTH = 420;
export const LEVEL_HEIGHT = 64;

type VialName = "centre" | "diagonal" | "plumb";

type VialSpec = {
  /** The vial's angle inside the bar, in degrees clockwise. */
  offset: number;
  /** Bubble travel per degree of tilt, in pixels. */
  sensitivity: number;
  /** Furthest the bubble can go from the middle before it meets the end. */
  travel: number;
  length: number;
  thickness: number;
  bubble: number;
};

const VIALS: Record<VialName, VialSpec> = {
  centre: {
    bubble: 30,
    length: 112,
    offset: 0,
    sensitivity: 7.5,
    thickness: 22,
    travel: 37,
  },
  diagonal: {
    bubble: 15,
    length: 42,
    offset: -45,
    sensitivity: 2.4,
    thickness: 13,
    travel: 10.5,
  },
  plumb: {
    bubble: 15,
    length: 42,
    offset: 90,
    sensitivity: 2.4,
    thickness: 13,
    travel: 10.5,
  },
};

const VIAL_NAMES = Object.keys(VIALS) as VialName[];

/** The angles at which one of the vials reads true, and which one. */
const MARKS: { angle: number; vial: VialName }[] = [
  { angle: -180, vial: "centre" },
  { angle: -135, vial: "diagonal" },
  { angle: -90, vial: "plumb" },
  { angle: 0, vial: "centre" },
  { angle: 45, vial: "diagonal" },
  { angle: 90, vial: "plumb" },
  { angle: 180, vial: "centre" },
];

const MODE_LABEL: Record<VialName, string> = {
  centre: "Level",
  diagonal: "45°",
  plumb: "Plumb",
};

/** Within this many degrees of a mark the bar hangs on to it exactly. */
const DETENT_HOLD = 0.35;
/** Past the hold, the pull fades out over this many more degrees. */
const DETENT_RAMP = 0.6;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

function wrapDegrees(degrees: number) {
  return ((((degrees + 180) % 360) + 360) % 360) - 180;
}

function nearestMark(angle: number) {
  let best = MARKS[0];

  for (const mark of MARKS) {
    if (Math.abs(angle - mark.angle) < Math.abs(angle - best.angle)) {
      best = mark;
    }
  }

  return best;
}

/**
 * The hand never stops dead on a mark, so the bar holds on to one for a
 * fraction of a degree either side, then eases back to following the hand.
 */
function withDetent(raw: number) {
  const mark = nearestMark(raw);
  const off = raw - mark.angle;
  const distance = Math.abs(off);

  if (distance <= DETENT_HOLD) {
    return mark.angle;
  }

  if (distance >= DETENT_HOLD + DETENT_RAMP) {
    return raw;
  }

  const travelled = (distance - DETENT_HOLD) / DETENT_RAMP;
  return mark.angle + Math.sign(off) * travelled * (DETENT_HOLD + DETENT_RAMP);
}

/**
 * Where the bubble wants to sit. The vial is a barrel, so the bubble rises to
 * the high end by an amount proportional to the tilt, until it meets the end
 * of the glass. Past that, the extra tilt only presses it harder into the end.
 */
function bubbleTarget(barAngle: number, spec: VialSpec) {
  const radians = ((barAngle + spec.offset) * Math.PI) / 180;
  // The barrel is curved on both sides, so upside down reads the same.
  const tilt = (Math.abs(Math.atan(Math.tan(radians))) * 180) / Math.PI;
  const toward = -Math.sign(Math.sin(radians));
  const wanted = tilt * spec.sensitivity;

  return {
    pressure: clamp((wanted - spec.travel) / (spec.travel * 2), 0, 1),
    toward,
    x: toward * Math.min(wanted, spec.travel),
  };
}

/* -------------------------------------------------------------------------- */
/* Sound                                                                       */
/* -------------------------------------------------------------------------- */

let sharedAudioContext: AudioContext | null = null;

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

/** Two soft sine pips, like the beep of a digital inclinometer. */
function playTrueBeep() {
  const context = getAudioContext();

  if (!context) {
    return;
  }

  const now = context.currentTime;

  for (const [index, frequency] of [1568, 2093].entries()) {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const start = now + index * 0.07;

    oscillator.type = "sine";
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(0.07, start + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.09);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(start);
    oscillator.stop(start + 0.1);
  }
}

function buzz(duration: number) {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    navigator.vibrate?.(duration);
  }
}

/* -------------------------------------------------------------------------- */
/* Visual pieces                                                               */
/* -------------------------------------------------------------------------- */

type BubbleMotion = {
  originX: MotionValue<number>;
  scaleX: MotionValue<number>;
  scaleY: MotionValue<number>;
  x: MotionValue<number>;
};

/**
 * An air bubble seen through fluorescent spirit: bright in the middle, with a
 * dark meniscus rim, and a glint that always catches the light from above.
 */
function Bubble({
  className,
  glintRotate,
  motionStyle,
  spec,
}: {
  className?: string;
  /** Counter-rotation for the glint, so it stays on top as the bar turns. */
  glintRotate?: MotionValue<number> | number;
  motionStyle?: BubbleMotion;
  spec: VialSpec;
}) {
  const height = spec.thickness * 0.66;

  return (
    <motion.div
      className={cn("absolute top-1/2 left-1/2", className)}
      style={{
        height,
        marginLeft: -spec.bubble / 2,
        marginTop: -height / 2,
        width: spec.bubble,
        ...motionStyle,
      }}
    >
      <div
        className="absolute inset-0 overflow-hidden rounded-full"
        style={{
          background:
            "radial-gradient(120% 140% at 50% 30%, rgb(255 255 248 / 96%) 0%, rgb(248 255 214 / 82%) 42%, rgb(214 240 112 / 55%) 70%, rgb(150 186 24 / 70%) 100%)",
          boxShadow:
            "inset 0 0 0 1px rgb(92 122 0 / 62%), inset 0 -1.5px 1.5px rgb(255 255 255 / 70%), 0 0 0 0.5px rgb(255 255 230 / 50%)",
        }}
      >
        <motion.div
          className="absolute inset-0"
          style={{ rotate: glintRotate }}
        >
          <div
            className="absolute rounded-full bg-white/90 blur-[0.4px]"
            style={{
              height: height * 0.22,
              left: "26%",
              top: height * 0.14,
              width: "34%",
            }}
          />
        </motion.div>
      </div>
    </motion.div>
  );
}

/** A barrel vial of fluorescent spirit, with two graduation rings. */
function Vial({
  children,
  lit = false,
  spec,
}: {
  children: ReactNode;
  lit?: boolean;
  spec: VialSpec;
}) {
  const ringOffset = spec.bubble / 2 + Math.max(2, spec.bubble * 0.1);
  const ringWidth = Math.max(1.5, spec.thickness * 0.1);

  return (
    <div
      className="relative rounded-full transition-[box-shadow,filter] duration-500 motion-reduce:transition-none"
      style={{
        background:
          "linear-gradient(180deg, #f6ffb0 0%, #ddf55a 26%, #c5e82c 58%, #9cc410 100%)",
        boxShadow: lit
          ? "inset 0 1px 1px rgb(255 255 255 / 85%), inset 0 -2px 3px rgb(70 100 0 / 45%), 0 0 0 1px rgb(60 80 0 / 40%), 0 0 10px 2px rgb(210 255 60 / 55%)"
          : "inset 0 1px 1px rgb(255 255 255 / 85%), inset 0 -2px 3px rgb(70 100 0 / 45%), 0 0 0 1px rgb(60 80 0 / 40%), 0 0 0 0 rgb(210 255 60 / 0%)",
        filter: lit ? "brightness(1.1) saturate(1.1)" : "none",
        height: spec.thickness,
        width: spec.length,
      }}
    >
      {[-1, 1].map((side) => (
        <div
          className="absolute top-0 bottom-0 bg-[#1b1d14]/85"
          key={side}
          style={{
            left: spec.length / 2 + side * ringOffset - ringWidth / 2,
            width: ringWidth,
          }}
        />
      ))}
      {children}
      {/* The glass: a highlight along the top and a darker lip at each end. */}
      <div
        className="pointer-events-none absolute inset-0 rounded-full"
        style={{
          background:
            "linear-gradient(90deg, rgb(60 80 0 / 30%), transparent 12%, transparent 88%, rgb(60 80 0 / 30%)), linear-gradient(180deg, transparent 10%, rgb(255 255 255 / 55%) 16%, rgb(255 255 255 / 0%) 34%)",
        }}
      />
    </div>
  );
}

/** A milled window in the bar, glazed with frosted acrylic. */
function VialWindow({
  children,
  className,
  round = false,
  style,
}: {
  children: ReactNode;
  className?: string;
  round?: boolean;
  style?: CSSProperties;
}) {
  return (
    <div
      className={cn(
        "absolute top-1/2 grid -translate-y-1/2 place-items-center",
        round ? "rounded-full" : "rounded-[6px]",
        className,
      )}
      style={{
        background:
          "radial-gradient(120% 100% at 50% 0%, #fbfcfd, #e4e8ec 60%, #d3d8dd)",
        boxShadow:
          "inset 0 2px 3px rgb(0 0 0 / 38%), inset 0 0 0 1px rgb(0 0 0 / 22%), 0 1px 0 rgb(255 255 255 / 70%), 0 -1px 0 rgb(0 0 0 / 12%)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/** Ridged black rubber over each end of the extrusion. */
function EndCap({ side }: { side: "left" | "right" }) {
  return (
    <div
      className={cn(
        "absolute top-[-2px] bottom-[-2px] w-[22px]",
        side === "left"
          ? "left-[-2px] rounded-l-[9px]"
          : "right-[-2px] rounded-r-[9px]",
      )}
      style={{
        background:
          "repeating-linear-gradient(180deg, rgb(255 255 255 / 0%) 0 3px, rgb(255 255 255 / 7%) 3px 4px, rgb(0 0 0 / 35%) 4px 5px), linear-gradient(180deg, #3a3b3e, #1a1b1d 50%, #0f1011)",
        boxShadow:
          "inset 0 1px 0 rgb(255 255 255 / 14%), inset 0 -1px 1px rgb(0 0 0 / 50%), 0 1px 2px rgb(0 0 0 / 35%)",
      }}
    />
  );
}

/**
 * The extruded aluminium bar with its three vials. Bubbles are passed in, so
 * the same body can be driven by physics or by a CSS transition in previews.
 */
export function SpiritLevelBody({
  bubbles,
  className,
  lit,
}: {
  bubbles: Record<VialName, ReactNode>;
  className?: string;
  lit?: Partial<Record<VialName, boolean>>;
}) {
  return (
    <div
      className={cn("relative", className)}
      style={{ height: LEVEL_HEIGHT, width: LEVEL_LENGTH }}
    >
      {/* Brushed aluminium, slightly dimmer in the dark so it doesn't glare. */}
      <div
        className="absolute inset-0 rounded-[7px] dark:brightness-[0.84]"
        style={{
          background:
            "repeating-linear-gradient(90deg, rgb(255 255 255 / 0%) 0 2px, rgb(255 255 255 / 16%) 2px 3px, rgb(0 0 0 / 3%) 3px 5px), linear-gradient(180deg, #fbfcfd 0%, #dfe3e7 9%, #cdd2d7 46%, #bfc5cb 54%, #d4d8dc 90%, #9aa1a8 100%)",
          boxShadow:
            "inset 0 1px 0 rgb(255 255 255 / 95%), inset 0 -1px 0 rgb(0 0 0 / 22%), 0 0 0 1px rgb(0 0 0 / 14%), 0 2px 3px rgb(0 0 0 / 14%), 0 10px 22px -6px rgb(0 0 0 / 28%), 0 26px 44px -18px rgb(0 0 0 / 30%)",
        }}
      />
      {/* The web of the I-beam, seen as a shallow channel along the middle. */}
      <div
        className="absolute inset-x-[22px] top-1/2 h-[30px] -translate-y-1/2 dark:brightness-[0.84]"
        style={{
          background:
            "linear-gradient(180deg, rgb(0 0 0 / 10%), rgb(0 0 0 / 0%) 30%, rgb(255 255 255 / 0%) 70%, rgb(255 255 255 / 40%))",
          boxShadow:
            "inset 0 1px 0 rgb(0 0 0 / 14%), 0 1px 0 rgb(255 255 255 / 60%)",
        }}
      />

      <EndCap side="left" />
      <EndCap side="right" />

      <VialWindow className="left-[36px]" style={{ height: 54, width: 30 }}>
        <div style={{ transform: `rotate(${VIALS.plumb.offset}deg)` }}>
          <Vial lit={lit?.plumb} spec={VIALS.plumb}>
            {bubbles.plumb}
          </Vial>
        </div>
      </VialWindow>

      <VialWindow
        className="left-1/2 -translate-x-1/2"
        style={{ height: 38, width: 132 }}
      >
        <Vial lit={lit?.centre} spec={VIALS.centre}>
          {bubbles.centre}
        </Vial>
      </VialWindow>

      <VialWindow
        className="right-[34px]"
        round
        style={{ height: 52, width: 52 }}
      >
        <div style={{ transform: `rotate(${VIALS.diagonal.offset}deg)` }}>
          <Vial lit={lit?.diagonal} spec={VIALS.diagonal}>
            {bubbles.diagonal}
          </Vial>
        </div>
      </VialWindow>

      {/* Engraving: dark above, a bright lip below, as if cut into the metal. */}
      <span
        aria-hidden="true"
        className="absolute top-1/2 left-[79px] -translate-y-1/2 font-bold font-pirata text-[15px] text-[#8d949b] leading-none [text-shadow:0_-0.5px_0_rgb(0_0_0_/_35%),0_1px_0_rgb(255_255_255_/_75%)] dark:text-[#767c82]"
      >
        dqnamo
      </span>
      <span
        aria-hidden="true"
        className="absolute top-1/2 left-[283px] -translate-y-1/2 font-medium font-mono text-[#8d949b] text-[7px] uppercase leading-[1.4] tracking-[0.06em] [text-shadow:0_-0.5px_0_rgb(0_0_0_/_30%),0_1px_0_rgb(255_255_255_/_70%)] dark:text-[#767c82]"
      >
        0.5 mm/m
        <br />
        No. 420
      </span>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Physics                                                                     */
/* -------------------------------------------------------------------------- */

/** The spirit is viscous: a soft spring, nearly critically damped. */
const BUBBLE_STIFFNESS = 60;
const BUBBLE_DAMPING = 13;

function useBubbleMotion(): BubbleMotion {
  return {
    originX: useMotionValue(0.5),
    scaleX: useMotionValue(1),
    scaleY: useMotionValue(1),
    x: useMotionValue(0),
  };
}

/* -------------------------------------------------------------------------- */
/* The level                                                                   */
/* -------------------------------------------------------------------------- */

export type SpiritLevelReading = {
  /** Degrees away from the nearest true reading, clockwise positive. */
  error: number;
  /** Which vial is being read: level, plumb or 45°. */
  mode: string;
  /** Whether that vial reads true. */
  isTrue: boolean;
};

export type SpiritLevelProps = {
  /** Starting angle in degrees, clockwise. */
  defaultAngle?: number;
  /** Beep softly each time a vial reads true. */
  sound?: boolean;
  onReadingChange?: (reading: SpiritLevelReading) => void;
  className?: string;
};

export function SpiritLevel({
  className,
  defaultAngle = -3.5,
  onReadingChange,
  sound = true,
}: SpiritLevelProps) {
  const shouldReduceMotion = useReducedMotion();
  const angle = useMotionValue(defaultAngle);
  const bubbles: Record<VialName, BubbleMotion> = {
    centre: useBubbleMotion(),
    diagonal: useBubbleMotion(),
    plumb: useBubbleMotion(),
  };
  const glints: Record<VialName, MotionValue<number>> = {
    centre: useTransform(angle, (value) => -(value + VIALS.centre.offset)),
    diagonal: useTransform(angle, (value) => -(value + VIALS.diagonal.offset)),
    plumb: useTransform(angle, (value) => -(value + VIALS.plumb.offset)),
  };

  const [grabbed, setGrabbed] = useState(false);
  const [reading, setReading] = useState(() => readingAt(defaultAngle));
  const rawRef = useRef(defaultAngle);
  const dragRef = useRef<{
    centreX: number;
    centreY: number;
    lastPointerAngle: number;
    pointerId: number;
  } | null>(null);
  const soundRef = useRef(sound);
  soundRef.current = sound;
  const onReadingChangeRef = useRef(onReadingChange);
  onReadingChangeRef.current = onReadingChange;

  // The bubbles follow the bar on their own clock, so they lag and sway.
  const bubblesRef = useRef(bubbles);
  bubblesRef.current = bubbles;
  const wakeRef = useRef<() => void>(() => {});

  useEffect(() => {
    const velocity: Record<VialName, number> = {
      centre: 0,
      diagonal: 0,
      plumb: 0,
    };
    let frame = 0;
    let last = 0;

    function step(now: number) {
      const dt = last === 0 ? 1 / 60 : Math.min((now - last) / 1000, 1 / 30);
      last = now;
      let moving = false;

      for (const name of VIAL_NAMES) {
        const spec = VIALS[name];
        const bubble = bubblesRef.current[name];
        const target = bubbleTarget(angle.get(), spec);
        const x = bubble.x.get();

        if (shouldReduceMotion) {
          bubble.x.set(target.x);
          velocity[name] = 0;
        } else {
          const force =
            BUBBLE_STIFFNESS * (target.x - x) - BUBBLE_DAMPING * velocity[name];
          velocity[name] += force * dt;
          bubble.x.set(
            clamp(x + velocity[name] * dt, -spec.travel, spec.travel),
          );
        }

        // A quick bubble stretches out; one pinned at the end squashes flat.
        const speed = Math.abs(velocity[name]) / spec.sensitivity;
        const stretch = shouldReduceMotion ? 0 : Math.min(0.22, speed / 260);
        const squash = target.pressure * 0.24;
        const scaleX = (1 + stretch) * (1 - squash);
        bubble.scaleX.set(scaleX);
        bubble.scaleY.set(1 / Math.sqrt(scaleX));
        bubble.originX.set(squash > 0.001 ? (target.toward > 0 ? 1 : 0) : 0.5);

        if (
          Math.abs(velocity[name]) > 0.4 ||
          Math.abs(target.x - bubble.x.get()) > 0.05
        ) {
          moving = true;
        }
      }

      frame = moving ? requestAnimationFrame(step) : 0;

      if (!moving) {
        last = 0;
      }
    }

    function wake() {
      if (frame === 0) {
        frame = requestAnimationFrame(step);
      }
    }

    wakeRef.current = wake;
    wake();

    return () => cancelAnimationFrame(frame);
  }, [angle, shouldReduceMotion]);

  const wasTrueRef = useRef(reading.isTrue);

  useMotionValueEvent(angle, "change", (value) => {
    wakeRef.current();
    const next = readingAt(value);

    if (next.isTrue && !wasTrueRef.current) {
      if (soundRef.current) {
        playTrueBeep();
      }
      buzz(8);
    }

    wasTrueRef.current = next.isTrue;
    setReading((current) =>
      current.error === next.error &&
      current.mode === next.mode &&
      current.isTrue === next.isTrue
        ? current
        : next,
    );
  });

  useEffect(() => {
    onReadingChangeRef.current?.(reading);
  }, [reading]);

  function setAngle(next: number, animated: boolean) {
    rawRef.current = next;

    if (animated && !shouldReduceMotion) {
      animate(angle, next, { damping: 24, stiffness: 260, type: "spring" });
    } else {
      angle.stop();
      angle.set(next);
    }
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) {
      return;
    }

    const bounds = event.currentTarget.getBoundingClientRect();
    const centreX = bounds.left + bounds.width / 2;
    const centreY = bounds.top + bounds.height / 2;

    event.currentTarget.setPointerCapture(event.pointerId);
    angle.stop();
    rawRef.current = angle.get();
    dragRef.current = {
      centreX,
      centreY,
      lastPointerAngle:
        (Math.atan2(event.clientY - centreY, event.clientX - centreX) * 180) /
        Math.PI,
      pointerId: event.pointerId,
    };
    setGrabbed(true);

    if (sound) {
      getAudioContext();
    }
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;

    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    const dx = event.clientX - drag.centreX;
    const dy = event.clientY - drag.centreY;

    // Near the middle there is no leverage and the angle swings wildly.
    if (Math.hypot(dx, dy) < 40) {
      return;
    }

    const pointerAngle = (Math.atan2(dy, dx) * 180) / Math.PI;
    const delta = wrapDegrees(pointerAngle - drag.lastPointerAngle);
    drag.lastPointerAngle = pointerAngle;
    rawRef.current = wrapDegrees(rawRef.current + delta);
    angle.set(withDetent(rawRef.current));
  }

  function endDrag(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;

    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    dragRef.current = null;
    rawRef.current = angle.get();
    setGrabbed(false);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const fine = event.shiftKey ? 5 : 0.5;
    const deltas: Record<string, number> = {
      ArrowDown: -fine,
      ArrowLeft: -fine,
      ArrowRight: fine,
      ArrowUp: fine,
      PageDown: -15,
      PageUp: 15,
    };

    if (event.key === "Home") {
      event.preventDefault();
      setAngle(0, true);
      return;
    }

    const delta = deltas[event.key];

    if (delta === undefined) {
      return;
    }

    event.preventDefault();
    // Round to the step, so repeated presses land exactly on a mark.
    const next = Math.round((rawRef.current + delta) / fine) * fine;
    setAngle(wrapDegrees(next), true);
  }

  const valueText = reading.isTrue
    ? `${reading.mode}, reads true`
    : `${Math.abs(reading.error).toFixed(1)} degrees off ${reading.mode.toLowerCase()}`;

  return (
    <div className={cn("flex flex-col items-center gap-10", className)}>
      <div
        className="grid place-items-center"
        style={{ height: LEVEL_LENGTH, width: LEVEL_LENGTH }}
      >
        <motion.div
          aria-label="Spirit level"
          aria-valuemax={180}
          aria-valuemin={-180}
          aria-valuenow={Math.round(angle.get() * 10) / 10}
          aria-valuetext={valueText}
          className={cn(
            "relative cursor-grab touch-none select-none rounded-[8px] outline-none focus-visible:ring-2 focus-visible:ring-[#b6e21c] focus-visible:ring-offset-4 focus-visible:ring-offset-grayscale-1 dark:focus-visible:ring-offset-grayscale-2",
            grabbed && "cursor-grabbing",
          )}
          onKeyDown={handleKeyDown}
          onLostPointerCapture={endDrag}
          onPointerCancel={endDrag}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={endDrag}
          role="slider"
          style={{ rotate: angle }}
          tabIndex={0}
        >
          {/* Lifted in the hand, the bar rises a touch off the page. */}
          <div
            className="transition-transform duration-200 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none"
            style={{ transform: grabbed ? "scale(1.012)" : "scale(1)" }}
          >
            <SpiritLevelBody
              bubbles={{
                centre: (
                  <Bubble
                    glintRotate={glints.centre}
                    motionStyle={bubbles.centre}
                    spec={VIALS.centre}
                  />
                ),
                diagonal: (
                  <Bubble
                    glintRotate={glints.diagonal}
                    motionStyle={bubbles.diagonal}
                    spec={VIALS.diagonal}
                  />
                ),
                plumb: (
                  <Bubble
                    glintRotate={glints.plumb}
                    motionStyle={bubbles.plumb}
                    spec={VIALS.plumb}
                  />
                ),
              }}
              lit={{
                [reading.vial]: reading.isTrue,
              }}
            />
          </div>
        </motion.div>
      </div>

      <LevelReadout reading={reading} />
    </div>
  );
}

function readingAt(angle: number) {
  const mark = nearestMark(angle);
  const error = Math.round((angle - mark.angle) * 10) / 10;

  return {
    error: Object.is(error, -0) ? 0 : error,
    isTrue: error === 0,
    mode: MODE_LABEL[mark.vial],
    vial: mark.vial,
  };
}

const errorFormat = {
  maximumFractionDigits: 1,
  minimumFractionDigits: 1,
  signDisplay: "exceptZero",
} as const;

function LevelReadout({ reading }: { reading: ReturnType<typeof readingAt> }) {
  return (
    <div
      aria-hidden="true"
      className="flex items-center gap-3 rounded-full border border-grayscale-4 bg-grayscale-1 py-1.5 pr-4 pl-3 small-shadow dark:bg-grayscale-3 dark:shadow-none"
    >
      <span
        className={cn(
          "size-2 rounded-full transition-[background-color,box-shadow] duration-300 motion-reduce:transition-none",
          reading.isTrue
            ? "bg-[#b6e21c] shadow-[0_0_0_3px_rgb(182_226_28_/_22%),0_0_8px_rgb(182_226_28_/_80%)]"
            : "bg-grayscale-6",
        )}
      />
      <span className="w-[42px] font-medium font-mono text-[10px] text-grayscale-10 uppercase tracking-[0.06em]">
        {reading.mode}
      </span>
      <span className="w-[52px] text-right font-medium font-mono text-grayscale-12 text-xs tabular-nums">
        <NumberFlow
          format={errorFormat}
          locales="en-US"
          suffix="°"
          value={reading.error}
        />
      </span>
    </div>
  );
}

/**
 * A decorative level for thumbnails. It sits a few degrees out, and on hover
 * of the surrounding `group` it comes level and the bubbles drift home.
 */
export function SpiritLevelPreview({ scale = 0.46 }: { scale?: number }) {
  const settle =
    "transition-transform duration-[1100ms] [transition-timing-function:cubic-bezier(0.3,1.25,0.45,1)] motion-reduce:transition-none";

  return (
    <div
      aria-hidden="true"
      className="relative"
      style={{ height: LEVEL_HEIGHT * scale, width: LEVEL_LENGTH * scale }}
    >
      {/* Scale doesn't change layout, so pull the full-size bar back to centre. */}
      <div
        className="absolute -rotate-[4deg] transition-transform duration-500 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)] group-hover:rotate-0 motion-reduce:transition-none"
        style={{
          left: (LEVEL_LENGTH * (scale - 1)) / 2,
          scale,
          top: (LEVEL_HEIGHT * (scale - 1)) / 2,
        }}
      >
        <SpiritLevelBody
          bubbles={{
            centre: (
              <Bubble
                className={cn(
                  settle,
                  "translate-x-[28px] group-hover:translate-x-0",
                )}
                spec={VIALS.centre}
              />
            ),
            diagonal: (
              <Bubble className="translate-x-[10px]" spec={VIALS.diagonal} />
            ),
            plumb: (
              <Bubble className="-translate-x-[10px]" spec={VIALS.plumb} />
            ),
          }}
        />
      </div>
    </div>
  );
}
