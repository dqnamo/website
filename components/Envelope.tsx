"use client";

import {
  type AnimationPlaybackControls,
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
/* Geometry                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Everything is drawn in a 200 × 128 box and scaled with the envelope, so the
 * whole thing can be sized by its width alone.
 */
const VIEW_WIDTH = 200;
const VIEW_HEIGHT = 128;
/** The top flap is 80 units deep: 62.5% of the envelope's height. */
const FLAP_HEIGHT = 80;
const FLAP_RATIO = FLAP_HEIGHT / VIEW_HEIGHT;
/** The letter is 88% as tall as the envelope and rises 84% of its height. */
const LETTER_RATIO = 0.88;
const LETTER_TRAVEL = 0.84;

/** The top flap, with its tip rounded where it was folded and pressed. */
const FLAP_PATH = "M0 0 H200 L106.5 75.6 Q100 81 93.5 75.6 Z";
/** The same flap seen from inside, once it has turned over the hinge. */
const FLAP_INSIDE_PATH = "M0 80 H200 L106.5 4.4 Q100 -1 93.5 4.4 Z";
/** The liner stops a few millimetres short of the flap's edges. */
const LINER_PATH = "M10 80 H190 L104.5 11.5 Q100 7.5 95.5 11.5 Z";

const LEFT_FLAP_PATH = "M0 0 L96.5 67.4 Q100 70 96.5 72.6 L0 128 Z";
const RIGHT_FLAP_PATH = "M200 0 L103.5 67.4 Q100 70 103.5 72.6 L200 128 Z";
const BOTTOM_FLAP_PATH = "M0 128 L94.2 65.6 Q100 61.6 105.8 65.6 L200 128 Z";
const BACK_LINER_PATH = "M7 0 H193 L100 64 Z";

const SEAL_X = 100;
const SEAL_Y = 72.5;
const SEAL_RADIUS = 14;

function round(value: number) {
  return Math.round(value * 100) / 100;
}

/** A blob of wax: a circle that has spread a little unevenly as it cooled. */
const WAX_PATH = (() => {
  const count = 30;
  const points = Array.from({ length: count }, (_, index) => {
    const angle = (index / count) * Math.PI * 2;
    const radius =
      SEAL_RADIUS *
      (1 +
        0.055 * Math.sin(angle * 3 + 0.6) +
        0.035 * Math.sin(angle * 7 + 1.9) +
        0.02 * Math.sin(angle * 11 + 0.3));

    return [
      SEAL_X + Math.cos(angle) * radius,
      SEAL_Y + Math.sin(angle) * radius,
    ] as const;
  });
  const midpoint = (a: readonly number[], b: readonly number[]) =>
    [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] as const;
  const start = midpoint(points[count - 1], points[0]);
  let path = `M${round(start[0])} ${round(start[1])}`;

  for (let index = 0; index < count; index += 1) {
    const point = points[index];
    const next = midpoint(point, points[(index + 1) % count]);
    path += ` Q${round(point[0])} ${round(point[1])} ${round(next[0])} ${round(next[1])}`;
  }

  return `${path} Z`;
})();

/** Where the flap's edge runs, so the wax can crack right along it. */
function flapEdgeAt(x: number) {
  const fromCentre = Math.abs(x - 100);

  if (fromCentre < 6.5) {
    return 79.4 - (fromCentre * fromCentre) / 11;
  }

  return (75.6 * (100 - fromCentre)) / 93.5;
}

/**
 * A jagged crack that runs just outside the flap's edge, so the wax that sat
 * on the flap leaves with it and the rest stays stuck to the envelope.
 */
const CRACK_POINTS = (() => {
  const jitter = [0.9, 0.2, 1.1, 0.4, 1.2, 0.3, 0.8, 1.3, 0.2, 1, 0.5, 1.2];
  const points: string[] = [];

  for (let index = 0; index <= 18; index += 1) {
    const x = SEAL_X - 20 + index * (40 / 18);
    const y = flapEdgeAt(x) + 0.3 + jitter[index % jitter.length];
    points.push(`${round(x)} ${round(y)}`);
  }

  return points;
})();
const SEAL_ON_FLAP_CLIP = `M${SEAL_X - 20} 40 L${CRACK_POINTS.join(" L")} L${SEAL_X + 20} 40 Z`;
const SEAL_ON_BODY_CLIP = `M${SEAL_X - 20} 110 L${CRACK_POINTS.join(" L")} L${SEAL_X + 20} 110 Z`;

/* -------------------------------------------------------------------------- */
/* Paper                                                                       */
/* -------------------------------------------------------------------------- */

export type EnvelopePaper = "cream" | "kraft" | "airmail";

type PaperTheme = {
  /** Outside of the paper, lit from above. */
  light: string;
  paper: string;
  shade: string;
  /** Inside of the envelope, which never sees the light. */
  inside: string;
  crease: string;
  liner: { ground: string; ink: string; kind: "dots" | "stripes" | "tissue" };
  wax: { light: string; base: string; dark: string; emboss: string };
  airmail?: boolean;
};

export const ENVELOPE_PAPERS: Record<EnvelopePaper, PaperTheme> = {
  cream: {
    light: "#faf4e7",
    paper: "#f3eadb",
    shade: "#e8dcc6",
    inside: "#ddd0b7",
    crease: "rgba(116, 88, 46, 0.28)",
    liner: { ground: "#1f2b4d", ink: "#d9b45f", kind: "dots" },
    wax: {
      light: "#d2464b",
      base: "#a5222a",
      dark: "#6c1118",
      emboss: "#5a0c12",
    },
  },
  kraft: {
    light: "#d3ae80",
    paper: "#c69d6d",
    shade: "#b98f5f",
    inside: "#a98052",
    crease: "rgba(74, 44, 14, 0.32)",
    liner: { ground: "#2e4a3b", ink: "#e6dcc3", kind: "stripes" },
    wax: {
      light: "#3b6b55",
      base: "#24493a",
      dark: "#122a20",
      emboss: "#0c1f17",
    },
  },
  airmail: {
    light: "#ffffff",
    paper: "#f6f7fa",
    shade: "#eaedf3",
    inside: "#dde2ec",
    crease: "rgba(42, 62, 112, 0.22)",
    liner: { ground: "#a9c0e6", ink: "#f4f7fd", kind: "tissue" },
    wax: {
      light: "#4e73bd",
      base: "#28478c",
      dark: "#142856",
      emboss: "#0e1d42",
    },
    airmail: true,
  },
};

function PaperDefs({ id, theme }: { id: string; theme: PaperTheme }) {
  const { liner, wax } = theme;

  return (
    <defs>
      <linearGradient id={`${id}-flap`} x1="0" x2="0" y1="0" y2="1">
        <stop offset="0" stopColor={theme.light} />
        <stop offset="1" stopColor={theme.paper} />
      </linearGradient>
      <linearGradient id={`${id}-side`} x1="0" x2="1" y1="0" y2="0">
        <stop offset="0" stopColor={theme.paper} />
        <stop offset="0.5" stopColor={theme.shade} />
        <stop offset="1" stopColor={theme.paper} />
      </linearGradient>
      <linearGradient id={`${id}-bottom`} x1="0" x2="0" y1="0" y2="1">
        <stop offset="0" stopColor={theme.light} />
        <stop offset="1" stopColor={theme.paper} />
      </linearGradient>
      <radialGradient cx="0.38" cy="0.34" id={`${id}-wax`} r="0.75">
        <stop offset="0" stopColor={wax.light} />
        <stop offset="0.55" stopColor={wax.base} />
        <stop offset="1" stopColor={wax.dark} />
      </radialGradient>

      {liner.kind === "dots" ? (
        <pattern
          height="7"
          id={`${id}-liner`}
          patternUnits="userSpaceOnUse"
          width="7"
        >
          <rect fill={liner.ground} height="7" width="7" />
          <circle cx="1.75" cy="1.75" fill={liner.ink} r="0.75" />
          <circle cx="5.25" cy="5.25" fill={liner.ink} r="0.75" />
        </pattern>
      ) : null}
      {liner.kind === "stripes" ? (
        <pattern
          height="6"
          id={`${id}-liner`}
          patternTransform="rotate(-35)"
          patternUnits="userSpaceOnUse"
          width="6"
        >
          <rect fill={liner.ground} height="6" width="6" />
          <rect fill={liner.ink} height="6" opacity="0.85" width="1.6" />
        </pattern>
      ) : null}
      {liner.kind === "tissue" ? (
        <pattern
          height="6"
          id={`${id}-liner`}
          patternUnits="userSpaceOnUse"
          width="6"
        >
          <rect fill={liner.ground} height="6" width="6" />
          <path
            d="M0 3 L3 0 L6 3 L3 6 Z"
            fill="none"
            stroke={liner.ink}
            strokeWidth="0.45"
          />
          <circle cx="3" cy="3" fill={liner.ink} r="0.5" />
        </pattern>
      ) : null}

      <filter height="1.6" id={`${id}-lift`} width="1.4" x="-0.2" y="-0.2">
        <feDropShadow
          dx="0"
          dy="0.9"
          floodColor="#2a1d0c"
          floodOpacity="0.2"
          stdDeviation="0.9"
        />
      </filter>
      <filter height="2" id={`${id}-seal`} width="2" x="-0.5" y="-0.5">
        <feDropShadow
          dx="0"
          dy="1"
          floodColor="#1a0d05"
          floodOpacity="0.35"
          stdDeviation="0.8"
        />
      </filter>
    </defs>
  );
}

/** The wax, pressed with a ring and a monogram. Drawn whole, then clipped. */
function SealArt({
  clipId,
  id,
  monogram,
  theme,
}: {
  clipId: string;
  id: string;
  monogram: string;
  theme: PaperTheme;
}) {
  const { wax } = theme;

  return (
    <g clipPath={`url(#${clipId})`}>
      <g filter={`url(#${id}-seal)`}>
        <path d={WAX_PATH} fill={`url(#${id}-wax)`} />
        {/* The ring the seal pressed in, catching light on its lower lip. */}
        <circle
          cx={SEAL_X}
          cy={SEAL_Y + 0.5}
          fill="none"
          r={9.6}
          stroke="rgba(255,255,255,0.22)"
          strokeWidth="1"
        />
        <circle
          cx={SEAL_X}
          cy={SEAL_Y}
          fill={wax.base}
          r={9.6}
          stroke={wax.emboss}
          strokeOpacity="0.7"
          strokeWidth="0.9"
        />
        <text
          fill="rgba(255,255,255,0.22)"
          fontFamily="Georgia, 'Times New Roman', serif"
          fontSize="13"
          fontStyle="italic"
          textAnchor="middle"
          x={SEAL_X + 0.35}
          y={SEAL_Y + 4.9}
        >
          {monogram}
        </text>
        <text
          fill={wax.emboss}
          fontFamily="Georgia, 'Times New Roman', serif"
          fontSize="13"
          fontStyle="italic"
          textAnchor="middle"
          x={SEAL_X}
          y={SEAL_Y + 4.4}
        >
          {monogram}
        </text>
        <ellipse
          cx={SEAL_X - 5}
          cy={SEAL_Y - 7.5}
          fill="rgba(255,255,255,0.28)"
          rx="3.4"
          ry="1.4"
          transform={`rotate(-28 ${SEAL_X - 5} ${SEAL_Y - 7.5})`}
        />
      </g>
    </g>
  );
}

/** The pocket's border: the whole outer edge, 5.5 units deep. */
const AIRMAIL_POCKET_BAND = "M0 0 H200 V128 H0 Z M5.5 5.5 V122.5 H194.5 V5.5 Z";
/** On the flap only the hinge is an outer edge; it lines up with the pocket. */
const AIRMAIL_FLAP_BAND = "M0 0 H200 V5.5 H0 Z";

/**
 * Red and blue barber-pole stripes, drawn as shapes rather than an SVG
 * pattern, which some browsers paint with a stray white tile behind it.
 */
const AIRMAIL_STRIPES = Array.from({ length: 20 }, (_, index) => {
  const x = -130 + index * 18;
  return {
    blue: `M${x + 9} 0 h5.6 l128 128 h-5.6 Z`,
    red: `M${x} 0 h5.6 l128 128 h-5.6 Z`,
  };
});

function AirmailBorder({
  band,
  clipId,
  height,
}: {
  band: string;
  clipId: string;
  /** How tall a box to draw in. Stripes outside it are cut off. */
  height: number;
}) {
  // A nested <svg> crops what it draws, so the oversized stripes never widen
  // the layer that the browser has to paint.
  return (
    <svg
      aria-hidden="true"
      height={height}
      overflow="hidden"
      width={VIEW_WIDTH}
    >
      <clipPath id={clipId}>
        <path clipRule="evenodd" d={band} />
      </clipPath>
      <g clipPath={`url(#${clipId})`}>
        {AIRMAIL_STRIPES.map((stripe) => (
          <g key={stripe.red}>
            <path d={stripe.red} fill="#d8443b" />
            <path d={stripe.blue} fill="#24479a" />
          </g>
        ))}
      </g>
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/* The artwork, shared by the live envelope and the static preview             */
/* -------------------------------------------------------------------------- */

type MotionStyle = {
  [key: string]: MotionValue<number> | MotionValue<string> | number | string;
};

type EnvelopeArtProps = {
  children?: ReactNode;
  flapClassName?: string;
  flapStyle?: MotionStyle;
  frontShade?: MotionValue<number> | number;
  backShade?: MotionValue<number> | number;
  letterClassName?: string;
  letterHidden?: boolean;
  letterId?: string;
  letterStyle?: MotionStyle;
  monogram: string;
  paper: EnvelopePaper;
};

function EnvelopeArt({
  backShade = 0,
  children,
  flapClassName,
  flapStyle,
  frontShade = 0,
  letterClassName,
  letterHidden,
  letterId,
  letterStyle,
  monogram,
  paper,
}: EnvelopeArtProps) {
  const theme = ENVELOPE_PAPERS[paper];
  const id = `envelope-${useId().replace(/[^\w-]/g, "")}`;

  return (
    <>
      {/* Inside the back of the envelope, with its lining. */}
      <svg
        aria-hidden="true"
        className="absolute inset-0 z-0 size-full overflow-visible rounded-[3px] drop-shadow-[0_10px_14px_rgba(40,26,8,0.16)] dark:drop-shadow-[0_12px_18px_rgba(0,0,0,0.45)]"
        preserveAspectRatio="none"
        viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
      >
        <PaperDefs id={`${id}-b`} theme={theme} />
        <rect
          fill={theme.inside}
          height={VIEW_HEIGHT}
          rx="2.5"
          width={VIEW_WIDTH}
        />
        <path d={BACK_LINER_PATH} fill={`url(#${id}-b-liner)`} />
      </svg>

      {/* The letter, tucked in between the back and the pocket. */}
      <motion.div
        aria-hidden={letterHidden || undefined}
        className={cn(
          "@container absolute top-[9%] left-[5.5%] z-[2] h-[88%] w-[89%] origin-bottom overflow-hidden rounded-[2px] bg-[#fdfbf6] text-[#2b2620] shadow-[0_0_0_0.5px_rgba(60,44,20,0.18),0_2px_6px_rgba(40,28,10,0.12)]",
          letterClassName,
        )}
        id={letterId}
        inert={letterHidden}
        style={letterStyle}
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.7),transparent_30%,rgba(120,96,60,0.06))]"
        />
        <div className="relative size-full">{children}</div>
      </motion.div>

      {/* The pocket: side flaps, the bottom flap and the wax left behind. */}
      <svg
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-[3] size-full overflow-hidden"
        preserveAspectRatio="none"
        viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
      >
        <PaperDefs id={`${id}-p`} theme={theme} />
        <clipPath id={`${id}-p-envelope`}>
          <rect height={VIEW_HEIGHT} rx="2.5" width={VIEW_WIDTH} />
        </clipPath>
        <clipPath id={`${id}-p-wax-clip`}>
          <path d={SEAL_ON_BODY_CLIP} />
        </clipPath>
        <g clipPath={`url(#${id}-p-envelope)`}>
          <g filter={`url(#${id}-p-lift)`}>
            <path d={LEFT_FLAP_PATH} fill={`url(#${id}-p-side)`} />
            <path d={RIGHT_FLAP_PATH} fill={`url(#${id}-p-side)`} />
          </g>
          <path
            d={BOTTOM_FLAP_PATH}
            fill={`url(#${id}-p-bottom)`}
            filter={`url(#${id}-p-lift)`}
          />
          <path
            d="M0 0 L96.5 67.4 M200 0 L103.5 67.4 M0 128 L94.2 65.6 M200 128 L105.8 65.6"
            stroke={theme.crease}
            strokeWidth="0.5"
          />
          {theme.airmail ? (
            <AirmailBorder
              band={AIRMAIL_POCKET_BAND}
              clipId={`${id}-p-airmail-clip`}
              height={VIEW_HEIGHT}
            />
          ) : null}
        </g>
        <SealArt
          clipId={`${id}-p-wax-clip`}
          id={`${id}-p`}
          monogram={monogram}
          theme={theme}
        />
      </svg>

      {/* The top flap, hinged along the top edge. */}
      <motion.div
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-x-0 top-0 z-[4] h-[62.5%] origin-top transform-3d",
          flapClassName,
        )}
        style={flapStyle}
      >
        <svg
          aria-hidden="true"
          className="absolute inset-0 size-full overflow-visible backface-hidden"
          preserveAspectRatio="none"
          viewBox={`0 0 ${VIEW_WIDTH} ${FLAP_HEIGHT}`}
        >
          <PaperDefs id={`${id}-f`} theme={theme} />
          <clipPath id={`${id}-f-wax-clip`}>
            <path d={SEAL_ON_FLAP_CLIP} />
          </clipPath>
          <path
            d={FLAP_PATH}
            fill={`url(#${id}-f-flap)`}
            filter={`url(#${id}-f-lift)`}
          />
          {theme.airmail ? (
            <AirmailBorder
              band={AIRMAIL_FLAP_BAND}
              clipId={`${id}-f-airmail-clip`}
              height={6}
            />
          ) : null}
          <motion.path
            d={FLAP_PATH}
            fill="#1d1408"
            style={{ opacity: frontShade }}
          />
          <SealArt
            clipId={`${id}-f-wax-clip`}
            id={`${id}-f`}
            monogram={monogram}
            theme={theme}
          />
        </svg>
        <svg
          aria-hidden="true"
          className="absolute inset-0 size-full rotate-x-180 overflow-visible backface-hidden"
          preserveAspectRatio="none"
          viewBox={`0 0 ${VIEW_WIDTH} ${FLAP_HEIGHT}`}
        >
          <PaperDefs id={`${id}-i`} theme={theme} />
          <path d={FLAP_INSIDE_PATH} fill={theme.inside} />
          <path d={LINER_PATH} fill={`url(#${id}-i-liner)`} />
          <motion.path
            d={FLAP_INSIDE_PATH}
            fill="#1d1408"
            style={{ opacity: backShade }}
          />
        </svg>
      </motion.div>
    </>
  );
}

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

