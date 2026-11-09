// The embosser's noises, made from scratch when sound first starts. A handheld embosser is a
// hollow plastic shell around a steel punch, so everything it does is a short click or knock
// with the shell ringing faintly behind it: the ball dropping into each notch of the wheel, the
// crunch of vinyl being forced into the die (a dull thump, then the crackle of the film
// yielding), the feed pawl, the guillotine. Aluminium tape rings the punch like a bell instead.
// The hairdryer is filtered noise with its motor's whine on top.

export type ClickKind =
  | "detent"
  | "crunch"
  | "clank"
  | "empty"
  | "advance"
  | "cut"
  | "snip"
  | "peel"
  | "land"
  | "press";

type Synth = (t: number, random: () => number) => number;

const KINDS: Record<ClickKind, { seconds: number; synth: () => Synth }> = {
  detent: {
    seconds: 0.03,
    synth: () => (t, random) =>
      (random() * 2 - 1) * Math.exp(-t / 0.0012) * 0.6 +
      Math.sin(2 * Math.PI * 3300 * t) * Math.exp(-t / 0.005) * 0.35 +
      Math.sin(2 * Math.PI * 1180 * t) * Math.exp(-t / 0.008) * 0.2,
  },
  crunch: {
    seconds: 0.22,
    synth: () => {
      let low = 0;
      return (t, random) => {
        low += (random() * 2 - 1 - low) * 0.25;
        const thump =
          Math.sin(2 * Math.PI * (95 + 60 * Math.exp(-t / 0.01)) * t) *
          Math.exp(-t / 0.028);
        // The film giving: a short burst of crackle just after the punch lands.
        const crackle =
          t > 0.006
            ? low * Math.exp(-(t - 0.006) / 0.03) * (random() < 0.3 ? 1.6 : 0.6)
            : 0;
        const shell =
          Math.sin(2 * Math.PI * 760 * t) * Math.exp(-t / 0.04) * 0.25;
        const tick = (random() * 2 - 1) * Math.exp(-t / 0.0015);
        return thump * 0.9 + crackle * 0.8 + shell + tick * 0.5;
      };
    },
  },
  clank: {
    seconds: 0.5,
    synth: () => (t, random) => {
      const thump = Math.sin(2 * Math.PI * 120 * t) * Math.exp(-t / 0.02);
      const ring =
        Math.sin(2 * Math.PI * 1870 * t) * Math.exp(-t / 0.09) * 0.35 +
        Math.sin(2 * Math.PI * 3140 * t) * Math.exp(-t / 0.06) * 0.25 +
        Math.sin(2 * Math.PI * 4710 * t) * Math.exp(-t / 0.04) * 0.18;
      return (
        thump * 0.8 + ring + (random() * 2 - 1) * Math.exp(-t / 0.002) * 0.5
      );
    },
  },
  empty: {
    seconds: 0.1,
    synth: () => (t, random) =>
      Math.sin(2 * Math.PI * 140 * t) * Math.exp(-t / 0.015) * 0.6 +
      Math.sin(2 * Math.PI * 2600 * t) * Math.exp(-t / 0.006) * 0.35 +
      (random() * 2 - 1) * Math.exp(-t / 0.002) * 0.6,
  },
  advance: {
    seconds: 0.04,
    synth: () => (t, random) => {
      const one = (s: number) =>
        s < 0
          ? 0
          : (random() * 2 - 1) * Math.exp(-s / 0.001) * 0.5 +
            Math.sin(2 * Math.PI * 2300 * s) * Math.exp(-s / 0.004) * 0.3;
      return one(t) + one(t - 0.009) * 0.7;
    },
  },
  cut: {
    seconds: 0.18,
    synth: () => {
      let last = 0;
      return (t, random) => {
        const n = random() * 2 - 1;
        const high = n - last;
        last = n;
        const lever =
          Math.sin(2 * Math.PI * 180 * t) * Math.exp(-t / 0.02) * 0.6;
        const shear =
          t > 0.012 ? high * Math.exp(-(t - 0.012) / 0.008) * 0.8 : 0;
        const ping =
          t > 0.012
            ? Math.sin(2 * Math.PI * 5200 * t) *
              Math.exp(-(t - 0.012) / 0.03) *
              0.25
            : 0;
        return lever + shear + ping;
      };
    },
  },
  snip: {
    seconds: 0.12,
    synth: () => {
      let last = 0;
      return (t, random) => {
        const n = random() * 2 - 1;
        const high = n - last;
        last = n;
        const blade = (s: number) =>
          s < 0
            ? 0
            : high * Math.exp(-s / 0.004) * 0.7 +
              Math.sin(2 * Math.PI * 6400 * s) * Math.exp(-s / 0.012) * 0.2;
        return blade(t) + blade(t - 0.035) * 0.8;
      };
    },
  },
  peel: {
    seconds: 0.5,
    synth: () => {
      let last = 0;
      return (t, random) => {
        // Adhesive letting go is a run of tiny ticks, thickest in the middle of the pull.
        const envelope = Math.sin(Math.PI * Math.min(1, t / 0.45)) ** 1.5;
        const n = random() < 0.05 + 0.25 * envelope ? random() * 2 - 1 : 0;
        const high = n - last * 0.6;
        last = n;
        return high * envelope * 0.7;
      };
    },
  },
  land: {
    seconds: 0.05,
    synth: () => {
      let low = 0;
      return (t, random) => {
        low += (random() * 2 - 1 - low) * 0.15;
        return low * Math.exp(-t / 0.006) * 1.2;
      };
    },
  },
  press: {
    seconds: 0.06,
    synth: () => {
      let low = 0;
      return (t, random) => {
        low += (random() * 2 - 1 - low) * 0.3;
        return low * Math.exp(-t / 0.012) * 0.8;
      };
    },
  },
};

