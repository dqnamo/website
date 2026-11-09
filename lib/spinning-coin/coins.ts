// The things to spin and the tables to spin them on. Sizes are real ones: a large cupronickel
// coin, a small bronze one, an M12 steel washer and a heavy chrome disc of the kind sold to spin
// on a mirror. Drag is per table, in the units physics.ts uses, and each thing scales it: the
// heavy disc has far more mass behind each square millimetre of face, so the air under it and
// the rub of rolling slow it much less.

import type { Disc, Drag } from "./physics";

export type CoinId = "silver" | "copper" | "washer" | "disc";
export type TableId = "oak" | "glass" | "baize" | "slate";

export type CoinSpec = {
  id: CoinId;
  disc: Disc;
  // Multipliers on the table's rolling, air and pivot drag.
  scale: [number, number, number];
  // Whether it has heads and tails to count.
  faces: boolean;
  // 0 plain, otherwise the number of reeds milled round the edge.
  reeds: number;
  // Index into the shader's materials.
  metal: number;
  // Frequencies of its first few ringing modes, in Hz, and how long it rings.
  ring: number[];
  ringFor: number;
  // A brisk flick, in radians a second.
  flick: number;
  note: string;
};

const mm = 0.001;

export const COINS: CoinSpec[] = [
  {
    id: "silver",
    disc: {
      radius: 14.2 * mm,
      thickness: 2.5 * mm,
      edge: 0.6 * mm,
      hole: 0,
      mass: 9.5e-3,
      offset: 0.06 * mm,
    },
    scale: [1, 1, 1],
    faces: true,
    reeds: 150,
    metal: 0,
    ring: [9400, 15800, 21900],
    ringFor: 0.9,
    flick: 95,
    note: "A large cupronickel coin with a milled edge. The wren on its heads side carries more metal than the tails, so its centre of mass sits 0.06 mm towards heads.",
  },
  {
    id: "copper",
    disc: {
      radius: 10.15 * mm,
      thickness: 1.65 * mm,
      edge: 0.45 * mm,
      hole: 0,
      mass: 3.56e-3,
      offset: 0.08 * mm,
    },
    scale: [1, 1, 1],
    faces: true,
    reeds: 0,
    metal: 1,
    ring: [12600, 21400, 29000],
    ringFor: 0.5,
    flick: 110,
    note: "A small bronze coin with a plain edge. At the same lean its contact has less far to go round, so its whirr runs higher, and its heads side is heavy too.",
  },
  {
    id: "washer",
    disc: {
      radius: 12 * mm,
      thickness: 2.5 * mm,
      edge: 0.5 * mm,
      hole: 6.5 * mm,
      mass: 6.3e-3,
      offset: 0,
    },
    scale: [1, 1.15, 1],
    faces: false,
    reeds: 0,
    metal: 2,
    ring: [4100, 7900, 11800],
    ringFor: 1.4,
    flick: 95,
    note: "A zinc-plated M12 washer. With its middle missing it carries its mass further out, so it spins on for longer, and it has no heads or tails to call.",
  },
  {
    id: "disc",
    disc: {
      radius: 37.5 * mm,
      thickness: 13 * mm,
      edge: 4.5 * mm,
      hole: 0,
      mass: 0.45,
      offset: 0,
    },
    scale: [0.5, 0.15, 1.2],
    faces: false,
    reeds: 0,
    metal: 3,
    ring: [5200, 8900, 13100],
    ringFor: 2.2,
    flick: 42,
    note: "A 450 g chrome steel disc with a rounded edge. On glass it rolls for over a minute, and the whirr climbs to around a hundred laps a second before it stops dead.",
  },
];

export type TableSpec = {
  id: TableId;
  drag: Drag;
  // Index into the shader's surfaces.
  surface: number;
  // How the contact sounds on it: loudness, brightness (0–1) and how long it rings.
  loud: number;
  bright: number;
  ring: number;
  note: string;
};

export const TABLES: TableSpec[] = [
  {
    id: "oak",
    drag: { roll: 0.3, air: 0.015, pivot: 0.07 },
    surface: 0,
    loud: 1,
    bright: 0.45,
    ring: 0.25,
    note: "Oiled oak. A good coin spins upright for five seconds or so, then wobbles down for five more.",
  },
  {
    id: "glass",
    drag: { roll: 0.06, air: 0.004, pivot: 0.028 },
    surface: 1,
    loud: 1.25,
    bright: 1,
    ring: 1,
    note: "A thick smoked-glass top, hard and flat, so very little is lost to rolling: everything spins three or four times as long, over its own reflection.",
  },
  {
    id: "baize",
    drag: { roll: 2, air: 0.05, pivot: 0.6 },
    surface: 2,
    loud: 0.3,
    bright: 0,
    ring: 0.05,
    note: "Card-table baize. The rim sinks into the nap and drags, so a coin falls over in a second or two however hard it's flicked.",
  },
  {
    id: "slate",
    drag: { roll: 0.2, air: 0.012, pivot: 0.056 },
    surface: 3,
    loud: 1.1,
    bright: 0.8,
    ring: 0.5,
    note: "Honed slate: hard, a touch less lossy than oak, and loud.",
  },
];

export const coinSpec = (id: CoinId) =>
  COINS.find((c) => c.id === id) ?? COINS[0];
export const tableSpec = (id: TableId) =>
  TABLES.find((t) => t.id === id) ?? TABLES[0];
