"use client";

import { useReducedMotion } from "motion/react";
import {
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

export type ScratchCoating = "silver" | "gold";

export type ScratchCardProps = {
  /** Whatever is printed under the coating. */
  children: ReactNode;
  /** Accessible name for the scratch surface. */
  label?: string;
  coating?: ScratchCoating;
  /** Words printed on the coating. */
  print?: string;
  /** Share of the coating (0–1) that has to come off before the rest gives. */
  revealAt?: number;
  /** Radius of the scraping edge, in pixels. */
  brushSize?: number;
  /** Play a scrape while scratching and a chime on reveal. */
  sound?: boolean;
  onReveal?: () => void;
  className?: string;
};

type Point = { x: number; y: number };

type Flake = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  spin: number;
  spinSpeed: number;
  flip: number;
  flipSpeed: number;
  size: number;
  age: number;
  life: number;
  shade: number;
};

type CoatingPalette = {
  stops: string[];
  ink: string;
  highlight: string;
  flake: [number, number, number];
  fallback: string;
};

const COATINGS: Record<ScratchCoating, CoatingPalette> = {
  gold: {
    fallback:
      "linear-gradient(115deg, #a77b2c, #e9c873 30%, #c39a45 52%, #f6dc94 74%, #b0853a)",
    flake: [222, 184, 98],
    highlight: "rgba(255, 246, 214, 0.6)",
    ink: "rgba(88, 56, 8, 0.3)",
    stops: ["#a77b2c", "#e9c873", "#c39a45", "#f6dc94", "#b0853a"],
  },
  silver: {
    fallback:
      "linear-gradient(115deg, #9fa3aa, #dfe2e6 30%, #b4b8be 52%, #eef0f2 74%, #a5a9b0)",
    flake: [198, 202, 208],
    highlight: "rgba(255, 255, 255, 0.6)",
    ink: "rgba(36, 40, 48, 0.24)",
    stops: ["#9fa3aa", "#dfe2e6", "#b4b8be", "#eef0f2", "#a5a9b0"],
  },
};

/** How far flakes can fall outside the card before they're dropped. */
const FLAKE_MARGIN = 56;
/** Columns in the coverage grid used to measure how much has come off. */
const GRID_COLUMNS = 48;
/** A cell counts as scratched once less than this much coating is left. */
const CLEARED_BELOW = 0.22;
/** Gravity for flakes, in px/ms². */
const GRAVITY = 0.0016;
/** Each Enter or Space scratches one of this many strips. */
const KEYBOARD_STRIPS = 4;
const MAX_FLAKES = 420;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

