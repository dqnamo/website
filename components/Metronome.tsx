"use client";

import NumberFlow from "@number-flow/react";
import { PauseIcon, PlayIcon } from "@phosphor-icons/react/dist/ssr";
import { animate, useMotionValue, useReducedMotion } from "motion/react";
import {
  type KeyboardEvent,
  type PointerEvent,
  type Ref,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { cn } from "@/helpers/classname-helper";

/* -------------------------------------------------------------------------- */
/* The scale                                                                   */
/* -------------------------------------------------------------------------- */

/** The classic pendulum metronome scale, from Largo at the top to Presto. */
export const TEMPO_MARKS = [
  40, 42, 44, 46, 48, 50, 52, 54, 56, 58, 60, 63, 66, 69, 72, 76, 80, 84, 88,
  92, 96, 100, 104, 108, 112, 116, 120, 126, 132, 138, 144, 152, 160, 168, 176,
  184, 192, 200, 208,
] as const;

const LAST_MARK = TEMPO_MARKS.length - 1;

const TEMPO_TERMS = [
  { from: 200, term: "Prestissimo" },
  { from: 168, term: "Presto" },
  { from: 120, term: "Allegro" },
  { from: 108, term: "Moderato" },
  { from: 76, term: "Andante" },
  { from: 66, term: "Adagio" },
  { from: 60, term: "Larghetto" },
  { from: 0, term: "Largo" },
] as const;

export function tempoTerm(bpm: number) {
  return TEMPO_TERMS.find((band) => bpm >= band.from)?.term ?? "Largo";
}

/** The mark nearest a tempo, so taps and odd values land on the scale. */
function nearestMark(bpm: number) {
  let best = 0;

  for (let index = 1; index <= LAST_MARK; index += 1) {
    if (
      Math.abs(Math.log(TEMPO_MARKS[index] / bpm)) <
      Math.abs(Math.log(TEMPO_MARKS[best] / bpm))
    ) {
      best = index;
    }
  }

  return best;
}

/* -------------------------------------------------------------------------- */
/* Geometry, in the SVG's own units                                            */
/* -------------------------------------------------------------------------- */

const VIEW_WIDTH = 240;
const VIEW_HEIGHT = 362;
const CX = 120;
const PIVOT_Y = 286;
const CASE_TOP = 18;
const CASE_BOTTOM = 330;
const TOP_HALF = 21;
const BOTTOM_HALF = 98;
const RECESS_TOP = 32;
const COVER_TOP = 258;
const RECESS_INSET = 8;
const SCALE_TOP = 48;
const SCALE_BOTTOM = 240;
const WEIGHT_HEIGHT = 17;
/** Degrees either side of upright that the pendulum swings. */
const AMPLITUDE = 21;
/** How long a hand takes to draw the pendulum aside before letting it go. */
const PULL_SECONDS = 0.18;

function caseHalf(y: number) {
  return (
    TOP_HALF +
    ((BOTTOM_HALF - TOP_HALF) * (y - CASE_TOP)) / (CASE_BOTTOM - CASE_TOP)
  );
}

/** Two decimal places: stable between the server and the browser. */
function round(value: number) {
  return Math.round(value * 100) / 100;
}

/**
 * Where the top of the weight sits for each mark. The scale is spaced by
 * ratio, and opens out a little towards the slow end, as on the real thing.
 */
const MARK_Y = TEMPO_MARKS.map((bpm) => {
  const ratio = Math.log(208 / bpm) / Math.log(208 / 40);
  return round(SCALE_BOTTOM - (SCALE_BOTTOM - SCALE_TOP) * ratio ** 1.18);
});

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

function nearestMarkAtY(y: number) {
  let best = 0;

  for (let index = 1; index <= LAST_MARK; index += 1) {
    if (Math.abs(MARK_Y[index] - y) < Math.abs(MARK_Y[best] - y)) {
      best = index;
    }
  }

  return best;
}

/* -------------------------------------------------------------------------- */
/* Sound                                                                       */
/* -------------------------------------------------------------------------- */

let sharedAudioContext: AudioContext | null = null;
let noiseBuffer: AudioBuffer | null = null;
let lastNotchAt = 0;

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
    const length = Math.floor(context.sampleRate * 0.06);
    noiseBuffer = context.createBuffer(1, length, context.sampleRate);
    const data = noiseBuffer.getChannelData(0);

    for (let index = 0; index < length; index += 1) {
      data[index] = Math.random() * 2 - 1;
    }
  }

  return noiseBuffer;
}

/** A short, filtered burst of noise with an exponential tail. */
function noiseBurst(
  context: AudioContext,
  at: number,
  {
    decay,
    frequency,
    gain,
    q,
  }: { decay: number; frequency: number; gain: number; q: number },
) {
  const source = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const envelope = context.createGain();

  source.buffer = getNoise(context);
  filter.type = "bandpass";
  filter.frequency.value = frequency;
  filter.Q.value = q;
  envelope.gain.setValueAtTime(gain, at);
  envelope.gain.exponentialRampToValueAtTime(0.0001, at + decay * 6);

  source.connect(filter).connect(envelope).connect(context.destination);
  source.start(at);
  source.stop(at + decay * 6 + 0.01);
}

