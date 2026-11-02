// A fifteen-note paper-strip music box on a 2D canvas, seen from above and in front so the
// handle turns face-on. Everything is laid out in millimetres and drawn through one orthographic
// camera, so each flat face of the movement is an affine map of the canvas and keeps its true
// shape. The strip is card punched on a grid: one line per tine, one column per eighth note.
//
// Turning the handle pulls the strip under a row of star wheels. When a hole comes along, the
// point of its line's wheel drops into it, the moving paper turns the wheel, and the next point
// lifts the tip of that line's tine and lets it go. So a note sounds a little after its hole
// arrives, and a wheel can't take another hole until it has turned through a whole point: two
// holes a column apart on one line and the second goes by unread. The handle drives through a
// pawl and ratchet, so turned backwards it only clicks and the paper stays put.

import { createVoice, type Surface, tineDecay } from "./sound";
import { NOTES, PITCHES, TRACKS, TUNES, type TuneId } from "./tunes";

export type { Surface } from "./sound";

export type MusicBoxSettings = {
  // The strip's ends taped together, so it goes round for ever.
  loop: boolean;
  // Turns of the handle a second, when it's turning by itself or from the keyboard.
  speed: number;
  turning: boolean;
  surface: Surface;
  sound: boolean;
};

export const DEFAULT_SETTINGS: MusicBoxSettings = {
  loop: false,
  speed: 0.9,
  turning: false,
  surface: "table",
  sound: true,
};

export type MusicBoxStats = {
  bpm: number | null;
  bar: number;
  bars: number;
  holes: number;
  ended: boolean;
  fps: number | null;
};

type Vec = [number, number, number];
type RGB = [number, number, number];

const clamp = (v: number, lo: number, hi: number) =>
  v < lo ? lo : v > hi ? hi : v;
const smooth = (t: number) => {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
};

// The camera looks down at 60°, turned so the strip runs corner to corner.
const ELEVATION = (60 * Math.PI) / 180;
const SE = Math.sin(ELEVATION);
const CE = Math.cos(ELEVATION);

// The strip. Columns are 4 mm apart and lines 2.5 mm, like a real fifteen-note strip; it has a
// tapered lead-in to feed it by, and a little blank paper after the last column.
const TRACK = 2.5;
const COLUMN = 4;
const HALF = 22;
const HOLE = 0.9;
const LEAD = 22;
const TAIL = 12;
const PAPER_Y = 0.15;
const trackZ = (track: number) => (7 - track) * TRACK;

// One turn of the handle moves the strip four columns, so a beat is half a turn.
const FEED = 4;
// Where the strip sits when it's just been fed: its first column a column and a half short.
const START = -1.5;
// A star wheel's point drops into a hole this many columns before the hole reaches the wheel's
// axle, lets the tine go as it does, and the wheel is still turning until this many after.
const ENGAGE = 0.6;
const SETTLE = 0.9;
const POINTS = 5;

// The comb: tines tipped at the star wheels, the bass ones longest.
const TIP = -1.5;
const TINE_WIDTH = 1.7;
const TINE_TOP = 5.2;
const TINE_BOTTOM = 4.7;
const COMB_BACK = -33;
const COMB_HALF = 20;
const tineLength = (track: number) =>
  19.5 * (PITCHES[0] / PITCHES[track]) ** 0.42;
const tineRoot = (track: number) => TIP - tineLength(track);

const WHEEL_Y = 2.55;
const WHEEL_R = 2.3;
const WHEEL_IN = 1.25;

// The handle, on its own bracket beside the feed, with a gear driving a pinion into the works.
const AXLE: [number, number] = [15, 13.5];
const ARM = 10;
const ARM_Z = [25.6, 26.4] as const;
const KNOB_Z = [26.4, 33.4] as const;
const KNOB_R = 2.1;
const GEAR_R = 6;
const GEAR_TEETH = 24;
const GEAR_Z = [24.4, 25.4] as const;
const PINION: [number, number] = [11.5, 5.2];
const PINION_R = 3;
const PINION_TEETH = 12;
const RATCHET = (Math.PI * 2) / 12;

// The movement's footprint, where there's no strip to punch.
const BODY_X = [-35, 24] as const;

const UP: Vec = [0, 1, 0];
const FRONT: Vec = [0, 0, 1];
const RIGHT: Vec = [1, 0, 0];
const X_AXIS: Vec = [1, 0, 0];
const Y_AXIS: Vec = [0, 1, 0];
const Z_AXIS: Vec = [0, 0, 1];

function normalise(x: number, y: number, z: number): Vec {
  const l = Math.hypot(x, y, z);
  return [x / l, y / l, z / l];
}

// A key light high on the left and a little in front, so shadows fall back and to the right.
const LIGHT = normalise(-0.36, 0.82, 0.46);
const SHADOW_X = -LIGHT[0] / LIGHT[1];
const SHADOW_Z = -LIGHT[2] / LIGHT[1];
// Held up in the hand, the table is this far below.
const LIFT = 55;

const BRASS: RGB = [204, 160, 86];
const BRASS_EDGE: RGB = [146, 106, 48];
const STEEL: RGB = [178, 184, 192];
const STEEL_EDGE: RGB = [112, 118, 126];
const ZINC: RGB = [118, 122, 128];
const LEAD_GREY: RGB = [120, 122, 126];
const BEECH: RGB = [210, 162, 108];

const MAX_PIXELS = 2_600_000;

// A small deterministic random, so the table's grain is the same on every visit.
function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hull(points: [number, number][]) {
  const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cross = (o: number[], a: number[], b: number[]) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: [number, number][] = [];
  for (const point of p) {
    while (
      lower.length >= 2 &&
      cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0
    ) {
      lower.pop();
    }
    lower.push(point);
  }
  const upper: [number, number][] = [];
  for (let i = p.length - 1; i >= 0; i--) {
    while (
      upper.length >= 2 &&
      cross(upper[upper.length - 2], upper[upper.length - 1], p[i]) <= 0
    ) {
      upper.pop();
    }
    upper.push(p[i]);
  }
  upper.pop();
  lower.pop();
  return lower.concat(upper);
}

type Strip = {
  columns: number;
  // One byte for every column and line: 0 blank, 1 punched, 2 punched and taped over.
  holes: Uint8Array;
};

function stripFor(id: TuneId): Strip {
  const tune = TUNES.find((entry) => entry.value === id) ?? TUNES[0];
  const holes = new Uint8Array(tune.columns * TRACKS);
  for (const [column, track] of tune.holes) holes[column * TRACKS + track] = 1;
  return { columns: tune.columns, holes };
}

type Wheel = {
  // The angle it rests at between holes, and the hole it's turning for.
  rest: number;
  column: number;
  from: number;
  until: number;
  armed: boolean;
};

type Chad = {
  x: number;
  z: number;
  fromX: number;
  fromZ: number;
  t: number;
  spin: number;
  tilt: number;
};

type Drag =
  | { kind: "crank"; offset: number; angle: number }
  | { kind: "punch"; mode: "punch" | "tape" | "peel"; last: number };

type Hover = { column: number; track: number };

