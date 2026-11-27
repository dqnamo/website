"use client";

import {
  AnimatePresence,
  animate,
  type MotionValue,
  motion,
  useMotionValue,
  useReducedMotion,
} from "motion/react";
import {
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { cn } from "@/helpers/classname-helper";

export type ServiceBellFinish = "brass" | "chrome" | "copper";

type FinishSpec = {
  label: string;
  /** Fundamental pitch in hertz. */
  pitch: number;
  /** Time constant of the fundamental, in seconds. Copper goes dull sooner. */
  sustain: number;
  /** Dome reflections from the top of the dome down to the rim. */
  sky: string;
  upper: string;
  horizon: string;
  lower: string;
  floor: string;
  edge: string;
  /** Swatch colour for pickers. */
  swatch: string;
};

export const SERVICE_BELL_FINISHES: Record<ServiceBellFinish, FinishSpec> = {
  brass: {
    edge: "#3b2808",
    floor: "#4a330c",
    horizon: "#6b4a12",
    label: "Brass",
    lower: "#d9a63e",
    pitch: 1568,
    sky: "#fff4cf",
    sustain: 0.95,
    swatch: "#d8a945",
    upper: "#e7bb52",
  },
  chrome: {
    edge: "#1c1f23",
    floor: "#2a2e33",
    horizon: "#3b4149",
    label: "Chrome",
    lower: "#bcc3cb",
    pitch: 1760,
    sky: "#ffffff",
    sustain: 1.15,
    swatch: "#c9ced4",
    upper: "#d9dee4",
  },
  copper: {
    edge: "#2e130a",
    floor: "#3d1a0d",
    horizon: "#5a2412",
    label: "Copper",
    lower: "#c9714a",
    pitch: 1319,
    sky: "#ffe2cf",
    sustain: 0.62,
    swatch: "#c8754d",
    upper: "#e28c5c",
  },
};

/** How far the plunger travels, in SVG units. */
const PLUNGER_TRAVEL = 7;
/** The hammer trips this long after the plunger starts down. */
const STRIKE_DELAY = 38;
/** Dome flex frequency. Fast enough to read as a shimmer, not a wobble. */
const SHIMMER_HZ = 23;

/* -------------------------------------------------------------------------- */
/* Sound                                                                       */
/* -------------------------------------------------------------------------- */

let sharedContext: AudioContext | null = null;
let sharedBus: AudioNode | null = null;
let noiseBuffer: AudioBuffer | null = null;
/** Every ring still sounding, so a palm on the dome can choke all of them. */
const ringing = new Set<{ damper: GainNode; endsAt: number }>();

function getAudio() {
  if (typeof window === "undefined" || !("AudioContext" in window)) {
    return null;
  }

  if (!sharedContext) {
    sharedContext = new AudioContext();
    // Overlapping rings from fast taps should swell, not clip.
    const compressor = sharedContext.createDynamicsCompressor();
    compressor.threshold.value = -14;
    compressor.ratio.value = 6;
    compressor.connect(sharedContext.destination);
    sharedBus = compressor;
  }

  if (sharedContext.state === "suspended") {
    void sharedContext.resume();
  }

  return sharedBus ? { bus: sharedBus, context: sharedContext } : null;
}

function getNoise(context: AudioContext) {
  if (!noiseBuffer) {
    const length = Math.floor(context.sampleRate * 0.25);
    noiseBuffer = context.createBuffer(1, length, context.sampleRate);
    const data = noiseBuffer.getChannelData(0);

    for (let index = 0; index < length; index += 1) {
      data[index] = Math.random() * 2 - 1;
    }
  }

  return noiseBuffer;
}

/** A short filtered burst of noise: clicks, tocks and thuds. */
function playNoise(
  context: AudioContext,
  bus: AudioNode,
  {
    at,
    decay,
    frequency,
    gain,
    q = 1,
    type = "bandpass",
  }: {
    at: number;
    decay: number;
    frequency: number;
    gain: number;
    q?: number;
    type?: BiquadFilterType;
  },
) {
  const source = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const envelope = context.createGain();

  source.buffer = getNoise(context);
  source.playbackRate.value = 0.8 + Math.random() * 0.4;
  filter.type = type;
  filter.frequency.value = frequency;
  filter.Q.value = q;
  envelope.gain.setValueAtTime(gain, at);
  envelope.gain.setTargetAtTime(0, at, decay);

  source.connect(filter).connect(envelope).connect(bus);
  source.start(at, Math.random() * 0.1);
  source.stop(at + decay * 8);
}

/**
 * Bell partials as [ratio to the fundamental, loudness, share of sustain].
 * The pair at 1 and 1.0017 beat against each other a few times a second,
 * which is the slow "wah" you hear as a real desk bell dies away.
 */
const PARTIALS = [
  [1, 1, 1],
  [1.0017, 0.55, 1],
  [2.32, 0.42, 0.48],
  [4.25, 0.22, 0.24],
  [6.63, 0.12, 0.11],
] as const;

function playMechanism(kind: "down" | "up") {
  const audio = getAudio();

  if (!audio) {
    return;
  }

  const { bus, context } = audio;

  playNoise(context, bus, {
    at: context.currentTime,
    decay: kind === "down" ? 0.012 : 0.008,
    frequency: kind === "down" ? 820 : 1500,
    gain: kind === "down" ? 0.14 : 0.07,
    q: 1.2,
  });
}

function playStrike(
  finish: ServiceBellFinish,
  strength: number,
  muted: boolean,
) {
  const audio = getAudio();

  if (!audio) {
    return;
  }

  const { bus, context } = audio;
  const spec = SERVICE_BELL_FINISHES[finish];
  const now = context.currentTime;
  const damper = context.createGain();
  const sustain = muted ? 0.035 : spec.sustain;
  const endsAt = now + sustain * 8;

  damper.gain.value = 1;
  damper.connect(bus);

  for (const [ratio, loudness, share] of PARTIALS) {
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    const peak = loudness * strength * (muted ? 0.05 : 0.14);

    oscillator.type = "sine";
    // A hair of detune per strike so no two dings are quite the same.
    oscillator.frequency.value =
      spec.pitch * ratio * (1 + (Math.random() - 0.5) * 0.0016);
    envelope.gain.setValueAtTime(0, now);
    envelope.gain.linearRampToValueAtTime(peak, now + 0.0015);
    envelope.gain.setTargetAtTime(0, now + 0.0015, sustain * share);

    oscillator.connect(envelope).connect(damper);
    oscillator.start(now);
    oscillator.stop(endsAt);
  }

  // The hammer's tick on the metal, bright and very short.
  playNoise(context, bus, {
    at: now,
    decay: 0.004,
    frequency: muted ? 1800 : 4200,
    gain: (muted ? 0.12 : 0.22) * strength,
    type: "highpass",
  });

  if (muted) {
    // A hand on the dome turns the ding into a dull clunk.
    playNoise(context, bus, {
      at: now,
      decay: 0.02,
      frequency: 420,
      gain: 0.2 * strength,
      q: 0.8,
    });
    return;
  }

  const voice = { damper, endsAt };
  ringing.add(voice);
  setTimeout(() => ringing.delete(voice), (endsAt - now) * 1000 + 50);
}

/** Choke every ring that is still going. Returns whether anything was ringing. */
function dampRinging() {
  if (!sharedContext) {
    return false;
  }

  const now = sharedContext.currentTime;
  let choked = false;

  for (const voice of ringing) {
    if (voice.endsAt > now) {
      choked = true;
      voice.damper.gain.cancelScheduledValues(now);
      voice.damper.gain.setValueAtTime(voice.damper.gain.value, now);
      voice.damper.gain.linearRampToValueAtTime(0, now + 0.07);
    }
  }

  ringing.clear();
  return choked;
}

function playPalm() {
  const audio = getAudio();

  if (!audio) {
    return;
  }

  playNoise(audio.context, audio.bus, {
    at: audio.context.currentTime,
    decay: 0.018,
    frequency: 260,
    gain: 0.12,
    q: 0.7,
  });
}

function buzz(duration: number) {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    navigator.vibrate?.(duration);
  }
}