function ping(
  context: AudioContext,
  at: number,
  frequency: number,
  gain: number,
  decay: number,
) {
  const oscillator = context.createOscillator();
  const envelope = context.createGain();

  oscillator.frequency.value = frequency;
  envelope.gain.setValueAtTime(0.0001, at);
  envelope.gain.exponentialRampToValueAtTime(gain, at + 0.003);
  envelope.gain.exponentialRampToValueAtTime(0.0001, at + decay);

  oscillator.connect(envelope).connect(context.destination);
  oscillator.start(at);
  oscillator.stop(at + decay + 0.02);
}

/**
 * The escapement's knock: a woody click with a hollow body note under it.
 * Tick and tock differ a touch, because no escapement is perfectly even.
 */
function playTick(delay: number, beat: number, bell: boolean) {
  const context = getAudioContext();

  if (!context) {
    return;
  }

  const at = context.currentTime + Math.max(0, delay);
  const tock = beat % 2 === 1;

  noiseBurst(context, at, {
    decay: 0.0035,
    frequency: tock ? 2300 : 2700,
    gain: 0.9,
    q: 1.6,
  });
  ping(context, at, tock ? 1180 : 1320, 0.22, 0.045);

  if (bell) {
    // A little bell on the downbeat, with inharmonic partials so it rings.
    ping(context, at + 0.004, 2637, 0.12, 0.9);
    ping(context, at + 0.004, 2637 * 2.76, 0.035, 0.35);
    ping(context, at + 0.004, 2637 * 5.4, 0.015, 0.15);
  }
}

/** The weight's spring clip clicking into a notch on the rod. */
function playNotch(pitch: number) {
  const context = getAudioContext();

  if (!context) {
    return;
  }

  const now = context.currentTime;

  // Sliding quickly over many notches should purr, not clip.
  if (now - lastNotchAt < 0.018) {
    return;
  }

  lastNotchAt = now;
  noiseBurst(context, now, {
    decay: 0.0012,
    frequency: 4200 + pitch * 1400,
    gain: 0.5,
    q: 1.2,
  });
}

function buzz(duration: number) {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    navigator.vibrate?.(duration);
  }
}

/* -------------------------------------------------------------------------- */
/* The body                                                                    */
/* -------------------------------------------------------------------------- */

function trapezoid(top: number, bottom: number, inset: number) {
  const topHalf = round(caseHalf(top) - inset);
  const bottomHalf = round(caseHalf(bottom) - inset);

  return `M ${CX - topHalf} ${top} L ${CX + topHalf} ${top} L ${CX + bottomHalf} ${bottom} L ${CX - bottomHalf} ${bottom} Z`;
}

const CASE_PATH = trapezoid(CASE_TOP, CASE_BOTTOM, 0);
const RECESS_PATH = trapezoid(RECESS_TOP, COVER_TOP + 6, RECESS_INSET);
const COVER_PATH = trapezoid(COVER_TOP, CASE_BOTTOM, 0);
const SIDE_PATH = `M ${CX + TOP_HALF} ${CASE_TOP} L ${CX + TOP_HALF + 4} ${CASE_TOP + 3} L ${CX + BOTTOM_HALF + 7} ${CASE_BOTTOM - 1} L ${CX + BOTTOM_HALF} ${CASE_BOTTOM} Z`;

function Pendulum({
  fill,
  ids,
  shadow = false,
}: {
  fill?: string;
  ids: Record<string, string>;
  shadow?: boolean;
}) {
  return (
    <>
      <rect
        fill={fill ?? `url(#${ids.steel})`}
        height={PIVOT_Y + 8 - 26}
        rx={1.2}
        width={2.6}
        x={CX - 1.3}
        y={26}
      />
      {shadow ? null : <circle cx={CX} cy={27.5} fill="#e4e4e8" r={1.6} />}
    </>
  );
}

function Weight({
  fill,
  ids,
  shadow = false,
}: {
  fill?: string;
  ids: Record<string, string>;
  shadow?: boolean;
}) {
  return (
    <>
      <path
        d={`M -11 0 L 11 0 L 14.5 ${WEIGHT_HEIGHT - 2.5} Q 15 ${WEIGHT_HEIGHT} 12.5 ${WEIGHT_HEIGHT} L -12.5 ${WEIGHT_HEIGHT} Q -15 ${WEIGHT_HEIGHT} -14.5 ${WEIGHT_HEIGHT - 2.5} Z`}
        fill={fill ?? `url(#${ids.brass})`}
      />
      {shadow ? null : (
        <>
          {/* The weight is read at its top edge. */}
          <rect fill="#5b4316" height={1.3} width={22} x={-11} y={0} />
          <rect
            fill="rgb(255 246 214 / 55%)"
            height={0.7}
            width={22}
            x={-11}
            y={1.3}
          />
          <path
            d={`M -13.6 ${WEIGHT_HEIGHT - 0.6} L 13.6 ${WEIGHT_HEIGHT - 0.6}`}
            stroke="rgb(70 48 14 / 55%)"
            strokeWidth={1.2}
          />
          {/* The thumbscrew that holds the spring clip. */}
          <circle cx={0} cy={9.5} fill={`url(#${ids.screw})`} r={3.1} />
          <circle
            cx={0}
            cy={9.5}
            fill="none"
            r={3.1}
            stroke="rgb(70 48 14 / 70%)"
            strokeWidth={0.6}
          />
          <path
            d="M -1.8 9.5 L 1.8 9.5"
            stroke="rgb(70 48 14 / 75%)"
            strokeLinecap="round"
            strokeWidth={0.7}
          />
        </>
      )}
    </>
  );
}

