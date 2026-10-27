const STEMS = [
  "Ash",
  "Bramble",
  "Copper",
  "Elm",
  "Fern",
  "Gold",
  "Hazel",
  "Iron",
  "Juniper",
  "Kings",
  "Lark",
  "Marrow",
  "Nettle",
  "Oak",
  "Pike",
  "Quill",
  "Raven",
  "Sable",
  "Thorn",
  "Umber",
  "Willow",
  "Yew",
  "Bright",
  "Fox",
  "Hart",
  "Mill",
  "Salt",
  "Stone",
  "Lantern",
  "Heron",
  "Bell",
  "Clover",
  "Drake",
  "Ember",
  "Frost",
  "Glass",
  "Linden",
  "Moss",
  "Orchard",
  "Sparrow",
];

const ENDINGS = [
  " Cross",
  " Park",
  " Green",
  "gate",
  " Road",
  "wood",
  " Hill",
  "field",
  " Lane",
  "bury",
  " Common",
  " Wharf",
  " Square",
  "ford",
  " End",
  " Rise",
  "ley",
  " Junction",
  " Broadway",
  " Market",
  " Gardens",
  "brook",
  " Heath",
  " Quay",
];

const pick = <T>(xs: readonly T[]) => xs[Math.floor(Math.random() * xs.length)];

export function stationName(taken: Set<string>) {
  for (let i = 0; i < 60; i++) {
    const name = pick(STEMS) + pick(ENDINGS);
    if (!taken.has(name)) return name;
  }
  return `Station ${taken.size + 1}`;
}
