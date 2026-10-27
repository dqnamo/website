import { mapFontFamily } from "./fonts";
import {
  add,
  clamp,
  cross,
  dist,
  dot,
  LABEL_DIRS,
  LABEL_VEC,
  len,
  mul,
  nearestOnPolyline,
  norm,
  octantOf,
  octilinearRoute,
  pairKey,
  perp,
  roundedPath,
  sub,
} from "./geometry";
import type { LabelDir, MapDoc, RouteMode, Station, Vec } from "./types";

/**
 * Radix gray, light and dark — the same scale as the site's grayscale tokens, with the map on
 * grayscale-1. Spelled out as hex rather than CSS variables so an exported SVG keeps its colours.
 */
export const THEMES = {
  paper: {
    bg: "#fcfcfc",
    grid: "#cecece",
    label: "#202020",
    halo: "#fcfcfc",
    ink: "#202020",
    fill: "#fcfcfc",
  },
  night: {
    bg: "#111111",
    grid: "#3a3a3a",
    label: "#eeeeee",
    halo: "#111111",
    ink: "#eeeeee",
    fill: "#111111",
  },
} as const;

export type Theme = (typeof THEMES)[keyof typeof THEMES];

/** Fixed Beck-style proportions. These are the house style, not settings. */
export const TUBE = {
  lineWidth: 8,
  lineGap: 0,
  cornerRadius: 28,
  stationSize: 9,
  labelSize: 14,
} as const;

const LW = TUBE.lineWidth;
/** Lines in a bundle touch, overlapping by a hair so anti-aliasing doesn't leave a seam between them. */
const SPACING = TUBE.lineWidth + TUBE.lineGap - 0.5;
const RING = Math.max(1.75, LW * 0.36);
const TICK_W = LW * 0.72;
/** A bend that lands on a station stays tight so the line still runs under its marker. */
const STATION_RADIUS = LW;

/** One continuous run of a line, drawn as a single path. */
export interface RTrack {
  id: string;
  line: string;
  color: string;
  d: string;
  delay: number;
}

/** One hop of one line. Not drawn — used for hit-testing and selection. */
export interface RSeg {
  id: string;
  line: string;
  color: string;
  key: string;
  d: string;
}

export interface RStation {
  s: Station;
  kind: "none" | "single" | "interchange";
  color: string | null;
  lines: string[];
  /** The station's circle. Null when the station is a tick. */
  marker: { x: number; y: number; r: number } | null;
  ring: number;
  /** distance from centre to the marker's outer edge */
  extent: number;
  tick: { x1: number; y1: number; x2: number; y2: number } | null;
  label: {
    x: number;
    y: number;
    anchor: "start" | "middle" | "end";
    dy: string;
    dir: LabelDir;
  };
  delay: number;
}

