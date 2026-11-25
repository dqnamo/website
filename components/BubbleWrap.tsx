"use client";

import {
  AnimatePresence,
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
  type PointerEvent,
  type Ref,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { cn } from "@/helpers/classname-helper";

/* -------------------------------------------------------------------------- */
/* Seeded randomness                                                           */
/* -------------------------------------------------------------------------- */

/** Every bubble gets its own small quirks, the same on every render. */
function seeded(seed: number) {
  let state = seed + 0x6d2b79f5;

  return () => {
    state = Math.imul(state ^ (state >>> 15), state | 1);
    state ^= state + Math.imul(state ^ (state >>> 7), state | 61);
    return ((state ^ (state >>> 14)) >>> 0) / 4294967296;
  };
}

type BubbleQuirks = {
  /** Creases left behind in the flattened film. */
  creases: string[];
  /** The crumpled outline of the film once the air has gone. */
  film: string;
  /** How hard the bubble has to be squeezed before it gives, in seconds. */
  resistance: number;
  /** How high the pop sounds. */
  pitch: number;
  /** Slight differences in how full each bubble was blown. */
  size: number;
};

function quirksFor(seed: number): BubbleQuirks {
  const random = seeded(seed * 977 + 13);
  const points: [number, number][] = [];
  const count = 13;

  for (let index = 0; index < count; index += 1) {
    const angle = (index / count) * Math.PI * 2 + (random() - 0.5) * 0.35;
    const radius = 33 + random() * 11;
    points.push([50 + Math.cos(angle) * radius, 50 + Math.sin(angle) * radius]);
  }

  // Curve through the midpoints so the outline reads as soft, crumpled film.
  const midpoint = (a: [number, number], b: [number, number]) =>
    [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] as const;
  const start = midpoint(points[count - 1], points[0]);
  let film = `M${start[0].toFixed(1)} ${start[1].toFixed(1)}`;

  for (let index = 0; index < count; index += 1) {
    const control = points[index];
    const end = midpoint(control, points[(index + 1) % count]);
    film += `Q${control[0].toFixed(1)} ${control[1].toFixed(1)} ${end[0].toFixed(1)} ${end[1].toFixed(1)}`;
  }

  const creases: string[] = [];
  const creaseCount = 2 + Math.floor(random() * 2);

  for (let index = 0; index < creaseCount; index += 1) {
    const angle = random() * Math.PI;
    const length = 14 + random() * 16;
    const bend = (random() - 0.5) * 14;
    const cx = 50 + (random() - 0.5) * 18;
    const cy = 50 + (random() - 0.5) * 18;
    const dx = Math.cos(angle) * length;
    const dy = Math.sin(angle) * length;
    creases.push(
      `M${(cx - dx).toFixed(1)} ${(cy - dy).toFixed(1)}Q${(cx - dy * (bend / length)).toFixed(1)} ${(cy + dx * (bend / length)).toFixed(1)} ${(cx + dx).toFixed(1)} ${(cy + dy).toFixed(1)}`,
    );
  }

  return {
    creases,
    film: `${film}Z`,
    pitch: 0.82 + random() * 0.4,
    resistance: 0.16 + random() * 0.2,
    size: 0.94 + random() * 0.06,
  };
}

/* -------------------------------------------------------------------------- */
/* Sound                                                                       */
/* -------------------------------------------------------------------------- */

let sharedAudioContext: AudioContext | null = null;
let popBuffer: AudioBuffer | null = null;

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

/** A sharp crack of noise with a fast tail: air leaving through a split. */
function createPopBuffer(context: AudioContext) {
  const length = Math.floor(context.sampleRate * 0.06);
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);

  for (let index = 0; index < length; index += 1) {
    const t = index / context.sampleRate;
    const envelope = t < 0.0008 ? t / 0.0008 : Math.exp(-(t - 0.0008) / 0.007);
    data[index] = (Math.random() * 2 - 1) * envelope;
  }

  return buffer;
}

