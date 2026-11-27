// A plucked run of rubber band is a string, but a very lossy one. Rubber turns most of each swing
// into heat, worst at high frequencies, so the overtones are gone within a few hundredths of a
// second and the note is a short, round "dunk" rather than a ring. Plucked hard, it starts a
// little sharp: the swing stretches the band further, which tightens it, and the pitch sags back
// as the swing dies, the "boing" of a twanged rubber band. A band only moves a thread of air, so
// most of what you hear is the board it's stretched across, which is modelled here from its
// resonant modes. Nothing is a recording.

import type { Material } from "./boards";

type Mode = [frequency: number, decay: number, amplitude: number];

// A board's modes: plywood booms a little, walnut is heavier and darker, a plastic tray is thin
// and bright and dies quickly.
const BODIES: Record<Material, { modes: Mode[]; knock: number }> = {
  birch: {
    knock: 0.35,
    modes: [
      [168, 0.06, 1],
      [287, 0.05, 0.85],
      [431, 0.04, 0.7],
      [652, 0.032, 0.55],
      [948, 0.026, 0.42],
      [1390, 0.02, 0.3],
      [2050, 0.014, 0.2],
    ],
  },
  walnut: {
    knock: 0.3,
    modes: [
      [142, 0.07, 1],
      [246, 0.055, 0.8],
      [372, 0.045, 0.6],
      [561, 0.035, 0.45],
      [830, 0.026, 0.35],
      [1230, 0.018, 0.25],
    ],
  },
  plastic: {
    knock: 0.5,
    modes: [
      [392, 0.03, 1],
      [688, 0.024, 0.8],
      [1105, 0.018, 0.65],
      [1720, 0.013, 0.5],
      [2650, 0.01, 0.35],
      [3900, 0.007, 0.25],
    ],
  },
};

export type PluckOptions = {
  frequency: number;
  // 0–1: how far it was pulled before being let go.
  strength: number;
  // Where along the run it was plucked, 0–1.
  position: number;
  // Seconds from now.
  delay?: number;
};

export type Voice = ReturnType<typeof createVoice>;

