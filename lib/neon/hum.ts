// The transformer's voice. On 50 Hz mains its iron core is magnetised one way and then the
// other in every cycle, and the iron itself stretches a hair each time (magnetostriction), so a
// neon transformer hums at 100 Hz with overtones, not at 50. A sign asking more of it than it
// can give fries and sizzles, and every tube that strikes gives a short crackle.

export type Hum = ReturnType<typeof createHum>;

export function createHum() {
  let context: AudioContext | null = null;
  let master: GainNode | null = null;
  let hum: GainNode | null = null;
  let sizzle: GainNode | null = null;
  let crackle: AudioBuffer | null = null;
  let enabled = false;

  function build() {
    const ctx = new AudioContext();
    context = ctx;
    master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);

    hum = ctx.createGain();
    hum.gain.value = 0;
    hum.connect(master);
    for (const [frequency, level] of [
      [100, 1],
      [200, 0.5],
      [300, 0.24],
      [400, 0.1],
      [600, 0.04],
    ]) {
      const oscillator = ctx.createOscillator();
      oscillator.frequency.value = frequency;
      const gain = ctx.createGain();
      gain.gain.value = level * 0.09;
      oscillator.connect(gain).connect(hum);
      oscillator.start();
    }

    const noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const samples = noise.getChannelData(0);
    for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
    const source = ctx.createBufferSource();
    source.buffer = noise;
    source.loop = true;
    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = 5200;
    band.Q.value = 0.7;
    sizzle = ctx.createGain();
    sizzle.gain.value = 0;
    source.connect(band).connect(sizzle).connect(master);
    source.start();

    // A crackle: a handful of sharp clicks, thinning out over a quarter of a second.
    crackle = ctx.createBuffer(
      1,
      Math.round(ctx.sampleRate * 0.3),
      ctx.sampleRate,
    );
    const clicks = crackle.getChannelData(0);
    for (let i = 0; i < clicks.length; i++) {
      const t = i / clicks.length;
      const density = 0.02 * (1 - t) ** 2;
      clicks[i] =
        Math.random() < density ? (Math.random() * 2 - 1) * (1 - t) : 0;
    }
  }

  return {
    setEnabled(on: boolean) {
      enabled = on;
      if (on && !context) build();
      if (!context || !master) return;
      if (on) void context.resume();
      master.gain.setTargetAtTime(on ? 1 : 0, context.currentTime, 0.06);
    },
    // level: how much tube is lit, 0–1; strain: how far past its limit the transformer is.
    update(level: number, strain: number) {
      if (!enabled || !context || !hum || !sizzle) return;
      const now = context.currentTime;
      hum.gain.setTargetAtTime(level, now, 0.08);
      sizzle.gain.setTargetAtTime(level * 0.006 + strain * 0.05, now, 0.05);
    },
    strike() {
      if (!enabled || !context || !master || !crackle) return;
      const source = context.createBufferSource();
      source.buffer = crackle;
      source.playbackRate.value = 0.8 + Math.random() * 0.5;
      const filter = context.createBiquadFilter();
      filter.type = "highpass";
      filter.frequency.value = 1400;
      const gain = context.createGain();
      gain.gain.value = 0.22;
      source.connect(filter).connect(gain).connect(master);
      source.start();
    },
    dispose() {
      void context?.close();
      context = null;
    },
  };
}
