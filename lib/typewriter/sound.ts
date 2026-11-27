// The typewriter's noises, made from scratch when sound first starts. A manual typewriter is a
// steel frame in a thin pressed-steel case, so everything is a hard click with the case ringing
// briefly behind it. A letter is the slug hitting the hard rubber platen through the ribbon (a
// sharp crack, louder the harder the blow), the case answering with a low knock, and the bar
// dropping back on to its felt rest a moment later. The escapement lets the carriage on by one
// tooth with a tick. The bell is a small struck dome, two of whose modes sit close enough to beat.
// A carriage return is the line-space ratchet, the carriage rumbling across on its rails, and the
// knock of the margin stop.

export type Sound =
  | "strike"
  | "space"
  | "tick"
  | "bell"
  | "ratchet"
  | "run"
  | "stop"
  | "thud"
  | "jam"
  | "zip"
  | "brush"
  | "rustle";

type Synth = (t: number, random: () => number) => number;

const ring = (t: number, f: number, decay: number) =>
  Math.sin(2 * Math.PI * f * t) * Math.exp(-t / decay);

const KINDS: Record<Sound, { seconds: number; synth: () => Synth }> = {
  strike: {
    seconds: 0.16,
    synth: () => {
      let low = 0;
      return (t, random) => {
        low += (random() * 2 - 1 - low) * 0.5;
        const crack = (random() * 2 - 1) * Math.exp(-t / 0.0011);
        const slug = ring(t, 3150, 0.005) * 0.55 + ring(t, 1730, 0.009) * 0.4;
        const knock = ring(t, 180 + 90 * Math.exp(-t / 0.006), 0.02) * 0.7;
        const shell = ring(t, 610, 0.03) * 0.18 + ring(t, 1240, 0.018) * 0.12;
        // The bar landing back on its rest.
        const back =
          t > 0.055 ? low * Math.exp(-(t - 0.055) / 0.006) * 0.35 : 0;
        return crack * 0.9 + slug + knock + shell + back;
      };
    },
  },
  space: {
    seconds: 0.09,
    synth: () => (t, random) =>
      ring(t, 140, 0.018) * 0.7 +
      ring(t, 820, 0.012) * 0.2 +
      (random() * 2 - 1) * Math.exp(-t / 0.002) * 0.35 +
      (t > 0.03
        ? (random() * 2 - 1) * Math.exp(-(t - 0.03) / 0.0015) * 0.3 +
          ring(t - 0.03, 2600, 0.003) * 0.2
        : 0),
  },
  tick: {
    seconds: 0.03,
    synth: () => (t, random) =>
      (random() * 2 - 1) * Math.exp(-t / 0.0009) * 0.5 +
      ring(t, 2900, 0.003) * 0.3 +
      ring(t, 4700, 0.002) * 0.15,
  },
  bell: {
    seconds: 2.2,
    synth: () => (t) =>
      ring(t, 2342, 0.9) * 0.5 +
      ring(t, 2349, 0.8) * 0.4 +
      ring(t, 5480, 0.35) * 0.18 +
      ring(t, 9120, 0.12) * 0.06 +
      ring(t, 1180, 0.05) * 0.1,
  },
  ratchet: {
    seconds: 0.08,
    synth: () => (t, random) => {
      const click = (s: number) =>
        s < 0
          ? 0
          : (random() * 2 - 1) * Math.exp(-s / 0.0012) * 0.5 +
            ring(s, 2100, 0.005) * 0.35 +
            ring(s, 380, 0.012) * 0.25;
      return click(t) + click(t - 0.034) * 0.8;
    },
  },
  run: {
    seconds: 0.4,
    synth: () => {
      let low = 0;
      let mid = 0;
      return (t, random) => {
        low += (random() * 2 - 1 - low) * 0.04;
        mid += (random() * 2 - 1 - mid) * 0.3;
        const envelope = Math.min(1, t / 0.02) * Math.exp(-t / 0.22);
        // The escapement pawl skipping over the rack as the carriage runs.
        const rack =
          Math.sin(2 * Math.PI * 70 * t) > 0.8 ? mid * 1.4 : mid * 0.3;
        return (low * 2.2 + rack) * envelope;
      };
    },
  },
  stop: {
    seconds: 0.35,
    synth: () => (t, random) =>
      ring(t, 105, 0.04) * 0.9 +
      ring(t, 890, 0.05) * 0.25 +
      ring(t, 1930, 0.03) * 0.15 +
      (random() * 2 - 1) * Math.exp(-t / 0.002) * 0.7,
  },
  thud: {
    seconds: 0.08,
    synth: () => (t, random) =>
      ring(t, 120, 0.015) * 0.6 +
      (random() * 2 - 1) * Math.exp(-t / 0.0025) * 0.25,
  },
  jam: {
    seconds: 0.3,
    synth: () => (t, random) => {
      const hit = (s: number) =>
        s < 0
          ? 0
          : (random() * 2 - 1) * Math.exp(-s / 0.0015) * 0.7 +
            ring(s, 2480, 0.02) * 0.3 +
            ring(s, 1310, 0.03) * 0.25;
      return hit(t) + hit(t - 0.012) * 0.9 + ring(t, 160, 0.03) * 0.6;
    },
  },
  zip: {
    seconds: 0.3,
    synth: () => (t, random) => {
      // A run of ratchet clicks, coming quicker then slowing as the hand lets go.
      const rate = 38 + 30 * Math.sin(Math.min(1, t / 0.3) * Math.PI);
      const phase = (t * rate) % 1;
      return (
        (random() * 2 - 1) *
          Math.exp(-phase / 0.06) *
          0.35 *
          Math.exp(-t / 0.25) +
        ring(phase / rate, 2000, 0.003) * 0.2
      );
    },
  },
  brush: {
    seconds: 0.9,
    synth: () => {
      let high = 0;
      let last = 0;
      return (t, random) => {
        const n = random() * 2 - 1;
        high = n - last;
        last = n;
        // Three strokes across the type.
        const stroke = Math.max(0, Math.sin(t * Math.PI * 3.4)) ** 2;
        return high * stroke * 0.3;
      };
    },
  },
  rustle: {
    seconds: 0.5,
    synth: () => {
      let band = 0;
      return (t, random) => {
        band += (random() * 2 - 1 - band) * 0.6;
        const crackle = random() < 0.02 ? (random() * 2 - 1) * 0.8 : 0;
        return (
          (band * 0.4 + crackle) * Math.exp(-t / 0.18) * Math.min(1, t / 0.01)
        );
      };
    },
  },
};

