// A sheet of dry transfer lettering: letters printed in ink on the underside of a clear carrier
// film, over a coat of adhesive. A sheet carries each letter in proportion to how often it's
// used, so there are seven e's for every q, and it runs out of the common ones first. The ink is
// held as a coverage mask at the sheet's own resolution, and every letter remembers where it
// sits, so a typed key can find the next one left. Spacing marks and the maker's small print are
// printed on the film itself and never come off.
//
// Old sheets show their age the way real ones do: the ink film crazes into plates with hairline
// cracks between them, the odd plate has flaked away, and the previous owner has already used a
// good share of the e's, leaving a dull ghost on the film where each one was.

import { type Grid, makeGrid, nearest, random } from "./grid";

export type Face = "grotesque" | "roman" | "blackletter";
export type Ink = "black" | "white" | "red";
export type Age = "fresh" | "aged" | "old";

type FaceSpec = {
  label: string;
  // The face's name as the maker prints it on the sheet.
  name: string;
  catalogue: string;
  // A custom property the site loads the font into, and what to use without it.
  variable: string | null;
  fallback: string;
  weight: number;
  // Font size in CSS pixels on a full-size sheet, picked so the capitals stand about the same
  // height on each face.
  size: number;
};

export const FACES: Record<Face, FaceSpec> = {
  grotesque: {
    label: "Grotesque",
    name: "Grotesque Extra Bold",
    catalogue: "714",
    variable: "--font-inter",
    fallback: '"Helvetica Neue", Helvetica, Arial, sans-serif',
    weight: 800,
    size: 52,
  },
  roman: {
    label: "Roman",
    name: "Old Roman Bold",
    catalogue: "388",
    variable: null,
    fallback: 'Georgia, "Times New Roman", Times, serif',
    weight: 700,
    size: 54,
  },
  blackletter: {
    label: "Blackletter",
    name: "Pirate Black",
    catalogue: "1205",
    variable: "--font-pirata-one",
    fallback: '"Old English Text MT", Georgia, serif',
    weight: 400,
    size: 62,
  },
};

// Ink as it looks pressed to the film, and as it looks once it has let go of it: the adhesive
// lifts from the carrier and the letter turns a dull grey through the film.
export const INKS: Record<
  Ink,
  { ink: [number, number, number]; released: [number, number, number] }
> = {
  black: { ink: [24, 23, 22], released: [146, 149, 152] },
  white: { ink: [247, 245, 239], released: [172, 175, 178] },
  red: { ink: [200, 34, 42], released: [218, 150, 150] },
};

export type AgeSpec = {
  // How readily the adhesive takes to paper under the same pressure.
  grip: number;
  // The plates a letter breaks into when it's only partly rubbed down, in CSS pixels, and how
  // much their breaking point varies from plate to plate.
  plate: number;
  scatter: number;
  // The bond, from 0 to 1, a plate needs on average to come away with the paper.
  threshold: number;
  // Crazing in the ink film: the size of the cracked plates, how deep the hairlines go and how
  // wide they are, both in CSS pixels.
  craze: number;
  crazeDepth: number;
  crazeWidth: number;
  // The share of craze plates that have already flaked off.
  chips: number;
  // The share of the commonest letter the last owner used; rarer letters lose fewer.
  used: number;
  // The carrier yellows and hazes with age.
  film: [number, number, number];
  haze: number;
};

export const AGES: Record<Age, AgeSpec> = {
  fresh: {
    grip: 1,
    plate: 1.3,
    scatter: 0.1,
    threshold: 0.42,
    craze: 0,
    crazeDepth: 0,
    crazeWidth: 0,
    chips: 0,
    used: 0,
    film: [236, 242, 246],
    haze: 0.11,
  },
  aged: {
    grip: 0.7,
    plate: 2.4,
    scatter: 0.2,
    threshold: 0.46,
    craze: 11,
    crazeDepth: 0.4,
    crazeWidth: 0.3,
    chips: 0.01,
    used: 0.2,
    film: [240, 240, 232],
    haze: 0.14,
  },
  old: {
    grip: 0.48,
    plate: 8,
    scatter: 0.3,
    threshold: 0.5,
    craze: 8,
    crazeDepth: 0.85,
    crazeWidth: 0.34,
    chips: 0.03,
    used: 0.45,
    film: [236, 222, 184],
    haze: 0.2,
  },
};

