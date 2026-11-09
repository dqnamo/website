// The card on the harmonograph's table, and the inks and pens that draw on it. Each paper is a
// sheet 200 mm square, described to the ink simulation by how fast wet ink creeps through it
// (and how much more along its fibres than across them), how long ink stays wet on it, how
// rough it is under the pen, and its colour. Its surface is a texture made here once per sheet:
// tooth (the hills and hollows a dry nib skips across), fibres (the channels wet ink feathers
// along) and a faint mottle in its whiteness.

export type PaperId = "bristol" | "cartridge" | "blotting";
export type PenId = "fineliner" | "nib" | "ballpoint";
export type InkId = "black" | "irongall" | "blue" | "vermilion";

type RGB = [number, number, number];

export type Paper = {
  label: string;
  // sRGB, 0–1.
  colour: RGB;
  // How freely wet ink moves through the sheet, and how much more freely along a fibre. Power
  // says how much that depends on how wet it is: a sized sheet only lets a puddle run, an
  // unsized one wicks even a thin line outwards.
  bleed: number;
  feather: number;
  power: number;
  // Seconds for ink to sink in or dry, for a thin line; a puddle takes longer.
  dry: number;
  // Multiplies the pen's friction.
  rough: number;
  // How deep the tooth is, which shows in raking light and breaks up a dry nib.
  tooth: number;
  fibres: { count: number; length: number; alpha: number };
};

export const PAPERS: Record<PaperId, Paper> = {
  // Hard, smooth and well sized: ink sits on top, stays wet for a while and keeps a crisp edge.
  bristol: {
    label: "Bristol",
    colour: [0.955, 0.953, 0.94],
    bleed: 0.18,
    feather: 0.25,
    power: 2,
    dry: 2.2,
    rough: 0.8,
    tooth: 0.25,
    fibres: { count: 900, length: 2.2, alpha: 0.12 },
  },
  // Ordinary drawing paper: a little give, a little spread.
  cartridge: {
    label: "Cartridge",
    colour: [0.95, 0.93, 0.88],
    bleed: 0.42,
    feather: 0.55,
    power: 1.7,
    dry: 1.1,
    rough: 1,
    tooth: 0.55,
    fibres: { count: 2600, length: 3.2, alpha: 0.2 },
  },
  // Unsized and loose: it drinks ink quickly but lets it run out along every fibre.
  blotting: {
    label: "Blotting",
    colour: [0.94, 0.83, 0.82],
    bleed: 2.2,
    feather: 0.92,
    power: 1,
    dry: 0.8,
    rough: 1.35,
    tooth: 0.85,
    fibres: { count: 7000, length: 5.5, alpha: 0.3 },
  },
};

export type Ink = {
  label: string;
  // Swatch and pen-cap colour, sRGB.
  swatch: string;
  cap: RGB;
  // Optical density per unit of ink, red, green and blue: a line's colour is the paper's times
  // e to the minus this, so lines laid over each other darken the way real ink does.
  dye: RGB;
  // Iron gall carries a nearly colourless ferrous salt that turns black as it meets the air.
  gall: number;
};

export const INKS: Record<InkId, Ink> = {
  black: {
    label: "Black",
    swatch: "#1d1c1b",
    cap: [0.1, 0.1, 0.105],
    dye: [1.75, 1.72, 1.62],
    gall: 0,
  },
  irongall: {
    label: "Iron gall",
    swatch: "#3a4a6a",
    cap: [0.2, 0.25, 0.36],
    dye: [0.88, 0.52, 0.1],
    gall: 1.5,
  },
  blue: {
    label: "Blue",
    swatch: "#2b4fc2",
    cap: [0.14, 0.27, 0.72],
    dye: [1.3, 0.85, 0.1],
    gall: 0,
  },
  vermilion: {
    label: "Vermilion",
    swatch: "#d9472b",
    cap: [0.82, 0.24, 0.14],
    dye: [0.06, 1.05, 1.35],
    gall: 0,
  },
};

// What oxidised iron gall absorbs, per unit of the salt: a slightly brown black.
export const GALL_BLACK: RGB = [1.02, 1.1, 1.2];

