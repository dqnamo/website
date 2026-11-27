// The type, and what happens in the instant a typebar hits the paper. Everything here is in
// sheet pixels at 300 to the inch. A pica machine spaces ten letters to the inch and six lines to
// the inch, and 12 pt Courier is drawn on exactly that grid (its letters are 0.6 em wide), so a
// letter's cell is 30 by 50 pixels.
//
// A typebar doesn't print a letter so much as hit the paper with it. The slug is driven by the
// typist's finger through the key lever, and lands with roughly the same blow whatever is on it,
// so the pressure on the paper is that blow spread over the face of the letter: an M spreads it
// thin, a full stop concentrates it on a dot, which is why full stops print blackest and are the
// first thing to go through thin paper. The ink comes off a woven ribbon between the type and the
// paper. Pressed lightly, only the crowns of the threads touch and the letter comes out speckled
// with the weave; pressed hard, the fabric flattens, the ink squashes out a little round the
// edges and the letter thickens.
//
// No two typebars on a machine are bent quite alike. Each one prints its letter a fraction off
// the line, turned a little, or "off its feet" (tilted, so one side lands harder than the other),
// and it does so every time: this is how a typescript is traced to its machine. Both cases of a
// letter share one slug, so a and A have the same faults, and capitals carry the error of the
// shift as well. Ink and paper fluff pack into the enclosed parts of the type (the eye of the e,
// the bowl of the a) until they print as solid blots, and a slug that's been knocked has a nick
// out of it that shows in every copy.

export const DPI = 300;
export const PITCH = 30;
export const LINE = 50;
// A4.
export const SHEET_W = 2480;
export const SHEET_H = 3508;
// The dents in the paper are kept at half the resolution of the ink.
export const DENT_SCALE = 2;
export const DENT_W = SHEET_W / DENT_SCALE;
export const DENT_H = Math.ceil(SHEET_H / DENT_SCALE);

// The patch a strike can touch, and where the letter's cell and baseline sit in it.
export const GW = 72;
export const GH = 104;
export const ORIGIN_X = (GW - PITCH) / 2;
export const BASE_Y = 70;
// Where the slug turns about when its bar is bent: roughly the middle of a small letter.
const PIVOT_X = ORIGIN_X + PITCH / 2;
const PIVOT_Y = BASE_Y - 14;

// A ribbon is half an inch wide, black above and red below on a two-colour ribbon. The vibrator
// lifts it so the right half sits in front of the type.
const RIBBON = 153;
const HALF = RIBBON / 2;
// The ribbon's top edge, relative to the baseline, when it's lifted properly for each half.
const RIBBON_TOP_BLACK = -50;
const RIBBON_TOP_RED = -50 - HALF;
// The weave's pitch: about 85 threads to the inch.
const WEAVE = 3.6;

export type Condition = "new" | "used" | "battered";
export type RibbonMode = "black" | "red" | "stencil";
export type Rgb = [number, number, number];

export const INK: Record<"black" | "red" | "carbon", Rgb> = {
  black: [33, 31, 45],
  red: [172, 33, 40],
  carbon: [36, 44, 112],
};

// ---------------------------------------------------------------------------------------------
// The keyboard. Each slug carries two characters, lower case and the shifted one. There's no 1
// and no ! (a lower-case l served for one, and an apostrophe over a full stop for the other),
// and the comma and full stop are on both halves of their slugs so they can be typed either way.

