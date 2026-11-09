// Starting swings for the harmonograph. Each sets the three pendulums' lengths (pivot to bob, in
// millimetres, which fixes how fast each swings) and how far and in what phase each is pulled
// before it's let go. Lengths a whisker off a whole-number ratio make the figure turn slowly as
// it shrinks, which is where most of the beauty is; exactly on the ratio, the pen goes back over
// its own line.

export type FigureId =
  | "spiral"
  | "octave"
  | "fifth"
  | "fourth"
  | "pinwheel"
  | "star";

// Rod-top amplitude in millimetres and phase in radians.
type Swing = [number, number];

export type Figure = {
  value: FigureId;
  label: string;
  across: number;
  along: number;
  table: number;
  swing: { across: Swing; along: Swing; tableX: Swing; tableY: Swing };
};

export const FIGURES: Figure[] = [
  {
    value: "spiral",
    label: "Spiral",
    across: 520,
    along: 520,
    table: 520,
    swing: {
      across: [72, 0],
      along: [72, Math.PI / 2],
      tableX: [0, 0],
      tableY: [0, 0],
    },
  },
  {
    value: "octave",
    label: "Octave",
    across: 940,
    along: 236,
    table: 520,
    swing: {
      across: [74, 0],
      along: [58, Math.PI / 3],
      tableX: [0, 0],
      tableY: [0, 0],
    },
  },
  {
    value: "fifth",
    label: "Fifth",
    across: 880,
    along: 392,
    table: 520,
    swing: {
      across: [74, 0],
      along: [70, Math.PI / 5],
      tableX: [0, 0],
      tableY: [0, 0],
    },
  },
  {
    value: "fourth",
    label: "Fourth",
    across: 792,
    along: 447,
    table: 520,
    swing: {
      across: [72, Math.PI / 2],
      along: [72, 0],
      tableX: [0, 0],
      tableY: [0, 0],
    },
  },
  {
    value: "pinwheel",
    label: "Pinwheel",
    across: 900,
    along: 900,
    table: 101,
    swing: {
      across: [44, 0],
      along: [44, Math.PI / 2],
      tableX: [24, 0],
      tableY: [24, -Math.PI / 2],
    },
  },
  {
    value: "star",
    label: "Star",
    across: 600,
    along: 600,
    table: 268,
    swing: {
      across: [52, 0],
      along: [52, Math.PI / 2],
      tableX: [30, 0],
      tableY: [30, -Math.PI / 2],
    },
  },
];
