// A sheet of photographic paper and the chemistry it goes through. Variable-contrast paper
// carries two emulsions mixed in one layer: a soft one, sensitised to green, and a hard one that
// sees only blue. The filter under the enlarger lens decides how much light each gets (yellow
// starves the hard one, magenta the soft), so the grade belongs to the light at the moment of
// exposure rather than to the paper, and two exposures through different filters simply add up,
// which is what split-grade printers rely on. Neither emulsion can see red: that's why the
// safelight is red, and why the enlarger's red swing filter shows the picture without printing it.
//
// Exposure leaves nothing to see. In the developer every grain that caught enough light is
// reduced to silver, the most exposed first, so the blacks come up within seconds and the pale
// greys only as the developer keeps working; past the time on the bottle density still creeps
// up and the whites start to fog. Developer is used up where it works hardest, so in a still tray
// big dark areas lag behind while their edges, fed from the clear paper beside them, run ahead;
// rocking the tray keeps it fresh everywhere. Until the fixer has dissolved the unexposed halide,
// white light still prints: switch the room light on too early and the sheet fogs, and if it is
// still in the developer you watch the whites go grey.

export type PaperKind = "glossy" | "fibre";
export type Bath = "developer" | "stop" | "fixer" | "none";

// An 8 × 10 inch sheet, and the resolution its fields are kept at.
export const SHEET_MM = { width: 203, height: 254 };
export const PX_PER_MM = 3;
export const FIELD_W = SHEET_MM.width * PX_PER_MM;
export const FIELD_H = SHEET_MM.height * PX_PER_MM;
// Development is tracked over cells this many pixels across, which is finer than developer
// moves in the time it takes to develop a print.
const CELL = 8;
const CELLS_X = Math.ceil(FIELD_W / CELL);
const CELLS_Y = Math.ceil(FIELD_H / CELL);

export const PAPERS: Record<
  PaperKind,
  {
    value: PaperKind;
    label: string;
    description: string;
    // The paper base, and how much each channel's density is scaled: a warm-tone paper's
    // silver is brown-black, denser in blue than in red.
    base: [number, number, number];
    tone: [number, number, number];
    dmax: number;
    // Seconds in the developer for full development.
    develop: number;
    // How much darker the print looks once it has dried.
    dryDown: number;
  }
> = {
  glossy: {
    value: "glossy",
    label: "Glossy RC",
    description:
      "Resin-coated, neutral black on bright white. Develops in a minute and dries as it looks wet.",
    base: [0.955, 0.952, 0.94],
    tone: [1, 1, 1],
    dmax: 2.15,
    develop: 60,
    dryDown: 1.02,
  },
  fibre: {
    value: "fibre",
    label: "Warm fibre",
    description:
      "Fibre-based warm tone: brown-black on a cream base. Slower in the developer, and it dries down a shade darker.",
    base: [0.95, 0.915, 0.83],
    tone: [0.84, 0.97, 1.14],
    dmax: 2.0,
    develop: 90,
    dryDown: 1.07,
  },
};

// How much of the enlarger's light reaches the soft and the hard emulsion through each grade of
// filter, and the colour of that light. Grades 4 and 5 are dense magenta and cost exposure.
export const FILTERS: {
  soft: number;
  hard: number;
  colour: [number, number, number];
}[] = [
  { soft: 1, hard: 0.02, colour: [1, 0.94, 0.46] },
  { soft: 0.75, hard: 0.09, colour: [1, 0.93, 0.62] },
  { soft: 0.5, hard: 0.2, colour: [1, 0.9, 0.82] },
  { soft: 0.3, hard: 0.36, colour: [1, 0.84, 0.9] },
  { soft: 0.12, hard: 0.54, colour: [1, 0.68, 0.92] },
  { soft: 0, hard: 0.7, colour: [1, 0.56, 0.94] },
];

// White light with no filter reaches both emulsions about as a grade 2 filter would, only more.
const WHITE = { soft: 0.55, hard: 0.25 };

