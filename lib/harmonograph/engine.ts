// A three-pendulum harmonograph, seen from above, drawing on a card with real ink. Two lateral
// pendulums hang through slots in the table: the left one swings left and right, the top one
// up and down, and each pushes one of two light arms whose far ends are pinned together in a
// collar holding the pen. So the pen sits where two circles meet, and its figure is very
// slightly bowed, as a real linkage's is. A third pendulum hangs on a gimbal under a board, and
// the card is pinned to the board, so the paper itself swings in any direction underneath.
//
// Each pendulum is a true pendulum, not a spring: a wide swing is a little slower than a narrow
// one, so the ratio between them drifts as the swing dies and the figure turns. Air and pivots
// take a little energy, and the pen takes more: it drags on the paper with the same force
// however fast it goes (dry friction), so the lines close in at an even pitch, and when the
// swing has died it stops dead.
//
// The pen doesn't leave a line of fixed weight. A fibre tip feeds ink at a steady rate, so where
// it moves slowly it leaves more and the paper spreads it: the middle of a drawing comes out
// darker and bolder than the outside, turning points get a bead, and a pen left standing makes a
// blot that keeps growing. A broad nib lays a film on whatever it sweeps, thick across its edge
// and hairline along it, and empties as it goes. A ballpoint rolls a fixed amount on to every
// millimetre and skips when it's pressed too lightly.

import { FIGURES, type Figure, type FigureId } from "./figures";
import {
  GALL_BLACK,
  INKS,
  type InkId,
  PAPERS,
  type PaperId,
  PENS,
  type PenId,
  paperTexture,
} from "./paper";
import { FULL_VS, SCENE_FS, SPLAT_FS, SPLAT_VS, STEP_FS } from "./shaders";

export type { FigureId } from "./figures";
export type { InkId, PaperId, PenId } from "./paper";

export type HarmonographSettings = {
  // Pendulum lengths, pivot to bob, in millimetres. Across is the left pendulum, which moves the
  // pen left and right; along is the top one, which moves it up and down the card.
  across: number;
  along: number;
  table: number;
  pen: PenId;
  ink: InkId;
  // How hard the pen bears on the paper, in grams.
  pressure: number;
  paper: PaperId;
  // Simulated seconds per real second.
  speed: number;
};

export const DEFAULT_SETTINGS: HarmonographSettings = {
  across: 880,
  along: 392,
  table: 520,
  pen: "fineliner",
  ink: "black",
  pressure: 6,
  paper: "cartridge",
  speed: 3,
};

export type HarmonographStats = {
  // Length of line drawn on this card, in metres.
  metres: number;
  // The widest of the three swings, in millimetres.
  swing: number;
  penDown: boolean;
  // A dip pen's ink, 0–1 (more just after dipping).
  ink: number;
  fps: number | null;
};

export type Grab = "pen" | "paper" | "across" | "along";

type Point = { x: number; y: number };

const clamp = (v: number, lo: number, hi: number) =>
  v < lo ? lo : v > hi ? hi : v;
const smooth = (lo: number, hi: number, v: number) => {
  const t = clamp((v - lo) / (hi - lo), 0, 1);
  return t * t * (3 - 2 * t);
};

const G = 9810;
// From a pendulum's pivot, under the table, up to where it's linked: the knuckle on a rod, or
// the board on the gimbal. The table top is 144 mm above the pivots.
const TOP = 210;
const BELOW = 144;
// The card is 200 mm square, its ink held at 1024 texels across.
const SHEET = 200;
const HALF = SHEET / 2;
const N = 1024;
const S = N / SHEET;
// Where the rods stand at rest, and the arms' lengths: at rest the pen is over the middle of
// the card and the arms meet square.
const A0: Point = { x: -182, y: 0 };
const B0: Point = { x: 0, y: -232 };
const ARM_A = 182;
const ARM_B = 232;
// How far a rod top can go before the rod meets the end of its slot, and the board its stops.
const REACH = 84;
const TABLE_REACH = 58;
// Masses as felt at the link, in kilograms.
const MASS_ARM = 5;
const MASS_TABLE = 8;
// Seconds for air and pivots alone to take a swing down to 1/e.
const AIR = 300;
const Z_PAPER = 16.3;
const Z_ARM = 66;
// The camera's height above the table, in millimetres: close enough that the pen leans.
const CAMERA = 900;
const LIFT = 5;
// A fibre tip's feed, in square millimetres of ink film a second, and how much ink standing in
// the paper round the tip halves it.
const FEED = 55;
const SOAK = 2.4;
// What a broad nib with a slip-on reservoir holds, in square millimetres of ink film: about
// five metres of line.
const NIB_HOLDS = 5200;
const DT = 1 / 1000;
// Splat records: place (4), shape (4), wet ink (4), dry ink (4).
const FLOATS = 16;
const MAX_SPLATS = 24000;

type Pendulum = {
  length: number;
  mass: number;
  theta: number;
  omega: number;
  // Held by a hand (or eased into place for a figure): the top's displacement it's held at.
  held: boolean;
  hold: number;
  // Moved this substep by something other than gravity.
  force: number;
};

function pendulum(length: number, mass: number): Pendulum {
  return {
    length,
    mass,
    theta: 0,
    omega: 0,
    held: false,
    hold: 0,
    force: 0,
  };
}

