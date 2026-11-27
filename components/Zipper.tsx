"use client";

import { useReducedMotion } from "motion/react";
import {
  type CSSProperties,
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

/* -------------------------------------------------------------------------- */
/* Geometry                                                                    */
/* -------------------------------------------------------------------------- */

// Everything is drawn in a 300 × 400 box and scaled to fit.
const VIEW_W = 300;
const VIEW_H = 400;
const CX = VIEW_W / 2;
const RADIUS = 28;

/** Where the teeth start and end. */
const Y_TOP = 12;
const Y_BOTTOM = 382;
/** Distance between two teeth on the same side. */
const PITCH = 8;
/** Half the width of the chain, from the centre to the tape's edge. */
const EDGE = 5;
/** How far a tooth reaches past the centre to hook into the other side. */
const REACH = 3;
const TOOTH_W = EDGE + REACH;
const TOOTH_H = 3.9;
const TAPE = 10;
/** Length of the slider's Y-shaped channel, where the teeth unhook. */
const CHANNEL = 24;
/** How far apart each side moves to clear the other's teeth. */
const SEPARATION = REACH + 2;
/** The slider's travel: its mesh point, from the top stop to the bottom stop. */
const S_MIN = Y_TOP + 27;
const S_MAX = Y_BOTTOM - 6;
const TRAVEL = S_MAX - S_MIN;
/** The widest the fabric will open at the top, either side of the centre. */
const MAX_SPLAY = 86;
/** Where the pull tab hangs from, above the mesh point. */
const PIVOT_Y = -17;

const TEETH = Array.from(
  { length: Math.floor((Y_BOTTOM - 4 - (Y_TOP + 2)) / PITCH) + 1 },
  (_, index) => Y_TOP + 2 + index * PITCH,
);
const EDGE_SAMPLES = Array.from(
  { length: Math.ceil((VIEW_H + 12) / 3) + 1 },
  (_, index) => -6 + index * 3,
);

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

function smoothstep(t: number) {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
}

function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

/** How far the fabric wants to splay open for a slider at `s`. */
function splayFor(s: number) {
  return MAX_SPLAY * (1 - Math.exp(-((s - S_MIN) * 0.55) / MAX_SPLAY));
}

function sliderFor(progress: number) {
  return S_MIN + clamp(progress, 0, 1) * TRAVEL;
}

/**
 * How far one side of the chain sits from where it would be if it were zipped,
 * at height `y`. Below the slider the teeth are hooked together. Inside the
 * slider they part just enough to clear each other, and above it the fabric
 * falls open in a V.
 */
function offsetAt(y: number, s: number, splay: number) {
  const d = s - y;

  if (d <= 0) {
    return 0;
  }

  const separation = SEPARATION * smoothstep(d / CHANNEL);
  const u = clamp((d - CHANNEL * 0.5) / Math.max(1, s - CHANNEL * 0.5), 0, 1);

  return separation + splay * u ** 1.25;
}

type Point = readonly [number, number];

function edgePoints(s: number, splay: number, side: -1 | 1): Point[] {
  return EDGE_SAMPLES.map((y) => [
    CX + side * (EDGE + offsetAt(y, s, splay)),
    y,
  ]);
}

function polyline(points: Point[], dx = 0, dy = 0) {
  return points
    .map(
      ([x, y], index) =>
        `${index === 0 ? "M" : "L"}${(x + dx).toFixed(2)} ${(y + dy).toFixed(2)}`,
    )
    .join("");
}

function panelPath(points: Point[], side: -1 | 1) {
  const outer = side === -1 ? 0 : VIEW_W;
  return `M${outer} -6${polyline(points).replace("M", "L")}L${outer} ${VIEW_H + 6}Z`;
}

function tapePath(points: Point[], side: -1 | 1) {
  const back = [...points]
    .reverse()
    .map(([x, y]) => `L${(x + side * TAPE).toFixed(2)} ${y.toFixed(2)}`)
    .join("");
  return `${polyline(points)}${back}Z`;
}

function toothTransform(y: number, s: number, splay: number, side: -1 | 1) {
  const offset = offsetAt(y, s, splay);
  const slope = (offsetAt(y + 1, s, splay) - offsetAt(y - 1, s, splay)) / 2;
  const angle = (Math.atan(slope) * 180) / Math.PI;
  const x = CX + side * (EDGE + offset);
  const mirror = side === 1 ? " scale(-1 1)" : "";

  return `translate(${x.toFixed(2)} ${y.toFixed(2)})${mirror} rotate(${angle.toFixed(2)})`;
}

/* -------------------------------------------------------------------------- */
/* Colourways                                                                  */
/* -------------------------------------------------------------------------- */

export type ZipperColorway = "canvas" | "denim" | "nylon";

type Palette = {
  fabric: string;
  tape: string;
  stitch: string;
  /** Teeth, light to dark. */
  teeth: readonly [string, string, string];
  /** Slider and pull, light to dark. */
  metal: readonly [string, string, string, string];
  lining: string;
  liningPattern: string;
  /** Brass and copper ring. Moulded plastic teeth knock. */
  tick: { frequency: number; q: number };
};

export const zipperColorways: Record<ZipperColorway, Palette> = {
  canvas: {
    fabric: "#d6c9ad",
    tape: "#b3a37c",
    stitch: "#f3ead4",
    teeth: ["#fbe3a0", "#cf9e45", "#8a5e1c"],
    metal: ["#fff0c2", "#dcb062", "#a2772c", "#5f3f10"],
    lining: "#9b3a2d",
    liningPattern:
      "repeating-linear-gradient(135deg, rgb(255 255 255 / 5%) 0 6px, transparent 6px 12px)",
    tick: { frequency: 4300, q: 1.3 },
  },
  denim: {
    fabric: "#435c83",
    tape: "#2b3c5a",
    stitch: "#dc9b48",
    teeth: ["#ffd3ad", "#c27744", "#7f4220"],
    metal: ["#ffe1c6", "#cf8b58", "#93532a", "#55290f"],
    lining: "#ebe2cd",
    liningPattern:
      "repeating-linear-gradient(90deg, rgb(52 72 110 / 22%) 0 1.5px, transparent 1.5px 9px, rgb(52 72 110 / 10%) 9px 10px, transparent 10px 18px)",
    tick: { frequency: 3700, q: 1.2 },
  },
  nylon: {
    fabric: "#2e2f33",
    tape: "#1b1c1f",
    stitch: "#55575e",
    teeth: ["#696c73", "#3c3e43", "#1f2023"],
    metal: ["#e3e5ea", "#9a9ea7", "#5a5d64", "#2b2d31"],
    lining: "#ec6733",
    liningPattern:
      "repeating-linear-gradient(45deg, rgb(0 0 0 / 9%) 0 1px, transparent 1px 14px), repeating-linear-gradient(-45deg, rgb(0 0 0 / 9%) 0 1px, transparent 1px 14px)",
    tick: { frequency: 2300, q: 0.8 },
  },
};

/* -------------------------------------------------------------------------- */
/* Sound                                                                       */
/* -------------------------------------------------------------------------- */

let sharedAudioContext: AudioContext | null = null;
let tickBuffer: AudioBuffer | null = null;
let clackBuffer: AudioBuffer | null = null;
let lastTickAt = 0;
let lastClackAt = 0;

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

function createNoiseBuffer(
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

/**
 * One tooth passing through the slider. Pulled slowly they tick one by one;
 * pulled fast the ticks run together into a zzzip.
 */
function playTick(palette: Palette, speed: number, closing: boolean) {
  const context = getAudioContext();

  if (!context) {
    return;
  }

  const now = context.currentTime;

  if (now - lastTickAt < 0.011) {
    return;
  }

  lastTickAt = now;
  tickBuffer ??= createNoiseBuffer(context, 0.014, 0.0011);

  const source = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const gain = context.createGain();
  const pace = clamp(speed / 900, 0, 1);

  source.buffer = tickBuffer;
  source.playbackRate.value = 0.85 + Math.random() * 0.3 + (closing ? 0.12 : 0);
  filter.type = "bandpass";
  filter.frequency.value = palette.tick.frequency * (0.92 + pace * 0.25);
  filter.Q.value = palette.tick.q;
  gain.gain.value = 0.22 + pace * 0.38;

  source.connect(filter).connect(gain).connect(context.destination);
  source.start(now);
}

/** The slider knocking against a stop, or the pull dropping back onto it. */
function playClack(strength: number) {
  const context = getAudioContext();

  if (!context) {
    return;
  }

  const now = context.currentTime;

  if (now - lastClackAt < 0.12) {
    return;
  }

  lastClackAt = now;
  clackBuffer ??= createNoiseBuffer(context, 0.05, 0.005);

  const source = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const gain = context.createGain();

  source.buffer = clackBuffer;
  source.playbackRate.value = 0.9 + Math.random() * 0.15;
  filter.type = "bandpass";
  filter.frequency.value = 1500;
  filter.Q.value = 1.1;
  gain.gain.value = 0.25 + clamp(strength, 0, 1) * 0.6;

  source.connect(filter).connect(gain).connect(context.destination);
  source.start(now);
}

function buzz(duration: number) {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    navigator.vibrate?.(duration);
  }
}

/* -------------------------------------------------------------------------- */
/* Drawing                                                                     */
/* -------------------------------------------------------------------------- */

type SceneState = {
  /** The slider's mesh point, in view units. */
  s: number;
  /** How far the top of the opening has splayed, either side of the centre. */
  splay: number;
  /** The pull tab's swing, in degrees. */
  swing: number;
  /** 0 when the pull lies on the slider, 1 when it's held up off it. */
  lift: number;
};

const SLIDER_BODY =
  "M-12.5 -27Q-15 -27 -14.6 -24.4L-7.2 1.6Q-6.4 4 -3.6 4L3.6 4Q6.4 4 7.2 1.6L14.6 -24.4Q15 -27 12.5 -27Z";
const PULL_TAB =
  "M-5 -3Q-5 -6.5 -1.8 -6.5L1.8 -6.5Q5 -6.5 5 -3L8.2 38Q8.6 46.5 0 46.5Q-8.6 46.5 -8.2 38ZM-2.7 30.4A2.7 2.7 0 0 1 2.7 30.4L2.7 35.6A2.7 2.7 0 0 1 -2.7 35.6Z";

function ZipperScene({
  palette,
  state,
  uid,
}: {
  palette: Palette;
  state: SceneState;
  uid: string;
}) {
  const { s, splay, swing, lift } = state;
  const left = edgePoints(s, splay, -1);
  const right = edgePoints(s, splay, 1);
  const openness = clamp(splay / 30, 0, 1);
  const tabScale = 1 + lift * 0.06;
  const shadowX = 1.2 + lift * 2.4;
  const shadowY = 2.2 + lift * 4.6;
  const scoped = (scope: string, name: string) => `${uid}-${scope}-${name}`;
  const url = (name: string) => `url(#${scoped("f", name)})`;
  const hardwareUrl = (name: string) => `url(#${scoped("h", name)})`;
  const renderDefs = (scope: string) => (
    <defs>
      {/* Diagonal twill, drawn into the tile rather than rotating the pattern. */}
      <pattern
        height="5"
        id={scoped(scope, "twill")}
        patternUnits="userSpaceOnUse"
        width="5"
      >
        <path
          d="M-1 1L1 -1M0 5L5 0M4 6L6 4"
          stroke="rgb(255 255 255 / 7%)"
          strokeWidth="1.2"
        />
        <path
          d="M-1 3.5L3.5 -1M1.5 6L6 1.5"
          stroke="rgb(0 0 0 / 7%)"
          strokeWidth="0.9"
        />
      </pattern>
      <linearGradient id={scoped(scope, "sheen")} x1="0" x2="1" y1="0" y2="1">
        <stop offset="0" stopColor="#fff" stopOpacity="0.14" />
        <stop offset="0.5" stopColor="#fff" stopOpacity="0" />
        <stop offset="1" stopColor="#000" stopOpacity="0.16" />
      </linearGradient>
      <linearGradient id={scoped(scope, "tooth")} x1="0" x2="0" y1="0" y2="1">
        <stop offset="0" stopColor={palette.teeth[0]} />
        <stop offset="0.45" stopColor={palette.teeth[1]} />
        <stop offset="1" stopColor={palette.teeth[2]} />
      </linearGradient>
      <linearGradient
        id={scoped(scope, "metal")}
        x1="0"
        x2="1"
        y1="0"
        y2="0.25"
      >
        <stop offset="0" stopColor={palette.metal[2]} />
        <stop offset="0.3" stopColor={palette.metal[0]} />
        <stop offset="0.62" stopColor={palette.metal[1]} />
        <stop offset="1" stopColor={palette.metal[3]} />
      </linearGradient>
      <linearGradient id={scoped(scope, "pull")} x1="0" x2="1" y1="0" y2="0.6">
        <stop offset="0" stopColor={palette.metal[0]} />
        <stop offset="0.5" stopColor={palette.metal[1]} />
        <stop offset="1" stopColor={palette.metal[2]} />
      </linearGradient>
      <filter
        height="200%"
        id={scoped(scope, "soft")}
        width="200%"
        x="-50%"
        y="-50%"
      >
        <feGaussianBlur stdDeviation="1.4" />
      </filter>
      <filter
        height="140%"
        id={scoped(scope, "fold")}
        width="200%"
        x="-50%"
        y="-20%"
      >
        <feGaussianBlur stdDeviation="3.2" />
      </filter>
    </defs>
  );

  return (
    <>
      <div
        className="pointer-events-none absolute inset-0 overflow-hidden"
        style={{ borderRadius: pouchRadius }}
      >
        <svg
          aria-hidden="true"
          className="absolute inset-0 size-full"
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        >
          {renderDefs("f")}
          {/* Shadows the open fabric casts into the pouch. */}
          <g filter={url("fold")} opacity={0.2 + openness * 0.4}>
            <path
              d={polyline(left, 2, 3)}
              fill="none"
              stroke="#000"
              strokeWidth="7"
            />
            <path
              d={polyline(right, -2, 3)}
              fill="none"
              stroke="#000"
              strokeWidth="7"
            />
          </g>

          {/* Where the chain is zipped, nothing of the inside shows through. */}
          <rect
            fill={palette.tape}
            height={VIEW_H - s + 6}
            width={EDGE * 2}
            x={CX - EDGE}
            y={s}
          />

          <g pointerEvents="visiblePainted">
            {([-1, 1] as const).map((side) => {
              const points = side === -1 ? left : right;

              return (
                <g key={side}>
                  <path d={panelPath(points, side)} fill={palette.fabric} />
                  <path d={panelPath(points, side)} fill={url("twill")} />
                  <path d={panelPath(points, side)} fill={url("sheen")} />
                  {/* The fabric bunches up a little as it's pulled apart. */}
                  <path
                    d={polyline(points, side * (TAPE + 9), 0)}
                    fill="none"
                    filter={url("fold")}
                    opacity={openness * 0.22}
                    stroke="#000"
                    strokeWidth="9"
                  />
                  <path d={tapePath(points, side)} fill={palette.tape} />
                  <path d={tapePath(points, side)} fill={url("twill")} />
                  <path
                    d={polyline(points, side * (TAPE + 3.2), 0)}
                    fill="none"
                    stroke={palette.stitch}
                    strokeDasharray="4 3"
                    strokeLinecap="round"
                    strokeWidth="1.1"
                  />
                  <path
                    d={polyline(points, side * (TAPE + 0.4), 0)}
                    fill="none"
                    opacity="0.35"
                    stroke="#000"
                    strokeWidth="0.8"
                  />
                </g>
              );
            })}
          </g>

          {/* Teeth. */}
          {([-1, 1] as const).map((side) => (
            <g key={side}>
              {TEETH.map((y) => {
                const toothY = side === 1 ? y + PITCH / 2 : y;

                return (
                  <g
                    key={toothY}
                    transform={toothTransform(toothY, s, splay, side)}
                  >
                    <rect
                      fill={url("tooth")}
                      height={TOOTH_H}
                      rx="1.3"
                      stroke={palette.teeth[2]}
                      strokeOpacity="0.6"
                      strokeWidth="0.35"
                      width={TOOTH_W + 2}
                      x={-2}
                      y={-TOOTH_H / 2}
                    />
                    <rect
                      fill="#fff"
                      height="0.7"
                      opacity="0.35"
                      rx="0.35"
                      width={TOOTH_W - 2.5}
                      x={0.5}
                      y={-TOOTH_H / 2 + 0.6}
                    />
                  </g>
                );
              })}
            </g>
          ))}

          {/* Top stops, one on each tape. */}
          {([-1, 1] as const).map((side) => {
            const x = CX + side * (EDGE + offsetAt(Y_TOP - 4, s, splay));

            return (
              <rect
                fill={url("metal")}
                height="5"
                key={side}
                rx="1.2"
                width="7"
                x={side === -1 ? x - 2 : x - 5}
                y={Y_TOP - 7}
              />
            );
          })}

          {/* Bottom stop. */}
          <rect
            fill={url("metal")}
            height="7"
            rx="1.6"
            stroke={palette.metal[3]}
            strokeOpacity="0.4"
            strokeWidth="0.5"
            width="17"
            x={CX - 8.5}
            y={Y_BOTTOM - 2}
          />
        </svg>
      </div>
      <svg
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 size-full overflow-visible"
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      >
        {renderDefs("h")}
        {/* The slider and its pull hang over the edge of the pouch if they must. */}
        <g transform={`translate(${CX} ${s})`}>
          <path
            d={SLIDER_BODY}
            fill="#000"
            filter={hardwareUrl("soft")}
            opacity="0.45"
            transform="translate(1 2.6)"
          />
          <path d={SLIDER_BODY} fill={hardwareUrl("metal")} />
          <path
            d="M-12.4 -25.6L12.4 -25.6"
            stroke="#fff"
            strokeLinecap="round"
            strokeOpacity="0.55"
            strokeWidth="0.9"
          />
          <path
            d="M0 -23L0 1"
            stroke={palette.metal[3]}
            strokeOpacity="0.28"
            strokeWidth="1.2"
          />
          {/* The lug the pull hangs from. */}
          <rect
            fill={hardwareUrl("pull")}
            height="13"
            rx="3"
            stroke={palette.metal[3]}
            strokeOpacity="0.45"
            strokeWidth="0.5"
            width="9"
            x="-4.5"
            y={PIVOT_Y - 6}
          />

          <g transform={`translate(0 ${PIVOT_Y}) rotate(${swing.toFixed(2)})`}>
            <path
              d={PULL_TAB}
              fill="#000"
              fillRule="evenodd"
              filter={hardwareUrl("soft")}
              opacity={0.42 - lift * 0.12}
              transform={`translate(${shadowX} ${shadowY}) scale(${tabScale})`}
            />
            <g transform={`scale(${tabScale})`}>
              <path
                d={PULL_TAB}
                fill={hardwareUrl("pull")}
                fillRule="evenodd"
                stroke={palette.metal[3]}
                strokeOpacity="0.5"
                strokeWidth="0.6"
              />
              <path
                d="M-3.4 2L-5.2 26M3.4 2L5.2 26"
                stroke="#fff"
                strokeLinecap="round"
                strokeOpacity="0.3"
                strokeWidth="0.8"
              />
              <path
                d="M0 5L0 24"
                stroke={palette.metal[3]}
                strokeLinecap="round"
                strokeOpacity="0.35"
                strokeWidth="1.6"
              />
            </g>
            <circle
              fill={palette.metal[1]}
              r="2.4"
              stroke={palette.metal[3]}
              strokeOpacity="0.6"
              strokeWidth="0.5"
            />
          </g>
        </g>
      </svg>
    </>
  );
}

function sanitizeId(id: string) {
  return `zip${id.replace(/[^a-zA-Z0-9_-]/g, "")}`;
}

const pouchRadius = `${(RADIUS / VIEW_W) * 100}% / ${(RADIUS / VIEW_H) * 100}%`;

function Lining({
  children,
  hidden,
  palette,
}: {
  children?: ReactNode;
  hidden: boolean;
  palette: Palette;
}) {
  return (
    <div
      className="absolute inset-0 overflow-hidden shadow-[0_1px_2px_rgb(0_0_0_/_12%),0_12px_32px_-8px_rgb(0_0_0_/_28%)]"
      inert={hidden || undefined}
      style={{
        backgroundColor: palette.lining,
        backgroundImage: palette.liningPattern,
        borderRadius: pouchRadius,
      }}
    >
      <div className="absolute inset-0">{children}</div>
      {/* The inside of a pouch is darker towards its mouth. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 shadow-[inset_0_22px_28px_-14px_rgb(0_0_0_/_55%),inset_0_0_40px_rgb(0_0_0_/_22%)]"
        style={{ borderRadius: pouchRadius }}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Static face, for thumbnails                                                 */
/* -------------------------------------------------------------------------- */

export type ZipperFaceProps = {
  /** 0 is zipped shut, 1 is open all the way. */
  progress: number;
  colorway?: ZipperColorway;
  /** What's inside the pouch. */
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
};

export function ZipperFace({
  children,
  className,
  colorway = "canvas",
  progress,
  style,
}: ZipperFaceProps) {
  const uid = sanitizeId(useId());
  const palette = zipperColorways[colorway];
  const s = sliderFor(progress);

  return (
    <div
      aria-hidden="true"
      className={cn("relative aspect-[3/4] w-[300px]", className)}
      style={style}
    >
      <Lining hidden palette={palette}>
        {children}
      </Lining>
      <ZipperScene
        palette={palette}
        state={{ lift: 0, s, splay: splayFor(s), swing: 0 }}
        uid={uid}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Interactive zipper                                                          */
/* -------------------------------------------------------------------------- */

export type ZipperProps = {
  /** Accessible name for the pull, e.g. "Pencil case zip". */
  label?: string;
  colorway?: ZipperColorway;
  /** Where the slider starts, from 0 (shut) to 1 (open). */
  defaultProgress?: number;
  /** Called with a whole percentage whenever it changes. */
  onProgressChange?: (percent: number) => void;
  /** Play a tick for every tooth and a clack at the stops. */
  sound?: boolean;
  /** What's inside the pouch, revealed as it opens. */
  children?: ReactNode;
  className?: string;
};

type Sim = SceneState & {
  velocity: number;
  target: number;
  splayVelocity: number;
  swingVelocity: number;
  dragging: boolean;
  hovering: boolean;
  touch: boolean;
  grabOffset: number;
  pointerX: number;
  pointerY: number;
  auto: { from: number; to: number; start: number; duration: number } | null;
  tooth: number;
  teethSinceBuzz: number;
  last: number;
};

const STEP = TRAVEL / 10;

/** Past the stops the slider gives a little, then won't go any further. */
function rubberBand(value: number) {
  if (value > S_MAX) {
    return S_MAX + 5 * (1 - Math.exp(-(value - S_MAX) / 14));
  }

  if (value < S_MIN) {
    return S_MIN - 3 * (1 - Math.exp(-(S_MIN - value) / 10));
  }

  return value;
}

function toothAt(s: number) {
  return Math.floor((s - Y_TOP) / (PITCH / 2));
}

function describe(percent: number) {
  if (percent <= 0) {
    return "Zipped shut";
  }

  if (percent >= 100) {
    return "Open all the way";
  }

  return `${percent}% open`;
}

export function Zipper({
  children,
  className,
  colorway = "canvas",
  defaultProgress = 0,
  label = "Zip",
  onProgressChange,
  sound = true,
}: ZipperProps) {
  const uid = sanitizeId(useId());
  const palette = zipperColorways[colorway];
  const reduceMotion = useReducedMotion() ?? false;
  const containerRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<number | null>(null);
  const optionsRef = useRef({ palette, reduceMotion, sound });
  optionsRef.current = { palette, reduceMotion, sound };

  const simRef = useRef<Sim | null>(null);

  if (!simRef.current) {
    const s = sliderFor(defaultProgress);
    simRef.current = {
      auto: null,
      dragging: false,
      grabOffset: 0,
      hovering: false,
      last: 0,
      lift: 0,
      pointerX: CX,
      pointerY: 0,
      s,
      splay: splayFor(s),
      splayVelocity: 0,
      swing: 0,
      swingVelocity: 0,
      target: s,
      teethSinceBuzz: 0,
      tooth: toothAt(s),
      touch: false,
      velocity: 0,
    };
  }

  const [scene, setScene] = useState<SceneState>(() => {
    const { lift, s, splay, swing } = simRef.current as Sim;
    return { lift, s, splay, swing };
  });

  const percent = Math.round(((scene.s - S_MIN) / TRAVEL) * 100);
  const clampedPercent = clamp(percent, 0, 100);

  const onProgressChangeRef = useRef(onProgressChange);
  onProgressChangeRef.current = onProgressChange;

  useEffect(() => {
    onProgressChangeRef.current?.(clampedPercent);
  }, [clampedPercent]);

  const tick = useCallback((now: number) => {
    const sim = simRef.current as Sim;
    const { palette, reduceMotion, sound } = optionsRef.current;
    const dt = sim.last ? Math.min(0.032, (now - sim.last) / 1000) : 1 / 60;
    sim.last = now;

    if (sim.auto) {
      const t = clamp((now - sim.auto.start) / sim.auto.duration, 0, 1);
      sim.target =
        sim.auto.from + (sim.auto.to - sim.auto.from) * easeInOutCubic(t);

      if (t >= 1) {
        sim.auto = null;
      }
    }

    const previous = sim.s;

    if (reduceMotion) {
      sim.s = sim.target;
      sim.velocity = 0;
    } else {
      // A stiff spring gives the slider a little weight behind the hand.
      const stiffness = 1100;
      const damping = 2 * Math.sqrt(stiffness) * 0.92;
      const acceleration =
        stiffness * (sim.target - sim.s) - damping * sim.velocity;
      sim.velocity += acceleration * dt;
      sim.s += sim.velocity * dt;
    }

    sim.s = clamp(sim.s, S_MIN - 3, S_MAX + 5);
    const speed = Math.abs(sim.s - previous) / dt;

    // Knocking into a stop.
    const hitBottom = previous < S_MAX - 0.4 && sim.s >= S_MAX - 0.4;
    const hitTop = previous > S_MIN + 0.4 && sim.s <= S_MIN + 0.4;

    if ((hitBottom || hitTop) && speed > 25) {
      const strength = clamp(speed / 600, 0.15, 1);

      if (sound) {
        playClack(strength);
      }

      if (sim.touch) {
        buzz(12);
      }

      if (!reduceMotion) {
        sim.swingVelocity += (Math.random() > 0.5 ? 1 : -1) * 160 * strength;
      }
    }

    // Each tooth that goes through the slider.
    const tooth = toothAt(clamp(sim.s, S_MIN, S_MAX));

    if (tooth !== sim.tooth) {
      const passed = Math.abs(tooth - sim.tooth);
      sim.tooth = tooth;

      if (sound) {
        playTick(palette, speed, sim.s < previous);
      }

      sim.teethSinceBuzz += passed;

      if (sim.touch && sim.dragging && sim.teethSinceBuzz >= 4) {
        sim.teethSinceBuzz = 0;
        buzz(3);
      }
    }

    // The fabric lags behind the slider and bounces as it falls open.
    const splayTarget = splayFor(clamp(sim.s, S_MIN, S_MAX));

    if (reduceMotion) {
      sim.splay = splayTarget;
      sim.splayVelocity = 0;
    } else {
      const stiffness = 150;
      const damping = 2 * Math.sqrt(stiffness) * 0.3;
      sim.splayVelocity +=
        (stiffness * (splayTarget - sim.splay) - damping * sim.splayVelocity) *
        dt;
      sim.splay += sim.splayVelocity * dt;

      if (sim.splay < 0) {
        sim.splay = 0;
        sim.splayVelocity = Math.max(0, sim.splayVelocity);
      }
    }

    // The pull leans towards a hand that holds it off to one side.
    let swingTarget = 0;

    if (sim.dragging) {
      const pivot = sim.s + PIVOT_Y;
      const lean =
        (Math.atan2(sim.pointerX - CX, Math.max(24, sim.pointerY - pivot)) *
          180) /
        Math.PI;
      swingTarget = clamp(lean, -40, 40);
    }

    if (reduceMotion) {
      sim.swing = swingTarget;
      sim.swingVelocity = 0;
    } else {
      const stiffness = sim.dragging ? 320 : 210;
      const damping = 2 * Math.sqrt(stiffness) * (sim.dragging ? 0.6 : 0.14);
      sim.swingVelocity +=
        (stiffness * (swingTarget - sim.swing) - damping * sim.swingVelocity) *
        dt;
      sim.swing += sim.swingVelocity * dt;
    }

    const liftTarget = sim.dragging ? 1 : sim.hovering ? 0.35 : 0;
    sim.lift += (liftTarget - sim.lift) * (1 - Math.exp(-dt * 18));

    const settled =
      !sim.dragging &&
      !sim.auto &&
      Math.abs(sim.target - sim.s) < 0.02 &&
      Math.abs(sim.velocity) < 0.05 &&
      Math.abs(splayTarget - sim.splay) < 0.03 &&
      Math.abs(sim.splayVelocity) < 0.05 &&
      Math.abs(sim.swing - swingTarget) < 0.03 &&
      Math.abs(sim.swingVelocity) < 0.05 &&
      Math.abs(sim.lift - liftTarget) < 0.003;

    if (settled) {
      sim.s = sim.target;
      sim.velocity = 0;
      sim.splay = splayTarget;
      sim.splayVelocity = 0;
      sim.swing = swingTarget;
      sim.swingVelocity = 0;
      sim.lift = liftTarget;
      frameRef.current = null;
    }

    setScene({ lift: sim.lift, s: sim.s, splay: sim.splay, swing: sim.swing });

    if (!settled) {
      frameRef.current = requestAnimationFrame(tick);
    }
  }, []);

  const wake = useCallback(() => {
    if (frameRef.current === null) {
      (simRef.current as Sim).last = 0;
      frameRef.current = requestAnimationFrame(tick);
    }
  }, [tick]);

  useEffect(
    () => () => {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
      }
    },
    [],
  );

  // A little sway on arrival, as if the pouch had just been set down.
  useEffect(() => {
    if (reduceMotion) {
      return;
    }

    const timeout = window.setTimeout(() => {
      const sim = simRef.current as Sim;

      if (!sim.dragging && !sim.auto) {
        sim.swingVelocity += 120;
        wake();
      }
    }, 700);

    return () => window.clearTimeout(timeout);
  }, [reduceMotion, wake]);

  const toView = (event: PointerEvent<HTMLElement>) => {
    const rect = containerRef.current?.getBoundingClientRect();

    if (!rect || rect.width === 0) {
      return { x: CX, y: 0 };
    }

    return {
      x: ((event.clientX - rect.left) / rect.width) * VIEW_W,
      y: ((event.clientY - rect.top) / rect.height) * VIEW_H,
    };
  };

  const zipTo = useCallback(
    (progress: number) => {
      const sim = simRef.current as Sim;
      const to = sliderFor(progress);
      const distance = Math.abs(to - sim.s);

      if (distance < 0.5) {
        return;
      }

      if (optionsRef.current.sound) {
        getAudioContext();
      }

      if (optionsRef.current.reduceMotion) {
        sim.auto = null;
        sim.target = to;
      } else {
        sim.auto = {
          duration: 160 + (700 * distance) / TRAVEL,
          from: sim.s,
          start: performance.now(),
          to,
        };
      }

      wake();
    },
    [wake],
  );

  const nudge = (steps: number) => {
    const sim = simRef.current as Sim;
    sim.auto = null;
    sim.target = clamp(sim.target + steps * STEP, S_MIN, S_MAX);
    wake();
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    event.currentTarget.focus({ preventScroll: true });

    if (optionsRef.current.sound) {
      getAudioContext();
    }

    const sim = simRef.current as Sim;
    const point = toView(event);
    sim.auto = null;
    sim.dragging = true;
    sim.touch = event.pointerType === "touch";
    sim.grabOffset = sim.s - point.y;
    sim.pointerX = point.x;
    sim.pointerY = point.y;
    sim.target = sim.s;
    wake();
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const sim = simRef.current as Sim;

    if (!sim.dragging) {
      return;
    }

    const point = toView(event);
    sim.pointerX = point.x;
    sim.pointerY = point.y;
    sim.target = rubberBand(point.y + sim.grabOffset);
    wake();
  };

  const endDrag = () => {
    const sim = simRef.current as Sim;

    if (!sim.dragging) {
      return;
    }

    sim.dragging = false;
    sim.target = clamp(sim.target, S_MIN, S_MAX);

    // The pull drops back onto the slider with a small knock.
    if (optionsRef.current.sound) {
      playClack(0.05);
    }

    wake();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const sim = simRef.current as Sim;
    const open = (sim.target - S_MIN) / TRAVEL > 0.5;
    const actions: Record<string, () => void> = {
      " ": () => zipTo(open ? 0 : 1),
      ArrowDown: () => nudge(1),
      ArrowLeft: () => nudge(-1),
      ArrowRight: () => nudge(1),
      ArrowUp: () => nudge(-1),
      End: () => zipTo(1),
      Enter: () => zipTo(open ? 0 : 1),
      Home: () => zipTo(0),
      PageDown: () => nudge(3),
      PageUp: () => nudge(-3),
    };
    const action = actions[event.key];

    if (action) {
      event.preventDefault();

      if (optionsRef.current.sound) {
        getAudioContext();
      }

      action();
    }
  };

  const handleSize = { height: 70, width: 50 };

  return (
    <div
      className={cn("relative aspect-[3/4] w-[300px] select-none", className)}
      ref={containerRef}
    >
      <Lining hidden={clampedPercent < 12} palette={palette}>
        {children}
      </Lining>
      <ZipperScene palette={palette} state={scene} uid={uid} />
      <div
        aria-label={label}
        aria-orientation="vertical"
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={clampedPercent}
        aria-valuetext={describe(clampedPercent)}
        className="absolute cursor-grab touch-none rounded-[12px] outline-offset-2 focus-visible:outline-2 focus-visible:outline-grayscale-8 active:cursor-grabbing"
        onDoubleClick={() =>
          zipTo((simRef.current as Sim).target - S_MIN > TRAVEL / 2 ? 0 : 1)
        }
        onKeyDown={handleKeyDown}
        onLostPointerCapture={endDrag}
        onPointerCancel={endDrag}
        onPointerDown={handlePointerDown}
        onPointerEnter={() => {
          (simRef.current as Sim).hovering = true;
          wake();
        }}
        onPointerLeave={() => {
          (simRef.current as Sim).hovering = false;
          wake();
        }}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        role="slider"
        style={{
          height: `${(handleSize.height / VIEW_H) * 100}%`,
          left: `${((CX - handleSize.width / 2) / VIEW_W) * 100}%`,
          top: `${((scene.s - 30) / VIEW_H) * 100}%`,
          width: `${(handleSize.width / VIEW_W) * 100}%`,
        }}
        tabIndex={0}
      />
    </div>
  );
}
