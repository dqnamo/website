// Dry transfer lettering on a 2D canvas: a sheet of rub-down letters laid over paper. Rubbing
// the film presses the letter's adhesive to the paper, and each pass builds up a bond, more
// under a fine point than a broad spoon since the same push lands on less of it. As the bond
// takes, the letter lets go of the carrier and turns grey through the film. Nothing has moved
// yet: only when the sheet is lifted does each part of the letter choose between paper and film.
//
// It chooses plate by plate. The ink is a brittle film, so a letter rubbed only partly breaks
// along a crumbly edge rather than a clean one, and an old sheet, already crazed into larger
// plates, comes away in pieces unless every one of them has been rubbed well. That's also how a
// missing letter gets made: rub down the E but not its bottom bar, and lift, and there's an F.
//
// Tape lifts letters off the paper again. The camera view photographs the paper the way a
// process camera's orthochromatic film saw it: blind to red, so red ink prints black, and
// dazzled by pale blue, so the non-photo blue pencil guides vanish.

import { nearest, random } from "./grid";
import {
  AGES,
  type Age,
  boxPixels,
  type Face,
  type Glyph,
  INKS,
  type Ink,
  loadFace,
  printSheet,
  SHEET_WIDTH,
  type Sheet,
} from "./sheet";

export type Paper = "cartridge" | "kraft" | "card";
export type Tool = "burnisher" | "tape" | "hand";
export type Tip = "ballpoint" | "spatula" | "spoon";

export type DryTransferSettings = {
  face: Face;
  ink: Ink;
  age: Age;
  paper: Paper;
  tool: Tool;
  tip: Tip;
  // Extra space between letters set by typing, in CSS pixels.
  spacing: number;
  // Typing rubs each letter down as well as bringing it into place.
  autoRub: boolean;
  camera: boolean;
};

export type DryTransferStats = {
  // Letters still whole on the sheet, of how many it was printed with.
  left: number;
  total: number;
  // Letters set on the paper.
  set: number;
  busy: boolean;
  ready: boolean;
  aside: boolean;
};

type Point = { x: number; y: number };
type RGB = [number, number, number];

const PAPERS: Record<
  Paper,
  { base: RGB; grain: number; fibre: [string, string]; guide: string }
> = {
  cartridge: {
    base: [245, 242, 234],
    grain: 7,
    fibre: ["rgba(120, 110, 90, 0.07)", "rgba(255, 255, 255, 0.5)"],
    guide: "rgba(96, 164, 222, ALPHA)",
  },
  kraft: {
    base: [183, 145, 103],
    grain: 14,
    fibre: ["rgba(90, 60, 30, 0.16)", "rgba(235, 205, 160, 0.22)"],
    guide: "rgba(84, 156, 218, ALPHA)",
  },
  card: {
    base: [30, 29, 28],
    grain: 6,
    fibre: ["rgba(0, 0, 0, 0.14)", "rgba(255, 255, 255, 0.03)"],
    guide: "rgba(120, 178, 232, ALPHA)",
  },
};

// The tip's radius in CSS pixels, and how hard it presses for the same push.
const TIPS: Record<Tip, { radius: number; pressure: number }> = {
  ballpoint: { radius: 2.4, pressure: 1 },
  spatula: { radius: 4.6, pressure: 0.8 },
  spoon: { radius: 8.5, pressure: 0.52 },
};

// The bond one pass of a fine point leaves along its line on a fresh sheet.
const PASS = 1.15;
// The reach of a press beyond the tip, as the film spreads it.
const REACH = 1.6;

// Pencil guides on the paper, for full-size lettering: baselines with a cap line above each.
const FIRST_BASELINE = 118;
const LINE_GAP = 86;
const CAP_LINE = 38;

// Rubbing down part of one letter makes another.
const SUBSTITUTES: Record<string, [string, string]> = {
  F: ["E", "all but its bottom bar"],
  L: ["E", "just its stem and bottom bar"],
  P: ["R", "all but its leg"],
  O: ["Q", "all but its tail"],
  I: ["T", "just its stem"],
  i: ["j", "all but the hook below the line"],
  n: ["h", "all but the top of its stem"],
  l: ["b", "just its stem"],
  r: ["n", "all but its right leg"],
};

