"use client";

import {
  animate,
  type MotionValue,
  motion,
  useMotionValue,
  useReducedMotion,
} from "motion/react";
import {
  type CSSProperties,
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
/* Geometry                                                                    */
/* -------------------------------------------------------------------------- */

/*
 * The punch is drawn in a simple oblique projection: x runs across the desk,
 * depth runs away from you and is foreshortened, and height lifts straight up
 * the screen. Every flat surface stays a rectangle, which keeps the drawing
 * crisp, while the lever can still flatten out as it comes down.
 */
const VIEW_WIDTH = 520;
const CENTRE_X = VIEW_WIDTH / 2;
const GROUND_Y = 344;
/** The part of the drawing that is shown: the punch, its shadow and a margin. */
const VIEW_BOX = { height: 316, width: 440, x: 40, y: 52 } as const;
const DEPTH_SCALE = 0.55;

/** Screen y for a point `depth` back from the front edge and `height` up. */
function screenY(depth: number, height: number) {
  return GROUND_Y - depth * DEPTH_SCALE - height;
}

const PLATE = { back: 330, halfWidth: 190, height: 46 } as const;
const HEAD = { back: 310, front: 230, halfWidth: 140, height: 92 } as const;
/** The gap under the head that the paper slides into. */
const THROAT_TOP = 52;

const LEVER = {
  halfWidth: 132,
  hingeDepth: 320,
  hingeHeight: 104,
  frontDepth: 150,
  /** Height of the lever's front edge at rest and fully down. */
  restHeight: 140,
  downHeight: 72,
  lipThickness: 13,
} as const;

const LEVER_BACK_Y = screenY(LEVER.hingeDepth, LEVER.hingeHeight);
const LEVER_FRONT_Y = screenY(LEVER.frontDepth, LEVER.restHeight);
/** How far down the screen the lever's front edge travels. */
const LEVER_TRAVEL = LEVER.restHeight - LEVER.downHeight;
const LEVER_FACE_HEIGHT = LEVER_FRONT_Y - LEVER_BACK_Y;

const PAPER = { back: 282, front: 96, halfWidth: 118 } as const;
const SHEET_THICKNESS = 1.2;
/** Two holes, 80mm apart, like an ISO 838 punch. */
const HOLE_X = [-62, 62] as const;
const HOLE_DEPTH = 258;
const HOLE_RADIUS = 7;
/** How far the sheet slides out so you can see its new holes. */
const PULL_OUT = 72;
const PULL_OUT_Y = PULL_OUT * DEPTH_SCALE;

const TRAY = {
  left: -180,
  right: 180,
  top: GROUND_Y - PLATE.height + 4,
  bottom: GROUND_Y - 4,
} as const;
const TRAY_HEIGHT = TRAY.bottom - TRAY.top;
const PILE_COLUMN = 2;
const PILE_COLUMNS = (TRAY.right - TRAY.left) / PILE_COLUMN;
/** Leave a sliver of window above a full pile. */
const PILE_LIMIT = TRAY_HEIGHT - 7;

/* -------------------------------------------------------------------------- */
/* Feel                                                                        */
/* -------------------------------------------------------------------------- */

/** The lever falls freely until the punches meet the paper. */
const FREE_TRAVEL = 0.4;
/** Once they do, the lever only creeps while your hand keeps pushing. */
const CREEP = 0.25;
/** How much further the hand must push before one sheet gives. */
const BREAK_BASE = 0.2;
/** Every extra sheet takes a little more pushing. */
const BREAK_PER_SHEET = 0.07;
/** Hand travel per second when the punch is driven by a tap or a key. */
const AUTO_SPEED = 3.6;
/** A press shorter and smaller than this counts as a tap. */
const TAP_MS = 260;
const TAP_PX = 6;

/* -------------------------------------------------------------------------- */
/* Paper                                                                       */
/* -------------------------------------------------------------------------- */

type PaperColor = { edge: string; face: string; name: string };

const PAPERS: readonly PaperColor[] = [
  { edge: "#d8d2c4", face: "#fbfaf6", name: "white" },
  { edge: "#d4c39b", face: "#f4e8ca", name: "cream" },
  { edge: "#dba99e", face: "#f6d0c7", name: "salmon" },
  { edge: "#a4bdd7", face: "#d0e1f2", name: "blue" },
  { edge: "#a9c69c", face: "#d6e9ce", name: "green" },
  { edge: "#d8c066", face: "#f6e39c", name: "yellow" },
  { edge: "#c3a8d2", face: "#e7d4f1", name: "lilac" },
];

type Sheet = { color: PaperColor; dx: number; dy: number; id: string };

type Stack = { id: number; punched: boolean; sheets: Sheet[] };

type Chad = {
  /** Fresh chads fall in; the ones already in the tray just sit there. */
  delay: number;
  edge: string;
  face: string;
  fall: number;
  fresh: boolean;
  id: number;
  rotate: number;
  rx: number;
  ry: number;
  spin: number;
  x: number;
  y: number;
};

/** A small seeded generator, so the first render matches on the server. */
function createRandom(seed: number) {
  let state = seed >>> 0;

  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeStack(id: number, count: number): Stack {
  const random = createRandom(id * 7919 + count);
  const offset = Math.floor(random() * PAPERS.length);
  const sheets = Array.from({ length: count }, (_, index) => ({
    // The top sheet is always white, ruled notebook paper.
    color:
      index === count - 1
        ? PAPERS[0]
        : PAPERS[1 + ((offset + index) % (PAPERS.length - 1))],
    dx: index === count - 1 ? 0 : (random() - 0.5) * 7,
    dy: index === count - 1 ? 0 : (random() - 0.5) * 3,
    id: `${id}-${index}`,
  }));

  return { id, punched: false, sheets };
}

/** A rough bell curve, for scattering chads around each hole. */
function gaussian(random: () => number) {
  return (random() + random() + random() - 1.5) / 1.5;
}

/**
 * Drops chads into the tray. Each one lands on whatever is already under it,
 * so two heaps grow under the holes and slump wider as they get taller.
 */
function settleChads(
  pile: Float32Array,
  colors: readonly PaperColor[],
  random: () => number,
  nextId: () => number,
  fresh: boolean,
) {
  const chads: Chad[] = [];
  let index = 0;

  for (const color of colors) {
    for (const holeX of HOLE_X) {
      const tilt = random();
      const rx = HOLE_RADIUS * (0.6 + 0.4 * random());
      const ry = 1.3 + tilt * 3.6;
      const columnAt = (x: number) => Math.round((x - TRAY.left) / PILE_COLUMN);
      const roughX = holeX + gaussian(random) * 6;
      const peak =
        pile[Math.max(0, Math.min(PILE_COLUMNS - 1, columnAt(roughX)))];
      let x = Math.max(
        TRAY.left + rx + 2,
        Math.min(
          TRAY.right - rx - 2,
          holeX + gaussian(random) * (6 + peak * 0.6),
        ),
      );
      const floorAt = (centre: number) => {
        const from = Math.max(0, columnAt(centre - rx * 0.7));
        const to = Math.min(PILE_COLUMNS - 1, columnAt(centre + rx * 0.7));
        let highest = 0;

        for (let column = from; column <= to; column += 1) {
          highest = Math.max(highest, pile[column]);
        }

        return highest;
      };

      // Roll off the top of the heap until it finds somewhere to rest.
      const stride = rx * 0.9;

      for (let roll = 0; roll < 30; roll += 1) {
        const here = floorAt(x);
        const left =
          x - stride > TRAY.left + rx + 2 ? floorAt(x - stride) : here;
        const right =
          x + stride < TRAY.right - rx - 2 ? floorAt(x + stride) : here;
        const goLeft = left < right || (left === right && random() < 0.5);
        const lower = goLeft ? left : right;

        if (lower >= here - 0.8) {
          break;
        }

        x += (goLeft ? -1 : 1) * stride * (0.5 + random() * 0.5);
      }

      const from = Math.max(0, columnAt(x - rx * 0.7));
      const to = Math.min(PILE_COLUMNS - 1, columnAt(x + rx * 0.7));
      const floor = floorAt(x);

      if (floor > PILE_LIMIT) {
        index += 1;
        continue;
      }

      const rest = floor + ry * 0.7;

      for (let column = from; column <= to; column += 1) {
        pile[column] = Math.max(pile[column], floor + ry * 0.6);
      }

      const y = TRAY.bottom - rest;

      chads.push({
        delay: 0.04 + index * 0.018 + random() * 0.05,
        edge: color.edge,
        face: color.face,
        fall: -(y - TRAY.top + 14),
        fresh,
        id: nextId(),
        rotate: (random() - 0.5) * 50,
        rx,
        ry,
        spin: (random() - 0.5) * 220,
        x,
        y,
      });
      index += 1;
    }
  }

  return chads;
}

function isPileFull(pile: Float32Array) {
  for (const holeX of HOLE_X) {
    const column = Math.round((holeX - TRAY.left) / PILE_COLUMN);

    if (pile[column] < PILE_LIMIT) {
      return false;
    }
  }

  return true;
}

/** A tray that has seen a little use already, so it reads as a tray. */
function makeStarterPile() {
  const pile = new Float32Array(PILE_COLUMNS);
  const random = createRandom(42);
  let id = 0;
  const colors = Array.from(
    { length: 9 },
    (_, index) => PAPERS[index % 3 === 0 ? 0 : 1 + (index % 6)],
  );
  const chads = settleChads(pile, colors, random, () => id++, false);

  return { chads, nextId: id, pile };
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
    const length = context.sampleRate;
    noiseBuffer = context.createBuffer(1, length, context.sampleRate);
    const data = noiseBuffer.getChannelData(0);

    for (let index = 0; index < length; index += 1) {
      data[index] = Math.random() * 2 - 1;
    }
  }

  return noiseBuffer;
}

/** A burst of filtered noise with a fast attack and an exponential tail. */
function noiseBurst(
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
  envelope.gain.setValueAtTime(0, start);
  envelope.gain.linearRampToValueAtTime(gain, start + 0.002);
  envelope.gain.exponentialRampToValueAtTime(0.0001, start + decay * 5);
  source.connect(filter).connect(envelope).connect(context.destination);
  source.start(start, Math.random() * 0.5);
  source.stop(start + decay * 5 + 0.02);
}

function tone(
  context: AudioContext,
  {
    at = 0,
    decay,
    frequency,
    gain,
    to,
    type = "sine",
  }: {
    at?: number;
    decay: number;
    frequency: number;
    gain: number;
    to?: number;
    type?: OscillatorType;
  },
) {
  const start = context.currentTime + at;
  const oscillator = context.createOscillator();
  const envelope = context.createGain();

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);

  if (to) {
    oscillator.frequency.exponentialRampToValueAtTime(to, start + decay * 3);
  }

  envelope.gain.setValueAtTime(0, start);
  envelope.gain.linearRampToValueAtTime(gain, start + 0.003);
  envelope.gain.exponentialRampToValueAtTime(0.0001, start + decay * 5);
  oscillator.connect(envelope).connect(context.destination);
  oscillator.start(start);
  oscillator.stop(start + decay * 5 + 0.02);
}

