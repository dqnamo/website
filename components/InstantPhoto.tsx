"use client";

import {
  ArrowsClockwiseIcon,
  CameraIcon,
} from "@phosphor-icons/react/dist/ssr";
import {
  AnimatePresence,
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
  useRef,
  useState,
} from "react";
import {
  instantPhotoScenes,
  paintScene,
} from "@/components/instant-photo-scenes";
import { cn } from "@/helpers/classname-helper";

/* -------------------------------------------------------------------------- */
/* Sizes                                                                       */
/* -------------------------------------------------------------------------- */

// The frame keeps the proportions of an 88 × 107 mm print with a square
// picture and a deep bottom margin, where the developer pod sits.
const PHOTO_WIDTH = 228;
const FRAME_SIDE = 11;
const FRAME_TOP = 12;
const IMAGE_SIZE = PHOTO_WIDTH - FRAME_SIDE * 2;
const FRAME_BOTTOM = 60;
const PHOTO_HEIGHT = FRAME_TOP + IMAGE_SIZE + FRAME_BOTTOM;

/** Where the camera's exit slot is, from the top of the component. */
const SLOT_Y = 66;
/** How far below the slot the print lands. */
const DROP = 26;
const PHOTO_TOP = SLOT_Y + DROP;
const STAGE_HEIGHT = PHOTO_TOP + PHOTO_HEIGHT + 30;

const PACK_SIZE = 8;
/** Pixels a hand has to swing back for it to count as a shake. */
const SHAKE_SWING = 28;
const FEED_SECONDS = 1.15;

/* -------------------------------------------------------------------------- */
/* Chemistry                                                                   */
/* -------------------------------------------------------------------------- */

/** The film develops on a coarse grid that's smoothed when it's drawn. */
const GRID = 36;
/** A thumb's width, as a share of the picture. */
const THUMB_RADIUS = 0.11;
/** How much faster fully warmed film develops. */
const WARM_BOOST = 3.2;
/** Seconds for warmth to fade once the thumb lifts. */
const COOLING = 2.2;
/** The reagent spreads up from the pod as the print leaves the rollers. */
const SPREAD_SECONDS = 0.8;

const smoothstep = (from: number, to: number, value: number) => {
  const t = Math.min(1, Math.max(0, (value - from) / (to - from)));
  return t * t * (3 - 2 * t);
};

const OPACIFIER_DARK = [34, 54, 60] as const;
const OPACIFIER_PALE = [168, 180, 172] as const;

type Film = {
  delay: Float32Array;
  dev: Float32Array;
  done: boolean;
  dye: ImageData;
  dyeCanvas: HTMLCanvasElement;
  elapsed: number;
  opacifier: ImageData;
  opacifierCanvas: HTMLCanvasElement;
  rate: Float32Array;
  running: boolean;
  scene: HTMLCanvasElement;
  warmth: Float32Array;
};

function createFilm(pixels: number): Film | null {
  const scene = document.createElement("canvas");
  const dyeCanvas = document.createElement("canvas");
  const opacifierCanvas = document.createElement("canvas");
  scene.width = pixels;
  scene.height = pixels;
  dyeCanvas.width = GRID;
  dyeCanvas.height = GRID;
  opacifierCanvas.width = GRID;
  opacifierCanvas.height = GRID;

  const dyeContext = dyeCanvas.getContext("2d");
  const opacifierContext = opacifierCanvas.getContext("2d");

  if (!dyeContext || !opacifierContext) {
    return null;
  }

  return {
    delay: new Float32Array(GRID * GRID),
    dev: new Float32Array(GRID * GRID),
    done: false,
    dye: dyeContext.createImageData(GRID, GRID),
    dyeCanvas,
    elapsed: 0,
    opacifier: opacifierContext.createImageData(GRID, GRID),
    opacifierCanvas,
    rate: new Float32Array(GRID * GRID),
    running: false,
    scene,
    warmth: new Float32Array(GRID * GRID),
  };
}

/** Reset the chemistry for a fresh print, with its own slight unevenness. */
function loadFilm(film: Film, seed: number) {
  const phase = [seed * 1.7, seed * 2.3, seed * 0.9, seed * 3.1];

  for (let row = 0; row < GRID; row += 1) {
    for (let column = 0; column < GRID; column += 1) {
      const index = row * GRID + column;
      const x = (column + 0.5) / GRID;
      const y = (row + 0.5) / GRID;
      film.dev[index] = 0;
      film.warmth[index] = 0;
      film.delay[index] = (1 - y) * SPREAD_SECONDS;
      film.rate[index] =
        1 +
        0.07 * Math.sin(x * 5.1 + phase[0]) * Math.cos(y * 4.3 + phase[1]) +
        0.04 * Math.sin(x * 11.3 + y * 7.7 + phase[2]) +
        0.03 * Math.cos(y * 13.1 + phase[3]);
    }
  }

  film.done = false;
  film.elapsed = 0;
  film.running = false;
}

