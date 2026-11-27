"use client";

import { useReducedMotion } from "motion/react";
import {
  type KeyboardEvent,
  type PointerEvent,
  type Ref,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
} from "react";
import { cn } from "@/helpers/classname-helper";

/* -------------------------------------------------------------------------- */
/* Geometry                                                                    */
/* -------------------------------------------------------------------------- */

/** Everything is drawn in this viewBox, then scaled to fit. */
const WIDTH = 480;
const HEIGHT = 244;
const CENTRE_X = WIDTH / 2;
/** Where the front rail runs, and the strings hang from. */
const RAIL_Y = 30;
/** The back rail sits a little higher, because we look down on the toy. */
const BACK_RISE = 12;
/** Pivot to the centre of a ball. */
const LENGTH = 132;
const RADIUS = 20;
/** A hair of air between neighbours at rest, so they read as five balls. */
const GAP = 0.6;
const SPACING = RADIUS * 2 + GAP;
/** The uprights. Balls can't swing further out than this. */
const FRAME_HALF_WIDTH = 214;
const BASE_TOP = 196;
const BASE_DEPTH = 16;
const BASE_FRONT = 20;
const BALL_COUNT = 5;

const PIVOTS = Array.from(
  { length: BALL_COUNT },
  (_, index) => CENTRE_X + (index - (BALL_COUNT - 1) / 2) * SPACING,
);

/* -------------------------------------------------------------------------- */
/* Physics                                                                     */
/* -------------------------------------------------------------------------- */

/** g / L, in s⁻². Gives a swing of a little over a second, like a desk toy. */
const STIFFNESS = 30;
/** Air drag. Reduced motion settles the balls within a few swings. */
const AIR_DRAG = 0.07;
const REDUCED_AIR_DRAG = 0.9;
/** How hard a hand on the balls stops them. */
const BRAKE_DRAG = 9;
/**
 * Steel on steel loses a little at every knock. That loss is what slowly
 * turns a clean one-in, one-out swing into the whole row swinging together.
 */
const RESTITUTION = 0.985;
/** A hand is soft: what it knocks into goes, but doesn't fly. */
const HAND_RESTITUTION = 0.25;
const MAX_ANGLE = (50 * Math.PI) / 180;
const LIFT_ANGLE = (36 * Math.PI) / 180;
const SUBSTEP = 1 / 1200;
/** Slower than this, in px/s, two balls touching don't make a sound. */
const SILENT_SPEED = 22;
/** At this closing speed, in px/s, a knock is as loud as it gets. */
const LOUD_SPEED = 520;

type Side = "left" | "right";

type Drag = {
  history: { t: number; theta: number }[];
  index: number;
  pointerId: number;
  target: number;
};

type Hand = {
  from: number[];
  hold: number;
  indices: number[];
  lift: number;
  start: number;
  to: number;
};

type Sim = {
  brakeUntil: number;
  drag: Drag | null;
  frame: number | null;
  hand: Hand | null;
  last: number;
  omega: number[];
  theta: number[];
};

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

