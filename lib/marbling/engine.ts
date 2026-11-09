// Paper marbling on a bath of size, the way ebru and old endpapers are made. Inks float on the
// thickened water as a film and never mix: every move only pushes the film around, so each
// colour keeps its area however far it's pulled. That's what this models. Every ink is a
// polygon, and every move is a map of the whole surface that keeps area. A drop landing at a
// point pushes everything already floating straight out from it, so earlier inks become rings
// round it (p' = c + (p − c)·√(1 + r²/|p − c|²), after Aubrey Jaffer's "Mathematical
// marbling"). A stylus or comb drags the film along with each tine, fully right beside it and
// less with distance, so colours are pulled out into threads and chevrons.
//
// Inks are painted oldest first. A drop never lands on top of ink, it pushes it aside, so a
// newer ink always sits in the hole it made in the older ones and painting in order is exact.
//
// The surface only has so much room: as it fills, each new drop spreads less than the last,
// which is why marblers add gall to later colours. Paper laid on the bath lifts nearly all of
// the colour as a mirror image, except where air was caught under it, and leaves a ghost behind
// for a fainter second print.

import {
  BATH_H,
  BATH_W,
  buildPattern,
  type PatternId,
  type Step,
} from "./patterns";

export type Tool = "drop" | "spatter" | "stylus" | "comb";

export type Ink = {
  name: string;
  // Any CSS colour. Gall water has none of its own: it spreads clear and pushes the rest aside.
  color: string;
  clear?: boolean;
};

export type MarblingSettings = {
  tool: Tool;
  inks: Ink[];
  // The ink on the brush, as an index into inks.
  ink: number;
  // Move on to the next ink after every drop.
  cycle: boolean;
  // 0–100: gall in the ink, so how far a drop spreads.
  gall: number;
  // 0–100: how thick the size is. On a thin bath the drag reaches wide and soft; a thick one
  // holds a crisp line.
  bath: number;
  // Comb tine spacing, in bath units.
  tines: number;
};

export type Phase =
  | "bath"
  | "laying"
  | "laid"
  | "lifting"
  | "print"
  | "skimming";

export type MarblingState = {
  phase: Phase;
  drops: number;
  // Percentage of the surface taken up.
  covered: number;
  prints: number;
  // Air caught under the paper and not yet tapped out.
  bubbles: number;
  playing: PatternId | null;
};

type Point = { x: number; y: number };
type RGB = [number, number, number];

type Film = {
  xs: Float64Array;
  ys: Float64Array;
  n: number;
  rgb: RGB;
  clear: boolean;
  // Pigment left in it: 1 when floated, a tenth after a print has lifted the rest.
  strength: number;
  fill: string;
  edge: string;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  dirty: boolean;
  path: Path2D | null;
  // Bounds of each run of CHUNK points: minX, minY, maxX, maxY.
  boxes: Float64Array;
};

type Spread = {
  x: number;
  y: number;
  // Squared radius so far and at full spread: the drop map adds area, so it grows by r².
  r2: number;
  full: number;
  t: number;
  duration: number;
};

type Hand = {
  tool: Tool;
  start: Point;
  last: Point;
  at: Point;
  ink: number;
  // The comb keeps the angle it was first pulled at.
  comb: { nx: number; ny: number } | null;
  nextDrop: number;
  travelled: number;
};

type Bubble = Point & { r: number; popped: number | null };

type Ripple = Point & { age: number };

// Bath units are about a millimetre: a half-metre tray. The rim is the tray's wooden sides,
// and the paper is a little smaller than the bath, in the proportions of A-sizes.
const BATH_AREA = BATH_W * BATH_H;
const RIM = 22;
const PAPER_W = 466;
const PAPER_H = Math.round(PAPER_W * Math.SQRT2);
const PAPER_X = (BATH_W - PAPER_W) / 2;
const PAPER_Y = (BATH_H - PAPER_H) / 2;

// Edges are split once they stretch past MAX_EDGE units and merged under MIN_EDGE, so curves
// stay smooth as they're pulled. Past the budget, edges are allowed to grow longer instead.
const MAX_EDGE = 1.5;
const MIN_EDGE = 0.4;
const VERTEX_BUDGET = 650_000;

// A tine carries the film beside it at this share of its own speed, and its pull fades to
// nothing at REACH times the drag's width.
const KAPPA = 0.88;
const REACH = 5;

// Outlines are kept in runs of this many points, each with its own bounds, so a tine only
// visits the stretches of outline near it.
const CHUNK = 96;

// A drop from the brush, before gall and crowding, and the smallest a drop starts as.
const DROP_R = 24;
const SEED_R = 0.6;

const BATH_RGB: RGB = [225, 226, 219];
const PAPER_RGB: RGB = [246, 241, 229];
const PRINT_SCALE = 2.6;
const TAU = Math.PI * 2;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function mix(a: RGB, b: RGB, t: number): RGB {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}

function css([r, g, b]: RGB, alpha = 1) {
  return alpha < 1
    ? `rgb(${r | 0} ${g | 0} ${b | 0} / ${alpha})`
    : `rgb(${r | 0} ${g | 0} ${b | 0})`;
}

