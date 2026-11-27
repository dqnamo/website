// Ready-made signs, drawn the way a sign-maker would lay out the pattern: one line per tube, in
// millimetres with y downwards, corners left sharp because the glass rounds them anyway. The
// engine centres each sign on the wall.

import type { Colour, Point } from "./glass";

export type SignTube = {
  colour: Colour;
  points: Point[];
  // Paint this tube out where it crosses the given earlier tube for the last time, so it
  // looks as if it passes behind it: the sign-maker's way of threading one tube through another.
  behind?: number;
};

export type Sign = "open" | "heart" | "cocktail" | "moon";

function arc(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  from: number,
  to: number,
): Point[] {
  const count = Math.max(8, Math.ceil(Math.abs(to - from) * 24));
  return Array.from({ length: count + 1 }, (_, i) => {
    const angle = from + ((to - from) * i) / count;
    return { x: cx + rx * Math.cos(angle), y: cy + ry * Math.sin(angle) };
  });
}

// Fat-pointed, because the glass rounds every point off by about a centimetre.
function star(cx: number, cy: number, outer: number): Point[] {
  const inner = outer * 0.56;
  // From an inner corner, round to the same corner, so both ends sit in a notch.
  return Array.from({ length: 11 }, (_, i) => {
    const r = i % 2 === 0 ? inner : outer;
    const angle = -Math.PI / 2 + Math.PI / 5 + (i * Math.PI) / 5;
    return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
  });
}

const DEG = Math.PI / 180;

function open(): SignTube[] {
  const letters: SignTube[] = [
    {
      colour: "red",
      points: arc(-150, 0, 40, 58, 100 * DEG, 440 * DEG),
    },
    {
      colour: "red",
      points: [
        { x: -78, y: 58 },
        { x: -78, y: -58 },
        { x: -52, y: -58 },
        ...arc(-52, -28, 30, 30, -90 * DEG, 90 * DEG).slice(1),
        { x: -70, y: 2 },
      ],
    },
    {
      colour: "red",
      points: [
        { x: 50, y: -58 },
        { x: 0, y: -58 },
        { x: 0, y: 58 },
        { x: 50, y: 58 },
      ],
    },
    {
      colour: "red",
      points: [
        { x: 9, y: 0 },
        { x: 44, y: 0 },
      ],
    },
    {
      colour: "red",
      points: [
        { x: 78, y: 58 },
        { x: 78, y: -58 },
        { x: 146, y: 58 },
        { x: 146, y: -58 },
      ],
    },
  ];
  // A border round the letters with its two ends meeting at the bottom.
  const left = -190 - 36;
  const right = 146 + 36;
  const top = -58 - 34;
  const bottom = 58 + 34;
  const r = 28;
  const middle = (left + right) / 2;
  const border: Point[] = [
    { x: middle - 22, y: bottom },
    ...arc(left + r, bottom - r, r, r, 90 * DEG, 180 * DEG),
    ...arc(left + r, top + r, r, r, 180 * DEG, 270 * DEG),
    ...arc(right - r, top + r, r, r, 270 * DEG, 360 * DEG),
    ...arc(right - r, bottom - r, r, r, 0, 90 * DEG),
    { x: middle + 22, y: bottom },
  ];
  return [...letters, { colour: "blue", points: border }];
}

function heart(): SignTube[] {
  const scale = 8.4;
  const count = 220;
  const outline = Array.from({ length: count + 1 }, (_, i) => {
    const t = 0.05 + ((Math.PI * 2 - 0.1) * i) / count;
    return {
      x: 16 * Math.sin(t) ** 3 * scale,
      y:
        -(
          13 * Math.cos(t) -
          5 * Math.cos(2 * t) -
          2 * Math.cos(3 * t) -
          Math.cos(4 * t)
        ) *
          scale +
        20,
    };
  });
  const tail = { x: -178, y: 104 };
  const tip = { x: 182, y: -96 };
  const length = Math.hypot(tip.x - tail.x, tip.y - tail.y);
  const dx = (tip.x - tail.x) / length;
  const dy = (tip.y - tail.y) / length;
  const v = (from: Point, back: number, side: number): Point[] => [
    { x: from.x - dx * back - dy * side, y: from.y - dy * back + dx * side },
    from,
    { x: from.x - dx * back + dy * side, y: from.y - dy * back - dx * side },
  ];
  const at = (along: number) => ({
    x: tail.x + dx * along,
    y: tail.y + dy * along,
  });
  return [
    { colour: "pink", points: outline },
    { colour: "white", points: [tail, tip], behind: 0 },
    { colour: "white", points: v(tip, 30, 20) },
    { colour: "white", points: v(at(16), 18, 16) },
    { colour: "white", points: v(at(36), 18, 16) },
  ];
}

function cocktail(): SignTube[] {
  return [
    {
      colour: "blue",
      points: [
        { x: 0, y: 112 },
        { x: 0, y: 24 },
        { x: -96, y: -70 },
        { x: 96, y: -70 },
        { x: 5, y: 19 },
      ],
    },
    {
      colour: "blue",
      points: [
        { x: -54, y: 114 },
        { x: 54, y: 114 },
      ],
    },
    {
      colour: "green",
      points: arc(30, -34, 19, 19, 30 * DEG, 370 * DEG),
    },
    {
      colour: "red",
      points: [
        { x: -22, y: -102 },
        { x: 52, y: -6 },
      ],
      behind: 2,
    },
  ];
}

function moon(): SignTube[] {
  const tipAngle = 55 * DEG;
  const tipX = 95 * Math.cos(tipAngle);
  const tipY = 95 * Math.sin(tipAngle);
  const innerX = 45;
  const innerR = Math.hypot(tipX - innerX, tipY);
  const innerAngle = Math.atan2(tipY, tipX - innerX);
  return [
    {
      colour: "yellow",
      points: [
        ...arc(-40, 0, 95, 95, -tipAngle, -Math.PI * 2 + tipAngle),
        ...arc(
          innerX - 40,
          0,
          innerR,
          innerR,
          innerAngle,
          Math.PI * 2 - innerAngle,
        ).slice(1),
      ],
    },
    { colour: "white", points: star(96, -34, 56) },
    { colour: "blue", points: star(118, 78, 42) },
  ];
}

export const SIGNS: { value: Sign; label: string; tubes: () => SignTube[] }[] =
  [
    { value: "open", label: "Open", tubes: open },
    { value: "heart", label: "Heart", tubes: heart },
    { value: "cocktail", label: "Cocktail", tubes: cocktail },
    { value: "moon", label: "Moon", tubes: moon },
  ];