const ROWS = [
  ['2"', "3£", "4$", "5%", "6&", "7'", "8(", "9)", "0_", "-*", "=+"],
  ["qQ", "wW", "eE", "rR", "tT", "yY", "uU", "iI", "oO", "pP", "@#"],
  ["aA", "sS", "dD", "fF", "gG", "hH", "jJ", "kK", "lL", ";:"],
  ["zZ", "xX", "cC", "vV", "bB", "nN", "mM", ",,", "..", "/?"],
];
// How far along its row each key sits, in key widths, from the q column.
const ROW_START = [1, 0, 0.3, 0.75];
// Touch typing: which finger strikes a key in each column, and how hard that finger hits. Little
// fingers are weakest, so a touch typist's a, q, z and p come out lighter than the rest.
const FINGER_BY_COLUMN = [
  "left little",
  "left ring",
  "left middle",
  "left index",
  "left index",
  "right index",
  "right index",
  "right middle",
  "right ring",
  "right little",
  "right little",
  "right little",
];
const FINGER_STRENGTH: Record<string, number> = {
  little: 0.7,
  ring: 0.83,
  middle: 0.96,
  index: 1,
};

export type Key = {
  slug: string;
  upper: boolean;
  finger: string;
  strength: number;
  // Where the slug's bar sits in the basket, from -1 (far left) to 1 (far right).
  basket: number;
};

export const KEYS = new Map<string, Key>();
for (const slug of ROWS.flat()) {
  const row = ROWS.findIndex((r) => r.includes(slug));
  const column = ROWS[row].indexOf(slug);
  const finger =
    FINGER_BY_COLUMN[
      Math.max(0, Math.min(11, Math.round(column + ROW_START[row] - 0.3)))
    ];
  const strength = FINGER_STRENGTH[finger.split(" ")[1]];
  // The bars fan round the basket in keyboard order, each row's bars between the next row's,
  // so a key's bar comes up from the side of the machine its key is on.
  const basket = ((column + ROW_START[row] + row * 0.24) / 12.5) * 2 - 1;
  const [lower, upper] = [...slug];
  if (!KEYS.has(upper))
    KEYS.set(upper, { slug, upper: true, finger, strength, basket });
  KEYS.set(lower, { slug, upper: false, finger, strength, basket });
}
export const SLUGS = ROWS.flat();

// ---------------------------------------------------------------------------------------------
// Small helpers.

export function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gauss(random: () => number) {
  return (
    Math.sqrt(-2 * Math.log(random() + 1e-9)) * Math.cos(2 * Math.PI * random())
  );
}

