// Things to lay on the paper. Each is drawn flat, in millimetres about its own centre, from parts
// the enlarger's light can tell apart: how much light a part lets through and how high it
// stands off the paper. The paper only sees blue, so a green leaf that looks translucent to us
// is nearly opaque to it, and its thicker veins block more still and print paler. Height decides
// where a shadow falls and how soft its edge is, since the light comes from a lens of some width
// above, not from a point. A glass marble also works as a lens of its own, gathering the light
// that lands on it into a hot spot underneath with a dark ring round it.

export type PropKind =
  | "fern"
  | "doily"
  | "key"
  | "marble"
  | "feather"
  | "buttons"
  | "scissors"
  | "clips"
  | "comb";

export type Part = {
  path: Path2D;
  // Fraction of the light it lets through.
  pass: number;
  // Millimetres above the paper.
  height: number;
  // Stroked this wide rather than filled.
  line?: number;
  rule?: CanvasFillRule;
  // A lens: how many times over it concentrates the light into this part, and the part as a
  // disc (x, y, radius) so the engine can add it up without reading pixels back.
  focus?: number;
  disc?: [number, number, number];
};

// Colours are given as albedo, 0–255, and come back lit by whatever light is on the prop.
export type Paint = (r: number, g: number, b: number, a?: number) => string;

export type Shape = {
  parts: Part[];
  draw: (ctx: CanvasRenderingContext2D, paint: Paint) => void;
};

export const PROPS: { value: PropKind; label: string }[] = [
  { value: "fern", label: "Fern" },
  { value: "doily", label: "Doily" },
  { value: "key", label: "Key" },
  { value: "marble", label: "Marble" },
  { value: "feather", label: "Feather" },
  { value: "buttons", label: "Buttons" },
  { value: "scissors", label: "Scissors" },
  { value: "clips", label: "Clips" },
  { value: "comb", label: "Comb" },
];

// Where each kind goes on the paper (millimetres from its centre) when it's first laid down.
// Buttons and clips come several to a kind.
export const LAYOUT: Record<
  PropKind,
  { x: number; y: number; angle: number }[]
> = {
  fern: [{ x: -44, y: -14, angle: -1.2 }],
  doily: [{ x: 42, y: 74, angle: 0.2 }],
  key: [{ x: 40, y: -96, angle: -0.22 }],
  marble: [{ x: 18, y: -30, angle: 0 }],
  feather: [{ x: 74, y: -4, angle: 1.62 }],
  buttons: [
    { x: -30, y: 104, angle: 0.3 },
    { x: -54, y: 106, angle: 1.2 },
    { x: -12, y: 92, angle: 0.5 },
  ],
  scissors: [{ x: -8, y: 24, angle: -0.62 }],
  clips: [
    { x: -72, y: -104, angle: 0.4 },
    { x: -52, y: -110, angle: -0.3 },
  ],
  comb: [{ x: 4, y: -58, angle: 0.08 }],
};

const TAU = Math.PI * 2;

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function circle(path: Path2D, x: number, y: number, r: number) {
  path.moveTo(x + r, y);
  path.arc(x, y, r, 0, TAU);
}

function oval(
  path: Path2D,
  x: number,
  y: number,
  rx: number,
  ry: number,
  turn: number,
) {
  path.moveTo(x + rx * Math.cos(turn), y + rx * Math.sin(turn));
  path.ellipse(x, y, rx, ry, turn, 0, TAU);
}

// A closed outline, always wound the same way so overlapping pieces fill rather than cancel.
function outline(path: Path2D, points: number[][]) {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[(i + 1) % points.length];
    area += x0 * y1 - x1 * y0;
  }
  const ordered = area < 0 ? [...points].reverse() : points;
  path.moveTo(ordered[0][0], ordered[0][1]);
  for (let i = 1; i < ordered.length; i++)
    path.lineTo(ordered[i][0], ordered[i][1]);
  path.closePath();
}

// A tapered bar from one point to another.
function bar(
  path: Path2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  w0: number,
  w1: number,
) {
  const length = Math.hypot(x1 - x0, y1 - y0);
  const nx = -(y1 - y0) / length;
  const ny = (x1 - x0) / length;
  outline(path, [
    [x0 + (nx * w0) / 2, y0 + (ny * w0) / 2],
    [x1 + (nx * w1) / 2, y1 + (ny * w1) / 2],
    [x1 - (nx * w1) / 2, y1 - (ny * w1) / 2],
    [x0 - (nx * w0) / 2, y0 - (ny * w0) / 2],
  ]);
}

