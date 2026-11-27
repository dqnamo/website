// The boards, pegs and bands, in centimetres. A school geoboard is a square board about 20 cm
// across with a lattice of pegs: five by five on the classic one, finer on others, a triangular
// lattice for hexagons and the like, and on the back of most a ring of twelve round a centre peg.
// Each peg on a lattice keeps its lattice coordinates, so shapes can be measured by counting
// pegs rather than centimetres.

export type BoardId = "grid5" | "grid9" | "triangles" | "circle";
export type Material = "birch" | "walnut" | "plastic";
export type BandSize = "small" | "medium" | "large";
export type Palette = "assorted" | "natural" | "neon";
export type Lattice = "square" | "triangle" | null;

export type Peg = {
  x: number;
  y: number;
  // Lattice coordinates: whole numbers on the square and triangular boards.
  u: number;
  v: number;
};

export type Board = {
  id: BoardId;
  lattice: Lattice;
  // Distance between neighbouring pegs.
  pitch: number;
  // Half the board's width; every board is square.
  half: number;
  pegs: Peg[];
};

const SQRT3_2 = Math.sqrt(3) / 2;

export function makeBoard(id: BoardId): Board {
  const pegs: Peg[] = [];
  if (id === "grid5" || id === "grid9") {
    const count = id === "grid5" ? 5 : 9;
    const pitch = id === "grid5" ? 4 : 2.4;
    const middle = (count - 1) / 2;
    for (let v = 0; v < count; v++) {
      for (let u = 0; u < count; u++) {
        pegs.push({ x: (u - middle) * pitch, y: (v - middle) * pitch, u, v });
      }
    }
    return {
      id,
      lattice: "square",
      pitch,
      half: middle * pitch + (id === "grid5" ? 2.3 : 1.5),
      pegs,
    };
  }
  if (id === "triangles") {
    // Rows of pegs 3.2 cm apart, every other row shifted half a step, so each peg is the same
    // distance from its six neighbours. In lattice coordinates a peg sits at u steps along a row
    // plus v steps up the 60° direction.
    const pitch = 3.2;
    for (let v = -3; v <= 3; v++) {
      const odd = Math.abs(v) % 2 === 1;
      const reach = odd ? 2.5 : 3;
      for (let k = -reach; k <= reach; k++) {
        pegs.push({
          x: k * pitch,
          y: v * pitch * SQRT3_2,
          u: Math.round(k - v / 2),
          v,
        });
      }
    }
    return { id, lattice: "triangle", pitch, half: 11.2, pegs };
  }
  // Twelve round a circle like the hours on a clock, from the top, and one in the middle.
  const radius = 8.2;
  for (let k = 0; k < 12; k++) {
    const angle = -Math.PI / 2 + (k * Math.PI) / 6;
    pegs.push({
      x: radius * Math.cos(angle),
      y: radius * Math.sin(angle),
      u: k,
      v: 0,
    });
  }
  pegs.push({ x: 0, y: 0, u: 12, v: 0 });
  return {
    id,
    lattice: null,
    pitch: 2 * radius * Math.sin(Math.PI / 12),
    half: 11,
    pegs,
  };
}

export function pegAt(board: Board, u: number, v: number) {
  return board.pegs.findIndex((peg) => peg.u === u && peg.v === v);
}

// Wooden boards have nails: a thin shank the band wraps round under a wide round head, which
// hides the wrap from above and stops the band riding off. Plastic boards have fat moulded pegs
// with a little lip.
export type PegStyle = {
  kind: "nail" | "moulded";
  // The radius the band wraps round, and what's seen from above.
  shank: number;
  head: number;
  height: number;
};

export const PEGS: Record<Material, PegStyle> = {
  birch: { kind: "nail", shank: 0.09, head: 0.27, height: 1.3 },
  walnut: { kind: "nail", shank: 0.09, head: 0.27, height: 1.3 },
  plastic: { kind: "moulded", shank: 0.3, head: 0.34, height: 1.1 },
};

// Unstretched circumference. Geoboard bands are small: the smallest only just reaches round two
// neighbouring pegs on the classic board without stretching much.
export const BAND_LENGTH: Record<BandSize, number> = {
  small: 7.5,
  medium: 12,
  large: 19,
};

export const PALETTES: Record<Palette, string[]> = {
  assorted: [
    "#d8362b",
    "#f08422",
    "#f1c234",
    "#3ca452",
    "#2f6ed8",
    "#7a48c6",
    "#e2558f",
  ],
  // Plain office bands, the colour of the latex itself.
  natural: ["#cfa274", "#c79a69", "#d6ad80"],
  neon: ["#ff3f8e", "#7dff3a", "#ffe53a", "#ff7a1f", "#3fe6ff"],
};
