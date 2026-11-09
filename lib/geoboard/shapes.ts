// What a band makes. The pegs a band presses against, in order round it, are the corners of a
// polygon, and on a lattice its area can be had by counting pegs alone: Pick's theorem says
// area = I + B/2 − 1 squares, where I is the pegs inside and B the pegs on the band. On the
// triangular board the same count gives unit triangles as 2I + B − 2. Shapes are named the way a
// British classroom names them (trapezium, arrowhead), and a square lattice can't make an
// equilateral triangle or a regular hexagon, so it never will.

import { type Board, type BoardId, pegAt } from "./boards";

export type ShapeInfo = {
  name: string;
  // The area as words, such as "4½ squares", and the count behind it, if the board has a lattice.
  area: string | null;
  pick: string | null;
  // Short label for the board itself.
  label: string | null;
};

const NAMES = [
  "",
  "",
  "",
  "triangle",
  "quadrilateral",
  "pentagon",
  "hexagon",
  "heptagon",
  "octagon",
  "nonagon",
  "decagon",
  "hendecagon",
  "dodecagon",
];

function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y) [x, y] = [y, x % y];
  return x;
}

function cross(ax: number, ay: number, bx: number, by: number) {
  return ax * by - ay * bx;
}

function segmentsCross(
  a: [number, number],
  b: [number, number],
  c: [number, number],
  d: [number, number],
) {
  const d1 = cross(b[0] - a[0], b[1] - a[1], c[0] - a[0], c[1] - a[1]);
  const d2 = cross(b[0] - a[0], b[1] - a[1], d[0] - a[0], d[1] - a[1]);
  const d3 = cross(d[0] - c[0], d[1] - c[1], a[0] - c[0], a[1] - c[1]);
  const d4 = cross(d[0] - c[0], d[1] - c[1], b[0] - c[0], b[1] - c[1]);
  return d1 * d2 < -1e-9 && d3 * d4 < -1e-9;
}

function half(value: number) {
  const whole = Math.floor(value + 1e-6);
  const rest = value - whole;
  if (rest > 0.25 && rest < 0.75) return whole ? `${whole}½` : "½";
  return `${Math.round(value)}`;
}

function plural(count: string, one: string, many: string) {
  return `${count} ${count === "1" ? one : many}`;
}