/** Paper only ever makes noise, so one second of it does for every sound. */
function getNoise(context: AudioContext) {
  if (!noiseBuffer) {
    noiseBuffer = context.createBuffer(
      1,
      context.sampleRate,
      context.sampleRate,
    );
    const data = noiseBuffer.getChannelData(0);

    for (let index = 0; index < data.length; index += 1) {
      data[index] = Math.random() * 2 - 1;
    }
  }

  return noiseBuffer;
}

type PaperSound = "crack" | "slide" | "flap";

function playNoise(
  context: AudioContext,
  at: number,
  duration: number,
  filterType: BiquadFilterType,
  frequency: number,
  peak: number,
  attack: number,
  frequencyTo?: number,
) {
  const source = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const gain = context.createGain();

  source.buffer = getNoise(context);
  filter.type = filterType;
  filter.frequency.setValueAtTime(frequency, at);
  filter.Q.value = 0.8;

  if (frequencyTo) {
    filter.frequency.exponentialRampToValueAtTime(frequencyTo, at + duration);
  }

  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(peak, at + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
  source.connect(filter).connect(gain).connect(context.destination);
  source.start(at, Math.random() * 0.4, duration + 0.02);
}

function playPaper(kind: PaperSound) {
  const context = getAudioContext();

  if (!context) {
    return;
  }

  const now = context.currentTime;

  if (kind === "crack") {
    // Brittle wax: two sharp ticks, the second a touch lower.
    playNoise(context, now, 0.035, "bandpass", 3200, 0.7, 0.002);
    playNoise(context, now + 0.022, 0.05, "bandpass", 1700, 0.45, 0.002);
  } else if (kind === "slide") {
    // Paper dragged against paper: a soft, rising hiss.
    playNoise(context, now, 0.42, "bandpass", 1800, 0.14, 0.09, 4600);
  } else {
    // The flap landing flat: a dull pat.
    playNoise(context, now, 0.09, "lowpass", 650, 0.6, 0.004);
  }
}

function buzz(duration: number) {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    navigator.vibrate?.(duration);
  }
}

