// The four kinds of stone, and how each one is made up. A nodule is a lump of rock with a cavity
// inside it, and the cavity was filled from the walls inwards, a layer at a time, by silica in
// groundwater. So everything inside is described by how far in from the cavity wall it is:
// fine bands of chalcedony first, sometimes flat layers that settled across the floor of the
// cavity (they were level when they formed, so they still show which way was up), then more
// bands over both, then quartz crystals growing inwards, and in a geode an empty middle that
// the crystals point into. A unit here is 4 cm, so a stone is about 8 cm across.

export type SpecimenId = "amethyst" | "onyx" | "thunderegg" | "fortification";

export type Rgb = [number, number, number];

export type Band = {
  color: Rgb;
  // How much light gets through it (0–1), and how much water and dye it takes up (0–1).
  trans: number;
  porosity: number;
  weight: number;
};

export type SpecimenSpec = {
  id: SpecimenId;
  label: string;
  note: string;
  radii: [number, number, number];
  // Lumps, warts and ridges on the outside.
  rough: [number, number, number];
  skin: [Rgb, Rgb];
  host: Rgb;
  // A thin skin on the cavity wall, before the first band.
  wallSkin: Rgb;
  rind: number;
  bands: Band[];
  // Bands per unit across the walls, how unevenly they're spaced, and bands per unit across
  // the flat layers.
  bandFreq: [number, number, number];
  quartz: Rgb;
  tip: Rgb;
  stain: number;
  botryoidal: number;
  // Crystals per unit along the hollow's wall.
  crystals: number;
};

export type Stone = {
  spec: SpecimenSpec;
  seed: number;
  radii: [number, number, number];
  // Spheres (centre and radius) whose blend is the cavity, and for a thunderegg's star, plates
  // through the centre (normal times reach, and thickness at the middle).
  blobs: number[];
  blobCount: number;
  blobK: number;
  arms: number[];
  armCount: number;
  // How deep the first bands go before the flat layers, the top of the flat layers (or −9 for
  // none), where quartz starts and where the hollow starts (9 for none).
  zones: [number, number, number, number];
  hollow: boolean;
  level: boolean;
  dud: boolean;
};

const band = (
  color: Rgb,
  trans: number,
  porosity: number,
  weight: number,
): Band => ({ color, trans, porosity, weight });