const sounds = {
  /** The punches meeting the paper. */
  touch() {
    const context = getAudioContext();

    if (context) {
      noiseBurst(context, { decay: 0.004, frequency: 2600, gain: 0.18, q: 2 });
    }
  },
  /** Paper shearing, then the lever bottoming out on its stop. */
  punch(sheets: number) {
    const context = getAudioContext();

    if (!context) {
      return;
    }

    for (let sheet = 0; sheet < sheets; sheet += 1) {
      noiseBurst(context, {
        at: sheet * 0.006,
        decay: 0.006,
        frequency: 3200 - sheet * 220,
        gain: 0.32,
        q: 0.8,
      });
    }

    noiseBurst(context, {
      at: 0.012,
      decay: 0.02,
      frequency: 700,
      gain: 0.5,
      q: 0.7,
    });
    tone(context, {
      at: 0.012,
      decay: 0.028,
      frequency: 140,
      gain: 0.55,
      to: 70,
    });
  },
  /** The lever springing home and ringing faintly against its stop. */
  spring(strength: number) {
    const context = getAudioContext();

    if (!context) {
      return;
    }

    noiseBurst(context, {
      decay: 0.005,
      frequency: 1800,
      gain: 0.22 * strength,
      q: 1.5,
    });
    tone(context, {
      decay: 0.06,
      frequency: 1870,
      gain: 0.04 * strength,
      type: "triangle",
    });
  },
  /** Chads pattering into the tray. */
  patter(count: number) {
    const context = getAudioContext();

    if (!context) {
      return;
    }

    for (let chad = 0; chad < Math.min(count, 12); chad += 1) {
      noiseBurst(context, {
        at: 0.11 + Math.random() * 0.16,
        decay: 0.0025,
        frequency: 4200 + Math.random() * 2200,
        gain: 0.05 + Math.random() * 0.04,
        q: 3,
      });
    }
  },
  /** Paper dragging across the plate. */
  slide(duration: number) {
    const context = getAudioContext();

    if (!context) {
      return;
    }

    const start = context.currentTime;
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const envelope = context.createGain();

    source.buffer = getNoise(context);
    filter.type = "bandpass";
    filter.Q.value = 0.6;
    filter.frequency.setValueAtTime(1400, start);
    filter.frequency.linearRampToValueAtTime(2600, start + duration);
    envelope.gain.setValueAtTime(0, start);
    envelope.gain.linearRampToValueAtTime(0.06, start + duration * 0.3);
    envelope.gain.linearRampToValueAtTime(0, start + duration);
    source.connect(filter).connect(envelope).connect(context.destination);
    source.start(start, Math.random() * 0.4);
    source.stop(start + duration + 0.02);
  },
  /** The drawer sliding out and the chads rattling round inside it. */
  rattle() {
    const context = getAudioContext();

    if (!context) {
      return;
    }

    noiseBurst(context, { decay: 0.012, frequency: 900, gain: 0.25, q: 1 });

    for (let chad = 0; chad < 18; chad += 1) {
      noiseBurst(context, {
        at: 0.05 + Math.random() * 0.4,
        decay: 0.003,
        frequency: 3000 + Math.random() * 3000,
        gain: 0.04 + Math.random() * 0.05,
        q: 2.5,
      });
    }

    noiseBurst(context, {
      at: 0.5,
      decay: 0.012,
      frequency: 1100,
      gain: 0.22,
      q: 1,
    });
  },
};

