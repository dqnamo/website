import type {
  DryTransferSettings,
  Paper,
  Tip,
  Tool,
} from "@/lib/dry-transfer/engine";
import type { Age, Face, Ink } from "@/lib/dry-transfer/sheet";

export type Settings = DryTransferSettings;

export const FACES: { value: Face; label: string }[] = [
  { value: "grotesque", label: "Grotesque" },
  { value: "roman", label: "Roman" },
  { value: "blackletter", label: "Blackletter" },
];

export const INKS: { value: Ink; label: string; swatch: string }[] = [
  { value: "black", label: "Black", swatch: "#181716" },
  { value: "white", label: "White", swatch: "#f7f5ef" },
  { value: "red", label: "Red", swatch: "#c8222a" },
];

export const AGES: { value: Age; label: string }[] = [
  { value: "fresh", label: "Fresh" },
  { value: "aged", label: "A few years" },
  { value: "old", label: "Old stock" },
];

export const PAPERS: { value: Paper; label: string; colour: string }[] = [
  { value: "cartridge", label: "Cartridge", colour: "#f5f2ea" },
  { value: "kraft", label: "Kraft", colour: "#b79167" },
  { value: "card", label: "Black card", colour: "#1e1d1c" },
];

export const TOOLS: { value: Tool; label: string }[] = [
  { value: "burnisher", label: "Burnisher" },
  { value: "tape", label: "Tape" },
  { value: "hand", label: "Hand" },
];

export const TIPS: { value: Tip; label: string }[] = [
  { value: "ballpoint", label: "Ballpoint" },
  { value: "spatula", label: "Spatula" },
  { value: "spoon", label: "Spoon" },
];

export const DEFAULTS: Settings = {
  face: "grotesque",
  ink: "black",
  age: "fresh",
  paper: "cartridge",
  tool: "burnisher",
  tip: "ballpoint",
  spacing: 0,
  autoRub: true,
  camera: false,
};

// In the dark, white letters on black card, as a sheet of white would be used.
export const DARK: Pick<Settings, "paper" | "ink"> = {
  paper: "card",
  ink: "white",
};