export const SPECIMENS: SpecimenSpec[] = [
  {
    id: "amethyst",
    label: "Amethyst geode",
    note: "A lumpy ball from weathered basalt. Inside, a thin lining of chalcedony and a hollow full of amethyst points, darkest at their tips.",
    radii: [1.0, 0.86, 0.94],
    rough: [0.075, 0.03, 0.0],
    skin: [
      [0.58, 0.55, 0.49],
      [0.34, 0.33, 0.3],
    ],
    host: [0.36, 0.35, 0.33],
    wallSkin: [0.3, 0.38, 0.3],
    rind: 0.12,
    bands: [
      band([0.66, 0.69, 0.72], 0.7, 0.3, 0.38),
      band([0.93, 0.92, 0.9], 0.12, 0.75, 0.24),
      band([0.5, 0.52, 0.55], 0.82, 0.22, 0.2),
      band([0.74, 0.69, 0.76], 0.5, 0.4, 0.14),
      band([0.4, 0.46, 0.4], 0.3, 0.2, 0.04),
    ],
    bandFreq: [70, 0.5, 50],
    quartz: [0.8, 0.79, 0.83],
    tip: [0.42, 0.25, 0.55],
    stain: 0.15,
    botryoidal: 0.016,
    crystals: 8,
  },
  {
    id: "onyx",
    label: "Onyx agate",
    note: "Bands round the walls, then flat layers that settled across the floor of the cavity, then more bands over both, with a little quartz in the middle.",
    radii: [1.0, 0.8, 0.9],
    rough: [0.05, 0.035, 0.0],
    skin: [
      [0.56, 0.54, 0.46],
      [0.36, 0.36, 0.31],
    ],
    host: [0.45, 0.46, 0.43],
    wallSkin: [0.28, 0.36, 0.3],
    rind: 0.08,
    bands: [
      band([0.6, 0.65, 0.7], 0.72, 0.28, 0.32),
      band([0.94, 0.93, 0.9], 0.1, 0.8, 0.26),
      band([0.6, 0.36, 0.26], 0.6, 0.4, 0.12),
      band([0.32, 0.34, 0.37], 0.86, 0.18, 0.16),
      band([0.86, 0.8, 0.68], 0.3, 0.6, 0.12),
    ],
    bandFreq: [72, 0.55, 58],
    quartz: [0.84, 0.84, 0.86],
    tip: [0.72, 0.73, 0.76],
    stain: 0.25,
    botryoidal: 0.008,
    crystals: 18,
  },
  {
    id: "thunderegg",
    label: "Thunderegg",
    note: "A knobbly egg of rhyolite. The cavity is a star that opened as the rock dried; agate filled it, sometimes in level layers.",
    radii: [1.0, 0.9, 0.95],
    rough: [0.05, 0.025, 0.07],
    skin: [
      [0.62, 0.5, 0.42],
      [0.42, 0.33, 0.27],
    ],
    host: [0.52, 0.4, 0.35],
    wallSkin: [0.6, 0.5, 0.42],
    rind: 0.05,
    bands: [
      band([0.58, 0.65, 0.74], 0.76, 0.3, 0.42),
      band([0.93, 0.93, 0.92], 0.14, 0.75, 0.2),
      band([0.45, 0.48, 0.53], 0.84, 0.2, 0.18),
      band([0.84, 0.66, 0.34], 0.5, 0.45, 0.12),
      band([0.72, 0.76, 0.8], 0.7, 0.3, 0.08),
    ],
    bandFreq: [80, 0.45, 60],
    quartz: [0.86, 0.86, 0.88],
    tip: [0.76, 0.78, 0.8],
    stain: 0.2,
    botryoidal: 0.006,
    crystals: 18,
  },
  {
    id: "fortification",
    label: "Fortification agate",
    note: "Washed out of glacial gravel, pitted and rusty. Tight red and white bands follow every lobe of the wall, like the plan of a star fort.",
    radii: [0.92, 0.8, 0.86],
    rough: [0.04, 0.045, 0.0],
    skin: [
      [0.62, 0.44, 0.32],
      [0.4, 0.27, 0.2],
    ],
    host: [0.42, 0.3, 0.24],
    wallSkin: [0.6, 0.3, 0.18],
    rind: 0.06,
    bands: [
      band([0.66, 0.2, 0.12], 0.55, 0.35, 0.28),
      band([0.9, 0.52, 0.26], 0.5, 0.45, 0.2),
      band([0.94, 0.92, 0.88], 0.1, 0.8, 0.22),
      band([0.88, 0.8, 0.66], 0.3, 0.6, 0.12),
      band([0.56, 0.52, 0.5], 0.85, 0.2, 0.18),
    ],
    bandFreq: [105, 0.6, 60],
    quartz: [0.86, 0.85, 0.85],
    tip: [0.8, 0.8, 0.8],
    stain: 0.55,
    botryoidal: 0.004,
    crystals: 20,
  },
];

export const specimen = (id: SpecimenId) =>
  SPECIMENS.find((s) => s.id === id) ?? SPECIMENS[0];

