"use client";

import NumberFlow from "@number-flow/react";
import {
  type AnimationPlaybackControls,
  animate,
  type MotionValue,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useTransform,
} from "motion/react";
import {
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { cn } from "@/helpers/classname-helper";

/* -------------------------------------------------------------------------- */
/* Geometry                                                                    */
/* -------------------------------------------------------------------------- */

/** The drawing's viewBox. There is head room above for toast to fly into. */
const VIEW_X = 0;
const VIEW_Y = -70;
const VIEW_W = 400;
const VIEW_H = 380;

/** Where the slots' front lips are. Bread below this line is inside the body. */
const SLOT_LIP_Y = 116;
const SLOT_CENTRES = [136, 264] as const;
/** The top of a slice when the carriage is all the way up. */
const BREAD_REST_TOP = 52;
/** How far the carriage lowers the bread. */
const BREAD_TRAVEL = 52;

const LEVER_X = 329;
const LEVER_TOP = 150;
const LEVER_TRAVEL = 76;
const STOP_BUTTON = { r: 8, x: LEVER_X, y: 257 };
const DIAL = { r: 15, x: 76, y: 198 };

/** Where the lever rests when it has caught on the latch. */
const LATCHED_AT = 0.96;
/** Past this point the carriage spring starts to fight back. */
const SPRING_ENGAGES_AT = 0.74;
/** How far the hand has to push, past the stiffening, to catch the latch. */
const LATCH_PUSH = 1.12;

const SHADES = 6;

/** A slice of sandwich bread: a domed crown with ears over a straight body. */
const BREAD_PATH =
  "M -42 122 L -42 40 C -55 37 -57 14 -42 7 C -30 0 -15 -2 0 -2 C 15 -2 30 0 42 7 C 57 14 55 37 42 40 L 42 122 Z";

/** Little pores in the crumb, so it reads as bread and not cardboard. */
const PORES = [
  [-24, 22, 2.4, 1.4],
  [-6, 14, 1.6, 1],
  [16, 24, 2.2, 1.3],
  [30, 16, 1.4, 1],
  [-32, 40, 1.5, 1.1],
  [-12, 34, 2.8, 1.6],
  [8, 44, 1.6, 1],
  [26, 38, 2.2, 1.2],
  [-26, 58, 2, 1.2],
  [-2, 60, 1.4, 0.9],
  [20, 62, 2.6, 1.4],
  [-16, 76, 1.8, 1.1],
  [6, 82, 2.4, 1.3],
  [28, 84, 1.4, 0.9],
  [-30, 94, 2.2, 1.2],
  [14, 100, 1.8, 1.1],
] as const;

/* -------------------------------------------------------------------------- */
/* Toast                                                                       */
/* -------------------------------------------------------------------------- */

/** How much toasting one full cycle does, per notch on the shade dial. */
const DONENESS_PER_SHADE = 0.17;
/** The right-hand slice sits a little further from the element. */
const SECOND_SLICE_RATE = 0.9;

function toastingSeconds(shade: number) {
  return 3 + shade * 0.8;
}

const DONENESS_STOPS = [0, 0.2, 0.42, 0.6, 0.8, 1, 1.25];
const CRUMB_COLORS = [
  "#f6e6c4",
  "#efcf94",
  "#dfa75d",
  "#bf7b3b",
  "#86501f",
  "#432916",
  "#1f1610",
];
const CRUST_COLORS = [
  "#c98a43",
  "#b9732f",
  "#9c5a22",
  "#7a4117",
  "#4f2a10",
  "#25170c",
  "#120c08",
];

export function toastLabel(doneness: number) {
  if (doneness < 0.06) return "Untoasted";
  if (doneness < 0.26) return "Warm and pale";
  if (doneness < 0.44) return "Lightly golden";
  if (doneness < 0.64) return "Golden brown";
  if (doneness < 0.82) return "Well done";
  if (doneness < 0.98) return "Dark";
  return "Burnt";
}

/* -------------------------------------------------------------------------- */
/* Finishes                                                                    */
/* -------------------------------------------------------------------------- */

export type ToasterFinish = "cream" | "mint" | "tomato" | "chrome";

type Palette = {
  body: string;
  ink: string;
  shade: string;
  top: string;
};

export const TOASTER_FINISHES: Record<
  ToasterFinish,
  Palette & { label: string }
> = {
  chrome: {
    body: "#d3d8de",
    ink: "#3a4048",
    label: "Chrome",
    shade: "#8d959f",
    top: "#f3f5f7",
  },
  cream: {
    body: "#ede2cb",
    ink: "#6e5c41",
    label: "Cream",
    shade: "#c7b895",
    top: "#f9f2e2",
  },
  mint: {
    body: "#b5dbc6",
    ink: "#2d5945",
    label: "Mint",
    shade: "#84b59b",
    top: "#d9f0e3",
  },
  tomato: {
    body: "#e0543d",
    ink: "#fff1ea",
    label: "Tomato",
    shade: "#a8331f",
    top: "#f37d64",
  },
};

/* -------------------------------------------------------------------------- */
/* Sound                                                                       */
/* -------------------------------------------------------------------------- */

let sharedAudioContext: AudioContext | null = null;
let noiseBuffer: AudioBuffer | null = null;

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
  if (!noiseBuffer) {
    const length = context.sampleRate * 2;
    noiseBuffer = context.createBuffer(1, length, context.sampleRate);
    const data = noiseBuffer.getChannelData(0);

    for (let index = 0; index < length; index += 1) {
      data[index] = Math.random() * 2 - 1;
    }
  }

  return noiseBuffer;
}

/** A short burst of shaped noise: clicks, clacks and thunks. */
function noiseHit(
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
  const envelope = context.createGain();

  source.buffer = getNoise(context);
  filter.type = type;
  filter.frequency.value = frequency;
  filter.Q.value = q;
  envelope.gain.setValueAtTime(gain, start);
  envelope.gain.exponentialRampToValueAtTime(0.0001, start + decay * 6);

  source.connect(filter).connect(envelope).connect(context.destination);
  source.start(start, Math.random() * 1.5);
  source.stop(start + decay * 6 + 0.02);
}

