"use client";

import {
  animate,
  type MotionStyle,
  type MotionValue,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from "motion/react";
import {
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

/* -------------------------------------------------------------------------- */
/* Mechanism                                                                   */
/* -------------------------------------------------------------------------- */

/** How far the plunger goes in at the bottom of a press, in drawing units. */
const TRAVEL = 22;
/** Where the cam catches the plunger, holding the nib out. */
const LATCH = 16;
/** The resting length of the spring around the refill. */
const SPRING_LENGTH = 48;

/** A thumb drives the plunger down fast and hard. */
const PRESS_SPRING = { damping: 48, stiffness: 1600, type: "spring" } as const;
/** The cam catches the plunger after a short hop back up. */
const LATCH_SPRING = { damping: 20, stiffness: 900, type: "spring" } as const;
/** Let go of the cam and the spring fires the plunger back out. */
const RETRACT_SPRING = { damping: 13, stiffness: 700, type: "spring" } as const;

type Phase = "idle" | "pressing" | "latching" | "retracting";

/* -------------------------------------------------------------------------- */
/* Sound                                                                       */
/* -------------------------------------------------------------------------- */

type ClickKind = "press" | "latch" | "retract";

let sharedAudioContext: AudioContext | null = null;
const noiseBuffers = new Map<ClickKind, AudioBuffer>();

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

/** A burst of decaying noise sounds like two bits of plastic meeting. */
function createNoise(context: AudioContext, duration: number, decay: number) {
  const length = Math.floor(context.sampleRate * duration);
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);

  for (let index = 0; index < length; index += 1) {
    const t = index / context.sampleRate;
    data[index] = (Math.random() * 2 - 1) * Math.exp(-t / decay);
  }

  return buffer;
}

const CLICKS: Record<
  ClickKind,
  {
    duration: number;
    decay: number;
    frequency: number;
    q: number;
    gain: number;
    /** A short tone for the body of the pen ringing after the click. */
    ring?: { frequency: number; gain: number; decay: number };
  }
> = {
  // The cam snapping round at the bottom: the sharpest of the three.
  press: {
    decay: 0.0012,
    duration: 0.02,
    frequency: 4300,
    gain: 0.75,
    q: 1.6,
    ring: { decay: 0.018, frequency: 2650, gain: 0.08 },
  },
  // The plunger seating on the cam: a softer, lower tick.
  latch: {
    decay: 0.0016,
    duration: 0.02,
    frequency: 2900,
    gain: 0.5,
    q: 1.3,
  },
  // The plunger hitting its stop, with the spring humming after it.
  retract: {
    decay: 0.0035,
    duration: 0.05,
    frequency: 1500,
    gain: 0.8,
    q: 0.9,
    ring: { decay: 0.07, frequency: 880, gain: 0.05 },
  },
};

function playClick(kind: ClickKind) {
  const context = getAudioContext();

  if (!context) {
    return;
  }

  const now = context.currentTime;
  const click = CLICKS[kind];
  let buffer = noiseBuffers.get(kind);

  if (!buffer) {
    buffer = createNoise(context, click.duration, click.decay);
    noiseBuffers.set(kind, buffer);
  }

  const source = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const gain = context.createGain();

  source.buffer = buffer;
  source.playbackRate.value = 0.94 + Math.random() * 0.12;
  filter.type = "bandpass";
  filter.frequency.value = click.frequency;
  filter.Q.value = click.q;
  gain.gain.value = click.gain;
  source.connect(filter).connect(gain).connect(context.destination);
  source.start(now);

  if (click.ring) {
    const oscillator = context.createOscillator();
    const ringGain = context.createGain();

    oscillator.type = "sine";
    oscillator.frequency.value = click.ring.frequency;
    ringGain.gain.setValueAtTime(click.ring.gain, now);
    ringGain.gain.exponentialRampToValueAtTime(
      0.0001,
      now + click.ring.decay * 6,
    );
    oscillator.connect(ringGain).connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + click.ring.decay * 6);
  }
}

function buzz(duration: number) {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    navigator.vibrate?.(duration);
  }
}

/* -------------------------------------------------------------------------- */
/* Drawing                                                                     */
/* -------------------------------------------------------------------------- */

type PenCustomProperty =
  | "--pen-depth"
  | "--pen-ink"
  | "--pen-recoil"
  | "--pen-turn";