function easeInOut(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

// A small seeded generator, so the wood and the paper come out the same at every size.
function seeded(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Paper seen close up: a fine tooth and a few fibres, multiplied over whatever is on it.
function makePaperTexture() {
  const size = 256;
  const texture = document.createElement("canvas");
  texture.width = texture.height = size;
  const t = texture.getContext("2d");
  if (!t) return texture;
  const random = seeded(7);
  t.fillStyle = "#fff";
  t.fillRect(0, 0, size, size);
  for (let i = 0; i < 9000; i++) {
    const shade = 200 + random() * 55;
    t.fillStyle = `rgb(${shade} ${shade - 2} ${shade - 8} / ${0.18 + random() * 0.3})`;
    t.fillRect(random() * size, random() * size, 1, 1);
  }
  t.lineCap = "round";
  for (let i = 0; i < 170; i++) {
    const x = random() * size;
    const y = random() * size;
    const angle = random() * TAU;
    const length = 6 + random() * 22;
    t.strokeStyle = `rgb(180 170 150 / ${0.08 + random() * 0.12})`;
    t.lineWidth = 0.5 + random() * 0.6;
    t.beginPath();
    t.moveTo(x, y);
    t.quadraticCurveTo(
      x + Math.cos(angle) * length * 0.5 + (random() - 0.5) * 6,
      y + Math.sin(angle) * length * 0.5 + (random() - 0.5) * 6,
      x + Math.cos(angle) * length,
      y + Math.sin(angle) * length,
    );
    t.stroke();
  }
  return texture;
}

export function createMarbling(
  canvas: HTMLCanvasElement,
  {
    onState,
    onInk,
  }: {
    onState?: (state: MarblingState) => void;
    onInk?: (ink: number) => void;
  } = {},
) {
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas 2D is not available.");
  const ctx = context;

  const layer = (): [HTMLCanvasElement, CanvasRenderingContext2D] => {
    const element = document.createElement("canvas");
    const layerContext = element.getContext("2d");
    if (!layerContext) throw new Error("Canvas 2D is not available.");
    return [element, layerContext];
  };
  // The tray and the table under it, the inks, the light on the surface, and the last print.
  const [trayCanvas, trayCtx] = layer();
  const [inkCanvas, inkCtx] = layer();
  const [sheenCanvas, sheenCtx] = layer();
  const [printCanvas, printCtx] = layer();
  const paperTexture = makePaperTexture();
  const paperPattern = ctx.createPattern(paperTexture, "repeat");

  // Colours are parsed by a 1×1 canvas, so anything CSS understands works.
  const [probe, probeCtx] = layer();
  probe.width = probe.height = 1;
  const parsed = new Map<string, RGB>();
  function rgbOf(color: string): RGB {
    const known = parsed.get(color);
    if (known) return known;
    probeCtx.clearRect(0, 0, 1, 1);
    probeCtx.fillStyle = "#808080";
    probeCtx.fillStyle = color;
    probeCtx.fillRect(0, 0, 1, 1);
    const [r, g, b] = probeCtx.getImageData(0, 0, 1, 1).data;
    const value: RGB = [r, g, b];
    parsed.set(color, value);
    return value;
  }

  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");

  let settings: MarblingSettings = {
    tool: "drop",
    inks: [{ name: "Ink", color: "#333" }],
    ink: 0,
    cycle: false,
    gall: 50,
    bath: 50,
    tines: 20,
  };
  let currentInk = 0;

  let blobs: Film[] = [];
  const spreads: Spread[] = [];
  const later: { at: number; run: () => void }[] = [];
  const ripples: Ripple[] = [];
  const hands = new Map<number, Hand>();
  let hover: Point | null = null;
  // Ink floated so far, against the bath's area. Each drop pushes as much out over the walls
  // as it brings, bare surface and ink alike, so the share covered only creeps towards whole.
  let floated = 0;
  const covered = () => 1 - Math.exp(-floated);
  let drops = 0;
  let prints = 0;
  let vertices = 0;
  let inkDirty = true;

  let phase: Phase = "bath";
  let phaseAt = 0;
  let bubbles: Bubble[] = [];

  let script: {
    id: PatternId;
    steps: Step[];
    index: number;
    wait: number;
    // Progress along the current stroke: which leg, and how far along it.
    leg: number;
    along: number;
    comb: { nx: number; ny: number } | null;
    tool: Point | null;
  } | null = null;

  // Layout, in CSS pixels: the stage, the bath's top-left corner and its scale.
  let width = 0;
  let height = 0;
  let dpr = 1;
  let scale = 1;
  let ox = 0;
  let oy = 0;

  let running = false;
  let frame = 0;
  let last = 0;
  let clock = 0;

  // ——— Layout and the parts that only change with it ———

  function resize() {
    const rect = canvas.getBoundingClientRect();
    width = rect.width;
    height = rect.height;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
    const margin = clamp(Math.min(width, height) * 0.05, 12, 36);
    scale = Math.max(
      0.05,
      Math.min(
        (width - margin * 2) / (BATH_W + RIM * 2),
        (height - margin * 2) / (BATH_H + RIM * 2),
      ),
    );
    ox = (width - BATH_W * scale) / 2;
    oy = (height - BATH_H * scale) / 2;
    // The ink layer stays under a few million pixels, so a big screen at 2× doesn't crawl.
    const inkScale = Math.min(scale * dpr, Math.sqrt(2_600_000 / BATH_AREA));
    inkCanvas.width = Math.max(1, Math.round(BATH_W * inkScale));
    inkCanvas.height = Math.max(1, Math.round(BATH_H * inkScale));
    bakeTray();
    bakeSheen();
    inkDirty = true;
    draw();
  }

  // A shallow wooden tray, four boards mitred at the corners, with the grain running along each,
  // on a table lit from the top left.
  function bakeTray() {
    trayCanvas.width = canvas.width;
    trayCanvas.height = canvas.height;
    const t = trayCtx;
    t.setTransform(dpr, 0, 0, dpr, 0, 0);
    t.clearRect(0, 0, width, height);
    const rim = RIM * scale;
    const X = ox - rim;
    const Y = oy - rim;
    const W = BATH_W * scale + rim * 2;
    const H = BATH_H * scale + rim * 2;

    // Sitting on the table: a soft shadow all round and a tighter one where it touches.
    t.save();
    t.fillStyle = "#4a3221";
    t.shadowColor = "rgb(0 0 0 / 0.16)";
    t.shadowBlur = 30 * dpr;
    t.shadowOffsetY = 10 * dpr;
    t.beginPath();
    t.roundRect(X, Y, W, H, Math.min(6, rim * 0.4));
    t.fill();
    t.shadowColor = "rgb(0 0 0 / 0.3)";
    t.shadowBlur = 6 * dpr;
    t.shadowOffsetY = 2.5 * dpr;
    t.fill();
    t.restore();

    const random = seeded(11);
    // Each board's top is rounded over at both edges: the edge facing the light catches it,
    // the one facing away falls into shade. `across` runs from the outer edge to the inner.
    const boards: {
      corners: number[];
      along: "x" | "y";
      tone: number;
      across: [number, number, number, number];
      lit: boolean;
    }[] = [
      {
        corners: [X, Y, X + W, Y, X + W - rim, Y + rim, X + rim, Y + rim],
        along: "x",
        tone: 1.08,
        across: [0, Y, 0, Y + rim],
        lit: true,
      },
      {
        corners: [
          X + W,
          Y,
          X + W,
          Y + H,
          X + W - rim,
          Y + H - rim,
          X + W - rim,
          Y + rim,
        ],
        along: "y",
        tone: 0.86,
        across: [X + W, 0, X + W - rim, 0],
        lit: false,
      },
      {
        corners: [
          X + W,
          Y + H,
          X,
          Y + H,
          X + rim,
          Y + H - rim,
          X + W - rim,
          Y + H - rim,
        ],
        along: "x",
        tone: 0.8,
        across: [0, Y + H, 0, Y + H - rim],
        lit: false,
      },
      {
        corners: [X, Y + H, X, Y, X + rim, Y + rim, X + rim, Y + H - rim],
        along: "y",
        tone: 1,
        across: [X, 0, X + rim, 0],
        lit: true,
      },
    ];
    const wood: RGB = [116, 78, 50];
    for (const board of boards) {
      const c = board.corners;
      t.save();
      t.beginPath();
      t.moveTo(c[0], c[1]);
      for (let i = 2; i < c.length; i += 2) t.lineTo(c[i], c[i + 1]);
      t.closePath();
      t.clip();
      t.fillStyle = css(mix([0, 0, 0], wood, board.tone));
      t.fillRect(X, Y, W, H);
      // Grain: long wavering lines along the board, darker and lighter.
      const across = rim;
      const length = board.along === "x" ? W : H;
      const lines = Math.max(6, Math.round(across * 1.6));
      for (let i = 0; i < lines; i++) {
        const offset = random() * across;
        const dark = random() < 0.6;
        t.strokeStyle = dark
          ? `rgb(52 32 18 / ${0.12 + random() * 0.2})`
          : `rgb(176 134 96 / ${0.08 + random() * 0.14})`;
        t.lineWidth = 0.4 + random() * 0.9;
        t.beginPath();
        const wave = random() * TAU;
        const reach = 0.6 + random() * 1.4;
        for (let s = 0; s <= length; s += 6) {
          const wobble = Math.sin(s / (30 + random() * 2) + wave) * reach;
          const a = s;
          const b = offset + wobble;
          const [x, y] =
            board.along === "x"
              ? [X + a, (c[1] < c[5] ? Y : Y + H - rim) + b]
              : [(c[0] < c[4] ? X : X + W - rim) + b, Y + a];
          if (s) t.lineTo(x, y);
          else t.moveTo(x, y);
        }
        t.stroke();
      }
      const round = t.createLinearGradient(...board.across);
      const light = "rgb(255 232 200 / 0.3)";
      const shade = "rgb(20 10 4 / 0.38)";
      round.addColorStop(0, board.lit ? light : shade);
      round.addColorStop(0.3, "rgb(0 0 0 / 0)");
      round.addColorStop(0.72, "rgb(0 0 0 / 0)");
      round.addColorStop(1, board.lit ? shade : light);
      t.fillStyle = round;
      t.fillRect(X, Y, W, H);
      t.restore();
    }

    // Mitre joints, the bevel catching the light, and the dark line where the wall meets water.
    t.strokeStyle = "rgb(30 18 10 / 0.45)";
    t.lineWidth = 0.8;
    t.beginPath();
    t.moveTo(X, Y);
    t.lineTo(X + rim, Y + rim);
    t.moveTo(X + W, Y);
    t.lineTo(X + W - rim, Y + rim);
    t.moveTo(X + W, Y + H);
    t.lineTo(X + W - rim, Y + H - rim);
    t.moveTo(X, Y + H);
    t.lineTo(X + rim, Y + H - rim);
    t.stroke();

    t.fillStyle = css(BATH_RGB);
    t.fillRect(ox, oy, BATH_W * scale, BATH_H * scale);
    t.strokeStyle = "rgb(28 18 10 / 0.7)";
    t.lineWidth = 1;
    t.strokeRect(ox - 0.5, oy - 0.5, BATH_W * scale + 1, BATH_H * scale + 1);
  }

  // Light on the water, which stays put while the inks move under it: the rim's shadow along the
  // near walls, the meniscus climbing the far ones, and a window reflected in the surface.
  function bakeSheen() {
    const W = BATH_W * scale;
    const H = BATH_H * scale;
    sheenCanvas.width = Math.max(1, Math.round(W * dpr));
    sheenCanvas.height = Math.max(1, Math.round(H * dpr));
    const c = sheenCtx;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, W, H);

    // The walls show in the water right beside them, as a brown band fading out.
    const band = Math.max(5, 9 * scale);
    const edges: [number, number, number, number, number, number][] = [
      [0, 0, 0, band, W, band],
      [0, H, 0, H - band, W, band],
      [0, 0, band, 0, band, H],
      [W, 0, W - band, 0, band, H],
    ];
    for (const [x0, y0, x1, y1, w, h] of edges) {
      const g = c.createLinearGradient(x0, y0, x1, y1);
      g.addColorStop(0, "rgb(92 60 36 / 0.22)");
      g.addColorStop(1, "rgb(92 60 36 / 0)");
      c.fillStyle = g;
      c.fillRect(Math.min(x0, x1, W - w), Math.min(y0, y1, H - h), w, h);
    }

    // The rim's shadow along the near walls, longer than the reflection.
    const shade = Math.max(10, 20 * scale);
    let g = c.createLinearGradient(0, 0, 0, shade);
    g.addColorStop(0, "rgb(40 26 12 / 0.24)");
    g.addColorStop(1, "rgb(40 26 12 / 0)");
    c.fillStyle = g;
    c.fillRect(0, 0, W, shade);
    g = c.createLinearGradient(0, 0, shade, 0);
    g.addColorStop(0, "rgb(40 26 12 / 0.18)");
    g.addColorStop(1, "rgb(40 26 12 / 0)");
    c.fillStyle = g;
    c.fillRect(0, 0, shade, H);

    const lip = 3.5;
    g = c.createLinearGradient(0, H - lip, 0, H);
    g.addColorStop(0, "rgb(255 255 255 / 0)");
    g.addColorStop(0.7, "rgb(255 255 255 / 0.5)");
    g.addColorStop(1, "rgb(255 255 255 / 0.1)");
    c.fillStyle = g;
    c.fillRect(0, H - lip, W, lip);
    g = c.createLinearGradient(W - lip, 0, W, 0);
    g.addColorStop(0, "rgb(255 255 255 / 0)");
    g.addColorStop(0.7, "rgb(255 255 255 / 0.4)");
    g.addColorStop(1, "rgb(255 255 255 / 0.08)");
    c.fillStyle = g;
    c.fillRect(W - lip, 0, lip, H);

    g = c.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, "rgb(255 255 255 / 0.1)");
    g.addColorStop(0.45, "rgb(255 255 255 / 0)");
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);

    // Four panes of a window, softened as the surface would.
    c.save();
    c.filter = `blur(${Math.max(3, 7 * scale)}px)`;
    c.fillStyle = "rgb(255 255 255 / 0.11)";
    const wx = W * 0.58;
    const wy = H * 0.06;
    const ww = W * 0.3;
    const wh = H * 0.22;
    const bar = Math.max(3, W * 0.018);
    for (let i = 0; i < 2; i++) {
      for (let j = 0; j < 2; j++) {
        c.beginPath();
        c.roundRect(
          wx + i * (ww / 2 + bar / 2),
          wy + j * (wh / 2 + bar / 2),
          ww / 2 - bar / 2,
          wh / 2 - bar / 2,
          2,
        );
        c.fill();
      }
    }
    c.restore();
  }

  const observer = new ResizeObserver(resize);
  observer.observe(canvas);

  // ——— The film: the maps that move it, and keeping its outlines smooth ———

  // The drop map, applied to every outline: everything is pushed straight out from (cx, cy) so
  // that a disc of area π·delta opens up there. Bounds are refreshed on the way.
  function pushOut(cx: number, cy: number, delta: number) {
    for (const blob of blobs) {
      const { xs, ys, n, boxes } = blob;
      let X0 = Infinity;
      let Y0 = Infinity;
      let X1 = -Infinity;
      let Y1 = -Infinity;
      for (let c = 0, i = 0; i < n; c++) {
        const end = Math.min(n, i + CHUNK);
        let x0 = Infinity;
        let y0 = Infinity;
        let x1 = -Infinity;
        let y1 = -Infinity;
        for (; i < end; i++) {
          const dx = xs[i] - cx;
          const dy = ys[i] - cy;
          const k = Math.sqrt(1 + delta / (dx * dx + dy * dy + 1e-12));
          const x = cx + dx * k;
          const y = cy + dy * k;
          xs[i] = x;
          ys[i] = y;
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
        boxes[c * 4] = x0;
        boxes[c * 4 + 1] = y0;
        boxes[c * 4 + 2] = x1;
        boxes[c * 4 + 3] = y1;
        if (x0 < X0) X0 = x0;
        if (x1 > X1) X1 = x1;
        if (y0 < Y0) Y0 = y0;
        if (y1 > Y1) Y1 = y1;
      }
      blob.minX = X0;
      blob.minY = Y0;
      blob.maxX = X1;
      blob.maxY = Y1;
      blob.dirty = true;
    }
  }

  // One small step of a tine (or a row of tines) from a to b. Film beside the tine moves with
  // it at KAPPA of its speed; further off, by (λ/(d + λ))², easing to nothing at REACH·λ. Each
  // point answers to its nearest tine, so a comb drags the film between tines evenly.
  function drag(
    ax: number,
    ay: number,
    bx: number,
    by: number,
    lambda: number,
    comb: { nx: number; ny: number; spacing: number } | null,
  ) {
    const dx = bx - ax;
    const dy = by - ay;
    const length2 = dx * dx + dy * dy;
    if (length2 < 1e-10) return;
    const length = Math.sqrt(length2);
    const mx = dx / length;
    const my = dy / length;
    const reach = lambda * REACH;
    const reach2 = reach * reach;
    const cut = (1 / (REACH + 1)) ** 2;
    const norm = KAPPA / (1 - cut);
    const nx = comb?.nx ?? 0;
    const ny = comb?.ny ?? 0;
    const spacing = comb?.spacing ?? 0;
    const left = Math.min(ax, bx) - reach;
    const right = Math.max(ax, bx) + reach;
    const top = Math.min(ay, by) - reach;
    const bottom = Math.max(ay, by) + reach;

    // Whether a box is out of reach: for the stylus, by its bounds; for a comb, which reaches
    // right across, by how far the box lies ahead of it or behind.
    const away = (x0: number, y0: number, x1: number, y1: number) => {
      if (!comb) return x1 < left || x0 > right || y1 < top || y0 > bottom;
      const a = (x0 - ax) * mx + (y0 - ay) * my;
      const b = (x1 - ax) * mx + (y0 - ay) * my;
      const c = (x0 - ax) * mx + (y1 - ay) * my;
      const d = (x1 - ax) * mx + (y1 - ay) * my;
      return (
        Math.max(a, b, c, d) < -reach || Math.min(a, b, c, d) > length + reach
      );
    };

    for (const blob of blobs) {
      if (away(blob.minX, blob.minY, blob.maxX, blob.maxY)) continue;
      const { xs, ys, n, boxes } = blob;
      for (let c = 0, from = 0; from < n; c++, from += CHUNK) {
        const o = c * 4;
        let x0 = boxes[o];
        let y0 = boxes[o + 1];
        let x1 = boxes[o + 2];
        let y1 = boxes[o + 3];
        if (away(x0, y0, x1, y1)) continue;
        const end = Math.min(n, from + CHUNK);
        let touched = false;
        for (let i = from; i < end; i++) {
          let rx = xs[i] - ax;
          let ry = ys[i] - ay;
          if (comb) {
            const u = rx * nx + ry * ny;
            const offset = Math.round(u / spacing) * spacing;
            rx -= offset * nx;
            ry -= offset * ny;
          }
          let t = (rx * dx + ry * dy) / length2;
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          const ex = rx - t * dx;
          const ey = ry - t * dy;
          const d2 = ex * ex + ey * ey;
          if (d2 >= reach2) continue;
          const q = lambda / (Math.sqrt(d2) + lambda);
          const k = (q * q - cut) * norm;
          const x = xs[i] + dx * k;
          const y = ys[i] + dy * k;
          xs[i] = x;
          ys[i] = y;
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
          touched = true;
        }
        if (!touched) continue;
        boxes[o] = x0;
        boxes[o + 1] = y0;
        boxes[o + 2] = x1;
        boxes[o + 3] = y1;
        if (x0 < blob.minX) blob.minX = x0;
        if (x1 > blob.maxX) blob.maxX = x1;
        if (y0 < blob.minY) blob.minY = y0;
        if (y1 > blob.maxY) blob.maxY = y1;
        blob.dirty = true;
      }
    }
  }

  // A drag along a whole segment, in steps a little shorter than the drag's width so the film
  // between is carried smoothly, settling the outlines every few steps.
  function dragAlong(
    a: Point,
    b: Point,
    lambda: number,
    comb: { nx: number; ny: number; spacing: number } | null,
  ) {
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    const steps = Math.max(1, Math.ceil(length / (lambda * 0.8)));
    for (let s = 0; s < steps; s++) {
      drag(
        a.x + ((b.x - a.x) * s) / steps,
        a.y + ((b.y - a.y) * s) / steps,
        a.x + ((b.x - a.x) * (s + 1)) / steps,
        a.y + ((b.y - a.y) * (s + 1)) / steps,
        lambda,
        comb,
      );
      if (s % 4 === 3) settle();
    }
  }

  // Bounds for a whole outline and for each run of CHUNK points along it.
  function bound(blob: Film) {
    const { xs, ys, n } = blob;
    const chunks = Math.ceil(n / CHUNK);
    if (blob.boxes.length < chunks * 4) {
      blob.boxes = new Float64Array(Math.ceil(chunks * 1.3) * 4);
    }
    const boxes = blob.boxes;
    let X0 = Infinity;
    let Y0 = Infinity;
    let X1 = -Infinity;
    let Y1 = -Infinity;
    for (let c = 0, i = 0; i < n; c++) {
      const end = Math.min(n, i + CHUNK);
      let x0 = Infinity;
      let y0 = Infinity;
      let x1 = -Infinity;
      let y1 = -Infinity;
      for (; i < end; i++) {
        const x = xs[i];
        const y = ys[i];
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
      boxes[c * 4] = x0;
      boxes[c * 4 + 1] = y0;
      boxes[c * 4 + 2] = x1;
      boxes[c * 4 + 3] = y1;
      if (x0 < X0) X0 = x0;
      if (x1 > X1) X1 = x1;
      if (y0 < Y0) Y0 = y0;
      if (y1 > Y1) Y1 = y1;
    }
    blob.minX = X0;
    blob.minY = Y0;
    blob.maxX = X1;
    blob.maxY = Y1;
  }

  // Outlines are resampled after they move: long edges split, crowded points merged. Ink that
  // has been pushed right off the bath is let go.
  let scratchX = new Float64Array(1 << 15);
  let scratchY = new Float64Array(1 << 15);
  function settle() {
    const maxEdge = MAX_EDGE * Math.max(1, vertices / VERTEX_BUDGET);
    const max2 = maxEdge * maxEdge;
    const min2 = MIN_EDGE * MIN_EDGE;
    let total = 0;
    let kept = 0;
    for (const blob of blobs) {
      if (blob.dirty) {
        const { xs, ys, n } = blob;
        let count = 0;
        let px = xs[0];
        let py = ys[0];
        for (let i = 1; i <= n; i++) {
          const j = i === n ? 0 : i;
          const x = xs[j];
          const y = ys[j];
          const dx = x - px;
          const dy = y - py;
          const d2 = dx * dx + dy * dy;
          if (d2 < min2 && i < n && n - i + count > 4) continue;
          const pieces = d2 > max2 ? Math.ceil(Math.sqrt(d2) / maxEdge) : 1;
          if (count + pieces + 1 >= scratchX.length) {
            let size = scratchX.length * 2;
            while (count + pieces + 1 >= size) size *= 2;
            const nextX = new Float64Array(size);
            const nextY = new Float64Array(size);
            nextX.set(scratchX);
            nextY.set(scratchY);
            scratchX = nextX;
            scratchY = nextY;
          }
          scratchX[count] = px;
          scratchY[count] = py;
          count++;
          for (let s = 1; s < pieces; s++) {
            scratchX[count] = px + (dx * s) / pieces;
            scratchY[count] = py + (dy * s) / pieces;
            count++;
          }
          px = x;
          py = y;
        }
        if (blob.xs.length < count) {
          blob.xs = new Float64Array(Math.ceil(count * 1.3));
          blob.ys = new Float64Array(Math.ceil(count * 1.3));
        }
        blob.xs.set(scratchX.subarray(0, count));
        blob.ys.set(scratchY.subarray(0, count));
        blob.n = count;
        bound(blob);
        blob.dirty = false;
        blob.path = null;
        inkDirty = true;
      }
      const gone =
        blob.n < 3 ||
        blob.maxX < -30 ||
        blob.minX > BATH_W + 30 ||
        blob.maxY < -30 ||
        blob.minY > BATH_H + 30;
      if (!gone) {
        blobs[kept++] = blob;
        total += blob.n;
      }
    }
    if (kept !== blobs.length) {
      blobs.length = kept;
      inkDirty = true;
    }
    vertices = total;
  }

  // ——— Inks ———

  function colorsFor(blob: Film) {
    const fill = blob.clear
      ? BATH_RGB
      : mix(BATH_RGB, blob.rgb, 0.94 * Math.min(1, blob.strength));
    blob.fill = css(fill);
    blob.edge = css(mix(fill, [20, 14, 8], 0.3), 0.4);
  }

  function nextInk() {
    const ink = clamp(currentInk, 0, settings.inks.length - 1);
    if (settings.cycle && settings.inks.length > 1) {
      currentInk = (ink + 1) % settings.inks.length;
      onInk?.(currentInk);
    }
    return ink;
  }

  // How far a drop spreads: more with gall, less on a crowded surface. Gall water is all gall.
  function spreadFor(r: number, ink: Ink) {
    const gall = 0.45 + (settings.gall / 100) * 1.1;
    const full = covered();
    const crowd = Math.max(0.35, 1 - 0.65 * full * full);
    return r * Math.sqrt(gall * crowd * (ink.clear ? 1.5 : 1));
  }

  function float(x: number, y: number, r: number, inkIndex: number) {
    const ink = settings.inks[inkIndex] ?? settings.inks[0];
    if (!ink) return;
    const full = spreadFor(r, ink) ** 2;
    // Make room for the seed, then add it; from here the drop map grows it with the rest.
    pushOut(x, y, SEED_R * SEED_R);
    const count = 24;
    const xs = new Float64Array(64);
    const ys = new Float64Array(64);
    for (let i = 0; i < count; i++) {
      xs[i] = x + Math.cos((i / count) * TAU) * SEED_R;
      ys[i] = y + Math.sin((i / count) * TAU) * SEED_R;
    }
    const blob: Film = {
      xs,
      ys,
      n: count,
      rgb: rgbOf(ink.color),
      clear: Boolean(ink.clear),
      strength: 1,
      fill: "",
      edge: "",
      minX: x - SEED_R,
      minY: y - SEED_R,
      maxX: x + SEED_R,
      maxY: y + SEED_R,
      dirty: true,
      path: null,
      boxes: new Float64Array([x - SEED_R, y - SEED_R, x + SEED_R, y + SEED_R]),
    };
    colorsFor(blob);
    blobs.push(blob);
    floated += (Math.PI * full) / BATH_AREA;
    drops++;
    if (reduceMotion.matches) {
      // All at once, in a few steps so the outlines keep up.
      let r2 = SEED_R * SEED_R;
      for (let i = 1; i <= 4; i++) {
        const next = SEED_R * SEED_R + ((full - SEED_R * SEED_R) * i) / 4;
        pushOut(x, y, next - r2);
        r2 = next;
        settle();
      }
    } else {
      spreads.push({
        x,
        y,
        r2: SEED_R * SEED_R,
        full,
        t: 0,
        duration: 0.32 + 0.22 * Math.min(1, Math.sqrt(full) / 30),
      });
      ripples.push({ x, y, age: 0 });
    }
    start();
  }

  // A flick of the whisk: a spray of small drops of one ink round a point, landing a moment
  // apart.
  function flick(at: Point, ink: number, amount: number) {
    const count = Math.round((7 + Math.random() * 7) * amount);
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * TAU;
      const distance = 34 * Math.sqrt(-2 * Math.log(1 - Math.random() * 0.95));
      const r = 5 + Math.random() ** 2 * 10;
      const x = at.x + Math.cos(angle) * distance;
      const y = at.y + Math.sin(angle) * distance;
      later.push({
        at: clock + i * 0.014 + Math.random() * 0.04,
        run: () => float(x, y, r, ink),
      });
    }
    start();
  }

  function setStrengths(factor: number) {
    for (const blob of blobs) {
      blob.strength *= factor;
      colorsFor(blob);
    }
    inkDirty = true;
  }

  function clearBath() {
    blobs = [];
    spreads.length = 0;
    later.length = 0;
    ripples.length = 0;
    floated = 0;
    drops = 0;
    vertices = 0;
    inkDirty = true;
  }

  // ——— Patterns ———

  function lambda() {
    return 11 - (settings.bath / 100) * 7.5;
  }

  function stepScript(dt: number) {
    let budget = dt;
    while (script && budget > 0) {
      if (script.wait > 0) {
        const used = Math.min(script.wait, budget);
        script.wait -= used;
        budget -= used;
        continue;
      }
      const step = script.steps[script.index];
      if (!step) {
        script = null;
        break;
      }
      if (step.kind === "wait") {
        script.wait = step.seconds;
        script.index++;
      } else if (step.kind === "drop") {
        float(step.x, step.y, step.r, step.ink % settings.inks.length);
        script.wait = step.wait;
        script.index++;
      } else {
        // Along the stroke at its speed, leg by leg, until the time runs out or it ends.
        const reach = step.reach ?? lambda();
        const comb =
          step.tool === "comb"
            ? {
                ...(script.comb ?? combFacing(step.points[0], step.points[1])),
                spacing: step.spacing ?? settings.tines,
              }
            : null;
        script.comb = comb;
        let distance = step.speed * budget;
        budget = 0;
        while (distance > 0 && script.leg < step.points.length - 1) {
          const a = step.points[script.leg];
          const b = step.points[script.leg + 1];
          const length = Math.hypot(b.x - a.x, b.y - a.y);
          const from = script.along;
          const to = Math.min(length, from + distance);
          const at = (s: number) => ({
            x: a.x + ((b.x - a.x) * s) / (length || 1),
            y: a.y + ((b.y - a.y) * s) / (length || 1),
          });
          dragAlong(at(from), at(to), reach, comb);
          script.tool = at(to);
          distance -= to - from;
          script.along = to;
          // Short of the leg's end, the frame's distance is spent.
          if (to < length - 1e-6) break;
          script.leg++;
          script.along = 0;
        }
        if (script.leg >= step.points.length - 1) {
          // Time left over carries on into the next step.
          budget = distance / step.speed;
          script.index++;
          script.leg = 0;
          script.along = 0;
          script.comb = null;
          script.tool = null;
        }
      }
    }
  }

  // A comb is held across the way it's pulled, squared up if it's nearly along the bath.
  function combFacing(a: Point, b: Point) {
    let angle = Math.atan2(b.y - a.y, b.x - a.x);
    const square = Math.round(angle / (Math.PI / 2)) * (Math.PI / 2);
    if (Math.abs(angle - square) < 0.21) angle = square;
    return { nx: -Math.sin(angle), ny: Math.cos(angle) };
  }

  function play(id: PatternId) {
    if (phase !== "bath" && phase !== "print") return;
    phase = "bath";
    clearBath();
    hands.clear();
    script = {
      id,
      steps: buildPattern(id, settings.inks),
      index: 0,
      wait: 0,
      leg: 0,
      along: 0,
      comb: null,
      tool: null,
    };
    if (reduceMotion.matches) {
      // No animation: the whole pattern, made at once.
      while (script) {
        stepScript(0.05);
        settle();
      }
    }
    start();
  }

  // ——— Paper ———

  const sheet = () => ({
    x: ox + PAPER_X * scale,
    y: oy + PAPER_Y * scale,
    w: PAPER_W * scale,
    h: PAPER_H * scale,
  });

  function setPhase(next: Phase) {
    phase = next;
    phaseAt = clock;
    start();
  }

  function layPaper() {
    if (phase !== "bath") return;
    script = null;
    hands.clear();
    // Laid from one end, as a marbler does, air still gets caught now and then.
    const roll = Math.random();
    const count = roll < 0.3 ? 0 : roll < 0.68 ? 1 : roll < 0.92 ? 2 : 3;
    bubbles = Array.from({ length: count }, () => ({
      x: PAPER_X + 40 + Math.random() * (PAPER_W - 80),
      y: PAPER_Y + 50 + Math.random() * (PAPER_H - 100),
      r: 6 + Math.random() * 6,
      popped: null,
    }));
    setPhase(reduceMotion.matches ? "laid" : "laying");
  }

  function liftPaper() {
    if (phase !== "laid") return;
    bubbles = bubbles.filter((bubble) => bubble.popped === null);
    renderPrint();
    prints++;
    // Nearly all of the colour comes away with the paper.
    setStrengths(0.1);
    floated *= 0.1;
    setPhase(reduceMotion.matches ? "print" : "lifting");
  }

  function tapPaper(at: Point) {
    for (const bubble of bubbles) {
      if (
        bubble.popped === null &&
        Math.hypot(at.x - bubble.x, at.y - bubble.y) < bubble.r + 16
      ) {
        bubble.popped = clock;
      }
    }
    start();
  }

  // The print: the paper's own colour, the inks laid on it back to front, the hollows where air
  // kept the paper off the bath, and the paper's tooth over it all.
  function renderPrint() {
    const k = PRINT_SCALE;
    printCanvas.width = Math.round(PAPER_W * k);
    printCanvas.height = Math.round(PAPER_H * k);
    const p = printCtx;
    p.setTransform(1, 0, 0, 1, 0, 0);
    p.globalCompositeOperation = "source-over";
    p.globalAlpha = 1;
    p.fillStyle = css(PAPER_RGB);
    p.fillRect(0, 0, printCanvas.width, printCanvas.height);

    p.setTransform(-k, 0, 0, k, (PAPER_X + PAPER_W) * k, -PAPER_Y * k);
    for (const blob of blobs) {
      blob.path ??= outline(blob);
      p.fillStyle = blob.clear
        ? css(PAPER_RGB)
        : css(mix(PAPER_RGB, blob.rgb, 0.95 * Math.min(1, blob.strength)));
      p.fill(blob.path);
    }
    for (const bubble of bubbles) {
      const ring = p.createRadialGradient(
        bubble.x,
        bubble.y,
        0,
        bubble.x,
        bubble.y,
        bubble.r * 1.25,
      );
      ring.addColorStop(0, css(PAPER_RGB));
      ring.addColorStop(0.72, css(PAPER_RGB));
      ring.addColorStop(0.86, css(mix(PAPER_RGB, [60, 50, 40], 0.18)));
      ring.addColorStop(1, css(PAPER_RGB, 0));
      p.fillStyle = ring;
      p.beginPath();
      p.arc(bubble.x, bubble.y, bubble.r * 1.25, 0, TAU);
      p.fill();
    }

    // The paper takes a little less colour in places, where it met the bath less firmly.
    p.setTransform(1, 0, 0, 1, 0, 0);
    const random = seeded(prints + 3);
    for (let i = 0; i < 7; i++) {
      const x = random() * printCanvas.width;
      const y = random() * printCanvas.height;
      const r = (90 + random() * 220) * (k / 2.6);
      const soft = p.createRadialGradient(x, y, 0, x, y, r);
      soft.addColorStop(0, css(PAPER_RGB, 0.07 + random() * 0.06));
      soft.addColorStop(1, css(PAPER_RGB, 0));
      p.fillStyle = soft;
      p.fillRect(x - r, y - r, r * 2, r * 2);
    }
    const tooth = p.createPattern(paperTexture, "repeat");
    if (tooth) {
      p.globalCompositeOperation = "multiply";
      p.globalAlpha = 0.55;
      p.fillStyle = tooth;
      p.fillRect(0, 0, printCanvas.width, printCanvas.height);
      p.globalAlpha = 1;
      p.globalCompositeOperation = "source-over";
    }
  }

  // ——— Drawing ———

  function outline(blob: Film) {
    const path = new Path2D();
    const { xs, ys, n } = blob;
    path.moveTo(xs[0], ys[0]);
    for (let i = 1; i < n; i++) path.lineTo(xs[i], ys[i]);
    path.closePath();
    return path;
  }

  function renderInk() {
    const c = inkCtx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, inkCanvas.width, inkCanvas.height);
    const k = inkCanvas.width / BATH_W;
    c.setTransform(k, 0, 0, k, 0, 0);
    c.lineJoin = "round";
    c.lineWidth = 0.7 / scale;
    // The darker rim a drop of ink keeps, which also costs a second pass, so it goes on a very
    // busy bath.
    const edges = vertices < 220_000;
    for (const blob of blobs) {
      if (
        blob.maxX < 0 ||
        blob.minX > BATH_W ||
        blob.maxY < 0 ||
        blob.minY > BATH_H
      ) {
        continue;
      }
      blob.path ??= outline(blob);
      c.fillStyle = blob.fill;
      c.fill(blob.path);
      if (edges && !blob.clear && blob.strength > 0.5) {
        c.strokeStyle = blob.edge;
        c.stroke(blob.path);
      }
    }
    inkDirty = false;
  }

  function drawInk(alpha = 1) {
    ctx.globalAlpha = alpha;
    ctx.drawImage(inkCanvas, ox, oy, BATH_W * scale, BATH_H * scale);
    ctx.globalAlpha = 1;
  }

  // A marbler's awl, held like a pen: the shaft leans back towards the hand, and its shadow
  // meets the tip only when the tip is in the bath.
  function drawStylus(x: number, y: number, dipped: boolean) {
    const tip = dipped ? 0 : 10;
    const fall = 0.45;
    const hx = x + 26;
    const hy = y + 46;
    const sx = (z: number) => z * fall;
    ctx.save();
    ctx.lineCap = "round";
    ctx.strokeStyle = `rgb(30 20 10 / ${dipped ? 0.24 : 0.16})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + sx(tip), y + sx(tip));
    ctx.lineTo(x + 12 + sx(tip + 26), y + 21 + sx(tip + 26));
    ctx.stroke();
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(x + 12 + sx(tip + 26), y + 21 + sx(tip + 26));
    ctx.lineTo(hx + sx(tip + 60), hy + sx(tip + 60));
    ctx.stroke();

    ctx.strokeStyle = "#9aa1a8";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 12, y + 21);
    ctx.stroke();
    ctx.strokeStyle = "#7d5133";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(x + 12, y + 21);
    ctx.lineTo(hx, hy);
    ctx.stroke();
    ctx.strokeStyle = "rgb(255 220 180 / 0.35)";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(x + 11, y + 22.5);
    ctx.lineTo(hx - 1.5, hy + 0.5);
    ctx.stroke();
    if (dipped) {
      ctx.strokeStyle = "rgb(255 255 255 / 0.6)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, TAU);
      ctx.stroke();
    }
    ctx.fillStyle = "#5c6168";
    ctx.beginPath();
    ctx.arc(x, y, 1.2, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  // A comb: a wooden bar across the bath with a row of pins, leaning back from the way it's
  // pulled so the pins show in front of it.
  function drawComb(
    x: number,
    y: number,
    nx: number,
    ny: number,
    spacing: number,
    dipped: boolean,
  ) {
    const mx = ny;
    const my = -nx;
    const lift = dipped ? 0 : 10;
    const fall = 0.45;
    const span = Math.hypot(BATH_W, BATH_H) * scale;
    const pins = Math.ceil(span / spacing);
    const back = 8;
    const bx = x - mx * back;
    const by = y - my * back;
    ctx.save();
    ctx.beginPath();
    ctx.rect(
      ox - RIM * scale,
      oy - RIM * scale,
      (BATH_W + RIM * 2) * scale,
      (BATH_H + RIM * 2) * scale,
    );
    ctx.clip();
    ctx.lineCap = "round";

    const shadow = (lift + 16) * fall;
    ctx.strokeStyle = "rgb(30 20 10 / 0.18)";
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(bx - nx * span + shadow, by - ny * span + shadow);
    ctx.lineTo(bx + nx * span + shadow, by + ny * span + shadow);
    ctx.stroke();
    ctx.lineWidth = 1;
    ctx.strokeStyle = `rgb(30 20 10 / ${dipped ? 0.22 : 0.14})`;
    ctx.beginPath();
    for (let i = -pins; i <= pins; i++) {
      const px = x + nx * i * spacing;
      const py = y + ny * i * spacing;
      ctx.moveTo(px + lift * fall, py + lift * fall);
      ctx.lineTo(px - mx * back + shadow, py - my * back + shadow);
    }
    ctx.stroke();

    ctx.strokeStyle = "#9aa1a8";
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    for (let i = -pins; i <= pins; i++) {
      const px = x + nx * i * spacing;
      const py = y + ny * i * spacing;
      ctx.moveTo(px, py);
      ctx.lineTo(px - mx * back, py - my * back);
    }
    ctx.stroke();
    ctx.strokeStyle = "#7d5133";
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(bx - nx * span, by - ny * span);
    ctx.lineTo(bx + nx * span, by + ny * span);
    ctx.stroke();
    ctx.strokeStyle = "rgb(255 220 180 / 0.3)";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(bx - nx * span - mx * 2, by - ny * span - my * 2);
    ctx.lineTo(bx + nx * span - mx * 2, by + ny * span - my * 2);
    ctx.stroke();
    ctx.restore();
  }

  function drawTools() {
    if (phase !== "bath") return;
    const toScreen = (p: Point) => ({
      x: ox + p.x * scale,
      y: oy + p.y * scale,
    });
    if (script?.tool) {
      const step = script.steps[script.index];
      const at = toScreen(script.tool);
      if (step?.kind === "stroke" && step.tool === "comb" && script.comb) {
        drawComb(
          at.x,
          at.y,
          script.comb.nx,
          script.comb.ny,
          (step.spacing ?? settings.tines) * scale,
          true,
        );
      } else {
        drawStylus(at.x, at.y, true);
      }
      return;
    }
    let shown = false;
    for (const hand of hands.values()) {
      const at = toScreen(hand.at);
      if (hand.tool === "stylus") {
        drawStylus(at.x, at.y, true);
        shown = true;
      } else if (hand.tool === "comb") {
        const facing = hand.comb ?? { nx: 1, ny: 0 };
        drawComb(
          at.x,
          at.y,
          facing.nx,
          facing.ny,
          settings.tines * scale,
          true,
        );
        shown = true;
      }
    }
    if (shown || !hover) return;
    const at = toScreen(hover);
    if (settings.tool === "stylus") drawStylus(at.x, at.y, false);
    if (settings.tool === "comb")
      drawComb(at.x, at.y, 1, 0, settings.tines * scale, false);
  }

  function drawRipples() {
    if (!ripples.length) return;
    ctx.save();
    ctx.beginPath();
    ctx.rect(ox, oy, BATH_W * scale, BATH_H * scale);
    ctx.clip();
    for (const ripple of ripples) {
      const life = ripple.age / 0.7;
      const r = (3 + ripple.age * 150) * scale;
      const alpha = 0.32 * (1 - life) ** 2;
      const x = ox + ripple.x * scale;
      const y = oy + ripple.y * scale;
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = `rgb(255 255 255 / ${alpha})`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.stroke();
      ctx.strokeStyle = `rgb(40 30 20 / ${alpha * 0.45})`;
      ctx.beginPath();
      ctx.arc(x, y, Math.max(0, r - 1.6), 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
  }

  // The back of the sheet, seen from above while it lies on the bath: the colours show through
  // as it soaks, except where air keeps it dry. The part not yet laid (or already lifted) is held
  // up in the air, foreshortened and casting a shadow on the bath.
  function drawPaper() {
    const { x: X, y: Y, w: W, h: H } = sheet();
    const progress = easeInOut(clamp((clock - phaseAt) / 1.1, 0, 1));
    let top = Y;
    let bottom = Y + H;
    let raised = 0;
    let edge = Y + H;
    let up = 1;
    if (phase === "laying") {
      bottom = Y + H * progress;
      raised = H * (1 - progress);
      edge = bottom;
    } else if (phase === "lifting") {
      top = Y + H * progress;
      raised = H * progress;
      edge = top;
      up = -1;
    }
    const soak =
      phase === "laying"
        ? 0.2
        : phase === "laid"
          ? 0.2 + 0.22 * clamp((clock - phaseAt) / 1.6, 0, 1)
          : 0.42;
    const paper = css(PAPER_RGB);

    if (bottom > top + 0.5) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(X, top, W, bottom - top);
      ctx.clip();
      ctx.fillStyle = paper;
      ctx.fillRect(X, top, W, bottom - top);
      ctx.globalCompositeOperation = "multiply";
      if (phase === "lifting") {
        // The colour has left the bath by now, so what shows through is the print itself,
        // turned back the right way round.
        ctx.globalAlpha = soak;
        ctx.save();
        ctx.translate(X + W, Y);
        ctx.scale(-1, 1);
        ctx.drawImage(printCanvas, 0, 0, W, H);
        ctx.restore();
        ctx.globalAlpha = 1;
      } else {
        drawInk(soak);
      }
      ctx.globalCompositeOperation = "source-over";
      for (const bubble of bubbles) {
        const pop =
          bubble.popped === null ? 1 : 1 - (clock - bubble.popped) / 0.22;
        if (pop <= 0) continue;
        const bx = ox + bubble.x * scale;
        const by = oy + bubble.y * scale;
        const r = bubble.r * scale * (0.6 + 0.4 * pop);
        ctx.globalAlpha = pop;
        ctx.fillStyle = paper;
        ctx.beginPath();
        ctx.arc(bx, by, r, 0, TAU);
        ctx.fill();
        const dome = ctx.createRadialGradient(
          bx - r * 0.35,
          by - r * 0.35,
          0,
          bx,
          by,
          r * 1.15,
        );
        dome.addColorStop(0, "rgb(255 255 255 / 0.85)");
        dome.addColorStop(0.55, "rgb(255 255 255 / 0)");
        dome.addColorStop(0.85, "rgb(80 60 40 / 0.1)");
        dome.addColorStop(1, "rgb(80 60 40 / 0)");
        ctx.fillStyle = dome;
        ctx.beginPath();
        ctx.arc(bx, by, r * 1.15, 0, TAU);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      if (paperPattern) {
        ctx.globalCompositeOperation = "multiply";
        ctx.globalAlpha = 0.35;
        ctx.fillStyle = paperPattern;
        ctx.fillRect(X, top, W, bottom - top);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = "source-over";
      }
      ctx.restore();
      ctx.strokeStyle = "rgb(60 45 30 / 0.22)";
      ctx.lineWidth = 1;
      ctx.strokeRect(X + 0.5, top + 0.5, W - 1, bottom - top - 1);
    }

    if (raised > 0.5) {
      const span = raised * 0.5;
      const flare = (W * 0.07 * raised) / H;
      const far = edge + up * span;
      const shadow = ctx.createLinearGradient(
        0,
        edge,
        0,
        edge + up * (span + 34),
      );
      shadow.addColorStop(0, "rgb(30 20 10 / 0.3)");
      shadow.addColorStop(1, "rgb(30 20 10 / 0)");
      ctx.fillStyle = shadow;
      ctx.fillRect(
        X - 6,
        Math.min(edge, edge + up * (span + 34)),
        W + 12,
        span + 34,
      );
      const face = ctx.createLinearGradient(0, edge, 0, far);
      face.addColorStop(0, "#fbf8f1");
      face.addColorStop(0.18, "#f1ebde");
      face.addColorStop(1, "#ddd5c6");
      ctx.fillStyle = face;
      ctx.beginPath();
      ctx.moveTo(X, edge);
      ctx.lineTo(X + W, edge);
      ctx.lineTo(X + W + flare, far);
      ctx.lineTo(X - flare, far);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "rgb(255 255 255 / 0.9)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(X, edge);
      ctx.lineTo(X + W, edge);
      ctx.stroke();
    }
  }

  // A strip of newsprint drawn down the bath, taking the floating colour with it.
  function skimLine() {
    return -30 + clamp((clock - phaseAt) / 1.2, 0, 1) * (BATH_H + 60);
  }

  function drawSkimmer() {
    const line = oy + skimLine() * scale;
    const band = 22 * scale;
    const X = ox - RIM * scale * 0.5;
    const W = (BATH_W + RIM) * scale;
    ctx.save();
    ctx.fillStyle = "rgb(30 20 10 / 0.18)";
    ctx.fillRect(X + 4, line - band + 6, W, band);
    ctx.fillStyle = "#e4dfd3";
    ctx.fillRect(X, line - band, W, band);
    // Columns of type, too small to read.
    ctx.fillStyle = "rgb(60 56 50 / 0.3)";
    const random = seeded(5);
    for (let row = line - band + 3; row < line - 3; row += 3.2) {
      let x = X + 6;
      while (x < X + W - 6) {
        const word = 4 + random() * 16;
        ctx.fillRect(x, row, Math.min(word, X + W - 6 - x), 1.1);
        x += word + 2.5;
      }
    }
    // The leading edge, soaked in what it has gathered.
    ctx.beginPath();
    ctx.rect(X, line - band * 0.45, W, band * 0.45);
    ctx.clip();
    ctx.globalCompositeOperation = "multiply";
    ctx.globalAlpha = 0.85;
    ctx.drawImage(
      inkCanvas,
      0,
      clamp((skimLine() / BATH_H) * inkCanvas.height, 0, inkCanvas.height - 2),
      inkCanvas.width,
      2,
      ox,
      line - band * 0.45,
      BATH_W * scale,
      band * 0.45,
    );
    ctx.restore();
  }

  function drawPrint() {
    const margin = clamp(Math.min(width, height) * 0.06, 14, 40);
    const fit = Math.min(
      (width - margin * 2) / PAPER_W,
      (height - margin * 2) / PAPER_H,
    );
    const W = PAPER_W * fit;
    const H = PAPER_H * fit;
    const settled = reduceMotion.matches
      ? 1
      : easeInOut(clamp((clock - phaseAt) / 0.6, 0, 1));
    ctx.save();
    ctx.translate(width / 2, height / 2 + (1 - settled) * 26);
    ctx.rotate(-0.012 * settled);
    ctx.scale(0.96 + 0.04 * settled, 0.96 + 0.04 * settled);
    ctx.shadowColor = "rgb(0 0 0 / 0.26)";
    ctx.shadowBlur = 24 * dpr;
    ctx.shadowOffsetY = 9 * dpr;
    ctx.drawImage(printCanvas, -W / 2, -H / 2, W, H);
    ctx.shadowColor = "transparent";
    // Fresh off the bath the sheet is wet and glossy; the shine dries off it.
    const wet = reduceMotion.matches
      ? 0
      : clamp(1 - (clock - phaseAt - 0.4) / 3.2, 0, 1);
    if (wet > 0) {
      const gloss = ctx.createLinearGradient(-W / 2, -H / 2, W / 2, H / 2);
      gloss.addColorStop(0, `rgb(255 255 255 / ${0.05 * wet})`);
      gloss.addColorStop(0.32, `rgb(255 255 255 / ${0.28 * wet})`);
      gloss.addColorStop(0.42, `rgb(255 255 255 / ${0.04 * wet})`);
      gloss.addColorStop(1, `rgb(255 255 255 / ${0.12 * wet})`);
      ctx.fillStyle = gloss;
      ctx.fillRect(-W / 2, -H / 2, W, H);
    }
    ctx.restore();
  }

  function draw() {
    if (inkDirty) renderInk();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (phase === "print") {
      drawPrint();
      return;
    }
    ctx.drawImage(trayCanvas, 0, 0, width, height);
    ctx.save();
    ctx.beginPath();
    if (phase === "skimming") {
      const line = skimLine();
      ctx.rect(
        ox,
        oy + Math.max(0, line) * scale,
        BATH_W * scale,
        (BATH_H - Math.max(0, line)) * scale,
      );
    } else {
      ctx.rect(ox, oy, BATH_W * scale, BATH_H * scale);
    }
    ctx.clip();
    drawInk();
    ctx.restore();
    drawRipples();
    ctx.drawImage(sheenCanvas, ox, oy, BATH_W * scale, BATH_H * scale);
    if (phase === "laying" || phase === "laid" || phase === "lifting") {
      drawPaper();
    }
    if (phase === "skimming") drawSkimmer();
    drawTools();
  }

  // ——— The loop ———

  let reported = "";
  function report() {
    const state: MarblingState = {
      phase,
      drops,
      covered: Math.round(covered() * 100),
      prints,
      bubbles: bubbles.filter((bubble) => bubble.popped === null).length,
      playing: script?.id ?? null,
    };
    const key = JSON.stringify(state);
    if (key === reported) return;
    reported = key;
    onState?.(state);
  }

  function step(dt: number) {
    clock += dt;
    stepScript(dt);

    for (let i = later.length - 1; i >= 0; i--) {
      if (later[i].at <= clock) {
        const { run } = later[i];
        later.splice(i, 1);
        run();
      }
    }

    // Holding the brush still lets drop after drop fall in the same place.
    for (const hand of hands.values()) {
      if (hand.tool !== "drop" || clock < hand.nextDrop) continue;
      hand.nextDrop = clock + 0.3;
      float(
        hand.at.x,
        hand.at.y,
        DROP_R,
        settings.cycle ? nextInk() : hand.ink,
      );
    }

    for (let i = spreads.length - 1; i >= 0; i--) {
      const spread = spreads[i];
      spread.t += dt;
      const k = Math.min(1, spread.t / spread.duration);
      const seed = SEED_R * SEED_R;
      const target = seed + (spread.full - seed) * (1 - (1 - k) ** 3);
      if (target > spread.r2) pushOut(spread.x, spread.y, target - spread.r2);
      spread.r2 = target;
      if (k >= 1) spreads.splice(i, 1);
    }
    settle();

    for (let i = ripples.length - 1; i >= 0; i--) {
      ripples[i].age += dt;
      if (ripples[i].age > 0.7) ripples.splice(i, 1);
    }

    const elapsed = clock - phaseAt;
    if (phase === "laying" && elapsed > 1.1) setPhase("laid");
    if (phase === "lifting" && elapsed > 1.1) setPhase("print");
    if (phase === "skimming" && elapsed > 1.2) {
      clearBath();
      setPhase("bath");
    }
    if (bubbles.some((b) => b.popped !== null && clock - b.popped > 0.22)) {
      bubbles = bubbles.filter(
        (b) => b.popped === null || clock - b.popped <= 0.22,
      );
    }
  }

  function busy() {
    const elapsed = clock - phaseAt;
    return (
      script !== null ||
      spreads.length > 0 ||
      later.length > 0 ||
      ripples.length > 0 ||
      [...hands.values()].some((hand) => hand.tool === "drop") ||
      phase === "laying" ||
      phase === "lifting" ||
      phase === "skimming" ||
      (phase === "laid" && elapsed < 1.7) ||
      (phase === "print" && elapsed < 3.8) ||
      bubbles.some((b) => b.popped !== null)
    );
  }

  function tick(now: number) {
    // A long gap (a hidden tab, a busy main thread) resumes rather than leaps.
    const dt = Math.min((now - last) / 1000, 1 / 30);
    last = now;
    step(dt);
    draw();
    report();
    if (busy()) {
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

  // ——— Hands on the bath ———

  function toBath(x: number, y: number): Point {
    return { x: (x - ox) / scale, y: (y - oy) / scale };
  }

  function inBath(p: Point, slack = 6) {
    return (
      p.x > -slack &&
      p.x < BATH_W + slack &&
      p.y > -slack &&
      p.y < BATH_H + slack
    );
  }

  resize();
  report();

  return {
    setSettings(next: MarblingSettings) {
      settings = next;
      currentInk = clamp(next.ink, 0, Math.max(0, next.inks.length - 1));
      if (hover) start();
    },
    // A pointer coming down on the stage, in CSS pixels from its top left. Returns whether the
    // bath took it.
    press(id: number, x: number, y: number) {
      const at = toBath(x, y);
      if (phase === "laid") {
        tapPaper(at);
        return true;
      }
      if (phase !== "bath" || !inBath(at)) return false;
      script = null;
      const tool = settings.tool;
      const ink =
        tool === "drop" || tool === "spatter" ? nextInk() : currentInk;
      hands.set(id, {
        tool,
        start: at,
        last: at,
        at,
        ink,
        comb: null,
        nextDrop: clock + 0.45,
        travelled: 0,
      });
      if (tool === "drop") float(at.x, at.y, DROP_R, ink);
      if (tool === "spatter") flick(at, ink, 1);
      start();
      return true;
    },
    move(id: number, x: number, y: number) {
      const at = toBath(x, y);
      const hand = hands.get(id);
      hover = at;
      if (!hand) {
        if (settings.tool === "stylus" || settings.tool === "comb") start();
        return;
      }
      const from = hand.last;
      hand.at = at;
      if (hand.tool === "stylus") {
        dragAlong(from, at, lambda(), null);
        hand.last = at;
      } else if (hand.tool === "comb") {
        if (!hand.comb) {
          if (Math.hypot(at.x - hand.start.x, at.y - hand.start.y) < 4) return;
          hand.comb = combFacing(hand.start, at);
        }
        dragAlong(from, at, lambda(), {
          ...hand.comb,
          spacing: settings.tines,
        });
        hand.last = at;
      } else if (hand.tool === "spatter") {
        hand.travelled += Math.hypot(at.x - from.x, at.y - from.y);
        hand.last = at;
        while (hand.travelled > 28) {
          hand.travelled -= 28;
          flick(at, hand.ink, 0.45);
        }
      }
      start();
    },
    release(id: number) {
      if (hands.delete(id)) start();
    },
    leave() {
      hover = null;
      start();
    },
    // A few drops in the middle of the bath to say hello, each pushing the last into a ring.
    welcome() {
      const count = settings.inks.length;
      for (let i = 0; i < 7; i++) {
        later.push({
          at: clock + 0.35 + i * 0.26,
          run: () => float(BATH_W / 2, BATH_H * 0.45, 22, i % count),
        });
      }
      start();
    },
    play,
    stop() {
      script = null;
      start();
    },
    layPaper,
    liftPaper,
    backToBath() {
      if (phase !== "print") return;
      setPhase("bath");
    },
    skim() {
      if (phase !== "bath") return;
      script = null;
      hands.clear();
      if (reduceMotion.matches) {
        clearBath();
        setPhase("bath");
      } else {
        setPhase("skimming");
      }
    },
    // The last print, as a PNG.
    printBlob() {
      return new Promise<Blob | null>((resolve) =>
        printCanvas.toBlob(resolve, "image/png"),
      );
    },
    dispose() {
      cancelAnimationFrame(frame);
      running = false;
      observer.disconnect();
    },
  };
}

export type Marbling = ReturnType<typeof createMarbling>;
