// The sounds, synthesised. A trim saw is a motor's hum under the whine of the blade, and once
// the diamond rim bites, a gritty grinding that pulls the motor's pitch down a little; quartz
// grinds harder than chalcedony. The halves knock on the bench, the spray bottle hisses twice,
// and polishing on a lap is a softer, steadier hiss.

export type Sound = ReturnType<typeof createSound>;

export function createSound() {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let noise: AudioBuffer | null = null;
  let enabled = true;
  let saw: {
    motor: OscillatorNode;
    whine: OscillatorNode;
    hum: GainNode;
    grind: GainNode;
    grindFilter: BiquadFilterNode;
    src: AudioBufferSourceNode;
  } | null = null;
  let lap: { gain: GainNode; src: AudioBufferSourceNode } | null = null;

  const build = () => {
    if (ctx) return ctx;
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = enabled ? 0.8 : 0;
    master.connect(ctx.destination);
    noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return ctx;
  };

  const ready = () => {
    const c = build();
    if (!c || !master || !noise) return null;
    if (c.state === "suspended") c.resume().catch(() => {});
    return { c, out: master, buffer: noise };
  };

  const burst = (
    at: number,
    length: number,
    type: BiquadFilterType,
    frequency: number,
    q: number,
    level: number,
  ) => {
    const r = ready();
    if (!r) return;
    const { c, out, buffer } = r;
    const src = c.createBufferSource();
    src.buffer = buffer;
    const filter = c.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = frequency;
    filter.Q.value = q;
    const gain = c.createGain();
    const t = c.currentTime + at;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(level, t + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + length);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(out);
    src.start(t, Math.random() * 1.5);
    src.stop(t + length + 0.05);
  };

  return {
    setEnabled(on: boolean) {
      enabled = on;
      if (ctx && master) {
        master.gain.setTargetAtTime(on ? 0.8 : 0, ctx.currentTime, 0.05);
      }
    },
    sawStart() {
      const r = ready();
      if (!r || saw) return;
      const { c, out, buffer } = r;
      const hum = c.createGain();
      hum.gain.value = 0;
      const motor = c.createOscillator();
      motor.type = "sawtooth";
      motor.frequency.value = 40;
      const motorFilter = c.createBiquadFilter();
      motorFilter.type = "lowpass";
      motorFilter.frequency.value = 420;
      const whine = c.createOscillator();
      whine.type = "triangle";
      whine.frequency.value = 300;
      const whineGain = c.createGain();
      whineGain.gain.value = 0.05;
      motor.connect(motorFilter);
      motorFilter.connect(hum);
      whine.connect(whineGain);
      whineGain.connect(hum);
      hum.connect(out);
      const src = c.createBufferSource();
      src.buffer = buffer;
      src.loop = true;
      const grindFilter = c.createBiquadFilter();
      grindFilter.type = "bandpass";
      grindFilter.frequency.value = 2200;
      grindFilter.Q.value = 0.9;
      const grind = c.createGain();
      grind.gain.value = 0;
      src.connect(grindFilter);
      grindFilter.connect(grind);
      grind.connect(out);
      const t = c.currentTime;
      // Spinning up.
      motor.frequency.setValueAtTime(12, t);
      motor.frequency.exponentialRampToValueAtTime(48, t + 0.5);
      whine.frequency.setValueAtTime(90, t);
      whine.frequency.exponentialRampToValueAtTime(1180, t + 0.6);
      hum.gain.setValueAtTime(0, t);
      hum.gain.linearRampToValueAtTime(0.14, t + 0.4);
      motor.start(t);
      whine.start(t);
      src.start(t);
      saw = { motor, whine, hum, grind, grindFilter, src };
    },
    // How hard the blade is cutting (0–1) and how hard the stone is there.
    sawLoad(load: number, hard: number) {
      if (!ctx || !saw) return;
      const t = ctx.currentTime;
      saw.grind.gain.setTargetAtTime(load * (0.16 + hard * 0.1), t, 0.05);
      saw.grindFilter.frequency.setTargetAtTime(1800 + hard * 1400, t, 0.1);
      saw.motor.frequency.setTargetAtTime(48 - load * (3 + hard * 3), t, 0.15);
      saw.whine.frequency.setTargetAtTime(
        1180 - load * (70 + hard * 60),
        t,
        0.15,
      );
    },
    sawStop() {
      if (!ctx || !saw) return;
      const { motor, whine, hum, grind, src } = saw;
      const t = ctx.currentTime;
      grind.gain.setTargetAtTime(0, t, 0.04);
      motor.frequency.setTargetAtTime(10, t, 0.5);
      whine.frequency.setTargetAtTime(60, t, 0.5);
      hum.gain.setTargetAtTime(0, t + 0.2, 0.35);
      motor.stop(t + 2);
      whine.stop(t + 2);
      src.stop(t + 2);
      saw = null;
    },
    clack(level = 1) {
      burst(0, 0.09, "bandpass", 1500, 1.4, 0.5 * level);
      burst(0, 0.18, "lowpass", 380, 0.8, 0.35 * level);
    },
    spray() {
      burst(0, 0.16, "highpass", 3200, 0.7, 0.22);
      burst(0.22, 0.2, "highpass", 3000, 0.7, 0.24);
    },
    click() {
      burst(0, 0.03, "highpass", 2400, 1, 0.3);
    },
    lapStart() {
      const r = ready();
      if (!r || lap) return;
      const { c, out, buffer } = r;
      const src = c.createBufferSource();
      src.buffer = buffer;
      src.loop = true;
      const filter = c.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.value = 900;
      filter.Q.value = 0.6;
      const gain = c.createGain();
      gain.gain.value = 0;
      gain.gain.setTargetAtTime(0.18, c.currentTime, 0.1);
      src.connect(filter);
      filter.connect(gain);
      gain.connect(out);
      src.start();
      lap = { gain, src };
    },
    // Finer grits sound finer.
    lapGrit(fine: number) {
      if (!ctx || !lap) return;
      lap.gain.gain.setTargetAtTime(0.18 - fine * 0.1, ctx.currentTime, 0.1);
    },
    lapStop() {
      if (!ctx || !lap) return;
      const t = ctx.currentTime;
      lap.gain.gain.setTargetAtTime(0, t, 0.08);
      lap.src.stop(t + 0.6);
      lap = null;
    },
    dispose() {
      saw = null;
      lap = null;
      ctx?.close().catch(() => {});
      ctx = null;
    },
  };
}