function playPop(pitch: number) {
  const context = getAudioContext();

  if (!context) {
    return;
  }

  const now = context.currentTime;
  popBuffer ??= createPopBuffer(context);

  // The crack.
  const source = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const gain = context.createGain();
  source.buffer = popBuffer;
  source.playbackRate.value = pitch;
  filter.type = "bandpass";
  filter.frequency.value = 1500 * pitch;
  filter.Q.value = 0.8;
  gain.gain.value = 0.9;
  source.connect(filter).connect(gain).connect(context.destination);
  source.start(now);

  // The thump of the plastic snapping flat against the table.
  const body = context.createOscillator();
  const bodyGain = context.createGain();
  body.type = "sine";
  body.frequency.setValueAtTime(260 * pitch, now);
  body.frequency.exponentialRampToValueAtTime(90, now + 0.05);
  bodyGain.gain.setValueAtTime(0.35, now);
  bodyGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.07);
  body.connect(bodyGain).connect(context.destination);
  body.start(now);
  body.stop(now + 0.08);
}

function buzz(duration: number) {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    navigator.vibrate?.(duration);
  }
}

/* -------------------------------------------------------------------------- */
/* Visual pieces                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Colours are kept as RGB triplets so each layer can pick its own alpha. The
 * plastic is tinted cool and clear in light mode, smoky in dark mode.
 */
const sheetThemeClassName =
  "[--bw-fill:214_232_242] [--bw-glint:0.95] [--bw-rim:104_138_160] [--bw-shadow:28_48_66] [--bw-sheet:226_238_245] dark:[--bw-fill:170_196_214] dark:[--bw-glint:0.6] dark:[--bw-rim:150_178_198] dark:[--bw-shadow:0_0_0] dark:[--bw-sheet:92_108_122]";

const domeStyle: CSSProperties = {
  background:
    "radial-gradient(circle at 50% 52%, rgb(var(--bw-fill) / 0.22) 0 52%, rgb(var(--bw-rim) / 0.22) 80%, rgb(var(--bw-rim) / 0.5) 100%)",
  boxShadow:
    "0 1px 1.5px rgb(var(--bw-shadow) / 0.16), 0 5px 9px -3px rgb(var(--bw-shadow) / 0.22), inset 0 -3px 5px rgb(var(--bw-shadow) / 0.1), inset 0 2px 2px rgb(255 255 255 / calc(var(--bw-glint) * 0.6))",
};

const glintStyle: CSSProperties = {
  background:
    "radial-gradient(ellipse at center, rgb(255 255 255 / var(--bw-glint)) 0 35%, rgb(255 255 255 / 0) 72%)",
};

function BubbleFilm({ quirks }: { quirks: BubbleQuirks }) {
  return (
    <svg
      aria-hidden="true"
      className="absolute inset-0 size-full overflow-visible"
      viewBox="0 0 100 100"
    >
      <path
        d={quirks.film}
        fill="rgb(var(--bw-fill) / 0.16)"
        stroke="rgb(var(--bw-rim) / 0.42)"
        strokeLinejoin="round"
        strokeWidth={1.6}
        vectorEffect="non-scaling-stroke"
      />
      {quirks.creases.map((crease) => (
        <g key={crease}>
          <path
            d={crease}
            fill="none"
            stroke="rgb(var(--bw-rim) / 0.38)"
            strokeLinecap="round"
            strokeWidth={1.2}
            vectorEffect="non-scaling-stroke"
          />
          <path
            d={crease}
            fill="none"
            stroke="rgb(255 255 255 / calc(var(--bw-glint) * 0.55))"
            strokeLinecap="round"
            strokeWidth={1}
            transform="translate(0.8 -1.2)"
            vectorEffect="non-scaling-stroke"
          />
        </g>
      ))}
    </svg>
  );
}

type DomeLayersProps = {
  glintOpacity?: MotionValue<number> | number;
  glintScaleX?: MotionValue<number> | number;
  glintX?: MotionValue<string> | string;
  tension?: MotionValue<number> | number;
};