function buzz(pattern: number | number[]) {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    navigator.vibrate?.(pattern);
  }
}

/* -------------------------------------------------------------------------- */
/* Drawing                                                                     */
/* -------------------------------------------------------------------------- */

type PressStyle = CSSProperties & { "--press"?: number | string };

function rectPath(left: number, top: number, right: number, bottom: number) {
  return `M${left} ${top}H${right}V${bottom}H${left}Z`;
}

function ellipsePath(cx: number, cy: number, rx: number, ry: number) {
  return `M${cx - rx} ${cy}a${rx} ${ry} 0 1 0 ${rx * 2} 0a${rx} ${ry} 0 1 0 ${-rx * 2} 0Z`;
}

const HOLE_RY = HOLE_RADIUS * DEPTH_SCALE;
const RULE_LINES = Array.from({ length: 12 }, (_, line) => line);
const SCALE_TICKS = Array.from({ length: 45 }, (_, tick) => tick);
const GRIP_RIDGES = Array.from({ length: 7 }, (_, ridge) => ridge);

function PaperStack({
  shadowFilter,
  stack,
}: {
  shadowFilter: string;
  stack: Stack;
}) {
  const count = stack.sheets.length;
  const top = count - 1;

  return (
    <g className="dark:brightness-[0.86]">
      {/* A soft contact shadow on the plate. */}
      <rect
        fill="rgb(0 0 0 / 0.16)"
        filter={shadowFilter}
        height={(PAPER.back - PAPER.front) * DEPTH_SCALE}
        width={PAPER.halfWidth * 2 + 4}
        x={CENTRE_X - PAPER.halfWidth - 2}
        y={screenY(PAPER.back, PLATE.height) + 2}
      />
      {stack.sheets.map((sheet, index) => {
        const lift = PLATE.height + index * SHEET_THICKNESS;
        const left = CENTRE_X - PAPER.halfWidth + sheet.dx;
        const right = CENTRE_X + PAPER.halfWidth + sheet.dx;
        const back = screenY(PAPER.back, lift) + sheet.dy;
        const front = screenY(PAPER.front, lift) + sheet.dy;
        const holes = stack.punched
          ? HOLE_X.map((x) =>
              ellipsePath(
                CENTRE_X + x,
                screenY(HOLE_DEPTH, lift),
                HOLE_RADIUS,
                HOLE_RY,
              ),
            ).join("")
          : "";

        return (
          <g key={sheet.id}>
            <rect
              fill={sheet.color.edge}
              height={SHEET_THICKNESS + 0.4}
              width={right - left}
              x={left}
              y={front}
            />
            <path
              d={rectPath(left, back, right, front) + holes}
              fill={sheet.color.face}
              fillRule="evenodd"
            />
            {index === top ? (
              <g>
                {RULE_LINES.map((line) => {
                  const y = screenY(108 + line * 14, lift);

                  return (
                    <line
                      key={line}
                      stroke="rgb(70 120 200 / 0.28)"
                      strokeWidth={0.6}
                      x1={left}
                      x2={right}
                      y1={y}
                      y2={y}
                    />
                  );
                })}
                <line
                  stroke="rgb(220 80 80 / 0.38)"
                  strokeWidth={0.7}
                  x1={left + 30}
                  x2={left + 30}
                  y1={back}
                  y2={front}
                />
                {stack.punched
                  ? HOLE_X.map((x) => {
                      const cx = CENTRE_X + x;
                      const cy = screenY(HOLE_DEPTH, lift);

                      return (
                        <g key={x}>
                          {/* The far wall of the hole, through the stack. */}
                          <path
                            d={`M${cx - HOLE_RADIUS} ${cy}A${HOLE_RADIUS} ${HOLE_RY} 0 0 1 ${cx + HOLE_RADIUS} ${cy}`}
                            fill="none"
                            stroke={stack.sheets[0].color.edge}
                            strokeWidth={Math.min(2.4, 0.8 + count * 0.35)}
                            transform={`translate(0 ${Math.min(1.4, count * 0.3)})`}
                          />
                          <ellipse
                            cx={cx}
                            cy={cy}
                            fill="none"
                            rx={HOLE_RADIUS}
                            ry={HOLE_RY}
                            stroke="rgb(0 0 0 / 0.22)"
                            strokeWidth={0.6}
                          />
                        </g>
                      );
                    })
                  : null}
              </g>
            ) : null}
          </g>
        );
      })}
    </g>
  );
}

