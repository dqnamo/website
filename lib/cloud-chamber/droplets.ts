// The droplets are all you ever see in a cloud chamber. A charged particle tears electrons off
// the air molecules it passes, leaving a line of ions; in the supersaturated layer each ion is
// a seed that alcohol condenses on, and in a tenth of a second it has grown into a droplet big
// enough to scatter the torch's light. So a track appears a moment after the particle has gone,
// as a string of droplets, and goes as they drift apart on the air and settle on the floor.
// Bigger droplets fall faster, so a track sinks as it grows.
//
// The air moves too. Cold air pools on the floor, warmer air from the felt comes down to replace
// it, and the layer turns slowly over. That's a stream function of a few slowly changing modes,
// each of which is zero at the walls, so the air runs along them and never through them. It's
// slower near the floor, which shears a track as it ages: its top drifts and its foot stays.
// Lifting the lid lets the room's air tumble in and stirs smaller eddies through it all.

import { clamp, HALF, LAYER_TOP } from "./chamber";

// Drift speeds are a few millimetres a second, as they are in a settled chamber.
const DRIFT = 0.3;
const GRID = 24;
// How fast a full-grown droplet falls, in cm/s.
const FALL = 0.55;
// Droplets condense in about 0.1 s.
const GROW = 0.1;
// Eddies spread a track: about 1 mm in its first second.
const DIFFUSE = 0.004;
const MAX_AGE = 7;

type Mode = { k: number; m: number; amp: number; rate: number; phase: number };

export function createFlow() {
  const n = GRID + 1;
  const u = new Float32Array(n * n);
  const v = new Float32Array(n * n);
  const span = HALF * 2;
  const make = (k: number, m: number, speed: number): Mode => ({
    k,
    m,
    // Amplitude for a peak speed of about `speed`.
    amp: (speed * span) / (Math.PI * Math.max(k, m)),
    rate: 0.05 + Math.random() * 0.12,
    phase: Math.random() * Math.PI * 2,
  });
  // The slow turnover, and smaller eddies on top.
  const calm = [
    make(1, 1, DRIFT),
    make(1, 2, DRIFT * 0.7),
    make(2, 1, DRIFT * 0.7),
    make(2, 2, DRIFT * 0.5),
    make(3, 2, DRIFT * 0.35),
    make(2, 3, DRIFT * 0.35),
  ];
  // What the room's air brings in when the lid comes off.
  const rough = [
    make(3, 4, 2.2),
    make(4, 3, 2.2),
    make(5, 5, 1.6),
    make(2, 5, 1.8),
    make(6, 4, 1.2),
  ];
  for (const mode of rough) mode.rate = 0.4 + Math.random() * 0.6;

  let clock = Math.random() * 100;
  let stir = 0;
  const sinX = new Float64Array(n);
  const cosX = new Float64Array(n);

  const add = (modes: Mode[], scale: number) => {
    if (scale < 1e-3) return;
    for (const mode of modes) {
      const a = mode.amp * scale * Math.sin(clock * mode.rate + mode.phase);
      const kx = (mode.k * Math.PI) / span;
      const ky = (mode.m * Math.PI) / span;
      for (let i = 0; i < n; i++) {
        sinX[i] = Math.sin((kx * i * span) / GRID);
        cosX[i] = Math.cos((kx * i * span) / GRID);
      }
      for (let j = 0; j < n; j++) {
        const sy = Math.sin((ky * j * span) / GRID);
        const cy = Math.cos((ky * j * span) / GRID);
        // u = ∂ψ/∂y and v = −∂ψ/∂x, for ψ = a sin(kx X) sin(ky Y).
        for (let i = 0; i < n; i++) {
          u[j * n + i] += a * ky * sinX[i] * cy;
          v[j * n + i] -= a * kx * cosX[i] * sy;
        }
      }
    }
  };

  const update = (dt: number) => {
    clock += dt;
    stir *= Math.exp(-dt / 4);
    u.fill(0);
    v.fill(0);
    add(calm, 1);
    add(rough, stir);
  };
  update(0);

  return {
    update,
    // Stirs the air: 1 is the lid lifted off and put back.
    stir(amount: number) {
      stir = Math.min(1.5, stir + amount);
    },
    get stirring() {
      return stir;
    },
    // The air's velocity at (x, y), into out[0] and out[1].
    sample(x: number, y: number, out: Float32Array) {
      const fx = clamp(((x + HALF) / span) * GRID, 0, GRID - 1e-3);
      const fy = clamp(((y + HALF) / span) * GRID, 0, GRID - 1e-3);
      const i = fx | 0;
      const j = fy | 0;
      const tx = fx - i;
      const ty = fy - j;
      const a = j * n + i;
      const b = a + n;
      out[0] =
        (u[a] * (1 - tx) + u[a + 1] * tx) * (1 - ty) +
        (u[b] * (1 - tx) + u[b + 1] * tx) * ty;
      out[1] =
        (v[a] * (1 - tx) + v[a + 1] * tx) * (1 - ty) +
        (v[b] * (1 - tx) + v[b + 1] * tx) * ty;
    },
  };
}