// A point and its direction along a quadratic curve.
function along(
  p0: number[],
  p1: number[],
  p2: number[],
  s: number,
): { x: number; y: number; angle: number } {
  const u = 1 - s;
  return {
    x: u * u * p0[0] + 2 * u * s * p1[0] + s * s * p2[0],
    y: u * u * p0[1] + 2 * u * s * p1[1] + s * s * p2[1],
    angle: Math.atan2(
      2 * u * (p1[1] - p0[1]) + 2 * s * (p2[1] - p1[1]),
      2 * u * (p1[0] - p0[0]) + 2 * s * (p2[0] - p1[0]),
    ),
  };
}

// An old brass key, lying flat.
function key(): Shape {
  const bow = new Path2D();
  circle(bow, -33, 0, 13);
  circle(bow, -33, 0, 7.6);
  const stem = new Path2D();
  stem.moveTo(-21, -2.6);
  stem.lineTo(39, -2.6);
  stem.arc(39, 0, 2.6, -Math.PI / 2, Math.PI / 2);
  stem.lineTo(-21, 2.6);
  stem.closePath();
  const collar = new Path2D();
  collar.roundRect(-24.5, -4.7, 6, 9.4, 1.4);
  const bit = new Path2D();
  outline(bit, [
    [27, 2],
    [40, 2],
    [40, 15.5],
    [37.6, 15.5],
    [37.6, 9.5],
    [35.4, 9.5],
    [35.4, 15.5],
    [32.6, 15.5],
    [32.6, 6.8],
    [30.4, 6.8],
    [30.4, 15.5],
    [27, 15.5],
  ]);
  return {
    parts: [
      { path: bow, pass: 0, height: 1.6, rule: "evenodd" },
      { path: stem, pass: 0, height: 1.4 },
      { path: collar, pass: 0, height: 2.4 },
      { path: bit, pass: 0, height: 1.2 },
    ],
    draw(ctx, paint) {
      const brass = ctx.createLinearGradient(0, -14, 0, 16);
      brass.addColorStop(0, paint(226, 194, 112));
      brass.addColorStop(0.45, paint(180, 140, 64));
      brass.addColorStop(1, paint(110, 80, 32));
      ctx.fillStyle = brass;
      ctx.fill(bow, "evenodd");
      ctx.fill(stem);
      ctx.fill(bit);
      ctx.fill(collar);
      // Rubbed bright where fingers have held it.
      ctx.strokeStyle = paint(252, 230, 166, 0.75);
      ctx.lineWidth = 0.55;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(-19, -1.6);
      ctx.lineTo(38, -1.6);
      ctx.moveTo(-33 + 11.4 * Math.cos(3.4), 11.4 * Math.sin(3.4));
      ctx.arc(-33, 0, 11.4, 3.4, 5.3);
      ctx.stroke();
      ctx.strokeStyle = paint(76, 52, 18, 0.7);
      ctx.lineWidth = 0.35;
      ctx.stroke(bow);
      ctx.stroke(bit);
      ctx.stroke(collar);
    },
  };
}

