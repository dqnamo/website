import { experimental_evaluate as evaluate } from "ai";
import type {
  JevColorCandidate,
  JevColorComparison,
} from "@/helpers/jev-color-types";

type Rgb = {
  blue: number;
  green: number;
  red: number;
};

type Oklab = {
  a: number;
  b: number;
  lightness: number;
};

type Oklch = {
  chroma: number;
  hue: number;
  lightness: number;
};

type SemanticAnchor = {
  description: string;
  hex: string;
  label: string;
};

const HUE_ANGLES = {
  red: 0,
  vermilion: 15,
  orange: 30,
  amber: 45,
  yellow: 58,
  chartreuse: 88,
  green: 125,
  mint: 155,
  cyan: 185,
  azure: 205,
  blue: 225,
  indigo: 255,
  violet: 280,
  magenta: 310,
  rose: 340,
  neutral: null,
} as const;

const HUE_CRITERIA = {
  red: "Primary red, tomato, cherry, stop signs, or hot embers.",
  vermilion: "A red-orange hue like poppies, paprika, or flame.",
  orange: "A clear orange hue like citrus peel or pumpkins.",
  amber: "A golden orange hue like honey, amber, or warm lamps.",
  yellow: "Yellow like lemons, sunshine, cartoon yellow, or warning signs.",
  chartreuse:
    "A yellow-green hue like chartreuse, tennis balls, or new shoots.",
  green: "A central green hue like leaves, grass, or emeralds.",
  mint: "A blue-green hue like mint, seafoam, or jade.",
  cyan: "Cyan or turquoise like tropical water and bright aqua.",
  azure: "A cyan-blue hue like clear sky, pools, or cerulean.",
  blue: "A central blue hue like cobalt, denim, or royal blue.",
  indigo: "A deep blue-violet hue like ink, indigo dye, or twilight.",
  violet: "Violet or purple like amethyst, lavender, or grapes.",
  magenta: "A red-purple hue like fuchsia, orchids, or electric magenta.",
  rose: "A pink-red hue like roses, watermelon, or hot pink.",
  neutral: "Achromatic black, white, silver, gray, or a nearly neutral color.",
} as const;

const SATURATION_LEVELS = [0, 8, 22, 42, 64, 82, 100] as const;
const LIGHTNESS_LEVELS = [3, 8, 17, 29, 45, 62, 76, 89, 98] as const;
const OKLCH_LIGHTNESS_LEVELS = [
  0.04, 0.1, 0.2, 0.34, 0.5, 0.65, 0.78, 0.9, 0.98,
] as const;
const OKLCH_CHROMA_LEVELS = [0, 0.018, 0.045, 0.08, 0.13, 0.19, 0.27] as const;
const RGB_CHANNEL_LEVELS = [0, 64, 128, 192, 255] as const;
const OKLAB_A_LEVELS = [
  -0.28, -0.21, -0.14, -0.07, 0, 0.07, 0.14, 0.21, 0.28,
] as const;
const OKLAB_B_LEVELS = [
  -0.32, -0.24, -0.16, -0.08, 0, 0.08, 0.16, 0.24, 0.32,
] as const;
const OPACITY_LEVELS = [0.08, 0.25, 0.48, 0.75, 1] as const;

