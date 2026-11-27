"use client";

import NumberFlow from "@number-flow/react";
import { useReducedMotion } from "motion/react";
import {
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type RefObject,
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

/** Everything is laid out on a fixed stage, then scaled down to fit. */
const STAGE_WIDTH = 360;
const STAGE_HEIGHT = 300;

/** The printed top of the sleeve, seen from a little above. */
const SLEEVE = { height: 118, width: 252, x: 30, y: 34 };
/** The long side of the sleeve, which carries the striker. */
const SIDE_HEIGHT = 28;
const STRIKER = {
  height: 16,
  width: SLEEVE.width - 24,
  x: SLEEVE.x + 12,
  y: SLEEVE.y + SLEEVE.height + 6,
};
/** The highest the head can ride: pressed against the side, not over the top. */
const HEAD_FLOOR = STRIKER.y + 4;

/** How far the tray pokes out of the sleeve when shut and when open. */
const TRAY_CLOSED = 10;
const TRAY_OPEN = 50;
const TRAY_SLOTS = 11;

const MATCH_LENGTH = 172;
/** How much of the stick the flame eats before it gives out. */
const BURN_REACH = MATCH_LENGTH * 0.72;
/** Where the head rests, in front of the box. */
const REST = { angle: -3, x: 322, y: 240 };
/** Where a fresh match is lifted from: the heads at the open end of the tray. */
const LIFT = {
  x: SLEEVE.x + SLEEVE.width + TRAY_OPEN - 12,
  y: SLEEVE.y + SLEEVE.height / 2,
};

/* -------------------------------------------------------------------------- */
/* Feel                                                                        */
/* -------------------------------------------------------------------------- */

/** Heat gained per pixel of head dragged across the striker. Lights at 1. */
const HEAT_PER_PIXEL = 0.016;
/** Seconds for friction heat to bleed away. A slow drag never gets there. */
const HEAT_DECAY = 0.3;
/** Each sharp change of direction while lit adds this much to the shake. */
const SHAKE_PER_REVERSAL = 0.3;
const SHAKE_DECAY = 0.8;
/** Pixels per second the hand must be moving for a reversal to count. */
const SHAKE_SPEED = 420;
const OUT_LINGER = 1800;
const DROP_DURATION = 620;
const EMERGE_DURATION = 900;

type Phase = "emerging" | "ready" | "lit" | "out" | "dropping" | "empty";

type Particle = {
  age: number;
  life: number;
  seed: number;
  size: number;
  vx: number;
  vy: number;
  x: number;
  y: number;
};

type Script = {
  fromX: number;
  fromY: number;
  kind: "shake" | "strike";
  start: number;
};

type Sim = {
  angle: number;
  angleVelocity: number;
  burn: number;
  drag: {
    moved: boolean;
    offsetX: number;
    offsetY: number;
    pointerId: number;
    startX: number;
    startY: number;
  } | null;
  heat: number;
  inBox: number;
  /** Whether the last press moved the match, so its click is not a tap. */
  lastDragMoved: boolean;
  lastDirectionX: number;
  lastDirectionY: number;
  lastMoveAt: number;
  lastSmokeAt: number;
  lifted: boolean;
  litAt: number;
  opacity: number;
  outAt: number;
  phase: Phase;
  phaseStart: number;
  script: Script | null;
  shake: number;
  smoke: Particle[];
  sparks: Particle[];
  tray: number;
  vx: number;
  vy: number;
  x: number;
  y: number;
};

export type MatchboxProps = {
  /** Matches in a full box. */
  capacity?: number;
  /** Milliseconds a match burns before it gives out by itself. */
  burnDuration?: number;
  /** Play a synthesised scrape, flare and puff. */
  sound?: boolean;
  onLight?: () => void;
  onOut?: (reason: "burnt" | "shaken") => void;
  className?: string;
};

function clamp(value: number, minimum = 0, maximum = 1) {
  return Math.min(Math.max(value, minimum), maximum);
}

function lerp(from: number, to: number, amount: number) {
  return from + (to - from) * amount;
}

function random(minimum: number, maximum: number) {
  return minimum + Math.random() * (maximum - minimum);
}

function easeOutCubic(t: number) {
  return 1 - (1 - t) ** 3;
}

function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2;
}

/** A teardrop that leans its tip sideways, anchored on the head. */
function flamePath(width: number, height: number, lean: number) {
  const half = width / 2;
  const bottom = width * 0.42;
  const tipY = -height;
  const n = (value: number) => value.toFixed(2);

  return [
    `M ${n(lean)} ${n(tipY)}`,
    `C ${n(lean * 0.55 + half * 0.35)} ${n(tipY * 0.62)}, ${n(lean * 0.12 + half * 1.05)} ${n(tipY * 0.28)}, ${n(half)} 0`,
    `C ${n(half * 0.95)} ${n(bottom)}, ${n(-half * 0.95)} ${n(bottom)}, ${n(-half)} 0`,
    `C ${n(lean * 0.12 - half * 1.05)} ${n(tipY * 0.28)}, ${n(lean * 0.55 - half * 0.35)} ${n(tipY * 0.62)}, ${n(lean)} ${n(tipY)}`,
    "Z",
  ].join(" ");
}

/* -------------------------------------------------------------------------- */
/* Sound                                                                       */
/* -------------------------------------------------------------------------- */

let sharedAudioContext: AudioContext | null = null;
let noiseBuffer: AudioBuffer | null = null;
let lastScrapeAt = 0;

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
    const length = context.sampleRate;
    noiseBuffer = context.createBuffer(1, length, context.sampleRate);
    const data = noiseBuffer.getChannelData(0);

    for (let index = 0; index < length; index += 1) {
      data[index] = Math.random() * 2 - 1;
    }
  }

  return noiseBuffer;
}

/** Play a slice of noise through a filter with a quick swell and decay. */
function playNoise({
  attack,
  duration,
  filter,
  frequency,
  frequencyEnd,
  gain,
  q = 0.8,
}: {
  attack: number;
  duration: number;
  filter: BiquadFilterType;
  frequency: number;
  frequencyEnd?: number;
  gain: number;
  q?: number;
}) {
  const context = getAudioContext();

  if (!context) {
    return;
  }

  const now = context.currentTime;
  const source = context.createBufferSource();
  const shape = context.createBiquadFilter();
  const envelope = context.createGain();

  source.buffer = getNoise(context);
  shape.type = filter;
  shape.Q.value = q;
  shape.frequency.setValueAtTime(frequency, now);

  if (frequencyEnd) {
    shape.frequency.exponentialRampToValueAtTime(frequencyEnd, now + duration);
  }

  envelope.gain.setValueAtTime(0.0001, now);
  envelope.gain.exponentialRampToValueAtTime(gain, now + attack);
  envelope.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  source.connect(shape).connect(envelope).connect(context.destination);
  source.start(now, Math.random() * 0.5);
  source.stop(now + duration + 0.02);
}