type MetronomeBodyProps = {
  /** Rotation of the pendulum in degrees, used for the first paint. */
  angle?: number;
  className?: string;
  /** Extra classes for the swinging groups, e.g. a hover animation. */
  pendulumClassName?: string;
  rodRefs?: [Ref<SVGGElement>, Ref<SVGGElement>];
  /** Show the printed numbers. Thumbnails leave them off. */
  showNumbers?: boolean;
  /** The top of the weight, in SVG units. */
  weightY: number;
  weightRefs?: [Ref<SVGGElement>, Ref<SVGGElement>];
};

/** The walnut case, ivory scale, steel rod and brass weight. */
export function MetronomeBody({
  angle = 0,
  className,
  pendulumClassName,
  rodRefs,
  showNumbers = true,
  weightY,
  weightRefs,
}: MetronomeBodyProps) {
  const rawId = useId();
  const prefix = `metronome-${rawId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const ids = {
    blur: `${prefix}-blur`,
    brass: `${prefix}-brass`,
    cover: `${prefix}-cover`,
    floor: `${prefix}-floor`,
    grain: `${prefix}-grain`,
    ivory: `${prefix}-ivory`,
    plate: `${prefix}-plate`,
    recess: `${prefix}-recess`,
    screw: `${prefix}-screw`,
    shade: `${prefix}-shade`,
    steel: `${prefix}-steel`,
    walnut: `${prefix}-walnut`,
    whole: `${prefix}-whole`,
  };
  const rodTransform = `rotate(${round(angle)} ${CX} ${PIVOT_Y})`;
  const weightTransform = `translate(${CX} ${round(weightY)})`;
  // A CSS animation swings round the pivot; the live pendulum writes its own
  // rotate(angle cx cy), which a CSS origin would shift a second time.
  const pendulumStyle = pendulumClassName
    ? ({
        transformBox: "view-box",
        transformOrigin: `${CX}px ${PIVOT_Y}px`,
      } as const)
    : undefined;

  return (
    <svg
      aria-hidden="true"
      className={cn("block h-auto w-full overflow-visible", className)}
      viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
    >
      <defs>
        <linearGradient id={ids.walnut} x1="0" x2="0.35" y1="0" y2="1">
          <stop offset="0" stopColor="#7a4d33" />
          <stop offset="0.55" stopColor="#5b3622" />
          <stop offset="1" stopColor="#40251a" />
        </linearGradient>
        <linearGradient id={ids.cover} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#5e3823" />
          <stop offset="1" stopColor="#3b2217" />
        </linearGradient>
        <linearGradient id={ids.ivory} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#f6eedc" />
          <stop offset="1" stopColor="#e7dabf" />
        </linearGradient>
        <linearGradient id={ids.shade} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="rgb(52 28 14 / 38%)" />
          <stop offset="0.06" stopColor="rgb(52 28 14 / 0%)" />
          <stop offset="0.9" stopColor="rgb(52 28 14 / 0%)" />
          <stop offset="1" stopColor="rgb(52 28 14 / 22%)" />
        </linearGradient>
        <linearGradient id={ids.brass} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#7d5a22" />
          <stop offset="0.3" stopColor="#d9b866" />
          <stop offset="0.42" stopColor="#fbe9b4" />
          <stop offset="0.6" stopColor="#c99d4a" />
          <stop offset="1" stopColor="#6f4e1c" />
        </linearGradient>
        <radialGradient cx="0.38" cy="0.32" id={ids.screw} r="0.8">
          <stop offset="0" stopColor="#fff2c8" />
          <stop offset="0.5" stopColor="#d2ab57" />
          <stop offset="1" stopColor="#7d5a22" />
        </radialGradient>
        <linearGradient id={ids.steel} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#7b7b82" />
          <stop offset="0.45" stopColor="#f1f1f4" />
          <stop offset="1" stopColor="#6c6c72" />
        </linearGradient>
        <linearGradient id={ids.plate} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#8a6526" />
          <stop offset="0.4" stopColor="#ecd291" />
          <stop offset="1" stopColor="#9b7330" />
        </linearGradient>
        <radialGradient cx="0.5" cy="0.5" id={ids.floor} r="0.5">
          <stop offset="0" stopColor="rgb(0 0 0 / 30%)" />
          <stop offset="1" stopColor="rgb(0 0 0 / 0%)" />
        </radialGradient>
        <filter height="140%" id={ids.blur} width="140%" x="-20%" y="-20%">
          <feGaussianBlur stdDeviation="1.3" />
        </filter>
        {/* Long, stretched noise reads as the figure in a walnut veneer. */}
        <filter id={ids.grain} x="0" y="0" width="100%" height="100%">
          <feTurbulence
            baseFrequency="0.09 0.006"
            numOctaves="3"
            seed="7"
            type="fractalNoise"
          />
          <feColorMatrix values="0 0 0 0 0.12  0 0 0 0 0.05  0 0 0 0 0.02  0 0 0 1.6 -0.55" />
        </filter>
        <clipPath id={ids.recess}>
          <path d={RECESS_PATH} />
        </clipPath>
        <clipPath id={ids.whole}>
          <path d={CASE_PATH} />
        </clipPath>
      </defs>

      {/* Shadow on the table. */}
      <ellipse
        cx={CX}
        cy={CASE_BOTTOM + 20}
        fill={`url(#${ids.floor})`}
        rx={BOTTOM_HALF + 26}
        ry={11}
      />

      {/* The plinth. */}
      <rect
        fill="#2e1a11"
        height={20}
        rx={3.5}
        width={(BOTTOM_HALF + 12) * 2}
        x={CX - BOTTOM_HALF - 12}
        y={CASE_BOTTOM - 4}
      />
      <rect
        fill="#4d2e1f"
        height={4}
        rx={2}
        width={(BOTTOM_HALF + 12) * 2 - 4}
        x={CX - BOTTOM_HALF - 10}
        y={CASE_BOTTOM - 3}
      />

      {/* The case: a side face in shade, then the front face. */}
      <path d={SIDE_PATH} fill="#2a170e" />
      <path d={CASE_PATH} fill={`url(#${ids.walnut})`} />
      <g clipPath={`url(#${ids.whole})`}>
        <rect
          filter={`url(#${ids.grain})`}
          height={CASE_BOTTOM - CASE_TOP}
          opacity={0.55}
          width={BOTTOM_HALF * 2}
          x={CX - BOTTOM_HALF}
          y={CASE_TOP}
        />
      </g>
      <path
        d={CASE_PATH}
        fill="none"
        stroke="rgb(255 222 190 / 22%)"
        strokeWidth={1}
      />

      {/* The cap on top of the pyramid. */}
      <rect
        fill="#2e1a11"
        height={8}
        rx={2.5}
        width={TOP_HALF * 2 + 8}
        x={CX - TOP_HALF - 4}
        y={CASE_TOP - 6}
      />
      <rect
        fill="rgb(255 222 190 / 18%)"
        height={1}
        rx={0.5}
        width={TOP_HALF * 2 + 4}
        x={CX - TOP_HALF - 2}
        y={CASE_TOP - 5}
      />

      {/* The recessed ivory scale. */}
      <path d={RECESS_PATH} fill={`url(#${ids.ivory})`} />
      <g clipPath={`url(#${ids.recess})`}>
        {MARK_Y.map((y, index) => {
          const bpm = TEMPO_MARKS[index];
          const major = bpm % 20 === 0 || bpm === 208;
          const onLeft = index % 2 === 0;

          return (
            <g key={bpm}>
              <path
                d={`M ${CX - (major ? 9 : 7)} ${y} L ${CX - 3} ${y} M ${CX + 3} ${y} L ${CX + (major ? 9 : 7)} ${y}`}
                stroke="#5a3f2a"
                strokeWidth={major ? 0.8 : 0.55}
              />
              {showNumbers ? (
                <text
                  className="font-mono"
                  dominantBaseline="central"
                  fill="#5a3f2a"
                  fontSize={5.6}
                  fontWeight={major ? 700 : 500}
                  textAnchor={onLeft ? "end" : "start"}
                  x={onLeft ? CX - 10.5 : CX + 10.5}
                  y={y}
                >
                  {bpm}
                </text>
              ) : null}
            </g>
          );
        })}

        {/* The pendulum's shadow on the scale. */}
        <g filter={`url(#${ids.blur})`} transform="translate(2.4 2.2)">
          <g
            className={pendulumClassName}
            ref={rodRefs?.[1]}
            style={pendulumStyle}
            transform={rodTransform}
          >
            <Pendulum fill="rgb(52 28 14 / 34%)" ids={ids} shadow />
            <g ref={weightRefs?.[1]} transform={weightTransform}>
              <Weight fill="rgb(52 28 14 / 34%)" ids={ids} shadow />
            </g>
          </g>
        </g>
      </g>
      <path d={RECESS_PATH} fill={`url(#${ids.shade})`} />
      <path
        d={RECESS_PATH}
        fill="none"
        stroke="rgb(40 20 8 / 55%)"
        strokeWidth={1.4}
      />

      {/* The pendulum. */}
      <g
        className={pendulumClassName}
        ref={rodRefs?.[0]}
        style={pendulumStyle}
        transform={rodTransform}
      >
        <Pendulum ids={ids} />
        <g ref={weightRefs?.[0]} transform={weightTransform}>
          <Weight ids={ids} />
        </g>
      </g>

      {/* The cover that hides the pivot and the counterweight. */}
      <path d={COVER_PATH} fill={`url(#${ids.cover})`} />
      <g clipPath={`url(#${ids.whole})`}>
        <rect
          filter={`url(#${ids.grain})`}
          height={CASE_BOTTOM - COVER_TOP}
          opacity={0.5}
          width={BOTTOM_HALF * 2}
          x={CX - BOTTOM_HALF}
          y={COVER_TOP}
        />
      </g>
      <path
        d={`M ${round(CX - caseHalf(COVER_TOP))} ${COVER_TOP} L ${round(CX + caseHalf(COVER_TOP))} ${COVER_TOP}`}
        stroke="rgb(255 222 190 / 30%)"
        strokeWidth={1}
      />
      <path
        d={`M ${round(CX - caseHalf(COVER_TOP))} ${COVER_TOP - 1.2} L ${round(CX + caseHalf(COVER_TOP))} ${COVER_TOP - 1.2}`}
        stroke="rgb(20 10 4 / 45%)"
        strokeWidth={1.4}
      />

      {/* The brass nameplate. */}
      <rect
        fill={`url(#${ids.plate})`}
        height={13}
        rx={2}
        stroke="rgb(60 40 10 / 60%)"
        strokeWidth={0.6}
        width={58}
        x={CX - 29}
        y={292}
      />
      <text
        className="font-mono"
        dominantBaseline="central"
        fill="#4d3510"
        fontSize={5}
        fontWeight={700}
        letterSpacing={1.1}
        textAnchor="middle"
        x={CX + 0.5}
        y={298.7}
      >
        METRONOME
      </text>
      <circle cx={CX - 25.5} cy={298.5} fill="#6f4e1c" r={0.9} />
      <circle cx={CX + 25.5} cy={298.5} fill="#6f4e1c" r={0.9} />
    </svg>
  );
}