/** A decaying sine, optionally sliding in pitch: rings, tinks and twangs. */
function ring(
  context: AudioContext,
  {
    at = 0,
    duration,
    frequency,
    gain,
    slideTo,
    type = "sine",
  }: {
    at?: number;
    duration: number;
    frequency: number;
    gain: number;
    slideTo?: number;
    type?: OscillatorType;
  },
) {
  const start = context.currentTime + at;
  const oscillator = context.createOscillator();
  const envelope = context.createGain();

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);

  if (slideTo) {
    oscillator.frequency.exponentialRampToValueAtTime(
      slideTo,
      start + duration * 0.6,
    );
  }

  envelope.gain.setValueAtTime(0.0001, start);
  envelope.gain.exponentialRampToValueAtTime(gain, start + 0.004);
  envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);

  oscillator.connect(envelope).connect(context.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.02);
}

type Sound = "detent" | "drop" | "latch" | "pop" | "release" | "stop" | "take";

function playSound(sound: Sound) {
  const context = getAudioContext();

  if (!context) {
    return;
  }

  switch (sound) {
    case "detent":
      noiseHit(context, { decay: 0.0016, frequency: 3600, gain: 0.5, q: 1.4 });
      break;
    case "latch":
      // The carriage hook rides over the catch, then drops behind it.
      noiseHit(context, { decay: 0.002, frequency: 2600, gain: 0.7, q: 1.6 });
      noiseHit(context, {
        at: 0.034,
        decay: 0.005,
        frequency: 1100,
        gain: 0.8,
        q: 1.1,
      });
      noiseHit(context, {
        at: 0.034,
        decay: 0.012,
        frequency: 260,
        gain: 0.7,
        type: "lowpass",
      });
      break;
    case "release":
      noiseHit(context, { decay: 0.008, frequency: 1500, gain: 0.45, q: 1.2 });
      noiseHit(context, {
        decay: 0.016,
        frequency: 240,
        gain: 0.55,
        type: "lowpass",
      });
      break;
    case "stop":
      noiseHit(context, { decay: 0.003, frequency: 2000, gain: 0.5, q: 1.3 });
      break;
    case "pop":
      // A thunk from the carriage hitting the top, the spring, then the bell.
      noiseHit(context, {
        decay: 0.018,
        frequency: 380,
        gain: 1,
        type: "lowpass",
      });
      noiseHit(context, { decay: 0.006, frequency: 1700, gain: 0.6, q: 1 });
      ring(context, {
        duration: 0.22,
        frequency: 440,
        gain: 0.05,
        slideTo: 250,
        type: "triangle",
      });
      ring(context, { at: 0.03, duration: 1.6, frequency: 1976, gain: 0.08 });
      ring(context, { at: 0.03, duration: 0.9, frequency: 4940, gain: 0.02 });
      break;
    case "take":
      noiseHit(context, { decay: 0.04, frequency: 1800, gain: 0.18, q: 0.6 });
      break;
    case "drop":
      noiseHit(context, {
        decay: 0.01,
        frequency: 320,
        gain: 0.6,
        type: "lowpass",
      });
      noiseHit(context, {
        at: 0.07,
        decay: 0.008,
        frequency: 360,
        gain: 0.4,
        type: "lowpass",
      });
      break;
  }
}

/**
 * The elements hum while they're on, and tick now and then as the metal
 * expands.
 */
function startHeatSound() {
  const context = getAudioContext();

  if (!context) {
    return () => {};
  }

  const source = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const envelope = context.createGain();
  const now = context.currentTime;

  source.buffer = getNoise(context);
  source.loop = true;
  filter.type = "lowpass";
  filter.frequency.value = 170;
  envelope.gain.setValueAtTime(0.0001, now);
  envelope.gain.exponentialRampToValueAtTime(0.09, now + 0.8);
  source.connect(filter).connect(envelope).connect(context.destination);
  source.start();

  let tickTimer = 0;
  const tick = () => {
    ring(context, {
      duration: 0.05,
      frequency: 3000 + Math.random() * 2200,
      gain: 0.018 + Math.random() * 0.02,
    });
    tickTimer = window.setTimeout(tick, 350 + Math.random() * 900);
  };
  tickTimer = window.setTimeout(tick, 900);

  return () => {
    window.clearTimeout(tickTimer);
    const end = context.currentTime;
    envelope.gain.cancelScheduledValues(end);
    envelope.gain.setValueAtTime(Math.max(envelope.gain.value, 0.0001), end);
    envelope.gain.exponentialRampToValueAtTime(0.0001, end + 0.25);
    source.stop(end + 0.3);
  };
}

function buzz(pattern: number | number[]) {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    navigator.vibrate?.(pattern);
  }
}

/* -------------------------------------------------------------------------- */
/* Drawing                                                                     */
/* -------------------------------------------------------------------------- */

type Animatable<T> = MotionValue<T> | T;

type SliceStyle = {
  crumb: Animatable<string>;
  crust: Animatable<string>;
  /** Darkening round the edge, where toast browns first. */
  rim: Animatable<number>;
  rotate: Animatable<number>;
  /** Stripes left by the element wires. */
  stripes: Animatable<number>;
  y: Animatable<number>;
};

type DrawingProps = {
  breadClassName?: string;
  breadOpacity?: Animatable<number>;
  className?: string;
  dialAngle: number;
  glow: Animatable<number>;
  glowClassName?: string;
  idPrefix: string;
  leverClassName?: string;
  leverOffset: Animatable<number>;
  lit: boolean;
  palette: Palette;
  reduceMotion?: boolean;
  slices: [SliceStyle, SliceStyle];
  smoke?: Animatable<number>;
  smoking?: boolean;
};

const fillTransition = "fill 450ms ease, stop-color 450ms ease";