export function smoothstep(a: number, b: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function sample(field: Float32Array, x: number, y: number) {
  if (x < 0 || y < 0 || x >= GW - 1 || y >= GH - 1) return 0;
  const x0 = x | 0;
  const y0 = y | 0;
  const fx = x - x0;
  const fy = y - y0;
  const i = y0 * GW + x0;
  const a = field[i] + (field[i + 1] - field[i]) * fx;
  const b = field[i + GW] + (field[i + GW + 1] - field[i + GW]) * fx;
  return a + (b - a) * fy;
}

// ---------------------------------------------------------------------------------------------
// Paper. A tile of fibre and formation noise that the ink, the dents and the picture of the sheet
// all share, so the mottle in a letter lines up with the mottle in the paper under it.

export const FIBRE_SIZE = 512;
export function createFibres(seed = 7) {
  const random = mulberry(seed);
  const n = FIBRE_SIZE;
  const out = new Float32Array(n * n);
  // Formation: the cloudiness of paper held to the light, a few octaves of smooth noise.
  for (const [cells, weight] of [
    [12, 0.35],
    [32, 0.35],
    [96, 0.3],
  ] as const) {
    const grid = new Float32Array((cells + 1) * (cells + 1));
    for (let i = 0; i < grid.length; i++) grid[i] = random();
    for (let i = 0; i <= cells; i++)
      grid[i * (cells + 1) + cells] = grid[i * (cells + 1)];
    for (let i = 0; i <= cells; i++) grid[cells * (cells + 1) + i] = grid[i];
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const gx = (x / n) * cells;
        const gy = (y / n) * cells;
        const x0 = Math.floor(gx);
        const y0 = Math.floor(gy);
        const fx = smoothstep(0, 1, gx - x0);
        const fy = smoothstep(0, 1, gy - y0);
        const r = cells + 1;
        const a =
          grid[y0 * r + x0] + (grid[y0 * r + x0 + 1] - grid[y0 * r + x0]) * fx;
        const b =
          grid[(y0 + 1) * r + x0] +
          (grid[(y0 + 1) * r + x0 + 1] - grid[(y0 + 1) * r + x0]) * fx;
        out[y * n + x] += (a + (b - a) * fy) * weight;
      }
    }
  }
  // Fibres: short curved hairs, a little denser or thinner than the paper round them.
  for (let f = 0; f < 3600; f++) {
    let x = random() * n;
    let y = random() * n;
    let angle = random() * Math.PI * 2;
    const length = 6 + random() * 22;
    const sign = random() < 0.5 ? -0.12 : 0.1;
    for (let s = 0; s < length; s++) {
      const i = ((Math.floor(y) + n) % n) * n + ((Math.floor(x) + n) % n);
      out[i] += sign;
      angle += (random() - 0.5) * 0.3;
      x += Math.cos(angle);
      y += Math.sin(angle);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Glyphs: each character drawn once into a coverage mask, with its area, and the distance into
// any enclosed counters, so gunk can fill them from the walls inwards.

export type Glyph = {
  mask: Float32Array;
  area: number;
  cx: number;
  cy: number;
  depth: Float32Array;
  maxDepth: number;
};

let family = "monospace";
let size = 50;
const glyphs = new Map<string, Glyph>();
let raster: CanvasRenderingContext2D | null = null;

function rasteriser() {
  if (!raster) {
    const canvas = document.createElement("canvas");
    canvas.width = GW;
    canvas.height = GH;
    raster = canvas.getContext("2d", { willReadFrequently: true });
  }
  return raster;
}

// Sizes the face so its letters are exactly one pica wide.
export function setTypeFace(face: string) {
  family = face;
  const ctx = rasteriser();
  if (ctx) {
    ctx.font = `400 100px ${family}`;
    const advance = ctx.measureText("M").width;
    if (advance > 30 && advance < 90) size = (PITCH / advance) * 100;
  }
  glyphs.clear();
}

export function glyph(char: string): Glyph {
  const cached = glyphs.get(char);
  if (cached) return cached;
  const ctx = rasteriser();
  const mask = new Float32Array(GW * GH);
  if (ctx) {
    ctx.clearRect(0, 0, GW, GH);
    ctx.font = `400 ${size}px ${family}`;
    ctx.fillStyle = "#000";
    ctx.textBaseline = "alphabetic";
    const width = ctx.measureText(char).width;
    ctx.fillText(char, ORIGIN_X + (PITCH - width) / 2, BASE_Y);
    const data = ctx.getImageData(0, 0, GW, GH).data;
    for (let i = 0; i < mask.length; i++) mask[i] = data[i * 4 + 3] / 255;
  }
  const made = measure(mask);
  glyphs.set(char, made);
  return made;
}

function measure(mask: Float32Array): Glyph {
  let area = 0;
  let sx = 0;
  let sy = 0;
  for (let y = 0; y < GH; y++) {
    for (let x = 0; x < GW; x++) {
      const m = mask[y * GW + x];
      area += m;
      sx += m * x;
      sy += m * y;
    }
  }
  // Counters: background the outside can't reach without crossing the letter.
  const solid = (i: number) => mask[i] > 0.45;
  const outside = new Uint8Array(GW * GH);
  const stack: number[] = [];
  for (let x = 0; x < GW; x++) stack.push(x, (GH - 1) * GW + x);
  for (let y = 0; y < GH; y++) stack.push(y * GW, y * GW + GW - 1);
  while (stack.length) {
    const i = stack.pop() as number;
    if (outside[i] || solid(i)) continue;
    outside[i] = 1;
    const x = i % GW;
    if (x > 0) stack.push(i - 1);
    if (x < GW - 1) stack.push(i + 1);
    if (i >= GW) stack.push(i - GW);
    if (i < GW * (GH - 1)) stack.push(i + GW);
  }
  const depth = new Float32Array(GW * GH);
  let maxDepth = 0;
  // Distance from the walls, by repeated relaxation (a chamfer transform, near enough).
  for (let i = 0; i < depth.length; i++) {
    depth[i] = !outside[i] && !solid(i) ? 1e9 : 0;
  }
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 1; y < GH - 1; y++) {
      for (let x = 1; x < GW - 1; x++) {
        const i = y * GW + x;
        if (!depth[i]) continue;
        depth[i] = Math.min(
          depth[i],
          depth[i - 1] + 1,
          depth[i - GW] + 1,
          depth[i - GW - 1] + Math.SQRT2,
          depth[i - GW + 1] + Math.SQRT2,
        );
      }
    }
    for (let y = GH - 2; y > 0; y--) {
      for (let x = GW - 2; x > 0; x--) {
        const i = y * GW + x;
        if (!depth[i]) continue;
        depth[i] = Math.min(
          depth[i],
          depth[i + 1] + 1,
          depth[i + GW] + 1,
          depth[i + GW + 1] + Math.SQRT2,
          depth[i + GW - 1] + Math.SQRT2,
        );
      }
    }
  }
  for (let i = 0; i < depth.length; i++) {
    if (depth[i] > 1e8) depth[i] = 0;
    maxDepth = Math.max(maxDepth, depth[i]);
  }
  return {
    mask,
    area,
    cx: area ? sx / area : PIVOT_X,
    cy: area ? sy / area : PIVOT_Y,
    depth,
    maxDepth,
  };
}