export interface RPair {
  key: string;
  /** centreline route from `a` to `b` */
  pts: Vec[];
  lines: string[];
  a: string;
  b: string;
  /** the shape actually drawn, whether picked automatically or set by hand */
  mode: RouteMode;
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface RenderModel {
  tracks: RTrack[];
  segs: RSeg[];
  stations: RStation[];
  stationMap: Map<string, RStation>;
  pairs: Map<string, RPair>;
  bounds: Bounds | null;
}

export function getBounds(stations: Vec[]): Bounds | null {
  if (!stations.length) return null;
  const b = {
    minX: Infinity,
    minY: Infinity,
    maxX: -Infinity,
    maxY: -Infinity,
  };
  for (const s of stations) {
    b.minX = Math.min(b.minX, s.x);
    b.minY = Math.min(b.minY, s.y);
    b.maxX = Math.max(b.maxX, s.x);
    b.maxY = Math.max(b.maxY, s.y);
  }
  return b;
}

// ── route shapes ─────────────────────────────────────────────

interface RouteOption {
  mode: RouteMode;
  pts: Vec[];
  /** heading leaving `a`, and leaving `b` */
  outA: Vec;
  outB: Vec;
  bends: number;
}

interface PairInfo {
  key: string;
  a: string;
  b: string;
  lines: string[];
  options: RouteOption[];
  pick: number;
}

function routeOptions(
  a: Vec,
  b: Vec,
  override: RouteMode | undefined,
): RouteOption[] {
  const modes: RouteMode[] = override === undefined ? [1, 2, 0] : [override];
  const options = modes.map((mode) => {
    const pts = octilinearRoute(a, b, mode);
    const n = pts.length;
    return {
      mode,
      pts,
      outA: norm(sub(pts[1], pts[0])),
      outB: norm(sub(pts[n - 2], pts[n - 1])),
      bends: n - 2,
    };
  });
  // Straight and pure-diagonal hops only have one shape.
  return options[0].bends === 0
    ? [{ ...options[0], mode: override ?? 0 }]
    : options;
}

const TURN_COST = [0, 1, 4, 12, 30];
/** Parallel track closer than this, without actually being shared, reads as a near miss. */
const NEAR = SPACING * 2.2;

/** How many legs of `a` run parallel to, and just beside, a leg of `b`. */
function nearMisses(a: Vec[], b: Vec[]) {
  let n = 0;
  for (let i = 0; i < a.length - 1; i++) {
    const p = a[i];
    const d = norm(sub(a[i + 1], p));
    const la = dist(p, a[i + 1]);
    for (let j = 0; j < b.length - 1; j++) {
      if (Math.abs(cross(d, norm(sub(b[j + 1], b[j])))) > 1e-6) continue;
      const gap = Math.abs(cross(d, sub(b[j], p)));
      if (gap < 0.5 || gap > NEAR) continue;
      const t0 = dot(sub(b[j], p), d);
      const t1 = dot(sub(b[j + 1], p), d);
      if (Math.min(la, Math.max(t0, t1)) - Math.max(0, Math.min(t0, t1)) > 4)
        n++;
    }
  }
  return n;
}

/** u and v both point away from the station; running straight through means u = -v. */
function turnCost(u: Vec, v: Vec) {
  const turn = Math.acos(clamp(-dot(u, v), -1, 1));
  return TURN_COST[Math.round(turn / (Math.PI / 4))];
}

/**
 * Pick each hop's shape so lines run straight through their stops, turning
 * as little as possible. Coordinate descent: cheap, deterministic, and good
 * enough for hand-drawn networks.
 */
function chooseRoutes(pairs: PairInfo[]) {
  const at = new Map<string, PairInfo[]>();
  for (const p of pairs)
    for (const id of [p.a, p.b]) at.set(id, [...(at.get(id) ?? []), p]);
  const heading = (p: PairInfo, id: string) => {
    const o = p.options[p.pick];
    return id === p.a ? o.outA : o.outB;
  };

  const stationCost = (id: string) => {
    const ps = at.get(id)!;
    const dirs = ps.map((p) => heading(p, id));
    const byLine = new Map<string, Vec[]>();
    ps.forEach((p, i) => {
      for (const l of p.lines)
        byLine.set(l, [...(byLine.get(l) ?? []), dirs[i]]);
    });
    let cost = 0;
    for (const us of byLine.values()) {
      for (let i = 0; i < us.length && us.length > 1; i++) {
        let best = Infinity;
        for (let j = 0; j < us.length; j++)
          if (j !== i) best = Math.min(best, turnCost(us[i], us[j]));
        cost += best / 2;
      }
    }
    // Different neighbours leaving on the same heading would share track for no reason.
    for (let i = 0; i < dirs.length; i++)
      for (let j = i + 1; j < dirs.length; j++)
        if (dot(dirs[i], dirs[j]) > 0.99) cost += 0.3;
    return cost;
  };

  // Only pairs whose routes could come near each other can clash.
  const boxes = new Map(
    pairs.map((p) => {
      const all = p.options.flatMap((o) => o.pts);
      const xs = all.map((q) => q.x);
      const ys = all.map((q) => q.y);
      return [
        p,
        {
          x0: Math.min(...xs),
          y0: Math.min(...ys),
          x1: Math.max(...xs),
          y1: Math.max(...ys),
        },
      ];
    }),
  );
  const neighbours = new Map(
    pairs.map((p) => {
      const a = boxes.get(p)!;
      return [
        p,
        pairs.filter((q) => {
          const b = boxes.get(q)!;
          return (
            q !== p &&
            b.x0 < a.x1 + NEAR &&
            b.x1 > a.x0 - NEAR &&
            b.y0 < a.y1 + NEAR &&
            b.y1 > a.y0 - NEAR
          );
        }),
      ];
    }),
  );
  const clash = (p: PairInfo) => {
    const pts = p.options[p.pick].pts;
    let n = 0;
    for (const q of neighbours.get(p)!)
      n += nearMisses(pts, q.options[q.pick].pts);
    return n * 1.5;
  };

  const free = pairs
    .filter((p) => p.options.length > 1)
    .sort((m, n) => (m.key < n.key ? -1 : 1));
  for (let pass = 0; pass < 8; pass++) {
    let changed = false;
    for (const p of free) {
      const was = p.pick;
      let best = was;
      let bestCost = Infinity;
      for (let i = 0; i < p.options.length; i++) {
        p.pick = i;
        const c =
          stationCost(p.a) +
          stationCost(p.b) +
          p.options[i].bends * 0.25 +
          clash(p);
        if (c < bestCost - 1e-9) {
          bestCost = c;
          best = i;
        }
      }
      p.pick = best;
      if (best !== was) changed = true;
    }
    if (!changed) break;
  }
}

// ── track graph ──────────────────────────────────────────────
// Every route is cut wherever another route's corner or a station sits on it,
// so any stretch two lines share — even between different stations — becomes
// one edge carrying both, and gets bundled side by side.

interface GNode {
  key: string;
  p: Vec;
  station: string | null;
}

interface GEdge {
  u: GNode;
  v: GNode;
  /** unit heading u → v */
  dir: Vec;
  /** lines, ordered across the edge from the -perp side to the +perp side */
  lines: string[];
  off: Map<string, number>;
}

interface Leg {
  p: Vec;
  q: Vec;
  d: Vec;
  len: number;
  /** offset to the left (perp) of the direction of travel */
  o: number;
}

// ── labels ───────────────────────────────────────────────────

type Arm = { u: Vec; line: string; o: number; pos: Vec };

interface Draft {
  s: Station;
  kind: RStation["kind"];
  lines: string[];
  arms: Arm[];
  marker: RStation["marker"];
  /** where a single-line station's tick sits, and which way is clear of a bundle */
  single: { pos: Vec; p: Vec; outward: Vec | null; terminus: boolean } | null;
}

type Rect = { x0: number; y0: number; x1: number; y1: number };

/** A thick segment (track, marker) or a placed label's box. */
interface Obstacle {
  a: Vec;
  b: Vec;
  r: number;
  box: Rect;
  owner: string | null;
  rect?: Rect;
}

const TICK_REACH = LW / 2 + LW * 0.85;

/** Beside a station reads best; above/below next; diagonals last. */
const DIR_PENALTY: Record<LabelDir, number> = {
  E: 0,
  W: 0.6,
  N: 1.2,
  S: 1.4,
  NE: 2.5,
  SE: 2.7,
  NW: 2.9,
  SW: 3.1,
};

const labelDy = (dir: LabelDir) =>
  dir.startsWith("S") ? 0.74 : dir.startsWith("N") ? -0.08 : 0.35;

function capsule(a: Vec, b: Vec, r: number, owner: string | null): Obstacle {
  const box = {
    x0: Math.min(a.x, b.x) - r,
    y0: Math.min(a.y, b.y) - r,
    x1: Math.max(a.x, b.x) + r,
    y1: Math.max(a.y, b.y) + r,
  };
  return { a, b, r, box, owner };
}

function labelBox(s: Vec, dir: LabelDir, d: number, w: number): Rect {
  const lv = LABEL_VEC[dir];
  const x = s.x + lv.x * d;
  const em = TUBE.labelSize;
  const base = s.y + lv.y * d + labelDy(dir) * em;
  const x0 = dir.includes("E") ? x : dir.includes("W") ? x - w : x - w / 2;
  return { x0, y0: base - em * 0.74, x1: x0 + w, y1: base + em * 0.22 };
}

const rectGap = (p: Vec, r: Rect) =>
  Math.hypot(
    Math.max(r.x0 - p.x, 0, p.x - r.x1),
    Math.max(r.y0 - p.y, 0, p.y - r.y1),
  );

/** Liang–Barsky: does segment ab pass through the rectangle? */
function segmentCrosses(a: Vec, b: Vec, r: Rect) {
  let t0 = 0;
  let t1 = 1;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  for (const [p, q] of [
    [-dx, a.x - r.x0],
    [dx, r.x1 - a.x],
    [-dy, a.y - r.y0],
    [dy, r.y1 - a.y],
  ]) {
    if (p === 0) {
      if (q < 0) return false;
      continue;
    }
    const t = q / p;
    if (p < 0) {
      if (t > t1) return false;
      t0 = Math.max(t0, t);
    } else {
      if (t < t0) return false;
      t1 = Math.min(t1, t);
    }
  }
  return true;
}

function collides(box: Rect, o: Obstacle) {
  const pad = 2;
  if (o.box.x0 > box.x1 + pad + o.r || o.box.x1 < box.x0 - pad - o.r)
    return false;
  if (o.box.y0 > box.y1 + pad + o.r || o.box.y1 < box.y0 - pad - o.r)
    return false;
  if (o.rect) return true;
  if (segmentCrosses(o.a, o.b, box)) return true;
  const corners = [
    { x: box.x0, y: box.y0 },
    { x: box.x1, y: box.y0 },
    { x: box.x0, y: box.y1 },
    { x: box.x1, y: box.y1 },
  ];
  const gapTo = Math.min(
    rectGap(o.a, box),
    rectGap(o.b, box),
    ...corners.map((c) => nearestOnPolyline([o.a, o.b], c).d),
  );
  return gapTo < o.r + pad;
}

let measurer: CanvasRenderingContext2D | null | undefined;
const widths = new Map<string, number>();

/** Label width in the map font, cached once the font has loaded. */
function textWidth(text: string) {
  const hit = widths.get(text);
  if (hit !== undefined) return hit;
  if (measurer === undefined) {
    measurer =
      typeof document === "undefined"
        ? null
        : document.createElement("canvas").getContext("2d");
  }
  if (!measurer) return text.length * TUBE.labelSize * 0.56;
  const font = `${TUBE.labelSize}px ${mapFontFamily}`;
  measurer.font = `${font}, sans-serif`;
  const w = measurer.measureText(text).width;
  if (document.fonts?.check(font)) widths.set(text, w);
  return w;
}

// ── track graph helpers ──────────────────────────────────────

const nodeKey = (p: Vec) => `${Math.round(p.x * 100)}:${Math.round(p.y * 100)}`;
const edgeKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
const signedTurn = (din: Vec, dout: Vec) =>
  Math.atan2(cross(din, dout), dot(din, dout));

/**
 * Order the lines across a bundle from pairwise preferences: `side < 0` puts `i` first. Lower ranks are
 * honoured first, and a preference that contradicts what's already settled (directly or by implication) is
 * dropped, so a mere tie-break can never undo a real constraint.
 */
function bundleOrder(
  n: number,
  pref: (i: number, j: number) => { side: number; rank: number },
) {
  const before = Array.from({ length: n }, () =>
    new Array<boolean>(n).fill(false),
  );
  const settle = (i: number, j: number) => {
    if (before[i][j] || before[j][i]) return;
    for (let a = 0; a < n; a++) {
      if (a !== i && !before[a][i]) continue;
      for (let b = 0; b < n; b++)
        if (b === j || before[j][b]) before[a][b] = true;
    }
  };
  const prefs: { i: number; j: number; side: number; rank: number }[] = [];
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++) prefs.push({ i, j, ...pref(i, j) });
  prefs.sort((p, q) => p.rank - q.rank);
  for (const p of prefs) {
    if (p.side < 0) settle(p.i, p.j);
    else if (p.side > 0) settle(p.j, p.i);
  }
  const ahead = (i: number) => before.filter((row) => row[i]).length;
  return [...Array(n).keys()].sort((a, b) => ahead(a) - ahead(b) || a - b);
}

