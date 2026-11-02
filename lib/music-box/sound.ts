// A music box is a steel comb, and each tine is a little cantilever: clamped at the root, free at
// the tip, lifted by a star wheel and let go. A clamped bar doesn't ring in harmonics the way a
// string does. Its overtones sit at 6.27 and 17.55 times the fundamental, which is what gives a
// music box its glassy ping, and they die much faster than the fundamental, so every note starts
// bright and mellows as it rings. Each tine here is a few cents off true, as filed ones are.
//
// What you hear depends on what the movement is pressed against. On its own a tine a couple of
// millimetres wide barely moves any air: what it pushes on one side slips round its edges to the
// other, worst of all at low notes, so a movement held up in your fingers sounds tiny and thin.
// Set it on a table and the tines shake the tabletop, which is wide enough to push the air rather
// than stir it, and it's suddenly loud. Each body here is an impulse response built from its
// resonant modes, and the tines play through it. Nothing is a recording.

import { PITCHES, TRACKS } from "./tunes";

export type Surface = "hand" | "table" | "box" | "tin";

type Mode = [frequency: number, decay: number, amplitude: number];

type Body = {
  // How much reaches you straight from the tines, and through the body.
  dry: number;
  wet: number;
  // Below this the tines alone hardly radiate; the body fills it back in.
  lowCut: number;
  modes: Mode[];
  // The knock of the contact itself, before the modes take over.
  knock: number;
};

const BODIES: Record<Surface, Body> = {
  hand: { dry: 0.2, wet: 0, lowCut: 1500, modes: [], knock: 0 },
  // A solid tabletop: broad, well-damped wooden modes that give it warmth and a little knock.
  table: {
    dry: 0.5,
    wet: 0.62,
    lowCut: 260,
    knock: 0.35,
    modes: [
      [176, 0.07, 1],
      [298, 0.06, 0.8],
      [462, 0.05, 0.75],
      [705, 0.045, 0.6],
      [1030, 0.04, 0.5],
      [1520, 0.03, 0.4],
      [2240, 0.022, 0.3],
      [3300, 0.016, 0.2],
    ],
  },
  // An empty cardboard box: the panels and the air inside boom along, and cardboard damps fast.
  box: {
    dry: 0.42,
    wet: 1.05,
    lowCut: 140,
    knock: 0.3,
    modes: [
      [148, 0.12, 1.3],
      [233, 0.08, 0.9],
      [361, 0.06, 0.7],
      [540, 0.05, 0.55],
      [820, 0.04, 0.4],
      [1240, 0.03, 0.28],
      [1900, 0.02, 0.18],
    ],
  },
  // A biscuit tin: thin steel rings on long after each note, a bright metallic halo.
  tin: {
    dry: 0.42,
    wet: 0.62,
    lowCut: 320,
    knock: 0.15,
    modes: [
      [612, 0.42, 0.5],
      [947, 0.38, 0.45],
      [1388, 0.5, 0.5],
      [1903, 0.33, 0.42],
      [2484, 0.45, 0.42],
      [3126, 0.3, 0.32],
      [3870, 0.36, 0.28],
      [4706, 0.25, 0.22],
      [5810, 0.2, 0.16],
    ],
  },
};

// Overtones of a clamped–free bar, as multiples of the fundamental: how long each rings
// compared with it, and how loud it starts. The second line is the tine's twin bending mode a
// hair sharp, which beats slowly against the first, the shimmer in a long note.
const PARTIALS: [ratio: number, decay: number, amplitude: number][] = [
  [1, 1, 1],
  [1.0013, 0.85, 0.16],
  [6.267, 0.22, 0.3],
  [17.55, 0.07, 0.1],
];

// How long the fundamental of each tine takes to fall to 1/e: the long bass tines ring longest.
export function tineDecay(track: number) {
  return 0.6 * (PITCHES[0] / PITCHES[track]) ** 0.75;
}

// A fixed tuning error for each tine, in cents, from a little hash so it's the same every visit.
function detune(track: number) {
  const x = Math.sin(track * 12.9898 + 4.1414) * 43758.5453;
  return ((x - Math.floor(x)) * 2 - 1) * 5;
}