const SEMANTIC_ANCHORS = {
  black: {
    label: "Black",
    hex: "#050505",
    description: "Deep neutral black like ink, soot, or a dark void.",
  },
  charcoal: {
    label: "Charcoal",
    hex: "#27272A",
    description:
      "Very dark soft gray like charcoal, graphite, or dark UI chrome.",
  },
  slate: {
    label: "Slate",
    hex: "#52606D",
    description: "Cool blue-gray like slate stone, overcast skies, or steel.",
  },
  gray: {
    label: "Gray",
    hex: "#808080",
    description: "Balanced middle gray without a strong warm or cool cast.",
  },
  silver: {
    label: "Silver",
    hex: "#C7CBD1",
    description: "Light cool metallic gray like silver or brushed aluminum.",
  },
  white: {
    label: "White",
    hex: "#FFFFFF",
    description: "Clean bright neutral white like fresh paper or snow.",
  },
  ivory: {
    label: "Ivory",
    hex: "#FFFFF0",
    description: "Very pale warm off-white like ivory or candle wax.",
  },
  cream: {
    label: "Cream",
    hex: "#FFF2C7",
    description: "Soft warm creamy white with a gentle yellow cast.",
  },
  beige: {
    label: "Beige",
    hex: "#D9C7A3",
    description: "Quiet pale tan like natural linen, sand, or oatmeal.",
  },
  tan: {
    label: "Tan",
    hex: "#C49A6C",
    description: "Warm medium tan like leather, dry sand, or toasted wheat.",
  },
  camel: {
    label: "Camel",
    hex: "#B98752",
    description: "Rich golden tan like camel hair, caramel, or warm leather.",
  },
  brown: {
    label: "Brown",
    hex: "#795033",
    description: "Natural medium brown like wood, soil, or milk chocolate.",
  },
  chocolate: {
    label: "Chocolate",
    hex: "#542D1E",
    description:
      "Dark warm brown like cocoa, dark chocolate, or roasted coffee.",
  },
  espresso: {
    label: "Espresso",
    hex: "#321E18",
    description: "Near-black brown like espresso beans or deeply stained wood.",
  },
  scarlet: {
    label: "Scarlet",
    hex: "#F23820",
    description: "Bright warm red with an orange cast like flame or poppies.",
  },
  red: {
    label: "Red",
    hex: "#E62929",
    description:
      "Clear primary red like stop signs, ripe cherries, or warning lights.",
  },
  crimson: {
    label: "Crimson",
    hex: "#C8103D",
    description:
      "Deep cool red with a slight blue cast like rich crimson fabric.",
  },
  burgundy: {
    label: "Burgundy",
    hex: "#761B35",
    description: "Dark wine red like burgundy, merlot, or dried roses.",
  },
  brick: {
    label: "Brick",
    hex: "#B44B3A",
    description: "Muted earthy red like fired brick or red clay.",
  },
  terracotta: {
    label: "Terracotta",
    hex: "#C96B4B",
    description:
      "Warm earthy red-orange like terracotta pots or sunbaked clay.",
  },
  coral: {
    label: "Coral",
    hex: "#FF715B",
    description:
      "Lively pink-orange like tropical coral or a warm summer lipstick.",
  },
  salmon: {
    label: "Salmon",
    hex: "#F58A7A",
    description: "Soft warm pink-orange like salmon flesh or a muted coral.",
  },
  peach: {
    label: "Peach",
    hex: "#FFC39B",
    description:
      "Pale friendly orange-pink like peach flesh or warm skin tones.",
  },
  orange: {
    label: "Orange",
    hex: "#FF850A",
    description: "Clear vivid orange like oranges, pumpkins, or safety gear.",
  },
  tangerine: {
    label: "Tangerine",
    hex: "#F56A00",
    description: "Bright juicy red-orange like tangerine peel.",
  },
  burnt_orange: {
    label: "Burnt orange",
    hex: "#C65318",
    description: "Dark toasted orange like autumn leaves or burnt sugar.",
  },
  amber: {
    label: "Amber",
    hex: "#FFB300",
    description:
      "Glowing golden orange like amber, honey, or warm signal lights.",
  },
  gold: {
    label: "Gold",
    hex: "#E8B923",
    description: "Rich metallic yellow-orange like gold jewelry or treasure.",
  },
  sunshine_yellow: {
    label: "Sunshine yellow",
    hex: "#F6D32D",
    description:
      "Warm cheerful bright yellow like sunlight, friendly cartoons, or optimism.",
  },
  yellow: {
    label: "Yellow",
    hex: "#F3E51B",
    description:
      "Clear strong yellow like a highlighter, warning sign, or ripe banana.",
  },
  lemon: {
    label: "Lemon",
    hex: "#FFF44F",
    description:
      "Sharp light yellow with a slight green cast like fresh lemon peel.",
  },
  mustard: {
    label: "Mustard",
    hex: "#C99A1A",
    description:
      "Muted earthy golden yellow like mustard, ochre, or old posters.",
  },
  chartreuse: {
    label: "Chartreuse",
    hex: "#9DDB25",
    description:
      "Electric yellow-green like chartreuse liqueur or tennis balls.",
  },
  lime: {
    label: "Lime",
    hex: "#54D62C",
    description:
      "Bright acidic green like lime peel, neon signs, or fresh sprouts.",
  },
  olive: {
    label: "Olive",
    hex: "#7A7B24",
    description:
      "Muted yellow-green like olives, military cloth, or dry foliage.",
  },
  green: {
    label: "Green",
    hex: "#26A653",
    description:
      "Clear balanced green like healthy leaves, grass, or success indicators.",
  },
  forest: {
    label: "Forest green",
    hex: "#176B3A",
    description: "Deep natural green like pine forest, ivy, or dense foliage.",
  },
  emerald: {
    label: "Emerald",
    hex: "#00A572",
    description: "Rich jewel green with a cool cast like emerald stone.",
  },
  moss: {
    label: "Moss",
    hex: "#6B7D3E",
    description:
      "Muted organic yellow-green like moss, lichen, or woodland floors.",
  },
  sage: {
    label: "Sage",
    hex: "#9CAF88",
    description: "Soft dusty gray-green like sage leaves or calm interiors.",
  },
  mint: {
    label: "Mint",
    hex: "#8DE5B0",
    description: "Pale fresh blue-green like mint ice cream or spring leaves.",
  },
  teal: {
    label: "Teal",
    hex: "#087E7D",
    description:
      "Deep balanced blue-green like teal feathers or dark tropical water.",
  },
  turquoise: {
    label: "Turquoise",
    hex: "#32C7C4",
    description:
      "Bright tropical blue-green like turquoise stone or shallow water.",
  },
  cyan: {
    label: "Cyan",
    hex: "#00CFE0",
    description:
      "Vivid electric cyan between blue and green like digital light.",
  },
  sky_blue: {
    label: "Sky blue",
    hex: "#55BDEB",
    description: "Clear light blue like a bright daytime sky.",
  },
  baby_blue: {
    label: "Baby blue",
    hex: "#9ACFE8",
    description: "Soft pale blue like nursery colors or a hazy spring sky.",
  },
  cerulean: {
    label: "Cerulean",
    hex: "#168AAD",
    description: "Strong clear cyan-blue like deep sky or Mediterranean water.",
  },
  cobalt: {
    label: "Cobalt",
    hex: "#1E4FBF",
    description: "Intense cool blue like cobalt pigment, glass, or enamel.",
  },
  royal_blue: {
    label: "Royal blue",
    hex: "#4169E1",
    description:
      "Vivid authoritative medium blue like royal fabric or heraldry.",
  },
  blue: {
    label: "Blue",
    hex: "#2563EB",
    description:
      "Clear central blue like links, markers, or a saturated evening sky.",
  },
  denim: {
    label: "Denim",
    hex: "#3B6491",
    description:
      "Muted medium blue like worn denim jeans or washed indigo cloth.",
  },
  navy: {
    label: "Navy",
    hex: "#101D55",
    description:
      "Very dark blue like navy uniforms, deep ocean, or night skies.",
  },
  indigo: {
    label: "Indigo",
    hex: "#4B3A9B",
    description: "Deep blue-violet like indigo dye, ink, or twilight.",
  },
  violet: {
    label: "Violet",
    hex: "#8047D6",
    description:
      "Bright cool purple like violets, ultraviolet light, or amethyst.",
  },
  purple: {
    label: "Purple",
    hex: "#7137A8",
    description: "Balanced rich purple between violet and magenta.",
  },
  lavender: {
    label: "Lavender",
    hex: "#B8A3E3",
    description:
      "Soft pale purple like lavender flowers or dreamy pastel decor.",
  },
  plum: {
    label: "Plum",
    hex: "#7B3F72",
    description: "Muted dark red-purple like ripe plums or vintage velvet.",
  },
  magenta: {
    label: "Magenta",
    hex: "#DB2BC2",
    description:
      "Intense red-purple like printer magenta or neon orchid light.",
  },
  hot_pink: {
    label: "Hot pink",
    hex: "#FF4FA3",
    description: "Loud vivid pink like neon fashion, candy, or pop graphics.",
  },
  pink: {
    label: "Pink",
    hex: "#F47DA9",
    description:
      "Clear friendly pink like bubblegum, blossoms, or playful design.",
  },
  rose: {
    label: "Rose",
    hex: "#D94A70",
    description: "Rich romantic red-pink like rose petals or berry lipstick.",
  },
  blush: {
    label: "Blush",
    hex: "#E8A0AF",
    description: "Soft pale warm pink like a gentle blush or delicate petals.",
  },
  dusty_rose: {
    label: "Dusty rose",
    hex: "#B9797F",
    description:
      "Muted grayish pink like dried roses or understated vintage fabric.",
  },
} satisfies Record<string, SemanticAnchor>;