function render(ctx: AudioContext, seconds: number, synth: Synth) {
  const rate = ctx.sampleRate;
  const buffer = ctx.createBuffer(1, Math.ceil(seconds * rate), rate);
  const data = buffer.getChannelData(0);
  let seed = 4813;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let i = 0; i < data.length; i++) {
    // A few samples of fade-in so nothing starts with a click of its own.
    const fade = Math.min(1, i / 16);
    data[i] = synth(i / rate, random) * fade;
  }
  return buffer;
}

export function createVoice() {
  let context: AudioContext | null = null;
  let master: GainNode | null = null;
  let enabled = true;
  const buffers = new Map<Sound, AudioBuffer>();

  function build() {
    const Context =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Context) return;
    const ctx = new Context();
    context = ctx;
    master = ctx.createGain();
    master.gain.value = enabled ? 0.7 : 0;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -8;
    limiter.knee.value = 6;
    limiter.ratio.value = 6;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.15;
    master.connect(limiter).connect(ctx.destination);
    for (const [kind, { seconds, synth }] of Object.entries(KINDS) as [
      Sound,
      (typeof KINDS)[Sound],
    ][]) {
      buffers.set(kind, render(ctx, seconds, synth()));
    }
  }

  function running() {
    return context && context.state === "running" && enabled ? context : null;
  }

  return {
    // Audio can only start from a gesture, so every key and press calls this.
    wake() {
      if (!enabled) return;
      if (!context) build();
      if (context?.state === "suspended") void context.resume();
    },
    setEnabled(on: boolean) {
      enabled = on;
      if (context && master) {
        master.gain.setTargetAtTime(on ? 0.7 : 0, context.currentTime, 0.03);
      }
    },
    // A sound now, or a little later (in seconds), louder or softer and higher or lower.
    play(kind: Sound, level = 1, rate = 1, delay = 0) {
      const ctx = running();
      const buffer = buffers.get(kind);
      if (!ctx || !master || !buffer || level <= 0.01) return;
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.playbackRate.value = rate * (0.97 + Math.random() * 0.06);
      const gain = ctx.createGain();
      gain.gain.value = level;
      source.connect(gain).connect(master);
      source.start(ctx.currentTime + delay);
      source.onended = () => {
        source.disconnect();
        gain.disconnect();
      };
    },
    dispose() {
      void context?.close();
      context = null;
      master = null;
    },
  };
}

export type Voice = ReturnType<typeof createVoice>;