/* -------------------------------------------------------------------------- */
/* Drawing                                                                     */
/* -------------------------------------------------------------------------- */

const VIEW_WIDTH = 240;
const VIEW_HEIGHT = 190;
/** Centre of the dome's rim, where it sits on the base. */
const RIM_X = 120;
const RIM_Y = 148;
const DOME_RADIUS = 80;
const DOME_HEIGHT = 66;
const DOME_TOP = RIM_Y - DOME_HEIGHT;

const domePath = `M ${RIM_X - DOME_RADIUS} ${RIM_Y} A ${DOME_RADIUS} ${DOME_HEIGHT} 0 0 1 ${RIM_X + DOME_RADIUS} ${RIM_Y} A ${DOME_RADIUS} 10 0 0 1 ${RIM_X - DOME_RADIUS} ${RIM_Y} Z`;

/** Sound lines either side of the dome, drawn as arcs around its centre. */
function arcPath(radius: number, from: number, to: number) {
  const cx = RIM_X;
  const cy = RIM_Y - 26;
  const start = (from * Math.PI) / 180;
  const end = (to * Math.PI) / 180;
  const point = (angle: number) =>
    `${roundUnit(cx + Math.cos(angle) * radius)} ${roundUnit(cy + Math.sin(angle) * radius)}`;

  return `M ${point(start)} A ${radius} ${radius} 0 0 1 ${point(end)}`;
}

