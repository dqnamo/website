"use client";

import {
  animate,
  type MotionValue,
  motion,
  type Transition,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useTransform,
} from "motion/react";
import {
  type KeyboardEvent,
  type PointerEvent,
  type Ref,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { cn } from "@/helpers/classname-helper";

/** Full stops, wide open to stopped down. */
export const FULL_STOPS = [1.4, 2, 2.8, 4, 5.6, 8, 11, 16] as const;

/** Degrees the aperture ring turns between neighbouring stops. */
const STOP_ANGLE = 24;
/** How far past the last stop the ring gives before it refuses to turn. */
const END_GIVE = 6;
/** How much of the hand's travel the ring follows while it sits in a detent. */
const DETENT_GRIP = 0.55;
/** How far the blades swing round, in radians, as they close all the way. */
const BLADE_TWIST = 0.85;

/* The lens is drawn in a 200 × 200 box centred on the axis. */
const IRIS_RADIUS = 64;
const RING_INNER = 79;

const TURN_SPRING: Transition = { damping: 34, stiffness: 820, type: "spring" };
const SETTLE_SPRING: Transition = {
  damping: 24,
  stiffness: 420,
  type: "spring",
};

export type ApertureHandle = {
  /**
   * Fire the shutter: the blades snap shut, hold for the exposure, then spring
   * back open. Resolves once they are open again.
   */
  release: (exposureSeconds?: number) => Promise<void>;
};

export type ApertureProps = {
  /** The f-numbers printed on the ring, from wide open to stopped down. */
  stops?: readonly number[];
  value?: number;
  defaultValue?: number;
  onValueChange?: (fNumber: number) => void;
  /**
   * Called every frame the iris moves, with how open it is from 0 (shut) to
   * 1 (wide open). Handy for driving bokeh or exposure previews.
   */
  onIrisChange?: (openness: number) => void;
  /** How many blades make up the iris. */
  blades?: number;
  /** Lens diameter in pixels. */
  size?: number;
  /** Play synthesised detent clicks and a shutter clack. */
  sound?: boolean;
  /** Engraved on the name ring. */
  inscription?: string;
  label?: string;
  className?: string;
  ref?: Ref<ApertureHandle>;
};

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

function wrapDegrees(degrees: number) {
  return ((((degrees + 180) % 360) + 360) % 360) - 180;
}

function wait(milliseconds: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });
}

function formatStop(fNumber: number) {
  return Number.isInteger(fNumber) ? `${fNumber}` : fNumber.toFixed(1);
}

/* -------------------------------------------------------------------------- */
/* Sound                                                                       */
/* -------------------------------------------------------------------------- */

let sharedAudioContext: AudioContext | null = null;
let lastClickAt = 0;
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

/** A short burst of decaying noise, the raw material of every click here. */
function noiseBuffer(context: AudioContext, duration: number, decay: number) {
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

function playNoise(
  context: AudioContext,
  at: number,
  {
    decay,
    duration,
    frequency,
    gain,
    q,
  }: {
    decay: number;
    duration: number;
    frequency: number;
    gain: number;
    q: number;
  },
) {
  const source = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const volume = context.createGain();

  source.buffer = noiseBuffer(context, duration, decay);
  filter.type = "bandpass";
  filter.frequency.value = frequency;
  filter.Q.value = q;
  volume.gain.value = gain;
  source.connect(filter).connect(volume).connect(context.destination);
  source.start(at);
}

/** The ball bearing dropping into the next notch on the aperture ring. */
function playDetent() {
  const context = getAudioContext();

  if (!context) {
    return;
  }

  const now = context.currentTime;

  if (now - lastClickAt < 0.02) {
    return;
  }

  lastClickAt = now;
  playNoise(context, now, {
    decay: 0.0012,
    duration: 0.014,
    frequency: 4200,
    gain: 0.5,
    q: 1.6,
  });
}

/** The blades slamming shut, then the spring throwing them open. */
function playShutter(phase: "close" | "open") {
  const context = getAudioContext();

  if (!context) {
    return;
  }

  const now = context.currentTime;
  const isClose = phase === "close";

  playNoise(context, now, {
    decay: isClose ? 0.004 : 0.003,
    duration: 0.04,
    frequency: isClose ? 1500 : 2300,
    gain: isClose ? 0.9 : 0.7,
    q: 0.9,
  });
  // A dull knock from the body under the metallic tick.
  playNoise(context, now + 0.004, {
    decay: 0.01,
    duration: 0.06,
    frequency: isClose ? 220 : 320,
    gain: isClose ? 1.4 : 0.8,
    q: 1.2,
  });
}

function buzz(duration: number) {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    navigator.vibrate?.(duration);
  }
}