function random(minimum: number, maximum: number) {
  return minimum + Math.random() * (maximum - minimum);
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

function getNoiseBuffer(context: AudioContext) {
  if (noiseBuffer) {
    return noiseBuffer;
  }

  const length = context.sampleRate;
  noiseBuffer = context.createBuffer(1, length, context.sampleRate);
  const data = noiseBuffer.getChannelData(0);

  for (let index = 0; index < length; index += 1) {
    // Sparse spikes on top of white noise read as grit catching the edge.
    const grit = Math.random() < 0.004 ? random(-1, 1) * 3 : 0;
    data[index] = (Math.random() * 2 - 1) * 0.6 + grit;
  }

  return noiseBuffer;
}

type ScrapeVoice = {
  move: (speed: number) => void;
  stop: () => void;
};

/** A loop of filtered noise whose loudness and brightness follow the hand. */
function startScrape(): ScrapeVoice | null {
  const context = getAudioContext();

  if (!context) {
    return null;
  }

  const source = context.createBufferSource();
  const highpass = context.createBiquadFilter();
  const bandpass = context.createBiquadFilter();
  const gain = context.createGain();

  source.buffer = getNoiseBuffer(context);
  source.loop = true;
  source.loopStart = Math.random() * 0.5;
  highpass.type = "highpass";
  highpass.frequency.value = 900;
  bandpass.type = "bandpass";
  bandpass.frequency.value = 2400;
  bandpass.Q.value = 0.7;
  gain.gain.value = 0;

  source.connect(highpass).connect(bandpass).connect(gain);
  gain.connect(context.destination);
  source.start();

  return {
    move(speed) {
      const now = context.currentTime;
      const level = clamp(speed * 0.2, 0, 0.32) * random(0.75, 1.2);

      gain.gain.cancelScheduledValues(now);
      gain.gain.setTargetAtTime(level, now, 0.012);
      // If the hand stops moving, the scrape dies away on its own.
      gain.gain.setTargetAtTime(0, now + 0.06, 0.035);
      bandpass.frequency.setTargetAtTime(
        clamp(1800 + speed * 1600, 1800, 5200),
        now,
        0.03,
      );
    },
    stop() {
      const now = context.currentTime;

      gain.gain.cancelScheduledValues(now);
      gain.gain.setTargetAtTime(0, now, 0.025);
      source.stop(now + 0.25);
    },
  };
}

/** Two bright sine partials, a little apart, like a bell on a counter. */
function playChime() {
  const context = getAudioContext();

  if (!context) {
    return;
  }

  const now = context.currentTime;

  for (const [index, frequency] of [1318.5, 1975.5].entries()) {
    const start = now + index * 0.09;
    const oscillator = context.createOscillator();
    const gain = context.createGain();

    oscillator.type = "sine";
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(0.09, start + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 1.1);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(start);
    oscillator.stop(start + 1.2);
  }
}

/* -------------------------------------------------------------------------- */
/* Painting                                                                    */
/* -------------------------------------------------------------------------- */

const PRINT_FONT =
  'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace';

/** Lays down the metallic latex: a sheen, fine grain and embossed print. */
function paintCoating(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  palette: CoatingPalette,
  print: string,
) {
  context.save();
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.globalCompositeOperation = "source-over";
  context.globalAlpha = 1;
  context.clearRect(0, 0, context.canvas.width, context.canvas.height);
  context.restore();

  const sheen = context.createLinearGradient(0, 0, width, height * 0.6);
  palette.stops.forEach((stop, index) => {
    sheen.addColorStop(index / (palette.stops.length - 1), stop);
  });
  context.fillStyle = sheen;
  context.fillRect(0, 0, width, height);

  // Grain, pixel by pixel, so the coating looks sprayed rather than flat.
  const image = context.getImageData(
    0,
    0,
    context.canvas.width,
    context.canvas.height,
  );
  const data = image.data;

  for (let index = 0; index < data.length; index += 4) {
    const grain = (Math.random() - 0.5) * 26;
    data[index] += grain;
    data[index + 1] += grain;
    data[index + 2] += grain;
  }

  context.putImageData(image, 0, 0);

  // A faint diagonal of small print, like the security pattern on a ticket.
  const small = clamp(Math.round(height / 18), 7, 10);
  context.save();
  context.translate(width / 2, height / 2);
  context.rotate(-0.32);
  context.font = `600 ${small}px ${PRINT_FONT}`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  const repeat = `${print.toUpperCase()} ✦ `;
  const row = repeat.repeat(Math.ceil((width * 2) / (repeat.length * small)));
  const rowGap = small * 2.4;
  const reach = Math.hypot(width, height);

  for (let y = -reach / 2, line = 0; y < reach / 2; y += rowGap, line += 1) {
    const shift = (line % 2) * small * 3;
    context.fillStyle = palette.highlight;
    context.globalAlpha = 0.35;
    context.fillText(row, shift + 0.6, y + 0.6);
    context.fillStyle = palette.ink;
    context.globalAlpha = 0.45;
    context.fillText(row, shift, y);
  }

  context.restore();

  // The big words in the middle, pressed into the latex.
  const large = clamp(Math.round(height / 6.5), 12, 26);
  context.save();
  context.font = `700 ${large}px ${PRINT_FONT}`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.letterSpacing = `${large * 0.12}px`;
  context.fillStyle = palette.highlight;
  context.fillText(print.toUpperCase(), width / 2 + 1, height / 2 + 1);
  context.fillStyle = palette.ink.replace(/[\d.]+\)$/, "0.55)");
  context.fillText(print.toUpperCase(), width / 2, height / 2);
  context.restore();

  // An inset keyline, so the coating reads as a printed panel.
  context.save();
  context.strokeStyle = palette.ink;
  context.lineWidth = 1;
  context.setLineDash([3, 3]);
  context.strokeRect(5.5, 5.5, width - 11, height - 11);
  context.restore();
}

/**
 * A scraping edge: a dense core with ragged, speckled edges, so every pass
 * leaves a little latex behind at its margins.
 */