export type ClickPenDrawingStyle = MotionStyle &
  Partial<Record<PenCustomProperty, string | number | MotionValue<number>>>;

/** Everything that slides when the plunger moves: plunger, cam and refill. */
const slideStyle: CSSProperties = {
  transform: "translateX(calc(var(--pen-depth, 0) * -1px))",
};

/** The spring is pinned at the shoulder in the nose and squashed from behind. */
const springStyle: CSSProperties = {
  transform: `scaleX(calc(1 - var(--pen-depth, 0) / ${SPRING_LENGTH}))`,
  transformBox: "view-box",
  transformOrigin: "66px 32px",
};

/** The cam's ridges roll past one tooth for every click. */
const turnStyle: CSSProperties = {
  transform: "translateY(calc(var(--pen-turn, 0) * -3px))",
};

const recoilStyle: CSSProperties = {
  transform: "translateX(calc(var(--pen-recoil, 0) * 1px))",
};

const inkFill: CSSProperties = { fill: "var(--pen-ink)" };

/** The nose cone, from the shoulder of the barrel down to the tip hole. */
const CONE_PATH =
  "M97 18 C80 19 58 25.5 44.5 29 Q40.5 30 40.5 31 V33 Q40.5 34 44.5 35 C58 38.5 80 45 97 46 Z";
const BARREL_PATH = "M96 18 H386 Q392 18 392 24 V40 Q392 46 386 46 H96 Z";
const PLUNGER_PATH =
  "M362 25 H428 Q434.5 25 434.5 31.5 V32.5 Q434.5 39 428 39 H362 Z";
const CLIP_PATH =
  "M390 18.5 V14.5 Q390 10.5 386 10.5 H301 Q296 10.5 295.4 14 L295 15.6 Q294.6 18 297 18 H299 Q300.5 18 300.6 16.4 L300.8 15 H384 Q385 15 385 16 V18.5 Z";

/** Ten turns of wire, drawn as front and back strands. */
const SPRING_COILS = 10;

function springStrands() {
  const pitch = SPRING_LENGTH / SPRING_COILS;
  const top = 27.6;
  const bottom = 36.4;
  let back = "";
  let front = "";

  for (let coil = 0; coil < SPRING_COILS; coil += 1) {
    const x = 66 + coil * pitch;

    back += `M${x} ${bottom} L${x + pitch / 2} ${top} `;
    front += `M${x + pitch / 2} ${top} L${x + pitch} ${bottom} `;
  }

  return { back, front };
}

const SPRING = springStrands();

/** Diagonal ridges on the cam, tall enough to roll past without running out. */
const CAM_RIDGES = Array.from(
  { length: 8 },
  (_, index) => `M346 ${23 + index * 3} L362 ${29 + index * 3}`,
).join(" ");

type ClickPenDrawingProps = {
  /** Ink colour, used for the plunger, the tinted nose and the ink itself. */
  ink?: string;
  /**
   * Classes for every moving part. The preview uses this to tween the parts
   * with CSS when `--pen-depth` changes on hover.
   */
  partClassName?: string;
  className?: string;
  style?: ClickPenDrawingStyle;
};

/**
 * A retractable ballpoint seen from the side, nib to the left. It is driven
 * entirely by CSS custom properties, so it can be animated by motion values
 * or by plain CSS:
 *
 * - `--pen-depth` how far the plunger is pushed in, 0 to 22.
 * - `--pen-turn` how far the cam has rolled, 0 to 1 per tooth.
 * - `--pen-recoil` a nudge of the whole pen, in drawing units.
 */