/* -------------------------------------------------------------------------- */
/* The envelope                                                                */
/* -------------------------------------------------------------------------- */

const FLAP_OPEN = { damping: 19, stiffness: 210, type: "spring" } as const;
const FLAP_CLOSE = { damping: 24, stiffness: 320, type: "spring" } as const;
const FLAP_HOVER = { damping: 18, stiffness: 300, type: "spring" } as const;
const LETTER_OUT = { damping: 17, stiffness: 170, type: "spring" } as const;
const LETTER_IN = { damping: 30, stiffness: 380, type: "spring" } as const;
/** How far the flap lifts on its crease when a pointer hovers. */
const HOVER_ANGLE = 18;
/** The wax gives way once the flap has been bent this far. */
const CRACK_ANGLE = 26;

export type EnvelopeProps = {
  /** The letter inside. It is sized in container units, so use `cqw`. */
  children: ReactNode;
  /** Who the envelope is from, for its accessible name. */
  label?: string;
  paper?: EnvelopePaper;
  /** One or two letters pressed into the wax. */
  monogram?: string;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Play a crack, a slide and a pat as the envelope is used. */
  sound?: boolean;
  className?: string;
  style?: CSSProperties;
};

type Drag = {
  grab: number;
  mode: "flap" | "letter";
  moved: boolean;
  /** Set once this same gesture has swung the flap all the way over. */
  openedFlap: boolean;
  pointerId: number;
  samples: { t: number; v: number }[];
  startValue: number;
  startX: number;
  startY: number;
  travel: number;
};

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

