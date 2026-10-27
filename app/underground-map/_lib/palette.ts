export const PALETTE = [
  { name: "Crimson", color: "#E1251B" },
  { name: "Cobalt", color: "#0B3D91" },
  { name: "Emerald", color: "#00843D" },
  { name: "Saffron", color: "#F6C200" },
  { name: "Plum", color: "#8E1F5E" },
  { name: "Sky", color: "#0A9BD7" },
  { name: "Tangerine", color: "#F07D1A" },
  { name: "Umber", color: "#A45A2A" },
  { name: "Rose", color: "#EE9FB8" },
  { name: "Lagoon", color: "#00A79D" },
  { name: "Violet", color: "#6A4C9C" },
  { name: "Slate", color: "#8A949E" },
  { name: "Lime", color: "#84C441" },
  { name: "Ink", color: "#1D1D1F" },
] as const;

export function nextPaletteEntry(usedColors: string[]) {
  const used = new Set(usedColors.map((c) => c.toLowerCase()));
  return (
    PALETTE.find((p) => !used.has(p.color.toLowerCase())) ??
    PALETTE[usedColors.length % PALETTE.length]
  );
}

/** Whether white or dark content reads better on top of this colour. */
export function isLight(hex: string) {
  const h = hex.replace("#", "");
  const n = Number.parseInt(h.length === 3 ? h.replace(/./g, "$&$&") : h, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 165;
}