export function createVoice() {
  let context: AudioContext | null = null;
  let master: GainNode | null = null;
  let dry: GainNode | null = null;
  let wet: ConvolverNode | null = null;
  let enabled = true;
  let material: Material = "birch";
  const impulses = new Map<Material, AudioBuffer>();

  function ring(out: Float32Array, rate: number, modes: Mode[], level: number) {
    for (const [frequency, decay, amplitude] of modes) {
      if (frequency > rate * 0.45) continue;
      const length = Math.min(out.length, Math.ceil(decay * 7 * rate));
      const w = (2 * Math.PI * frequency) / rate;
      const k = Math.exp(-1 / (decay * rate));
      const phase = Math.random() * Math.PI * 2;
      let e = amplitude * level;
      for (let i = 0; i < length; i++) {
        out[i] += e * Math.sin(w * i + phase);
        e *= k;
      }
    }
  }

  function noise(out: Float32Array, start: number, level: number, n: number) {
    let previous = 0;
    for (let i = 0; i < n && start + i < out.length; i++) {
      const white = Math.random() * 2 - 1;
      out[start + i] += (white - previous) * 0.5 * level * (1 - i / n) ** 2;
      previous = white;
    }
  }

  function impulse(ctx: AudioContext, which: Material) {
    const known = impulses.get(which);
    if (known) return known;
    const body = BODIES[which];
    const rate = ctx.sampleRate;
    const longest = Math.max(...body.modes.map((mode) => mode[1]));
    const buffer = ctx.createBuffer(2, Math.ceil(rate * (longest * 7)), rate);
    for (let channel = 0; channel < 2; channel++) {
      const out = buffer.getChannelData(channel);
      // Each ear hears the modes slightly differently, as they would across a room.
      const modes = body.modes.map(
        ([f, decay, a]) =>
          [f * (1 + (Math.random() - 0.5) * 0.012), decay, a] as Mode,
      );
      ring(out, rate, modes, 0.6);
      out[0] += body.knock * 3;
      noise(out, 1, body.knock, Math.round(rate * 0.002));
    }
    impulses.set(which, buffer);
    return buffer;
  }

  function ensure() {
    if (context) return context;
    const ctx = new AudioContext();
    context = ctx;
    master = ctx.createGain();
    master.gain.value = enabled ? 0.8 : 0;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -12;
    limiter.knee.value = 8;
    limiter.ratio.value = 6;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.2;
    master.connect(limiter).connect(ctx.destination);
    dry = ctx.createGain();
    dry.gain.value = 0.45;
    dry.connect(master);
    wet = ctx.createConvolver();
    wet.buffer = impulse(ctx, material);
    const wetGain = ctx.createGain();
    wetGain.gain.value = 0.9;
    wet.connect(wetGain).connect(master);
    return ctx;
  }

  function play(buffer: AudioBuffer, delay = 0, level = 1) {
    const ctx = context;
    if (!ctx || !enabled || !dry || !wet) return;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.value = level;
    source.connect(gain);
    gain.connect(dry);
    gain.connect(wet);
    source.start(ctx.currentTime + delay);
  }

  // The string itself: harmonics of the run, shaped by where it was plucked (a pluck at the
  // middle has no even harmonics), each dying faster than the one below.
  function renderPluck({ frequency, strength, position }: PluckOptions) {
    const ctx = context;
    if (!ctx) return null;
    const rate = ctx.sampleRate;
    const f = Math.min(Math.max(frequency, 40), 2400);
    // The fundamental's 1/e time: low notes on long loose runs last longer.
    const tau = Math.min(0.7, Math.max(0.09, 0.32 * (300 / f) ** 0.6));
    const seconds = Math.min(1.6, tau * 6 + 0.05);
    const length = Math.ceil(rate * seconds);
    const buffer = ctx.createBuffer(1, length, rate);
    const out = buffer.getChannelData(0);
    const harmonics = Math.max(1, Math.min(14, Math.floor((rate * 0.45) / f)));
    const amplitudes = new Float64Array(harmonics + 1);
    const decays = new Float64Array(harmonics + 1);
    const levels = new Float64Array(harmonics + 1);
    const p = Math.min(0.95, Math.max(0.05, position));
    for (let n = 1; n <= harmonics; n++) {
      amplitudes[n] = Math.sin(n * Math.PI * p) / n ** 1.55;
      decays[n] = Math.exp(-1 / (rate * (tau / (1 + 0.55 * (n - 1) ** 1.5))));
      levels[n] = amplitudes[n];
    }
    // The pitch sag after a hard pluck.
    const sag = 0.05 * strength * strength;
    // A second plane of swing a hair off the first, which beats slowly against it.
    const beat = 1.0035;
    let phase = 0;
    let phase2 = 0;
    for (let i = 0; i < length; i++) {
      const t = i / rate;
      const bend = 1 + sag * Math.exp(-t / 0.07);
      phase += (2 * Math.PI * f * bend) / rate;
      phase2 += (2 * Math.PI * f * bend * beat) / rate;
      // sin(nφ) by recurrence: sin(nφ) = 2cos(φ)sin((n−1)φ) − sin((n−2)φ).
      const c = 2 * Math.cos(phase);
      let s0 = 0;
      let s1 = Math.sin(phase);
      let sum = 0;
      for (let n = 1; n <= harmonics; n++) {
        sum += levels[n] * s1;
        const s2 = c * s1 - s0;
        s0 = s1;
        s1 = s2;
        levels[n] *= decays[n];
      }
      out[i] = sum + 0.22 * levels[1] * Math.sin(phase2);
    }
    // Let go rather than struck: a millisecond's rise, and the slap of rubber on the peg.
    const attack = Math.round(rate * 0.0012);
    for (let i = 0; i < attack; i++) {
      out[i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / attack);
    }
    noise(out, 0, 0.05 + 0.12 * strength, Math.round(rate * 0.003));
    const gain = 0.32 * (0.45 + 0.55 * strength);
    for (let i = 0; i < length; i++) out[i] *= gain;
    return buffer;
  }

  return {
    // Audio can only start from a gesture, so the first press on the board calls this.
    unlock() {
      const ctx = ensure();
      if (ctx.state === "suspended") ctx.resume().catch(() => {});
    },
    setEnabled(on: boolean) {
      enabled = on;
      if (master && context) {
        master.gain.setTargetAtTime(on ? 0.8 : 0, context.currentTime, 0.02);
      }
    },
    setMaterial(next: Material) {
      material = next;
      if (context && wet) wet.buffer = impulse(context, next);
    },
    pluck(options: PluckOptions) {
      if (!enabled) return;
      const buffer = renderPluck(options);
      if (buffer) play(buffer, options.delay ?? 0);
    },
    // A slack band slapped: no note, just a soft thud into the board.
    thud(level: number) {
      const ctx = context;
      if (!ctx || !enabled) return;
      const rate = ctx.sampleRate;
      const buffer = ctx.createBuffer(1, Math.ceil(rate * 0.08), rate);
      const out = buffer.getChannelData(0);
      ring(
        out,
        rate,
        [
          [110, 0.02, 0.5],
          [190, 0.012, 0.3],
        ],
        level,
      );
      noise(out, 0, 0.1 * level, Math.round(rate * 0.004));
      play(buffer);
    },
    // A band dropped over a peg: a nail ticks, a plastic peg clicks.
    tick(level: number) {
      const ctx = context;
      if (!ctx || !enabled) return;
      const rate = ctx.sampleRate;
      const buffer = ctx.createBuffer(1, Math.ceil(rate * 0.05), rate);
      const out = buffer.getChannelData(0);
      const modes: Mode[] =
        material === "plastic"
          ? [
              [2300, 0.003, 0.3],
              [3700, 0.002, 0.2],
            ]
          : [
              [3150, 0.006, 0.25],
              [5480, 0.004, 0.18],
              [8100, 0.002, 0.1],
            ];
      ring(out, rate, modes, level);
      noise(out, 0, 0.18 * level, Math.round(rate * 0.0008));
      play(buffer, 0, 0.8);
    },
    // A band breaking: a crack as the rubber parts, then the whip of both ends flying back.
    snap(level: number) {
      const ctx = context;
      if (!ctx || !enabled) return;
      const rate = ctx.sampleRate;
      const buffer = ctx.createBuffer(1, Math.ceil(rate * 0.16), rate);
      const out = buffer.getChannelData(0);
      noise(out, 0, 1.4 * level, Math.round(rate * 0.0025));
      // The whip: noise through a resonance that falls from about 3 kHz to 500 Hz.
      let y1 = 0;
      let y2 = 0;
      const n = Math.round(rate * 0.07);
      const start = Math.round(rate * 0.004);
      for (let i = 0; i < n && start + i < out.length; i++) {
        const t = i / n;
        const f = 3000 * (1 - t) + 500 * t;
        const w = (2 * Math.PI * f) / rate;
        const r = 0.985;
        const x = (Math.random() * 2 - 1) * (1 - t) ** 1.5;
        const y = x + 2 * r * Math.cos(w) * y1 - r * r * y2;
        y2 = y1;
        y1 = y;
        out[start + i] += y * 0.05 * level;
      }
      ring(out, rate, [[160, 0.03, 0.4]], level);
      play(buffer);
    },
    dispose() {
      context?.close().catch(() => {});
      context = null;
    },
  };
}