function velocityOf(samples: Drag["samples"], now: number) {
  const last = samples[samples.length - 1];

  // A hand that stopped before letting go has no velocity left to give.
  if (samples.length < 2 || now - last.t > 90) {
    return 0;
  }

  const first = samples[0];
  const seconds = (last.t - first.t) / 1000;

  return seconds > 0 ? (last.v - first.v) / seconds : 0;
}

export function Envelope({
  children,
  className,
  defaultOpen = false,
  label = "Envelope",
  monogram = "d",
  onOpenChange,
  open: controlledOpen,
  paper = "cream",
  sound = true,
  style,
}: EnvelopeProps) {
  const shouldReduceMotion = useReducedMotion();
  const letterId = useId();
  const initialOpen = controlledOpen ?? defaultOpen;
  const [isOpen, setIsOpen] = useState(initialOpen);

  const angle = useMotionValue(initialOpen ? 180 : 0);
  const lift = useMotionValue(initialOpen ? 1 : 0);
  // Past upright the flap goes behind the letter instead of over it.
  const flapZ = useTransform(angle, (value): number => (value > 90 ? 1 : 4));
  const frontShade = useTransform(angle, [0, 90], [0, 0.3], { clamp: true });
  const backShade = useTransform(angle, [90, 180], [0.34, 0], { clamp: true });
  const letterY = useTransform(
    lift,
    (value) => `${-value * LETTER_TRAVEL * 100}%`,
  );
  const letterRotate = useTransform(lift, [0, 1], [0, -1.4]);

  const rootRef = useRef<HTMLDivElement>(null);
  const openRef = useRef(initialOpen);
  const sealedRef = useRef(!initialOpen);
  const restingRef = useRef(!initialOpen);
  const soundRef = useRef(sound);
  const runRef = useRef(0);
  const animationsRef = useRef<AnimationPlaybackControls[]>([]);
  const listenersRef = useRef<(() => void)[]>([]);
  const dragRef = useRef<Drag | null>(null);

  soundRef.current = sound;

  // The wax cracks once, the first time the flap is bent far enough.
  useEffect(
    () =>
      angle.on("change", (value) => {
        if (sealedRef.current && value > CRACK_ANGLE) {
          sealedRef.current = false;

          if (soundRef.current) {
            playPaper("crack");
          }

          buzz(8);
        }
      }),
    [angle],
  );

  const stopAll = useCallback(() => {
    runRef.current += 1;

    for (const animation of animationsRef.current) {
      animation.stop();
    }

    for (const unsubscribe of listenersRef.current) {
      unsubscribe();
    }

    animationsRef.current = [];
    listenersRef.current = [];
  }, []);

  /** Run `then` as soon as `value` passes `test`, unless something else starts. */
  const whenPast = useCallback(
    (
      value: MotionValue<number>,
      test: (v: number) => boolean,
      then: () => void,
    ) => {
      const run = runRef.current;

      if (test(value.get())) {
        then();
        return;
      }

      const unsubscribe = value.on("change", (next) => {
        if (run === runRef.current && test(next)) {
          unsubscribe();
          then();
        }
      });
      listenersRef.current.push(unsubscribe);
    },
    [],
  );

  const setOpen = useCallback(
    (next: boolean) => {
      openRef.current = next;
      setIsOpen(next);

      if (controlledOpen === undefined || controlledOpen !== next) {
        onOpenChange?.(next);
      }
    },
    [controlledOpen, onOpenChange],
  );

  const runOpen = useCallback(
    (flapVelocity = 0, letterVelocity = 0) => {
      stopAll();
      restingRef.current = false;
      setOpen(true);

      if (shouldReduceMotion) {
        sealedRef.current = false;
        angle.set(180);
        lift.set(1);
        return;
      }

      if (angle.get() < 179.5) {
        animationsRef.current.push(
          animate(angle, 180, { ...FLAP_OPEN, velocity: flapVelocity }),
        );
      }

      // The letter only slides once the flap is out of its way.
      whenPast(
        angle,
        (value) => value > 150,
        () => {
          if (soundRef.current && lift.get() < 0.6) {
            playPaper("slide");
          }

          animationsRef.current.push(
            animate(lift, 1, { ...LETTER_OUT, velocity: letterVelocity }),
          );
        },
      );
    },
    [angle, lift, setOpen, shouldReduceMotion, stopAll, whenPast],
  );

  const runClose = useCallback(
    (flapVelocity = 0, letterVelocity = 0) => {
      stopAll();
      setOpen(false);

      const settle = () => {
        sealedRef.current = true;
        restingRef.current = true;
      };

      if (shouldReduceMotion) {
        lift.set(0);
        angle.set(0);
        settle();
        return;
      }

      const closeFlap = () => {
        animationsRef.current.push(
          animate(angle, 0, {
            ...FLAP_CLOSE,
            onComplete: () => {
              settle();

              if (soundRef.current) {
                playPaper("flap");
              }

              buzz(5);
            },
            velocity: flapVelocity,
          }),
        );
      };

      if (lift.get() > 0.02) {
        if (soundRef.current && lift.get() > 0.3) {
          playPaper("slide");
        }

        animationsRef.current.push(
          animate(lift, 0, { ...LETTER_IN, velocity: letterVelocity }),
        );
        // Tuck the letter almost all the way before folding the flap down.
        whenPast(lift, (value) => value < 0.1, closeFlap);
      } else {
        closeFlap();
      }
    },
    [angle, lift, setOpen, shouldReduceMotion, stopAll, whenPast],
  );

  const toggle = useCallback(() => {
    if (openRef.current) {
      runClose();
    } else {
      runOpen();
    }
  }, [runClose, runOpen]);

  // Follow a controlled `open` that changed from outside.
  useEffect(() => {
    if (controlledOpen === undefined || controlledOpen === openRef.current) {
      return;
    }

    if (controlledOpen) {
      runOpen();
    } else {
      runClose();
    }
  }, [controlledOpen, runClose, runOpen]);

  useEffect(() => stopAll, [stopAll]);

  function startFlapDrag(drag: Drag, clientY: number, bounds: DOMRect) {
    const flapPixels = bounds.height * FLAP_RATIO;

    drag.mode = "flap";
    drag.startY = clientY;
    drag.startValue = angle.get();
    // Treat the hand as holding the flap where it grabbed it, never too near
    // the hinge, so a short drag can't whip it round.
    drag.grab = clamp(clientY - bounds.top, flapPixels * 0.45, flapPixels);
    drag.samples = [];
  }

  function startLetterDrag(drag: Drag, clientY: number, bounds: DOMRect) {
    drag.mode = "letter";
    drag.startY = clientY;
    drag.startValue = lift.get();
    drag.travel = bounds.height * LETTER_RATIO * LETTER_TRAVEL;
    drag.samples = [];
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || !rootRef.current) {
      return;
    }

    const bounds = rootRef.current.getBoundingClientRect();
    const drag: Drag = {
      grab: 1,
      mode: "flap",
      moved: false,
      openedFlap: false,
      pointerId: event.pointerId,
      samples: [],
      startValue: 0,
      startX: event.clientX,
      startY: event.clientY,
      travel: 1,
    };

    if (openRef.current && angle.get() > 120) {
      startLetterDrag(drag, event.clientY, bounds);
    } else {
      startFlapDrag(drag, event.clientY, bounds);
    }

    dragRef.current = drag;
    event.currentTarget.setPointerCapture(event.pointerId);
    getAudioContext();
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;

    if (!drag || drag.pointerId !== event.pointerId || !rootRef.current) {
      return;
    }

    if (!drag.moved) {
      if (
        Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 4
      ) {
        return;
      }

      drag.moved = true;
      stopAll();
      restingRef.current = false;
    }

    const bounds = rootRef.current.getBoundingClientRect();
    const dy = event.clientY - drag.startY;
    let value: number;

    if (drag.mode === "flap") {
      // Keep the flap's tip under the hand as it swings over the hinge.
      const reach = drag.grab * Math.cos((drag.startValue * Math.PI) / 180);
      const cosine = clamp((reach + dy) / drag.grab, -1, 1);
      value = (Math.acos(cosine) * 180) / Math.PI;
      angle.set(value);

      // Pulled all the way over: carry straight on into the letter.
      if (value > 178 && dy < 0) {
        startLetterDrag(drag, event.clientY, bounds);
        drag.openedFlap = true;
      }
    } else {
      const raw = drag.startValue - dy / drag.travel;
      // The letter catches on the pocket's rim before it comes right out.
      value = raw > 1 ? 1 + 0.12 * (1 - Math.exp(-(raw - 1) / 0.12)) : raw;
      lift.set(Math.max(0, value));

      // Pushed all the way in: carry straight on into folding the flap.
      if (raw < 0) {
        lift.set(0);
        startFlapDrag(drag, event.clientY, bounds);
        drag.grab = bounds.height * FLAP_RATIO;
      }
    }

    drag.samples.push({ t: event.timeStamp, v: value });

    while (
      drag.samples.length > 2 &&
      event.timeStamp - drag.samples[0].t > 90
    ) {
      drag.samples.shift();
    }
  }

  function handlePointerUp(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;

    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    dragRef.current = null;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    if (!drag.moved) {
      if (event.type === "pointerup") {
        toggle();
      }

      return;
    }

    const velocity = velocityOf(drag.samples, event.timeStamp);

    if (drag.mode === "flap") {
      const opening = velocity > 500 || (angle.get() > 90 && velocity > -500);

      if (opening) {
        runOpen(velocity);
      } else {
        runClose(velocity);
      }

      return;
    }

    // Swinging the flap over and letting go is a clear enough "open"; only a
    // letter pushed back down, or flicked down, goes back in.
    const keepOut =
      velocity > 2.5 ||
      (velocity > -2.5 && (drag.openedFlap || lift.get() > 0.4));

    if (keepOut) {
      runOpen(0, velocity);
    } else {
      runClose(0, velocity);
    }
  }

  function handlePointerEnter(event: PointerEvent<HTMLDivElement>) {
    if (
      event.pointerType !== "mouse" ||
      dragRef.current ||
      !restingRef.current ||
      shouldReduceMotion
    ) {
      return;
    }

    stopAll();
    animationsRef.current.push(animate(angle, HOVER_ANGLE, FLAP_HOVER));
  }

  function handlePointerLeave(event: PointerEvent<HTMLDivElement>) {
    if (
      event.pointerType !== "mouse" ||
      dragRef.current ||
      !restingRef.current
    ) {
      return;
    }

    stopAll();
    animationsRef.current.push(animate(angle, 0, FLAP_HOVER));
  }

  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    // Pointer clicks are handled on release; this is for keys and assistive tech.
    if (event.detail === 0) {
      toggle();
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "Escape" && openRef.current) {
      event.preventDefault();
      runClose();
    }
  }

  return (
    <div
      className={cn(
        "relative aspect-[200/128] w-[340px] max-w-full touch-none select-none",
        className,
      )}
      onPointerCancel={handlePointerUp}
      onPointerDown={handlePointerDown}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      ref={rootRef}
      style={style}
    >
      <EnvelopeArt
        backShade={backShade}
        flapStyle={{ rotateX: angle, transformPerspective: 900, zIndex: flapZ }}
        frontShade={frontShade}
        letterClassName={cn(
          isOpen ? "cursor-grab active:cursor-grabbing" : undefined,
        )}
        letterHidden={!isOpen}
        letterId={letterId}
        letterStyle={{ rotate: letterRotate, y: letterY }}
        monogram={monogram}
        paper={paper}
      >
        {children}
      </EnvelopeArt>

      <button
        aria-controls={letterId}
        aria-expanded={isOpen}
        aria-label={
          isOpen ? `${label}: put the letter back` : `${label}: break the seal`
        }
        className="absolute inset-0 z-[5] cursor-pointer rounded-[3px] outline-none focus-visible:outline-2 focus-visible:outline-grayscale-8 focus-visible:outline-offset-4"
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        type="button"
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* A static envelope that opens with CSS, for previews                         */
/* -------------------------------------------------------------------------- */

export type EnvelopeFaceProps = {
  children?: ReactNode;
  className?: string;
  /** Classes for the flap. It needs `perspective()` and `rotateX()` in them. */
  flapClassName?: string;
  /** Classes for the letter, e.g. a translate to slide it out. */
  letterClassName?: string;
  monogram?: string;
  paper?: EnvelopePaper;
};

export function EnvelopeFace({
  children,
  className,
  flapClassName,
  letterClassName,
  monogram = "d",
  paper = "cream",
}: EnvelopeFaceProps) {
  return (
    <div
      aria-hidden="true"
      className={cn("relative aspect-[200/128] w-[120px]", className)}
    >
      <EnvelopeArt
        flapClassName={flapClassName}
        letterClassName={letterClassName}
        monogram={monogram}
        paper={paper}
      >
        {children}
      </EnvelopeArt>
    </div>
  );
}