// Capitals, small letters, then figures and points, each letter as many times as a sheet of
// this size carries it.
const COUNTS = {
  capitals: "A2 B C D E2 F G H I J K L M N O2 P Q R S2 T2 U V W X Y Z",
  small:
    "a5 b2 c3 d3 e7 f2 g2 h4 i5 j k l4 m2 n5 o5 p2 q r5 s5 t5 u3 v w2 x y2 z",
  figures: "02 12 2 3 4 5 6 7 8 9 .3 ,2 !2 ? &2 '2 - :",
};

function expand(counts: string) {
  return counts.split(" ").flatMap((entry) => {
    const char = entry[0];
    const times = Number(entry.slice(1)) || 1;
    return Array.from({ length: times }, () => char);
  });
}

// The widest sheet, in CSS pixels; narrower stages get narrower sheets.
export const SHEET_WIDTH = 880;
const SIDE = 22;
const HEADER = 40;
const FOOTER = 44;

export type Glyph = {
  char: string;
  // The origin on the baseline and the advance to the next letter, in sheet CSS pixels.
  x: number;
  y: number;
  advance: number;
  // The ink's bounds, padded a pixel: left, top, right, bottom.
  box: [number, number, number, number];
  // Total coverage when printed, and the share of it still on the film.
  total: number;
  left: number;
};

export type Sheet = {
  face: Face;
  ink: Ink;
  age: Age;
  // CSS pixels, and device pixels at scale k.
  width: number;
  height: number;
  k: number;
  pw: number;
  ph: number;
  // Ink coverage on the film, and the dull trace left where ink has gone, 0–255 per pixel.
  coverage: Uint8Array;
  ghost: Uint8Array;
  glyphs: Glyph[];
  // The non-transferable print: maker's marks and spacing marks.
  print: HTMLCanvasElement;
  font: string;
  size: number;
  capHeight: number;
  space: number;
  // The margin all round that can be held without touching a letter.
  margin: { side: number; top: number; bottom: number };
  // Plates for partial transfers.
  plates: Grid;
};

export function fontFamily(face: Face) {
  const spec = FACES[face];
  const loaded = spec.variable
    ? getComputedStyle(document.documentElement)
        .getPropertyValue(spec.variable)
        .trim()
    : "";
  return loaded ? `${loaded}, ${spec.fallback}` : spec.fallback;
}

export function fontFor(face: Face, scale = 1) {
  const spec = FACES[face];
  return `${spec.weight} ${Math.round(spec.size * scale)}px ${fontFamily(face)}`;
}

// Waits for the face to load, so the sheet isn't printed in the fallback.
export async function loadFace(face: Face) {
  try {
    await document.fonts.load(fontFor(face), "AaEeQq&");
  } catch {
    // The fallback will do.
  }
}

