// The magnets that go under the dish, described as magnetic charge on their pole faces. A
// uniformly magnetised block acts like two sheets of charge, plus on its north face and minus on
// its south, so its field is the sum of the inverse-square pulls of those sheets. Each face is
// split into small patches, each carrying its share of the charge, and the field anywhere is the
// sum over the patches. A little softening keeps the field smooth right above a patch.
//
// Lengths are millimetres and fields millitesla. The dish floor is at z = 0 and everything here
// sits below it: a magnet's top face is `gap` below the floor.

export type MagnetKind = "disc" | "ring" | "bar" | "pair" | "coil";

// x, y, z in millimetres and the charge in mT·mm², so a charge q at distance r gives q / r².
export type Charge = [number, number, number, number];

export type Magnet = {
  kind: MagnetKind;
  x: number;
  y: number;
  gap: number;
  // Radians: which way a bar or pair lies.
  angle: number;
  // A disc, ring, bar or coil turned over; for a pair, the second disc turned over.
  flipped: boolean;
  // −1 to 1: the coil's current, as a share of full.
  current: number;
};

export const MAX_CHARGES = 128;
export const SOFTENING = 1.6;

// Sintered neodymium (N52): about 1.4 T. A sheet of charge σ gives σ·2π right at its face, and
// a long magnet's face has half the remanence there, so σ = Br / 4π.
const NEODYMIUM = 1400 / (4 * Math.PI);
// The coil's iron core, driven hard.
const IRON = 1100 / (4 * Math.PI);

// What each magnet is, in millimetres: the sizes you'd buy for this.
export const SIZES = {
  disc: { radius: 10, thickness: 10 },
  ring: { outer: 15, inner: 7, thickness: 6 },
  bar: { length: 50, side: 12 },
  pair: { radius: 10, thickness: 10, apart: 38 },
  coil: { radius: 11, length: 60, bobbin: 19 },
};

// An annulus of charge (a disc when inner is 0) split into rings of patches about `spacing`
// apart. The rings are staggered so the patches don't line up into spokes.
function face(
  out: Charge[],
  cx: number,
  cy: number,
  z: number,
  outer: number,
  inner: number,
  density: number,
  spacing: number,
) {
  const bands = Math.max(1, Math.round((outer - inner) / spacing));
  for (let band = 0; band < bands; band++) {
    const r0 = inner + ((outer - inner) * band) / bands;
    const r1 = inner + ((outer - inner) * (band + 1)) / bands;
    const area = Math.PI * (r1 * r1 - r0 * r0);
    if (r0 === 0) {
      out.push([cx, cy, z, density * area]);
      continue;
    }
    const middle = (r0 + r1) / 2;
    const count = Math.max(6, Math.round((2 * Math.PI * middle) / spacing));
    for (let i = 0; i < count; i++) {
      const a = ((i + 0.5 * band) / count) * Math.PI * 2;
      out.push([
        cx + Math.cos(a) * middle,
        cy + Math.sin(a) * middle,
        z,
        (density * area) / count,
      ]);
    }
  }
}

// A cylinder magnetised along its axis, standing upright: north face up unless flipped. The far
// face is further from the fluid, so it's split more coarsely.
function cylinder(
  out: Charge[],
  cx: number,
  cy: number,
  top: number,
  thickness: number,
  outer: number,
  inner: number,
  density: number,
) {
  face(out, cx, cy, top, outer, inner, density, 3.2);
  face(out, cx, cy, top - thickness, outer, inner, -density, 6.4);
}

export function chargesFor(magnet: Magnet | null): Charge[] {
  const out: Charge[] = [];
  if (!magnet) return out;
  const { x, y, gap, angle } = magnet;
  const top = -gap;
  const sign = magnet.flipped ? -1 : 1;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);

  if (magnet.kind === "disc") {
    const { radius, thickness } = SIZES.disc;
    cylinder(out, x, y, top, thickness, radius, 0, sign * NEODYMIUM);
  } else if (magnet.kind === "ring") {
    const { outer, inner, thickness } = SIZES.ring;
    cylinder(out, x, y, top, thickness, outer, inner, sign * NEODYMIUM);
  } else if (magnet.kind === "pair") {
    const { radius, thickness, apart } = SIZES.pair;
    const dx = (cos * apart) / 2;
    const dy = (sin * apart) / 2;
    cylinder(out, x - dx, y - dy, top, thickness, radius, 0, NEODYMIUM);
    cylinder(out, x + dx, y + dy, top, thickness, radius, 0, sign * NEODYMIUM);
  } else if (magnet.kind === "bar") {
    // Lying flat and magnetised along its length, so its poles are the two square ends.
    const { length, side } = SIZES.bar;
    const patch = side / 3;
    const q = NEODYMIUM * patch * patch;
    for (const end of [1, -1]) {
      const along = (end * length) / 2;
      for (let i = -1; i <= 1; i++) {
        for (let j = 0; j < 3; j++) {
          const across = i * patch;
          out.push([
            x + cos * along - sin * across,
            y + sin * along + cos * across,
            top - patch * (j + 0.5),
            end * sign * q,
          ]);
        }
      }
    }
  } else {
    // An electromagnet: a long iron core in a coil, so only its top pole is near the dish.
    const { radius, length } = SIZES.coil;
    const density = sign * IRON * magnet.current;
    face(out, x, y, top, radius, 0, density, 3.2);
    out.push([x, y, top - length, -density * Math.PI * radius * radius]);
  }
  return out.slice(0, MAX_CHARGES);
}

// The field at a point, the same sum the shader does.
export function fieldAt(
  charges: Charge[],
  x: number,
  y: number,
  z: number,
): [number, number, number] {
  let bx = 0;
  let by = 0;
  let bz = 0;
  const soft = SOFTENING * SOFTENING;
  for (const [cx, cy, cz, q] of charges) {
    const dx = x - cx;
    const dy = y - cy;
    const dz = z - cz;
    const r2 = dx * dx + dy * dy + dz * dz + soft;
    const k = q / (r2 * Math.sqrt(r2));
    bx += dx * k;
    by += dy * k;
    bz += dz * k;
  }
  return [bx, by, bz];
}
