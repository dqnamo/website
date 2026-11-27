// The glass side of a neon sign: the colours a sign-maker can order, and how a line drawn on
// the pattern becomes a tube that could really be bent.
//
// A tube's colour is two choices multiplied together. The gas is either neon, which glows
// orange-red by itself, or argon with a drop of mercury, whose light is mostly ultraviolet and
// a deep blue. The glass is either clear, tinted (red glass over neon makes ruby; yellow
// uranium glass over argon makes green) or coated inside with a phosphor that turns the
// mercury's ultraviolet into pink, white, yellow or purple. That's why coated tubes look white
// when they're off and clear ones look like nothing at all.
//
// Glass is bent hot over a burner, and 12 mm tube won't go round much tighter than its own
// width without kinking, so every corner in a drawing comes out as an arc.

export type Vec3 = [number, number, number];
export type Point = { x: number; y: number };

export type Gas = "neon" | "argon";
export type GlassKind = "clear" | "coated" | "tinted";
export type Colour =
  | "red"
  | "ruby"
  | "yellow"
  | "green"
  | "blue"
  | "purple"
  | "pink"
  | "white";

export type ColourSpec = {
  value: Colour;
  label: string;
  gas: Gas;
  glass: GlassKind;
  // Linear RGB of the light from a warm, lit tube, at about equal brightness to the eye.
  lit: Vec3;
  // Argon tubes before the mercury has warmed into vapour: argon's own faint lilac glow, seen
  // through the glass. Neon has nothing to wait for, so it's the same as lit.
  cold: Vec3;
  // The glass when it's off: what clear or tinted glass lets through, or the coating's colour.
  tint: Vec3;
  // CSS colour for the swatch in the panel.
  swatch: string;
  description: string;
};

export const COLOURS: ColourSpec[] = [
  {
    value: "red",
    label: "Red",
    gas: "neon",
    glass: "clear",
    lit: [1, 0.075, 0.014],
    cold: [1, 0.075, 0.014],
    tint: [0.94, 0.96, 0.95],
    swatch: "#ff4a22",
    description:
      "Neon in clear glass. The classic: neon glows orange-red all by itself.",
  },
  {
    value: "ruby",
    label: "Ruby",
    gas: "neon",
    glass: "tinted",
    lit: [0.9, 0.025, 0.03],
    cold: [0.9, 0.025, 0.03],
    tint: [0.55, 0.035, 0.04],
    swatch: "#d3121e",
    description:
      "Neon in red glass, which holds back the orange and leaves a deep red.",
  },
  {
    value: "yellow",
    label: "Yellow",
    gas: "argon",
    glass: "coated",
    lit: [1, 0.64, 0.1],
    cold: [0.2, 0.15, 0.2],
    tint: [0.9, 0.86, 0.68],
    swatch: "#ffbe2e",
    description:
      "Argon and mercury in glass coated with a yellow phosphor. Cream when it's off.",
  },
  {
    value: "green",
    label: "Green",
    gas: "argon",
    glass: "tinted",
    lit: [0.16, 1, 0.1],
    cold: [0.1, 0.12, 0.05],
    tint: [0.66, 0.8, 0.2],
    swatch: "#43e85a",
    description:
      "Argon and mercury in yellow uranium glass, which takes out the blue.",
  },
  {
    value: "blue",
    label: "Blue",
    gas: "argon",
    glass: "clear",
    lit: [0.06, 0.13, 1],
    cold: [0.32, 0.14, 0.62],
    tint: [0.94, 0.96, 0.95],
    swatch: "#2f68ff",
    description:
      "Argon and a drop of mercury in clear glass. Lilac until the mercury warms up.",
  },
  {
    value: "purple",
    label: "Purple",
    gas: "argon",
    glass: "coated",
    lit: [0.36, 0.06, 1],
    cold: [0.18, 0.12, 0.26],
    tint: [0.88, 0.86, 0.92],
    swatch: "#8f45ff",
    description:
      "Argon and mercury in glass coated with a purple phosphor. White when it's off.",
  },
  {
    value: "pink",
    label: "Pink",
    gas: "argon",
    glass: "coated",
    lit: [1, 0.15, 0.4],
    cold: [0.22, 0.13, 0.22],
    tint: [0.94, 0.86, 0.88],
    swatch: "#ff4f9a",
    description:
      "Argon and mercury in glass coated with a pink phosphor. White when it's off.",
  },
  {
    value: "white",
    label: "White",
    gas: "argon",
    glass: "coated",
    lit: [1, 0.85, 0.7],
    cold: [0.2, 0.16, 0.24],
    tint: [0.93, 0.93, 0.91],
    swatch: "#fff1dd",
    description:
      "Argon and mercury in glass coated with a warm white phosphor.",
  },
];