/* -------------------------------------------------------------------------- */
/* Iris geometry                                                               */
/* -------------------------------------------------------------------------- */

type Point = readonly [number, number];

/**
 * The iris opening is a regular polygon. Each blade's working edge lies on one
 * of its sides, tangent to a circle of radius `inradius`. As the iris closes
 * the edges also swing round a little, the way real blades pivot on their pins.
 */
function bladeEdges(openness: number, blades: number, radius: number) {
  const fullyOpen = radius * Math.cos(Math.PI / blades);
  const inradius = fullyOpen * clamp(openness, 0, 1);
  const twist = BLADE_TWIST * (1 - clamp(openness, 0, 1));
  const half = Math.PI / blades;

  return Array.from({ length: blades }, (_, index) => {
    const angle = -Math.PI / 2 + (index * Math.PI * 2) / blades + twist;
    const normal: Point = [Math.cos(angle), Math.sin(angle)];
    const tangent: Point = [-Math.sin(angle), Math.cos(angle)];
    const along = inradius * Math.tan(half);

    return {
      angle,
      // Where this edge meets the previous blade's edge, and the next one's.
      end: [
        normal[0] * inradius + tangent[0] * along,
        normal[1] * inradius + tangent[1] * along,
      ] as Point,
      start: [
        normal[0] * inradius - tangent[0] * along,
        normal[1] * inradius - tangent[1] * along,
      ] as Point,
      tangent,
    };
  });
}

/** The opening's corners, for drawing bokeh in the shape of the iris. */
export function irisOpeningPoints(
  openness: number,
  blades = 7,
  radius = 1,
): Point[] {
  return bladeEdges(openness, blades, radius).map((edge) => edge.start);
}

function toPath(points: readonly Point[], close = true) {
  const commands = points.map(
    ([x, y], index) =>
      `${index === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`,
  );
  return `${commands.join(" ")}${close ? " Z" : ""}`;
}

/** Far enough out that a blade's back corner always sits beyond the barrel. */
const REACH = IRIS_RADIUS * 3;

/**
 * Each blade shows the wedge between its own edge and the next blade's, so the
 * blades overlap in a ring without any of them having to be on top of all.
 */
function bladeShape(openness: number, blades: number, index: number) {
  const edges = bladeEdges(openness, blades, IRIS_RADIUS);
  const edge = edges[index];
  const next = edges[(index + 1) % blades];
  const back: Point = [
    edge.start[0] - edge.tangent[0] * REACH,
    edge.start[1] - edge.tangent[1] * REACH,
  ];
  const nextBack: Point = [
    next.start[0] - next.tangent[0] * REACH,
    next.start[1] - next.tangent[1] * REACH,
  ];

  return {
    // The visible edge runs in from the barrel, along the side of the opening.
    edge: toPath([back, edge.start, edge.end], false),
    fill: toPath([back, edge.start, edge.end, nextBack]),
    // Blades are matte black, but catch the light from the upper left.
    tone: (Math.cos(edge.angle + Math.PI / blades + (Math.PI * 3) / 4) + 1) / 2,
  };
}

function bladeColor(tone: number) {
  return `hsl(222 9% ${(7 + tone * 13).toFixed(1)}%)`;
}

/* -------------------------------------------------------------------------- */
/* Visual pieces                                                               */
/* -------------------------------------------------------------------------- */

function Blade({
  blades,
  index,
  openness,
}: {
  blades: number;
  index: number;
  openness: MotionValue<number>;
}) {
  const fill = useTransform(
    openness,
    (value) => bladeShape(value, blades, index).fill,
  );
  const color = useTransform(openness, (value) =>
    bladeColor(bladeShape(value, blades, index).tone),
  );

  return <motion.path d={fill} fill={color} />;
}

