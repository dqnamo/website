// The traditional patterns, as a marbler would make them: a list of drops and passes with the
// stylus or comb, in bath units (about a millimetre; the bath is 500 × 700). Each one starts
// from a clean bath and uses the palette's inks in order, so the same pattern in another
// palette is another paper. Drops are scattered afresh each time, as no two sheets match.

export type PatternId =
  | "stone"
  | "come-and-go"
  | "nonpareil"
  | "serpentine"
  | "curl"
  | "rings";

type Point = { x: number; y: number };

export type Step =
  // A drop of ink, then a pause before the next step.
  | { kind: "drop"; x: number; y: number; r: number; ink: number; wait: number }
  // The stylus or a comb drawn along a path at a steady speed, in units a second. Reach
  // overrides how far the drag spreads, for a gentle breath across the bath.
  | {
      kind: "stroke";
      tool: "stylus" | "comb";
      points: Point[];
      speed: number;
      spacing?: number;
      reach?: number;
    }
  | { kind: "wait"; seconds: number };

export const BATH_W = 500;
export const BATH_H = 700;

type Inks = { pigments: number[]; clear: number | null };

function rand(min: number, max: number) {
  return min + Math.random() * (max - min);
}

// Drops for one colour, scattered over a jittered grid so they cover the bath evenly without
// looking planted. Each colour after the first spreads less, crowded by those before it.
function scatter(ink: number, count: number, r: number, wait: number) {
  const steps: Step[] = [];
  const columns = Math.max(1, Math.round(Math.sqrt((count * BATH_W) / BATH_H)));
  const rows = Math.ceil(count / columns);
  const cells = Array.from({ length: columns * rows }, (_, i) => i)
    .sort(() => Math.random() - 0.5)
    .slice(0, count);
  for (const cell of cells) {
    const cx = ((cell % columns) + rand(0.1, 0.9)) / columns;
    const cy = (Math.floor(cell / columns) + rand(0.1, 0.9)) / rows;
    steps.push({
      kind: "drop",
      x: -12 + cx * (BATH_W + 24),
      y: -12 + cy * (BATH_H + 24),
      r: r * rand(0.85, 1.15),
      ink,
      wait,
    });
  }
  return steps;
}

// Stone, or battal: colour after colour sprinkled over the whole bath, the last with extra
// gall so it pushes the others into veins.
function stone(inks: Inks, fast: boolean) {
  const [a, b = a, c = b, d = a] = inks.pigments;
  const wait = fast ? 0.012 : 0.026;
  return [
    ...scatter(a, 40, 54, wait),
    { kind: "wait", seconds: 0.2 },
    ...scatter(b, 40, 50, wait),
    { kind: "wait", seconds: 0.2 },
    ...scatter(c, 55, 46, wait),
    { kind: "wait", seconds: 0.2 },
    ...scatter(d, 70, 44, wait),
    { kind: "wait", seconds: 0.4 },
  ] satisfies Step[];
}

// Back and forth across the bath with the stylus, lines `gap` apart: gel-git, come-and-go.
function comeAndGo(across: boolean, gap: number): Step {
  const points: Point[] = [];
  const span = across ? BATH_H : BATH_W;
  const length = across ? BATH_W : BATH_H;
  let forward = true;
  for (let at = gap / 2; at < span; at += gap) {
    const from = forward ? -24 : length + 24;
    const to = forward ? length + 24 : -24;
    points.push(across ? { x: from, y: at } : { x: at, y: from });
    points.push(across ? { x: to, y: at } : { x: at, y: to });
    forward = !forward;
  }
  // The stylus is drawn slowly enough through the thick size to carry the colour between
  // passes with it, so the passes leave stripes rather than lines.
  return { kind: "stroke", tool: "stylus", points, speed: 2600, reach: 12 };
}

// A comb pulled down the length of the bath, swaying from side to side if `sway` is set.
function comb(spacing: number, speed: number, sway = 0, wave = 80) {
  const points: Point[] = [];
  for (let y = -30; y <= BATH_H + 30; y += 4) {
    const x = BATH_W / 2 + sway * Math.sin((y / wave) * Math.PI * 2);
    points.push({ x, y });
  }
  return { kind: "stroke", tool: "comb", points, speed, spacing } as const;
}