function playScrape(intensity: number) {
  const now = performance.now();

  // Pointer events can arrive faster than a grain; let them overlap a little.
  if (now - lastScrapeAt < 28) {
    return;
  }

  lastScrapeAt = now;
  playNoise({
    attack: 0.004,
    duration: 0.05,
    filter: "bandpass",
    frequency: 1800 + intensity * 2200,
    gain: 0.08 + intensity * 0.32,
    q: 0.9,
  });
}

function playIgnite() {
  // The head flares with a bright hiss, then settles to a softer roar.
  playNoise({
    attack: 0.008,
    duration: 0.55,
    filter: "lowpass",
    frequency: 5200,
    frequencyEnd: 500,
    gain: 0.7,
    q: 0.6,
  });
  playNoise({
    attack: 0.002,
    duration: 0.09,
    filter: "highpass",
    frequency: 3000,
    gain: 0.35,
  });
}

function playPuff() {
  playNoise({
    attack: 0.03,
    duration: 0.3,
    filter: "bandpass",
    frequency: 700,
    frequencyEnd: 260,
    gain: 0.45,
    q: 0.7,
  });
}

function buzz(duration: number) {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    navigator.vibrate?.(duration);
  }
}

/* -------------------------------------------------------------------------- */
/* Surfaces                                                                    */
/* -------------------------------------------------------------------------- */

const grainImage =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='60'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='1.1' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.7 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

const paperStyle: CSSProperties = {
  backgroundColor: "#f1e7d0",
  backgroundImage: `${grainImage}, linear-gradient(160deg, #f6eedb, #ecdfc2)`,
  backgroundBlendMode: "soft-light, normal",
};

const woodStyle: CSSProperties = {
  background: "linear-gradient(180deg, #f6e2b8 0%, #e6c58f 45%, #cfa66b 100%)",
  boxShadow: "inset 0 -0.5px 0 rgb(120 80 30 / 35%)",
};

const headStyle: CSSProperties = {
  background:
    "radial-gradient(circle at 34% 30%, #f07a63 0, #c23a2c 32%, #8f2118 70%, #5d130e 100%)",
  boxShadow: "inset 0 -1px 1px rgb(0 0 0 / 30%)",
};

const charredHeadStyle: CSSProperties = {
  background:
    "radial-gradient(circle at 34% 30%, #7d7470 0, #3a3330 34%, #1a1513 72%, #0b0908 100%)",
};

const ink = "#1f2b4a";
/** Sixteen sun rays round the emblem, alternately long and short. */
const EMBLEM_RAYS = Array.from({ length: 16 }, (_, ray) => ray);
const vermilion = "#d1452b";

/** The printed sleeve: its top label and the long side with the striker. */
function MatchboxSleeve({
  wearRef,
}: {
  wearRef?: RefObject<HTMLCanvasElement | null>;
}) {
  return (
    <>
      <div
        className="absolute overflow-hidden rounded-[3px]"
        style={{
          ...paperStyle,
          boxShadow:
            "inset 0 1px 0 rgb(255 255 255 / 70%), inset 0 0 0 0.5px rgb(90 70 40 / 25%)",
          height: SLEEVE.height,
          left: SLEEVE.x,
          top: SLEEVE.y,
          width: SLEEVE.width,
        }}
      >
        <div
          className="absolute rounded-[3px]"
          style={{ border: `1.5px solid ${ink}`, inset: 7 }}
        />
        <div
          className="absolute rounded-[2px]"
          style={{ border: `0.5px solid ${ink}`, inset: 10.5 }}
        />

        {/* The emblem: a flame on a sun, in two inks. */}
        <div
          className="absolute grid place-items-center rounded-full"
          style={{
            background: vermilion,
            boxShadow: `0 0 0 2px #f1e7d0, 0 0 0 3.25px ${ink}`,
            height: 62,
            left: 24,
            top: (SLEEVE.height - 62) / 2,
            width: 62,
          }}
        >
          <svg
            aria-hidden="true"
            className="overflow-visible"
            height="62"
            viewBox="-31 -31 62 62"
            width="62"
          >
            {EMBLEM_RAYS.map((ray) => (
              <line
                key={ray}
                stroke="#f1e7d0"
                strokeLinecap="round"
                strokeOpacity={0.5}
                strokeWidth={1.2}
                transform={`rotate(${ray * 22.5})`}
                x1="0"
                x2="0"
                y1="-21"
                y2={ray % 2 ? "-25" : "-27"}
              />
            ))}
            <path
              d={flamePath(15, 27, 1.5)}
              fill="#f1e7d0"
              transform="translate(0 9)"
            />
            <path
              d={flamePath(6.5, 12, 0.6)}
              fill={vermilion}
              transform="translate(0 8)"
            />
          </svg>
        </div>

        <div
          className="absolute flex flex-col"
          style={{ color: ink, left: 104, top: 24 }}
        >
          <span className="font-mono font-semibold text-[7px] uppercase tracking-[0.24em]">
            dqnamo &amp; co.
          </span>
          <span className="mt-1.5 font-bold font-serif text-[21px] uppercase leading-[0.95] tracking-[0.06em]">
            Safety
          </span>
          <span className="font-bold font-serif text-[21px] uppercase leading-[0.95] tracking-[0.06em]">
            Matches
          </span>
          <span className="mt-2 h-px w-[118px]" style={{ background: ink }} />
          <span className="mt-1.5 font-mono font-medium text-[6.5px] uppercase tracking-[0.18em]">
            Strikes only on the box
          </span>
        </div>
      </div>

      <div
        className="absolute rounded-b-[3px]"
        style={{
          background: "linear-gradient(180deg, #ddd0b2, #cbbb96)",
          boxShadow:
            "inset 0 1px 0 rgb(90 70 40 / 22%), inset 0 -1px 0 rgb(255 255 255 / 25%)",
          height: SIDE_HEIGHT,
          left: SLEEVE.x,
          top: SLEEVE.y + SLEEVE.height,
          width: SLEEVE.width,
        }}
      />
      <div
        className="absolute overflow-hidden rounded-[2px]"
        style={{
          backgroundColor: "#6e3524",
          backgroundImage: `${grainImage}, ${grainImage}, linear-gradient(180deg, #5c2a1c, #7a3c28 50%, #67301f)`,
          backgroundPosition: "0 0, 37px 11px, 0 0",
          boxShadow:
            "inset 0 1px 2px rgb(0 0 0 / 45%), 0 0.5px 0 rgb(255 255 255 / 35%)",
          height: STRIKER.height,
          left: STRIKER.x,
          top: STRIKER.y,
          width: STRIKER.width,
        }}
      >
        {wearRef ? (
          <canvas
            className="absolute inset-0 size-full"
            height={STRIKER.height * 2}
            ref={wearRef}
            width={STRIKER.width * 2}
          />
        ) : null}
      </div>
    </>
  );
}