function BladeEdge({
  blades,
  index,
  openness,
}: {
  blades: number;
  index: number;
  openness: MotionValue<number>;
}) {
  const edge = useTransform(
    openness,
    (value) => bladeShape(value, blades, index).edge,
  );

  return (
    <>
      <motion.path
        d={edge}
        fill="none"
        stroke="rgb(0 0 0 / 0.6)"
        strokeLinejoin="round"
        strokeWidth={2.6}
      />
      <motion.path
        d={edge}
        fill="none"
        stroke="rgb(255 255 255 / 0.16)"
        strokeLinejoin="round"
        strokeWidth={0.6}
      />
    </>
  );
}

function safeId(id: string) {
  return id.replace(/[^a-zA-Z0-9_-]/g, "");
}

/** The ridges that give your fingers something to turn. */
const KNURLS = Array.from({ length: 90 }, (_, index) => index * 4);

function LensBody({
  blades,
  inscription,
  openness,
  ringAngle,
  selectedIndex,
  stops,
  tiltX,
  tiltY,
}: {
  blades: number;
  inscription: string;
  openness: MotionValue<number>;
  ringAngle: MotionValue<number> | number;
  selectedIndex: number;
  stops: readonly number[];
  tiltX?: MotionValue<number>;
  tiltY?: MotionValue<number>;
}) {
  const id = safeId(useId());
  const zeroX = useMotionValue(0);
  const zeroY = useMotionValue(0);
  const glintX = tiltX ?? zeroX;
  const glintY = tiltY ?? zeroY;
  const sheenX = useTransform(glintX, (value) => value * -6);
  const sheenY = useTransform(glintY, (value) => value * -6);
  const coatX = useTransform(glintX, (value) => value * 4);
  const coatY = useTransform(glintY, (value) => value * 4);

  return (
    <svg
      aria-hidden="true"
      className="block size-full overflow-visible"
      viewBox="-100 -100 200 200"
    >
      <defs>
        <radialGradient id={`${id}-barrel`}>
          <stop offset="0.78" stopColor="#0c0c0e" />
          <stop offset="0.94" stopColor="#1b1b1e" />
          <stop offset="1" stopColor="#101012" />
        </radialGradient>
        <linearGradient id={`${id}-light`} x1="0" x2="0.4" y1="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.16" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.35" />
        </linearGradient>
        <radialGradient id={`${id}-depth`}>
          <stop offset="0" stopColor="#101a2a" />
          <stop offset="0.55" stopColor="#060a12" />
          <stop offset="1" stopColor="#020305" />
        </radialGradient>
        <radialGradient cx="0.32" cy="0.26" id={`${id}-sheen`} r="0.42">
          <stop offset="0" stopColor="#fff" stopOpacity="0.22" />
          <stop offset="0.55" stopColor="#fff" stopOpacity="0.04" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${id}-coating`} x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="#b26bff" stopOpacity="0.75" />
          <stop offset="0.45" stopColor="#5d7bff" stopOpacity="0" />
          <stop offset="0.6" stopColor="#3dffa8" stopOpacity="0" />
          <stop offset="1" stopColor="#3dffa8" stopOpacity="0.6" />
        </linearGradient>
        <clipPath id={`${id}-iris`}>
          <circle r={IRIS_RADIUS} />
        </clipPath>
        <path
          d="M 0 -73.5 A 73.5 73.5 0 1 1 -0.01 -73.5"
          id={`${id}-inscription`}
        />
        <filter height="2" id={`${id}-soft`} width="2" x="-0.5" y="-0.5">
          <feGaussianBlur stdDeviation="1.2" />
        </filter>
      </defs>

      {/* The barrel, with a shadow it casts on whatever it sits on. */}
      <circle fill={`url(#${id}-barrel)`} r="100" />

      {/* The aperture ring: knurled grip and printed f-numbers. */}
      <motion.g style={{ rotate: ringAngle, transformOrigin: "0px 0px" }}>
        <circle fill="#141416" r="99.2" />
        {KNURLS.map((angle) => (
          <rect
            fill="#26262a"
            height="7"
            key={angle}
            transform={`rotate(${angle})`}
            width="1.7"
            x="-0.85"
            y="-99"
          />
        ))}
        <circle fill="#0d0d0f" r="91.5" />
        <circle
          fill="none"
          r="91.5"
          stroke="rgb(255 255 255 / 0.07)"
          strokeWidth="0.6"
        />
        {stops.map((stop, index) => {
          const isLast = index === stops.length - 1;
          const isSelected = index === selectedIndex;

          return (
            <g key={stop} transform={`rotate(${index * STOP_ANGLE})`}>
              <text
                className="font-mono"
                fill={isLast ? "#ff9a3c" : "#f4f1ea"}
                fillOpacity={isSelected ? 1 : 0.62}
                fontSize="8.4"
                fontWeight={600}
                style={{ transition: "fill-opacity 200ms" }}
                textAnchor="middle"
                y="-82.4"
              >
                {formatStop(stop)}
              </text>
              {index < stops.length - 1 ? (
                <circle
                  cy="-85.2"
                  fill="#f4f1ea"
                  fillOpacity="0.35"
                  r="0.7"
                  transform={`rotate(${STOP_ANGLE / 2})`}
                />
              ) : null}
            </g>
          );
        })}
      </motion.g>

      {/* The fixed index the f-numbers are read against. */}
      <circle fill="#18181b" r={RING_INNER} />
      <circle
        fill="none"
        r={RING_INNER}
        stroke="rgb(0 0 0 / 0.8)"
        strokeWidth="1.2"
      />
      <path d="M -2.6 -78.4 L 2.6 -78.4 L 0 -82.6 Z" fill="#f4f1ea" />

      {/* The name ring, engraved. */}
      <circle fill="#0b0b0d" r="77" />
      <text
        className="font-mono"
        fill="#cfcac0"
        fillOpacity="0.72"
        fontSize="5"
        letterSpacing="1.1"
      >
        <textPath href={`#${id}-inscription`} startOffset="3%">
          {inscription}
        </textPath>
      </text>
      <circle
        fill="none"
        r="68.5"
        stroke="#000"
        strokeOpacity="0.9"
        strokeWidth="3"
      />
      <circle
        fill="none"
        r="70.2"
        stroke="#fff"
        strokeOpacity="0.07"
        strokeWidth="0.5"
      />

      {/* Behind the iris: the dark of the lens and the rear element's glint. */}
      <g clipPath={`url(#${id}-iris)`}>
        <circle fill={`url(#${id}-depth)`} r={IRIS_RADIUS} />
        <circle
          fill="none"
          r="15"
          stroke="#62ffbe"
          strokeOpacity="0.16"
          strokeWidth="0.8"
        />
        <circle cx="4" cy="-5" fill="#a9c6ff" fillOpacity="0.5" r="1.1" />

        {Array.from({ length: blades }, (_, index) => (
          <Blade
            blades={blades}
            // biome-ignore lint/suspicious/noArrayIndexKey: blades never reorder.
            key={index}
            index={index}
            openness={openness}
          />
        ))}
        {Array.from({ length: blades }, (_, index) => (
          <BladeEdge
            blades={blades}
            // biome-ignore lint/suspicious/noArrayIndexKey: blades never reorder.
            key={index}
            index={index}
            openness={openness}
          />
        ))}

        {/* The front element: coating colours and a soft window reflection. */}
        <motion.circle
          fill="none"
          filter={`url(#${id}-soft)`}
          r="46"
          stroke={`url(#${id}-coating)`}
          strokeOpacity="0.5"
          strokeWidth="2.4"
          style={{ x: coatX, y: coatY }}
        />
        <motion.circle
          fill={`url(#${id}-sheen)`}
          r={IRIS_RADIUS}
          style={{ x: sheenX, y: sheenY }}
        />
        <motion.ellipse
          cx="-24"
          cy="-30"
          fill="#fff"
          fillOpacity="0.32"
          filter={`url(#${id}-soft)`}
          rx="7"
          ry="3.2"
          style={{ x: sheenX, y: sheenY }}
          transform="rotate(-38 -24 -30)"
        />
      </g>
      <circle
        fill="none"
        r={IRIS_RADIUS}
        stroke="rgb(0 0 0 / 0.85)"
        strokeWidth="1.5"
      />

      {/* One light falls across the whole lens. */}
      <circle fill={`url(#${id}-light)`} pointerEvents="none" r="100" />
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/* Fractional stops                                                            */
/* -------------------------------------------------------------------------- */

/** Ring position to f-number, spaced evenly in stops rather than in numbers. */
function fNumberAt(position: number, stops: readonly number[]) {
  const last = stops.length - 1;
  const clamped = clamp(position, 0, last);
  const lower = Math.min(Math.floor(clamped), last - 1);
  const t = clamped - lower;

  if (last === 0) {
    return stops[0];
  }

  return Math.exp(
    Math.log(stops[lower]) * (1 - t) + Math.log(stops[lower + 1]) * t,
  );
}

/** A decorative, non-interactive lens for thumbnails and previews. */
export function ApertureFace({
  blades = 7,
  className,
  inscription = "dqnamo  ·  35mm  1:1.4  ·  ø52",
  size = 96,
  stopIndex = 0,
  stops = FULL_STOPS,
}: {
  blades?: number;
  className?: string;
  inscription?: string;
  size?: number;
  /** Which stop to show. Changes animate. */
  stopIndex?: number;
  stops?: readonly number[];
}) {
  const shouldReduceMotion = useReducedMotion();
  const ringAngle = useMotionValue(-stopIndex * STOP_ANGLE);
  const openness = useTransform(
    ringAngle,
    (angle) => stops[0] / fNumberAt(-angle / STOP_ANGLE, stops),
  );

  useEffect(() => {
    const target = -stopIndex * STOP_ANGLE;

    if (shouldReduceMotion) {
      ringAngle.set(target);
      return;
    }

    const controls = animate(ringAngle, target, SETTLE_SPRING);
    return () => controls.stop();
  }, [ringAngle, shouldReduceMotion, stopIndex]);

  return (
    <div
      aria-hidden="true"
      className={cn("relative rounded-full", className)}
      style={{
        boxShadow: "0 2px 4px rgb(0 0 0 / 22%), 0 10px 24px rgb(0 0 0 / 18%)",
        height: size,
        width: size,
      }}
    >
      <LensBody
        blades={blades}
        inscription={inscription}
        openness={openness}
        ringAngle={ringAngle}
        selectedIndex={stopIndex}
        stops={stops}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* The lens                                                                    */
/* -------------------------------------------------------------------------- */

export function Aperture({
  blades = 7,
  className,
  defaultValue,
  inscription = "dqnamo  ·  35mm  1:1.4  ·  ø52",
  label = "Aperture",
  onIrisChange,
  onValueChange,
  ref,
  size = 260,
  sound = true,
  stops = FULL_STOPS,
  value: controlledValue,
}: ApertureProps) {
  const shouldReduceMotion = useReducedMotion();
  const last = stops.length - 1;
  const indexOf = useCallback(
    (fNumber: number) => {
      let best = 0;

      for (let index = 1; index <= last; index += 1) {
        if (
          Math.abs(Math.log(stops[index] / fNumber)) <
          Math.abs(Math.log(stops[best] / fNumber))
        ) {
          best = index;
        }
      }

      return best;
    },
    [last, stops],
  );

  const [uncontrolledValue, setUncontrolledValue] = useState(
    () => defaultValue ?? stops[0],
  );
  const value = controlledValue ?? uncontrolledValue;
  const index = indexOf(value);
  const indexRef = useRef(index);
  indexRef.current = index;

  const ringAngle = useMotionValue(-index * STOP_ANGLE);
  // 1 while the shutter is open for viewing, 0 while the blades are slammed.
  const shutter = useMotionValue(1);
  const openness = useTransform<number, number>(
    [ringAngle, shutter],
    ([angle, open]) =>
      (stops[0] / fNumberAt(-angle / STOP_ANGLE, stops)) * clamp(open, 0, 1),
  );
  const tiltX = useMotionValue(0);
  const tiltY = useMotionValue(0);

  const onIrisChangeRef = useRef(onIrisChange);
  onIrisChangeRef.current = onIrisChange;

  useMotionValueEvent(openness, "change", (latest) => {
    onIrisChangeRef.current?.(latest);
  });

  useEffect(() => {
    onIrisChangeRef.current?.(openness.get());
  }, [openness]);

  const dragRef = useRef<{
    centreX: number;
    centreY: number;
    lastPointerAngle: number;
    pointerId: number;
    raw: number;
  } | null>(null);
  const [dragging, setDragging] = useState(false);

  const turnTo = useCallback(
    (angle: number, transition = TURN_SPRING) => {
      if (shouldReduceMotion) {
        ringAngle.set(angle);
        return;
      }

      animate(ringAngle, angle, transition);
    },
    [ringAngle, shouldReduceMotion],
  );

  // Follow the value when it changes from outside, unless a hand is on it.
  useEffect(() => {
    if (!dragRef.current) {
      turnTo(-index * STOP_ANGLE, SETTLE_SPRING);
    }
  }, [index, turnTo]);

  const commit = useCallback(
    (nextIndex: number) => {
      if (nextIndex === indexRef.current) {
        return;
      }

      indexRef.current = nextIndex;
      setUncontrolledValue(stops[nextIndex]);
      onValueChange?.(stops[nextIndex]);

      if (sound) {
        playDetent();
      }

      buzz(5);
    },
    [onValueChange, sound, stops],
  );

  const stepBy = useCallback(
    (delta: number) => {
      const target = clamp(indexRef.current + delta, 0, last);

      if (target === indexRef.current) {
        // Already at the end: nudge against the stop so it reads as solid.
        turnTo(-target * STOP_ANGLE + Math.sign(delta) * -3);
        window.setTimeout(() => turnTo(-target * STOP_ANGLE), 90);
        return;
      }

      commit(target);
      turnTo(-target * STOP_ANGLE, SETTLE_SPRING);
    },
    [commit, last, turnTo],
  );

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) {
      return;
    }

    const bounds = event.currentTarget.getBoundingClientRect();
    const centreX = bounds.left + bounds.width / 2;
    const centreY = bounds.top + bounds.height / 2;

    event.currentTarget.setPointerCapture(event.pointerId);
    event.currentTarget.focus({ preventScroll: true });
    dragRef.current = {
      centreX,
      centreY,
      lastPointerAngle:
        (Math.atan2(event.clientY - centreY, event.clientX - centreX) * 180) /
        Math.PI,
      pointerId: event.pointerId,
      raw: -indexRef.current * STOP_ANGLE,
    };
    setDragging(true);
    getAudioContext();
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / bounds.width - 0.5;
    const y = (event.clientY - bounds.top) / bounds.height - 0.5;

    tiltX.set(clamp(x * 2, -1, 1));
    tiltY.set(clamp(y * 2, -1, 1));

    const drag = dragRef.current;

    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    const dx = event.clientX - drag.centreX;
    const dy = event.clientY - drag.centreY;

    // Too close to the axis and the angle swings wildly; wait for leverage.
    if (Math.hypot(dx, dy) < size * 0.08) {
      return;
    }

    const pointerAngle = (Math.atan2(dy, dx) * 180) / Math.PI;
    const delta = wrapDegrees(pointerAngle - drag.lastPointerAngle);
    drag.lastPointerAngle = pointerAngle;
    drag.raw = clamp(
      drag.raw + delta,
      -last * STOP_ANGLE - STOP_ANGLE,
      STOP_ANGLE,
    );

    const nearest = clamp(Math.round(-drag.raw / STOP_ANGLE), 0, last);
    commit(nearest);

    // The ring hangs on to its notch, then gives once you're past halfway.
    const rest = -nearest * STOP_ANGLE;
    const offset = (drag.raw - rest) * DETENT_GRIP;
    const pastEnd =
      (nearest === 0 && offset > 0) || (nearest === last && offset < 0);
    const give = pastEnd
      ? Math.sign(offset) * END_GIVE * (1 - Math.exp(-Math.abs(offset) / 8))
      : offset;

    turnTo(rest + give);
  }

  function endDrag(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;

    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    dragRef.current = null;
    setDragging(false);
    turnTo(-indexRef.current * STOP_ANGLE, SETTLE_SPRING);
  }

  function handlePointerLeave() {
    if (!dragRef.current) {
      animate(tiltX, 0, SETTLE_SPRING);
      animate(tiltY, 0, SETTLE_SPRING);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const deltas: Record<string, number> = {
      ArrowDown: -1,
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: 1,
      End: last,
      Home: -last,
      PageDown: -2,
      PageUp: 2,
    };
    const delta = deltas[event.key];

    if (delta === undefined) {
      return;
    }

    event.preventDefault();
    stepBy(delta);
  }

  // React's onWheel is passive, so attach a listener that may cancel scrolling.
  const surfaceRef = useRef<HTMLDivElement>(null);
  const wheelRef = useRef({ accumulated: 0, stepBy });
  wheelRef.current.stepBy = stepBy;

  useEffect(() => {
    const surface = surfaceRef.current;

    if (!surface) {
      return;
    }

    function handleWheel(event: WheelEvent) {
      event.preventDefault();
      const state = wheelRef.current;
      const delta =
        Math.abs(event.deltaY) >= Math.abs(event.deltaX)
          ? event.deltaY
          : -event.deltaX;

      state.accumulated += event.deltaMode === 1 ? delta * 40 : delta;

      while (Math.abs(state.accumulated) >= 50) {
        const direction = Math.sign(state.accumulated);
        state.accumulated -= direction * 50;
        state.stepBy(direction);
      }
    }

    surface.addEventListener("wheel", handleWheel, { passive: false });
    return () => surface.removeEventListener("wheel", handleWheel);
  }, []);

  const busyRef = useRef(false);

  useImperativeHandle(
    ref,
    () => ({
      async release(exposureSeconds = 1 / 125) {
        if (busyRef.current) {
          return;
        }

        busyRef.current = true;
        const exposure = Math.max(40, exposureSeconds * 1000);

        if (sound) {
          playShutter("close");
        }

        buzz(12);

        if (shouldReduceMotion) {
          await wait(exposure);
        } else {
          await animate(shutter, 0, {
            duration: 0.06,
            ease: [0.55, 0, 1, 0.6],
          });
          await wait(exposure);
        }

        if (sound) {
          playShutter("open");
        }

        if (!shouldReduceMotion) {
          await animate(shutter, 1, {
            damping: 22,
            stiffness: 360,
            type: "spring",
          });
        }

        busyRef.current = false;
      },
    }),
    [shouldReduceMotion, shutter, sound],
  );

  return (
    <div
      aria-label={label}
      aria-valuemax={stops[last]}
      aria-valuemin={stops[0]}
      aria-valuenow={value}
      aria-valuetext={`f/${formatStop(stops[index])}`}
      className={cn(
        "relative cursor-grab touch-none select-none rounded-full outline-none focus-visible:ring-2 focus-visible:ring-grayscale-8 focus-visible:ring-offset-4 focus-visible:ring-offset-grayscale-1 dark:focus-visible:ring-offset-grayscale-2",
        dragging && "cursor-grabbing",
        className,
      )}
      onKeyDown={handleKeyDown}
      onLostPointerCapture={endDrag}
      onPointerCancel={endDrag}
      onPointerDown={handlePointerDown}
      onPointerLeave={handlePointerLeave}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      ref={surfaceRef}
      role="slider"
      style={{
        boxShadow:
          "0 0 0 1px rgb(0 0 0 / 35%), 0 3px 6px rgb(0 0 0 / 22%), 0 16px 36px rgb(0 0 0 / 20%), 0 40px 80px rgb(0 0 0 / 12%)",
        height: size,
        width: size,
      }}
      tabIndex={0}
    >
      <LensBody
        blades={blades}
        inscription={inscription}
        openness={openness}
        ringAngle={ringAngle}
        selectedIndex={index}
        stops={stops}
        tiltX={tiltX}
        tiltY={tiltY}
      />
    </div>
  );
}