const SEMANTIC_CRITERIA = Object.fromEntries(
  Object.entries(SEMANTIC_ANCHORS).map(([key, anchor]) => [
    key,
    anchor.description,
  ]),
);

const QUESTIONS = {
  colorIntent: {
    type: "boolean",
    instructions:
      "Does `description` communicate a usable single-color intention, either directly or indirectly through an object, character, brand, material, place, mood, or visual association?",
    criteria: {
      true: "A designer could reasonably choose one representative display color from the description.",
      false:
        "The description has no meaningful visual color association or cannot reasonably indicate one color.",
    },
  },
  componentsHue: {
    type: "choice",
    instructions:
      "Which hue family best represents the single display color implied by `description`? Judge the intended visual association, not merely words that appear literally.",
    criteria: HUE_CRITERIA,
  },
  componentsSaturation: {
    type: "score",
    instructions:
      "How saturated should the single display color implied by `description` appear?",
    criteria: [
      "Completely achromatic: black, white, or perfectly gray.",
      "Nearly gray with only a trace of color.",
      "Very muted, dusty, weathered, or desaturated.",
      "Soft and restrained but clearly colored.",
      "Colorful and distinct without looking especially intense.",
      "Strong, vivid, rich, or highly saturated.",
      "Electric, fluorescent, neon, or maximally saturated.",
    ],
  },
  componentsLightness: {
    type: "score",
    instructions:
      "How light or dark should the single display color implied by `description` appear?",
    criteria: [
      "Absolute black or visually indistinguishable from black.",
      "Near-black, ink-dark, or only barely illuminated.",
      "Very dark like deep shadow, espresso, or midnight.",
      "Dark, but its color remains plainly visible.",
      "A balanced middle tone: neither notably dark nor light.",
      "A comfortably light color with substantial body.",
      "Bright and light while still clearly colorful.",
      "Very pale, pastel, washed with white, or almost white.",
      "Pure white or visually indistinguishable from white.",
    ],
  },
  semanticAnchor: {
    type: "choice",
    instructions:
      "Which semantic color anchor is the closest overall match for the single display color an experienced designer would choose for `description`? Consider cultural and visual associations as well as literal color language.",
    criteria: SEMANTIC_CRITERIA,
  },
  semanticChroma: {
    type: "score",
    instructions:
      "How much perceptual colorfulness should the color implied by `description` have, independently of how light or dark it is?",
    criteria: [
      "Neutral with no perceptible colorfulness.",
      "Almost neutral with a faint color cast.",
      "Muted, dusty, weathered, or understated.",
      "Moderately colorful and natural-looking.",
      "Clearly colorful, rich, and lively.",
      "Very vivid, intense, or jewel-like.",
      "Extreme neon, fluorescent, or digitally electric colorfulness.",
    ],
  },
  semanticLightness: {
    type: "score",
    instructions:
      "What perceptual lightness should the color implied by `description` have?",
    criteria: [
      "Absolute black.",
      "Near-black.",
      "Very dark.",
      "Dark.",
      "Balanced middle lightness.",
      "Moderately light.",
      "Bright and light.",
      "Very pale or nearly white.",
      "Pure white.",
    ],
  },
  directRed: {
    type: "score",
    instructions:
      "Estimate the red channel of the single display color implied by `description` in the standard sRGB color space. Judge the final pixel value, not how strongly the description mentions red.",
    criteria: [
      "0: no red channel, as in pure black, green, blue, or cyan.",
      "64: a low red channel contribution.",
      "128: a medium red channel contribution.",
      "192: a high red channel contribution.",
      "255: the maximum red channel, as in pure red, yellow, magenta, or white.",
    ],
  },
  directGreen: {
    type: "score",
    instructions:
      "Estimate the green channel of the single display color implied by `description` in the standard sRGB color space. Judge the final pixel value, not how strongly the description mentions green.",
    criteria: [
      "0: no green channel, as in pure black, red, blue, or magenta.",
      "64: a low green channel contribution.",
      "128: a medium green channel contribution.",
      "192: a high green channel contribution.",
      "255: the maximum green channel, as in pure green, yellow, cyan, or white.",
    ],
  },
  directBlue: {
    type: "score",
    instructions:
      "Estimate the blue channel of the single display color implied by `description` in the standard sRGB color space. Judge the final pixel value, not how strongly the description mentions blue.",
    criteria: [
      "0: no blue channel, as in pure black, red, green, or yellow.",
      "64: a low blue channel contribution.",
      "128: a medium blue channel contribution.",
      "192: a high blue channel contribution.",
      "255: the maximum blue channel, as in pure blue, cyan, magenta, or white.",
    ],
  },
  directOklabLightness: {
    type: "score",
    instructions:
      "Estimate the OKLab perceptual lightness L of the single display color implied by `description`, independently of its hue and colorfulness.",
    criteria: [
      "L 0.04: absolute or near black.",
      "L 0.10: extremely dark.",
      "L 0.20: very dark.",
      "L 0.34: dark but clearly visible.",
      "L 0.50: balanced middle perceptual lightness.",
      "L 0.65: moderately light.",
      "L 0.78: bright and light.",
      "L 0.90: very pale or nearly white.",
      "L 0.98: pure or near white.",
    ],
  },
  directOklabA: {
    type: "score",
    instructions:
      "Estimate the OKLab a opponent axis of the single display color implied by `description`. Negative values are green, zero is neutral on this axis, and positive values are red or magenta.",
    criteria: [
      "a -0.28: extremely green.",
      "a -0.21: strongly green.",
      "a -0.14: clearly green.",
      "a -0.07: subtly green.",
      "a 0.00: neutral between green and red.",
      "a +0.07: subtly red or pink.",
      "a +0.14: clearly red or pink.",
      "a +0.21: strongly red or magenta.",
      "a +0.28: extremely red or magenta.",
    ],
  },
  directOklabB: {
    type: "score",
    instructions:
      "Estimate the OKLab b opponent axis of the single display color implied by `description`. Negative values are blue, zero is neutral on this axis, and positive values are yellow.",
    criteria: [
      "b -0.32: extremely blue.",
      "b -0.24: strongly blue.",
      "b -0.16: clearly blue.",
      "b -0.08: subtly blue.",
      "b 0.00: neutral between blue and yellow.",
      "b +0.08: subtly yellow.",
      "b +0.16: clearly yellow.",
      "b +0.24: strongly yellow.",
      "b +0.32: extremely yellow.",
    ],
  },
  hasTransparency: {
    type: "boolean",
    instructions:
      "Does `description` explicitly imply transparency, translucency, opacity, glassiness, ghostliness, or an alpha level rather than color alone?",
    criteria: {
      true: "Transparency or opacity is part of the requested visual appearance.",
      false: "No transparency is requested; the color should be fully opaque.",
    },
  },
  opacity: {
    type: "score",
    instructions:
      "If `description` implies transparency, how opaque should the resulting color be? Ignore this answer when no transparency is implied.",
    criteria: [
      "Almost invisible or almost fully transparent.",
      "Clearly transparent like tinted glass or a faint ghost.",
      "Half-transparent or evenly translucent.",
      "Mostly opaque with a small amount of transparency.",
      "Completely solid and fully opaque.",
    ],
  },
} as const;