/** A decorative, non-interactive metronome for thumbnails and previews. */
export function MetronomeFace({
  bpm = 96,
  className,
  pendulumClassName,
}: {
  bpm?: number;
  className?: string;
  pendulumClassName?: string;
}) {
  return (
    <div aria-hidden="true" className={className}>
      <MetronomeBody
        pendulumClassName={pendulumClassName}
        showNumbers={false}
        weightY={MARK_Y[nearestMark(bpm)]}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* The metronome                                                               */
/* -------------------------------------------------------------------------- */

const BELL_OPTIONS = [0, 2, 3, 4, 6] as const;

export type MetronomeProps = {
  /** Tempo in beats per minute. Snaps to the nearest mark on the scale. */
  value?: number;
  defaultValue?: number;
  onValueChange?: (bpm: number) => void;
  /** Ring the bell every this many beats. 0 for no bell. */
  defaultBeatsPerBar?: number;
  /** Play the ticks, the bell and the notches. */
  sound?: boolean;
  className?: string;
};

type Engine = {
  /** Current swing either side of upright, in degrees. */
  amplitude: number;
  angle: number;
  /** Where the swing was when a hand last took hold of the pendulum. */
  blendFrom: number;
  /** 0 to 1 through the hand drawing the pendulum aside. */
  blend: number;
  /** A hand is on the weight, holding the pendulum still. */
  caught: boolean;
  frame: number;
  lastBeat: number;
  lastTime: number;
  /** Beats since the pendulum was let go. Whole numbers fall at either end. */
  phase: number;
  running: boolean;
  scheduled: number;
};

export function Metronome({
  className,
  defaultBeatsPerBar = 4,
  defaultValue = 96,
  onValueChange,
  sound = true,
  value: controlledValue,
}: MetronomeProps) {
  const shouldReduceMotion = useReducedMotion();
  const labelId = useId();
  const [uncontrolledValue, setUncontrolledValue] = useState(() =>
    nearestMark(defaultValue),
  );
  const index =
    controlledValue === undefined
      ? uncontrolledValue
      : nearestMark(controlledValue);
  const bpm = TEMPO_MARKS[index];
  const [running, setRunning] = useState(false);
  const [beatsPerBar, setBeatsPerBar] = useState(defaultBeatsPerBar);
  const [activeBeat, setActiveBeat] = useState<number | null>(null);
  const [holding, setHolding] = useState(false);

  const indexRef = useRef(index);
  const bpmRef = useRef(bpm);
  const soundRef = useRef(sound);
  const beatsRef = useRef(beatsPerBar);
  const reducedRef = useRef(Boolean(shouldReduceMotion));
  bpmRef.current = TEMPO_MARKS[indexRef.current];
  soundRef.current = sound;
  beatsRef.current = beatsPerBar;
  reducedRef.current = Boolean(shouldReduceMotion);

  const rodRef = useRef<SVGGElement>(null);
  const rodShadowRef = useRef<SVGGElement>(null);
  const weightRef = useRef<SVGGElement>(null);
  const weightShadowRef = useRef<SVGGElement>(null);
  const svgBoxRef = useRef<HTMLDivElement>(null);
  const weightY = useMotionValue(MARK_Y[index]);
  const glideNotchRef = useRef(index);
  const tapsRef = useRef<number[]>([]);
  const dragRef = useRef<{
    pointerId: number;
    raw: number;
    scale: number;
    startPointerY: number;
  } | null>(null);
  const engineRef = useRef<Engine>({
    amplitude: 0,
    angle: 0,
    blend: 1,
    blendFrom: 0,
    caught: false,
    frame: 0,
    lastBeat: -1,
    lastTime: 0,
    phase: 0,
    running: false,
    scheduled: -1,
  });

  // Move the weight by writing its transform straight to the SVG.
  useEffect(() => {
    return weightY.on("change", (y) => {
      const transform = `translate(${CX} ${round(y)})`;
      weightRef.current?.setAttribute("transform", transform);
      weightShadowRef.current?.setAttribute("transform", transform);
    });
  }, [weightY]);

  const writeAngle = useCallback((angle: number) => {
    const transform = `rotate(${round(angle)} ${CX} ${PIVOT_Y})`;
    rodRef.current?.setAttribute("transform", transform);
    rodShadowRef.current?.setAttribute("transform", transform);
  }, []);

  const tick = useCallback(
    (now: number) => {
      const engine = engineRef.current;
      const dt = Math.min(0.05, (now - engine.lastTime) / 1000);
      engine.lastTime = now;
      const tempo = bpmRef.current;
      engine.phase += (dt * tempo) / 60;

      if (engine.running && !engine.caught) {
        const beat = Math.floor(engine.phase);

        if (beat > engine.lastBeat) {
          engine.lastBeat = beat;
          const bar = beatsRef.current;
          setActiveBeat(bar > 0 ? beat % bar : 0);
        }

        // Schedule the knock on the audio clock, a moment ahead, so it lands
        // exactly as the pendulum turns, whatever the frame rate is doing.
        const next = beat + 1;
        const until = ((next - engine.phase) * 60) / tempo;

        if (until < 0.1 && engine.scheduled < next) {
          engine.scheduled = next;

          if (soundRef.current) {
            const bar = beatsRef.current;
            playTick(until, next, bar > 0 && next % bar === 0);
          }
        }
      } else {
        // Left alone, friction takes the swing; under a hand it stops at once.
        engine.amplitude *= Math.exp(-dt / (engine.caught ? 0.06 : 0.34));
      }

      let angle = reducedRef.current
        ? 0
        : engine.amplitude * Math.sin(Math.PI * (engine.phase - 0.5));

      if (engine.blend < 1) {
        engine.blend = Math.min(1, engine.blend + dt / PULL_SECONDS);
        const eased = 1 - (1 - engine.blend) ** 3;
        angle = engine.blendFrom + (angle - engine.blendFrom) * eased;
      }

      engine.angle = angle;
      writeAngle(angle);

      if (!engine.running && engine.amplitude < 0.1 && engine.blend >= 1) {
        engine.amplitude = 0;
        engine.angle = 0;
        writeAngle(0);
        engine.frame = 0;
        return;
      }

      engine.frame = requestAnimationFrame(tick);
    },
    [writeAngle],
  );

  const ensureLoop = useCallback(() => {
    const engine = engineRef.current;

    if (engine.frame) {
      return;
    }

    engine.lastTime = performance.now();
    engine.frame = requestAnimationFrame(tick);
  }, [tick]);

  useEffect(() => {
    const engine = engineRef.current;
    return () => cancelAnimationFrame(engine.frame);
  }, []);

  /** Draw the pendulum aside and let it go; it knocks as it reaches the end. */
  const release = useCallback(() => {
    const engine = engineRef.current;
    engine.running = true;
    engine.caught = false;
    engine.amplitude = AMPLITUDE;
    engine.blendFrom = engine.angle;
    engine.blend = reducedRef.current ? 1 : 0;
    engine.phase = reducedRef.current
      ? -0.001
      : (-PULL_SECONDS * bpmRef.current) / 60;
    engine.lastBeat = -1;
    engine.scheduled = -1;
    getAudioContext();
    ensureLoop();
  }, [ensureLoop]);

  const start = useCallback(() => {
    setRunning(true);
    release();
    buzz(8);
  }, [release]);

  const stop = useCallback(() => {
    const engine = engineRef.current;
    engine.running = false;
    engine.caught = false;
    setRunning(false);
    setActiveBeat(null);
    ensureLoop();
  }, [ensureLoop]);

  const toggle = useCallback(() => {
    if (engineRef.current.running) {
      stop();
    } else {
      start();
    }
  }, [start, stop]);

  const commit = useCallback(
    (nextIndex: number) => {
      if (nextIndex === indexRef.current) {
        return;
      }

      indexRef.current = nextIndex;
      bpmRef.current = TEMPO_MARKS[nextIndex];

      if (controlledValue === undefined) {
        setUncontrolledValue(nextIndex);
      }

      onValueChange?.(TEMPO_MARKS[nextIndex]);
    },
    [controlledValue, onValueChange],
  );

  const notch = useCallback((markIndex: number) => {
    if (soundRef.current) {
      playNotch(markIndex / LAST_MARK);
    }

    buzz(3);
  }, []);

  /** Slide the weight to a mark, clicking over every notch on the way. */
  const glideTo = useCallback(
    (nextIndex: number) => {
      const target = MARK_Y[nextIndex];
      commit(nextIndex);

      if (reducedRef.current) {
        weightY.set(target);
        notch(nextIndex);
        glideNotchRef.current = nextIndex;
        return;
      }

      animate(weightY, target, {
        damping: 30,
        onUpdate: (y) => {
          const passing = nearestMarkAtY(y);

          if (passing !== glideNotchRef.current) {
            glideNotchRef.current = passing;
            notch(passing);
          }
        },
        stiffness: 380,
        type: "spring",
      });
    },
    [commit, notch, weightY],
  );

  // Follow controlled changes that did not come from a hand on the weight.
  useEffect(() => {
    if (dragRef.current || index === indexRef.current) {
      return;
    }

    glideTo(index);
  }, [glideTo, index]);

  function bumpEnd(direction: number) {
    if (soundRef.current) {
      playNotch(direction > 0 ? 1 : 0);
    }

    if (reducedRef.current) {
      return;
    }

    const stop = MARK_Y[indexRef.current];
    animate(weightY, [stop, stop + direction * 2.5, stop], {
      duration: 0.22,
      ease: "easeOut",
    });
  }

  function stepBy(delta: number) {
    const nextIndex = clamp(indexRef.current + delta, 0, LAST_MARK);

    if (nextIndex === indexRef.current) {
      bumpEnd(Math.sign(delta));
      return;
    }

    glideTo(nextIndex);
  }

  /**
   * Turn the hand's continuous position into what a spring clip on a notched
   * rod would do: hang on to the current notch, then snap into the next one.
   */
  function applyRaw(raw: number) {
    const lowest = MARK_Y[0];
    const highest = MARK_Y[LAST_MARK];

    if (raw < lowest || raw > highest) {
      const end = raw < lowest ? lowest : highest;
      const over = raw - end;
      const give = Math.sign(over) * 3 * (1 - Math.exp(-Math.abs(over) / 3));
      weightY.set(end + give);
      const endIndex = raw < lowest ? 0 : LAST_MARK;

      if (endIndex !== indexRef.current) {
        commit(endIndex);
        notch(endIndex);
      }

      return;
    }

    const nearest = nearestMarkAtY(raw);
    const offset = raw - MARK_Y[nearest];
    const neighbour = clamp(nearest + Math.sign(offset), 0, LAST_MARK);
    const half = Math.abs(MARK_Y[neighbour] - MARK_Y[nearest]) / 2 || 1;
    const amount = Math.min(1, Math.abs(offset) / half);
    weightY.set(MARK_Y[nearest] + Math.sign(offset) * amount ** 2.4 * half);

    if (nearest !== indexRef.current) {
      commit(nearest);
      notch(nearest);
    }
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) {
      return;
    }

    const box = svgBoxRef.current?.getBoundingClientRect();

    event.currentTarget.setPointerCapture(event.pointerId);
    event.currentTarget.focus({ preventScroll: true });
    weightY.stop();
    dragRef.current = {
      pointerId: event.pointerId,
      raw: weightY.get(),
      scale: box ? VIEW_HEIGHT / box.height : 1,
      startPointerY: event.clientY,
    };
    glideNotchRef.current = indexRef.current;
    setHolding(true);
    getAudioContext();

    // A hand on the weight stops the pendulum dead.
    if (engineRef.current.running) {
      engineRef.current.caught = true;
      setActiveBeat(null);
    }
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;

    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    const raw = clamp(
      drag.raw + (event.clientY - drag.startPointerY) * drag.scale,
      MARK_Y[0] - 14,
      MARK_Y[LAST_MARK] + 14,
    );

    applyRaw(raw);
  }

  function endDrag(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;

    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    dragRef.current = null;
    setHolding(false);
    glideNotchRef.current = indexRef.current;

    if (reducedRef.current) {
      weightY.set(MARK_Y[indexRef.current]);
    } else {
      animate(weightY, MARK_Y[indexRef.current], {
        damping: 24,
        stiffness: 600,
        type: "spring",
      });
    }

    // Let go, and it swings off again at the new tempo.
    if (engineRef.current.running && engineRef.current.caught) {
      release();
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      toggle();
      return;
    }

    const deltas: Record<string, number> = {
      ArrowDown: -1,
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: 1,
      End: LAST_MARK,
      Home: -LAST_MARK,
      PageDown: -5,
      PageUp: 5,
    };
    const delta = deltas[event.key];

    if (delta === undefined) {
      return;
    }

    event.preventDefault();

    if (event.key === "Home" || event.key === "End") {
      const target = event.key === "Home" ? 0 : LAST_MARK;

      if (target !== indexRef.current) {
        glideTo(target);
      }

      return;
    }

    stepBy(delta);
  }

  function handleTap() {
    const now = performance.now();
    const taps = tapsRef.current;

    if (taps.length > 0 && now - taps[taps.length - 1] > 2000) {
      taps.length = 0;
    }

    taps.push(now);

    if (taps.length > 5) {
      taps.shift();
    }

    if (soundRef.current) {
      playTick(0, taps.length, false);
    }

    if (taps.length < 2) {
      return;
    }

    const span = taps[taps.length - 1] - taps[0];
    const tapped = 60000 / (span / (taps.length - 1));
    const nextIndex = nearestMark(clamp(tapped, 40, 208));

    if (nextIndex !== indexRef.current) {
      glideTo(nextIndex);
    }
  }

  const term = tempoTerm(bpm);
  const beatCount = beatsPerBar > 0 ? beatsPerBar : 1;
  const buttonClassName =
    "flex h-8 items-center justify-center gap-1.5 rounded-lg border border-grayscale-4 bg-grayscale-1 px-3 font-medium text-grayscale-11 text-xs transition-[background-color,color,transform] duration-150 hover:bg-grayscale-3 hover:text-grayscale-12 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e0a84a] active:scale-[0.96] motion-reduce:transition-none dark:bg-grayscale-3 dark:hover:bg-grayscale-4";

  return (
    <div className={cn("flex flex-col items-center gap-6", className)}>
      <div className="relative w-[220px] max-[520px]:w-[196px]" ref={svgBoxRef}>
        <MetronomeBody
          rodRefs={[rodRef, rodShadowRef]}
          weightRefs={[weightRef, weightShadowRef]}
          weightY={MARK_Y[index]}
        />

        {/* The scale is the slider, so there is plenty to grab. */}
        <div
          aria-describedby={`${labelId}-hint`}
          aria-label="Tempo"
          aria-valuemax={TEMPO_MARKS[LAST_MARK]}
          aria-valuemin={TEMPO_MARKS[0]}
          aria-valuenow={bpm}
          aria-valuetext={`${bpm} beats per minute, ${term}`}
          className={cn(
            "absolute touch-none select-none rounded-md outline-none focus-visible:ring-2 focus-visible:ring-[#e0a84a] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent",
            holding ? "cursor-grabbing" : "cursor-grab",
          )}
          onKeyDown={handleKeyDown}
          onLostPointerCapture={endDrag}
          onPointerCancel={endDrag}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={endDrag}
          role="slider"
          style={{
            height: `${((COVER_TOP - RECESS_TOP + 4) / VIEW_HEIGHT) * 100}%`,
            left: `${((CX - 46) / VIEW_WIDTH) * 100}%`,
            top: `${((RECESS_TOP - 4) / VIEW_HEIGHT) * 100}%`,
            width: `${(92 / VIEW_WIDTH) * 100}%`,
          }}
          tabIndex={0}
        />
        <span className="sr-only" id={`${labelId}-hint`}>
          Drag the weight or use the arrow keys to set the tempo. Press space to
          start or stop.
        </span>
      </div>

      <div className="flex flex-col items-center gap-1">
        <output
          aria-live="polite"
          className="flex items-baseline gap-1.5 font-medium font-mono text-grayscale-12 tabular-nums"
        >
          <span className="text-2xl leading-none">
            <NumberFlow locales="en-US" value={bpm} />
          </span>
          <span className="text-[9px] text-grayscale-10 uppercase tracking-[0.06em]">
            BPM
          </span>
        </output>
        <span className="font-serif text-grayscale-11 text-sm italic">
          {term}
        </span>
      </div>

      {/* One light per beat; the bell's beat is amber. */}
      <div aria-hidden="true" className="flex h-2 items-center gap-2">
        {Array.from({ length: beatCount }, (_, beat) => {
          const lit = activeBeat === beat;
          const accent = beatsPerBar > 0 && beat === 0;

          return (
            <span
              className={cn(
                "size-2 rounded-full",
                lit
                  ? accent
                    ? "scale-125 bg-[#f0a43a] shadow-[0_0_6px_1px_rgb(240_164_58_/_60%)]"
                    : "scale-125 bg-grayscale-12 shadow-[0_0_6px_1px_rgb(127_127_127_/_35%)]"
                  : "scale-100 bg-grayscale-5 transition-[background-color,box-shadow,transform] duration-500 ease-out motion-reduce:transition-none",
              )}
              // biome-ignore lint/suspicious/noArrayIndexKey: beats are positions in the bar.
              key={beat}
            />
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2">
        <button
          aria-pressed={running}
          className={cn(
            buttonClassName,
            "min-w-[84px]",
            running &&
              "border-grayscale-12 bg-grayscale-12 text-grayscale-1 hover:bg-grayscale-12/90 hover:text-grayscale-1 dark:bg-grayscale-12 dark:hover:bg-grayscale-12/90",
          )}
          onClick={toggle}
          type="button"
        >
          {running ? (
            <PauseIcon size={13} weight="fill" />
          ) : (
            <PlayIcon size={13} weight="fill" />
          )}
          {running ? "Stop" : "Start"}
        </button>

        <button
          aria-label="Tap tempo"
          className={buttonClassName}
          onClick={handleTap}
          type="button"
        >
          Tap
        </button>

        <fieldset className="flex h-8 items-center gap-0.5 rounded-lg border border-grayscale-4 bg-grayscale-1 p-0.5 dark:bg-grayscale-3">
          <legend className="sr-only">Bell every</legend>
          {BELL_OPTIONS.map((option) => {
            const selected = beatsPerBar === option;

            return (
              <button
                aria-label={
                  option === 0 ? "No bell" : `Bell every ${option} beats`
                }
                aria-pressed={selected}
                className={cn(
                  "flex h-full min-w-7 items-center justify-center rounded-md px-1.5 font-medium font-mono text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e0a84a] motion-reduce:transition-none",
                  selected
                    ? "bg-grayscale-12 text-grayscale-1"
                    : "text-grayscale-10 hover:bg-grayscale-3 hover:text-grayscale-12 dark:hover:bg-grayscale-4",
                )}
                key={option}
                onClick={() => setBeatsPerBar(option)}
                type="button"
              >
                {option === 0 ? "–" : option}
              </button>
            );
          })}
        </fieldset>
      </div>
    </div>
  );
}
