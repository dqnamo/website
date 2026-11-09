// The sounds, synthesised. A coin on a table makes its noise where it touches: the rim rolling
// over the grain of the surface is a stream of tiny knocks, so the whirr is noise pulsed once
// for every lap the contact makes, with a hum at that same rate underneath. Early on the laps
// are slow and you hear a rumble that wanders; as the coin settles they quicken into a buzz,
// and the hum rises into hearing until it all stops at once. Spun upright, the coin only pivots
// on one point and is nearly silent. Knocks and landings ring the coin's own modes, high and
// inharmonic, for as long as the table lets it: glass and slate let it ring, baize smothers it.

export type Sound = ReturnType<typeof createSound>;

export type Voice = {
  // Laps the contact makes a second, and how fast it travels over the table in mm/s.
  laps: number;
  speed: number;
  // Turns a second of the coin standing upright.
  spin: number;
  // 0–1 for the table: how loud, bright and ringing it is.
  loud: number;
  bright: number;
};

export function createSound() {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let noise: AudioBuffer | null = null;
  let roll: GainNode | null = null;
  let pulse: OscillatorNode | null = null;
  let rollFilter: BiquadFilterNode | null = null;
  let hum: OscillatorNode | null = null;
  let humGain: GainNode | null = null;
  let swish: GainNode | null = null;
  let swishFilter: BiquadFilterNode | null = null;
  let enabled = true;

  const build = () => {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return;
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = enabled ? 0.9 : 0;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -10;
    limiter.ratio.value = 8;
    master.connect(limiter);
    limiter.connect(ctx.destination);

    noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

    const loop = () => {
      if (!ctx || !noise) return null;
      const src = ctx.createBufferSource();
      src.buffer = noise;
      src.loop = true;
      src.start(0, Math.random() * 1.5);
      return src;
    };

    // Rolling: noise through a band-pass, opened and closed once a lap by a pulse.
    rollFilter = ctx.createBiquadFilter();
    rollFilter.type = "bandpass";
    rollFilter.frequency.value = 1800;
    rollFilter.Q.value = 0.8;
    const gate = ctx.createGain();
    gate.gain.value = 0.5;
    pulse = ctx.createOscillator();
    pulse.type = "sawtooth";
    pulse.frequency.value = 5;
    const depth = ctx.createGain();
    depth.gain.value = 0.45;
    pulse.connect(depth);
    depth.connect(gate.gain);
    pulse.start();
    roll = ctx.createGain();
    roll.gain.value = 0;
    loop()?.connect(rollFilter);
    rollFilter.connect(gate);
    gate.connect(roll);
    roll.connect(master);

    // The hum at the lap rate, which becomes the rising buzz.
    hum = ctx.createOscillator();
    hum.type = "triangle";
    hum.frequency.value = 20;
    const humFilter = ctx.createBiquadFilter();
    humFilter.type = "lowpass";
    humFilter.frequency.value = 700;
    humGain = ctx.createGain();
    humGain.gain.value = 0;
    hum.connect(humFilter);
    humFilter.connect(humGain);
    humGain.connect(master);
    hum.start();

    // A faint hiss while it pivots upright.
    swishFilter = ctx.createBiquadFilter();
    swishFilter.type = "bandpass";
    swishFilter.frequency.value = 5000;
    swishFilter.Q.value = 1.2;
    swish = ctx.createGain();
    swish.gain.value = 0;
    loop()?.connect(swishFilter);
    swishFilter.connect(swish);
    swish.connect(master);
  };

  const burst = (
    at: number,
    length: number,
    level: number,
    filter: BiquadFilterType,
    freq: number,
    q = 0.8,
  ) => {
    if (!ctx || !noise || !master) return;
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const f = ctx.createBiquadFilter();
    f.type = filter;
    f.frequency.value = freq;
    f.Q.value = q;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(level, at + 0.0015);
    env.gain.exponentialRampToValueAtTime(0.0001, at + length);
    src.connect(f);
    f.connect(env);
    env.connect(master);
    src.start(at, Math.random() * 1.5, length + 0.02);
  };

  // The coin's own ring: a few inharmonic partials, the higher ones dying first.
  const ring = (at: number, modes: number[], level: number, decay: number) => {
    if (!ctx || !master) return;
    modes.forEach((freq, i) => {
      if (!ctx || !master || freq > ctx.sampleRate / 2.2) return;
      const osc = ctx.createOscillator();
      osc.frequency.value = freq * (1 + (Math.random() - 0.5) * 0.004);
      const env = ctx.createGain();
      const length = decay / (1 + i * 0.8);
      env.gain.setValueAtTime(0, at);
      env.gain.linearRampToValueAtTime(level / (1 + i), at + 0.001);
      env.gain.exponentialRampToValueAtTime(0.0001, at + length);
      osc.connect(env);
      env.connect(master);
      osc.start(at);
      osc.stop(at + length + 0.05);
    });
  };

  const quiet = (tau: number) => {
    if (!ctx || !roll || !humGain || !swish) return;
    const now = ctx.currentTime;
    roll.gain.cancelScheduledValues(now);
    humGain.gain.cancelScheduledValues(now);
    roll.gain.setTargetAtTime(0, now, tau);
    humGain.gain.setTargetAtTime(0, now, tau);
    swish.gain.setTargetAtTime(0, now, tau * 2);
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
    // Every frame while the coin moves.
    update(v: Voice) {
      if (!ctx || !roll || !pulse || !rollFilter || !hum || !humGain) return;
      if (!swish || !swishFilter) return;
      const now = ctx.currentTime;
      const laps = Math.min(Math.abs(v.laps), 400);
      // The rim's speed over the table sets how hard the knocks are.
      const pace = Math.min(1, v.speed / 900);
      const level = v.loud * pace * pace;
      roll.gain.setTargetAtTime(level * 0.5, now, 0.03);
      pulse.frequency.setTargetAtTime(Math.max(laps, 0.5), now, 0.02);
      rollFilter.frequency.setTargetAtTime(
        900 + 2600 * v.bright + 1200 * pace,
        now,
        0.05,
      );
      hum.frequency.setTargetAtTime(Math.max(laps, 1), now, 0.02);
      // The hum only reaches the ear once it's past about 25 laps a second.
      const audible = Math.min(1, Math.max(0, (laps - 18) / 40));
      humGain.gain.setTargetAtTime(level * audible * 0.32, now, 0.03);
      const spin = Math.min(1, Math.abs(v.spin) / 20);
      swish.gain.setTargetAtTime(spin * spin * 0.05 * v.loud, now, 0.08);
      swishFilter.frequency.setTargetAtTime(3000 + spin * 3500, now, 0.1);
    },
    silence() {
      quiet(0.04);
    },
    // The fingernail flicking the edge.
    flick(modes: number[], level: number) {
      if (!ctx || !enabled) return;
      const now = ctx.currentTime;
      burst(now, 0.012, 0.35 * level, "highpass", 2500);
      ring(now, modes, 0.03 * level, 0.35);
    },
    // The last lap: it all stops at once, with a short chatter as it settles flat.
    settle(modes: number[], level: number, table: Voice, rings: number) {
      if (!ctx || !enabled) return;
      quiet(0.006);
      const now = ctx.currentTime;
      const chatter = 3 + Math.round(level * 5);
      for (let i = 0; i < chatter; i++) {
        const at = now + i * (0.012 + i * 0.004);
        burst(
          at,
          0.01,
          (0.3 * table.loud * level) / (1 + i * 0.6),
          "bandpass",
          1400 + 2400 * table.bright,
          1.2,
        );
      }
      burst(now, 0.06, 0.25 * level * table.loud, "lowpass", 380);
      ring(now, modes, 0.035 * level * table.loud, 0.12 + 1.2 * rings);
    },
    // A coin dropping flat, or knocked down by a hand.
    slap(modes: number[], table: Voice, rings: number) {
      if (!ctx || !enabled) return;
      quiet(0.006);
      const now = ctx.currentTime;
      burst(now, 0.09, 0.7, "lowpass", 260);
      burst(
        now,
        0.02,
        0.2 * table.loud,
        "bandpass",
        1600 + 1600 * table.bright,
      );
      ring(now + 0.004, modes, 0.012 * table.loud, 0.06 + 0.3 * rings);
    },
    dispose() {
      void ctx?.close();
      ctx = null;
    },
  };
}