export function ClickPenDrawing({
  className,
  ink = "#2f5bea",
  partClassName,
  style,
}: ClickPenDrawingProps) {
  const id = useId().replace(/[^a-zA-Z0-9-]/g, "");
  const ref = (name: string) => `${id}-${name}`;
  const url = (name: string) => `url(#${ref(name)})`;

  return (
    <motion.svg
      aria-hidden="true"
      className={cn("block h-auto w-full overflow-visible", className)}
      fill="none"
      style={{ "--pen-ink": ink, ...style } as ClickPenDrawingStyle}
      viewBox="0 0 460 64"
    >
      <defs>
        {/* Clear plastic: a bright top edge falling off into a dark belly. */}
        <linearGradient id={ref("glass")} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.55" />
          <stop offset="0.2" stopColor="#fff" stopOpacity="0.16" />
          <stop offset="0.55" stopColor="#fff" stopOpacity="0.04" />
          <stop offset="0.85" stopColor="#000" stopOpacity="0.06" />
          <stop offset="1" stopColor="#000" stopOpacity="0.16" />
        </linearGradient>
        {/* Laid over solid parts to round them off. */}
        <linearGradient id={ref("shade")} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.45" />
          <stop offset="0.22" stopColor="#fff" stopOpacity="0.12" />
          <stop offset="0.55" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.38" />
        </linearGradient>
        <linearGradient id={ref("metal")} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#fafafa" />
          <stop offset="0.3" stopColor="#d6d6db" />
          <stop offset="0.62" stopColor="#8c8c96" />
          <stop offset="1" stopColor="#4f4f58" />
        </linearGradient>
        <linearGradient id={ref("brass")} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#f6e3a8" />
          <stop offset="0.5" stopColor="#c9a54d" />
          <stop offset="1" stopColor="#7d6020" />
        </linearGradient>
        <clipPath id={ref("cam")}>
          <rect height="12" rx="2" width="16" x="346" y="26" />
        </clipPath>
        <filter
          height="400%"
          id={ref("shadow")}
          width="120%"
          x="-10%"
          y="-150%"
        >
          <feGaussianBlur stdDeviation="2.6" />
        </filter>
      </defs>

      <ellipse
        className="fill-black/20 dark:fill-black/50"
        cx="238"
        cy="53"
        filter={url("shadow")}
        rx="196"
        ry="3.2"
      />

      <g className={partClassName} style={recoilStyle}>
        {/* Inside the barrel: refill, cam and plunger, all sliding together. */}
        <g className={partClassName} style={slideStyle}>
          {/* Refill tube with the ink column and the brass point. */}
          <rect
            className="fill-white/40 stroke-current/25 dark:fill-white/10"
            height="4.8"
            rx="1"
            strokeWidth="0.5"
            width="284"
            x="62"
            y="29.6"
          />
          <rect
            height="3.2"
            rx="0.6"
            style={inkFill}
            width="176"
            x="64"
            y="30.4"
          />
          <rect
            fill={url("shade")}
            height="3.2"
            rx="0.6"
            width="176"
            x="64"
            y="30.4"
          />
          <path
            d="M62.5 29.6 L50.5 31.2 V32.8 L62.5 34.4 Z"
            fill={url("brass")}
          />
          <circle cx="49.6" cy="32" fill={url("metal")} r="1.25" />

          {/* The collar the spring pushes against. */}
          <rect
            className="fill-grayscale-9"
            height="10"
            rx="1.2"
            width="4"
            x="114"
            y="27"
          />
          <rect
            fill={url("shade")}
            height="10"
            rx="1.2"
            width="4"
            x="114"
            y="27"
          />

          {/* The rotating cam, its ridges rolling past on every click. */}
          <rect
            fill={url("metal")}
            height="12"
            rx="2"
            width="16"
            x="346"
            y="26"
          />
          <g clipPath={url("cam")}>
            <path
              className={partClassName}
              d={CAM_RIDGES}
              stroke="#3f3f46"
              strokeOpacity="0.55"
              strokeWidth="1.1"
              style={turnStyle}
            />
          </g>

          {/* The plunger, half hidden inside the barrel. */}
          <path d={PLUNGER_PATH} style={inkFill} />
          <path d={PLUNGER_PATH} fill={url("shade")} />
          <path
            d="M419 25.4 V38.6 M423 25.4 V38.6"
            stroke="#000"
            strokeOpacity="0.22"
            strokeWidth="0.8"
          />
        </g>

        {/* The spring around the refill, squashed from behind by the collar. */}
        <g className={partClassName} style={springStyle}>
          <path
            d={SPRING.back}
            stroke="#71717a"
            strokeLinecap="round"
            strokeOpacity="0.55"
            strokeWidth="0.9"
            vectorEffect="non-scaling-stroke"
          />
          <path
            d={SPRING.front}
            stroke="#d4d4d8"
            strokeLinecap="round"
            strokeWidth="1.2"
            vectorEffect="non-scaling-stroke"
          />
          <path
            d={SPRING.front}
            className="stroke-black/45"
            strokeLinecap="round"
            strokeWidth="0.5"
            transform="translate(0 0.35)"
            vectorEffect="non-scaling-stroke"
          />
        </g>

        {/* The shoulder in the nose that the front of the spring sits on. */}
        <rect
          height="11"
          opacity="0.5"
          rx="0.6"
          style={inkFill}
          width="2"
          x="64"
          y="26.5"
        />

        {/* Clear barrel and tinted nose, laid over the works. */}
        <path d={CONE_PATH} opacity="0.3" style={inkFill} />
        <path
          className="stroke-current/30"
          d={CONE_PATH}
          fill={url("glass")}
          strokeWidth="0.8"
        />
        <path
          className="stroke-current/30"
          d={BARREL_PATH}
          fill={url("glass")}
          strokeWidth="0.8"
        />
        <path
          className="stroke-current/20"
          d="M96 18.4 V45.6"
          strokeWidth="1.2"
        />
        {/* Highlights along the top of the plastic. */}
        <rect
          fill="#fff"
          height="1.8"
          opacity="0.75"
          rx="0.9"
          width="280"
          x="102"
          y="20.6"
        />
        <path
          d="M54 29.3 C68 26 82 22 93 20.9"
          stroke="#fff"
          strokeLinecap="round"
          strokeOpacity="0.6"
          strokeWidth="1.4"
        />
        <rect
          fill="#fff"
          height="0.8"
          opacity="0.25"
          rx="0.4"
          width="270"
          x="104"
          y="42.2"
        />

        {/* The pocket clip. */}
        <path d={CLIP_PATH} fill={url("metal")} />
        <path className="stroke-current/25" d={CLIP_PATH} strokeWidth="0.5" />
        <rect
          fill="#fff"
          height="0.9"
          opacity="0.8"
          rx="0.45"
          width="84"
          x="300"
          y="11.4"
        />
      </g>
    </motion.svg>
  );
}