// The corners as pegs, in order round the band. Pegs the band merely runs past in a straight
// line still count for Pick's theorem but aren't corners.
export function describeShape(board: Board, order: number[]): ShapeInfo {
  const unique: number[] = [];
  for (const peg of order) {
    if (unique[unique.length - 1] !== peg) unique.push(peg);
  }
  while (unique.length > 1 && unique[0] === unique[unique.length - 1]) {
    unique.pop();
  }
  if (unique.length === 0) {
    return { name: "Lying loose", area: null, pick: null, label: null };
  }
  if (unique.length === 1) {
    return { name: "Hooked on one peg", area: null, pick: null, label: null };
  }
  if (unique.length === 2) {
    return {
      name: "A line between two pegs",
      area: null,
      pick: null,
      label: null,
    };
  }

  const points = unique.map((i) => [board.pegs[i].x, board.pegs[i].y]) as [
    number,
    number,
  ][];
  // Drop corners the band runs straight through.
  const corners: number[] = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[(i - 1 + points.length) % points.length];
    const b = points[i];
    const c = points[(i + 1) % points.length];
    const turn = cross(b[0] - a[0], b[1] - a[1], c[0] - b[0], c[1] - b[1]);
    const scale =
      Math.hypot(b[0] - a[0], b[1] - a[1]) *
      Math.hypot(c[0] - b[0], c[1] - b[1]);
    if (Math.abs(turn) > 1e-6 * scale) corners.push(i);
  }
  const poly = corners.map((i) => points[i]);
  const n = poly.length;
  if (n < 3) {
    return {
      name: "A line between two pegs",
      area: null,
      pick: null,
      label: null,
    };
  }

  // A band that crosses itself makes a star or a figure of eight, which has no single area.
  let crossed = false;
  for (let i = 0; i < n && !crossed; i++) {
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      if (
        segmentsCross(poly[i], poly[(i + 1) % n], poly[j], poly[(j + 1) % n])
      ) {
        crossed = true;
        break;
      }
    }
  }

  const sides = poly.map((p, i) => {
    const q = poly[(i + 1) % n];
    return Math.hypot(q[0] - p[0], q[1] - p[1]);
  });
  const turns = poly.map((p, i) => {
    const a = poly[(i - 1 + n) % n];
    const c = poly[(i + 1) % n];
    return cross(p[0] - a[0], p[1] - a[1], c[0] - p[0], c[1] - p[1]);
  });
  const same = (a: number, b: number) => Math.abs(a - b) < 1e-6 * (a + b + 1);
  const allSides = sides.every((s) => same(s, sides[0]));
  // Cosines of the interior angles, to tell right angles and equal angles.
  const cosines = poly.map((p, i) => {
    const a = poly[(i - 1 + n) % n];
    const c = poly[(i + 1) % n];
    const ux = a[0] - p[0];
    const uy = a[1] - p[1];
    const vx = c[0] - p[0];
    const vy = c[1] - p[1];
    return (ux * vx + uy * vy) / (Math.hypot(ux, uy) * Math.hypot(vx, vy));
  });
  const convex = turns.every((t) => t > 0) || turns.every((t) => t < 0);
  const allAngles = cosines.every((c) => Math.abs(c - cosines[0]) < 1e-6);

  let name: string;
  if (crossed) {
    name = allSides && allAngles ? `${n}-pointed star` : "Crossed shape";
  } else if (n === 3) {
    const right = cosines.some((c) => Math.abs(c) < 1e-6);
    const obtuse = cosines.some((c) => c < -1e-6);
    const pairs =
      Number(same(sides[0], sides[1])) +
      Number(same(sides[1], sides[2])) +
      Number(same(sides[2], sides[0]));
    const kind =
      pairs === 3 ? "equilateral" : pairs >= 1 ? "isosceles" : "scalene";
    name = right
      ? `Right-angled ${kind} triangle`
      : obtuse
        ? `Obtuse ${kind} triangle`
        : `Acute ${kind} triangle`;
    if (pairs === 3) name = "Equilateral triangle";
  } else if (n === 4) {
    const parallel = (i: number) => {
      const a = poly[i];
      const b = poly[(i + 1) % 4];
      const c = poly[(i + 2) % 4];
      const d = poly[(i + 3) % 4];
      return (
        Math.abs(cross(b[0] - a[0], b[1] - a[1], d[0] - c[0], d[1] - c[1])) <
        1e-6 * sides[i] * sides[(i + 2) % 4]
      );
    };
    const right = cosines.every((c) => Math.abs(c) < 1e-6);
    const kite =
      (same(sides[0], sides[1]) && same(sides[2], sides[3])) ||
      (same(sides[1], sides[2]) && same(sides[3], sides[0]));
    if (!convex) {
      name = kite ? "Arrowhead" : "Concave quadrilateral";
    } else if (right && allSides) {
      name = "Square";
    } else if (right) {
      name = "Rectangle";
    } else if (allSides) {
      name = "Rhombus";
    } else if (parallel(0) && parallel(1)) {
      name = "Parallelogram";
    } else if (parallel(0) || parallel(1)) {
      const legs = parallel(0) ? [1, 3] : [0, 2];
      name = same(sides[legs[0]], sides[legs[1]])
        ? "Isosceles trapezium"
        : "Trapezium";
    } else if (kite) {
      name = "Kite";
    } else {
      name = "Quadrilateral";
    }
  } else {
    const base = NAMES[n] ?? `${n}-sided polygon`;
    const word = base.charAt(0).toUpperCase() + base.slice(1);
    name = !convex
      ? `Concave ${base}`
      : allSides && allAngles
        ? `Regular ${base}`
        : word;
  }

  if (crossed) return { name, area: null, pick: null, label: null };

  // Area and the pegs that give it. The polygon here keeps every peg the band touches.
  const full = unique.map((i) => board.pegs[i]);
  if (board.lattice) {
    let twice = 0;
    let boundary = 0;
    for (let i = 0; i < full.length; i++) {
      const a = full[i];
      const b = full[(i + 1) % full.length];
      twice += a.u * b.v - b.u * a.v;
      boundary += gcd(b.u - a.u, b.v - a.v);
    }
    const lattice = Math.abs(twice) / 2;
    const inside = Math.round(lattice - boundary / 2 + 1);
    if (board.lattice === "square") {
      const area = half(lattice);
      return {
        name,
        area: plural(area, "square", "squares"),
        pick: `${inside} inside + ${boundary} on the band ÷ 2 − 1`,
        label: area,
      };
    }
    const triangles = `${Math.round(lattice * 2)}`;
    return {
      name,
      area: plural(triangles, "triangle", "triangles"),
      pick: `2 × ${inside} inside + ${boundary} on the band − 2`,
      label: triangles,
    };
  }
  let twice = 0;
  for (let i = 0; i < full.length; i++) {
    const a = full[i];
    const b = full[(i + 1) % full.length];
    twice += a.x * b.y - b.x * a.y;
  }
  const cm = Math.round(Math.abs(twice) / 2);
  return { name, area: `${cm} cm²`, pick: null, label: `${cm}` };
}