// A small seeded generator, so a stone can be made again from its seed.
export function random(seed: number) {
  let s = Math.floor(seed * 2147483647) || 1;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

// Directions spread round a sphere, jittered, for a thunderegg's arms.
function spread(n: number, rand: () => number) {
  const out: [number, number, number][] = [];
  const turn = Math.PI * (3 - Math.sqrt(5));
  const offset = rand() * Math.PI * 2;
  for (let i = 0; i < n; i++) {
    const y = 1 - ((i + 0.5) / n) * 2 + (rand() - 0.5) * 0.3;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const a = i * turn + offset + (rand() - 0.5) * 0.5;
    const v: [number, number, number] = [
      Math.cos(a) * r,
      Math.max(-1, Math.min(1, y)),
      Math.sin(a) * r,
    ];
    const l = Math.hypot(...v);
    out.push([v[0] / l, v[1] / l, v[2] / l]);
  }
  return out;
}

export function makeStone(id: SpecimenId, seed: number): Stone {
  const spec = specimen(id);
  const rand = random(seed);
  const between = (lo: number, hi: number) => lo + rand() * (hi - lo);
  const size = between(0.92, 1.08);
  const radii: [number, number, number] = [
    spec.radii[0] * size * between(0.95, 1.05),
    spec.radii[1] * size * between(0.95, 1.05),
    spec.radii[2] * size * between(0.95, 1.05),
  ];
  const blobs: number[] = [];
  const arms: number[] = [];
  let blobK = 0.1;
  let zones: [number, number, number, number] = [9, -9, 9, 9];
  let dud = false;
  const blob = (x: number, y: number, z: number, r: number) =>
    blobs.push(x, y, z, r);
  // Scaled to the stone, so the rind keeps its thickness.
  const inner = (v: number, axis: 0 | 1 | 2) => v * radii[axis];

  if (id === "amethyst") {
    const r = Math.min(...radii);
    blob(
      inner(between(-0.04, 0.04), 0),
      inner(between(-0.05, 0.02), 1),
      0,
      r * 0.78,
    );
    for (let i = 0; i < 3; i++) {
      blob(
        inner(between(-0.1, 0.1), 0),
        inner(between(-0.08, 0.05), 1),
        inner(between(-0.1, 0.1), 2),
        r * between(0.56, 0.64),
      );
    }
    blobK = 0.16;
    dud = rand() < 0.14;
    zones = [9, -9, 0.1, dud ? 9 : 0.17];
  } else if (id === "onyx") {
    const r = Math.min(...radii);
    const tilt = between(-0.4, 0.4);
    for (let i = 0; i < 3; i++) {
      const t = (i - 1) * 0.26;
      blob(
        inner(t * Math.cos(tilt), 0),
        inner(t * Math.sin(tilt) * 0.5 + between(-0.04, 0.04), 1),
        inner(between(-0.1, 0.1), 2),
        r * between(0.6, 0.66),
      );
    }
    blobK = 0.2;
    // The floor is the lowest point of the cavity; the layers fill a third of its height.
    let lo = Number.POSITIVE_INFINITY;
    let hi = Number.NEGATIVE_INFINITY;
    for (let i = 0; i < blobs.length; i += 4) {
      lo = Math.min(lo, blobs[i + 1] - blobs[i + 3]);
      hi = Math.max(hi, blobs[i + 1] + blobs[i + 3]);
    }
    const hollow = rand() < 0.5;
    zones = [
      0.07,
      lo + (hi - lo) * between(0.34, 0.46),
      0.34,
      hollow ? 0.4 : 9,
    ];
  } else if (id === "thunderegg") {
    const n = 3 + Math.floor(rand() * 2);
    for (const d of spread(n, rand)) {
      const len = between(0.7, 0.84);
      arms.push(
        d[0] * len * radii[0],
        d[1] * len * radii[1],
        d[2] * len * radii[2],
        between(0.14, 0.2),
      );
    }
    blob(0, 0, 0, between(0.16, 0.2));
    blobK = 0.08;
    const level = rand() < 0.55;
    const hollow = rand() < 0.25;
    zones = [
      0.035,
      level ? between(-0.16, -0.04) : -9,
      0.13,
      hollow ? 0.16 : 9,
    ];
  } else {
    const r = Math.min(...radii);
    const n = 8;
    for (let i = 0; i < n; i++) {
      const a = rand() * Math.PI * 2;
      const b = Math.acos(between(-1, 1));
      const d = between(0.2, 0.42) * r;
      blob(
        Math.cos(a) * Math.sin(b) * d,
        Math.cos(b) * d * 0.8,
        Math.sin(a) * Math.sin(b) * d,
        r * between(0.34, 0.46),
      );
    }
    blobK = 0.035;
    zones = [9, -9, 0.24, 9];
  }

  return {
    spec,
    seed,
    radii,
    blobs,
    blobCount: blobs.length / 4,
    blobK,
    arms,
    armCount: arms.length / 4,
    zones,
    hollow: zones[3] < 5,
    level: zones[1] > -5,
    dud,
  };
}

// The cavity without its fine detail, to tell whether a cut passes through it at all.
export function cutMeetsCavity(stone: Stone, n: number[], c: number) {
  for (let i = 0; i < stone.blobCount; i++) {
    const b = stone.blobs.slice(i * 4, i * 4 + 4);
    const d = b[0] * n[0] + b[1] * n[1] + b[2] * n[2] - c;
    if (Math.abs(d) < b[3] * 0.9) return true;
  }
  for (let i = 0; i < stone.armCount; i++) {
    const a = stone.arms.slice(i * 4, i * 4 + 4);
    const reach = Math.hypot(a[0], a[1], a[2]);
    const m = [a[0] / reach, a[1] / reach, a[2] / reach];
    // How far the plate's own plane leans from the cut's: a plate across the cut reaches it
    // over its whole width, one lying along it only near the middle.
    const along = Math.abs(m[0] * n[0] + m[1] * n[1] + m[2] * n[2]);
    if (Math.abs(c) < reach * Math.sqrt(1 - along * along) * 0.8) return true;
  }
  return false;
}