function clamp(value: number, minimum = 0, maximum = 1) {
  return Math.min(maximum, Math.max(minimum, value));
}

function interpolateLevel(score: number, values: readonly number[]) {
  const clampedScore = clamp(score, 0, values.length - 1);
  const lowerIndex = Math.floor(clampedScore);
  const upperIndex = Math.min(values.length - 1, Math.ceil(clampedScore));
  const fraction = clampedScore - lowerIndex;

  return (
    values[lowerIndex] + (values[upperIndex] - values[lowerIndex]) * fraction
  );
}

function maximumProbability(probabilities: Record<string, number> | undefined) {
  if (!probabilities) {
    return 0.5;
  }

  return Math.max(...Object.values(probabilities));
}

function average(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function hexToRgb(hex: string): Rgb {
  const value = hex.replace("#", "");

  return {
    red: Number.parseInt(value.slice(0, 2), 16) / 255,
    green: Number.parseInt(value.slice(2, 4), 16) / 255,
    blue: Number.parseInt(value.slice(4, 6), 16) / 255,
  };
}

function srgbToLinear(value: number) {
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function linearToSrgb(value: number) {
  return value <= 0.0031308
    ? 12.92 * value
    : 1.055 * value ** (1 / 2.4) - 0.055;
}

function rgbToOklab(rgb: Rgb): Oklab {
  const red = srgbToLinear(rgb.red);
  const green = srgbToLinear(rgb.green);
  const blue = srgbToLinear(rgb.blue);
  const l = 0.4122214708 * red + 0.5363325363 * green + 0.0514459929 * blue;
  const m = 0.2119034982 * red + 0.6806995451 * green + 0.1073969566 * blue;
  const s = 0.0883024619 * red + 0.2817188376 * green + 0.6299787005 * blue;
  const lRoot = Math.cbrt(l);
  const mRoot = Math.cbrt(m);
  const sRoot = Math.cbrt(s);

  return {
    lightness:
      0.2104542553 * lRoot + 0.793617785 * mRoot - 0.0040720468 * sRoot,
    a: 1.9779984951 * lRoot - 2.428592205 * mRoot + 0.4505937099 * sRoot,
    b: 0.0259040371 * lRoot + 0.7827717662 * mRoot - 0.808675766 * sRoot,
  };
}

function oklabToOklch(color: Oklab): Oklch {
  return {
    lightness: color.lightness,
    chroma: Math.sqrt(color.a ** 2 + color.b ** 2),
    hue: ((Math.atan2(color.b, color.a) * 180) / Math.PI + 360) % 360,
  };
}

function oklchToRawRgb(color: Oklch): Rgb {
  const hueRadians = (color.hue * Math.PI) / 180;
  const a = color.chroma * Math.cos(hueRadians);
  const b = color.chroma * Math.sin(hueRadians);
  const lRoot = color.lightness + 0.3963377774 * a + 0.2158037573 * b;
  const mRoot = color.lightness - 0.1055613458 * a - 0.0638541728 * b;
  const sRoot = color.lightness - 0.0894841775 * a - 1.291485548 * b;
  const l = lRoot ** 3;
  const m = mRoot ** 3;
  const s = sRoot ** 3;

  return {
    red: linearToSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    green: linearToSrgb(
      -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    ),
    blue: linearToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  };
}

function isRgbInGamut(rgb: Rgb) {
  return [rgb.red, rgb.green, rgb.blue].every(
    (channel) => channel >= 0 && channel <= 1,
  );
}

function oklchToRgb(color: Oklch): Rgb {
  let chroma = color.chroma;
  let rgb = oklchToRawRgb(color);

  if (isRgbInGamut(rgb)) {
    return rgb;
  }

  let lower = 0;
  let upper = chroma;

  for (let index = 0; index < 18; index += 1) {
    chroma = (lower + upper) / 2;
    rgb = oklchToRawRgb({ ...color, chroma });

    if (isRgbInGamut(rgb)) {
      lower = chroma;
    } else {
      upper = chroma;
    }
  }

  return oklchToRawRgb({ ...color, chroma: lower });
}

function componentToHex(value: number) {
  return Math.round(clamp(value) * 255)
    .toString(16)
    .padStart(2, "0")
    .toUpperCase();
}

function rgbToHex(rgb: Rgb, alpha = 1) {
  const opaqueHex = `#${componentToHex(rgb.red)}${componentToHex(rgb.green)}${componentToHex(rgb.blue)}`;

  return alpha >= 0.995 ? opaqueHex : `${opaqueHex}${componentToHex(alpha)}`;
}

function hslToRgb(hue: number, saturation: number, lightness: number): Rgb {
  const normalizedSaturation = clamp(saturation / 100);
  const normalizedLightness = clamp(lightness / 100);
  const chroma =
    (1 - Math.abs(2 * normalizedLightness - 1)) * normalizedSaturation;
  const normalizedHue = ((hue % 360) + 360) % 360;
  const intermediate = chroma * (1 - Math.abs(((normalizedHue / 60) % 2) - 1));
  const offset = normalizedLightness - chroma / 2;
  let red = 0;
  let green = 0;
  let blue = 0;

  if (normalizedHue < 60) {
    red = chroma;
    green = intermediate;
  } else if (normalizedHue < 120) {
    red = intermediate;
    green = chroma;
  } else if (normalizedHue < 180) {
    green = chroma;
    blue = intermediate;
  } else if (normalizedHue < 240) {
    green = intermediate;
    blue = chroma;
  } else if (normalizedHue < 300) {
    red = intermediate;
    blue = chroma;
  } else {
    red = chroma;
    blue = intermediate;
  }

  return { red: red + offset, green: green + offset, blue: blue + offset };
}

function angularDistance(first: number, second: number) {
  return Math.abs(((first - second + 180) % 360) - 180);
}

function resolveHue(
  selectedHue: keyof typeof HUE_ANGLES,
  probabilities: Record<string, number> | undefined,
) {
  const selectedAngle = HUE_ANGLES[selectedHue];

  if (selectedAngle === null || !probabilities) {
    return selectedAngle ?? 0;
  }

  const nearbyHues = Object.entries(probabilities).filter(
    ([key, probability]) => {
      const angle = HUE_ANGLES[key as keyof typeof HUE_ANGLES];
      return (
        angle !== null &&
        probability > 0 &&
        angularDistance(angle, selectedAngle) <= 75
      );
    },
  );
  const vector = nearbyHues.reduce(
    (sum, [key, probability]) => {
      const angle = HUE_ANGLES[key as keyof typeof HUE_ANGLES] ?? 0;
      const radians = (angle * Math.PI) / 180;
      return {
        x: sum.x + Math.cos(radians) * probability,
        y: sum.y + Math.sin(radians) * probability,
      };
    },
    { x: 0, y: 0 },
  );

  return ((Math.atan2(vector.y, vector.x) * 180) / Math.PI + 360) % 360;
}

function resolveAlpha(hasTransparency: number, opacityScore: number) {
  return hasTransparency >= 0.5
    ? interpolateLevel(opacityScore, OPACITY_LEVELS)
    : 1;
}

function resolveComponentsCandidate(
  answers: Awaited<ReturnType<typeof evaluate<typeof QUESTIONS>>>["answers"],
  alpha: number,
): JevColorCandidate {
  const hueKey = answers.componentsHue.choice;
  const hue = resolveHue(hueKey, answers.componentsHue.probabilities);
  const saturation = interpolateLevel(
    answers.componentsSaturation.score,
    SATURATION_LEVELS,
  );
  const lightness = interpolateLevel(
    answers.componentsLightness.score,
    LIGHTNESS_LEVELS,
  );
  const confidence = average([
    maximumProbability(answers.componentsHue.probabilities),
    maximumProbability(answers.componentsSaturation.probabilities),
    maximumProbability(answers.componentsLightness.probabilities),
  ]);

  return {
    confidence,
    details: [
      `${Math.round(hue)}° hue`,
      `${Math.round(saturation)}% saturation`,
      `${Math.round(lightness)}% lightness`,
    ],
    hex: rgbToHex(hslToRgb(hue, saturation, lightness), alpha),
    label:
      hueKey === "neutral"
        ? "Neutral components"
        : `${hueKey.replaceAll("_", " ")} components`,
  };
}

function distanceBetweenOklab(first: Oklab, second: Oklab) {
  return Math.sqrt(
    (first.lightness - second.lightness) ** 2 +
      (first.a - second.a) ** 2 +
      (first.b - second.b) ** 2,
  );
}

function resolveAnchorBlend(
  selectedKey: keyof typeof SEMANTIC_ANCHORS,
  probabilities: Record<string, number> | undefined,
) {
  const selectedAnchor = SEMANTIC_ANCHORS[selectedKey];
  const selectedLab = rgbToOklab(hexToRgb(selectedAnchor.hex));

  if (!probabilities) {
    return selectedLab;
  }

  const candidates = Object.entries(probabilities)
    .map(([key, probability]) => {
      const anchor = SEMANTIC_ANCHORS[key as keyof typeof SEMANTIC_ANCHORS];
      return anchor
        ? {
            lab: rgbToOklab(hexToRgb(anchor.hex)),
            probability,
          }
        : null;
    })
    .filter((candidate) => candidate !== null)
    .filter(
      (candidate) =>
        candidate.probability >= 0.025 &&
        distanceBetweenOklab(candidate.lab, selectedLab) <= 0.22,
    )
    .sort((first, second) => second.probability - first.probability)
    .slice(0, 5);
  const totalWeight = candidates.reduce(
    (sum, candidate) => sum + candidate.probability,
    0,
  );

  if (totalWeight <= 0) {
    return selectedLab;
  }

  return candidates.reduce<Oklab>(
    (sum, candidate) => ({
      lightness:
        sum.lightness +
        (candidate.lab.lightness * candidate.probability) / totalWeight,
      a: sum.a + (candidate.lab.a * candidate.probability) / totalWeight,
      b: sum.b + (candidate.lab.b * candidate.probability) / totalWeight,
    }),
    { lightness: 0, a: 0, b: 0 },
  );
}

function resolveSemanticCandidate(
  answers: Awaited<ReturnType<typeof evaluate<typeof QUESTIONS>>>["answers"],
  alpha: number,
): JevColorCandidate {
  const anchorKey = answers.semanticAnchor
    .choice as keyof typeof SEMANTIC_ANCHORS;
  const anchor = SEMANTIC_ANCHORS[anchorKey];
  const blendedAnchor = oklabToOklch(
    resolveAnchorBlend(anchorKey, answers.semanticAnchor.probabilities),
  );
  const inferredLightness = interpolateLevel(
    answers.semanticLightness.score,
    OKLCH_LIGHTNESS_LEVELS,
  );
  const inferredChroma = interpolateLevel(
    answers.semanticChroma.score,
    OKLCH_CHROMA_LEVELS,
  );
  const refinementWeight = 0.38;
  const color: Oklch = {
    hue: blendedAnchor.hue,
    lightness:
      blendedAnchor.lightness * (1 - refinementWeight) +
      inferredLightness * refinementWeight,
    chroma:
      blendedAnchor.chroma * (1 - refinementWeight) +
      inferredChroma * refinementWeight,
  };
  const topAnchors = Object.entries(answers.semanticAnchor.probabilities ?? {})
    .sort(([, first], [, second]) => second - first)
    .slice(0, 3)
    .map(
      ([key]) => SEMANTIC_ANCHORS[key as keyof typeof SEMANTIC_ANCHORS]?.label,
    )
    .filter(Boolean);
  const confidence = average([
    maximumProbability(answers.semanticAnchor.probabilities),
    maximumProbability(answers.semanticChroma.probabilities),
    maximumProbability(answers.semanticLightness.probabilities),
  ]);

  return {
    confidence,
    details: [
      topAnchors.join(" · "),
      `${Math.round(color.lightness * 100)}% perceptual lightness`,
      `${Math.round(color.chroma * 1000) / 10}% chroma`,
    ],
    hex: rgbToHex(oklchToRgb(color), alpha),
    label: anchor.label,
  };
}

function resolveDirectRgbCandidate(
  answers: Awaited<ReturnType<typeof evaluate<typeof QUESTIONS>>>["answers"],
  alpha: number,
): JevColorCandidate {
  const red = interpolateLevel(answers.directRed.score, RGB_CHANNEL_LEVELS);
  const green = interpolateLevel(answers.directGreen.score, RGB_CHANNEL_LEVELS);
  const blue = interpolateLevel(answers.directBlue.score, RGB_CHANNEL_LEVELS);
  const confidence = average([
    maximumProbability(answers.directRed.probabilities),
    maximumProbability(answers.directGreen.probabilities),
    maximumProbability(answers.directBlue.probabilities),
  ]);

  return {
    confidence,
    details: [
      `R ${Math.round(red)}`,
      `G ${Math.round(green)}`,
      `B ${Math.round(blue)}`,
    ],
    hex: rgbToHex(
      { red: red / 255, green: green / 255, blue: blue / 255 },
      alpha,
    ),
    label: "Direct RGB",
  };
}

function resolveDirectOklabCandidate(
  answers: Awaited<ReturnType<typeof evaluate<typeof QUESTIONS>>>["answers"],
  alpha: number,
): JevColorCandidate {
  const color: Oklab = {
    lightness: interpolateLevel(
      answers.directOklabLightness.score,
      OKLCH_LIGHTNESS_LEVELS,
    ),
    a: interpolateLevel(answers.directOklabA.score, OKLAB_A_LEVELS),
    b: interpolateLevel(answers.directOklabB.score, OKLAB_B_LEVELS),
  };
  const confidence = average([
    maximumProbability(answers.directOklabLightness.probabilities),
    maximumProbability(answers.directOklabA.probabilities),
    maximumProbability(answers.directOklabB.probabilities),
  ]);

  return {
    confidence,
    details: [
      `L ${color.lightness.toFixed(2)}`,
      `a ${color.a.toFixed(2)}`,
      `b ${color.b.toFixed(2)}`,
    ],
    hex: rgbToHex(oklchToRgb(oklabToOklch(color)), alpha),
    label: "Direct OKLab",
  };
}

function describeCandidateForJudge(candidate: JevColorCandidate) {
  const rgb = hexToRgb(candidate.hex);
  const oklch = oklabToOklch(rgbToOklab(rgb));

  return [
    `Use this exact color: ${candidate.hex}.`,
    `sRGB channels: red ${Math.round(rgb.red * 255)}, green ${Math.round(rgb.green * 255)}, blue ${Math.round(rgb.blue * 255)}.`,
    `OKLCH measurements: lightness ${oklch.lightness.toFixed(3)}, chroma ${oklch.chroma.toFixed(3)}, hue ${Math.round(oklch.hue)} degrees.`,
  ].join(" ");
}

function addOptionalNumbers(
  first: number | undefined,
  second: number | undefined,
) {
  return first === undefined && second === undefined
    ? undefined
    : (first ?? 0) + (second ?? 0);
}

export async function POST(request: Request) {
  let requestBody: unknown;

  try {
    requestBody = await request.json();
  } catch {
    return Response.json(
      { error: "Send a JSON request body." },
      { status: 400 },
    );
  }

  const description =
    typeof requestBody === "object" &&
    requestBody !== null &&
    "description" in requestBody &&
    typeof requestBody.description === "string"
      ? requestBody.description.trim()
      : "";

  if (!description || description.length > 160) {
    return Response.json(
      { error: "Enter a color description between 1 and 160 characters." },
      { status: 400 },
    );
  }

  const startedAt = performance.now();

  try {
    const result = await evaluate({
      model: "typesafe-ai/jev",
      state: {
        description,
        goal: "Resolve the description to one representative screen color for a visual color picker.",
      },
      questions: QUESTIONS,
      maxRetries: 1,
      abortSignal: request.signal,
      providerOptions: {
        gateway: {
          zeroDataRetention: true,
        },
      },
    });
    const alpha = resolveAlpha(
      result.answers.hasTransparency.probability,
      result.answers.opacity.score,
    );
    const firstPassCandidates = {
      components: resolveComponentsCandidate(result.answers, alpha),
      directOklab: resolveDirectOklabCandidate(result.answers, alpha),
      directRgb: resolveDirectRgbCandidate(result.answers, alpha),
      semantic: resolveSemanticCandidate(result.answers, alpha),
    };
    const blindCandidates = {
      candidate_a: {
        candidate: firstPassCandidates.components,
        method: "HSL components",
      },
      candidate_b: {
        candidate: firstPassCandidates.semantic,
        method: "Semantic OKLCH",
      },
      candidate_c: {
        candidate: firstPassCandidates.directRgb,
        method: "Direct RGB",
      },
      candidate_d: {
        candidate: firstPassCandidates.directOklab,
        method: "Direct OKLab",
      },
    } as const;
    const judgeQuestions = {
      bestCandidate: {
        type: "choice",
        instructions:
          "Which exact candidate color is the best single visual match for `description`? Compare the supplied color measurements, choose only among the candidates, and do not invent or adjust a color. The candidate labels are intentionally anonymous, so judge only the actual colors.",
        criteria: {
          candidate_a: describeCandidateForJudge(
            blindCandidates.candidate_a.candidate,
          ),
          candidate_b: describeCandidateForJudge(
            blindCandidates.candidate_b.candidate,
          ),
          candidate_c: describeCandidateForJudge(
            blindCandidates.candidate_c.candidate,
          ),
          candidate_d: describeCandidateForJudge(
            blindCandidates.candidate_d.candidate,
          ),
        },
      },
    } as const;
    const judgeResult = await evaluate({
      model: "typesafe-ai/jev",
      state: {
        description,
        goal: "Select the existing candidate color that most closely represents the requested visual color.",
      },
      questions: judgeQuestions,
      maxRetries: 1,
      abortSignal: request.signal,
      providerOptions: {
        gateway: {
          zeroDataRetention: true,
        },
      },
    });
    const judgeAnswer = judgeResult.answers.bestCandidate;
    const judgeSelection = blindCandidates[judgeAnswer.choice];
    const judgeCandidate: JevColorCandidate = {
      ...judgeSelection.candidate,
      confidence:
        judgeAnswer.probabilities?.[judgeAnswer.choice] ??
        maximumProbability(judgeAnswer.probabilities),
      details: [
        `Selected ${judgeSelection.method}`,
        ...judgeSelection.candidate.details,
      ],
    };
    const response: JevColorComparison = {
      candidates: {
        ...firstPassCandidates,
        judge: judgeCandidate,
      },
      colorIntent: result.answers.colorIntent.probability,
      description,
      elapsedMs: Math.round(performance.now() - startedAt),
      transparency: result.answers.hasTransparency.probability,
      usage: {
        inputTokens: addOptionalNumbers(
          result.usage.inputTokens,
          judgeResult.usage.inputTokens,
        ),
        outputTokens: addOptionalNumbers(
          result.usage.outputTokens,
          judgeResult.usage.outputTokens,
        ),
        totalTokens: addOptionalNumbers(
          result.usage.totalTokens,
          judgeResult.usage.totalTokens,
        ),
      },
    };

    return Response.json(response, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "";
    const missingCredentials =
      errorMessage.includes("AI_GATEWAY_API_KEY") ||
      errorMessage.toLowerCase().includes("authentication");

    if (!missingCredentials) {
      console.error(
        "Jev color inference failed:",
        errorMessage || "Unknown Gateway error",
      );
    }

    return Response.json(
      {
        error: missingCredentials
          ? "AI Gateway is not configured yet. Add AI_GATEWAY_API_KEY to .env.local and restart the dev server."
          : "Jev could not evaluate that description. Please try again.",
      },
      { status: missingCredentials ? 503 : 502 },
    );
  }
}
