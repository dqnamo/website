// The telephone's sounds, all made on the spot with Web Audio: nothing is recorded or loaded.
// They come from two places. The dial is heard in the room: the soft ratchet as it's wound, the
// knock of a finger against the stop, the governor's whirr on the way home and the snap of the
// pulse contacts, each a short burst of filtered noise or a falling thump. The line is heard in
// the earpiece, so it goes through a telephone's narrow band, about 300 to 3,400 Hz, and a
// little of a carbon earpiece's grit: dial tone, ringing, engaged and number unobtainable at the
// frequencies and cadences of the British network, and a click for every break in the line.
//
// Tones only reach the earpiece while current flows in the line, so a pulse or a tap on the
// cradle cuts them for a moment, and nothing reaches it while the receiver is on its rest.

export type Tone = "dial" | "ringing" | "engaged" | "unobtainable" | null;

export type TrainSound = {
  // Seconds from now when the line breaks and makes again.
  events: { at: number; made: boolean }[];
  // Seconds from now until the wheel is home.
  home: number;
  // Pulses a second, which sets the governor's pitch.
  speed: number;
};

// Two tones mixed, and a cadence of on and off in seconds; no cadence means continuous.
const TONES: Record<
  Exclude<Tone, null>,
  { a: number; b: number | null; cadence: number[] | null }
> = {
  dial: { a: 350, b: 450, cadence: null },
  ringing: { a: 400, b: 450, cadence: [0.4, 0.2, 0.4, 2] },
  engaged: { a: 400, b: null, cadence: [0.375, 0.375] },
  unobtainable: { a: 400, b: null, cadence: null },
};

const TONE_LEVEL = 0.16;

type Burst = {
  freq: number;
  q?: number;
  type?: BiquadFilterType;
  gain: number;
  decay: number;
  dest?: AudioNode;
};

type Thump = { from: number; to: number; gain: number; decay: number };

