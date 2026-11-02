// Candles on a table in a dark room, seen from a chair's height. The flames are flames.ts: an
// oscillator each, coupled through the air with a delay. This file is the room round them:
// your breath, the match, the smoke, the light they throw, and the trace of their heights.
//
// Breath is a jet from your mouth to the point you press, about 3 m/s where it reaches the
// candles and a few centimetres wide. A flame square in it is pushed straight back, which from
// the front looks like it shrinking and ducking; one at its edge is pushed outwards, away from
// where you're aiming. That's how you pick out one candle in a row. Dragging a candle drags its
// flame through still air, which bends it back the same way, and too fast puts it out.
//
// The match is struck with a flare from its head, then burns along the stick at about 3 mm a
// second for twenty seconds or so. Held to a wick for a third of a second it lights it; shaken,
// or in a draught, it goes out. Held in the white smoke of a wick blown out a moment before,
// it lights the vapour, and the flame runs down the smoke and relights the wick.
//
// The room light flickers with the flames, but far less than the flames do: a whole wall
// pulsing ten times a second would be uncomfortable to watch, so it's kept to a few per cent.

import { type ArrangementId, arrangement } from "./arrangements";
import {
  CANDLE_R,
  CANDLE_TOP,
  CUP_H,
  createHolder,
  flameBase,
  flameLight,
  flameSize,
  type Holder,
  heightNow,
  ignite,
  lightAll as relightAll,
  litCount,
  pullOn,
  stepFlames,
  stepOscillators,
  WICK_LEN,
} from "./flames";
import {
  BLOOM_DOWN,
  BLOOM_UP,
  COMPOSITE,
  MAX_CANDLES,
  MAX_FLAMES,
  MAX_HOLDERS,
  QUAD,
  SCENE,
  SMOKE_FRAGMENT,
  SMOKE_VERTEX,
} from "./shaders";
import { createSmoke, MATCH_SMOKE, PUFF, SOOT, SPARK, VAPOUR } from "./smoke";

export type { ArrangementId } from "./arrangements";

export type CandleSettings = {
  arrangement: ArrangementId;
  // Simulated seconds per real second.
  speed: number;
  draught: boolean;
};

export const DEFAULT_SETTINGS: CandleSettings = {
  arrangement: "pair",
  speed: 1,
  draught: false,
};

export type Relation =
  | "together"
  | "still"
  | "turns"
  | "round"
  | "drifting"
  | "settling"
  | "out";

export type CandleStats = {
  lit: number;
  wicks: number;
  flames: { label: string; hz: number | null; lit: boolean }[];
  pairs: { a: string; b: string; cm: number; relation: Relation }[];
  match: "none" | "burning" | "out";
  fps: number | null;
};

// The trace's colours, matched by the labels on the table. Dark enough to read on white by
// day, light enough on black at night.
export const TRACE_COLOURS = {
  day: ["#c2410c", "#0369a1", "#be185d"],
  night: ["#fb923c", "#38bdf8", "#f472b6"],
};
export const LABELS = ["A", "B", "C"];

type Point = { x: number; y: number };
type Vec = [number, number, number];

const DEG = Math.PI / 180;
const FOV = 32 * DEG;
const PITCH = 12 * DEG;
// Light from a flame of strength 1 (one candle), in the shader's units.
const LIGHT_SCALE = 160;
const LIGHT_COLOUR: Vec = [1, 0.6, 0.3];
// Breath where it reaches the candles: speed on its axis (m/s) and width (cm).
const BREATH = 3.2;
const BREATH_WIDTH = 3.2;
const MATCH_WOOD = 5.2;
const TRACE_SAMPLES = 240;
// Oscillator steps per trace sample: 400 samples a second, so 0.6 s across the trace.
const TRACE_EVERY = 3;
const MAX_PIXELS = 1.7e6;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
const sub = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit = (v: Vec): Vec => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};

function compile(gl: WebGL2RenderingContext, vs: string, fs: string) {
  const shader = (type: number, source: string) => {
    const s = gl.createShader(type);
    if (!s) throw new Error("Couldn't create a shader");
    gl.shaderSource(s, source);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(s) ?? "Shader didn't compile");
    }
    return s;
  };
  const program = gl.createProgram();
  if (!program) throw new Error("Couldn't create a program");
  gl.attachShader(program, shader(gl.VERTEX_SHADER, vs));
  gl.attachShader(program, shader(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program) ?? "Program didn't link");
  }
  const u = new Proxy({} as Record<string, WebGLUniformLocation | null>, {
    get: (cache, name: string) => {
      if (!(name in cache)) cache[name] = gl.getUniformLocation(program, name);
      return cache[name];
    },
  });
  return { program, u };
}

type Target = {
  texture: WebGLTexture;
  framebuffer: WebGLFramebuffer;
  width: number;
  height: number;
};

type Match = {
  // The burning point on the stick, where the flame sits.
  front: Vec;
  z: number;
  // Velocity in cm a second, from the hand.
  v: Point;
  struck: number;
  burnt: number;
  out: number | null;
  strain: number;
  // How hot the burning edge still is after it's gone out.
  glow: number;
};

type Flashback = { holder: Holder; from: Vec; start: number; length: number };

type Pair = {
  a: number;
  b: number;
  c: number;
  s: number;
  ampA: number;
  ampB: number;
};

export type Candles = ReturnType<typeof createCandles>;

