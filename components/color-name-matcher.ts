const CSS_COLOR_NAMES = [
  "alice blue",
  "antique white",
  "aqua",
  "aquamarine",
  "azure",
  "beige",
  "bisque",
  "black",
  "blanched almond",
  "blue",
  "blue violet",
  "brown",
  "burlywood",
  "cadet blue",
  "chartreuse",
  "chocolate",
  "coral",
  "cornflower blue",
  "cornsilk",
  "crimson",
  "cyan",
  "dark blue",
  "dark cyan",
  "dark goldenrod",
  "dark gray",
  "dark green",
  "dark grey",
  "dark khaki",
  "dark magenta",
  "dark olive green",
  "dark orange",
  "dark orchid",
  "dark red",
  "dark salmon",
  "dark sea green",
  "dark slate blue",
  "dark slate gray",
  "dark slate grey",
  "dark turquoise",
  "dark violet",
  "deep pink",
  "deep sky blue",
  "dim gray",
  "dim grey",
  "dodger blue",
  "firebrick",
  "floral white",
  "forest green",
  "fuchsia",
  "gainsboro",
  "ghost white",
  "gold",
  "goldenrod",
  "gray",
  "green",
  "green yellow",
  "grey",
  "honeydew",
  "hot pink",
  "indian red",
  "indigo",
  "ivory",
  "khaki",
  "lavender",
  "lavender blush",
  "lawn green",
  "lemon chiffon",
  "light blue",
  "light coral",
  "light cyan",
  "light goldenrod yellow",
  "light gray",
  "light green",
  "light grey",
  "light pink",
  "light salmon",
  "light sea green",
  "light sky blue",
  "light slate gray",
  "light slate grey",
  "light steel blue",
  "light yellow",
  "lime",
  "lime green",
  "linen",
  "magenta",
  "maroon",
  "medium aquamarine",
  "medium blue",
  "medium orchid",
  "medium purple",
  "medium sea green",
  "medium slate blue",
  "medium spring green",
  "medium turquoise",
  "medium violet red",
  "midnight blue",
  "mint cream",
  "misty rose",
  "moccasin",
  "navajo white",
  "navy",
  "old lace",
  "olive",
  "olive drab",
  "orange",
  "orange red",
  "orchid",
  "pale goldenrod",
  "pale green",
  "pale turquoise",
  "pale violet red",
  "papaya whip",
  "peach puff",
  "peru",
  "pink",
  "plum",
  "powder blue",
  "purple",
  "rebecca purple",
  "red",
  "rosy brown",
  "royal blue",
  "saddle brown",
  "salmon",
  "sandy brown",
  "sea green",
  "seashell",
  "sienna",
  "silver",
  "sky blue",
  "slate blue",
  "slate gray",
  "slate grey",
  "snow",
  "spring green",
  "steel blue",
  "tan",
  "teal",
  "thistle",
  "tomato",
  "turquoise",
  "violet",
  "wheat",
  "white",
  "white smoke",
  "yellow",
  "yellow green",
] as const;

function normalizeColorName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

const NORMALIZED_COLOR_NAMES = CSS_COLOR_NAMES.map((label) => ({
  cssName: normalizeColorName(label),
  label,
}));

function getEditDistance(source: string, target: string) {
  const distances = Array.from({ length: source.length + 1 }, () =>
    Array<number>(target.length + 1).fill(0),
  );

  for (let sourceIndex = 0; sourceIndex <= source.length; sourceIndex += 1) {
    distances[sourceIndex][0] = sourceIndex;
  }

  for (let targetIndex = 0; targetIndex <= target.length; targetIndex += 1) {
    distances[0][targetIndex] = targetIndex;
  }

  for (let sourceIndex = 1; sourceIndex <= source.length; sourceIndex += 1) {
    for (let targetIndex = 1; targetIndex <= target.length; targetIndex += 1) {
      const substitutionCost =
        source[sourceIndex - 1] === target[targetIndex - 1] ? 0 : 1;

      distances[sourceIndex][targetIndex] = Math.min(
        distances[sourceIndex - 1][targetIndex] + 1,
        distances[sourceIndex][targetIndex - 1] + 1,
        distances[sourceIndex - 1][targetIndex - 1] + substitutionCost,
      );

      if (
        sourceIndex > 1 &&
        targetIndex > 1 &&
        source[sourceIndex - 1] === target[targetIndex - 2] &&
        source[sourceIndex - 2] === target[targetIndex - 1]
      ) {
        distances[sourceIndex][targetIndex] = Math.min(
          distances[sourceIndex][targetIndex],
          distances[sourceIndex - 2][targetIndex - 2] + 1,
        );
      }
    }
  }

  return distances[source.length][target.length];
}

export function findClosestCssColorName(value: string) {
  const normalizedValue = normalizeColorName(value);

  if (normalizedValue.length < 3 || normalizedValue.length > 32) {
    return null;
  }

  const maximumDistance =
    normalizedValue.length <= 4 ? 1 : normalizedValue.length <= 8 ? 2 : 3;
  let closestMatch: (typeof NORMALIZED_COLOR_NAMES)[number] | null = null;
  let closestDistance = maximumDistance + 1;

  for (const colorName of NORMALIZED_COLOR_NAMES) {
    if (
      Math.abs(colorName.cssName.length - normalizedValue.length) >
      maximumDistance
    ) {
      continue;
    }

    const distance = getEditDistance(normalizedValue, colorName.cssName);

    if (distance < closestDistance) {
      closestDistance = distance;
      closestMatch = colorName;
    }
  }

  if (!closestMatch || closestDistance > maximumDistance) {
    return null;
  }

  return {
    ...closestMatch,
    distance: closestDistance,
  };
}