// ---------------------------------------------------------------------------------------------
// A machine: the faults of each typebar, of the shift and of the ribbon vibrator.

export type Bar = {
  dx: number;
  dy: number;
  rot: number;
  // Off its feet: how much harder one side of the face lands, across and down.
  tx: number;
  ty: number;
};

export type Machine = {
  condition: Condition;
  bars: Map<string, Bar>;
  // Capitals: the shifted basket doesn't come down quite where it should.
  shift: Bar;
  // How far short of its proper height the vibrator lifts the ribbon, in pixels.
  lift: number;
  // Nicks out of slugs, and the mask with the nick taken out.
  nicks: Map<string, Glyph>;
  gunkRate: number;
  gunkStart: number;
};

const CONDITIONS: Record<
  Condition,
  {
    seed: number;
    offset: number;
    rot: number;
    tilt: number;
    outliers: number;
    shift: Bar;
    lift: number;
    nicks: string[];
    gunkRate: number;
    gunkStart: number;
  }
> = {
  new: {
    seed: 11,
    offset: 0.3,
    rot: 0.003,
    tilt: 0.05,
    outliers: 0,
    shift: { dx: 0, dy: -0.4, rot: 0, tx: 0, ty: 0.02 },
    lift: 2,
    nicks: [],
    gunkRate: 0.0035,
    gunkStart: 0,
  },
  used: {
    seed: 23,
    offset: 0.9,
    rot: 0.011,
    tilt: 0.15,
    outliers: 2,
    shift: { dx: 0.4, dy: -1.8, rot: 0.004, tx: 0, ty: 0.12 },
    lift: 8,
    nicks: ["t"],
    gunkRate: 0.007,
    gunkStart: 0.32,
  },
  battered: {
    seed: 37,
    offset: 1.7,
    rot: 0.022,
    tilt: 0.3,
    outliers: 4,
    shift: { dx: 0.8, dy: -3.6, rot: 0.012, tx: 0.08, ty: 0.24 },
    lift: 19,
    nicks: ["e", "r", "S"],
    gunkRate: 0.011,
    gunkStart: 0.7,
  },
};

// How often each letter turns up in English, relative to e: the letters typed most clog first.
const FREQUENCY: Record<string, number> = {
  e: 1,
  a: 0.65,
  o: 0.6,
  d: 0.34,
  g: 0.16,
  p: 0.15,
  b: 0.12,
  q: 0.01,
  "6": 0.05,
  "8": 0.05,
  "9": 0.05,
  "0": 0.07,
  "4": 0.04,
  "@": 0.02,
  "&": 0.02,
};

