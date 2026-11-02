// Embossing tape is a strip of glossy vinyl about a quarter of a millimetre thick, on a paper
// backing. There is no ink anywhere. The punch pushes each letter up into a die, and the plastic
// that has to stretch over the shoulders of the letter goes past its yield point and opens up
// with crazes: millions of tiny voids that scatter light, the same white you see when you bend a
// bottle top. So the white is a record of strain. A firm squeeze stretches the whole letter and
// it comes out solid white; a light one only yields the plastic where it bends hardest and where
// the film happens to be weakest, so the letter comes out patchy and outlined. Metal tape can't
// craze at all, so an aluminium letter is only a shape that catches the light.
//
// Warmed past its glass transition the vinyl gets its own back: the crazes close and the white
// goes first, then the stretched film slowly pulls the letters back down towards flat.
//
// Each length of tape is two fields at RES pixels a millimetre: how high the face stands, in
// millimetres, and how white it has gone. Shading those makes the picture, lit by a light that
// stays put in the room however the label lies.

export type TapeKind =
  | "red"
  | "black"
  | "blue"
  | "green"
  | "clear"
  | "aluminium";

export const RES = 12;
export const TAPE_WIDTH = 9.5;
export const HALF = TAPE_WIDTH / 2;
export const ROWS = Math.round(TAPE_WIDTH * RES);
// One letter's worth of tape. Every character gets the same, an I as much as a W.
export const PITCH = 3.8;
export const CAP = 4.4;

type Look = {
  // Linear colour of the vinyl, and how opaque it is.
  rgb: [number, number, number];
  alpha: number;
  whitens: boolean;
  metal: boolean;
  // How high a full squeeze raises a letter, in millimetres.
  depth: number;
  // Highlight sharpness and strength.
  shine: number;
  gloss: number;
};

const linear = (hex: string): [number, number, number] => {
  const n = Number.parseInt(hex.slice(1), 16);
  const c = (v: number) => {
    const x = v / 255;
    return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  };
  return [c((n >> 16) & 255), c((n >> 8) & 255), c(n & 255)];
};

export const TAPES: Record<TapeKind, Look> = {
  red: {
    rgb: linear("#c3222c"),
    alpha: 1,
    whitens: true,
    metal: false,
    depth: 0.36,
    shine: 70,
    gloss: 0.55,
  },
  black: {
    rgb: linear("#1a1b1e"),
    alpha: 1,
    whitens: true,
    metal: false,
    depth: 0.36,
    shine: 70,
    gloss: 0.6,
  },
  blue: {
    rgb: linear("#1d4c9e"),
    alpha: 1,
    whitens: true,
    metal: false,
    depth: 0.36,
    shine: 70,
    gloss: 0.55,
  },
  green: {
    rgb: linear("#1b6b40"),
    alpha: 1,
    whitens: true,
    metal: false,
    depth: 0.36,
    shine: 70,
    gloss: 0.55,
  },
  clear: {
    rgb: linear("#e6edf2"),
    alpha: 0.14,
    whitens: true,
    metal: false,
    depth: 0.34,
    shine: 90,
    gloss: 0.7,
  },
  aluminium: {
    rgb: linear("#b9bcbf"),
    alpha: 1,
    whitens: false,
    metal: true,
    depth: 0.22,
    shine: 16,
    gloss: 0.5,
  },
};

export const SWATCHES: Record<TapeKind, string> = {
  red: "#c3222c",
  black: "#1a1b1e",
  blue: "#1d4c9e",
  green: "#1b6b40",
  clear: "#dfe8ee",
  aluminium: "#b9bcbf",
};

export type Light = {
  // Unit vector towards the light, in room coordinates (x right, y down the screen, z up).
  x: number;
  y: number;
  z: number;
  ambient: number;
};

export type Piece = {
  kind: TapeKind;
  cols: number;
  // Columns in use, from the left end.
  used: number;
  // Where column 0 sat on the reel, so the film's weak spots stay put when tape is cut.
  origin: number;
  height: Float32Array;
  white: Float32Array;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  image: ImageData;
  // The angle the picture was lit for.
  angle: number;
};