function makeBrush(radius: number, dpr: number) {
  const canvas = document.createElement("canvas");
  const size = Math.ceil(radius * 2 * dpr);
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");

  if (!context) {
    return canvas;
  }

  context.scale(dpr, dpr);
  // A hard core, so holes have crisp edges rather than an airbrushed fade.
  context.fillStyle = "black";
  context.beginPath();
  context.arc(radius, radius, radius * 0.62, 0, Math.PI * 2);
  context.fill();

  // Ragged fringe: specks around the rim that only some passes take off.
  for (let index = 0; index < 140; index += 1) {
    const angle = Math.random() * Math.PI * 2;
    const distance = radius * random(0.5, 0.98);
    context.globalAlpha = random(0.4, 1);
    context.beginPath();
    context.arc(
      radius + Math.cos(angle) * distance,
      radius + Math.sin(angle) * distance,
      random(0.5, 1.9),
      0,
      Math.PI * 2,
    );
    context.fill();
  }

  return canvas;
}

/* -------------------------------------------------------------------------- */
/* Component                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * A panel of metallic latex over whatever you put inside it. Scratch with
 * the pointer, or press Enter or Space to scratch a strip at a time. Once
 * enough has come off, the rest crumbles away and `onReveal` fires.
 */
export function ScratchCard({
  brushSize = 15,
  children,
  className,
  coating = "silver",
  label = "Scratch to reveal",
  onReveal,
  print = "Scratch here",
  revealAt = 0.6,
  sound = true,
}: ScratchCardProps) {
  const shouldReduceMotion = useReducedMotion() ?? false;
  const hintId = useId();
  const [ready, setReady] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [coinVisible, setCoinVisible] = useState(false);
  const [pressed, setPressed] = useState(false);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLButtonElement>(null);
  const coatRef = useRef<HTMLCanvasElement>(null);
  const flakeCanvasRef = useRef<HTMLCanvasElement>(null);
  const coinRef = useRef<HTMLDivElement>(null);
  const prizeRef = useRef<HTMLDivElement>(null);

  const sizeRef = useRef({ dpr: 1, height: 0, width: 0 });
  const gridRef = useRef<{
    cells: Float32Array;
    columns: number;
    rows: number;
  }>({ cells: new Float32Array(0), columns: 0, rows: 0 });
  const brushesRef = useRef<HTMLCanvasElement[]>([]);
  const flakesRef = useRef<Flake[]>([]);
  const debrisRef = useRef(0);
  const frameRef = useRef(0);
  const lastPointRef = useRef<(Point & { time: number }) | null>(null);
  const tiltRef = useRef(0);
  const scrapeRef = useRef<ScrapeVoice | null>(null);
  const stripRef = useRef(0);
  const sweepingRef = useRef(false);
  const revealedRef = useRef(false);
  const paintedRef = useRef(false);
  const pressedRef = useRef(false);

  const palette = COATINGS[coating];
  const optionsRef = useRef({
    brushSize,
    onReveal,
    palette,
    print,
    revealAt,
    shouldReduceMotion,
    sound,
  });
  optionsRef.current = {
    brushSize,
    onReveal,
    palette,
    print,
    revealAt,
    shouldReduceMotion,
    sound,
  };

  /* ----------------------------- Flakes ----------------------------- */

  const drawFlakes = useCallback(() => {
    const canvas = flakeCanvasRef.current;
    const context = canvas?.getContext("2d");
    const { dpr, height, width } = sizeRef.current;

    if (!canvas || !context) {
      return;
    }

    const [red, green, blue] = optionsRef.current.palette.flake;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.setTransform(
      dpr,
      0,
      0,
      dpr,
      FLAKE_MARGIN * dpr,
      FLAKE_MARGIN * dpr,
    );

    for (const flake of flakesRef.current) {
      // Tumbling: the flake narrows as it turns edge-on and glints face-on.
      const face = Math.cos(flake.flip);
      const light = flake.shade * (0.72 + 0.28 * Math.abs(face));
      const glint = face > 0.92 ? (face - 0.92) * 9 : 0;
      const fade = clamp((flake.life - flake.age) / (flake.life * 0.3), 0, 1);
      const r = Math.round(clamp(red * light + 255 * glint, 0, 255));
      const g = Math.round(clamp(green * light + 255 * glint, 0, 255));
      const b = Math.round(clamp(blue * light + 255 * glint, 0, 255));

      context.save();
      context.translate(flake.x, flake.y);
      context.rotate(flake.spin);
      context.globalAlpha = fade;
      context.fillStyle = `rgb(${r} ${g} ${b})`;
      context.fillRect(
        (-flake.size / 2) * Math.max(0.18, Math.abs(face)),
        -flake.size * 0.35,
        flake.size * Math.max(0.18, Math.abs(face)),
        flake.size * 0.7,
      );
      context.restore();
    }

    // Keep flakes that fell off the bottom out of the loop.
    flakesRef.current = flakesRef.current.filter(
      (flake) =>
        flake.age < flake.life &&
        flake.y < height + FLAKE_MARGIN &&
        flake.x > -FLAKE_MARGIN &&
        flake.x < width + FLAKE_MARGIN,
    );
  }, []);

  const runFlakes = useCallback(() => {
    if (frameRef.current) {
      return;
    }

    let previous = performance.now();

    const tick = (now: number) => {
      const delta = Math.min(now - previous, 32);
      previous = now;

      for (const flake of flakesRef.current) {
        flake.age += delta;
        flake.vy += GRAVITY * delta;
        flake.vx *= 0.992;
        flake.vy *= 0.996;
        // Flat flakes catch the air when they're face-on to it.
        flake.vx += Math.sin(flake.flip) * 0.00025 * delta;
        flake.x += flake.vx * delta;
        flake.y += flake.vy * delta;
        flake.spin += flake.spinSpeed * delta;
        flake.flip += flake.flipSpeed * delta;
      }

      drawFlakes();

      if (flakesRef.current.length > 0) {
        frameRef.current = requestAnimationFrame(tick);
      } else {
        frameRef.current = 0;
      }
    };

    frameRef.current = requestAnimationFrame(tick);
  }, [drawFlakes]);

  const spawnFlake = useCallback(
    (point: Point, push: Point, scatter: number) => {
      if (flakesRef.current.length >= MAX_FLAKES) {
        return;
      }

      flakesRef.current.push({
        age: 0,
        flip: random(0, Math.PI * 2),
        flipSpeed: random(-0.03, 0.03),
        life: random(700, 1300),
        shade: random(0.82, 1.08),
        size: random(1.6, 3.8),
        spin: random(0, Math.PI * 2),
        spinSpeed: random(-0.012, 0.012),
        vx: push.x + random(-scatter, scatter),
        vy: push.y + random(-scatter * 1.6, scatter * 0.4),
        x: point.x + random(-3, 3),
        y: point.y + random(-3, 3),
      });
    },
    [],
  );

  /* ----------------------------- Reveal ----------------------------- */

  const reveal = useCallback(() => {
    if (revealedRef.current) {
      return;
    }

    revealedRef.current = true;
    const { height, width } = sizeRef.current;
    const { cells, columns, rows } = gridRef.current;
    const options = optionsRef.current;

    // What's left loosens and drops away in one go.
    if (!options.shouldReduceMotion) {
      for (let index = 0; index < cells.length; index += 1) {
        if (cells[index] < CLEARED_BELOW || Math.random() > 0.7) {
          continue;
        }

        const column = index % columns;
        const row = Math.floor(index / columns);
        spawnFlake(
          {
            x: ((column + 0.5) / columns) * width,
            y: ((row + 0.5) / rows) * height,
          },
          { x: random(-0.04, 0.04), y: random(-0.16, -0.02) },
          0.05,
        );
      }

      runFlakes();
    }

    scrapeRef.current?.stop();
    scrapeRef.current = null;

    if (options.sound) {
      playChime();
    }

    if (surfaceRef.current === document.activeElement) {
      prizeRef.current?.focus({ preventScroll: true });
    }

    setCoinVisible(false);
    setPressed(false);
    setRevealed(true);
    options.onReveal?.();
  }, [runFlakes, spawnFlake]);

  /* ---------------------------- Scratching --------------------------- */

  const stamp = useCallback(
    (context: CanvasRenderingContext2D, point: Point, radius: number) => {
      const brushes = brushesRef.current;
      const brush = brushes[Math.floor(Math.random() * brushes.length)];

      if (brush) {
        context.save();
        context.translate(point.x, point.y);
        context.rotate(Math.random() * Math.PI * 2);
        context.drawImage(brush, -radius, -radius, radius * 2, radius * 2);
        context.restore();
      }

      // Mirror the stamp into the coverage grid.
      const { height, width } = sizeRef.current;
      const grid = gridRef.current;
      const cellWidth = width / grid.columns;
      const cellHeight = height / grid.rows;
      const firstColumn = Math.max(
        0,
        Math.floor((point.x - radius) / cellWidth),
      );
      const lastColumn = Math.min(
        grid.columns - 1,
        Math.floor((point.x + radius) / cellWidth),
      );
      const firstRow = Math.max(0, Math.floor((point.y - radius) / cellHeight));
      const lastRow = Math.min(
        grid.rows - 1,
        Math.floor((point.y + radius) / cellHeight),
      );
      let removed = 0;

      for (let row = firstRow; row <= lastRow; row += 1) {
        for (let column = firstColumn; column <= lastColumn; column += 1) {
          const distance = Math.hypot(
            (column + 0.5) * cellWidth - point.x,
            (row + 0.5) * cellHeight - point.y,
          );

          if (distance > radius * 0.85) {
            continue;
          }

          const index = row * grid.columns + column;
          const before = grid.cells[index];
          const keep = distance < radius * 0.5 ? 0.3 : 0.62;
          grid.cells[index] = before * keep;
          removed += before - grid.cells[index];
        }
      }

      return removed;
    },
    [],
  );

  const scratch = useCallback(
    (from: Point, to: Point, velocity: Point) => {
      const context = coatRef.current?.getContext("2d");

      if (!context || revealedRef.current) {
        return;
      }

      const { brushSize: radius, revealAt: threshold } = optionsRef.current;
      const distance = Math.hypot(to.x - from.x, to.y - from.y);
      const steps = Math.max(1, Math.ceil(distance / (radius * 0.28)));

      context.save();
      context.globalCompositeOperation = "destination-out";
      context.globalAlpha = 0.62;

      for (let step = 1; step <= steps; step += 1) {
        const t = step / steps;
        const point = {
          x: from.x + (to.x - from.x) * t,
          y: from.y + (to.y - from.y) * t,
        };
        const removed = stamp(context, point, radius);

        // Latex that comes off becomes flakes, flicked along by the edge.
        if (!optionsRef.current.shouldReduceMotion) {
          debrisRef.current += removed;

          while (debrisRef.current > 1.1) {
            debrisRef.current -= 1.1;
            spawnFlake(
              point,
              { x: velocity.x * 0.22, y: velocity.y * 0.22 - 0.06 },
              0.07,
            );
          }
        }
      }

      context.restore();

      if (flakesRef.current.length > 0) {
        runFlakes();
      }

      const { cells } = gridRef.current;
      let cleared = 0;

      for (const cell of cells) {
        if (cell < CLEARED_BELOW) {
          cleared += 1;
        }
      }

      if (cells.length > 0 && cleared / cells.length >= threshold) {
        reveal();
      }
    },
    [reveal, runFlakes, spawnFlake, stamp],
  );

  /* ------------------------------ Sizing ----------------------------- */

  const buildBrushes = useCallback(() => {
    const { dpr } = sizeRef.current;
    brushesRef.current = Array.from({ length: 4 }, () =>
      makeBrush(optionsRef.current.brushSize, dpr),
    );
  }, []);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    const coat = coatRef.current;
    const flakes = flakeCanvasRef.current;

    if (!wrapper || !coat || !flakes) {
      return;
    }

    const resize = () => {
      const width = wrapper.clientWidth;
      const height = wrapper.clientHeight;

      if (width === 0 || height === 0) {
        return;
      }

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const context = coat.getContext("2d", { willReadFrequently: true });

      if (!context) {
        return;
      }

      const previous = sizeRef.current;
      sizeRef.current = { dpr, height, width };

      flakes.width = Math.round((width + FLAKE_MARGIN * 2) * dpr);
      flakes.height = Math.round((height + FLAKE_MARGIN * 2) * dpr);

      if (!paintedRef.current) {
        coat.width = Math.round(width * dpr);
        coat.height = Math.round(height * dpr);
        context.setTransform(dpr, 0, 0, dpr, 0, 0);
        const { palette: colours, print: words } = optionsRef.current;
        paintCoating(context, width, height, colours, words);
        const rows = Math.max(1, Math.round((GRID_COLUMNS * height) / width));
        gridRef.current = {
          cells: new Float32Array(GRID_COLUMNS * rows).fill(1),
          columns: GRID_COLUMNS,
          rows,
        };
        buildBrushes();
        paintedRef.current = true;
        setReady(true);
        return;
      }

      if (previous.width === width && previous.height === height) {
        return;
      }

      // Keep what's been scratched when the card changes size.
      const snapshot = document.createElement("canvas");
      snapshot.width = coat.width;
      snapshot.height = coat.height;
      snapshot.getContext("2d")?.drawImage(coat, 0, 0);
      coat.width = Math.round(width * dpr);
      coat.height = Math.round(height * dpr);
      context.drawImage(snapshot, 0, 0, coat.width, coat.height);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);

      if (previous.dpr !== dpr) {
        buildBrushes();
      }
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(wrapper);

    return () => {
      observer.disconnect();
      cancelAnimationFrame(frameRef.current);
      frameRef.current = 0;
      scrapeRef.current?.stop();
      scrapeRef.current = null;
    };
  }, [buildBrushes]);

  /* ----------------------------- Pointer ----------------------------- */

  const toLocal = (clientX: number, clientY: number): Point => {
    const rect = wrapperRef.current?.getBoundingClientRect();
    const { height, width } = sizeRef.current;

    if (!rect || rect.width === 0) {
      return { x: 0, y: 0 };
    }

    return {
      x: ((clientX - rect.left) / rect.width) * width,
      y: ((clientY - rect.top) / rect.height) * height,
    };
  };

  const placeCoin = (point: Point, velocityX: number) => {
    const coin = coinRef.current;

    if (!coin) {
      return;
    }

    // The coin leans into the direction it's being dragged.
    tiltRef.current += (clamp(velocityX * 26, -22, 22) - tiltRef.current) * 0.3;
    coin.style.transform = `translate3d(${point.x}px, ${point.y}px, 0) rotate(${-28 + tiltRef.current}deg)`;
  };

  const handlePointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (revealedRef.current || sweepingRef.current || event.button !== 0) {
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    const point = toLocal(event.clientX, event.clientY);
    lastPointRef.current = { ...point, time: event.timeStamp };
    pressedRef.current = true;
    setPressed(true);
    placeCoin(point, 0);

    if (optionsRef.current.sound) {
      scrapeRef.current?.stop();
      scrapeRef.current = startScrape();
    }

    scratch(point, point, { x: 0, y: 0 });
  };

  const handlePointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    if (revealedRef.current || sweepingRef.current) {
      return;
    }

    const last = lastPointRef.current;
    const point = toLocal(event.clientX, event.clientY);

    if (!last) {
      placeCoin(point, 0);
      return;
    }

    const elapsed = Math.max(1, event.timeStamp - last.time);
    const velocity = {
      x: (point.x - last.x) / elapsed,
      y: (point.y - last.y) / elapsed,
    };
    placeCoin(point, velocity.x);

    if (!pressedRef.current) {
      lastPointRef.current = { ...point, time: event.timeStamp };
      return;
    }

    // Use every sample the browser collected, so fast strokes stay smooth.
    const samples = event.nativeEvent.getCoalescedEvents?.() ?? [];
    let from: Point = last;

    for (const sample of samples.length > 0 ? samples : [event.nativeEvent]) {
      const to = toLocal(sample.clientX, sample.clientY);
      scratch(from, to, velocity);
      from = to;
    }

    scrapeRef.current?.move(Math.hypot(velocity.x, velocity.y));
    lastPointRef.current = { ...point, time: event.timeStamp };
  };

  const handlePointerUp = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    pressedRef.current = false;
    setPressed(false);
    scrapeRef.current?.stop();
    scrapeRef.current = null;

    if (event.pointerType !== "mouse") {
      lastPointRef.current = null;
    }
  };

  const handlePointerEnter = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.pointerType === "touch" || revealedRef.current) {
      return;
    }

    const point = toLocal(event.clientX, event.clientY);
    lastPointRef.current = { ...point, time: event.timeStamp };
    placeCoin(point, 0);
    setCoinVisible(true);
  };

  const handlePointerLeave = () => {
    if (!pressedRef.current && !sweepingRef.current) {
      setCoinVisible(false);
      lastPointRef.current = null;
    }
  };

  /* ---------------------------- Keyboard ----------------------------- */

  const sweepStrip = () => {
    if (sweepingRef.current || revealedRef.current) {
      return;
    }

    const { height, width } = sizeRef.current;
    const radius = optionsRef.current.brushSize;
    const strip = stripRef.current % KEYBOARD_STRIPS;
    // Second time round, the strips are offset to catch what was missed.
    const offset = stripRef.current >= KEYBOARD_STRIPS ? 0.5 : 0;
    stripRef.current += 1;

    const stripHeight = height / KEYBOARD_STRIPS;
    const centre = clamp((strip + 0.5 + offset) * stripHeight, 0, height);
    const zigs = Math.max(4, Math.round(width / (radius * 1.6)));
    const points: Point[] = Array.from({ length: zigs + 1 }, (_, index) => ({
      x: radius * 0.6 + (index / zigs) * (width - radius * 1.2),
      y: centre + (index % 2 === 0 ? -1 : 1) * stripHeight * 0.42,
    }));

    if (stripRef.current > KEYBOARD_STRIPS * 2) {
      reveal();
      return;
    }

    if (optionsRef.current.shouldReduceMotion) {
      for (let index = 1; index < points.length; index += 1) {
        scratch(points[index - 1], points[index], { x: 0, y: 0 });
      }
      return;
    }

    sweepingRef.current = true;
    setCoinVisible(true);
    setPressed(true);
    const voice = optionsRef.current.sound ? startScrape() : null;
    const duration = 560;
    const start = performance.now();
    let segment = 1;
    let previous = points[0];

    const step = (now: number) => {
      const progress = clamp((now - start) / duration, 0, 1);
      const reach = progress * (points.length - 1);

      while (segment <= reach && segment < points.length) {
        scratch(previous, points[segment], { x: 0.4, y: 0 });
        previous = points[segment];
        segment += 1;
      }

      const index = Math.min(points.length - 1, Math.floor(reach) + 1);
      const along = reach - Math.floor(reach);
      const head = {
        x: previous.x + (points[index].x - previous.x) * along,
        y: previous.y + (points[index].y - previous.y) * along,
      };
      scratch(previous, head, { x: 0.4, y: 0 });
      previous = head;
      placeCoin(head, 0.4);
      voice?.move(1.2);

      if (progress < 1 && !revealedRef.current) {
        requestAnimationFrame(step);
        return;
      }

      voice?.stop();
      sweepingRef.current = false;
      setPressed(false);
      setCoinVisible(false);
    };

    requestAnimationFrame(step);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    event.preventDefault();

    if (!event.repeat) {
      sweepStrip();
    }
  };

  return (
    <div
      className={cn("relative isolate select-none", className)}
      ref={wrapperRef}
    >
      <div
        aria-hidden={!revealed}
        className="absolute inset-0 outline-none"
        inert={!revealed}
        ref={prizeRef}
        tabIndex={-1}
      >
        {ready ? children : null}
      </div>

      <button
        aria-describedby={hintId}
        aria-label={label}
        className={cn(
          "absolute inset-0 block touch-none overflow-hidden rounded-[inherit] outline-none transition-opacity focus-visible:ring-2 focus-visible:ring-grayscale-12 focus-visible:ring-offset-2 focus-visible:ring-offset-grayscale-1",
          revealed
            ? "pointer-events-none opacity-0 duration-500 motion-reduce:duration-150"
            : "cursor-crosshair [@media(pointer:fine)]:cursor-none",
        )}
        onKeyDown={handleKeyDown}
        onLostPointerCapture={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onPointerDown={handlePointerDown}
        onPointerEnter={handlePointerEnter}
        onPointerLeave={handlePointerLeave}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        disabled={revealed}
        ref={surfaceRef}
        style={ready ? undefined : { background: palette.fallback }}
        type="button"
      >
        <canvas
          className="absolute inset-0 size-full drop-shadow-[0_0.5px_0.6px_rgb(0_0_0/0.45)]"
          ref={coatRef}
        />
      </button>

      <canvas
        className="pointer-events-none absolute z-[2]"
        ref={flakeCanvasRef}
        style={{
          height: `calc(100% + ${FLAKE_MARGIN * 2}px)`,
          left: -FLAKE_MARGIN,
          top: -FLAKE_MARGIN,
          width: `calc(100% + ${FLAKE_MARGIN * 2}px)`,
        }}
      />

      <div
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute top-0 left-0 z-[3] transition-opacity duration-150",
          coinVisible && !revealed ? "opacity-100" : "opacity-0",
        )}
        ref={coinRef}
      >
        <ScratchCoin pressed={pressed} />
      </div>

      <span aria-live="polite" className="sr-only" role="status">
        {revealed ? "Scratched clean. Your prize is showing." : ""}
      </span>
      <span className="sr-only" id={hintId}>
        Drag across the panel to scratch it off, or press Enter or Space to
        scratch a strip at a time.
      </span>
    </div>
  );
}

