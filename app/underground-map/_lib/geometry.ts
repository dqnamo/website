import type { LabelDir, RouteMode, Vec } from "./types";

export const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y });
export const add = (a: Vec, b: Vec): Vec => ({ x: a.x + b.x, y: a.y + b.y });
export const mul = (a: Vec, s: number): Vec => ({ x: a.x * s, y: a.y * s });
export const dot = (a: Vec, b: Vec) => a.x * b.x + a.y * b.y;
export const cross = (a: Vec, b: Vec) => a.x * b.y - a.y * b.x;
export const len = (a: Vec) => Math.hypot(a.x, a.y);
export const dist = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);
export const perp = (a: Vec): Vec => ({ x: -a.y, y: a.x });
export const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

export function norm(a: Vec): Vec {
  const l = len(a);
  return l < 1e-9 ? { x: 0, y: 0 } : { x: a.x / l, y: a.y / l };
}

export function pairKey(a: string, b: string) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export function snapTo(p: Vec, grid: number): Vec {
  return { x: Math.round(p.x / grid) * grid, y: Math.round(p.y / grid) * grid };
}

/**
 * Route between two points using only horizontal, vertical and 45° legs —
 * the defining constraint of a Beck-style diagram.
 */
export function octilinearRoute(a: Vec, b: Vec, mode: RouteMode): Vec[] {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const adx = Math.abs(dx);
  const ady = Math.abs(dy);
  const sx = Math.sign(dx);
  const sy = Math.sign(dy);
  const A = { x: a.x, y: a.y };
  const B = { x: b.x, y: b.y };

  if (adx < 0.5 || ady < 0.5 || Math.abs(adx - ady) < 0.5) return [A, B];

  if (adx > ady) {
    const straight = adx - ady;
    if (mode === 1) return [A, { x: a.x + sx * straight, y: a.y }, B];
    if (mode === 2) return [A, { x: a.x + sx * ady, y: b.y }, B];
    const h = straight / 2;
    return [A, { x: a.x + sx * h, y: a.y }, { x: b.x - sx * h, y: b.y }, B];
  }
  const straight = ady - adx;
  if (mode === 1) return [A, { x: a.x, y: a.y + sy * straight }, B];
  if (mode === 2) return [A, { x: b.x, y: a.y + sy * adx }, B];
  const h = straight / 2;
  return [A, { x: a.x, y: a.y + sy * h }, { x: b.x, y: b.y - sy * h }, B];
}

const f = (n: number) => Math.round(n * 100) / 100;

/**
 * SVG path through the points with circular corners. `radius` can vary per
 * vertex so parallel lines get concentric arcs instead of pinching at a bend.
 */
export function roundedPath(input: Vec[], radius: number | number[]): string {
  const keep = input.map((p, i) => i === 0 || dist(p, input[i - 1]) > 0.01);
  const pts = input.filter((_, i) => keep[i]);
  const radii = Array.isArray(radius) ? radius.filter((_, i) => keep[i]) : null;
  if (pts.length < 2) return "";
  let d = `M${f(pts[0].x)} ${f(pts[0].y)}`;
  const n = pts.length;
  if (n === 2 || (typeof radius === "number" && radius <= 0)) {
    for (let i = 1; i < n; i++) d += `L${f(pts[i].x)} ${f(pts[i].y)}`;
    return d;
  }
  const dirs: Vec[] = [];
  const lens: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const v = sub(pts[i + 1], pts[i]);
    dirs.push(norm(v));
    lens.push(len(v));
  }
  for (let i = 1; i < n - 1; i++) {
    const u1 = dirs[i - 1];
    const u2 = dirs[i];
    const c = cross(u1, u2);
    const theta = Math.acos(clamp(dot(u1, u2), -1, 1));
    if (theta < 1e-3) {
      d += `L${f(pts[i].x)} ${f(pts[i].y)}`;
      continue;
    }
    const tanHalf = Math.tan(theta / 2);
    const r = Math.max(0, radii ? radii[i] : Number(radius));
    const maxPrev = i - 1 === 0 ? lens[i - 1] : lens[i - 1] / 2;
    const maxNext = i + 1 === n - 1 ? lens[i] : lens[i] / 2;
    const t = Math.min(r * tanHalf, maxPrev, maxNext);
    const rr = t / tanHalf;
    const p1 = sub(pts[i], mul(u1, t));
    const p2 = add(pts[i], mul(u2, t));
    d += `L${f(p1.x)} ${f(p1.y)}A${f(rr)} ${f(rr)} 0 0 ${c > 0 ? 1 : 0} ${f(p2.x)} ${f(p2.y)}`;
  }
  d += `L${f(pts[n - 1].x)} ${f(pts[n - 1].y)}`;
  return d;
}

export function nearestOnPolyline(
  pts: Vec[],
  p: Vec,
): { point: Vec; d: number } {
  let best = { point: pts[0], d: Infinity };
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const ab = sub(pts[i + 1], a);
    const l2 = dot(ab, ab);
    const t = l2 === 0 ? 0 : clamp(dot(sub(p, a), ab) / l2, 0, 1);
    const q = add(a, mul(ab, t));
    const dd = dist(p, q);
    if (dd < best.d) best = { point: q, d: dd };
  }
  return best;
}

const R = Math.SQRT1_2;
export const LABEL_DIRS: LabelDir[] = [
  "E",
  "SE",
  "S",
  "SW",
  "W",
  "NW",
  "N",
  "NE",
];
export const LABEL_VEC: Record<LabelDir, Vec> = {
  E: { x: 1, y: 0 },
  SE: { x: R, y: R },
  S: { x: 0, y: 1 },
  SW: { x: -R, y: R },
  W: { x: -1, y: 0 },
  NW: { x: -R, y: -R },
  N: { x: 0, y: -1 },
  NE: { x: R, y: -R },
};

export function octantOf(v: Vec): LabelDir {
  const i = Math.round(Math.atan2(v.y, v.x) / (Math.PI / 4));
  return LABEL_DIRS[((i % 8) + 8) % 8];
}
