// The plate's sound, made on the spot with Web Audio: nothing is recorded or loaded. A plate
// ringing is close to a pure tone with a trace of its overtones, so each voice is a sine with a
// little of the second and third harmonic in it. The driver hums quietly at its frequency all
// the time, and the plate takes the note up loudly only near a resonance, which is how you hear
// one coming as you tune. A bow adds the rasp of hair on the edge while it's drawn, and the
// plate rings on after it lifts. Sand bouncing on metal is a dry sizzle, high-passed noise as
// loud as there are grains in the air.

import type { PlateSound } from "./engine";

export function createSound() {
  let audio: AudioContext | null = null;
  let master: GainNode;
  let drive: OscillatorNode;
  let driveGain: GainNode;
  let ring: OscillatorNode;
  let ringGain: GainNode;
  let rasp: OscillatorNode;
  let raspFilter: BiquadFilterNode;
  let raspGain: GainNode;
  let hairGain: GainNode;
  let rattleGain: GainNode;
  let enabled = true;
  let muted = false;

  function output() {
    return enabled && !muted ? 1 : 0;
  }

  // The context waits for a press or a key, as browsers ask; everything before that is silent.
  function ensure() {
    if (audio) {
      if (audio.state === "suspended") void audio.resume();
      return true;
    }
    const Context =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Context) return false;
    audio = new Context();
    const now = audio.currentTime;

    const limiter = audio.createDynamicsCompressor();
    limiter.threshold.value = -12;
    limiter.ratio.value = 8;
    limiter.attack.value = 0.004;
    limiter.release.value = 0.2;
    limiter.connect(audio.destination);
    master = audio.createGain();
    master.gain.value = 0;
    master.gain.setTargetAtTime(output(), now, 0.1);
    master.connect(limiter);

    const plateWave = audio.createPeriodicWave(
      new Float32Array([0, 0, 0, 0]),
      new Float32Array([0, 1, 0.07, 0.025]),
    );

    drive = audio.createOscillator();
    drive.setPeriodicWave(plateWave);
    driveGain = audio.createGain();
    driveGain.gain.value = 0;
    drive.connect(driveGain).connect(master);
    drive.start();

    ring = audio.createOscillator();
    ring.setPeriodicWave(plateWave);
    ringGain = audio.createGain();
    ringGain.gain.value = 0;
    ring.connect(ringGain).connect(master);
    ring.start();

    // The bow's stick and slip, a sawtooth at the plate's pitch kept dark.
    rasp = audio.createOscillator();
    rasp.type = "sawtooth";
    raspFilter = audio.createBiquadFilter();
    raspFilter.type = "lowpass";
    raspFilter.Q.value = 0.7;
    raspGain = audio.createGain();
    raspGain.gain.value = 0;
    rasp.connect(raspFilter).connect(raspGain).connect(master);
    rasp.start();

    const length = Math.round(audio.sampleRate * 2);
    const buffer = audio.createBuffer(1, length, audio.sampleRate);
    const samples = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) samples[i] = Math.random() * 2 - 1;
    const noise = audio.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;

    // Hair across the edge: a soft hiss in the upper middle.
    const hair = audio.createBiquadFilter();
    hair.type = "bandpass";
    hair.frequency.value = 2600;
    hair.Q.value = 0.8;
    hairGain = audio.createGain();
    hairGain.gain.value = 0;
    noise.connect(hair).connect(hairGain).connect(master);

    // Sand on metal: only the top of the noise, and gated into grains of sound.
    const sizzle = audio.createBiquadFilter();
    sizzle.type = "highpass";
    sizzle.frequency.value = 4200;
    const crackle = audio.createGain();
    crackle.gain.value = 0.5;
    const flutter = audio.createOscillator();
    flutter.type = "square";
    flutter.frequency.value = 37;
    const depth = audio.createGain();
    depth.gain.value = 0.4;
    flutter.connect(depth).connect(crackle.gain);
    flutter.start();
    rattleGain = audio.createGain();
    rattleGain.gain.value = 0;
    noise.connect(sizzle).connect(crackle).connect(rattleGain).connect(master);
    noise.start();
    return true;
  }

  return {
    ensure,
    update(state: PlateSound) {
      if (!audio) return;
      const t = audio.currentTime;
      const on = output();
      drive.frequency.setTargetAtTime(state.driveHz, t, 0.02);
      driveGain.gain.setTargetAtTime(
        on * (0.01 * state.driveLevel + 0.17 * state.plateLevel),
        t,
        0.05,
      );
      if (state.bowHz) {
        ring.frequency.setTargetAtTime(state.bowHz, t, 0.01);
        rasp.frequency.setTargetAtTime(state.bowHz, t, 0.01);
        raspFilter.frequency.setTargetAtTime(
          Math.min(9000, state.bowHz * 3),
          t,
          0.02,
        );
      }
      ringGain.gain.setTargetAtTime(on * 0.18 * state.bowLevel, t, 0.03);
      raspGain.gain.setTargetAtTime(
        on * (state.bowing ? 0.035 * Math.max(0.3, state.bowLevel) : 0),
        t,
        0.04,
      );
      hairGain.gain.setTargetAtTime(on * (state.bowing ? 0.018 : 0), t, 0.05);
      rattleGain.gain.setTargetAtTime(on * 0.09 * state.rattle, t, 0.06);
    },
    setEnabled(on: boolean) {
      enabled = on;
      if (audio) master.gain.setTargetAtTime(output(), audio.currentTime, 0.05);
    },
    // Quiet while the microphone listens, so the plate doesn't hear itself.
    setMuted(on: boolean) {
      muted = on;
      if (audio) master.gain.setTargetAtTime(output(), audio.currentTime, 0.05);
    },
    dispose() {
      void audio?.close();
      audio = null;
    },
  };
}

export type Sound = ReturnType<typeof createSound>;