/** The whole toaster as one SVG, posed by the values passed in. */
function ToasterDrawing({
  breadClassName,
  breadOpacity = 1,
  className,
  dialAngle,
  glow,
  glowClassName,
  idPrefix,
  leverClassName,
  leverOffset,
  lit,
  palette,
  reduceMotion = false,
  slices,
  smoke = 0,
  smoking = false,
}: DrawingProps) {
  const id = (name: string) => `${idPrefix}-${name}`;
  const url = (name: string) => `url(#${id(name)})`;

  return (
    <svg
      aria-hidden="true"
      className={cn("block h-auto w-full overflow-visible", className)}
      viewBox={`${VIEW_X} ${VIEW_Y} ${VIEW_W} ${VIEW_H}`}
    >
      <defs>
        <linearGradient id={id("face")} x1="0" x2="0" y1="0" y2="1">
          <stop
            offset="0"
            style={{ stopColor: palette.top, transition: fillTransition }}
          />
          <stop
            offset="0.28"
            style={{ stopColor: palette.body, transition: fillTransition }}
          />
          <stop
            offset="1"
            style={{ stopColor: palette.shade, transition: fillTransition }}
          />
        </linearGradient>
        {/* The body is rounded at the ends, so they turn away into shadow. */}
        <linearGradient id={id("ends")} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#000" stopOpacity="0.3" />
          <stop offset="0.09" stopColor="#000" stopOpacity="0.04" />
          <stop offset="0.22" stopColor="#fff" stopOpacity="0.16" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.9" stopColor="#000" stopOpacity="0.05" />
          <stop offset="1" stopColor="#000" stopOpacity="0.32" />
        </linearGradient>
        <linearGradient id={id("top")} x1="0" x2="0" y1="0" y2="1">
          <stop
            offset="0"
            style={{ stopColor: palette.body, transition: fillTransition }}
          />
          <stop
            offset="1"
            style={{ stopColor: palette.top, transition: fillTransition }}
          />
        </linearGradient>
        <linearGradient id={id("chrome")} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#fdfdfd" />
          <stop offset="0.45" stopColor="#b9bec5" />
          <stop offset="0.55" stopColor="#7e858e" />
          <stop offset="1" stopColor="#e4e7ea" />
        </linearGradient>
        <linearGradient id={id("bakelite")} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#4a4644" />
          <stop offset="0.5" stopColor="#1d1b1a" />
          <stop offset="1" stopColor="#0d0c0c" />
        </linearGradient>
        <linearGradient id={id("slot")} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#060404" />
          <stop offset="1" stopColor="#2a1d16" />
        </linearGradient>
        <radialGradient id={id("heat")} cx="0.5" cy="0.8" r="0.7">
          <stop offset="0" stopColor="#ffd27a" />
          <stop offset="0.45" stopColor="#ff6a1f" />
          <stop offset="1" stopColor="#b3200a" />
        </radialGradient>
        <radialGradient id={id("bloom")} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#ff8a2a" stopOpacity="0.85" />
          <stop offset="1" stopColor="#ff5a14" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={id("spill")} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#ff8a3a" stopOpacity="0.42" />
          <stop offset="1" stopColor="#ff8a3a" stopOpacity="0" />
        </linearGradient>
        <radialGradient id={id("shadow")} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#000" stopOpacity="0.34" />
          <stop offset="0.6" stopColor="#000" stopOpacity="0.14" />
          <stop offset="1" stopColor="#000" stopOpacity="0" />
        </radialGradient>
        <pattern
          height="13"
          id={id("stripes")}
          patternUnits="userSpaceOnUse"
          width="13"
        >
          <rect fill="#000" height="5" opacity="0.5" width="13" y="4" />
        </pattern>
        <clipPath id={id("slots")}>
          <rect height={SLOT_LIP_Y + 200} width={VIEW_W} x="0" y="-200" />
        </clipPath>
        <clipPath id={id("bread")}>
          <path d={BREAD_PATH} />
        </clipPath>
        <clipPath id={id("body")}>
          <rect height="158" rx="26" width="320" x="40" y="124" />
        </clipPath>
        <filter
          height="3"
          id={id("blur")}
          width="3"
          x="-1"
          y="-1"
          filterUnits="objectBoundingBox"
        >
          <feGaussianBlur stdDeviation="5" />
        </filter>
      </defs>

      {/* Shadow on the counter, and the feet. */}
      <ellipse
        cx="200"
        cy="290"
        fill={url("shadow")}
        rx="186"
        ry="16"
        className="dark:opacity-80"
      />
      <rect fill="#1b1918" height="12" rx="3" width="30" x="66" y="278" />
      <rect fill="#1b1918" height="12" rx="3" width="30" x="304" y="278" />

      {/* Top of the body, with the two slots. */}
      <rect fill={url("top")} height="52" rx="26" width="314" x="43" y="90" />
      <rect
        fill="none"
        height="51"
        rx="25.5"
        stroke="#fff"
        strokeOpacity="0.5"
        width="313"
        x="43.5"
        y="90.5"
      />
      {SLOT_CENTRES.map((centre) => (
        <g key={centre}>
          <rect
            fill={url("slot")}
            height="16"
            rx="7"
            width="108"
            x={centre - 54}
            y={SLOT_LIP_Y - 15}
          />
          <g className={glowClassName}>
            <motion.rect
              fill={url("heat")}
              height="14"
              rx="6"
              style={{ opacity: glow }}
              width="104"
              x={centre - 52}
              y={SLOT_LIP_Y - 14}
            />
          </g>
        </g>
      ))}

      {/* Heat shimmer over the slots while the elements are on. */}
      {!reduceMotion && (
        <motion.g style={{ opacity: glow }}>
          {SLOT_CENTRES.map((centre) =>
            [-24, 6, 30].map((offset, index) => (
              <motion.path
                animate={{ opacity: [0, 0.32, 0], y: [0, -38] }}
                d={`M ${centre + offset} ${SLOT_LIP_Y - 18} q 5 -7 0 -14 q -5 -7 0 -14`}
                fill="none"
                key={`${centre}${offset}`}
                stroke="#ffe7c7"
                strokeLinecap="round"
                strokeWidth="1.6"
                transition={{
                  delay: index * 0.45 + (centre % 7) * 0.08,
                  duration: 1.5,
                  ease: "easeOut",
                  repeat: Number.POSITIVE_INFINITY,
                }}
              />
            )),
          )}
        </motion.g>
      )}

      {/* The bread, cut off where it goes down into the slots. */}
      <motion.g clipPath={url("slots")} style={{ opacity: breadOpacity }}>
        {slices.map((slice, index) => (
          <g className={breadClassName} key={SLOT_CENTRES[index]}>
            <motion.g
              style={{
                originX: 0.5,
                originY: 1,
                rotate: slice.rotate,
                x: SLOT_CENTRES[index],
                y: slice.y,
              }}
            >
              <g transform={`translate(0 ${BREAD_REST_TOP})`}>
                <motion.path
                  d={BREAD_PATH}
                  strokeLinejoin="round"
                  strokeWidth="5"
                  style={{ fill: slice.crumb, stroke: slice.crust }}
                />
                <g clipPath={url("bread")}>
                  {PORES.map(([x, y, rx, ry]) => (
                    <motion.ellipse
                      cx={x}
                      cy={y}
                      key={`${x}${y}`}
                      opacity="0.22"
                      rx={rx}
                      ry={ry}
                      style={{ fill: slice.crust }}
                    />
                  ))}
                  <motion.rect
                    fill={url("stripes")}
                    height="140"
                    style={{ opacity: slice.stripes }}
                    width="120"
                    x="-60"
                    y="-10"
                  />
                  <motion.path
                    d={BREAD_PATH}
                    fill="none"
                    strokeWidth="16"
                    style={{ opacity: slice.rim, stroke: slice.crust }}
                  />
                </g>
                <path
                  d="M -36 12 C -24 4 -10 3 2 3"
                  fill="none"
                  opacity="0.35"
                  stroke="#fff"
                  strokeLinecap="round"
                  strokeWidth="2"
                />
              </g>
            </motion.g>
          </g>
        ))}

        {/* The elements light the bottom of the bread from inside. */}
        <g className={glowClassName}>
          <motion.g style={{ opacity: glow }}>
            {SLOT_CENTRES.map((centre) => (
              <ellipse
                cx={centre}
                cy={SLOT_LIP_Y}
                fill={url("bloom")}
                key={centre}
                rx="64"
                ry="20"
              />
            ))}
          </motion.g>
        </g>
      </motion.g>

      {/* The near lip of each slot sits in front of the bread. */}
      {SLOT_CENTRES.map((centre) => (
        <rect
          fill={url("chrome")}
          height="3"
          key={centre}
          rx="1.5"
          width="112"
          x={centre - 56}
          y={SLOT_LIP_Y - 1}
        />
      ))}

      {/* Front of the body. */}
      <rect
        fill={url("face")}
        height="158"
        rx="26"
        width="320"
        x="40"
        y="124"
      />
      <rect
        fill={url("ends")}
        height="158"
        rx="26"
        width="320"
        x="40"
        y="124"
      />
      <g clipPath={url("body")}>
        {/* Warm light spilling from the slots onto the top of the front. */}
        <g className={glowClassName}>
          <motion.rect
            fill={url("spill")}
            height="22"
            style={{ opacity: glow }}
            width="320"
            x="40"
            y="124"
          />
        </g>
        <path
          d="M 70 140 C 120 133 220 132 300 136"
          fill="none"
          opacity="0.55"
          stroke="#fff"
          strokeLinecap="round"
          strokeWidth="5"
        />
        {/* A chrome band and a darker plinth along the bottom. */}
        <rect fill={url("chrome")} height="7" width="320" x="40" y="258" />
        <rect
          fill="#000"
          height="17"
          opacity="0.18"
          width="320"
          x="40"
          y="265"
        />
      </g>
      <rect
        fill="none"
        height="157"
        rx="25.5"
        stroke="#000"
        strokeOpacity="0.14"
        width="319"
        x="40.5"
        y="124.5"
      />

      {/* Name plate. */}
      <g>
        <rect
          fill={url("chrome")}
          height="30"
          rx="15"
          width="112"
          x="144"
          y="181"
        />
        <rect
          fill="none"
          height="29"
          rx="14.5"
          stroke="#000"
          strokeOpacity="0.2"
          width="111"
          x="144.5"
          y="181.5"
        />
        <text
          className="font-pirata"
          fill="#2a2d31"
          fontSize="20"
          textAnchor="middle"
          x="200"
          y="202.5"
        >
          dqnamo
        </text>
      </g>

      {/* Shade dial. */}
      <g>
        {Array.from({ length: SHADES }, (_, index) => {
          const angle = (dialAngleFor(index + 1) * Math.PI) / 180;
          const radius = DIAL.r + 10;

          return (
            <text
              fill={palette.ink}
              fontFamily="var(--font-jetbrains-mono, monospace)"
              fontSize="7.5"
              fontWeight="600"
              key={angle}
              style={{ transition: fillTransition }}
              textAnchor="middle"
              x={roundPx(DIAL.x + Math.sin(angle) * radius)}
              y={roundPx(DIAL.y - Math.cos(angle) * radius + 2.6)}
            >
              {index + 1}
            </text>
          );
        })}
        <circle
          cx={DIAL.x}
          cy={DIAL.y + 2}
          fill="#000"
          opacity="0.25"
          r={DIAL.r + 1}
        />
        <circle cx={DIAL.x} cy={DIAL.y} fill={url("chrome")} r={DIAL.r} />
        <circle cx={DIAL.x} cy={DIAL.y} fill={url("bakelite")} r={DIAL.r - 3} />
        <g transform={`translate(${DIAL.x} ${DIAL.y})`}>
          <motion.g
            animate={{ rotate: dialAngle }}
            initial={false}
            transition={
              reduceMotion
                ? { duration: 0 }
                : { damping: 14, stiffness: 600, type: "spring" }
            }
          >
            {/* Keeps the turning group's box centred on the axle. */}
            <circle fill="none" r={DIAL.r - 3} />
            <rect
              fill="#f3ede4"
              height="8"
              rx="1.2"
              width="2.4"
              x={-1.2}
              y={-DIAL.r + 4}
            />
          </motion.g>
        </g>
      </g>

      {/* Lever track. */}
      <rect
        fill="#120d0b"
        height={LEVER_TRAVEL + 14}
        rx="4"
        width="9"
        x={LEVER_X - 4.5}
        y={LEVER_TOP - 7}
      />
      <rect
        fill="none"
        height={LEVER_TRAVEL + 13}
        rx="3.5"
        stroke="#fff"
        strokeOpacity="0.35"
        width="8"
        x={LEVER_X - 4}
        y={LEVER_TOP - 6.5}
      />

      {/* Lever handle, sticking out of the track. */}
      <g className={leverClassName}>
        <motion.g style={{ y: leverOffset }}>
          <rect
            fill="#000"
            filter={url("blur")}
            height="12"
            opacity="0.4"
            rx="6"
            width="38"
            x={LEVER_X - 19}
            y={LEVER_TOP + 4}
          />
          <rect
            fill={url("bakelite")}
            height="17"
            rx="7"
            width="44"
            x={LEVER_X - 22}
            y={LEVER_TOP - 8.5}
          />
          <rect
            fill="none"
            height="16"
            rx="6.5"
            stroke="#fff"
            strokeOpacity="0.18"
            width="43"
            x={LEVER_X - 21.5}
            y={LEVER_TOP - 8}
          />
          <rect
            fill="#fff"
            height="2"
            opacity="0.3"
            rx="1"
            width="30"
            x={LEVER_X - 15}
            y={LEVER_TOP - 6}
          />
        </motion.g>
      </g>

      {/* Stop button, lit while the toaster is on. */}
      <circle
        cx={STOP_BUTTON.x}
        cy={STOP_BUTTON.y + 1.5}
        fill="#000"
        opacity="0.25"
        r={STOP_BUTTON.r + 1.5}
      />
      <circle
        cx={STOP_BUTTON.x}
        cy={STOP_BUTTON.y}
        fill={url("chrome")}
        r={STOP_BUTTON.r + 1.5}
      />
      <circle
        cx={STOP_BUTTON.x}
        cy={STOP_BUTTON.y}
        fill={lit ? "#ff5b2e" : "#5a2a20"}
        r={STOP_BUTTON.r - 1.5}
        style={{
          filter: lit ? "drop-shadow(0 0 4px #ff6a2a)" : "none",
          transition: "fill 200ms ease, filter 200ms ease",
        }}
      />
      <circle
        cx={STOP_BUTTON.x - 2}
        cy={STOP_BUTTON.y - 2.5}
        fill="#fff"
        opacity="0.45"
        r="1.6"
      />

      {/* Smoke from toast that's gone too far. */}
      {smoking && !reduceMotion && (
        <motion.g style={{ opacity: smoke }}>
          {SLOT_CENTRES.map((centre) =>
            [0, 1, 2, 3].map((puff) => (
              <motion.circle
                animate={{
                  opacity: [0, 0.85, 0],
                  scale: [0.6, 1.9],
                  x: [0, (puff % 2 ? 14 : -12) + (centre % 5)],
                  y: [0, -150],
                }}
                cx={centre + (puff - 1.5) * 16}
                cy={SLOT_LIP_Y - 16}
                fill="#b4b0ac"
                filter={url("blur")}
                key={`${centre}${puff}`}
                r="13"
                transition={{
                  delay: puff * 0.55 + (centre % 3) * 0.2,
                  duration: 2.2,
                  ease: "easeOut",
                  repeat: Number.POSITIVE_INFINITY,
                }}
              />
            )),
          )}
        </motion.g>
      )}
    </svg>
  );
}