function roundUnit(value: number) {
  return Math.round(value * 100) / 100;
}

const WAVE_ARCS = [
  arcPath(96, 196, 226),
  arcPath(96, 314, 344),
  arcPath(112, 200, 222),
  arcPath(112, 318, 340),
];

type BellMotion = {
  domeScaleX?: MotionValue<number>;
  domeScaleY?: MotionValue<number>;
  glint?: MotionValue<number>;
  plungerY?: MotionValue<number>;
  skidX?: MotionValue<number>;
};

type ServiceBellFaceProps = {
  className?: string;
  finish?: ServiceBellFinish;
  /** Darken the top of the dome as if a palm is resting on it. */
  palm?: boolean;
  /** Classes for the plunger group, e.g. to press it on hover. */
  plungerClassName?: string;
  /** Classes for the sound lines, e.g. to show them on hover. */
  wavesClassName?: string;
  motionValues?: BellMotion;
  children?: ReactNode;
};

/** The drawing on its own: base, dome and plunger. */
export function ServiceBellFace({
  children,
  className,
  finish = "brass",
  motionValues = {},
  palm = false,
  plungerClassName,
  wavesClassName,
}: ServiceBellFaceProps) {
  const id = useId().replace(/:/g, "");
  const spec = SERVICE_BELL_FINISHES[finish];
  const { domeScaleX, domeScaleY, glint, plungerY, skidX } = motionValues;
  const ids = {
    baseSide: `${id}-base-side`,
    baseTop: `${id}-base-top`,
    blur: `${id}-blur`,
    cap: `${id}-cap`,
    domeClip: `${id}-dome-clip`,
    domeFalloff: `${id}-dome-falloff`,
    domeReflect: `${id}-dome-reflect`,
    rod: `${id}-rod`,
    softBlur: `${id}-soft-blur`,
  };

  return (
    <svg
      aria-hidden="true"
      className={cn("block h-auto w-full overflow-visible", className)}
      viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
    >
      <defs>
        <linearGradient
          gradientUnits="userSpaceOnUse"
          id={ids.domeReflect}
          x1="0"
          x2="0"
          y1={DOME_TOP}
          y2={RIM_Y + 10}
        >
          <stop offset="0" stopColor={spec.sky} />
          <stop offset="0.3" stopColor={spec.upper} />
          <stop offset="0.56" stopColor={spec.upper} />
          <stop offset="0.66" stopColor={spec.horizon} />
          <stop offset="0.76" stopColor={spec.lower} />
          <stop offset="0.9" stopColor={spec.lower} />
          <stop offset="1" stopColor={spec.floor} />
        </linearGradient>
        <radialGradient
          cx={RIM_X - 14}
          cy={RIM_Y - 34}
          gradientUnits="userSpaceOnUse"
          id={ids.domeFalloff}
          r={DOME_RADIUS * 1.08}
        >
          <stop offset="0.55" stopColor={spec.edge} stopOpacity="0" />
          <stop offset="1" stopColor={spec.edge} stopOpacity="0.85" />
        </radialGradient>
        <linearGradient id={ids.cap} x1="0" x2="0.35" y1="0" y2="1">
          <stop offset="0" stopColor={spec.sky} />
          <stop offset="0.45" stopColor={spec.upper} />
          <stop offset="0.8" stopColor={spec.lower} />
          <stop offset="1" stopColor={spec.horizon} />
        </linearGradient>
        <clipPath id={ids.domeClip}>
          <path d={domePath} />
        </clipPath>
        <linearGradient id={ids.rod} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor={spec.horizon} />
          <stop offset="0.35" stopColor={spec.sky} />
          <stop offset="0.7" stopColor={spec.upper} />
          <stop offset="1" stopColor={spec.floor} />
        </linearGradient>
        <linearGradient id={ids.baseSide} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#060606" />
          <stop offset="0.3" stopColor="#1f1d1b" />
          <stop offset="0.42" stopColor="#3a3734" />
          <stop offset="0.56" stopColor="#1a1917" />
          <stop offset="1" stopColor="#050505" />
        </linearGradient>
        <radialGradient cx="0.38" cy="0.2" id={ids.baseTop} r="0.9">
          <stop offset="0" stopColor="#3a3734" />
          <stop offset="0.6" stopColor="#161514" />
          <stop offset="1" stopColor="#0a0a0a" />
        </radialGradient>
        <filter height="2" id={ids.blur} width="1.6" x="-0.3" y="-0.5">
          <feGaussianBlur stdDeviation="5" />
        </filter>
        <filter height="3" id={ids.softBlur} width="3" x="-1" y="-1">
          <feGaussianBlur stdDeviation="2.4" />
        </filter>
      </defs>

      <motion.g style={{ x: skidX }}>
        {/* Contact shadow on the table. */}
        <ellipse
          className="fill-black/25 dark:fill-black/60"
          cx={RIM_X}
          cy={170}
          filter={`url(#${ids.blur})`}
          rx={98}
          ry={9}
        />

        {/* Lacquered base: the front wall, then the top it sits on. */}
        <path
          d="M 24 150 A 96 13 0 0 0 216 150 L 216 161 A 96 13 0 0 1 24 161 Z"
          fill={`url(#${ids.baseSide})`}
        />
        <path
          className="stroke-white/[0.06] dark:stroke-white/[0.14]"
          d="M 24 161 A 96 13 0 0 0 216 161"
          fill="none"
          strokeWidth="0.75"
        />
        <ellipse
          cx={RIM_X}
          cy={150}
          fill={`url(#${ids.baseTop})`}
          rx={96}
          ry={13}
        />
        <ellipse
          cx={RIM_X}
          cy={150}
          fill="none"
          rx={95.5}
          ry={12.6}
          stroke="rgb(255 255 255 / 0.14)"
          strokeWidth="0.75"
        />

        {/* The plunger sits behind the dome so the dome hides its foot. */}
        <motion.g className={plungerClassName} style={{ y: plungerY }}>
          <rect
            fill={`url(#${ids.rod})`}
            height={34}
            rx={1.5}
            width={6}
            x={RIM_X - 3}
            y={DOME_TOP - 26}
          />
          {/* Mushroom cap. */}
          <path
            d={`M ${RIM_X - 12} ${DOME_TOP - 25} A 12 9 0 0 1 ${RIM_X + 12} ${DOME_TOP - 25} A 12 3.2 0 0 1 ${RIM_X - 12} ${DOME_TOP - 25} Z`}
            fill={`url(#${ids.cap})`}
          />
          <path
            d={`M ${RIM_X - 12} ${DOME_TOP - 25} A 12 3.2 0 0 0 ${RIM_X + 12} ${DOME_TOP - 25}`}
            fill="none"
            stroke={spec.floor}
            strokeWidth="1.2"
          />
          <ellipse
            cx={RIM_X - 4}
            cy={DOME_TOP - 30}
            fill="white"
            opacity={0.75}
            rx={4}
            ry={1.6}
            transform={`rotate(-18 ${RIM_X - 4} ${DOME_TOP - 30})`}
          />
        </motion.g>

        <motion.g
          style={{
            originX: 0.5,
            originY: 1,
            scaleX: domeScaleX,
            scaleY: domeScaleY,
          }}
        >
          <path d={domePath} fill={`url(#${ids.domeReflect})`} />
          <path d={domePath} fill={`url(#${ids.domeFalloff})`} />

          {/* The studio window, reflected. It flares as the dome rings. */}
          <ellipse
            cx={RIM_X - 34}
            cy={DOME_TOP + 22}
            fill="white"
            filter={`url(#${ids.softBlur})`}
            opacity={0.7}
            rx={17}
            ry={7}
            transform={`rotate(-32 ${RIM_X - 34} ${DOME_TOP + 22})`}
          />
          <motion.ellipse
            cx={RIM_X - 32}
            cy={DOME_TOP + 21}
            fill="white"
            rx={6}
            ry={2.4}
            style={{ opacity: glint ?? 0.9 }}
            transform={`rotate(-32 ${RIM_X - 32} ${DOME_TOP + 21})`}
          />
          {/* A long rim light down the right flank. */}
          <path
            d={`M ${RIM_X + 52} ${DOME_TOP + 16} A ${DOME_RADIUS - 6} ${DOME_HEIGHT - 4} 0 0 1 ${RIM_X + 72} ${RIM_Y - 14}`}
            fill="none"
            filter={`url(#${ids.softBlur})`}
            opacity={0.55}
            stroke="white"
            strokeLinecap="round"
            strokeWidth="2.5"
          />

          {/* Rolled lip where the dome meets the base. */}
          <path
            d={`M ${RIM_X - DOME_RADIUS} ${RIM_Y} A ${DOME_RADIUS} 10 0 0 0 ${RIM_X + DOME_RADIUS} ${RIM_Y}`}
            fill="none"
            stroke={spec.sky}
            strokeOpacity={0.55}
            strokeWidth="1.3"
          />
          <path
            d={`M ${RIM_X - DOME_RADIUS + 1} ${RIM_Y + 1.6} A ${DOME_RADIUS - 1} 10 0 0 0 ${RIM_X + DOME_RADIUS - 1} ${RIM_Y + 1.6}`}
            fill="none"
            stroke={spec.edge}
            strokeOpacity={0.7}
            strokeWidth="1.2"
          />

          {/* The collar the plunger slides through. */}
          <ellipse
            cx={RIM_X}
            cy={DOME_TOP + 1}
            fill={spec.floor}
            rx={7}
            ry={2.2}
          />
          <ellipse
            cx={RIM_X}
            cy={DOME_TOP + 0.4}
            fill="none"
            rx={7}
            ry={2.2}
            stroke={spec.sky}
            strokeOpacity={0.7}
            strokeWidth="0.8"
          />

          {/* A hand resting on top shades the crown. */}
          <g clipPath={`url(#${ids.domeClip})`}>
            <ellipse
              className="transition-opacity duration-150 motion-reduce:transition-none"
              cx={RIM_X}
              cy={DOME_TOP + 14}
              fill="black"
              filter={`url(#${ids.blur})`}
              opacity={palm ? 0.4 : 0}
              rx={50}
              ry={24}
            />
          </g>
        </motion.g>
      </motion.g>

      <g
        className={cn("text-grayscale-9", wavesClassName)}
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="2.2"
      >
        {children ?? WAVE_ARCS.map((d) => <path d={d} key={d} opacity={0} />)}
      </g>
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/* Interactive bell                                                            */
/* -------------------------------------------------------------------------- */

export type ServiceBellProps = {
  finish?: ServiceBellFinish;
  /** Play the synthesised ring. */
  sound?: boolean;
  /** Called each time the hammer strikes the dome. */
  onRing?: () => void;
  className?: string;
};

type Wave = { id: number; strength: number };

export function ServiceBell({
  className,
  finish = "brass",
  onRing,
  sound = true,
}: ServiceBellProps) {
  const shouldReduceMotion = useReducedMotion();
  const plungerY = useMotionValue(0);
  const domeScaleX = useMotionValue(1);
  const domeScaleY = useMotionValue(1);
  const glint = useMotionValue(0.9);
  const skidX = useMotionValue(0);
  const hintId = useId();

  const [palm, setPalm] = useState(false);
  const [waves, setWaves] = useState<Wave[]>([]);
  const [rings, setRings] = useState(0);

  const pressed = useRef(false);
  const palmRef = useRef(false);
  const strikeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastStrikeAt = useRef(0);
  const waveId = useRef(0);
  const frame = useRef<number | null>(null);
  /** How hard the dome is ringing, decaying from `value` at `at` with `tau`. */
  const energy = useRef({ at: 0, tau: 1, value: 0 });

  const currentEnergy = useCallback((now: number) => {
    const { at, tau, value } = energy.current;
    return value * Math.exp(-(now - at) / 1000 / tau);
  }, []);

  const tick = useCallback(() => {
    const now = performance.now();
    const level = currentEnergy(now);

    if (level < 0.004) {
      domeScaleX.set(1);
      domeScaleY.set(1);
      glint.set(0.9);
      frame.current = null;
      return;
    }

    const swing = Math.sin((now / 1000) * Math.PI * 2 * SHIMMER_HZ);
    const flex = shouldReduceMotion ? 0 : Math.min(level, 1.2);

    domeScaleX.set(1 + 0.011 * flex * swing);
    domeScaleY.set(1 - 0.008 * flex * swing);
    // The glint flares with the ring and flickers as the dome flexes.
    glint.set(0.9 + Math.min(0.1, level) + 0.1 * flex * swing);
    frame.current = requestAnimationFrame(tick);
  }, [currentEnergy, domeScaleX, domeScaleY, glint, shouldReduceMotion]);

  const wake = useCallback(() => {
    frame.current ??= requestAnimationFrame(tick);
  }, [tick]);

  useEffect(
    () => () => {
      if (frame.current !== null) {
        cancelAnimationFrame(frame.current);
      }
      if (strikeTimer.current) {
        clearTimeout(strikeTimer.current);
      }
    },
    [],
  );

  const strike = useCallback(() => {
    const now = performance.now();
    // Quick taps land a little softer, like a hammer that hasn't fully reset.
    const since = now - lastStrikeAt.current;
    const strength = (since < 160 ? 0.72 : 1) * (0.9 + Math.random() * 0.15);
    const muted = palmRef.current;
    const spec = SERVICE_BELL_FINISHES[finish];

    lastStrikeAt.current = now;
    energy.current = {
      at: now,
      tau: muted ? 0.04 : spec.sustain * 0.75,
      value: Math.min(1.4, currentEnergy(now) + strength * (muted ? 0.3 : 1)),
    };
    wake();

    if (sound) {
      playStrike(finish, strength, muted);
    }

    buzz(muted ? 6 : 12);
    setRings((count) => count + 1);
    onRing?.();

    if (muted || shouldReduceMotion) {
      return;
    }

    waveId.current += 1;
    const wave = { id: waveId.current, strength };
    setWaves((current) => [...current.slice(-3), wave]);

    // A firm slap walks the bell across the table a touch.
    const nudge = (Math.random() - 0.5) * 1.6 * strength;
    animate(skidX, Math.max(-6, Math.min(6, skidX.get() + nudge)), {
      damping: 30,
      stiffness: 900,
      type: "spring",
    });
  }, [currentEnergy, finish, onRing, shouldReduceMotion, skidX, sound, wake]);

  const pressPlunger = useCallback(() => {
    if (pressed.current) {
      return;
    }

    pressed.current = true;

    if (sound) {
      playMechanism("down");
    }

    if (shouldReduceMotion) {
      plungerY.set(PLUNGER_TRAVEL);
    } else {
      animate(plungerY, PLUNGER_TRAVEL, { duration: 0.06, ease: "easeIn" });
    }

    strikeTimer.current = setTimeout(strike, STRIKE_DELAY);
  }, [plungerY, shouldReduceMotion, sound, strike]);

  const releasePlunger = useCallback(() => {
    if (!pressed.current) {
      return;
    }

    pressed.current = false;

    if (sound) {
      playMechanism("up");
    }

    if (shouldReduceMotion) {
      plungerY.set(0);
    } else {
      // The spring throws it back past the top and it settles on its stop.
      animate(plungerY, 0, {
        damping: 11,
        mass: 0.4,
        stiffness: 700,
        type: "spring",
      });
    }
  }, [plungerY, shouldReduceMotion, sound]);

  const placePalm = useCallback(() => {
    if (palmRef.current) {
      return;
    }

    palmRef.current = true;
    setPalm(true);

    const now = performance.now();
    const wasRinging = currentEnergy(now) > 0.02;
    energy.current = { at: now, tau: 0.05, value: currentEnergy(now) };
    wake();
    setWaves([]);

    const choked = dampRinging();

    if (sound && (choked || wasRinging)) {
      playPalm();
    }
  }, [currentEnergy, sound, wake]);

  const liftPalm = useCallback(() => {
    palmRef.current = false;
    setPalm(false);
  }, []);

  const onPlungerKeyDown = (event: KeyboardEvent) => {
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();

      if (!event.repeat) {
        pressPlunger();
      }
    }
  };

  const onPlungerKeyUp = (event: KeyboardEvent) => {
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      releasePlunger();
    }
  };

  const onDomeKeyDown = (event: KeyboardEvent) => {
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      placePalm();
    }
  };

  const onDomeKeyUp = (event: KeyboardEvent) => {
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      liftPalm();
    }
  };

  const capture = (event: PointerEvent<HTMLButtonElement>) => {
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  return (
    <div
      className={cn("relative w-full max-w-[340px] select-none", className)}
      style={{ WebkitTapHighlightColor: "transparent" }}
    >
      <ServiceBellFace
        finish={finish}
        motionValues={{ domeScaleX, domeScaleY, glint, plungerY, skidX }}
        palm={palm}
      >
        <AnimatePresence>
          {waves.map((wave) => (
            <motion.g
              animate={{ opacity: 0, scale: 1.22 }}
              exit={{ opacity: 0, transition: { duration: 0.08 } }}
              initial={{ opacity: 0.85 * wave.strength, scale: 0.96 }}
              key={wave.id}
              onAnimationComplete={() =>
                setWaves((current) =>
                  current.filter((item) => item.id !== wave.id),
                )
              }
              transition={{ duration: 0.9, ease: [0.2, 0.7, 0.3, 1] }}
            >
              {/* Centres the group's box on the dome so it scales from there. */}
              <rect
                height={260}
                stroke="none"
                width={VIEW_WIDTH}
                x={0}
                y={RIM_Y - 26 - 130}
              />
              {WAVE_ARCS.map((d, index) => (
                <path d={d} key={d} opacity={index < 2 ? 1 : 0.55} />
              ))}
            </motion.g>
          ))}
        </AnimatePresence>
      </ServiceBellFace>

      {/* Hit areas laid over the drawing. */}
      <button
        aria-describedby={hintId}
        aria-label="Ring the bell"
        className="absolute rounded-full outline-none focus-visible:ring-2 focus-visible:ring-grayscale-8 focus-visible:ring-offset-2 focus-visible:ring-offset-grayscale-1 dark:focus-visible:ring-offset-grayscale-2"
        onBlur={releasePlunger}
        onKeyDown={onPlungerKeyDown}
        onKeyUp={onPlungerKeyUp}
        onLostPointerCapture={releasePlunger}
        onPointerCancel={releasePlunger}
        onPointerDown={(event) => {
          if (event.button !== 0) {
            return;
          }
          capture(event);
          pressPlunger();
        }}
        onPointerUp={releasePlunger}
        style={{
          cursor: "pointer",
          height: `${(40 / VIEW_HEIGHT) * 100}%`,
          left: `${((RIM_X - 22) / VIEW_WIDTH) * 100}%`,
          top: `${((DOME_TOP - 40) / VIEW_HEIGHT) * 100}%`,
          touchAction: "none",
          width: `${(44 / VIEW_WIDTH) * 100}%`,
        }}
        type="button"
      />
      <button
        aria-describedby={hintId}
        aria-label="Rest a hand on the dome to hush it"
        aria-pressed={palm}
        className={cn(
          "absolute outline-none focus-visible:ring-2 focus-visible:ring-grayscale-8 focus-visible:ring-offset-2 focus-visible:ring-offset-grayscale-1 dark:focus-visible:ring-offset-grayscale-2",
          palm ? "cursor-grabbing" : "cursor-grab",
        )}
        onBlur={liftPalm}
        onKeyDown={onDomeKeyDown}
        onKeyUp={onDomeKeyUp}
        onLostPointerCapture={liftPalm}
        onPointerCancel={liftPalm}
        onPointerDown={(event) => {
          if (event.button !== 0) {
            return;
          }
          capture(event);
          placePalm();
        }}
        onPointerUp={liftPalm}
        style={{
          borderRadius: "50% 50% 12% 12% / 92% 92% 8% 8%",
          height: `${((RIM_Y + 8 - DOME_TOP - 4) / VIEW_HEIGHT) * 100}%`,
          left: `${((RIM_X - DOME_RADIUS) / VIEW_WIDTH) * 100}%`,
          top: `${((DOME_TOP + 4) / VIEW_HEIGHT) * 100}%`,
          touchAction: "none",
          width: `${((DOME_RADIUS * 2) / VIEW_WIDTH) * 100}%`,
        }}
        type="button"
      />

      <p className="sr-only" id={hintId}>
        Press the plunger to ring. Hold the dome to stop it ringing.
      </p>
      <p aria-live="polite" className="sr-only">
        {rings > 0 ? `Rung ${rings} ${rings === 1 ? "time" : "times"}` : ""}
      </p>
    </div>
  );
}
