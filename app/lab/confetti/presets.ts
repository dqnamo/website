import type { ConfettiSettings, Shape } from "@/lib/confetti/engine";

export type PaletteId =
  | "studio"
  | "pastel"
  | "primary"
  | "ink"
  | "gold"
  | "silver";

// The panel's settings: the engine's, with the palette by name.
export type Settings = Omit<ConfettiSettings, "colors"> & {
  palette: PaletteId;
};

// Colours starting with "--" are the site's theme colours, so ink stays legible in either theme.
export const PALETTES: { value: PaletteId; label: string; colors: string[] }[] =
  [
    {
      value: "studio",
      label: "Studio",
      colors: [
        "#ff6a55",
        "#ffb938",
        "#34c98e",
        "#3d8bfd",
        "#7c6cf2",
        "#ff85b3",
      ],
    },
    {
      value: "pastel",
      label: "Pastel",
      colors: [
        "#ffb3c6",
        "#ffd98a",
        "#a8e6c4",
        "#a9d1ff",
        "#cdb8ff",
        "#ffc9a8",
      ],
    },
    {
      value: "primary",
      label: "Primary",
      colors: ["#e63946", "#1d4ed8", "#f4c430", "--gray-12"],
    },
    {
      value: "ink",
      label: "Ink",
      colors: ["--gray-12", "--gray-11", "--gray-9", "--gray-7"],
    },
    {
      value: "gold",
      label: "Gold",
      colors: ["#f6d58a", "#e3b552", "#c9952f", "#a8741c", "#fff1c9"],
    },
    {
      value: "silver",
      label: "Silver",
      colors: ["#f4f6f8", "#d9dee3", "#b9c1c9", "#9aa3ad"],
    },
  ];

export const SHAPES: { value: Shape; label: string }[] = [
  { value: "strip", label: "Strips" },
  { value: "square", label: "Squares" },
  { value: "circle", label: "Dots" },
  { value: "triangle", label: "Triangles" },
  { value: "star", label: "Stars" },
  { value: "streamer", label: "Streamers" },
];

const CELEBRATE: Settings = {
  pattern: "cannons",
  amount: 220,
  spread: 50,
  power: 62,
  gravity: 50,
  air: 50,
  wind: 0,
  gusts: 30,
  tumble: 55,
  size: 10,
  shapes: ["strip", "square", "circle", "streamer"],
  palette: "studio",
  finish: "paper",
};

export const PRESETS: { value: string; label: string; settings: Settings }[] = [
  { value: "celebrate", label: "Celebrate", settings: CELEBRATE },
  {
    // A small pop for a finished task: a few pieces, close by, in the theme's ink.
    value: "subtle",
    label: "Subtle",
    settings: {
      ...CELEBRATE,
      pattern: "burst",
      amount: 60,
      spread: 70,
      power: 24,
      gravity: 55,
      air: 55,
      gusts: 10,
      tumble: 50,
      size: 7,
      shapes: ["strip", "circle"],
      palette: "ink",
    },
  },
  {
    value: "fountain",
    label: "Fountain",
    settings: {
      ...CELEBRATE,
      pattern: "fountain",
      amount: 320,
      spread: 26,
      power: 72,
      gravity: 60,
      air: 45,
      gusts: 25,
      tumble: 60,
      size: 9,
      shapes: ["strip", "square", "circle", "triangle"],
      palette: "primary",
    },
  },
  {
    value: "gold",
    label: "Gold",
    settings: {
      ...CELEBRATE,
      pattern: "burst",
      amount: 200,
      spread: 360,
      power: 30,
      gravity: 40,
      air: 55,
      gusts: 20,
      tumble: 50,
      size: 10,
      shapes: ["strip", "square", "star"],
      palette: "gold",
      finish: "foil",
    },
  },
  {
    value: "drift",
    label: "Drift",
    settings: {
      ...CELEBRATE,
      pattern: "rain",
      amount: 240,
      gravity: 38,
      air: 55,
      wind: 30,
      gusts: 40,
      tumble: 40,
      size: 9,
      shapes: ["circle", "square", "strip"],
      palette: "pastel",
    },
  },
  {
    value: "holo",
    label: "Holo",
    settings: {
      ...CELEBRATE,
      amount: 240,
      spread: 44,
      power: 66,
      gravity: 45,
      tumble: 70,
      size: 11,
      shapes: ["strip", "square", "star"],
      palette: "silver",
      finish: "holo",
    },
  },
];

export const DEFAULTS = CELEBRATE;

// The preset the settings still match, if any: once a control moves off it, none is selected.
export function matchPreset(settings: Settings) {
  const shapes = [...settings.shapes].sort().join();
  return (
    PRESETS.find(({ settings: preset }) =>
      (Object.keys(preset) as (keyof Settings)[]).every((key) =>
        key === "shapes"
          ? [...preset.shapes].sort().join() === shapes
          : preset[key] === settings[key],
      ),
    )?.value ?? null
  );
}

export function colorsFor(palette: PaletteId) {
  return PALETTES.find((entry) => entry.value === palette)?.colors ?? [];
}
