// Smoke, and the sparks of a struck match, as particles. A wick just blown out breathes wax
// vapour that cools into a fog of droplets: white where light catches it, and still able to
// burn for a second or two. It rises as a single thread, because it's warm, and stays a smooth
// thread for a few centimetres until the stirring of the room catches it, when it starts to
// sway, then curls into eddies and spreads out thin. Each particle carries the height it left
// from, so the stirring can grow with distance from the source, and the stirring itself is
// the curl of a few drifting waves: like real air it swirls without bunching up or thinning,
// so a thread stays a thread while it bends. A flame that flickers hard sheds a little soot
// from its tip, which is dark instead of white.

export const VAPOUR = 0;
export const SOOT = 1;
export const MATCH_SMOKE = 2;
export const SPARK = 3;
// The breath of smoke a flame leaves as it's blown out.
export const PUFF = 4;

type Wave = { kx: number; ky: number; w: number; p: number; a: number };

const makeWaves = (n: number, lo: number, hi: number): Wave[] =>
  Array.from({ length: n }, () => {
    const angle = Math.random() * Math.PI * 2;
    const length = lo + Math.random() * (hi - lo);
    const k = (Math.PI * 2) / length;
    return {
      kx: Math.cos(angle) * k,
      ky: Math.sin(angle) * k,
      w: 0.6 + Math.random() * 1.6,
      p: Math.random() * Math.PI * 2,
      a: 1 / (k * Math.sqrt(n)),
    };
  });

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export type Smoke = ReturnType<typeof createSmoke>;

export function createSmoke(capacity = 14000) {
  const x = new Float32Array(capacity);
  const y = new Float32Array(capacity);
  const z = new Float32Array(capacity);
  const vx = new Float32Array(capacity);
  const vy = new Float32Array(capacity);
  const vz = new Float32Array(capacity);
  const age = new Float32Array(capacity);
  const life = new Float32Array(capacity);
  const y0 = new Float32Array(capacity);
  const kind = new Uint8Array(capacity);
  const source = new Int16Array(capacity);
  const waves = makeWaves(6, 2.5, 8);
  const depthWaves = makeWaves(4, 3, 9);
  let count = 0;

  // The swirl at a point, as a velocity of about 1, rising with the plume.
  const swirl = (px: number, py: number, t: number) => {
    let dx = 0;
    let dy = 0;
    let dz = 0;
    const ry = py - 14 * t;
    for (const wave of waves) {
      const c = Math.cos(wave.kx * px + wave.ky * ry + wave.w * t + wave.p);
      dx += wave.a * wave.ky * c;
      dy -= wave.a * wave.kx * c;
    }
    for (const wave of depthWaves) {
      dz +=
        wave.a *
        wave.kx *
        Math.cos(wave.kx * px + wave.ky * ry + wave.w * t + wave.p);
    }
    return [dx * 1.6, dy * 1.6, dz * 1.6] as const;
  };

  const remove = (i: number) => {
    const j = --count;
    x[i] = x[j];
    y[i] = y[j];
    z[i] = z[j];
    vx[i] = vx[j];
    vy[i] = vy[j];
    vz[i] = vz[j];
    age[i] = age[j];
    life[i] = life[j];
    y0[i] = y0[j];
    kind[i] = kind[j];
    source[i] = source[j];
  };

  return {
    get count() {
      return count;
    },
    x,
    y,
    z,
    age,
    kind,
    source,

    emit(
      px: number,
      py: number,
      pz: number,
      ux: number,
      uy: number,
      uz: number,
      k: number,
      src: number,
      span: number,
      // Seconds it left before now, within this frame: particles leaving together would
      // move as a clump, and a thread would look like a string of beads.
      ahead = 0,
    ) {
      if (count >= capacity) return;
      const i = count++;
      x[i] = px + ux * ahead;
      y[i] = py + uy * ahead;
      z[i] = pz + uz * ahead;
      vx[i] = ux;
      vy[i] = uy;
      vz[i] = uz;
      age[i] = ahead;
      life[i] = span;
      y0[i] = py;
      kind[i] = k;
      source[i] = src;
    },

    // Moves everything on by dt seconds. wind gives the air's own movement at a point, in
    // centimetres a second: breath and draught.
    step(
      dt: number,
      t: number,
      wind: (px: number, py: number, pz: number) => [number, number, number],
    ) {
      for (let i = count - 1; i >= 0; i--) {
        age[i] += dt;
        if (age[i] > life[i] || y[i] > 60) {
          remove(i);
          continue;
        }
        if (kind[i] === SPARK) {
          // A spark is a fleck of burning head: thrown, falling, slowed by the air.
          const drag = Math.exp(-dt * 3);
          vx[i] *= drag;
          vz[i] *= drag;
          vy[i] = vy[i] * drag - 600 * dt;
        } else {
          const h = Math.max(0, y[i] - y0[i]);
          const a = age[i];
          const rise =
            kind[i] === SOOT
              ? 6 + 10 * (1 - Math.exp(-a / 0.5))
              : 8 + 17 * (1 - Math.exp(-a / 0.6));
          const stir =
            (kind[i] === MATCH_SMOKE ? 4 : 0) + 15 * smooth(2.5, 14, h);
          const [sx, sy, sz] = swirl(x[i], y[i], t);
          const [wx, wy, wz] = wind(x[i], y[i], z[i]);
          const tx = sx * stir + wx;
          const ty = rise * Math.max(0, 1 - 0.015 * h) + sy * stir * 0.7 + wy;
          const tz = sz * stir * 0.6 + wz;
          const k = 1 - Math.exp(-dt * 7);
          vx[i] += (tx - vx[i]) * k;
          vy[i] += (ty - vy[i]) * k;
          vz[i] += (tz - vz[i]) * k;
        }
        x[i] += vx[i] * dt;
        y[i] += vy[i] * dt;
        z[i] += vz[i] * dt;
      }
    },

    // Size (cm) and opacity of particle i: it spreads as it rises and mixes, thinning as it
    // goes, so a fine dense thread becomes a faint broad haze.
    look(i: number) {
      const a = age[i];
      const h = Math.max(0, y[i] - y0[i]);
      const k = kind[i];
      if (k === SPARK) return { size: 0.07, alpha: 1 - a / life[i] };
      const base = k === SOOT ? 0.16 : k === PUFF ? 0.45 : 0.1;
      const size = base + (k === PUFF ? 0.9 : 0.2) * a + 0.05 * h;
      const fade =
        smooth(0, 0.06, a) * (1 - smooth(0.55, 1, a / Math.max(life[i], 0.01)));
      const dense =
        k === SOOT ? 0.22 : k === MATCH_SMOKE ? 0.24 : k === PUFF ? 0.1 : 0.16;
      return { size, alpha: dense * (base / size) ** 1.25 * fade };
    },

    clear() {
      count = 0;
    },
  };
}
