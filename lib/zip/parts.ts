// What a zip is made of. The sizes are a No 5 zip's, roughly: the number is about how many
// millimetres across the teeth are when they're closed, and No 5 is the size on most jackets,
// cushions and bags. Colours are sRGB, 0–1.

export type Teeth = "metal" | "moulded" | "coil";
export type SliderKind = "autolock" | "nonlock" | "worn";
export type Fabric = "waxed" | "denim" | "linen" | "ripstop";
export type Inside = "pocket" | "cushion" | "pencils";

export type Rgb = [number, number, number];

export type TeethSpec = {
  value: Teeth;
  label: string;
  index: number;
  // Millimetres from one tooth to the next on the same tape. The other tape's teeth sit
  // halfway between, so the slider meets a tooth every half pitch.
  pitch: number;
  // From the root of a left tooth to the root of a right one with the zip closed.
  chain: number;
  // How hard a closed pair can be pulled apart, in millimetres of fabric pull, before it lets
  // go. Metal and moulded teeth hook over each other and won't; a coil can burst.
  strength: number;
  // The slider: its length along the teeth, and its width at the shoulder and the throat.
  slider: { length: number; shoulder: number; throat: number };
  pull: { length: number; width: number };
  description: string;
};

export const TEETH: Record<Teeth, TeethSpec> = {
  metal: {
    value: "metal",
    label: "Metal",
    index: 0,
    pitch: 3.3,
    chain: 6,
    strength: Number.POSITIVE_INFINITY,
    slider: { length: 19, shoulder: 10.6, throat: 8.4 },
    pull: { length: 27, width: 8.4 },
    description:
      "Metal teeth pressed on to a corded tape. Each has a nib that nests in a socket on the one opposite, so a closed run can't be pulled apart.",
  },
  moulded: {
    value: "moulded",
    label: "Moulded",
    index: 1,
    pitch: 3.9,
    chain: 6.4,
    strength: Number.POSITIVE_INFINITY,
    slider: { length: 20, shoulder: 11.2, throat: 8.8 },
    pull: { length: 28, width: 9 },
    description:
      "Chunky plastic teeth moulded straight on to the tape. Coarser than metal, so the same pull rattles lower.",
  },
  coil: {
    value: "coil",
    label: "Coil",
    index: 2,
    pitch: 2.5,
    chain: 5.4,
    strength: 24,
    slider: { length: 17, shoulder: 9.6, throat: 7.6 },
    pull: { length: 24, width: 7.6 },
    description:
      "A nylon spiral sewn along each tape. The finest pitch, so it sings highest, and the only one that can burst open under strain and be closed again.",
  },
};

export type SliderSpec = {
  value: SliderKind;
  label: string;
  // Whether a pin drops between the teeth when the pull lies flat.
  locks: boolean;
  // How hard the fabric has to push before an unlocked slider slides, in mm of pull.
  grip: number;
  description: string;
};

export const SLIDERS: Record<SliderKind, SliderSpec> = {
  autolock: {
    value: "autolock",
    label: "Auto-lock",
    locks: true,
    grip: 9,
    description:
      "A sprung pin under the bridge drops between the teeth whenever the pull lies flat, and lifts as soon as you pull on it.",
  },
  nonlock: {
    value: "nonlock",
    label: "Non-lock",
    locks: false,
    grip: 9,
    description:
      "Nothing holds it but friction, so fabric under strain can push it down the teeth by itself.",
  },
  worn: {
    value: "worn",
    label: "Worn",
    locks: false,
    grip: 6,
    description:
      "Years of use have opened its jaws a fraction. The teeth go through without quite locking together, and part again behind it.",
  },
};

// A worn slider leaves pairs this weakly locked, in mm of pull.
export const WEAK = 7;

export type FabricSpec = {
  value: Fabric;
  label: string;
  index: number;
  colour: Rgb;
  tape: Rgb;
  stitch: Rgb;
  // Bare metal for the teeth and slider.
  metal: Rgb;
  swatch: string;
  // The care label sewn into the pocket.
  label1: string;
  label2: string[];
};

export const FABRICS: Record<Fabric, FabricSpec> = {
  waxed: {
    value: "waxed",
    label: "Waxed",
    index: 0,
    colour: [0.27, 0.29, 0.2],
    tape: [0.2, 0.2, 0.16],
    stitch: [0.62, 0.53, 0.36],
    metal: [0.72, 0.56, 0.32],
    swatch: "#454a33",
    label1: "Waxed cotton",
    label2: ["Sponge clean only.", "Re-wax every autumn", "and creases fade."],
  },
  denim: {
    value: "denim",
    label: "Denim",
    index: 1,
    colour: [0.13, 0.18, 0.34],
    tape: [0.16, 0.18, 0.27],
    stitch: [0.86, 0.56, 0.2],
    metal: [0.78, 0.5, 0.3],
    swatch: "#2b3d6b",
    label1: "100% cotton denim",
    label2: ["Wash cold, inside out.", "Indigo rubs off", "where it's worn."],
  },
  linen: {
    value: "linen",
    label: "Linen",
    index: 2,
    colour: [0.76, 0.7, 0.59],
    tape: [0.68, 0.63, 0.54],
    stitch: [0.66, 0.6, 0.5],
    metal: [0.8, 0.8, 0.79],
    swatch: "#c2b396",
    label1: "100% linen",
    label2: ["Wash warm.", "Softer every time", "it's washed."],
  },
  ripstop: {
    value: "ripstop",
    label: "Ripstop",
    index: 3,
    colour: [0.86, 0.36, 0.13],
    tape: [0.08, 0.08, 0.085],
    stitch: [0.1, 0.1, 0.1],
    metal: [0.42, 0.43, 0.46],
    swatch: "#db5c21",
    label1: "Nylon ripstop",
    label2: ["A tear stops at the", "next thick thread", "in the grid."],
  },
};

export type InsideSpec = {
  value: Inside;
  label: string;
  index: number;
  // How full it is to begin with, 0–100.
  fullness: number;
  // The fabric's angle from lying flat, in degrees. A pocket hangs on a jacket, a cushion leans
  // on a sofa, a pencil case lies on the desk, which is what the pull does when you let go.
  tilt: number;
  description: string;
};

export const INSIDES: Record<Inside, InsideSpec> = {
  pocket: {
    value: "pocket",
    label: "Pocket",
    index: 0,
    fullness: 20,
    tilt: 90,
    description:
      "A chest pocket on a jacket, lined in tartan, hanging straight down.",
  },
  cushion: {
    value: "cushion",
    label: "Cushion",
    index: 1,
    fullness: 80,
    tilt: 65,
    description:
      "An overstuffed feather cushion leaning on a sofa: the pad pushes the zip apart from inside.",
  },
  pencils: {
    value: "pencils",
    label: "Pencils",
    index: 2,
    fullness: 45,
    tilt: 0,
    description:
      "A pencil case lying flat on a desk, so the pull stays wherever you leave it.",
  },
};

// The fullness slider, 0–100, as millimetres the fabric would spring apart with nothing
// holding it.
export function spread(fullness: number) {
  return 2 + (fullness / 100) * 17;
}