const top = (p: Pendulum) => TOP * Math.sin(p.theta);
const topSpeed = (p: Pendulum) => TOP * Math.cos(p.theta) * p.omega;
const rate = (p: Pendulum) => Math.sqrt(G / p.length);
// Amplitude of the top, from where it is and how fast it's going.
const reach = (p: Pendulum) => {
  const w = rate(p);
  return Math.hypot(top(p), topSpeed(p) / w);
};

// Where the pen is for given rod-top displacements: the crossing of a circle round each arm's
// far end, the one below and to the right of the line between them.
function link(xa: number, yb: number, out: Point) {
  const ax = A0.x + xa;
  const ay = A0.y;
  const bx = B0.x;
  const by = B0.y + yb;
  const dx = bx - ax;
  const dy = by - ay;
  const d2 = dx * dx + dy * dy;
  const d = Math.sqrt(d2);
  const a = (ARM_A * ARM_A - ARM_B * ARM_B + d2) / (2 * d);
  const h = Math.sqrt(Math.max(0, ARM_A * ARM_A - a * a));
  out.x = ax + (dx * a) / d - (dy * h) / d;
  out.y = ay + (dy * a) / d + (dx * h) / d;
  return out;
}

// The rod-top displacements that put the pen at a point.
function unlink(p: Point) {
  const ya = p.y - A0.y;
  const xb = p.x - B0.x;
  return {
    xa: p.x - A0.x - Math.sqrt(Math.max(0, ARM_A * ARM_A - ya * ya)),
    yb: p.y - B0.y - Math.sqrt(Math.max(0, ARM_B * ARM_B - xb * xb)),
  };
}

function compile(gl: WebGL2RenderingContext, vs: string, fs: string) {
  const program = gl.createProgram();
  for (const [type, source] of [
    [gl.VERTEX_SHADER, vs],
    [gl.FRAGMENT_SHADER, fs],
  ] as const) {
    const shader = gl.createShader(type);
    if (!shader) throw new Error("Couldn't create a shader");
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(shader) ?? "Shader didn't compile");
    }
    gl.attachShader(program, shader);
  }
  gl.bindAttribLocation(program, 0, "aPos");
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program) ?? "Program didn't link");
  }
  const uniforms = new Map<string, WebGLUniformLocation | null>();
  const u = (name: string) => {
    if (!uniforms.has(name))
      uniforms.set(name, gl.getUniformLocation(program, name));
    return uniforms.get(name) ?? null;
  };
  return { program, u };
}