export type Pen = {
  label: string;
  // Friction against the paper, before the paper's own roughness.
  friction: number;
};

export const PENS: Record<PenId, Pen> = {
  fineliner: { label: "Fineliner", friction: 0.3 },
  nib: { label: "Dip nib", friction: 0.42 },
  ballpoint: { label: "Ballpoint", friction: 0.13 },
};

// A small seeded generator, so a sheet's texture is the same each time it's made.
function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Value noise on a lattice that wraps, so the texture has no seam to give it away.
function noiseField(size: number, cells: number, random: () => number) {
  const lattice = new Float32Array(cells * cells);
  for (let i = 0; i < lattice.length; i++) lattice[i] = random();
  const out = new Float32Array(size * size);
  const step = cells / size;
  for (let y = 0; y < size; y++) {
    const fy = y * step;
    const iy = Math.floor(fy);
    const ty = fy - iy;
    const sy = ty * ty * (3 - 2 * ty);
    const y0 = (iy % cells) * cells;
    const y1 = ((iy + 1) % cells) * cells;
    for (let x = 0; x < size; x++) {
      const fx = x * step;
      const ix = Math.floor(fx);
      const tx = fx - ix;
      const sx = tx * tx * (3 - 2 * tx);
      const x0 = ix % cells;
      const x1 = (ix + 1) % cells;
      const top = lattice[y0 + x0] + (lattice[y0 + x1] - lattice[y0 + x0]) * sx;
      const bottom =
        lattice[y1 + x0] + (lattice[y1 + x1] - lattice[y1 + x0]) * sx;
      out[y * size + x] = top + (bottom - top) * sy;
    }
  }
  return out;
}

// The sheet's surface as RGBA bytes, size × size over its 200 mm: red is tooth, green is fibre,
// blue is the mottle in its whiteness.
export function paperTexture(id: PaperId, size: number): Uint8Array {
  const paper = PAPERS[id];
  const random = mulberry(id === "bristol" ? 11 : id === "cartridge" ? 23 : 37);
  const fine = noiseField(size, Math.round(size / 3), random);
  const mid = noiseField(size, Math.round(size / 12), random);
  const broad = noiseField(size, 24, random);

  // Fibres are short, slightly bent strokes laid every which way, a little more often along
  // the grain of the sheet (left to right), as they settle on a paper machine's wire.
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  const fibre = new Float32Array(size * size);
  if (ctx) {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = "#fff";
    ctx.lineCap = "round";
    const perMm = size / 200;
    const { count, length, alpha } = paper.fibres;
    for (let i = 0; i < count; i++) {
      const x = random() * size;
      const y = random() * size;
      const along = random() < 0.6;
      const angle = along ? (random() - 0.5) * 1.1 : random() * Math.PI * 2;
      const len = length * perMm * (0.4 + random() * 1.2);
      const bend = (random() - 0.5) * len * 0.5;
      const dx = Math.cos(angle) * len;
      const dy = Math.sin(angle) * len;
      ctx.globalAlpha = alpha * (0.5 + random());
      ctx.lineWidth = perMm * (0.08 + random() * 0.14);
      ctx.beginPath();
      ctx.moveTo(x - dx / 2, y - dy / 2);
      ctx.quadraticCurveTo(
        x - bend * Math.sin(angle),
        y + bend * Math.cos(angle),
        x + dx / 2,
        y + dy / 2,
      );
      ctx.stroke();
    }
    const pixels = ctx.getImageData(0, 0, size, size).data;
    for (let i = 0; i < fibre.length; i++) fibre[i] = pixels[i * 4] / 255;
  }

  const out = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    const tooth = 0.55 * fine[i] + 0.3 * mid[i] + 0.15 * fibre[i];
    out[i * 4] = Math.round(Math.min(1, tooth) * 255);
    out[i * 4 + 1] = Math.round(Math.min(1, fibre[i] * 1.6) * 255);
    out[i * 4 + 2] = Math.round((0.6 * broad[i] + 0.4 * mid[i]) * 255);
    out[i * 4 + 3] = 255;
  }
  return out;
}