/** A brass coin, held with its edge on the pointer. */
function ScratchCoin({ pressed }: { pressed: boolean }) {
  return (
    <div
      className={cn(
        "-left-[17px] -top-[33px] absolute size-[34px] origin-[50%_97%] rounded-full transition-[transform,filter] duration-150 ease-out",
        pressed
          ? "translate-y-[1px] scale-[0.95] drop-shadow-[0_1px_1px_rgb(0_0_0/0.35)]"
          : "-translate-y-[3px] drop-shadow-[0_5px_5px_rgb(0_0_0/0.28)]",
      )}
      style={{
        background:
          "radial-gradient(circle at 34% 28%, #fff6cf 0 7%, #f2d278 20%, #cf9c36 56%, #93661a 100%)",
        boxShadow:
          "inset 0 0 0 1px rgb(110 72 10 / 0.6), inset 0 0 0 4px rgb(255 232 160 / 0.32), inset 0 0 0 5px rgb(120 80 14 / 0.35)",
      }}
    >
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background:
            "repeating-conic-gradient(rgb(96 62 8 / 0.5) 0 4deg, transparent 4deg 8deg)",
          mask: "radial-gradient(circle, transparent 0 calc(50% - 2.5px), black calc(50% - 2px))",
        }}
      />
      <div className="absolute inset-[9px] rounded-full border border-[#8a5f14]/40 bg-[radial-gradient(circle_at_40%_35%,rgb(255_240_190/0.5),transparent_70%)]" />
    </div>
  );
}