/** The inner tray, with a match head for every match still in the box. */
function MatchboxTray({
  count,
  out,
  trayRef,
}: {
  count: number;
  out: number;
  trayRef?: RefObject<HTMLDivElement | null>;
}) {
  const left = SLEEVE.x + 3;
  const width = SLEEVE.width - 6;
  const innerHeight = SLEEVE.height - 14;
  const slot = innerHeight / TRAY_SLOTS;
  const first = (TRAY_SLOTS - Math.min(count, TRAY_SLOTS)) / 2;

  return (
    <div
      className="absolute"
      ref={trayRef}
      style={{
        height: SLEEVE.height + SIDE_HEIGHT - 8,
        left,
        top: SLEEVE.y + 4,
        transform: `translateX(${out}px)`,
        width,
      }}
    >
      <div
        className="absolute inset-x-0 top-0 rounded-[2px]"
        style={{
          background: "linear-gradient(90deg, #d9c49a, #e6d3ab)",
          boxShadow: "0 4px 10px rgb(0 0 0 / 18%)",
          height: SLEEVE.height - 6,
        }}
      >
        <div
          className="absolute overflow-hidden rounded-[1px]"
          style={{
            background: "linear-gradient(90deg, #a98d5f, #bfa271)",
            boxShadow:
              "inset 2px 0 3px rgb(0 0 0 / 25%), inset 0 2px 3px rgb(0 0 0 / 30%)",
            inset: 4,
          }}
        >
          {Array.from({ length: Math.min(count, TRAY_SLOTS) }, (_, index) => {
            const top = (first + index) * slot + 1;
            // Matches never lie perfectly square in a real box.
            const nudge = ((index * 7) % 5) - 2;

            return (
              // biome-ignore lint/suspicious/noArrayIndexKey: matches are interchangeable
              <div key={index}>
                <div
                  className="absolute rounded-[1px]"
                  style={{
                    ...woodStyle,
                    height: 5,
                    right: 10 + nudge,
                    top: top + 2,
                    width: width - 30,
                  }}
                />
                <div
                  className="absolute rounded-full"
                  style={{
                    ...headStyle,
                    height: 8.5,
                    right: 2 + nudge,
                    top: top + 0.25,
                    width: 11,
                  }}
                />
              </div>
            );
          })}
        </div>
      </div>
      <div
        className="absolute inset-x-0 rounded-b-[2px]"
        style={{
          background: "linear-gradient(180deg, #c9b285, #b89f70)",
          height: SIDE_HEIGHT - 8,
          top: SLEEVE.height - 6,
        }}
      />
    </div>
  );
}

/** A match lying with its head at the origin and its stick running left. */
function MatchStick({
  charRef,
  charredHeadRef,
  emberRef,
}: {
  charRef?: RefObject<HTMLDivElement | null>;
  charredHeadRef?: RefObject<HTMLDivElement | null>;
  emberRef?: RefObject<HTMLDivElement | null>;
}) {
  return (
    <>
      <div
        className="absolute overflow-hidden rounded-[1.5px]"
        style={{
          ...woodStyle,
          height: 6.5,
          left: -MATCH_LENGTH,
          top: -3.25,
          width: MATCH_LENGTH - 4,
        }}
      >
        <div
          className="absolute inset-y-0 right-0"
          ref={charRef}
          style={{
            background:
              "linear-gradient(270deg, #120d0b 0%, #2a1f19 70%, #4b3020 92%, rgb(120 70 30 / 0%) 100%)",
            width: 0,
          }}
        />
      </div>
      {/* The burning edge, outside the stick's clip so it can glow. */}
      <div
        className="absolute rounded-full"
        ref={emberRef}
        style={{
          background: "#ffb15a",
          boxShadow: "0 0 3px 1px rgb(255 120 30 / 85%)",
          height: 6,
          left: -6,
          opacity: 0,
          top: -3,
          width: 2.5,
        }}
      />
      <div
        className="absolute rounded-full"
        style={{ ...headStyle, height: 11, left: -7, top: -5.5, width: 14 }}
      >
        <div
          className="absolute -inset-[0.75px] rounded-full"
          ref={charredHeadRef}
          style={{ ...charredHeadStyle, opacity: 0 }}
        />
      </div>
    </>
  );
}

function FlameDefs({ id }: { id: string }) {
  return (
    <defs>
      <linearGradient id={`${id}-outer`} x1="0" x2="0" y1="1" y2="0">
        <stop offset="0" stopColor="#ff6a12" />
        <stop offset="0.45" stopColor="#ff9d2e" />
        <stop offset="0.85" stopColor="#ffc96b" stopOpacity="0.75" />
        <stop offset="1" stopColor="#ffd27a" stopOpacity="0.1" />
      </linearGradient>
      <linearGradient id={`${id}-inner`} x1="0" x2="0" y1="1" y2="0">
        <stop offset="0" stopColor="#fffaf0" />
        <stop offset="0.6" stopColor="#ffeeb0" />
        <stop offset="1" stopColor="#ffd56e" stopOpacity="0" />
      </linearGradient>
      <filter height="300%" id={`${id}-blur`} width="300%" x="-100%" y="-100%">
        <feGaussianBlur stdDeviation="3.5" />
      </filter>
      <filter height="300%" id={`${id}-soft`} width="300%" x="-100%" y="-100%">
        <feGaussianBlur stdDeviation="1.2" />
      </filter>
    </defs>
  );
}

const glowStyle: CSSProperties = {
  background:
    "radial-gradient(circle, rgb(255 176 86 / 38%) 0%, rgb(255 140 40 / 14%) 34%, rgb(255 120 30 / 0%) 66%)",
  height: 320,
  left: -160,
  top: -160,
  width: 320,
};

/* -------------------------------------------------------------------------- */
/* A still box for thumbnails                                                  */
/* -------------------------------------------------------------------------- */

/**
 * A decorative matchbox with one match out in front. The match lights when
 * an ancestor with the `group` class is hovered.
 */
