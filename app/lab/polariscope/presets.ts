import type {
  PolariscopeSettings,
  Strip,
  TapeKind,
} from "@/lib/polariscope/engine";

export type Settings = PolariscopeSettings & { sound: boolean };

export const DEFAULTS: Settings = {
  specimen: "tape",
  plate: "none",
  tape: "office",
  locked: false,
  sound: true,
};

export type ArtworkId = "sunburst" | "tartan" | "offcuts";

// Strips are laid in plate units, from the middle of the plate, whose shorter side is 1 long.
type Layout = (halfWidth: number, halfHeight: number) => Strip[];

function strip(
  angle: number,
  from: number,
  to: number,
  kind: TapeKind,
  offset = 0,
  centre = { x: 0, y: 0 },
): Strip {
  const radians = (angle * Math.PI) / 180;
  const ux = Math.cos(radians);
  const uy = Math.sin(radians);
  const ox = centre.x - uy * offset;
  const oy = centre.y + ux * offset;
  return {
    a: { x: ox + ux * from, y: oy + uy * from },
    b: { x: ox + ux * to, y: oy + uy * to },
    kind,
  };
}

// A seeded generator, so a layout comes out the same each time.
function random(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

// Rays from the middle, each a stack of a few layers, so each holds its own colour; turned to
// line up with a filter, a ray goes dark.
const sunburst: Layout = (halfWidth, halfHeight) => {
  const reach = Math.hypot(halfWidth, halfHeight) + 0.05;
  const stacks: [TapeKind, number][] = [
    ["packing", 1],
    ["office", 3],
    ["packing", 2],
    ["office", 4],
    ["packing", 1],
    ["office", 2],
    ["packing", 3],
    ["office", 5],
  ];
  const strips: Strip[] = [];
  for (let i = 0; i < 16; i++) {
    const [kind, layers] = stacks[i % stacks.length];
    for (let k = 0; k < layers; k++) {
      strips.push(strip(i * 22.5 + 11.25, 0.07, reach, kind));
    }
  }
  // A cross of packing tape over the hub, two layers each way: square on, they cancel to black
  // in the middle.
  for (const angle of [45, 135]) {
    for (let k = 0; k < 2; k++) strips.push(strip(angle, -0.1, 0.1, "packing"));
  }
  return strips;
};

// Two families on the diagonals, packing tape one way and office tape the other, each band a
// stack of its own. Square-on layers subtract, so every crossing shows the difference between
// its two stacks: a plaid of colours that neither family has on its own.
const tartan: Layout = (halfWidth, halfHeight) => {
  const reach = Math.hypot(halfWidth, halfHeight) + 0.05;
  // How far from the middle a diagonal band can be and still cross the plate.
  const span = (halfWidth + halfHeight) / Math.SQRT2;
  const lay = (stretch: number) => {
    const strips: Strip[] = [];
    const family = (
      angle: number,
      kind: TapeKind,
      pitch: number,
      shift: number,
      stacks: number[],
    ) => {
      const count = Math.ceil(span / pitch) + 1;
      for (let i = -count; i <= count; i++) {
        const offset = i * pitch + shift;
        if (Math.abs(offset) > span + 0.06) continue;
        const layers =
          stacks[((i % stacks.length) + stacks.length) % stacks.length];
        for (let k = 0; k < layers; k++) {
          strips.push(strip(angle, -reach, reach, kind, offset));
        }
      }
    };
    family(45, "packing", 0.12 * stretch, 0, [1, 2, 3, 2, 1, 3]);
    family(-45, "office", 0.16 * stretch, 0.025, [2, 4, 1, 5, 3]);
    return strips;
  };
  // A wide plate gets broader bands, to stay within what the plate can hold.
  let stretch = 1;
  let strips = lay(stretch);
  while (strips.length > 60) {
    stretch *= 1.1;
    strips = lay(stretch);
  }
  return strips;
};

// Offcuts laid every which way, some of them doubled up, like the bottom of a craft drawer.
const offcuts: Layout = (halfWidth, halfHeight) => {
  const next = random(11);
  const strips: Strip[] = [];
  while (strips.length < 44) {
    const kind: TapeKind = next() < 0.5 ? "packing" : "office";
    // Mostly near the diagonals, where tape shows brightest.
    const angle = (next() < 0.5 ? 45 : 135) + (next() - 0.5) * 60;
    const length = 0.18 + next() * 0.4;
    const centre = {
      x: (next() * 2 - 1) * (halfWidth - 0.1),
      y: (next() * 2 - 1) * (halfHeight - 0.1),
    };
    const layers = 1 + Math.floor(next() * next() * 4);
    for (let k = 0; k < layers; k++) {
      strips.push(strip(angle, -length / 2, length / 2, kind, 0, centre));
    }
  }
  return strips;
};

export const ARTWORKS: { value: ArtworkId; label: string; layout: Layout }[] = [
  { value: "sunburst", label: "Sunburst", layout: sunburst },
  { value: "tartan", label: "Tartan", layout: tartan },
  { value: "offcuts", label: "Offcuts", layout: offcuts },
];
