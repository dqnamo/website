// The sounds, synthesised. Cutting wood is a stream of tiny cracks as the blade parts one bundle
// of fibres after another, so it's made of short grains of noise, more of them the faster the
// pencil turns and the wider the cut, shaped by a bright band-pass; a dull blade tears rather
// than slices and crackles more coarsely, and graphite under the blade is a finer hiss. Writing
// is noise too, louder and higher the faster the point moves, and scratchier for hard leads.

export type Sound = ReturnType<typeof createSound>;

export function createSound() {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let noise: AudioBuffer | null = null;
  let cutBus: BiquadFilterNode | null = null;
  let hiss: GainNode | null = null;
  let scratch: GainNode | null = null;
  let scratchFilter: BiquadFilterNode | null = null;
  let enabled = true;
  let grains = 0;

  const build = () => {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return;
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = enabled ? 0.9 : 0;
    master.connect(ctx.destination);

    noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

    cutBus = ctx.createBiquadFilter();
    cutBus.type = "bandpass";
    cutBus.frequency.value = 2600;
    cutBus.Q.value = 0.7;
    cutBus.connect(master);

    // A steady hiss under the grains, and the pencil on paper.
    const loop = (filter: BiquadFilterNode, gain: GainNode) => {
      if (!ctx || !noise) return;
      const src = ctx.createBufferSource();
      src.buffer = noise;
      src.loop = true;
      src.connect(filter);
      filter.connect(gain);
      src.start();
    };
    hiss = ctx.createGain();
    hiss.gain.value = 0;
    hiss.connect(cutBus);
    const hissFilter = ctx.createBiquadFilter();
    hissFilter.type = "highpass";
    hissFilter.frequency.value = 1800;
    loop(hissFilter, hiss);

    scratch = ctx.createGain();
    scratch.gain.value = 0;
    scratch.connect(master);
    scratchFilter = ctx.createBiquadFilter();
    scratchFilter.type = "bandpass";
    scratchFilter.frequency.value = 3000;
    scratchFilter.Q.value = 0.9;
    loop(scratchFilter, scratch);
  };

  // One short burst of noise through its own envelope.
  const grain = (
    at: number,
    length: number,
    level: number,
    to: AudioNode,
    pitch = 1,
  ) => {
    if (!ctx || !noise) return;
    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.playbackRate.value = pitch;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(level, at + 0.0015);
    env.gain.exponentialRampToValueAtTime(0.0001, at + length);
    src.connect(env);
    env.connect(to);
    src.start(at, Math.random() * 1.8, length + 0.01);
  };

  const ping = (at: number, freq: number, level: number, decay: number) => {
    if (!ctx || !master) return;
    const osc = ctx.createOscillator();
    osc.frequency.value = freq;
    const env = ctx.createGain();
    env.gain.setValueAtTime(level, at);
    env.gain.exponentialRampToValueAtTime(0.0001, at + decay);
    osc.connect(env);
    env.connect(master);
    osc.start(at);
    osc.stop(at + decay + 0.02);
  };

  return {
    // Audio can only start from a gesture.
    wake() {
      if (!ctx) build();
      if (ctx && ctx.state === "suspended") void ctx.resume();
    },
    setEnabled(on: boolean) {
      enabled = on;
      if (ctx && master)
        master.gain.setTargetAtTime(on ? 0.9 : 0, ctx.currentTime, 0.05);
    },
    // Each frame while the blade is cutting: turns a second, how wide the cut is (0–1), how much
    // of it is lead (0–1) and how torn it is (0–1).
    cut(dt: number, rate: number, width: number, lead: number, torn: number) {
      if (!ctx || !cutBus || !hiss || !enabled) return;
      const now = ctx.currentTime;
      const busy = Math.min(1, rate / 1.5) * (0.35 + 0.65 * width);
      hiss.gain.setTargetAtTime(
        busy * (0.05 + 0.1 * lead) * (1 - 0.4 * torn),
        now,
        0.04,
      );
      cutBus.frequency.setTargetAtTime(
        2200 + 1600 * lead - 700 * torn + 500 * Math.min(1, rate),
        now,
        0.05,
      );
      grains += dt * rate * (70 + 160 * width) * (1 + torn * 0.6);
      while (grains >= 1) {
        grains -= 1;
        const at = now + Math.random() * dt;
        const level = (0.05 + 0.12 * Math.random()) * (0.6 + torn * 0.8);
        grain(
          at,
          0.004 + Math.random() * (0.008 + torn * 0.02),
          level,
          cutBus,
          0.7 + Math.random() * 0.8 - torn * 0.3,
        );
      }
    },
    stopCut() {
      if (!ctx || !hiss) return;
      hiss.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
      grains = 0;
    },
    // Each frame while writing: millimetres a second, the grade's softness, and whether wood is
    // dragging on the paper too.
    write(speed: number, softness: number, wood: boolean) {
      if (!ctx || !scratch || !scratchFilter) return;
      const now = ctx.currentTime;
      const v = Math.min(1, speed / 160);
      const hard = 1 / Math.sqrt(softness);
      scratch.gain.setTargetAtTime(
        enabled ? v * (0.05 + 0.07 * hard + (wood ? 0.08 : 0)) : 0,
        now,
        0.03,
      );
      scratchFilter.frequency.setTargetAtTime(
        1800 + 2600 * v * hard + (wood ? 1200 : 0),
        now,
        0.04,
      );
    },
    stopWrite() {
      if (!ctx || !scratch) return;
      scratch.gain.setTargetAtTime(0, ctx.currentTime, 0.04);
    },
    // A lead point snapping off.
    snap() {
      if (!ctx || !master || !enabled) return;
      const now = ctx.currentTime;
      const f = ctx.createBiquadFilter();
      f.type = "bandpass";
      f.frequency.value = 3400;
      f.Q.value = 6;
      f.connect(master);
      grain(now, 0.03, 0.5, f, 1.2);
      ping(now, 5200, 0.04, 0.05);
    },
    // The pencil going home in the bore, or put down on the desk.
    knock(level = 1) {
      if (!ctx || !master || !enabled) return;
      const now = ctx.currentTime;
      const f = ctx.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = 1400;
      f.connect(master);
      grain(now, 0.025, 0.35 * level, f, 0.6);
      ping(now, 820 + Math.random() * 120, 0.05 * level, 0.07);
    },
    dispose() {
      void ctx?.close();
      ctx = null;
    },
  };
}
