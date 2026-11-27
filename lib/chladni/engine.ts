// Chladni's figures: sand on a metal plate that rings. The plate is bolted through its middle
// and shaken in one of two ways. A driver under the bolt shakes it up and down at whatever
// frequency the signal generator is set to, and every mode answers by how close it is to
// resonance and how much of the plate moves with it. Or a bow drawn down the edge sets one mode
// singing by itself, as Chladni did it in 1787: which one depends on where the bow is, since it
// can only feed a mode that moves there, and on where fingertips rest, since a finger quiets
// every mode that moves under it. A paired mode, two shapes at the same pitch, turns so its
// nodal lines run through the finger, which is how Chladni chose his figures.
//
// What the sand feels is how hard the plate under it accelerates, in g. Below about 1 g a
// grain sits still or slides a little; above it, the grain is thrown. A grain is thrown off a
// surface that's tilting down towards the nearest node at the moment it leaves, so it lands a
// little nearer to the node, and further where the plate moves more. That drift, with the
// randomness of grains bouncing off each other, sweeps sand into the nodal lines, where the
// plate keeps still. Grains crowd there into lines of a width set by how much sand there is;
// near an edge that moves, they're thrown off on to the bench.
//
// Lycopodium powder does the opposite, as Faraday found in 1831: the spores are light enough
// that the air the plate stirs up carries them, and it circulates towards the places of most
// motion, so they gather in little heaps in the middle of each vibrating patch.

import { type Modes, type PlateShape, solveModes } from "./modes";
import {
  type Metal,
  type Placement,
  paintPlate,
  SHADOW_OFFSET,
  WASHER,
} from "./plate";

export type GrainKind = "sand" | "salt" | "spores" | "both";

export type ChladniSettings = {
  shape: PlateShape;
  metal: Metal;
  grains: GrainKind;
  // Whether the signal generator is driving the plate.
  driver: boolean;
  // In hertz.
  frequency: number;
  // 0–100, on a scale of powers, as a generator's output knob is.
  amplitude: number;
  // Where the bow sits when it's bowed from the panel: 0–1 round the edge from the top left.
  bowAt: number;
};

export type ChladniStats = {
  grains: number;
  // The pitch the plate is sounding loudest, or null when it's quiet.
  hz: number | null;
  ready: boolean;
  fingers: number;
  bowing: boolean;
};

export type Resonance = { hz: number; peak: number };

export type ChladniResponse = {
  // The most the plate accelerates anywhere, in g, with the driver at its current amplitude, at
  // RESPONSE_SAMPLES frequencies spaced evenly in pitch from MIN_HZ to MAX_HZ.
  curve: Float32Array;
  // The frequencies where it peaks high enough to move sand, lowest first.
  resonances: Resonance[];
};

// What the plate is doing that can be heard, for the sound to follow each frame.
export type PlateSound = {
  driveHz: number;
  // 0–1: the driver's own hum, and the plate ringing with it.
  driveLevel: number;
  plateLevel: number;
  bowHz: number | null;
  bowLevel: number;
  bowing: boolean;
  // 0–1: how much sand is bouncing.
  rattle: number;
};

export const MIN_HZ = 30;
export const MAX_HZ = 4000;
export const RESPONSE_SAMPLES = 240;

// The driver's acceleration in g for a setting of the amplitude knob.
export function driveG(amplitude: number) {
  return 0.003 * 500 ** (amplitude / 100);
}

// Each plate is 24 cm across. Ω becomes hertz through the metal's stiffness, density and
// thickness: 0.8 mm steel, 1 mm brass, 1.5 mm glass. Steel and glass carry sound at much the
// same speed, so the thicker glass rings higher. Damping is with sand on the plate.
const METALS: Record<
  Metal,
  { poisson: number; hzPerOmega: number; damping: number }
> = {
  steel: { poisson: 0.29, hzPerOmega: 13.46, damping: 0.0015 },
  brass: { poisson: 0.34, hzPerOmega: 11.92, damping: 0.0012 },
  glass: { poisson: 0.22, hzPerOmega: 25.96, damping: 0.002 },
};

// The plate's modes are drawn on a grid this many points across.
const GRID = 129;
const MAX_GRAINS = 30_000;
const MAX_BENCH = 40_000;
const SPRINKLE = 9000;
// A fingertip is about this wide, as a fraction of the half-width, and how much it damps a mode
// that moves under it as much as it moves anywhere.
const FINGER_RADIUS = 0.055;
const FINGER_DAMPING = 0.05;
const MAX_FINGERS = 3;
// A bow at an antinode drives the plate to about this many g, building up over a few tenths
// of a second.
const BOW_G = 30;
const BOW_RISE = 5;
// The bow speaks most readily around this Ω, and less an octave or so either side.
const BOW_SWEET = 30;
// A microphone at full voice shakes the driver this hard.
const VOICE_G = 0.2;

// Below STILL a grain stays put. Between it and CREEP, the plate's shiver lets it slide slowly
// towards the node. Above CREEP it's thrown about, further the harder the plate moves.
const STILL = 0.3;
const CREEP = 0.85;
const CREEP_SPEED = 0.0011;
const HOP = 0.0011;
const MAX_HOP = 0.02;
// Spores ride the air above this, towards where the plate moves most.
const SPORE_STILL = 0.2;
// Grains pile up to this many in a cell of the crowding grid before they spill sideways.
const CROWD = 240;
const CROWD_CAP = 3;
// Frames a grain takes to fall from the shaker.
const FALL = 14;

const TAU = Math.PI * 2;

type Point = { x: number; y: number };

// A mode as the plate rings it now: one of the solver's, or for a pair that a finger has
// turned, a blend of the two. Its shape is normalised so it peaks at 1.
type Mode = {
  hz: number;
  w: number;
  zeta: number;
  drive: number;
  scale: number;
  psi: Float32Array;
  members: number[];
  weights: number[];
};

// A mode the bow has set ringing, at its own pitch, in g at its strongest point.
type Voice = {
  hz: number;
  w: number;
  zeta: number;
  psi: Float32Array;
  g: number;
  target: number;
  key: string;
};

type Prepared = {
  modes: Modes;
  psi: Float32Array[];
  max: Float64Array;
  inside: Uint8Array;
  partner: Int32Array;
};

// Grain colours by kind: sand is mostly quartz and feldspar with the odd dark grain; salt is
// white; lycopodium is a pale sulphur yellow.
const PALETTES: [number, number, number][][] = [
  [
    [222, 198, 156],
    [205, 178, 132],
    [232, 214, 178],
    [188, 156, 112],
    [244, 236, 218],
    [150, 118, 82],
    [214, 186, 140],
    [196, 162, 116],
  ],
  [
    [246, 246, 243],
    [236, 238, 240],
    [252, 252, 252],
    [226, 229, 233],
  ],
  [
    [236, 214, 122],
    [228, 202, 104],
    [242, 226, 150],
    [222, 196, 98],
  ],
];
const SAND = 0;
const SALT = 1;
const SPORE = 2;

const yieldToPage = () => new Promise((resolve) => setTimeout(resolve, 0));

// Solved plates are kept for the page's life; there are only six.
const solved = new Map<string, Promise<Prepared>>();

function prepare(shape: PlateShape, metal: Metal) {
  const key = `${shape}:${METALS[metal].poisson}`;
  let known = solved.get(key);
  if (!known) {
    known = prepareNow(shape, metal);
    solved.set(key, known);
  }
  return known;
}

