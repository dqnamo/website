"use client";

import {
  animate,
  type MotionValue,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from "motion/react";
import {
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { cn } from "@/helpers/classname-helper";

/* -------------------------------------------------------------------------- */
/* Tuning                                                                      */
/* -------------------------------------------------------------------------- */

/** Each wheel has ten faces, so one digit is a tenth of a turn. */
const DEGREES_PER_DIGIT = 36;
/** How far the plunger travels into the body, in body hundredths. */
const PLUNGER_TRAVEL = 8.5;
/** Seconds for the reset knob to roll a wheel through all ten digits. */
const RESET_TURN = 0.9;
/** How far a wheel overshoots zero when it drops into its catch. */
const RESET_OVERSHOOT = 0.14;

const PLUNGER_DOWN = { damping: 38, stiffness: 1400, type: "spring" } as const;
const PLUNGER_UP = { damping: 13, stiffness: 520, type: "spring" } as const;
const WHEEL_STEP = { damping: 17, stiffness: 420, type: "spring" } as const;
const WHEEL_CATCH = { damping: 14, stiffness: 900, type: "spring" } as const;

export type TallyCounterFinish = "chrome" | "graphite" | "signal";

export type TallyCounterProps = {
  /** Number of wheels in the window. The count wraps back to zero past them. */
  digits?: number;
  value?: number;
  defaultValue?: number;
  onValueChange?: (value: number) => void;
  /** Body diameter in pixels. The plunger, ring and knob hang off it. */
  size?: number;
  /** Play a synthesised clack on every press and a ratchet on reset. */
  sound?: boolean;
  finish?: TallyCounterFinish;
  /** Accessible name for the whole counter. */
  label?: string;
  className?: string;
};

/* -------------------------------------------------------------------------- */
/* Sound                                                                       */
/* -------------------------------------------------------------------------- */

let sharedAudioContext: AudioContext | null = null;
const noiseBuffers = new Map<string, AudioBuffer>();

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

function getNoise(context: AudioContext, duration: number, decay: number) {
  const key = `${duration}:${decay}`;
  const cached = noiseBuffers.get(key);

  if (cached) {
    return cached;
  }

  const length = Math.floor(context.sampleRate * duration);
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);

  for (let index = 0; index < length; index += 1) {
    const t = index / context.sampleRate;
    data[index] = (Math.random() * 2 - 1) * Math.exp(-t / decay);
  }

  noiseBuffers.set(key, buffer);
  return buffer;
}

type ClickVoice = {
  /** Noise burst: how long, how fast it dies, where it rings and how loud. */
  noise: [duration: number, decay: number, frequency: number, gain: number];
  /** A short sine ping that makes the noise sound like steel, not plastic. */
  ping?: [frequency: number, decay: number, gain: number];
};

const VOICES = {
  /** The plunger bottoms out and the wheels lurch forward. */
  clack: {
    noise: [0.05, 0.005, 2300, 0.9],
    ping: [3900, 0.035, 0.07],
  },
  /** The plunger's spring throws it back against its stop. */
  return: {
    noise: [0.025, 0.002, 4600, 0.32],
    ping: [5200, 0.018, 0.03],
  },
  /** One pawl skipping over one tooth as the reset knob turns. */
  ratchet: { noise: [0.012, 0.0012, 5200, 0.22] },
  /** A wheel dropping into its zero catch. */
  catch: {
    noise: [0.03, 0.003, 2900, 0.45],
    ping: [4400, 0.02, 0.035],
  },
} satisfies Record<string, ClickVoice>;

function playVoice(name: keyof typeof VOICES, delay = 0) {
  const context = getAudioContext();

  if (!context) {
    return;
  }

  const voice: ClickVoice = VOICES[name];
  const at = context.currentTime + delay;
  const [duration, decay, frequency, level] = voice.noise;
  const source = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const gain = context.createGain();

  source.buffer = getNoise(context, duration, decay);
  source.playbackRate.value = 0.94 + Math.random() * 0.12;
  filter.type = "bandpass";
  filter.frequency.value = frequency;
  filter.Q.value = 1.2;
  gain.gain.value = level;
  source.connect(filter).connect(gain).connect(context.destination);
  source.start(at);

  if (voice.ping) {
    const [pingFrequency, pingDecay, pingLevel] = voice.ping;
    const oscillator = context.createOscillator();
    const pingGain = context.createGain();

    oscillator.type = "sine";
    oscillator.frequency.value = pingFrequency * (0.98 + Math.random() * 0.04);
    pingGain.gain.setValueAtTime(pingLevel, at);
    pingGain.gain.exponentialRampToValueAtTime(0.0001, at + pingDecay * 4);
    oscillator.connect(pingGain).connect(context.destination);
    oscillator.start(at);
    oscillator.stop(at + pingDecay * 4 + 0.01);
  }
}

function buzz(pattern: number | number[]) {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    navigator.vibrate?.(pattern);
  }
}