export function createCandles(
  canvas: HTMLCanvasElement,
  {
    onStats,
    onNote,
  }: {
    onStats?: (stats: CandleStats) => void;
    onNote?: (note: string) => void;
  } = {},
) {
  const gl = canvas.getContext("webgl2", {
    antialias: false,
    alpha: false,
    depth: false,
    premultipliedAlpha: false,
  });
  if (!gl) throw new Error("WebGL2 isn't available");
  if (
    !gl.getExtension("EXT_color_buffer_float") &&
    !gl.getExtension("EXT_color_buffer_half_float")
  ) {
    throw new Error("This browser can't draw into float textures.");
  }

  const scene = compile(gl, QUAD, SCENE);
  const smokeProgram = compile(gl, SMOKE_VERTEX, SMOKE_FRAGMENT);
  const down = compile(gl, QUAD, BLOOM_DOWN);
  const up = compile(gl, QUAD, BLOOM_UP);
  const composite = compile(gl, QUAD, COMPOSITE);
  const empty = gl.createVertexArray();
  const select = (program: WebGLProgram) => {
    // biome-ignore lint/correctness/useHookAtTopLevel: WebGL's useProgram, not a React hook.
    gl.useProgram(program);
  };

  const smoke = createSmoke(14000);
  const smokeData = new Float32Array(14000 * 8);
  const smokeVao = gl.createVertexArray();
  const smokeBuffer = gl.createBuffer();
  gl.bindVertexArray(smokeVao);
  gl.bindBuffer(gl.ARRAY_BUFFER, smokeBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, smokeData.byteLength, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 32, 0);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 32, 16);
  gl.bindVertexArray(null);

  const makeTarget = (w: number, h: number): Target => {
    const texture = gl.createTexture();
    const framebuffer = gl.createFramebuffer();
    if (!texture || !framebuffer) throw new Error("Couldn't make a target");
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA16F,
      w,
      h,
      0,
      gl.RGBA,
      gl.HALF_FLOAT,
      null,
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      texture,
      0,
    );
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      throw new Error("This browser can't draw into float textures.");
    }
    return { texture, framebuffer, width: w, height: h };
  };
  const freeTarget = (t: Target) => {
    gl.deleteTexture(t.texture);
    gl.deleteFramebuffer(t.framebuffer);
  };

  let width = 0;
  let height = 0;
  let cssW = 1;
  let cssH = 1;
  let quality = 1;
  let main: Target | null = null;
  let downs: Target[] = [];
  let ups: Target[] = [];

  const cam = {
    eye: [0, 0, 0] as Vec,
    fwd: [0, 0, 1] as Vec,
    up: [0, 1, 0] as Vec,
    right: [1, 0, 0] as Vec,
    tanX: 1,
    tanY: 1,
  };

  const placeCamera = () => {
    const aspect = cssW / cssH;
    const tanY = Math.tan(FOV / 2);
    // Enough to see a row of five candles side to side, and from the cups to the flame tips.
    const dist = Math.max(15.5 / tanY, 12.8 / (tanY * aspect));
    const target: Vec = [0, 12.5, 0];
    cam.fwd = [0, -Math.sin(PITCH), Math.cos(PITCH)];
    cam.up = [0, Math.cos(PITCH), Math.sin(PITCH)];
    cam.right = [1, 0, 0];
    cam.eye = [
      target[0] - cam.fwd[0] * dist,
      target[1] - cam.fwd[1] * dist,
      target[2] - cam.fwd[2] * dist,
    ];
    cam.tanY = tanY;
    cam.tanX = tanY * aspect;
  };

  const resize = () => {
    const cw = Math.max(1, canvas.clientWidth);
    const ch = Math.max(1, canvas.clientHeight);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const scale = Math.min(dpr, Math.sqrt(MAX_PIXELS / (cw * ch))) * quality;
    const w = Math.max(1, Math.round(cw * scale));
    const h = Math.max(1, Math.round(ch * scale));
    if (w === width && h === height && cw === cssW && ch === cssH) return;
    width = w;
    height = h;
    cssW = cw;
    cssH = ch;
    canvas.width = w;
    canvas.height = h;
    if (main) freeTarget(main);
    for (const t of [...downs, ...ups]) freeTarget(t);
    main = makeTarget(w, h);
    downs = [];
    ups = [];
    for (let level = 1; level <= 6; level++) {
      const lw = Math.max(1, Math.round(w / 2 ** level));
      const lh = Math.max(1, Math.round(h / 2 ** level));
      downs.push(makeTarget(lw, lh));
      if (level < 6) ups.push(makeTarget(lw, lh));
    }
    placeCamera();
  };

  const project = (p: Vec) => {
    const rel = sub(p, cam.eye);
    const depth = Math.max(dot(rel, cam.fwd), 0.01);
    const sx = dot(rel, cam.right) / (depth * cam.tanX);
    const sy = dot(rel, cam.up) / (depth * cam.tanY);
    return {
      x: (sx * 0.5 + 0.5) * cssW,
      y: (0.5 - sy * 0.5) * cssH,
      depth,
      // CSS pixels per centimetre at that depth.
      scale: (cssH * 0.5) / (depth * cam.tanY),
    };
  };

  const rayAt = (pt: Point): Vec => {
    const sx = (pt.x / cssW) * 2 - 1;
    const sy = 1 - (pt.y / cssH) * 2;
    return unit([
      cam.fwd[0] + cam.right[0] * sx * cam.tanX + cam.up[0] * sy * cam.tanY,
      cam.fwd[1] + cam.right[1] * sx * cam.tanX + cam.up[1] * sy * cam.tanY,
      cam.fwd[2] + cam.right[2] * sx * cam.tanX + cam.up[2] * sy * cam.tanY,
    ]);
  };

  // Where the ray through a screen point crosses the upright plane at depth z.
  const onPlaneZ = (pt: Point, z: number): Vec => {
    const d = rayAt(pt);
    const t = (z - cam.eye[2]) / d[2];
    return [cam.eye[0] + d[0] * t, cam.eye[1] + d[1] * t, z];
  };

  // ---- State ---------------------------------------------------------------------------

  let settings = { ...DEFAULT_SETTINGS };
  let night = true;
  let holders: Holder[] = [];
  let pairs: Pair[] = [];
  let now = 0;
  const carry = { t: 0 };
  let match: Match | null = null;
  let flashback: Flashback | null = null;
  let exposure = 0.5;
  let toldOut = false;
  const smokeDue = new Map<string, number>();
  const trace = {
    data: [] as Float32Array[],
    head: 0,
    count: 0,
    canvas: null as HTMLCanvasElement | null,
  };
  let labels: (HTMLElement | null)[] = [];
  let lastPointer: Point | null = null;
  let movedAt = -10;
  const breath = {
    hold: 0,
    holding: false,
    key: false,
    mic: 0,
    at: null as Point | null,
  };

  const traced = () => (holders.length <= 3 ? holders : []);

  const arrange = (id: ArrangementId) => {
    holders = arrangement(id).holders.map((spec, i) => createHolder(spec, i));
    pairs = [];
    for (let a = 0; a < holders.length && a < 3; a++) {
      for (let b = a + 1; b < holders.length && b < 3; b++) {
        if (holders.length > 3) continue;
        pairs.push({ a, b, c: 0, s: 0, ampA: 0, ampB: 0 });
      }
    }
    trace.data = holders.slice(0, 3).map(() => new Float32Array(TRACE_SAMPLES));
    trace.head = 0;
    trace.count = 0;
    smoke.clear();
    smokeDue.clear();
    flashback = null;
    movedAt = -10;
    for (const el of labels) if (el) el.style.display = "none";
  };

  // ---- Air -------------------------------------------------------------------------------

  const breathStrength = () => Math.max(breath.hold, breath.mic * 1.35);

  const breathPoint = (): Point => {
    if (breath.at) return breath.at;
    if (lastPointer) return lastPointer;
    // Aim at the middle of the flames.
    const lit = holders.filter((h) => litCount(h) > 0);
    const list = lit.length ? lit : holders;
    let x = 0;
    let z = 0;
    for (const h of list) {
      x += h.x;
      z += h.z;
    }
    const n = Math.max(1, list.length);
    const p = project([x / n, CANDLE_TOP + 2, z / n]);
    return { x: p.x, y: p.y };
  };

  // The draught from a window left open: a gentle push to the right that gusts and lulls.
  const draughtAt = (t: number): Vec => {
    if (!settings.draught) return [0, 0, 0];
    const gust =
      0.5 +
      0.3 * Math.sin(t * 0.7) * Math.sin(t * 1.9 + 1) +
      0.2 * Math.sin(t * 3.1);
    return [
      0.04 + 0.16 * gust,
      0.01 * Math.sin(t * 2.3),
      0.03 * Math.sin(t * 1.1),
    ];
  };

  // Air speed (m/s) at a point from your breath and any draught.
  let breathAxis: { eye: Vec; dir: Vec; s: number } | null = null;
  const windAt = (p: Vec, draught: Vec): Vec => {
    const w: Vec = [draught[0], draught[1], draught[2]];
    if (breathAxis) {
      const rel = sub(p, breathAxis.eye);
      const along = dot(rel, breathAxis.dir);
      const radial: Vec = [
        rel[0] - breathAxis.dir[0] * along,
        rel[1] - breathAxis.dir[1] * along,
        rel[2] - breathAxis.dir[2] * along,
      ];
      const r = Math.hypot(radial[0], radial[1], radial[2]);
      const q = r / BREATH_WIDTH;
      const fall = Math.exp(-q * q);
      const axial = breathAxis.s * BREATH * fall;
      const out = (breathAxis.s * BREATH * 0.8 * q * fall) / Math.max(r, 1e-3);
      for (let i = 0; i < 3; i++) {
        w[i] += breathAxis.dir[i] * axial + radial[i] * out;
      }
    }
    return w;
  };

  // ---- Simulation ----------------------------------------------------------------------

  const wickTip = (h: Holder, i: number): Vec => {
    const w = h.wicks[i];
    return [
      h.x + w.dx + w.curl * 0.6,
      CANDLE_TOP + WICK_LEN * 0.85,
      h.z + w.dz,
    ];
  };

  const flameShape = (h: Holder) => {
    const f = h.flame;
    const size = flameSize(h);
    const [wx, wy, wz] = f.wind;
    const lean = clamp(wx / 0.45, -2.4, 2.4);
    let squash =
      wy >= 0
        ? 1 + 0.25 * Math.min(wy / 0.45, 2)
        : 1 / (1 + 0.6 * Math.min(-wy / 0.45, 3));
    squash /= Math.sqrt(1 + (wz / 0.5) ** 2);
    const speed = Math.hypot(wx, wy, wz);
    squash /= 1 + 0.12 * (speed / 0.45);
    return { ...size, lean, squash, speed };
  };

  const emitSmoke = (dt: number, draught: Vec) => {
    for (const h of holders) {
      h.wicks.forEach((w, i) => {
        if (w.lit || w.heat < 0.03) return;
        const key = `${h.id}:${i}`;
        let due = (smokeDue.get(key) ?? 0) + 650 * w.heat ** 1.5 * dt;
        const [x, y, z] = wickTip(h, i);
        const wind = windAt([x, y, z], draught);
        const n = Math.floor(due);
        for (let j = 0; j < n; j++) {
          smoke.emit(
            x + rand(-0.015, 0.015),
            y,
            z + rand(-0.015, 0.015),
            wind[0] * 50,
            8 + wind[1] * 50,
            wind[2] * 50,
            VAPOUR,
            h.id,
            rand(6, 8),
            (dt * (j + Math.random())) / n,
          );
        }
        due -= n;
        smokeDue.set(key, due);
      });
      // A flame flickering hard, or bent over in a strong draught, sheds soot from its tip.
      const lit = litCount(h);
      if (lit === 0) continue;
      const shape = flameShape(h);
      const over = shape.speed / 1.6;
      const sooty =
        Math.max(0, h.flame.amp - 0.7) * 6 + Math.max(0, over - 0.5) * 30;
      if (Math.random() < sooty * dt) {
        const [bx, by, bz] = flameBase(h);
        const top = shape.h * shape.squash * heightNow(h.flame);
        smoke.emit(
          bx + shape.lean * top * 0.9,
          by + top * 0.95,
          bz,
          h.flame.wind[0] * 60,
          10,
          h.flame.wind[2] * 60,
          SOOT,
          -1,
          rand(3, 5),
        );
      }
    }
  };

  const puff = (h: Holder, wind: Vec) => {
    const [bx, by, bz] = flameBase(h);
    const size = flameSize(h);
    for (let i = 0; i < 14; i++) {
      smoke.emit(
        bx + rand(-0.4, 0.4) * size.r,
        by + rand(0.15, 0.6) * size.h,
        bz + rand(-0.3, 0.3),
        wind[0] * 45 + rand(-5, 5),
        wind[1] * 45 + rand(2, 10),
        wind[2] * 45 + rand(-5, 5),
        PUFF,
        h.id,
        rand(1.2, 2.2),
        rand(0, 0.03),
      );
    }
  };

  const strikeMatch = (at: Point | null) => {
    const z = matchDepth(at);
    const p = at
      ? onPlaneZ(at, z)
      : ([
          Math.min(9, cssW / 2 / project([0, 0, 0]).scale - 3),
          CANDLE_TOP - 4,
          z,
        ] as Vec);
    const front: Vec = [p[0], p[1] - 0.7, z];
    match = {
      front,
      z,
      v: { x: 0, y: 0 },
      struck: now,
      burnt: 0,
      out: null,
      strain: 0,
      glow: 1,
    };
    for (let i = 0; i < 16; i++) {
      const a = rand(0, Math.PI * 2);
      const s = rand(40, 170);
      smoke.emit(
        front[0],
        front[1] + 0.2,
        front[2],
        Math.cos(a) * s,
        Math.abs(Math.sin(a)) * s * 0.8 + 20,
        rand(-30, 30),
        SPARK,
        -1,
        rand(0.2, 0.55),
      );
    }
    for (let i = 0; i < 18; i++) {
      smoke.emit(
        front[0] + rand(-0.3, 0.3),
        front[1] + rand(0, 0.8),
        front[2] + rand(-0.3, 0.3),
        rand(-5, 5),
        rand(4, 12),
        rand(-4, 4),
        MATCH_SMOKE,
        -1,
        rand(2, 3.5),
      );
    }
  };

  // A match is held at the depth of whichever candle it's nearest on screen.
  const matchDepth = (at: Point | null) => {
    if (!at) return 0;
    let best = Number.POSITIVE_INFINITY;
    let z = 0;
    for (const h of holders) {
      const p = project([h.x, CANDLE_TOP + 1, h.z]);
      const d = Math.hypot(p.x - at.x, (p.y - at.y) * 0.5);
      if (d < best) {
        best = d;
        z = h.z;
      }
    }
    return z;
  };

  const matchShape = (m: Match) => {
    const t = now - m.struck;
    if (m.out !== null) return { h: 0, r: 0, bright: 0, flare: 0 };
    if (t < 0.22) return { h: 2.6, r: 0.75, bright: 1.3, flare: 1 - t / 0.22 };
    if (t < 1.1) {
      const k = (t - 0.22) / 0.88;
      return { h: 1.0 + 0.8 * k, r: 0.36 + 0.06 * k, bright: 1, flare: 0 };
    }
    const fade = m.burnt > MATCH_WOOD - 1.2 ? 0.8 : 1;
    return { h: 1.85 * fade, r: 0.42, bright: 1, flare: 0 };
  };

  const goOut = (m: Match, why: string) => {
    m.out = now;
    onNote?.(why);
  };

  const stepMatch = (dt: number, draught: Vec) => {
    const m = match;
    if (!m) return;
    const t = now - m.struck;
    if (m.out !== null) {
      m.glow = Math.max(0, m.glow - dt / 1.6);
      const rate = 50 * m.glow;
      if (Math.random() < rate * dt) {
        smoke.emit(
          m.front[0],
          m.front[1] + 0.1,
          m.front[2],
          0,
          6,
          0,
          MATCH_SMOKE,
          -1,
          rand(2.5, 4),
        );
      }
      if (now - m.out > 3.5) match = null;
      return;
    }
    if (t > 0.8) m.burnt += dt * 0.27;
    if (m.burnt >= MATCH_WOOD - 0.6) {
      goOut(m, "That one burnt right down to the fingers.");
      return;
    }
    const shape = matchShape(m);
    const centre: Vec = [m.front[0], m.front[1] + shape.h * 0.4, m.front[2]];
    const wind = windAt(centre, draught);
    wind[0] -= m.v.x / 100;
    wind[1] += m.v.y / 100;
    const speed = Math.hypot(...wind);
    m.strain =
      speed > 1.25 && t > 0.3 ? m.strain + dt : Math.max(0, m.strain - dt);
    if (m.strain > 0.06) {
      goOut(m, breathAxis ? "Blown out." : "Shaken out.");
      return;
    }
    if (t < 0.25) return;
    // Held to a wick, it lights it.
    for (const h of holders) {
      h.wicks.forEach((w, i) => {
        if (w.lit) return;
        const tip = wickTip(h, i);
        const dx = tip[0] - m.front[0];
        const dy =
          tip[1] - clamp(tip[1], m.front[1] - 0.2, m.front[1] + shape.h * 0.9);
        const dz = (tip[2] - m.front[2]) * 0.3;
        const d = Math.hypot(dx, dy, dz);
        if (d < Math.max(0.5, shape.r * 1.1)) {
          w.kindling += dt;
          if (w.kindling > 0.3) {
            ignite(h, w);
          }
        } else {
          w.kindling = Math.max(0, w.kindling - dt);
        }
      });
    }
    // Held in the smoke of a wick just blown out, it lights the vapour.
    if (!flashback) {
      for (let i = 0; i < smoke.count; i++) {
        if (smoke.kind[i] !== VAPOUR || smoke.age[i] > 1.8) continue;
        const h = holders.find((x) => x.id === smoke.source[i]);
        if (!h || litCount(h) > 0) continue;
        if (Math.max(...h.wicks.map((w) => w.heat)) < 0.25) continue;
        const dx = smoke.x[i] - m.front[0];
        const dy =
          smoke.y[i] - clamp(smoke.y[i], m.front[1], m.front[1] + shape.h);
        const dz = (smoke.z[i] - m.front[2]) * 0.3;
        if (Math.hypot(dx, dy, dz) < 0.55) {
          const from: Vec = [smoke.x[i], smoke.y[i], smoke.z[i]];
          const to = wickTip(h, 0);
          const length = Math.hypot(...sub(from, to));
          flashback = { holder: h, from, start: now, length };
          break;
        }
      }
    }
  };

  const stepFlashback = () => {
    const f = flashback;
    if (!f) return;
    // The flame runs down the vapour at about half a metre a second.
    if (now - f.start > f.length / 55) {
      for (const w of f.holder.wicks) {
        if (w.heat > 0.05) ignite(f.holder, w);
      }
      if (litCount(f.holder) === 0) ignite(f.holder, f.holder.wicks[0]);
      f.holder.flame.grow = 0.5;
      flashback = null;
      onNote?.("The flame ran down the smoke and relit the wick.");
    }
  };

  const flashbackPoint = (): Vec | null => {
    const f = flashback;
    if (!f) return null;
    const k = clamp(((now - f.start) * 55) / Math.max(f.length, 0.01), 0, 1);
    const to = wickTip(f.holder, 0);
    return [
      f.from[0] + (to[0] - f.from[0]) * k,
      f.from[1] + (to[1] - f.from[1]) * k,
      f.from[2] + (to[2] - f.from[2]) * k,
    ];
  };

  const recordTrace = () => {
    const list = traced();
    if (!list.length) return;
    trace.head = (trace.head + 1) % TRACE_SAMPLES;
    trace.count = Math.min(TRACE_SAMPLES, trace.count + 1);
    list.forEach((h, i) => {
      const f = h.flame;
      const a = Math.min(1, Math.hypot(f.re, f.im));
      const g = (((Math.atan2(f.im, f.re) / (Math.PI * 2)) % 1) + 1) % 1;
      const stretch = 0.62 + 0.83 * smoothstep(0, 0.85, g);
      trace.data[i][trace.head] = litCount(h) ? 1 + (stretch - 1) * a : 0;
    });
  };

  let substeps = 0;
  const update = (dtReal: number) => {
    const dt = dtReal * settings.speed;
    now += dt;
    // Breath builds over a fifth of a second and dies over a quarter.
    const holding = breath.holding || breath.key;
    breath.hold = holding
      ? Math.min(1, breath.hold + dt / 0.2)
      : Math.max(0, breath.hold - dt / 0.25);
    const s = breathStrength();
    if (s > 0.01) {
      const pt = breathPoint();
      const dir = rayAt(pt);
      breathAxis = { eye: cam.eye, dir, s };
    } else {
      breathAxis = null;
    }
    const draught = draughtAt(now);
    for (const h of holders) {
      const [bx, by, bz] = flameBase(h);
      const size = flameSize(h);
      const w = windAt([bx, by + size.h * 0.45, bz], draught);
      // Carried through still air, a flame feels a wind against its motion.
      w[0] -= h.vx / 100;
      w[2] -= h.vz / 100;
      h.flame.target = w;
      h.vx *= Math.exp(-dtReal / 0.08);
      h.vz *= Math.exp(-dtReal / 0.08);
    }
    stepOscillators(holders, dt, carry, () => {
      substeps++;
      if (substeps % TRACE_EVERY === 0) recordTrace();
    });
    for (const event of stepFlames(holders, dt, now)) {
      if (event.type === "out") {
        puff(event.holder, event.wind);
        if (!toldOut && holders.length > 0) {
          toldOut = true;
          onNote?.(
            "Out. The white thread is wax vapour, and for a second or two it will still burn: strike a match and hold it in the smoke, a little way up.",
          );
        }
      }
    }
    stepMatch(dt, draught);
    stepFlashback();
    emitSmoke(dt, draught);
    smoke.step(dt, now, (x, y, z) => {
      const w = windAt([x, y, z], draught);
      return [w[0] * 100, w[1] * 100, w[2] * 100];
    });
    // Relations between flames, averaged over the last second or so.
    const k = 1 - Math.exp(-dt / 1);
    for (const p of pairs) {
      const fa = holders[p.a].flame;
      const fb = holders[p.b].flame;
      const d = fb.phase - fa.phase;
      p.c += (Math.cos(d) - p.c) * k;
      p.s += (Math.sin(d) - p.s) * k;
      p.ampA += (fa.amp - p.ampA) * k;
      p.ampB += (fb.amp - p.ampB) * k;
    }
    // Eyes adjust to how much light there is: at night over a second or two; by day the
    // window's light sets the level.
    const light = holders.reduce((sum, h) => sum + flameLight(h), 0);
    const target = night
      ? clamp(0.55 / Math.sqrt(0.6 + 0.5 * light), 0.3, 0.9)
      : 0.8;
    exposure += (target - exposure) * (1 - Math.exp(-dtReal / 1.2));
  };

  // ---- Drawing ---------------------------------------------------------------------------

  const holderData = new Float32Array(MAX_HOLDERS * 4);
  const candleData = new Float32Array(MAX_CANDLES * 4);
  const candleInfo = new Float32Array(MAX_CANDLES * 4);
  const f0 = new Float32Array(MAX_FLAMES * 4);
  const f1 = new Float32Array(MAX_FLAMES * 4);
  const f2 = new Float32Array(MAX_FLAMES * 4);
  const f3 = new Float32Array(MAX_FLAMES * 4);
  const lights = new Float32Array(MAX_FLAMES * 4);
  const lightColours = new Float32Array(MAX_FLAMES * 4);

  const into = (target: Target | null) => {
    gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.framebuffer : null);
    gl.viewport(
      0,
      0,
      target ? target.width : width,
      target ? target.height : height,
    );
  };

  const fillScene = () => {
    holderData.fill(0);
    candleData.fill(0);
    candleInfo.fill(0);
    let candles = 0;
    holders.slice(0, MAX_HOLDERS).forEach((h, i) => {
      const reach = h.bundle ? 0.74 + CANDLE_R : CANDLE_R;
      holderData.set([h.x, h.z, h.cup, reach], i * 4);
      const lit = litCount(h) > 0;
      const glow = lit
        ? (0.45 + 0.55 * h.flame.grow) * (h.bundle ? 1.2 : 1)
        : 0;
      for (const w of h.wicks) {
        if (candles >= MAX_CANDLES) break;
        candleData.set([h.x + w.dx, h.z + w.dz, CANDLE_R, glow], candles * 4);
        candleInfo.set(
          [h.bundle ? 1 : 0, w.lit ? -1 : w.heat, w.curl, i],
          candles * 4,
        );
        candles++;
      }
    });

    f0.fill(0);
    f1.fill(0);
    f2.fill(0);
    f3.fill(0);
    lights.fill(0);
    lightColours.fill(0);
    let n = 0;
    const addFlame = (
      base: Vec,
      size: { h: number; r: number },
      shape: { lean: number; squash: number; amp: number; phase: number },
      look: {
        bright: number;
        lift: number;
        blue: number;
        seed: number;
        flare: number;
        buffet: number;
        match: boolean;
      },
      light: number,
    ) => {
      if (n >= MAX_FLAMES) return;
      f0.set([base[0], base[1], base[2], size.h], n * 4);
      f1.set([size.r, shape.lean, shape.squash, shape.amp], n * 4);
      f2.set([shape.phase, look.bright, look.lift, look.blue], n * 4);
      f3.set([look.seed, look.flare, look.buffet, look.match ? 1 : 0], n * 4);
      const hk = size.h * shape.squash;
      lights.set(
        [
          base[0] + shape.lean * hk * 0.2,
          base[1] + hk * 0.42,
          base[2],
          light * LIGHT_SCALE,
        ],
        n * 4,
      );
      lightColours.set([...LIGHT_COLOUR, size.r * 1.6], n * 4);
      n++;
    };

    for (const h of holders) {
      if (litCount(h) === 0) continue;
      const f = h.flame;
      const shape = flameShape(h);
      // The room's light follows the flame's height only a little.
      const flicker = 1 + 0.12 * (heightNow(f) - 1);
      addFlame(
        flameBase(h),
        shape,
        { lean: shape.lean, squash: shape.squash, amp: f.amp, phase: f.phase },
        {
          bright: 0.55 + 0.45 * f.grow,
          lift: f.lift,
          blue: clamp(f.lift / 0.5, 0, 1) * 0.8,
          seed: f.seed,
          flare: 0,
          buffet: Math.min(1, shape.speed / 1.2),
          match: false,
        },
        (flameLight(h) * flicker) / (1 + 0.5 * f.lift),
      );
    }
    const fb = flashbackPoint();
    if (fb) {
      addFlame(
        [fb[0], fb[1] - 0.4, fb[2]],
        { h: 1.4, r: 0.55 },
        { lean: 0, squash: 1, amp: 0, phase: 0 },
        {
          bright: 1.1,
          lift: 0,
          blue: 0.4,
          seed: 0.3,
          flare: 0.3,
          buffet: 0.5,
          match: false,
        },
        0.8,
      );
    }
    if (match && match.out === null) {
      const shape = matchShape(match);
      const lean = clamp(-match.v.x / 100 / 0.45, -2, 2);
      addFlame(
        [match.front[0], match.front[1] - 0.15, match.front[2]],
        { h: shape.h, r: shape.r },
        { lean, squash: 1, amp: 0, phase: 0 },
        {
          bright: shape.bright,
          lift: 0,
          blue: 0.15,
          seed: 0.77,
          flare: shape.flare,
          buffet: Math.min(1, Math.hypot(match.v.x, match.v.y) / 120) + 0.25,
          match: true,
        },
        0.55 + shape.flare * 1.6,
      );
    }
    return { candles, flames: n };
  };

  const drawScene = () => {
    if (!main) return;
    const { candles, flames } = fillScene();
    into(main);
    gl.disable(gl.BLEND);
    select(scene.program);
    const u = scene.u;
    gl.uniform3fv(u.uEye, cam.eye);
    gl.uniform3fv(u.uFwd, cam.fwd);
    gl.uniform3fv(u.uUp, cam.up);
    gl.uniform3fv(u.uRight, cam.right);
    gl.uniform2f(u.uTan, cam.tanX, cam.tanY);
    gl.uniform1f(u.uTime, now);
    gl.uniform3fv(u.uSky, night ? [0.004, 0.006, 0.012] : [0.8, 0.88, 1.05]);
    // The room's bounce: as if every flame lit walls about 70 cm away, which light the table
    // and wall again, a little.
    const total =
      holders.reduce((sum, h) => sum + flameLight(h), 0) * LIGHT_SCALE;
    const fill = total / 4900;
    gl.uniform3fv(u.uFill, [
      fill * LIGHT_COLOUR[0],
      fill * LIGHT_COLOUR[1],
      fill * LIGHT_COLOUR[2],
    ]);
    gl.uniform1f(u.uFlameGain, night ? 1 : 0.4);
    gl.uniform1f(u.uCandleTop, CANDLE_TOP);
    gl.uniform1f(u.uCupH, CUP_H);
    gl.uniform1f(u.uWickLen, WICK_LEN);
    gl.uniform1i(u.uHolders, Math.min(holders.length, MAX_HOLDERS));
    gl.uniform4fv(u.uHolder, holderData);
    gl.uniform1i(u.uCandles, candles);
    gl.uniform4fv(u.uCandle, candleData);
    gl.uniform4fv(u.uCandleInfo, candleInfo);
    gl.uniform1i(u.uFlames, flames);
    gl.uniform4fv(u.uF0, f0);
    gl.uniform4fv(u.uF1, f1);
    gl.uniform4fv(u.uF2, f2);
    gl.uniform4fv(u.uF3, f3);
    gl.uniform4fv(u.uLight, lights);
    gl.uniform4fv(u.uLightCol, lightColours);
    const m = match;
    if (m) {
      const stick = unit([0.42, -0.84, -0.34]);
      const wood = Math.max(0.2, MATCH_WOOD - m.burnt);
      gl.uniform4f(u.uMatch, m.front[0], m.front[1], m.front[2], 1);
      gl.uniform4f(u.uMatchDir, stick[0], stick[1], stick[2], wood);
      const glow = m.out === null ? 1 : m.glow;
      gl.uniform4f(u.uMatchAsh, Math.min(m.burnt, 1.6) + 0.12, glow, 0, 0);
    } else {
      gl.uniform4f(u.uMatch, 0, 0, 0, 0);
    }
    gl.bindVertexArray(empty);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  // Smoke shows only where light catches it: lit from behind it glows, from the front it's
  // faint, and soot darkens what's behind it instead.
  const drawSmoke = () => {
    if (!main || smoke.count === 0) return;
    const lightList: { p: Vec; i: number }[] = [];
    for (let k = 0; k < MAX_FLAMES; k++) {
      const s = lights[k * 4 + 3];
      if (s > 0)
        lightList.push({
          p: [lights[k * 4], lights[k * 4 + 1], lights[k * 4 + 2]],
          i: s,
        });
    }
    const sky = night ? 0.01 : 0.32;
    let n = 0;
    let sparks = 0;
    const order: number[] = [];
    for (let i = 0; i < smoke.count; i++) {
      if (smoke.kind[i] === SPARK) {
        sparks++;
        continue;
      }
      order.push(i);
    }
    const write = (i: number) => {
      const { size, alpha } = smoke.look(i);
      const x = smoke.x[i];
      const y = smoke.y[i];
      const z = smoke.z[i];
      const kind = smoke.kind[i];
      let r: number;
      let g: number;
      let b: number;
      if (kind === SPARK) {
        r = 9 * alpha;
        g = 3.6 * alpha;
        b = 0.9 * alpha;
        smokeData.set([x, y, z, size, r, g, b, 0], n * 8);
        n++;
        return;
      }
      const view = unit(sub(cam.eye, [x, y, z]));
      let lit = sky;
      for (const L of lightList) {
        const d = sub([x, y, z], L.p);
        const d2 = dot(d, d) + 1;
        const cos = dot(d, view) / Math.sqrt(d2);
        // Henyey–Greenstein with g = 0.5: much more light scattered on forwards.
        const hg = 0.75 / (1.25 - cos) ** 1.5;
        lit += ((L.i / d2) * hg) / 9;
      }
      const albedo = kind === SOOT ? 0.05 : kind === MATCH_SMOKE ? 0.7 : 0.88;
      const tint: Vec = kind === MATCH_SMOKE ? [0.85, 0.9, 1] : [1, 0.82, 0.62];
      const a = alpha;
      r = albedo * lit * a * (night ? tint[0] : 0.9);
      g = albedo * lit * a * (night ? tint[1] : 0.92);
      b = albedo * lit * a * (night ? tint[2] : 1);
      smokeData.set([x, y, z, size, r, g, b, a], n * 8);
      n++;
    };
    for (const i of order) write(i);
    const smokeCount = n;
    if (sparks) {
      for (let i = 0; i < smoke.count; i++)
        if (smoke.kind[i] === SPARK) write(i);
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, smokeBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, smokeData, 0, n * 8);
    into(main);
    select(smokeProgram.program);
    const u = smokeProgram.u;
    gl.uniform3fv(u.uEye, cam.eye);
    gl.uniform3fv(u.uFwd, cam.fwd);
    gl.uniform3fv(u.uUp, cam.up);
    gl.uniform3fv(u.uRight, cam.right);
    gl.uniform2f(u.uTan, cam.tanX, cam.tanY);
    gl.uniform2f(u.uRes, width, height);
    gl.bindVertexArray(smokeVao);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    if (smokeCount) gl.drawArrays(gl.POINTS, 0, smokeCount);
    if (n > smokeCount) {
      gl.blendFunc(gl.ONE, gl.ONE);
      gl.drawArrays(gl.POINTS, smokeCount, n - smokeCount);
    }
    gl.disable(gl.BLEND);
    gl.bindVertexArray(null);
  };

  const drawBloom = () => {
    if (!main) return;
    gl.bindVertexArray(empty);
    select(down.program);
    let source: Target = main;
    for (const target of downs) {
      into(target);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, source.texture);
      gl.uniform1i(down.u.uSource, 0);
      gl.uniform2f(down.u.uTexel, 1 / source.width, 1 / source.height);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      source = target;
    }
    select(up.program);
    source = downs[downs.length - 1];
    for (let level = ups.length - 1; level >= 0; level--) {
      const target = ups[level];
      into(target);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, source.texture);
      gl.uniform1i(up.u.uSource, 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, downs[level].texture);
      gl.uniform1i(up.u.uSame, 1);
      gl.uniform2f(up.u.uTexel, 1 / source.width, 1 / source.height);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      source = target;
    }
  };

  const drawComposite = () => {
    if (!main) return;
    into(null);
    select(composite.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, main.texture);
    gl.uniform1i(composite.u.uScene, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, ups[0].texture);
    gl.uniform1i(composite.u.uBloom, 1);
    gl.uniform1f(composite.u.uExposure, exposure);
    gl.uniform1f(composite.u.uBloomGain, night ? 0.07 : 0.05);
    gl.uniform1f(composite.u.uTime, now);
    gl.bindVertexArray(empty);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  const render = () => {
    drawScene();
    drawSmoke();
    drawBloom();
    drawComposite();
  };

  // The labels sit on the table in front of each cup.
  const placeLabels = () => {
    const list = holders.length >= 2 && holders.length <= 3 ? holders : [];
    labels.forEach((el, i) => {
      if (!el) return;
      const h = list[i];
      if (!h) {
        el.style.display = "none";
        return;
      }
      const p = project([h.x, 0, h.z - h.cup - 0.6]);
      el.style.display = "";
      el.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, 0)`;
    });
  };

  const drawTrace = () => {
    const c = trace.canvas;
    if (!c) return;
    const w = c.clientWidth;
    const h = c.clientHeight;
    if (!w || !h) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
    }
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const colours = night ? TRACE_COLOURS.night : TRACE_COLOURS.day;
    const list = traced();
    const rows = list.length || 1;
    const rowH = h / rows;
    list.forEach((_, i) => {
      const data = trace.data[i];
      const mid = rowH * (i + 0.62);
      ctx.strokeStyle = night ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, mid);
      ctx.lineTo(w, mid);
      ctx.stroke();
      ctx.strokeStyle = colours[i];
      ctx.lineWidth = 1.5;
      ctx.lineJoin = "round";
      ctx.beginPath();
      const n = trace.count;
      for (let k = 0; k < n; k++) {
        const at = (trace.head - (n - 1 - k) + TRACE_SAMPLES) % TRACE_SAMPLES;
        const v = data[at];
        const x = w - ((n - 1 - k) / (TRACE_SAMPLES - 1)) * w;
        const y = v === 0 ? mid + rowH * 0.3 : mid - (v - 1) * rowH * 0.62;
        if (k === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    });
  };

  // ---- Stats -----------------------------------------------------------------------------

  const relationOf = (p: Pair): Relation => {
    const a = holders[p.a];
    const b = holders[p.b];
    if (!litCount(a) || !litCount(b)) return "out";
    if (now - movedAt < 0.9) return "settling";
    if (p.ampA < 0.2 && p.ampB < 0.2) return "still";
    // Two flames that hardly pull on each other only look in step while they drift past.
    if (Math.max(pullOn(a, b), pullOn(b, a)) < 1) return "drifting";
    const r = Math.hypot(p.c, p.s);
    const angle = Math.abs(Math.atan2(p.s, p.c)) / DEG;
    if (r > 0.75) {
      if (angle < 50) return "together";
      if (angle > 135) return "turns";
      return "round";
    }
    return "drifting";
  };

  const statsNow = (fps: number | null): CandleStats => {
    let lit = 0;
    let wicks = 0;
    for (const h of holders) {
      lit += litCount(h);
      wicks += h.wicks.length;
    }
    return {
      lit,
      wicks,
      flames: traced().map((h, i) => ({
        label: LABELS[i],
        hz: litCount(h) && h.flame.amp > 0.25 ? h.flame.hz : null,
        lit: litCount(h) > 0,
      })),
      pairs: pairs.map((p) => {
        const a = holders[p.a];
        const b = holders[p.b];
        const pa = flameBase(a);
        const pb = flameBase(b);
        return {
          a: LABELS[p.a],
          b: LABELS[p.b],
          cm: Math.hypot(pa[0] - pb[0], pa[2] - pb[2]),
          relation: relationOf(p),
        };
      }),
      match: match ? (match.out === null ? "burning" : "out") : "none",
      fps,
    };
  };

  // ---- Loop ------------------------------------------------------------------------------

  let last = performance.now();
  let interval = 1 / 60;
  let statStamp = 0;
  let slowFrames = 0;
  let raf = 0;
  let disposed = false;

  const loop = (time: number) => {
    if (disposed) return;
    raf = requestAnimationFrame(loop);
    const raw = (time - last) / 1000;
    const dt = clamp(raw, 0, 1 / 30);
    last = time;
    if (raw > 0 && raw < 0.1) interval += (raw - interval) * 0.05;
    resize();
    update(dt);
    render();
    placeLabels();
    drawTrace();
    // Drop the resolution a little if the frames can't keep up.
    slowFrames =
      interval > 1 / 40 ? slowFrames + 1 : Math.max(0, slowFrames - 1);
    if (slowFrames > 90 && quality > 0.5) {
      quality *= 0.85;
      slowFrames = 0;
    }
    if (time - statStamp > 120) {
      statStamp = time;
      onStats?.(statsNow(Math.round(1 / interval)));
    }
  };

  // ---- Input -----------------------------------------------------------------------------

  let drag: {
    id: number;
    holder: Holder;
    plane: number;
    offset: Point;
    last: number;
  } | null = null;
  let blowing: number | null = null;

  const holderAt = (pt: Point) => {
    let best: Holder | null = null;
    let bestDepth = Number.POSITIVE_INFINITY;
    for (const h of holders) {
      const reach = h.bundle ? 0.74 + CANDLE_R : CANDLE_R;
      const mid = project([h.x, CANDLE_TOP / 2, h.z]);
      const half = Math.max(h.cup, reach + 0.3) * mid.scale + 4;
      const top = project([h.x, CANDLE_TOP + 1.2, h.z]).y;
      const bottom = project([h.x, 0, h.z - h.cup]).y + 4;
      if (
        pt.x > mid.x - half &&
        pt.x < mid.x + half &&
        pt.y > top &&
        pt.y < bottom
      ) {
        if (mid.depth < bestDepth) {
          bestDepth = mid.depth;
          best = h;
        }
      }
    }
    return best;
  };

  const moveMatch = (pt: Point) => {
    const m = match;
    if (!m || m.out !== null) return;
    const z = matchDepth(pt);
    m.z += (z - m.z) * 0.5;
    const p = onPlaneZ(pt, m.z);
    const next: Vec = [p[0], p[1] - 0.7, m.z];
    const dtMove = Math.max(1 / 240, (performance.now() - moveStamp) / 1000);
    moveStamp = performance.now();
    const k = 0.35;
    m.v.x += (((next[0] - m.front[0]) / dtMove) * settings.speed - m.v.x) * k;
    m.v.y += (((next[1] - m.front[1]) / dtMove) * settings.speed - m.v.y) * k;
    m.front = next;
  };
  let moveStamp = performance.now();

  const moveHolder = (pt: Point) => {
    const d = drag;
    if (!d) return;
    const dir = rayAt(pt);
    if (dir[1] >= -1e-4 && cam.eye[1] > d.plane) return;
    const t = (d.plane - cam.eye[1]) / dir[1];
    if (t <= 0) return;
    const halfWide = cssW / 2 / project([0, 0, 0]).scale;
    let x = clamp(
      cam.eye[0] + dir[0] * t + d.offset.x,
      -halfWide + 1.5,
      halfWide - 1.5,
    );
    let z = clamp(cam.eye[2] + dir[2] * t + d.offset.y, -12, 18);
    const h = d.holder;
    // Cups can't pass through each other.
    for (let pass = 0; pass < 3; pass++) {
      for (const o of holders) {
        if (o === h) continue;
        const dx = x - o.x;
        const dz = z - o.z;
        const dist = Math.hypot(dx, dz);
        const min = h.cup + o.cup + 0.02;
        if (dist < min) {
          const ux = dist > 1e-4 ? dx / dist : 1;
          const uz = dist > 1e-4 ? dz / dist : 0;
          x = o.x + ux * min;
          z = o.z + uz * min;
        }
      }
    }
    const nowMs = performance.now();
    const dt = Math.max(1 / 240, (nowMs - d.last) / 1000);
    d.last = nowMs;
    const k = 0.5;
    h.vx += (((x - h.x) / dt) * settings.speed - h.vx) * k;
    h.vz += (((z - h.z) / dt) * settings.speed - h.vz) * k;
    h.x = x;
    h.z = z;
    movedAt = now;
  };

  resize();
  arrange(settings.arrangement);
  raf = requestAnimationFrame(loop);

  return {
    setSettings(next: CandleSettings) {
      const changed = next.arrangement !== settings.arrangement;
      settings = { ...next };
      if (changed) arrange(settings.arrangement);
    },
    setNight(on: boolean) {
      night = on;
    },
    setTrace(c: HTMLCanvasElement | null) {
      trace.canvas = c;
    },
    setLabels(elements: (HTMLElement | null)[]) {
      labels = elements;
    },
    // Returns the cursor for what a press here does, or null if it does nothing.
    pointerDown(id: number, pt: Point) {
      lastPointer = pt;
      if (match && match.out === null) {
        moveMatch(pt);
        return "none";
      }
      const h = holderAt(pt);
      if (h) {
        // Hold it at the height you took it by.
        const dir = rayAt(pt);
        const t = (h.z - cam.eye[2]) / dir[2];
        const plane = clamp(cam.eye[1] + dir[1] * t, CUP_H, CANDLE_TOP);
        const tt = (plane - cam.eye[1]) / dir[1];
        const at = { x: cam.eye[0] + dir[0] * tt, y: cam.eye[2] + dir[2] * tt };
        drag = {
          id,
          holder: h,
          plane,
          offset: { x: h.x - at.x, y: h.z - at.y },
          last: performance.now(),
        };
        return "grabbing";
      }
      blowing = id;
      breath.holding = true;
      breath.at = pt;
      return "default";
    },
    pointerMove(id: number, pt: Point) {
      lastPointer = pt;
      if (drag && drag.id === id) {
        moveHolder(pt);
        return;
      }
      if (blowing === id) breath.at = pt;
      moveMatch(pt);
    },
    pointerUp(id: number) {
      if (drag && drag.id === id) drag = null;
      if (blowing === id) {
        blowing = null;
        breath.holding = false;
        breath.at = null;
      }
    },
    hover(pt: Point) {
      lastPointer = pt;
      if (match && match.out === null) {
        moveMatch(pt);
        return "none";
      }
      return holderAt(pt) ? "grab" : "default";
    },
    leave() {
      lastPointer = null;
    },
    blow(on: boolean) {
      breath.key = on;
    },
    breathe(level: number) {
      breath.mic = level;
    },
    strike() {
      strikeMatch(lastPointer);
    },
    dropMatch() {
      if (match && match.out === null) goOut(match, "Shaken out.");
    },
    lightAll() {
      relightAll(holders);
      for (const h of holders) {
        h.flame.grow = Math.min(h.flame.grow, 0.3);
        for (const w of h.wicks) w.heat = 0;
      }
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      const lose = gl.getExtension("WEBGL_lose_context");
      lose?.loseContext();
    },
  };
}

function smoothstep(a: number, b: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
