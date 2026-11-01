// Listening for a sung or whistled note, so it can drive the plate. The pitch is found the way
// the YIN method finds it: compare the sound with itself a little later, and the first delay at
// which it matches closely is one period of the note. Only the pitch and loudness are kept,
// a few dozen times a second; the sound itself is never stored or sent anywhere.

export type Heard = { hz: number; level: number } | null;

const LOWEST = 70;
const HIGHEST = 2500;
// How close a match has to be, as a fraction of the sound's own variation, to count as a note.
const THRESHOLD = 0.15;

function pitch(samples: Float32Array, rate: number, difference: Float32Array) {
  const shortest = Math.floor(rate / HIGHEST);
  const longest = Math.min(
    Math.floor(samples.length / 2),
    Math.ceil(rate / LOWEST),
  );
  const span = samples.length - longest;
  difference[0] = 1;
  let running = 0;
  for (let lag = 1; lag <= longest; lag++) {
    let sum = 0;
    for (let j = 0; j < span; j++) {
      const d = samples[j] - samples[j + lag];
      sum += d * d;
    }
    running += sum;
    difference[lag] = running > 0 ? (sum * lag) / running : 1;
  }
  for (let lag = shortest; lag < longest; lag++) {
    if (difference[lag] >= THRESHOLD) continue;
    while (lag + 1 < longest && difference[lag + 1] < difference[lag]) lag++;
    // A parabola through the dip and its neighbours finds the period between samples.
    const a = difference[lag - 1];
    const b = difference[lag];
    const c = difference[lag + 1];
    const shift = (a - c) / (2 * (a - 2 * b + c) || 1);
    return rate / (lag + Math.max(-1, Math.min(1, shift)));
  }
  return null;
}

export async function listen(onHeard: (heard: Heard, level: number) => void) {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      autoGainControl: false,
      echoCancellation: false,
      noiseSuppression: false,
    },
  });
  const audio = new AudioContext();
  // Made after the permission prompt, it may start suspended.
  void audio.resume();
  const analyser = audio.createAnalyser();
  analyser.fftSize = 2048;
  audio.createMediaStreamSource(stream).connect(analyser);
  const samples = new Float32Array(analyser.fftSize);
  const difference = new Float32Array(analyser.fftSize);
  let quiet = -1;
  let level = 0;
  let held: number | null = null;
  let frame = 0;

  const loop = () => {
    analyser.getFloatTimeDomainData(samples);
    let sum = 0;
    for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
    const rms = Math.sqrt(sum / samples.length);
    // The room's own hum follows the softest sound, creeping up slowly.
    quiet = quiet < 0 ? rms : Math.min(rms, quiet + 0.00005);
    const loud = Math.min(1, Math.max(0, (rms - quiet * 1.5 - 0.004) / 0.08));
    level += (loud - level) * 0.3;
    const hz =
      loud > 0.02 ? pitch(samples, audio.sampleRate, difference) : null;
    // A note is followed smoothly in pitch, so vibrato doesn't scatter the sand.
    if (hz) held = held ? held * (hz / held) ** 0.35 : hz;
    else if (level < 0.02) held = null;
    onHeard(held && level > 0.02 ? { hz: held, level } : null, level);
    frame = requestAnimationFrame(loop);
  };
  loop();

  return {
    stop() {
      cancelAnimationFrame(frame);
      for (const track of stream.getTracks()) track.stop();
      void audio.close();
    },
  };
}
