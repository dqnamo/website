// The pencils and the sharpener, in millimetres. A pencil is a stick of lead glued between two
// wooden slats, planed to a section (six flats, three rounded flats or round), lacquered and
// stamped. Its section is described the same way for all of them: flats a given distance from
// the axis, with the corners turned down to a circle, which is how hexagonal pencils come out of
// the planer with slightly softened edges and how a three-sided one gets its fat rounded corners.

export type PencilId = "yellow" | "striped" | "round" | "triangle" | "colour";

export type Rgb = [number, number, number];

export type PencilSpec = {
  id: PencilId;
  label: string;
  grade: string;
  // Flats round the section (0 for round), their distance from the axis, the radius their
  // corners are rounded to, and how far out the rounded corners reach.
  sides: number;
  flat: number;
  rounding: number;
  corner: number;
  // The lead's radius.
  lead: number;
  // A new one, and the used one you're handed to begin with.
  length: number;
  usedLength: number;
  // Lacquer on alternate flats (the same colour for most), the primer under it, the end.
  paint: Rgb;
  paint2: Rgb;
  primer: Rgb;
  end: "eraser" | "dipped";
  endColour: Rgb;
  // The stamp along one flat and the foil it's pressed in.
  stamp: string;
  foil: Rgb;
  wood: "cedar" | "lime";
  core: Rgb;
  // How much the core shines, how dark it writes and how fast it wears (1 is HB), and how well
  // it stands up to being turned in the sharpener.
  sheen: number;
  darkness: number;
  softness: number;
  strength: number;
  note: string;
};

