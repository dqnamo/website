// A geoboard with rubber bands, on a 2D canvas seen from above. Each band is a loop of beads in
// three dimensions joined by links that pull when stretched and go slack when not, so a band
// lifted over the pegs stays up near your finger and slopes down to wherever it's still hooked,
// and drops round whatever pegs it's over when let go. Pegs are upright cylinders the band can't
// pass through below their tops, with friction, so tension doesn't even out round a peg on its
// own: a band pulled at one corner stays tighter on that side, as a real one does.
//
// Rubber keeps its volume, so a band stretched to λ times its length is 1/√λ as wide and thick,
// and paler, because there's less rubber for the light to pass through. Plucked, a straight run
// between two pegs is a string, and its note is (1/2L)·√(T/μ): tension T from rubber's
// neo-Hookean curve, T ∝ λ − 1/λ², and mass per length μ falling as 1/λ. Stretch a band twice
// as far and the run is twice as long, but also tighter and lighter, and the two all but cancel:
// past about twice its length, a band plays the same note however far it goes. The note is set by
// the band's size, and shortened by pegs in the way. Stretched far enough, rubber tears; old
// rubber gone hard and crazed tears much sooner.

import {
  BAND_LENGTH,
  type BandSize,
  type Board,
  type BoardId,
  makeBoard,
  type Material,
  PALETTES,
  PEGS,
  type Palette,
  type PegStyle,
} from "./boards";
import { describeShape, patternBands, type ShapeInfo } from "./shapes";
import type { Voice } from "./sound";

export type GeoboardSettings = {
  board: BoardId;
  material: Material;
  size: BandSize;
  palette: Palette;
  perished: boolean;
  areas: boolean;
};

export const DEFAULT_SETTINGS: GeoboardSettings = {
  board: "grid5",
  material: "birch",
  size: "medium",
  palette: "assorted",
  perished: false,
  areas: false,
};

export type GeoboardStats = {
  bands: number;
  // The last note plucked, such as "C5", and its frequency.
  note: string | null;
  hertz: number | null;
  // The band last handled: what shape it makes and the notes of its runs.
  shape: ShapeInfo | null;
  runs: string[];
};

type Point = { x: number; y: number };

type Band = {
  n: number;
  closed: boolean;
  // Rest length of each link, and of the whole band.
  rest: number;
  length: number;
  x: Float64Array;
  y: Float64Array;
  z: Float64Array;
  px: Float64Array;
  py: Float64Array;
  pz: Float64Array;
  vx: Float64Array;
  vy: Float64Array;
  vz: Float64Array;
  // The peg each bead pressed on this frame, or −1, and how hard, for friction.
  contact: Int16Array;
  depth: Float64Array;
  // Stretch at each bead, for drawing.
  lam: Float64Array;
  color: [number, number, number];
  perished: boolean;
  breakAt: number;
  state: "on" | "leaving" | "broken";
  fade: number;
  timer: number;
  // A pattern's band waits in the air, then falls straight down on to its pegs.
  dropAt: number;
  dropping: boolean;
  shades: Shades | null;
  shapeKey: string;
  shape: ShapeInfo | null;
  label: Point | null;
};

type Shades = { edge: string[]; body: string[]; light: string[] };

type Grab = {
  band: Band;
  index: number;
  pointer: number;
  tx: number;
  ty: number;
  sx: number;
  sy: number;
  moved: number;
  lift: number;
  at: number;
  fresh: boolean;
};

type Twang = {
  band: Band;
  a: number;
  b: number;
  start: number;
  amplitude: number;
  tau: number;
};

type Run = {
  a: number;
  b: number;
  length: number;
  stretch: number;
  frequency: number | null;
};

const TAU = Math.PI * 2;
// One link of band, unstretched, in cm. Short enough that a band stretched four or five times
// still wraps a nail with several beads; any longer and a tight wrap is one bead, which slips.
const LINK = 0.1;
const SUBSTEPS = 12;
const GRAVITY = 981;
// Half the band's thickness, so it sits that far off a peg or the board.
const HALF = 0.07;
// Width from above, unstretched.
const WIDTH = 0.24;
// The board's top is at 0; the table round it is lower.
const TABLE = -1.6;
// How much of a link's overstretch each end takes back per substep, as a compliance.
const COMPLIANCE = 0.5;
// Gentle resistance to folding, so a slack band lies in a loose loop rather than a heap.
const BEND = 0.035;
const BEND_REACH = 1.6;
const AIR = 1.6;
// Rubber's own loss: a share of each link's stretching speed lost per substep.
const LOSS = 0.25;
const PEG_FRICTION = 0.45;
const BOARD_FRICTION = 0.7;
// No bead moves further than this in a substep, less than a nail's width, so nothing can jump
// clean over one. It still lets a band fly back at over a metre a second.
const MAX_STEP = 0.15;
// Above the pegs by this much when you've pulled a band well away.
const LIFT_ABOVE = 2.2;
// Rubber: shear modulus times cross-section, N, and mass per metre, kg, unstretched.
const RUBBER_GA = 0.55;
const RUBBER_MU = 1.1e-3;
const BREAK_FRESH = 6.2;
const BREAK_OLD = 2.7;
// Light from the top left: a shadow falls this far right and down per cm of height.
const SHADOW_X = 0.42;
const SHADOW_Y = 0.6;
const LIGHT = normalize2(-0.6, -0.8);
const LEVELS = 16;

const NOTE_NAMES = [
  "C",
  "C♯",
  "D",
  "E♭",
  "E",
  "F",
  "F♯",
  "G",
  "A♭",
  "A",
  "B♭",
  "B",
];