export function createMusicBox(
  canvas: HTMLCanvasElement,
  {
    onStats,
    onNote,
  }: {
    onStats?: (stats: MusicBoxStats) => void;
    onNote?: (note: string) => void;
  } = {},
) {
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas 2D is not available.");
  const ctx = context;
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const voice = createVoice();

  const backdrop = document.createElement("canvas");
  const backdropContext = backdrop.getContext("2d");
  const paper = document.createElement("canvas");
  const paperContext = paper.getContext("2d");
  if (!backdropContext || !paperContext) {
    throw new Error("Canvas 2D is not available.");
  }
  const bc = backdropContext;
  const pc = paperContext;

  const fontFamily =
    getComputedStyle(document.documentElement)
      .getPropertyValue("--font-barlow")
      .trim() || "sans-serif";

  let settings: MusicBoxSettings = { ...DEFAULT_SETTINGS };
  let night = false;

  let strip = stripFor("twinkle");
  let pos = START;
  let ended = false;
  let refeed: { from: number; t: number } | null = null;

  // The handle, in radians anticlockwise as you look at it, so turning it clockwise plays. The
  // gear only follows it forwards: `back` is how far the handle has gone back over the ratchet
  // since the pawl last drove it.
  let crank = Math.PI * 0.62;
  let gear = crank;
  let back = 0;
  let crankVelocity = 0;
  let pendingTurn = 0;
  let keyTurn = 0;
  let rate = 0;

  const wheels: Wheel[] = Array.from({ length: TRACKS }, (_, track) => ({
    rest: track * 0.37,
    column: 0,
    from: 0,
    until: Number.NEGATIVE_INFINITY,
    armed: false,
  }));
  // How far each tine is bent up by its wheel, and how hard it's ringing, in millimetres.
  const lifts = new Float32Array(TRACKS);
  const swings = new Float32Array(TRACKS);
  const chads: Chad[] = [];

  const drags = new Map<number, Drag>();
  let hover: Hover | null = null;
  const said = new Set<string>();

  function note(key: string, text: string) {
    if (said.has(key)) return;
    said.add(key);
    onNote?.(text);
  }

  // --- The camera --------------------------------------------------------------------------

  let width = 0;
  let height = 0;
  let ratio = 1;
  let k = 4;
  let cp = 1;
  let sp = 0;
  let ox = 0;
  let oy = 0;

  const project = (x: number, y: number, z: number): [number, number] => [
    ox + k * (x * cp - z * sp),
    oy + k * ((x * sp + z * cp) * SE - y * CE),
  ];
  const linear = (v: Vec): [number, number] => [
    k * (v[0] * cp - v[2] * sp),
    k * ((v[0] * sp + v[2] * cp) * SE - v[1] * CE),
  ];

  // Points the canvas at a flat face: local (s, t) on it is origin + s·u + t·v in the world.
  function plane(
    target: CanvasRenderingContext2D,
    origin: Vec,
    u: Vec,
    v: Vec,
    shift = 0,
  ) {
    const [x, y] = project(...origin);
    const [ux, uy] = linear(u);
    const [vx, vy] = linear(v);
    target.setTransform(
      ux * ratio,
      uy * ratio,
      vx * ratio,
      vy * ratio,
      (x + shift) * ratio,
      y * ratio,
    );
  }
  const front = (z: number) => plane(ctx, [0, 0, z], X_AXIS, Y_AXIS);
  const top = (y: number) => plane(ctx, [0, y, 0], X_AXIS, Z_AXIS);
  const side = (x: number) => plane(ctx, [x, 0, 0], Z_AXIS, Y_AXIS);
  const screen = (target: CanvasRenderingContext2D = ctx) =>
    target.setTransform(ratio, 0, 0, ratio, 0, 0);

  // Where a point on the stage lands on the horizontal plane at height y.
  function onFloor(px: number, py: number, y = PAPER_Y) {
    const a = (px - ox) / k;
    const b = ((py - oy) / k + y * CE) / SE;
    return { x: a * cp + b * sp, z: -a * sp + b * cp };
  }
  // And on the upright plane at depth z, facing you.
  function onUpright(px: number, py: number, z: number) {
    const x = ((px - ox) / k + z * sp) / cp;
    const y = ((x * sp + z * cp) * SE - (py - oy) / k) / CE;
    return { x, y };
  }

  function layout() {
    // Turn the camera so the strip lies along the stage's diagonal, within limits that keep the
    // handle turning face-on enough to grab.
    const along = clamp(Math.atan2(height, width) * 0.85, 0.3, 0.75);
    const phi = clamp(Math.atan(Math.tan(along) / SE), 0.3, 0.8);
    cp = Math.cos(phi);
    sp = Math.sin(phi);
    // Fit the movement, its handle and a short stretch of strip either side; the rest of the
    // strip runs off the edges.
    const fit: Vec[] = [
      [-42, 0, -HALF],
      [-42, 0, HALF],
      [-34, 6, -25],
      [44, 0, -HALF],
      [44, 0, HALF],
      [22, 22, 24],
      [AXLE[0], AXLE[1] - ARM, KNOB_Z[1] + 1],
      [AXLE[0] - ARM, AXLE[1], KNOB_Z[1] + 1],
      [AXLE[0] + ARM, AXLE[1] + ARM, KNOB_Z[1] + 1],
    ];
    k = 1;
    ox = 0;
    oy = 0;
    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    for (const point of fit) {
      const [x, y] = project(...point);
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
    const margin = Math.min(width, height) * 0.04;
    k = clamp(
      Math.min(
        (width - margin * 2) / (maxX - minX),
        (height - margin * 2) / (maxY - minY),
      ),
      2.2,
      8,
    );
    // Centred across, and a little high on a tall stage, so the strip has room to run down
    // towards you.
    ox = width / 2 - (k * (minX + maxX)) / 2;
    const slack = height - k * (maxY - minY);
    oy = height / 2 - (k * (minY + maxY)) / 2 - Math.max(0, slack) * 0.12;
  }

  // --- Lighting ----------------------------------------------------------------------------

  function rgb(c: RGB, f = 1, alpha = 1) {
    const r = Math.round(clamp(c[0] * f, 0, 255));
    const g = Math.round(clamp(c[1] * f, 0, 255));
    const b = Math.round(clamp(c[2] * f, 0, 255));
    return alpha < 1 ? `rgba(${r},${g},${b},${alpha})` : `rgb(${r},${g},${b})`;
  }

  // A face of some material lit from the key light, with the lamp warmer at night.
  function lit(base: RGB, normal: Vec, extra = 0) {
    const d = Math.max(
      0,
      normal[0] * LIGHT[0] + normal[1] * LIGHT[1] + normal[2] * LIGHT[2],
    );
    const f = (night ? 0.34 : 0.46) + (night ? 0.8 : 0.66) * d + extra;
    const tint: RGB = night ? [1.03, 0.95, 0.85] : [1, 1, 1];
    return rgb([base[0] * tint[0], base[1] * tint[1], base[2] * tint[2]], f);
  }

  // --- The surface under it ----------------------------------------------------------------

  function floorRange() {
    const corners = [
      onFloor(0, 0, 0),
      onFloor(width, 0, 0),
      onFloor(0, height, 0),
      onFloor(width, height, 0),
    ];
    return {
      x0: Math.min(...corners.map((c) => c.x)) - 20,
      x1: Math.max(...corners.map((c) => c.x)) + 20,
      z0: Math.min(...corners.map((c) => c.z)) - 20,
      z1: Math.max(...corners.map((c) => c.z)) + 20,
    };
  }

  // Wood, as long fibres laid along one direction: broad bands of early and late growth, fine
  // lines over them, and the dashes of open pores.
  function wood(range: ReturnType<typeof floorRange>, dark: boolean) {
    const random = seeded(7);
    const base: RGB = dark ? [92, 62, 42] : [214, 186, 146];
    const line: RGB = dark ? [52, 32, 20] : [168, 128, 86];
    const light: RGB = dark ? [124, 86, 58] : [232, 208, 172];
    bc.fillStyle = rgb(base);
    bc.fillRect(range.x0, range.z0, range.x1 - range.x0, range.z1 - range.z0);
    bc.save();
    bc.rotate(-0.12);
    const span = Math.max(range.x1 - range.x0, range.z1 - range.z0) * 1.6;
    const x0 = (range.x0 + range.x1) / 2 - span / 2;
    const z0 = (range.z0 + range.z1) / 2 - span / 2;
    const wave = (x: number, a: number, b: number, c: number) =>
      Math.sin(x / a + c) * 1.6 + Math.sin(x / b + c * 2.3) * 0.7;
    for (let z = z0; z < z0 + span; ) {
      const band = 3 + random() * 9;
      const phase = random() * 9;
      const a = 30 + random() * 40;
      const b = 9 + random() * 8;
      bc.beginPath();
      for (let x = x0; x <= x0 + span; x += 4) {
        bc.lineTo(x, z + wave(x, a, b, phase));
      }
      for (let x = x0 + span; x >= x0; x -= 4) {
        bc.lineTo(x, z + band * 0.45 + wave(x, a, b, phase + 0.2));
      }
      bc.closePath();
      bc.fillStyle = rgb(
        random() < 0.5 ? line : light,
        1,
        0.1 + random() * 0.12,
      );
      bc.fill();
      z += band;
    }
    for (let i = 0; i < 520; i++) {
      const z = z0 + random() * span;
      const phase = random() * 9;
      const a = 30 + random() * 50;
      const b = 8 + random() * 10;
      bc.beginPath();
      for (let x = x0; x <= x0 + span; x += 5) {
        bc.lineTo(x, z + wave(x, a, b, phase) * 0.8);
      }
      bc.lineWidth = 0.06 + random() * 0.18;
      bc.strokeStyle = rgb(line, 1, 0.05 + random() * 0.14);
      bc.stroke();
    }
    bc.fillStyle = rgb(line, 0.8, 0.22);
    for (let i = 0; i < 4200; i++) {
      bc.fillRect(
        x0 + random() * span,
        z0 + random() * span,
        0.4 + random() * 1.1,
        0.07 + random() * 0.06,
      );
    }
    bc.restore();
  }

  // Kraft cardboard: brown, speckled with fibres, the flutes inside showing as faint ridges,
  // and a band of packing tape across the top.
  function cardboard(range: ReturnType<typeof floorRange>, dark: boolean) {
    const random = seeded(11);
    const base: RGB = dark ? [124, 88, 54] : [184, 140, 92];
    bc.fillStyle = rgb(base);
    bc.fillRect(range.x0, range.z0, range.x1 - range.x0, range.z1 - range.z0);
    for (let x = Math.floor(range.x0 / 3.6) * 3.6; x < range.x1; x += 3.6) {
      const ridge = bc.createLinearGradient(x, 0, x + 3.6, 0);
      ridge.addColorStop(0, "rgba(255,240,210,0.07)");
      ridge.addColorStop(0.5, "rgba(60,30,0,0.06)");
      ridge.addColorStop(1, "rgba(255,240,210,0.07)");
      bc.fillStyle = ridge;
      bc.fillRect(x, range.z0, 3.6, range.z1 - range.z0);
    }
    for (let i = 0; i < 9000; i++) {
      const x = range.x0 + random() * (range.x1 - range.x0);
      const z = range.z0 + random() * (range.z1 - range.z0);
      bc.fillStyle =
        random() < 0.5
          ? `rgba(60,34,10,${0.08 + random() * 0.18})`
          : `rgba(255,236,200,${0.06 + random() * 0.14})`;
      bc.save();
      bc.translate(x, z);
      bc.rotate(random() * Math.PI);
      bc.fillRect(0, 0, 0.3 + random() * 1.4, 0.08);
      bc.restore();
    }
    // Brown packing tape, 48 mm wide, a little glossy and creased.
    const tapeZ = 44;
    bc.fillStyle = dark ? "rgba(150,96,40,0.55)" : "rgba(176,112,44,0.5)";
    bc.fillRect(range.x0, tapeZ, range.x1 - range.x0, 48);
    const sheen = bc.createLinearGradient(0, tapeZ, 0, tapeZ + 48);
    sheen.addColorStop(0, "rgba(255,255,255,0.12)");
    sheen.addColorStop(0.3, "rgba(255,255,255,0.02)");
    sheen.addColorStop(0.7, "rgba(255,255,255,0.08)");
    sheen.addColorStop(1, "rgba(255,255,255,0.0)");
    bc.fillStyle = sheen;
    bc.fillRect(range.x0, tapeZ, range.x1 - range.x0, 48);
    bc.strokeStyle = "rgba(90,50,10,0.35)";
    bc.lineWidth = 0.3;
    bc.beginPath();
    bc.moveTo(range.x0, tapeZ);
    bc.lineTo(range.x1, tapeZ);
    bc.moveTo(range.x0, tapeZ + 48);
    bc.lineTo(range.x1, tapeZ + 48);
    bc.stroke();
    for (let i = 0; i < 18; i++) {
      const x = range.x0 + random() * (range.x1 - range.x0);
      bc.strokeStyle = `rgba(255,255,255,${0.05 + random() * 0.08})`;
      bc.beginPath();
      bc.moveTo(x, tapeZ);
      bc.lineTo(x + (random() - 0.5) * 30, tapeZ + 48);
      bc.stroke();
    }
  }

  // A biscuit tin lid: deep blue enamel printed with a gold lattice and a little flower at
  // every crossing.
  function tin(range: ReturnType<typeof floorRange>, dark: boolean) {
    bc.fillStyle = dark ? "#16264a" : "#22396e";
    bc.fillRect(range.x0, range.z0, range.x1 - range.x0, range.z1 - range.z0);
    const gold = dark ? "rgba(196,156,74,0.75)" : "rgba(214,176,92,0.85)";
    const step = 14;
    const reach = Math.max(range.x1 - range.x0, range.z1 - range.z0);
    const n = Math.ceil(reach / step);
    bc.save();
    bc.translate((range.x0 + range.x1) / 2, (range.z0 + range.z1) / 2);
    bc.rotate(Math.PI / 4);
    bc.strokeStyle = gold;
    bc.lineWidth = 0.35;
    bc.beginPath();
    for (let i = -n; i <= n; i++) {
      bc.moveTo(-n * step, i * step);
      bc.lineTo(n * step, i * step);
      bc.moveTo(i * step, -n * step);
      bc.lineTo(i * step, n * step);
    }
    bc.stroke();
    for (let i = -n; i <= n; i++) {
      for (let j = -n; j <= n; j++) {
        const x = i * step;
        const z = j * step;
        bc.fillStyle = gold;
        for (let p = 0; p < 4; p++) {
          const a = (p * Math.PI) / 2 + Math.PI / 4;
          bc.beginPath();
          bc.ellipse(
            x + Math.cos(a) * 1.4,
            z + Math.sin(a) * 1.4,
            1.25,
            0.62,
            a,
            0,
            Math.PI * 2,
          );
          bc.fill();
        }
        bc.beginPath();
        bc.arc(x, z, 0.55, 0, Math.PI * 2);
        bc.fillStyle = dark ? "rgba(150,40,40,0.9)" : "rgba(184,44,44,0.95)";
        bc.fill();
      }
    }
    bc.restore();
  }

  function renderBackdrop() {
    if (!backdrop.width || !backdrop.height) return;
    bc.setTransform(1, 0, 0, 1, 0, 0);
    bc.clearRect(0, 0, backdrop.width, backdrop.height);
    plane(bc, [0, 0, 0], X_AXIS, Z_AXIS);
    const range = floorRange();
    const surface = settings.surface;
    if (surface === "box") cardboard(range, night);
    else if (surface === "tin") tin(range, night);
    else wood(range, night);
    screen(bc);
    if (surface === "tin") {
      // Enamel on steel is a mirror: a broad soft reflection of the window or the lamp runs
      // across it, and fine scratches catch the light inside it.
      const sheen = bc.createLinearGradient(
        0,
        height * 0.1,
        width,
        height * 0.75,
      );
      const bright = night ? 0.16 : 0.3;
      sheen.addColorStop(0, "rgba(255,255,255,0)");
      sheen.addColorStop(0.28, `rgba(255,255,255,${bright * 0.25})`);
      sheen.addColorStop(0.4, `rgba(255,255,255,${bright})`);
      sheen.addColorStop(0.47, `rgba(255,255,255,${bright * 0.35})`);
      sheen.addColorStop(0.62, `rgba(255,255,255,${bright * 0.12})`);
      sheen.addColorStop(1, "rgba(255,255,255,0)");
      bc.fillStyle = sheen;
      bc.fillRect(0, 0, width, height);
      const random = seeded(19);
      bc.lineWidth = 0.6;
      for (let i = 0; i < 120; i++) {
        const x = random() * width;
        const y = random() * height;
        const a = random() * Math.PI;
        const l = 4 + random() * 30;
        bc.strokeStyle = `rgba(255,255,255,${0.03 + random() * 0.08})`;
        bc.beginPath();
        bc.moveTo(x, y);
        bc.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
        bc.stroke();
      }
    }
    if (surface === "hand") {
      // Held up, the table is well below and out of focus: shrink it and blow it back up.
      const small = document.createElement("canvas");
      small.width = Math.max(1, Math.round(backdrop.width / 10));
      small.height = Math.max(1, Math.round(backdrop.height / 10));
      const sc = small.getContext("2d");
      if (sc) {
        sc.imageSmoothingQuality = "high";
        sc.drawImage(backdrop, 0, 0, small.width, small.height);
        bc.setTransform(1, 0, 0, 1, 0, 0);
        bc.imageSmoothingQuality = "high";
        bc.drawImage(small, 0, 0, backdrop.width, backdrop.height);
        bc.fillStyle = night ? "rgba(0,0,0,0.25)" : "rgba(40,30,20,0.12)";
        bc.fillRect(0, 0, backdrop.width, backdrop.height);
      }
    }
  }

  // Card has a tooth to it: a tile of faint flecks and fibres, laid over the strip.
  const grain = document.createElement("canvas");
  grain.width = 96;
  grain.height = 96;
  const gc = grain.getContext("2d");
  if (gc) {
    const random = seeded(3);
    for (let i = 0; i < 900; i++) {
      gc.fillStyle =
        random() < 0.5
          ? `rgba(120,100,70,${random() * 0.12})`
          : `rgba(255,255,255,${random() * 0.3})`;
      gc.fillRect(random() * 96, random() * 96, 1 + random() * 3, 1);
    }
  }
  const grainPattern = pc.createPattern(grain, "repeat");

  // --- The strip ---------------------------------------------------------------------------

  const columnX = (column: number) => (column - pos) * COLUMN;

  function holeAt(column: number, track: number) {
    if (settings.loop) {
      const c = ((column % strip.columns) + strip.columns) % strip.columns;
      return strip.holes[c * TRACKS + track];
    }
    if (column < 0 || column >= strip.columns) return 0;
    return strip.holes[column * TRACKS + track];
  }

  function visibleX() {
    const corners = [
      onFloor(0, 0),
      onFloor(width, 0),
      onFloor(0, height),
      onFloor(width, height),
    ];
    return [
      Math.min(...corners.map((c) => c.x)) - 6,
      Math.max(...corners.map((c) => c.x)) + 6,
    ];
  }

  // The strip's outline at its present position, in the paper's plane.
  function stripPath(target: CanvasRenderingContext2D, x0: number, x1: number) {
    target.beginPath();
    if (settings.loop) {
      target.rect(x0, -HALF, x1 - x0, HALF * 2);
      return;
    }
    const lead = columnX(-LEAD / COLUMN);
    const tail = columnX(strip.columns - 1 + TAIL / COLUMN);
    target.moveTo(lead + 12, -HALF);
    target.lineTo(tail, -HALF);
    target.lineTo(tail, HALF);
    target.lineTo(lead + 12, HALF);
    target.lineTo(lead, HALF * 0.32);
    target.lineTo(lead, -HALF * 0.32);
    target.closePath();
  }

  function text(
    target: CanvasRenderingContext2D,
    value: string,
    x: number,
    z: number,
    size: number,
    align: CanvasTextAlign = "center",
  ) {
    target.save();
    target.translate(x, z);
    target.scale(size / 10, size / 10);
    target.textAlign = align;
    target.textBaseline = "middle";
    target.fillText(value, 0, 0);
    target.restore();
  }

  function drawPaper() {
    pc.setTransform(1, 0, 0, 1, 0, 0);
    pc.clearRect(0, 0, paper.width, paper.height);
    pc.globalCompositeOperation = "source-over";
    plane(pc, [0, PAPER_Y, 0], X_AXIS, Z_AXIS);
    const [x0, x1] = visibleX();
    stripPath(pc, x0, x1);
    pc.fillStyle = night ? "rgb(240,228,206)" : "rgb(246,242,231)";
    pc.fill();

    pc.globalCompositeOperation = "source-atop";
    if (grainPattern) {
      grainPattern.setTransform(
        new DOMMatrix().translate(-pos * COLUMN, 0).scale(0.11),
      );
      pc.fillStyle = grainPattern;
      pc.fillRect(x0, -HALF, x1 - x0, HALF * 2);
    }

    // The printed grid: a line for each tine, a rule for each column, darker on the beats and
    // the bars, bar numbers along the far edge and the note names every four bars.
    const ink: RGB = night ? [74, 84, 116] : [64, 92, 146];
    const firstColumn = Math.ceil(x0 / COLUMN + pos);
    const lastColumn = Math.floor(x1 / COLUMN + pos);
    const from = settings.loop ? firstColumn : Math.max(0, firstColumn);
    const to = settings.loop
      ? lastColumn
      : Math.min(strip.columns - 1, lastColumn);
    const lineFrom = settings.loop ? x0 : Math.max(x0, columnX(0) - 1.5);
    const lineTo = settings.loop
      ? x1
      : Math.min(x1, columnX(strip.columns - 1) + 1.5);
    if (lineTo > lineFrom) {
      pc.beginPath();
      for (let track = 0; track < TRACKS; track++) {
        pc.moveTo(lineFrom, trackZ(track));
        pc.lineTo(lineTo, trackZ(track));
      }
      pc.lineWidth = 0.1;
      pc.strokeStyle = rgb(ink, 1, 0.5);
      pc.stroke();
    }
    const gridTop = trackZ(TRACKS - 1) - 1;
    const gridBottom = trackZ(0) + 1;
    for (let weight = 0; weight < 3; weight++) {
      pc.beginPath();
      for (let column = from; column <= to; column++) {
        const c = ((column % strip.columns) + strip.columns) % strip.columns;
        const role = c % 8 === 0 ? 2 : c % 2 === 0 ? 1 : 0;
        if (role !== weight) continue;
        const x = columnX(column);
        pc.moveTo(x, gridTop);
        pc.lineTo(x, gridBottom);
      }
      pc.lineWidth = [0.06, 0.1, 0.16][weight];
      pc.strokeStyle = rgb(ink, 1, [0.22, 0.38, 0.62][weight]);
      pc.stroke();
    }
    pc.fillStyle = rgb(ink, 1, 0.75);
    pc.font = `600 10px ${fontFamily}`;
    for (let column = from; column <= to; column++) {
      const c = ((column % strip.columns) + strip.columns) % strip.columns;
      if (c % 8 === 0) {
        text(
          pc,
          String(c / 8 + 1),
          columnX(column) + 0.5,
          -HALF + 2.2,
          2,
          "left",
        );
      }
      if (c % 32 === 0) {
        pc.fillStyle = rgb(ink, 1, 0.5);
        for (let track = 0; track < TRACKS; track++) {
          text(pc, NOTES[track][0], columnX(column) - 2, trackZ(track), 1.35);
        }
        pc.fillStyle = rgb(ink, 1, 0.75);
      }
    }
    if (!settings.loop) {
      const lead = columnX(-LEAD / COLUMN);
      pc.fillStyle = rgb(ink, 1, 0.6);
      pc.font = `700 10px ${fontFamily}`;
      text(pc, "◀ FEED", lead + 10, 0, 2.1);
      pc.font = `600 10px ${fontFamily}`;
      text(pc, "15 NOTE", lead + 13, HALF - 3, 1.6);
    }

    // Holes go right through, so the table shows in them.
    pc.globalCompositeOperation = "destination-out";
    pc.beginPath();
    for (let column = from - 1; column <= to + 1; column++) {
      const x = columnX(column);
      for (let track = 0; track < TRACKS; track++) {
        if (!holeAt(column, track)) continue;
        pc.moveTo(x + HOLE, trackZ(track));
        pc.arc(x, trackZ(track), HOLE, 0, Math.PI * 2);
      }
    }
    pc.fill();

    pc.globalCompositeOperation = "source-over";
    // Inside each hole, the edge nearest the light shades the table a little; the cut edge
    // across from it faces the light and catches it.
    const edges = (inset: number, start: number, end: number) => {
      pc.beginPath();
      for (let column = from - 1; column <= to + 1; column++) {
        const x = columnX(column);
        for (let track = 0; track < TRACKS; track++) {
          if (!holeAt(column, track)) continue;
          const z = trackZ(track);
          const r = HOLE - inset;
          pc.moveTo(x + Math.cos(start) * r, z + Math.sin(start) * r);
          pc.arc(x, z, r, start, end);
        }
      }
    };
    const toLight = Math.atan2(LIGHT[2], LIGHT[0]);
    edges(0.16, toLight - 1.2, toLight + 1.2);
    pc.lineWidth = 0.32;
    pc.strokeStyle = night ? "rgba(20,10,0,0.4)" : "rgba(60,40,20,0.3)";
    pc.stroke();
    edges(0, toLight + Math.PI - 1.1, toLight + Math.PI + 1.1);
    pc.lineWidth = 0.14;
    pc.strokeStyle = night
      ? "rgba(255,240,214,0.75)"
      : "rgba(255,255,255,0.95)";
    pc.stroke();
    // Tape over the holes you've changed your mind about.
    for (let column = from - 1; column <= to + 1; column++) {
      const x = columnX(column);
      for (let track = 0; track < TRACKS; track++) {
        if (holeAt(column, track) !== 2) continue;
        const z = trackZ(track);
        pc.fillStyle = night
          ? "rgba(238,222,180,0.62)"
          : "rgba(248,238,206,0.66)";
        pc.fillRect(x - 1.5, z - 1.15, 3, 2.3);
        pc.strokeStyle = "rgba(140,120,80,0.35)";
        pc.lineWidth = 0.08;
        pc.strokeRect(x - 1.5, z - 1.15, 3, 2.3);
        pc.fillStyle = "rgba(255,255,255,0.35)";
        pc.fillRect(x - 1.4, z - 1.05, 2.8, 0.35);
      }
    }
    // Where the ends are taped into a loop, a strip of clear tape over the join.
    if (settings.loop) {
      for (let column = from - 1; column <= to + 1; column++) {
        if (((column % strip.columns) + strip.columns) % strip.columns) {
          continue;
        }
        const x = columnX(column) - COLUMN / 2;
        pc.fillStyle = "rgba(255,252,240,0.4)";
        pc.fillRect(x - 3.5, -HALF - 0.6, 7, HALF * 2 + 1.2);
        pc.strokeStyle = "rgba(0,0,0,0.12)";
        pc.lineWidth = 0.1;
        pc.strokeRect(x - 3.5, -HALF - 0.6, 7, HALF * 2 + 1.2);
        pc.fillStyle = "rgba(255,255,255,0.4)";
        pc.fillRect(x - 3.2, -HALF, 1.2, HALF * 2);
        pc.fillStyle = "rgba(60,50,30,0.25)";
        pc.fillRect(x - 0.05, -HALF, 0.1, HALF * 2);
      }
    }
  }

  // --- Shadows -----------------------------------------------------------------------------

  function shadowOf(x: number, y: number, z: number, lift: number) {
    return [x + SHADOW_X * (y + lift), z + SHADOW_Z * (y + lift)] as [
      number,
      number,
    ];
  }

  function boxPoints(
    x0: number,
    x1: number,
    y0: number,
    y1: number,
    z0: number,
    z1: number,
  ): Vec[] {
    const points: Vec[] = [];
    for (const x of [x0, x1]) {
      for (const y of [y0, y1]) {
        for (const z of [z0, z1]) points.push([x, y, z]);
      }
    }
    return points;
  }

  function circlePoints(
    cx: number,
    cy: number,
    r: number,
    z0: number,
    z1: number,
  ): Vec[] {
    const points: Vec[] = [];
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      points.push([x, y, z0], [x, y, z1]);
    }
    return points;
  }

  function addShadow(points: Vec[], lift: number) {
    const outline = hull(points.map((p) => shadowOf(p[0], p[1], p[2], lift)));
    if (!outline.length) return;
    ctx.moveTo(outline[0][0], outline[0][1]);
    for (let i = 1; i < outline.length; i++) {
      ctx.lineTo(outline[i][0], outline[i][1]);
    }
    ctx.closePath();
  }

  // Shadows are filled off the canvas with only their blurred shadow landing on it, so all the
  // parts merge into one soft shape without darkening where they overlap.
  function castShadows() {
    const hand = settings.surface === "hand";
    const lift = hand ? LIFT : 0;
    const away = 20000;
    const end: [number, number] = [
      AXLE[0] + Math.cos(crank) * ARM,
      AXLE[1] + Math.sin(crank) * ARM,
    ];
    const passes = hand
      ? [{ blur: 22, alpha: night ? 0.36 : 0.2, lift }]
      : [
          { blur: 7, alpha: night ? 0.4 : 0.22, lift: 0 },
          { blur: 1.5, alpha: night ? 0.4 : 0.24, lift: 0 },
        ];
    for (const [index, pass] of passes.entries()) {
      ctx.save();
      plane(ctx, [0, 0, 0], X_AXIS, Z_AXIS, away);
      ctx.beginPath();
      const contact = !hand && index === 1;
      if (contact) {
        // The tight dark line where things actually meet the ground.
        addShadow(boxPoints(-34, 23, 0, 0.8, -24.4, -22.5), 0);
        addShadow(boxPoints(-34, 23, 0, 0.8, 22.5, 24.4), 0);
        addShadow(boxPoints(8.5, 21.5, 0, 0.8, 23, 24.4), 0);
      } else {
        addShadow(boxPoints(-34, 23, 0, 2, -24.4, -22.5), pass.lift);
        addShadow(boxPoints(-34, 23, 0, 2, 22.5, 24.4), pass.lift);
        addShadow(boxPoints(-33, -22, 0, TINE_TOP, -24.4, 24.4), pass.lift);
        addShadow(boxPoints(-3, 3, 0, 5.8, -24.4, -23), pass.lift);
        addShadow(boxPoints(-3, 3, 0, 5.8, 23, 24.4), pass.lift);
        addShadow(
          [
            ...circlePoints(0, WHEEL_Y, WHEEL_R, -18.5, -16.5),
            ...circlePoints(0, WHEEL_Y, WHEEL_R, 16.5, 18.5),
          ],
          pass.lift,
        );
        for (let track = 0; track < TRACKS; track++) {
          const z = trackZ(track);
          addShadow(
            boxPoints(
              tineRoot(track) - 1,
              TIP,
              TINE_BOTTOM,
              TINE_TOP,
              z - TINE_WIDTH / 2,
              z + TINE_WIDTH / 2,
            ),
            pass.lift,
          );
        }
        addShadow(
          [
            ...bracketOutline().flatMap(([x, y]) => [
              [x, y, 23] as Vec,
              [x, y, 24.4] as Vec,
            ]),
          ],
          pass.lift,
        );
        addShadow(
          circlePoints(AXLE[0], AXLE[1], GEAR_R + 0.5, GEAR_Z[0], GEAR_Z[1]),
          pass.lift,
        );
        addShadow(
          [
            ...circlePoints(AXLE[0], AXLE[1], 1.6, ARM_Z[0], ARM_Z[1]),
            ...circlePoints(end[0], end[1], 1.3, ARM_Z[0], ARM_Z[1]),
          ],
          pass.lift,
        );
        addShadow(
          circlePoints(end[0], end[1], KNOB_R, KNOB_Z[0], KNOB_Z[1]),
          pass.lift,
        );
      }
      ctx.shadowColor = `rgba(${night ? "10,5,0" : "40,28,14"},${pass.alpha})`;
      ctx.shadowBlur = pass.blur * ratio * (k / 4.5);
      ctx.shadowOffsetX = -away * ratio;
      ctx.fillStyle = "#000";
      ctx.fill();
      ctx.restore();
    }
  }

  // The strip lies on whatever's under it, so its shadow is a thin line along one edge; held up,
  // it hangs with the movement and its shadow falls well away.
  function stripShadow() {
    const hand = settings.surface === "hand";
    const [x0, x1] = visibleX();
    ctx.save();
    const lift = hand ? LIFT : 0.5;
    const [dx, dz] = [SHADOW_X * lift, SHADOW_Z * lift];
    plane(ctx, [dx, 0, dz], X_AXIS, Z_AXIS, 20000);
    stripPath(ctx, x0, x1);
    ctx.shadowColor = `rgba(${night ? "10,5,0" : "40,28,14"},${hand ? 0.22 : 0.3})`;
    ctx.shadowBlur = (hand ? 20 : 2) * ratio * (k / 4.5);
    ctx.shadowOffsetX = -20000 * ratio;
    ctx.fillStyle = "#000";
    ctx.fill();
    ctx.restore();
  }

  // --- The movement ------------------------------------------------------------------------

  function box(
    x0: number,
    x1: number,
    y0: number,
    y1: number,
    z0: number,
    z1: number,
    color: RGB,
  ) {
    top(y1);
    ctx.fillStyle = lit(color, UP);
    ctx.fillRect(x0, z0, x1 - x0, z1 - z0);
    front(z1);
    ctx.fillStyle = lit(color, FRONT);
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    side(x1);
    ctx.fillStyle = lit(color, RIGHT);
    ctx.fillRect(z0, y0, z1 - z0, y1 - y0);
    // A catch-light along the front top edge, where a machined edge always shines.
    front(z1);
    ctx.fillStyle = `rgba(255,255,255,${night ? 0.18 : 0.3})`;
    ctx.fillRect(x0, y1 - 0.14, x1 - x0, 0.14);
  }

  // A flat part standing upright, its outline extruded back by its thickness.
  function plate(
    z0: number,
    z1: number,
    outline: () => void,
    face: string | CanvasGradient,
    edge: string,
  ) {
    const depth = z1 - z0;
    const steps = Math.max(2, Math.ceil(depth * k * 0.9));
    ctx.fillStyle = edge;
    for (let s = 0; s < steps; s++) {
      front(z0 + (depth * s) / steps);
      ctx.beginPath();
      outline();
      ctx.fill("evenodd");
    }
    front(z1);
    ctx.beginPath();
    outline();
    ctx.fillStyle = face;
    ctx.fill("evenodd");
  }

  function brassFace(cx: number, cy: number, r: number) {
    const g = ctx.createLinearGradient(cx - r, cy + r, cx + r, cy - r);
    g.addColorStop(0, lit(BRASS, FRONT, -0.12));
    g.addColorStop(0.45, lit(BRASS, FRONT, 0.22));
    g.addColorStop(0.55, lit(BRASS, FRONT, 0.3));
    g.addColorStop(1, lit(BRASS, FRONT, -0.05));
    return g;
  }

  function gearPath(
    cx: number,
    cy: number,
    r: number,
    teeth: number,
    angle: number,
    holes: number,
  ) {
    for (let i = 0; i < teeth; i++) {
      const a = angle + (i / teeth) * Math.PI * 2;
      const w = (Math.PI * 2) / teeth;
      const pts = [
        [a - w * 0.5, r - 0.45],
        [a - w * 0.22, r + 0.5],
        [a + w * 0.08, r + 0.5],
        [a + w * 0.36, r - 0.45],
      ];
      for (const [b, rr] of pts) {
        const x = cx + Math.cos(b) * rr;
        const y = cy + Math.sin(b) * rr;
        if (i === 0 && b === pts[0][0]) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
    }
    ctx.closePath();
    // Lightening holes in a big gear, and the bore.
    for (let i = 0; i < holes; i++) {
      const a = angle + (i / holes) * Math.PI * 2 + 0.4;
      const x = cx + Math.cos(a) * r * 0.55;
      const y = cy + Math.sin(a) * r * 0.55;
      ctx.moveTo(x + r * 0.2, y);
      ctx.arc(x, y, r * 0.2, 0, Math.PI * 2);
    }
  }

  function starPath(cx: number, cy: number, angle: number) {
    for (let i = 0; i < POINTS * 2; i++) {
      const a = angle + (i / (POINTS * 2)) * Math.PI * 2;
      const r = i % 2 ? WHEEL_IN : WHEEL_R;
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      if (i) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    }
    ctx.closePath();
  }

  function bracketOutline(): [number, number][] {
    const points: [number, number][] = [
      [8.5, 0],
      [21.5, 0],
      [21.5, 2.5],
    ];
    for (let i = 0; i <= 16; i++) {
      const a = -0.25 + (i / 16) * (Math.PI + 0.5);
      points.push([AXLE[0] + Math.cos(a) * 7.4, AXLE[1] + Math.sin(a) * 7.4]);
    }
    points.push([8.5, 2.5]);
    return points;
  }

  function roundHead(cx: number, cz: number, y: number, r: number) {
    top(y);
    const g = ctx.createRadialGradient(
      cx - r * 0.35,
      cz - r * 0.45,
      0,
      cx,
      cz,
      r,
    );
    g.addColorStop(0, lit(STEEL, UP, 0.35));
    g.addColorStop(1, lit(STEEL_EDGE, UP, -0.1));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cz, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = rgb(STEEL_EDGE, night ? 0.4 : 0.55);
    ctx.lineWidth = 0.28;
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.75, cz + r * 0.3);
    ctx.lineTo(cx + r * 0.75, cz - r * 0.3);
    ctx.stroke();
  }

  // One tine, bent up at the tip by `bend` millimetres. The bend is drawn as a tilt of the
  // whole tine, which is close enough at a millimetre over fifteen.
  function tine(track: number, bend: number, sheen: CanvasGradient | null) {
    const z = trackZ(track);
    const root = tineRoot(track) - 0.6;
    const length = TIP - root;
    const along: Vec = [1, bend / length, 0];
    const half = TINE_WIDTH / 2;
    plane(ctx, [root, TINE_BOTTOM, z + half], along, Y_AXIS);
    ctx.fillStyle = lit(STEEL_EDGE, FRONT);
    ctx.fillRect(0, 0, length, TINE_TOP - TINE_BOTTOM);
    plane(ctx, [TIP, TINE_BOTTOM + bend, z - half], Z_AXIS, Y_AXIS);
    ctx.fillStyle = lit(STEEL_EDGE, RIGHT, 0.1);
    ctx.fillRect(0, 0, TINE_WIDTH, TINE_TOP - TINE_BOTTOM);
    plane(ctx, [root, TINE_TOP, z - half], along, Z_AXIS);
    ctx.fillStyle = sheen ?? lit(STEEL, UP);
    ctx.fillRect(0, 0, length, TINE_WIDTH);
  }

  function combSheen(track: number) {
    // The polished comb mirrors one soft light, so the bright band sits at the same place on
    // every tine; it's built in each tine's own coordinates from the comb's.
    const root = tineRoot(track) - 0.6;
    const g = ctx.createLinearGradient(COMB_BACK - root, 0, TIP - root, 0);
    g.addColorStop(0, lit(STEEL, UP, -0.25));
    g.addColorStop(0.42, lit(STEEL, UP, -0.12));
    g.addColorStop(0.6, lit(STEEL, UP, 0.28));
    g.addColorStop(0.68, lit(STEEL, UP, 0.12));
    g.addColorStop(1, lit(STEEL, UP, -0.05));
    return g;
  }

  function drawComb() {
    // Lead weights soldered under the three lowest tines tune them down without making them
    // absurdly long.
    for (const track of [2, 1, 0]) {
      const z = trackZ(track);
      box(
        TIP - 5.5,
        TIP - 2.5,
        4.05,
        TINE_BOTTOM,
        z - 0.55,
        z + 0.55,
        LEAD_GREY,
      );
    }
    box(COMB_BACK, -22, 2, TINE_BOTTOM, -24.4, 24.4, ZINC);

    // The comb's solid back, cut into slots.
    top(TINE_TOP);
    ctx.beginPath();
    ctx.moveTo(COMB_BACK, -COMB_HALF);
    let z = -COMB_HALF;
    for (let track = TRACKS - 1; track >= 0; track--) {
      const zt = trackZ(track);
      const gap =
        track === TRACKS - 1
          ? tineRoot(track)
          : Math.max(tineRoot(track), tineRoot(track + 1));
      ctx.lineTo(gap, z);
      ctx.lineTo(gap, zt - TINE_WIDTH / 2);
      ctx.lineTo(tineRoot(track), zt - TINE_WIDTH / 2);
      ctx.lineTo(tineRoot(track), zt + TINE_WIDTH / 2);
      z = zt + TINE_WIDTH / 2;
    }
    ctx.lineTo(tineRoot(0), COMB_HALF);
    ctx.lineTo(COMB_BACK, COMB_HALF);
    ctx.closePath();
    const back = ctx.createLinearGradient(COMB_BACK, 0, -14, 0);
    back.addColorStop(0, lit(STEEL, UP, -0.25));
    back.addColorStop(1, lit(STEEL, UP, -0.12));
    ctx.fillStyle = back;
    ctx.fill();
    // Grinding marks along the length of the tines, from when the comb was surfaced.
    ctx.save();
    ctx.clip();
    const marks = seeded(5);
    for (let i = 0; i < 70; i++) {
      const z = -COMB_HALF + marks() * COMB_HALF * 2;
      ctx.fillStyle =
        marks() < 0.5
          ? `rgba(255,255,255,${0.04 + marks() * 0.08})`
          : `rgba(30,36,44,${0.03 + marks() * 0.06})`;
      ctx.fillRect(COMB_BACK, z, 24, 0.05 + marks() * 0.12);
    }
    ctx.restore();
    front(COMB_HALF);
    ctx.fillStyle = lit(STEEL_EDGE, FRONT);
    ctx.fillRect(
      COMB_BACK,
      TINE_BOTTOM,
      tineRoot(0) - COMB_BACK,
      TINE_TOP - TINE_BOTTOM,
    );
    roundHead(-28.5, -10, TINE_TOP, 1.9);
    roundHead(-28.5, 10, TINE_TOP, 1.9);

    for (let track = TRACKS - 1; track >= 0; track--) {
      const sheen = combSheen(track);
      const lift = lifts[track];
      const swing = swings[track];
      if (swing > 0.03) {
        // Ringing far too fast to see, the tip is a blur out to the ends of its swing.
        ctx.globalAlpha = 0.3;
        tine(track, lift + swing, sheen);
        tine(track, lift - swing, sheen);
        ctx.globalAlpha = 0.6;
        tine(track, lift + swing * 0.5, sheen);
        tine(track, lift - swing * 0.5, sheen);
        ctx.globalAlpha = 1;
      }
      tine(track, lift, sheen);
    }
  }

  function drawWheels() {
    // The axle the star wheels turn on.
    const [ax, ay] = project(0, WHEEL_Y, -23);
    const [bx, by] = project(0, WHEEL_Y, 23);
    screen();
    ctx.lineCap = "butt";
    ctx.lineWidth = k * 1.0;
    ctx.strokeStyle = lit(STEEL_EDGE, UP, -0.1);
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
    for (let track = TRACKS - 1; track >= 0; track--) {
      const z = trackZ(track);
      const wheel = wheels[track];
      let angle = wheel.rest;
      if (wheel.until > pos && pos > wheel.from) {
        angle -=
          ((Math.PI * 2) / POINTS) *
          smooth((pos - wheel.from) / (wheel.until - wheel.from));
      }
      plate(
        z - 0.4,
        z + 0.4,
        () => starPath(0, WHEEL_Y, angle),
        brassFace(0, WHEEL_Y, WHEEL_R),
        rgb(BRASS_EDGE, night ? 0.75 : 0.9),
      );
      ctx.fillStyle = lit(BRASS_EDGE, FRONT);
      ctx.beginPath();
      ctx.arc(0, WHEEL_Y, 0.45, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // The wooden knob: a cylinder whose axis runs towards you. Its outline is the hull of its two
  // end circles, shaded across its width.
  function knob(cx: number, cy: number) {
    const [z0, z1] = KNOB_Z;
    const r = KNOB_R;
    const outline: [number, number][] = [];
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      outline.push(project(x, y, z0), project(x, y, z1));
    }
    const shape = hull(outline);
    // Shade across the axis: from one silhouette edge to the other.
    const [tx, ty] = linear([0, 0, z1 - z0]);
    const length = Math.hypot(tx, ty) || 1;
    const [mx, my] = project(cx, cy, (z0 + z1) / 2);
    const nx = -ty / length;
    const ny = tx / length;
    const w = r * k;
    screen();
    const body = ctx.createLinearGradient(
      mx - nx * w,
      my - ny * w,
      mx + nx * w,
      my + ny * w,
    );
    body.addColorStop(0, lit(BEECH, FRONT, -0.3));
    body.addColorStop(0.3, lit(BEECH, UP, 0.1));
    body.addColorStop(0.45, lit(BEECH, UP, 0.28));
    body.addColorStop(0.75, lit(BEECH, FRONT, -0.05));
    body.addColorStop(1, lit(BEECH, FRONT, -0.32));
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(...shape[0]);
    for (const point of shape.slice(1)) ctx.lineTo(...point);
    ctx.closePath();
    ctx.fill();
    // The end grain, rounded over at its rim.
    front(z1);
    const cap = ctx.createRadialGradient(
      cx - r * 0.3,
      cy + r * 0.3,
      0,
      cx,
      cy,
      r,
    );
    cap.addColorStop(0, lit(BEECH, FRONT, 0.2));
    cap.addColorStop(0.75, lit(BEECH, FRONT, 0.02));
    cap.addColorStop(1, lit(BEECH, FRONT, -0.22));
    ctx.fillStyle = cap;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = rgb(BEECH, 0.55, 0.35);
    ctx.lineWidth = 0.08;
    for (const rr of [0.6, 1.2, 1.7]) {
      ctx.beginPath();
      ctx.arc(cx + 0.15, cy - 0.1, rr, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  function drawHandle() {
    // The bracket that carries the handle.
    plate(
      23,
      24.4,
      () => {
        const outline = bracketOutline();
        ctx.moveTo(...outline[0]);
        for (const point of outline.slice(1)) ctx.lineTo(...point);
        ctx.closePath();
      },
      brassFace(AXLE[0], 8, 11),
      rgb(BRASS_EDGE, night ? 0.75 : 0.9),
    );
    side(21.5);
    ctx.fillStyle = lit(BRASS_EDGE, RIGHT, 0.05);
    ctx.fillRect(23, 0, 1.4, 2.5);
    // The pinion turns twice for each turn of the gear, the other way.
    plate(
      GEAR_Z[0],
      GEAR_Z[1],
      () => {
        gearPath(
          PINION[0],
          PINION[1],
          PINION_R,
          PINION_TEETH,
          -2 * gear + Math.PI / PINION_TEETH,
          0,
        );
        ctx.moveTo(PINION[0] + 0.7, PINION[1]);
        ctx.arc(PINION[0], PINION[1], 0.7, 0, Math.PI * 2);
      },
      brassFace(PINION[0], PINION[1], PINION_R),
      rgb(BRASS_EDGE, night ? 0.7 : 0.85),
    );
    plate(
      GEAR_Z[0],
      GEAR_Z[1],
      () => gearPath(AXLE[0], AXLE[1], GEAR_R, GEAR_TEETH, gear, 4),
      brassFace(AXLE[0], AXLE[1], GEAR_R),
      rgb(BRASS_EDGE, night ? 0.7 : 0.85),
    );
    // The ratchet the pawl rides on, fixed to the gear.
    front(GEAR_Z[1]);
    ctx.beginPath();
    for (let i = 0; i < 12; i++) {
      const a = gear + i * RATCHET;
      ctx.lineTo(AXLE[0] + Math.cos(a) * 2.9, AXLE[1] + Math.sin(a) * 2.9);
      ctx.lineTo(
        AXLE[0] + Math.cos(a + RATCHET * 0.98) * 2.2,
        AXLE[1] + Math.sin(a + RATCHET * 0.98) * 2.2,
      );
    }
    ctx.closePath();
    ctx.fillStyle = lit(STEEL_EDGE, FRONT, 0.05);
    ctx.fill();

    // The arm: flat steel, wider at the boss.
    const end: [number, number] = [
      AXLE[0] + Math.cos(crank) * ARM,
      AXLE[1] + Math.sin(crank) * ARM,
    ];
    const nx = -Math.sin(crank);
    const ny = Math.cos(crank);
    const armPath = () => {
      ctx.moveTo(AXLE[0] + nx * 1.6, AXLE[1] + ny * 1.6);
      ctx.lineTo(end[0] + nx * 1.15, end[1] + ny * 1.15);
      ctx.arc(
        end[0],
        end[1],
        1.15,
        crank + Math.PI / 2,
        crank - Math.PI / 2,
        true,
      );
      ctx.lineTo(AXLE[0] - nx * 1.6, AXLE[1] - ny * 1.6);
      ctx.arc(
        AXLE[0],
        AXLE[1],
        1.6,
        crank - Math.PI / 2,
        crank + Math.PI / 2,
        true,
      );
      ctx.closePath();
    };
    const armFace = ctx.createLinearGradient(
      AXLE[0] - nx * 1.6,
      AXLE[1] - ny * 1.6,
      AXLE[0] + nx * 1.6,
      AXLE[1] + ny * 1.6,
    );
    armFace.addColorStop(0, lit(STEEL, FRONT, -0.08));
    armFace.addColorStop(0.5, lit(STEEL, FRONT, 0.25));
    armFace.addColorStop(1, lit(STEEL, FRONT, -0.02));
    // The pawl, a little spring finger on the arm that rides the ratchet.
    plate(
      ARM_Z[0] - 0.4,
      ARM_Z[0],
      () => {
        const a = crank + 0.9;
        ctx.moveTo(
          AXLE[0] + Math.cos(crank) * 1.8,
          AXLE[1] + Math.sin(crank) * 1.8,
        );
        ctx.lineTo(AXLE[0] + Math.cos(a) * 3.2, AXLE[1] + Math.sin(a) * 3.2);
        ctx.lineTo(
          AXLE[0] + Math.cos(a + 0.25) * 2.8,
          AXLE[1] + Math.sin(a + 0.25) * 2.8,
        );
        ctx.closePath();
      },
      lit(STEEL_EDGE, FRONT, 0.1),
      rgb(STEEL_EDGE, 0.7),
    );
    plate(
      ARM_Z[0],
      ARM_Z[1],
      armPath,
      armFace,
      rgb(STEEL_EDGE, night ? 0.7 : 0.85),
    );
    // The nut holding it on.
    front(ARM_Z[1]);
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = crank * 0.5 + (i / 6) * Math.PI * 2;
      ctx.lineTo(AXLE[0] + Math.cos(a) * 1.15, AXLE[1] + Math.sin(a) * 1.15);
    }
    ctx.closePath();
    ctx.fillStyle = lit(STEEL_EDGE, FRONT, 0.15);
    ctx.fill();
    knob(end[0], end[1]);
  }

  function drawMovement() {
    // From the back of the scene to the front, so nearer parts cover farther ones.
    box(-34, 23, 0, 2, -24.4, -22.5, ZINC);
    box(-3, 3, 0, 5.8, -24.4, -23, BRASS);
    box(-34, 23, 0, 2, 22.5, 24.4, ZINC);
    drawWheels();
    drawComb();
    box(-3, 3, 0, 5.8, 23, 24.4, BRASS);
    front(24.4);
    ctx.fillStyle = lit(STEEL_EDGE, FRONT, 0.1);
    ctx.beginPath();
    ctx.arc(0, WHEEL_Y, 0.9, 0, Math.PI * 2);
    ctx.fill();
    drawHandle();
  }

  function drawChads(flying: boolean) {
    for (const chad of chads) {
      const inFlight = chad.t < 1;
      if (inFlight !== flying) continue;
      const t = smooth(chad.t);
      const x = chad.fromX + (chad.x - chad.fromX) * t;
      const z = chad.fromZ + (chad.z - chad.fromZ) * t;
      const y = inFlight ? 0.2 + 9 * chad.t * (1 - chad.t) : 0.12;
      plane(ctx, [x, y, z], X_AXIS, Z_AXIS);
      ctx.rotate(chad.spin);
      const squash = inFlight ? Math.abs(Math.cos(chad.spin * 3)) : chad.tilt;
      ctx.beginPath();
      ctx.ellipse(0, 0, HOLE, HOLE * Math.max(0.15, squash), 0, 0, Math.PI * 2);
      ctx.fillStyle = night ? "rgb(222,206,180)" : "rgb(240,234,220)";
      ctx.fill();
      ctx.lineWidth = 0.1;
      ctx.strokeStyle = "rgba(90,70,40,0.35)";
      ctx.stroke();
    }
  }

  function drawHover() {
    if (!hover || drags.size) return;
    const x = columnX(hover.column);
    const z = trackZ(hover.track);
    plane(ctx, [0, PAPER_Y, 0], X_AXIS, Z_AXIS);
    ctx.beginPath();
    ctx.arc(x, z, HOLE + 0.3, 0, Math.PI * 2);
    ctx.lineWidth = 0.22;
    ctx.strokeStyle = night ? "rgba(255,230,190,0.85)" : "rgba(30,40,70,0.7)";
    ctx.stroke();
  }

  function render() {
    screen();
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(backdrop, 0, 0);
    drawChads(false);
    stripShadow();
    drawPaper();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(paper, 0, 0);
    drawHover();
    castShadows();
    drawMovement();
    drawChads(true);

    // The light over the whole scene: a soft fall-off by day, a lamp's pool at night.
    screen();
    const [cx, cy] = project(10, 0, 0);
    const reach = Math.hypot(width, height);
    const light = ctx.createRadialGradient(
      cx,
      cy,
      reach * 0.08,
      cx,
      cy,
      reach * 0.75,
    );
    if (night) {
      light.addColorStop(0, "rgba(255,236,200,0)");
      light.addColorStop(0.45, "rgba(20,10,4,0.32)");
      light.addColorStop(1, "rgba(6,3,1,0.78)");
    } else {
      light.addColorStop(0, "rgba(255,255,255,0)");
      light.addColorStop(0.6, "rgba(60,40,20,0.06)");
      light.addColorStop(1, "rgba(40,24,10,0.2)");
    }
    ctx.fillStyle = light;
    ctx.fillRect(0, 0, width, height);
  }

  // --- The mechanism -----------------------------------------------------------------------

  const endPosition = () => strip.columns - 1 + TAIL / COLUMN + 0.5;

  type Event = {
    at: number;
    kind: "engage" | "release";
    column: number;
    track: number;
  };

  function play(p0: number, p1: number, dt: number) {
    if (p1 <= p0) return;
    const events: Event[] = [];
    for (
      let column = Math.floor(p0) - 1;
      column <= Math.ceil(p1 + ENGAGE) + 1;
      column++
    ) {
      for (let track = 0; track < TRACKS; track++) {
        if (holeAt(column, track) !== 1) continue;
        const engage = column - ENGAGE;
        if (engage > p0 && engage <= p1) {
          events.push({ at: engage, kind: "engage", column, track });
        }
        if (column > p0 && column <= p1) {
          events.push({ at: column, kind: "release", column, track });
        }
      }
    }
    if (!events.length) return;
    events.sort((a, b) => a.at - b.at);
    const now = voice.now();
    for (const event of events) {
      const wheel = wheels[event.track];
      const when =
        now === null ? 0 : now + 0.035 - (1 - (event.at - p0) / (p1 - p0)) * dt;
      if (event.kind === "engage") {
        if (event.at >= wheel.until - 1e-6) {
          if (
            wheel.until > Number.NEGATIVE_INFINITY &&
            wheel.until <= event.at
          ) {
            wheel.rest -= (Math.PI * 2) / POINTS;
          }
          wheel.column = event.column;
          wheel.from = event.at;
          wheel.until = event.column + SETTLE;
          wheel.armed = true;
          if (now !== null) voice.click("tick", when, 0.6);
        } else {
          note(
            "missed",
            "A hole went by unplayed: it was a column after the last on its line, and that star wheel was still turning. Leave a column between notes on one line.",
          );
        }
      } else if (wheel.armed && wheel.column === event.column) {
        wheel.armed = false;
        lifts[event.track] = 0;
        const still = swings[event.track] / 1.2;
        const buzz = still > 0.5 ? (still - 0.4) * 0.9 : 0;
        if (buzz) {
          note(
            "buzz",
            "That zz is a star wheel catching a tine that's still swinging. Turn faster and repeated notes chatter; cylinder boxes carry little dampers for it.",
          );
        }
        const level = 0.86 + Math.random() * 0.14;
        swings[event.track] = 1.2 * level;
        if (now !== null) voice.pluck(event.track, when, level, buzz);
      }
    }
  }

  function settleWheels() {
    for (const wheel of wheels) {
      if (wheel.until > Number.NEGATIVE_INFINITY && pos >= wheel.until) {
        wheel.rest -= (Math.PI * 2) / POINTS;
        wheel.until = Number.NEGATIVE_INFINITY;
        wheel.armed = false;
      }
    }
  }

  function resetWheels() {
    for (const wheel of wheels) {
      if (wheel.until > Number.NEGATIVE_INFINITY && pos > wheel.from) {
        wheel.rest -= (Math.PI * 2) / POINTS;
      }
      wheel.until = Number.NEGATIVE_INFINITY;
      wheel.armed = false;
    }
    lifts.fill(0);
  }

  function step(dt: number) {
    // The handle: dragged, driven, or coasting to a stop against the drag of the works.
    let turn = 0;
    const cranking = [...drags.values()].some((drag) => drag.kind === "crank");
    if (cranking) {
      turn = clamp(pendingTurn, -Math.PI * 0.5, Math.PI * 0.5);
      pendingTurn = 0;
      crankVelocity += (turn / Math.max(dt, 1e-3) - crankVelocity) * 0.5;
    } else {
      const drive = keyTurn || (settings.turning ? 1 : 0);
      if (drive) {
        const target = -drive * Math.PI * 2 * settings.speed;
        crankVelocity += (target - crankVelocity) * (1 - Math.exp(-dt / 0.12));
      } else {
        crankVelocity *= Math.exp(-dt / 0.09);
        if (Math.abs(crankVelocity) < 0.02) crankVelocity = 0;
      }
      turn = crankVelocity * dt;
    }
    crank += turn;

    // Forwards, the pawl takes up its play against the tooth behind it and then drives;
    // backwards it rides over the ratchet, clicking at each tooth, and the gear stays put.
    let drive = 0;
    if (turn < 0) {
      const play = back % RATCHET;
      if (-turn > play) {
        drive = -turn - play;
        back = 0;
      } else {
        back += turn;
      }
      gear -= drive;
    } else if (turn > 0) {
      const before = Math.floor(back / RATCHET);
      back += turn;
      const clicks = Math.floor(back / RATCHET) - before;
      const now = voice.now();
      for (let i = 0; i < Math.min(clicks, 4); i++) {
        voice.click(
          "pawl",
          now === null ? null : now + 0.02 + (i * dt) / clicks,
          0.8,
        );
      }
      if (clicks > 0) {
        note(
          "backwards",
          "Backwards, the pawl just clicks over its ratchet: the gear stays put and the paper doesn't come back out.",
        );
      }
    }

    let advance = 0;
    if (refeed) {
      refeed.t = Math.min(1, refeed.t + dt / 0.7);
      const before = pos;
      pos = refeed.from + (START - refeed.from) * smooth(refeed.t);
      advance = pos - before;
      if (refeed.t >= 1) {
        refeed = null;
        pos = START;
      }
    } else if (drive > 0 && !ended) {
      const p0 = pos;
      let p1 = pos + (drive / (Math.PI * 2)) * FEED;
      if (!settings.loop && p1 >= endPosition()) {
        p1 = endPosition();
        ended = true;
        note(
          "ended",
          "The tail's gone through, and with nothing to pull, the handle just turns. Feed the strip in again, or tape its ends into a loop.",
        );
      }
      play(p0, p1, dt);
      pos = p1;
      advance = p1 - p0;
    }
    settleWheels();

    // Lifted by its wheel, a tine bends up as the hole carries the point round.
    for (let track = 0; track < TRACKS; track++) {
      const wheel = wheels[track];
      lifts[track] = wheel.armed
        ? 1.9 * smooth((pos - wheel.from) / ENGAGE)
        : 0;
      swings[track] *= Math.exp(-dt / tineDecay(track));
    }

    const feedRate = Math.abs(advance) / Math.max(dt, 1e-3);
    rate += (feedRate / FEED - rate) * (1 - Math.exp(-dt / 0.3));
    voice.rustle(clamp(feedRate / 10, 0, 1));

    for (const chad of chads) {
      if (chad.t < 1) {
        chad.t = Math.min(1, chad.t + dt / 0.45);
        chad.spin += dt * 14;
      }
    }
  }

  // --- Input -------------------------------------------------------------------------------

  function handleAngle(px: number, py: number) {
    const { x, y } = onUpright(px, py, (KNOB_Z[0] + KNOB_Z[1]) / 2);
    return {
      angle: Math.atan2(y - AXLE[1], x - AXLE[0]),
      r: Math.hypot(x - AXLE[0], y - AXLE[1]),
    };
  }

  function onHandle(px: number, py: number) {
    const end: [number, number] = [
      AXLE[0] + Math.cos(crank) * ARM,
      AXLE[1] + Math.sin(crank) * ARM,
    ];
    const [kx, ky] = project(end[0], end[1], (KNOB_Z[0] + KNOB_Z[1]) / 2);
    if (Math.hypot(px - kx, py - ky) < Math.max(22, k * 5)) return true;
    const { x, y } = onUpright(px, py, ARM_Z[1]);
    return Math.hypot(x - AXLE[0], y - AXLE[1]) < ARM + 2.5;
  }

  function holeUnder(px: number, py: number) {
    const { x, z } = onFloor(px, py);
    if (Math.abs(z) > HALF - 0.5) return null;
    if (x > BODY_X[0] && x < BODY_X[1]) return null;
    const track = Math.round(7 - z / TRACK);
    if (track < 0 || track >= TRACKS) return null;
    const column = Math.round(x / COLUMN + pos);
    if (!settings.loop && (column < 0 || column >= strip.columns)) return null;
    // Only on paper that's actually there.
    if (!settings.loop) {
      const lead = columnX(-LEAD / COLUMN);
      if (x < lead + 12) return null;
    }
    return { column, track, x, z };
  }

  function indexOf(column: number) {
    return ((column % strip.columns) + strip.columns) % strip.columns;
  }

  function punchAt(
    column: number,
    track: number,
    mode: "punch" | "tape" | "peel",
  ) {
    const index = indexOf(column) * TRACKS + track;
    const value = strip.holes[index];
    if (mode === "punch" && value === 0) {
      strip.holes[index] = 1;
      voice.click("punch", null, 0.9);
      const x = columnX(column);
      const z = trackZ(track);
      const away = z >= 0 ? 1 : -1;
      let landX = x + (Math.random() - 0.5) * 8;
      if (landX > BODY_X[0] - 2 && landX < BODY_X[1] + 2) landX = x;
      chads.push({
        fromX: x,
        fromZ: z,
        x: landX,
        z: away * (HALF + 1.5 + Math.random() * 7),
        t: reduceMotion.matches ? 1 : 0,
        spin: Math.random() * Math.PI,
        tilt: 0.75 + Math.random() * 0.25,
      });
      if (chads.length > 260) chads.shift();
      const close = [-1, 1].some((d) => {
        const c = column + d;
        if (!settings.loop && (c < 0 || c >= strip.columns)) return false;
        return strip.holes[indexOf(c) * TRACKS + track] === 1;
      });
      if (close) {
        note(
          "close",
          "Two holes a column apart on one line: the second won't play, because the star wheel is still turning from the first. Leave a column between them.",
        );
      }
      return true;
    }
    if (mode === "tape" && value === 1) {
      strip.holes[index] = 2;
      voice.click("tape", null, 0.8);
      return true;
    }
    if (mode === "peel" && value === 2) {
      strip.holes[index] = 1;
      voice.click("tape", null, 0.5);
      return true;
    }
    return false;
  }

  // --- The loop ----------------------------------------------------------------------------

  let lastStats = "";
  let statsAt = 0;
  let frames = 0;
  let fpsSince = 0;
  let fps: number | null = null;

  function report(now: number) {
    frames++;
    if (now - fpsSince > 1000) {
      fps = Math.round((frames * 1000) / (now - fpsSince));
      frames = 0;
      fpsSince = now;
    }
    if (now - statsAt < 150) return;
    statsAt = now;
    const bars = strip.columns / 8;
    const column = settings.loop
      ? indexOf(Math.floor(Math.max(0, pos)))
      : clamp(Math.floor(pos), 0, strip.columns - 1);
    let holes = 0;
    for (const value of strip.holes) if (value === 1) holes++;
    const stats: MusicBoxStats = {
      bpm: rate > 0.04 ? Math.round(rate * 120) : null,
      bar: Math.floor(column / 8) + 1,
      bars,
      holes,
      ended,
      fps,
    };
    const key = JSON.stringify(stats);
    if (key === lastStats) return;
    lastStats = key;
    onStats?.(stats);
  }

  let running = false;
  let visible = true;
  let frame = 0;
  let last = 0;

  function tick(now: number) {
    const dt = clamp((now - last) / 1000, 0, 1 / 20);
    last = now;
    if (width && height) {
      if (dt > 0) step(dt);
      render();
    }
    report(now);
    if (visible) frame = requestAnimationFrame(tick);
    else running = false;
  }

  function start() {
    if (running) return;
    running = true;
    last = performance.now();
    fpsSince = last;
    frames = 0;
    frame = requestAnimationFrame(tick);
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    width = rect.width;
    height = rect.height;
    ratio = Math.min(window.devicePixelRatio || 1, 2);
    if (width * height * ratio * ratio > MAX_PIXELS) {
      ratio = Math.sqrt(MAX_PIXELS / (width * height));
    }
    const w = Math.max(1, Math.round(width * ratio));
    const h = Math.max(1, Math.round(height * ratio));
    canvas.width = w;
    canvas.height = h;
    backdrop.width = w;
    backdrop.height = h;
    paper.width = w;
    paper.height = h;
    layout();
    renderBackdrop();
    if (!running) render();
  }

  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  const intersection = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible) start();
  });
  intersection.observe(canvas);

  resize();
  start();

  return {
    setSettings(next: MusicBoxSettings) {
      const surface = next.surface !== settings.surface;
      if (next.loop !== settings.loop) {
        if (next.loop) {
          ended = false;
        } else if (pos >= 0) {
          // Cutting the tape: the strip stays where it was in its own round.
          pos = indexOf(Math.floor(pos)) + (pos - Math.floor(pos));
        }
      }
      settings = { ...next };
      voice.setEnabled(next.sound);
      voice.setSurface(next.surface);
      if (surface) renderBackdrop();
    },
    setNight(on: boolean) {
      if (on === night) return;
      night = on;
      renderBackdrop();
    },
    loadTune(id: TuneId) {
      strip = stripFor(id);
      resetWheels();
      pos = START;
      ended = false;
      refeed = null;
      said.delete("ended");
    },
    // Pull the strip back out and feed it in from the start.
    refeed() {
      resetWheels();
      ended = false;
      said.delete("ended");
      if (reduceMotion.matches) {
        pos = START;
        refeed = null;
      } else {
        refeed = { from: pos, t: 0 };
      }
    },
    sweep() {
      chads.length = 0;
    },
    wake() {
      voice.wake();
    },
    // Turning from the keyboard: 1 forwards, −1 back, 0 to let go.
    turn(direction: number) {
      keyTurn = direction;
    },
    pointerDown(id: number, point: { x: number; y: number }) {
      voice.wake();
      if (onHandle(point.x, point.y)) {
        const { angle } = handleAngle(point.x, point.y);
        drags.set(id, { kind: "crank", offset: crank - angle, angle });
        crankVelocity = 0;
        return "crank" as const;
      }
      const hole = holeUnder(point.x, point.y);
      if (!hole) return null;
      const value = strip.holes[indexOf(hole.column) * TRACKS + hole.track];
      const mode = value === 0 ? "punch" : value === 1 ? "tape" : "peel";
      punchAt(hole.column, hole.track, mode);
      drags.set(id, {
        kind: "punch",
        mode,
        last: indexOf(hole.column) * TRACKS + hole.track,
      });
      return "punch" as const;
    },
    pointerMove(id: number, point: { x: number; y: number }) {
      const drag = drags.get(id);
      if (!drag) return;
      if (drag.kind === "crank") {
        const { angle } = handleAngle(point.x, point.y);
        let d = angle - drag.angle;
        d -= Math.round(d / (Math.PI * 2)) * Math.PI * 2;
        drag.angle = angle;
        pendingTurn += d;
        return;
      }
      const hole = holeUnder(point.x, point.y);
      if (!hole) return;
      const key = indexOf(hole.column) * TRACKS + hole.track;
      if (key === drag.last) return;
      drag.last = key;
      punchAt(hole.column, hole.track, drag.mode);
    },
    pointerUp(id: number) {
      drags.delete(id);
    },
    // What's under the pointer, for the cursor and the ring that shows where a hole would go.
    hover(point: { x: number; y: number } | null) {
      hover = null;
      if (!point) return "default";
      if (onHandle(point.x, point.y)) return "grab";
      const hole = holeUnder(point.x, point.y);
      if (!hole) return "default";
      hover = { column: hole.column, track: hole.track };
      return "crosshair";
    },
    dispose() {
      cancelAnimationFrame(frame);
      running = false;
      observer.disconnect();
      intersection.disconnect();
      voice.dispose();
    },
  };
}

export type MusicBox = ReturnType<typeof createMusicBox>;