export type Flow = ReturnType<typeof createFlow>;

export function createDroplets(capacity: number, flow: Flow) {
  const x = new Float32Array(capacity);
  const y = new Float32Array(capacity);
  const z = new Float32Array(capacity);
  // When the droplet starts to grow, on the simulation clock.
  const born = new Float32Array(capacity);
  // How much light it scatters when grown.
  const size = new Float32Array(capacity);
  // How fast it falls when grown, relative to a track droplet; rain falls faster.
  const fall = new Float32Array(capacity);
  const track = new Float32Array(capacity);
  const air = new Float32Array(2);
  let count = 0;

  const remove = (i: number) => {
    const last = --count;
    x[i] = x[last];
    y[i] = y[last];
    z[i] = z[last];
    born[i] = born[last];
    size[i] = size[last];
    fall[i] = fall[last];
    track[i] = track[last];
  };

  return {
    get count() {
      return count;
    },
    add(
      px: number,
      py: number,
      pz: number,
      start: number,
      weight: number,
      id: number,
      falls = 1,
    ) {
      // When full, replace one at random rather than drop the newest, so a busy chamber thins
      // its old tracks instead of losing new ones.
      const i = count < capacity ? count++ : (Math.random() * capacity) | 0;
      x[i] = px;
      y[i] = py;
      z[i] = pz;
      born[i] = start;
      size[i] = weight;
      fall[i] = falls;
      track[i] = id;
    },
    step(dt: number, now: number) {
      const jiggle = Math.sqrt(2 * DIFFUSE * dt) * 1.73 * 2;
      const stirring = flow.stirring;
      for (let i = count - 1; i >= 0; i--) {
        const age = now - born[i];
        if (age < 0) continue;
        if (age > MAX_AGE) {
          remove(i);
          continue;
        }
        const grown = 1 - Math.exp(-age / GROW);
        flow.sample(x[i], y[i], air);
        // Still air at the floor, full drift a centimetre up.
        const shear = Math.min(1, z[i] * 1.1);
        x[i] += air[0] * shear * dt + (Math.random() - 0.5) * jiggle;
        y[i] += air[1] * shear * dt + (Math.random() - 0.5) * jiggle;
        z[i] +=
          -FALL * fall[i] * grown * dt +
          (Math.random() - 0.5) * jiggle * (0.5 + stirring * 6);
        if (
          z[i] <= 0 ||
          x[i] < -HALF ||
          x[i] > HALF ||
          y[i] < -HALF ||
          y[i] > HALF
        ) {
          remove(i);
        }
      }
    },
    // Packs what the GPU needs: x, y, z, brightness and track id, five floats each.
    write(out: Float32Array, now: number) {
      let n = 0;
      for (let i = 0; i < count; i++) {
        const age = now - born[i];
        if (age <= 0) continue;
        const grown = 1 - Math.exp(-age / GROW);
        // Fade on landing, and as the warm air above the layer evaporates it.
        const height = z[i];
        let b = size[i] * grown;
        if (height < 0.06) b *= height / 0.06;
        if (height > LAYER_TOP + 1.5 && fall[i] === 1) b *= 0.5;
        if (age > MAX_AGE - 1.5) b *= (MAX_AGE - age) / 1.5;
        const o = n * 5;
        out[o] = x[i];
        out[o + 1] = y[i];
        out[o + 2] = height;
        out[o + 3] = b;
        out[o + 4] = track[i];
        n++;
      }
      return n;
    },
    // The live droplet nearest (px, py) on the floor within reach, as its track id, or -1.
    nearest(px: number, py: number, reach: number, minId: number) {
      let best = -1;
      let bestD = reach * reach;
      for (let i = 0; i < count; i++) {
        if (track[i] < minId) continue;
        const dx = x[i] - px;
        const dy = y[i] - py;
        const d = dx * dx + dy * dy;
        if (d < bestD) {
          bestD = d;
          best = track[i];
        }
      }
      return best;
    },
    // Lifting the lid: warm air evaporates the smallest droplets and lifts the rest.
    disturb() {
      for (let i = count - 1; i >= 0; i--) {
        if (Math.random() < 0.6) {
          remove(i);
          continue;
        }
        z[i] += Math.random() * 1.5;
      }
    },
    clear() {
      count = 0;
    },
  };
}

export type Droplets = ReturnType<typeof createDroplets>;
