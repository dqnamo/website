import { BODIES, type Body, type Finish } from "@/lib/rotary-dial/dial";

export type Settings = {
  body: Body;
  finish: Finish;
  // Pulses a second.
  speed: number;
  // Break as a percentage of each pulse.
  ratio: number;
  sound: boolean;
  // 0–100.
  volume: number;
};

export const COLOURS: { value: Body; label: string; swatch: string }[] = [
  { value: "black", label: "Black", swatch: BODIES.black.case },
  { value: "ivory", label: "Ivory", swatch: BODIES.ivory.case },
  { value: "red", label: "Red", swatch: BODIES.red.case },
  { value: "green", label: "Green", swatch: BODIES.green.case },
];

export const FINISHES: { value: Finish; label: string }[] = [
  { value: "clear", label: "Clear" },
  { value: "chrome", label: "Chrome" },
];

// Ten pulses a second, broken for two thirds of each, as British dials were set.
export const DEFAULTS: Settings = {
  body: "black",
  finish: "clear",
  speed: 10,
  ratio: 67,
  sound: true,
  volume: 60,
};