async function prepareNow(shape: PlateShape, metal: Metal): Promise<Prepared> {
  const modes = await solveModes(shape, METALS[metal].poisson);
  const inside = new Uint8Array(GRID * GRID);
  // Off a round plate, each grid point takes the value at the rim along its radius, so the
  // grid has no cliffs at the edge to mislead sand there.
  const source = new Int32Array(GRID * GRID);
  for (let row = 0; row < GRID; row++) {
    for (let col = 0; col < GRID; col++) {
      const u = -1 + (2 * col) / (GRID - 1);
      const v = -1 + (2 * row) / (GRID - 1);
      const index = row * GRID + col;
      source[index] = index;
      if (modes.inside(u, v)) {
        inside[index] = 1;
        continue;
      }
      const r = Math.hypot(u, v);
      const rim = 1 - 1.5 / (GRID - 1);
      const sc = Math.round(((u / r) * rim + 1) * ((GRID - 1) / 2));
      const sr = Math.round(((v / r) * rim + 1) * ((GRID - 1) / 2));
      source[index] = sr * GRID + sc;
    }
  }
  const psi: Float32Array[] = [];
  const max = new Float64Array(modes.count);
  for (let k = 0; k < modes.count; k++) {
    const field = modes.field(k, GRID);
    let peak = 0;
    for (let i = 0; i < field.length; i++)
      if (inside[i]) peak = Math.max(peak, Math.abs(field[i]));
    const out = new Float32Array(field.length);
    for (let i = 0; i < field.length; i++) out[i] = field[source[i]] / peak;
    psi.push(out);
    max[k] = peak;
    if (k % 12 === 11) await yieldToPage();
  }
  const partner = new Int32Array(modes.count).fill(-1);
  for (let k = 0; k + 1 < modes.count; k++) {
    if (Math.abs(modes.omega[k + 1] - modes.omega[k]) < 1e-6 * modes.omega[k]) {
      partner[k] = k + 1;
      partner[k + 1] = k;
      k++;
    }
  }
  return { modes, psi, max, inside, partner };
}

type Sprite = { size: number; half: number; variants: Float32Array[] };

// A grain's footprint at each quarter-pixel offset: how much of each pixel it covers, and how
// brightly that part of it is lit, packed as coverage then light.
function makeSprite(radius: number, form: "round" | "square" | "soft") {
  const soft = form === "soft" ? radius * 0.6 + 0.6 : 0;
  const size = Math.ceil(radius * 2 + soft * 2 + 3);
  const half = Math.floor(size / 2);
  const variants: Float32Array[] = [];
  const turn = 0.5;
  const cos = Math.cos(turn);
  const sin = Math.sin(turn);
  for (let qy = 0; qy < 4; qy++) {
    for (let qx = 0; qx < 4; qx++) {
      const data = new Float32Array(size * size * 2);
      const ox = half + (qx + 0.5) / 4;
      const oy = half + (qy + 0.5) / 4;
      for (let j = 0; j < size; j++) {
        for (let i = 0; i < size; i++) {
          const dx = i + 0.5 - ox;
          const dy = j + 0.5 - oy;
          const distance = Math.hypot(dx, dy);
          let cover: number;
          if (form === "square") {
            const rx = Math.abs(dx * cos + dy * sin);
            const ry = Math.abs(-dx * sin + dy * cos);
            cover = Math.min(
              1,
              Math.max(0, radius * 0.88 + 0.5 - Math.max(rx, ry)),
            );
          } else if (form === "soft") {
            const t = Math.min(
              1,
              Math.max(0, (radius + soft - distance) / (2 * soft)),
            );
            cover = t * t * (3 - 2 * t);
          } else {
            cover = Math.min(1, Math.max(0, radius + 0.5 - distance));
          }
          const light = Math.min(
            1.45,
            Math.max(0.55, 1 + (0.5 * (-dx - dy)) / (radius * 1.4 + 0.3)),
          );
          data[(j * size + i) * 2] = cover;
          data[(j * size + i) * 2 + 1] = light;
        }
      }
      variants.push(data);
    }
  }
  return { size, half, variants };
}

// Paints a sprite into a pixel buffer over what's there; with no colour given, it's a shadow.
function stamp(
  buffer: Uint32Array,
  width: number,
  height: number,
  sprite: Sprite,
  x: number,
  y: number,
  r: number,
  g: number,
  b: number,
  alpha: number,
  lit: boolean,
) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const variant =
    sprite.variants[
      Math.min(3, ((y - yi) * 4) | 0) * 4 + Math.min(3, ((x - xi) * 4) | 0)
    ];
  const { size, half } = sprite;
  const x0 = xi - half;
  const y0 = yi - half;
  for (let j = 0; j < size; j++) {
    const py = y0 + j;
    if (py < 0 || py >= height) continue;
    const row = py * width;
    for (let i = 0; i < size; i++) {
      const px = x0 + i;
      if (px < 0 || px >= width) continue;
      const k = (j * size + i) * 2;
      const cover = variant[k] * alpha;
      if (cover <= 0.004) continue;
      let sr = r;
      let sg = g;
      let sb = b;
      if (lit) {
        const light = variant[k + 1];
        sr = Math.min(255, r * light);
        sg = Math.min(255, g * light);
        sb = Math.min(255, b * light);
      }
      const index = row + px;
      const d = buffer[index];
      const da = d >>> 24;
      const dr = d & 255;
      const dg = (d >>> 8) & 255;
      const db = (d >>> 16) & 255;
      if (da === 255) {
        buffer[index] =
          0xff000000 |
          ((db + (sb - db) * cover) << 16) |
          ((dg + (sg - dg) * cover) << 8) |
          (dr + (sr - dr) * cover);
      } else {
        const below = (da / 255) * (1 - cover);
        const out = cover + below;
        if (out <= 0) continue;
        buffer[index] =
          (((out * 255 + 0.5) | 0) << 24) |
          (((sb * cover + db * below) / out) << 16) |
          (((sg * cover + dg * below) / out) << 8) |
          ((sr * cover + dr * below) / out);
      }
    }
  }
}