function ChadPile({
  chads,
  reduceMotion,
}: {
  chads: readonly Chad[];
  reduceMotion: boolean;
}) {
  return (
    <>
      {chads.map((chad) => (
        <motion.g
          animate={{ rotate: chad.rotate, y: [chad.fall, 0, -1.6, 0] }}
          initial={
            chad.fresh && !reduceMotion
              ? { rotate: chad.rotate - chad.spin, y: chad.fall }
              : false
          }
          key={chad.id}
          transition={{
            delay: chad.delay,
            duration: 0.42,
            ease: ["easeIn", "easeOut", "easeIn"],
            rotate: { delay: chad.delay, duration: 0.3, ease: "easeOut" },
            times: [0, 0.7, 0.85, 1],
          }}
        >
          <ellipse
            cx={chad.x}
            cy={chad.y}
            fill={chad.face}
            rx={chad.rx}
            ry={chad.ry}
            stroke={chad.edge}
            strokeWidth={0.7}
          />
        </motion.g>
      ))}
    </>
  );
}

type PunchArtProps = {
  chads: readonly Chad[];
  chadOpacity?: MotionValue<number> | number;
  className?: string;
  /** Extra classes for the moving lever parts, e.g. a hover transition. */
  leverClassName?: string;
  paperX?: MotionValue<number> | number;
  paperY?: MotionValue<number> | number;
  press?: number;
  reduceMotion?: boolean;
  stack: Stack;
  svgRef?: Ref<SVGSVGElement>;
  trayY?: MotionValue<number> | number;
};