// A frond of fern: alternate pinnae along a curved stem, each with lobed edges, those near the
// tip curling up off the paper.
function fern(seed: number): Shape {
  const random = rng(seed);
  const p0 = [-90, 8];
  const p1 = [-4, -16];
  const p2 = [86, 2];
  const flat = new Path2D();
  const curled = new Path2D();
  const ribs = new Path2D();
  const pinnae: { path: Path2D; shade: number }[] = [];
  const count = 36;
  for (let i = 0; i < count; i++) {
    const s = 0.05 + (0.9 * i) / (count - 1);
    const side = i % 2 === 0 ? 1 : -1;
    const base = along(p0, p1, p2, s);
    const length =
      4 +
      46 *
        (1 - s) ** 0.8 *
        Math.min(1, (s + 0.05) * 3.4) *
        (0.92 + random() * 0.16);
    const width = 2.2 + length * 0.21;
    const heading = base.angle + side * (Math.PI / 2 - 0.62);
    const bend = -side * 0.22;
    const lobes = Math.max(3, Math.round(length / 4.2));
    const upper: number[][] = [];
    const lower: number[][] = [];
    const steps = 30;
    let end = [base.x, base.y];
    for (let k = 0; k <= steps; k++) {
      const v = k / steps;
      const turn = heading + bend * v;
      const cx = base.x + Math.cos(heading + bend * v * 0.5) * length * v;
      const cy = base.y + Math.sin(heading + bend * v * 0.5) * length * v;
      const nx = -Math.sin(turn);
      const ny = Math.cos(turn);
      const taper = (1 - v) ** 0.75 * Math.min(1, 0.3 + v * 6);
      const lobe = 0.66 + 0.34 * Math.abs(Math.sin(Math.PI * v * lobes));
      const half = (width / 2) * taper * lobe;
      upper.push([cx + nx * half, cy + ny * half]);
      lower.push([cx - nx * half, cy - ny * half]);
      if (k === Math.round(steps * 0.85)) end = [cx, cy];
    }
    const path = new Path2D();
    outline(path, [...upper, ...lower.reverse()]);
    pinnae.push({ path, shade: random() });
    (s > 0.74 ? curled : flat).addPath(path);
    ribs.moveTo(base.x, base.y);
    ribs.lineTo(end[0], end[1]);
  }
  const stem = new Path2D();
  stem.moveTo(p0[0], p0[1]);
  stem.quadraticCurveTo(p1[0], p1[1], p2[0], p2[1]);
  return {
    parts: [
      { path: flat, pass: 0.12, height: 0.6 },
      { path: curled, pass: 0.12, height: 3.5 },
      { path: ribs, pass: 0.4, height: 0.6, line: 0.45 },
      { path: stem, pass: 0.05, height: 1.2, line: 1.6 },
    ],
    draw(ctx, paint) {
      for (const pinna of pinnae) {
        const t = pinna.shade;
        ctx.fillStyle = paint(62 + t * 26, 104 + t * 30, 40 + t * 12);
        ctx.fill(pinna.path);
      }
      ctx.lineCap = "round";
      ctx.strokeStyle = paint(150, 178, 96, 0.8);
      ctx.lineWidth = 0.35;
      ctx.stroke(ribs);
      ctx.strokeStyle = paint(112, 102, 54);
      ctx.lineWidth = 1.5;
      ctx.stroke(stem);
    },
  };
}

// A crocheted doily: a scalloped edge round rings of holes, a net of small ones and a ring of
// fan-shaped windows. One path, with every hole cut out of it.
function doily(): Shape {
  const lace = new Path2D();
  const edge: number[][] = [];
  for (let k = 0; k < 480; k++) {
    const t = (k / 480) * TAU;
    const r = 64 + 5 * Math.sqrt(Math.abs(Math.cos(12 * t)));
    edge.push([r * Math.cos(t), r * Math.sin(t)]);
  }
  outline(lace, edge);
  circle(lace, 0, 0, 3.5);
  for (let k = 0; k < 8; k++) {
    const t = (k / 8) * TAU;
    oval(lace, 10.5 * Math.cos(t), 10.5 * Math.sin(t), 4.6, 2, t);
  }
  for (let k = 0; k < 16; k++) {
    const t = (k / 16) * TAU + 0.2;
    circle(lace, 19 * Math.cos(t), 19 * Math.sin(t), 2.2);
  }
  const pitch = 3;
  for (let row = -15; row <= 15; row++) {
    const y = row * pitch * 0.866;
    for (let col = -15; col <= 15; col++) {
      const x = (col + (row % 2 ? 0.5 : 0)) * pitch;
      const r = Math.hypot(x, y);
      if (r > 25.8 && r < 40.2) circle(lace, x, y, 1.05);
    }
  }
  for (let k = 0; k < 12; k++) {
    const middle = (k / 12) * TAU;
    const spread = (TAU / 12) * 0.31;
    const window: number[][] = [];
    for (let j = 0; j <= 10; j++) {
      const t = middle - spread + (2 * spread * j) / 10;
      window.push([57 * Math.cos(t), 57 * Math.sin(t)]);
    }
    for (let j = 10; j >= 0; j--) {
      const t = middle - spread * 0.72 + (2 * spread * 0.72 * j) / 10;
      window.push([45 * Math.cos(t), 45 * Math.sin(t)]);
    }
    outline(lace, window);
    const between = middle + TAU / 24;
    circle(lace, 51 * Math.cos(between), 51 * Math.sin(between), 1.4);
  }
  for (let k = 0; k < 48; k++) {
    const t = (k / 48) * TAU;
    circle(lace, 61 * Math.cos(t), 61 * Math.sin(t), 1.1);
  }
  return {
    parts: [{ path: lace, pass: 0.1, height: 0.6, rule: "evenodd" }],
    draw(ctx, paint) {
      ctx.fillStyle = paint(240, 234, 218);
      ctx.fill(lace, "evenodd");
      ctx.strokeStyle = paint(186, 174, 150, 0.9);
      ctx.lineWidth = 0.32;
      ctx.stroke(lace);
    },
  };
}