function render(ctx: AudioContext, seconds: number, synth: Synth) {
  const rate = ctx.sampleRate;
  const buffer = ctx.createBuffer(1, Math.ceil(seconds * rate), rate);
  const data = buffer.getChannelData(0);
  let seed = 9871;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let i = 0; i < data.length; i++) {
    // A few samples of fade-in so nothing starts with a click of its own.
    const fade = Math.min(1, i / 24);
    data[i] = synth(i / rate, random) * fade;
  }
  return buffer;
}

export function createVoice() {
  let context: AudioContext | null = null;
  let master: GainNode | null = null;
  let dryer: GainNode | null = null;
  let whine: OscillatorNode | null = null;
  let enabled = true;
  const buffers = new Map<ClickKind, AudioBuffer>();
  let lastAt = new Map<ClickKind, number>();

  function build() {
    const Context =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Context) return;
    const ctx = new Context();
    context = ctx;
    master = ctx.createGain();
    master.gain.value = enabled ? 0.8 : 0;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -8;
    limiter.knee.value = 6;
    limiter.ratio.value = 6;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.15;
    master.connect(limiter).connect(ctx.destination);
    for (const [kind, { seconds, synth }] of Object.entries(KINDS) as [
      ClickKind,
      (typeof KINDS)[ClickKind],
    ][]) {
      buffers.set(kind, render(ctx, seconds, synth()));
    }

    // The hairdryer: a loop of rushing air, and the motor singing over it.
    const noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = noise.getChannelData(0);
    let low = 0;
    for (let i = 0; i < data.length; i++) {
      low += (Math.random() * 2 - 1 - low) * 0.35;
      data[i] = low;
    }
    const air = ctx.createBufferSource();
    air.buffer = noise;
    air.loop = true;
    const tone = ctx.createBiquadFilter();
    tone.type = "lowpass";
    tone.frequency.value = 2400;
    dryer = ctx.createGain();
    dryer.gain.value = 0;
    air.connect(tone).connect(dryer).connect(master);
    whine = ctx.createOscillator();
    whine.type = "sawtooth";
    whine.frequency.value = 232;
    const whineBand = ctx.createBiquadFilter();
    whineBand.type = "bandpass";
    whineBand.frequency.value = 940;
    whineBand.Q.value = 3;
    const whineGain = ctx.createGain();
    whineGain.gain.value = 0.05;
    whine.connect(whineBand).connect(whineGain).connect(dryer);
    air.start();
    whine.start();
  }

  function running() {
    return context && context.state === "running" && enabled ? context : null;
  }

  return {
    // Audio can only start from a gesture, so every press on the stage or panel calls this.
    wake() {
      if (!enabled) return;
      if (!context) build();
      if (context?.state === "suspended") void context.resume();
    },
    setEnabled(on: boolean) {
      enabled = on;
      if (context && master) {
        master.gain.setTargetAtTime(on ? 0.8 : 0, context.currentTime, 0.03);
      }
    },
    play(kind: ClickKind, level = 1, rate = 1) {
      const ctx = running();
      const buffer = buffers.get(kind);
      if (!ctx || !master || !buffer || level <= 0.01) return;
      // The wheel can pass notches faster than they're worth hearing one by one.
      const now = ctx.currentTime;
      if (kind === "detent" && now - (lastAt.get(kind) ?? 0) < 0.012) return;
      lastAt.set(kind, now);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.playbackRate.value = rate * (0.96 + Math.random() * 0.08);
      const gain = ctx.createGain();
      gain.gain.value = level;
      source.connect(gain).connect(master);
      source.start();
      source.onended = () => {
        source.disconnect();
        gain.disconnect();
      };
    },
    // The hairdryer, 0 (off) to 1.
    blow(level: number) {
      const ctx = running();
      if (!ctx || !dryer || !whine) return;
      dryer.gain.setTargetAtTime(
        level * 0.22,
        ctx.currentTime,
        level ? 0.08 : 0.15,
      );
      whine.frequency.setTargetAtTime(150 + level * 82, ctx.currentTime, 0.3);
    },
    dispose() {
      void context?.close();
      context = null;
      master = null;
      dryer = null;
      whine = null;
      lastAt = new Map();
    },
  };
}

export type Voice = ReturnType<typeof createVoice>;