function easeInOut(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

/** Horizontal offset of a ball from its own pivot. */
function reach(theta: number) {
  return LENGTH * Math.sin(theta);
}

function angleForReach(offset: number) {
  return Math.asin(clamp(offset / LENGTH, -1, 1));
}

/**
 * The fastest a ball can be let go at this angle without swinging out into
 * the frame on the far side.
 */
function maxOmegaAt(theta: number) {
  const headroom = Math.cos(theta) - Math.cos(MAX_ANGLE);
  return Math.sqrt(Math.max(0, 2 * STIFFNESS * headroom));
}

/**
 * Knock neighbours apart. With the pivots one ball apart, two balls touch
 * exactly when the left one has swung at least as far right as the right
 * one, so contacts can be checked in reach alone.
 *
 * Equal masses swap their velocities, less a little lost to restitution. A
 * pass that runs along the row lets a knock travel through the touching
 * balls in one step, which is the whole trick of the toy.
 *
 * Returns the fastest closing speed in px/s, for the sound.
 */
function resolveContacts(sim: Sim, held: boolean[]) {
  const { omega, theta } = sim;
  let impact = 0;

  for (let pass = 0; pass < 12; pass += 1) {
    let settled = true;
    const forwards = pass % 2 === 0;

    for (let step = 0; step < BALL_COUNT - 1; step += 1) {
      const left = forwards ? step : BALL_COUNT - 2 - step;
      const right = left + 1;
      const leftReach = reach(theta[left]);
      const rightReach = reach(theta[right]);
      const separation = rightReach - leftReach;

      if (separation > 0.05) {
        continue;
      }

      const closing = omega[left] - omega[right];

      if (closing > 1e-6 && !(held[left] && held[right])) {
        settled = false;
        impact = Math.max(impact, closing * LENGTH);

        if (held[left]) {
          omega[right] = omega[left] + HAND_RESTITUTION * closing;
        } else if (held[right]) {
          omega[left] = omega[right] - HAND_RESTITUTION * closing;
        } else {
          const nextLeft =
            ((1 - RESTITUTION) * omega[left] +
              (1 + RESTITUTION) * omega[right]) /
            2;
          const nextRight =
            ((1 + RESTITUTION) * omega[left] +
              (1 - RESTITUTION) * omega[right]) /
            2;
          omega[left] = nextLeft;
          omega[right] = nextRight;
        }
      }

      const overlap = -separation;

      if (overlap > 0.01) {
        settled = false;

        if (held[left] && held[right]) {
          continue;
        }

        if (held[left]) {
          theta[right] = angleForReach(leftReach);
        } else if (held[right]) {
          theta[left] = angleForReach(rightReach);
        } else {
          theta[left] = angleForReach(leftReach - overlap / 2);
          theta[right] = angleForReach(rightReach + overlap / 2);
        }
      }
    }

    if (settled) {
      break;
    }
  }

  return impact;
}

/* -------------------------------------------------------------------------- */
/* Sound                                                                       */
/* -------------------------------------------------------------------------- */

let sharedAudioContext: AudioContext | null = null;
let tickBuffer: AudioBuffer | null = null;
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

function createTickBuffer(context: AudioContext) {
  const length = Math.floor(context.sampleRate * 0.012);
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);

  for (let index = 0; index < length; index += 1) {
    const t = index / context.sampleRate;
    data[index] = (Math.random() * 2 - 1) * Math.exp(-t / 0.0009);
  }

  return buffer;
}

/**
 * Hardened steel balls knock with a dry tick and a very short, very high
 * ring. Each knock is detuned a touch so a long run doesn't sound sampled.
 */