function dialAngleFor(shade: number) {
  return -120 + ((shade - 1) / (SHADES - 1)) * 240;
}

/** Two decimal places: stable between server and client. */
function roundPx(value: number) {
  return Math.round(value * 100) / 100;
}

/* -------------------------------------------------------------------------- */
/* Preview                                                                     */
/* -------------------------------------------------------------------------- */

const restingSlice = (doneness: number): SliceStyle => ({
  crumb: colorAt(doneness, CRUMB_COLORS),
  crust: colorAt(doneness, CRUST_COLORS),
  rim: doneness * 0.45,
  rotate: 0,
  stripes: doneness * 0.14,
  y: 0,
});

/** Pick the nearest colour stop; good enough for a still picture. */
function colorAt(doneness: number, colors: string[]) {
  let index = 0;

  for (let stop = 0; stop < DONENESS_STOPS.length; stop += 1) {
    if (doneness >= DONENESS_STOPS[stop]) {
      index = stop;
    }
  }

  return colors[index];
}

/**
 * A decorative toaster for thumbnails. Pass classes to move the lever, bread
 * and glow, e.g. on a parent's hover.
 */
export function ToasterFace({
  breadClassName,
  className,
  doneness = 0.42,
  finish = "cream",
  glowClassName,
  leverClassName,
}: {
  breadClassName?: string;
  className?: string;
  doneness?: number;
  finish?: ToasterFinish;
  glowClassName?: string;
  leverClassName?: string;
}) {
  const idPrefix = `toaster-face${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;

  return (
    <ToasterDrawing
      breadClassName={breadClassName}
      className={className}
      dialAngle={dialAngleFor(3)}
      glow={0}
      glowClassName={glowClassName}
      idPrefix={idPrefix}
      leverClassName={leverClassName}
      leverOffset={0}
      lit={false}
      palette={TOASTER_FINISHES[finish]}
      reduceMotion
      slices={[restingSlice(doneness), restingSlice(doneness * 0.9)]}
    />
  );
}

/* -------------------------------------------------------------------------- */
/* The toaster                                                                 */
/* -------------------------------------------------------------------------- */

type Phase = "ready" | "toasting" | "taking";

export type ToasterProps = {
  /** Browning, from 1 to 6. Higher shades toast for longer. */
  shade?: number;
  defaultShade?: number;
  onShadeChange?: (shade: number) => void;
  /** Called when the toast pops up, with how done it is and a description. */
  onPop?: (toast: { doneness: number; label: string }) => void;
  finish?: ToasterFinish;
  /** Play synthesised clicks, hum and the bell. */
  sound?: boolean;
  className?: string;
};

/** Hit areas over the drawing, in viewBox units. */
function areaStyle(x: number, y: number, width: number, height: number) {
  return {
    height: `${(height / VIEW_H) * 100}%`,
    left: `${((x - VIEW_X) / VIEW_W) * 100}%`,
    top: `${((y - VIEW_Y) / VIEW_H) * 100}%`,
    width: `${(width / VIEW_W) * 100}%`,
  };
}

/**
 * How far the lever actually moves for how far the hand has pushed it. It
 * follows freely, then the carriage spring stiffens as it nears the latch.
 */
function resist(raw: number) {
  if (raw < 0) {
    return -0.03 * (1 - Math.exp(raw / 0.03));
  }

  if (raw <= SPRING_ENGAGES_AT) {
    return raw;
  }

  const room = 0.95 - SPRING_ENGAGES_AT;
  return (
    SPRING_ENGAGES_AT + room * (1 - Math.exp(-(raw - SPRING_ENGAGES_AT) / room))
  );
}

const focusRing =
  "outline-none focus-visible:outline-2 focus-visible:outline-[#ff7a2a] focus-visible:outline-offset-2";

export function Toaster({
  className,
  defaultShade = 3,
  finish = "cream",
  onPop,
  onShadeChange,
  shade: controlledShade,
  sound = true,
}: ToasterProps) {
  const reduceMotion = useReducedMotion() ?? false;
  const idPrefix = `toaster${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const svgRef = useRef<HTMLDivElement>(null);

  const [uncontrolledShade, setUncontrolledShade] = useState(defaultShade);
  const shade = controlledShade ?? uncontrolledShade;
  const [phase, setPhase] = useState<Phase>("ready");
  const phaseRef = useRef<Phase>("ready");
  const [doneness, setDoneness] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [announcement, setAnnouncement] = useState("");
  const [smoking, setSmoking] = useState(false);

  const leverP = useMotionValue(0);
  const glow = useMotionValue(0);
  const breadOpacity = useMotionValue(1);
  const doneA = useMotionValue(0);
  const doneB = useMotionValue(0);
  const flyA = useMotionValue(0);
  const flyB = useMotionValue(0);
  const tiltA = useMotionValue(0);
  const tiltB = useMotionValue(0);

  const leverOffset = useTransform(leverP, (p) => p * LEVER_TRAVEL);
  const yA = useTransform(() => leverP.get() * BREAD_TRAVEL + flyA.get());
  const yB = useTransform(() => leverP.get() * BREAD_TRAVEL + flyB.get());
  const crumbA = useTransform(doneA, DONENESS_STOPS, CRUMB_COLORS);
  const crumbB = useTransform(doneB, DONENESS_STOPS, CRUMB_COLORS);
  const crustA = useTransform(doneA, DONENESS_STOPS, CRUST_COLORS);
  const crustB = useTransform(doneB, DONENESS_STOPS, CRUST_COLORS);
  const rimA = useTransform(doneA, [0, 1], [0, 0.45]);
  const rimB = useTransform(doneB, [0, 1], [0, 0.45]);
  const stripesA = useTransform(doneA, [0, 0.3, 1], [0, 0.08, 0.14]);
  const stripesB = useTransform(doneB, [0, 0.3, 1], [0, 0.08, 0.14]);
  const smoke = useTransform(() => {
    const level = Math.min(1, Math.max(0, (doneA.get() - 0.78) / 0.3));
    return level * Math.min(1, glow.get() * 1.4);
  });

  useMotionValueEvent(smoke, "change", (value) => setSmoking(value > 0.01));

  const soundRef = useRef(sound);
  soundRef.current = sound;
  const play = useCallback((name: Sound) => {
    if (soundRef.current) {
      playSound(name);
    }
  }, []);

  const toastingRef = useRef<{
    controls: AnimationPlaybackControls[];
    endsAt: number;
    stopHeat: () => void;
    timer: number;
  } | null>(null);

  const setPhaseBoth = useCallback((next: Phase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  const changeShade = useCallback(
    (next: number, wrap = false) => {
      let target = next;

      if (wrap) {
        target = ((next - 1 + SHADES) % SHADES) + 1;
      } else {
        target = Math.min(SHADES, Math.max(1, next));
      }

      if (target === shade) {
        return;
      }

      play("detent");
      buzz(4);

      if (controlledShade === undefined) {
        setUncontrolledShade(target);
      }

      onShadeChange?.(target);
    },
    [controlledShade, onShadeChange, play, shade],
  );

  /* ------------------------------ Popping up ----------------------------- */

  const popUp = useCallback(
    (reason: "timer" | "stop") => {
      const toasting = toastingRef.current;

      if (!toasting) {
        return;
      }

      window.clearTimeout(toasting.timer);
      for (const control of toasting.controls) {
        control.stop();
      }
      toasting.stopHeat();
      toastingRef.current = null;
      setPhaseBoth("ready");

      if (reason === "timer") {
        play("pop");
      } else {
        play("stop");
        window.setTimeout(() => play("release"), 40);
      }

      buzz([18, 30, 8]);
      animate(glow, 0, { duration: reduceMotion ? 0.3 : 2.4, ease: "easeOut" });

      if (reduceMotion) {
        animate(leverP, 0, { duration: 0.15 });
      } else {
        animate(leverP, 0, { damping: 24, stiffness: 900, type: "spring" });

        // The carriage stops at the top; the toast keeps going, then lands.
        const launch = reason === "timer" ? 1 : 0.55;
        const fly = (
          value: MotionValue<number>,
          tilt: MotionValue<number>,
          height: number,
          lean: number,
          delay: number,
        ) => {
          animate(value, -height * launch, {
            delay,
            duration: 0.24,
            ease: [0.15, 0.75, 0.35, 1],
          }).then(() => {
            animate(value, 0, {
              damping: 13,
              stiffness: 360,
              type: "spring",
              velocity: 240,
            });
          });
          animate(tilt, [0, lean, -lean * 0.4, 0], {
            delay,
            duration: 0.9,
            ease: "easeOut",
          });
        };

        fly(flyA, tiltA, 50, -4, 0);
        fly(flyB, tiltB, 42, 3, 0.045);
      }

      const final = doneA.get();
      const label = toastLabel(final);
      setDoneness(final);
      setAnnouncement(`Toast popped up. ${label}.`);
      onPop?.({ doneness: final, label });
    },
    [
      doneA,
      flyA,
      flyB,
      glow,
      leverP,
      onPop,
      play,
      reduceMotion,
      setPhaseBoth,
      tiltA,
      tiltB,
    ],
  );

  /* ------------------------------- Latching ------------------------------ */

  const latch = useCallback(() => {
    if (phaseRef.current !== "ready") {
      return;
    }

    setPhaseBoth("toasting");
    play("latch");
    buzz(12);

    if (reduceMotion) {
      leverP.set(LATCHED_AT);
    } else {
      animate(leverP, [leverP.get(), 1, LATCHED_AT], {
        duration: 0.22,
        ease: ["easeIn", "easeOut"],
        times: [0, 0.35, 1],
      });
    }

    const seconds = toastingSeconds(shade);
    const gain = shade * DONENESS_PER_SHADE;
    const heatCurve = [0.45, 0, 0.7, 1] as const;
    const controls = [
      animate(glow, 1, { duration: reduceMotion ? 0.2 : 1.1, ease: "easeIn" }),
      animate(doneA, doneA.get() + gain, {
        duration: seconds,
        ease: heatCurve,
      }),
      animate(doneB, doneB.get() + gain * SECOND_SLICE_RATE, {
        duration: seconds,
        ease: heatCurve,
      }),
    ];

    toastingRef.current = {
      controls,
      endsAt: Date.now() + seconds * 1000,
      stopHeat: soundRef.current ? startHeatSound() : () => {},
      timer: window.setTimeout(() => popUp("timer"), seconds * 1000),
    };
    setSecondsLeft(Math.ceil(seconds));
    setAnnouncement(`Toasting at shade ${shade}.`);
  }, [
    doneA,
    doneB,
    glow,
    leverP,
    play,
    popUp,
    reduceMotion,
    setPhaseBoth,
    shade,
  ]);

  /** Push the lever all the way down in one go, for taps and keys. */
  const pushDown = useCallback(() => {
    if (phaseRef.current !== "ready") {
      return;
    }

    if (reduceMotion) {
      latch();
      return;
    }

    animate(leverP, 1, { duration: 0.26, ease: [0.5, 0, 0.9, 0.6] }).then(
      () => {
        if (phaseRef.current === "ready") {
          latch();
        }
      },
    );
  }, [latch, leverP, reduceMotion]);

  // Count down the seconds while toasting.
  useEffect(() => {
    if (phase !== "toasting") {
      return;
    }

    const interval = window.setInterval(() => {
      const toasting = toastingRef.current;

      if (toasting) {
        setSecondsLeft(
          Math.max(0, Math.ceil((toasting.endsAt - Date.now()) / 1000)),
        );
      }
    }, 200);

    return () => window.clearInterval(interval);
  }, [phase]);

  // Don't leave the elements on if the toaster goes away.
  useEffect(
    () => () => {
      const toasting = toastingRef.current;

      if (toasting) {
        window.clearTimeout(toasting.timer);
        toasting.stopHeat();
      }
    },
    [],
  );

  /* ---------------------------- Taking the toast ------------------------- */

  const takeToast = useCallback(async () => {
    if (phaseRef.current !== "ready") {
      return;
    }

    setPhaseBoth("taking");
    play("take");

    if (reduceMotion) {
      await animate(breadOpacity, 0, { duration: 0.2 });
    } else {
      await Promise.all([
        animate(flyA, -190, { duration: 0.42, ease: [0.5, 0, 0.8, 0.4] }),
        animate(flyB, -190, {
          delay: 0.06,
          duration: 0.42,
          ease: [0.5, 0, 0.8, 0.4],
        }),
        animate(tiltA, -6, { duration: 0.42 }),
        animate(tiltB, 5, { delay: 0.06, duration: 0.42 }),
        animate(breadOpacity, 0, { delay: 0.18, duration: 0.3 }),
      ]);
    }

    doneA.set(0);
    doneB.set(0);
    tiltA.set(0);
    tiltB.set(0);
    setDoneness(0);

    if (reduceMotion) {
      flyA.set(0);
      flyB.set(0);
      await animate(breadOpacity, 1, { duration: 0.2 });
    } else {
      // Fresh slices are dropped in from above and settle on the carriage.
      flyA.set(-150);
      flyB.set(-150);
      animate(breadOpacity, 1, { duration: 0.16 });
      window.setTimeout(() => play("drop"), 170);
      await Promise.all([
        animate(flyA, 0, {
          damping: 15,
          stiffness: 260,
          type: "spring",
          velocity: 500,
        }),
        animate(flyB, 0, {
          damping: 15,
          delay: 0.07,
          stiffness: 260,
          type: "spring",
          velocity: 500,
        }),
      ]);
    }

    setPhaseBoth("ready");
    setAnnouncement("Two fresh slices in.");
  }, [
    breadOpacity,
    doneA,
    doneB,
    flyA,
    flyB,
    play,
    reduceMotion,
    setPhaseBoth,
    tiltA,
    tiltB,
  ]);

  /* ------------------------------ The lever ------------------------------ */

  const dragRef = useRef<{
    engaged: boolean;
    moved: boolean;
    pointerId: number;
    scale: number;
    startP: number;
    startY: number;
  } | null>(null);

  function handleLeverPointerDown(event: PointerEvent<HTMLButtonElement>) {
    if (event.button !== 0 || phaseRef.current === "taking") {
      return;
    }

    event.preventDefault();
    getAudioContext();
    event.currentTarget.setPointerCapture(event.pointerId);
    event.currentTarget.focus({ preventScroll: true });

    const bounds = svgRef.current?.getBoundingClientRect();
    leverP.stop();
    dragRef.current = {
      engaged: leverP.get() > SPRING_ENGAGES_AT,
      moved: false,
      pointerId: event.pointerId,
      scale: bounds ? bounds.height / VIEW_H : 1,
      startP: leverP.get(),
      startY: event.clientY,
    };
  }

  function handleLeverPointerMove(event: PointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current;

    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    const travelled = (event.clientY - drag.startY) / drag.scale;

    if (Math.abs(travelled) > 3) {
      drag.moved = true;
    }

    // While toasting, lifting the lever pops it early.
    if (phaseRef.current === "toasting") {
      if (travelled < -10) {
        dragRef.current = null;
        popUp("stop");
      }

      return;
    }

    if (phaseRef.current !== "ready") {
      return;
    }

    const raw = drag.startP + travelled / LEVER_TRAVEL;

    if (raw >= LATCH_PUSH) {
      dragRef.current = null;
      latch();
      return;
    }

    if (!drag.engaged && raw > SPRING_ENGAGES_AT) {
      drag.engaged = true;
      play("detent");
    } else if (drag.engaged && raw < SPRING_ENGAGES_AT - 0.05) {
      drag.engaged = false;
    }

    leverP.set(resist(raw));
  }

  function handleLeverPointerUp(event: PointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current;

    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    dragRef.current = null;

    if (phaseRef.current !== "ready") {
      return;
    }

    if (!drag.moved) {
      pushDown();
      return;
    }

    // Let go before it caught: the spring throws the carriage back up.
    if (leverP.get() > 0.05) {
      const from = leverP.get();
      play("release");
      animate(
        leverP,
        0,
        reduceMotion
          ? { duration: 0.12 }
          : { damping: 20, stiffness: 520 + from * 300, type: "spring" },
      );
    } else {
      animate(leverP, 0, { duration: 0.12 });
    }
  }

  function handleLeverClick(event: MouseEvent<HTMLButtonElement>) {
    // Pointer presses are handled above; this is for Enter and Space.
    if (event.detail !== 0) {
      return;
    }

    if (phaseRef.current === "toasting") {
      popUp("stop");
    } else {
      pushDown();
    }
  }

  function handleLeverKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      pushDown();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      popUp("stop");
    }
  }

  function handleDialKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const moves: Record<string, number> = {
      ArrowDown: shade - 1,
      ArrowLeft: shade - 1,
      ArrowRight: shade + 1,
      ArrowUp: shade + 1,
      End: SHADES,
      Home: 1,
    };
    const next = moves[event.key];

    if (next !== undefined) {
      event.preventDefault();
      changeShade(next);
    }
  }

  const toasting = phase === "toasting";
  const canTake = phase === "ready" && doneness >= 0.06;
  const label = toastLabel(doneness);

  return (
    <div className={cn("flex w-full flex-col items-center gap-5", className)}>
      <div className="relative w-full" ref={svgRef}>
        <ToasterDrawing
          breadOpacity={breadOpacity}
          dialAngle={dialAngleFor(shade)}
          glow={glow}
          idPrefix={idPrefix}
          leverOffset={leverOffset}
          lit={toasting}
          palette={TOASTER_FINISHES[finish]}
          reduceMotion={reduceMotion}
          slices={[
            {
              crumb: crumbA,
              crust: crustA,
              rim: rimA,
              rotate: tiltA,
              stripes: stripesA,
              y: yA,
            },
            {
              crumb: crumbB,
              crust: crustB,
              rim: rimB,
              rotate: tiltB,
              stripes: stripesB,
              y: yB,
            },
          ]}
          smoke={smoke}
          smoking={smoking}
        />

        {canTake && (
          <button
            aria-label={`Take the toast out. It's ${label.toLowerCase()}.`}
            className={cn(
              "absolute cursor-pointer rounded-xl bg-transparent",
              focusRing,
            )}
            onClick={() => void takeToast()}
            style={areaStyle(78, 40, 244, 74)}
            title="Take the toast"
            type="button"
          />
        )}

        <button
          aria-label={
            toasting ? "Lift the lever to stop toasting" : "Push the lever down"
          }
          className={cn(
            "absolute touch-none select-none rounded-lg bg-transparent",
            toasting ? "cursor-n-resize" : "cursor-grab active:cursor-grabbing",
            focusRing,
          )}
          disabled={phase === "taking"}
          onClick={handleLeverClick}
          onKeyDown={handleLeverKeyDown}
          onLostPointerCapture={handleLeverPointerUp}
          onPointerCancel={handleLeverPointerUp}
          onPointerDown={handleLeverPointerDown}
          onPointerMove={handleLeverPointerMove}
          onPointerUp={handleLeverPointerUp}
          style={areaStyle(LEVER_X - 28, LEVER_TOP - 16, 56, LEVER_TRAVEL + 32)}
          type="button"
        />

        <button
          aria-label="Stop toasting"
          className={cn(
            "absolute rounded-full bg-transparent disabled:cursor-default",
            toasting && "cursor-pointer",
            focusRing,
          )}
          disabled={!toasting}
          onClick={() => popUp("stop")}
          style={areaStyle(
            STOP_BUTTON.x - 13,
            STOP_BUTTON.y - 12,
            26,
            STOP_BUTTON.r * 2 + 8,
          )}
          type="button"
        />

        <div
          aria-label="Shade"
          aria-valuemax={SHADES}
          aria-valuemin={1}
          aria-valuenow={shade}
          aria-valuetext={`Shade ${shade} of ${SHADES}`}
          className={cn(
            "absolute cursor-pointer select-none rounded-full",
            focusRing,
          )}
          onClick={() => changeShade(shade + 1, true)}
          onKeyDown={handleDialKeyDown}
          role="slider"
          style={areaStyle(DIAL.x - 28, DIAL.y - 28, 56, 56)}
          tabIndex={0}
          title="Turn the shade dial"
        />
      </div>

      <div className="flex items-start gap-8">
        <div className="flex flex-col items-center gap-0.5">
          <span className="font-medium font-mono text-[9px] text-grayscale-10 uppercase tracking-[0.06em]">
            Shade
          </span>
          <span className="font-medium font-mono text-grayscale-12 text-xs tabular-nums">
            <NumberFlow value={shade} />
          </span>
        </div>
        <div className="flex min-w-28 flex-col items-center gap-0.5">
          <span className="font-medium font-mono text-[9px] text-grayscale-10 uppercase tracking-[0.06em]">
            {toasting ? "Pops in" : "Toast"}
          </span>
          <span className="font-medium font-mono text-grayscale-12 text-xs tabular-nums">
            {toasting ? <NumberFlow suffix="s" value={secondsLeft} /> : label}
          </span>
        </div>
      </div>

      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