/* -------------------------------------------------------------------------- */
/* Finishes                                                                    */
/* -------------------------------------------------------------------------- */

type Finish = {
  /** The pressed steel rim around the body. */
  rim: string;
  /** The spun face inside the rim. */
  face: string;
  /** Fine lathe rings over the face. */
  spin: string;
  /** Turned parts: plunger, knob and finger ring. */
  turned: string;
  /** Stamped lettering and rivets. */
  ink: string;
  shadow: string;
};

const FINISHES: Record<TallyCounterFinish, Finish> = {
  chrome: {
    face: "conic-gradient(from 200deg at 50% 50%, #f4f5f7, #a9adb4 14%, #eef0f3 28%, #9ea3ab 45%, #f6f7f9 58%, #b4b8bf 74%, #e9ebee 88%, #f4f5f7)",
    ink: "rgb(40 44 52 / 55%)",
    rim: "linear-gradient(160deg, #ffffff 0%, #c9ccd2 28%, #7d828b 62%, #d9dce1 82%, #8d929a 100%)",
    shadow: "0 1px 0 rgb(255 255 255 / 70%)",
    spin: "repeating-radial-gradient(circle at 50% 50%, rgb(255 255 255 / 0%) 0 1.2px, rgb(255 255 255 / 22%) 1.6px, rgb(0 0 0 / 0%) 2.2px)",
    turned:
      "linear-gradient(90deg, #6f747c 0%, #e8eaed 22%, #ffffff 34%, #a8adb5 58%, #d6d9de 76%, #7a7f87 100%)",
  },
  graphite: {
    face: "conic-gradient(from 200deg at 50% 50%, #4a4d53, #232528 14%, #45484e 28%, #1d1f22 45%, #4d5056 58%, #26282c 74%, #414449 88%, #4a4d53)",
    ink: "rgb(230 232 236 / 38%)",
    rim: "linear-gradient(160deg, #6b6f76 0%, #3a3d42 28%, #141517 62%, #44474d 82%, #1c1d20 100%)",
    shadow: "0 1px 0 rgb(0 0 0 / 70%)",
    spin: "repeating-radial-gradient(circle at 50% 50%, rgb(255 255 255 / 0%) 0 1.2px, rgb(255 255 255 / 6%) 1.6px, rgb(0 0 0 / 0%) 2.2px)",
    turned:
      "linear-gradient(90deg, #1e1f22 0%, #55595f 22%, #7b7f86 34%, #34373b 58%, #4b4e54 76%, #1f2023 100%)",
  },
  signal: {
    face: "conic-gradient(from 200deg at 50% 50%, #ff7a3d, #e04d12 14%, #ff7b40 28%, #d9460e 45%, #ff8550 58%, #e2531a 74%, #ff7438 88%, #ff7a3d)",
    ink: "rgb(255 236 224 / 62%)",
    rim: "linear-gradient(160deg, #ffffff 0%, #c9ccd2 28%, #7d828b 62%, #d9dce1 82%, #8d929a 100%)",
    shadow: "0 1px 0 rgb(120 30 0 / 55%)",
    spin: "repeating-radial-gradient(circle at 50% 50%, rgb(255 255 255 / 0%) 0 1.2px, rgb(255 255 255 / 9%) 1.6px, rgb(0 0 0 / 0%) 2.2px)",
    turned:
      "linear-gradient(90deg, #6f747c 0%, #e8eaed 22%, #ffffff 34%, #a8adb5 58%, #d6d9de 76%, #7a7f87 100%)",
  },
};

/* -------------------------------------------------------------------------- */
/* Geometry                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Everything is drawn in hundredths of the body's diameter, so the counter
 * scales as one piece. The body sits below the plunger and above the ring,
 * with the reset knob poking out of its right-hand side.
 */