export function createChladni(
  canvas: HTMLCanvasElement,
  initial: ChladniSettings,
  {
    onStats,
    onResponse,
    onSound,
  }: {
    onStats?: (stats: ChladniStats) => void;
    onResponse?: (response: ChladniResponse) => void;
    onSound?: (sound: PlateSound) => void;
  } = {},
) {
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas 2D is not available.");
  const ctx = context;
  const plateCanvas = document.createElement("canvas");
  const plateContext = plateCanvas.getContext("2d", {
    willReadFrequently: true,
  });
  if (!plateContext) throw new Error("Canvas 2D is not available.");
  const plateCtx = plateContext;

  let settings = initial;
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");

  // The plate as solved, and its modes as they ring with the fingers where they are.
  let plate: Prepared | null = null;
  let plateKey = "";
  let modes: Mode[] = [];
  let groups: number[][] = [];
  // The driver's part: each mode's complex amplitude, in g at its strongest point.
  let driveRe = new Float64Array(0);
  let driveIm = new Float64Array(0);
  const voices: Voice[] = [];
  let speaking: Voice | null = null;
  const fingers: Point[] = [];
  let bow: { x: number; y: number; nx: number; ny: number } | null = null;
  let bowing = false;
  let bowClock = 0;
  let voice: { hz: number; level: number } | null = null;

  // How hard the plate accelerates over the grid, in g.
  const gammaRe = new Float32Array(GRID * GRID);
  const gammaIm = new Float32Array(GRID * GRID);
  const gamma = new Float32Array(GRID * GRID);
  // The slope of its square, which runs smoothly through zero on a nodal line, so grains
  // steered by it find the line itself rather than the nearest grid point.
  const slopeX = new Float32Array(GRID * GRID);
  const slopeY = new Float32Array(GRID * GRID);
  let peakGamma = 0;

  // Grains on the plate, in plate units from −1 to 1. Hop is how high a grain is in the air
  // this frame, 0–1; fall counts down the frames until a poured grain lands.
  const gx = new Float32Array(MAX_GRAINS);
  const gy = new Float32Array(MAX_GRAINS);
  const hop = new Float32Array(MAX_GRAINS);
  const fall = new Float32Array(MAX_GRAINS);
  const kind = new Uint8Array(MAX_GRAINS);
  const tone = new Uint8Array(MAX_GRAINS);
  const felt = new Float32Array(MAX_GRAINS);
  const cell = new Int32Array(MAX_GRAINS);
  let grains = 0;
  let falling = 0;
  // Grains thrown off on to the bench, which lie where they land.
  const bx = new Float32Array(MAX_BENCH);
  const by = new Float32Array(MAX_BENCH);
  const bkind = new Uint8Array(MAX_BENCH);
  const btone = new Uint8Array(MAX_BENCH);
  let benched = 0;
  const crowd = new Uint16Array(CROWD * CROWD);
  let rattle = 0;

  let width = 0;
  let height = 0;
  let cssWidth = 0;
  let cssHeight = 0;
  let dpr = 1;
  let place: Placement = { cx: 0, cy: 0, a: 1 };
  let image: ImageData | null = null;
  let frame32 = new Uint32Array(0);
  let bench32 = new Uint32Array(0);
  let sprites: Sprite[] = [];
  let shadows: Sprite[] = [];
  let benchShadow: Sprite | null = null;
  let dark = document.documentElement.classList.contains("dark");
  let dirty = true;

  let running = false;
  let frameId = 0;
  let last = 0;
  let lastReport = 0;

  function grainRadius(k: number) {
    const base = Math.min(1.5, Math.max(0.9, (place.a / dpr) * 0.0042));
    return (
      (k === SPORE
        ? Math.max(0.6, base * 0.62)
        : k === SALT
          ? base * 1.1
          : base) * dpr
    );
  }

  function layout() {
    const rect = canvas.getBoundingClientRect();
    cssWidth = rect.width;
    cssHeight = rect.height;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    // The buffer is rebuilt every frame, so it stays under about two million pixels.
    const budget = 2_000_000;
    if (cssWidth * cssHeight * dpr * dpr > budget)
      dpr = Math.max(1, Math.sqrt(budget / (cssWidth * cssHeight)));
    width = Math.max(1, Math.round(cssWidth * dpr));
    height = Math.max(1, Math.round(cssHeight * dpr));
    canvas.width = width;
    canvas.height = height;
    plateCanvas.width = width;
    plateCanvas.height = height;
    const a = Math.min(width, height) * 0.4;
    place = { cx: width / 2, cy: height / 2, a };
    sprites = [SAND, SALT, SPORE].map((k) =>
      makeSprite(grainRadius(k), k === SALT ? "square" : "round"),
    );
    shadows = [SAND, SALT, SPORE].map((k) =>
      makeSprite(
        grainRadius(k) * (settings.metal === "glass" ? 1.6 : 1.1),
        "soft",
      ),
    );
    benchShadow = makeSprite(grainRadius(SAND) * 1.1, "soft");
    image = ctx.createImageData(width, height);
    frame32 = new Uint32Array(image.data.buffer);
    paintBench();
    // Resizing clears the canvas, so it's drawn again straight away rather than left blank
    // until the next frame.
    draw();
  }

  // The bench, the plate and the sand already thrown off it, which only change now and then.
  function paintBench() {
    plateCtx.setTransform(1, 0, 0, 1, 0, 0);
    plateCtx.clearRect(0, 0, width, height);
    paintPlate(plateCtx, settings.shape, settings.metal, place, dark);
    bench32 = new Uint32Array(
      plateCtx.getImageData(0, 0, width, height).data.buffer,
    );
    for (let i = 0; i < benched; i++) stampBench(i);
    dirty = true;
  }

  function stampBench(i: number) {
    if (!benchShadow) return;
    const k = bkind[i];
    const x = place.cx + bx[i] * place.a;
    const y = place.cy + by[i] * place.a;
    const r = grainRadius(k);
    stamp(
      bench32,
      width,
      height,
      benchShadow,
      x + r * 0.4,
      y + r * 0.6,
      0,
      0,
      0,
      0.35,
      false,
    );
    const [cr, cg, cb] = PALETTES[k][btone[i]];
    stamp(bench32, width, height, sprites[k], x, y, cr, cg, cb, 1, true);
  }

  const observer = new ResizeObserver(() => layout());
  observer.observe(canvas);
  const themeWatch = new MutationObserver(() => {
    const next = document.documentElement.classList.contains("dark");
    if (next === dark) return;
    dark = next;
    paintBench();
    start();
  });
  themeWatch.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });

  const metal = () => METALS[settings.metal];

  function baseDamping(hz: number) {
    return (
      metal().damping * (1 + hz / 2500) + 0.0004 * Math.min(1, grains / 12000)
    );
  }

  function psiAt(k: number, x: number, y: number) {
    if (!plate) return 0;
    return plate.modes.at(k, x, y) / plate.max[k];
  }

  function modeAt(mode: Mode, x: number, y: number) {
    let sum = 0;
    for (let i = 0; i < mode.members.length; i++)
      sum += mode.weights[i] * psiAt(mode.members[i], x, y);
    return sum;
  }

  // A blend of modes' normalised shapes, renormalised to peak at 1.
  function blend(
    members: number[],
    coefficients: number[],
    source: Float32Array[],
  ) {
    const field = new Float32Array(GRID * GRID);
    for (let m = 0; m < members.length; m++) {
      const psi = source[members[m]];
      const c = coefficients[m];
      for (let i = 0; i < field.length; i++) field[i] += c * psi[i];
    }
    let peak = 0;
    const inside = plate?.inside;
    for (let i = 0; i < field.length; i++)
      if (!inside || inside[i]) peak = Math.max(peak, Math.abs(field[i]));
    if (peak > 0) for (let i = 0; i < field.length; i++) field[i] /= peak;
    return { field, peak };
  }

  // The modes as they ring with the fingers where they are. A pair a finger touches turns so
  // one of them has a node right under it and rings on, while the other is damped.
  function buildModes() {
    if (!plate) return;
    const { modes: solvedModes, psi, max, partner } = plate;
    const out: Mode[] = [];
    const { hzPerOmega } = metal();
    for (let k = 0; k < solvedModes.count; k++) {
      const hz = solvedModes.omega[k] * hzPerOmega;
      const pair = partner[k];
      if (pair === k + 1 && fingers.length) {
        let z11 = 0;
        let z12 = 0;
        let z22 = 0;
        for (const f of fingers) {
          const p1 = psiAt(k, f.x, f.y);
          const p2 = psiAt(pair, f.x, f.y);
          z11 += p1 * p1;
          z12 += p1 * p2;
          z22 += p2 * p2;
        }
        const theta = 0.5 * Math.atan2(2 * z12, z11 - z22);
        for (const angle of [theta, theta + Math.PI / 2]) {
          const c1 = Math.cos(angle);
          const c2 = Math.sin(angle);
          const { field, peak } = blend(
            [k, pair],
            [c1 * max[k], c2 * max[pair]],
            psi,
          );
          out.push({
            hz,
            w: TAU * hz,
            zeta: 0,
            drive: c1 * solvedModes.drive[k] + c2 * solvedModes.drive[pair],
            scale: peak,
            psi: field,
            members: [k, pair],
            weights: [(c1 * max[k]) / peak, (c2 * max[pair]) / peak],
          });
        }
        k++;
        continue;
      }
      out.push({
        hz,
        w: TAU * hz,
        zeta: 0,
        drive: solvedModes.drive[k],
        scale: max[k],
        psi: psi[k],
        members: [k],
        weights: [1],
      });
    }
    for (const mode of out) {
      let touch = 0;
      for (const f of fingers) touch += modeAt(mode, f.x, f.y) ** 2;
      mode.zeta = baseDamping(mode.hz) + FINGER_DAMPING * touch;
    }
    modes = out;
    groups = [];
    for (let i = 0; i < out.length; i++) {
      const group = groups[groups.length - 1];
      if (group && Math.abs(out[group[0]].hz - out[i].hz) < 1e-6 * out[i].hz)
        group.push(i);
      else groups.push([i]);
    }
    driveRe = new Float64Array(out.length);
    driveIm = new Float64Array(out.length);
    publishResponse();
  }

  // The plate's response to the driver, as the generator's panel shows it.
  function publishResponse() {
    if (!onResponse || !modes.length) return;
    const g = driveG(settings.amplitude);
    const curve = new Float32Array(RESPONSE_SAMPLES);
    for (let s = 0; s < RESPONSE_SAMPLES; s++) {
      const hz = MIN_HZ * (MAX_HZ / MIN_HZ) ** (s / (RESPONSE_SAMPLES - 1));
      const w = TAU * hz;
      let sum = 1;
      for (const mode of modes) {
        const dr = mode.w * mode.w - w * w;
        const di = 2 * mode.zeta * mode.w * w;
        const h = (mode.drive * mode.scale * w * w) / Math.hypot(dr, di);
        sum += h * h;
      }
      curve[s] = g * Math.sqrt(sum);
    }
    const resonances: Resonance[] = [];
    for (const group of groups) {
      const hz = modes[group[0]].hz;
      if (hz < MIN_HZ || hz > MAX_HZ) continue;
      let sum = 0;
      for (const index of group) {
        const mode = modes[index];
        sum += ((mode.drive * mode.scale) / (2 * mode.zeta)) ** 2;
      }
      const peak = g * Math.sqrt(1 + sum);
      if (peak >= 1) resonances.push({ hz, peak });
    }
    onResponse({ curve, resonances });
  }

  async function loadPlate() {
    const key = `${settings.shape}:${settings.metal}`;
    plateKey = key;
    plate = null;
    modes = [];
    groups = [];
    voices.length = 0;
    speaking = null;
    fingers.length = 0;
    const prepared = await prepare(settings.shape, settings.metal);
    if (plateKey !== key || disposed) return;
    plate = prepared;
    buildModes();
    start();
  }

  // ---- Sand ----

  function insidePlate(x: number, y: number) {
    return settings.shape === "round"
      ? x * x + y * y <= 1
      : Math.abs(x) <= 1 && Math.abs(y) <= 1;
  }

  function kindsFor(grainKind: GrainKind, i: number) {
    if (grainKind === "salt") return SALT;
    if (grainKind === "spores") return SPORE;
    if (grainKind === "both") return i % 5 < 2 ? SAND : SPORE;
    return SAND;
  }

  function pickTone(k: number) {
    const palette = PALETTES[k];
    // The odd dark grain stays odd.
    let t = Math.floor(Math.random() * palette.length);
    if (k === SAND && t === 5 && Math.random() < 0.7) t = 0;
    return t;
  }

  function addGrain(x: number, y: number, k: number, delay: number) {
    if (grains >= MAX_GRAINS) return;
    const i = grains++;
    gx[i] = x;
    gy[i] = y;
    hop[i] = 0;
    fall[i] = delay;
    if (delay > 0) falling++;
    kind[i] = k;
    tone[i] = pickTone(k);
    felt[i] = 0;
  }

  function removeGrain(i: number) {
    const lastIndex = --grains;
    if (fall[i] > 0) falling--;
    gx[i] = gx[lastIndex];
    gy[i] = gy[lastIndex];
    hop[i] = hop[lastIndex];
    fall[i] = fall[lastIndex];
    kind[i] = kind[lastIndex];
    tone[i] = tone[lastIndex];
    felt[i] = felt[lastIndex];
    cell[i] = cell[lastIndex];
  }

  // A grain thrown past the edge falls to the bench a little way out and stays there.
  function throwOff(i: number, dx: number, dy: number) {
    if (benched < MAX_BENCH) {
      const length = Math.hypot(dx, dy) || 1;
      let x = gx[i];
      let y = gy[i];
      if (settings.shape === "round") {
        const r = Math.hypot(x, y);
        x /= r;
        y /= r;
      } else {
        x = Math.max(-1, Math.min(1, x));
        y = Math.max(-1, Math.min(1, y));
      }
      const reach = 0.02 + Math.random() * 0.12;
      const j = benched++;
      bx[j] = x + (dx / length) * reach + (Math.random() - 0.5) * 0.03;
      by[j] = y + (dy / length) * reach + (Math.random() - 0.5) * 0.03;
      bkind[j] = kind[i];
      btone[j] = tone[i];
      stampBench(j);
    }
    removeGrain(i);
  }

  function sprinkle(count = SPRINKLE) {
    const grainKind = settings.grains;
    const total = grainKind === "both" ? Math.round(count * 1.4) : count;
    for (let n = 0; n < total; n++) {
      // Shaken from a shaker, sand lands in loose clumps rather than perfectly evenly.
      let x = 0;
      let y = 0;
      do {
        x = Math.random() * 2 - 1;
        y = Math.random() * 2 - 1;
        if (Math.random() < 0.3) {
          x += (Math.random() - 0.5) * 0.08;
          y += (Math.random() - 0.5) * 0.08;
        }
      } while (
        !insidePlate(x * 1.01, y * 1.01) ||
        x * x + y * y < WASHER * WASHER
      );
      addGrain(x, y, kindsFor(grainKind, n), 2 + Math.random() * FALL * 2);
    }
    start();
  }

  // Takes the plate's acceleration under each grain from the grid, with the slope of its
  // square.
  let sampleGamma = 0;
  let sampleX = 0;
  let sampleY = 0;
  function sample(x: number, y: number) {
    const h = 2 / (GRID - 1);
    const fx = (x + 1) / h;
    const fy = (y + 1) / h;
    const i0 = Math.min(GRID - 2, Math.max(0, Math.floor(fx)));
    const j0 = Math.min(GRID - 2, Math.max(0, Math.floor(fy)));
    const tx = Math.min(1, Math.max(0, fx - i0));
    const ty = Math.min(1, Math.max(0, fy - j0));
    const index = j0 * GRID + i0;
    const w00 = (1 - tx) * (1 - ty);
    const w10 = tx * (1 - ty);
    const w01 = (1 - tx) * ty;
    const w11 = tx * ty;
    sampleGamma =
      gamma[index] * w00 +
      gamma[index + 1] * w10 +
      gamma[index + GRID] * w01 +
      gamma[index + GRID + 1] * w11;
    sampleX =
      slopeX[index] * w00 +
      slopeX[index + 1] * w10 +
      slopeX[index + GRID] * w01 +
      slopeX[index + GRID + 1] * w11;
    sampleY =
      slopeY[index] * w00 +
      slopeY[index + 1] * w10 +
      slopeY[index + GRID] * w01 +
      slopeY[index + GRID + 1] * w11;
  }

  function moveGrains(dt: number) {
    const steps = dt * 60;
    let moving = 0;
    let bounce = 0;
    const fingerReach = FINGER_RADIUS * 1.1;
    const washer = WASHER * 1.04;
    for (let i = grains - 1; i >= 0; i--) {
      if (fall[i] > 0) {
        fall[i] -= steps;
        if (fall[i] <= 0) {
          fall[i] = 0;
          falling--;
          if (!insidePlate(gx[i], gy[i])) throwOff(i, gx[i], gy[i]);
        }
        moving++;
        continue;
      }
      if (peakGamma < STILL) {
        hop[i] = 0;
        felt[i] = 0;
        continue;
      }
      sample(gx[i], gy[i]);
      const g = sampleGamma;
      felt[i] = g;
      const k = kind[i];
      let dx = 0;
      let dy = 0;
      if (k === SPORE) {
        if (g < SPORE_STILL) {
          hop[i] = 0;
          continue;
        }
        // Carried up the slope of the motion by the air, slowing as they reach the top.
        const pull = Math.min(0.006, 0.00002 * Math.hypot(sampleX, sampleY));
        const slope = Math.hypot(sampleX, sampleY) || 1;
        const jitter = 0.0009 * Math.sqrt(g);
        dx = (sampleX / slope) * pull + (Math.random() - 0.5) * jitter;
        dy = (sampleY / slope) * pull + (Math.random() - 0.5) * jitter;
        hop[i] = g > 4 ? Math.random() * Math.min(1, (g - 4) / 12) * 0.8 : 0;
      } else {
        if (g < STILL) {
          hop[i] = 0;
          continue;
        }
        const slope = Math.hypot(sampleX, sampleY) || 1;
        const nx = -sampleX / slope;
        const ny = -sampleY / slope;
        if (g > CREEP) {
          // Picking up from the creep's pace, so nothing stalls where hopping gives way.
          const reach =
            Math.min(MAX_HOP, CREEP_SPEED + HOP * (g - CREEP) ** 0.7) *
            (k === SALT ? 1.2 : 1);
          const angle = Math.random() * TAU;
          dx = reach * (nx * 0.55 + Math.cos(angle) * 0.8);
          dy = reach * (ny * 0.55 + Math.sin(angle) * 0.8);
          hop[i] = g > 1 ? Math.random() * Math.min(1, (g - 1) / 10) : 0;
          bounce += Math.min(1, (g - 1) / 12);
        } else {
          const creep =
            CREEP_SPEED * Math.min(1, 0.3 + (g - STILL) / (CREEP - STILL));
          dx = nx * creep;
          dy = ny * creep;
          hop[i] = 0;
        }
      }
      dx *= steps;
      dy *= steps;
      moving++;
      let x = gx[i] + dx;
      let y = gy[i] + dy;
      // Off the washer and out from under fingertips.
      const r2 = x * x + y * y;
      if (r2 < washer * washer) {
        const r = Math.sqrt(r2) || 1e-6;
        x = (x / r) * washer;
        y = (y / r) * washer;
      }
      for (const f of fingers) {
        const fx = x - f.x;
        const fy = y - f.y;
        const d2 = fx * fx + fy * fy;
        if (d2 < fingerReach * fingerReach) {
          const d = Math.sqrt(d2) || 1e-6;
          x = f.x + (fx / d) * fingerReach;
          y = f.y + (fy / d) * fingerReach;
        }
      }
      gx[i] = x;
      gy[i] = y;
      if (!insidePlate(x, y)) throwOff(i, dx, dy);
    }
    rattle = grains ? Math.min(1, (bounce / grains) * 6) : 0;
    if (moving) dirty = true;
    if (peakGamma >= STILL) spill();
  }

  // Where grains pile deeper than a few, the shaking plate lets the top ones roll off sideways,
  // so sand gathers in lines with some width rather than one grain wide.
  function spill() {
    crowd.fill(0);
    const scale = CROWD / 2;
    for (let i = 0; i < grains; i++) {
      if (kind[i] === SPORE || fall[i] > 0) {
        cell[i] = -1;
        continue;
      }
      const c =
        Math.min(CROWD - 1, Math.max(0, ((gy[i] + 1) * scale) | 0)) * CROWD +
        Math.min(CROWD - 1, Math.max(0, ((gx[i] + 1) * scale) | 0));
      cell[i] = c;
      crowd[c]++;
    }
    const step = 2 / CROWD;
    for (let i = grains - 1; i >= 0; i--) {
      const c = cell[i];
      // Even on a nodal line the plate isn't quite still, so a heap there still slumps.
      if (c < 0 || felt[i] < 0.02) continue;
      const count = crowd[c];
      if (count <= CROWD_CAP || Math.random() > (count - CROWD_CAP) / count)
        continue;
      const angle = Math.random() * TAU;
      const reach = step * (0.5 + Math.random());
      const x = gx[i] + Math.cos(angle) * reach;
      const y = gy[i] + Math.sin(angle) * reach;
      if (!insidePlate(x, y) || x * x + y * y < WASHER * WASHER * 1.08)
        continue;
      gx[i] = x;
      gy[i] = y;
      crowd[c]--;
      const next =
        Math.min(CROWD - 1, Math.max(0, ((y + 1) * scale) | 0)) * CROWD +
        Math.min(CROWD - 1, Math.max(0, ((x + 1) * scale) | 0));
      crowd[next]++;
      cell[i] = next;
      dirty = true;
    }
  }

  // ---- The plate's motion ----

  function drivenBy() {
    if (voice) return { hz: voice.hz, g: voice.level * VOICE_G };
    if (settings.driver)
      return { hz: settings.frequency, g: driveG(settings.amplitude) };
    return { hz: settings.frequency, g: 0 };
  }

  function vibrate(dt: number) {
    const { hz, g } = drivenBy();
    const w = TAU * hz;
    let plateLevel = 0;
    // Each mode's response eases towards where the drive would hold it: slowly near its own
    // pitch, where a resonance takes time to build or to die away, and quickly far from it.
    for (let m = 0; m < modes.length; m++) {
      const mode = modes[m];
      let tr = 0;
      let ti = 0;
      if (g > 0) {
        const dr = mode.w * mode.w - w * w;
        const di = 2 * mode.zeta * mode.w * w;
        const k = (g * mode.drive * mode.scale * w * w) / (dr * dr + di * di);
        tr = k * dr;
        ti = -k * di;
      }
      const rate =
        mode.zeta * mode.w + (g > 0 ? 0.3 * Math.abs(w - mode.w) : 0);
      const ease = 1 - Math.exp(-rate * dt);
      driveRe[m] += (tr - driveRe[m]) * ease;
      driveIm[m] += (ti - driveIm[m]) * ease;
      plateLevel = Math.max(plateLevel, Math.hypot(driveRe[m], driveIm[m]));
    }

    // The bow feeds the mode that's speaking; every other one rings down.
    for (const v of voices) {
      if (bowing && v === speaking)
        v.g += (v.target - v.g) * (1 - Math.exp(-BOW_RISE * dt));
      else v.g *= Math.exp(-v.zeta * v.w * dt);
    }
    for (let i = voices.length - 1; i >= 0; i--) {
      if (voices[i].g < 0.03 && !(bowing && voices[i] === speaking)) {
        if (voices[i] === speaking) speaking = null;
        voices.splice(i, 1);
      }
    }

    // The driver's part is one motion at one frequency, so its modes add with their phases;
    // the bow's voices ring at their own pitches, so their strengths add as squares.
    gammaRe.fill(g);
    gammaIm.fill(0);
    for (let m = 0; m < modes.length; m++) {
      const cr = driveRe[m];
      const ci = driveIm[m];
      if (Math.abs(cr) + Math.abs(ci) < 0.01) continue;
      const psi = modes[m].psi;
      for (let i = 0; i < psi.length; i++) {
        gammaRe[i] += cr * psi[i];
        gammaIm[i] += ci * psi[i];
      }
    }
    peakGamma = 0;
    const inside = plate?.inside;
    for (let i = 0; i < gamma.length; i++) {
      let sum = gammaRe[i] * gammaRe[i] + gammaIm[i] * gammaIm[i];
      for (const v of voices) {
        const value = v.g * v.psi[i];
        sum += value * value;
      }
      const value = Math.sqrt(sum);
      gamma[i] = value;
      if (inside?.[i] && value > peakGamma) peakGamma = value;
    }
    const h2 = 4 / (GRID - 1);
    for (let row = 0; row < GRID; row++) {
      for (let col = 0; col < GRID; col++) {
        const i = row * GRID + col;
        const left = col > 0 ? i - 1 : i;
        const right = col < GRID - 1 ? i + 1 : i;
        const up = row > 0 ? i - GRID : i;
        const down = row < GRID - 1 ? i + GRID : i;
        slopeX[i] =
          (gamma[right] ** 2 - gamma[left] ** 2) /
          (h2 * ((right - left) / 2 || 1));
        slopeY[i] =
          (gamma[down] ** 2 - gamma[up] ** 2) /
          (h2 * ((down - up) / (2 * GRID) || 1));
      }
    }

    let loudest: Voice | null = null;
    for (const v of voices) if (!loudest || v.g > loudest.g) loudest = v;
    onSound?.({
      driveHz: hz,
      driveLevel: Math.min(1, g / 0.5),
      plateLevel: Math.min(1, (plateLevel / 30) ** 0.7),
      bowHz: loudest?.hz ?? null,
      bowLevel: loudest ? Math.min(1, loudest.g / BOW_G) : 0,
      bowing,
      rattle,
    });
  }

  // ---- The bow ----

  // A point on the edge, and the way out from it, for a position round it from 0 to 1.
  function edgeAt(t: number) {
    const angle = TAU * t - (Math.PI * 3) / 4;
    let x = Math.cos(angle);
    let y = Math.sin(angle);
    if (settings.shape === "square") {
      const m = Math.max(Math.abs(x), Math.abs(y));
      x /= m;
      y /= m;
    }
    return edgePoint(x, y);
  }

  function edgePoint(x: number, y: number) {
    if (settings.shape === "round") {
      const r = Math.hypot(x, y) || 1;
      return { x: x / r, y: y / r, nx: x / r, ny: y / r };
    }
    const cxp = Math.max(-1, Math.min(1, x));
    const cyp = Math.max(-1, Math.min(1, y));
    if (Math.abs(cxp) >= Math.abs(cyp)) {
      const side = Math.sign(cxp) || 1;
      return { x: side, y: cyp, nx: side, ny: 0 };
    }
    const side = Math.sign(cyp) || 1;
    return { x: cxp, y: side, nx: 0, ny: side };
  }

  // Which mode the bow sets going. It can only feed a mode that moves where it touches, it
  // speaks most easily in the plate's middle register, and a mode a finger damps won't start.
  // Among the likeliest few it's a matter of luck, as it is with a real bow, though a mode
  // that's already ringing keeps going.
  function chooseVoice() {
    if (!bow || !modes.length) return;
    const { hzPerOmega } = metal();
    const scored: {
      group: number[];
      weights: number[];
      score: number;
      reach: number;
    }[] = [];
    for (const group of groups) {
      const hz = modes[group[0]].hz;
      if (hz > MAX_HZ) continue;
      let reach2 = 0;
      let quality = 0;
      const weights: number[] = [];
      for (const index of group) {
        const value = modeAt(modes[index], bow.x * 0.995, bow.y * 0.995);
        weights.push(value);
        reach2 += value * value;
        quality += baseDamping(hz) / modes[index].zeta;
      }
      quality /= group.length;
      const octaves = Math.log2(hz / hzPerOmega / BOW_SWEET);
      const sweet = Math.exp(-(octaves * octaves) / (2 * 1.3 * 1.3));
      let score = reach2 * sweet * quality ** 1.5;
      if (speaking && Math.abs(speaking.hz - hz) < 1e-6 * hz) score *= 1.8;
      scored.push({ group, weights, score, reach: Math.sqrt(reach2) });
    }
    scored.sort((p, q) => q.score - p.score);
    const top = scored.slice(0, 4).filter((entry) => entry.score > 0.02);
    if (!top.length) return;
    let total = 0;
    for (const entry of top) total += entry.score ** 3;
    let pick = Math.random() * total;
    let chosen = top[0];
    for (const entry of top) {
      pick -= entry.score ** 3;
      if (pick <= 0) {
        chosen = entry;
        break;
      }
    }
    const first = modes[chosen.group[0]];
    const key = `${first.hz.toFixed(4)}`;
    if (speaking && speaking.key === key) {
      speaking.target = BOW_G * Math.min(1, 0.35 + chosen.reach);
      return;
    }
    const { field } = blend(
      chosen.group,
      chosen.weights,
      modes.map((mode) => mode.psi),
    );
    let zeta = 0;
    let weight = 0;
    chosen.group.forEach((index, n) => {
      zeta += modes[index].zeta * chosen.weights[n] ** 2;
      weight += chosen.weights[n] ** 2;
    });
    const existing = voices.find((v) => v.key === key);
    if (existing) {
      existing.psi = field;
      existing.target = BOW_G * Math.min(1, 0.35 + chosen.reach);
      speaking = existing;
      return;
    }
    const next: Voice = {
      hz: first.hz,
      w: first.w,
      zeta: zeta / (weight || 1),
      psi: field,
      g: 0,
      target: BOW_G * Math.min(1, 0.35 + chosen.reach),
      key,
    };
    voices.push(next);
    if (voices.length > 3) voices.splice(voices.indexOf(next) === 0 ? 1 : 0, 1);
    speaking = next;
  }

  // ---- Drawing ----

  function draw() {
    if (!image) return;
    frame32.set(bench32);
    const glass = settings.metal === "glass";
    const { cx, cy, a } = place;
    const benchX = a * SHADOW_OFFSET.x;
    const benchY = a * SHADOW_OFFSET.y;
    const motion = !reduceMotion.matches;
    for (let i = 0; i < grains; i++) {
      const k = kind[i];
      const r = grainRadius(k);
      const lift = Math.max(motion ? hop[i] : 0, fall[i] / FALL);
      const x = cx + gx[i] * a;
      const y = cy + gy[i] * a;
      if (glass) {
        stamp(
          frame32,
          width,
          height,
          shadows[k],
          x + benchX + lift * r * 3,
          y + benchY + lift * r * 4,
          0,
          0,
          0,
          k === SPORE ? 0.035 : 0.075,
          false,
        );
      } else {
        stamp(
          frame32,
          width,
          height,
          shadows[k],
          x + r * 0.45 + lift * r * 2.5,
          y + r * 0.6 + lift * r * 3.5,
          0,
          0,
          0,
          (k === SPORE ? 0.25 : 0.45) * (1 - lift * 0.5),
          false,
        );
      }
    }
    for (let i = 0; i < grains; i++) {
      const k = kind[i];
      const [r, g, b] = PALETTES[k][tone[i]];
      const airborne = motion && k === SPORE ? hop[i] : 0;
      stamp(
        frame32,
        width,
        height,
        sprites[k],
        cx + gx[i] * a,
        cy + gy[i] * a,
        r,
        g,
        b,
        1 - airborne * 0.45,
        true,
      );
    }
    ctx.putImageData(image, 0, 0);
    for (const f of fingers) drawFinger(f);
    if (bow && bowing) drawBow();
    dirty = false;
  }

  // A fingertip resting on the plate, the hand reaching in from the bottom right.
  function drawFinger(f: Point) {
    const { cx, cy, a } = place;
    const x = cx + f.x * a;
    const y = cy + f.y * a;
    const along = { x: 0.36, y: 0.93 };
    const half = a * 0.062;
    const length = a * 1.6;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.atan2(along.y, along.x) - Math.PI / 2);
    // The finger lies along +y from its tip, with the pad it presses with on the point.
    ctx.translate(0, -half * 0.9);
    ctx.shadowColor = "rgba(0, 0, 0, 0.35)";
    ctx.shadowBlur = a * 0.05;
    ctx.shadowOffsetX = a * 0.02;
    ctx.shadowOffsetY = a * 0.045;
    const skin = ctx.createLinearGradient(-half, 0, half, 0);
    skin.addColorStop(0, "#b47d62");
    skin.addColorStop(0.3, "#d9a284");
    skin.addColorStop(0.55, "#e2b093");
    skin.addColorStop(1, "#a8735a");
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.moveTo(-half * 1.35, length);
    ctx.lineTo(-half, half * 0.9);
    ctx.ellipse(0, half * 0.9, half, half * 0.95, 0, Math.PI, 0);
    ctx.lineTo(half * 1.5, length);
    ctx.closePath();
    ctx.fill();
    ctx.shadowColor = "transparent";
    // The nail, with a soft gloss, and the knuckle's creases further back.
    const nail = ctx.createLinearGradient(-half * 0.6, 0, half * 0.6, 0);
    nail.addColorStop(0, "rgba(232, 190, 176, 0.9)");
    nail.addColorStop(0.45, "rgba(250, 222, 210, 0.95)");
    nail.addColorStop(1, "rgba(214, 168, 150, 0.9)");
    ctx.fillStyle = nail;
    ctx.beginPath();
    ctx.roundRect(-half * 0.62, half * 0.28, half * 1.24, half * 1.55, [
      half * 0.6,
      half * 0.6,
      half * 0.3,
      half * 0.3,
    ]);
    ctx.fill();
    ctx.fillStyle = "rgba(255, 255, 255, 0.35)";
    ctx.beginPath();
    ctx.ellipse(-half * 0.2, half * 0.8, half * 0.12, half * 0.45, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = "rgba(120, 70, 50, 0.35)";
    ctx.lineWidth = Math.max(1, a * 0.004);
    for (const at of [
      half * 3.4,
      half * 3.65,
      half * 7.6,
      half * 7.9,
      half * 8.2,
    ]) {
      const width = half * (0.6 + at / length / 3);
      ctx.beginPath();
      ctx.moveTo(-width, at);
      ctx.quadraticCurveTo(0, at - half * 0.2, width, at);
      ctx.stroke();
    }
    ctx.restore();
  }

  // The bow held against the edge, seen from above: it slides along its length, one way and
  // then the other, with the hair on the edge.
  function drawBow() {
    if (!bow) return;
    const { cx, cy, a } = place;
    const px = cx + bow.x * a;
    const py = cy + bow.y * a;
    const tilt = 0.32;
    const ux = bow.nx * Math.cos(tilt) - bow.ny * Math.sin(tilt);
    const uy = bow.nx * Math.sin(tilt) + bow.ny * Math.cos(tilt);
    const vx = -uy;
    const vy = ux;
    const period = 2.4;
    const phase = reduceMotion.matches ? 0.5 : (bowClock % period) / period;
    const travel = phase < 0.5 ? phase * 2 : 2 - phase * 2;
    const head = a * (0.08 + travel * 0.4);
    const length = a * 1.3;
    const at = (s: number, side: number) => ({
      x: px + ux * s + vx * side,
      y: py + uy * s + vy * side,
    });
    ctx.save();
    ctx.lineCap = "round";
    ctx.shadowColor = "rgba(0, 0, 0, 0.35)";
    ctx.shadowBlur = a * 0.03;
    ctx.shadowOffsetX = a * 0.03;
    ctx.shadowOffsetY = a * 0.05;
    // Hair: a flat ribbon of pale horsehair.
    const h0 = at(-head, 0);
    const h1 = at(length - head, 0);
    ctx.strokeStyle = "#eee6d2";
    ctx.lineWidth = a * 0.034;
    ctx.beginPath();
    ctx.moveTo(h0.x, h0.y);
    ctx.lineTo(h1.x, h1.y);
    ctx.stroke();
    ctx.shadowColor = "transparent";
    ctx.strokeStyle = "rgba(160, 140, 110, 0.5)";
    ctx.lineWidth = a * 0.004;
    ctx.beginPath();
    ctx.moveTo(at(-head, a * 0.008).x, at(-head, a * 0.008).y);
    ctx.lineTo(at(length - head, a * 0.008).x, at(length - head, a * 0.008).y);
    ctx.stroke();
    // Stick: pernambuco, cambered towards the hair in the middle.
    ctx.shadowColor = "rgba(0, 0, 0, 0.3)";
    ctx.shadowBlur = a * 0.03;
    ctx.shadowOffsetX = a * 0.035;
    ctx.shadowOffsetY = a * 0.06;
    const s0 = at(-head - a * 0.02, a * 0.045);
    const s1 = at(length - head, a * 0.055);
    const mid = at(length / 2 - head, a * 0.028);
    const stick = ctx.createLinearGradient(
      at(0, a * 0.035).x,
      at(0, a * 0.035).y,
      at(0, a * 0.06).x,
      at(0, a * 0.06).y,
    );
    stick.addColorStop(0, "#8a4524");
    stick.addColorStop(0.5, "#5e2a14");
    stick.addColorStop(1, "#3c190b");
    ctx.strokeStyle = stick;
    ctx.lineWidth = a * 0.027;
    ctx.beginPath();
    ctx.moveTo(s0.x, s0.y);
    ctx.quadraticCurveTo(mid.x, mid.y, s1.x, s1.y);
    ctx.stroke();
    // The head at the near end, and the frog at the far one, in ebony with a pearl eye.
    const tip = at(-head - a * 0.015, a * 0.025);
    ctx.fillStyle = "#efe9dc";
    ctx.beginPath();
    ctx.ellipse(tip.x, tip.y, a * 0.022, a * 0.034, Math.atan2(uy, ux), 0, TAU);
    ctx.fill();
    const frog = at(length - head - a * 0.12, a * 0.03);
    ctx.save();
    ctx.translate(frog.x, frog.y);
    ctx.rotate(Math.atan2(uy, ux));
    ctx.fillStyle = "#141212";
    ctx.beginPath();
    ctx.roundRect(-a * 0.07, -a * 0.04, a * 0.14, a * 0.07, a * 0.012);
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.fillStyle = "#d6dbe2";
    ctx.fillRect(-a * 0.075, -a * 0.04, a * 0.012, a * 0.07);
    ctx.fillStyle = "rgba(235, 240, 255, 0.85)";
    ctx.beginPath();
    ctx.arc(a * 0.01, -a * 0.005, a * 0.011, 0, TAU);
    ctx.fill();
    ctx.restore();
    ctx.restore();
  }

  function report(now: number, force = false) {
    if (!onStats || (!force && now - lastReport < 250)) return;
    lastReport = now;
    let hz: number | null = null;
    let loudest = 0;
    for (const v of voices) {
      if (v.g > loudest && v.g > 1) {
        loudest = v.g;
        hz = v.hz;
      }
    }
    if (hz === null && peakGamma > 1) hz = drivenBy().hz;
    onStats({
      grains,
      hz,
      ready: plate !== null,
      fingers: fingers.length,
      bowing,
    });
  }

  function step(dt: number) {
    if (bowing) bowClock += dt;
    if (plate) vibrate(dt);
    else peakGamma = 0;
    // With reduced motion the sand is shown settling at a few times the pace, without its
    // dancing, so a figure appears rather than plays out.
    const passes = reduceMotion.matches ? 3 : 1;
    for (let pass = 0; pass < passes; pass++) moveGrains(dt);
    if (bowing) dirty = true;
  }

  function busy() {
    return (
      settings.driver ||
      voice !== null ||
      bowing ||
      voices.length > 0 ||
      falling > 0 ||
      peakGamma >= STILL ||
      !plate
    );
  }

  function tick(now: number) {
    if (disposed) return;
    // A long gap (a hidden tab, a busy main thread) resumes rather than leaps.
    const dt = Math.min((now - last) / 1000, 1 / 30);
    last = now;
    step(dt);
    if (dirty) draw();
    report(now);
    if (busy()) {
      frameId = requestAnimationFrame(tick);
    } else {
      running = false;
      peakGamma = 0;
      onSound?.({
        driveHz: settings.frequency,
        driveLevel: 0,
        plateLevel: 0,
        bowHz: null,
        bowLevel: 0,
        bowing: false,
        rattle: 0,
      });
      report(now, true);
    }
  }

  function start() {
    if (disposed) return;
    dirty = true;
    if (running) return;
    running = true;
    last = performance.now();
    frameId = requestAnimationFrame(tick);
  }

  // From CSS pixels on the canvas to plate units.
  function toPlate(point: Point) {
    return {
      x: (point.x * dpr - place.cx) / place.a,
      y: (point.y * dpr - place.cy) / place.a,
    };
  }

  // How far a point is outside the edge, in CSS pixels; negative inside.
  function edgeDistance(point: Point) {
    const p = toPlate(point);
    const out =
      settings.shape === "round"
        ? Math.hypot(p.x, p.y) - 1
        : Math.max(Math.abs(p.x), Math.abs(p.y)) - 1;
    return (out * place.a) / dpr;
  }

  let disposed = false;
  layout();
  sprinkle();
  void loadPlate();

  return {
    setSettings(next: ChladniSettings) {
      const previous = settings;
      settings = next;
      if (next.shape !== previous.shape || next.metal !== previous.metal) {
        // A fresh plate, freshly sprinkled, with the old one's sand gone with it.
        grains = 0;
        falling = 0;
        benched = 0;
        if (next.metal !== previous.metal) layout();
        else paintBench();
        sprinkle();
        void loadPlate();
      } else if (next.grains !== previous.grains) {
        grains = 0;
        falling = 0;
        sprinkle();
      }
      if (next.amplitude !== previous.amplitude) publishResponse();
      start();
    },
    // What's under a point on the stage: the edge, where it can be bowed, the plate, or bench.
    region(point: Point, touch = false): "edge" | "plate" | "bench" {
      const distance = edgeDistance(point);
      const reach = touch ? 26 : 18;
      if (distance > -reach * 0.7 && distance < reach) return "edge";
      return distance <= 0 ? "plate" : "bench";
    },
    // Bows at the nearest point of the edge to a point, at the panel's bow position, or not.
    bow(point: Point | "panel" | null) {
      if (point === null) {
        bowing = false;
        start();
        return;
      }
      const previous = bow;
      if (point === "panel") bow = edgeAt(settings.bowAt);
      else {
        const p = toPlate(point);
        bow = edgePoint(p.x, p.y);
      }
      const moved =
        !previous || Math.hypot(bow.x - previous.x, bow.y - previous.y) > 0.04;
      if (!bowing || moved) {
        bowing = true;
        chooseVoice();
      }
      start();
    },
    // Rests a fingertip on the plate, or lifts the one already there.
    touch(point: Point) {
      const p = toPlate(point);
      const near = fingers.findIndex(
        (f) => Math.hypot(f.x - p.x, f.y - p.y) < FINGER_RADIUS * 1.6,
      );
      if (near >= 0) fingers.splice(near, 1);
      else {
        if (
          !insidePlate(p.x, p.y) ||
          Math.hypot(p.x, p.y) < WASHER + FINGER_RADIUS
        )
          return;
        fingers.push(p);
        if (fingers.length > MAX_FINGERS) fingers.shift();
      }
      buildModes();
      if (bowing) chooseVoice();
      start();
      report(performance.now(), true);
    },
    liftFingers() {
      fingers.length = 0;
      buildModes();
      if (bowing) chooseVoice();
      start();
      report(performance.now(), true);
    },
    // Pours grains from above around a point, as from a shaker.
    pour(point: Point, count: number) {
      const p = toPlate(point);
      for (let n = 0; n < count; n++) {
        const angle = Math.random() * TAU;
        const r = Math.sqrt(-2 * Math.log(Math.random() + 1e-9)) * 0.022;
        addGrain(
          p.x + Math.cos(angle) * r,
          p.y + Math.sin(angle) * r,
          kindsFor(settings.grains, Math.floor(Math.random() * 5)),
          FALL * (0.5 + Math.random() * 0.5),
        );
      }
      start();
    },
    // Shakes sand over the whole plate; a light dusting when given fewer grains.
    sprinkle(count?: number) {
      sprinkle(count);
    },
    clear() {
      grains = 0;
      falling = 0;
      benched = 0;
      paintBench();
      start();
      report(performance.now(), true);
    },
    // The microphone's pitch and loudness drive the plate in place of the generator.
    setVoice(next: { hz: number; level: number } | null) {
      voice = next;
      if (next) start();
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(frameId);
      running = false;
      observer.disconnect();
      themeWatch.disconnect();
    },
  };
}

export type Chladni = ReturnType<typeof createChladni>;