// Dressmaker's scissors, a little open, with orange handles that stand off the paper.
function scissors(): Shape {
  const blades = new Path2D();
  blades.moveTo(-2, 5.2);
  blades.quadraticCurveTo(38, 10.5, 76, 10);
  blades.lineTo(74.5, 8.4);
  blades.quadraticCurveTo(40, 3.4, -2, -1.6);
  blades.closePath();
  const upper = new Path2D();
  upper.moveTo(-2, -5.2);
  upper.quadraticCurveTo(38, -10.5, 76, -10);
  upper.lineTo(74.5, -8.4);
  upper.quadraticCurveTo(40, -3.4, -2, 1.6);
  upper.closePath();
  blades.addPath(upper);
  const shanks = new Path2D();
  bar(shanks, 9, 0, -34, 15, 7.5, 5);
  bar(shanks, 9, 0, -36, -16, 7.5, 5);
  const handles = new Path2D();
  oval(handles, -50, 20, 17, 11.5, 0.25);
  oval(handles, -50, 20, 11.5, 7, 0.25);
  oval(handles, -54, -21, 21, 13, -0.2);
  oval(handles, -54, -21, 15.5, 8.5, -0.2);
  const screw = new Path2D();
  circle(screw, 8, 0, 3.4);
  return {
    parts: [
      { path: blades, pass: 0, height: 1.2 },
      { path: shanks, pass: 0, height: 2.5 },
      { path: handles, pass: 0, height: 4.5, rule: "evenodd" },
      { path: screw, pass: 0, height: 5 },
    ],
    draw(ctx, paint) {
      const steel = ctx.createLinearGradient(0, -11, 0, 11);
      steel.addColorStop(0, paint(214, 218, 222));
      steel.addColorStop(0.5, paint(140, 146, 152));
      steel.addColorStop(1, paint(200, 204, 210));
      ctx.fillStyle = steel;
      ctx.fill(blades);
      ctx.fill(shanks);
      ctx.strokeStyle = paint(250, 252, 255, 0.7);
      ctx.lineWidth = 0.4;
      ctx.beginPath();
      ctx.moveTo(4, -2.4);
      ctx.quadraticCurveTo(40, -6.2, 73, -8.6);
      ctx.stroke();
      ctx.strokeStyle = paint(70, 74, 80, 0.7);
      ctx.lineWidth = 0.3;
      ctx.stroke(blades);
      const plastic = ctx.createLinearGradient(-70, -30, -30, 30);
      plastic.addColorStop(0, paint(246, 128, 52));
      plastic.addColorStop(1, paint(196, 76, 22));
      ctx.fillStyle = plastic;
      ctx.fill(handles, "evenodd");
      ctx.strokeStyle = paint(255, 190, 130, 0.6);
      ctx.lineWidth = 0.6;
      ctx.stroke(handles);
      ctx.fillStyle = paint(176, 180, 186);
      ctx.fill(screw);
      ctx.strokeStyle = paint(60, 62, 66);
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.moveTo(6, -2);
      ctx.lineTo(10, 2);
      ctx.stroke();
    },
  };
}

