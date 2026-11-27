// A lenticular sheet: clear plastic ridged on the front into rows of tiny cylindrical lenses,
// flat at the back, where a print is laid. Each lens is as wide as a strip of the print, and the
// sheet is as thick as the lens's focal length, so a lens shows the eye one narrow slice of the
// strip behind it, which slice depending on the angle it's seen from. The print is cut into as
// many slices as there are pictures, one from each picture under every lens, so turning the card
// turns every lens to the same picture at once.
//
// Everything is in millimetres. These are real sheets: 75 lines an inch for postcards, coarser
// for posters and finer for cards seen up close. A round lens this deep doesn't bring its edges
// to the same focus as its middle, so each sheet is a touch thinner than the middle's focal
// length, where the rays from across the lens land closest together; what spread is left is the
// soft change from one picture to the next.

export type Lpi = 40 | 75 | 100;

export type LensSpec = {
  // Lens to lens, the radius of each lens's curve, and the sheet's thickness at the crests.
  pitch: number;
  radius: number;
  thickness: number;
};

export const LENSES: Record<Lpi, LensSpec> = {
  40: { pitch: 25.4 / 40, radius: 0.41, thickness: 0.98 },
  75: { pitch: 25.4 / 75, radius: 0.22, thickness: 0.52 },
  100: { pitch: 25.4 / 100, radius: 0.165, thickness: 0.39 },
};

// PETG, which most sheets are made of, and water.
export const PLASTIC = 1.57;
export const WATER = 1.333;

// An A6 postcard with rounded corners.
export const CARD = { width: 148, height: 105, corner: 3 };

// The print's strips are spaced a hair wider than the lenses, so that from this far away every
// lens's line of sight lands on the same slice of its strip and the whole card changes at once.
export const DESIGN_DISTANCE = 400;

// How much wider than the lenses the print's strips are, for a card made to be seen from the
// design distance. A line of sight through a lens's centre of curvature goes straight on, so it
// spreads by the depth of that centre below the print over the distance to the eye.
export function printScale(lens: LensSpec) {
  const depth = lens.thickness - lens.radius;
  return 1 + depth / (DESIGN_DISTANCE + lens.radius);
}

type V3 = [number, number, number];

const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

// Snell's law, as GLSL's refract: the normal faces the incoming ray, eta is n1 / n2.
export function refract(d: V3, n: V3, eta: number): V3 | null {
  const c = dot(d, n);
  const k = 1 - eta * eta * (1 - c * c);
  if (k < 0) return null;
  const s = eta * c + Math.sqrt(k);
  return [eta * d[0] - s * n[0], eta * d[1] - s * n[1], eta * d[2] - s * n[2]];
}

// A ray through one lens, in the lens's own frame: x across the lenses (0 at this lens's centre),
// y along them, z out of the sheet (0 at the print). The ray starts above the crest at x and comes
// down along d; this finds where it meets the lens's curve, bends it into the plastic and follows
// it to the print. Null if it misses this lens.
export function throughLens(
  lens: LensSpec,
  x: number,
  d: V3,
  outside = 1,
): { hit: V3; normal: V3; inside: V3; print: number } | null {
  const { radius: r, thickness: t, pitch } = lens;
  // The ray from the crest's height, relative to the centre of curvature.
  const ox = x;
  const oz = r;
  const a = d[0] * d[0] + d[2] * d[2];
  const b = ox * d[0] + oz * d[2];
  const c = ox * ox + oz * oz - r * r;
  const disc = b * b - a * c;
  if (disc < 0 || a < 1e-12) return null;
  const s = (-b - Math.sqrt(disc)) / a;
  const hx = ox + s * d[0];
  if (Math.abs(hx) > pitch / 2 || s < -1e-9) return null;
  const hz = oz + s * d[2];
  const normal: V3 = [hx / r, 0, hz / r];
  const inside = refract(d, normal, outside / PLASTIC);
  if (!inside || inside[2] >= 0) return null;
  const z = t - r + hz;
  const print = hx + (inside[0] * -z) / inside[2];
  return { hit: [hx, s * d[1], z], normal, inside, print };
}

// Which picture a point on the print belongs to, given as a position across the strips in units
// of one strip, counted from the card's edge. The slices under each lens run backwards, since a
// lens shows the eye the side of its strip away from it; phase shifts them so that seen square on
// the card shows a whole picture rather than the join between two. Returns the picture as a
// number whose whole part is the picture and whose fraction is how far across its slice.
export function sliceAt(x: number, frames: number, phase: number) {
  const f = (1 - (x - Math.floor(x)) + phase) * frames;
  return ((f % frames) + frames) % frames;
}