/** The whole punch, drawn at a given lever press. */
function PunchArt({
  chads,
  chadOpacity = 1,
  className,
  leverClassName,
  paperX = 0,
  paperY = 0,
  press,
  reduceMotion = false,
  stack,
  svgRef,
  trayY = 0,
}: PunchArtProps) {
  const rawId = useId();
  const id = `hp${rawId.replace(/[^a-zA-Z0-9]/g, "")}`;
  const url = (name: string) => `url(#${id}-${name})`;

  const plateTop = screenY(PLATE.back, PLATE.height);
  const plateFront = screenY(0, PLATE.height);
  const headTop = screenY(HEAD.back, HEAD.height);
  const headFront = screenY(HEAD.front, HEAD.height);
  const headBottom = screenY(HEAD.front, THROAT_TOP);
  const throatBottom = screenY(HEAD.front, PLATE.height);
  const lipBottom = LEVER_FRONT_Y + LEVER.lipThickness;
  const paperUnderLip = screenY(LEVER.frontDepth, PLATE.height);

  return (
    <svg
      aria-hidden="true"
      className={cn("block h-auto w-full overflow-visible", className)}
      ref={svgRef}
      style={
        press === undefined ? undefined : ({ "--press": press } as PressStyle)
      }
      viewBox={`${VIEW_BOX.x} ${VIEW_BOX.y} ${VIEW_BOX.width} ${VIEW_BOX.height}`}
    >
      <defs>
        <filter height="200%" id={`${id}-soft`} width="200%" x="-50%" y="-50%">
          <feGaussianBlur stdDeviation="2.5" />
        </filter>
        <filter height="300%" id={`${id}-blur`} width="140%" x="-20%" y="-100%">
          <feGaussianBlur stdDeviation="5" />
        </filter>
        <linearGradient id={`${id}-plate`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="var(--hp-plate-back)" />
          <stop offset="1" stopColor="var(--hp-plate-front)" />
        </linearGradient>
        <linearGradient id={`${id}-tray`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="var(--hp-tray-top)" />
          <stop offset="1" stopColor="var(--hp-tray-bottom)" />
        </linearGradient>
        <linearGradient id={`${id}-glass`} x1="0" x2="0.35" y1="0" y2="1">
          <stop offset="0" stopColor="rgb(255 255 255 / 0.5)" />
          <stop offset="0.3" stopColor="rgb(255 255 255 / 0.08)" />
          <stop offset="0.7" stopColor="rgb(255 255 255 / 0)" />
          <stop offset="1" stopColor="rgb(255 255 255 / 0.12)" />
        </linearGradient>
        <linearGradient id={`${id}-head`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#3b3c41" />
          <stop offset="1" stopColor="#202125" />
        </linearGradient>
        <linearGradient id={`${id}-head-top`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#2a2b2f" />
          <stop offset="1" stopColor="#45464c" />
        </linearGradient>
        <linearGradient id={`${id}-lever`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#2b2c31" />
          <stop offset="0.6" stopColor="#3c3d43" />
          <stop offset="1" stopColor="#4a4b52" />
        </linearGradient>
        <linearGradient id={`${id}-lip`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#34353a" />
          <stop offset="1" stopColor="#17181b" />
        </linearGradient>
        <linearGradient id={`${id}-grip`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#d4552a" />
          <stop offset="1" stopColor="#f0723f" />
        </linearGradient>
        <linearGradient id={`${id}-post`} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#8e8b84" />
          <stop offset="0.45" stopColor="#e6e2da" />
          <stop offset="1" stopColor="#7c7973" />
        </linearGradient>
        <radialGradient cx="0.35" cy="0.35" id={`${id}-pin`} r="0.75">
          <stop offset="0" stopColor="#f4f1ea" />
          <stop offset="0.6" stopColor="#a8a49c" />
          <stop offset="1" stopColor="#6c6963" />
        </radialGradient>
        <linearGradient id={`${id}-lip-shadow`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="rgb(0 0 0 / 0.45)" />
          <stop offset="1" stopColor="rgb(0 0 0 / 0)" />
        </linearGradient>
        <clipPath id={`${id}-window`}>
          <rect
            height={TRAY_HEIGHT}
            rx={4}
            width={TRAY.right - TRAY.left}
            x={CENTRE_X + TRAY.left}
            y={TRAY.top}
          />
        </clipPath>
      </defs>

      {/* Shadow on the desk. */}
      <rect
        fill="rgb(0 0 0 / 0.22)"
        filter={url("blur")}
        height={24}
        rx={12}
        width={PLATE.halfWidth * 2 - 10}
        x={CENTRE_X - PLATE.halfWidth + 5}
        y={GROUND_Y - 14}
      />

      {/* Base plate. */}
      <rect
        fill={url("plate")}
        height={plateFront - plateTop + 8}
        rx={14}
        width={PLATE.halfWidth * 2}
        x={CENTRE_X - PLATE.halfWidth}
        y={plateTop}
      />
      <line
        stroke="rgb(255 255 255 / 0.55)"
        strokeWidth={1}
        x1={CENTRE_X - PLATE.halfWidth + 12}
        x2={CENTRE_X + PLATE.halfWidth - 12}
        y1={plateTop + 0.6}
        y2={plateTop + 0.6}
      />

      {/* Paper guide scale printed along the front of the plate. */}
      <g className="fill-[var(--hp-ink)] stroke-[var(--hp-ink)]">
        {SCALE_TICKS.map((tick) => {
          const x = CENTRE_X - 176 + tick * 8;
          const long = tick % 5 === 0;
          const y = screenY(18, PLATE.height);

          return (
            <line
              key={tick}
              strokeWidth={0.7}
              x1={x}
              x2={x}
              y1={y - (long ? 5 : 2.5)}
              y2={y}
            />
          );
        })}
        {[
          ["A5", -104],
          ["B5", -128],
          ["A4", -148],
          ["A5", 104],
          ["B5", 128],
          ["A4", 148],
        ].map(([label, x]) => (
          <text
            className="font-mono"
            fontSize={6}
            key={`${label}${x}`}
            stroke="none"
            textAnchor="middle"
            x={CENTRE_X + Number(x)}
            y={screenY(18, PLATE.height) - 8}
          >
            {label}
          </text>
        ))}
      </g>

      {/* The chad drawer, seen through its smoked front. */}
      <motion.g style={{ y: trayY }}>
        <rect
          fill="var(--hp-plate-side)"
          height={GROUND_Y - plateFront}
          rx={10}
          width={PLATE.halfWidth * 2}
          x={CENTRE_X - PLATE.halfWidth}
          y={plateFront}
        />
        <rect
          fill="var(--hp-plate-front)"
          height={6}
          width={PLATE.halfWidth * 2 - 20}
          x={CENTRE_X - PLATE.halfWidth + 10}
          y={plateFront}
        />
        <rect
          fill={url("tray")}
          height={TRAY_HEIGHT}
          rx={4}
          width={TRAY.right - TRAY.left}
          x={CENTRE_X + TRAY.left}
          y={TRAY.top}
        />
        <motion.g clipPath={url("window")} style={{ opacity: chadOpacity }}>
          <g transform={`translate(${CENTRE_X} 0)`}>
            <ChadPile chads={chads} reduceMotion={reduceMotion} />
          </g>
        </motion.g>
        <rect
          fill={url("glass")}
          height={TRAY_HEIGHT}
          pointerEvents="none"
          rx={4}
          stroke="rgb(255 255 255 / 0.35)"
          strokeWidth={0.8}
          width={TRAY.right - TRAY.left}
          x={CENTRE_X + TRAY.left}
          y={TRAY.top}
        />
        {/* Finger pull. */}
        <path
          d={`M${CENTRE_X - 20} ${GROUND_Y}a20 7 0 0 1 40 0Z`}
          fill="rgb(0 0 0 / 0.28)"
        />
      </motion.g>

      {/* The throat, dark inside, that the paper slides into. */}
      <rect
        fill="#121215"
        height={throatBottom - headBottom + 2}
        width={HEAD.halfWidth * 2}
        x={CENTRE_X - HEAD.halfWidth}
        y={headBottom - 2}
      />

      <motion.g style={{ x: paperX, y: paperY }}>
        <PaperStack shadowFilter={url("soft")} stack={stack} />
      </motion.g>

      {/* Shade where the paper disappears under the head. */}
      <rect
        fill="rgb(0 0 0 / 0.28)"
        filter={url("soft")}
        height={8}
        width={HEAD.halfWidth * 2 - 6}
        x={CENTRE_X - HEAD.halfWidth + 3}
        y={headBottom - 1}
      />

      {/* The lever's shadow on the paper, darkening as it comes down. */}
      <rect
        className={leverClassName}
        fill="rgb(0 0 0 / 0.5)"
        filter={url("blur")}
        height={14}
        rx={7}
        style={{ opacity: "calc(var(--press) * 0.55)" }}
        width={LEVER.halfWidth * 2 - 8}
        x={CENTRE_X - LEVER.halfWidth + 4}
        y={paperUnderLip - 10}
      />

      {/* Head. */}
      <rect
        fill={url("head-top")}
        height={headFront - headTop + 6}
        rx={6}
        width={HEAD.halfWidth * 2}
        x={CENTRE_X - HEAD.halfWidth}
        y={headTop}
      />
      <rect
        fill={url("head")}
        height={headBottom - headFront}
        rx={3}
        width={HEAD.halfWidth * 2}
        x={CENTRE_X - HEAD.halfWidth}
        y={headFront}
      />
      <line
        stroke="rgb(255 255 255 / 0.14)"
        x1={CENTRE_X - HEAD.halfWidth + 4}
        x2={CENTRE_X + HEAD.halfWidth - 4}
        y1={headFront + 0.5}
        y2={headFront + 0.5}
      />
      {/* Screws in the head. */}
      {[-118, 118].map((x) => (
        <g key={x}>
          <circle
            cx={CENTRE_X + x}
            cy={headBottom - 10}
            fill={url("pin")}
            r={3.4}
          />
          <line
            stroke="rgb(0 0 0 / 0.45)"
            strokeWidth={0.8}
            x1={CENTRE_X + x - 2.2}
            x2={CENTRE_X + x + 2.2}
            y1={headBottom - 11.4}
            y2={headBottom - 8.6}
          />
        </g>
      ))}

      {/* Hinge posts. */}
      {[-1, 1].map((side) => (
        <rect
          fill={url("post")}
          height={headTop - LEVER_BACK_Y + 14}
          key={side}
          rx={4}
          width={14}
          x={CENTRE_X + side * (LEVER.halfWidth + 9) - 7}
          y={LEVER_BACK_Y - 8}
        />
      ))}

      {/* Lever, top face: it flattens out, and shows more, as it comes down. */}
      <g
        className={leverClassName}
        style={{
          transform: `scaleY(calc(1 + var(--press) * ${LEVER_TRAVEL / LEVER_FACE_HEIGHT}))`,
          transformBox: "view-box",
          transformOrigin: `0px ${LEVER_BACK_Y}px`,
        }}
      >
        <rect
          fill={url("lever")}
          height={LEVER_FACE_HEIGHT + 8}
          rx={9}
          width={LEVER.halfWidth * 2}
          x={CENTRE_X - LEVER.halfWidth}
          y={LEVER_BACK_Y - 6}
        />
        <line
          stroke="rgb(255 255 255 / 0.16)"
          x1={CENTRE_X - LEVER.halfWidth + 8}
          x2={CENTRE_X + LEVER.halfWidth - 8}
          y1={LEVER_BACK_Y - 5.4}
          y2={LEVER_BACK_Y - 5.4}
        />
        {/* Name plate. */}
        <rect
          fill="#c9c5bc"
          height={9}
          rx={1.5}
          width={50}
          x={CENTRE_X - 25}
          y={LEVER_BACK_Y + 11}
        />
        <text
          fill="#3a3a3e"
          fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
          fontSize={6.2}
          fontWeight={700}
          letterSpacing={1}
          textAnchor="middle"
          x={CENTRE_X}
          y={LEVER_BACK_Y + 17.6}
        >
          No. 2
        </text>
        {/* Rubber grip. */}
        <rect
          fill={url("grip")}
          height={LEVER_FACE_HEIGHT - 26}
          rx={5}
          width={208}
          x={CENTRE_X - 104}
          y={LEVER_FRONT_Y - (LEVER_FACE_HEIGHT - 26)}
        />
        {GRIP_RIDGES.map((ridge) => {
          const y = LEVER_FRONT_Y - (LEVER_FACE_HEIGHT - 26) + 4 + ridge * 4.2;

          return (
            <line
              key={ridge}
              stroke="rgb(120 30 0 / 0.35)"
              strokeWidth={1}
              x1={CENTRE_X - 98}
              x2={CENTRE_X + 98}
              y1={y}
              y2={y}
            />
          );
        })}
      </g>

      {/* Lever, front lip. */}
      <g
        className={leverClassName}
        style={{
          transform: `translateY(calc(var(--press) * ${LEVER_TRAVEL}px))`,
        }}
      >
        <rect
          fill={url("lip-shadow")}
          height={12}
          style={{ opacity: "calc(1 - var(--press))" }}
          width={LEVER.halfWidth * 2 - 6}
          x={CENTRE_X - LEVER.halfWidth + 3}
          y={lipBottom - 1}
        />
        <rect
          fill={url("lip")}
          height={LEVER.lipThickness + 4}
          rx={6}
          width={LEVER.halfWidth * 2}
          x={CENTRE_X - LEVER.halfWidth}
          y={LEVER_FRONT_Y - 4}
        />
        <rect
          fill="#c24a1f"
          height={LEVER.lipThickness - 3}
          rx={3}
          width={208}
          x={CENTRE_X - 104}
          y={LEVER_FRONT_Y - 2}
        />
        <line
          stroke="rgb(255 210 180 / 0.45)"
          x1={CENTRE_X - 100}
          x2={CENTRE_X + 100}
          y1={LEVER_FRONT_Y - 1.4}
          y2={LEVER_FRONT_Y - 1.4}
        />
      </g>

      {/* Hinge pin caps sit over everything. */}
      {[-1, 1].map((side) => (
        <circle
          cx={CENTRE_X + side * (LEVER.halfWidth + 9)}
          cy={LEVER_BACK_Y}
          fill={url("pin")}
          key={side}
          r={5.5}
          stroke="rgb(0 0 0 / 0.3)"
          strokeWidth={0.6}
        />
      ))}
    </svg>
  );
}

/** Plate and tray colours follow the theme; the punch itself is always dark. */
const themeClassName =
  "[--hp-ink:rgb(40_40_44/0.45)] [--hp-plate-back:#d9d6cf] [--hp-plate-front:#eceae5] [--hp-plate-side:#c4c0b8] [--hp-tray-bottom:rgb(40_38_34/0.38)] [--hp-tray-top:rgb(40_38_34/0.62)] dark:[--hp-ink:rgb(255_255_255/0.32)] dark:[--hp-plate-back:#2e2f33] dark:[--hp-plate-front:#45464b] dark:[--hp-plate-side:#26272a] dark:[--hp-tray-bottom:rgb(0_0_0/0.35)] dark:[--hp-tray-top:rgb(0_0_0/0.6)]";

/* -------------------------------------------------------------------------- */
/* Interactive punch                                                           */
/* -------------------------------------------------------------------------- */

type Mode = "auto" | "drag" | "idle" | "return";

export type HolePunchProps = {
  /** How many sheets to stack under the punch. More sheets push back harder. */
  sheets?: number;
  /** Play synthesised punch, spring and paper sounds. */
  sound?: boolean;
  /** Called each time the punch goes through, with the number of sheets. */
  onPunch?: (sheets: number) => void;
  /** Called when the chad count changes, e.g. after punching or emptying. */
  onChadsChange?: (chads: number) => void;
  className?: string;
};

export function HolePunch({
  className,
  onChadsChange,
  onPunch,
  sheets = 1,
  sound = true,
}: HolePunchProps) {
  const reduceMotion = useReducedMotion() ?? false;
  const hintId = useId();
  const svgRef = useRef<SVGSVGElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  const [stack, setStack] = useState(() => makeStack(1, sheets));
  const [starter] = useState(makeStarterPile);
  const [chads, setChads] = useState<Chad[]>(starter.chads);
  const [busy, setBusy] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [emptying, setEmptying] = useState(false);

  const paperX = useMotionValue(0);
  const paperY = useMotionValue(0);
  const trayY = useMotionValue(0);
  const chadOpacity = useMotionValue(1);

  const pile = useRef(starter.pile);
  const chadId = useRef(starter.nextId);
  const chadTotal = useRef(starter.chads.length);
  const random = useRef(createRandom(Date.now() >>> 0));
  const stackRef = useRef(stack);
  const sheetsRef = useRef(sheets);
  const soundRef = useRef(sound);
  const busyRef = useRef(false);
  const callbacks = useRef({ onChadsChange, onPunch });

  stackRef.current = stack;
  sheetsRef.current = sheets;
  soundRef.current = sound;
  callbacks.current = { onChadsChange, onPunch };

  const sim = useRef({
    autoRelease: false,
    broken: false,
    brokeAt: 0,
    frame: 0,
    hand: 0,
    last: 0,
    mode: "idle" as Mode,
    p: 0,
    pointerId: -1,
    pullFired: false,
    startedAt: 0,
    startY: 0,
    touched: false,
    travelled: 0,
    v: 0,
  });

  const play = useCallback(
    <K extends keyof typeof sounds>(
      name: K,
      ...args: Parameters<(typeof sounds)[K]>
    ) => {
      if (soundRef.current) {
        (sounds[name] as (...values: typeof args) => void)(...args);
      }
    },
    [],
  );

  // A new sheet count swaps the stack, unless it is already being punched.
  useEffect(() => {
    if (busyRef.current || stackRef.current.punched) {
      return;
    }

    if (stackRef.current.sheets.length !== sheets) {
      setStack((current) => makeStack(current.id + 1, sheets));
    }
  }, [sheets]);

  useEffect(() => {
    callbacks.current.onChadsChange?.(chadTotal.current);
  }, []);

  /** Pull the punched sheet out, show it off, then feed in a fresh one. */
  const pullOut = useCallback(async () => {
    busyRef.current = true;
    setBusy(true);

    const nextStack = makeStack(stackRef.current.id + 1, sheetsRef.current);

    if (reduceMotion) {
      paperY.set(PULL_OUT_Y);
      await new Promise((resolve) => setTimeout(resolve, 1100));
      setStack(nextStack);
      paperY.set(0);
    } else {
      play("slide", 0.3);
      await animate(paperY, PULL_OUT_Y, {
        duration: 0.34,
        ease: [0.2, 0.8, 0.25, 1],
      });
      await new Promise((resolve) => setTimeout(resolve, 650));
      play("slide", 0.36);
      await animate(paperX, VIEW_WIDTH * 0.85, {
        duration: 0.38,
        ease: [0.55, 0, 0.8, 0.4],
      });
      setStack(nextStack);
      paperX.set(-VIEW_WIDTH * 0.85);
      await animate(paperX, 0, { duration: 0.42, ease: [0.15, 0.7, 0.2, 1] });
      play("slide", 0.24);
      await animate(paperY, 0, { duration: 0.26, ease: [0.4, 0, 0.2, 1] });
    }

    busyRef.current = false;
    setBusy(false);
  }, [paperX, paperY, play, reduceMotion]);

  const punchThrough = useCallback(() => {
    const current = stackRef.current;
    const count = current.sheets.length;
    const fresh = settleChads(
      pile.current,
      current.sheets.map((sheet) => sheet.color).reverse(),
      random.current,
      () => chadId.current++,
      true,
    );

    chadTotal.current += count * HOLE_X.length;
    setStack({ ...current, punched: true });
    setChads((previous) => [...previous, ...fresh]);
    play("punch", count);
    play("patter", fresh.length);
    buzz(14);
    callbacks.current.onPunch?.(count);
    callbacks.current.onChadsChange?.(chadTotal.current);

    const full = isPileFull(pile.current);
    setAnnouncement(
      `Punched ${count} ${count === 1 ? "sheet" : "sheets"}. ${chadTotal.current} chads in the tray${full ? ", which is full" : ""}.`,
    );
  }, [play]);

  /** The lever position for a given hand position, breaking through if due. */
  const leverFor = useCallback(
    (hand: number, now: number) => {
      const state = sim.current;

      if (state.broken) {
        return 1;
      }

      if (hand <= FREE_TRAVEL) {
        return Math.max(0, hand);
      }

      if (!state.touched) {
        state.touched = true;
        play("touch");
        buzz(4);
      }

      const pushed = hand - FREE_TRAVEL;
      const breakAt =
        BREAK_BASE + BREAK_PER_SHEET * (stackRef.current.sheets.length - 1);

      if (pushed >= breakAt) {
        state.broken = true;
        state.brokeAt = now;
        state.v = Math.max(state.v, 7);
        punchThrough();
        return 1;
      }

      // A faint judder while the punches bite.
      const strain = pushed / breakAt;
      const judder = reduceMotion ? 0 : Math.sin(now / 9) * 0.006 * strain;

      return FREE_TRAVEL + pushed * CREEP + judder;
    },
    [play, punchThrough, reduceMotion],
  );

  const release = useCallback(() => {
    const state = sim.current;

    if (state.mode === "auto" && !state.broken) {
      state.autoRelease = true;
      return;
    }

    if (state.mode === "drag" || state.mode === "auto") {
      state.mode = "return";
    }
  }, []);

  const step = useCallback(
    (now: number) => {
      const state = sim.current;
      const dt = Math.min(0.032, (now - state.last) / 1000 || 0.016);
      state.last = now;

      if (state.mode === "auto") {
        state.hand += dt * AUTO_SPEED;

        if (state.broken && state.autoRelease && now - state.brokeAt > 110) {
          state.mode = "return";
        }
      }

      const returning = state.mode === "return" || state.mode === "idle";
      const target = returning ? 0 : leverFor(state.hand, now);

      if (reduceMotion) {
        state.p = target;
        state.v = 0;
      } else {
        const [stiffness, damping] = returning
          ? [420, 15]
          : state.broken
            ? [1700, 30]
            : [1200, 68];
        const acceleration = stiffness * (target - state.p) - damping * state.v;
        state.v += acceleration * dt;
        state.p += state.v * dt;

        // The lever bottoms out on its stop, and bounces off it.
        if (state.p > 1.015) {
          state.p = 1.015;
          state.v = state.v > 0 ? -state.v * 0.25 : state.v;
        }

        // And it slaps back up against the top stop.
        if (state.p < -0.045) {
          state.p = -0.045;

          if (state.v < 0) {
            if (state.v < -2) {
              play("spring", Math.min(1, -state.v / 9));
            }
            state.v = -state.v * 0.3;
          }
        }
      }

      if (
        state.mode === "return" &&
        stackRef.current.punched &&
        !state.pullFired &&
        state.p < 0.3
      ) {
        state.pullFired = true;
        void pullOut();
      }

      svgRef.current?.style.setProperty("--press", state.p.toFixed(4));

      if (returning && Math.abs(state.p) < 0.002 && Math.abs(state.v) < 0.02) {
        if (reduceMotion && stackRef.current.punched && !state.pullFired) {
          state.pullFired = true;
          void pullOut();
        }

        state.p = 0;
        state.v = 0;
        state.mode = "idle";
        state.frame = 0;
        svgRef.current?.style.setProperty("--press", "0");
        return;
      }

      state.frame = requestAnimationFrame(step);
    },
    [leverFor, play, pullOut, reduceMotion],
  );

  const run = useCallback(() => {
    const state = sim.current;

    if (!state.frame) {
      state.last = performance.now();
      state.frame = requestAnimationFrame(step);
    }
  }, [step]);

  useEffect(
    () => () => {
      cancelAnimationFrame(sim.current.frame);
    },
    [],
  );

  const canStart = () =>
    !busyRef.current &&
    !stackRef.current.punched &&
    (sim.current.mode === "idle" || sim.current.mode === "return");

  const begin = (mode: "auto" | "drag") => {
    const state = sim.current;
    state.mode = mode;
    state.hand = Math.max(0, state.p);
    state.broken = false;
    state.touched = false;
    state.autoRelease = false;
    state.pullFired = false;
    run();
  };

  /** Hand travel, in lever units, for a pixel drag on the rendered punch. */
  const pixelsPerUnit = () => {
    const width = svgRef.current?.getBoundingClientRect().width ?? VIEW_WIDTH;
    return (LEVER_TRAVEL * width) / VIEW_BOX.width;
  };

  const onPointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0 || !canStart()) {
      return;
    }

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    getAudioContext();

    const state = sim.current;
    state.pointerId = event.pointerId;
    state.startY = event.clientY;
    state.startedAt = performance.now();
    state.travelled = 0;
    begin("drag");
  };

  const onPointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    const state = sim.current;

    if (state.mode !== "drag" || event.pointerId !== state.pointerId) {
      return;
    }

    const dy = event.clientY - state.startY;
    state.travelled = Math.max(state.travelled, Math.abs(dy));
    state.hand = Math.max(0, dy / pixelsPerUnit());
    run();
  };

  const onPointerUp = (event: PointerEvent<HTMLButtonElement>) => {
    const state = sim.current;

    if (event.pointerId !== state.pointerId) {
      return;
    }

    state.pointerId = -1;

    if (state.mode !== "drag") {
      return;
    }

    const tapped =
      !state.broken &&
      state.travelled < TAP_PX &&
      performance.now() - state.startedAt < TAP_MS;

    if (tapped) {
      // A tap punches all the way through on its own.
      state.mode = "auto";
      state.autoRelease = true;
      run();
      return;
    }

    release();
    run();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== " " && event.key !== "Enter") {
      return;
    }

    event.preventDefault();

    if (event.repeat || !canStart()) {
      return;
    }

    getAudioContext();
    begin("auto");
  };

  const onKeyUp = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== " " && event.key !== "Enter") {
      return;
    }

    release();
    run();
  };

  const emptyTray = async () => {
    if (emptying || chadTotal.current === 0) {
      return;
    }

    setEmptying(true);
    play("rattle");
    buzz([6, 40, 6]);

    if (reduceMotion) {
      chadOpacity.set(0);
    } else {
      await animate(trayY, 16, { duration: 0.22, ease: [0.3, 0, 0.2, 1] });
      await animate(chadOpacity, 0, { duration: 0.28, ease: "easeIn" });
    }

    pile.current = new Float32Array(PILE_COLUMNS);
    chadTotal.current = 0;
    setChads([]);
    callbacks.current.onChadsChange?.(0);
    chadOpacity.set(1);

    if (!reduceMotion) {
      await animate(trayY, [16, -1.5, 0], {
        duration: 0.32,
        ease: [0.3, 0, 0.2, 1],
        times: [0, 0.8, 1],
      });
    }

    setAnnouncement("Tray emptied.");
    setEmptying(false);
  };

  const count = stack.sheets.length;
  const sheetLabel = `${count} ${count === 1 ? "sheet" : "sheets"}`;

  return (
    <div
      className={cn("relative w-full max-w-[560px]", themeClassName, className)}
      ref={stageRef}
    >
      <PunchArt
        chadOpacity={chadOpacity}
        chads={chads}
        paperX={paperX}
        paperY={paperY}
        press={0}
        reduceMotion={reduceMotion}
        stack={stack}
        svgRef={svgRef}
        trayY={trayY}
      />

      <button
        aria-describedby={hintId}
        aria-disabled={busy || undefined}
        aria-label={busy ? "Feeding in fresh paper" : `Punch ${sheetLabel}`}
        className="absolute inset-x-[7%] top-[2%] h-[76%] cursor-grab touch-none rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-grayscale-8 active:cursor-grabbing aria-disabled:cursor-default"
        onBlur={() => {
          release();
          run();
        }}
        onKeyDown={onKeyDown}
        onKeyUp={onKeyUp}
        onLostPointerCapture={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        type="button"
      />
      <button
        aria-label={`Empty the chad tray, ${chads.length === 0 ? "already empty" : "full of chads"}`}
        className="absolute inset-x-[8%] top-[78.5%] h-[14%] cursor-pointer rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-grayscale-8 disabled:cursor-default"
        disabled={emptying || chads.length === 0}
        onClick={() => void emptyTray()}
        type="button"
      />

      <p className="sr-only" id={hintId}>
        Drag the lever down until the paper gives, or press Space or Enter.
      </p>
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}

/** A decorative, non-interactive punch for thumbnails and previews. */
export function HolePunchFace({
  className,
  leverClassName,
  sheets = 3,
}: {
  /** Set `--press` (0 to 1) here, e.g. `group-hover:[--press:1]`. */
  className?: string;
  /** Classes for the lever parts, e.g. a transition for the hover press. */
  leverClassName?: string;
  sheets?: number;
}) {
  const [starter] = useState(makeStarterPile);
  const [stack] = useState(() => makeStack(3, sheets));

  return (
    <div
      aria-hidden="true"
      className={cn("[--press:0]", themeClassName, className)}
    >
      <PunchArt
        chads={starter.chads}
        leverClassName={leverClassName}
        stack={stack}
      />
    </div>
  );
}