// Each emulsion's response to log exposure: a soft one with a long, gentle slope, and a hard one
// that goes from nothing to everything in under a stop and a half. Their silver adds, and the
// layer saturates towards its maximum density.
const SOFT = { slope: 4.2, speed: 0.35 };
const HARD = { slope: 11, speed: 0.1 };
const COVER = 2.6;

const LOG_MIN = -4;
const LOG_MAX = 3;
const LOG_STEPS = 2048;
const LOG_SCALE = (LOG_STEPS - 1) / (LOG_MAX - LOG_MIN);
const SAT_STEPS = 1024;
const SAT_MAX = 2;
const D_STEPS = 1024;
const D_MAX = 3;

function sigmoidTable({ slope, speed }: { slope: number; speed: number }) {
  const table = new Float32Array(LOG_STEPS);
  for (let i = 0; i < LOG_STEPS; i++) {
    const log = LOG_MIN + i / LOG_SCALE;
    table[i] = 1 / (1 + Math.exp(-slope * (log - speed)));
  }
  return table;
}

const softTable = sigmoidTable(SOFT);
const hardTable = sigmoidTable(HARD);
const saturation = new Float32Array(SAT_STEPS);
for (let i = 0; i < SAT_STEPS; i++) {
  saturation[i] = 1 - Math.exp(-COVER * ((i / (SAT_STEPS - 1)) * SAT_MAX));
}

// Density to a packed RGBA pixel, per paper (little-endian, so red is the low byte).
const toneTables = new Map<PaperKind, Uint32Array>();
function toneTable(kind: PaperKind) {
  let table = toneTables.get(kind);
  if (table) return table;
  const { base, tone } = PAPERS[kind];
  table = new Uint32Array(D_STEPS);
  for (let i = 0; i < D_STEPS; i++) {
    const density = (i / (D_STEPS - 1)) * D_MAX;
    const channel = (c: number) =>
      Math.round(255 * base[c] * 10 ** (-density * tone[c]));
    table[i] =
      (255 << 24) | (channel(2) << 16) | (channel(1) << 8) | channel(0);
  }
  toneTables.set(kind, table);
  return table;
}

export type Sheet = {
  paper: PaperKind;
  // Exposure on each emulsion, in units of one second at f/8 with no filter.
  soft: Float32Array;
  hard: Float32Array;
  // log10 of the above plus any fog, kept up to date for the developer.
  logSoft: Float32Array;
  logHard: Float32Array;
  logsStale: boolean;
  // Even exposure over the whole sheet from white light, and how much of it developer has had
  // the chance to act on. Fog that lands once development has stopped never comes up.
  fogSoft: number;
  fogHard: number;
  takenSoft: number;
  takenHard: number;
  // Per cell: how far development has gone (1 is the full time for this paper), how fresh the
  // developer over it is, how much silver it has to develop, and how easily still developer
  // reaches it.
  developed: Float32Array;
  activity: Float32Array;
  load: Float32Array;
  reach: Float32Array;
  // 1 until the fixer starts dissolving the halide; 0 once it can't print any more.
  sensitivity: number;
  // Any light has reached it through the enlarger.
  exposed: boolean;
  // Unfixed halide darkens by itself in strong light, slowly: print-out.
  printOut: number;
  dry: boolean;
  // The image has changed since it was last drawn.
  dirty: boolean;
};