// French curl: the stylus wound round in a tightening spiral at each point of a grid, each
// one winding the stripes about it like a snail's shell.
function curls(): Step[] {
  const steps: Step[] = [];
  const columns = 3;
  const rows = 4;
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const cx = ((column + 0.5) / columns) * BATH_W + (row % 2 ? 30 : -30);
      const cy = ((row + 0.5) / rows) * BATH_H;
      const points: Point[] = [];
      const turns = 1.75;
      for (let t = 0; t <= 1.0001; t += 1 / 60) {
        const angle = t * turns * Math.PI * 2;
        const r = 52 * (1 - t) + 4;
        points.push({
          x: cx + Math.cos(angle) * r,
          y: cy + Math.sin(angle) * r,
        });
      }
      steps.push({
        kind: "stroke",
        tool: "stylus",
        points,
        speed: 1300,
        reach: 9,
      });
    }
  }
  return steps;
}

// Suminagashi: ink and clear water touched to the same spot in turn, so each drop pushes the
// last out into a ring, then a slow breath across the bath to set the rings flowing.
function rings(inks: Inks) {
  const [a, b = a] = inks.pigments;
  const steps: Step[] = [];
  const centres = [
    { x: 140, y: 130, count: 20 },
    { x: 370, y: 190, count: 16 },
    { x: 240, y: 320, count: 22 },
    { x: 90, y: 470, count: 14 },
    { x: 400, y: 450, count: 18 },
    { x: 220, y: 590, count: 17 },
    { x: 420, y: 650, count: 10 },
  ];
  for (const centre of centres) {
    for (let i = 0; i < centre.count; i++) {
      const ink =
        i % 2 === 1 && inks.clear !== null
          ? inks.clear
          : i % 4 === 2 || (inks.clear === null && i % 2 === 1)
            ? b
            : a;
      steps.push({
        kind: "drop",
        x: centre.x + rand(-1.5, 1.5),
        y: centre.y + rand(-1.5, 1.5),
        r: 17,
        ink,
        wait: 0.09,
      });
    }
    steps.push({ kind: "wait", seconds: 0.15 });
  }
  steps.push({ kind: "wait", seconds: 0.4 });
  // Breaths drift across the bath in long curves.
  const breath = (from: Point, bend: Point, to: Point, reach: number) => {
    const points: Point[] = [];
    for (let t = 0; t <= 1.0001; t += 0.05) {
      const u = 1 - t;
      points.push({
        x: u * u * from.x + 2 * u * t * bend.x + t * t * to.x,
        y: u * u * from.y + 2 * u * t * bend.y + t * t * to.y,
      });
    }
    steps.push({ kind: "stroke", tool: "stylus", points, speed: 380, reach });
  };
  breath({ x: -40, y: 60 }, { x: 330, y: 200 }, { x: 540, y: 560 }, 30);
  breath({ x: 540, y: 120 }, { x: 160, y: 380 }, { x: -40, y: 720 }, 26);
  breath({ x: 250, y: -40 }, { x: 120, y: 360 }, { x: 330, y: 740 }, 22);
  return steps;
}

export function buildPattern(
  id: PatternId,
  inks: { clear?: boolean }[],
): Step[] {
  const pigments = inks.flatMap((ink, i) => (ink.clear ? [] : [i]));
  const clearAt = inks.findIndex((ink) => ink.clear);
  const palette: Inks = {
    pigments: pigments.length ? pigments : [0],
    clear: clearAt >= 0 ? clearAt : null,
  };
  switch (id) {
    case "stone":
      return stone(palette, false);
    case "come-and-go":
      return [...stone(palette, true), comeAndGo(false, 26)];
    case "nonpareil":
      return [
        ...stone(palette, true),
        comeAndGo(false, 26),
        comeAndGo(true, 26),
        comb(7, 640),
      ];
    case "serpentine":
      return [
        ...stone(palette, true),
        comeAndGo(false, 26),
        comeAndGo(true, 26),
        comb(8, 640, 14, 90),
      ];
    case "curl":
      return [
        ...stone(palette, true),
        comeAndGo(false, 24),
        comeAndGo(true, 24),
        comb(9, 640),
        ...curls(),
      ];
    case "rings":
      return rings(palette);
  }
}