function article(char: string) {
  return /^[aefhilmnorsx]$/i.test(char) ? "an" : "a";
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function smoothstep(a: number, b: number, x: number) {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

function ease(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

function reduceMotion() {
  return matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function canvas2d(width: number, height: number, read = false) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, width);
  canvas.height = Math.max(1, height);
  const ctx = canvas.getContext("2d", { willReadFrequently: read });
  if (!ctx) throw new Error("Canvas 2D is not available.");
  return { canvas, ctx };
}

// One step of a typed sequence: lift, slide, lay, rub. Start runs once; update reports done.
type Step = { start?: () => void; update?: (dt: number) => boolean };

type Tape = {
  a: Point;
  b: Point;
  width: number;
  // 0 while it's being laid, then counting up to 1 as it peels away.
  peel: number;
  lifted: HTMLCanvasElement | null;
  liftedAt: Point;
};

type Placed = {
  char: string;
  x: number;
  y: number;
  advance: number;
  box: [number, number, number, number];
};

type Gesture =
  | { kind: "burnish"; last: Point }
  | { kind: "drag"; dx: number; dy: number; start: Point; moved: boolean }
  | { kind: "tape"; tape: Tape }
  | { kind: "none" };

export function createDryTransfer(
  canvas: HTMLCanvasElement,
  {
    onStats,
    onMessage,
    onReady,
  }: {
    onStats?: (stats: DryTransferStats) => void;
    onMessage?: (message: string | null) => void;
    onReady?: () => void;
  } = {},
) {
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas 2D is not available.");
  const ctx = context;

  // Buffers keep the resolution they started with, whatever screen the window moves to.
  const k = Math.min(window.devicePixelRatio || 1, 2);
  let dpr = k;
  let width = 0;
  let height = 0;
  let margin = 0;
  // The lettering's size against a full-size sheet, and the guides ruled to match it; both are
  // settled by the first size the paper is seen at.
  let scale = 0;
  const guide = { first: FIRST_BASELINE, gap: LINE_GAP, cap: CAP_LINE };

  let settings: DryTransferSettings | null = null;
  let disposed = false;

  // The paper: its surface and guides, the ink on it, and that ink's shadow.
  let paperBase: HTMLCanvasElement | null = null;
  let paperInk = canvas2d(1, 1, true);
  let paperShade = canvas2d(1, 1);
  let stat: HTMLCanvasElement | null = null;

  // The sheet, its bond with the paper, and what it looks like.
  let sheet: Sheet | null = null;
  let bond = new Uint8Array(0);
  let film: ReturnType<typeof canvas2d> | null = null;
  let filmShadow: ReturnType<typeof canvas2d> | null = null;
  let plateSum = new Float32Array(0);
  let plateCount = new Uint32Array(0);
  // The part of the sheet with any bond on it, in sheet device pixels.
  const bonded = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  let sheetSeed = 1;
  let building = 0;

  // Where the sheet lies, how far it's lifted, and where it's going.
  const pose = { x: 0, y: 0, lift: 0, liftTo: 0 };
  let aside = false;
  let posed = false;
  let placedGlyph: Glyph | null = null;

  // The next letter's origin on the paper, and every letter set so far.
  const cursor = { x: 0, y: FIRST_BASELINE };
  const placed: Placed[] = [];

  const queue: { char: string; rub: boolean }[] = [];
  const steps: Step[] = [];
  let stepStarted = false;
  // After a typed run, the sheet is cleared off the line once typing has paused this long.
  let tidyAfter = false;
  let tidyIn = -1;
  const tapes: Tape[] = [];
  const gestures = new Map<number, Gesture>();
  let hover: Point | null = null;
  let tool: Point | null = null;
  let toolPressing = false;
  let messageTimer = 0;

  let running = false;
  let frame = 0;
  let last = 0;

  // ——— Paper ———

  function buildPaper() {
    if (!settings || !width) return;
    const spec = PAPERS[settings.paper];
    const pw = Math.ceil(width * k);
    const ph = Math.ceil(height * k);
    const { canvas: base, ctx: p } = canvas2d(pw, ph);
    const [r, g, b] = spec.base;
    p.fillStyle = `rgb(${r}, ${g}, ${b})`;
    p.fillRect(0, 0, pw, ph);

    // Grain: a tile of fine mottling, repeated.
    const tileSize = 160;
    const { canvas: tile, ctx: t } = canvas2d(tileSize, tileSize);
    const grain = t.createImageData(tileSize, tileSize);
    const rand = random(7);
    for (let i = 0; i < tileSize * tileSize; i++) {
      const n = (rand() + rand() - 1) * spec.grain;
      grain.data[i * 4] = clamp(r + n, 0, 255);
      grain.data[i * 4 + 1] = clamp(g + n, 0, 255);
      grain.data[i * 4 + 2] = clamp(b + n * 0.9, 0, 255);
      grain.data[i * 4 + 3] = 255;
    }
    t.putImageData(grain, 0, 0);
    const pattern = p.createPattern(tile, "repeat");
    if (pattern) {
      p.fillStyle = pattern;
      p.fillRect(0, 0, pw, ph);
    }

    // Fibres: short curls lying in the surface, a few darker and a few catching the light.
    p.lineCap = "round";
    const fibres = Math.round((width * height) / 260);
    for (let i = 0; i < fibres; i++) {
      const x = rand() * pw;
      const y = rand() * ph;
      const length = (3 + rand() * 12) * k;
      const angle = rand() * Math.PI * 2;
      const bend = (rand() - 0.5) * length;
      p.strokeStyle = spec.fibre[rand() < 0.6 ? 0 : 1];
      p.lineWidth = (0.4 + rand() * 0.6) * k;
      p.beginPath();
      p.moveTo(x, y);
      p.quadraticCurveTo(
        x + Math.cos(angle) * length * 0.5 - Math.sin(angle) * bend,
        y + Math.sin(angle) * length * 0.5 + Math.cos(angle) * bend,
        x + Math.cos(angle) * length,
        y + Math.sin(angle) * length,
      );
      p.stroke();
    }

    // A lamp off to the upper left.
    const light = p.createRadialGradient(
      pw * 0.25,
      ph * 0.1,
      0,
      pw * 0.25,
      ph * 0.1,
      Math.hypot(pw, ph) * 0.9,
    );
    light.addColorStop(0, "rgba(255, 250, 240, 0.06)");
    light.addColorStop(1, "rgba(0, 0, 0, 0.07)");
    p.fillStyle = light;
    p.fillRect(0, 0, pw, ph);

    // Guides in non-photo blue pencil, which doesn't wobble but does vary in weight.
    p.scale(k, k);
    const pencil = (
      x0: number,
      y0: number,
      x1: number,
      y1: number,
      a: number,
    ) => {
      const length = Math.hypot(x1 - x0, y1 - y0);
      const pieces = Math.max(1, Math.round(length / 24));
      p.lineWidth = 0.8;
      for (let i = 0; i < pieces; i++) {
        p.strokeStyle = spec.guide.replace(
          "ALPHA",
          String(a * (0.7 + rand() * 0.3)),
        );
        p.beginPath();
        p.moveTo(x0 + ((x1 - x0) * i) / pieces, y0 + ((y1 - y0) * i) / pieces);
        p.lineTo(
          x0 + ((x1 - x0) * (i + 1)) / pieces,
          y0 + ((y1 - y0) * (i + 1)) / pieces,
        );
        p.stroke();
      }
    };
    const right = width - margin * 0.6;
    for (let y = guide.first; y < height - 20; y += guide.gap) {
      pencil(margin * 0.5, y + 0.5, right, y + 0.5, 0.55);
      pencil(
        margin * 0.5,
        y - guide.cap + 0.5,
        right,
        y - guide.cap + 0.5,
        0.28,
      );
    }
    pencil(margin - 0.5, 18, margin - 0.5, height - 18, 0.4);
    paperBase = base;
    stat = null;
  }

  // The ink layer only ever grows, so letters off the edge of a smaller window come back.
  function ensurePaperInk() {
    const pw = Math.ceil(width * k);
    const ph = Math.ceil(height * k);
    if (pw <= paperInk.canvas.width && ph <= paperInk.canvas.height) return;
    const next = canvas2d(
      Math.max(pw, paperInk.canvas.width),
      Math.max(ph, paperInk.canvas.height),
      true,
    );
    next.ctx.drawImage(paperInk.canvas, 0, 0);
    paperInk = next;
    paperShade = canvas2d(next.canvas.width, next.canvas.height);
    shadePaper();
  }

  // The transferred film stands a little proud of the paper and casts a hairline shadow.
  function shadePaper() {
    const s = paperShade.ctx;
    s.globalCompositeOperation = "copy";
    s.drawImage(paperInk.canvas, 0, 0);
    s.globalCompositeOperation = "source-in";
    s.fillStyle = "#000";
    s.fillRect(0, 0, paperShade.canvas.width, paperShade.canvas.height);
    s.globalCompositeOperation = "source-over";
    stat = null;
  }

  // ——— Sheet ———

  async function buildSheet(keepPose: boolean) {
    if (!settings) return;
    const { face, ink, age } = settings;
    const ticket = ++building;
    await loadFace(face);
    if (disposed || ticket !== building || !settings) return;
    const next = printSheet(
      face,
      ink,
      age,
      k,
      sheetSeed * 7919 + 13,
      clamp(Math.round(width - 24), 240, SHEET_WIDTH),
      scale || 1,
    );
    sheet = next;
    bond = new Uint8Array(next.pw * next.ph);
    plateSum = new Float32Array(next.plates.gw * next.plates.gh);
    plateCount = new Uint32Array(next.plates.gw * next.plates.gh);
    bonded.x0 = bonded.y0 = Infinity;
    bonded.x1 = bonded.y1 = -Infinity;
    film = canvas2d(next.pw, next.ph);
    filmShadow = canvas2d(
      Math.ceil(next.pw / 6 / k),
      Math.ceil(next.ph / 6 / k),
    );
    placedGlyph = null;
    refreshFilm(0, 0, next.pw, next.ph);
    shadeFilm();
    if (!keepPose) posed = false;
    placeSheet();
    report();
    invalidate();
    onReady?.();
  }

  // Redraws part of the film from the ink, its bond and its ghosts, in sheet device pixels.
  function refreshFilm(x0: number, y0: number, x1: number, y1: number) {
    if (!sheet || !film || !settings) return;
    x0 = clamp(Math.floor(x0), 0, sheet.pw);
    y0 = clamp(Math.floor(y0), 0, sheet.ph);
    x1 = clamp(Math.ceil(x1), 0, sheet.pw);
    y1 = clamp(Math.ceil(y1), 0, sheet.ph);
    const w = x1 - x0;
    const h = y1 - y0;
    if (!(w > 0 && h > 0)) return;
    const image = film.ctx.createImageData(w, h);
    const data = image.data;
    const { ink, released } = INKS[sheet.ink];
    const ghostTone = sheet.ink === "white" ? 210 : 140;
    const threshold = AGES[sheet.age].threshold;
    const { coverage, ghost, pw } = sheet;
    for (let y = 0; y < h; y++) {
      let i = (y0 + y) * pw + x0;
      let o = y * w * 4;
      for (let x = 0; x < w; x++, i++, o += 4) {
        const c = coverage[i] / 255;
        const g = (ghost[i] / 255) * 0.1 * (1 - c);
        const a = c + g;
        if (a <= 0) continue;
        // Grey shows where the bond would hold if the sheet came up now.
        const r = smoothstep(threshold * 0.55, threshold * 1.2, bond[i] / 255);
        const cr = ink[0] + (released[0] - ink[0]) * r;
        const cg = ink[1] + (released[1] - ink[1]) * r;
        const cb = ink[2] + (released[2] - ink[2]) * r;
        data[o] = (cr * c + ghostTone * g) / a;
        data[o + 1] = (cg * c + ghostTone * g) / a;
        data[o + 2] = (cb * c + ghostTone * g) / a;
        data[o + 3] = a * 255;
      }
    }
    film.ctx.putImageData(image, x0, y0);
  }

  // A small, soft copy of the letters' shape, for the shadows they cast when the sheet lifts.
  function shadeFilm() {
    if (!film || !filmShadow) return;
    const s = filmShadow.ctx;
    const { width: sw, height: sh } = filmShadow.canvas;
    s.globalCompositeOperation = "copy";
    s.drawImage(film.canvas, 0, 0, sw, sh);
    s.globalCompositeOperation = "source-in";
    s.fillStyle = "#000";
    s.fillRect(0, 0, sw, sh);
    s.globalCompositeOperation = "source-over";
  }

  function glyphLeft(glyph: Glyph) {
    if (!sheet) return 0;
    const [l, t, r, b] = boxPixels(glyph, sheet.k, sheet.pw, sheet.ph);
    let sum = 0;
    for (let y = t; y < b; y++)
      for (let x = l; x < r; x++) sum += sheet.coverage[y * sheet.pw + x];
    return sum / glyph.total;
  }

  function findGlyph(char: string) {
    return (
      sheet?.glyphs.find((glyph) => glyph.char === char && glyph.left > 0.85) ??
      null
    );
  }

  // ——— Rubbing ———

  // Presses along a stroke between two stage points, building the bond under it.
  function burnish(a: Point, b: Point, weight = 1) {
    if (!sheet || !settings || aside) return;
    if (![a.x, a.y, b.x, b.y].every(Number.isFinite)) return;
    const tip = TIPS[settings.tip];
    const grip = AGES[sheet.age].grip;
    const r = tip.radius * k;
    const reach = r * REACH;
    const ax = (a.x - pose.x) * k;
    const ay = (a.y - pose.y) * k;
    const bx = (b.x - pose.x) * k;
    const by = (b.y - pose.y) * k;
    const length = Math.hypot(bx - ax, by - ay);
    const count = Math.max(1, Math.ceil(length / (r * 0.4)));
    const step = length / count;
    // Bond per press, so a whole pass adds up to the same whatever the spacing.
    const perUnit = (grip * tip.pressure * PASS * weight) / (1.067 * reach);
    const amount = length > 0 ? perUnit * step : perUnit * r;
    const { coverage, pw, ph } = sheet;
    for (let s = length > 0 ? 1 : 0; s <= count; s++) {
      const cx = ax + ((bx - ax) * s) / count;
      const cy = ay + ((by - ay) * s) / count;
      const x0 = Math.max(0, Math.floor(cx - reach));
      const x1 = Math.min(pw - 1, Math.ceil(cx + reach));
      const y0 = Math.max(0, Math.floor(cy - reach));
      const y1 = Math.min(ph - 1, Math.ceil(cy + reach));
      for (let y = y0; y <= y1; y++) {
        const dy = (y + 0.5 - cy) / reach;
        for (let x = x0; x <= x1; x++) {
          const i = y * pw + x;
          if (!coverage[i]) continue;
          const dx = (x + 0.5 - cx) / reach;
          const d = dx * dx + dy * dy;
          if (d >= 1) continue;
          const w = (1 - d) * (1 - d);
          bond[i] = Math.min(255, bond[i] + amount * w * 255 + 0.5);
        }
      }
    }
    const x0 = Math.min(ax, bx) - reach - 1;
    const y0 = Math.min(ay, by) - reach - 1;
    const x1 = Math.max(ax, bx) + reach + 1;
    const y1 = Math.max(ay, by) + reach + 1;
    bonded.x0 = Math.min(bonded.x0, x0);
    bonded.y0 = Math.min(bonded.y0, y0);
    bonded.x1 = Math.max(bonded.x1, x1);
    bonded.y1 = Math.max(bonded.y1, y1);
    refreshFilm(x0, y0, x1, y1);
    invalidate();
  }

  // The sheet leaves the paper: every plate with enough bond stays behind on it.
  function commit() {
    if (!sheet || !settings || bonded.x1 < bonded.x0) return;
    const ageSpec = AGES[sheet.age];
    const { coverage, ghost, pw, ph, plates } = sheet;
    const pad = Math.ceil(plates.size * 1.5);
    const x0 = clamp(Math.floor(bonded.x0) - pad, 0, pw);
    const y0 = clamp(Math.floor(bonded.y0) - pad, 0, ph);
    const x1 = clamp(Math.ceil(bonded.x1) + pad, 0, pw);
    const y1 = clamp(Math.ceil(bonded.y1) + pad, 0, ph);
    bonded.x0 = bonded.y0 = Infinity;
    bonded.x1 = bonded.y1 = -Infinity;
    const w = x1 - x0;
    const h = y1 - y0;
    if (!(w > 0 && h > 0)) return;

    // Each plate's average bond, over the ink in it.
    const ids = new Int32Array(w * h).fill(-1);
    const touched: number[] = [];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y0 + y) * pw + x0 + x;
        if (!coverage[i]) continue;
        const id = nearest(plates, x0 + x + 0.5, y0 + y + 0.5).id;
        ids[y * w + x] = id;
        if (!plateCount[id]) touched.push(id);
        plateCount[id]++;
        plateSum[id] += bond[i];
      }
    }

    // The paper under that part of the sheet, snapped to its pixels.
    const ox = Math.round(pose.x * k);
    const oy = Math.round(pose.y * k);
    const px0 = clamp(x0 + ox, 0, paperInk.canvas.width);
    const py0 = clamp(y0 + oy, 0, paperInk.canvas.height);
    const px1 = clamp(x1 + ox, 0, paperInk.canvas.width);
    const py1 = clamp(y1 + oy, 0, paperInk.canvas.height);
    const paper =
      px1 > px0 && py1 > py0
        ? paperInk.ctx.getImageData(px0, py0, px1 - px0, py1 - py0)
        : null;
    const [ir, ig, ib] = INKS[sheet.ink].ink;
    let moved = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const id = ids[y * w + x];
        if (id < 0) continue;
        const i = (y0 + y) * pw + x0 + x;
        const mean = plateSum[id] / plateCount[id] / 255;
        const breaking =
          ageSpec.threshold + ageSpec.scatter * (plates.value[id] - 0.5) * 2;
        if (mean <= breaking) continue;
        const c = coverage[i];
        moved += c;
        ghost[i] = Math.max(ghost[i], c);
        coverage[i] = 0;
        if (!paper) continue;
        const px = x0 + x + ox - px0;
        const py = y0 + y + oy - py0;
        if (px < 0 || py < 0 || px >= paper.width || py >= paper.height)
          continue;
        const o = (py * paper.width + px) * 4;
        const sa = c / 255;
        const da = paper.data[o + 3] / 255;
        const a = sa + da * (1 - sa);
        paper.data[o] = (ir * sa + paper.data[o] * da * (1 - sa)) / a;
        paper.data[o + 1] = (ig * sa + paper.data[o + 1] * da * (1 - sa)) / a;
        paper.data[o + 2] = (ib * sa + paper.data[o + 2] * da * (1 - sa)) / a;
        paper.data[o + 3] = a * 255;
      }
    }
    for (const id of touched) {
      plateSum[id] = 0;
      plateCount[id] = 0;
    }
    for (let y = y0; y < y1; y++) bond.fill(0, y * pw + x0, y * pw + x1);
    refreshFilm(x0, y0, x1, y1);
    if (!moved) return;
    if (paper) {
      paperInk.ctx.putImageData(paper, px0, py0);
      shadePaper();
    }
    shadeFilm();

    // Whatever letters went down, the next one follows the last of them.
    const left = x0 / k;
    const top = y0 / k;
    const right = x1 / k;
    const bottom = y1 / k;
    const sx = ox / k;
    const sy = oy / k;
    let latest: Placed | null = null;
    for (const glyph of sheet.glyphs) {
      const [l, t, r, b] = glyph.box;
      if (r < left || l > right || b < top || t > bottom) continue;
      const before = glyph.left;
      glyph.left = glyphLeft(glyph);
      if (before - glyph.left < 0.25) continue;
      const entry: Placed = {
        char: glyph.char,
        x: sx + glyph.x,
        y: sy + glyph.y,
        advance: glyph.advance,
        box: [sx + l, sy + t, sx + r, sy + b],
      };
      placed.push(entry);
      if (!latest || entry.x > latest.x) latest = entry;
    }
    if (latest) {
      cursor.x = latest.x + latest.advance + settings.spacing;
      cursor.y = latest.y;
    }
    report();
  }

  // ——— Tape ———

  // Lays a strip of tape and pulls it straight off, taking the ink under it nearly all.
  function peelTape(tape: Tape, byHand: boolean) {
    const ax = tape.a.x * k;
    const ay = tape.a.y * k;
    const bx = tape.b.x * k;
    const by = tape.b.y * k;
    const length = Math.hypot(bx - ax, by - ay) || 1;
    const ux = (bx - ax) / length;
    const uy = (by - ay) / length;
    const half = (tape.width / 2) * k;
    const pad = half + 2 * k;
    const { width: cw, height: ch } = paperInk.canvas;
    const x0 = clamp(Math.floor(Math.min(ax, bx) - pad), 0, cw);
    const y0 = clamp(Math.floor(Math.min(ay, by) - pad), 0, ch);
    const x1 = clamp(Math.ceil(Math.max(ax, bx) + pad), 0, cw);
    const y1 = clamp(Math.ceil(Math.max(ay, by) + pad), 0, ch);
    const w = x1 - x0;
    const h = y1 - y0;
    tape.liftedAt = { x: x0 / k, y: y0 / k };
    if (!(w > 0 && h > 0)) return;
    const paper = paperInk.ctx.getImageData(x0, y0, w, h);
    const lifted = new ImageData(w, h);
    // While the sheet lies on the paper, tape over it sticks to the film instead.
    const covered = (x: number, y: number) =>
      byHand &&
      sheet &&
      !aside &&
      x >= pose.x * k &&
      y >= pose.y * k &&
      x < (pose.x + sheet.width) * k &&
      y < (pose.y + sheet.height) * k;
    const cell = 1.2 * k;
    let took = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const o = (y * w + x) * 4;
        if (!paper.data[o + 3]) continue;
        const px = x0 + x + 0.5;
        const py = y0 + y + 0.5;
        const along = (px - ax) * ux + (py - ay) * uy;
        const across = Math.abs((px - ax) * uy - (py - ay) * ux);
        if (along < -k || along > length + k || across > half) continue;
        if (covered(px, py)) continue;
        // The odd fleck stays, held tighter by the paper's tooth.
        if (byHand) {
          const cx = Math.floor(px / cell);
          const cy = Math.floor(py / cell);
          const hash = Math.sin(cx * 127.1 + cy * 311.7) * 43758.5453;
          if (hash - Math.floor(hash) < 0.015) continue;
        }
        lifted.data.set(paper.data.subarray(o, o + 4), o);
        paper.data[o + 3] = 0;
        took++;
      }
    }
    if (!took) return;
    paperInk.ctx.putImageData(paper, x0, y0);
    shadePaper();
    const { canvas: strip, ctx: s } = canvas2d(w, h);
    s.putImageData(lifted, 0, 0);
    tape.lifted = strip;
    // Letters taped up are no longer on the paper.
    for (let i = placed.length - 1; byHand && i >= 0; i--) {
      const [l, t, r, b] = placed[i].box;
      const cx = ((l + r) / 2) * k;
      const cy = ((t + b) / 2) * k;
      const along = (cx - ax) * ux + (cy - ay) * uy;
      const across = Math.abs((cx - ax) * uy - (cy - ay) * ux);
      if (along > -k && along < length + k && across < half)
        placed.splice(i, 1);
    }
    report();
  }

  function startPeel(tape: Tape, byHand: boolean) {
    peelTape(tape, byHand);
    tape.peel = reduceMotion() ? 1 : 0.0001;
    if (tape.peel >= 1) tapes.splice(tapes.indexOf(tape), 1);
    invalidate();
  }

  // ——— Sequences ———

  function wait(seconds: number, start?: () => void): Step {
    let t = 0;
    return {
      start,
      update(dt) {
        t += dt;
        return t >= seconds;
      },
    };
  }

  function liftStep() {
    return wait(0.11, () => {
      commit();
      pose.liftTo = 1;
    });
  }

  function layStep() {
    return wait(0.1, () => {
      pose.liftTo = 0;
    });
  }

  function slideStep(target: () => Point | null): Step {
    let from: Point = { x: 0, y: 0 };
    let to: Point | null = null;
    let duration = 0;
    let t = 0;
    return {
      start() {
        from = { x: pose.x, y: pose.y };
        to = target();
        if (!to) return;
        const distance = Math.hypot(to.x - from.x, to.y - from.y);
        duration = clamp(0.18 + distance / 1800, 0.18, 0.5);
      },
      update(dt) {
        if (!to) return true;
        t = Math.min(duration, t + dt);
        const e = duration ? ease(t / duration) : 1;
        pose.x = from.x + (to.x - from.x) * e;
        pose.y = from.y + (to.y - from.y) * e;
        return t >= duration;
      },
    };
  }

  // A burnisher scribbled back and forth over one letter, twice, in crossing directions.
  function scribbleStep(glyph: Glyph): Step {
    let path: number[] = [];
    let at = 0;
    let vertex = 2;
    let reached = 0;
    let speed = 1;
    let previous: Point = { x: 0, y: 0 };
    const length = (i: number) =>
      Math.hypot(path[i] - path[i - 2], path[i + 1] - path[i - 1]);
    return {
      start() {
        if (!settings) return;
        const radius = TIPS[settings.tip].radius;
        const rand = random(Math.round(glyph.x * 13 + glyph.y * 7));
        path = [
          ...hatch(glyph.box, radius, -0.45, rand),
          ...hatch(glyph.box, radius, 0.62, rand),
        ];
        let total = 0;
        for (let i = 2; i < path.length; i += 2) total += length(i);
        speed = Math.max(1, total) / clamp(0.32 + total / 3200, 0.4, 0.8);
        previous = { x: pose.x + path[0], y: pose.y + path[1] };
        toolPressing = true;
        tool = previous;
      },
      update(dt) {
        at += speed * dt;
        while (vertex < path.length) {
          const segment = length(vertex);
          const f = segment > 0 ? Math.min(1, (at - reached) / segment) : 1;
          const next = {
            x:
              pose.x + path[vertex - 2] + (path[vertex] - path[vertex - 2]) * f,
            y:
              pose.y +
              path[vertex - 1] +
              (path[vertex + 1] - path[vertex - 1]) * f,
          };
          burnish(previous, next);
          previous = next;
          tool = next;
          if (f < 1) return false;
          reached += segment;
          vertex += 2;
        }
        toolPressing = false;
        tool = null;
        return true;
      },
    };
  }

  // Where a new sheet first lies: across the lower part of the paper, leaving the top lines clear.
  function placeSheet() {
    if (!sheet || !width) return;
    if (!posed) {
      posed = true;
      pose.x = homeX();
      pose.y = Math.round(height * 0.42);
    }
    if (aside) pose.y = asideY();
  }

  // Square on the paper: centred if it fits, otherwise in from the left edge.
  function homeX() {
    if (!sheet) return 12;
    return width >= sheet.width + 24
      ? Math.round((width - sheet.width) / 2)
      : 12;
  }

  function asideY() {
    return height - (sheet?.margin.top ?? 34) - 2;
  }

  function newline() {
    cursor.x = margin;
    cursor.y += guide.gap;
  }

  // Plans one typed character once the steps before it have finished.
  function plan(char: string, auto: boolean) {
    if (!settings) return;
    // The letter before goes down first, so the cursor has passed it.
    if (char === " ") {
      steps.push({
        start: () => {
          commit();
          cursor.x += (sheet?.space ?? 14) + (settings?.spacing ?? 0);
        },
      });
      return;
    }
    if (char === "\n") {
      steps.push({
        start: () => {
          commit();
          newline();
        },
      });
      return;
    }
    if (char === "\b") {
      steps.push({
        start() {
          commit();
          const last = placed.pop();
          if (!last) return;
          const [l, t, r, b] = last.box;
          const tape: Tape = {
            a: { x: l - 3, y: (t + b) / 2 },
            b: { x: r + 3, y: (t + b) / 2 },
            width: b - t + 10,
            peel: 0,
            lifted: null,
            liftedAt: { x: 0, y: 0 },
          };
          tapes.push(tape);
          startPeel(tape, false);
          cursor.x = last.x;
          cursor.y = last.y;
          report();
        },
      });
      return;
    }
    steps.push(liftStep(), {
      start() {
        if (!sheet || !settings) return;
        if (cursor.y > height - 12) {
          queue.length = 0;
          tidyAfter = false;
          say("That’s the bottom of the paper. Start a fresh piece to go on.");
          steps.splice(1, 0, layStep());
          return;
        }
        let glyph = findGlyph(char);
        let rub = auto;
        if (!glyph) {
          queue.length = 0;
          tidyAfter = false;
          const swap = SUBSTITUTES[char];
          const alternative = swap ? findGlyph(swap[0]) : null;
          if (!sheet.glyphs.some((entry) => entry.char === char)) {
            say(`There’s no ${char} on this sheet.`);
          } else if (swap && alternative) {
            say(
              `No ${char} left. Here’s ${article(swap[0])} ${swap[0]}: rub down ${swap[1]}.`,
              7000,
            );
            glyph = alternative;
            rub = false;
          } else {
            say(`No ${char} left on this sheet.`);
          }
          if (!glyph) {
            steps.splice(1, 0, layStep());
            return;
          }
        }
        const chosen = glyph;
        if (aside) {
          aside = false;
          report();
        }
        if (
          cursor.x + chosen.advance > width - margin * 0.6 &&
          cursor.x > margin + 1
        )
          newline();
        placedGlyph = chosen;
        const follow: Step[] = [
          slideStep(() => ({ x: cursor.x - chosen.x, y: cursor.y - chosen.y })),
          layStep(),
        ];
        if (rub) follow.push(scribbleStep(chosen));
        steps.splice(1, 0, ...follow);
      },
    });
  }

  // Clears the sheet off the line just set, so it can be seen, and squares it up again.
  function tidy() {
    steps.push(
      liftStep(),
      slideStep(() => ({
        x: homeX(),
        y: Math.min(cursor.y + 36, height - 90),
      })),
      layStep(),
    );
  }

  function pump() {
    while (!steps.length && queue.length) {
      const next = queue.shift();
      if (next) plan(next.char, next.rub);
    }
    if (!steps.length && tidyAfter) {
      tidyAfter = false;
      tidyIn = 0.7;
    }
  }

  function runSteps(dt: number) {
    let budget = dt;
    for (let guard = 0; guard < 500; guard++) {
      pump();
      const step = steps[0];
      if (!step) return;
      if (!stepStarted) {
        stepStarted = true;
        step.start?.();
      }
      if (step.update && !step.update(budget)) return;
      steps.shift();
      stepStarted = false;
      budget = dt === Infinity ? Infinity : 0;
    }
  }

  // Finishes everything in flight at once. A sheet cleared off the line afterwards still goes.
  function settle() {
    if (steps.length || queue.length) runSteps(Infinity);
    pose.lift = pose.liftTo;
    for (const tape of [...tapes])
      if (tape.peel > 0) tapes.splice(tapes.indexOf(tape), 1);
    toolPressing = false;
    tool = null;
  }

  // The hand takes the sheet: whatever was queued finishes now, and it stays where it's put.
  function takeOver() {
    queue.length = 0;
    settle();
    tidyAfter = false;
    tidyIn = -1;
  }

  function busy() {
    return Boolean(steps.length || queue.length);
  }

  function say(message: string | null, ms = 4500) {
    clearTimeout(messageTimer);
    onMessage?.(message);
    if (message) messageTimer = window.setTimeout(() => onMessage?.(null), ms);
  }

  // ——— Drawing ———

  function resize() {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const grew = rect.width !== width || rect.height !== height;
    width = rect.width;
    height = rect.height;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    if (!margin) {
      margin = clamp(Math.round(width * 0.07), 20, 64);
      scale = clamp(width / 640, 0.72, 1);
      guide.first = Math.round(FIRST_BASELINE * scale);
      guide.gap = Math.round(LINE_GAP * scale);
      guide.cap = Math.round(CAP_LINE * scale);
      cursor.x = margin;
      cursor.y = guide.first;
    }
    if (grew) {
      ensurePaperInk();
      buildPaper();
      placeSheet();
    }
    draw();
  }

  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!paperBase) {
      ctx.clearRect(0, 0, width, height);
      return;
    }
    if (settings?.camera) {
      if (!stat) stat = photograph();
      ctx.drawImage(stat, 0, 0, stat.width / k, stat.height / k);
      return;
    }
    ctx.drawImage(paperBase, 0, 0, paperBase.width / k, paperBase.height / k);
    const iw = paperInk.canvas.width / k;
    const ih = paperInk.canvas.height / k;
    ctx.globalAlpha = 0.32;
    ctx.drawImage(paperShade.canvas, 0.45, 0.7, iw, ih);
    ctx.globalAlpha = 1;
    ctx.drawImage(paperInk.canvas, 0, 0, iw, ih);
    drawCursor();
    drawSheet();
    for (const tape of tapes) drawTape(tape);
    drawTool();
  }

  // A pencil tick where the next letter's origin will go.
  function drawCursor() {
    if (!settings) return;
    ctx.strokeStyle = PAPERS[settings.paper].guide.replace("ALPHA", "0.95");
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cursor.x + 0.5, cursor.y - 9);
    ctx.lineTo(cursor.x + 0.5, cursor.y + 5);
    ctx.moveTo(cursor.x - 3, cursor.y + 2.5);
    ctx.lineTo(cursor.x + 0.5, cursor.y + 5);
    ctx.lineTo(cursor.x + 4, cursor.y + 2.5);
    ctx.stroke();
  }

  function drawSheet() {
    if (!sheet || !film || !filmShadow || !settings) return;
    const lift = pose.lift;
    const { width: w, height: h } = sheet;
    const x = pose.x;
    const y = pose.y;
    const dark = settings.paper === "card";

    ctx.save();
    // Lifted, it's nearer the eye and a touch bigger.
    const grow = 1 + lift * 0.006;
    ctx.translate(x + w / 2, y + h / 2);
    ctx.scale(grow, grow);
    ctx.translate(-w / 2, -h / 2);

    // Clear film casts only a faint shadow; the letters on it cast a real one.
    const off = 4000;
    ctx.save();
    ctx.shadowColor = `rgba(0, 0, 0, ${0.07 + lift * 0.1})`;
    ctx.shadowBlur = (2 + lift * 14) * dpr;
    ctx.shadowOffsetX = (off * grow + 1 + lift * 6) * dpr;
    ctx.shadowOffsetY = (1.5 + lift * 10) * dpr;
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.roundRect(-off, 0, w, h, 4);
    ctx.fill();
    ctx.restore();
    if (lift > 0.01) {
      ctx.globalAlpha = (dark ? 0.35 : 0.13) * lift;
      ctx.drawImage(filmShadow.canvas, 1 + lift * 4, 2 + lift * 6, w, h);
      ctx.globalAlpha = 1;
    }

    // The carrier: clear, faintly tinted, frosted a little more round the margins you hold.
    const { film: tint, haze } = AGES[sheet.age];
    const [fr, fg, fb] = tint;
    ctx.beginPath();
    ctx.roundRect(0, 0, w, h, 4);
    ctx.fillStyle = `rgba(${fr}, ${fg}, ${fb}, ${dark ? haze * 0.7 : haze})`;
    ctx.fill();
    const m = sheet.margin;
    ctx.fillStyle = `rgba(255, 255, 255, ${dark ? 0.035 : 0.12})`;
    ctx.beginPath();
    ctx.roundRect(0, 0, w, h, 4);
    ctx.rect(m.side, m.top, w - m.side * 2, h - m.top - m.bottom);
    ctx.fill("evenodd");

    ctx.drawImage(film.canvas, 0, 0, w, h);
    ctx.drawImage(sheet.print, 0, 0, w, h);

    // The sheen stays where the lamp is as the sheet slides under it.
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(0, 0, w, h, 4);
    ctx.clip();
    const sx = -x + width * 0.15;
    const sy = -y;
    const sheen = ctx.createLinearGradient(
      sx,
      sy,
      sx + width * 0.7,
      sy + height,
    );
    const glow = dark ? 0.05 : 0.08;
    sheen.addColorStop(0, "rgba(255, 255, 255, 0)");
    sheen.addColorStop(0.38, "rgba(255, 255, 255, 0)");
    sheen.addColorStop(0.46, `rgba(255, 255, 255, ${glow})`);
    sheen.addColorStop(0.5, `rgba(255, 255, 255, ${glow * 0.4})`);
    sheen.addColorStop(0.6, "rgba(255, 255, 255, 0)");
    sheen.addColorStop(1, "rgba(255, 255, 255, 0)");
    ctx.fillStyle = sheen;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();

    // A cut edge catches the light.
    ctx.lineWidth = 1;
    ctx.strokeStyle = `rgba(255, 255, 255, ${dark ? 0.22 : 0.85})`;
    ctx.beginPath();
    ctx.roundRect(0.5, 0.5, w - 1, h - 1, 3.5);
    ctx.stroke();
    ctx.strokeStyle = `rgba(0, 0, 0, ${dark ? 0.5 : 0.16})`;
    ctx.beginPath();
    ctx.roundRect(-0.5, -0.5, w + 1, h + 1, 4.5);
    ctx.stroke();
    ctx.restore();
  }

  function drawTape(tape: Tape) {
    const length = Math.hypot(tape.b.x - tape.a.x, tape.b.y - tape.a.y);
    const angle = Math.atan2(tape.b.y - tape.a.y, tape.b.x - tape.a.x);
    const e = tape.peel ? ease(Math.min(1, tape.peel)) : 0;
    ctx.save();
    ctx.globalAlpha = 1 - e;
    ctx.translate(0, -e * 22);
    if (tape.lifted) {
      ctx.drawImage(
        tape.lifted,
        tape.liftedAt.x,
        tape.liftedAt.y,
        tape.lifted.width / k,
        tape.lifted.height / k,
      );
    }
    ctx.translate(tape.a.x, tape.a.y);
    ctx.rotate(angle);
    const half = tape.width / 2;
    // Torn ends, a little ragged.
    const teeth = Math.max(3, Math.round(tape.width / 4));
    ctx.beginPath();
    ctx.moveTo(-4, -half);
    ctx.lineTo(length + 4, -half);
    for (let i = 1; i <= teeth; i++)
      ctx.lineTo(
        length + 4 + (i % 2 ? 2 : 0),
        -half + (tape.width * i) / teeth,
      );
    ctx.lineTo(-4, half);
    for (let i = teeth - 1; i >= 0; i--)
      ctx.lineTo(-4 - (i % 2 ? 2 : 0), -half + (tape.width * i) / teeth);
    ctx.closePath();
    ctx.fillStyle = "rgba(250, 244, 220, 0.34)";
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.55)";
    ctx.lineWidth = 0.75;
    ctx.stroke();
    ctx.fillStyle = "rgba(255, 255, 255, 0.16)";
    ctx.fillRect(-2, -half + tape.width * 0.18, length + 4, tape.width * 0.14);
    ctx.restore();
  }

  // The burnisher, leaning away to the upper right as a right hand holds it.
  function drawTool() {
    if (!settings || !tool) return;
    const { radius } = TIPS[settings.tip];
    const tip = settings.tip;
    const angle = -0.95;
    const ux = Math.cos(angle);
    const uy = Math.sin(angle);
    const { x, y } = tool;
    const raise = toolPressing ? 0 : 3;

    ctx.save();
    ctx.lineCap = "round";
    // Its shadow, further off when it's raised.
    ctx.strokeStyle = "rgba(0, 0, 0, 0.16)";
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(x + 5 + raise, y + 6 + raise);
    ctx.lineTo(x + ux * 80 + 12 + raise, y + uy * 80 + 14 + raise);
    ctx.stroke();

    if (tip === "spoon") {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle + Math.PI / 2);
      const bowl = ctx.createLinearGradient(-radius, 0, radius, 0);
      bowl.addColorStop(0, "#9aa1a8");
      bowl.addColorStop(0.45, "#eef1f3");
      bowl.addColorStop(1, "#7d858c");
      ctx.fillStyle = bowl;
      ctx.beginPath();
      ctx.ellipse(
        0,
        -radius * 0.6,
        radius * 1.15,
        radius * 1.7,
        0,
        0,
        Math.PI * 2,
      );
      ctx.fill();
      ctx.strokeStyle = "rgba(0, 0, 0, 0.25)";
      ctx.lineWidth = 0.75;
      ctx.stroke();
      ctx.restore();
      ctx.strokeStyle = "#b9c0c6";
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.moveTo(x + ux * radius * 2.2, y + uy * radius * 2.2);
      ctx.lineTo(x + ux * 92, y + uy * 92);
      ctx.stroke();
    } else {
      const flat = tip === "spatula";
      // Steel shaft, then the handle.
      ctx.strokeStyle = "#c4cad0";
      ctx.lineWidth = flat ? radius * 1.6 : 2.6;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + ux * 24, y + uy * 24);
      ctx.stroke();
      ctx.strokeStyle = "#2a2a2c";
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.moveTo(x + ux * 24, y + uy * 24);
      ctx.lineTo(x + ux * 84, y + uy * 84);
      ctx.stroke();
      ctx.strokeStyle = "rgba(255, 255, 255, 0.22)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x + ux * 26 - 1.5, y + uy * 26 - 1);
      ctx.lineTo(x + ux * 82 - 1.5, y + uy * 82 - 1);
      ctx.stroke();
      const ball = ctx.createRadialGradient(
        x - radius * 0.35,
        y - radius * 0.35,
        0,
        x,
        y,
        radius,
      );
      ball.addColorStop(0, "#ffffff");
      ball.addColorStop(0.5, "#c9ced3");
      ball.addColorStop(1, "#6f777e");
      ctx.fillStyle = ball;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // The paper as a process camera's lith film sees it: blind to red, flooded by pale blue,
  // pushed to pure black and white, a little soft, and never quite free of dust.
  function photograph() {
    const { canvas: out, ctx: o } = canvas2d(
      paperBase?.width ?? 1,
      paperBase?.height ?? 1,
      true,
    );
    const pw = out.width;
    const ph = out.height;
    if (paperBase) o.drawImage(paperBase, 0, 0);
    o.drawImage(paperInk.canvas, 0, 0);
    const image = o.getImageData(0, 0, pw, ph);
    const data = image.data;
    const seen = new Float32Array(pw * ph);
    for (let i = 0; i < pw * ph; i++) {
      seen[i] =
        (data[i * 4] * 0.04 + data[i * 4 + 1] * 0.5 + data[i * 4 + 2] * 0.46) /
        255;
    }
    const rand = random(31);
    const soft = Math.max(1, Math.round(k * 0.8));
    for (let y = 0; y < ph; y++) {
      for (let x = 0; x < pw; x++) {
        let sum = 0;
        let n = 0;
        for (let oy = -soft; oy <= soft; oy += soft) {
          const yy = y + oy;
          if (yy < 0 || yy >= ph) continue;
          for (let ox = -soft; ox <= soft; ox += soft) {
            const xx = x + ox;
            if (xx < 0 || xx >= pw) continue;
            sum += seen[yy * pw + xx];
            n++;
          }
        }
        let v = smoothstep(0.4, 0.5, sum / n + (rand() - 0.5) * 0.06);
        const dust = rand();
        if (dust < 0.00008) v = 1 - v;
        const o4 = (y * pw + x) * 4;
        data[o4] = 20 + v * 230;
        data[o4 + 1] = 20 + v * 229;
        data[o4 + 2] = 20 + v * 224;
        data[o4 + 3] = 255;
      }
    }
    o.putImageData(image, 0, 0);
    return out;
  }

  // ——— Loop ———

  function animating() {
    return (
      steps.length > 0 ||
      queue.length > 0 ||
      tidyIn >= 0 ||
      Math.abs(pose.lift - pose.liftTo) > 0.002 ||
      tapes.some((tape) => tape.peel > 0)
    );
  }

  function tick(now: number) {
    const dt = Math.min((now - last) / 1000, 1 / 30);
    last = now;
    const wasBusy = busy();
    runSteps(reduceMotion() ? Infinity : dt);
    if (tidyIn >= 0 && !steps.length && !queue.length) {
      tidyIn -= dt;
      if (tidyIn < 0) {
        tidy();
        runSteps(reduceMotion() ? Infinity : 0);
      }
    }
    pose.lift += (pose.liftTo - pose.lift) * (1 - Math.exp(-dt / 0.045));
    if (Math.abs(pose.lift - pose.liftTo) < 0.002) pose.lift = pose.liftTo;
    for (let i = tapes.length - 1; i >= 0; i--) {
      const tape = tapes[i];
      if (!tape.peel) continue;
      tape.peel += dt / 0.5;
      if (tape.peel >= 1) tapes.splice(i, 1);
    }
    draw();
    if (wasBusy !== busy()) report();
    if (animating()) {
      frame = requestAnimationFrame(tick);
    } else {
      running = false;
    }
  }

  function start() {
    if (running) return;
    running = true;
    last = performance.now();
    frame = requestAnimationFrame(tick);
  }

  let pendingDraw = 0;
  function invalidate() {
    if (running) return;
    if (animating()) {
      start();
      return;
    }
    if (pendingDraw) return;
    pendingDraw = requestAnimationFrame(() => {
      pendingDraw = 0;
      if (!running) draw();
    });
  }

  function report() {
    onStats?.({
      left: sheet
        ? sheet.glyphs.filter((glyph) => glyph.left > 0.85).length
        : 0,
      total: sheet?.glyphs.length ?? 0,
      set: placed.length,
      busy: busy(),
      ready: Boolean(sheet),
      aside,
    });
  }

  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  resize();

  // ——— Input ———

  function hit(point: Point) {
    if (!sheet || !settings) return "paper" as const;
    const lx = point.x - pose.x;
    const ly = point.y - pose.y;
    if (lx < 0 || ly < 0 || lx > sheet.width || ly > sheet.height)
      return "paper" as const;
    const m = sheet.margin;
    if (
      lx < m.side ||
      lx > sheet.width - m.side ||
      ly < m.top ||
      ly > sheet.height - m.bottom
    )
      return "margin" as const;
    return "film" as const;
  }

  function cursorFor(point: Point | null) {
    if (!point || !settings || settings.camera) return "default";
    const where = hit(point);
    if (settings.tool === "hand" && where !== "paper") return "grab";
    if (where === "margin") return "grab";
    if (settings.tool === "burnisher" && where === "film") return "none";
    if (settings.tool === "tape" && where === "paper") return "crosshair";
    return "default";
  }

  return {
    setSettings(next: DryTransferSettings) {
      const previous = settings;
      settings = next;
      if (
        !previous ||
        previous.face !== next.face ||
        previous.ink !== next.ink ||
        previous.age !== next.age
      ) {
        if (previous) {
          settle();
          commit();
        }
        sheetSeed++;
        buildSheet(Boolean(previous));
      }
      if (!previous || previous.paper !== next.paper) buildPaper();
      if (previous && previous.camera !== next.camera) {
        settle();
        if (next.camera) commit();
      }
      canvas.style.cursor = cursorFor(hover);
      invalidate();
    },

    // Characters to set: letters, spaces, "\n" for a new line and "\b" to tape up the last.
    // Typed keys rub down only if the setting says so; a word set from the field always does.
    type(text: string, rub = settings?.autoRub ?? true) {
      if (!sheet || !settings || settings.camera) return;
      tidyIn = -1;
      if (!rub) {
        // By hand, each key brings its letter into place at once, after any space before it.
        settle();
        queue.length = 0;
      }
      for (const char of text) queue.push({ char, rub });
      tidyAfter = rub && /[^\s\b]/.test(text);
      if (reduceMotion()) runSteps(Infinity);
      report();
      start();
    },

    rubDown() {
      if (!sheet || !settings || settings.camera) return;
      takeOver();
      const glyph = placedGlyph;
      if (!glyph || glyph.left < 0.05) {
        say("Type a letter to bring it into place first.");
        return;
      }
      if (aside) return;
      steps.push(scribbleStep(glyph));
      if (reduceMotion()) settle();
      start();
    },

    // Lifts the sheet clear of the paper and lays it straight back, which is how you look.
    lift() {
      if (!sheet || aside) return;
      takeOver();
      steps.push(liftStep(), wait(0.18), layStep());
      if (reduceMotion()) settle();
      start();
    },

    putAside(on: boolean) {
      if (!sheet || aside === on) return;
      takeOver();
      aside = on;
      placedGlyph = null;
      const to = on
        ? { x: pose.x, y: asideY() }
        : { x: pose.x, y: Math.round(height * 0.42) };
      steps.push(
        liftStep(),
        slideStep(() => to),
        layStep(),
      );
      if (reduceMotion()) settle();
      report();
      start();
    },

    newSheet() {
      if (!settings) return;
      settle();
      commit();
      sheetSeed++;
      buildSheet(true);
    },

    newPaper() {
      settle();
      paperInk.ctx.clearRect(
        0,
        0,
        paperInk.canvas.width,
        paperInk.canvas.height,
      );
      shadePaper();
      placed.length = 0;
      cursor.x = margin;
      cursor.y = guide.first;
      report();
      invalidate();
    },

    pointerDown(id: number, point: Point) {
      if (!settings || settings.camera || !sheet) return;
      takeOver();
      const where = hit(point);
      if (
        (settings.tool === "hand" && where !== "paper") ||
        where === "margin"
      ) {
        commit();
        pose.liftTo = 1;
        gestures.set(id, {
          kind: "drag",
          dx: point.x - pose.x,
          dy: point.y - pose.y,
          start: point,
          moved: false,
        });
        canvas.style.cursor = "grabbing";
      } else if (settings.tool === "burnisher" && where === "film") {
        gestures.set(id, { kind: "burnish", last: point });
        tool = point;
        toolPressing = true;
        burnish(point, point, 0.5);
      } else if (settings.tool === "tape" && where === "paper") {
        const tape: Tape = {
          a: point,
          b: point,
          width: 20,
          peel: 0,
          lifted: null,
          liftedAt: { x: 0, y: 0 },
        };
        tapes.push(tape);
        gestures.set(id, { kind: "tape", tape });
      } else {
        gestures.set(id, { kind: "none" });
        if (settings.tool === "burnisher" && where === "paper")
          say(
            aside
              ? "The sheet is put aside. Lay it down to rub a letter."
              : "Rub on the sheet, over a letter.",
            2500,
          );
        if (settings.tool === "tape" && where === "film")
          say("Tape here would stick to the sheet. Move it off first.", 2500);
      }
      report();
      start();
    },

    pointerMove(id: number, points: Point[]) {
      const last = points[points.length - 1];
      if (!last) return;
      hover = last;
      const gesture = gestures.get(id);
      if (!gesture) {
        canvas.style.cursor = cursorFor(last);
        if (busy()) return;
        const showTool =
          settings?.tool === "burnisher" && hit(last) === "film" && !aside;
        const nextTool = showTool ? last : null;
        if (nextTool || tool) {
          tool = nextTool;
          toolPressing = false;
          invalidate();
        }
        return;
      }
      if (gesture.kind === "burnish") {
        for (const point of points) {
          burnish(gesture.last, point);
          gesture.last = point;
        }
        tool = last;
      } else if (gesture.kind === "drag") {
        if (Math.hypot(last.x - gesture.start.x, last.y - gesture.start.y) > 3)
          gesture.moved = true;
        pose.x = last.x - gesture.dx;
        pose.y = last.y - gesture.dy;
        placedGlyph = null;
      } else if (gesture.kind === "tape") {
        gesture.tape.b = last;
      }
      invalidate();
    },

    pointerUp(id: number) {
      const gesture = gestures.get(id);
      gestures.delete(id);
      if (!gesture) return;
      if (gesture.kind === "drag") {
        pose.liftTo = 0;
        if (aside && pose.y < asideY() - 40) aside = false;
        canvas.style.cursor = cursorFor(hover);
        report();
      } else if (gesture.kind === "burnish") {
        toolPressing = false;
      } else if (gesture.kind === "tape") {
        const tape = gesture.tape;
        if (Math.hypot(tape.b.x - tape.a.x, tape.b.y - tape.a.y) < 4) {
          tape.b = { x: tape.a.x + 30, y: tape.a.y };
        }
        startPeel(tape, true);
      }
      start();
      invalidate();
    },

    pointerLeave() {
      hover = null;
      if (!gestures.size && tool && !busy()) {
        tool = null;
        invalidate();
      }
    },

    async exportStat() {
      settle();
      commit();
      const picture = stat ?? photograph();
      stat = picture;
      return new Promise<Blob | null>((resolve) =>
        picture.toBlob(resolve, "image/png"),
      );
    },

    dispose() {
      disposed = true;
      cancelAnimationFrame(frame);
      cancelAnimationFrame(pendingDraw);
      clearTimeout(messageTimer);
      running = false;
      observer.disconnect();
    },
  };
}