// Prints a sheet the given width in CSS pixels, with its lettering at the given scale.
export function printSheet(
  face: Face,
  ink: Ink,
  age: Age,
  k: number,
  seed: number,
  sheetWidth: number,
  scale: number,
): Sheet {
  const spec = FACES[face];
  const ageSpec = AGES[age];
  const font = fontFor(face, scale);
  const size = Math.round(spec.size * scale);
  const gap = Math.round(18 * scale);
  const rowHeight = Math.round(size * 1.5);
  const baselineOffset = Math.round(size * 0.98);

  const measure = document.createElement("canvas").getContext("2d");
  if (!measure) throw new Error("Canvas 2D is not available.");
  measure.font = font;
  const capHeight = measure.measureText("H").actualBoundingBoxAscent;
  const space = measure.measureText(" ").width || size * 0.26;

  // Lay the letters out in rows, a new row for each group.
  const glyphs: Glyph[] = [];
  let x = SIDE + 10;
  let row = 0;
  const groups = [COUNTS.capitals, COUNTS.small, COUNTS.figures];
  groups.forEach((group, index) => {
    if (index) {
      row++;
      x = SIDE + 10;
    }
    for (const char of expand(group)) {
      const metrics = measure.measureText(char);
      const advance = metrics.width;
      const left = Math.max(0, metrics.actualBoundingBoxLeft);
      const right = Math.max(advance, metrics.actualBoundingBoxRight);
      if (x + left + right + gap > sheetWidth - SIDE - 4) {
        row++;
        x = SIDE + 10;
      }
      const ox = x + left;
      const by = HEADER + row * rowHeight + baselineOffset;
      glyphs.push({
        char,
        x: ox,
        y: by,
        advance,
        box: [
          ox - left - 1,
          by - metrics.actualBoundingBoxAscent - 1,
          ox + metrics.actualBoundingBoxRight + 1,
          by + metrics.actualBoundingBoxDescent + 1,
        ],
        total: 0,
        left: 1,
      });
      x = ox + right + gap;
    }
  });
  const height = HEADER + (row + 1) * rowHeight + FOOTER;

  const pw = Math.ceil(sheetWidth * k);
  const ph = Math.ceil(height * k);

  // The ink, rasterised once and read back as coverage.
  const inkCanvas = document.createElement("canvas");
  inkCanvas.width = pw;
  inkCanvas.height = ph;
  const inkContext = inkCanvas.getContext("2d", { willReadFrequently: true });
  if (!inkContext) throw new Error("Canvas 2D is not available.");
  inkContext.scale(k, k);
  inkContext.font = font;
  inkContext.fillStyle = "#fff";
  inkContext.textBaseline = "alphabetic";
  for (const glyph of glyphs) inkContext.fillText(glyph.char, glyph.x, glyph.y);
  const pixels = inkContext.getImageData(0, 0, pw, ph).data;
  const coverage = new Uint8Array(pw * ph);
  for (let i = 0; i < coverage.length; i++) coverage[i] = pixels[i * 4 + 3];
  const ghost = new Uint8Array(pw * ph);

  const rand = random(seed);

  // Crazing: hairlines along the boundaries of plates, and the odd plate gone altogether. A
  // crazed film that's partly rubbed breaks along those same cracks.
  const craze = ageSpec.craze
    ? makeGrid(pw, ph, ageSpec.craze * k, rand)
    : null;
  const plates =
    craze && ageSpec.plate === ageSpec.craze
      ? craze
      : makeGrid(pw, ph, ageSpec.plate * k, rand);
  if (craze) {
    const width = ageSpec.crazeWidth * k;
    for (let py = 0; py < ph; py++) {
      for (let px = 0; px < pw; px++) {
        const i = py * pw + px;
        if (!coverage[i]) continue;
        const hit = nearest(craze, px + 0.5, py + 0.5);
        if (craze.value[hit.id] < ageSpec.chips) {
          coverage[i] = 0;
          continue;
        }
        const edge = (hit.d2 - hit.d1) / 2;
        if (edge < width) {
          const cut = ageSpec.crazeDepth * (1 - edge / width);
          coverage[i] = Math.round(coverage[i] * (1 - cut));
        }
      }
    }
  }

  // Each letter's total ink, for telling how much of it is left.
  const totalOf = (glyph: Glyph) => {
    const [l, t, r, b] = boxPixels(glyph, k, pw, ph);
    let sum = 0;
    for (let py = t; py < b; py++)
      for (let px = l; px < r; px++) sum += coverage[py * pw + px];
    return sum;
  };
  const counts = new Map<string, number>();
  for (const glyph of glyphs)
    counts.set(glyph.char, (counts.get(glyph.char) ?? 0) + 1);
  const most = Math.max(...counts.values());
  for (const glyph of glyphs) {
    glyph.total = totalOf(glyph) || 1;
    // Letters the last owner used: gone from the film, with a ghost where each one was.
    const share = ageSpec.used * ((counts.get(glyph.char) ?? 1) / most);
    if (rand() < share) {
      const [l, t, r, b] = boxPixels(glyph, k, pw, ph);
      for (let py = t; py < b; py++) {
        for (let px = l; px < r; px++) {
          const i = py * pw + px;
          ghost[i] = coverage[i];
          coverage[i] = 0;
        }
      }
      glyph.left = 0;
    }
  }

  const print = printMarks(face, ink, glyphs, sheetWidth, height, k, size);

  return {
    face,
    ink,
    age,
    width: sheetWidth,
    height,
    k,
    pw,
    ph,
    coverage,
    ghost,
    glyphs,
    print,
    font,
    size,
    capHeight,
    space,
    margin: { side: SIDE, top: HEADER - 8, bottom: FOOTER - 8 },
    plates,
  };
}