/** The raised, air-filled bubble with its window-shaped highlight. */
function DomeLayers({
  glintOpacity = 1,
  glintScaleX = 1,
  glintX = "0%",
  tension = 0,
}: DomeLayersProps) {
  return (
    <>
      <div className="absolute inset-0 rounded-full" style={domeStyle} />
      {/* The skin tightening into a bright ring as the air is squeezed. */}
      <motion.div
        className="absolute inset-[3%] rounded-full"
        style={{
          boxShadow:
            "inset 0 0 0 1.5px rgb(255 255 255 / calc(var(--bw-glint) * 0.7)), inset 0 0 8px rgb(var(--bw-rim) / 0.35)",
          opacity: tension,
        }}
      />
      <motion.div
        className="absolute top-[14%] left-[20%] h-[22%] w-[38%] -rotate-[28deg] rounded-full"
        style={{
          ...glintStyle,
          opacity: glintOpacity,
          scaleX: glintScaleX,
          x: glintX,
        }}
      />
      <div
        className="absolute right-[18%] bottom-[20%] h-[9%] w-[14%] -rotate-[28deg] rounded-full opacity-60"
        style={glintStyle}
      />
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* A single bubble                                                             */
/* -------------------------------------------------------------------------- */

type BubbleHandle = {
  /** A nudge from a neighbour popping next door. */
  jolt: (strength: number) => void;
  release: () => void;
  squeeze: () => void;
};

type BubbleProps = {
  column: number;
  index: number;
  inflateDelay: number;
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>, index: number) => void;
  onKeyUp: (event: KeyboardEvent<HTMLButtonElement>, index: number) => void;
  onPop: (index: number, pitch: number) => void;
  popped: boolean;
  quirks: BubbleQuirks;
  ref: Ref<BubbleHandle>;
  reduceMotion: boolean;
  row: number;
  setButtonRef: (index: number, element: HTMLButtonElement | null) => void;
  tabbable: boolean;
};

const RELEASE_SPRING = { damping: 9, stiffness: 620, type: "spring" } as const;

function Bubble({
  column,
  index,
  inflateDelay,
  onKeyDown,
  onKeyUp,
  onPop,
  popped,
  quirks,
  ref,
  reduceMotion,
  row,
  setButtonRef,
  tabbable,
}: BubbleProps) {
  const pressure = useMotionValue(0);
  const nudge = useMotionValue(0);
  const squeezeRef = useRef<AnimationPlaybackControls | null>(null);
  const poppedRef = useRef(popped);
  poppedRef.current = popped;

  const scale = useTransform<number, number>(
    [pressure, nudge],
    ([p, n]) => quirks.size * (1 + 0.07 * p - 0.04 * n),
  );
  const glintX = useTransform(pressure, [0, 1], ["0%", "26%"]);
  const glintScaleX = useTransform(pressure, [-0.3, 0, 1], [0.85, 1, 1.75]);
  const glintOpacity = useTransform(pressure, [0, 1], [1, 0.4]);
  const tension = useTransform(pressure, [0, 0.4, 1], [0, 0.1, 1]);

  useImperativeHandle(
    ref,
    () => ({
      jolt(strength) {
        if (poppedRef.current || reduceMotion) {
          return;
        }

        nudge.set(strength);
        animate(nudge, 0, RELEASE_SPRING);
      },
      release() {
        if (poppedRef.current) {
          return;
        }

        squeezeRef.current?.stop();
        squeezeRef.current = null;

        if (reduceMotion) {
          pressure.set(0);
          return;
        }

        // Let go too early and the bubble wobbles back up, a little over full.
        animate(pressure, 0, RELEASE_SPRING);
      },
      squeeze() {
        if (poppedRef.current) {
          return;
        }

        squeezeRef.current?.stop();

        if (reduceMotion) {
          onPop(index, quirks.pitch);
          return;
        }

        const remaining = 1 - Math.max(0, pressure.get());
        squeezeRef.current = animate(pressure, 1, {
          duration: quirks.resistance * remaining,
          ease: [0.6, 0, 0.9, 0.5],
          onComplete: () => {
            squeezeRef.current = null;
            onPop(index, quirks.pitch);
          },
        });
      },
    }),
    [index, nudge, onPop, pressure, quirks, reduceMotion],
  );

  return (
    <button
      aria-disabled={popped || undefined}
      aria-label={`${popped ? "Popped bubble" : "Bubble"}, row ${row + 1}, column ${column + 1}`}
      className="group/bubble relative aspect-square w-full touch-none select-none rounded-full outline-none focus-visible:ring-2 focus-visible:ring-grayscale-8 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
      data-bubble={index}
      onKeyDown={(event) => onKeyDown(event, index)}
      onKeyUp={(event) => onKeyUp(event, index)}
      ref={(element) => setButtonRef(index, element)}
      tabIndex={tabbable ? 0 : -1}
      type="button"
    >
      <span className="pointer-events-none absolute inset-[9%] block">
        <AnimatePresence initial={false}>
          {popped ? (
            <motion.span
              animate={{ opacity: 1, scale: 1 }}
              className="absolute inset-0 block"
              initial={reduceMotion ? false : { opacity: 0, scale: 1.14 }}
              key="film"
              transition={{ damping: 14, stiffness: 520, type: "spring" }}
            >
              <BubbleFilm quirks={quirks} />
            </motion.span>
          ) : (
            <motion.span
              animate={{ opacity: 1, scale: 1 }}
              className="absolute inset-0 block"
              exit={
                reduceMotion
                  ? { opacity: 0, transition: { duration: 0 } }
                  : {
                      opacity: 0,
                      scale: 1.16,
                      transition: { duration: 0.07, ease: "easeOut" },
                    }
              }
              initial={reduceMotion ? false : { opacity: 0, scale: 0.35 }}
              key="dome"
              transition={{
                damping: 11,
                delay: inflateDelay,
                stiffness: 380,
                type: "spring",
              }}
            >
              <motion.span className="absolute inset-0 block" style={{ scale }}>
                <DomeLayers
                  glintOpacity={glintOpacity}
                  glintScaleX={glintScaleX}
                  glintX={glintX}
                  tension={tension}
                />
              </motion.span>
            </motion.span>
          )}
        </AnimatePresence>

        {popped && !reduceMotion ? <PopPuff /> : null}
      </span>
    </button>
  );
}

const PUFF_LINES = [0, 60, 120, 180, 240, 300];

/** A ring of escaping air and a few short burst lines. */
function PopPuff() {
  return (
    <>
      <motion.span
        animate={{ opacity: 0, scale: 1.75 }}
        className="absolute inset-0 block rounded-full border border-[rgb(var(--bw-rim)/0.5)]"
        initial={{ opacity: 0.8, scale: 0.8 }}
        transition={{ duration: 0.42, ease: [0.2, 0.7, 0.3, 1] }}
      />
      {PUFF_LINES.map((angle) => (
        <span
          className="absolute top-1/2 left-1/2 block h-0 w-0"
          key={angle}
          style={{ transform: `rotate(${angle + 15}deg)` }}
        >
          <motion.span
            animate={{ opacity: 0, scaleX: 0.3, x: 34 }}
            className="absolute top-[-0.75px] left-0 block h-[1.5px] w-[7px] origin-left rounded-full bg-[rgb(var(--bw-rim)/0.7)]"
            initial={{ opacity: 1, scaleX: 1, x: 14 }}
            transition={{ duration: 0.32, ease: "easeOut" }}
          />
        </span>
      ))}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Layout helpers                                                              */
/* -------------------------------------------------------------------------- */

/** Odd rows sit half a bubble to the right, packed like the real thing. */
function neighboursOf(index: number, rows: number, columns: number) {
  const row = Math.floor(index / columns);
  const column = index % columns;
  const shift = row % 2 === 0 ? -1 : 0;
  const candidates: [number, number][] = [
    [row, column - 1],
    [row, column + 1],
    [row - 1, column + shift],
    [row - 1, column + shift + 1],
    [row + 1, column + shift],
    [row + 1, column + shift + 1],
  ];

  return candidates
    .filter(([r, c]) => r >= 0 && r < rows && c >= 0 && c < columns)
    .map(([r, c]) => r * columns + c);
}

function rowStyle(row: number, columns: number): CSSProperties {
  const pitch = 100 / (columns + 0.5);

  return {
    // Percentage margins resolve against the sheet's width, like the bubbles.
    marginTop: row === 0 ? 0 : `${-pitch * (1 - Math.sqrt(3) / 2)}%`,
    paddingLeft: row % 2 === 1 ? `${pitch / 2}%` : 0,
  };
}

function SheetSurface({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        sheetThemeClassName,
        "relative rounded-[3px] border border-[rgb(var(--bw-rim)/0.22)] bg-[rgb(var(--bw-sheet)/0.55)] shadow-[0_1px_2px_rgb(var(--bw-shadow)/0.08),0_14px_30px_-12px_rgb(var(--bw-shadow)/0.22)] backdrop-blur-[1px] dark:bg-[rgb(var(--bw-sheet)/0.28)]",
        className,
      )}
    >
      {children}
      {/* A long, faint sheen across the plastic. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 rounded-[3px] bg-[linear-gradient(115deg,transparent_20%,rgb(255_255_255/0.22)_38%,transparent_46%,transparent_62%,rgb(255_255_255/0.12)_70%,transparent_78%)] dark:opacity-40"
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Static face, for previews                                                   */
/* -------------------------------------------------------------------------- */

export type BubbleWrapFaceProps = {
  className?: string;
  columns?: number;
  /** Indices of bubbles that have already been popped. */
  popped?: readonly number[];
  rows?: number;
};

export function BubbleWrapFace({
  className,
  columns = 5,
  popped = [],
  rows = 3,
}: BubbleWrapFaceProps) {
  const quirks = useMemo(
    () =>
      Array.from({ length: rows * columns }, (_, index) => quirksFor(index)),
    [columns, rows],
  );

  return (
    <SheetSurface className={cn("p-[4%]", className)}>
      {Array.from({ length: rows }, (_, row) => (
        <div
          className="flex"
          // biome-ignore lint/suspicious/noArrayIndexKey: rows never reorder.
          key={row}
          style={rowStyle(row, columns)}
        >
          {Array.from({ length: columns }, (_, column) => {
            const index = row * columns + column;

            return (
              <div
                className="relative aspect-square"
                key={index}
                style={{ width: `${100 / (columns + 0.5)}%` }}
              >
                <div className="absolute inset-[9%]">
                  {popped.includes(index) ? (
                    <BubbleFilm quirks={quirks[index]} />
                  ) : (
                    <div
                      className="absolute inset-0"
                      style={{ transform: `scale(${quirks[index].size})` }}
                    >
                      <DomeLayers />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </SheetSurface>
  );
}

/* -------------------------------------------------------------------------- */
/* The sheet                                                                   */
/* -------------------------------------------------------------------------- */

export type BubbleWrapProps = {
  className?: string;
  columns?: number;
  /** Called after every pop with the running count. */
  onPop?: (popped: number, total: number) => void;
  rows?: number;
  /** Seed for each bubble's quirks; change it for a different sheet. */
  seed?: number;
  sound?: boolean;
};

const PRESS_KEYS = new Set([" ", "Enter"]);

export function BubbleWrap({
  className,
  columns = 8,
  onPop,
  rows = 5,
  seed = 0,
  sound = true,
}: BubbleWrapProps) {
  const reduceMotion = useReducedMotion() ?? false;
  const total = rows * columns;
  const [popped, setPopped] = useState<boolean[]>(() =>
    Array.from({ length: total }, () => false),
  );
  const [focusIndex, setFocusIndex] = useState(0);
  const quirks = useMemo(
    () =>
      Array.from({ length: total }, (_, index) =>
        quirksFor(seed * 1000 + index),
      ),
    [seed, total],
  );

  const handles = useRef<(BubbleHandle | null)[]>([]);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const pressedRef = useRef<number | null>(null);
  const poppedCountRef = useRef(0);
  const soundRef = useRef(sound);
  soundRef.current = sound;
  const onPopRef = useRef(onPop);
  onPopRef.current = onPop;

  const handlePop = useCallback(
    (index: number, pitch: number) => {
      setPopped((current) => {
        if (current[index]) {
          return current;
        }

        const next = [...current];
        next[index] = true;
        return next;
      });

      poppedCountRef.current += 1;
      onPopRef.current?.(poppedCountRef.current, total);

      if (soundRef.current) {
        playPop(pitch);
      }

      buzz(10);

      for (const neighbour of neighboursOf(index, rows, columns)) {
        handles.current[neighbour]?.jolt(0.6);
      }
    },
    [columns, rows, total],
  );

  const press = useCallback((index: number | null) => {
    if (pressedRef.current === index) {
      return;
    }

    if (pressedRef.current !== null) {
      handles.current[pressedRef.current]?.release();
    }

    pressedRef.current = index;

    if (index !== null) {
      handles.current[index]?.squeeze();
    }
  }, []);

  const setButtonRef = useCallback(
    (index: number, element: HTMLButtonElement | null) => {
      buttons.current[index] = element;
    },
    [],
  );

  function bubbleAt(x: number, y: number) {
    const element = document
      .elementFromPoint(x, y)
      ?.closest<HTMLElement>("[data-bubble]");

    return element ? Number(element.dataset.bubble) : null;
  }

  function handlePointerDown(event: PointerEvent<HTMLFieldSetElement>) {
    if (event.button !== 0) {
      return;
    }

    // Wake the audio up inside the gesture so the first pop is heard.
    if (sound) {
      getAudioContext();
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    const index = bubbleAt(event.clientX, event.clientY);

    if (index !== null) {
      setFocusIndex(index);
    }

    press(index);
  }

  function handlePointerMove(event: PointerEvent<HTMLFieldSetElement>) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
      return;
    }

    // Drag across the sheet to squeeze bubble after bubble.
    press(bubbleAt(event.clientX, event.clientY));
  }

  function handlePointerEnd() {
    press(null);
  }

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
      const row = Math.floor(index / columns);
      const column = index % columns;
      let next: number | null = null;

      switch (event.key) {
        case "ArrowLeft":
          next = column > 0 ? index - 1 : null;
          break;
        case "ArrowRight":
          next = column < columns - 1 ? index + 1 : null;
          break;
        case "ArrowUp":
          next = row > 0 ? index - columns : null;
          break;
        case "ArrowDown":
          next = row < rows - 1 ? index + columns : null;
          break;
        case "Home":
          next = row * columns;
          break;
        case "End":
          next = row * columns + columns - 1;
          break;
        default:
          break;
      }

      if (event.key.startsWith("Arrow") || next !== null) {
        event.preventDefault();

        if (next !== null) {
          press(null);
          setFocusIndex(next);
          buttons.current[next]?.focus();
        }

        return;
      }

      if (PRESS_KEYS.has(event.key)) {
        event.preventDefault();

        if (!event.repeat) {
          if (soundRef.current) {
            getAudioContext();
          }

          press(index);
        }
      }
    },
    [columns, press, rows],
  );

  const handleKeyUp = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>) => {
      if (PRESS_KEYS.has(event.key)) {
        event.preventDefault();
        press(null);
      }
    },
    [press],
  );

  const poppedCount = popped.filter(Boolean).length;

  return (
    <SheetSurface className={cn("w-full p-[3%]", className)}>
      <fieldset
        aria-label={`Bubble wrap, ${poppedCount} of ${total} popped. Hold Space or Enter to squeeze a bubble.`}
        className="relative m-0 min-w-0 touch-none border-0 p-0"
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) {
            press(null);
          }
        }}
        onLostPointerCapture={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
      >
        {Array.from({ length: rows }, (_, row) => (
          <div
            className="flex"
            // biome-ignore lint/suspicious/noArrayIndexKey: rows never reorder.
            key={row}
            style={rowStyle(row, columns)}
          >
            {Array.from({ length: columns }, (_, column) => {
              const index = row * columns + column;

              return (
                <div
                  className="relative"
                  key={index}
                  style={{ width: `${100 / (columns + 0.5)}%` }}
                >
                  <Bubble
                    column={column}
                    index={index}
                    inflateDelay={(row + column) * 0.022}
                    onKeyDown={handleKeyDown}
                    onKeyUp={handleKeyUp}
                    onPop={handlePop}
                    popped={popped[index]}
                    quirks={quirks[index]}
                    reduceMotion={reduceMotion}
                    ref={(handle) => {
                      handles.current[index] = handle;
                    }}
                    row={row}
                    setButtonRef={setButtonRef}
                    tabbable={index === focusIndex}
                  />
                </div>
              );
            })}
          </div>
        ))}
      </fieldset>
    </SheetSurface>
  );
}