// Back-and-forth strokes across a box at an angle, as a hand scribbles a letter down: lines a
// little closer than the tip is wide, so nothing is missed, with a slight wobble.
function hatch(
  box: [number, number, number, number],
  radius: number,
  angle: number,
  rand: () => number,
) {
  // A point or comma is narrower than a spoon; the inset never turns the box inside out.
  const inset = Math.max(
    0,
    Math.min(
      radius * 0.4,
      (box[2] - box[0]) / 2 - 0.5,
      (box[3] - box[1]) / 2 - 0.5,
    ),
  );
  const l = box[0] + inset;
  const t = box[1] + inset;
  const r = box[2] - inset;
  const b = box[3] - inset;
  const cx = (l + r) / 2;
  const cy = (t + b) / 2;
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const nx = -dy;
  const ny = dx;
  const halfW = (r - l) / 2;
  const halfH = (b - t) / 2;
  const span = Math.abs(nx) * halfW + Math.abs(ny) * halfH;
  const spacing = radius * 1.15;
  const points: number[] = [];
  let flip = false;
  for (let off = -span + spacing / 2; off <= span; off += spacing) {
    let s0 = -Infinity;
    let s1 = Infinity;
    for (const [d, p, lo, hi] of [
      [dx, cx + nx * off, l, r],
      [dy, cy + ny * off, t, b],
    ]) {
      if (Math.abs(d) < 1e-6) {
        if (p < lo || p > hi) s0 = Infinity;
        continue;
      }
      const a = (lo - p) / d;
      const c = (hi - p) / d;
      s0 = Math.max(s0, Math.min(a, c));
      s1 = Math.min(s1, Math.max(a, c));
    }
    if (s0 >= s1) continue;
    const ends = flip ? [s1, s0] : [s0, s1];
    flip = !flip;
    for (const s of ends) {
      points.push(
        cx + nx * off + dx * s + (rand() - 0.5) * radius * 0.5,
        cy + ny * off + dy * s + (rand() - 0.5) * radius * 0.5,
      );
    }
  }
  // Too small to hatch: a few short strokes back and forth across the middle.
  if (!points.length) {
    const d = radius * 0.8;
    const e = radius * 0.3;
    points.push(cx - d, cy - e, cx + d, cy, cx - d, cy + e, cx + d, cy);
  }
  return points;
}

export type DryTransfer = ReturnType<typeof createDryTransfer>;
