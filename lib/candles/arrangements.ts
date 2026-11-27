// Where the candles stand at the start of each arrangement, in centimetres on the table: x to
// the right, z away from you, with the middle of the view at 0. A holder holds one candle or a
// bundle of three tied together, whose flames merge into one.

export type ArrangementId =
  | "single"
  | "bundle"
  | "pair"
  | "triangle"
  | "beside"
  | "row";

export type HolderSpec = { x: number; z: number; bundle: boolean };

export type Arrangement = {
  id: ArrangementId;
  label: string;
  note: string;
  holders: HolderSpec[];
};

// The cups the candles stand in. A bundle's cup is wider, so two bundles can't stand closer
// than 3.4 cm between centres.
export const CUP_SINGLE = 1.15;
export const CUP_BUNDLE = 1.7;

export const ARRANGEMENTS: Arrangement[] = [
  {
    id: "pair",
    label: "Two bundles",
    note: "Two bundles of three, close enough to pulse together. Drag one away by its candles: a little further apart both flames go still, and further again they take turns.",
    holders: [
      { x: -1.7, z: 0, bundle: true },
      { x: 1.7, z: 0, bundle: true },
    ],
  },
  {
    id: "bundle",
    label: "One bundle",
    note: "Three candles tied together burn as one big flame, and a flame that big can't stay still: it stretches, pinches off its tip and shrinks, ten times a second.",
    holders: [{ x: 0, z: 0, bundle: true }],
  },
  {
    id: "triangle",
    label: "Three bundles",
    note: "Three bundles in a triangle, each far enough from the others to want to take turns with it. Three can't all take turns with each other, so the flicker goes round.",
    holders: [
      { x: -4.5, z: -2.6, bundle: true },
      { x: 4.5, z: -2.6, bundle: true },
      { x: 0, z: 5.2, bundle: true },
    ],
  },
  {
    id: "beside",
    label: "Candle and bundle",
    note: "A single candle burns steady on its own, but stood by a flickering bundle it's pushed into flickering with it. Move it away and it settles.",
    holders: [
      { x: -2.6, z: 0, bundle: false },
      { x: 1.6, z: 0, bundle: true },
    ],
  },
  {
    id: "single",
    label: "One candle",
    note: "A single flame is steady: knock it and it bobs a few times, ten times a second, then settles. It can't keep that going by itself.",
    holders: [{ x: 0, z: 0, bundle: false }],
  },
  {
    id: "row",
    label: "Row of five",
    note: "Five single candles, for blowing out one at a time. A wick just blown out smokes wax vapour that will still burn: a match held in it lights it from above.",
    holders: [-10, -5, 0, 5, 10].map((x) => ({ x, z: 0, bundle: false })),
  },
];

export const arrangement = (id: ArrangementId) =>
  ARRANGEMENTS.find((a) => a.id === id) ?? ARRANGEMENTS[0];