export function MatchboxFace({
  className,
  scale = 0.42,
}: {
  className?: string;
  scale?: number;
}) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const flameAt = { x: REST.x - 3, y: REST.y };

  return (
    <div
      aria-hidden="true"
      className={cn("relative", className)}
      style={{ height: STAGE_HEIGHT * scale, width: STAGE_WIDTH * scale }}
    >
      <div
        className="absolute top-0 left-0 origin-top-left"
        style={{
          height: STAGE_HEIGHT,
          transform: `scale(${scale})`,
          width: STAGE_WIDTH,
        }}
      >
        <BoxShadow />
        <MatchboxTray count={TRAY_SLOTS} out={TRAY_CLOSED + 8} />
        <MatchboxSleeve />
        <div
          className="absolute top-0 left-0"
          style={{
            filter: "drop-shadow(0 2px 1.5px rgb(0 0 0 / 25%))",
            transform: `translate(${REST.x}px, ${REST.y}px) rotate(${REST.angle}deg)`,
          }}
        >
          <MatchStick />
        </div>
        <div
          className="absolute top-0 left-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100 motion-reduce:transition-none dark:mix-blend-screen"
          style={{
            ...glowStyle,
            transform: `translate(${flameAt.x}px, ${flameAt.y - 14}px)`,
          }}
        />
        <svg
          aria-hidden="true"
          className="absolute top-0 left-0 overflow-visible"
          height={STAGE_HEIGHT}
          width={STAGE_WIDTH}
        >
          <FlameDefs id={id} />
          <g transform={`translate(${flameAt.x} ${flameAt.y})`}>
            <g className="origin-[0px_4px] scale-0 transition-transform duration-300 [transition-timing-function:cubic-bezier(0.34,1.56,0.64,1)] group-hover:scale-100 motion-reduce:transition-none">
              <path
                d={flamePath(20, 40, 0)}
                fill="#ff8c2a"
                filter={`url(#${id}-blur)`}
                opacity="0.45"
              />
              <path d={flamePath(12, 34, 0)} fill={`url(#${id}-outer)`} />
              <path
                d={flamePath(6.5, 19, 0)}
                fill={`url(#${id}-inner)`}
                transform="translate(0 1)"
              />
            </g>
          </g>
        </svg>
      </div>
    </div>
  );
}

function BoxShadow() {
  return (
    <div
      className="absolute rounded-[4px]"
      style={{
        boxShadow:
          "0 2px 3px rgb(0 0 0 / 14%), 0 14px 22px -6px rgb(0 0 0 / 26%), 0 30px 50px -20px rgb(0 0 0 / 22%)",
        height: SLEEVE.height + SIDE_HEIGHT,
        left: SLEEVE.x,
        top: SLEEVE.y,
        width: SLEEVE.width,
      }}
    />
  );
}

/* -------------------------------------------------------------------------- */
/* The matchbox                                                                */
/* -------------------------------------------------------------------------- */

const READY_LABEL =
  "Match. Drag its head quickly along the striker on the side of the box, or press Enter to strike it.";
const LIT_LABEL = "Lit match. Shake it, or press Enter, to put it out.";