const LAYOUT = {
  body: { left: 8, size: 100, top: 26 },
  height: 156,
  knob: { size: 21, x: 113, y: 76 },
  plunger: { capHeight: 10, capWidth: 36, stemWidth: 16, top: 4 },
  ring: { size: 40, thickness: 7.5, top: 113 },
  wheel: { gap: 1.6, height: 19, padding: 2.8, width: 12.5 },
  width: 126,
} as const;

const BODY_CENTRE_X = LAYOUT.body.left + LAYOUT.body.size / 2;
const BODY_CENTRE_Y = LAYOUT.body.top + LAYOUT.body.size / 2;

function wrap(value: number, modulo: number) {
  return ((value % modulo) + modulo) % modulo;
}

function digitsOf(value: number, digits: number) {
  return Array.from(
    { length: digits },
    (_, place) => Math.floor(value / 10 ** place) % 10,
  );
}

/* -------------------------------------------------------------------------- */
/* Number wheel                                                                */
/* -------------------------------------------------------------------------- */

type WheelMove =
  | { kind: "step" }
  | { kind: "reset"; onCatch: (delay: number) => void }
  | { kind: "instant" };

/**
 * One ten-sided drum. Its position never wraps: it only ever counts up, so a
 * carry from 9 rolls forward into 0 instead of spinning back through 8…1.
 */