export function createMachine(condition: Condition): Machine {
  const spec = CONDITIONS[condition];
  const random = mulberry(spec.seed);
  const bars = new Map<string, Bar>();
  for (const slug of SLUGS) {
    bars.set(slug, {
      dx: gauss(random) * spec.offset,
      dy: gauss(random) * spec.offset,
      rot: gauss(random) * spec.rot,
      tx: gauss(random) * spec.tilt,
      ty: gauss(random) * spec.tilt * 0.8,
    });
  }
  // A few bars that have been knocked properly out of true.
  const pool = ["hH", "aA", "nN", "iI", "mM", "wW", "uU", "yY"];
  for (let i = 0; i < spec.outliers; i++) {
    const bar = bars.get(pool[(i * 3 + spec.seed) % pool.length]);
    if (!bar) continue;
    if (i % 2 === 0)
      bar.dy += (random() < 0.5 ? -1 : 1) * (2.4 + spec.offset * 1.6);
    else bar.rot += (random() < 0.5 ? -1 : 1) * (0.03 + spec.rot);
    bar.tx += (random() - 0.5) * spec.tilt * 2;
  }
  const nicks = new Map<string, Glyph>();
  for (const char of spec.nicks) nicks.set(char, nicked(char, random));
  return {
    condition,
    bars,
    shift: spec.shift,
    lift: spec.lift,
    nicks,
    gunkRate: spec.gunkRate,
    gunkStart: spec.gunkStart,
  };
}

// How clogged each slug is when the machine comes out of the cupboard.
export function startingGunk(machine: Machine) {
  const gunk = new Map<string, number>();
  for (const slug of SLUGS) {
    for (const char of slug) {
      const f = FREQUENCY[char.toLowerCase()] ?? 0;
      gunk.set(char, Math.min(0.95, machine.gunkStart * f ** 0.45));
    }
  }
  return gunk;
}

// A letter with a chip out of its face: a disc taken out somewhere along its edge.
function nicked(char: string, random: () => number): Glyph {
  const base = glyph(char);
  const mask = base.mask.slice();
  const edges: number[] = [];
  for (let y = 1; y < GH - 1; y++) {
    for (let x = 1; x < GW - 1; x++) {
      const i = y * GW + x;
      if (mask[i] > 0.6 && (mask[i - 1] < 0.3 || mask[i + 1] < 0.3))
        edges.push(i);
    }
  }
  if (edges.length) {
    const at = edges[Math.floor(random() * edges.length)];
    const nx = at % GW;
    const ny = Math.floor(at / GW);
    const r = 2.6 + random() * 1.4;
    for (let y = ny - 5; y <= ny + 5; y++) {
      for (let x = nx - 5; x <= nx + 5; x++) {
        const d = Math.hypot(x - nx, y - ny);
        if (x >= 0 && y >= 0 && x < GW && y < GH) {
          mask[y * GW + x] *= smoothstep(r - 1, r + 0.6, d);
        }
      }
    }
  }
  return measure(mask);
}

export function glyphFor(machine: Machine, char: string) {
  return machine.nicks.get(char) ?? glyph(char);
}

// ---------------------------------------------------------------------------------------------
// One blow.

export type Strike = {
  char: string;
  machine: Machine;
  // The blow, 1 for an even touch with a strong finger.
  force: number;
  mode: RibbonMode;
  // How much ink each half of the ribbon has where it is now, 0 to 1.
  ink: { black: number; red: number };
  gunk: number;
  // Paper: how readily it tears, and where on the sheet the cell is (for the fibres).
  weakness: number;
  sheetX: number;
  sheetY: number;
  carbon: boolean;
  random: () => number;
};