/**
 * A static, half-scratched panel for previews. The scratch runs on when an
 * ancestor with the `group` class is hovered.
 */
export function ScratchCardSwatch({
  className,
  coating = "silver",
}: {
  className?: string;
  coating?: ScratchCoating;
}) {
  const id = useId().replace(/:/g, "");
  const colours = COATINGS[coating];

  return (
    <svg
      aria-hidden="true"
      className={cn("block", className)}
      viewBox="0 0 120 64"
    >
      <defs>
        <linearGradient id={`${id}-sheen`} x1="0" x2="1" y1="0" y2="0.6">
          {colours.stops.map((stop, index) => (
            <stop
              key={stop}
              offset={index / (colours.stops.length - 1)}
              stopColor={stop}
            />
          ))}
        </linearGradient>
        <filter id={`${id}-grain`}>
          <feTurbulence
            baseFrequency="1.4"
            numOctaves="1"
            type="fractalNoise"
          />
          <feColorMatrix values="0 0 0 0 0.5  0 0 0 0 0.5  0 0 0 0 0.5  0 0 0 0.35 0" />
          <feComposite in2="SourceGraphic" operator="in" />
          <feBlend in="SourceGraphic" mode="overlay" />
        </filter>
        <mask id={`${id}-mask`}>
          <rect fill="white" height="64" width="120" />
          <path
            className="transition-[stroke-dashoffset] duration-700 ease-out [stroke-dashoffset:0.55] group-hover:[stroke-dashoffset:0] motion-reduce:transition-none"
            d="M12 16 L30 46 L44 14 L58 48 L72 14 L86 48 L100 16 L110 40"
            fill="none"
            pathLength={1}
            stroke="black"
            strokeDasharray="1 1"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="15"
          />
        </mask>
      </defs>
      <rect
        className="fill-grayscale-1 dark:fill-grayscale-3"
        height="64"
        rx="5"
        width="120"
      />
      <text
        className="fill-grayscale-12 font-bold font-mono"
        dominantBaseline="middle"
        fontSize="15"
        letterSpacing="1.5"
        textAnchor="middle"
        x="60"
        y="33"
      >
        WINNER
      </text>
      <rect
        fill={`url(#${id}-sheen)`}
        filter={`url(#${id}-grain)`}
        height="64"
        mask={`url(#${id}-mask)`}
        rx="5"
        width="120"
      />
    </svg>
  );
}
