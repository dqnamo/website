// The sound of a zip is the teeth going by. Each one knocks against the slider as it goes in or
// out, a click a few milliseconds long that rings at whatever the tooth rings at. Pull slowly
// and you hear them one at a time; pull fast and they run together into a buzz whose note is
// just how many teeth pass in a second, so the same pull sounds higher on a fine coil than on
// chunky moulded teeth. Nothing here is a recording: every frame writes the clicks it had into
// a short buffer, at the moments they happened, and the buffers play back to back.

import type { Teeth } from "./parts";

export type ClickKind = "tooth" | "pop" | "clink" | "stop" | "squeeze";

export type Click = {
  // Where in the frame it happened, 0–1.
  at: number;
  kind: ClickKind;
  level: number;
};

type Mode = [frequency: number, decay: number, amplitude: number];

// What a tooth rings at: brass is bright and short, moulded acetal duller and louder, nylon
// coil soft, with more of the hiss of the slider dragging over it.
const VOICES: Record<
  Teeth,
  { modes: Mode[]; noise: number; friction: number }
> = {
  metal: {
    modes: [
      [3400, 0.0022, 0.55],
      [6100, 0.0014, 0.35],
      [9300, 0.0009, 0.22],
    ],
    noise: 0.25,
    friction: 0.05,
  },
  moulded: {
    modes: [
      [1750, 0.0019, 0.7],
      [3300, 0.0012, 0.35],
      [5200, 0.0007, 0.15],
    ],
    noise: 0.35,
    friction: 0.05,
  },
  coil: {
    modes: [
      [2600, 0.0012, 0.32],
      [4900, 0.0008, 0.2],
    ],
    noise: 0.45,
    friction: 0.11,
  },
};

// The pull dropping against the slider rings for longer, like a small bell; the slider
// knocking into a stop is a dull thunk.
const CLINK: Mode[] = [
  [2350, 0.034, 0.5],
  [5450, 0.022, 0.3],
  [8800, 0.012, 0.18],
];
const THUNK: Mode[] = [
  [820, 0.009, 0.8],
  [2100, 0.004, 0.4],
];

const TAIL = 0.09;

export function createRattle() {
  let context: AudioContext | null = null;
  let master: GainNode | null = null;
  let enabled = true;
  let next = 0;
  let voice = VOICES.metal;
  let friction = 0;
  // Pink-ish noise for the transients and the drag, kept between buffers.
  let lowpass = 0;
  let highpass = 0;
  let previous = 0;

  function build() {
    const ctx = new AudioContext();
    context = ctx;
    master = ctx.createGain();
    master.gain.value = enabled ? 0.8 : 0;
    const tone = ctx.createBiquadFilter();
    tone.type = "lowpass";
    tone.frequency.value = 11000;
    master.connect(tone).connect(ctx.destination);
  }

  function ring(
    out: Float32Array,
    start: number,
    rate: number,
    modes: Mode[],
    level: number,
    jitter: number,
  ) {
    for (const [frequency, decay, amplitude] of modes) {
      const f = frequency * (1 + (Math.random() - 0.5) * jitter);
      const a = amplitude * level * (0.75 + Math.random() * 0.5);
      const length = Math.min(out.length - start, Math.ceil(decay * 6 * rate));
      const w = (2 * Math.PI * f) / rate;
      const k = Math.exp(-1 / (decay * rate));
      let e = a;
      for (let i = 0; i < length; i++) {
        out[start + i] += e * Math.sin(w * i);
        e *= k;
      }
    }
  }

  function burst(
    out: Float32Array,
    start: number,
    rate: number,
    level: number,
    length: number,
  ) {
    const n = Math.min(out.length - start, Math.ceil(length * rate));
    for (let i = 0; i < n; i++) {
      out[start + i] += (Math.random() * 2 - 1) * level * (1 - i / n) ** 2;
    }
  }

  return {
    setTeeth(teeth: Teeth) {
      voice = VOICES[teeth];
    },
    setEnabled(on: boolean) {
      enabled = on;
      if (context && master) {
        master.gain.setTargetAtTime(on ? 0.8 : 0, context.currentTime, 0.03);
      }
    },
    // Audio can only start from a gesture, so the first press on the stage calls this.
    wake() {
      if (!enabled) return;
      if (!context) build();
      if (context?.state === "suspended") void context.resume();
    },
    // One frame's worth: its clicks, how fast the slider is dragging (0–1) and how long the
    // frame was.
    play(clicks: Click[], drag: number, dt: number) {
      const ctx = context;
      if (!ctx || !master || !enabled || ctx.state !== "running") return;
      if (!clicks.length && drag < 0.002 && friction < 0.002) return;
      const rate = ctx.sampleRate;
      const span = Math.max(1, Math.round(dt * rate));
      const buffer = ctx.createBuffer(1, span + Math.round(TAIL * rate), rate);
      const out = buffer.getChannelData(0);

      // The slider dragging over the teeth: a hiss that follows its speed.
      const from = friction;
      friction = drag;
      if (from > 0.002 || drag > 0.002) {
        for (let i = 0; i < span; i++) {
          const level = (from + ((drag - from) * i) / span) * voice.friction;
          const white = Math.random() * 2 - 1;
          lowpass += (white - lowpass) * 0.35;
          highpass = 0.92 * (highpass + lowpass - previous);
          previous = lowpass;
          out[i] += highpass * level;
        }
      }

      for (const click of clicks) {
        const start = Math.min(
          span - 1,
          Math.max(0, Math.floor(click.at * span)),
        );
        const level = click.level;
        if (click.kind === "tooth" || click.kind === "pop") {
          const loud = click.kind === "pop" ? 1.8 : 1;
          ring(out, start, rate, voice.modes, level * loud, 0.12);
          burst(out, start, rate, voice.noise * level * loud, 0.0007);
        } else if (click.kind === "clink") {
          ring(out, start, rate, CLINK, level, 0.04);
          burst(out, start, rate, 0.3 * level, 0.001);
        } else if (click.kind === "stop") {
          ring(out, start, rate, THUNK, level, 0.06);
          burst(out, start, rate, 0.4 * level, 0.002);
        } else {
          // Pliers on the slider: a gritty crunch as the metal gives.
          for (let j = 0; j < 9; j++) {
            const at = start + Math.floor(Math.random() * 0.05 * rate);
            if (at < out.length) {
              ring(out, at, rate, THUNK, level * 0.35, 0.3);
              burst(out, at, rate, level * 0.3, 0.004);
            }
          }
        }
      }

      // Many teeth at once shouldn't distort: round off the peaks.
      for (let i = 0; i < out.length; i++) out[i] = Math.tanh(out[i]);

      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(master);
      const now = ctx.currentTime;
      if (next < now + 0.02 || next > now + 0.2) next = now + 0.03;
      source.start(next);
      next += span / rate;
    },
    dispose() {
      void context?.close();
      context = null;
      master = null;
    },
  };
}

export type Rattle = ReturnType<typeof createRattle>;