function NumberWheel({
  move,
  position,
  unit,
}: {
  move: WheelMove;
  position: number;
  unit: number;
}) {
  const turn = useMotionValue(position);
  const faceHeight = LAYOUT.wheel.height * unit;
  const faceWidth = LAYOUT.wheel.width * unit;
  const radius = faceHeight / 2 / Math.tan(Math.PI / 10);
  const transform = useTransform(
    turn,
    (value) =>
      `translateZ(${-radius}px) rotateX(${value * DEGREES_PER_DIGIT}deg)`,
  );
  const moveRef = useRef(move);
  moveRef.current = move;

  useEffect(() => {
    const current = moveRef.current;

    if (current.kind === "instant") {
      turn.jump(position);
      return;
    }

    if (current.kind === "step") {
      const controls = animate(turn, position, WHEEL_STEP);
      return () => controls.stop();
    }

    // Reset: the knob drags every wheel forward at the same speed, and each
    // one drops into its zero catch as soon as it gets there.
    const distance = position - turn.get();

    if (distance <= 0.001) {
      return;
    }

    const duration = (distance / 10) * RESET_TURN;
    const onCatch = current.onCatch;
    let controls = animate(turn, position + RESET_OVERSHOOT, {
      duration: duration + (RESET_OVERSHOOT / 10) * RESET_TURN,
      ease: "linear",
      onComplete: () => {
        controls = animate(turn, position, WHEEL_CATCH);
      },
    });
    onCatch(duration);

    return () => controls.stop();
  }, [position, turn]);

  return (
    <div
      className="relative overflow-hidden"
      style={{
        borderRadius: unit * 0.9,
        boxShadow: `inset 0 0 0 ${unit * 0.25}px rgb(0 0 0 / 35%)`,
        height: faceHeight,
        perspective: radius * 5,
        width: faceWidth,
      }}
    >
      <motion.div
        className="absolute inset-0 [transform-style:preserve-3d]"
        style={{ transform }}
      >
        {Array.from({ length: 10 }, (_, digit) => (
          <div
            className="absolute inset-0 flex items-center justify-center font-number font-semibold text-[#17181a] tabular-nums [backface-visibility:hidden]"
            // biome-ignore lint/suspicious/noArrayIndexKey: the ten faces are fixed.
            key={digit}
            style={{
              background:
                "linear-gradient(90deg, #d9d4c7, #f6f2e8 30%, #fbf8f1 55%, #d6d1c4)",
              fontSize: faceHeight * 0.78,
              letterSpacing: "-0.02em",
              lineHeight: 1,
              transform: `rotateX(${-digit * DEGREES_PER_DIGIT}deg) translateZ(${radius}px)`,
            }}
          >
            {digit}
          </div>
        ))}
      </motion.div>

      {/* The drum curves away from the window, so its ends fall into shadow. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, rgb(0 0 0 / 62%), rgb(0 0 0 / 8%) 26%, rgb(0 0 0 / 0%) 45%, rgb(0 0 0 / 0%) 60%, rgb(0 0 0 / 14%) 78%, rgb(0 0 0 / 70%))",
        }}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Static parts                                                                */
/* -------------------------------------------------------------------------- */

function Rivet({
  finish,
  x,
  unit,
}: {
  finish: Finish;
  x: number;
  unit: number;
}) {
  const size = 4.2 * unit;

  return (
    <span
      aria-hidden="true"
      className="absolute rounded-full"
      style={{
        background: finish.turned,
        boxShadow: `inset 0 ${unit * 0.4}px ${unit * 0.4}px rgb(255 255 255 / 45%), 0 ${unit * 0.3}px ${unit * 0.6}px rgb(0 0 0 / 45%), 0 0 0 ${unit * 0.35}px rgb(0 0 0 / 18%)`,
        height: size,
        left: x * unit - size / 2,
        top: (BODY_CENTRE_Y - 6) * unit - size / 2,
        width: size,
      }}
    />
  );
}

/** The finger ring hanging off the bottom of the body. */
function FingerRing({ finish, unit }: { finish: Finish; unit: number }) {
  const { size, thickness, top } = LAYOUT.ring;

  return (
    <div
      aria-hidden="true"
      className="absolute rounded-full"
      style={{
        background: finish.turned,
        height: size * unit,
        left: (BODY_CENTRE_X - size / 2) * unit,
        maskImage: `radial-gradient(circle, transparent ${(size / 2 - thickness) * unit}px, black ${(size / 2 - thickness) * unit + 0.6}px)`,
        top: top * unit,
        width: size * unit,
      }}
    >
      <div
        className="absolute inset-0 rounded-full"
        style={{
          boxShadow: `inset 0 ${unit * 0.8}px ${unit}px rgb(255 255 255 / 55%), inset 0 ${-unit * 1.2}px ${unit * 1.4}px rgb(0 0 0 / 35%), inset 0 0 0 ${unit * 0.3}px rgb(0 0 0 / 22%)`,
        }}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Face (shared by the live counter and the static preview)                   */
/* -------------------------------------------------------------------------- */

type FaceProps = {
  digits: number;
  finish: TallyCounterFinish;
  knobRotate?: MotionValue<number> | number;
  plungerY?: MotionValue<number> | number;
  plungerClassName?: string;
  size: number;
  wheels: ReactNode;
};

function CounterFace({
  digits,
  finish: finishName,
  knobRotate = 0,
  plungerClassName,
  plungerY,
  size,
  wheels,
}: FaceProps) {
  const unit = size / LAYOUT.body.size;
  const finish = FINISHES[finishName];
  const { capHeight, capWidth, stemWidth, top } = LAYOUT.plunger;
  const wheel = LAYOUT.wheel;
  const windowWidth =
    digits * wheel.width + (digits - 1) * wheel.gap + wheel.padding * 2;
  const windowHeight = wheel.height + wheel.padding * 2;
  const knob = LAYOUT.knob;

  return (
    <>
      {/* The plunger rides on a stem that disappears into the body. */}
      <motion.div
        aria-hidden="true"
        className={cn("absolute", plungerClassName)}
        style={{
          height: (LAYOUT.body.top + 12 - top) * unit,
          left: (BODY_CENTRE_X - capWidth / 2) * unit,
          top: top * unit,
          width: capWidth * unit,
          ...(plungerY === undefined ? {} : { y: plungerY }),
        }}
      >
        <div
          className="absolute"
          style={{
            background: finish.turned,
            bottom: 0,
            boxShadow: `inset 0 ${-unit * 2}px ${unit * 2}px rgb(0 0 0 / 25%)`,
            left: ((capWidth - stemWidth) / 2) * unit,
            top: capHeight * 0.6 * unit,
            width: stemWidth * unit,
          }}
        />
        <div
          className="absolute inset-x-0 top-0"
          style={{
            background: finish.turned,
            borderRadius: `${capHeight * 0.5 * unit}px ${capHeight * 0.5 * unit}px ${capHeight * 0.3 * unit}px ${capHeight * 0.3 * unit}px`,
            boxShadow: `inset 0 ${unit * 0.7}px ${unit * 0.6}px rgb(255 255 255 / 60%), inset 0 ${-unit * 1.6}px ${unit * 1.2}px rgb(0 0 0 / 30%), 0 ${unit * 1.2}px ${unit * 1.4}px rgb(0 0 0 / 30%)`,
            height: capHeight * unit,
          }}
        />
      </motion.div>

      <FingerRing finish={finish} unit={unit} />

      {/* The reset knob: knurled all the way round so the turn reads. */}
      <motion.div
        aria-hidden="true"
        className="absolute rounded-full"
        style={{
          background: `repeating-conic-gradient(from 0deg, rgb(0 0 0 / 30%) 0deg 5deg, rgb(255 255 255 / 30%) 5deg 10deg), ${finish.turned}`,
          boxShadow: `0 ${unit * 0.8}px ${unit * 1.6}px rgb(0 0 0 / 35%), inset 0 0 0 ${unit * 0.4}px rgb(0 0 0 / 25%)`,
          height: knob.size * unit,
          left: (knob.x - knob.size / 2) * unit,
          rotate: knobRotate,
          top: (knob.y - knob.size / 2) * unit,
          width: knob.size * unit,
        }}
      >
        <div
          className="absolute rounded-full"
          style={{
            background: finish.turned,
            boxShadow: `inset 0 ${unit * 0.5}px ${unit * 0.5}px rgb(255 255 255 / 55%), 0 0 0 ${unit * 0.3}px rgb(0 0 0 / 25%)`,
            inset: knob.size * 0.24 * unit,
          }}
        />
        {/* A dimple on the cap, so a full turn is easy to see. */}
        <div
          className="absolute left-1/2 -translate-x-1/2 rounded-full"
          style={{
            background: "rgb(0 0 0 / 45%)",
            boxShadow: "0 0.5px 0 rgb(255 255 255 / 50%)",
            height: unit * 2.2,
            top: knob.size * 0.3 * unit,
            width: unit * 2.2,
          }}
        />
      </motion.div>

      {/* Body: a pressed steel rim around a spun face. */}
      <div
        className="absolute rounded-full"
        style={{
          background: finish.rim,
          boxShadow: `0 ${unit * 1.5}px ${unit * 2}px rgb(0 0 0 / 22%), 0 ${unit * 6}px ${unit * 14}px rgb(0 0 0 / 22%), inset 0 ${unit * 0.5}px ${unit * 0.4}px rgb(255 255 255 / 60%), inset 0 ${-unit * 0.6}px ${unit}px rgb(0 0 0 / 40%)`,
          height: LAYOUT.body.size * unit,
          left: LAYOUT.body.left * unit,
          top: LAYOUT.body.top * unit,
          width: LAYOUT.body.size * unit,
        }}
      >
        <div
          className="absolute rounded-full"
          style={{
            background: `${finish.spin}, ${finish.face}`,
            boxShadow: `inset 0 ${unit * 0.9}px ${unit * 1.4}px rgb(0 0 0 / 40%), inset 0 ${-unit * 0.5}px ${unit * 0.6}px rgb(255 255 255 / 40%), 0 ${unit * 0.4}px 0 rgb(255 255 255 / 30%)`,
            inset: 6.5 * unit,
          }}
        />
        {/* A soft light from above, fixed while the parts move under it. */}
        <div
          className="pointer-events-none absolute rounded-full"
          style={{
            background:
              "radial-gradient(ellipse 70% 45% at 38% 18%, rgb(255 255 255 / 38%), rgb(255 255 255 / 0%) 70%)",
            inset: 6.5 * unit,
          }}
        />
      </div>

      <Rivet finish={finish} unit={unit} x={BODY_CENTRE_X - 39} />
      <Rivet finish={finish} unit={unit} x={BODY_CENTRE_X + 39} />

      {/* The window: a black recess with the wheels behind a pane of glass. */}
      <div
        className="absolute flex items-center justify-center bg-[#0b0b0c]"
        style={{
          borderRadius: unit * 2.4,
          boxShadow: `inset 0 ${unit * 1.2}px ${unit * 1.6}px rgb(0 0 0 / 90%), 0 ${unit * 0.4}px 0 rgb(255 255 255 / 45%), 0 ${-unit * 0.4}px 0 rgb(0 0 0 / 30%), 0 0 0 ${unit * 0.9}px rgb(0 0 0 / 16%)`,
          columnGap: wheel.gap * unit,
          height: windowHeight * unit,
          left: (BODY_CENTRE_X - windowWidth / 2) * unit,
          top: (BODY_CENTRE_Y - 6 - windowHeight / 2) * unit,
          width: windowWidth * unit,
        }}
      >
        {wheels}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "linear-gradient(168deg, rgb(255 255 255 / 26%) 0%, rgb(255 255 255 / 8%) 34%, rgb(255 255 255 / 0%) 35%, rgb(255 255 255 / 0%) 70%, rgb(255 255 255 / 7%) 71%, rgb(255 255 255 / 0%) 86%)",
            borderRadius: unit * 2.4,
          }}
        />
      </div>

      {/* Stamped lettering under the window. */}
      <span
        aria-hidden="true"
        className="absolute -translate-x-1/2 whitespace-nowrap font-medium font-mono uppercase"
        style={{
          color: finish.ink,
          fontSize: unit * 4.2,
          left: BODY_CENTRE_X * unit,
          letterSpacing: "0.32em",
          textShadow: finish.shadow,
          top: (BODY_CENTRE_Y + 13) * unit,
        }}
      >
        Tally
      </span>
      <span
        aria-hidden="true"
        className="absolute -translate-x-1/2 whitespace-nowrap font-mono"
        style={{
          color: finish.ink,
          fontSize: unit * 3,
          left: BODY_CENTRE_X * unit,
          letterSpacing: "0.18em",
          opacity: 0.8,
          textShadow: finish.shadow,
          top: (BODY_CENTRE_Y + 20) * unit,
        }}
      >
        No. {digits}
      </span>
    </>
  );
}

/** A flat wheel showing one digit, for previews that never turn. */
function StaticWheel({ digit, unit }: { digit: number; unit: number }) {
  return (
    <div
      className="relative flex items-center justify-center overflow-hidden font-number font-semibold text-[#17181a] tabular-nums"
      style={{
        background:
          "linear-gradient(90deg, #d9d4c7, #f6f2e8 30%, #fbf8f1 55%, #d6d1c4)",
        borderRadius: unit * 0.9,
        fontSize: LAYOUT.wheel.height * unit * 0.78,
        height: LAYOUT.wheel.height * unit,
        lineHeight: 1,
        width: LAYOUT.wheel.width * unit,
      }}
    >
      {digit}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, rgb(0 0 0 / 62%), rgb(0 0 0 / 8%) 26%, rgb(0 0 0 / 0%) 45%, rgb(0 0 0 / 0%) 60%, rgb(0 0 0 / 14%) 78%, rgb(0 0 0 / 70%))",
        }}
      />
    </div>
  );
}