/**
 * Integral film develops in layers. The cyan dye arrives first, so a young
 * print looks cold and blue; magenta follows and the yellow comes in last.
 * Over the top, the dark opacifier that shields the picture from light
 * slowly clears.
 */
function drawFilm(film: Film, canvas: HTMLCanvasElement) {
  const context = canvas.getContext("2d");
  const dyeContext = film.dyeCanvas.getContext("2d");
  const opacifierContext = film.opacifierCanvas.getContext("2d");

  if (!context || !dyeContext || !opacifierContext) {
    return;
  }

  const dye = film.dye.data;
  const opacifier = film.opacifier.data;

  for (let index = 0; index < film.dev.length; index += 1) {
    const t = film.dev[index];
    const offset = index * 4;
    // Screening the picture with (1 − k) lays each dye down by k.
    dye[offset] = 255 * (1 - smoothstep(0.06, 0.6, t));
    dye[offset + 1] = 255 * (1 - smoothstep(0.14, 0.8, t));
    dye[offset + 2] = 255 * (1 - smoothstep(0.26, 1, t));
    dye[offset + 3] = 255;

    const clearing = smoothstep(0, 0.32, t);
    opacifier[offset] =
      OPACIFIER_DARK[0] + (OPACIFIER_PALE[0] - OPACIFIER_DARK[0]) * clearing;
    opacifier[offset + 1] =
      OPACIFIER_DARK[1] + (OPACIFIER_PALE[1] - OPACIFIER_DARK[1]) * clearing;
    opacifier[offset + 2] =
      OPACIFIER_DARK[2] + (OPACIFIER_PALE[2] - OPACIFIER_DARK[2]) * clearing;
    opacifier[offset + 3] = 255 * (1 - smoothstep(0.02, 0.62, t));
  }

  dyeContext.putImageData(film.dye, 0, 0);
  opacifierContext.putImageData(film.opacifier, 0, 0);

  const size = canvas.width;
  context.globalCompositeOperation = "source-over";
  context.drawImage(film.scene, 0, 0, size, size);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.globalCompositeOperation = "screen";
  context.drawImage(film.dyeCanvas, 0, 0, size, size);
  context.globalCompositeOperation = "source-over";
  context.drawImage(film.opacifierCanvas, 0, 0, size, size);
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

function playNoise(
  context: AudioContext,
  {
    at,
    duration,
    frequency,
    gain,
    q = 1,
    sustain = false,
    type,
  }: {
    at: number;
    duration: number;
    frequency: number;
    gain: number;
    q?: number;
    sustain?: boolean;
    type: BiquadFilterType;
  },
) {
  const source = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const level = context.createGain();

  source.buffer = getNoise(context);
  filter.type = type;
  filter.frequency.value = frequency;
  filter.Q.value = q;
  level.gain.setValueAtTime(0, at);
  level.gain.linearRampToValueAtTime(gain, at + (sustain ? 0.05 : 0.002));

  if (sustain) {
    level.gain.setValueAtTime(gain, at + duration - 0.06);
  }

  level.gain.exponentialRampToValueAtTime(0.0001, at + duration);
  source.connect(filter).connect(level).connect(context.destination);
  source.start(at, Math.random());
  source.stop(at + duration + 0.02);
}

/** A leaf shutter: a bright snap open, then a duller clack shut. */
function playShutter() {
  const context = getAudioContext();

  if (!context) {
    return;
  }

  const now = context.currentTime;
  playNoise(context, {
    at: now,
    duration: 0.03,
    frequency: 3200,
    gain: 0.5,
    q: 1.2,
    type: "bandpass",
  });
  playNoise(context, {
    at: now + 0.075,
    duration: 0.06,
    frequency: 1400,
    gain: 0.5,
    q: 0.9,
    type: "bandpass",
  });

  const body = context.createOscillator();
  const level = context.createGain();
  body.frequency.setValueAtTime(180, now + 0.075);
  body.frequency.exponentialRampToValueAtTime(70, now + 0.17);
  level.gain.setValueAtTime(0.0001, now + 0.075);
  level.gain.exponentialRampToValueAtTime(0.22, now + 0.08);
  level.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
  body.connect(level).connect(context.destination);
  body.start(now + 0.075);
  body.stop(now + 0.2);
}

/** The little motor that drives the print out through the rollers. */
function playMotor(delay: number, duration: number) {
  const context = getAudioContext();

  if (!context) {
    return;
  }

  const start = context.currentTime + delay;
  const end = start + duration;
  const filter = context.createBiquadFilter();
  const ripple = context.createGain();
  const level = context.createGain();
  const lfo = context.createOscillator();
  const lfoDepth = context.createGain();

  filter.type = "lowpass";
  filter.frequency.value = 900;
  filter.Q.value = 3;
  ripple.gain.value = 0.75;
  lfo.frequency.value = 34;
  lfoDepth.gain.value = 0.25;
  lfo.connect(lfoDepth).connect(ripple.gain);

  level.gain.setValueAtTime(0, start);
  level.gain.linearRampToValueAtTime(0.07, start + 0.04);
  level.gain.setValueAtTime(0.07, end - 0.05);
  level.gain.linearRampToValueAtTime(0, end + 0.08);

  for (const [type, multiple] of [
    ["sawtooth", 1],
    ["square", 2.02],
  ] as const) {
    const motor = context.createOscillator();
    motor.type = type;
    motor.frequency.setValueAtTime(60 * multiple, start);
    motor.frequency.exponentialRampToValueAtTime(118 * multiple, start + 0.12);
    motor.frequency.setValueAtTime(118 * multiple, end - 0.06);
    motor.frequency.exponentialRampToValueAtTime(70 * multiple, end + 0.08);
    motor.connect(filter);
    motor.start(start);
    motor.stop(end + 0.1);
  }

  filter.connect(ripple).connect(level).connect(context.destination);
  lfo.start(start);
  lfo.stop(end + 0.1);

  // The print scuffing out between the rollers.
  playNoise(context, {
    at: start + 0.05,
    duration,
    frequency: 2600,
    gain: 0.03,
    q: 0.7,
    sustain: true,
    type: "bandpass",
  });
}

/** A print landing on the table. */
function playTap(gain = 0.2) {
  const context = getAudioContext();

  if (!context) {
    return;
  }

  playNoise(context, {
    at: context.currentTime,
    duration: 0.05,
    frequency: 1800,
    gain,
    type: "lowpass",
  });
}

/** Opening the film door and seating a fresh pack. */
function playPack() {
  const context = getAudioContext();

  if (!context) {
    return;
  }

  const now = context.currentTime;
  playNoise(context, {
    at: now,
    duration: 0.04,
    frequency: 2400,
    gain: 0.3,
    type: "bandpass",
  });
  playNoise(context, {
    at: now + 0.16,
    duration: 0.12,
    frequency: 600,
    gain: 0.6,
    type: "lowpass",
  });
}

/* -------------------------------------------------------------------------- */
/* Fingerprints                                                                */
/* -------------------------------------------------------------------------- */

type Print = { id: number; x: number; y: number };

const RIDGES = Array.from({ length: 9 }, (_, ridge) => ridge + 1);

/** The whorl a warm thumb leaves in the gloss. */
function Fingerprint({ rotation }: { rotation: number }) {
  return (
    <svg
      aria-hidden="true"
      className="size-full"
      style={{ transform: `rotate(${rotation}deg)` }}
      viewBox="-24 -28 48 56"
    >
      <g fill="none" stroke="white" strokeLinecap="round" strokeWidth="0.9">
        {RIDGES.map((ridge) => (
          <path
            d={`M ${-ridge * 2.3} ${ridge * 0.6} a ${ridge * 2.3} ${ridge * 2.85} 0 1 1 ${ridge * 4.6} 0${
              ridge > 5
                ? ""
                : ` a ${ridge * 2.3} ${ridge * 1.6} 0 0 1 ${-ridge * 3.6} ${ridge * 0.4}`
            }`}
            key={ridge}
          />
        ))}
      </g>
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/* Camera                                                                      */
/* -------------------------------------------------------------------------- */

function CameraFront({
  flashKey,
  reduceMotion,
  shotsLeft,
}: {
  flashKey: number;
  reduceMotion: boolean;
  shotsLeft: number;
}) {
  return (
    <div
      aria-hidden="true"
      className="absolute top-0 left-1/2 z-10 h-[78px] w-[296px] -translate-x-1/2"
    >
      <div className="absolute inset-0 rounded-b-[26px] bg-[linear-gradient(180deg,#ece6d9,#dad2c1)] shadow-[inset_0_-2px_0_rgb(0_0_0_/_8%),inset_0_1px_0_rgb(255_255_255_/_70%),0_2px_4px_rgb(0_0_0_/_12%),0_14px_28px_-10px_rgb(0_0_0_/_30%)] dark:bg-[linear-gradient(180deg,#34322f,#272523)] dark:shadow-[inset_0_-2px_0_rgb(0_0_0_/_40%),inset_0_1px_0_rgb(255_255_255_/_6%),0_2px_4px_rgb(0_0_0_/_40%),0_14px_28px_-10px_rgb(0_0_0_/_70%)]" />

      <span className="absolute top-[24px] left-[24px] font-mono font-semibold text-[#ada38d] text-[8px] uppercase tracking-[0.24em] [text-shadow:0_1px_0_rgb(255_255_255_/_75%)] dark:text-[#5a5650] dark:[text-shadow:0_1px_0_rgb(255_255_255_/_6%)]">
        DQ-1 Instant
      </span>

      <div className="absolute top-[17px] right-[24px] flex items-center gap-1.5">
        <span className="font-mono font-semibold text-[#ada38d] text-[6px] uppercase tracking-[0.2em] dark:text-[#5a5650]">
          Shots
        </span>
        <span className="grid h-[17px] w-[20px] place-items-center rounded-[4px] bg-[#16110e] font-mono text-[11px] tabular-nums shadow-[inset_0_1px_3px_rgb(0_0_0_/_80%),0_1px_0_rgb(255_255_255_/_60%)] dark:shadow-[inset_0_1px_3px_rgb(0_0_0_/_80%),0_1px_0_rgb(255_255_255_/_6%)]">
          <span
            className={cn(
              "leading-none [text-shadow:0_0_4px_rgb(255_120_40_/_80%)]",
              shotsLeft === 0 ? "text-[#5a2a14]" : "text-[#ff8a3d]",
            )}
          >
            {shotsLeft}
          </span>
        </span>
      </div>

      {/* The exit slot, with a glint of the rollers inside. */}
      <div
        className="absolute right-[22px] left-[22px] h-[8px] rounded-full bg-[#0d0c0b] shadow-[inset_0_2px_3px_rgb(0_0_0_/_90%),0_1px_0_rgb(255_255_255_/_70%)] dark:shadow-[inset_0_2px_3px_rgb(0_0_0_/_90%),0_1px_0_rgb(255_255_255_/_8%)]"
        style={{ top: SLOT_Y - 4 }}
      >
        <span className="absolute inset-x-3 top-[3px] h-px rounded-full bg-white/15" />
      </div>

      {/* The flash fires out of the front, so only its spill shows. */}
      {flashKey > 0 && !reduceMotion ? (
        <motion.span
          animate={{ opacity: [0, 1, 0] }}
          className="absolute -top-6 left-1/2 h-[40px] w-[220px] -translate-x-1/2 rounded-full bg-white blur-[18px]"
          initial={{ opacity: 0 }}
          key={flashKey}
          transition={{ duration: 0.45, times: [0, 0.12, 1] }}
        />
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Instant photo                                                               */
/* -------------------------------------------------------------------------- */

type Phase = "ejecting" | "developing" | "developed" | "leaving";

export type InstantPhotoProps = {
  className?: string;
  /** Seconds for an untouched print to develop. Real film takes minutes. */
  developSeconds?: number;
  /** Play the shutter, motor and pack sounds. */
  sound?: boolean;
};

const formatTime = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;

const restTilts = [-2.6, 1.8, -1.2, 2.4, -3, 0.9];

export function InstantPhoto({
  className,
  developSeconds = 18,
  sound = true,
}: InstantPhotoProps) {
  const shouldReduceMotion = useReducedMotion() ?? false;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLSpanElement>(null);
  const filmRef = useRef<Film | null>(null);
  const printRefs = useRef(new Map<number, HTMLSpanElement>());
  const printStrength = useRef(new Map<number, number>());
  const soundRef = useRef(sound);
  const secondsRef = useRef(developSeconds);
  const reducedRef = useRef(shouldReduceMotion);
  const runRef = useRef(0);
  const shotRef = useRef(0);
  const tiltRef = useRef(restTilts[0]);
  const shownRef = useRef({ progress: -1, seconds: -1 });
  const holdRef = useRef<{
    activePrint: number | null;
    grip: { x: number; y: number } | null;
    direction: number;
    extreme: number;
    lastT: number;
    lastX: number;
    pointerId: number | null;
    reversals: number[];
    sign: number;
    startX: number;
    startY: number;
    vx: number;
  } | null>(null);
  const tipAtRef = useRef(Number.NEGATIVE_INFINITY);

  const [phase, setPhase] = useState<Phase>("ejecting");
  const [sceneIndex, setSceneIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const [shotsLeft, setShotsLeft] = useState(PACK_SIZE - 1);
  const [prints, setPrints] = useState<Print[]>([]);
  const [held, setHeld] = useState(false);
  const [tip, setTip] = useState(false);
  const [flashKey, setFlashKey] = useState(0);
  const [announcement, setAnnouncement] = useState("");

  const x = useMotionValue(0);
  const y = useMotionValue(-(DROP + PHOTO_HEIGHT));
  const rotate = useMotionValue(0);
  const lift = useMotionValue(0);
  const opacity = useMotionValue(1);
  const scale = useTransform(lift, (value) => 1 + value * 0.035);
  const shadow = useTransform(
    lift,
    (value) =>
      `0 0 0 0.5px rgb(0 0 0 / 12%), 0 ${1 + value * 10}px ${2 + value * 10}px rgb(0 0 0 / ${12 - value * 3}%), 0 ${6 + value * 22}px ${16 + value * 30}px rgb(0 0 0 / ${16 - value * 2}%)`,
  );
  // Hide whatever is still inside the camera while the print feeds out.
  const clipPath = useTransform(y, (value) => {
    const hidden = Math.max(0, -DROP - value);
    return `polygon(-80px ${hidden}px, calc(100% + 80px) ${hidden}px, calc(100% + 80px) calc(100% + 80px), -80px calc(100% + 80px))`;
  });
  const gloss = useTransform(
    [rotate, x],
    ([angle, offset]: number[]) => `${40 + angle * 4 + offset * 0.08}% 0%`,
  );

  soundRef.current = sound;
  secondsRef.current = developSeconds;
  reducedRef.current = shouldReduceMotion;

  /* ---------------------------------------------------------------------- */
  /* Loading and ejecting prints                                             */
  /* ---------------------------------------------------------------------- */

  const load = useCallback((shot: number) => {
    const film = filmRef.current;
    const canvas = canvasRef.current;

    if (!film || !canvas) {
      return;
    }

    const scene = instantPhotoScenes[shot % instantPhotoScenes.length];
    paintScene(film.scene, scene, 1000 + shot * 97);
    loadFilm(film, shot + 1);
    drawFilm(film, canvas);
    shotRef.current = shot;
    tiltRef.current = restTilts[shot % restTilts.length];
    printStrength.current.clear();
    shownRef.current = { progress: -1, seconds: -1 };
    setSceneIndex(shot % instantPhotoScenes.length);
    setPrints([]);
    setProgress(0);
    setSeconds(0);
  }, []);

  const eject = useCallback(
    async (withSound: boolean) => {
      const film = filmRef.current;
      const run = ++runRef.current;

      if (!film) {
        return;
      }

      setPhase("ejecting");
      x.set(0);
      rotate.set(0);
      film.running = true;

      if (reducedRef.current) {
        y.set(0);
        rotate.set(tiltRef.current);
        opacity.set(0);
        await animate(opacity, 1, { duration: 0.3 });
      } else {
        opacity.set(1);
        y.set(-(DROP + PHOTO_HEIGHT));

        if (withSound) {
          playMotor(0, FEED_SECONDS);
        }

        await animate(y, -DROP, {
          duration: FEED_SECONDS,
          ease: [0.3, 0, 0.75, 1],
        });

        if (run !== runRef.current) {
          return;
        }

        if (withSound) {
          window.setTimeout(() => playTap(0.16), 110);
        }

        animate(rotate, tiltRef.current, {
          damping: 12,
          stiffness: 180,
          type: "spring",
        });
        await animate(y, 0, {
          damping: 16,
          stiffness: 420,
          type: "spring",
          velocity: 260,
        });
      }

      if (run !== runRef.current) {
        return;
      }

      setPhase(film.done ? "developed" : "developing");
      setAnnouncement(
        `Photo ejected: ${instantPhotoScenes[shotRef.current % instantPhotoScenes.length].title}. Developing.`,
      );
    },
    [opacity, rotate, x, y],
  );

  // Load the first print on mount and feed it out silently.
  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return;
    }

    const pixels = Math.round(
      IMAGE_SIZE * Math.min(2, window.devicePixelRatio || 1),
    );
    canvas.width = pixels;
    canvas.height = pixels;
    filmRef.current = createFilm(pixels);
    load(0);
    void eject(false);

    return () => {
      runRef.current += 1;
    };
  }, [eject, load]);

  /* ---------------------------------------------------------------------- */
  /* The chemistry loop                                                      */
  /* ---------------------------------------------------------------------- */

  useEffect(() => {
    let frame = 0;
    let last = performance.now();

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      frame = requestAnimationFrame(tick);

      const film = filmRef.current;
      const canvas = canvasRef.current;
      const hold = holdRef.current;

      if (!film || !canvas || !film.running) {
        return;
      }

      film.elapsed += dt;
      const grip = hold?.grip ?? null;
      const spread = 2 * THUMB_RADIUS * THUMB_RADIUS;
      let changed = false;
      let total = 0;
      let least = 1;

      for (let row = 0; row < GRID; row += 1) {
        for (let column = 0; column < GRID; column += 1) {
          const index = row * GRID + column;
          let warmth = film.warmth[index];

          if (grip) {
            const dx = (column + 0.5) / GRID - grip.x;
            const dy = (row + 0.5) / GRID - grip.y;
            warmth += dt * 1.6 * Math.exp(-(dx * dx + dy * dy) / spread);
          }

          warmth = Math.min(1, warmth - (warmth * dt) / COOLING);
          film.warmth[index] = warmth;

          if (film.elapsed > film.delay[index] && film.dev[index] < 1) {
            film.dev[index] = Math.min(
              1,
              film.dev[index] +
                (dt / secondsRef.current) *
                  film.rate[index] *
                  (1 + WARM_BOOST * warmth),
            );
            changed = true;
          }

          total += film.dev[index];
          least = Math.min(least, film.dev[index]);
        }
      }

      if (changed) {
        drawFilm(film, canvas);
      }

      // Thumbprints show while warm, then fade to a faint smudge.
      for (const [id, element] of printRefs.current) {
        const pressing = hold?.activePrint === id;
        const current = printStrength.current.get(id) ?? 0;
        const next = pressing
          ? Math.min(1, current + dt * 1.4)
          : current +
            (Math.min(current, 0.2) - current) * Math.min(1, dt / 1.2);
        printStrength.current.set(id, next);
        element.style.opacity = String(next * 0.3);
      }

      const percent = Math.floor((total / (GRID * GRID)) * 100);
      const shown = shownRef.current;

      if (!film.done && percent !== shown.progress) {
        shown.progress = percent;
        setProgress(percent);
      }

      if (!film.done && Math.floor(film.elapsed) !== shown.seconds) {
        shown.seconds = Math.floor(film.elapsed);
        setSeconds(shown.seconds);
      }

      if (!film.done && least >= 1) {
        film.done = true;
        setProgress(100);
        setSeconds(film.elapsed);
        setPhase((current) =>
          current === "developing" ? "developed" : current,
        );
        setAnnouncement(
          `Developed in ${Math.round(film.elapsed)} seconds: ${instantPhotoScenes[shotRef.current % instantPhotoScenes.length].alt}.`,
        );
      }

      if (
        film.done &&
        !hold &&
        [...printStrength.current.values()].every((value) => value <= 0.21)
      ) {
        film.running = false;
      }
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  /* ---------------------------------------------------------------------- */
  /* Holding the print                                                       */
  /* ---------------------------------------------------------------------- */

  const canHold = phase === "developing" || phase === "developed";

  const pressAt = useCallback(
    (grip: { x: number; y: number } | null) => {
      const hold = holdRef.current;
      const film = filmRef.current;

      if (!hold || !film) {
        return;
      }

      hold.grip = grip;
      film.running = true;
      setHeld(true);
      animate(lift, 1, { damping: 22, stiffness: 420, type: "spring" });

      if (!grip) {
        return;
      }

      // Pressing near an earlier print warms that one up again.
      setPrints((current) => {
        const near = current.find(
          (print) => Math.hypot(print.x - grip.x, print.y - grip.y) < 0.08,
        );

        if (near) {
          hold.activePrint = near.id;
          return current;
        }

        const id = Date.now();
        hold.activePrint = id;
        return [...current.slice(-2), { id, x: grip.x, y: grip.y }];
      });
    },
    [lift],
  );

  const release = useCallback(() => {
    if (!holdRef.current) {
      return;
    }

    holdRef.current = null;
    setHeld(false);
    animate(lift, 0, { damping: 20, stiffness: 300, type: "spring" });
    animate(x, 0, { damping: 22, stiffness: 170, type: "spring" });
    animate(y, 0, { damping: 22, stiffness: 170, type: "spring" });
    animate(rotate, tiltRef.current, {
      damping: 10,
      stiffness: 120,
      type: "spring",
    });
  }, [lift, rotate, x, y]);

  const showTip = useCallback(() => {
    const now = performance.now();

    if (now - tipAtRef.current < 6000) {
      return;
    }

    tipAtRef.current = now;
    setTip(true);
    setAnnouncement("Shaking won't help. Warmth will.");
    window.setTimeout(() => setTip(false), 2800);
  }, []);

  const handlePointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (!canHold || event.button !== 0) {
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    const frame = event.currentTarget.getBoundingClientRect();
    const image = imageRef.current?.getBoundingClientRect();
    let grip: { x: number; y: number } | null = null;

    if (image) {
      const gx = (event.clientX - image.left) / image.width;
      const gy = (event.clientY - image.top) / image.height;
      if (gx >= 0 && gx <= 1 && gy >= 0 && gy <= 1) {
        grip = { x: gx, y: gy };
      }
    }

    holdRef.current = {
      activePrint: null,
      grip: null,
      direction: 0,
      extreme: event.clientX,
      lastT: event.timeStamp,
      lastX: event.clientX,
      pointerId: event.pointerId,
      reversals: [],
      // Held above its middle, the print hangs and swings one way;
      // held below, it tips the other.
      sign: event.clientY < frame.top + frame.height / 2 ? 1 : -1,
      startX: event.clientX - x.get(),
      startY: event.clientY - y.get(),
      vx: 0,
    };
    pressAt(grip);
  };

  const handlePointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    const hold = holdRef.current;

    if (!hold || hold.pointerId !== event.pointerId) {
      return;
    }

    const elapsed = Math.max(1, event.timeStamp - hold.lastT);
    const velocity = (event.clientX - hold.lastX) / elapsed;
    hold.vx = hold.vx * 0.6 + velocity * 0.4;
    hold.lastX = event.clientX;
    hold.lastT = event.timeStamp;

    // Count quick back-and-forths: that's someone shaking it. A swing only
    // counts once it has come back a little way from its furthest point.
    const swing = event.clientX - hold.extreme;
    if (hold.direction === 0 || Math.sign(swing) === hold.direction) {
      if (hold.direction === 0 && Math.abs(swing) > SHAKE_SWING) {
        hold.direction = Math.sign(swing);
      }
      if (hold.direction !== 0) {
        hold.extreme = event.clientX;
      }
    } else if (Math.abs(swing) > SHAKE_SWING) {
      hold.direction = -hold.direction;
      hold.extreme = event.clientX;
      hold.reversals = [
        ...hold.reversals.filter((at) => event.timeStamp - at < 1200),
        event.timeStamp,
      ];
      if (hold.reversals.length >= 3) {
        showTip();
      }
    }

    if (reducedRef.current) {
      return;
    }

    const rubber = (distance: number, limit: number) =>
      (limit * distance) / (limit + Math.abs(distance));
    const follow = {
      damping: 30,
      mass: 0.6,
      stiffness: 600,
      type: "spring",
    } as const;

    animate(x, rubber(event.clientX - hold.startX, 220), follow);
    animate(y, Math.max(-14, rubber(event.clientY - hold.startY, 120)), follow);
    animate(
      rotate,
      tiltRef.current + Math.max(-16, Math.min(16, hold.vx * 9 * hold.sign)),
      { damping: 9, stiffness: 160, type: "spring" },
    );
  };

  const handlePointerUp = (event: PointerEvent<HTMLButtonElement>) => {
    if (holdRef.current?.pointerId !== event.pointerId) {
      return;
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    release();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== " " && event.key !== "Enter") {
      return;
    }

    event.preventDefault();

    if (event.repeat || holdRef.current || !canHold) {
      return;
    }

    holdRef.current = {
      activePrint: null,
      grip: null,
      direction: 0,
      extreme: 0,
      lastT: 0,
      lastX: 0,
      pointerId: null,
      reversals: [],
      sign: 1,
      startX: 0,
      startY: 0,
      vx: 0,
    };
    pressAt({ x: 0.5, y: 0.5 });
  };

  const handleKeyUp = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      release();
    }
  };

  /* ---------------------------------------------------------------------- */
  /* Taking another                                                          */
  /* ---------------------------------------------------------------------- */

  const takeAnother = async () => {
    if (phase === "ejecting" || phase === "leaving") {
      return;
    }

    if (shotsLeft === 0) {
      if (soundRef.current) {
        playPack();
      }
      setShotsLeft(PACK_SIZE);
      setAnnouncement(`New film pack loaded. ${PACK_SIZE} shots.`);
      return;
    }

    release();
    const run = ++runRef.current;
    setPhase("leaving");
    setShotsLeft((current) => current - 1);
    setFlashKey((current) => current + 1);

    if (soundRef.current) {
      playShutter();
      playMotor(0.5, FEED_SECONDS);
    }

    // The last print is slid aside to make room on the table.
    if (reducedRef.current) {
      await animate(opacity, 0, { duration: 0.2 });
    } else {
      await Promise.all([
        animate(x, 360, { duration: 0.45, ease: [0.5, 0, 0.9, 0.6] }),
        animate(y, 30, { duration: 0.45, ease: "easeIn" }),
        animate(rotate, tiltRef.current + 18, { duration: 0.45 }),
        animate(opacity, 0, { delay: 0.2, duration: 0.25 }),
      ]);
    }

    if (run !== runRef.current) {
      return;
    }

    load(shotRef.current + 1);
    // The motor sound has already started; eject quietly in step with it.
    await eject(false);
  };

  const scene = instantPhotoScenes[sceneIndex];
  const status =
    phase === "ejecting" || phase === "leaving"
      ? "Ejecting…"
      : phase === "developed"
        ? `Developed in ${formatTime(seconds)}`
        : `Developing · ${progress}%`;
  const describedProgress = Math.floor(progress / 10) * 10;

  return (
    <div className={cn("relative w-full max-w-[340px] select-none", className)}>
      <div className="relative w-full" style={{ height: STAGE_HEIGHT }}>
        <CameraFront
          flashKey={flashKey}
          reduceMotion={shouldReduceMotion}
          shotsLeft={shotsLeft}
        />

        <motion.button
          aria-label={`Instant photo of ${scene.title.toLowerCase()}, ${
            phase === "developed"
              ? "developed"
              : `${describedProgress}% developed`
          }. Hold Space to warm it with your thumb.`}
          className={cn(
            "absolute left-1/2 block touch-none rounded-[3px] bg-[linear-gradient(180deg,#fbfaf6,#f0ede5)] outline-none focus-visible:ring-2 focus-visible:ring-grayscale-8 focus-visible:ring-offset-4 focus-visible:ring-offset-grayscale-1 dark:focus-visible:ring-offset-grayscale-2",
            canHold
              ? held
                ? "cursor-grabbing"
                : "cursor-grab"
              : "cursor-default",
          )}
          onBlur={release}
          onKeyDown={handleKeyDown}
          onKeyUp={handleKeyUp}
          onLostPointerCapture={release}
          onPointerCancel={handlePointerUp}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          style={{
            boxShadow: shadow,
            clipPath,
            height: PHOTO_HEIGHT,
            marginLeft: -PHOTO_WIDTH / 2,
            opacity,
            rotate,
            scale,
            top: PHOTO_TOP,
            width: PHOTO_WIDTH,
            x,
            y,
          }}
          type="button"
        >
          <span
            className="absolute block overflow-hidden rounded-[1px] bg-[#22363c]"
            ref={imageRef}
            style={{
              height: IMAGE_SIZE,
              left: FRAME_SIDE,
              top: FRAME_TOP,
              width: IMAGE_SIZE,
            }}
          >
            <canvas
              className="absolute inset-0 block size-full"
              ref={canvasRef}
            />

            {prints.map((print) => (
              <span
                aria-hidden="true"
                className="pointer-events-none absolute block size-[46px] -translate-x-1/2 -translate-y-1/2 opacity-0 mix-blend-overlay"
                key={print.id}
                ref={(element) => {
                  if (element) {
                    printRefs.current.set(print.id, element);
                  } else {
                    printRefs.current.delete(print.id);
                  }
                }}
                style={{ left: `${print.x * 100}%`, top: `${print.y * 100}%` }}
              >
                <Fingerprint rotation={(print.id % 50) - 25} />
              </span>
            ))}

            {/* The gloss, which slides as the print tilts. */}
            <motion.span
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 block bg-[linear-gradient(112deg,transparent_32%,rgb(255_255_255_/_16%)_46%,rgb(255_255_255_/_4%)_54%,transparent_64%)] bg-size-[260%_100%]"
              style={{ backgroundPosition: gloss }}
            />
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 block shadow-[inset_0_0_0_1px_rgb(0_0_0_/_14%),inset_0_1px_2px_rgb(0_0_0_/_30%)]"
            />
          </span>

          {/* The slight ridge where the spent pod sits in the margin. */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-[6px] bottom-[6px] block h-[14px] rounded-[2px] bg-[linear-gradient(180deg,rgb(0_0_0_/_3%),transparent_40%,rgb(255_255_255_/_60%))]"
          />
        </motion.button>

        <AnimatePresence>
          {tip ? (
            <motion.p
              animate={{ opacity: 1, y: 0 }}
              aria-hidden="true"
              className="pointer-events-none absolute left-1/2 z-20 -translate-x-1/2 whitespace-nowrap rounded-full bg-grayscale-12 px-3 py-1.5 font-medium text-[11px] text-grayscale-1 shadow-lg"
              exit={{ opacity: 0, y: 4 }}
              initial={{ opacity: 0, y: 6 }}
              style={{ top: PHOTO_TOP + PHOTO_HEIGHT - 18 }}
              transition={{ duration: 0.2 }}
            >
              Shaking won’t help. Warmth will.
            </motion.p>
          ) : null}
        </AnimatePresence>
      </div>

      <div className="mt-2 flex items-center justify-between gap-3 px-2">
        <p className="font-mono text-[11px] text-grayscale-10 tabular-nums">
          {status}
        </p>
        <button
          className="flex h-8 items-center gap-1.5 rounded-lg border border-grayscale-4 bg-grayscale-1 px-3 font-medium text-grayscale-12 text-xs transition-colors hover:bg-grayscale-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-grayscale-7 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-grayscale-3 dark:hover:bg-grayscale-4"
          disabled={phase === "ejecting" || phase === "leaving"}
          onClick={takeAnother}
          type="button"
        >
          {shotsLeft === 0 ? (
            <ArrowsClockwiseIcon aria-hidden="true" size={14} weight="bold" />
          ) : (
            <CameraIcon aria-hidden="true" size={14} weight="bold" />
          )}
          {shotsLeft === 0 ? "Load new film" : "Take another"}
        </button>
      </div>

      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Preview                                                                     */
/* -------------------------------------------------------------------------- */

/** A small print for cards: murky until hovered, then it develops. */
export function InstantPhotoMini({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn("relative flex flex-col items-center", className)}
    >
      <div className="relative z-[1] h-[10px] w-[92px] rounded-b-[6px] bg-[linear-gradient(180deg,#ece6d9,#dad2c1)] shadow-[0_2px_4px_rgb(0_0_0_/_14%)] dark:bg-[linear-gradient(180deg,#34322f,#272523)]">
        <span className="absolute inset-x-[8px] bottom-[2px] h-[3px] rounded-full bg-[#0d0c0b]" />
      </div>
      <div className="-mt-[2px] w-[64px] -rotate-2 rounded-[2px] bg-[linear-gradient(180deg,#fbfaf6,#f0ede5)] p-[3px] pb-[16px] shadow-[0_0_0_0.5px_rgb(0_0_0_/_12%),0_4px_10px_rgb(0_0_0_/_14%)] transition-transform duration-700 ease-out group-hover:translate-y-1 group-hover:rotate-1 motion-reduce:transition-none">
        <div className="relative aspect-square overflow-hidden rounded-[1px]">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_64%_52%,#fff2d2_0_6%,rgb(255_210_150_/_60%)_9%,transparent_32%),linear-gradient(180deg,#2c3768_0%,#775c93_26%,#e2897a_46%,#f8c788_57%,#94728f_57%,#4c4567_72%,#1f1f37_100%)] brightness-150 hue-rotate-[160deg] saturate-[0.35] transition-[filter] duration-[2400ms] ease-out group-hover:brightness-100 group-hover:hue-rotate-0 group-hover:saturate-100 motion-reduce:transition-none" />
          <div className="absolute top-[63%] left-0 h-[3%] w-[48%] -skew-y-12 bg-[#15141f]" />
          <div className="absolute inset-0 bg-[#22363c] opacity-90 transition-opacity duration-[1600ms] ease-out group-hover:opacity-0 motion-reduce:transition-none" />
        </div>
      </div>
    </div>
  );
}