export const COLOUR_BY_VALUE = Object.fromEntries(
  COLOURS.map((colour) => [colour.value, colour]),
) as Record<Colour, ColourSpec>;

// 12 mm tube, the usual size for lettering.
export const TUBE_RADIUS = 6;
// The tightest centreline radius the glass will take.
export const MIN_BEND = 10;
// Shorter than this and there's no room for a tube between its two electrodes.
export const MIN_LENGTH = 30;
// Millimetres between the points along a bent tube.
export const STEP = 2;

function distance(a: Point, b: Point) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function pathLength(points: Point[]) {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += distance(points[i - 1], points[i]);
  }
  return total;
}

// Points every `step` millimetres along a line, keeping both ends.
export function resample(points: Point[], step: number): Point[] {
  if (points.length < 2) return points.slice();
  const out: Point[] = [{ ...points[0] }];
  let carried = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const length = distance(a, b);
    if (length < 1e-6) continue;
    let along = step - carried;
    while (along <= length) {
      const t = along / length;
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
      along += step;
    }
    carried = length - (along - step);
  }
  const last = points[points.length - 1];
  const tail = out[out.length - 1];
  if (distance(tail, last) > step * 0.35) out.push({ ...last });
  else out[out.length - 1] = { ...last };
  return out;
}

function turn(a: Point, b: Point, c: Point) {
  const ux = b.x - a.x;
  const uy = b.y - a.y;
  const vx = c.x - b.x;
  const vy = c.y - b.y;
  return Math.abs(Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy));
}

export type Bent = {
  points: Point[];
  length: number;
  // Whether the drawing asked for a corner tighter than the glass would take.
  sharp: boolean;
};

// Takes a hand-drawn line to the tube a bender would make of it: the hand's wobble smoothed
// out, then every bend opened up until none is tighter than MIN_BEND. Each pass pulls the
// points that turn too sharply towards their neighbours, which spreads a corner into an arc;
// the line is evened out again every few passes so the points stay STEP apart.
export function bend(raw: Point[]): Bent | null {
  if (raw.length < 2 || pathLength(raw) < MIN_LENGTH) return null;
  let points = resample(raw, STEP);
  for (let pass = 0; pass < 3; pass++) {
    const next = points.map((p) => ({ ...p }));
    for (let i = 1; i < points.length - 1; i++) {
      next[i].x = (points[i - 1].x + points[i].x * 2 + points[i + 1].x) / 4;
      next[i].y = (points[i - 1].y + points[i].y * 2 + points[i + 1].y) / 4;
    }
    points = next;
  }
  const allowed = STEP / MIN_BEND;
  let sharp = false;
  for (let i = 1; i < points.length - 1; i++) {
    if (turn(points[i - 1], points[i], points[i + 1]) > allowed * 2.2) {
      sharp = true;
      break;
    }
  }
  for (let pass = 0; pass < 600; pass++) {
    let worst = 0;
    for (let i = 1; i < points.length - 1; i++) {
      const a = points[i - 1];
      const b = points[i];
      const c = points[i + 1];
      const angle = turn(a, b, c);
      const limit = ((distance(a, b) + distance(b, c)) / 2 / MIN_BEND) * 1.02;
      if (angle <= limit) continue;
      worst = Math.max(worst, angle / limit);
      b.x += ((a.x + c.x) / 2 - b.x) * 0.6;
      b.y += ((a.y + c.y) / 2 - b.y) * 0.6;
    }
    if (pass % 6 === 5) points = resample(points, STEP);
    if (worst < 1.04) break;
  }
  points = resample(points, STEP);
  const length = pathLength(points);
  if (length < MIN_LENGTH) return null;
  return { points, length, sharp };
}