// A letter's box in device pixels, clamped to the sheet.
export function boxPixels(glyph: Glyph, k: number, pw: number, ph: number) {
  const [l, t, r, b] = glyph.box;
  return [
    Math.max(0, Math.floor(l * k)),
    Math.max(0, Math.floor(t * k)),
    Math.min(pw, Math.ceil(r * k)),
    Math.min(ph, Math.ceil(b * k)),
  ] as const;
}

// The maker's print, on the top of the film: name and number in the header, how-to in the
// footer, a spacing mark under every letter and corner marks for squaring the sheet up.
function printMarks(
  face: Face,
  ink: Ink,
  glyphs: Glyph[],
  width: number,
  height: number,
  k: number,
  size: number,
) {
  const spec = FACES[face];
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(width * k);
  canvas.height = Math.ceil(height * k);
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.scale(k, k);
  const blue = ink === "white" ? "rgba(120, 170, 235, 0.85)" : "#2d5ea8";
  ctx.fillStyle = blue;
  ctx.strokeStyle = blue;
  const small = fontFamily("grotesque");
  const left = SIDE + 10;
  const right = width - SIDE - 10;

  // The maker's name gives way to the face's on a narrow sheet.
  ctx.textBaseline = "alphabetic";
  ctx.font = `500 9px ${small}`;
  ctx.letterSpacing = "0.6px";
  const label = `${spec.name.toUpperCase()}  ·  48 PT  ·  No. ${spec.catalogue}`;
  const labelWidth = ctx.measureText(label).width;
  ctx.textAlign = "right";
  ctx.fillText(label, right, 24);
  ctx.textAlign = "left";
  ctx.font = `700 9px ${small}`;
  ctx.letterSpacing = "1.4px";
  const maker = "DRY TRANSFER LETTERING";
  if (ctx.measureText(maker).width + labelWidth + 16 < right - left)
    ctx.fillText(maker, left, 24);
  ctx.lineWidth = 0.75;
  ctx.beginPath();
  ctx.moveTo(left, 30.5);
  ctx.lineTo(right, 30.5);
  ctx.stroke();

  ctx.font = `500 8.5px ${small}`;
  ctx.letterSpacing = "0.3px";
  const how =
    "Lay the sheet on clean paper. Rub over a letter until it turns grey all over, then lift the sheet slowly.".split(
      " ",
    );
  const lines: string[] = [];
  for (const word of how) {
    const line = lines.length ? `${lines[lines.length - 1]} ${word}` : word;
    if (lines.length && ctx.measureText(line).width <= right - left)
      lines[lines.length - 1] = line;
    else lines.push(word);
  }
  lines.slice(0, 2).forEach((line, i, all) => {
    ctx.fillText(line, left, height - 14 - (all.length - 1 - i) * 11);
  });

  // Spacing marks: a bar the width of each letter's advance, below its descenders.
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.8;
  for (const glyph of glyphs) {
    const y = Math.round(glyph.y + size * 0.3) + 0.5;
    ctx.beginPath();
    ctx.moveTo(glyph.x, y);
    ctx.lineTo(glyph.x + glyph.advance, y);
    ctx.moveTo(glyph.x + 0.5, y - 2.5);
    ctx.lineTo(glyph.x + 0.5, y + 2.5);
    ctx.moveTo(glyph.x + glyph.advance - 0.5, y - 2.5);
    ctx.lineTo(glyph.x + glyph.advance - 0.5, y + 2.5);
    ctx.stroke();
  }

  ctx.globalAlpha = 1;
  ctx.lineWidth = 0.75;
  const corner = 8;
  for (const [cx, cy, dx, dy] of [
    [10, 10, 1, 1],
    [width - 10, 10, -1, 1],
    [10, height - 10, 1, -1],
    [width - 10, height - 10, -1, -1],
  ]) {
    ctx.beginPath();
    ctx.moveTo(cx + 0.5 * dx, cy + corner * dy);
    ctx.lineTo(cx + 0.5 * dx, cy + 0.5 * dy);
    ctx.lineTo(cx + corner * dx, cy + 0.5 * dy);
    ctx.stroke();
  }
  return canvas;
}