function playClack(strength: number) {
  const context = sharedAudioContext;

  if (context?.state !== "running") {
    return;
  }

  const now = context.currentTime;

  if (now - lastClackAt < 0.025) {
    return;
  }

  lastClackAt = now;
  tickBuffer ??= createTickBuffer(context);

  const level = 0.04 + 0.46 * strength ** 1.4;
  const detune = 0.97 + Math.random() * 0.06;
  const out = context.createGain();
  out.gain.value = level;
  out.connect(context.destination);

  const tick = context.createBufferSource();
  const tickFilter = context.createBiquadFilter();
  tick.buffer = tickBuffer;
  tickFilter.type = "highpass";
  tickFilter.frequency.value = 2200;
  tick.connect(tickFilter).connect(out);
  tick.start(now);

  const partials = [
    { decay: 0.05, frequency: 3150, gain: 0.32 },
    { decay: 0.028, frequency: 5420, gain: 0.18 },
    { decay: 0.018, frequency: 1730, gain: 0.12 },
  ];

  for (const partial of partials) {
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = partial.frequency * detune;
    envelope.gain.setValueAtTime(partial.gain, now);
    envelope.gain.exponentialRampToValueAtTime(0.0001, now + partial.decay);
    oscillator.connect(envelope).connect(out);
    oscillator.start(now);
    oscillator.stop(now + partial.decay + 0.01);
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

type CradleRefs = {
  backString?: (index: number) => (node: SVGLineElement | null) => void;
  back?: (index: number) => (node: SVGGElement | null) => void;
  front?: (index: number) => (node: SVGGElement | null) => void;
  shade?: (index: number) => (node: SVGGElement | null) => void;
  shadow?: (index: number) => (node: SVGEllipseElement | null) => void;
};

type CradleArtProps = {
  angles: readonly number[];
  /** Classes on each ball's swinging group, e.g. for CSS-driven previews. */
  ballClassNames?: readonly (string | undefined)[];
  className?: string;
  refs?: CradleRefs;
  /**
   * Classes on each ball's shading, which turns back against the swing so
   * the light stays put. Pair them with `ballClassNames`.
   */
  shadeClassNames?: readonly (string | undefined)[];
  shadows?: boolean;
};

function degrees(radians: number) {
  return (radians * 180) / Math.PI;
}

/** Where the back string meets the back rail, in the ball's swinging frame. */
function backAnchor(theta: number) {
  return {
    x: BACK_RISE * Math.sin(theta),
    y: -BACK_RISE * Math.cos(theta),
  };
}

function shadowFor(theta: number) {
  const lift = 1 - Math.cos(theta);
  return {
    cx: reach(theta),
    opacity: Math.max(0, 0.5 - lift * 2.4),
    rx: RADIUS * (0.95 + lift * 1.6),
  };
}

/** A U of chrome tube from the base, over the top, and back down. */
function railPath(top: number, bottom: number) {
  const left = CENTRE_X - FRAME_HALF_WIDTH;
  const right = CENTRE_X + FRAME_HALF_WIDTH;
  const bend = 16;
  return `M ${left} ${bottom} V ${top + bend} Q ${left} ${top} ${left + bend} ${top} H ${right - bend} Q ${right} ${top} ${right} ${top + bend} V ${bottom}`;
}

function CradleArt({
  angles,
  ballClassNames,
  className,
  refs,
  shadeClassNames,
  shadows = true,
}: CradleArtProps) {
  const id = useId().replace(/:/g, "");
  const chrome = `${id}-chrome`;
  const horizon = `${id}-horizon`;
  const tube = `${id}-tube`;
  const backTube = `${id}-back-tube`;
  const baseTop = `${id}-base-top`;
  const baseFront = `${id}-base-front`;
  const blur = `${id}-blur`;

  return (
    <svg
      aria-hidden="true"
      className={cn("block h-auto w-full overflow-visible", className)}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
    >
      <defs>
        <radialGradient cx="0.36" cy="0.3" id={chrome} r="0.75">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.12" stopColor="#f3f5f8" />
          <stop offset="0.42" stopColor="#a9aeb6" />
          <stop offset="0.72" stopColor="#50555d" />
          <stop offset="0.9" stopColor="#2a2d32" />
          <stop offset="1" stopColor="#5b6068" />
        </radialGradient>
        {/* The room's horizon, reflected across the lower half of each ball. */}
        <linearGradient id={horizon} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0.48" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="0.56" stopColor="#14161a" stopOpacity="0.32" />
          <stop offset="0.78" stopColor="#14161a" stopOpacity="0.12" />
          <stop offset="0.94" stopColor="#d9dde3" stopOpacity="0.35" />
        </linearGradient>
        <linearGradient id={tube} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#6b7078" />
          <stop offset="0.5" stopColor="#eef0f3" />
          <stop offset="1" stopColor="#6b7078" />
        </linearGradient>
        <linearGradient id={backTube} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#4a4e55" />
          <stop offset="0.5" stopColor="#a3a8b0" />
          <stop offset="1" stopColor="#4a4e55" />
        </linearGradient>
        <linearGradient id={baseTop} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#2b2c30" />
          <stop offset="1" stopColor="#1c1d20" />
        </linearGradient>
        <linearGradient id={baseFront} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#131416" />
          <stop offset="1" stopColor="#0b0b0c" />
        </linearGradient>
        <filter height="3" id={blur} width="2" x="-0.5" y="-1">
          <feGaussianBlur stdDeviation="3" />
        </filter>
      </defs>

      {/* Base: a black lacquered block, seen a little from above. */}
      <ellipse
        className="fill-black/20 dark:fill-black/50"
        cx={CENTRE_X}
        cy={BASE_TOP + BASE_DEPTH + BASE_FRONT + 2}
        filter={`url(#${blur})`}
        rx={WIDTH / 2 - 8}
        ry={5}
      />
      <path
        d={`M ${8} ${BASE_TOP + BASE_DEPTH} L ${18} ${BASE_TOP} H ${WIDTH - 18} L ${WIDTH - 8} ${BASE_TOP + BASE_DEPTH} Z`}
        className="stroke-white/0 dark:stroke-white/12"
        fill={`url(#${baseTop})`}
        strokeLinejoin="round"
      />
      <rect
        fill={`url(#${baseFront})`}
        height={BASE_FRONT}
        rx={3}
        width={WIDTH - 16}
        x={8}
        y={BASE_TOP + BASE_DEPTH}
      />
      <path
        d={`M ${10} ${BASE_TOP + BASE_DEPTH + 0.5} H ${WIDTH - 10}`}
        stroke="#ffffff"
        strokeOpacity={0.14}
      />

      {/* Back rail, then the back strings, both behind every ball. */}
      <path
        d={railPath(RAIL_Y - BACK_RISE, BASE_TOP + 3)}
        fill="none"
        stroke={`url(#${backTube})`}
        strokeLinecap="round"
        strokeWidth={5}
      />

      {shadows &&
        PIVOTS.map((pivot, index) => {
          const shadow = shadowFor(angles[index] ?? 0);
          return (
            <ellipse
              className="fill-black"
              cx={pivot + shadow.cx}
              cy={BASE_TOP + BASE_DEPTH / 2 + 1}
              filter={`url(#${blur})`}
              key={pivot}
              opacity={shadow.opacity}
              ref={refs?.shadow?.(index)}
              rx={shadow.rx}
              ry={3.5}
            />
          );
        })}

      {PIVOTS.map((pivot, index) => {
        const theta = angles[index] ?? 0;
        const anchor = backAnchor(theta);
        return (
          <g key={pivot} transform={`translate(${pivot} ${RAIL_Y})`}>
            <g
              className={ballClassNames?.[index]}
              ref={refs?.back?.(index)}
              transform={`rotate(${-degrees(theta)})`}
            >
              <line
                className="stroke-[#7d828a] dark:stroke-[#8c9199]"
                ref={refs?.backString?.(index)}
                strokeWidth={0.9}
                x1={anchor.x}
                x2={0}
                y1={anchor.y}
                y2={LENGTH - RADIUS - 2}
              />
            </g>
          </g>
        );
      })}

      {/* Balls and their front strings. */}
      {PIVOTS.map((pivot, index) => (
        <g key={pivot} transform={`translate(${pivot} ${RAIL_Y})`}>
          <g
            className={ballClassNames?.[index]}
            ref={refs?.front?.(index)}
            transform={`rotate(${-degrees(angles[index] ?? 0)})`}
          >
            <line
              className="stroke-[#6b7078] dark:stroke-[#a3a8b0]"
              strokeWidth={0.9}
              x1={0}
              x2={0}
              y1={0}
              y2={LENGTH - RADIUS - 2}
            />
            {/* The light stays put in the room, so the steel's shading doesn't swing. */}
            <g
              className={shadeClassNames?.[index]}
              ref={refs?.shade?.(index)}
              transform={`rotate(${degrees(angles[index] ?? 0)} 0 ${LENGTH})`}
            >
              <circle cx={0} cy={LENGTH} fill={`url(#${chrome})`} r={RADIUS} />
              <circle
                cx={0}
                cy={LENGTH}
                fill={`url(#${horizon})`}
                r={RADIUS - 0.5}
              />
              {/* A window, caught in the steel. */}
              <ellipse
                cx={-6.5}
                cy={LENGTH - 8}
                fill="#ffffff"
                opacity={0.85}
                rx={3.6}
                ry={2.4}
                transform={`rotate(-28 -6.5 ${LENGTH - 8})`}
              />
              <circle
                cx={0}
                cy={LENGTH}
                fill="none"
                r={RADIUS - 0.4}
                stroke="#000000"
                strokeOpacity={0.35}
                strokeWidth={0.8}
              />
            </g>
            {/* The eyelet the two strings meet at. */}
            <rect
              fill="#c9cdd3"
              height={4}
              rx={1}
              stroke="#5b6068"
              strokeWidth={0.6}
              width={4}
              x={-2}
              y={LENGTH - RADIUS - 3}
            />
          </g>
        </g>
      ))}

      {/* Front rail, over the top of the strings it holds. */}
      <path
        d={railPath(RAIL_Y, BASE_TOP + BASE_DEPTH - 3)}
        fill="none"
        stroke={`url(#${tube})`}
        strokeLinecap="round"
        strokeWidth={6}
      />
      <path
        d={`M ${CENTRE_X - FRAME_HALF_WIDTH + 16} ${RAIL_Y - 1.4} H ${CENTRE_X + FRAME_HALF_WIDTH - 16}`}
        stroke="#ffffff"
        strokeLinecap="round"
        strokeOpacity={0.75}
        strokeWidth={1.2}
      />
      {PIVOTS.map((pivot) => (
        <rect
          fill="#d6d9de"
          height={5}
          key={pivot}
          rx={1.2}
          stroke="#5b6068"
          strokeWidth={0.6}
          width={3.4}
          x={pivot - 1.7}
          y={RAIL_Y - 2.5}
        />
      ))}
    </svg>
  );
}

const restAngles = Array.from({ length: BALL_COUNT }, () => 0);

export type NewtonsCradleFaceProps = {
  /** Each ball's angle in radians. Positive swings right. */
  angles?: readonly number[];
  ballClassNames?: readonly (string | undefined)[];
  className?: string;
  shadeClassNames?: readonly (string | undefined)[];
};

/** A still drawing of the cradle, for thumbnails and previews. */
export function NewtonsCradleFace({
  angles = restAngles,
  ballClassNames,
  className,
  shadeClassNames,
}: NewtonsCradleFaceProps) {
  return (
    <CradleArt
      angles={angles}
      ballClassNames={ballClassNames}
      className={className}
      shadeClassNames={shadeClassNames}
      shadows={false}
    />
  );
}

/* -------------------------------------------------------------------------- */
/* Cradle                                                                      */
/* -------------------------------------------------------------------------- */

export type NewtonsCradleHandle = {
  /** Lift this many balls out from one end and let them go. */
  drop: (count: number, side?: Side) => void;
  /** Rest a hand on the balls until they stop. */
  still: () => void;
};

export type NewtonsCradleProps = {
  "aria-label"?: string;
  className?: string;
  /** Called on every audible knock, with its strength from 0 to 1. */
  onClack?: (strength: number) => void;
  ref?: Ref<NewtonsCradleHandle>;
  /** Play a synthesised steel knock on every collision. */
  sound?: boolean;
};

export function NewtonsCradle({
  "aria-label": ariaLabel = "Newton's cradle",
  className,
  onClack,
  ref,
  sound = true,
}: NewtonsCradleProps) {
  const shouldReduceMotion = useReducedMotion();
  const helpId = useId();
  const svgHostRef = useRef<HTMLDivElement>(null);
  const frontRefs = useRef<(SVGGElement | null)[]>([]);
  const backRefs = useRef<(SVGGElement | null)[]>([]);
  const backStringRefs = useRef<(SVGLineElement | null)[]>([]);
  const shadeRefs = useRef<(SVGGElement | null)[]>([]);
  const shadowRefs = useRef<(SVGEllipseElement | null)[]>([]);
  const soundRef = useRef(sound);
  const onClackRef = useRef(onClack);
  const reduceRef = useRef(Boolean(shouldReduceMotion));
  const simRef = useRef<Sim>({
    brakeUntil: 0,
    drag: null,
    frame: null,
    hand: null,
    last: 0,
    omega: Array.from({ length: BALL_COUNT }, () => 0),
    theta: Array.from({ length: BALL_COUNT }, () => 0),
  });

  soundRef.current = sound;
  onClackRef.current = onClack;
  reduceRef.current = Boolean(shouldReduceMotion);

  const refs = useRef<CradleRefs>({
    back: (index) => (node) => {
      backRefs.current[index] = node;
    },
    backString: (index) => (node) => {
      backStringRefs.current[index] = node;
    },
    front: (index) => (node) => {
      frontRefs.current[index] = node;
    },
    shade: (index) => (node) => {
      shadeRefs.current[index] = node;
    },
    shadow: (index) => (node) => {
      shadowRefs.current[index] = node;
    },
  }).current;

  const paint = useCallback(() => {
    const { theta } = simRef.current;

    for (let index = 0; index < BALL_COUNT; index += 1) {
      const angle = theta[index];
      const rotation = `rotate(${(-degrees(angle)).toFixed(3)})`;
      frontRefs.current[index]?.setAttribute("transform", rotation);
      backRefs.current[index]?.setAttribute("transform", rotation);
      shadeRefs.current[index]?.setAttribute(
        "transform",
        `rotate(${degrees(angle).toFixed(3)} 0 ${LENGTH})`,
      );

      const anchor = backAnchor(angle);
      const line = backStringRefs.current[index];
      line?.setAttribute("x1", anchor.x.toFixed(2));
      line?.setAttribute("y1", anchor.y.toFixed(2));

      const shadow = shadowFor(angle);
      const ellipse = shadowRefs.current[index];
      ellipse?.setAttribute("cx", (PIVOTS[index] + shadow.cx).toFixed(2));
      ellipse?.setAttribute("rx", shadow.rx.toFixed(2));
      ellipse?.setAttribute("opacity", shadow.opacity.toFixed(3));
    }
  }, []);

  const tick = useCallback(
    (now: number) => {
      const sim = simRef.current;
      const dt = Math.min((now - sim.last) / 1000, 1 / 30);
      sim.last = now;

      const { omega, theta } = sim;
      const held = Array.from({ length: BALL_COUNT }, () => false);
      const targets: (number | null)[] = Array.from(
        { length: BALL_COUNT },
        () => null,
      );

      if (sim.drag) {
        held[sim.drag.index] = true;
        targets[sim.drag.index] = sim.drag.target;
      }

      const hand = sim.hand;
      let steadyingRest = false;

      if (hand) {
        const elapsed = now - hand.start;
        const progress = hand.lift === 0 ? 1 : clamp(elapsed / hand.lift, 0, 1);
        const eased = easeInOut(progress);

        hand.indices.forEach((ball, order) => {
          held[ball] = true;
          targets[ball] =
            hand.from[order] + (hand.to - hand.from[order]) * eased;
        });

        steadyingRest = true;

        if (elapsed >= hand.lift + hand.hold) {
          for (const ball of hand.indices) {
            held[ball] = false;
            targets[ball] = null;
            theta[ball] = hand.to;
            omega[ball] = 0;
          }
          sim.hand = null;
          steadyingRest = false;
        }
      }

      const braking = now < sim.brakeUntil;
      const drag = braking
        ? BRAKE_DRAG
        : reduceRef.current
          ? REDUCED_AIR_DRAG
          : AIR_DRAG;
      const restDrag = steadyingRest ? BRAKE_DRAG : drag;
      const steps = Math.max(1, Math.ceil(dt / SUBSTEP));
      const h = dt / steps;
      const starts = theta.slice();
      let impact = 0;

      for (let step = 1; step <= steps; step += 1) {
        for (let index = 0; index < BALL_COUNT; index += 1) {
          const target = targets[index];

          if (held[index] && target !== null) {
            // Held balls follow the hand, and carry its speed into a knock.
            const next =
              starts[index] + ((target - starts[index]) * step) / steps;
            omega[index] = (next - theta[index]) / h;
            theta[index] = next;
            continue;
          }

          omega[index] +=
            (-STIFFNESS * Math.sin(theta[index]) - restDrag * omega[index]) * h;
          theta[index] += omega[index] * h;

          if (Math.abs(theta[index]) > MAX_ANGLE) {
            theta[index] = Math.sign(theta[index]) * MAX_ANGLE;
            omega[index] *= -0.2;
          }
        }

        impact = Math.max(impact, resolveContacts(sim, held));
      }

      paint();

      if (impact > SILENT_SPEED) {
        const strength = clamp(
          (impact - SILENT_SPEED) / (LOUD_SPEED - SILENT_SPEED),
          0,
          1,
        );

        if (soundRef.current) {
          playClack(strength);
        }

        if (strength > 0.35) {
          buzz(Math.round(4 + strength * 6));
        }

        onClackRef.current?.(strength);
      }

      const resting =
        !sim.drag &&
        !sim.hand &&
        theta.every((angle) => Math.abs(angle) < 2e-4) &&
        omega.every((speed) => Math.abs(speed) < 2e-3);

      if (resting) {
        theta.fill(0);
        omega.fill(0);
        paint();
        sim.frame = null;
        return;
      }

      sim.frame = requestAnimationFrame(tick);
    },
    [paint],
  );

  const wake = useCallback(() => {
    const sim = simRef.current;

    if (sim.frame !== null) {
      return;
    }

    sim.last = performance.now();
    sim.frame = requestAnimationFrame(tick);
  }, [tick]);

  useEffect(() => {
    const sim = simRef.current;
    return () => {
      if (sim.frame !== null) {
        cancelAnimationFrame(sim.frame);
        sim.frame = null;
      }
    };
  }, []);

  const drop = useCallback(
    (count: number, side: Side = "left") => {
      const sim = simRef.current;
      const n = clamp(Math.round(count), 1, BALL_COUNT - 1);
      const indices = Array.from({ length: n }, (_, index) =>
        side === "left" ? index : BALL_COUNT - 1 - index,
      );

      sim.drag = null;
      sim.brakeUntil = 0;
      sim.hand = {
        from: indices.map((ball) => sim.theta[ball]),
        hold: reduceRef.current ? 60 : 160,
        indices,
        lift: reduceRef.current ? 0 : 520,
        start: performance.now(),
        to: side === "left" ? -LIFT_ANGLE : LIFT_ANGLE,
      };
      wake();
    },
    [wake],
  );

  const still = useCallback(() => {
    const sim = simRef.current;
    sim.hand = null;
    sim.drag = null;
    sim.brakeUntil = performance.now() + 900;
    wake();
  }, [wake]);

  useImperativeHandle(ref, () => ({ drop, still }), [drop, still]);

  /* ------------------------------------------------------------------------ */
  /* Input                                                                     */
  /* ------------------------------------------------------------------------ */

  function toSvgPoint(clientX: number, clientY: number) {
    const svg = svgHostRef.current?.querySelector("svg");
    const matrix = svg?.getScreenCTM();

    if (!svg || !matrix) {
      return null;
    }

    const point = new DOMPoint(clientX, clientY).matrixTransform(
      matrix.inverse(),
    );
    return { x: point.x, y: point.y };
  }

  function angleTowards(index: number, x: number, y: number) {
    const dx = x - PIVOTS[index];
    const dy = Math.max(y - RAIL_Y, 12);
    return clamp(Math.atan2(dx, dy), -MAX_ANGLE, MAX_ANGLE);
  }

  function armSound() {
    if (soundRef.current) {
      getAudioContext();
    }
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) {
      return;
    }

    const point = toSvgPoint(event.clientX, event.clientY);

    if (!point) {
      return;
    }

    const { theta } = simRef.current;
    let nearest = -1;
    let nearestDistance = RADIUS + 16;

    for (let index = 0; index < BALL_COUNT; index += 1) {
      const ballX = PIVOTS[index] + reach(theta[index]);
      const ballY = RAIL_Y + LENGTH * Math.cos(theta[index]);
      const distance = Math.hypot(point.x - ballX, point.y - ballY);

      if (distance < nearestDistance) {
        nearest = index;
        nearestDistance = distance;
      }
    }

    if (nearest === -1) {
      return;
    }

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    armSound();

    const sim = simRef.current;
    sim.hand = null;
    sim.brakeUntil = 0;
    sim.drag = {
      history: [{ t: performance.now(), theta: theta[nearest] }],
      index: nearest,
      pointerId: event.pointerId,
      target: theta[nearest],
    };
    event.currentTarget.dataset.dragging = "";
    wake();
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    const drag = simRef.current.drag;

    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    const point = toSvgPoint(event.clientX, event.clientY);

    if (!point) {
      return;
    }

    drag.target = angleTowards(drag.index, point.x, point.y);
    const now = performance.now();
    drag.history.push({ t: now, theta: drag.target });

    while (drag.history.length > 2 && now - drag.history[0].t > 80) {
      drag.history.shift();
    }
  }

  function endDrag(event: PointerEvent<HTMLDivElement>) {
    const sim = simRef.current;
    const drag = sim.drag;

    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    delete event.currentTarget.dataset.dragging;
    sim.drag = null;

    // Let go with the hand's speed, but never hard enough to hit the frame.
    const first = drag.history[0];
    const last = drag.history[drag.history.length - 1];
    const span = (last.t - first.t) / 1000;
    const thrown = span > 0.008 ? (last.theta - first.theta) / span : 0;
    const angle = sim.theta[drag.index];
    const limit = maxOmegaAt(angle);
    sim.omega[drag.index] = clamp(thrown, -limit, limit);
    wake();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const digit = /^Digit([1-4])$/.exec(event.code);

    if (digit) {
      event.preventDefault();
      armSound();
      drop(Number(digit[1]), event.shiftKey ? "right" : "left");
      return;
    }

    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      armSound();
      drop(1, event.key === "ArrowLeft" ? "left" : "right");
      return;
    }

    if (event.key === " " || event.key === "Escape" || event.key === "0") {
      event.preventDefault();
      still();
    }
  }

  return (
    <div
      aria-describedby={helpId}
      aria-label={ariaLabel}
      aria-roledescription="desk toy"
      className={cn(
        "relative w-full cursor-grab touch-pan-y select-none rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-grayscale-7 focus-visible:ring-offset-4 focus-visible:ring-offset-grayscale-1 data-dragging:cursor-grabbing dark:focus-visible:ring-offset-grayscale-2",
        className,
      )}
      onKeyDown={handleKeyDown}
      onLostPointerCapture={endDrag}
      onPointerCancel={endDrag}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      ref={svgHostRef}
      role="application"
      // biome-ignore lint/a11y/noNoninteractiveTabindex: it's played from the keyboard too
      tabIndex={0}
    >
      <CradleArt angles={restAngles} refs={refs} />
      <span className="sr-only" id={helpId}>
        Drag a ball out and let go. Press 1 to 4 to lift that many balls from
        the left, with Shift from the right. The arrow keys lift one ball from
        either end. Space stops the balls.
      </span>
    </div>
  );
}