function hash(x: number, y: number, seed: number) {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

// Smooth noise over the cell grid, for the patchy way still developer reaches a sheet.
function blotches(seed: number) {
  const reach = new Float32Array(CELLS_X * CELLS_Y);
  const scale = 9;
  for (let y = 0; y < CELLS_Y; y++) {
    for (let x = 0; x < CELLS_X; x++) {
      const fx = x / scale;
      const fy = y / scale;
      const ix = Math.floor(fx);
      const iy = Math.floor(fy);
      const tx = fx - ix;
      const ty = fy - iy;
      const sx = tx * tx * (3 - 2 * tx);
      const sy = ty * ty * (3 - 2 * ty);
      const a = hash(ix, iy, seed);
      const b = hash(ix + 1, iy, seed);
      const c = hash(ix, iy + 1, seed);
      const d = hash(ix + 1, iy + 1, seed);
      const n = a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
      const fine = hash(x, y, seed + 7);
      reach[y * CELLS_X + x] = 0.35 + 1.1 * n + 0.25 * fine;
    }
  }
  return reach;
}

export function createSheet(paper: PaperKind): Sheet {
  const size = FIELD_W * FIELD_H;
  const cells = CELLS_X * CELLS_Y;
  const logSoft = new Float32Array(size).fill(LOG_MIN);
  const logHard = new Float32Array(size).fill(LOG_MIN);
  return {
    paper,
    soft: new Float32Array(size),
    hard: new Float32Array(size),
    logSoft,
    logHard,
    logsStale: false,
    fogSoft: 0,
    fogHard: 0,
    takenSoft: 0,
    takenHard: 0,
    developed: new Float32Array(cells),
    activity: new Float32Array(cells),
    load: new Float32Array(cells),
    reach: blotches(Math.floor(Math.random() * 1e6)),
    sensitivity: 1,
    exposed: false,
    printOut: 0,
    dry: false,
    dirty: true,
  };
}

// Light falling on the sheet for dt seconds. `light` is the enlarger's light at each pixel of a
// larger field the sheet sits in at (left, top), relative to one second at f/8.
export function expose(
  sheet: Sheet,
  light: Float32Array,
  lightWidth: number,
  left: number,
  top: number,
  intensity: number,
  grade: number,
  dt: number,
) {
  if (sheet.sensitivity <= 0.001) return;
  const filter = FILTERS[grade];
  const soft = intensity * filter.soft * dt * sheet.sensitivity;
  const hard = intensity * filter.hard * dt * sheet.sensitivity;
  for (let y = 0; y < FIELD_H; y++) {
    let j = (y + top) * lightWidth + left;
    let i = y * FIELD_W;
    for (let x = 0; x < FIELD_W; x++, i++, j++) {
      const l = light[j];
      sheet.soft[i] += soft * l;
      sheet.hard[i] += hard * l;
    }
  }
  sheet.exposed = true;
  sheet.logsStale = true;
}

// White light over the whole sheet: the room light, or a fresh sheet taken out in it.
export function fog(sheet: Sheet, amount: number) {
  if (sheet.sensitivity <= 0.001 || amount <= 0) return;
  sheet.fogSoft += amount * WHITE.soft * sheet.sensitivity;
  sheet.fogHard += amount * WHITE.hard * sheet.sensitivity;
  // Before development it simply joins the latent image.
  if (!started(sheet)) {
    sheet.takenSoft = sheet.fogSoft;
    sheet.takenHard = sheet.fogHard;
    sheet.logsStale = true;
  }
}

function started(sheet: Sheet) {
  return progress(sheet) > 0.002;
}

export function fogged(sheet: Sheet) {
  return sheet.fogSoft > 0.05;
}

function refreshLogs(sheet: Sheet) {
  if (!sheet.logsStale) return;
  sheet.logsStale = false;
  const { soft, hard, logSoft, logHard, takenSoft, takenHard } = sheet;
  for (let i = 0; i < soft.length; i++) {
    logSoft[i] = Math.log10(soft[i] + takenSoft + 1e-4);
    logHard[i] = Math.log10(hard[i] + takenHard + 1e-4);
  }
  // The silver each cell will eventually develop, sampled at its centre, sets how fast it
  // uses up the developer over it.
  for (let cy = 0; cy < CELLS_Y; cy++) {
    const y = Math.min(FIELD_H - 1, cy * CELL + (CELL >> 1));
    for (let cx = 0; cx < CELLS_X; cx++) {
      const x = Math.min(FIELD_W - 1, cx * CELL + (CELL >> 1));
      const i = y * FIELD_W + x;
      sheet.load[cy * CELLS_X + cx] =
        softTable[logIndex(logSoft[i])] + hardTable[logIndex(logHard[i])];
    }
  }
}

function logIndex(log: number) {
  const i = ((log - LOG_MIN) * LOG_SCALE) | 0;
  return i < 0 ? 0 : i >= LOG_STEPS ? LOG_STEPS - 1 : i;
}

// Development as a function of progress u (1 is the full time): the emulsion seems slow at
// first, so only the heavily exposed grains show, and the density it is heading for builds up
// after a short wait before anything appears. Long past the full time, fog creeps in.
function speedShift(u: number) {
  return -0.55 * Math.exp(-3 * u) + 0.04 * Math.max(0, u - 1);
}
function gain(u: number) {
  return 1 - Math.exp(-4.5 * Math.max(0, u - 0.07));
}
function chemicalFog(u: number) {
  return 0.05 * Math.max(0, u - 1.3) ** 1.5;
}

// Moves the chemistry on by dt bath seconds. `rock` is 0 for a still tray and 1 for steady
// rocking.
export function develop(sheet: Sheet, bath: Bath, rock: number, dt: number) {
  refreshLogs(sheet);
  const { developed, activity, load, reach } = sheet;
  const time = PAPERS[sheet.paper].develop;
  const cells = developed.length;
  let changed = false;
  if (bath === "developer") {
    // Fresh developer reaches the sheet as it goes in, then is used up and replaced.
    const stir = 0.12 + 3 * rock;
    for (let i = 0; i < cells; i++) {
      const u = developed[i];
      const a = activity[i];
      const du = (a * dt) / time;
      developed[i] = u + du;
      const used = 0.8 * load[i] * 4.5 * Math.exp(-4.5 * Math.max(0, u - 0.07));
      const recover = stir * (rock > 0.5 ? 1 : reach[i]);
      activity[i] = Math.max(
        0,
        Math.min(1, a - used * du + recover * (1 - a) * dt),
      );
      if (du > 0) changed = true;
    }
    spread(activity, Math.min(0.2, 0.12 * dt));
  } else {
    // Out of the developer, what's soaked into the sheet works on until the stop bath kills it
    // in a second or two, or the fixer more slowly.
    const life = bath === "stop" ? 1.2 : bath === "fixer" ? 5 : 25;
    const fade = Math.exp(-dt / life);
    for (let i = 0; i < cells; i++) {
      const a = activity[i];
      if (a < 0.002) continue;
      const du = (a * dt) / time;
      developed[i] += du;
      activity[i] = a * fade;
      changed = true;
    }
  }
  // Fog that lands during development comes up as the developer gets to it, over a few seconds;
  // once the developer is dead it never will.
  if (sheet.fogSoft > sheet.takenSoft + 1e-4) {
    let total = 0;
    for (let i = 0; i < cells; i++) total += activity[i];
    const k = 1 - Math.exp((-dt * total) / cells / 6);
    if (k > 1e-5) {
      sheet.takenSoft += (sheet.fogSoft - sheet.takenSoft) * k;
      sheet.takenHard += (sheet.fogHard - sheet.takenHard) * k;
      sheet.logsStale = true;
    }
  }
  if (bath === "fixer") sheet.sensitivity *= Math.exp(-dt / 8);
  if (changed || sheet.logsStale) sheet.dirty = true;
}

// Soaks a sheet that has just gone into the developer.
export function immerse(sheet: Sheet) {
  sheet.activity.fill(1);
}

// One step of diffusion between neighbouring cells.
function spread(field: Float32Array, k: number) {
  const copy = field.slice();
  for (let y = 0; y < CELLS_Y; y++) {
    for (let x = 0; x < CELLS_X; x++) {
      const i = y * CELLS_X + x;
      const l = x > 0 ? copy[i - 1] : copy[i];
      const r = x < CELLS_X - 1 ? copy[i + 1] : copy[i];
      const u = y > 0 ? copy[i - CELLS_X] : copy[i];
      const d = y < CELLS_Y - 1 ? copy[i + CELLS_X] : copy[i];
      field[i] = copy[i] + k * (l + r + u + d - 4 * copy[i]);
    }
  }
}

// Development at the middle of the sheet, for the clock.
export function progress(sheet: Sheet) {
  return sheet.developed[
    Math.floor(CELLS_Y / 2) * CELLS_X + Math.floor(CELLS_X / 2)
  ];
}

const rowShift = new Float32Array(CELLS_X);
const rowGain = new Float32Array(CELLS_X);
const rowFog = new Float32Array(CELLS_X);
const cellShift = new Float32Array(CELLS_X * CELLS_Y);
const cellGain = new Float32Array(CELLS_X * CELLS_Y);
const cellFog = new Float32Array(CELLS_X * CELLS_Y);
const columnCell = new Int32Array(FIELD_W);
const columnMix = new Float32Array(FIELD_W);
for (let x = 0; x < FIELD_W; x++) {
  const c = Math.min(CELLS_X - 1.001, Math.max(0, (x + 0.5) / CELL - 0.5));
  columnCell[x] = Math.floor(c);
  columnMix[x] = c - Math.floor(c);
}

// Draws the sheet as it looks now into a FIELD_W × FIELD_H RGBA buffer.
export function render(sheet: Sheet, out: Uint32Array) {
  refreshLogs(sheet);
  sheet.dirty = false;
  const { logSoft, logHard, developed } = sheet;
  const paper = PAPERS[sheet.paper];
  const tones = toneTable(sheet.paper);
  const dmax = paper.dmax;
  const dry = sheet.dry ? paper.dryDown : 1;
  for (let i = 0; i < developed.length; i++) {
    const u = developed[i];
    cellShift[i] = speedShift(u);
    cellGain[i] = gain(u) * dmax * dry;
    cellFog[i] = (chemicalFog(u) + sheet.printOut) * dry;
  }
  const dScale = (D_STEPS - 1) / D_MAX;
  const sScale = (SAT_STEPS - 1) / SAT_MAX;
  for (let y = 0; y < FIELD_H; y++) {
    const c = Math.min(CELLS_Y - 1.001, Math.max(0, (y + 0.5) / CELL - 0.5));
    const r0 = Math.floor(c) * CELLS_X;
    const r1 = r0 + CELLS_X;
    const t = c - Math.floor(c);
    for (let x = 0; x < CELLS_X; x++) {
      rowShift[x] =
        cellShift[r0 + x] + (cellShift[r1 + x] - cellShift[r0 + x]) * t;
      rowGain[x] = cellGain[r0 + x] + (cellGain[r1 + x] - cellGain[r0 + x]) * t;
      rowFog[x] = cellFog[r0 + x] + (cellFog[r1 + x] - cellFog[r0 + x]) * t;
    }
    let i = y * FIELD_W;
    for (let x = 0; x < FIELD_W; x++, i++) {
      const cx = columnCell[x];
      const m = columnMix[x];
      const shift = rowShift[cx] + (rowShift[cx + 1] - rowShift[cx]) * m;
      const g = rowGain[cx] + (rowGain[cx + 1] - rowGain[cx]) * m;
      let density = rowFog[cx] + (rowFog[cx + 1] - rowFog[cx]) * m;
      if (g > 0) {
        const silver =
          softTable[logIndex(logSoft[i] + shift)] +
          hardTable[logIndex(logHard[i] + shift)];
        const s = (silver * sScale) | 0;
        density += g * saturation[s < SAT_STEPS ? s : SAT_STEPS - 1];
      }
      const d = (density * dScale) | 0;
      out[i] = tones[d < D_STEPS ? (d < 0 ? 0 : d) : D_STEPS - 1];
    }
  }
}