const hex = (value: string): Rgb => {
  const n = Number.parseInt(value.slice(1), 16);
  return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

export const PENCILS: PencilSpec[] = [
  {
    id: "yellow",
    label: "Yellow HB",
    grade: "HB",
    sides: 6,
    flat: 3.5,
    rounding: 0.5,
    corner: 3.97,
    lead: 1.0,
    length: 175,
    usedLength: 148,
    paint: hex("#f0b51e"),
    paint2: hex("#f0b51e"),
    primer: hex("#f4ead2"),
    end: "eraser",
    endColour: hex("#e9878a"),
    stamp: "DQNAMO  ✦  LAB  ✦  HB",
    foil: hex("#c9973a"),
    wood: "cedar",
    core: hex("#3b3d42"),
    sheen: 0.55,
    darkness: 0.62,
    softness: 1,
    strength: 1,
    note: "Six flats, so the cone meets the corners further back than the flats and the painted edge of every shaving waves six times a turn.",
  },
  {
    id: "striped",
    label: "Striped 2B",
    grade: "2B",
    sides: 6,
    flat: 3.5,
    rounding: 0.5,
    corner: 3.97,
    lead: 1.05,
    length: 175,
    usedLength: 152,
    paint: hex("#1f1f22"),
    paint2: hex("#f2c12e"),
    primer: hex("#efe6cf"),
    end: "dipped",
    endColour: hex("#1f1f22"),
    stamp: "DQNAMO  ✦  2B",
    foil: hex("#cfd3da"),
    wood: "cedar",
    core: hex("#323338"),
    sheen: 0.62,
    darkness: 0.74,
    softness: 1.5,
    strength: 0.8,
    note: "Black and yellow flats in turn: each shaving's edge comes out in alternating black and yellow scallops.",
  },
  {
    id: "round",
    label: "Round 6B",
    grade: "6B",
    sides: 0,
    flat: 3.65,
    rounding: 0,
    corner: 3.65,
    lead: 1.4,
    length: 175,
    usedLength: 140,
    paint: hex("#24493b"),
    paint2: hex("#24493b"),
    primer: hex("#e9e2cf"),
    end: "dipped",
    endColour: hex("#efe8d8"),
    stamp: "DQNAMO  ✦  6B",
    foil: hex("#d4ad55"),
    wood: "cedar",
    core: hex("#28292d"),
    sheen: 0.8,
    darkness: 0.95,
    softness: 3.2,
    strength: 0.32,
    note: "Round, so the painted edge runs straight. A soft, thick lead: it writes black, wears fast and snaps in the sharpener unless you turn it gently.",
  },
  {
    id: "triangle",
    label: "Three-sided 2H",
    grade: "2H",
    sides: 3,
    flat: 2.9,
    rounding: 1.8,
    corner: 4.0,
    lead: 0.95,
    length: 175,
    usedLength: 150,
    paint: hex("#2b56a8"),
    paint2: hex("#2b56a8"),
    primer: hex("#f1ece0"),
    end: "dipped",
    endColour: hex("#f1ece0"),
    stamp: "DQNAMO  ✦  2H",
    foil: hex("#e9e6df"),
    wood: "cedar",
    core: hex("#4a4d54"),
    sheen: 0.35,
    darkness: 0.34,
    softness: 0.45,
    strength: 1.6,
    note: "Three rounded flats, so just three deep scallops a turn. A hard lead: pale and slow to wear.",
  },
  {
    id: "colour",
    label: "Vermilion",
    grade: "Colour",
    sides: 0,
    flat: 3.6,
    rounding: 0,
    corner: 3.6,
    lead: 1.65,
    length: 175,
    usedLength: 144,
    paint: hex("#c8392d"),
    paint2: hex("#c8392d"),
    primer: hex("#f6f1e6"),
    end: "dipped",
    endColour: hex("#c8392d"),
    stamp: "DQNAMO  ✦  VERMILION 318",
    foil: hex("#f2eee6"),
    wood: "lime",
    core: hex("#c9332a"),
    sheen: 0,
    darkness: 0.8,
    softness: 2.4,
    strength: 0.42,
    note: "A waxy colour core twice as thick as a graphite one, in pale lime wood: the shavings come with a red inner edge, and the point is fragile.",
  },
];

export const pencilIndex = (id: PencilId) =>
  Math.max(
    0,
    PENCILS.findIndex((p) => p.id === id),
  );

// The sharpener: a one-hole block with the blade screwed down over a conical bore. The bore's
// half-angle sets the point: about 11.5° for an ordinary point, 8° for a long one. How far the
// pencil feeds in a turn is how thick the shaving is.
export type PointId = "standard" | "long";
export type BladeId = "sharp" | "dull";
export type BodyId = "magnesium" | "brass";

export const HALF_ANGLE: Record<PointId, number> = {
  standard: (11.5 * Math.PI) / 180,
  long: (8 * Math.PI) / 180,
};
// Millimetres the pencil advances a turn. A dull blade bites less.
export const FEED: Record<BladeId, number> = { sharp: 0.7, dull: 0.45 };
export const BORE = 4.1;
export const BODY = { width: 17, height: 13, axis: 6.5, beyond: 3.5 };

export const boreLength = (point: PointId) =>
  BORE / Math.tan(HALF_ANGLE[point]);
export const bodyLength = (point: PointId) =>
  boreLength(point) + BODY.beyond + 3.5;

// How far the section reaches from the axis at angle g, measured in the pencil's own frame with
// the first flat facing g = 0: out to the flat, or round its rounded corner.
export function reach(
  g: number,
  sides: number,
  flat: number,
  rounding: number,
) {
  if (sides === 0) return flat;
  const half = Math.PI / sides;
  let d = (((g + half) % (2 * half)) + 2 * half) % (2 * half);
  d = Math.abs(d - half);
  const inner = flat - rounding;
  if (flat * Math.tan(d) <= inner * Math.tan(half)) return flat / Math.cos(d);
  const centre = inner / Math.cos(half);
  const along = centre * Math.cos(half - d);
  const across = centre * Math.sin(half - d);
  return along + Math.sqrt(Math.max(0, rounding * rounding - across * across));
}
