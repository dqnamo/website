// A jittered grid of points, read as a Voronoi diagram: every pixel belongs to its nearest point,
// and how much nearer that point is than the next one says how close the pixel sits to a
// boundary. It stands in for the plates a brittle ink film breaks into. Each plate carries a
// random value of its own, for deciding things plate by plate.

export type Grid = {
  size: number;
  gw: number;
  gh: number;
  jx: Float32Array;
  jy: Float32Array;
  value: Float32Array;
};

// A small seeded generator (mulberry32), so a sheet prints the same way each time.
export function random(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeGrid(
  width: number,
  height: number,
  size: number,
  rand: () => number,
): Grid {
  const gw = Math.ceil(width / size) + 1;
  const gh = Math.ceil(height / size) + 1;
  const count = gw * gh;
  const jx = new Float32Array(count);
  const jy = new Float32Array(count);
  const value = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    jx[i] = 0.08 + rand() * 0.84;
    jy[i] = 0.08 + rand() * 0.84;
    value[i] = rand();
  }
  return { size, gw, gh, jx, jy, value };
}

// Reused for every lookup, so the hot loops don't allocate; read it straight away.
const hit = { id: 0, d1: 0, d2: 0 };

export function nearest(grid: Grid, x: number, y: number) {
  const { size, gw, gh, jx, jy } = grid;
  const cx = Math.floor(x / size);
  const cy = Math.floor(y / size);
  let d1 = Infinity;
  let d2 = Infinity;
  let id = 0;
  for (let oy = -1; oy <= 1; oy++) {
    const gy = cy + oy;
    if (gy < 0 || gy >= gh) continue;
    for (let ox = -1; ox <= 1; ox++) {
      const gx = cx + ox;
      if (gx < 0 || gx >= gw) continue;
      const i = gy * gw + gx;
      const dx = (gx + jx[i]) * size - x;
      const dy = (gy + jy[i]) * size - y;
      const d = dx * dx + dy * dy;
      if (d < d1) {
        d2 = d1;
        d1 = d;
        id = i;
      } else if (d < d2) {
        d2 = d;
      }
    }
  }
  hit.id = id;
  hit.d1 = Math.sqrt(d1);
  hit.d2 = Math.sqrt(d2);
  return hit;
}
