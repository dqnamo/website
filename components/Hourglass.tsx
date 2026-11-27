"use client";

import NumberFlow from "@number-flow/react";
import {
  type AnimationPlaybackControls,
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from "motion/react";
import {
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
/* Geometry                                                                    */
/* -------------------------------------------------------------------------- */

/*
 * Everything is drawn in a 160 × 280 box. The glass is two bulbs joined at a
 * neck in the middle. Each bulb is described by its half-width `r(d)` at a
 * distance `d` from the neck, and both bulbs share the same profile, so the
 * glass looks the same either way up.
 */
const VIEW_WIDTH = 160;
const VIEW_HEIGHT = 280;
const CENTRE_X = VIEW_WIDTH / 2;
const NECK_Y = VIEW_HEIGHT / 2;
/** Distance from the neck to the end of each bulb. */
const BULB = 120;
const NECK_RADIUS = 2.2;
const BULB_RADIUS = 50;
/** Rise over run of a sand slope, about the angle of repose of dry sand. */
const SLOPE = 0.62;
/** How deep the funnel in the top bulb gets before it reaches the neck. */
const DIP = 12;
/** How much of one bulb the sand fills. */
const FILL = 0.6;
/** Sand falls slower than real gravity so you can watch it go. */
const GRAVITY = 2200;
/** How long sand takes to slump onto its new floor after a turn, in ms. */
const SETTLE_MS = 420;

/** Columns the sand surfaces are sampled at, from one wall to the other. */
const COLUMNS = Array.from(
  { length: BULB_RADIUS * 2 + 1 },
  (_, index) => index - BULB_RADIUS,
);

/** Half-width of the glass at a distance from the neck. */
function bulbRadius(distance: number) {
  const u = Math.min(Math.max(distance / BULB, 0), 1);
  const swell = Math.sin((Math.PI / 2) * Math.min(u / 0.72, 1)) ** 1.35;
  // Round the shoulder in towards the collar at the end of the bulb.
  const shoulder =
    u > 0.72 ? Math.sqrt(1 - 0.72 * ((u - 0.72) / 0.28) ** 2) : 1;

  return (NECK_RADIUS + (BULB_RADIUS - NECK_RADIUS) * swell) * shoulder;
}

const SLICES = 120;
const SLICE = BULB / SLICES;
const RADII = Array.from({ length: SLICES }, (_, index) =>
  bulbRadius((index + 0.5) * SLICE),
);
const BULB_VOLUME = RADII.reduce((sum, radius) => sum + radius * radius, 0);
const SAND_VOLUME = BULB_VOLUME * FILL;

/** Turns the glass profile into a closed outline in the 160 × 280 box. */
function glassOutline() {
  const steps = 60;
  const left: string[] = [];
  const right: string[] = [];

  for (let step = 0; step <= steps * 2; step += 1) {
    const distance = Math.abs(step - steps) * (BULB / steps);
    const y = NECK_Y - BULB + step * (BULB / steps);
    const radius = bulbRadius(distance);
    left.push(`${(CENTRE_X - radius).toFixed(2)} ${y.toFixed(2)}`);
    right.push(`${(CENTRE_X + radius).toFixed(2)} ${y.toFixed(2)}`);
  }

  return `M${left.join("L")}L${right.reverse().join("L")}Z`;
}

const GLASS_PATH = glassOutline();

/** A glint that follows the curve of one bulb, a little in from its wall. */
function glintPath(side: -1 | 1, across: number, from: number, to: number) {
  const points: string[] = [];

  for (let step = 0; step <= 16; step += 1) {
    const distance = BULB * (from + ((to - from) * step) / 16);
    const x = CENTRE_X - bulbRadius(distance) * across;
    points.push(`${x.toFixed(2)} ${(NECK_Y + side * distance).toFixed(2)}`);
  }

  return `M${points.join("L")}`;
}

/**
 * Sand in a bulb is the band between two heights, `low` and `high`, measured
 * from the neck, sampled at each column. Clipped to the glass, that band is
 * the sand you see.
 */
type Band = { high: Float32Array; low: Float32Array };

function createBand(): Band {
  return {
    high: new Float32Array(COLUMNS.length),
    low: new Float32Array(COLUMNS.length),
  };
}

/** Sand volume of a top bulb whose surface is at `level`, dimpled by `dip`. */
function funnelVolume(level: number, dip: number) {
  const vertex = Math.max(0, level - dip);
  let volume = 0;

  for (let slice = 0; slice < SLICES; slice += 1) {
    const distance = (slice + 0.5) * SLICE;

    if (distance > level) {
      break;
    }

    const radius = RADII[slice];
    const hole = Math.max(0, (distance - vertex) / SLOPE);

    if (hole < radius) {
      volume += radius * radius - hole * hole;
    }
  }

  return volume;
}

/** Sand volume of a bottom bulb whose heap peaks `peak` above its floor. */
function heapVolume(peak: number) {
  let volume = 0;

  for (let slice = 0; slice < SLICES; slice += 1) {
    const height = BULB - (slice + 0.5) * SLICE;
    const width = Math.min(RADII[slice], Math.max(0, (peak - height) / SLOPE));
    volume += width * width;
  }

  return volume;
}

function solve(volume: (guess: number) => number, target: number, top: number) {
  let low = 0;
  let high = top;

  for (let step = 0; step < 22; step += 1) {
    const middle = (low + high) / 2;

    if (volume(middle) < target) {
      low = middle;
    } else {
      high = middle;
    }
  }

  return (low + high) / 2;
}

/** A minimum with a rounded corner, so sand surfaces never crease. */
function softMin(a: number, b: number, radius: number) {
  const h = Math.max(radius - Math.abs(a - b), 0) / radius;
  return Math.min(a, b) - (h * h * radius) / 4;
}

/**
 * The upper bulb drains from the middle, so its surface sinks into a funnel
 * that deepens as it empties.
 */
function shapeFunnel(band: Band, fraction: number) {
  if (fraction <= 0) {
    band.low.fill(0);
    band.high.fill(0);
    return;
  }

  const dip = DIP * Math.min(1, (1 - fraction) / 0.08);
  const level = solve(
    (guess) => funnelVolume(guess, dip),
    fraction * SAND_VOLUME,
    BULB,
  );
  const vertex = Math.max(0, level - dip);

  for (let column = 0; column < COLUMNS.length; column += 1) {
    band.low[column] = 0;
    band.high[column] = softMin(
      level,
      vertex + SLOPE * Math.abs(COLUMNS[column]),
      2.5,
    );
  }
}

/** The lower bulb catches the stream in a cone that spreads to the walls. */
function shapeHeap(band: Band, fraction: number) {
  const peak =
    fraction <= 0
      ? 0
      : solve(heapVolume, fraction * SAND_VOLUME, BULB + BULB_RADIUS);

  for (let column = 0; column < COLUMNS.length; column += 1) {
    const height = Math.max(0, peak - SLOPE * Math.abs(COLUMNS[column]));
    band.low[column] = Math.max(0, BULB - height);
    band.high[column] = BULB + 6;
  }

  return Math.max(0, BULB - peak);
}

/** Turns a band into a path, with `side` -1 for the bulb drawn above. */
function bandPath(band: Band, side: -1 | 1) {
  let path = "";

  for (let column = 0; column < COLUMNS.length; column += 1) {
    const x = CENTRE_X + COLUMNS[column];
    const y = NECK_Y + side * band.high[column];
    path += `${column === 0 ? "M" : "L"}${x} ${y.toFixed(2)}`;
  }

  for (let column = COLUMNS.length - 1; column >= 0; column -= 1) {
    const x = CENTRE_X + COLUMNS[column];
    path += `L${x} ${(NECK_Y + side * band.low[column]).toFixed(2)}`;
  }

  return `${path}Z`;
}

/** Just the free surface of a band, for its sunlit edge. */
function surfacePath(band: Band, side: -1 | 1, edge: "high" | "low") {
  const values = band[edge];
  let path = "";

  for (let column = 0; column < COLUMNS.length; column += 1) {
    const x = CENTRE_X + COLUMNS[column];
    path += `${column === 0 ? "M" : "L"}${x} ${(NECK_Y + side * values[column]).toFixed(2)}`;
  }

  return path;
}

/* -------------------------------------------------------------------------- */
/* Sand colours                                                                */
/* -------------------------------------------------------------------------- */

export const HOURGLASS_SANDS = {
  gold: { dark: "#9c6b2c", light: "#f3d39a", base: "#d6a660" },
  rose: { dark: "#a95a55", light: "#ffd2c8", base: "#e2958a" },
  lilac: { dark: "#5f5299", light: "#d9d1ff", base: "#9d8fe0" },
} as const;

export type HourglassSand = keyof typeof HOURGLASS_SANDS;

/** A tile of specks that gives the sand its grain. */
function createGrainTile() {
  const tile = document.createElement("canvas");
  tile.width = 48;
  tile.height = 48;
  const context = tile.getContext("2d");

  if (!context) {
    return tile;
  }

  for (let index = 0; index < 420; index += 1) {
    const bright = Math.random() > 0.5;
    context.fillStyle = bright
      ? `rgba(255,255,255,${0.18 + Math.random() * 0.3})`
      : `rgba(60,30,10,${0.12 + Math.random() * 0.22})`;
    context.fillRect(Math.random() * 48, Math.random() * 48, 1, 1);
  }

  return tile;
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

/** A wooden base meeting the table: a dull knock with a little body. */
function playThunk(strength: number) {
  const context = getAudioContext();

  if (!context) {
    return;
  }

  const now = context.currentTime;
  const body = context.createOscillator();
  const bodyGain = context.createGain();
  body.type = "sine";
  body.frequency.setValueAtTime(190, now);
  body.frequency.exponentialRampToValueAtTime(90, now + 0.09);
  bodyGain.gain.setValueAtTime(0.5 * strength, now);
  bodyGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
  body.connect(bodyGain).connect(context.destination);
  body.start(now);
  body.stop(now + 0.14);

  const knock = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const knockGain = context.createGain();
  knock.buffer = getNoise(context);
  filter.type = "bandpass";
  filter.frequency.value = 700;
  filter.Q.value = 1.2;
  knockGain.gain.setValueAtTime(0.7 * strength, now);
  knockGain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
  knock.connect(filter).connect(knockGain).connect(context.destination);
  knock.start(now, Math.random());
  knock.stop(now + 0.06);
}

type Hiss = { gain: GainNode; source: AudioBufferSourceNode };

/** The soft, steady whisper of sand pouring through the neck. */
function startHiss(): Hiss | null {
  const context = getAudioContext();

  if (!context) {
    return null;
  }

  const source = context.createBufferSource();
  const high = context.createBiquadFilter();
  const low = context.createBiquadFilter();
  const gain = context.createGain();
  source.buffer = getNoise(context);
  source.loop = true;
  high.type = "highpass";
  high.frequency.value = 3800;
  low.type = "lowpass";
  low.frequency.value = 9000;
  gain.gain.value = 0;
  source.connect(high).connect(low).connect(gain).connect(context.destination);
  source.start();

  return { gain, source };
}

function setHiss(hiss: Hiss | null, level: number) {
  if (!hiss || !sharedAudioContext) {
    return;
  }

  hiss.gain.gain.setTargetAtTime(level, sharedAudioContext.currentTime, 0.08);
}

function buzz(duration: number) {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    navigator.vibrate?.(duration);
  }
}

/* -------------------------------------------------------------------------- */
/* Frame                                                                       */
/* -------------------------------------------------------------------------- */

/** One turned spindle, with beads at the ends and a collar in the middle. */
function Spindle({ fill, x }: { fill: string; x: number }) {
  return (
    <g fill={fill}>
      <rect height={248} rx={2.4} width={5.4} x={x - 2.7} y={16} />
      <ellipse cx={x} cy={24} rx={4.8} ry={3.2} />
      <ellipse cx={x} cy={256} rx={4.8} ry={3.2} />
      <ellipse cx={x} cy={NECK_Y} rx={4.2} ry={5.2} />
      <ellipse cx={x} cy={NECK_Y - 10} rx={3.4} ry={1.8} />
      <ellipse cx={x} cy={NECK_Y + 10} rx={3.4} ry={1.8} />
    </g>
  );
}

const COLLAR_WIDTH = bulbRadius(BULB) * 2 + 8;

/** A cap of turned wood, drawn so it reads the same either way up. */
function Cap({ fill, y }: { fill: string; y: number }) {
  const collarY = y === 0 ? 14 : y - 4;

  return (
    <g>
      <rect
        fill={fill}
        height={6}
        rx={1.5}
        width={COLLAR_WIDTH}
        x={CENTRE_X - COLLAR_WIDTH / 2}
        y={collarY}
      />
      <rect fill={fill} height={16} rx={5} width={148} x={6} y={y} />
      <rect fill="rgba(0,0,0,0.18)" height={1} width={140} x={10} y={y + 7.5} />
    </g>
  );
}

type FrameIds = { glass: string; spindle: string; wood: string };

function FrameDefs({ ids }: { ids: FrameIds }) {
  return (
    <defs>
      <linearGradient id={ids.wood} x1="0" x2="0" y1="0" y2="1">
        <stop offset="0" stopColor="#6b4022" />
        <stop offset="0.3" stopColor="#a8703f" />
        <stop offset="0.5" stopColor="#bd8550" />
        <stop offset="0.7" stopColor="#a8703f" />
        <stop offset="1" stopColor="#6b4022" />
      </linearGradient>
      <linearGradient id={ids.spindle} x1="0" x2="1" y1="0" y2="0">
        <stop offset="0" stopColor="#5e381d" />
        <stop offset="0.5" stopColor="#c08a55" />
        <stop offset="1" stopColor="#5e381d" />
      </linearGradient>
      <clipPath id={ids.glass}>
        <path d={GLASS_PATH} />
      </clipPath>
    </defs>
  );
}

/**
 * The fixed glints that stay where the light is while the glass turns under
 * them. They fade out mid-turn, when the glass catches the light side on.
 */
function Glints() {
  return (
    <g fill="none" strokeLinecap="round">
      {([-1, 1] as const).map((side) => (
        <g key={side}>
          <path
            d={glintPath(side, 0.66, 0.24, 0.84)}
            stroke="white"
            strokeOpacity={0.6}
            strokeWidth={3}
          />
          <path
            d={glintPath(side, 0.5, 0.36, 0.5)}
            stroke="white"
            strokeOpacity={0.5}
            strokeWidth={1.4}
          />
          <path
            d={glintPath(side, -0.78, 0.5, 0.82)}
            stroke="white"
            strokeOpacity={0.28}
            strokeWidth={1.6}
          />
        </g>
      ))}
    </g>
  );
}

/* -------------------------------------------------------------------------- */
/* Hourglass                                                                   */
/* -------------------------------------------------------------------------- */

type Grain = { life: number; vx: number; vy: number; x: number; y: number };

export type HourglassProps = {
  /** How long the sand takes to run through, in seconds. */
  duration?: number;
  /** Colour of the sand. */
  sand?: HourglassSand;
  /** Height of the whole hourglass in pixels. */
  height?: number;
  /** How much of the sand starts in the upper bulb, from 0 to 1. */
  defaultFraction?: number;
  /** Play a knock when it lands and a soft hiss while it runs. */
  sound?: boolean;
  /** Called when the last grain leaves the upper bulb. */
  onFinish?: () => void;
  className?: string;
};

function formatTime(seconds: number) {
  const whole = Math.max(0, Math.ceil(seconds - 1e-6));
  return { minutes: Math.floor(whole / 60), seconds: whole % 60, whole };
}

function spokenTime(seconds: number) {
  const { minutes, seconds: rest } = formatTime(seconds);
  const parts = [];

  if (minutes) {
    parts.push(`${minutes} minute${minutes === 1 ? "" : "s"}`);
  }

  if (rest || !minutes) {
    parts.push(`${rest} second${rest === 1 ? "" : "s"}`);
  }

  return parts.join(" ");
}

export function Hourglass({
  className,
  defaultFraction = 0,
  duration = 30,
  height = 280,
  onFinish,
  sand = "gold",
  sound = true,
}: HourglassProps) {
  const id = useId().replace(/[^\w-]/g, "");
  const ids: FrameIds = {
    glass: `${id}-glass`,
    spindle: `${id}-spindle`,
    wood: `${id}-wood`,
  };
  const width = (height * VIEW_WIDTH) / VIEW_HEIGHT;
  const reduceMotion = useReducedMotion() ?? false;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const angle = useMotionValue(0);
  const lift = useTransform(angle, (value) =>
    reduceMotion ? 0 : -18 * Math.abs(Math.sin((value * Math.PI) / 180)),
  );
  const shadowScale = useTransform(lift, (value) => 1 + value / 60);
  const shadowOpacity = useTransform(lift, (value) => 1 + value / 30);
  const glintOpacity = useTransform(angle, (value) =>
    Math.max(0, 1 - 2.2 * Math.abs(Math.sin((value * Math.PI) / 180))),
  );

  /** Sand in bulb A (drawn above at rest) and bulb B, as parts of the whole. */
  const fractions = useRef({
    a: Math.min(Math.max(defaultFraction, 0), 1),
    b: 1 - Math.min(Math.max(defaultFraction, 0), 1),
  });
  const restAngle = useRef(0);
  const dragging = useRef(false);
  /** Set when a drag ends, so the click that follows doesn't flip again. */
  const justDragged = useRef(false);
  const flipAnimation = useRef<AnimationPlaybackControls | null>(null);
  const kickRef = useRef<() => void>(() => {});
  const settleRef = useRef({
    from: { a: createBand(), b: createBand() },
    start: -1,
  });
  const shown = useRef({ a: createBand(), b: createBand() });
  const settings = useRef({ duration, onFinish, reduceMotion, sand, sound });
  settings.current = { duration, onFinish, reduceMotion, sand, sound };

  const [remaining, setRemaining] = useState(
    () => formatTime(fractions.current.a * duration).whole,
  );
  const [announcement, setAnnouncement] = useState("");

  /** Which bulb is on top, from the nearest resting angle. */
  const upperBulb = useCallback(
    (value = angle.get()) =>
      Math.round(value / 180) % 2 === 0 ? ("a" as const) : ("b" as const),
    [angle],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");

    if (!canvas || !context) {
      return;
    }

    const grainTile = createGrainTile();
    const grainPattern = context.createPattern(grainTile, "repeat");
    const target = { a: createBand(), b: createBand() };
    const grains: Grain[] = [];
    let frame = 0;
    let last = performance.now();
    let flowStartedAt = -1;
    let flowStoppedAt = -1;
    let peakDepth = BULB;
    let lastWhole = -1;
    let hiss: Hiss | null = null;
    let spawnDebt = 0;

    const resize = () => {
      const ratio = window.devicePixelRatio || 1;
      canvas.width = Math.round(canvas.clientWidth * ratio);
      canvas.height = Math.round(canvas.clientHeight * ratio);
    };

    resize();
    // Resizing clears the canvas, so draw again straight after.
    const observer = new ResizeObserver(() => {
      resize();
      kickRef.current();
    });
    observer.observe(canvas);

    const reshape = (bulb: "a" | "b", upper: "a" | "b") => {
      if (bulb === upper) {
        shapeFunnel(target[bulb], fractions.current[bulb]);
        return BULB;
      }

      return shapeHeap(target[bulb], fractions.current[bulb]);
    };

    const draw = (now: number, upper: "a" | "b") => {
      const { sand: sandName, reduceMotion: still } = settings.current;
      const colours = HOURGLASS_SANDS[sandName];
      const scale = canvas.width / VIEW_WIDTH;

      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.setTransform(scale, 0, 0, scale, 0, 0);
      context.save();
      context.clip(new Path2D(GLASS_PATH));

      const shade = context.createLinearGradient(
        CENTRE_X - BULB_RADIUS,
        0,
        CENTRE_X + BULB_RADIUS,
        0,
      );
      shade.addColorStop(0, colours.dark);
      shade.addColorStop(0.36, colours.base);
      shade.addColorStop(0.5, colours.light);
      shade.addColorStop(0.64, colours.base);
      shade.addColorStop(1, colours.dark);

      for (const bulb of ["a", "b"] as const) {
        const side = bulb === "a" ? -1 : 1;
        const band = shown.current[bulb];
        const path = new Path2D(bandPath(band, side));
        context.fillStyle = shade;
        context.fill(path);

        if (grainPattern) {
          context.fillStyle = grainPattern;
          context.fill(path);
        }

        if (fractions.current[bulb] <= 0) {
          continue;
        }

        context.strokeStyle = colours.light;
        context.globalAlpha = 0.7;
        context.lineWidth = 0.9;
        context.stroke(
          new Path2D(surfacePath(band, side, bulb === upper ? "high" : "low")),
        );
        context.globalAlpha = 1;
      }

      // The stream runs from the neck to the top of the heap below.
      const lower = upper === "a" ? "b" : "a";
      const side = lower === "a" ? -1 : 1;
      const head =
        flowStartedAt < 0
          ? 0
          : Math.min(
              peakDepth,
              0.5 * GRAVITY * ((now - flowStartedAt) / 1000) ** 2,
            );
      const tail =
        flowStoppedAt < 0
          ? 0
          : 0.5 * GRAVITY * ((now - flowStoppedAt) / 1000) ** 2;

      if (flowStartedAt >= 0 && tail < head) {
        context.strokeStyle = colours.base;
        context.lineWidth = 1.3;
        context.globalAlpha = 0.9;
        context.beginPath();
        context.moveTo(CENTRE_X, NECK_Y + side * tail);
        context.lineTo(CENTRE_X, NECK_Y + side * head);
        context.stroke();
        context.globalAlpha = 1;

        // Grains tumbling down inside the stream.
        context.fillStyle = colours.light;
        const travel = still ? 0 : (now / 1000) * 140;

        for (let offset = 0; offset < head; offset += 4.5) {
          const distance = (offset + travel) % Math.max(head, 1);

          if (distance < tail) {
            continue;
          }

          const jitter = Math.sin(offset * 12.9898 + travel * 0.05) * 0.5;
          context.fillRect(
            CENTRE_X - 0.5 + jitter,
            NECK_Y + side * distance - 0.5,
            1,
            1,
          );
        }
      }

      context.fillStyle = colours.light;

      for (const grain of grains) {
        context.globalAlpha = Math.min(1, grain.life * 4);
        context.fillRect(grain.x - 0.5, grain.y - 0.5, 1, 1);
      }

      context.globalAlpha = 1;
      context.restore();
    };

    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;

      const {
        duration: seconds,
        onFinish: finish,
        reduceMotion: still,
        sound: audible,
      } = settings.current;
      const value = angle.get();
      const upper = upperBulb(value);
      const lower = upper === "a" ? "b" : "a";
      const atRest =
        !dragging.current && Math.abs(value - restAngle.current) < 15;
      const settle = settleRef.current;
      const settleProgress =
        settle.start < 0 ? 1 : Math.min(1, (now - settle.start) / SETTLE_MS);
      const flowing =
        atRest && settleProgress > 0.6 && fractions.current[upper] > 0;

      if (flowing) {
        const moved = Math.min(dt / seconds, fractions.current[upper]);
        fractions.current[upper] -= moved;
        fractions.current[lower] += moved;

        if (flowStartedAt < 0 || flowStoppedAt >= 0) {
          flowStartedAt = now;
          flowStoppedAt = -1;
        }

        if (fractions.current[upper] <= 1e-7) {
          fractions.current[upper] = 0;
          fractions.current[lower] = 1;
          flowStoppedAt = now;
          setAnnouncement("Time's up.");
          finish?.();
        }
      } else if (flowStartedAt >= 0 && flowStoppedAt < 0) {
        flowStoppedAt = now;
      }

      const streamGone =
        flowStoppedAt >= 0 &&
        0.5 * GRAVITY * ((now - flowStoppedAt) / 1000) ** 2 > peakDepth;

      if (streamGone) {
        flowStartedAt = -1;
        flowStoppedAt = -1;
      }

      if (audible && flowing) {
        hiss ??= startHiss();
        setHiss(hiss, 0.035);
      } else {
        setHiss(hiss, 0);
      }

      // Sand only takes its new shape when the glass is standing still.
      if (atRest) {
        reshape(upper, upper);
        peakDepth = reshape(lower, upper);
        const eased = settleProgress ** 2;

        for (const bulb of ["a", "b"] as const) {
          const from = settle.from[bulb];
          const to = target[bulb];
          const band = shown.current[bulb];

          for (let column = 0; column < COLUMNS.length; column += 1) {
            band.low[column] =
              from.low[column] + (to.low[column] - from.low[column]) * eased;
            band.high[column] =
              from.high[column] + (to.high[column] - from.high[column]) * eased;
          }
        }
      }

      // Grains that bounce off the top of the heap and roll away.
      const side = lower === "a" ? -1 : 1;
      const head =
        flowStartedAt < 0
          ? 0
          : 0.5 * GRAVITY * ((now - flowStartedAt) / 1000) ** 2;

      if (!still && flowing && head >= peakDepth) {
        spawnDebt += dt * 34;

        while (spawnDebt > 1) {
          spawnDebt -= 1;
          grains.push({
            life: 0.25 + Math.random() * 0.3,
            vx: (Math.random() - 0.5) * 70,
            vy: -side * (14 + Math.random() * 30),
            x: CENTRE_X,
            y: NECK_Y + side * peakDepth,
          });
        }
      }

      for (let index = grains.length - 1; index >= 0; index -= 1) {
        const grain = grains[index];
        grain.life -= dt;
        grain.vy += side * 420 * dt;
        grain.x += grain.vx * dt;
        grain.y += grain.vy * dt;
        const column = Math.round(grain.x - CENTRE_X) + BULB_RADIUS;
        const floor =
          NECK_Y +
          side * (shown.current[lower].low[column] ?? peakDepth) -
          side * 0.6;
        const landed = side * (grain.y - floor) > 0 && side * grain.vy > 0;

        if (landed) {
          grain.y = floor;
          grain.vy = 0;
          grain.vx *= 0.6;
        }

        if (grain.life <= 0) {
          grains.splice(index, 1);
        }
      }

      draw(now, upper);

      const whole = formatTime(fractions.current[upper] * seconds).whole;

      if (whole !== lastWhole) {
        lastWhole = whole;
        setRemaining(whole);
      }

      const busy =
        flowing ||
        !atRest ||
        settleProgress < 1 ||
        flowStartedAt >= 0 ||
        grains.length > 0;

      frame = busy ? requestAnimationFrame(tick) : 0;

      if (!busy) {
        setHiss(hiss, 0);
      }
    };

    kickRef.current = () => {
      if (!frame) {
        last = performance.now();
        frame = requestAnimationFrame(tick);
      }
    };

    // Draw the first frame straight into place, without a slump.
    const upper = upperBulb();
    reshape(upper, upper);
    peakDepth = reshape(upper === "a" ? "b" : "a", upper);

    for (const bulb of ["a", "b"] as const) {
      shown.current[bulb].low.set(target[bulb].low);
      shown.current[bulb].high.set(target[bulb].high);
      settleRef.current.from[bulb].low.set(target[bulb].low);
      settleRef.current.from[bulb].high.set(target[bulb].high);
    }

    kickRef.current();
    const unsubscribe = angle.on("change", () => kickRef.current());

    return () => {
      cancelAnimationFrame(frame);
      frame = 0;
      unsubscribe();
      observer.disconnect();
      kickRef.current = () => {};

      if (hiss) {
        const stopping = hiss;
        setHiss(stopping, 0);
        window.setTimeout(() => stopping.source.stop(), 300);
      }
    };
  }, [angle, upperBulb]);

  // Changing the sand or the duration should redraw a glass at rest.
  // biome-ignore lint/correctness/useExhaustiveDependencies: redraw on change
  useEffect(() => {
    kickRef.current();
  }, [sand, duration]);

  /** The glass has come down onto its other end. */
  const land = useCallback(
    (resting: number, strength: number) => {
      if (resting === restAngle.current) {
        return;
      }

      restAngle.current = resting;
      const settle = settleRef.current;

      for (const bulb of ["a", "b"] as const) {
        settle.from[bulb].low.set(shown.current[bulb].low);
        settle.from[bulb].high.set(shown.current[bulb].high);
      }

      settle.start = settings.current.reduceMotion ? -1 : performance.now();

      if (settings.current.sound) {
        playThunk(strength);
      }

      buzz(14);
      const upper = upperBulb(resting);
      const left = fractions.current[upper] * settings.current.duration;
      setAnnouncement(
        left > 0 ? `Turned over. ${spokenTime(left)} to go.` : "Turned over.",
      );
      kickRef.current();
    },
    [upperBulb],
  );

  /** Swing the glass to a resting angle, and knock when it touches down. */
  const swingTo = useCallback(
    (resting: number) => {
      flipAnimation.current?.stop();
      const from = angle.get();
      const travel = Math.abs(resting - from);

      if (settings.current.sound) {
        getAudioContext();
      }

      if (settings.current.reduceMotion) {
        angle.set(resting);
        land(resting, 0.6);
        return;
      }

      let touched = false;
      const direction = Math.sign(resting - from);
      flipAnimation.current = animate(angle, resting, {
        damping: 18,
        mass: 1,
        onUpdate: (value) => {
          if (!touched && direction * (value - resting) >= 0) {
            touched = true;
            land(resting, Math.min(1, 0.35 + travel / 200));
          }
        },
        onComplete: () => {
          if (!touched) {
            land(resting, 0.4);
          }
        },
        stiffness: 150,
        type: "spring",
      });
    },
    [angle, land],
  );

  const flip = useCallback(
    (direction: 1 | -1 = 1) => {
      swingTo(restAngle.current + 180 * direction);
    },
    [swingTo],
  );

  const press = useRef<{
    angle: number;
    moved: boolean;
    time: number;
    velocity: number;
    x: number;
  } | null>(null);

  const onPointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) {
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    justDragged.current = false;
    flipAnimation.current?.stop();
    press.current = {
      angle: angle.get(),
      moved: false,
      time: event.timeStamp,
      velocity: 0,
      x: event.clientX,
    };
  };

  const onPointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    const current = press.current;

    if (!current) {
      return;
    }

    const dx = event.clientX - current.x;

    if (!current.moved && Math.abs(dx) < 4) {
      return;
    }

    current.moved = true;
    dragging.current = true;
    const next = Math.min(
      restAngle.current + 200,
      Math.max(restAngle.current - 200, current.angle + dx * 1.1),
    );
    const elapsed = Math.max(event.timeStamp - current.time, 1);
    current.velocity = ((next - angle.get()) / elapsed) * 1000;
    current.time = event.timeStamp;
    angle.set(next);
  };

  const onPointerUp = (event: PointerEvent<HTMLButtonElement>) => {
    const current = press.current;
    press.current = null;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    if (!current?.moved) {
      return;
    }

    justDragged.current = true;
    dragging.current = false;
    const turned = angle.get() - restAngle.current;
    // A flick turns it over even if it hasn't reached its side yet.
    const projected = turned + current.velocity * 0.18;
    const resting =
      Math.abs(projected) > 90
        ? restAngle.current + 180 * Math.sign(projected)
        : restAngle.current;
    swingTo(resting);
  };

  const onClick = () => {
    // Drags are handled on release; a click with no drag turns it over.
    if (justDragged.current) {
      justDragged.current = false;
      return;
    }

    flip(1);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      flip(-1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      flip(1);
    }
  };

  const time = formatTime(remaining);
  const label =
    remaining > 0
      ? `Hourglass, ${spokenTime(remaining)} left. Turn it over.`
      : "Hourglass, run out. Turn it over to start again.";

  return (
    <div className={cn("flex flex-col items-center gap-6", className)}>
      <div className="relative" style={{ height, width }}>
        <motion.div
          aria-hidden="true"
          className="-translate-x-1/2 absolute bottom-[-10px] left-1/2 h-4 w-[92%] rounded-[50%] bg-black/25 blur-[6px] dark:bg-black/60"
          style={{ opacity: shadowOpacity, scale: shadowScale }}
        />
        <motion.button
          aria-label={label}
          className="relative block size-full cursor-grab touch-none select-none rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-grayscale-7 focus-visible:ring-offset-4 focus-visible:ring-offset-grayscale-1 active:cursor-grabbing"
          onClick={onClick}
          onKeyDown={onKeyDown}
          onLostPointerCapture={() => {
            if (dragging.current) {
              dragging.current = false;
              swingTo(restAngle.current);
            }
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          style={{ y: lift }}
          type="button"
        >
          <motion.div className="absolute inset-0" style={{ rotate: angle }}>
            <svg
              aria-hidden="true"
              className="absolute inset-0 size-full overflow-visible"
              viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
            >
              <FrameDefs ids={ids} />
              <path
                className="fill-black/[0.035] dark:fill-white/[0.06]"
                d={GLASS_PATH}
              />
            </svg>
            <canvas className="absolute inset-0 size-full" ref={canvasRef} />
            <svg
              aria-hidden="true"
              className="absolute inset-0 size-full overflow-visible"
              viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
            >
              <path
                className="fill-none stroke-black/30 dark:stroke-white/35"
                d={GLASS_PATH}
                strokeWidth={1.1}
              />
              <path
                className="fill-none stroke-white/50 dark:stroke-white/10"
                d={GLASS_PATH}
                strokeWidth={0.5}
                transform={`translate(${CENTRE_X} ${NECK_Y}) scale(0.975) translate(${-CENTRE_X} ${-NECK_Y})`}
              />
              <Cap fill={`url(#${ids.wood})`} y={0} />
              <Cap fill={`url(#${ids.wood})`} y={VIEW_HEIGHT - 16} />
              <Spindle fill={`url(#${ids.spindle})`} x={13} />
              <Spindle fill={`url(#${ids.spindle})`} x={VIEW_WIDTH - 13} />
            </svg>
          </motion.div>
          <motion.svg
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 size-full overflow-visible"
            style={{ opacity: glintOpacity }}
            viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
          >
            <Glints />
          </motion.svg>
        </motion.button>
      </div>

      <output
        aria-hidden="true"
        className={cn(
          "flex items-baseline font-mono text-grayscale-12 text-sm tabular-nums transition-opacity",
          remaining === 0 && "text-grayscale-9",
        )}
      >
        <NumberFlow locales="en-US" value={time.minutes} />
        <span>:</span>
        <NumberFlow
          format={{ minimumIntegerDigits: 2 }}
          locales="en-US"
          value={time.seconds}
        />
      </output>
      <span aria-live="polite" className="sr-only">
        {announcement}
      </span>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Preview                                                                     */
/* -------------------------------------------------------------------------- */

function staticBands(upper: number) {
  const top = createBand();
  const bottom = createBand();
  shapeFunnel(top, upper);
  shapeHeap(bottom, 1 - upper);
  return { bottom, top };
}

const PREVIEW_BEFORE = staticBands(0.7);
const PREVIEW_AFTER = staticBands(0.3);

/**
 * A still hourglass for the Kitchen card. On hover it turns over, and the
 * sand drops into place on the other side.
 */
export function HourglassPreview({
  className,
  height = 96,
}: {
  className?: string;
  height?: number;
}) {
  const id = useId().replace(/[^\w-]/g, "");
  const ids: FrameIds = {
    glass: `${id}-glass`,
    spindle: `${id}-spindle`,
    wood: `${id}-wood`,
  };
  const colours = HOURGLASS_SANDS.gold;

  const sandPaths = (bands: { bottom: Band; top: Band }) => (
    <g clipPath={`url(#${ids.glass})`} fill={colours.base}>
      <path d={bandPath(bands.top, -1)} />
      <path d={bandPath(bands.bottom, 1)} />
      <rect
        fill={colours.base}
        height={BULB}
        width={1.4}
        x={CENTRE_X - 0.7}
        y={NECK_Y}
      />
    </g>
  );

  return (
    <svg
      aria-hidden="true"
      className={cn("overflow-visible", className)}
      height={height}
      viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
      width={(height * VIEW_WIDTH) / VIEW_HEIGHT}
    >
      <FrameDefs ids={ids} />
      <g className="origin-center transition-transform duration-700 ease-[cubic-bezier(0.5,1.6,0.4,1)] [transform-box:view-box] group-hover:rotate-180 motion-reduce:transition-none">
        <path
          className="fill-black/[0.035] dark:fill-white/[0.06]"
          d={GLASS_PATH}
        />
        <g className="transition-opacity delay-300 duration-200 group-hover:opacity-0">
          {sandPaths(PREVIEW_BEFORE)}
        </g>
        {/* Drawn upside down, so it lands the right way up once turned. */}
        <g
          className="opacity-0 transition-opacity delay-300 duration-200 group-hover:opacity-100"
          transform={`rotate(180 ${CENTRE_X} ${NECK_Y})`}
        >
          {sandPaths(PREVIEW_AFTER)}
        </g>
        <path
          className="fill-none stroke-black/30 dark:stroke-white/35"
          d={GLASS_PATH}
          strokeWidth={1.6}
        />
        <Cap fill={`url(#${ids.wood})`} y={0} />
        <Cap fill={`url(#${ids.wood})`} y={VIEW_HEIGHT - 16} />
        <Spindle fill={`url(#${ids.spindle})`} x={13} />
        <Spindle fill={`url(#${ids.spindle})`} x={VIEW_WIDTH - 13} />
      </g>
      <Glints />
    </svg>
  );
}