export function createSound() {
  let audio: AudioContext | null = null;
  let master: GainNode;
  let mech: GainNode;
  let line: GainNode;
  let ear: GainNode;
  let gate: GainNode;
  let envelope: GainNode;
  let second: GainNode;
  let toneA: OscillatorNode;
  let toneB: OscillatorNode;
  let noise: AudioBuffer;
  let enabled = true;
  let level = 0.6;
  let lifted = false;
  let made = false;
  let planner = 0;

  function output() {
    return enabled ? level * level * 0.9 : 0;
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
    const a = audio;

    master = a.createGain();
    master.gain.value = output();
    master.connect(a.destination);

    mech = a.createGain();
    mech.connect(master);

    // The earpiece: a narrow band, and a soft clip for the carbon's grit.
    line = a.createGain();
    const low = a.createBiquadFilter();
    low.type = "highpass";
    low.frequency.value = 300;
    const high = a.createBiquadFilter();
    high.type = "lowpass";
    high.frequency.value = 3400;
    const grit = a.createWaveShaper();
    const curve = new Float32Array(257);
    for (let i = 0; i < curve.length; i++) {
      const x = (i / 128 - 1) * 1.6;
      curve[i] = Math.tanh(x) / Math.tanh(1.6);
    }
    grit.curve = curve;
    ear = a.createGain();
    ear.gain.value = lifted ? 1 : 0;
    line.connect(low).connect(high).connect(grit).connect(ear).connect(master);

    // Tones and pips need current in the line to be heard; clicks are the line changing itself.
    gate = a.createGain();
    gate.gain.value = made ? 1 : 0;
    gate.connect(line);
    envelope = a.createGain();
    envelope.gain.value = 0;
    envelope.connect(gate);
    toneA = a.createOscillator();
    toneB = a.createOscillator();
    const first = a.createGain();
    first.gain.value = TONE_LEVEL;
    second = a.createGain();
    second.gain.value = TONE_LEVEL;
    toneA.connect(first).connect(envelope);
    toneB.connect(second).connect(envelope);
    toneA.start();
    toneB.start();

    noise = a.createBuffer(1, a.sampleRate, a.sampleRate);
    const samples = noise.getChannelData(0);
    for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
    void a.resume();
    return true;
  }

  function burst(
    at: number,
    { freq, q = 1, type = "bandpass", gain, decay, dest }: Burst,
  ) {
    if (!audio) return;
    const source = audio.createBufferSource();
    source.buffer = noise;
    const filter = audio.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = q;
    const envelope = audio.createGain();
    envelope.gain.setValueAtTime(0, at);
    envelope.gain.linearRampToValueAtTime(gain, at + 0.0012);
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + decay);
    source
      .connect(filter)
      .connect(envelope)
      .connect(dest ?? mech);
    source.start(at, Math.random() * 0.8, decay + 0.03);
  }

  function thump(at: number, { from, to, gain, decay }: Thump) {
    if (!audio) return;
    const osc = audio.createOscillator();
    osc.frequency.setValueAtTime(from, at);
    osc.frequency.exponentialRampToValueAtTime(to, at + decay);
    const envelope = audio.createGain();
    envelope.gain.setValueAtTime(0, at);
    envelope.gain.linearRampToValueAtTime(gain, at + 0.002);
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + decay);
    osc.connect(envelope).connect(mech);
    osc.start(at);
    osc.stop(at + decay + 0.02);
  }

  function now() {
    return audio ? audio.currentTime : 0;
  }

  // A click in the earpiece, as the line breaks or makes.
  function lineClick(at = now(), gain = 0.22) {
    burst(at, { freq: 1100, q: 0.8, gain, decay: 0.018, dest: line });
  }

  // The tone's cadence is planned a little ahead, a slice at a time, so it keeps time exactly.
  function tone(kind: Tone) {
    clearInterval(planner);
    if (!audio) return;
    const a = audio;
    const start = a.currentTime + 0.015;
    envelope.gain.cancelScheduledValues(a.currentTime);
    envelope.gain.setTargetAtTime(0, a.currentTime, 0.004);
    if (!kind) return;
    const spec = TONES[kind];
    toneA.frequency.setValueAtTime(spec.a, start);
    toneB.frequency.setValueAtTime(spec.b ?? spec.a, start);
    second.gain.setValueAtTime(spec.b ? TONE_LEVEL : 0, start);
    const cadence = spec.cadence;
    if (!cadence) {
      envelope.gain.setTargetAtTime(1, start, 0.004);
      return;
    }
    let at = start;
    let step = 0;
    const plan = () => {
      while (at < a.currentTime + 0.8) {
        envelope.gain.setTargetAtTime(step % 2 ? 0 : 1, at, 0.004);
        at += cadence[step % cadence.length];
        step++;
      }
    };
    plan();
    planner = window.setInterval(plan, 200);
  }

  return {
    ensure,
    tone,
    lineClick,
    setEnabled(on: boolean) {
      enabled = on;
      if (audio) master.gain.setTargetAtTime(output(), audio.currentTime, 0.02);
    },
    // 0–1.
    setVolume(value: number) {
      level = value;
      if (audio) master.gain.setTargetAtTime(output(), audio.currentTime, 0.02);
    },
    // How loud speech should be, since it can't go through the same wires.
    loudness() {
      return enabled ? level : 0;
    },
    setEar(on: boolean) {
      lifted = on;
      if (audio) ear.gain.setTargetAtTime(on ? 1 : 0, audio.currentTime, 0.01);
    },
    setLoop(on: boolean) {
      made = on;
      if (audio)
        gate.gain.setTargetAtTime(on ? 1 : 0, audio.currentTime, 0.002);
    },
    // The ratchet as the wheel is wound, a tooth at a time.
    ratchet() {
      const t = now();
      burst(t, { freq: 5200, q: 5, gain: 0.05, decay: 0.01 });
      burst(t, { freq: 2300, q: 2, gain: 0.025, decay: 0.016 });
    },
    // A finger meeting the stop.
    stop() {
      const t = now();
      thump(t, { from: 170, to: 80, gain: 0.3, decay: 0.08 });
      burst(t, { freq: 1300, type: "lowpass", gain: 0.25, decay: 0.035 });
      burst(t, { freq: 3600, q: 2, gain: 0.06, decay: 0.02 });
    },
    // The wheel's run home: the governor's whirr, a snap of the contacts on every break and
    // make, a click in the earpiece for each, and a knock as it comes to rest.
    train({ events, home, speed }: TrainSound) {
      if (!audio) return;
      const a = audio;
      const t = a.currentTime;
      const end = t + home;
      const whirr = a.createBufferSource();
      whirr.buffer = noise;
      whirr.loop = true;
      const band = a.createBiquadFilter();
      band.type = "bandpass";
      band.frequency.value = 900 + speed * 45;
      band.Q.value = 1.4;
      const hum = a.createOscillator();
      hum.type = "sawtooth";
      hum.frequency.setValueAtTime(70 + speed * 4, t);
      hum.frequency.linearRampToValueAtTime(90 + speed * 6, t + 0.05);
      const soft = a.createBiquadFilter();
      soft.type = "lowpass";
      soft.frequency.value = 700;
      const body = a.createGain();
      body.gain.value = 0.25;
      const envelope = a.createGain();
      envelope.gain.setValueAtTime(0, t);
      envelope.gain.linearRampToValueAtTime(0.06, t + 0.03);
      envelope.gain.setValueAtTime(0.06, Math.max(t + 0.03, end - 0.02));
      envelope.gain.linearRampToValueAtTime(0, end + 0.01);
      whirr.connect(band).connect(envelope);
      hum.connect(soft).connect(body).connect(envelope);
      envelope.connect(mech);
      whirr.start(t, Math.random() * 0.5);
      whirr.stop(end + 0.05);
      hum.start(t);
      hum.stop(end + 0.05);
      for (const event of events) {
        const at = t + event.at;
        burst(at, {
          freq: event.made ? 2400 : 3100,
          q: 3,
          gain: event.made ? 0.09 : 0.2,
          decay: 0.012,
        });
        lineClick(at, event.made ? 0.12 : 0.22);
      }
      thump(end, { from: 230, to: 120, gain: 0.2, decay: 0.05 });
      burst(end, { freq: 2000, type: "lowpass", gain: 0.14, decay: 0.03 });
    },
    // The hook switch under the cradle, pressed or let up.
    hook(down: boolean) {
      const t = now();
      if (down) {
        thump(t, { from: 120, to: 70, gain: 0.28, decay: 0.08 });
        burst(t, { freq: 2400, type: "lowpass", gain: 0.2, decay: 0.04 });
      } else {
        thump(t, { from: 160, to: 100, gain: 0.12, decay: 0.05 });
        burst(t, { freq: 3200, q: 1.5, gain: 0.08, decay: 0.025 });
      }
      lineClick(t);
    },
    // The receiver coming off its rest, or going back with a clunk.
    receiver(lift: boolean) {
      const t = now();
      if (lift) {
        burst(t, { freq: 1800, type: "lowpass", gain: 0.12, decay: 0.05 });
        thump(t + 0.01, { from: 140, to: 90, gain: 0.1, decay: 0.06 });
      } else {
        thump(t, { from: 95, to: 55, gain: 0.45, decay: 0.12 });
        burst(t, { freq: 1600, type: "lowpass", gain: 0.3, decay: 0.06 });
        burst(t + 0.035, { freq: 2600, q: 1.2, gain: 0.08, decay: 0.03 });
      }
    },
    // Distant selectors stepping at the exchange while a call is put through.
    switching(seconds: number) {
      const t = now();
      const count = 4 + Math.floor(Math.random() * 4);
      for (let i = 0; i < count; i++) {
        lineClick(
          t + Math.random() * seconds * 0.85,
          0.04 + Math.random() * 0.05,
        );
      }
    },
    // One of the speaking clock's pips, a tenth of a second at 1 kHz, this many seconds away.
    pip(after: number) {
      if (!audio || after < 0) return;
      const at = audio.currentTime + after;
      const osc = audio.createOscillator();
      osc.frequency.value = 1000;
      const envelope = audio.createGain();
      envelope.gain.setValueAtTime(0, at);
      envelope.gain.linearRampToValueAtTime(0.2, at + 0.004);
      envelope.gain.setValueAtTime(0.2, at + 0.096);
      envelope.gain.linearRampToValueAtTime(0, at + 0.1);
      osc.connect(envelope).connect(gate);
      osc.start(at);
      osc.stop(at + 0.12);
    },
    dispose() {
      clearInterval(planner);
      void audio?.close();
      audio = null;
    },
  };
}

export type Sound = ReturnType<typeof createSound>;