/* -------------------------------------------------------------------------- */
/* Click pen                                                                   */
/* -------------------------------------------------------------------------- */

export type ClickPenProps = {
  /** Accessible name for the switch, e.g. "Pen". */
  label?: string;
  /** Whether the nib is out. */
  checked?: boolean;
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  /** Ink colour for the plunger, the tinted nose and the ink in the refill. */
  ink?: string;
  /** Play synthesised clicks as the cam turns and the plunger lands. */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

/**
 * A retractable pen as a switch. Press the plunger and the cam turns at the
 * bottom of the stroke; let go and it either catches the plunger with the
 * nib out, or lets the spring fire it all the way back.
 */
export function ClickPen({
  checked,
  className,
  defaultChecked = false,
  disabled = false,
  ink = "#2f5bea",
  label = "Pen",
  onCheckedChange,
  sound = true,
}: ClickPenProps) {
  const shouldReduceMotion = useReducedMotion();
  const [uncontrolledChecked, setUncontrolledChecked] =
    useState(defaultChecked);
  const isChecked = checked ?? uncontrolledChecked;
  const [isPressed, setIsPressed] = useState(false);

  const depth = useMotionValue(isChecked ? LATCH : 0);
  const recoil = useMotionValue(0);
  const turn = useMotionValue(0);
  /** The cam only has one tooth's worth of ridges, so wrap it round. */
  const turnWithinTooth = useTransform(turn, (value) => value % 1);

  /** Where the mechanism actually is, which can run ahead of the prop. */
  const settledRef = useRef(isChecked);
  const phaseRef = useRef<Phase>("idle");
  const bottomedRef = useRef(false);
  const releasePendingRef = useRef(false);
  const soundRef = useRef(sound);
  const reduceRef = useRef(shouldReduceMotion);
  const onCheckedChangeRef = useRef(onCheckedChange);

  useEffect(() => {
    soundRef.current = sound;
    reduceRef.current = shouldReduceMotion;
    onCheckedChangeRef.current = onCheckedChange;
  });

  const click = useCallback((kind: ClickKind) => {
    if (soundRef.current) {
      playClick(kind);
    }
  }, []);

  const settle = useCallback(
    (next: boolean) => {
      phaseRef.current = next ? "latching" : "retracting";

      if (reduceRef.current) {
        depth.jump(next ? LATCH : 0);
        return;
      }

      animate(depth, next ? LATCH : 0, next ? LATCH_SPRING : RETRACT_SPRING);

      if (!next) {
        // The pen jumps a hair on the desk as the spring fires.
        animate(recoil, [0, 1.6, 0], { duration: 0.22, ease: "easeOut" });
      }
    },
    [depth, recoil],
  );

  const finishPress = useCallback(() => {
    phaseRef.current = "idle";
    bottomedRef.current = false;
    releasePendingRef.current = false;
    setIsPressed(false);

    const next = !settledRef.current;

    settledRef.current = next;
    settle(next);
    setUncontrolledChecked(next);
    onCheckedChangeRef.current?.(next);
  }, [settle]);

  const press = useCallback(() => {
    if (disabled || phaseRef.current === "pressing") {
      return;
    }

    phaseRef.current = "pressing";
    bottomedRef.current = false;
    releasePendingRef.current = false;
    setIsPressed(true);

    if (reduceRef.current) {
      depth.jump(TRAVEL);
    } else {
      animate(depth, TRAVEL, PRESS_SPRING);
    }
  }, [depth, disabled]);

  const release = useCallback(() => {
    if (phaseRef.current !== "pressing") {
      return;
    }

    // A quick tap can let go before the plunger reaches the bottom. The cam
    // only turns at the bottom, so finish the stroke first.
    if (!bottomedRef.current) {
      releasePendingRef.current = true;
      return;
    }

    finishPress();
  }, [finishPress]);

  // Listen to the plunger itself, so every click lands when the parts meet.
  useEffect(() => {
    return depth.on("change", (value) => {
      const phase = phaseRef.current;

      if (
        phase === "pressing" &&
        !bottomedRef.current &&
        value >= TRAVEL - 0.6
      ) {
        bottomedRef.current = true;
        click("press");
        buzz(8);

        if (reduceRef.current) {
          turn.jump(turn.get() + 1);
        } else {
          animate(turn, Math.round(turn.get()) + 1, {
            damping: 18,
            stiffness: 600,
            type: "spring",
          });
        }

        if (releasePendingRef.current) {
          finishPress();
        }
      } else if (phase === "latching" && value <= LATCH + 0.4) {
        phaseRef.current = "idle";
        click("latch");
      } else if (phase === "retracting" && value <= 0.6) {
        phaseRef.current = "idle";
        click("retract");
        buzz(4);
      }
    });
  }, [click, depth, finishPress, turn]);

  // Follow the prop when something else flips it.
  useEffect(() => {
    if (phaseRef.current === "pressing" || settledRef.current === isChecked) {
      return;
    }

    settledRef.current = isChecked;
    settle(isChecked);
  }, [isChecked, settle]);

  const handlePointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) {
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    press();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== " " && event.key !== "Enter") {
      return;
    }

    event.preventDefault();

    if (event.repeat) {
      return;
    }

    press();

    // Enter is a whole click; Space holds the plunger down like a thumb.
    if (event.key === "Enter") {
      window.setTimeout(release, 90);
    }
  };

  const handleKeyUp = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === " ") {
      event.preventDefault();
      release();
    }
  };

  return (
    <button
      aria-checked={isChecked}
      aria-label={label}
      className={cn(
        "group/pen relative block w-full max-w-[560px] cursor-pointer touch-manipulation select-none rounded-xl px-2 py-3 text-grayscale-12 outline-none [-webkit-tap-highlight-color:transparent] focus-visible:ring-2 focus-visible:ring-grayscale-7 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      data-pressed={isPressed ? "" : undefined}
      data-state={isChecked ? "out" : "in"}
      disabled={disabled}
      onBlur={release}
      // Assistive tech fires a bare click with no pointer or key events.
      onClick={(event) => {
        if (event.detail === 0 && phaseRef.current === "idle") {
          press();
          window.setTimeout(release, 90);
        }
      }}
      onKeyDown={handleKeyDown}
      onKeyUp={handleKeyUp}
      onLostPointerCapture={release}
      onPointerCancel={release}
      onPointerDown={handlePointerDown}
      onPointerUp={release}
      role="switch"
      type="button"
    >
      <ClickPenDrawing
        ink={ink}
        style={{
          "--pen-depth": depth,
          "--pen-recoil": recoil,
          "--pen-turn": turnWithinTooth,
        }}
      />
    </button>
  );
}