const clamp = (v: number, lo: number, hi: number) =>
  v < lo ? lo : v > hi ? hi : v;
const smoothstep = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

function hash(x: number, y: number) {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
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

// How readily the film yields at a spot: patches a third of a millimetre across, plus speckle.
function weakness(col: number, row: number) {
  return 0.6 * valueNoise(col / 4, row / 4) + 0.4 * hash(col, row);
}

const ENCODE = new Uint8ClampedArray(4096);
for (let i = 0; i < 4096; i++) {
  const x = i / 4095;
  const s = x <= 0.0031308 ? x * 12.92 : 1.055 * x ** (1 / 2.4) - 0.055;
  ENCODE[i] = Math.round(s * 255);
}
const encode = (v: number) => ENCODE[(clamp(v, 0, 1) * 4095) | 0];

export function createPiece(
  kind: TapeKind,
  lengthMM: number,
  origin: number,
): Piece {
  const cols = Math.max(2, Math.ceil(lengthMM * RES));
  const canvas = document.createElement("canvas");
  canvas.width = cols;
  canvas.height = ROWS;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No 2D context for the tape");
  return {
    kind,
    cols,
    used: cols,
    origin,
    height: new Float32Array(cols * ROWS),
    white: new Float32Array(cols * ROWS),
    canvas,
    ctx,
    image: ctx.createImageData(cols, ROWS),
    angle: 0,
  };
}

// A copy of columns [from, to) as a piece of its own.
export function slicePiece(piece: Piece, from: number, to: number): Piece {
  const a = clamp(Math.round(from), 0, piece.cols);
  const b = clamp(Math.round(to), a + 2, piece.cols);
  const next = createPiece(piece.kind, (b - a) / RES, piece.origin + a);
  for (let y = 0; y < ROWS; y++) {
    const src = y * piece.cols;
    const dst = y * next.cols;
    next.height.set(piece.height.subarray(src + a, src + b), dst);
    next.white.set(piece.white.subarray(src + a, src + b), dst);
    next.image.data.set(
      piece.image.data.subarray((src + a) * 4, (src + b) * 4),
      dst * 4,
    );
  }
  next.angle = piece.angle;
  next.ctx.putImageData(next.image, 0, 0);
  return next;
}

// Columns [from, used) moved to the start of a fresh piece of the same size: the tape left in
// the head after a cut.
export function remainder(piece: Piece, from: number): Piece {
  const a = clamp(Math.round(from), 0, piece.cols);
  const next = createPiece(piece.kind, piece.cols / RES, piece.origin + a);
  for (let y = 0; y < ROWS; y++) {
    const src = y * piece.cols;
    const dst = y * next.cols;
    next.height.set(piece.height.subarray(src + a, src + piece.cols), dst);
    next.white.set(piece.white.subarray(src + a, src + piece.cols), dst);
    next.image.data.set(
      piece.image.data.subarray((src + a) * 4, (src + piece.cols) * 4),
      dst * 4,
    );
  }
  next.angle = piece.angle;
  next.ctx.putImageData(next.image, 0, 0);
  return next;
}

// --- Glyphs ------------------------------------------------------------------------------------

let family = "sans-serif";
let capRatio = 0.7;

export function setGlyphFont(name: string, ratio: number) {
  family = name;
  capRatio = ratio;
}

// One character with its cap height `cap` pixels, centred on (x, y). The star and heart aren't in
// the typeface, so they're drawn.
export function drawGlyph(
  ctx: CanvasRenderingContext2D,
  char: string,
  x: number,
  y: number,
  cap: number,
  weight = 700,
) {
  if (char === "★") {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? cap * 0.24 : cap * 0.58;
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const px = x + Math.cos(a) * r;
      const py = y + cap * 0.04 + Math.sin(a) * r;
      if (i) ctx.lineTo(px, py);
      else ctx.moveTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    return;
  }
  if (char === "♥") {
    const w = cap * 0.52;
    const top = y - cap * 0.32;
    ctx.beginPath();
    ctx.moveTo(x, y + cap * 0.5);
    ctx.bezierCurveTo(
      x - w * 1.25,
      y - cap * 0.05,
      x - w,
      top - cap * 0.3,
      x,
      top,
    );
    ctx.bezierCurveTo(
      x + w,
      top - cap * 0.3,
      x + w * 1.25,
      y - cap * 0.05,
      x,
      y + cap * 0.5,
    );
    ctx.fill();
    return;
  }
  ctx.save();
  ctx.font = `${weight} ${cap / capRatio}px ${family}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.translate(x, y + cap / 2);
  // Embossing type is narrow, so a whole word fits a short label.
  ctx.scale(0.84, 1);
  ctx.fillText(char, 0, 0);
  ctx.restore();
}

// --- Embossing ---------------------------------------------------------------------------------

export type Stroke = { char: string; dx: number };

let scratch: CanvasRenderingContext2D | null = null;
const CELL = Math.ceil(6.6 * RES);

function blur(src: Float32Array, w: number, h: number, r: number) {
  const tmp = new Float32Array(src.length);
  const n = 2 * r + 1;
  for (let y = 0; y < h; y++) {
    let sum = 0;
    for (let x = -r; x <= r; x++) sum += src[y * w + clamp(x, 0, w - 1)];
    for (let x = 0; x < w; x++) {
      tmp[y * w + x] = sum / n;
      sum +=
        src[y * w + clamp(x + r + 1, 0, w - 1)] -
        src[y * w + clamp(x - r, 0, w - 1)];
    }
  }
  for (let x = 0; x < w; x++) {
    let sum = 0;
    for (let y = -r; y <= r; y++) sum += tmp[clamp(y, 0, h - 1) * w + x];
    for (let y = 0; y < h; y++) {
      src[y * w + x] = sum / n;
      sum +=
        tmp[clamp(y + r + 1, 0, h - 1) * w + x] -
        tmp[clamp(y - r, 0, h - 1) * w + x];
    }
  }
}

// Squeezes one cell centred `u` millimetres along the piece. `strokes` are what the punch face
// carries (one letter, or the edges of two when the wheel is between them), `strength` how far
// the handle went, 0–1. Returns the columns it changed.
export function emboss(
  piece: Piece,
  u: number,
  strokes: Stroke[],
  strength: number,
): [number, number] {
  if (!scratch) {
    const canvas = document.createElement("canvas");
    canvas.width = CELL;
    canvas.height = ROWS;
    scratch = canvas.getContext("2d", { willReadFrequently: true });
  }
  const ctx = scratch;
  if (!ctx) return [0, 0];
  const look = TAPES[piece.kind];
  ctx.clearRect(0, 0, CELL, ROWS);
  ctx.save();
  // The die only backs one cell, so whatever's outside it isn't pressed.
  const half = (PITCH / 2 + 0.15) * RES;
  ctx.beginPath();
  ctx.rect(CELL / 2 - half, 0, half * 2, ROWS);
  ctx.clip();
  ctx.fillStyle = "#fff";
  for (const stroke of strokes) {
    if (stroke.char === " ") continue;
    drawGlyph(
      ctx,
      stroke.char,
      CELL / 2 + stroke.dx * RES,
      ROWS / 2,
      CAP * RES,
    );
  }
  ctx.restore();
  const pixels = ctx.getImageData(0, 0, CELL, ROWS).data;
  const mask = new Float32Array(CELL * ROWS);
  for (let i = 0; i < mask.length; i++) mask[i] = pixels[i * 4 + 3] / 255;
  // The die rounds every edge: the face rises over a couple of tenths of a millimetre.
  blur(mask, CELL, ROWS, 2);
  blur(mask, CELL, ROWS, 2);

  const x0 = Math.round(u * RES - CELL / 2);
  const depth = look.depth * (0.2 + 0.8 * strength ** 0.8);
  for (let y = 1; y < ROWS - 1; y++) {
    for (let x = 1; x < CELL - 1; x++) {
      const px = x0 + x;
      if (px < 0 || px >= piece.cols) continue;
      const m = y * CELL + x;
      const p = mask[m];
      if (p < 0.01) continue;
      const i = y * piece.cols + px;
      const h = depth * smoothstep(0.04, 0.86, p);
      piece.height[i] =
        Math.max(piece.height[i], h) + 0.12 * Math.min(piece.height[i], h);
      if (!look.whitens) continue;
      // How much the film is stretched here: all over the letter's face, most of all where it
      // bends over the shoulders.
      const gx = (mask[m + 1] - mask[m - 1]) * RES * 0.5;
      const gy = (mask[m + CELL] - mask[m - CELL]) * RES * 0.5;
      const slope = Math.min(1.6, Math.sqrt(gx * gx + gy * gy) * 0.5);
      const strain = strength * (0.62 * smoothstep(0.2, 0.92, p) + 0.3 * slope);
      const yieldAt = 0.28 + 0.34 * weakness(piece.origin + px, y);
      const w = smoothstep(yieldAt, yieldAt + 0.16, strain);
      piece.white[i] = 1 - (1 - piece.white[i]) * (1 - w);
    }
  }
  return [Math.max(0, x0 - 1), Math.min(piece.cols, x0 + CELL + 1)];
}

// Warmth undoing the stretch over columns [from, to): `rate(col)` is how far past softening
// the vinyl is there, per second.
export function relax(
  piece: Piece,
  from: number,
  to: number,
  rate: (col: number) => number,
  dt: number,
) {
  const look = TAPES[piece.kind];
  if (look.metal) return;
  for (let x = Math.max(0, from); x < Math.min(piece.cols, to); x++) {
    const r = rate(x);
    if (r <= 0) continue;
    const fade = Math.exp(-r * 1.8 * dt);
    const sink = Math.exp(-r * 0.4 * dt);
    for (let y = 0; y < ROWS; y++) {
      const i = y * piece.cols + x;
      piece.white[i] *= fade;
      piece.height[i] *= sink;
    }
  }
}

// Where the lettering starts and ends along the piece, in millimetres, and how much relief sits
// near each end (0–1), which is what makes a stuck label's ends want to curl up.
export function relief(piece: Piece) {
  const peak = new Float32Array(piece.used);
  for (let y = 0; y < ROWS; y += 2) {
    const row = y * piece.cols;
    for (let x = 0; x < piece.used; x++) {
      const h = piece.height[row + x];
      if (h > peak[x]) peak[x] = h;
    }
  }
  let first = -1;
  let last = -1;
  for (let x = 0; x < piece.used; x++) {
    if (peak[x] > 0.03) {
      if (first < 0) first = x;
      last = x;
    }
  }
  const depth = TAPES[piece.kind].depth;
  const near = (a: number, b: number) => {
    let sum = 0;
    let n = 0;
    for (let x = Math.max(0, a); x < Math.min(piece.used, b); x++) {
      sum += peak[x];
      n++;
    }
    return n ? clamp(sum / n / depth / 0.7, 0, 1) : 0;
  };
  const span = 12 * RES;
  return {
    first: first < 0 ? null : first / RES,
    last: last < 0 ? null : (last + 1) / RES,
    ends: [near(0, span), near(piece.used - span, piece.used)] as [
      number,
      number,
    ],
  };
}

// --- Shading -----------------------------------------------------------------------------------

const WHITE: [number, number, number] = [0.8, 0.8, 0.77];

// Repaints columns [from, to) from the two fields.
export function shade(piece: Piece, from: number, to: number, light: Light) {
  const look = TAPES[piece.kind];
  const { cols, height, white, image } = piece;
  const data = image.data;
  const c0 = clamp(Math.floor(from), 0, piece.used);
  const c1 = clamp(Math.ceil(to), 0, piece.used);
  if (c1 <= c0) return;
  // The light in the piece's own frame.
  const cos = Math.cos(-piece.angle);
  const sin = Math.sin(-piece.angle);
  const lx = light.x * cos - light.y * sin;
  const ly = light.x * sin + light.y * cos;
  const lz = light.z;
  let hx = lx;
  let hy = ly;
  let hz = lz + 1;
  const hn = Math.hypot(hx, hy, hz);
  hx /= hn;
  hy /= hn;
  hz /= hn;
  const [tr, tg, tb] = look.rgb;
  const tint = 0.12;
  const wr = WHITE[0] * (1 - tint) + tr * tint;
  const wg = WHITE[1] * (1 - tint) + tg * tint;
  const wb = WHITE[2] * (1 - tint) + tb * tint;
  const amb = light.ambient;
  const end = piece.used - 1;
  for (let y = 0; y < ROWS; y++) {
    const v = (y + 0.5) / RES - HALF;
    // The tape's long edges are rolled over a little by the slitter.
    const edge = Math.abs(v) - (HALF - 0.3);
    const bevel = edge > 0 ? -Math.sign(v) * Math.min(1, edge / 0.3) * 1.2 : 0;
    const row = y * cols;
    for (let x = c0; x < c1; x++) {
      const i = row + x;
      const h = height[i];
      const gx =
        ((x < end ? height[i + 1] : h) - (x > 0 ? height[i - 1] : h)) *
          RES *
          0.5 +
        (x === 0 ? 0.5 : x === end ? -0.5 : 0);
      const gy =
        ((y < ROWS - 1 ? height[i + cols] : h) -
          (y > 0 ? height[i - cols] : h)) *
          RES *
          0.5 +
        bevel;
      const inv = 1 / Math.sqrt(gx * gx + gy * gy + 1);
      const nx = -gx * inv;
      const ny = -gy * inv;
      const nz = inv;
      const ndl = Math.max(0, nx * lx + ny * ly + nz * lz);
      const ndh = Math.max(0, nx * hx + ny * hy + nz * hz);
      const w = white[i];
      const col = piece.origin + x;
      let ar: number;
      let ag: number;
      let ab: number;
      let spec: number;
      if (look.metal) {
        // Brushed along its length: fine streaks that run with the tape.
        const streak = 0.86 + 0.24 * valueNoise(col / 70, y / 0.8);
        ar = tr * streak;
        ag = tg * streak;
        ab = tb * streak;
        spec = look.gloss * ndh ** look.shine;
      } else {
        // Extrusion lines in the film, and the crazing's own grain where it's white.
        const film = 0.975 + 0.05 * valueNoise(col / 40, y / 1.5);
        const speck = w > 0 ? 1 - 0.14 * w * hash(col * 3, y * 7) : 1;
        ar = (tr + (wr - tr) * w) * film * speck;
        ag = (tg + (wg - tg) * w) * film * speck;
        ab = (tb + (wb - tb) * w) * film * speck;
        // Crazed plastic scatters what it doesn't reflect, so white dulls the shine a little.
        spec = look.gloss * (1 - 0.45 * w) * ndh ** look.shine;
      }
      const lit = amb + (1 - amb) * ndl * 1.25;
      const o = i * 4;
      if (look.alpha < 1) {
        // Clear tape: mostly what's under it, frosted where it's crazed, and the slopes bend
        // the light enough to show as faint lines.
        const slope = 1 - nz;
        const body = look.alpha + 0.8 * w;
        const a = clamp(body + 0.9 * slope + spec, 0.01, 1);
        data[o] = encode((ar * lit * body + spec) / a);
        data[o + 1] = encode((ag * lit * body + spec) / a);
        data[o + 2] = encode((ab * lit * body + spec) / a);
        data[o + 3] = Math.round(a * 255);
      } else {
        data[o] = encode(ar * lit + spec);
        data[o + 1] = encode(ag * lit + spec);
        data[o + 2] = encode(ab * lit + spec);
        data[o + 3] = 255;
      }
    }
  }
  piece.ctx.putImageData(image, 0, 0, c0, 0, c1 - c0, ROWS);
}
