import type { GrainKind } from "@/lib/chladni/engine";
import type { PlateShape } from "@/lib/chladni/modes";
import type { Metal } from "@/lib/chladni/plate";

export type Settings = {
  shape: PlateShape;
  metal: Metal;
  grains: GrainKind;
  driver: boolean;
  // The generator's coarse dial in hertz, and its fine one in cents either side.
  coarse: number;
  fine: number;
  amplitude: number;
  bowAt: number;
  sound: boolean;
};

export const DEFAULTS: Settings = {
  shape: "square",
  metal: "steel",
  grains: "sand",
  driver: true,
  // Near the steel square's four-pointed star; it's tuned to the peak once the plate's modes
  // are worked out.
  coarse: 518,
  fine: 0,
  amplitude: 60,
  bowAt: 0.2,
  sound: true,
};

export const SHAPES: { value: PlateShape; label: string }[] = [
  { value: "square", label: "Square" },
  { value: "round", label: "Round" },
];

export const METALS: { value: Metal; label: string; detail: string }[] = [
  { value: "steel", label: "Steel", detail: "0.8 mm steel, painted black" },
  { value: "brass", label: "Brass", detail: "1 mm brass, brushed" },
  { value: "glass", label: "Glass", detail: "1.5 mm glass" },
];

export const GRAINS: { value: GrainKind; label: string; detail: string }[] = [
  { value: "sand", label: "Sand", detail: "Fine dry sand" },
  { value: "salt", label: "Salt", detail: "Table salt, little cubes" },
  {
    value: "spores",
    label: "Spores",
    detail: "Lycopodium: clubmoss spores, light enough to ride the air",
  },
  { value: "both", label: "Both", detail: "Sand and spores together" },
];
