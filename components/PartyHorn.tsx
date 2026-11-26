"use client";

import { useReducedMotion } from "motion/react";
import {
  type KeyboardEvent,
  type PointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { cn } from "@/helpers/classname-helper";

/* -------------------------------------------------------------------------- */
/* Geometry                                                                    */
/* -------------------------------------------------------------------------- */

/** The drawing is laid out in these units, then scaled to fit its box. */
const VIEW_WIDTH = 700;
const VIEW_HEIGHT = 280;

/** Where the mouthpiece is held, and where the paper leaves its collar. */
const PIVOT_X = 34;
const PIVOT_Y = 118;
const TUBE_START_X = 104;

/**
 * The paper is a flattened tube wound into a tight roll, like tape. Its
 * outermost turn sits at the mouthpiece and its innermost at the tip.
 */
const ROLL_OUTER_RADIUS = 30;
const ROLL_INNER_RADIUS = 6;
/** How far apart neighbouring turns of the roll are. */
const ROLL_PITCH = 5;
/**
 * The paper's length. Each unit of length uses up the same area of the roll,
 * so r² falls in a straight line from the base to the tip.
 */
const PAPER_LENGTH =
  (Math.PI * (ROLL_OUTER_RADIUS ** 2 - ROLL_INNER_RADIUS ** 2)) / ROLL_PITCH;
/** Spacing between the points that trace the paper. */
const STEP = 2;
const POINT_COUNT = Math.ceil(PAPER_LENGTH / STEP) + 1;

/** The flattened paper, seen edge on in the roll. */
const ROLLED_WIDTH = ROLL_PITCH + 0.6;
/** The paper once air has rounded it into a tube. */
const TUBE_WIDTH = 17;
/** Length of each printed foil stripe. */
const STRIPE_LENGTH = 12;

/* -------------------------------------------------------------------------- */
/* Papers                                                                      */
/* -------------------------------------------------------------------------- */

type Rgb = readonly [number, number, number];

export type PartyHornPaper = "carnival" | "lagoon" | "grape";

export const partyHornPapers: Record<
  PartyHornPaper,
  { label: string; mouth: Rgb; stripes: readonly [Rgb, Rgb]; collar: Rgb }
> = {
  carnival: {
    collar: [226, 182, 92],
    label: "Carnival",
    mouth: [255, 92, 98],
    stripes: [
      [255, 86, 96],
      [248, 196, 70],
    ],
  },
  grape: {
    collar: [214, 210, 226],
    label: "Grape",
    mouth: [150, 96, 245],
    stripes: [
      [146, 92, 246],
      [255, 128, 200],
    ],
  },
  lagoon: {
    collar: [206, 214, 224],
    label: "Lagoon",
    mouth: [40, 132, 240],
    stripes: [
      [36, 126, 236],
      [214, 222, 232],
    ],
  },
};

/**
 * Bands across the tube from its top edge to its bottom edge, and how bright
 * each one is under a light from above. The second band carries the foil's
 * specular streak.
 */
const BANDS = [
  { from: -1, light: 0.78, shine: 0.05, to: -0.62 },
  { from: -0.62, light: 1.08, shine: 0.42, to: -0.2 },
  { from: -0.2, light: 0.96, shine: 0.08, to: 0.3 },
  { from: 0.3, light: 0.78, shine: 0, to: 0.7 },
  { from: 0.7, light: 0.56, shine: 0, to: 1 },
] as const;

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

function smoothstep(edge0: number, edge1: number, value: number) {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function mix(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function shade(color: Rgb, light: number, shine: number) {
  const r = Math.round(mix(clamp(color[0] * light, 0, 255), 255, shine));
  const g = Math.round(mix(clamp(color[1] * light, 0, 255), 255, shine));
  const b = Math.round(mix(clamp(color[2] * light, 0, 255), 255, shine));
  return `rgb(${r} ${g} ${b})`;
}

/** The radius the paper was wound to at a given distance from the base. */
function rollRadiusAt(distance: number) {
  const outer = ROLL_OUTER_RADIUS ** 2;
  const inner = ROLL_INNER_RADIUS ** 2;
  return Math.sqrt(outer - ((outer - inner) * distance) / PAPER_LENGTH);
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

  const length = Math.floor(context.sampleRate * 0.25);
  noiseBuffer = context.createBuffer(1, length, context.sampleRate);
  const data = noiseBuffer.getChannelData(0);

  for (let index = 0; index < length; index += 1) {
    data[index] = Math.random() * 2 - 1;
  }

  return noiseBuffer;
}

/**
 * A reed buzz: a sawtooth and a square a few cents apart, rattled by a fast
 * tremolo and pushed through the paper's resonance.
 */
type Kazoo = {
  gain: GainNode;
  resonance: BiquadFilterNode;
  reed: OscillatorNode;
  rasp: OscillatorNode;
  stop: () => void;
};

function createKazoo(context: AudioContext): Kazoo {
  const reed = context.createOscillator();
  const rasp = context.createOscillator();
  const flutter = context.createOscillator();
  const flutterDepth = context.createGain();
  const tremolo = context.createGain();
  const resonance = context.createBiquadFilter();
  const soften = context.createBiquadFilter();
  const gain = context.createGain();

  reed.type = "sawtooth";
  rasp.type = "square";
  rasp.detune.value = 9;
  flutter.type = "sine";
  flutter.frequency.value = 31;
  flutterDepth.gain.value = 0.35;
  tremolo.gain.value = 0.65;
  resonance.type = "bandpass";
  resonance.frequency.value = 1350;
  resonance.Q.value = 1.6;
  soften.type = "lowpass";
  soften.frequency.value = 3600;
  gain.gain.value = 0;

  flutter.connect(flutterDepth).connect(tremolo.gain);
  reed.connect(tremolo);
  rasp.connect(tremolo);
  tremolo.connect(resonance).connect(soften).connect(gain);
  gain.connect(context.destination);

  reed.start();
  rasp.start();
  flutter.start();

  return {
    gain,
    rasp,
    reed,
    resonance,
    stop: () => {
      const now = context.currentTime;
      gain.gain.cancelScheduledValues(now);
      gain.gain.setTargetAtTime(0, now, 0.02);
      for (const oscillator of [reed, rasp, flutter]) {
        oscillator.stop(now + 0.2);
      }
      window.setTimeout(() => gain.disconnect(), 300);
    },
  };
}

/** A papery flap, for the roll slapping home or snapping out straight. */
function playFlap(strength: number, kind: "home" | "taut") {
  const context = getAudioContext();

  if (!context) {
    return;
  }

  const now = context.currentTime;
  const source = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const gain = context.createGain();
  const length = kind === "home" ? 0.07 : 0.045;

  source.buffer = getNoiseBuffer(context);
  source.playbackRate.value = kind === "home" ? 0.8 : 1.3;
  filter.type = "bandpass";
  filter.frequency.value = kind === "home" ? 1800 : 3800;
  filter.Q.value = 0.8;
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.22 * strength, now + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + length);

  source.connect(filter).connect(gain).connect(context.destination);
  source.start(now, Math.random() * 0.1);
  source.stop(now + length + 0.02);
}

function buzz(duration: number) {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    navigator.vibrate?.(duration);
  }
}

/** Seconds of breath that even the quickest tap gives. */
const MINIMUM_BREATH = 0.16;

/* -------------------------------------------------------------------------- */
/* Simulation                                                                  */
/* -------------------------------------------------------------------------- */

type HornState = {
  /** Breath in the tube, 0 to 1. */
  pressure: number;
  /** How much paper has left the roll. */
  unrolled: number;
  velocity: number;
  time: number;
};

type Trace = {
  x: Float32Array;
  y: Float32Array;
  angle: Float32Array;
  width: Float32Array;
  inflation: Float32Array;
};

function createTrace(): Trace {
  return {
    angle: new Float32Array(POINT_COUNT),
    inflation: new Float32Array(POINT_COUNT),
    width: new Float32Array(POINT_COUNT),
    x: new Float32Array(POINT_COUNT),
    y: new Float32Array(POINT_COUNT),
  };
}

/**
 * Walk the paper from the collar to the tip. Paper still on the roll keeps
 * the curl it was wound to; paper that has left it is held straight by the
 * breath inside, and starts to curl again as soon as the breath goes.
 */
function tracePaper(state: HornState, trace: Trace, flutter: boolean) {
  const { pressure, time, unrolled } = state;
  /** How firmly breath holds the free paper straight. */
  const stiffness = mix(0.5, 0.996, pressure);
  const reach = unrolled / PAPER_LENGTH;
  const flutterAmount = flutter ? 0.0045 * pressure * reach * reach : 0;

  let x = TUBE_START_X;
  let y = PIVOT_Y;
  let angle = 0;

  for (let index = 0; index < POINT_COUNT; index += 1) {
    const distance = Math.min(index * STEP, PAPER_LENGTH);
    const rolled = smoothstep(unrolled - 12, unrolled + 12, distance);
    const free = 1 - rolled;
    const curl = 1 / rollRadiusAt(distance);
    const wobble =
      flutterAmount *
      free *
      (distance / PAPER_LENGTH) *
      (Math.sin(distance * 0.075 - time * 31) +
        0.5 * Math.sin(distance * 0.21 - time * 53));
    const curvature = curl * (rolled + free * (1 - stiffness)) + wobble;

    // The paper is rounded by air up to just past where it leaves the roll.
    const inflation =
      (1 - smoothstep(unrolled - 24, unrolled + 4, distance)) *
      mix(0.35, 1, pressure);
    const width = mix(
      ROLLED_WIDTH,
      TUBE_WIDTH * mix(0.82, 1, pressure),
      inflation,
    );

    trace.x[index] = x;
    trace.y[index] = y;
    trace.angle[index] = angle;
    trace.inflation[index] = inflation;
    // The collar pinches the first few units into a round neck.
    trace.width[index] = mix(12.5, width, smoothstep(0, 14, distance));

    angle += curvature * STEP;
    x += Math.cos(angle - (curvature * STEP) / 2) * STEP;
    y += Math.sin(angle - (curvature * STEP) / 2) * STEP;
  }
}

/* -------------------------------------------------------------------------- */
/* Drawing                                                                     */
/* -------------------------------------------------------------------------- */

function drawShadow(
  context: CanvasRenderingContext2D,
  trace: Trace,
  dark: boolean,
) {
  let minimum = PIVOT_X;
  let maximum = TUBE_START_X;

  for (let index = 0; index < POINT_COUNT; index += 4) {
    minimum = Math.min(minimum, trace.x[index]);
    maximum = Math.max(maximum, trace.x[index]);
  }

  const centre = (minimum + maximum) / 2;
  const radius = (maximum - minimum) / 2 + 12;
  const shadowY = PIVOT_Y + 108;

  context.save();
  context.translate(centre, shadowY);
  context.scale(radius / 10, 1);
  const gradient = context.createRadialGradient(0, 0, 0, 0, 0, 10);
  const alpha = dark ? 0.5 : 0.16;
  gradient.addColorStop(0, `rgb(0 0 0 / ${alpha})`);
  gradient.addColorStop(1, "rgb(0 0 0 / 0)");
  context.fillStyle = gradient;
  context.beginPath();
  context.ellipse(0, 0, 10, 9, 0, 0, Math.PI * 2);
  context.fill();
  context.restore();
}

function drawPaper(
  context: CanvasRenderingContext2D,
  trace: Trace,
  paper: (typeof partyHornPapers)[PartyHornPaper],
) {
  const { angle, inflation, width, x, y } = trace;

  // Tip first, so paper nearer the mouthpiece lies over it.
  for (let index = POINT_COUNT - 2; index >= 0; index -= 1) {
    const next = index + 1;
    const distance = index * STEP;
    const startNormalX = -Math.sin(angle[index]);
    const startNormalY = Math.cos(angle[index]);
    const endNormalX = -Math.sin(angle[next]);
    const endNormalY = Math.cos(angle[next]);
    const halfStart = width[index] / 2;
    const halfEnd = width[next] / 2;
    // Overlap each piece a touch so no seams show between them.
    const tangentX = Math.cos(angle[index]) * 0.45;
    const tangentY = Math.sin(angle[index]) * 0.45;
    const startX = x[index] - tangentX;
    const startY = y[index] - tangentY;
    const endX = x[next] + tangentX;
    const endY = y[next] + tangentY;
    // Foil throws a glint wherever the paper faces the light.
    const glint = Math.max(0, Math.cos(angle[index] + 0.95)) ** 14 * 0.6;

    const color = paper.stripes[Math.floor(distance / STRIPE_LENGTH) & 1];

    for (const band of BANDS) {
      const light = mix(0.9, band.light, 0.35 + inflation[index] * 0.65);
      context.fillStyle = shade(
        color,
        light,
        clamp(band.shine * (0.4 + inflation[index] * 0.6) + glint, 0, 0.85),
      );
      context.beginPath();
      context.moveTo(
        startX + startNormalX * band.from * halfStart,
        startY + startNormalY * band.from * halfStart,
      );
      context.lineTo(
        endX + endNormalX * band.from * halfEnd,
        endY + endNormalY * band.from * halfEnd,
      );
      context.lineTo(
        endX + endNormalX * band.to * halfEnd,
        endY + endNormalY * band.to * halfEnd,
      );
      context.lineTo(
        startX + startNormalX * band.to * halfStart,
        startY + startNormalY * band.to * halfStart,
      );
      context.closePath();
      context.fill();
    }
  }

  // The tip is folded and glued shut.
  const tip = POINT_COUNT - 1;
  context.save();
  context.translate(x[tip], y[tip]);
  context.rotate(angle[tip]);
  context.fillStyle = shade(paper.stripes[1], 0.7, 0);
  context.beginPath();
  context.roundRect(-1, -width[tip] / 2, 3, width[tip], 1.2);
  context.fill();
  context.restore();
}

function drawMouthpiece(
  context: CanvasRenderingContext2D,
  paper: (typeof partyHornPapers)[PartyHornPaper],
) {
  const { collar, mouth } = paper;

  // Tapered plastic body.
  const body = context.createLinearGradient(0, PIVOT_Y - 11, 0, PIVOT_Y + 11);
  body.addColorStop(0, shade(mouth, 1.05, 0.25));
  body.addColorStop(0.28, shade(mouth, 1.08, 0.5));
  body.addColorStop(0.42, shade(mouth, 1, 0.08));
  body.addColorStop(1, shade(mouth, 0.5, 0));
  context.fillStyle = body;
  context.beginPath();
  context.moveTo(PIVOT_X, PIVOT_Y - 10.5);
  context.lineTo(TUBE_START_X - 2, PIVOT_Y - 7.5);
  context.lineTo(TUBE_START_X - 2, PIVOT_Y + 7.5);
  context.lineTo(PIVOT_X, PIVOT_Y + 10.5);
  context.closePath();
  context.fill();

  // Two moulded grip rings.
  for (const ringX of [PIVOT_X + 22, PIVOT_X + 30]) {
    const half = mix(10.5, 7.5, (ringX - PIVOT_X) / (TUBE_START_X - PIVOT_X));
    context.fillStyle = shade(mouth, 0.72, 0);
    context.fillRect(ringX, PIVOT_Y - half - 0.4, 1.6, half * 2 + 0.8);
    context.fillStyle = shade(mouth, 1, 0.45);
    context.fillRect(ringX + 1.6, PIVOT_Y - half - 0.4, 1, half * 2 + 0.8);
  }

  // The rounded lip you put in your mouth.
  const lip = context.createLinearGradient(0, PIVOT_Y - 13, 0, PIVOT_Y + 13);
  lip.addColorStop(0, shade(mouth, 1.05, 0.3));
  lip.addColorStop(0.3, shade(mouth, 1.1, 0.55));
  lip.addColorStop(0.5, shade(mouth, 0.95, 0.05));
  lip.addColorStop(1, shade(mouth, 0.46, 0));
  context.fillStyle = lip;
  context.beginPath();
  context.roundRect(PIVOT_X - 10, PIVOT_Y - 13, 12, 26, 5);
  context.fill();

  // Foil collar crimped round the neck of the paper.
  const collarLeft = TUBE_START_X - 6;
  const collarWidth = 13;
  const collarFill = context.createLinearGradient(
    0,
    PIVOT_Y - 9,
    0,
    PIVOT_Y + 9,
  );
  collarFill.addColorStop(0, shade(collar, 0.85, 0.2));
  collarFill.addColorStop(0.3, shade(collar, 1.1, 0.65));
  collarFill.addColorStop(0.55, shade(collar, 0.92, 0.05));
  collarFill.addColorStop(1, shade(collar, 0.5, 0));
  context.fillStyle = collarFill;
  context.beginPath();
  context.roundRect(collarLeft, PIVOT_Y - 9.5, collarWidth, 19, 2);
  context.fill();

  context.fillStyle = "rgb(0 0 0 / 0.16)";
  for (
    let crimp = collarLeft + 2;
    crimp < collarLeft + collarWidth;
    crimp += 2.5
  ) {
    context.fillRect(crimp, PIVOT_Y - 9.5, 0.8, 19);
  }
}

/* -------------------------------------------------------------------------- */
/* Component                                                                   */
/* -------------------------------------------------------------------------- */

export type PartyHornProps = {
  /** Which printed foil paper and plastic mouthpiece to use. */
  paper?: PartyHornPaper;
  /** Play a synthesised reed buzz while blowing. */
  sound?: boolean;
  /**
   * Blow from outside, e.g. while a card is hovered. When set, the horn
   * ignores presses and is hidden from assistive tech.
   */
  blowing?: boolean;
  className?: string;
  "aria-describedby"?: string;
};

export function PartyHorn({
  paper = "carnival",
  sound = true,
  blowing: externalBlowing,
  className,
  "aria-describedby": ariaDescribedBy,
}: PartyHornProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const stateRef = useRef<HornState>({
    pressure: 0,
    time: 0,
    unrolled: 0,
    velocity: 0,
  });
  const traceRef = useRef<Trace | null>(null);
  const blowingRef = useRef(false);
  const breathStartRef = useRef(-1);
  const frameRef = useRef(0);
  const lastTimeRef = useRef(0);
  const kazooRef = useRef<Kazoo | null>(null);
  const settingsRef = useRef({ paper, reduceMotion: false, sound });
  const shouldReduceMotion = useReducedMotion() ?? false;
  const passive = externalBlowing !== undefined;

  settingsRef.current = { paper, reduceMotion: shouldReduceMotion, sound };

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");

    if (!canvas || !context) {
      return;
    }

    traceRef.current ??= createTrace();
    const trace = traceRef.current;
    const state = stateRef.current;
    const { paper: paperName, reduceMotion } = settingsRef.current;
    const scale = canvas.width / VIEW_WIDTH;
    const dark = document.documentElement.classList.contains("dark");

    tracePaper(state, trace, !reduceMotion);

    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.setTransform(scale, 0, 0, scale, 0, 0);

    drawShadow(context, trace, dark);

    // Blowing lifts the horn a little, as a mouth would.
    context.save();
    context.translate(PIVOT_X, PIVOT_Y);
    context.rotate(-0.05 * state.pressure);
    context.translate(-PIVOT_X, -PIVOT_Y);
    drawPaper(context, trace, partyHornPapers[paperName]);
    drawMouthpiece(context, partyHornPapers[paperName]);
    context.restore();
  }, []);

  const updateSound = useCallback((state: HornState, active: boolean) => {
    const kazoo = kazooRef.current;

    if (!kazoo) {
      return;
    }

    const context = kazoo.gain.context;
    const now = context.currentTime;
    const reach = state.unrolled / PAPER_LENGTH;
    const loudness =
      active && settingsRef.current.sound
        ? smoothstep(0.08, 0.45, state.pressure) * 0.13
        : 0;
    // A longer tube rings lower, so the note sags as the paper unrolls.
    const pitch = 330 + 70 * state.pressure - 95 * reach;

    kazoo.gain.gain.setTargetAtTime(loudness, now, 0.02);
    kazoo.reed.frequency.setTargetAtTime(pitch, now, 0.03);
    kazoo.rasp.frequency.setTargetAtTime(pitch * 1.003, now, 0.03);
    kazoo.resonance.frequency.setTargetAtTime(1100 + 700 * reach, now, 0.05);
  }, []);

  const step = useCallback(
    (now: number) => {
      const state = stateRef.current;
      const { reduceMotion, sound: soundOn } = settingsRef.current;
      const dt = Math.min(0.033, (now - (lastTimeRef.current || now)) / 1000);
      lastTimeRef.current = now;
      // Even the quickest tap pushes out a short breath.
      const blowing =
        blowingRef.current ||
        state.time - breathStartRef.current < MINIMUM_BREATH;

      // Breath fills the tube quickly and leaks out even faster.
      const breathRate = blowing ? 9 : 16;
      state.pressure +=
        ((blowing ? 1 : 0) - state.pressure) * (1 - Math.exp(-breathRate * dt));
      state.time += dt;

      // The paper needs a little breath before it will start to unroll.
      const target =
        PAPER_LENGTH * clamp((state.pressure - 0.1) / 0.9, 0, 1) ** 0.75;
      const springiness = blowing ? 70 : 120;
      const damping =
        2 *
        Math.sqrt(springiness) *
        (reduceMotion ? 1.05 : blowing ? 0.72 : 0.6);
      const subSteps = 3;

      for (let index = 0; index < subSteps; index += 1) {
        const h = dt / subSteps;
        const acceleration =
          springiness * (target - state.unrolled) - damping * state.velocity;
        state.velocity += acceleration * h;
        state.unrolled += state.velocity * h;

        if (state.unrolled < 0) {
          const speed = -state.velocity;
          state.unrolled = 0;
          state.velocity = reduceMotion ? 0 : speed * 0.28;

          if (speed > 260) {
            if (soundOn) {
              playFlap(clamp(speed / 1400, 0.25, 1), "home");
            }
            buzz(6);
          }
        } else if (state.unrolled > PAPER_LENGTH) {
          const speed = state.velocity;
          state.unrolled = PAPER_LENGTH;
          state.velocity = reduceMotion ? 0 : -speed * 0.18;

          if (speed > 220 && soundOn) {
            playFlap(clamp(speed / 1200, 0.2, 0.7), "taut");
          }
        }
      }

      updateSound(state, true);
      draw();

      const settled =
        !blowing &&
        state.pressure < 0.002 &&
        state.unrolled < 0.05 &&
        Math.abs(state.velocity) < 0.5;

      if (settled) {
        state.pressure = 0;
        state.unrolled = 0;
        state.velocity = 0;
        lastTimeRef.current = 0;
        frameRef.current = 0;
        updateSound(state, false);
        draw();
        return;
      }

      frameRef.current = requestAnimationFrame(step);
    },
    [draw, updateSound],
  );

  const wake = useCallback(() => {
    if (!frameRef.current) {
      lastTimeRef.current = 0;
      frameRef.current = requestAnimationFrame(step);
    }
  }, [step]);

  const setBlowing = useCallback(
    (next: boolean) => {
      if (blowingRef.current === next) {
        return;
      }

      blowingRef.current = next;
      buttonRef.current?.setAttribute("aria-pressed", String(next));

      if (next) {
        if (settingsRef.current.sound && !passive) {
          const context = getAudioContext();
          if (context && !kazooRef.current) {
            kazooRef.current = createKazoo(context);
          }
        }
        buzz(4);
        breathStartRef.current = stateRef.current.time;
      }

      wake();
    },
    [passive, wake],
  );

  // Size the canvas to its box at the screen's pixel density.
  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return;
    }

    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2.5);
      const width = canvas.clientWidth;
      canvas.width = Math.max(1, Math.round(width * ratio));
      canvas.height = Math.max(
        1,
        Math.round(((width * VIEW_HEIGHT) / VIEW_WIDTH) * ratio),
      );
      draw();
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    // Redraw when the theme changes, so the shadow matches the page.
    const themeObserver = new MutationObserver(draw);
    themeObserver.observe(document.documentElement, {
      attributeFilter: ["class"],
      attributes: true,
    });

    return () => {
      observer.disconnect();
      themeObserver.disconnect();
    };
  }, [draw]);

  // A new paper or motion setting needs a fresh frame.
  // biome-ignore lint/correctness/useExhaustiveDependencies: redraw on change
  useEffect(() => {
    draw();
  }, [draw, paper, shouldReduceMotion]);

  useEffect(() => {
    if (passive) {
      setBlowing(externalBlowing);
    }
  }, [externalBlowing, passive, setBlowing]);

  useEffect(() => {
    if (!sound && kazooRef.current) {
      kazooRef.current.gain.gain.setTargetAtTime(
        0,
        kazooRef.current.gain.context.currentTime,
        0.02,
      );
    }
  }, [sound]);

  useEffect(
    () => () => {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = 0;
      kazooRef.current?.stop();
      kazooRef.current = null;
    },
    [],
  );

  const canvas = (
    <canvas className="block aspect-[5/2] w-full" ref={canvasRef} />
  );

  if (passive) {
    return (
      <div aria-hidden="true" className={className}>
        {canvas}
      </div>
    );
  }

  const handlePointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) {
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    setBlowing(true);
  };

  const handlePointerUp = () => setBlowing(false);

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== " " && event.key !== "Enter") {
      return;
    }
    event.preventDefault();
    if (!event.repeat) {
      setBlowing(true);
    }
  };

  const handleKeyUp = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      setBlowing(false);
    }
  };

  return (
    <button
      aria-describedby={ariaDescribedBy}
      aria-label="Party horn. Hold to blow"
      aria-pressed="false"
      className={cn(
        "block w-full cursor-pointer touch-none select-none rounded-xl [-webkit-tap-highlight-color:transparent] [-webkit-touch-callout:none] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-grayscale-7",
        className,
      )}
      onBlur={handlePointerUp}
      onContextMenu={(event) => event.preventDefault()}
      onKeyDown={handleKeyDown}
      onKeyUp={handleKeyUp}
      onLostPointerCapture={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      ref={buttonRef}
      type="button"
    >
      {canvas}
    </button>
  );
}

/**
 * The horn for a lab card: it blows while the card it sits in is hovered or
 * focused.
 */
export function PartyHornPreview({ className }: { className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [blowing, setBlowing] = useState(false);

  useEffect(() => {
    const card = ref.current?.closest<HTMLElement>("[data-experiment-card]");

    if (!card) {
      return;
    }

    const start = () => setBlowing(true);
    const stop = () => setBlowing(false);
    const events = [
      ["pointerenter", start],
      ["pointerleave", stop],
      ["focus", start],
      ["blur", stop],
    ] as const;

    for (const [name, listener] of events) {
      card.addEventListener(name, listener);
    }

    return () => {
      for (const [name, listener] of events) {
        card.removeEventListener(name, listener);
      }
    };
  }, []);

  return (
    <div className={className} ref={ref}>
      <PartyHorn blowing={blowing} sound={false} />
    </div>
  );
}