// Ready-made figures for each board, as pegs in order round each band.
export type Pattern = { value: string; label: string; note: string };

export const PATTERNS: Record<BoardId, Pattern[]> = {
  grid5: [
    {
      value: "same-note",
      label: "Same note",
      note: "Three bands of one size stretched two, three and four times their length. Pluck each: they play almost the same note.",
    },
    {
      value: "house",
      label: "House",
      note: "A pentagon of 5 squares with a door: 2 pegs inside, 8 on the band.",
    },
  ],
  grid9: [
    {
      value: "pythagoras",
      label: "Pythagoras",
      note: "A right-angled triangle with a square on each side: 1 and 4 make 5, and the pegs agree.",
    },
    {
      value: "tilted",
      label: "Tilted squares",
      note: "Squares inside squares, each corner a step further round. Their areas are 64, 40, 32 and 40.",
    },
  ],
  triangles: [
    {
      value: "hexagon",
      label: "Hexagon",
      note: "A regular hexagon of 6 triangles, which a square board can't make.",
    },
    {
      value: "hexagram",
      label: "Star",
      note: "Two triangles of 9 each, one turned over the other.",
    },
  ],
  circle: [
    {
      value: "triangles",
      label: "Triangles",
      note: "Four triangles, each on every fourth peg.",
    },
    {
      value: "squares",
      label: "Squares",
      note: "Three squares, each on every third peg.",
    },
  ],
};

// Peg orders for a pattern; the band size is picked to suit each loop's length.
export function patternBands(board: Board, value: string): number[][] {
  const at = (u: number, v: number) => pegAt(board, u, v);
  const loop = (points: [number, number][]) => points.map(([u, v]) => at(u, v));
  switch (value) {
    case "same-note":
      return [
        loop([
          [0, 0],
          [2, 1],
        ]),
        loop([
          [0, 2],
          [3, 3],
        ]),
        loop([
          [0, 4],
          [4, 3],
        ]),
      ];
    case "house":
      return [
        loop([
          [1, 4],
          [3, 4],
          [3, 2],
          [2, 1],
          [1, 2],
        ]),
        loop([
          [2, 3],
          [2, 4],
        ]),
      ];
    case "pythagoras":
      return [
        loop([
          [4, 5],
          [6, 5],
          [4, 4],
        ]),
        loop([
          [4, 5],
          [6, 5],
          [6, 7],
          [4, 7],
        ]),
        loop([
          [4, 5],
          [3, 5],
          [3, 4],
          [4, 4],
        ]),
        loop([
          [6, 5],
          [7, 3],
          [5, 2],
          [4, 4],
        ]),
      ];
    case "tilted":
      return [0, 2, 4, 6].map((k) =>
        loop([
          [k, 0],
          [8, k],
          [8 - k, 8],
          [0, 8 - k],
        ]),
      );
    case "hexagon":
      return [
        loop([
          [1, 0],
          [0, 1],
          [-1, 1],
          [-1, 0],
          [0, -1],
          [1, -1],
        ]),
      ];
    case "hexagram":
      return [
        loop([
          [-1, -1],
          [2, -1],
          [-1, 2],
        ]),
        loop([
          [1, 1],
          [-2, 1],
          [1, -2],
        ]),
      ];
    case "triangles":
      return [0, 1, 2, 3].map((k) => [k, k + 4, k + 8]);
    case "squares":
      return [0, 1, 2].map((k) => [k, k + 3, k + 6, k + 9]);
    default:
      return [];
  }
}