export function Matchbox({
  burnDuration = 13000,
  capacity = 12,
  className,
  onLight,
  onOut,
  sound = true,
}: MatchboxProps) {
  const shouldReduceMotion = useReducedMotion() ?? false;
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");

  const [phase, setPhase] = useState<Phase>("emerging");
  const [inBox, setInBox] = useState(capacity);
  const [announcement, setAnnouncement] = useState("");
  const [scale, setScale] = useState(1);

  const fitRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const trayRef = useRef<HTMLDivElement>(null);
  const matchRef = useRef<HTMLDivElement>(null);
  const charRef = useRef<HTMLDivElement>(null);
  const charredHeadRef = useRef<HTMLDivElement>(null);
  const emberRef = useRef<HTMLDivElement>(null);
  const flameRef = useRef<SVGGElement>(null);
  const haloRef = useRef<SVGPathElement>(null);
  const outerRef = useRef<SVGPathElement>(null);
  const innerRef = useRef<SVGPathElement>(null);
  const baseRef = useRef<SVGEllipseElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const particlesRef = useRef<HTMLCanvasElement>(null);
  const wearRef = useRef<HTMLCanvasElement>(null);

  const simRef = useRef<Sim>({
    angle: REST.angle,
    angleVelocity: 0,
    burn: 0,
    drag: null,
    heat: 0,
    inBox: capacity,
    lastDragMoved: false,
    lastDirectionX: 0,
    lastDirectionY: 0,
    lastMoveAt: 0,
    lastSmokeAt: 0,
    lifted: false,
    litAt: 0,
    opacity: 0,
    outAt: 0,
    phase: "emerging",
    phaseStart: -1,
    script: null,
    shake: 0,
    smoke: [],
    sparks: [],
    tray: TRAY_CLOSED,
    vx: 0,
    vy: 0,
    x: REST.x,
    y: REST.y,
  });

  // Callbacks change between renders; the animation loop reads the latest.
  const live = useRef({
    burnDuration,
    onLight,
    onOut,
    shouldReduceMotion,
    sound,
  });
  live.current = { burnDuration, onLight, onOut, shouldReduceMotion, sound };

  const enterPhase = useCallback((next: Phase, now: number) => {
    const sim = simRef.current;
    sim.phase = next;
    sim.phaseStart = now;
    setPhase(next);
  }, []);

  /* ---------------------------- Fit to the width --------------------------- */

  useEffect(() => {
    const fit = fitRef.current;

    if (!fit) {
      return;
    }

    const observer = new ResizeObserver(([entry]) => {
      setScale(Math.min(1, entry.contentRect.width / STAGE_WIDTH));
    });

    observer.observe(fit);
    return () => observer.disconnect();
  }, []);

  /* ------------------------------- Events ---------------------------------- */

  const ignite = useCallback(
    (now: number) => {
      const sim = simRef.current;
      const { onLight, shouldReduceMotion, sound } = live.current;

      sim.heat = 0;
      sim.litAt = now;
      sim.burn = 0;
      sim.shake = 0;
      sim.lastDirectionX = 0;
      sim.lastDirectionY = 0;
      enterPhase("lit", now);

      if (!shouldReduceMotion) {
        for (let index = 0; index < 26; index += 1) {
          const angle = random(0, Math.PI * 2);
          const speed = random(80, 320);
          sim.sparks.push({
            age: 0,
            life: random(0.2, 0.55),
            seed: 0,
            size: random(1, 2.2),
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed - 120,
            x: sim.x,
            y: sim.y,
          });
        }

        // The sulphur goes up in a little white puff.
        for (let index = 0; index < 9; index += 1) {
          sim.smoke.push({
            age: 0,
            life: random(0.8, 1.5),
            seed: random(0, Math.PI * 2),
            size: random(3, 6),
            vx: random(-30, 30),
            vy: random(-70, -30),
            x: sim.x + random(-4, 4),
            y: sim.y - random(0, 8),
          });
        }
      }

      if (sound) {
        playIgnite();
      }

      buzz(18);
      setAnnouncement("The match caught. Shake it to put it out.");
      onLight?.();
    },
    [enterPhase],
  );

  const extinguish = useCallback(
    (now: number, reason: "burnt" | "shaken") => {
      const sim = simRef.current;
      const { onOut, sound } = live.current;

      sim.outAt = now;
      sim.script = null;
      enterPhase("out", now);

      if (sound && reason === "shaken") {
        playPuff();
      }

      buzz(8);
      setAnnouncement(
        reason === "shaken"
          ? "You shook the match out."
          : "The match burnt down and went out.",
      );
      onOut?.(reason);
    },
    [enterPhase],
  );

  /** Leave a faint scorch on the striker wherever the head has scraped. */
  const scuff = useCallback(
    (fromX: number, fromY: number, toX: number, toY: number) => {
      const context = wearRef.current?.getContext("2d");

      if (!context) {
        return;
      }

      const map = (x: number, y: number) =>
        [(x - STRIKER.x) * 2, (y - STRIKER.y) * 2] as const;
      const [ax, ay] = map(fromX, fromY);
      const [bx, by] = map(toX, toY);
      const wobble = random(-3, 3);

      context.lineCap = "round";
      context.strokeStyle = "rgb(20 10 6 / 9%)";
      context.lineWidth = random(5, 9);
      context.beginPath();
      context.moveTo(ax, ay + wobble);
      context.lineTo(bx, by + wobble);
      context.stroke();
      context.strokeStyle = "rgb(255 225 190 / 5%)";
      context.lineWidth = 1.5;
      context.beginPath();
      context.moveTo(ax, ay + wobble - 3);
      context.lineTo(bx, by + wobble - 3);
      context.stroke();
    },
    [],
  );

  /** Move the head towards where the hand wants it, against the solid box. */
  const moveHeadTo = useCallback(
    (desiredX: number, desiredY: number, now: number) => {
      const sim = simRef.current;
      const { shouldReduceMotion, sound } = live.current;
      const previousX = sim.x;
      const previousY = sim.y;
      let x = clamp(desiredX, 14, STAGE_WIDTH - 10);
      let y = clamp(desiredY, 18, STAGE_HEIGHT - 10);
      const left = SLEEVE.x - 6;
      const right = SLEEVE.x + SLEEVE.width + sim.tray + 6;
      let pressure = 0;

      if (y < HEAD_FLOOR && x > left && x < right) {
        const cameFromBelow =
          previousY >= HEAD_FLOOR - 0.5 ||
          (previousX > left && previousX < right);

        if (cameFromBelow) {
          // Pushing up into the box presses the head harder on the striker.
          pressure = clamp((HEAD_FLOOR - y) / 28);
          y = HEAD_FLOOR;
        } else {
          x = previousX <= left ? left : right;
        }
      }

      const elapsed = Math.max(4, now - sim.lastMoveAt) / 1000;
      sim.lastMoveAt = now;
      sim.vx = lerp(sim.vx, (x - previousX) / elapsed, 0.45);
      sim.vy = lerp(sim.vy, (y - previousY) / elapsed, 0.45);
      sim.x = x;
      sim.y = y;

      const touching =
        y >= STRIKER.y - 2 &&
        y <= STRIKER.y + STRIKER.height + 3 &&
        x >= STRIKER.x + 2 &&
        x <= STRIKER.x + STRIKER.width - 2;
      const distance = Math.abs(x - previousX);

      if (touching && distance > 0.3 && sim.phase === "ready") {
        sim.heat += distance * HEAT_PER_PIXEL * (0.6 + 0.8 * pressure);
        scuff(previousX, previousY, x, y);

        if (sound) {
          playScrape(clamp(Math.abs(sim.vx) / 1600));
        }

        if (!shouldReduceMotion) {
          const count = Math.floor(
            distance * 0.12 * (0.15 + sim.heat) + Math.random(),
          );
          const direction = Math.sign(x - previousX);

          for (let index = 0; index < count; index += 1) {
            sim.sparks.push({
              age: 0,
              life: random(0.15, 0.45),
              seed: 0,
              size: random(0.9, 2),
              vx: -direction * random(40, 260) + random(-50, 50),
              vy: random(-240, 60),
              x: x + random(-3, 3),
              y: y + random(-2, 3),
            });
          }
        }

        if (sim.heat >= 1) {
          ignite(now);
        }
      }

      if (sim.phase === "lit") {
        // A real match goes out when you flick it back and forth.
        const directionX =
          Math.abs(sim.vx) > SHAKE_SPEED ? Math.sign(sim.vx) : sim.lastDirectionX;
        const directionY =
          Math.abs(sim.vy) > SHAKE_SPEED ? Math.sign(sim.vy) : sim.lastDirectionY;

        if (sim.lastDirectionX && directionX !== sim.lastDirectionX) {
          sim.shake += SHAKE_PER_REVERSAL;
        }

        if (sim.lastDirectionY && directionY !== sim.lastDirectionY) {
          sim.shake += SHAKE_PER_REVERSAL;
        }

        sim.lastDirectionX = directionX;
        sim.lastDirectionY = directionY;

        if (sim.shake >= 1) {
          extinguish(now, "shaken");
        }
      }
    },
    [extinguish, ignite, scuff],
  );

  /* --------------------------- Animation loop ------------------------------ */

  useEffect(() => {
    let frame = 0;
    let last = performance.now();
    const particles = particlesRef.current;
    const context = particles?.getContext("2d");
    const pixelRatio = Math.min(2, window.devicePixelRatio || 1);

    if (particles) {
      particles.width = STAGE_WIDTH * pixelRatio;
      particles.height = STAGE_HEIGHT * pixelRatio;
    }

    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      const sim = simRef.current;
      const { burnDuration, shouldReduceMotion } = live.current;

      if (sim.phaseStart < 0) {
        sim.phaseStart = now;
      }

      const since = now - sim.phaseStart;

      /* ------------------------------ Phases ------------------------------- */

      if (sim.phase === "emerging") {
        const duration = shouldReduceMotion ? 160 : EMERGE_DURATION;
        const t = since / duration;
        const opening = easeOutCubic(clamp(t / 0.24));
        const closing = easeInOutCubic(clamp((t - 0.66) / 0.34));

        sim.tray = lerp(
          lerp(TRAY_CLOSED, TRAY_OPEN, opening),
          TRAY_CLOSED,
          closing,
        );

        if (t >= 0.22 && !sim.lifted) {
          sim.lifted = true;
          sim.inBox -= 1;
          setInBox(sim.inBox);
        }

        const travel = easeInOutCubic(clamp((t - 0.22) / 0.62));

        sim.opacity = t < 0.22 ? 0 : 1;
        sim.x = lerp(LIFT.x, REST.x, travel);
        sim.y = lerp(LIFT.y, REST.y, travel) - Math.sin(travel * Math.PI) * 26;
        sim.angle = lerp(0, REST.angle, travel);
        sim.vx = 0;
        sim.vy = 0;

        if (t >= 1) {
          sim.tray = TRAY_CLOSED;
          sim.lifted = false;
          enterPhase("ready", now);
        }
      } else if (
        sim.phase === "ready" ||
        sim.phase === "lit" ||
        sim.phase === "out"
      ) {
        const script = sim.script;

        if (script) {
          const elapsed = now - script.start;

          if (script.kind === "strike") {
            const startX = STRIKER.x + STRIKER.width - 18;
            const endX = STRIKER.x + 46;
            const pressY = HEAD_FLOOR - 12;

            if (elapsed < 300) {
              const p = easeInOutCubic(elapsed / 300);
              moveHeadTo(
                lerp(script.fromX, startX, p),
                lerp(script.fromY, pressY, p),
                now,
              );
            } else if (elapsed < 480) {
              const p = easeInOutCubic((elapsed - 300) / 180);
              moveHeadTo(lerp(startX, endX, p), pressY, now);
            } else {
              sim.script = null;

              if (sim.phase === "ready") {
                ignite(now);
              }
            }
          } else {
            const t = elapsed / 1000;
            moveHeadTo(
              script.fromX + Math.sin(t * Math.PI * 2 * 7) * 28,
              script.fromY + Math.sin(t * Math.PI * 2 * 3.5) * 8,
              now,
            );

            if (elapsed > 560) {
              sim.script = null;

              if (sim.phase === "lit") {
                extinguish(now, "shaken");
              }
            }
          }
        } else if (!sim.drag) {
          // Let go, and the match settles back in front of the box.
          const ax = (REST.x - sim.x) * 170 - sim.vx * 22;
          const ay = (REST.y - sim.y) * 170 - sim.vy * 22;
          sim.vx += ax * dt;
          sim.vy += ay * dt;
          sim.x += sim.vx * dt;
          sim.y += sim.vy * dt;
        } else if (now - sim.lastMoveAt > 40) {
          // Held still: the hand's speed bleeds off between pointer events.
          sim.vx *= Math.exp(-dt * 14);
          sim.vy *= Math.exp(-dt * 14);
        }

        // The stick lags behind the hand a touch, then swings back.
        const angleTarget = clamp(
          REST.angle + sim.vx * 0.004 - sim.vy * 0.002,
          -11,
          9,
        );
        sim.angleVelocity +=
          ((angleTarget - sim.angle) * 260 - sim.angleVelocity * 24) * dt;
        sim.angle += sim.angleVelocity * dt;

        sim.heat *= Math.exp(-dt / HEAT_DECAY);
        sim.shake *= Math.exp(-dt / SHAKE_DECAY);

        if (sim.phase === "lit") {
          sim.burn += (dt * 1000) / burnDuration;

          if (sim.burn >= 1) {
            sim.burn = 1;
            extinguish(now, "burnt");
          }
        }

        if (
          sim.phase === "out" &&
          since > OUT_LINGER &&
          !sim.drag &&
          !sim.script
        ) {
          sim.vx *= 0.3;
          sim.vy = -120;
          enterPhase("dropping", now);
        }
      } else if (sim.phase === "dropping") {
        const t = since / (shouldReduceMotion ? 200 : DROP_DURATION);

        if (!shouldReduceMotion) {
          sim.vy += 1700 * dt;
          sim.x += sim.vx * dt;
          sim.y += sim.vy * dt;
          sim.angle += 40 * dt;
        }

        sim.opacity = 1 - easeInOutCubic(clamp(t));

        if (t >= 1) {
          sim.x = REST.x;
          sim.y = REST.y;
          sim.angle = REST.angle;
          sim.vx = 0;
          sim.vy = 0;
          sim.burn = 0;
          sim.litAt = 0;

          if (sim.inBox > 0) {
            enterPhase("emerging", now);
          } else {
            enterPhase("empty", now);
            setAnnouncement("That was the last match. The box is empty.");
          }
        }
      }

      if (sim.phase === "empty") {
        sim.opacity = 0;
        sim.tray = lerp(sim.tray, TRAY_OPEN, 1 - Math.exp(-dt * 8));
      }

      /* ---------------------------- The flame ------------------------------ */

      const burnLength = sim.burn * BURN_REACH;
      const radians = (sim.angle * Math.PI) / 180;
      const along = Math.max(0, burnLength - 3);
      const flameX = sim.x - Math.cos(radians) * along;
      const flameY = sim.y - Math.sin(radians) * along;
      const flicker = shouldReduceMotion
        ? 0
        : 0.07 * Math.sin(now * 0.013 + 1.3) +
          0.05 * Math.sin(now * 0.031) +
          0.035 * Math.sin(now * 0.057 + 0.4);
      let flameHeight = 0;
      let flameWidth = 0;
      let lean = 0;

      if (sim.phase === "lit") {
        const t = (now - sim.litAt) / 1000;
        const flare = shouldReduceMotion ? 0 : Math.exp(-t / 0.2);
        const ramp = shouldReduceMotion ? 1 : clamp(t / 0.12);
        const ending = sim.burn > 0.86 ? 1 - (sim.burn - 0.86) / 0.14 : 1;
        const size = 0.35 + 0.65 * ending;
        const speed = Math.hypot(sim.vx, sim.vy);
        const gutter =
          1 - Math.min(0.55, sim.shake * 0.55) - Math.min(0.25, speed / 6000);

        flameHeight =
          40 *
          ramp *
          size *
          gutter *
          (1 + flicker) *
          (1 + flare * 0.9) *
          (1 + clamp(sim.vy / 2200, -0.3, 0.4));
        flameWidth =
          14 *
          (1 + flare * 0.6) *
          (1 + flicker * 0.5) *
          Math.sqrt(size * gutter);
        lean =
          clamp(-sim.vx * 0.014, -26, 26) +
          (shouldReduceMotion ? 0 : Math.sin(now * 0.009) * 1.4);
      }

      const lit = flameHeight > 0.5;

      /* ---------------------------- Particles ------------------------------ */

      if (!shouldReduceMotion) {
        if (lit && now - sim.lastSmokeAt > 110) {
          sim.lastSmokeAt = now;
          sim.smoke.push({
            age: 0,
            life: random(0.9, 1.4),
            seed: random(0, Math.PI * 2),
            size: random(1, 2),
            vx: random(-6, 6),
            vy: random(-60, -40),
            x: flameX + lean,
            y: flameY - flameHeight,
          });
        }

        if (sim.phase === "out" && since < 2400 && now - sim.lastSmokeAt > 34) {
          sim.lastSmokeAt = now;
          // A thin wisp curls off the ember, thinning out as it cools.
          const strength = 1 - since / 2400;
          sim.smoke.push({
            age: 0,
            life: random(1.4, 2.4) * (0.6 + strength * 0.4),
            seed: random(0, Math.PI * 2),
            size: random(1.5, 3) * (0.5 + strength * 0.5),
            vx: random(-8, 8),
            vy: random(-58, -36),
            x: flameX + random(-1, 1),
            y: flameY - 2,
          });
        }
      }

      sim.sparks = sim.sparks.filter((spark) => {
        spark.age += dt;
        spark.vy += 900 * dt;
        spark.vx *= Math.exp(-dt * 2.5);
        spark.x += spark.vx * dt;
        spark.y += spark.vy * dt;
        return spark.age < spark.life;
      });

      sim.smoke = sim.smoke.filter((puff) => {
        puff.age += dt;
        puff.vx += Math.sin(puff.age * 3.2 + puff.seed) * 34 * dt;
        puff.vy *= Math.exp(-dt * 0.4);
        puff.x += puff.vx * dt;
        puff.y += puff.vy * dt;
        return puff.age < puff.life;
      });

      if (context) {
        const dark = document.documentElement.classList.contains("dark");
        const smokeColor = dark ? "205 205 210" : "105 100 98";

        context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
        context.clearRect(0, 0, STAGE_WIDTH, STAGE_HEIGHT);

        for (const puff of sim.smoke) {
          const progress = puff.age / puff.life;
          const radius = puff.size + puff.age * 10;
          const alpha =
            (dark ? 0.2 : 0.16) *
            Math.sin(Math.min(1, progress * 4) * (Math.PI / 2)) *
            (1 - progress);
          const gradient = context.createRadialGradient(
            puff.x,
            puff.y,
            0,
            puff.x,
            puff.y,
            radius,
          );
          gradient.addColorStop(0, `rgb(${smokeColor} / ${alpha})`);
          gradient.addColorStop(1, `rgb(${smokeColor} / 0)`);
          context.fillStyle = gradient;
          context.beginPath();
          context.arc(puff.x, puff.y, radius, 0, Math.PI * 2);
          context.fill();
        }

        context.lineCap = "round";

        for (const spark of sim.sparks) {
          const progress = spark.age / spark.life;
          context.strokeStyle = `hsl(${42 - progress * 26} 100% ${78 - progress * 30}%)`;
          context.lineWidth = spark.size * (1 - progress * 0.6);
          context.shadowColor = "rgb(255 120 20 / 80%)";
          context.shadowBlur = 4;
          context.beginPath();
          context.moveTo(
            spark.x - spark.vx * 0.014,
            spark.y - spark.vy * 0.014,
          );
          context.lineTo(spark.x, spark.y);
          context.stroke();
        }

        context.shadowBlur = 0;
      }

      /* ------------------------------ Render ------------------------------- */

      if (trayRef.current) {
        trayRef.current.style.transform = `translateX(${sim.tray}px)`;
      }

      const match = matchRef.current;

      if (match) {
        match.style.transform = `translate3d(${sim.x}px, ${sim.y}px, 0) rotate(${sim.angle}deg)`;
        match.style.opacity = String(sim.opacity);
      }

      const burnt = sim.litAt > 0;

      if (charRef.current) {
        charRef.current.style.width = burnt ? `${burnLength + 3}px` : "0px";
      }

      if (charredHeadRef.current) {
        charredHeadRef.current.style.opacity = burnt
          ? String(clamp((now - sim.litAt) / 900))
          : "0";
      }

      let ember = 0;

      if (sim.phase === "lit") {
        ember = 0.85 + flicker;
      } else if (sim.phase === "out" || sim.phase === "dropping") {
        ember = clamp(1 - (now - sim.outAt) / 1600);
      }

      if (emberRef.current) {
        emberRef.current.style.opacity = String(ember);
        emberRef.current.style.transform = `translateX(${-burnLength + 3}px)`;
      }

      const flame = flameRef.current;

      if (flame) {
        flame.setAttribute("transform", `translate(${flameX} ${flameY})`);
        flame.style.opacity = lit ? "1" : "0";

        if (lit) {
          haloRef.current?.setAttribute(
            "d",
            flamePath(flameWidth * 1.7, flameHeight * 1.15, lean),
          );
          outerRef.current?.setAttribute(
            "d",
            flamePath(flameWidth, flameHeight, lean),
          );
          innerRef.current?.setAttribute(
            "d",
            flamePath(flameWidth * 0.52, flameHeight * 0.56, lean * 0.6),
          );
          baseRef.current?.setAttribute("rx", String(flameWidth * 0.42));
        }
      }

      const glow = glowRef.current;

      if (glow) {
        const intensity = lit
          ? clamp(flameHeight / 40, 0, 1.6) * (0.85 + flicker * 1.6)
          : ember * 0.12;
        glow.style.opacity = String(intensity);
        glow.style.transform = `translate(${flameX}px, ${flameY - flameHeight * 0.4}px)`;
      }
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [enterPhase, extinguish, ignite, moveHeadTo]);

  /* ------------------------------ Handlers --------------------------------- */

  const toStage = (event: PointerEvent<HTMLElement>) => {
    const bounds = stageRef.current?.getBoundingClientRect();

    if (!bounds) {
      return { x: event.clientX, y: event.clientY };
    }

    return {
      x: (event.clientX - bounds.left) / scale,
      y: (event.clientY - bounds.top) / scale,
    };
  };

  const canHold = (current: Phase) =>
    current === "ready" || current === "lit" || current === "out";

  function setLifted(lifted: boolean) {
    if (matchRef.current) {
      matchRef.current.style.filter = lifted
        ? "drop-shadow(0 9px 6px rgb(0 0 0 / 22%))"
        : "drop-shadow(0 2px 1.5px rgb(0 0 0 / 25%))";
    }
  }

  function handlePointerDown(event: PointerEvent<HTMLButtonElement>) {
    const sim = simRef.current;

    if (event.button !== 0 || !canHold(sim.phase) || sim.script) {
      return;
    }

    const point = toStage(event);
    event.currentTarget.setPointerCapture(event.pointerId);
    sim.drag = {
      moved: false,
      offsetX: sim.x - point.x,
      offsetY: sim.y - point.y,
      pointerId: event.pointerId,
      startX: point.x,
      startY: point.y,
    };
    sim.lastMoveAt = performance.now();
    sim.vx = 0;
    sim.vy = 0;
    setLifted(true);
    getAudioContext();
  }

  function handlePointerMove(event: PointerEvent<HTMLButtonElement>) {
    const sim = simRef.current;
    const drag = sim.drag;

    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    const point = toStage(event);

    if (Math.hypot(point.x - drag.startX, point.y - drag.startY) > 4) {
      drag.moved = true;
    }

    // Coalesced events keep a fast swipe from skipping across the striker.
    const events = event.nativeEvent.getCoalescedEvents?.() ?? [];
    const bounds = stageRef.current?.getBoundingClientRect();

    if (events.length > 1 && bounds) {
      for (const coalesced of events) {
        moveHeadTo(
          (coalesced.clientX - bounds.left) / scale + drag.offsetX,
          (coalesced.clientY - bounds.top) / scale + drag.offsetY,
          coalesced.timeStamp || performance.now(),
        );
      }

      return;
    }

    moveHeadTo(
      point.x + drag.offsetX,
      point.y + drag.offsetY,
      performance.now(),
    );
  }

  function endDrag(event: PointerEvent<HTMLButtonElement>) {
    const sim = simRef.current;

    if (!sim.drag || sim.drag.pointerId !== event.pointerId) {
      return;
    }

    sim.drag = null;
    setLifted(false);
  }

  function startScript(kind: Script["kind"]) {
    const sim = simRef.current;
    const now = performance.now();

    if (live.current.shouldReduceMotion) {
      if (kind === "strike") {
        ignite(now);
      } else {
        extinguish(now, "shaken");
      }

      return;
    }

    sim.script = { fromX: sim.x, fromY: sim.y, kind, start: now };
    sim.lastMoveAt = now;
    getAudioContext();
  }

  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    const sim = simRef.current;
    const fromKeyboard = event.detail === 0;

    if (sim.script) {
      return;
    }

    // A tap without a drag strikes it for you; a keyboard press can also shake.
    if (sim.phase === "ready" && (fromKeyboard || !sim.lastDragMoved)) {
      startScript("strike");
    } else if (sim.phase === "lit" && fromKeyboard) {
      startScript("shake");
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "Escape" && simRef.current.phase === "lit") {
      event.preventDefault();
      startScript("shake");
    }
  }

  function handleNewBox() {
    const sim = simRef.current;
    const context = wearRef.current?.getContext("2d");

    context?.clearRect(0, 0, STRIKER.width * 2, STRIKER.height * 2);
    sim.inBox = capacity;
    setInBox(capacity);
    setAnnouncement("A fresh box.");
    enterPhase("emerging", performance.now());
  }

  const interactive = canHold(phase);

  return (
    <div className={cn("flex w-full flex-col items-center gap-5", className)}>
      <div
        className="w-full"
        ref={fitRef}
        style={{ height: STAGE_HEIGHT * scale, maxWidth: STAGE_WIDTH }}
      >
        <div
          className="relative origin-top-left select-none"
          ref={stageRef}
          style={{
            height: STAGE_HEIGHT,
            transform: `scale(${scale})`,
            width: STAGE_WIDTH,
          }}
        >
          <BoxShadow />
          <MatchboxTray count={inBox} out={TRAY_CLOSED} trayRef={trayRef} />
          <MatchboxSleeve wearRef={wearRef} />

          <div
            className="absolute top-0 left-0 will-change-transform"
            ref={matchRef}
            style={{
              filter: "drop-shadow(0 2px 1.5px rgb(0 0 0 / 25%))",
              opacity: 0,
              transform: `translate(${REST.x}px, ${REST.y}px) rotate(${REST.angle}deg)`,
            }}
          >
            <MatchStick
              charRef={charRef}
              charredHeadRef={charredHeadRef}
              emberRef={emberRef}
            />
            <button
              aria-disabled={!interactive}
              aria-label={phase === "lit" ? LIT_LABEL : READY_LABEL}
              className={cn(
                "absolute touch-none rounded-full outline-none focus-visible:ring-2 focus-visible:ring-[#ff9a2e] focus-visible:ring-offset-2 focus-visible:ring-offset-grayscale-1 dark:focus-visible:ring-offset-grayscale-2",
                interactive
                  ? "cursor-grab active:cursor-grabbing"
                  : "pointer-events-none",
              )}
              onClick={handleClick}
              onKeyDown={handleKeyDown}
              onLostPointerCapture={endDrag}
              onPointerCancel={endDrag}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={(event) => {
                simRef.current.lastDragMoved =
                  simRef.current.drag?.moved ?? false;
                endDrag(event);
              }}
              style={{
                height: 30,
                left: -MATCH_LENGTH - 6,
                top: -15,
                width: MATCH_LENGTH + 20,
              }}
              type="button"
            />
          </div>

          <div
            aria-hidden="true"
            className="pointer-events-none absolute top-0 left-0 rounded-full opacity-0 dark:mix-blend-screen"
            ref={glowRef}
          >
            <div className="absolute" style={glowStyle} />
          </div>

          <svg
            aria-hidden="true"
            className="pointer-events-none absolute top-0 left-0 overflow-visible"
            height={STAGE_HEIGHT}
            width={STAGE_WIDTH}
          >
            <FlameDefs id={id} />
            <g ref={flameRef} style={{ opacity: 0 }}>
              <path
                fill="#ff8c2a"
                filter={`url(#${id}-blur)`}
                opacity="0.5"
                ref={haloRef}
              />
              <path fill={`url(#${id}-outer)`} ref={outerRef} />
              <ellipse
                cy="1.5"
                fill="#5b84ff"
                filter={`url(#${id}-soft)`}
                opacity="0.55"
                ref={baseRef}
                ry="3.2"
              />
              <path
                fill={`url(#${id}-inner)`}
                ref={innerRef}
                transform="translate(0 1)"
              />
            </g>
          </svg>

          <canvas
            className="pointer-events-none absolute inset-0 size-full"
            ref={particlesRef}
          />
        </div>
      </div>

      <div className="flex h-7 items-center gap-3">
        <div className="flex items-baseline gap-2">
          <span className="font-medium font-mono text-[9px] text-grayscale-10 uppercase tracking-[0.06em]">
            In the box
          </span>
          <span className="font-medium font-mono text-grayscale-12 text-xs tabular-nums">
            <NumberFlow value={inBox} />
          </span>
        </div>
        {phase === "empty" ? (
          <button
            className="h-7 rounded-lg border border-grayscale-4 bg-grayscale-1 px-2.5 font-medium text-grayscale-12 text-xs transition-colors hover:bg-grayscale-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-grayscale-7 dark:bg-grayscale-3 dark:hover:bg-grayscale-4"
            onClick={handleNewBox}
            type="button"
          >
            Open a new box
          </button>
        ) : null}
      </div>

      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