/** A decorative, non-interactive counter for thumbnails and previews. */
export function TallyCounterFace({
  className,
  digits = 4,
  finish = "chrome",
  plungerClassName,
  size = 64,
  style,
  value = 0,
}: {
  className?: string;
  digits?: number;
  finish?: TallyCounterFinish;
  /** Classes for the plunger, e.g. to press it on hover. */
  plungerClassName?: string;
  size?: number;
  style?: CSSProperties;
  value?: number;
}) {
  const unit = size / LAYOUT.body.size;

  return (
    <div
      aria-hidden="true"
      className={cn("relative", className)}
      style={{
        height: LAYOUT.height * unit,
        width: LAYOUT.width * unit,
        ...style,
      }}
    >
      <CounterFace
        digits={digits}
        finish={finish}
        plungerClassName={plungerClassName}
        size={size}
        wheels={digitsOf(value, digits)
          .reverse()
          .map((digit, place) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: places are fixed.
            <StaticWheel digit={digit} key={place} unit={unit} />
          ))}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* The counter                                                                 */
/* -------------------------------------------------------------------------- */

export function TallyCounter({
  className,
  defaultValue = 0,
  digits = 4,
  finish = "chrome",
  label = "Tally counter",
  onValueChange,
  size = 200,
  sound = true,
  value: controlledValue,
}: TallyCounterProps) {
  const shouldReduceMotion = useReducedMotion();
  const statusId = useId();
  const unit = size / LAYOUT.body.size;
  const limit = 10 ** digits;

  const [uncontrolledValue, setUncontrolledValue] = useState(() =>
    wrap(defaultValue, limit),
  );
  const value = wrap(controlledValue ?? uncontrolledValue, limit);
  const valueRef = useRef(value);

  // Where each wheel has turned to, ones first. Positions only ever grow.
  const [positions, setPositions] = useState(() => digitsOf(value, digits));
  const [move, setMove] = useState<WheelMove>({ kind: "instant" });
  const [pressed, setPressed] = useState(false);

  const plungerY = useMotionValue(0);
  const knobRotate = useMotionValue(0);
  const bodyNudge = useMotionValue(0);
  const pressRef = useRef<{
    landed: boolean;
    pointerId: number | null;
    released: boolean;
  } | null>(null);
  const lastPressAt = useRef(0);

  const emit = useCallback(
    (next: number) => {
      valueRef.current = next;

      if (controlledValue === undefined) {
        setUncontrolledValue(next);
      }

      onValueChange?.(next);
    },
    [controlledValue, onValueChange],
  );

  // Follow controlled changes that did not come from the plunger or the knob,
  // by rolling each wheel forward to its new digit.
  useEffect(() => {
    if (value === valueRef.current) {
      return;
    }

    valueRef.current = value;
    const target = digitsOf(value, digits);
    setMove({ kind: shouldReduceMotion ? "instant" : "step" });
    setPositions((current) =>
      current.map((position, place) => {
        const ahead = wrap(target[place] - position, 10);
        return position + ahead;
      }),
    );
  }, [digits, shouldReduceMotion, value]);

  const count = useCallback(() => {
    const next = wrap(valueRef.current + 1, limit);

    // The ones wheel always turns. Every wheel after it turns only if the one
    // before it has just rolled over from nine to zero.
    setMove({ kind: shouldReduceMotion ? "instant" : "step" });
    setPositions((current) => {
      const turned = [...current];
      for (let place = 0; place < turned.length; place += 1) {
        turned[place] += 1;
        if (wrap(turned[place], 10) !== 0) {
          break;
        }
      }
      return turned;
    });
    emit(next);

    if (sound) {
      playVoice("clack");
    }

    buzz(8);
  }, [emit, limit, shouldReduceMotion, sound]);

  // Let go before the plunger bottoms out and it still finishes the stroke,
  // so a quick tap always counts, just like the real thing.
  const springUp = useCallback(() => {
    pressRef.current = null;
    setPressed(false);

    if (sound) {
      playVoice("return", shouldReduceMotion ? 0 : 0.045);
    }

    if (shouldReduceMotion) {
      plungerY.jump(0);
      return;
    }

    animate(plungerY, 0, PLUNGER_UP);
  }, [plungerY, shouldReduceMotion, sound]);

  const land = useCallback(() => {
    const press = pressRef.current;

    if (!press || press.landed) {
      return;
    }

    press.landed = true;
    count();

    if (!shouldReduceMotion) {
      animate(bodyNudge, [0, unit * 0.9, 0], {
        duration: 0.22,
        ease: [0.2, 0.8, 0.3, 1],
      });
    }

    if (press.released) {
      springUp();
    }
  }, [bodyNudge, count, shouldReduceMotion, springUp, unit]);

  const pressDown = useCallback(
    (pointerId: number | null) => {
      if (pressRef.current) {
        return;
      }

      pressRef.current = { landed: false, pointerId, released: false };
      lastPressAt.current = performance.now();
      setPressed(true);
      getAudioContext();

      if (shouldReduceMotion) {
        plungerY.jump(PLUNGER_TRAVEL * unit);
        land();
        return;
      }

      // The count lands when the plunger bottoms out, not when it starts.
      animate(plungerY, PLUNGER_TRAVEL * unit, {
        ...PLUNGER_DOWN,
        onComplete: land,
        onUpdate: (latest) => {
          if (latest >= PLUNGER_TRAVEL * unit * 0.92) {
            land();
          }
        },
      });
    },
    [land, plungerY, shouldReduceMotion, unit],
  );

  const release = useCallback(() => {
    const press = pressRef.current;

    if (!press || press.released) {
      return;
    }

    press.released = true;

    if (press.landed) {
      springUp();
    }
  }, [springUp]);

  const reset = useCallback(() => {
    getAudioContext();

    const steps = positions.map((position) => wrap(-position, 10));
    const longest = Math.max(...steps);

    if (longest === 0) {
      // Already zero: the knob turns a hair and stops against the catches.
      if (sound) {
        playVoice("catch");
      }

      if (!shouldReduceMotion) {
        const from = knobRotate.get();
        animate(knobRotate, [from, from + 8, from], {
          duration: 0.28,
          ease: "easeOut",
        });
      }

      return;
    }

    if (shouldReduceMotion) {
      setMove({ kind: "instant" });
    } else {
      const caught = new Set<number>();

      setMove({
        kind: "reset",
        onCatch: (delay) => {
          // Several wheels can catch together; that is one clack, not three.
          const key = Math.round(delay * 1000);
          if (sound && !caught.has(key)) {
            caught.add(key);
            playVoice("catch", delay);
          }
        },
      });

      animate(knobRotate, knobRotate.get() + (longest / 10) * 360, {
        duration: (longest / 10) * RESET_TURN,
        ease: "linear",
      });

      if (sound) {
        // The pawl skips one tooth per digit the furthest wheel has to travel.
        for (let tooth = 0; tooth < longest; tooth += 1) {
          playVoice("ratchet", (tooth * RESET_TURN) / 10);
        }
      }

      buzz([6, 40, 6]);
    }

    setPositions((current) =>
      current.map((position) => position + wrap(-position, 10)),
    );
    emit(0);
  }, [emit, knobRotate, positions, shouldReduceMotion, sound]);

  function handlePointerDown(event: PointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) {
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    pressDown(event.pointerId);
  }

  function handlePointerUp(event: PointerEvent<HTMLButtonElement>) {
    if (pressRef.current?.pointerId === event.pointerId) {
      release();
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== " " && event.key !== "Enter") {
      return;
    }

    event.preventDefault();

    if (!event.repeat) {
      pressDown(null);
    }
  }

  function handleKeyUp(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== " " && event.key !== "Enter") {
      return;
    }

    event.preventDefault();

    if (pressRef.current?.pointerId === null) {
      release();
    }
  }

  // Screen readers can click without any key or pointer: still count once.
  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    // Pointer clicks were already counted on the way down, however long held.
    if (event.detail > 0 || performance.now() - lastPressAt.current < 600) {
      return;
    }

    pressDown(null);
    release();
  }

  const capWidth = LAYOUT.plunger.capWidth;

  return (
    <fieldset
      aria-label={label}
      className={cn("relative m-0 min-w-0 select-none border-0 p-0", className)}
      style={{
        height: LAYOUT.height * unit,
        width: LAYOUT.width * unit,
      }}
    >
      <motion.div className="absolute inset-0" style={{ y: bodyNudge }}>
        <CounterFace
          digits={digits}
          finish={finish}
          knobRotate={knobRotate}
          plungerY={plungerY}
          size={size}
          wheels={positions
            .map((position, place) => (
              <NumberWheel
                // biome-ignore lint/suspicious/noArrayIndexKey: places are fixed.
                key={place}
                move={move}
                position={position}
                unit={unit}
              />
            ))
            .reverse()}
        />
      </motion.div>

      {/* The plunger: a generous target over the cap and the top of the body. */}
      <button
        aria-describedby={statusId}
        aria-label="Count one"
        className={cn(
          "absolute cursor-pointer touch-none rounded-full outline-none",
          "focus-visible:ring-2 focus-visible:ring-grayscale-8 focus-visible:ring-offset-2 focus-visible:ring-offset-grayscale-1 dark:focus-visible:ring-offset-grayscale-2",
          pressed && "cursor-grabbing",
        )}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        onKeyUp={handleKeyUp}
        onLostPointerCapture={() => release()}
        onPointerCancel={() => release()}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        style={{
          height: (LAYOUT.plunger.capHeight + 10) * unit,
          left: (BODY_CENTRE_X - capWidth / 2 - 4) * unit,
          top: (LAYOUT.plunger.top - 4) * unit,
          width: (capWidth + 8) * unit,
        }}
        type="button"
      />

      <button
        aria-label="Reset to zero"
        className="absolute cursor-pointer rounded-full outline-none transition-transform duration-150 active:scale-95 focus-visible:ring-2 focus-visible:ring-grayscale-8 focus-visible:ring-offset-2 focus-visible:ring-offset-grayscale-1 motion-reduce:transition-none dark:focus-visible:ring-offset-grayscale-2"
        onClick={reset}
        style={{
          height: (LAYOUT.knob.size + 6) * unit,
          left: (LAYOUT.knob.x - LAYOUT.knob.size / 2 - 3) * unit,
          top: (LAYOUT.knob.y - LAYOUT.knob.size / 2 - 3) * unit,
          width: (LAYOUT.knob.size + 6) * unit,
        }}
        type="button"
      />

      <output aria-live="polite" className="sr-only" id={statusId}>
        {`Count ${value}`}
      </output>
    </fieldset>
  );
}