type Ringing = {
  source: AudioBufferSourceNode;
  gain: GainNode;
};

export type ClickKind = "pawl" | "tick" | "punch" | "tape";

export function createVoice() {
  let context: AudioContext | null = null;
  let master: GainNode | null = null;
  let input: GainNode | null = null;
  let direct: GainNode | null = null;
  let hiss: GainNode | null = null;
  let enabled = true;
  let surface: Surface = "table";
  const bodies = new Map<Surface, { dry: GainNode; wet: GainNode | null }>();
  const tines: AudioBuffer[] = [];
  const buzzes: AudioBuffer[] = [];
  const clicks = new Map<ClickKind, AudioBuffer>();
  const ringing: (Ringing | null)[] = Array(TRACKS).fill(null);

  function ring(
    out: Float32Array,
    start: number,
    rate: number,
    modes: Mode[],
    level: number,
  ) {
    for (const [frequency, decay, amplitude] of modes) {
      if (frequency > rate * 0.45) continue;
      const length = Math.min(out.length - start, Math.ceil(decay * 7 * rate));
      const w = (2 * Math.PI * frequency) / rate;
      const k = Math.exp(-1 / (decay * rate));
      const phase = Math.random() * Math.PI * 2;
      let e = amplitude * level;
      for (let i = 0; i < length; i++) {
        out[start + i] += e * Math.sin(w * i + phase);
        e *= k;
      }
    }
  }

  function burst(out: Float32Array, start: number, level: number, n: number) {
    let previous = 0;
    for (let i = 0; i < n && start + i < out.length; i++) {
      // Differenced noise, so the click is all top end.
      const white = Math.random() * 2 - 1;
      out[start + i] += (white - previous) * 0.5 * level * (1 - i / n) ** 2;
      previous = white;
    }
  }

  function renderTine(ctx: AudioContext, track: number) {
    const rate = ctx.sampleRate;
    const frequency = PITCHES[track] * 2 ** (detune(track) / 1200);
    const decay = tineDecay(track);
    const length = Math.ceil(rate * Math.min(4, decay * 7 + 0.05));
    const buffer = ctx.createBuffer(1, length, rate);
    const out = buffer.getChannelData(0);
    for (const [ratio, decayScale, amplitude] of PARTIALS) {
      const f = frequency * ratio;
      if (f > rate * 0.45) continue;
      // A sine by recurrence, which is much cheaper than calling Math.sin per sample.
      const w = (2 * Math.PI * f) / rate;
      const c = 2 * Math.cos(w);
      let s1 = Math.sin(-w);
      let s2 = Math.sin(-2 * w);
      const k = Math.exp(-1 / (decay * decayScale * rate));
      let e = amplitude;
      for (let i = 0; i < length; i++) {
        const s = c * s1 - s2;
        s2 = s1;
        s1 = s;
        out[i] += e * s;
        e *= k;
        if (e < 1e-5) break;
      }
    }
    // The tine is let go rather than struck, so it starts within a millisecond, not instantly;
    // the star wheel's point snapping off the tip is a tiny click on top.
    const attack = Math.round(rate * 0.0008);
    for (let i = 0; i < attack; i++) {
      out[i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / attack);
    }
    burst(out, 0, 0.14, Math.round(rate * 0.0015));
    for (let i = 0; i < length; i++) out[i] *= 0.4;
    return buffer;
  }

  // A star wheel catching a tine that's still swinging: the point chatters against it for a
  // few milliseconds before it settles and lifts it.
  function renderBuzz(ctx: AudioContext, track: number) {
    const rate = ctx.sampleRate;
    const length = Math.ceil(rate * 0.05);
    const buffer = ctx.createBuffer(1, length, rate);
    const out = buffer.getChannelData(0);
    const w = (2 * Math.PI * PITCHES[track]) / rate;
    let gate = 0;
    for (let i = 0; i < length; i++) {
      if (i % Math.round(rate / 260) === 0)
        gate = Math.random() < 0.6 ? 1 : 0.2;
      const t = i / length;
      const env = (1 - t) ** 2;
      out[i] =
        (Math.sin(w * i) * 0.5 + Math.sin(w * 6.267 * i) * 0.2) * gate * env;
    }
    for (let i = 0; i < length; i += Math.round(rate / 260)) {
      burst(out, i, 0.12 * (1 - i / length), 12);
    }
    return buffer;
  }

  function renderClick(ctx: AudioContext, kind: ClickKind) {
    const rate = ctx.sampleRate;
    const seconds = kind === "tape" ? 0.12 : 0.06;
    const buffer = ctx.createBuffer(1, Math.ceil(rate * seconds), rate);
    const out = buffer.getChannelData(0);
    if (kind === "pawl") {
      // The pawl dropping off a ratchet tooth: a hard little tick that rings in the frame.
      ring(
        out,
        0,
        rate,
        [
          [2900, 0.002, 0.5],
          [4700, 0.0012, 0.35],
          [7400, 0.0008, 0.2],
        ],
        1,
      );
      burst(out, 0, 0.3, Math.round(rate * 0.0006));
    } else if (kind === "tick") {
      // A star wheel's point dropping into a hole, quiet against the paper.
      ring(out, 0, rate, [[5400, 0.0007, 0.2]], 1);
      burst(out, 0, 0.08, Math.round(rate * 0.0004));
    } else if (kind === "punch") {
      // The punch going through card: a thump of the handle and the snap of the paper.
      ring(
        out,
        0,
        rate,
        [
          [180, 0.014, 0.7],
          [430, 0.007, 0.4],
          [2100, 0.002, 0.3],
        ],
        1,
      );
      burst(out, Math.round(rate * 0.002), 0.6, Math.round(rate * 0.004));
    } else {
      // Tape pulled off the roll and pressed down: a quick crackle, then a pat.
      for (let i = 0; i < 70; i++) {
        const at = Math.floor(rate * 0.08 * (i / 70) ** 0.8);
        burst(out, at, 0.25 * Math.random(), 18);
      }
      ring(out, Math.floor(rate * 0.09), rate, [[260, 0.008, 0.3]], 1);
    }
    return buffer;
  }

  function impulse(ctx: AudioContext, body: Body) {
    const rate = ctx.sampleRate;
    const longest = Math.max(...body.modes.map((mode) => mode[1]));
    const length = Math.ceil(rate * Math.min(2, longest * 6 + 0.02));
    const buffer = ctx.createBuffer(2, length, rate);
    for (let channel = 0; channel < 2; channel++) {
      const out = buffer.getChannelData(channel);
      // Each ear hears the body's modes a little differently, as a real room would place them.
      const modes = body.modes.map(
        ([f, decay, a]) =>
          [f * (1 + (Math.random() - 0.5) * 0.01), decay, a] as Mode,
      );
      ring(out, 0, rate, modes, 1);
      out[0] += body.knock * 4;
      burst(out, 1, body.knock, Math.round(rate * 0.003));
    }
    return buffer;
  }

  function build() {
    const ctx = new AudioContext();
    context = ctx;
    master = ctx.createGain();
    master.gain.value = enabled ? 0.9 : 0;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -10;
    limiter.knee.value = 8;
    limiter.ratio.value = 6;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.2;
    master.connect(limiter).connect(ctx.destination);

    input = ctx.createGain();
    direct = ctx.createGain();
    direct.connect(master);
    for (const [name, body] of Object.entries(BODIES) as [Surface, Body][]) {
      const on = name === surface;
      const low = ctx.createBiquadFilter();
      low.type = "highpass";
      low.frequency.value = body.lowCut;
      low.Q.value = 0.6;
      const lower = ctx.createBiquadFilter();
      lower.type = "highpass";
      lower.frequency.value = body.lowCut;
      lower.Q.value = 0.6;
      const dry = ctx.createGain();
      dry.gain.value = on ? body.dry : 0;
      input.connect(low).connect(lower).connect(dry).connect(master);
      let wet: GainNode | null = null;
      if (body.modes.length) {
        const convolver = ctx.createConvolver();
        convolver.buffer = impulse(ctx, body);
        wet = ctx.createGain();
        wet.gain.value = on ? body.wet : 0;
        input.connect(convolver).connect(wet).connect(master);
      }
      bodies.set(name, { dry, wet });
    }

    for (let track = 0; track < TRACKS; track++) {
      tines.push(renderTine(ctx, track));
      buzzes.push(renderBuzz(ctx, track));
    }
    for (const kind of ["pawl", "tick", "punch", "tape"] as ClickKind[]) {
      clicks.set(kind, renderClick(ctx, kind));
    }

    // Paper sliding through the movement and over the table: a loop of soft noise whose level
    // follows the feed.
    const seconds = 2;
    const noise = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
    const data = noise.getChannelData(0);
    let low = 0;
    for (let i = 0; i < data.length; i++) {
      low += (Math.random() * 2 - 1 - low) * 0.3;
      data[i] = low;
    }
    const loop = ctx.createBufferSource();
    loop.buffer = noise;
    loop.loop = true;
    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = 2600;
    band.Q.value = 0.6;
    hiss = ctx.createGain();
    hiss.gain.value = 0;
    loop.connect(band).connect(hiss).connect(direct);
    loop.start();
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
        master.gain.setTargetAtTime(on ? 0.9 : 0, context.currentTime, 0.03);
      }
    },
    setSurface(next: Surface) {
      surface = next;
      if (!context) return;
      const now = context.currentTime;
      for (const [name, nodes] of bodies) {
        const body = BODIES[name];
        const on = name === next;
        nodes.dry.gain.setTargetAtTime(on ? body.dry : 0, now, 0.06);
        nodes.wet?.gain.setTargetAtTime(on ? body.wet : 0, now, 0.06);
      }
    },
    // The audio clock now, or null while there's no sound to schedule against.
    now() {
      return running()?.currentTime ?? null;
    },
    // A tine let go at `when`. Plucking it again stops what it was still ringing, because the
    // star wheel's point has to lift it first; a buzz means it was caught mid-swing.
    pluck(track: number, when: number, level: number, buzz: number) {
      const ctx = running();
      if (!ctx || !input) return;
      const at = Math.max(when, ctx.currentTime);
      const previous = ringing[track];
      if (previous) {
        previous.gain.gain.setTargetAtTime(0, at, 0.004);
        previous.source.stop(at + 0.06);
      }
      if (buzz > 0) {
        const chatter = ctx.createBufferSource();
        chatter.buffer = buzzes[track];
        const gain = ctx.createGain();
        gain.gain.value = buzz;
        chatter.connect(gain).connect(input);
        chatter.start(Math.max(ctx.currentTime, at - 0.045));
      }
      const source = ctx.createBufferSource();
      source.buffer = tines[track];
      const gain = ctx.createGain();
      gain.gain.value = level;
      source.connect(gain).connect(input);
      source.start(at);
      const entry = { source, gain };
      ringing[track] = entry;
      source.onended = () => {
        if (ringing[track] === entry) ringing[track] = null;
        source.disconnect();
        gain.disconnect();
      };
    },
    click(kind: ClickKind, when: number | null, level = 1) {
      const ctx = running();
      if (!ctx || !input || !direct) return;
      const source = ctx.createBufferSource();
      source.buffer = clicks.get(kind) ?? null;
      const gain = ctx.createGain();
      gain.gain.value = level;
      // The movement's own clicks go through whatever it's sitting on; the punch and the
      // tape are in your hands.
      source
        .connect(gain)
        .connect(kind === "pawl" || kind === "tick" ? input : direct);
      source.start(Math.max(when ?? 0, ctx.currentTime));
      source.onended = () => {
        source.disconnect();
        gain.disconnect();
      };
    },
    // How fast paper is moving, 0–1.
    rustle(level: number) {
      const ctx = running();
      if (!ctx || !hiss) return;
      hiss.gain.setTargetAtTime(level * 0.05, ctx.currentTime, 0.05);
    },
    dispose() {
      void context?.close();
      context = null;
      master = null;
      input = null;
      direct = null;
      hiss = null;
    },
  };
}

export type Voice = ReturnType<typeof createVoice>;