export function buildRender(doc: MapDoc): RenderModel {
  const sMap = new Map(doc.stations.map((s) => [s.id, s]));
  const lMap = new Map(doc.lines.map((l, i) => [l.id, { l, i }]));
  const lineIndex = (id: string) => lMap.get(id)!.i;
  const bounds = getBounds(doc.stations);
  const minX = bounds?.minX ?? 0;
  const spanX = bounds ? Math.max(1, bounds.maxX - bounds.minX) : 1;

  // Hops grouped by station pair. All lines between the same two stations share one route.
  const hops = doc.segments.filter(
    (h) => h.a !== h.b && sMap.has(h.a) && sMap.has(h.b) && lMap.has(h.line),
  );
  const pairInfo = new Map<string, PairInfo>();
  for (const h of hops) {
    const key = pairKey(h.a, h.b);
    let p = pairInfo.get(key);
    if (!p) {
      const [a, b] = key.split("|");
      if (dist(sMap.get(a)!, sMap.get(b)!) < 0.5) continue;
      p = {
        key,
        a,
        b,
        lines: [],
        options: routeOptions(sMap.get(a)!, sMap.get(b)!, doc.routes[key]),
        pick: 0,
      };
      pairInfo.set(key, p);
    }
    if (!p.lines.includes(h.line)) p.lines.push(h.line);
  }
  chooseRoutes([...pairInfo.values()]);

  const nodes = new Map<string, GNode>();
  const nodeAt = (p: Vec) => {
    const key = nodeKey(p);
    let n = nodes.get(key);
    if (!n) {
      n = { key, p: { x: p.x, y: p.y }, station: null };
      nodes.set(key, n);
    }
    return n;
  };
  for (const s of doc.stations) nodeAt(s).station ??= s.id;
  for (const p of pairInfo.values())
    for (const q of p.options[p.pick].pts) nodeAt(q);
  const cuts = [...nodes.values()];

  const edges = new Map<string, GEdge>();
  const nodeEdges = new Map<string, GEdge[]>();
  const pairPath = new Map<string, string[]>();
  for (const p of pairInfo.values()) {
    const pts = p.options[p.pick].pts;
    const path = [nodeKey(pts[0])];
    for (let i = 0; i < pts.length - 1; i++) {
      const P = pts[i];
      const Q = pts[i + 1];
      const L = dist(P, Q);
      const u = norm(sub(Q, P));
      const box = {
        x0: Math.min(P.x, Q.x) - 0.1,
        x1: Math.max(P.x, Q.x) + 0.1,
        y0: Math.min(P.y, Q.y) - 0.1,
        y1: Math.max(P.y, Q.y) + 0.1,
      };
      const hits: { t: number; key: string }[] = [];
      for (const c of cuts) {
        if (
          c.p.x < box.x0 ||
          c.p.x > box.x1 ||
          c.p.y < box.y0 ||
          c.p.y > box.y1
        )
          continue;
        const w = sub(c.p, P);
        const t = dot(w, u);
        if (t > 0.01 && t < L - 0.01 && Math.abs(cross(u, w)) < 0.05)
          hits.push({ t, key: c.key });
      }
      hits.sort((m, n) => m.t - n.t);
      for (const h of hits) path.push(h.key);
      path.push(nodeKey(Q));
    }
    pairPath.set(p.key, path);

    for (let i = 0; i < path.length - 1; i++) {
      const key = edgeKey(path[i], path[i + 1]);
      let e = edges.get(key);
      if (!e) {
        const [ku, kv] =
          path[i] < path[i + 1]
            ? [path[i], path[i + 1]]
            : [path[i + 1], path[i]];
        const u = nodes.get(ku)!;
        const v = nodes.get(kv)!;
        e = { u, v, dir: norm(sub(v.p, u.p)), lines: [], off: new Map() };
        edges.set(key, e);
        for (const n of [ku, kv])
          nodeEdges.set(n, [...(nodeEdges.get(n) ?? []), e]);
      }
      for (const l of p.lines) if (!e.lines.includes(l)) e.lines.push(l);
    }
  }

  // Each line's own graph over the track nodes.
  const adj = new Map<string, Map<string, Set<string>>>();
  const link = (l: string, a: string, b: string) => {
    let g = adj.get(l);
    if (!g) {
      g = new Map();
      adj.set(l, g);
    }
    for (const [x, y] of [
      [a, b],
      [b, a],
    ]) {
      let s = g.get(x);
      if (!s) {
        s = new Set();
        g.set(x, s);
      }
      s.add(y);
    }
  };
  const hopPath = new Map<string, string[]>();
  for (const h of hops) {
    const p = pairInfo.get(pairKey(h.a, h.b));
    const base = p && pairPath.get(p.key);
    if (!p || !base) continue;
    const path = h.a === p.a ? base : base.slice().reverse();
    hopPath.set(h.id, path);
    for (let i = 0; i < path.length - 1; i++)
      link(h.line, path[i], path[i + 1]);
  }

  const heading = (a: string, b: string) =>
    norm(sub(nodes.get(b)!.p, nodes.get(a)!.p));
  const nextOf = (l: string, prev: string, cur: string) => {
    const s = adj.get(l)?.get(cur);
    return s ? [...s].filter((n) => n !== prev) : [];
  };

  /**
   * Follow two lines along the track they share until they part ways.
   * +1 when `l1` peels off further to the left (perp side) than `l2`, so it
   * belongs on that side of the bundle — that's what stops lines crossing.
   * When one of them just ends there, the other still has a side to take, but it's a weaker (`soft`) hint.
   */
  const probe = (l1: string, l2: string, prev: string, cur: string) => {
    const seen = new Set<string>();
    for (;;) {
      const n1 = nextOf(l1, prev, cur);
      const n2 = nextOf(l2, prev, cur);
      if (n1.length === 1 && n2.length === 1 && n1[0] === n2[0]) {
        const k = edgeKey(cur, n1[0]);
        if (seen.has(k)) return { side: 0, end: "", soft: false };
        seen.add(k);
        prev = cur;
        cur = n1[0];
        continue;
      }
      const din = heading(prev, cur);
      const turn = (ns: string[]) =>
        ns.length ? mean(ns.map((n) => signedTurn(din, heading(cur, n)))) : 0;
      const a1 = turn(n1);
      const a2 = turn(n2);
      return {
        side: Math.abs(a1 - a2) < 1e-6 ? 0 : Math.sign(a1 - a2),
        end: cur,
        soft: !n1.length || !n2.length,
      };
    }
  };

  const servedBy = new Map<string, Set<string>>();
  for (const h of hops) {
    if (!hopPath.has(h.id)) continue;
    for (const id of [h.a, h.b]) {
      let s = servedBy.get(id);
      if (!s) {
        s = new Set();
        servedBy.set(id, s);
      }
      s.add(h.line);
    }
  }
  /** An interchange marker covers whatever happens beneath it. */
  const hidden = (key: string) => {
    const id = nodes.get(key)?.station;
    return !!id && (servedBy.get(id)?.size ?? 0) > 1;
  };

  for (const e of edges.values()) {
    const k = e.lines.length;
    if (k > 1) {
      const ls = e.lines
        .sort((l1, l2) => lineIndex(l1) - lineIndex(l2))
        .slice();
      const order = bundleOrder(k, (i, j) => {
        const ahead = probe(ls[i], ls[j], e.u.key, e.v.key);
        const behind = probe(ls[i], ls[j], e.v.key, e.u.key);
        const firm = (p: typeof ahead) => !!p.side && !p.soft;
        // If the two ends want opposite orders the lines must cross somewhere: under an interchange if possible.
        if (
          firm(ahead) &&
          firm(behind) &&
          ahead.side !== -behind.side &&
          hidden(ahead.end) &&
          !hidden(behind.end)
        ) {
          return { side: -behind.side, rank: 0 };
        }
        if (firm(ahead)) return { side: ahead.side, rank: 0 };
        if (firm(behind)) return { side: -behind.side, rank: 0 };
        if (ahead.side) return { side: ahead.side, rank: 1 };
        if (behind.side) return { side: -behind.side, rank: 1 };
        // Never part: any order works as long as it's the same all along the shared run.
        return { side: (i - j) * (ahead.end < behind.end ? 1 : -1), rank: 2 };
      });
      order.forEach((o, i) => {
        e.lines[i] = ls[o];
      });
    }
    e.lines.forEach((l, i) => {
      e.off.set(l, (i - (k - 1) / 2) * SPACING);
    });
  }

  // Along a straight run of track a line keeps its lane: when another line joins or leaves, the bundle
  // grows or shrinks to one side instead of every line shuffling over to stay centred.
  const straightOn = (from: GEdge, at: GNode, d: Vec) => {
    for (const f of nodeEdges.get(at.key) ?? []) {
      if (f === from) continue;
      const out = f.u === at ? f.dir : mul(f.dir, -1);
      if (dot(out, d) > 0.999) return { f, end: f.u === at ? f.v : f.u };
    }
    return null;
  };
  const inRun = new Set<GEdge>();
  for (const e of edges.values()) {
    if (inRun.has(e)) continue;
    const run: GEdge[] = [e];
    for (const [start, d, add] of [
      [e.u, mul(e.dir, -1), (f: GEdge) => run.unshift(f)],
      [e.v, e.dir, (f: GEdge) => run.push(f)],
    ] as const) {
      let at = start;
      let from = e;
      let next = straightOn(from, at, d);
      while (next && !run.includes(next.f)) {
        add(next.f);
        from = next.f;
        at = next.end;
        next = straightOn(from, at, d);
      }
    }
    for (const f of run) inRun.add(f);

    // Offsets in the run's own frame (edges can point either way along it).
    const sign = run.map((f) => (dot(f.dir, e.dir) > 0 ? 1 : -1));
    const lane = (i: number, l: string) => (run[i].off.get(l) ?? 0) * sign[i];
    // Shift each edge so the lines it shares with the one before stay put; where a line has to
    // move over anyway (one joining in the middle), go with what most of them want.
    const shift = run.map(() => 0);
    const groups: number[][] = [[0]];
    for (let i = 1; i < run.length; i++) {
      const shared = run[i].lines.filter((l) => run[i - 1].off.has(l));
      if (!shared.length) {
        groups.push([i]);
        continue;
      }
      const votes = new Map<number, number>();
      for (const l of shared) {
        const dv =
          Math.round((lane(i - 1, l) + shift[i - 1] - lane(i, l)) * 100) / 100;
        votes.set(dv, (votes.get(dv) ?? 0) + 1);
      }
      shift[i] = [...votes].sort(
        (a, b) => b[1] - a[1] || Math.abs(a[0]) - Math.abs(b[0]),
      )[0][0];
      groups[groups.length - 1].push(i);
    }
    // Then settle each stretch where most of its length sits: a line running on its own stays on
    // the track's centre, and a bundle it joins hangs off to one side of it.
    for (const group of groups) {
      const weighted = group
        .map((i) => ({ s: shift[i], w: dist(run[i].u.p, run[i].v.p) }))
        .sort((a, b) => a.s - b.s);
      const half = weighted.reduce((t, x) => t + x.w, 0) / 2;
      let acc = 0;
      let median = 0;
      for (const x of weighted) {
        acc += x.w;
        median = x.s;
        if (acc >= half) break;
      }
      for (const i of group) {
        const by = (shift[i] - median) * sign[i];
        if (Math.abs(by) < 0.01) continue;
        for (const l of run[i].lines)
          run[i].off.set(l, (run[i].off.get(l) ?? 0) + by);
      }
    }
  }

  // ── tracing lines ──────────────────────────────────────────

  const legOf = (l: string, a: string, b: string): Leg => {
    const e = edges.get(edgeKey(a, b))!;
    const p = nodes.get(a)!.p;
    const q = nodes.get(b)!.p;
    const o = e.off.get(l) ?? 0;
    return {
      p,
      q,
      d: norm(sub(q, p)),
      len: dist(p, q),
      o: e.u.key === a ? o : -o,
    };
  };
  const shifted = (leg: Leg, at: Vec) => add(at, mul(perp(leg.d), leg.o));

  /** Where a line's offset track bends, or changes lane, at a node. */
  const join = (l1: Leg, l2: Leg, node: GNode, pts: Vec[], radii: number[]) => {
    const P1 = shifted(l1, node.p);
    const P2 = shifted(l2, node.p);
    const c = cross(l1.d, l2.d);
    if (Math.abs(c) < 1e-6) {
      if (dot(l1.d, l2.d) < 0) {
        pts.push(P1, P2);
        radii.push(0, 0);
        return;
      }
      const shift = Math.abs(l1.o - l2.o);
      if (shift < 0.01) return;
      // Changing lane on a straight: tuck it under a station marker, or ease across between stations.
      const h = Math.min(
        node.station ? shift / 2 : Math.max(shift * 1.5, SPACING),
        l1.len * 0.45,
        l2.len * 0.45,
      );
      pts.push(sub(P1, mul(l1.d, h)), add(P2, mul(l2.d, h)));
      radii.push(TUBE.cornerRadius, TUBE.cornerRadius);
      return;
    }
    // A line doubling back at a station turns right there: a mitre or a rounded corner would pull
    // the bend clear of the station it belongs to.
    if (node.station && dot(l1.d, l2.d) < -0.01) {
      pts.push(P1, P2);
      radii.push(0, 0);
      return;
    }
    const t = cross(sub(P2, P1), l2.d) / c;
    pts.push(add(P1, mul(l1.d, t)));
    // Concentric corners: the inside of a bend gets a tighter radius than the outside.
    const o = (l1.o + l2.o) / 2;
    const base = node.station ? STATION_RADIUS : TUBE.cornerRadius;
    radii.push(Math.max(0, base - o * Math.sign(c)));
  };

  const trace = (l: string, path: string[], closed: boolean) => {
    const legs = path.slice(1).map((b, i) => legOf(l, path[i], b));
    const pts: Vec[] = [];
    const radii: number[] = [];
    if (closed) {
      const mid = shifted(legs[0], mul(add(legs[0].p, legs[0].q), 0.5));
      pts.push(mid);
      radii.push(0);
      for (let i = 1; i <= legs.length; i++) {
        const j = i % legs.length;
        join(legs[i - 1], legs[j], nodes.get(path[j])!, pts, radii);
      }
      pts.push(mid);
    } else {
      pts.push(shifted(legs[0], legs[0].p));
      radii.push(0);
      for (let i = 1; i < legs.length; i++)
        join(legs[i - 1], legs[i], nodes.get(path[i])!, pts, radii);
      const last = legs[legs.length - 1];
      pts.push(shifted(last, last.q));
    }
    radii.push(0);
    return roundedPath(pts, radii);
  };

  /** Split a line's graph into as few continuous runs as possible. */
  const runsOf = (l: string) => {
    const A = adj.get(l);
    if (!A) return [];
    // At a junction, pair up the stretches that continue most nearly straight.
    const partner = new Map<string, Map<string, string>>();
    for (const [n, nbs] of A) {
      if (nbs.size < 3) continue;
      const list = [...nbs];
      const cand: { a: string; b: string; s: number }[] = [];
      for (let i = 0; i < list.length; i++)
        for (let j = i + 1; j < list.length; j++)
          cand.push({
            a: list[i],
            b: list[j],
            s: dot(heading(n, list[i]), heading(n, list[j])),
          });
      cand.sort((x, y) => x.s - y.s);
      const m = new Map<string, string>();
      for (const c of cand) {
        if (c.s < -0.6 && !m.has(c.a) && !m.has(c.b)) {
          m.set(c.a, c.b);
          m.set(c.b, c.a);
        }
      }
      partner.set(n, m);
    }
    const next = (prev: string, cur: string) => {
      const nbs = A.get(cur)!;
      if (nbs.size === 2) {
        for (const n of nbs) if (n !== prev) return n;
        return null;
      }
      return partner.get(cur)?.get(prev) ?? null;
    };
    // A branch borrows the straightest stretch it leaves from, so it peels away in a curve.
    const lead = (n: string, from: string) => {
      const nbs = A.get(n)!;
      if (nbs.size < 3 || partner.get(n)?.has(from)) return null;
      const d = heading(n, from);
      let best: string | null = null;
      let bestDot = Infinity;
      for (const m of nbs) {
        if (m === from) continue;
        const s = dot(heading(n, m), d);
        if (s < bestDot) {
          bestDot = s;
          best = m;
        }
      }
      return best;
    };

    const done = new Set<string>();
    const runs: { path: string[]; closed: boolean }[] = [];
    const walk = (start: string, first: string) => {
      const path = [start, first];
      done.add(edgeKey(start, first));
      let prev = start;
      let cur = first;
      for (;;) {
        const nx = next(prev, cur);
        if (nx === null || done.has(edgeKey(cur, nx))) break;
        path.push(nx);
        done.add(edgeKey(cur, nx));
        prev = cur;
        cur = nx;
      }
      const closed = path.length > 3 && path[0] === path[path.length - 1];
      if (!closed) {
        const pre = lead(path[0], path[1]);
        if (pre) path.unshift(pre);
        const post = lead(path[path.length - 1], path[path.length - 2]);
        if (post) path.push(post);
        // Draw from the west so the intro sweeps across the map.
        const a = nodes.get(path[0])!.p;
        const b = nodes.get(path[path.length - 1])!.p;
        if (b.x < a.x - 1e-6 || (Math.abs(b.x - a.x) <= 1e-6 && b.y < a.y))
          path.reverse();
      }
      runs.push({ path, closed });
    };
    for (const [n, nbs] of A)
      if (nbs.size === 1)
        for (const m of nbs) if (!done.has(edgeKey(n, m))) walk(n, m);
    for (const [n, nbs] of A)
      if (nbs.size >= 3)
        for (const m of nbs) if (!done.has(edgeKey(n, m))) walk(n, m);
    for (const [n, nbs] of A)
      for (const m of nbs) if (!done.has(edgeKey(n, m))) walk(n, m);
    return runs;
  };

  const tracks: RTrack[] = [];
  for (const { l, i } of lMap.values()) {
    runsOf(l.id).forEach((run, j) => {
      const start = nodes.get(run.path[0])!.p;
      tracks.push({
        id: `${l.id}:${j}`,
        line: l.id,
        color: l.color,
        d: trace(l.id, run.path, run.closed),
        delay: Math.round(i * 110 + ((start.x - minX) / spanX) * 320),
      });
    });
  }

  const segs: RSeg[] = [];
  for (const h of hops) {
    const path = hopPath.get(h.id);
    if (!path) continue;
    segs.push({
      id: h.id,
      line: h.line,
      color: lMap.get(h.line)!.l.color,
      key: pairKey(h.a, h.b),
      d: trace(h.line, path, false),
    });
  }
  segs.sort((m, n) => lineIndex(m.line) - lineIndex(n.line));

  const pairs = new Map<string, RPair>();
  for (const p of pairInfo.values()) {
    const o = p.options[p.pick];
    pairs.set(p.key, {
      key: p.key,
      pts: o.pts,
      lines: p.lines,
      a: p.a,
      b: p.b,
      mode: o.mode,
    });
  }

  // ── stations ───────────────────────────────────────────────

  // Markers first: every line touching each station, as it leaves — heading, lane, position.
  const drafts = doc.stations.map((s) => {
    const node = nodes.get(nodeKey(s));
    const own = node?.station === s.id ? node : undefined;
    const lines = [...(servedBy.get(s.id) ?? [])].sort(
      (m, n) => lineIndex(m) - lineIndex(n),
    );
    const kind: RStation["kind"] =
      lines.length === 0
        ? "none"
        : lines.length === 1
          ? "single"
          : "interchange";
    const arms: Arm[] = [];
    for (const e of (own && nodeEdges.get(own.key)) ?? []) {
      const fromU = e.u === own;
      const u = fromU ? e.dir : mul(e.dir, -1);
      for (const l of e.lines) {
        const o = (e.off.get(l) ?? 0) * (fromU ? 1 : -1);
        arms.push({ u, line: l, o, pos: add(s, mul(perp(u), o)) });
      }
    }

    let marker: RStation["marker"] = null;
    let single: Draft["single"] = null;
    const mine =
      kind === "single" ? arms.filter((a) => a.line === lines[0]) : [];
    if (mine.length) {
      const [m0, m1] = mine;
      // Square to the line, kept to the map's eight directions even where it bends at the station.
      const tangent =
        LABEL_VEC[
          octantOf(m1 && len(sub(m0.u, m1.u)) > 0.2 ? sub(m0.u, m1.u) : m0.u)
        ];
      // Inside a bundle, the tick (and label) go on the outside, away from the other lines.
      let outward: Vec | null = null;
      for (const a of mine) {
        const rest = arms.filter(
          (b) => b.line !== a.line && dist(b.u, a.u) < 1e-6,
        );
        if (!rest.length) continue;
        outward = mul(perp(a.u), a.o >= mean(rest.map((b) => b.o)) ? 1 : -1);
        break;
      }
      single = {
        pos: m1 ? mul(add(m0.pos, m1.pos), 0.5) : m0.pos,
        p: perp(tangent),
        outward,
        terminus: !m1,
      };
    } else if (kind === "interchange") {
      // One circle sitting on the lines that stop here, centred on them and just wide enough to take them all in.
      const served = arms
        .filter((a) => lines.includes(a.line))
        .map((a) => a.pos);
      const xs = served.map((p) => p.x);
      const ys = served.map((p) => p.y);
      const c = served.length
        ? {
            x: (Math.min(...xs) + Math.max(...xs)) / 2,
            y: (Math.min(...ys) + Math.max(...ys)) / 2,
          }
        : { x: s.x, y: s.y };
      const far = Math.max(0, ...served.map((p) => dist(p, c)));
      marker = {
        x: c.x,
        y: c.y,
        r: Math.max(TUBE.stationSize, far > 0.5 ? far + LW / 2 : 0),
      };
    } else {
      const r =
        kind === "single"
          ? Math.max(LW * 0.5 + 1, TUBE.stationSize * 0.62)
          : Math.max(LW * 0.55, TUBE.stationSize * 0.55);
      marker = { x: s.x, y: s.y, r };
    }
    const draft: Draft = { s, kind, lines, arms, marker, single };
    return draft;
  });

  /** The tick for a given label side: towards the label, or a bar across the end of a terminus. */
  const tickFor = (d: Draft, dir: LabelDir): RStation["tick"] => {
    if (!d.single) return null;
    const { pos, p, outward, terminus } = d.single;
    const lv = LABEL_VEC[dir];
    const side = dot(p, lv);
    if (!outward && (terminus || Math.abs(side) < 0.35)) {
      return {
        x1: pos.x - p.x * TICK_REACH,
        y1: pos.y - p.y * TICK_REACH,
        x2: pos.x + p.x * TICK_REACH,
        y2: pos.y + p.y * TICK_REACH,
      };
    }
    const t = dot(p, outward ?? lv) >= 0 ? p : mul(p, -1);
    return {
      x1: pos.x,
      y1: pos.y,
      x2: pos.x + t.x * TICK_REACH,
      y2: pos.y + t.y * TICK_REACH,
    };
  };

  /** Circles that make up what's drawn at the station. */
  const featsOf = (d: Draft, tick: RStation["tick"]) => {
    const feats: { p: Vec; r: number }[] = d.arms.map((a) => ({
      p: a.pos,
      r: LW / 2,
    }));
    if (tick)
      feats.push(
        { p: { x: tick.x1, y: tick.y1 }, r: TICK_W / 2 },
        { p: { x: tick.x2, y: tick.y2 }, r: TICK_W / 2 },
      );
    const m = d.marker;
    if (m) feats.push({ p: m, r: m.r + RING / 2 });
    return feats;
  };

  // Labels then go wherever they're clear of track, markers and the labels already placed.
  const obstacles: Obstacle[] = [];
  for (const e of edges.values()) {
    // Around the lanes as drawn, which needn't be centred on the route.
    const offs = [...e.off.values()];
    const lo = Math.min(...offs);
    const hi = Math.max(...offs);
    const side = mul(perp(e.dir), (lo + hi) / 2);
    obstacles.push(
      capsule(add(e.u.p, side), add(e.v.p, side), (hi - lo) / 2 + LW / 2, null),
    );
  }
  for (const d of drafts) {
    if (d.single)
      obstacles.push(
        capsule(d.single.pos, d.single.pos, TICK_REACH + TICK_W / 2, d.s.id),
      );
    else if (d.marker)
      obstacles.push(
        capsule(d.marker, d.marker, d.marker.r + RING / 2, d.s.id),
      );
  }

  const gap = 3 + TUBE.labelSize * 0.25;
  const rank = { interchange: 0, single: 1, none: 2 };
  const placed = new Map<
    string,
    { dir: LabelDir; d: number; tick: RStation["tick"] }
  >();
  for (const draft of [...drafts].sort((m, n) => rank[m.kind] - rank[n.kind])) {
    const { s } = draft;
    const w = textWidth(s.name);
    const near = obstacles.filter(
      (o) =>
        o.owner !== s.id &&
        o.box.x1 > s.x - w - 80 &&
        o.box.x0 < s.x + w + 80 &&
        o.box.y1 > s.y - 80 &&
        o.box.y0 < s.y + 80,
    );
    const outward = draft.single?.outward;
    const dirs = s.label
      ? [s.label]
      : LABEL_DIRS.filter(
          (dir) => !outward || dot(LABEL_VEC[dir], outward) > 0.3,
        );
    let best: {
      dir: LabelDir;
      d: number;
      tick: RStation["tick"];
      score: number;
    } | null = null;
    for (const dir of dirs) {
      const lv = LABEL_VEC[dir];
      const tick = tickFor(draft, dir);
      const reach = Math.max(
        0,
        ...featsOf(draft, tick).map((f) => dot(sub(f.p, s), lv) + f.r),
      );
      for (const extra of [0, 3, 7, 12]) {
        const d = reach + gap + extra;
        const box = labelBox(s, dir, d, w);
        const hits = near.filter((o) => collides(box, o)).length;
        const score = hits * 1000 + extra * 0.4 + DIR_PENALTY[dir];
        if (!best || score < best.score) best = { dir, d, tick, score };
        if (!hits) break;
      }
    }
    const pick = best!;
    placed.set(s.id, pick);
    if (s.name) {
      const box = labelBox(s, pick.dir, pick.d, w);
      obstacles.push({ a: s, b: s, r: 0, box, owner: null, rect: box });
    }
  }

  const stations: RStation[] = [];
  const stationMap = new Map<string, RStation>();
  for (const draft of drafts) {
    const { s, kind, lines, marker } = draft;
    const { dir, d, tick } = placed.get(s.id)!;
    const lv = LABEL_VEC[dir];
    const extent = Math.max(
      LW / 2,
      ...featsOf(draft, tick).map((f) => dist(f.p, s) + f.r),
    );
    const rs: RStation = {
      s,
      kind,
      color: kind === "single" ? lMap.get(lines[0])!.l.color : null,
      lines,
      marker,
      ring: RING,
      extent,
      tick,
      label: {
        x: s.x + lv.x * d,
        y: s.y + lv.y * d,
        anchor: dir.includes("E")
          ? "start"
          : dir.includes("W")
            ? "end"
            : "middle",
        dy: `${labelDy(dir)}em`,
        dir,
      },
      delay: Math.round(160 + ((s.x - minX) / spanX) * 620),
    };
    stations.push(rs);
    stationMap.set(s.id, rs);
  }

  return { tracks, segs, stations, stationMap, pairs, bounds };
}