// A cat's-eye marble. To the enlarger it's a ball lens: light through its middle is gathered
// into a bright spot just under the paper, light through its edge is thrown wide.
function marble(): Shape {
  const ball = new Path2D();
  circle(ball, 0, 0, 8);
  const spot = new Path2D();
  circle(spot, 0, 0, 2.3);
  const vane = new Path2D();
  vane.moveTo(-6.6, 1.2);
  vane.bezierCurveTo(-2.5, -4.2, 2.5, 3.2, 6.6, -1.6);
  vane.lineTo(6.4, 0.2);
  vane.bezierCurveTo(2.2, 5, -2.2, -2.2, -6.4, 2.8);
  vane.closePath();
  return {
    parts: [
      { path: ball, pass: 0.07, height: 8 },
      { path: spot, pass: 1, height: 8, focus: 9, disc: [0, 0, 2.3] },
    ],
    draw(ctx, paint) {
      const glass = ctx.createRadialGradient(-1.8, -1.8, 0.4, 0, 0, 8);
      glass.addColorStop(0, paint(226, 244, 246, 0.3));
      glass.addColorStop(0.62, paint(128, 186, 198, 0.5));
      glass.addColorStop(1, paint(26, 66, 80, 0.88));
      ctx.fillStyle = glass;
      ctx.fill(ball);
      ctx.fillStyle = paint(34, 86, 196, 0.9);
      ctx.fill(vane);
      ctx.save();
      ctx.rotate(Math.PI / 2);
      ctx.fillStyle = paint(238, 150, 42, 0.9);
      ctx.fill(vane);
      ctx.restore();
      ctx.fillStyle = paint(255, 255, 255, 0.85);
      ctx.beginPath();
      ctx.ellipse(-3, -3.4, 2.2, 1.2, -0.6, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = paint(16, 44, 54, 0.6);
      ctx.lineWidth = 0.4;
      ctx.stroke(ball);
    },
  };
}

// A white goose feather: a quill, a vane of fine barbs either side with a few splits in it,
// down at the base, and a tip that curls up off the paper.
function feather(seed: number): Shape {
  const random = rng(seed);
  const p0 = [-70, 3];
  const p1 = [0, -9];
  const p2 = [66, 0];
  const start = 0.16;
  const width = (s: number, side: number) => {
    const v = Math.min(1, Math.max(0, (s - start) / (1 - start)));
    return (
      (side > 0 ? 19 : 12.5) *
      Math.sin(Math.PI * v ** 0.75) ** 0.5 *
      (1 - 0.25 * v)
    );
  };
  const vaneFlat = new Path2D();
  const vaneTip = new Path2D();
  const barbsFlat = new Path2D();
  const barbsTip = new Path2D();
  const down = new Path2D();
  const bend = 0.7;
  for (const [from, to, path] of [
    [start, 0.76, vaneFlat],
    [0.74, 1, vaneTip],
  ] as const) {
    const points: number[][] = [];
    for (const side of [1, -1]) {
      const run: number[][] = [];
      for (let k = 0; k <= 40; k++) {
        const s = from + ((to - from) * k) / 40;
        const p = along(p0, p1, p2, s);
        const w = width(s, side);
        const lean = p.angle + side * bend;
        run.push([p.x + Math.cos(lean) * w, p.y + Math.sin(lean) * w]);
      }
      points.push(...(side > 0 ? run : run.reverse()));
    }
    outline(path, points);
  }
  for (const side of [1, -1]) {
    const splits = [0.3 + random() * 0.15, 0.5 + random() * 0.15, 0.78];
    for (let s = start; s < 0.995; s += 0.0058) {
      const p = along(p0, p1, p2, s);
      let lean = side * (bend + 0.25 * (1 - s));
      for (const split of splits) {
        const d = s - split;
        if (d > -0.03 && d < 0) lean += side * 0.16 * (1 + d / 0.03);
        if (d >= 0 && d < 0.02) lean -= side * 0.1 * (1 - d / 0.02);
      }
      const reach = width(s + 0.03, side) * (0.94 + random() * 0.1);
      const a = p.angle + lean;
      const c = p.angle + lean - side * 0.3;
      const path = s > 0.75 ? barbsTip : barbsFlat;
      path.moveTo(p.x, p.y);
      path.quadraticCurveTo(
        p.x + Math.cos(a) * reach * 0.55,
        p.y + Math.sin(a) * reach * 0.55,
        p.x + Math.cos(c) * reach,
        p.y + Math.sin(c) * reach,
      );
    }
    for (let k = 0; k < 24; k++) {
      const s = 0.03 + random() * 0.16;
      const p = along(p0, p1, p2, s);
      const a = p.angle + side * (0.9 + random() * 0.8);
      const reach = 8 + random() * 12;
      down.moveTo(p.x, p.y);
      down.bezierCurveTo(
        p.x + Math.cos(a) * reach * 0.4 + (random() - 0.5) * 6,
        p.y + Math.sin(a) * reach * 0.4 + (random() - 0.5) * 6,
        p.x + Math.cos(a) * reach * 0.8 + (random() - 0.5) * 6,
        p.y + Math.sin(a) * reach * 0.8 + (random() - 0.5) * 6,
        p.x + Math.cos(a) * reach,
        p.y + Math.sin(a) * reach,
      );
    }
  }
  const quill = new Path2D();
  const q = along(p0, p1, p2, start);
  quill.moveTo(p0[0], p0[1]);
  quill.lineTo(q.x, q.y);
  const shaft = new Path2D();
  shaft.moveTo(q.x, q.y);
  for (let s = start; s <= 1.0001; s += 0.02) {
    const p = along(p0, p1, p2, s);
    shaft.lineTo(p.x, p.y);
  }
  return {
    parts: [
      { path: vaneFlat, pass: 0.4, height: 1.5 },
      { path: vaneTip, pass: 0.4, height: 6 },
      { path: barbsFlat, pass: 0.6, height: 1.5, line: 0.22 },
      { path: barbsTip, pass: 0.6, height: 6, line: 0.22 },
      { path: down, pass: 0.5, height: 5, line: 0.3 },
      { path: quill, pass: 0.2, height: 1.5, line: 2.2 },
      { path: shaft, pass: 0.08, height: 2, line: 1.1 },
    ],
    draw(ctx, paint) {
      ctx.fillStyle = paint(218, 216, 208, 0.6);
      ctx.fill(vaneFlat);
      ctx.fill(vaneTip);
      ctx.lineCap = "round";
      ctx.strokeStyle = paint(242, 240, 234, 0.7);
      ctx.lineWidth = 0.22;
      ctx.stroke(barbsFlat);
      ctx.stroke(barbsTip);
      ctx.strokeStyle = paint(244, 242, 236, 0.55);
      ctx.lineWidth = 0.3;
      ctx.stroke(down);
      ctx.strokeStyle = paint(226, 220, 200, 0.85);
      ctx.lineWidth = 2.2;
      ctx.stroke(quill);
      ctx.strokeStyle = paint(214, 206, 186);
      ctx.lineWidth = 1.1;
      ctx.stroke(shaft);
    },
  };
}

// Three buttons: a horn coat button, a translucent shirt button and a red two-hole one.
const BUTTONS = [
  {
    radius: 11,
    holes: 4,
    hole: 1.25,
    spread: 2.7,
    pass: 0,
    rim: 8.6,
    height: 2.5,
    colour: [104, 66, 42],
  },
  {
    radius: 5.8,
    holes: 4,
    hole: 0.72,
    spread: 1.45,
    pass: 0.28,
    rim: 4.6,
    height: 1.2,
    colour: [242, 240, 230],
  },
  {
    radius: 8,
    holes: 2,
    hole: 1.1,
    spread: 2.1,
    pass: 0,
    rim: 6.4,
    height: 2,
    colour: [190, 42, 38],
  },
];

function button(variant: number): Shape {
  const spec = BUTTONS[variant % BUTTONS.length];
  const body = new Path2D();
  circle(body, 0, 0, spec.radius);
  const holes: number[][] =
    spec.holes === 4
      ? [
          [-1, -1],
          [1, -1],
          [1, 1],
          [-1, 1],
        ].map(([x, y]) => [x * spec.spread, y * spec.spread])
      : [
          [-spec.spread, 0],
          [spec.spread, 0],
        ];
  for (const [x, y] of holes) circle(body, x, y, spec.hole);
  const rim = new Path2D();
  circle(rim, 0, 0, spec.radius);
  circle(rim, 0, 0, spec.rim);
  const [r, g, b] = spec.colour;
  return {
    parts: [
      { path: body, pass: spec.pass, height: spec.height, rule: "evenodd" },
      ...(spec.pass > 0
        ? [
            {
              path: rim,
              pass: 0.6,
              height: spec.height,
              rule: "evenodd" as const,
            },
          ]
        : []),
    ],
    draw(ctx, paint) {
      const face = ctx.createRadialGradient(
        -spec.radius * 0.3,
        -spec.radius * 0.3,
        0,
        0,
        0,
        spec.radius,
      );
      face.addColorStop(
        0,
        paint(r * 1.15, g * 1.15, b * 1.15, spec.pass ? 0.8 : 1),
      );
      face.addColorStop(
        1,
        paint(r * 0.7, g * 0.7, b * 0.7, spec.pass ? 0.85 : 1),
      );
      ctx.fillStyle = face;
      ctx.fill(body, "evenodd");
      ctx.strokeStyle = paint(r * 1.3, g * 1.3, b * 1.3, 0.6);
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.arc(0, 0, (spec.radius + spec.rim) / 2, 0, TAU);
      ctx.stroke();
      ctx.strokeStyle = paint(r * 0.45, g * 0.45, b * 0.45, 0.7);
      ctx.lineWidth = 0.3;
      ctx.stroke(body);
    },
  };
}

// A gem clip, bent from wire.
function clip(): Shape {
  const wire = new Path2D();
  wire.moveTo(4, -1);
  wire.lineTo(-10, -1);
  wire.arc(-10, 0.6, 1.6, -Math.PI / 2, Math.PI / 2, true);
  wire.lineTo(11.5, 2.2);
  wire.arc(11.5, -1, 3.2, Math.PI / 2, -Math.PI / 2, true);
  wire.lineTo(-12.5, -4.2);
  wire.arc(-12.5, 0, 4.2, -Math.PI / 2, Math.PI / 2, true);
  wire.lineTo(7, 4.2);
  return {
    parts: [{ path: wire, pass: 0, height: 0.5, line: 0.9 }],
    draw(ctx, paint) {
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = paint(170, 176, 184);
      ctx.lineWidth = 0.9;
      ctx.stroke(wire);
      ctx.strokeStyle = paint(244, 246, 250, 0.6);
      ctx.lineWidth = 0.28;
      ctx.stroke(wire);
    },
  };
}

// A tortoiseshell comb, coarse teeth at one end and fine at the other. Amber plastic lets a
// little blue through, so it prints as a pale grey rather than white.
function comb(seed: number): Shape {
  const random = rng(seed);
  const body = new Path2D();
  body.roundRect(-60, -14, 120, 9.5, [4.5, 4.5, 0.6, 0.6]);
  const tooth = (x: number, w: number) =>
    outline(body, [
      [x, -4.7],
      [x + w, -4.7],
      [x + w * 0.82, 11.3],
      [x + w * 0.5, 12.2],
      [x + w * 0.18, 11.3],
    ]);
  for (let x = -57.5; x + 1.7 < -0.5; x += 3.2) tooth(x, 1.7);
  for (let x = 0.6; x + 0.9 < 58.5; x += 1.6) tooth(x, 0.9);
  const blotches = new Path2D();
  for (let k = 0; k < 46; k++) {
    oval(
      blotches,
      -60 + random() * 120,
      -14 + random() * 26,
      1.5 + random() * 4,
      0.8 + random() * 2.2,
      random() * Math.PI,
    );
  }
  return {
    parts: [{ path: body, pass: 0.2, height: 1.5 }],
    draw(ctx, paint) {
      ctx.fillStyle = paint(178, 104, 36, 0.92);
      ctx.fill(body);
      ctx.save();
      ctx.clip(body);
      ctx.fillStyle = paint(76, 34, 12, 0.6);
      ctx.fill(blotches);
      ctx.restore();
      ctx.strokeStyle = paint(250, 210, 150, 0.5);
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(-56, -12.6);
      ctx.lineTo(56, -12.6);
      ctx.stroke();
    },
  };
}

export function buildShape(kind: PropKind, variant: number, seed: number) {
  switch (kind) {
    case "fern":
      return fern(seed);
    case "doily":
      return doily();
    case "key":
      return key();
    case "marble":
      return marble();
    case "feather":
      return feather(seed);
    case "buttons":
      return button(variant);
    case "scissors":
      return scissors();
    case "clips":
      return clip();
    case "comb":
      return comb(seed);
  }
}

// A dodger: a disc of black card on a long wire, held well above the paper to hold back light
// from part of it. The wire's shadow is there too, which is why printers keep it moving.
export function dodger(): Shape {
  const card = new Path2D();
  circle(card, 0, 0, 13);
  const wire = new Path2D();
  wire.moveTo(12.6, 1);
  wire.lineTo(280, 34);
  return {
    parts: [
      { path: card, pass: 0, height: 0 },
      { path: wire, pass: 0, height: 2, line: 1.1 },
    ],
    draw(ctx, paint) {
      ctx.fillStyle = paint(30, 30, 32);
      ctx.fill(card);
      ctx.strokeStyle = paint(90, 90, 96, 0.8);
      ctx.lineWidth = 0.5;
      ctx.stroke(card);
      ctx.lineCap = "round";
      ctx.strokeStyle = paint(170, 174, 180);
      ctx.lineWidth = 1.1;
      ctx.stroke(wire);
    },
  };
}
