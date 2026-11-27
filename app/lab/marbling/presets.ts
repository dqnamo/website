import type { Ink, Tool } from "@/lib/marbling/engine";
import type { PatternId } from "@/lib/marbling/patterns";

export type PaletteId = "ebru" | "endpaper" | "sumi";

export type Settings = {
  tool: Tool;
  palette: PaletteId;
  ink: number;
  cycle: boolean;
  gall: number;
  bath: number;
  tines: number;
};

// Gall water is the same in every palette: ox gall in water, with no colour of its own.
const GALL_WATER: Ink = { name: "Gall water", color: "#e1e2db", clear: true };

// Inks in the order a marbler would float them: the first is pushed furthest, into veins.
export const PALETTES: { value: PaletteId; label: string; inks: Ink[] }[] = [
  {
    value: "ebru",
    label: "Ebru",
    inks: [
      { name: "Indigo", color: "#2b416b" },
      { name: "Madder", color: "#a83f2e" },
      { name: "Verdigris", color: "#447e6e" },
      { name: "Ochre", color: "#c99631" },
      { name: "Lamp black", color: "#29241f" },
      GALL_WATER,
    ],
  },
  {
    value: "endpaper",
    label: "Endpaper",
    inks: [
      { name: "Prussian blue", color: "#1c3864" },
      { name: "Crimson lake", color: "#9b2337" },
      { name: "Gamboge", color: "#dca22b" },
      { name: "Sap green", color: "#5b6f2e" },
      { name: "Ivory black", color: "#1f1d1e" },
      GALL_WATER,
    ],
  },
  {
    value: "sumi",
    label: "Sumi",
    inks: [
      { name: "Sumi", color: "#1d1c1e" },
      { name: "Indigo", color: "#2c3d63" },
      { name: "Bengara", color: "#8c3c2a" },
      { name: "Pale sumi", color: "#78746f" },
      GALL_WATER,
    ],
  },
];

export const TOOLS: { value: Tool; label: string }[] = [
  { value: "drop", label: "Drop" },
  { value: "spatter", label: "Spatter" },
  { value: "stylus", label: "Stylus" },
  { value: "comb", label: "Comb" },
];

export const PATTERNS: { value: PatternId; label: string }[] = [
  { value: "stone", label: "Stone" },
  { value: "come-and-go", label: "Come-and-go" },
  { value: "nonpareil", label: "Nonpareil" },
  { value: "serpentine", label: "Serpentine" },
  { value: "curl", label: "French curl" },
  { value: "rings", label: "Rings" },
];

export const DEFAULTS: Settings = {
  tool: "drop",
  palette: "ebru",
  ink: 0,
  cycle: true,
  gall: 50,
  bath: 55,
  tines: 20,
};

export function inksFor(palette: PaletteId) {
  return (PALETTES.find((entry) => entry.value === palette) ?? PALETTES[0])
    .inks;
}