export type Impression = {
  // RGBA for the top sheet, to be laid on by multiplying.
  ink: ImageData;
  // The carbon copy's coverage, 0 to 1, if there's a copy.
  copy: Float32Array | null;
  // How hard each pixel was pressed, for the dents.
  press: Float32Array;
  hole: { x: number; y: number; r: number; seed: number } | null;
  // Which half of the ribbon touched the letter, so the engine can say so.
  halves: { black: boolean; red: boolean; bare: boolean };
};

let reference = 0;

export function strike(input: Strike, fibres: Float32Array): Impression {
  const { char, machine, random } = input;
  const key = KEYS.get(char);
  const face = glyphFor(machine, char);
  if (!reference) reference = glyph("n").area || 300;
  const bar: Bar = { ...(machine.bars.get(key?.slug ?? "") ?? ZERO) };
  if (key?.upper) {
    bar.dx += machine.shift.dx;
    bar.dy += machine.shift.dy;
    bar.rot += machine.shift.rot;
    bar.tx += machine.shift.tx;
    bar.ty += machine.shift.ty;
  }
  // The blow lands on the whole face, but the platen's rubber gives under it, so a small face
  // shares its blow with a ring of rubber round it and doesn't print in proportion to its size.
  const area = Math.max(face.area, 8);
  const pressure = input.force * (reference / area) ** 0.35;

  const ink = new ImageData(GW, GH);
  const data = ink.data;
  const press = new Float32Array(GW * GH);
  const copy = input.carbon ? new Float32Array(GW * GH) : null;
  const halves = { black: false, red: false, bare: false };

  // The ribbon as it sits in front of this letter: lifted for the half chosen, short by however
  // much the vibrator is out, and bouncing a pixel or two either way.
  const lift = machine.lift + gauss(random) * 1.2;
  const ribbonTop =
    BASE_Y + (input.mode === "red" ? RIBBON_TOP_RED : RIBBON_TOP_BLACK) + lift;
  const ribbonSplit = ribbonTop + HALF;
  const ribbonBottom = ribbonTop + RIBBON;
  // The ribbon moves on between blows, so the weave lands somewhere new each time.
  const phaseX = random() * WEAVE;
  const phaseY = random() * WEAVE;

  const cos = Math.cos(bar.rot);
  const sin = Math.sin(bar.rot);
  const blur = 0.45 + 0.5 * Math.min(pressure, 2);
  const wide = blur + 1.3;
  const bold = 0.1 * Math.max(-1, Math.min(1.6, pressure - 1));
  const fill = input.gunk * face.maxDepth;
  const n = FIBRE_SIZE;

  for (let y = 0; y < GH; y++) {
    const half =
      input.mode === "stencil" || y < ribbonTop || y >= ribbonBottom
        ? null
        : y < ribbonSplit
          ? "black"
          : "red";
    for (let x = 0; x < GW; x++) {
      const i = y * GW + x;
      // Back through the bar's error to where on the face this pixel is.
      const u = x - PIVOT_X - bar.dx;
      const v = y - PIVOT_Y - bar.dy;
      const fx = PIVOT_X + cos * u + sin * v;
      const fy = PIVOT_Y - sin * u + cos * v;
      const m0 = sample(face.mask, fx, fy);
      const m1 =
        (m0 * 2 +
          sample(face.mask, fx - blur, fy) +
          sample(face.mask, fx + blur, fy) +
          sample(face.mask, fx, fy - blur) +
          sample(face.mask, fx, fy + blur)) /
        6;
      const d = face.maxDepth ? sample(face.depth, fx, fy) : 0;
      const clogged =
        d > 0 && fill > 0.4
          ? smoothstep(
              -0.6,
              0.6,
              fill * (0.8 + 0.4 * fibreAt(fibres, fx * 3, fy * 3)) - d,
            )
          : 0;
      if (m1 < 0.02 && clogged < 0.02) continue;

      const edge = Math.max(smoothstep(0.34 - bold, 0.66 - bold, m1), clogged);
      const tilt = Math.max(
        0,
        1 + (bar.tx * (fx - PIVOT_X)) / 15 + (bar.ty * (fy - PIVOT_Y)) / 22,
      );
      const local = pressure * tilt;
      press[i] = edge * local;

      if (copy) {
        // Under the top sheet the blow is softened by the paper, with no weave to break it up.
        const mw =
          (m0 * 2 +
            sample(face.mask, fx - wide, fy) +
            sample(face.mask, fx + wide, fy) +
            sample(face.mask, fx, fy - wide) +
            sample(face.mask, fx, fy + wide)) /
          6;
        const soft = Math.max(smoothstep(0.2, 0.7, mw), clogged * 0.9);
        copy[i] = soft * (1 - Math.exp(-1.7 * local));
      }

      if (!half) {
        if (input.mode !== "stencil") halves.bare = true;
        continue;
      }
      const level = input.ink[half];
      if (level <= 0.001) continue;
      halves[half] = true;
      // A plain weave: warp and weft cross alternately over and under, so the crowns that touch
      // the paper first sit on a chequerboard.
      const sx = input.sheetX + x;
      const sy = input.sheetY + y;
      // The threads aren't ruled lines: they wander a little and some are fatter than others.
      const wx = x + phaseX + 0.45 * Math.sin(y * 0.83 + phaseY * 2.1);
      const wy = y + phaseY + 0.45 * Math.sin(x * 0.71 + phaseX * 1.7);
      const fat =
        0.7 +
        0.6 * hash(Math.floor(wx / WEAVE) * 7 + Math.floor(wy / WEAVE) * 131);
      const weave =
        0.5 +
        0.5 *
          fat *
          Math.sin((wx * 2 * Math.PI) / WEAVE) *
          Math.sin((wy * 2 * Math.PI) / WEAVE);
      const paper = fibres[(sy & (n - 1)) * n + (sx & (n - 1))];
      const rough =
        fibres[((sy * 3 + 101) & (n - 1)) * n + ((sx * 3 + 57) & (n - 1))];
      const threshold = Math.min(1, Math.max(0, 1.12 - 0.8 * local));
      const contact = smoothstep(
        threshold - 0.32,
        threshold + 0.06,
        weave * 0.66 + paper * 0.28 + rough * 0.24,
      );
      const amount =
        level *
        Math.max(contact, clogged * 0.85) *
        (0.55 + (0.45 * Math.min(local, 1.6)) / 1.6) *
        (0.82 + 0.3 * paper);
      const alpha = Math.min(1, edge * (1 - Math.exp(-2.6 * amount)));
      const colour = INK[half];
      data[i * 4] = colour[0];
      data[i * 4 + 1] = colour[1];
      data[i * 4 + 2] = colour[2];
      data[i * 4 + 3] = Math.round(alpha * 255);
    }
  }

  // A small face hit hard enough goes straight through: the blow over a full stop's face is many
  // times the pressure under an n, and onionskin gives way well before bond does.
  let hole: Impression["hole"] = null;
  const punch =
    input.force * (reference / area) * input.weakness * (0.85 + 0.3 * random());
  if (area < reference * 0.3 && punch > 11) {
    const bx = face.cx - PIVOT_X;
    const by = face.cy - PIVOT_Y;
    hole = {
      x: PIVOT_X + bar.dx + cos * bx - sin * by,
      y: PIVOT_Y + bar.dy + sin * bx + cos * by,
      r: Math.sqrt(area / Math.PI) * 0.8,
      seed: Math.floor(random() * 1e6),
    };
  }

  return { ink, copy, press, hole, halves };
}

const ZERO: Bar = { dx: 0, dy: 0, rot: 0, tx: 0, ty: 0 };

function hash(i: number) {
  const h = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
  return h - Math.floor(h);
}

function fibreAt(fibres: Float32Array, x: number, y: number) {
  const n = FIBRE_SIZE;
  return fibres[((y | 0) & (n - 1)) * n + ((x | 0) & (n - 1))] - 0.5;
}