// One-dimensional value noise, for where a ballpoint skips along its line.
function noise1(x: number, seed: number) {
  const hash = (i: number) => {
    const s = Math.sin(i * 127.1 + seed * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  return hash(i) + (hash(i + 1) - hash(i)) * u;
}

export type Harmonograph = ReturnType<typeof createHarmonograph>;

export function createHarmonograph(
  canvas: HTMLCanvasElement,
  {
    onStats,
    onNote,
  }: {
    onStats?: (stats: HarmonographStats) => void;
    onNote?: (note: string) => void;
  } = {},
) {
  const gl = canvas.getContext("webgl2", {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    preserveDrawingBuffer: false,
  });
  if (!gl) throw new Error("WebGL2 isn't available");
  if (!gl.getExtension("EXT_color_buffer_float")) {
    throw new Error("Float render targets aren't available");
  }
  // Ink builds up in many small additions, which half floats round away once a line is dark;
  // full floats keep them, where the GPU can blend them.
  const full = !!gl.getExtension("EXT_float_blend");
  const format = full ? gl.RGBA32F : gl.RGBA16F;
  const type = full ? gl.FLOAT : gl.HALF_FLOAT;

  const scene = compile(gl, FULL_VS, SCENE_FS);
  const step = compile(gl, FULL_VS, STEP_FS);
  const splat = compile(gl, SPLAT_VS, SPLAT_FS);

  const bind = (program: WebGLProgram) => {
    // biome-ignore lint/correctness/useHookAtTopLevel: WebGL's useProgram, not a React hook.
    gl.useProgram(program);
  };

  const triangle = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, triangle);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 3, -1, -1, 3]),
    gl.STATIC_DRAW,
  );
  const fullVao = gl.createVertexArray();
  gl.bindVertexArray(fullVao);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  const splatData = new Float32Array(MAX_SPLATS * FLOATS);
  const corners = gl.createBuffer();
  const instances = gl.createBuffer();
  const splatVao = gl.createVertexArray();
  gl.bindVertexArray(splatVao);
  gl.bindBuffer(gl.ARRAY_BUFFER, corners);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
    gl.STATIC_DRAW,
  );
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, instances);
  gl.bufferData(gl.ARRAY_BUFFER, splatData.byteLength, gl.DYNAMIC_DRAW);
  for (let i = 0; i < 4; i++) {
    gl.enableVertexAttribArray(1 + i);
    gl.vertexAttribPointer(1 + i, 4, gl.FLOAT, false, FLOATS * 4, i * 16);
    gl.vertexAttribDivisor(1 + i, 1);
  }
  gl.bindVertexArray(null);

  const texture = (
    internal: number,
    w: number,
    h: number,
    fmt: number,
    kind: number,
    filter: number,
    data: ArrayBufferView | null = null,
  ) => {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, fmt, kind, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  };

  // Ink, twice over so each step reads one pair and writes the other.
  const wet = [0, 1].map(() =>
    texture(format, N, N, gl.RGBA, type, gl.NEAREST),
  );
  const dry = [0, 1].map(() =>
    texture(format, N, N, gl.RGBA, type, gl.NEAREST),
  );
  const fbos = [0, 1].map((i) => {
    const f = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, f);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      wet[i],
      0,
    );
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT1,
      gl.TEXTURE_2D,
      dry[i],
      0,
    );
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      throw new Error("Ink framebuffer is incomplete");
    }
    return f;
  });
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  let current = 0;
  const paperTex = texture(
    gl.RGBA8,
    N,
    N,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    gl.LINEAR,
  );

  let settings = { ...DEFAULT_SETTINGS };
  let night = false;

  // The machine.
  const across = pendulum(settings.across, MASS_ARM);
  const along = pendulum(settings.along, MASS_ARM);
  // The gimbal's two axes are never quite the same length, so a circle slowly turns into an
  // ellipse and back.
  const tableX = pendulum(settings.table, MASS_TABLE);
  const tableY = pendulum(settings.table * 1.0035, MASS_TABLE);
  const all = [across, along, tableX, tableY];
  const pen: Point = { x: 0, y: 0 };
  let lift = LIFT;
  let lowered = false;

  // The pen's own state: ink waiting at a fibre tip, ink pooled round it in the paper, a nib's
  // reservoir, and where along its line a ballpoint has got to.
  let tipLoad = 1;
  let pool = 0;
  let reservoir = 1;
  let rolled = 0;
  let goopAt = 600;
  let metres = 0;
  let lastPaper: Point | null = null;
  let wetUntil = 0;
  let simTime = 0;
  let restFor = 0;
  let toldDry = false;
  let toldStopped = false;

  // The pendulums being walked somewhere by hand: to a figure's starting marks, to be let go
  // with its swing, or back to rest when they're caught.
  let setup: {
    marks: number[];
    // Rod-top speeds to let go with, or null to stay held at rest.
    speeds: number[] | null;
    t: number;
    from: number[];
  } | null = null;
  let lowerIn = -1;

  // Hands on the machine.
  type Hand = {
    grab: Grab;
    // Pointer target in the grabbed thing's own terms, this frame and last.
    target: Point;
    previous: Point;
    offset: Point;
    velocity: Point;
  };
  const hands = new Map<number, Hand>();

  // Camera, in device pixels per millimetre, centred on a point of the table.
  let width = 1;
  let height = 1;
  let dpr = 1;
  let scale = 1;
  const cam: Point = { x: 0, y: 0 };

  const resize = () => {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
    const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (w === width && h === height) return false;
    width = w;
    height = h;
    canvas.width = w;
    canvas.height = h;
    // Keep the card and its board in view first; show the rods and their slots where there's
    // room, else let the arms come in from off the edge.
    const right = 142;
    const bottom = 146;
    const cssW = w / dpr;
    const cssH = h / dpr;
    const s = Math.min(cssW / (right + 150), cssH / (bottom + 210));
    const viewW = cssW / s;
    const viewH = cssH / s;
    const wantLeft = 214;
    const wantTop = 268;
    cam.x =
      viewW >= right + wantLeft ? (right - wantLeft) / 2 : right - viewW / 2;
    cam.y =
      viewH >= bottom + wantTop ? (bottom - wantTop) / 2 : bottom - viewH / 2;
    scale = s * dpr;
    return true;
  };

  // Converts a point on the stage (CSS pixels) to the table's plane, and to height z under it.
  const toTable = (p: Point): Point => ({
    x: cam.x + (p.x * dpr - width / 2) / scale,
    y: cam.y + (p.y * dpr - height / 2) / scale,
  });
  const atHeight = (w: Point, z: number): Point => ({
    x: cam.x + ((w.x - cam.x) * (CAMERA - z)) / CAMERA,
    y: cam.y + ((w.y - cam.y) * (CAMERA - z)) / CAMERA,
  });
  const fromHeight = (q: Point, z: number): Point => ({
    x: cam.x + ((q.x - cam.x) * CAMERA) / (CAMERA - z),
    y: cam.y + ((q.y - cam.y) * CAMERA) / (CAMERA - z),
  });

  const tablePos = (): Point => ({ x: top(tableX), y: top(tableY) });
  const rodTops = () => ({
    a: { x: A0.x + top(across), y: A0.y },
    b: { x: B0.x, y: B0.y + top(along) },
  });

  // ---- Ink ----------------------------------------------------------------------------------

  let splats = 0;
  const ink = () => INKS[settings.ink];

  const pushSplat = (
    x: number,
    y: number,
    ax: number,
    ay: number,
    half: number,
    across: number,
    edge: boolean,
    dryness: number,
    w: [number, number, number, number],
    d: [number, number, number, number],
  ) => {
    if (splats >= MAX_SPLATS) flush();
    const o = splats * FLOATS;
    splatData[o] = x;
    splatData[o + 1] = y;
    splatData[o + 2] = ax;
    splatData[o + 3] = ay;
    splatData[o + 4] = half;
    splatData[o + 5] = across;
    splatData[o + 6] = edge ? 1 : 0;
    splatData[o + 7] = dryness;
    splatData.set(w, o + 8);
    splatData.set(d, o + 12);
    splats++;
  };

  const flush = () => {
    if (!splats) return;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbos[current]);
    gl.viewport(0, 0, N, N);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    bind(splat.program);
    gl.uniform1f(splat.u("uSize"), N);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, paperTex);
    gl.uniform1i(splat.u("uPaper"), 0);
    gl.bindVertexArray(splatVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, instances);
    gl.bufferSubData(
      gl.ARRAY_BUFFER,
      0,
      splatData.subarray(0, splats * FLOATS),
    );
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, splats);
    gl.disable(gl.BLEND);
    gl.bindVertexArray(null);
    splats = 0;
  };

  // Liquid ink: its dye rides in the wet layer; iron gall's salt goes straight into the fibres.
  const liquid = (
    mass: number,
  ): [[number, number, number, number], [number, number, number, number]] => {
    const k = ink();
    const m = mass * S * S;
    return [
      [k.dye[0] * m, k.dye[1] * m, k.dye[2] * m, m],
      [0, 0, 0, k.gall * m],
    ];
  };
  // Ballpoint paste is thick and oily: it stays where it's put.
  const paste = (
    mass: number,
  ): [[number, number, number, number], [number, number, number, number]] => {
    const k = ink();
    const m = mass * S * S * 1.7;
    const gall = k.gall ? 0.9 : 0;
    return [
      [0, 0, 0, 0],
      [
        (k.dye[0] + GALL_BLACK[0] * gall) * m,
        (k.dye[1] + GALL_BLACK[1] * gall) * m,
        (k.dye[2] + GALL_BLACK[2] * gall) * m,
        0,
      ],
    ];
  };

  // Ink for one substep of the pen moving across the card from a to b (card millimetres).
  const deposit = (a: Point, b: Point, dt: number, landing: boolean) => {
    const inside = (p: Point) =>
      Math.abs(p.x) < HALF - 0.3 && Math.abs(p.y) < HALF - 0.3;
    if (!inside(a) || !inside(b)) return;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const ds = Math.hypot(dx, dy);
    metres += ds / 1000;
    const kind = settings.pen;
    const tx = (a.x + HALF) * S;
    const ty = (a.y + HALF) * S;
    const ex = (b.x + HALF) * S;
    const ey = (b.y + HALF) * S;
    const steps = Math.max(1, Math.ceil((ds * S) / 0.4));
    wetUntil = simTime + 12;

    if (kind === "fineliner") {
      // Ink wicks out of the tip at a steady rate, slowed by ink already standing in the paper
      // round it, which the pen leaves behind as it moves on.
      pool *= Math.exp(-ds / 0.5) * Math.exp(-dt / 0.9);
      let mass = (FEED / (1 + pool / SOAK)) * dt;
      if (landing) mass += tipLoad * 1.4;
      tipLoad = landing ? 0 : tipLoad;
      pool += mass;
      const [w, d] = liquid(mass / steps);
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        pushSplat(
          tx + (ex - tx) * t,
          ty + (ey - ty) * t,
          1,
          0,
          0,
          0.26 * S,
          false,
          0,
          w,
          d,
        );
      }
      return;
    }

    if (kind === "nib") {
      // The edge is 1.5 mm wide and held at a slant; it lays a film on what it sweeps, and lets
      // a little more run off when it hardly moves. A dry nib only catches the paper's tooth.
      const angle = -0.62;
      const nx = Math.cos(angle);
      const ny = Math.sin(angle);
      const widthMm = 1.5;
      const edgeMm = 0.16;
      const level = reservoir;
      const flow =
        level > 1 ? 1 + (level - 1) * 2.2 : smooth(0, 0.3, level) * 0.98;
      const swept = widthMm * Math.abs(dx * ny - dy * nx) + edgeMm * ds;
      const mass = (1.3 * swept + 2.5 * dt + (landing ? 0.6 : 0)) * flow;
      reservoir = Math.max(0, reservoir - mass / NIB_HOLDS);
      if (reservoir <= 0.02 && !toldDry) {
        toldDry = true;
        onNote?.("The nib has run dry. Dip it (D) for more ink.");
      }
      const dryness = 1 - smooth(0.02, 0.3, level);
      const [w, d] = liquid(mass / steps);
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        pushSplat(
          tx + (ex - tx) * t,
          ty + (ey - ty) * t,
          nx,
          ny,
          (widthMm / 2) * S,
          (edgeMm * S) / 2.5,
          true,
          dryness * 0.95,
          w,
          d,
        );
      }
      return;
    }

    // A ballpoint rolls the same paste on to every millimetre. Pressed lightly, the ball skids
    // instead of rolling now and then, and every so often a blob that's gathered round it
    // comes off.
    const light = 1 - smooth(1, 8, settings.pressure);
    const threshold = 0.04 + 0.5 * light * light;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const s = rolled + (ds * i) / steps;
      const n = noise1(s / 0.8, 3) * 0.85 + noise1(s / 0.15, 7) * 0.15;
      const on = smooth(threshold - 0.06, threshold + 0.06, n);
      if (on <= 0.01) continue;
      const [w, d] = paste(((0.17 * ds) / steps) * on);
      pushSplat(
        tx + (ex - tx) * t,
        ty + (ey - ty) * t,
        1,
        0,
        0,
        0.17 * S,
        false,
        0.08,
        w,
        d,
      );
    }
    rolled += ds;
    if (rolled > goopAt) {
      goopAt = rolled + 500 + Math.random() * 1400;
      const [w, d] = paste(0.5);
      pushSplat(ex, ey, 1, 0, 0, 0.42 * S, false, 0, w, d);
    }
  };

  // A pen standing on the paper still feeds it.
  const standing = (p: Point, dt: number) => {
    if (Math.abs(p.x) > HALF - 0.3 || Math.abs(p.y) > HALF - 0.3) return;
    const kind = settings.pen;
    if (kind === "ballpoint") return;
    const x = (p.x + HALF) * S;
    const y = (p.y + HALF) * S;
    wetUntil = simTime + 12;
    if (kind === "fineliner") {
      pool *= Math.exp(-dt / 0.9);
      const mass = (FEED / (1 + pool / SOAK)) * dt;
      pool += mass;
      const [w, d] = liquid(mass);
      pushSplat(x, y, 1, 0, 0, 0.26 * S, false, 0, w, d);
      return;
    }
    const flow = smooth(0, 0.3, reservoir);
    const mass = 2.5 * dt * flow;
    reservoir = Math.max(0, reservoir - mass / NIB_HOLDS);
    const [w, d] = liquid(mass);
    pushSplat(x, y, 1, 0, 0, 0.5 * S, false, 0, w, d);
  };

  // ---- Physics ------------------------------------------------------------------------------

  const jA: Point = { x: 0, y: 0 };
  const jB: Point = { x: 0, y: 0 };
  const probe: Point = { x: 0, y: 0 };

  const substep = (dt: number) => {
    const xa = top(across);
    const yb = top(along);
    link(xa, yb, pen);
    const contact = lift < 0.02;

    // The pen's drag on the paper, against their relative motion: the same force at any speed,
    // rounded off near standstill so it doesn't chatter.
    for (const p of all) p.force = 0;
    if (contact) {
      const e = 0.02;
      link(xa + e, yb, probe);
      jA.x = (probe.x - pen.x) / e;
      jA.y = (probe.y - pen.y) / e;
      link(xa, yb + e, probe);
      jB.x = (probe.x - pen.x) / e;
      jB.y = (probe.y - pen.y) / e;
      const va = topSpeed(across);
      const vb = topSpeed(along);
      const vx = jA.x * va + jB.x * vb - topSpeed(tableX);
      const vy = jA.y * va + jB.y * vb - topSpeed(tableY);
      const speed = Math.hypot(vx, vy);
      const mu = PENS[settings.pen].friction * PAPERS[settings.paper].rough;
      const normal = settings.pressure * 0.00981;
      const k = (mu * normal) / Math.sqrt(speed * speed + 0.4 * 0.4);
      const fx = -k * vx;
      const fy = -k * vy;
      across.force = fx * jA.x + fy * jA.y;
      along.force = fx * jB.x + fy * jB.y;
      tableX.force = -fx;
      tableY.force = -fy;
    }

    for (const p of all) {
      if (p.held) {
        const s = clamp(p.hold / TOP, -0.99, 0.99);
        const next = Math.asin(s);
        p.omega = p.omega * 0.6 + ((next - p.theta) / dt) * 0.4;
        p.theta = next;
        continue;
      }
      const accel =
        -(G / p.length) * Math.sin(p.theta) -
        (2 / AIR) * p.omega +
        (1000 * p.force * Math.cos(p.theta)) / (p.mass * TOP);
      p.omega += accel * dt;
      p.theta += p.omega * dt;
      // The ends of the slots, padded with felt: a soft knock that takes most of the speed.
      const limit = p === tableX || p === tableY ? TABLE_REACH : REACH;
      const x = top(p);
      if (Math.abs(x) > limit) {
        p.theta = Math.asin(clamp(Math.sign(x) * limit, -TOP, TOP) / TOP);
        if (p.omega * x > 0) p.omega *= -0.25;
      }
    }

    const before = lastPaper;
    link(top(across), top(along), pen);
    const now = { x: pen.x - top(tableX), y: pen.y - top(tableY) };
    if (contact) {
      if (before) {
        if (Math.hypot(now.x - before.x, now.y - before.y) < 1e-4) {
          standing(now, dt);
        } else {
          deposit(before, now, dt, false);
        }
      } else {
        deposit(now, now, dt, true);
        standing(now, dt);
      }
      lastPaper = now;
    } else {
      lastPaper = null;
      // Ink creeps back into a fibre tip while it's held off the paper.
      tipLoad = Math.min(1, tipLoad + dt / 2.5);
    }
  };

  // ---- Hands and figures --------------------------------------------------------------------

  const hit = (p: Point): Grab | null => {
    const w = toTable(p);
    const { a, b } = rodTops();
    const penAt = fromHeight(pen, Z_ARM);
    const reachPx = 16 / (scale / dpr);
    if (Math.hypot(w.x - penAt.x, w.y - penAt.y) < Math.max(14, reachPx))
      return "pen";
    const ka = fromHeight(a, Z_ARM);
    if (Math.hypot(w.x - ka.x, w.y - ka.y) < Math.max(13, reachPx))
      return "across";
    const kb = fromHeight(b, Z_ARM);
    if (Math.hypot(w.x - kb.x, w.y - kb.y) < Math.max(13, reachPx))
      return "along";
    const onBoard = atHeight(w, Z_PAPER);
    const t = tablePos();
    if (Math.abs(onBoard.x - t.x) < 122 && Math.abs(onBoard.y - t.y) < 122)
      return "paper";
    return null;
  };

  // What each grab moves, in its own plane.
  const grabPoint = (grab: Grab, p: Point): Point => {
    const w = toTable(p);
    return grab === "paper" ? atHeight(w, Z_PAPER) : atHeight(w, Z_ARM);
  };
  const grabbed = (grab: Grab): Point => {
    const { a, b } = rodTops();
    if (grab === "paper") return tablePos();
    if (grab === "across") return a;
    if (grab === "along") return b;
    return { x: pen.x, y: pen.y };
  };

  const holdFor = (hand: Hand, t: Point) => {
    const x = t.x + hand.offset.x;
    const y = t.y + hand.offset.y;
    if (hand.grab === "paper") {
      tableX.hold = clamp(x, -TABLE_REACH, TABLE_REACH);
      tableY.hold = clamp(y, -TABLE_REACH, TABLE_REACH);
    } else if (hand.grab === "across") {
      across.hold = clamp(x - A0.x, -REACH, REACH);
    } else if (hand.grab === "along") {
      along.hold = clamp(y - B0.y, -REACH, REACH);
    } else {
      const { xa, yb } = unlink({ x, y });
      across.hold = clamp(xa, -REACH, REACH);
      along.hold = clamp(yb, -REACH, REACH);
    }
  };

  const heldBy = (grab: Grab): Pendulum[] =>
    grab === "paper"
      ? [tableX, tableY]
      : grab === "across"
        ? [across]
        : grab === "along"
          ? [along]
          : [across, along];

  const startFigure = (figure: Figure) => {
    across.length = figure.across;
    along.length = figure.along;
    tableX.length = figure.table;
    tableY.length = figure.table * 1.0035;
    const { swing } = figure;
    const starts = [swing.across, swing.along, swing.tableX, swing.tableY];
    walk(
      starts.map(([amp, phase]) => amp * Math.cos(phase)),
      starts.map(([amp, phase], i) => -amp * rate(all[i]) * Math.sin(phase)),
    );
    toldStopped = false;
  };

  const walk = (marks: number[], speeds: number[] | null) => {
    for (const hand of hands.values())
      for (const p of heldBy(hand.grab)) p.held = false;
    hands.clear();
    setup = { marks, speeds, t: 0, from: all.map((p) => top(p)) };
    for (const p of all) {
      p.held = true;
      p.hold = top(p);
    }
    lowered = false;
    lowerIn = -1;
  };

  const runSetup = (dt: number) => {
    const walking = setup;
    if (!walking) return;
    walking.t += dt;
    // A beat to lift the pen, then the pendulums are drawn back to their marks.
    const k = smooth(0.25, 1.05, walking.t);
    all.forEach((p, i) => {
      p.hold = walking.from[i] + (walking.marks[i] - walking.from[i]) * k;
    });
    if (walking.t < 1.2) return;
    setup = null;
    const speeds = walking.speeds;
    all.forEach((p, i) => {
      p.held = false;
      p.theta = Math.asin(clamp(walking.marks[i] / TOP, -0.99, 0.99));
      p.omega = speeds ? speeds[i] / (TOP * Math.cos(p.theta)) : 0;
    });
    if (speeds) lowerIn = 0.35;
  };

  // ---- Frame --------------------------------------------------------------------------------

  let raf = 0;
  let last = performance.now();
  let frames = 0;
  let fpsStamp = last;
  let fps: number | null = null;
  let statStamp = 0;
  let dirty = true;
  let disposed = false;

  const render = () => {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, width, height);
    bind(scene.program);
    const u = scene.u;
    const t = tablePos();
    const { a, b } = rodTops();
    gl.uniform2f(u("uRes"), width, height);
    gl.uniform2f(u("uCam"), cam.x, cam.y);
    gl.uniform1f(u("uScale"), scale);
    gl.uniform1f(u("uCamH"), CAMERA);
    gl.uniform2f(u("uTable"), t.x, t.y);
    gl.uniform2f(u("uPen"), pen.x, pen.y);
    gl.uniform1f(u("uLift"), lift);
    gl.uniform2f(u("uTopA"), a.x, a.y);
    gl.uniform2f(u("uBaseA"), A0.x + (top(across) * BELOW) / TOP, A0.y);
    gl.uniform2f(u("uSlotA"), A0.x, A0.y);
    gl.uniform2f(u("uTopB"), b.x, b.y);
    gl.uniform2f(u("uBaseB"), B0.x, B0.y + (top(along) * BELOW) / TOP);
    gl.uniform2f(u("uSlotB"), B0.x, B0.y);
    gl.uniform1f(u("uNight"), night ? 1 : 0);
    const paper = PAPERS[settings.paper];
    gl.uniform3f(u("uPaperCol"), ...paper.colour);
    gl.uniform1f(u("uTooth"), 0.06 + paper.tooth * 0.22);
    gl.uniform3f(u("uCap"), ...ink().cap);
    gl.uniform1i(
      u("uPenKind"),
      settings.pen === "fineliner" ? 0 : settings.pen === "nib" ? 1 : 2,
    );
    gl.uniform1f(u("uExport"), 0);
    gl.uniform1f(u("uInkN"), N);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, wet[current]);
    gl.uniform1i(u("uWet"), 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, dry[current]);
    gl.uniform1i(u("uDry"), 1);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, paperTex);
    gl.uniform1i(u("uPaper"), 2);
    gl.bindVertexArray(fullVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  const spread = (dt: number) => {
    const paper = PAPERS[settings.paper];
    bind(step.program);
    gl.viewport(0, 0, N, N);
    gl.bindVertexArray(fullVao);
    gl.uniform1f(step.u("uFlow"), paper.bleed * dt * 60);
    gl.uniform1f(step.u("uFeather"), paper.feather);
    gl.uniform1f(step.u("uPower"), paper.power);
    gl.uniform1f(step.u("uFix"), 1 - Math.exp(-dt / paper.dry));
    gl.uniform1f(step.u("uOx"), 1 - Math.exp(-dt / 28));
    gl.uniform3f(step.u("uBlack"), ...GALL_BLACK);
    gl.uniform1i(step.u("uWet"), 0);
    gl.uniform1i(step.u("uDry"), 1);
    gl.uniform1i(step.u("uPaper"), 2);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, paperTex);
    const next = 1 - current;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbos[next]);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, wet[current]);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, dry[current]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    current = next;
  };

  const frame = (now: number) => {
    if (disposed) return;
    raf = requestAnimationFrame(frame);
    const real = Math.min(Math.max((now - last) / 1000, 0), 1 / 20);
    last = now;
    frames++;
    if (now - fpsStamp > 1000) {
      fps = Math.round((frames * 1000) / (now - fpsStamp));
      frames = 0;
      fpsStamp = now;
    }
    if (resize()) dirty = true;

    // The pen goes up and down in real time, whatever the clock is doing.
    const liftTarget = lowered && !setup ? 0 : LIFT;
    const prevLift = lift;
    lift += clamp(liftTarget - lift, -real * 28, real * 28);
    if (lift !== prevLift) dirty = true;
    if (lowerIn >= 0) {
      lowerIn -= real;
      if (lowerIn < 0) lowered = true;
    }

    // Hands move what they hold towards the pointer, spread over the frame's substeps.
    for (const hand of hands.values()) {
      const dtHand = Math.max(real, 1 / 240);
      hand.velocity.x =
        hand.velocity.x * 0.5 +
        ((hand.target.x - hand.previous.x) / dtHand) * 0.5;
      hand.velocity.y =
        hand.velocity.y * 0.5 +
        ((hand.target.y - hand.previous.y) / dtHand) * 0.5;
    }

    const sim = real * settings.speed;
    runSetup(real);
    const steps = Math.max(1, Math.round(sim / DT));
    const dt = sim / steps;
    const handStart = new Map<number, Point>();
    for (const [id, hand] of hands) handStart.set(id, { ...hand.previous });
    for (let i = 0; i < steps; i++) {
      for (const [id, hand] of hands) {
        const from = handStart.get(id) ?? hand.target;
        const k = (i + 1) / steps;
        holdFor(hand, {
          x: from.x + (hand.target.x - from.x) * k,
          y: from.y + (hand.target.y - from.y) * k,
        });
      }
      substep(dt);
    }
    for (const hand of hands.values()) hand.previous = { ...hand.target };
    simTime += sim;
    flush();

    const swing = Math.max(...all.map(reach));
    const moving =
      swing > 0.02 || hands.size > 0 || setup !== null || lift !== prevLift;
    if (moving) dirty = true;

    const wetNow = simTime < wetUntil;
    if (wetNow) {
      const passes = Math.min(4, Math.max(1, Math.ceil(settings.speed)));
      for (let i = 0; i < passes; i++) spread(sim / passes || 1 / 240);
      dirty = true;
    }

    // Once everything's still with the pen down, it says so once.
    if (lowered && swing < 0.3 && !hands.size && !setup) {
      restFor += real;
      if (restFor > 1.5 && !toldStopped && metres > 0.2) {
        toldStopped = true;
        onNote?.(
          "Everything has come to rest, and the pen is blotting where it stopped. Lift it with Space.",
        );
      }
    } else {
      restFor = 0;
    }

    if (dirty) {
      render();
      dirty = false;
    }

    if (now - statStamp > 200) {
      statStamp = now;
      onStats?.({
        metres,
        swing,
        penDown: lowered,
        ink: reservoir,
        fps,
      });
    }
  };

  const loadPaper = () => {
    const data = paperTexture(settings.paper, N);
    gl.bindTexture(gl.TEXTURE_2D, paperTex);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA8,
      N,
      N,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      data,
    );
    // Mipmapped, so the tooth reads as texture rather than glitter when the card is small.
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(
      gl.TEXTURE_2D,
      gl.TEXTURE_MIN_FILTER,
      gl.LINEAR_MIPMAP_LINEAR,
    );
  };

  // A new card goes on with the pen lifted off the old one first.
  const clearInk = () => {
    lowered = false;
    lowerIn = -1;
    lift = LIFT;
    for (const f of fbos) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, f);
      gl.viewport(0, 0, N, N);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    metres = 0;
    rolled = 0;
    lastPaper = null;
    pool = 0;
    wetUntil = 0;
    toldStopped = false;
    dirty = true;
  };

  loadPaper();
  clearInk();
  resize();
  raf = requestAnimationFrame(frame);

  return {
    setSettings(next: HarmonographSettings) {
      const paperChanged = next.paper !== settings.paper;
      const penChanged = next.pen !== settings.pen;
      settings = { ...next };
      across.length = next.across;
      along.length = next.along;
      tableX.length = next.table;
      tableY.length = next.table * 1.0035;
      if (paperChanged) {
        loadPaper();
        clearInk();
      }
      if (penChanged) {
        reservoir = 1;
        toldDry = false;
        tipLoad = 1;
      }
      dirty = true;
    },
    setNight(on: boolean) {
      night = on;
      dirty = true;
    },
    // Lowers or lifts the pen; with no argument, the other of the two.
    setPen(down?: boolean) {
      lowered = down ?? !lowered;
      lowerIn = -1;
      return lowered;
    },
    start(id: FigureId) {
      const figure = FIGURES.find((entry) => entry.value === id);
      if (figure) startFigure(figure);
    },
    // Catches all three pendulums, lifting the pen, and walks them back to rest.
    stop() {
      walk([0, 0, 0, 0], null);
      dirty = true;
    },
    dip() {
      reservoir = 1.2;
      toldDry = false;
    },
    newSheet() {
      clearInk();
    },
    pointerDown(id: number, p: Point): Grab | null {
      const grab = hit(p);
      if (!grab) return null;
      // A hand on the machine mid-setup lets go of everything the setup was holding.
      if (setup) {
        setup = null;
        for (const pend of all) {
          pend.held = false;
          pend.omega = 0;
        }
      }
      lowerIn = -1;
      const at = grabPoint(grab, p);
      const thing = grabbed(grab);
      const hand: Hand = {
        grab,
        target: at,
        previous: at,
        offset: { x: thing.x - at.x, y: thing.y - at.y },
        velocity: { x: 0, y: 0 },
      };
      for (const other of hands.values()) {
        if (other.grab === grab) return null;
      }
      hands.set(id, hand);
      for (const pend of heldBy(grab)) {
        pend.held = true;
        pend.hold = top(pend);
      }
      dirty = true;
      return grab;
    },
    pointerMove(id: number, p: Point) {
      const hand = hands.get(id);
      if (!hand) return;
      hand.target = grabPoint(hand.grab, p);
    },
    pointerUp(id: number) {
      const hand = hands.get(id);
      if (!hand) return;
      hands.delete(id);
      // Let go with the hand's speed: a flick sets a pendulum swinging.
      const v = hand.velocity;
      const cap = 520;
      const vx = clamp(v.x, -cap, cap);
      const vy = clamp(v.y, -cap, cap);
      if (hand.grab === "paper") {
        tableX.held = false;
        tableY.held = false;
        tableX.omega = vx / (TOP * Math.cos(tableX.theta));
        tableY.omega = vy / (TOP * Math.cos(tableY.theta));
      } else if (hand.grab === "across") {
        across.held = false;
        across.omega = vx / (TOP * Math.cos(across.theta));
      } else if (hand.grab === "along") {
        along.held = false;
        along.omega = vy / (TOP * Math.cos(along.theta));
      } else {
        // The pen's velocity, shared back to the two rods through the linkage.
        const xa = top(across);
        const yb = top(along);
        const there = unlink({ x: pen.x + vx * 0.01, y: pen.y + vy * 0.01 });
        across.held = false;
        along.held = false;
        across.omega = (there.xa - xa) / 0.01 / (TOP * Math.cos(across.theta));
        along.omega = (there.yb - yb) / 0.01 / (TOP * Math.cos(along.theta));
      }
      dirty = true;
    },
    hover(p: Point | null): string {
      if (!p) return "default";
      const grab = hit(p);
      return grab ? "grab" : "default";
    },
    // The card as it stands, flatly lit, as a PNG.
    async save(): Promise<Blob | null> {
      const target = texture(
        gl.RGBA8,
        N,
        N,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        gl.NEAREST,
      );
      const fbo = gl.createFramebuffer();
      // Drawing the scene sets every uniform; then the card alone goes into the target.
      render();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(
        gl.FRAMEBUFFER,
        gl.COLOR_ATTACHMENT0,
        gl.TEXTURE_2D,
        target,
        0,
      );
      gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
      gl.viewport(0, 0, N, N);
      gl.uniform2f(scene.u("uRes"), N, N);
      gl.uniform1f(scene.u("uExport"), 1);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      const pixels = new Uint8Array(N * N * 4);
      gl.readPixels(0, 0, N, N, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.deleteFramebuffer(fbo);
      gl.deleteTexture(target);
      dirty = true;
      const out = document.createElement("canvas");
      out.width = N;
      out.height = N;
      const ctx = out.getContext("2d");
      if (!ctx) return null;
      const image = ctx.createImageData(N, N);
      // Rows come back from the bottom up.
      const row = N * 4;
      for (let y = 0; y < N; y++) {
        image.data.set(
          pixels.subarray((N - 1 - y) * row, (N - y) * row),
          y * row,
        );
      }
      ctx.putImageData(image, 0, 0);
      return new Promise((resolve) => out.toBlob(resolve, "image/png"));
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    },
  };
}