function normalize2(x: number, y: number): [number, number] {
  const length = Math.hypot(x, y) || 1;
  return [x / length, y / length];
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function parseHex(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function mix(
  a: [number, number, number],
  b: [number, number, number],
  t: number,
): [number, number, number] {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}

function css([r, g, b]: [number, number, number], alpha = 1) {
  return alpha >= 1
    ? `rgb(${r | 0} ${g | 0} ${b | 0})`
    : `rgb(${r | 0} ${g | 0} ${b | 0} / ${alpha})`;
}

export function noteName(frequency: number) {
  const midi = 69 + 12 * Math.log2(frequency / 440);
  const nearest = Math.round(midi);
  return `${NOTE_NAMES[((nearest % 12) + 12) % 12]}${Math.floor(nearest / 12) - 1}`;
}

// The note of a run L cm long at stretch λ, or null if it's slack.
export function runFrequency(length: number, stretch: number) {
  if (stretch < 1.03 || length < 0.3) return null;
  const tension = RUBBER_GA * (stretch - 1 / (stretch * stretch));
  const mu = RUBBER_MU / stretch;
  return Math.sqrt(tension / mu) / (2 * (length / 100));
}

// Value noise for the board's grain and the table's texture.
function hash(x: number, y: number) {
  const h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return h - Math.floor(h);
}

function valueNoise(x: number, y: number) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy);
  const b = hash(ix + 1, iy);
  const c = hash(ix, iy + 1);
  const d = hash(ix + 1, iy + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

function fbm(x: number, y: number, octaves: number) {
  let sum = 0;
  let amplitude = 0.5;
  let fx = x;
  let fy = y;
  for (let i = 0; i < octaves; i++) {
    sum += amplitude * valueNoise(fx, fy);
    fx *= 2.03;
    fy *= 2.03;
    amplitude *= 0.5;
  }
  return sum;
}

type Surface = {
  base: [number, number, number];
  dark: [number, number, number];
  light: [number, number, number];
};

const SURFACES: Record<Material, Surface> = {
  birch: {
    base: [226, 199, 158],
    dark: [196, 160, 112],
    light: [238, 218, 185],
  },
  walnut: { base: [101, 66, 44], dark: [62, 38, 25], light: [130, 90, 62] },
  plastic: {
    base: [70, 133, 204],
    dark: [58, 116, 184],
    light: [92, 152, 220],
  },
};

// The board's face, made once per material at a fixed size and scaled to fit. Wood is long
// streaks of grain along the board, with fine fibre lines; plastic is a matte moulding with a
// faint speckle.
function makeFace(material: Material) {
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) return canvas;
  const image = context.createImageData(size, size);
  const data = image.data;
  const { base, dark, light } = SURFACES[material];
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const u = i / size;
      const v = j / size;
      let t: number;
      let shade: number;
      if (material === "plastic") {
        t = 0.5 + (fbm(u * 40, v * 40, 2) - 0.5) * 0.25;
        shade = (hash(i, j) - 0.5) * 0.05;
      } else {
        const walnut = material === "walnut";
        const warp = fbm(u * 1.6, v * 6, 4);
        const streak = Math.sin(
          (v * (walnut ? 34 : 52) + warp * (walnut ? 3 : 5)) * Math.PI,
        );
        const figure = walnut ? 0.6 : 0.3;
        t =
          0.5 +
          streak * 0.5 * figure +
          (fbm(u * 3, v * 40, 3) - 0.5) * (walnut ? 0.35 : 0.22);
        // Fibres: fine lines running along the board.
        shade =
          (valueNoise(u * 8, v * 420) - 0.5) * 0.12 + (hash(i, j) - 0.5) * 0.04;
      }
      const c = t < 0.5 ? mix(dark, base, t * 2) : mix(base, light, t * 2 - 1);
      const k = 1 + shade;
      const o = (j * size + i) * 4;
      data[o] = clamp(c[0] * k, 0, 255);
      data[o + 1] = clamp(c[1] * k, 0, 255);
      data[o + 2] = clamp(c[2] * k, 0, 255);
      data[o + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);
  return canvas;
}

export type Geoboard = ReturnType<typeof createGeoboard>;

export function createGeoboard(
  canvas: HTMLCanvasElement,
  {
    voice,
    onStats,
  }: { voice?: Voice; onStats?: (stats: GeoboardStats) => void } = {},
) {
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas 2D is not available.");
  const ctx = context;
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  let settings: GeoboardSettings = { ...DEFAULT_SETTINGS };
  let board: Board = makeBoard(settings.board);
  let peg: PegStyle = PEGS[settings.material];
  // How close a band's centre line can come to a peg's axis.
  let reach = peg.shank + HALF;
  const bands: Band[] = [];
  const twangs: Twang[] = [];
  let grab: Grab | null = null;
  let lastBand: Band | null = null;
  let colorTurn = 0;
  let note: string | null = null;
  let hertz: number | null = null;

  // Pegs near each cell of a coarse grid, so a link only checks the pegs it could touch.
  const CELL = 1;
  let cells: number[][] = [];
  let cellsAcross = 0;
  let cellOrigin = 0;
  function buildCells() {
    cellOrigin = -board.half - 3;
    cellsAcross = Math.ceil((2 * (board.half + 3)) / CELL);
    cells = [];
    const near = CELL * 0.75 + reach + 0.9;
    for (let j = 0; j < cellsAcross; j++) {
      for (let i = 0; i < cellsAcross; i++) {
        const cx = cellOrigin + (i + 0.5) * CELL;
        const cy = cellOrigin + (j + 0.5) * CELL;
        const list: number[] = [];
        board.pegs.forEach((p, k) => {
          if (Math.hypot(p.x - cx, p.y - cy) < near) list.push(k);
        });
        cells.push(list);
      }
    }
  }
  const empty: number[] = [];
  function pegsNear(x: number, y: number) {
    const i = Math.floor((x - cellOrigin) / CELL);
    const j = Math.floor((y - cellOrigin) / CELL);
    if (i < 0 || j < 0 || i >= cellsAcross || j >= cellsAcross) return empty;
    return cells[j * cellsAcross + i];
  }
  buildCells();

  function onBoard(x: number, y: number) {
    return Math.abs(x) < board.half && Math.abs(y) < board.half;
  }

  function floorAt(x: number, y: number) {
    return (onBoard(x, y) ? 0 : TABLE) + HALF;
  }

  // ---- Bands -------------------------------------------------------------------------------

  function nextColor(): [number, number, number] {
    const list = PALETTES[settings.palette];
    const color = parseHex(list[colorTurn % list.length]);
    colorTurn++;
    return color;
  }

  function makeBand(points: Point[], length: number, heights: number) {
    const n = points.length;
    const band: Band = {
      n,
      closed: true,
      rest: length / n,
      length,
      x: new Float64Array(n),
      y: new Float64Array(n),
      z: new Float64Array(n),
      px: new Float64Array(n),
      py: new Float64Array(n),
      pz: new Float64Array(n),
      vx: new Float64Array(n),
      vy: new Float64Array(n),
      vz: new Float64Array(n),
      contact: new Int16Array(n).fill(-1),
      depth: new Float64Array(n),
      lam: new Float64Array(n).fill(1),
      color: nextColor(),
      perished: settings.perished,
      breakAt: settings.perished ? BREAK_OLD : BREAK_FRESH,
      state: "on",
      fade: 1,
      timer: 0,
      dropAt: 0,
      dropping: false,
      shades: null,
      shapeKey: "",
      shape: null,
      label: null,
    };
    for (let i = 0; i < n; i++) {
      band.x[i] = band.px[i] = points[i].x;
      band.y[i] = band.py[i] = points[i].y;
      band.z[i] = band.pz[i] = heights;
    }
    return band;
  }

  // Beads spaced evenly along a closed path.
  function resample(path: Point[], n: number) {
    const lengths = [0];
    for (let i = 1; i <= path.length; i++) {
      const a = path[i - 1];
      const b = path[i % path.length];
      lengths.push(lengths[i - 1] + Math.hypot(b.x - a.x, b.y - a.y));
    }
    const total = lengths[path.length];
    const out: Point[] = [];
    let k = 0;
    for (let i = 0; i < n; i++) {
      const s = (i / n) * total;
      while (k < path.length - 1 && lengths[k + 1] < s) k++;
      const a = path[k];
      const b = path[(k + 1) % path.length];
      const span = lengths[k + 1] - lengths[k] || 1;
      const t = (s - lengths[k]) / span;
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
    return { points: out, total };
  }

  // The path a taut band takes round pegs in order: along each straight run, then round each
  // peg on the outside of the turn there. A band that turns left at a peg has the peg on its
  // left, so it runs past on the peg's right.
  function wrapPath(order: number[]) {
    const pts = order.map((i) => board.pegs[i]);
    const m = pts.length;
    let area = 0;
    for (let i = 0; i < m; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % m];
      area += a.x * b.y - b.x * a.y;
    }
    const orientation = area < 0 ? -1 : 1;
    const turn = pts.map((p, i) => {
      const a = pts[(i - 1 + m) % m];
      const c = pts[(i + 1) % m];
      const t = (p.x - a.x) * (c.y - p.y) - (p.y - a.y) * (c.x - p.x);
      return Math.abs(t) < 1e-6 ? orientation : Math.sign(t);
    });
    const r = reach + 0.015;
    const path: Point[] = [];
    for (let i = 0; i < m; i++) {
      const p = pts[i];
      const q = pts[(i + 1) % m];
      const [dx, dy] = normalize2(q.x - p.x, q.y - p.y);
      // Left normal of this run.
      const lx = -dy;
      const ly = dx;
      const start = { x: p.x - turn[i] * r * lx, y: p.y - turn[i] * r * ly };
      const end = {
        x: q.x - turn[(i + 1) % m] * r * lx,
        y: q.y - turn[(i + 1) % m] * r * ly,
      };
      path.push(start, end);
      // Round the next peg, from where this run arrives to where the next one leaves.
      const next = pts[(i + 2) % m];
      const [ex, ey] = normalize2(next.x - q.x, next.y - q.y);
      const t = turn[(i + 1) % m];
      const leave = { x: q.x - t * r * -ey, y: q.y - t * r * ex };
      let a0 = Math.atan2(end.y - q.y, end.x - q.x);
      const a1 = Math.atan2(leave.y - q.y, leave.x - q.x);
      let sweep = a1 - a0;
      if (t > 0) {
        while (sweep < 0) sweep += TAU;
      } else {
        while (sweep > 0) sweep -= TAU;
      }
      const steps = Math.max(1, Math.ceil(Math.abs(sweep) / 0.3));
      for (let s = 1; s < steps; s++) {
        a0 += sweep / steps;
        path.push({ x: q.x + r * Math.cos(a0), y: q.y + r * Math.sin(a0) });
      }
    }
    return path;
  }

  function addPatternBand(
    order: number[],
    length: number | null,
    wait: number,
  ) {
    const path = wrapPath(order);
    const { total } = resample(path, 8);
    const rest = length ?? total / 2.2;
    const n = Math.max(24, Math.round(rest / LINK), Math.round(total / 0.3));
    const { points } = resample(path, n);
    const band = makeBand(points, rest, peg.height + 1.4);
    if (reduceMotion) {
      band.z.fill(HALF);
      band.pz.fill(HALF);
    } else {
      band.dropping = true;
      band.dropAt = clock + wait;
      band.fade = 0;
    }
    bands.push(band);
    return band;
  }

  // A new band hooked on a peg, pulled out towards the pointer as a narrow loop.
  function newBand(pegIndex: number, toward: Point) {
    const p = board.pegs[pegIndex];
    let [dx, dy] = normalize2(toward.x - p.x, toward.y - p.y);
    let distance = Math.hypot(toward.x - p.x, toward.y - p.y);
    if (distance < reach + 0.3) {
      [dx, dy] = Math.hypot(p.x, p.y) > 0.5 ? normalize2(-p.x, -p.y) : [0, 1];
      distance = reach + 0.3;
    }
    const r = reach + 0.01;
    const fx = p.x + dx * distance;
    const fy = p.y + dy * distance;
    const back = Math.atan2(dy, dx) + Math.PI / 2;
    const path: Point[] = [];
    for (let s = 0; s <= 8; s++) {
      const a = back + (s / 8) * Math.PI;
      path.push({ x: p.x + r * Math.cos(a), y: p.y + r * Math.sin(a) });
    }
    path.push({ x: fx, y: fy });
    const length = BAND_LENGTH[settings.size];
    const n = Math.max(24, Math.round(length / LINK));
    const { points } = resample(path, n);
    const band = makeBand(points, length, 0.35);
    let nearest = 0;
    let best = Number.POSITIVE_INFINITY;
    points.forEach((q, i) => {
      const d = Math.hypot(q.x - fx, q.y - fy);
      if (d < best) {
        best = d;
        nearest = i;
      }
    });
    bands.push(band);
    return { band, index: nearest };
  }

  function removeBand(band: Band) {
    const at = bands.indexOf(band);
    if (at >= 0) bands.splice(at, 1);
    for (let i = twangs.length - 1; i >= 0; i--) {
      if (twangs[i].band === band) twangs.splice(i, 1);
    }
    if (lastBand === band) lastBand = null;
    if (grab?.band === band) grab = null;
  }

  function sendAway(band: Band) {
    if (reduceMotion) {
      removeBand(band);
      return;
    }
    band.state = "leaving";
    band.timer = 0;
    for (let i = 0; i < band.n; i++) band.vz[i] = 90 + Math.random() * 20;
    if (lastBand === band) lastBand = null;
    for (let i = twangs.length - 1; i >= 0; i--) {
      if (twangs[i].band === band) twangs.splice(i, 1);
    }
  }

  // ---- Physics -----------------------------------------------------------------------------

  let clock = 0;

  function integrate(band: Band, h: number) {
    const { n, x, y, z, px, py, pz, vx, vy, vz } = band;
    const damp = Math.exp(-AIR * h);
    const held = grab && grab.band === band ? grab.index : -1;
    for (let i = 0; i < n; i++) {
      px[i] = x[i];
      py[i] = y[i];
      pz[i] = z[i];
      if (i === held) continue;
      vz[i] -= GRAVITY * h;
      if (band.dropping) {
        vx[i] = vy[i] = 0;
      } else {
        vx[i] *= damp;
        vy[i] *= damp;
      }
      vz[i] *= damp;
      x[i] += vx[i] * h;
      y[i] += vy[i] * h;
      z[i] += vz[i] * h;
    }
    if (held >= 0 && grab) {
      // The pinched bead follows the pointer, a limited step at a time so it can't jump a peg.
      const dx = grab.tx - x[held];
      const dy = grab.ty - y[held];
      const d = Math.hypot(dx, dy);
      const step = Math.min(d, 0.22);
      if (d > 1e-6) {
        x[held] += (dx / d) * step;
        y[held] += (dy / d) * step;
      }
      z[held] += (grab.lift - z[held]) * 0.15;
    }
  }

  function solveLinks(band: Band, forward: boolean) {
    const { n, x, y, z, rest } = band;
    const held = grab && grab.band === band ? grab.index : -1;
    const links = band.closed ? n : n - 1;
    for (let k = 0; k < links; k++) {
      const i = forward ? k : links - 1 - k;
      const j = i + 1 === n ? 0 : i + 1;
      const dx = x[j] - x[i];
      const dy = y[j] - y[i];
      const dz = z[j] - z[i];
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d <= rest) continue;
      const wi = i === held ? 0 : 1;
      const wj = j === held ? 0 : 1;
      if (!wi && !wj) continue;
      const c = (d - rest) / d / (wi + wj + COMPLIANCE);
      x[i] += dx * c * wi;
      y[i] += dy * c * wi;
      z[i] += dz * c * wi;
      x[j] -= dx * c * wj;
      y[j] -= dy * c * wj;
      z[j] -= dz * c * wj;
    }
    // Folding: beads two apart are kept from closing up, unless the band is being pulled out
    // fresh from the tin, folded on itself.
    if (grab?.band === band && grab.fresh) return;
    const target = BEND_REACH * rest;
    const spans = band.closed ? n : n - 2;
    for (let i = 0; i < spans; i++) {
      const j = (i + 2) % n;
      const dx = x[j] - x[i];
      const dy = y[j] - y[i];
      const dz = z[j] - z[i];
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d >= target || d < 1e-6) continue;
      const wi = i === held ? 0 : 1;
      const wj = j === held ? 0 : 1;
      if (!wi && !wj) continue;
      const c = ((d - target) / d) * (BEND / (wi + wj));
      x[i] += dx * c * wi;
      y[i] += dy * c * wi;
      x[j] -= dx * c * wj;
      y[j] -= dy * c * wj;
    }
  }

  // Holds each bead to MAX_STEP from where it started the substep, before the pegs push back.
  function limit(band: Band) {
    const { n, x, y, z, px, py, pz } = band;
    const held = grab && grab.band === band ? grab.index : -1;
    for (let i = 0; i < n; i++) {
      if (i === held) continue;
      const moved = Math.hypot(x[i] - px[i], y[i] - py[i], z[i] - pz[i]);
      if (moved > MAX_STEP) {
        const k = MAX_STEP / moved;
        x[i] = px[i] + (x[i] - px[i]) * k;
        y[i] = py[i] + (y[i] - py[i]) * k;
        z[i] = pz[i] + (z[i] - pz[i]) * k;
      }
    }
  }

  function collide(band: Band) {
    const { n, x, y, z, px, py, pz, contact, depth } = band;
    const held = grab && grab.band === band ? grab.index : -1;
    const top = peg.height;
    const r2 = reach * reach;
    const links = band.closed ? n : n - 1;
    depth.fill(0);
    for (let i = 0; i < links; i++) {
      const j = i + 1 === n ? 0 : i + 1;
      if (z[i] > top && z[j] > top) continue;
      const list = pegsNear((x[i] + x[j]) / 2, (y[i] + y[j]) / 2);
      for (let k = 0; k < list.length; k++) {
        const p = board.pegs[list[k]];
        const ax = x[i] - p.x;
        const ay = y[i] - p.y;
        const ex = x[j] - x[i];
        const ey = y[j] - y[i];
        const e2 = ex * ex + ey * ey;
        const t = e2 > 1e-12 ? clamp(-(ax * ex + ay * ey) / e2, 0, 1) : 0;
        if (z[i] + (z[j] - z[i]) * t > top) continue;
        const wi = i === held ? 0 : 1 - t;
        const wj = j === held ? 0 : t;
        const denominator = wi * wi + wj * wj;
        if (denominator < 1e-9) continue;
        // A tight band moves fast, and a link can sweep right across a thin nail between one
        // substep and the next. Which side of the link the peg was on, then and now, says if
        // it has; if so the link goes back to the side it came from, against the nail.
        const was =
          (px[j] - px[i]) * (p.y - py[i]) - (py[j] - py[i]) * (p.x - px[i]);
        const now = ex * (p.y - y[i]) - ey * (p.x - x[i]);
        if (
          was * now < 0 &&
          t > 0 &&
          t < 1 &&
          pz[i] + (pz[j] - pz[i]) * t <= top
        ) {
          const e = Math.sqrt(e2);
          const move = now / e - Math.sign(was) * reach;
          const s = move / denominator;
          x[i] += (-ey / e) * s * wi;
          y[i] += (ex / e) * s * wi;
          x[j] += (-ey / e) * s * wj;
          y[j] += (ex / e) * s * wj;
          contact[i] = contact[j] = list[k];
          depth[i] += reach * (1 - t);
          depth[j] += reach * t;
          continue;
        }
        const qx = ax + ex * t;
        const qy = ay + ey * t;
        const q2 = qx * qx + qy * qy;
        if (q2 >= r2) continue;
        const q = Math.sqrt(q2);
        let nx: number;
        let ny: number;
        if (q > 1e-6) {
          nx = qx / q;
          ny = qy / q;
        } else {
          [nx, ny] = normalize2(-ey, ex);
        }
        const push = reach - q;
        const s = push / denominator;
        x[i] += nx * s * wi;
        y[i] += ny * s * wi;
        x[j] += nx * s * wj;
        y[j] += ny * s * wj;
        if (t < 0.75) {
          contact[i] = list[k];
          depth[i] += push * (1 - t);
        }
        if (t > 0.25) {
          contact[j] = list[k];
          depth[j] += push * t;
        }
      }
    }
    // The head: a nail's, or a moulded peg's lip, overhangs the shank, so a band wrapped round
    // the shank can't ride up past it. It has to be pulled out from under the head first, and a
    // bead that started the substep under a head can't leave from under it upwards, however
    // far it was pulled.
    const under = top - HALF;
    const lip = peg.head + HALF + 0.02;
    for (let i = 0; i < n; i++) {
      if (i === held || pz[i] >= top || z[i] <= under) continue;
      const list = pegsNear(px[i], py[i]);
      for (let k = 0; k < list.length; k++) {
        const p = board.pegs[list[k]];
        if (
          Math.hypot(px[i] - p.x, py[i] - p.y) < lip ||
          Math.hypot(x[i] - p.x, y[i] - p.y) < lip
        ) {
          z[i] = under;
          break;
        }
      }
    }
    // Friction where the band presses on a peg: it can't slide round the peg unless the pull
    // along it beats the grip, which grows with how hard it presses. Up and down the shank it's
    // left free, so a band settles to the board rather than hanging wherever it first caught.
    for (let i = 0; i < n; i++) {
      if (depth[i] <= 0 || i === held) continue;
      const p = board.pegs[contact[i]];
      const [nx, ny] = normalize2(x[i] - p.x, y[i] - p.y);
      const dx = x[i] - band.px[i];
      const dy = y[i] - band.py[i];
      const normal = dx * nx + dy * ny;
      const tx = dx - normal * nx;
      const ty = dy - normal * ny;
      const slide = Math.sqrt(tx * tx + ty * ty);
      const grip = PEG_FRICTION * depth[i];
      const keep = slide <= grip ? 1 : grip / slide;
      x[i] -= tx * keep;
      y[i] -= ty * keep;
    }
  }

  function settle(band: Band, h: number) {
    const { n, x, y, z, px, py, pz, vx, vy, vz } = band;
    const held = grab && grab.band === band ? grab.index : -1;
    for (let i = 0; i < n; i++) {
      const floor = floorAt(x[i], y[i]);
      if (z[i] < floor) {
        const press = floor - z[i];
        z[i] = floor;
        const dx = x[i] - px[i];
        const dy = y[i] - py[i];
        const slide = Math.hypot(dx, dy);
        const grip = BOARD_FRICTION * press;
        const keep = slide <= grip ? 1 : grip / slide;
        x[i] -= dx * keep;
        y[i] -= dy * keep;
      }
      vx[i] = (x[i] - px[i]) / h;
      vy[i] = (y[i] - py[i]) / h;
      vz[i] = (z[i] - pz[i]) / h;
      if (i === held) {
        vx[i] = vy[i] = vz[i] = 0;
      }
    }
    // Rubber's loss: each link loses some of its stretching speed.
    const links = band.closed ? n : n - 1;
    for (let i = 0; i < links; i++) {
      const j = i + 1 === n ? 0 : i + 1;
      const dx = x[j] - x[i];
      const dy = y[j] - y[i];
      const dz = z[j] - z[i];
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d < 1e-6) continue;
      const ex = dx / d;
      const ey = dy / d;
      const ez = dz / d;
      const along =
        (vx[j] - vx[i]) * ex + (vy[j] - vy[i]) * ey + (vz[j] - vz[i]) * ez;
      const c = along * LOSS * 0.5;
      vx[i] += ex * c;
      vy[i] += ey * c;
      vz[i] += ez * c;
      vx[j] -= ex * c;
      vy[j] -= ey * c;
      vz[j] -= ez * c;
    }
  }

  function step(dt: number) {
    const h = dt / SUBSTEPS;
    for (const band of bands) {
      band.contact.fill(-1);
      if (band.state === "on" && clock >= band.dropAt) {
        band.fade = Math.min(1, band.fade + dt / 0.08);
      }
    }
    for (let s = 0; s < SUBSTEPS; s++) {
      for (const band of bands) {
        if (band.dropping && clock < band.dropAt) continue;
        integrate(band, h);
        if (band.state === "leaving") {
          for (let i = 0; i < band.n; i++) band.vz[i] += GRAVITY * h * 1.2;
          solveLinks(band, s % 2 === 0);
          continue;
        }
        if (!band.dropping) {
          solveLinks(band, true);
          solveLinks(band, false);
        }
        limit(band);
        collide(band);
        settle(band, h);
      }
    }
    for (let k = bands.length - 1; k >= 0; k--) {
      const band = bands[k];
      if (band.dropping && clock >= band.dropAt) {
        let highest = 0;
        for (let i = 0; i < band.n; i++) highest = Math.max(highest, band.z[i]);
        if (highest < peg.height - 0.05) {
          band.dropping = false;
          voice?.tick(0.5);
        }
      }
      if (band.state === "leaving") {
        band.timer += dt;
        band.fade = Math.max(0, 1 - band.timer / 0.32);
        if (band.fade <= 0) removeBand(band);
      } else if (band.state === "broken") {
        band.timer += dt;
        if (band.timer > 2.4)
          band.fade = Math.max(0, 1 - (band.timer - 2.4) / 0.5);
        if (band.fade <= 0) removeBand(band);
      }
      stretchOf(band);
    }
  }

  // Stretch at each bead, and a band torn where it's stretched past what it can take. Between
  // pegs nothing holds a band back, so tension evens out along a run at the speed of sound in
  // rubber, far faster than a hand moves; the beads here take a few frames to catch up. So a
  // run tears on its average stretch, not on the brief spike next to a pulling finger. Round a
  // peg, friction can hold the two sides at different tensions, so each run is judged alone.
  const link = new Float64Array(4096);
  function stretchOf(band: Band) {
    const { n, x, y, z, rest, lam, contact } = band;
    const links = band.closed ? n : n - 1;
    for (let i = 0; i < links; i++) {
      const j = i + 1 === n ? 0 : i + 1;
      link[i] = Math.hypot(x[j] - x[i], y[j] - y[i], z[j] - z[i]) / rest;
    }
    if (!band.closed) link[n - 1] = link[n - 2];
    for (let i = 0; i < n; i++) {
      lam[i] = (link[(i - 1 + n) % n] + link[i]) / 2;
    }
    if (band.state !== "on" || band.dropping) return;
    let first = 0;
    if (band.closed) {
      first = -1;
      for (let i = 0; i < n; i++) {
        if (contact[i] >= 0) {
          first = i;
          break;
        }
      }
      if (first < 0) first = 0;
    }
    let sum = 0;
    let count = 0;
    let worst = 0;
    let at = -1;
    for (let k = 0; k < links; k++) {
      const i = (first + k) % n;
      sum += link[i];
      count++;
      if (link[i] > worst) {
        worst = link[i];
        at = i;
      }
      const j = (i + 1) % n;
      if (contact[j] >= 0 || k === links - 1) {
        if (count >= 3 && sum / count > band.breakAt) {
          tear(band, at, sum / count);
          return;
        }
        sum = 0;
        count = 0;
        worst = 0;
      }
    }
  }

  function tear(band: Band, at: number, stretch: number) {
    if (!band.closed) return;
    // Reorder so the torn link is the gap between the last bead and the first.
    const { n } = band;
    const start = (at + 1) % n;
    for (const key of [
      "x",
      "y",
      "z",
      "px",
      "py",
      "pz",
      "vx",
      "vy",
      "vz",
      "lam",
    ] as const) {
      const from = band[key];
      const copy = new Float64Array(n);
      for (let i = 0; i < n; i++) copy[i] = from[(start + i) % n];
      band[key] = copy;
    }
    band.closed = false;
    band.state = "broken";
    band.timer = 0;
    // A torn band jumps: both ends whip back and it leaves the board for a moment.
    for (let i = 0; i < n; i++) band.vz[i] += 40 + Math.random() * 60;
    if (grab?.band === band) grab = null;
    for (let i = twangs.length - 1; i >= 0; i--) {
      if (twangs[i].band === band) twangs.splice(i, 1);
    }
    voice?.snap(clamp(stretch / 6, 0.4, 1));
    awake = 3;
  }

  // ---- Runs, notes and shapes --------------------------------------------------------------

  // Where a band touches pegs, grouped into wraps, and the straight runs between them.
  function analyse(band: Band) {
    const { n, contact } = band;
    const wraps: { peg: number; first: number; last: number }[] = [];
    if (!band.closed || band.state !== "on")
      return { wraps, runs: [] as Run[] };
    let start = -1;
    for (let i = 0; i < n; i++) {
      if (contact[i] < 0) {
        start = i;
        break;
      }
    }
    if (start < 0) {
      if (contact[0] >= 0)
        wraps.push({ peg: contact[0], first: 0, last: n - 1 });
      return { wraps, runs: [] as Run[] };
    }
    let previous = -2;
    for (let k = 1; k <= n; k++) {
      const i = (start + k) % n;
      const c = contact[i];
      if (c < 0) continue;
      const open = wraps[wraps.length - 1];
      // Beads a link or two apart on the same peg are one wrap; contact flickers at the edges.
      if (
        open &&
        open.peg === c &&
        (i - open.last + n) % n <= 3 &&
        previous >= 0
      ) {
        open.last = i;
      } else {
        wraps.push({ peg: c, first: i, last: i });
      }
      previous = i;
    }
    if (wraps.length > 1) {
      const first = wraps[0];
      const last = wraps[wraps.length - 1];
      if (first.peg === last.peg && (first.first - last.last + n) % n <= 3) {
        first.first = last.first;
        wraps.pop();
      }
    }
    const runs: Run[] = [];
    if (wraps.length < 2) return { wraps, runs };
    for (let k = 0; k < wraps.length; k++) {
      const w = wraps[k];
      const next = wraps[(k + 1) % wraps.length];
      if (next.peg === w.peg) continue;
      const a = w.last;
      const b = next.first;
      const links = (b - a + n) % n;
      if (links < 2) continue;
      const length = Math.hypot(
        band.x[b] - band.x[a],
        band.y[b] - band.y[a],
        band.z[b] - band.z[a],
      );
      const stretch = length / (links * band.rest);
      runs.push({
        a,
        b,
        length,
        stretch,
        frequency: runFrequency(length, stretch),
      });
    }
    return { wraps, runs };
  }

  function updateShape(band: Band) {
    const { wraps, runs } = analyse(band);
    const order = wraps.map((w) => w.peg);
    const key = order.join(",");
    if (key !== band.shapeKey) {
      band.shapeKey = key;
      band.shape = band.state === "on" ? describeShape(board, order) : null;
      if (band.shape?.label && order.length >= 3) {
        let sx = 0;
        let sy = 0;
        const unique = [...new Set(order)];
        for (const i of unique) {
          sx += board.pegs[i].x;
          sy += board.pegs[i].y;
        }
        band.label = { x: sx / unique.length, y: sy / unique.length };
      } else {
        band.label = null;
      }
    }
    return runs;
  }

  function runAt(band: Band, index: number) {
    const { runs } = analyse(band);
    const n = band.n;
    for (const run of runs) {
      const span = (run.b - run.a + n) % n;
      const offset = (index - run.a + n) % n;
      if (offset > 0 && offset < span) return run;
    }
    return null;
  }

  function startTwang(
    band: Band,
    run: Run,
    strength: number,
    position: number,
    delay = 0,
  ) {
    const frequency = run.frequency;
    for (let i = twangs.length - 1; i >= 0; i--) {
      const t = twangs[i];
      if (t.band === band && t.a === run.a && t.b === run.b)
        twangs.splice(i, 1);
    }
    if (!frequency) {
      voice?.thud(0.4 + strength * 0.6);
      return;
    }
    const tau = clamp(0.32 * (300 / frequency) ** 0.6, 0.09, 0.7);
    twangs.push({
      band,
      a: run.a,
      b: run.b,
      start: clock + delay,
      amplitude: reduceMotion ? 0 : clamp(0.08 + strength * 0.5, 0.08, 0.6),
      tau,
    });
    voice?.pluck({ frequency, strength, position, delay });
    note = noteName(frequency);
    hertz = Math.round(frequency);
    awake = Math.max(awake, 1.5);
    report(true);
  }

  // ---- Pointer -----------------------------------------------------------------------------

  let width = 0;
  let height = 0;
  let dpr = 1;
  let scale = 20;
  let cx = 0;
  let cy = 0;

  function toBoard(p: Point): Point {
    return { x: (p.x - cx) / scale, y: (p.y - cy) / scale };
  }

  function nearestPeg(q: Point, within: number) {
    let best = -1;
    let bestDistance = within;
    board.pegs.forEach((p, i) => {
      const d = Math.hypot(p.x - q.x, p.y - q.y);
      if (d < bestDistance) {
        bestDistance = d;
        best = i;
      }
    });
    return best;
  }

  // The nearest bead within reach, on whichever band; the top band wins a tie.
  function bandAt(q: Point, within: number) {
    let found: { band: Band; index: number; distance: number } | null = null;
    for (let k = bands.length - 1; k >= 0; k--) {
      const band = bands[k];
      if (band.state === "leaving" || band.dropping) continue;
      for (let i = 0; i < band.n; i++) {
        const d = Math.hypot(band.x[i] - q.x, band.y[i] - q.y);
        if (d < (found ? found.distance - 0.02 : within)) {
          found = { band, index: i, distance: d };
        }
      }
    }
    return found;
  }

  function hitRadius(coarse: boolean) {
    return Math.max(0.3, (coarse ? 20 : 11) / scale);
  }

  function pegRadius(coarse: boolean) {
    return Math.max(
      Math.min(board.pitch * 0.45, 1.3),
      (coarse ? 22 : 14) / scale,
    );
  }

  // What a press would take hold of: a peg or a band, whichever is nearer. A band wraps a peg
  // outside its head, so a press on the head itself gives a new band even on a busy peg.
  function pick(q: Point, coarse: boolean) {
    const hit = bandAt(q, hitRadius(coarse));
    const near = nearestPeg(q, pegRadius(coarse));
    if (near >= 0) {
      const p = board.pegs[near];
      const d = Math.hypot(p.x - q.x, p.y - q.y);
      if (!hit || d < hit.distance) return { kind: "peg" as const, peg: near };
    }
    if (hit) return { kind: "band" as const, band: hit.band, index: hit.index };
    return null;
  }

  // ---- Drawing -----------------------------------------------------------------------------

  const faces = new Map<Material, HTMLCanvasElement>();
  const background = document.createElement("canvas");
  const heads = document.createElement("canvas");
  let dark = document.documentElement.classList.contains("dark");

  function face(material: Material) {
    let made = faces.get(material);
    if (!made) {
      made = makeFace(material);
      faces.set(material, made);
    }
    return made;
  }

  // Draws a shape's shadow only, blurred, by drawing the shape far off the canvas and its
  // shadow back on to it, which works wherever canvas shadows do.
  function softShadow(
    target: CanvasRenderingContext2D,
    blur: number,
    color: string,
    draw: (offset: number) => void,
  ) {
    const away = 4000;
    target.save();
    target.shadowColor = color;
    target.shadowBlur = blur * dpr;
    target.shadowOffsetX = away * dpr;
    target.shadowOffsetY = 0;
    draw(-away);
    target.restore();
  }

  function renderBackground() {
    background.width = canvas.width;
    background.height = canvas.height;
    heads.width = canvas.width;
    heads.height = canvas.height;
    const g = background.getContext("2d");
    const hg = heads.getContext("2d");
    if (!g || !hg) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    // The table.
    const table = dark ? "#17181b" : "#e9e4dc";
    g.fillStyle = table;
    g.fillRect(0, 0, width, height);
    const glow = g.createRadialGradient(
      cx - width * 0.15,
      cy - height * 0.25,
      0,
      cx,
      cy,
      Math.max(width, height) * 0.8,
    );
    glow.addColorStop(
      0,
      dark ? "rgb(255 255 255 / 0.05)" : "rgb(255 255 255 / 0.5)",
    );
    glow.addColorStop(1, dark ? "rgb(0 0 0 / 0.25)" : "rgb(0 0 0 / 0.06)");
    g.fillStyle = glow;
    g.fillRect(0, 0, width, height);

    const side = board.half * 2 * scale;
    const left = cx - board.half * scale;
    const top = cy - board.half * scale;
    const corner = 0.7 * scale;
    // The board's shadow on the table: a tight contact shadow and a wide soft one.
    softShadow(g, 0.6 * scale, "rgb(0 0 0 / 0.35)", (o) => {
      g.beginPath();
      g.roundRect(
        left + o + 0.15 * scale,
        top + 0.25 * scale,
        side,
        side,
        corner,
      );
      g.fill();
    });
    softShadow(
      g,
      2.2 * scale,
      dark ? "rgb(0 0 0 / 0.6)" : "rgb(60 40 20 / 0.25)",
      (o) => {
        g.beginPath();
        g.roundRect(
          left + o + 0.6 * scale,
          top + 1.0 * scale,
          side,
          side,
          corner,
        );
        g.fill();
      },
    );
    g.save();
    g.beginPath();
    g.roundRect(left, top, side, side, corner);
    g.clip();
    g.imageSmoothingQuality = "high";
    g.drawImage(face(settings.material), left, top, side, side);
    // The edge: rounded over, so lit along the top and left and shaded along the bottom and right.
    const bevel = 0.35 * scale;
    g.lineWidth = bevel;
    g.strokeStyle = "rgb(255 255 255 / 0.22)";
    g.beginPath();
    g.moveTo(left, top + side);
    g.lineTo(left, top);
    g.lineTo(left + side, top);
    g.stroke();
    g.strokeStyle = "rgb(0 0 0 / 0.22)";
    g.beginPath();
    g.moveTo(left + side, top);
    g.lineTo(left + side, top + side);
    g.lineTo(left, top + side);
    g.stroke();
    if (settings.material === "plastic") {
      // A moulded rim a little proud of the face.
      const rim = 0.55 * scale;
      g.lineWidth = 0.12 * scale;
      g.strokeStyle = "rgb(255 255 255 / 0.18)";
      g.beginPath();
      g.roundRect(
        left + rim,
        top + rim,
        side - 2 * rim,
        side - 2 * rim,
        corner * 0.6,
      );
      g.stroke();
      g.strokeStyle = "rgb(0 0 0 / 0.14)";
      g.beginPath();
      g.roundRect(
        left + rim + 0.1 * scale,
        top + rim + 0.1 * scale,
        side - 2 * rim,
        side - 2 * rim,
        corner * 0.6,
      );
      g.stroke();
    }
    // Peg shadows, falling right and down from the light at the top left.
    const reachX = SHADOW_X * peg.height;
    const reachY = SHADOW_Y * peg.height;
    for (const p of board.pegs) {
      const x = cx + p.x * scale;
      const y = cy + p.y * scale;
      softShadow(g, 0.08 * scale, "rgb(0 0 0 / 0.42)", (o) => {
        g.lineCap = "round";
        g.lineWidth = peg.shank * 2 * scale;
        g.beginPath();
        g.moveTo(x + o, y);
        g.lineTo(x + o + reachX * scale, y + reachY * scale);
        g.stroke();
        g.beginPath();
        g.arc(
          x + o + reachX * scale,
          y + reachY * scale,
          peg.head * scale,
          0,
          TAU,
        );
        g.fill();
      });
    }
    g.restore();

    // The pegs' tops, on a layer of their own so bands below the tops go under them.
    hg.setTransform(dpr, 0, 0, dpr, 0, 0);
    hg.clearRect(0, 0, width, height);
    for (const p of board.pegs) {
      const x = cx + p.x * scale;
      const y = cy + p.y * scale;
      const r = peg.head * scale;
      if (peg.kind === "nail") {
        const brass = settings.material === "birch";
        const gradient = hg.createRadialGradient(
          x - r * 0.4,
          y - r * 0.45,
          r * 0.05,
          x,
          y,
          r,
        );
        gradient.addColorStop(0, brass ? "#fff1c4" : "#ffffff");
        gradient.addColorStop(0.3, brass ? "#d7aa55" : "#b9bec4");
        gradient.addColorStop(0.8, brass ? "#9a6f2a" : "#7b8087");
        gradient.addColorStop(1, brass ? "#5e4116" : "#43474d");
        hg.fillStyle = gradient;
        hg.beginPath();
        hg.arc(x, y, r, 0, TAU);
        hg.fill();
        hg.lineWidth = Math.max(0.6, 0.02 * scale);
        hg.strokeStyle = "rgb(0 0 0 / 0.35)";
        hg.stroke();
      } else {
        const { base, light } = SURFACES.plastic;
        const gradient = hg.createRadialGradient(
          x - r * 0.35,
          y - r * 0.4,
          r * 0.1,
          x,
          y,
          r,
        );
        gradient.addColorStop(0, css(mix(light, [255, 255, 255], 0.35)));
        gradient.addColorStop(0.6, css(light));
        gradient.addColorStop(1, css(mix(base, [0, 0, 0], 0.25)));
        hg.fillStyle = gradient;
        hg.beginPath();
        hg.arc(x, y, r, 0, TAU);
        hg.fill();
        // The lip round the top.
        hg.lineWidth = 0.05 * scale;
        hg.strokeStyle = "rgb(255 255 255 / 0.35)";
        hg.beginPath();
        hg.arc(x, y, r * 0.78, Math.PI * 0.9, Math.PI * 1.85);
        hg.stroke();
      }
    }
  }

  function shadesFor(band: Band): Shades {
    if (band.shades) return band.shades;
    let color = band.color;
    if (band.perished) color = mix(color, [118, 100, 82], 0.42);
    const white: [number, number, number] = [255, 255, 255];
    const black: [number, number, number] = [0, 0, 0];
    const shades: Shades = { edge: [], body: [], light: [] };
    for (let q = 0; q < LEVELS; q++) {
      const stretch = 1 + q / 2.5;
      // Thinner rubber lets more light through, so a stretched band looks paler.
      const thin = 1 - 1 / stretch;
      const body = mix(color, white, 0.32 * thin);
      shades.edge.push(css(mix(body, black, 0.4)));
      shades.body.push(css(body));
      shades.light.push(
        css(
          mix(body, white, band.perished ? 0.25 : 0.55),
          band.perished ? 0.35 : 0.6,
        ),
      );
    }
    band.shades = shades;
    return shades;
  }

  function level(stretch: number) {
    return clamp(Math.round((stretch - 1) * 2.5), 0, LEVELS - 1);
  }

  function widthAt(q: number) {
    return WIDTH / Math.sqrt(1 + q / 2.5);
  }

  // Whether piece i of a band is inside a run that's ringing, and so drawn as a blur instead.
  function ringing(band: Band, i: number) {
    for (const t of twangs) {
      if (t.band !== band || clock < t.start) continue;
      const span = (t.b - t.a + band.n) % band.n;
      const offset = (i - t.a + band.n) % band.n;
      if (offset > 0 && offset < span) return true;
    }
    return false;
  }

  const ox = new Float64Array(4096);
  const oy = new Float64Array(4096);
  const pass = new Uint8Array(4096);
  const levels = new Uint8Array(4096);
  const skip = new Uint8Array(4096);

  function prepare(band: Band) {
    const { n, x, y, z, lam } = band;
    const top = peg.height - 0.04;
    for (let i = 0; i < n; i++) {
      const a = band.closed ? (i - 1 + n) % n : Math.max(0, i - 1);
      const b = band.closed ? (i + 1) % n : Math.min(n - 1, i + 1);
      const [tx, ty] = normalize2(x[b] - x[a], y[b] - y[a]);
      // The band's cross-section is round, so its highlight sits towards the light.
      const nx = -ty;
      const ny = tx;
      const facing = nx * LIGHT[0] + ny * LIGHT[1];
      ox[i] = nx * facing;
      oy[i] = ny * facing;
      pass[i] = z[i] >= top ? 1 : 0;
      levels[i] = level(lam[i]);
      skip[i] = twangs.length && ringing(band, i) ? 1 : 0;
    }
  }

  // Traces pieces from..to (inclusive) of a band, each a curve from the midpoint before a bead,
  // through it, to the midpoint after, nudged sideways by `shift` times its own width.
  function trace(band: Band, from: number, to: number, shift: number) {
    const { n, x, y, closed } = band;
    const at = (i: number) => {
      const w = widthAt(levels[i]) * shift;
      return [x[i] + ox[i] * w, y[i] + oy[i] * w] as const;
    };
    const mid = (i: number, j: number) => {
      const [ax, ay] = at(i);
      const [bx, by] = at(j);
      return [(ax + bx) / 2, (ay + by) / 2] as const;
    };
    for (let i = from; i <= to; i++) {
      const prev = closed ? (i - 1 + n) % n : i - 1;
      const next = closed ? (i + 1) % n : i + 1;
      const [px, py] = at(i);
      const [sx, sy] = prev < 0 ? [px, py] : mid(prev, i);
      const [ex, ey] = next >= n ? [px, py] : mid(i, next);
      if (i === from) ctx.moveTo(sx, sy);
      ctx.quadraticCurveTo(px, py, ex, ey);
    }
  }

  function drawShadow(band: Band) {
    const { n, x, y, z, closed } = band;
    ctx.globalAlpha = band.fade;
    for (const [alpha, grow] of [
      [0.07, 3.2],
      [0.2, 1.1],
    ] as const) {
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const lift = z[i] - floorAt(x[i], y[i]) + HALF + 0.03;
        const sx = x[i] + SHADOW_X * lift;
        const sy = y[i] + SHADOW_Y * lift;
        if (i === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      }
      if (closed) ctx.closePath();
      ctx.strokeStyle = `rgb(0 0 0 / ${alpha})`;
      ctx.lineWidth = WIDTH * grow;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function drawBody(band: Band, which: 0 | 1) {
    const { n } = band;
    const shades = shadesFor(band);
    // Runs of pieces on this side of the peg tops, unskipped, at one stretch level.
    const groups: [number, number, number][] = [];
    let open = -1;
    for (let i = 0; i < n; i++) {
      const take = pass[i] === which && !skip[i];
      const q = levels[i];
      if (take && open >= 0 && levels[open] === q) continue;
      if (open >= 0) groups.push([open, i - 1, levels[open]]);
      open = take ? i : -1;
    }
    if (open >= 0) groups.push([open, n - 1, levels[open]]);
    if (!groups.length) return;
    ctx.globalAlpha = band.fade;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const layers = [
      { color: shades.edge, width: 1, shift: 0 },
      { color: shades.body, width: 0.66, shift: 0.1 },
      { color: shades.light, width: 0.22, shift: 0.26 },
    ];
    for (const layer of layers) {
      for (const [from, to, q] of groups) {
        ctx.beginPath();
        trace(band, from, to, layer.shift);
        ctx.strokeStyle = layer.color[q];
        ctx.lineWidth = widthAt(q) * layer.width;
        ctx.stroke();
      }
    }
    // Old rubber is crazed across, and the cracks open as it stretches.
    if (band.perished) {
      ctx.strokeStyle = shades.edge[0];
      for (let i = 2; i < n; i += 5) {
        if (pass[i] !== which || skip[i]) continue;
        const w = widthAt(levels[i]) * 0.5;
        const [nx, ny] = normalize2(ox[i] || 1e-6, oy[i]);
        const open = clamp((band.lam[i] - 1) * 0.012, 0.004, 0.03);
        ctx.lineWidth = open;
        ctx.beginPath();
        ctx.moveTo(band.x[i] - nx * w, band.y[i] - ny * w);
        ctx.lineTo(band.x[i] + nx * w, band.y[i] + ny * w);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  // A ringing run seen with the eye, not a camera: it's a blur between the extremes of its
  // swing, darkest at the edges, where the rubber slows to turn round and spends the most time.
  function drawTwangs() {
    for (const t of twangs) {
      if (clock < t.start) continue;
      const band = t.band;
      const age = clock - t.start;
      const amplitude = t.amplitude * Math.exp(-age / (t.tau * 0.9));
      const ax = band.x[t.a];
      const ay = band.y[t.a];
      const bx = band.x[t.b];
      const by = band.y[t.b];
      const [dx, dy] = normalize2(bx - ax, by - ay);
      const nx = -dy;
      const ny = dx;
      const run = Math.hypot(bx - ax, by - ay);
      const stretch = run / (((t.b - t.a + band.n) % band.n) * band.rest);
      const q = level(stretch);
      const shades = shadesFor(band);
      const copies = 10;
      ctx.lineCap = "round";
      ctx.globalAlpha = band.fade * (amplitude > 0.02 ? 0.3 : 1);
      ctx.strokeStyle = shades.body[q];
      ctx.lineWidth = widthAt(q) * 0.85;
      for (let k = 0; k < copies; k++) {
        const swing = amplitude * Math.sin((TAU * (k + 0.5)) / copies);
        ctx.beginPath();
        for (let s = 0; s <= 16; s++) {
          const u = s / 16;
          const off = swing * Math.sin(Math.PI * u);
          const px = ax + (bx - ax) * u + nx * off;
          const py = ay + (by - ay) * u + ny * off;
          if (s === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
  }

  function drawLabels() {
    if (!settings.areas) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const size = clamp(scale * 0.5, 10, 13);
    ctx.font = `600 ${size}px ui-sans-serif, system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    // Shapes round the same middle, such as squares inside squares, stack their labels
    // downwards rather than on top of each other.
    const placed: { x: number; y: number; w: number; h: number }[] = [];
    for (const band of bands) {
      if (band.state !== "on" || !band.label || !band.shape?.label) continue;
      const text = band.shape.label;
      const x = cx + band.label.x * scale;
      let y = cy + band.label.y * scale;
      const w = ctx.measureText(text).width + size * 0.9;
      const h = size * 1.45;
      for (let tries = 0; tries < 8; tries++) {
        const clash = placed.some(
          (r) => Math.abs(r.x - x) < (r.w + w) / 2 && Math.abs(r.y - y) < h + 2,
        );
        if (!clash) break;
        y += h + 3;
      }
      placed.push({ x, y, w, h });
      ctx.globalAlpha = band.fade;
      ctx.fillStyle = "rgb(255 255 255 / 0.9)";
      ctx.beginPath();
      ctx.roundRect(x - w / 2, y - h / 2, w, h, h / 2);
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = css(band.color);
      ctx.stroke();
      ctx.fillStyle = "#1c1d1f";
      ctx.fillText(text, x, y + size * 0.04);
    }
    ctx.globalAlpha = 1;
  }

  function draw() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(background, 0, 0);
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * cx, dpr * cy);
    for (const band of bands) {
      if (band.dropping && clock < band.dropAt) continue;
      drawShadow(band);
    }
    for (const band of bands) {
      if (band.dropping && clock < band.dropAt) continue;
      prepare(band);
      drawBody(band, 0);
    }
    // Ringing runs are down among the pegs, so their blur goes under the heads.
    drawTwangs();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(heads, 0, 0);
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * cx, dpr * cy);
    for (const band of bands) {
      if (band.dropping && clock < band.dropAt) continue;
      prepare(band);
      drawBody(band, 1);
    }
    drawLabels();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  // ---- Loop --------------------------------------------------------------------------------

  let frame = 0;
  let last = 0;
  let running = false;
  let awake = 0;
  let dirty = true;
  let reportAt = 0;
  let lastReport = "";

  function report(force = false) {
    if (!onStats) return;
    const now = performance.now();
    if (!force && now - reportAt < 250) return;
    reportAt = now;
    let runs: Run[] = [];
    if (lastBand && bands.includes(lastBand)) runs = updateShape(lastBand);
    const notes = runs
      .map((run) => run.frequency)
      .filter((f): f is number => f !== null)
      .map(noteName);
    const stats: GeoboardStats = {
      bands: bands.filter((b) => b.state === "on").length,
      note,
      hertz,
      shape: lastBand?.shape ?? null,
      runs: notes,
    };
    const key = JSON.stringify(stats);
    if (key === lastReport && !force) return;
    lastReport = key;
    onStats(stats);
  }

  function tick(now: number) {
    frame = requestAnimationFrame(tick);
    const dt = Math.min(1 / 30, Math.max(0, (now - last) / 1000) || 1 / 60);
    last = now;
    const busy =
      grab !== null ||
      twangs.length > 0 ||
      bands.some((b) => b.state !== "on" || b.dropping);
    if (busy || awake > 0) {
      clock += dt;
      step(dt);
      let fastest = 0;
      for (const band of bands) {
        for (let i = 0; i < band.n; i++) {
          const v =
            Math.abs(band.vx[i]) + Math.abs(band.vy[i]) + Math.abs(band.vz[i]);
          if (v > fastest) fastest = v;
        }
      }
      awake = fastest > 1.5 ? Math.max(awake, 0.4) : awake - dt;
      for (let i = twangs.length - 1; i >= 0; i--) {
        const t = twangs[i];
        if (clock - t.start > t.tau * 5) twangs.splice(i, 1);
      }
      for (const band of bands) {
        if (band.state === "on" && !band.dropping) updateShape(band);
      }
      dirty = true;
    }
    if (dirty) {
      draw();
      dirty = false;
    }
    report();
  }

  function start() {
    if (running) return;
    running = true;
    last = performance.now();
    frame = requestAnimationFrame(tick);
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    width = rect.width;
    height = rect.height;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
    const room = Math.min(width, height) - Math.min(width, height) * 0.08 - 8;
    scale = Math.max(4, room / (board.half * 2));
    cx = width / 2;
    cy = height / 2;
    renderBackground();
    dirty = true;
    draw();
  }
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);

  const themeWatch = new MutationObserver(() => {
    const next = document.documentElement.classList.contains("dark");
    if (next === dark) return;
    dark = next;
    renderBackground();
    dirty = true;
  });
  themeWatch.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });

  resize();
  start();

  function clearAll(stagger: boolean) {
    const list = bands.filter((b) => b.state === "on");
    list.forEach((band, i) => {
      if (stagger && !reduceMotion) {
        setTimeout(() => sendAway(band), i * 30);
      } else {
        removeBand(band);
      }
    });
    lastBand = null;
    awake = 1;
  }

  // Drops the pinched bead on the far side of a peg, with its neighbours round either side of
  // it, so the band comes down hooked round the peg rather than on top of it.
  function hook(band: Band, i: number, pegIndex: number) {
    const p = board.pegs[pegIndex];
    const { n } = band;
    let sx = 0;
    let sy = 0;
    let count = 0;
    for (let k = 6; k <= 10; k++) {
      for (const j of [(i + k) % n, (i - k + n) % n]) {
        sx += band.x[j];
        sy += band.y[j];
        count++;
      }
    }
    let [ux, uy] = normalize2(sx / count - p.x, sy / count - p.y);
    if (!Number.isFinite(ux) || (ux === 0 && uy === 0)) [ux, uy] = [0, 1];
    const r = reach + 0.02;
    const far = Math.atan2(-uy, -ux);
    const low = Math.min(peg.height * 0.5, band.z[i]);
    const place = (j: number, angle: number) => {
      band.x[j] = band.px[j] = p.x + r * Math.cos(angle);
      band.y[j] = band.py[j] = p.y + r * Math.sin(angle);
      band.z[j] = band.pz[j] = low;
      band.vx[j] = band.vy[j] = band.vz[j] = 0;
    };
    place(i, far);
    // Which side each neighbour goes: the side its own end of the band is already on.
    const left = (i - 8 + n) % n;
    const side =
      Math.sign((band.x[left] - p.x) * -uy + (band.y[left] - p.y) * ux) || 1;
    // The hand presses the band down as it lets go, to just above the other pegs.
    for (let k = 4; k < n / 2; k++) {
      for (const j of [(i + k) % n, (i - k + n) % n]) {
        if (band.z[j] > peg.height + 0.15) {
          band.z[j] = band.pz[j] = Math.max(peg.height + 0.15, band.z[j] * 0.5);
          band.vz[j] = 0;
        }
      }
    }
    const step = Math.min(1.2, (band.rest * 1.6) / r);
    for (let k = 1; k <= 3; k++) {
      const angle = Math.min(Math.PI / 2, k * step);
      place((i - k + n) % n, far - side * angle);
      place((i + k) % n, far + side * angle);
    }
  }

  return {
    setSettings(next: Partial<GeoboardSettings>) {
      const previous = settings;
      settings = { ...settings, ...next };
      const boardChanged = settings.board !== previous.board;
      const materialChanged = settings.material !== previous.material;
      if (boardChanged || materialChanged) {
        // Turning the board over or swapping it tips every band off.
        if (boardChanged) {
          bands.length = 0;
          twangs.length = 0;
          grab = null;
          lastBand = null;
        }
        board = makeBoard(settings.board);
        peg = PEGS[settings.material];
        reach = peg.shank + HALF;
        buildCells();
        voice?.setMaterial(settings.material);
        resize();
        awake = 1;
      }
      if (settings.palette !== previous.palette) colorTurn = 0;
      dirty = true;
      report(true);
    },

    hover(p: Point, coarse = false) {
      return pick(toBoard(p), coarse)?.kind ?? null;
    },

    pointerDown(pointer: number, p: Point, coarse = false) {
      if (grab) return false;
      const q = toBoard(p);
      const target = pick(q, coarse);
      if (!target) return false;
      let band: Band;
      let index: number;
      let fresh = false;
      if (target.kind === "band") {
        band = target.band;
        index = target.index;
      } else {
        ({ band, index } = newBand(target.peg, q));
        fresh = true;
      }
      // Whatever was ringing on this band is damped by the finger.
      for (let i = twangs.length - 1; i >= 0; i--) {
        if (twangs[i].band === band) twangs.splice(i, 1);
      }
      grab = {
        band,
        index,
        pointer,
        tx: q.x,
        ty: q.y,
        sx: q.x,
        sy: q.y,
        moved: 0,
        lift: band.z[index],
        at: performance.now(),
        fresh,
      };
      if (!fresh) {
        grab.tx = band.x[index];
        grab.ty = band.y[index];
      }
      lastBand = band;
      // Moved to the top of the pile.
      bands.splice(bands.indexOf(band), 1);
      bands.push(band);
      awake = 2;
      return true;
    },

    pointerMove(pointer: number, p: Point) {
      if (!grab || grab.pointer !== pointer) return;
      const q = toBoard(p);
      grab.tx = clamp(q.x, -board.half - 4, board.half + 4);
      grab.ty = clamp(q.y, -board.half - 4, board.half + 4);
      grab.moved = Math.max(
        grab.moved,
        Math.hypot(q.x - grab.sx, q.y - grab.sy),
      );
      // The further it's pulled, the higher a hand lifts it, so it clears the pegs it crosses.
      grab.lift = Math.max(
        grab.lift,
        Math.min(peg.height + LIFT_ABOVE, HALF + 0.2 + grab.moved * 1.2),
      );
      awake = 2;
    },

    pointerUp(pointer: number) {
      if (!grab || grab.pointer !== pointer) return null;
      const g = grab;
      grab = null;
      const band = g.band;
      const i = g.index;
      awake = 2;
      if (band.state !== "on") return null;
      const quick = performance.now() - g.at < 280;
      if (
        Math.abs(g.tx) > board.half + 0.3 ||
        Math.abs(g.ty) > board.half + 0.3
      ) {
        sendAway(band);
        report(true);
        return "removed";
      }
      if (g.fresh && g.moved < 0.4) {
        removeBand(band);
        report(true);
        return null;
      }
      if (!g.fresh && g.moved < 0.3) {
        // A tap: a flick of the fingertip across the run.
        const run = runAt(band, i);
        if (run) {
          const u =
            ((band.x[i] - band.x[run.a]) * (band.x[run.b] - band.x[run.a]) +
              (band.y[i] - band.y[run.a]) * (band.y[run.b] - band.y[run.a])) /
            (run.length * run.length || 1);
          startTwang(band, run, quick ? 0.35 : 0.2, clamp(u, 0.05, 0.95));
        } else {
          voice?.thud(0.3);
        }
        return "pluck";
      }
      const target = nearestPeg(
        { x: g.tx, y: g.ty },
        Math.min(board.pitch * 0.42, 1.3),
      );
      if (target >= 0 && (g.moved > 0.5 || g.fresh)) {
        hook(band, i, target);
        voice?.tick(0.8);
        lastBand = band;
        report(true);
        return "hook";
      }
      // Let go in mid-air: it springs back to its pegs, and twangs as it does.
      const run = runAt(band, i);
      if (run) {
        const ax = band.x[run.a];
        const ay = band.y[run.a];
        const [dx, dy] = normalize2(band.x[run.b] - ax, band.y[run.b] - ay);
        const off = Math.abs((g.tx - ax) * -dy + (g.ty - ay) * dx);
        const along = ((g.tx - ax) * dx + (g.ty - ay) * dy) / (run.length || 1);
        startTwang(
          band,
          run,
          clamp(off / 1.2, 0.2, 1),
          clamp(along, 0.05, 0.95),
          0.03,
        );
      } else {
        voice?.thud(0.5);
      }
      return "release";
    },

    strum() {
      const all: { band: Band; run: Run; x: number }[] = [];
      for (const band of bands) {
        if (band.state !== "on" || band.dropping) continue;
        for (const run of analyse(band).runs) {
          if (!run.frequency) continue;
          all.push({ band, run, x: (band.x[run.a] + band.x[run.b]) / 2 });
        }
      }
      all.sort((a, b) => a.x - b.x);
      all.forEach(({ band, run }, k) => {
        startTwang(band, run, 0.55, 0.3, k * 0.05);
      });
      awake = 2;
      return all.length;
    },

    clear() {
      clearAll(true);
      report(true);
    },

    // Takes the last band off.
    undo() {
      const band = [...bands].reverse().find((b) => b.state === "on");
      if (band) sendAway(band);
      awake = 1;
      report(true);
    },

    pattern(value: string) {
      clearAll(false);
      const orders = patternBands(board, value);
      // The first band of a pattern is its main figure, so it's the one measured in the panel.
      orders.forEach((order, k) => {
        if (order.some((i) => i < 0)) return;
        const length = value === "same-note" ? BAND_LENGTH.small : null;
        const band = addPatternBand(order, length, 0.05 + k * 0.16);
        if (k === 0) lastBand = band;
      });
      awake = 2;
      report(true);
    },

    dispose() {
      cancelAnimationFrame(frame);
      running = false;
      observer.disconnect();
      themeWatch.disconnect();
    },
  };
}
