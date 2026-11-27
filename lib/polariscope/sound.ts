// The polariscope's sounds, made on the spot with Web Audio: nothing is recorded or loaded.
//
// Tape coming off a roll screeches because the adhesive sticks and lets go hundreds of times a
// second, so the pull is a train of tiny clicks whose rate follows how fast the tape is drawn.
// The dispenser's blade snips it off, peeling it is the same stick and slip played backwards
// and shorter, and the filter's ring clicks into its detents. Polycarbonate creaks as it nears
// its limit, then splits with a sharp crack that rings for a moment.

import type { PolariscopeSounds } from "./engine";

export function createSounds() {
  let audio: AudioContext | null = null;
  let master: GainNode;
  let noise: AudioBuffer;
  let crackle: AudioBuffer;
  let pull: { source: AudioBufferSourceNode; gain: GainNode } | null = null;
  let enabled = true;

  // The context waits for a press, as browsers ask; everything before that is silent.
  function ensure() {
    if (!enabled) return null;
    if (audio) {
      if (audio.state === "suspended") void audio.resume();
      return audio;
    }
    const Context =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Context) return null;
    audio = new Context();
    master = audio.createGain();
    master.gain.value = 0.55;
    master.connect(audio.destination);
    const rate = audio.sampleRate;
    noise = audio.createBuffer(1, rate, rate);
    const white = noise.getChannelData(0);
    for (let i = 0; i < white.length; i++) white[i] = Math.random() * 2 - 1;
    // A second of stick and slip: sharp little releases at uneven intervals, about 500 a second.
    crackle = audio.createBuffer(1, rate, rate);
    const clicks = crackle.getChannelData(0);
    let at = 0;
    while (at < clicks.length) {
      const size = 0.3 + Math.random() * 0.7;
      const length = Math.round(rate * 0.0006);
      for (let i = 0; i < length && at + i < clicks.length; i++) {
        clicks[at + i] +=
          size * (Math.random() * 2 - 1) * Math.exp(-i / (length / 4));
      }
      at += Math.round(rate * (0.0008 + Math.random() * 0.0028));
    }
    return audio;
  }

  function burst(
    buffer: AudioBuffer,
    {
      gain,
      decay,
      freq,
      q = 1,
      type = "bandpass",
      rate = 1,
      sweepTo,
      delay = 0,
    }: {
      gain: number;
      decay: number;
      freq: number;
      q?: number;
      type?: BiquadFilterType;
      rate?: number;
      sweepTo?: number;
      delay?: number;
    },
  ) {
    const context = ensure();
    if (!context) return;
    const now = context.currentTime + delay;
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = rate;
    const filter = context.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(freq, now);
    if (sweepTo) {
      filter.frequency.exponentialRampToValueAtTime(sweepTo, now + decay * 3);
    }
    filter.Q.value = q;
    const envelope = context.createGain();
    envelope.gain.setValueAtTime(0, now);
    envelope.gain.linearRampToValueAtTime(gain, now + 0.002);
    envelope.gain.setTargetAtTime(0, now + 0.002, decay);
    source.connect(filter).connect(envelope).connect(master);
    source.start(now, Math.random() * 0.5);
    source.stop(now + decay * 8 + 0.05);
  }

  function ring(freq: number, gain: number, decay: number) {
    const context = ensure();
    if (!context) return;
    const now = context.currentTime;
    const tone = context.createOscillator();
    tone.frequency.value = freq;
    const envelope = context.createGain();
    envelope.gain.setValueAtTime(gain, now);
    envelope.gain.setTargetAtTime(0, now, decay);
    tone.connect(envelope).connect(master);
    tone.start(now);
    tone.stop(now + decay * 8);
  }

  const sounds: PolariscopeSounds = {
    // Speed in CSS pixels a second; zero stops the screech.
    pull(speed) {
      if (speed <= 0) {
        if (pull && audio) {
          pull.gain.gain.setTargetAtTime(0, audio.currentTime, 0.02);
          const ending = pull;
          setTimeout(() => ending.source.stop(), 200);
          pull = null;
        }
        return;
      }
      const context = ensure();
      if (!context) return;
      if (!pull) {
        const source = context.createBufferSource();
        source.buffer = crackle;
        source.loop = true;
        const high = context.createBiquadFilter();
        high.type = "highpass";
        high.frequency.value = 900;
        const body = context.createBiquadFilter();
        body.type = "peaking";
        body.frequency.value = 2600;
        body.gain.value = 8;
        const gain = context.createGain();
        gain.gain.value = 0;
        source.connect(high).connect(body).connect(gain).connect(master);
        source.start();
        pull = { source, gain };
      }
      const now = context.currentTime;
      const pace = Math.min(speed / 700, 1.6);
      pull.source.playbackRate.setTargetAtTime(0.35 + pace, now, 0.03);
      pull.gain.gain.setTargetAtTime(
        Math.min(0.5, 0.08 + pace * 0.35),
        now,
        0.03,
      );
    },
    snip() {
      if (!noise) ensure();
      if (!noise) return;
      burst(noise, {
        gain: 0.35,
        decay: 0.006,
        freq: 3800,
        q: 0.8,
        type: "highpass",
      });
      burst(noise, { gain: 0.2, decay: 0.01, freq: 5200, q: 3, delay: 0.012 });
    },
    peel() {
      if (!crackle) ensure();
      if (!crackle) return;
      burst(crackle, {
        gain: 0.7,
        decay: 0.07,
        freq: 3200,
        q: 0.9,
        rate: 1.8,
        sweepTo: 1200,
      });
    },
    click() {
      if (!noise) ensure();
      if (!noise) return;
      burst(noise, { gain: 0.18, decay: 0.002, freq: 4200, q: 2 });
      ring(2300, 0.025, 0.012);
    },
    creak() {
      if (!crackle) ensure();
      if (!crackle) return;
      burst(crackle, { gain: 0.9, decay: 0.05, freq: 850, q: 4, rate: 0.22 });
    },
    crack() {
      if (!noise) ensure();
      if (!noise) return;
      burst(noise, {
        gain: 0.9,
        decay: 0.008,
        freq: 2000,
        q: 0.5,
        type: "highpass",
      });
      burst(noise, {
        gain: 0.5,
        decay: 0.03,
        freq: 160,
        q: 0.7,
        type: "lowpass",
      });
      ring(2870, 0.09, 0.05);
      ring(4610, 0.05, 0.035);
      ring(1340, 0.05, 0.06);
    },
  };

  return {
    sounds,
    setEnabled(next: boolean) {
      enabled = next;
      if (!next) sounds.pull(0);
      if (master && audio) {
        master.gain.setTargetAtTime(next ? 0.55 : 0, audio.currentTime, 0.02);
      }
    },
    dispose() {
      sounds.pull(0);
      void audio?.close();
      audio = null;
    },
  };
}
