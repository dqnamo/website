// A coin on a table that you flick into a spin, seen from a chair's height. The motion is
// physics.ts, a disc rolling on its rim without slipping; this file is the table around it.
//
// Each frame the model is stepped through the time the frame stands for, a sixtieth of a
// second or less in slow motion, and the coin's pose is recorded on an even grid of time, so
// the shader can blend the last twenty-fourth of a second the way an eye does. The steps
// shrink as the coin speeds up, to a few hundredths of a radian of the contact's lap each,
// because near the end the contact goes round a hundred times a second and more. When the coin is within half a degree of
// flat it has stopped, as far as anyone can see or hear, and it's laid down showing whichever
// face is up. Only coins that fall by themselves are counted: the heavier heads side tips
// them heads down more often than not, which a slap at a random moment would hide.
//
// You stand the coin up by pressing on it, and let go with a flick: sideways spins it, at a
// rate set by how fast your finger was moving, and away from you rolls it. A plain tap spins it
// as a brisk flick would. Pressing a coin that's still moving slaps it flat.

import {
  type CoinId,
  type CoinSpec,
  coinSpec,
  type TableId,
  tableSpec,
} from "./coins";
import { FACE_SIZE, strikeFaces } from "./faces";
import {
  axisOf,
  contactPoint,
  type Drag,
  fromFrame,
  measure,
  type Motion,
  normalise,
  type Quat,
  rotate,
  step,
  type Vec,
} from "./physics";
import { FS, POSES, PRESENT_FS, VS } from "./shaders";
import { createSound } from "./sound";

export type { CoinId, TableId } from "./coins";

export type CoinSettings = {
  coin: CoinId;
  table: TableId;
  // Simulated seconds per real second.
  speed: number;
  trace: boolean;
  sound: boolean;
};

export const DEFAULT_SETTINGS: CoinSettings = {
  coin: "silver",
  table: "oak",
  speed: 1,
  trace: false,
  sound: true,
};

export type Tally = { heads: number; tails: number };

export type CoinStats = {
  mode: "rest" | "held" | "upright" | "wobbling";
  // Degrees from lying flat.
  lean: number;
  // Laps a second the contact makes round the table, while it's wobbling.
  laps: number;
  // Turns a second, spinning upright.
  spin: number;
  // Turns a second of the picture on the face, seen from above.
  face: number;
  tally: Tally;
  showing: "heads" | "tails" | null;
  fps: number | null;
};

type Point = { x: number; y: number };
type Mode = "rest" | "held" | "moving";

const DEG = Math.PI / 180;
const ELEVATION = 50 * DEG;
const FOV = 30 * DEG;
// Coin radii across the shorter side of the view.
const RADII = 6.5;
// Lean from flat (radians) at which the coin counts as down.
const DOWN = 0.5 * DEG;
const UPRIGHT = 70 * DEG;
// How long the eye blends what it sees, in seconds.
const SHUTTER = 1 / 24;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
const cross = (a: Vec, b: Vec): Vec => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
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

// Lying flat, heads or tails up, the design turned to a heading.
function flatPose(heads: boolean, heading: number): Quat {
  const e3: Vec = [0, 0, heads ? 1 : -1];
  const e1: Vec = [Math.cos(heading), Math.sin(heading), 0];
  return fromFrame(e1, cross(e3, e1), e3);
}

// Standing on its rim with the given face pointing along n (horizontal), the design upright.
function standingPose(n: Vec, tilt = 0): Quat {
  const h = unit([n[0], n[1], 0]);
  const e3: Vec = unit([
    h[0] * Math.cos(tilt),
    h[1] * Math.cos(tilt),
    Math.sin(tilt),
  ]);
  const e2: Vec = unit([
    -h[0] * Math.sin(tilt),
    -h[1] * Math.sin(tilt),
    Math.cos(tilt),
  ]);
  return fromFrame(cross(e2, e3), e2, e3);
}

export type SpinningCoin = ReturnType<typeof createSpinningCoin>;

export function createSpinningCoin(
  canvas: HTMLCanvasElement,
  {
    onStats,
    onNote,
  }: {
    onStats?: (stats: CoinStats) => void;
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

  const scene = compile(gl, VS, FS);
  const present = compile(gl, VS, PRESENT_FS);
  const u = scene.u;
  const triangle = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, triangle);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 3, -1, -1, 3]),
    gl.STATIC_DRAW,
  );
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  const texture = (unit: number, mip: boolean) => {
    const t = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(
      gl.TEXTURE_2D,
      gl.TEXTURE_MIN_FILTER,
      mip ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR,
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      1,
      1,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      new Uint8Array([128, 128, 128, 128]),
    );
    return t;
  };
  const slopesTex = texture(0, true);
  const heightsTex = texture(1, true);
  const traceTex = texture(2, false);

  // The frame is drawn into a texture and then copied to the screen. While the coin moves,
  // each new frame is laid over the last at half strength, which carries the eye's blend on a
  // frame further and averages out the grain of sampling it.
  const accumTex = gl.createTexture();
  const accumFb = gl.createFramebuffer();
  let fresh = true;
  const sizeAccum = (w: number, h: number) => {
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, accumTex);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA8,
      w,
      h,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      null,
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, accumFb);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      accumTex,
      0,
    );
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    fresh = true;
  };
  const lastTarget = { x: 0, y: 0 };

  const faces = new Map<string, ReturnType<typeof strikeFaces>>();
  let struck: string | null = null;
  const strike = (coin: CoinSpec) => {
    if (!coin.faces || struck === coin.id) return;
    let made = faces.get(coin.id);
    if (!made) {
      made = strikeFaces(coin.id);
      faces.set(coin.id, made);
    }
    const upload = (
      tex: WebGLTexture | null,
      unit: number,
      data: Uint8Array,
    ) => {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        FACE_SIZE,
        FACE_SIZE,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        data,
      );
      gl.generateMipmap(gl.TEXTURE_2D);
    };
    upload(slopesTex, 0, made.slopes);
    upload(heightsTex, 1, made.heights);
    struck = coin.id;
  };

  // The contact's track, drawn on a canvas laid over a square of table round the spin.
  const trace = document.createElement("canvas");
  trace.width = 1024;
  trace.height = 1024;
  const traceCtx = trace.getContext("2d");
  const traceRect = { x: 0, y: 0, size: 1 };
  let traceDirty = true;
  let traceLast: Point | null = null;

  const sound = createSound();
  let settings: CoinSettings = { ...DEFAULT_SETTINGS };
  let coin = coinSpec(settings.coin);
  let table = tableSpec(settings.table);
  let night = false;
  let dirty = true;
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const drag = (): Drag => ({
    roll: table.drag.roll * coin.scale[0],
    air: table.drag.air * coin.scale[1],
    pivot: table.drag.pivot * coin.scale[2],
  });
  const aMm = () => coin.disc.radius * 1000;

  // ---- The coin's state -----------------------------------------------------------------

  let mode: Mode = "rest";
  let motion: Motion = { q: flatPose(true, 0.3), w: [0, 0, 0], x: 0, y: 0 };
  // While resting or held: the pose, and the middle of the coin in millimetres.
  let restQ: Quat = flatPose(true, 0.3);
  let restC: Vec = [0, 0, coin.disc.thickness * 500];
  let showing: "heads" | "tails" | null = "heads";
  // Standing it up takes a moment, from the pose it was in.
  const stand = { from: restQ, fromC: restC, t: 1 };
  const tallies = new Map<CoinId, Tally>();
  const tally = () => {
    let t = tallies.get(coin.id);
    if (!t) {
      t = { heads: 0, tails: 0 };
      tallies.set(coin.id, t);
    }
    return t;
  };
  // What the eye has just seen, oldest first: the pose on an even grid of simulated time across
  // the last twenty-fourth of a real second, which the shader blends; and how many moments of
  // it to take.
  const poseQ = new Float32Array(POSES * 4);
  const poseC = new Float32Array(POSES * 3);
  let sinceGrid = 0;
  let trail = 0;
  let samples = 4;
  let frameNo = 0;
  const bound = { x: 0, y: 0, z: 0, r: 1 };
  let notedTopple = false;
  let launched = 0;

  // The middle of the coin (not its centre of mass) in millimetres, for a physics state.
  const middleOf = (s: Motion): Vec => {
    const n = axisOf(s.q);
    const off = coin.disc.offset;
    const { height } = measure(coin.disc, s);
    return [
      (s.x - off * n[0]) * 1000,
      (s.y - off * n[1]) * 1000,
      (height - off * n[2]) * 1000,
    ];
  };

  const pushPose = (q: Quat, c: Vec) => {
    poseQ.copyWithin(0, 4);
    poseC.copyWithin(0, 3);
    poseQ.set(q, (POSES - 1) * 4);
    poseC.set(c, (POSES - 1) * 3);
  };
  const fillPoses = (q: Quat, c: Vec) => {
    for (let i = 0; i < POSES; i++) pushPose(q, c);
  };

  // ---- The view -------------------------------------------------------------------------

  let width = 0;
  let height = 0;
  let cssW = 1;
  let cssH = 1;
  let quality = 1;
  const target = { x: 0, y: 0 };
  const cam = {
    eye: [0, 0, 0] as Vec,
    right: [1, 0, 0] as Vec,
    up: [0, 0, 1] as Vec,
    fwd: [0, 1, 0] as Vec,
    tanX: 1,
    tanY: 1,
    span: 100,
  };

  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cw = Math.max(1, canvas.clientWidth);
    const ch = Math.max(1, canvas.clientHeight);
    let scale = Math.max(dpr, 1) * quality;
    scale = Math.min(scale, Math.sqrt(2.2e6 / (cw * ch)));
    const w = Math.max(1, Math.round(cw * scale));
    const h = Math.max(1, Math.round(ch * scale));
    if (w === width && h === height && cw === cssW && ch === cssH) return;
    width = w;
    height = h;
    cssW = cw;
    cssH = ch;
    canvas.width = w;
    canvas.height = h;
    sizeAccum(w, h);
    dirty = true;
  };

  const placeCamera = () => {
    const a = aMm();
    const aspect = cssW / cssH;
    const vSpan = aspect < 1 ? (RADII * a) / aspect : RADII * a;
    cam.span = vSpan;
    cam.tanY = Math.tan(FOV / 2);
    cam.tanX = cam.tanY * aspect;
    const dist = vSpan / 2 / cam.tanY;
    const tz = a * 0.45;
    const ce = Math.cos(ELEVATION);
    const se = Math.sin(ELEVATION);
    cam.eye = [target.x, target.y - dist * ce, tz + dist * se];
    cam.fwd = [0, ce, -se];
    cam.right = [1, 0, 0];
    cam.up = [0, se, ce];
  };

  // Where a point on the table (millimetres) lands on screen, in CSS pixels, and how many
  // pixels a millimetre is there.
  const project = (p: Vec) => {
    const v: Vec = [p[0] - cam.eye[0], p[1] - cam.eye[1], p[2] - cam.eye[2]];
    const z = v[0] * cam.fwd[0] + v[1] * cam.fwd[1] + v[2] * cam.fwd[2];
    const x = v[0] * cam.right[0] + v[1] * cam.right[1] + v[2] * cam.right[2];
    const y = v[0] * cam.up[0] + v[1] * cam.up[1] + v[2] * cam.up[2];
    const sx = ((x / (z * cam.tanX) + 1) / 2) * cssW;
    const sy = ((1 - y / (z * cam.tanY)) / 2) * cssH;
    return { x: sx, y: sy, scale: cssH / 2 / (z * cam.tanY) };
  };

  const coinMiddle = (): Vec =>
    mode === "moving" ? middleOf(motion) : [restC[0], restC[1], restC[2]];

  const onCoin = (p: Point, slack = 1.35) => {
    const c = coinMiddle();
    const s = project(c);
    const r = Math.max(aMm() * s.scale * slack, 26);
    return Math.hypot(p.x - s.x, p.y - s.y) < r;
  };

  // ---- Starting and stopping ------------------------------------------------------------

  const resetTrace = (x: number, y: number) => {
    const size = aMm() * 14;
    traceRect.x = x - size / 2;
    traceRect.y = y - size / 2;
    traceRect.size = size;
    traceCtx?.clearRect(0, 0, trace.width, trace.height);
    traceLast = null;
    traceDirty = true;
  };

  const markTrace = () => {
    if (!settings.trace || !traceCtx) return;
    const p = contactPoint(coin.disc, motion);
    let x = ((p[0] * 1000 - traceRect.x) / traceRect.size) * trace.width;
    let y = ((p[1] * 1000 - traceRect.y) / traceRect.size) * trace.height;
    // A rolled coin wanders off the square, so the square follows it, keeping what's on it.
    const edge = trace.width * 0.12;
    if (
      x < edge ||
      y < edge ||
      x > trace.width - edge ||
      y > trace.height - edge
    ) {
      const dx = Math.round(trace.width / 2 - x);
      const dy = Math.round(trace.height / 2 - y);
      traceCtx.save();
      traceCtx.globalCompositeOperation = "copy";
      traceCtx.drawImage(trace, dx, dy);
      traceCtx.restore();
      traceRect.x -= (dx / trace.width) * traceRect.size;
      traceRect.y -= (dy / trace.height) * traceRect.size;
      x += dx;
      y += dy;
      if (traceLast) traceLast = { x: traceLast.x + dx, y: traceLast.y + dy };
    }
    if (traceLast) {
      traceCtx.beginPath();
      traceCtx.moveTo(traceLast.x, traceLast.y);
      traceCtx.lineTo(x, y);
      traceCtx.stroke();
      traceDirty = true;
    }
    traceLast = { x, y };
  };

  const launch = (s: Motion) => {
    motion = s;
    mode = "moving";
    notedTopple = false;
    launched = performance.now();
    const c = middleOf(s);
    resetTrace(c[0], c[1]);
    if (traceCtx) {
      traceCtx.strokeStyle = "rgba(255,255,255,0.5)";
      traceCtx.lineWidth = 1.6;
      traceCtx.lineCap = "round";
    }
    dirty = true;
  };

  // The coin's centre of mass for a pose, from its middle.
  const massAt = (q: Quat, c: Vec) => {
    const n = rotate(q, [0, 0, 1]);
    return {
      x: c[0] / 1000 + coin.disc.offset * n[0],
      y: c[1] / 1000 + coin.disc.offset * n[1],
    };
  };

  // Flicked from standing: spin about the vertical, rad/s, signed.
  const spinFrom = (q: Quat, c: Vec, rate: number) => {
    const n = rotate(q, [0, 0, 1]);
    const tilted = standingPose(n, rand(-0.6, 0.6) * DEG);
    const at = massAt(tilted, c);
    launch({
      q: tilted,
      w: [rand(-0.6, 0.6), rand(-0.6, 0.6), rate],
      x: at.x,
      y: at.y,
    });
    sound.flick(coin.ring, clamp(Math.abs(rate) / coin.flick, 0.3, 1.2));
  };

  // Rolled from standing along a direction on the table at a speed in mm/s.
  const rollFrom = (c: Vec, dir: Vec, speed: number) => {
    const d = unit([dir[0], dir[1], 0]);
    let n = cross([0, 0, 1], d);
    if (Math.random() < 0.5) n = [-n[0], -n[1], -n[2]];
    const tilt = rand(2, 5) * DEG * (Math.random() < 0.5 ? -1 : 1);
    const q = standingPose(n, tilt);
    const nn = rotate(q, [0, 0, 1]);
    const rate = speed / 1000 / coin.disc.radius;
    const axis = cross([0, 0, 1], d);
    const at = massAt(q, c);
    // Rolling forwards spins it about its own axis.
    const sign = axis[0] * nn[0] + axis[1] * nn[1] > 0 ? 1 : -1;
    launch({
      q,
      w: [nn[0] * rate * sign, nn[1] * rate * sign, nn[2] * rate * sign],
      x: at.x,
      y: at.y,
    });
    sound.flick(coin.ring, 0.6);
  };

  const layDown = (heads: boolean, heading: number, at: Vec) => {
    restQ = flatPose(heads, heading);
    restC = [at[0], at[1], coin.disc.thickness * 500];
    showing = coin.faces ? (heads ? "heads" : "tails") : null;
    mode = "rest";
    dirty = true;
  };

  // The heading of the design, seen from above, for laying it down where it was facing.
  const headingOf = (q: Quat) => {
    const e1 = rotate(q, [1, 0, 0]);
    const e2 = rotate(q, [0, 1, 0]);
    const n = rotate(q, [0, 0, 1]);
    // When the face points down, the design's right is mirrored as seen from above.
    return n[2] >= 0 ? Math.atan2(e1[1], e1[0]) : Math.atan2(-e2[0], e2[1]);
  };

  const settle = (natural: boolean) => {
    const m = measure(coin.disc, motion);
    let heads = m.n[2] > 0;
    if (Math.abs(m.n[2]) < 0.03 && !natural) heads = Math.random() < 0.5;
    const c = middleOf(motion);
    const heading = headingOf(motion.q);
    const laps = Math.abs(m.wobble) / (Math.PI * 2);
    const voice = {
      laps: 0,
      speed: 0,
      spin: 0,
      loud: table.loud,
      bright: table.bright,
    };
    if (natural) {
      sound.settle(
        coin.ring,
        clamp(0.35 + laps / 120, 0.35, 1),
        voice,
        table.ring,
      );
    } else {
      sound.slap(coin.ring, voice, table.ring);
    }
    layDown(heads, heading, c);
    if (!coin.faces) {
      if (natural && performance.now() - launched > 1500) {
        onNote?.(
          laps > 20
            ? `Stopped dead at ${Math.round(laps)} laps a second.`
            : "Down.",
        );
      }
      return;
    }
    const face = heads ? "Heads" : "Tails";
    if (natural) {
      const t = tally();
      if (heads) t.heads++;
      else t.tails++;
      onNote?.(
        `${face}. Fell by itself at ${Math.round(laps)} laps a second; ${t.heads} heads and ${t.tails} tails so far.`,
      );
    } else {
      onNote?.(`Slapped down: ${face.toLowerCase()}. Slaps aren't counted.`);
    }
  };

  // ---- Stepping -------------------------------------------------------------------------

  // Steps the model on through a span of simulated time, in steps of a few hundredths of a
  // radian of whatever is turning fastest, up to a budget of steps a frame.
  let budget = 0;
  const run = (span: number, d: Drag) => {
    let t = 0;
    while (t < span - 1e-12 && budget-- > 0) {
      const m = measure(coin.disc, motion);
      if (m.lean < DOWN) {
        settle(true);
        return;
      }
      const rate = Math.abs(m.wobble) + Math.hypot(...motion.w);
      const h = Math.min(2e-4, 0.04 / Math.max(rate, 1), span - t);
      const next = step(coin.disc, d, motion, h).next;
      if (!Number.isFinite(next.q[0]) || !Number.isFinite(next.w[0])) {
        settle(true);
        return;
      }
      motion = next;
      t += h;
      markTrace();
    }
  };

  // Standing up, part way from how it was lying.
  const heldPose = (): [Quat, Vec] => {
    const e = stand.t * stand.t * (3 - 2 * stand.t);
    const q0 = stand.from;
    let q1 = restQ;
    if (q0[0] * q1[0] + q0[1] * q1[1] + q0[2] * q1[2] + q0[3] * q1[3] < 0) {
      q1 = [-q1[0], -q1[1], -q1[2], -q1[3]];
    }
    const q = normalise([
      q0[0] + (q1[0] - q0[0]) * e,
      q0[1] + (q1[1] - q0[1]) * e,
      q0[2] + (q1[2] - q0[2]) * e,
      q0[3] + (q1[3] - q0[3]) * e,
    ]);
    const c: Vec = [
      stand.fromC[0] + (restC[0] - stand.fromC[0]) * e,
      stand.fromC[1] + (restC[1] - stand.fromC[1]) * e,
      stand.fromC[2] + (restC[2] - stand.fromC[2]) * e,
    ];
    return [q, c];
  };

  const currentPose = (): [Quat, Vec] =>
    mode === "moving"
      ? [motion.q, middleOf(motion)]
      : mode === "held"
        ? heldPose()
        : [restQ, restC];

  // How many moments the shader takes: enough that the coin moves no more than a few degrees
  // between them, and at least four, which smooths its edges.
  const countSamples = () => {
    let turn = 0;
    let move = 0;
    for (let i = 1; i < POSES; i++) {
      const dot = Math.abs(
        poseQ[i * 4] * poseQ[i * 4 - 4] +
          poseQ[i * 4 + 1] * poseQ[i * 4 - 3] +
          poseQ[i * 4 + 2] * poseQ[i * 4 - 2] +
          poseQ[i * 4 + 3] * poseQ[i * 4 - 1],
      );
      turn += 2 * Math.acos(Math.min(1, dot));
      move += Math.hypot(
        poseC[i * 3] - poseC[i * 3 - 3],
        poseC[i * 3 + 1] - poseC[i * 3 - 2],
        poseC[i * 3 + 2] - poseC[i * 3 - 1],
      );
    }
    const a = aMm();
    const needed = Math.max(turn / (4 * DEG), (move / a) * 16);
    samples = clamp(Math.ceil(needed), 4, 32);
    let cx = 0;
    let cy = 0;
    let cz = 0;
    for (let i = 0; i < POSES; i++) {
      cx += poseC[i * 3] / POSES;
      cy += poseC[i * 3 + 1] / POSES;
      cz += poseC[i * 3 + 2] / POSES;
    }
    let r = 0;
    for (let i = 0; i < POSES; i++) {
      r = Math.max(
        r,
        Math.hypot(
          poseC[i * 3] - cx,
          poseC[i * 3 + 1] - cy,
          poseC[i * 3 + 2] - cz,
        ),
      );
    }
    bound.x = cx;
    bound.y = cy;
    bound.z = cz;
    bound.r = r + a * 1.02;
  };

  let last = performance.now();
  // The frame interval, smoothed, leaving out the gaps while the tab was hidden.
  let interval = 1 / 60;
  let fps: number | null = null;
  let statStamp = 0;
  let slowFrames = 0;
  let raf = 0;
  let disposed = false;

  const update = (dt: number) => {
    const span = dt * settings.speed;
    const grid = (SHUTTER * settings.speed) / (POSES - 1);
    if (mode === "held" && stand.t < 1) {
      stand.t = Math.min(1, stand.t + dt / 0.14);
      trail = 4;
    }
    const d = drag();
    budget = 8000;
    let left = span;
    while (left > 1e-12) {
      const h = Math.min(left, grid - sinceGrid);
      if (mode === "moving") run(h, d);
      sinceGrid += h;
      left -= h;
      if (sinceGrid >= grid - 1e-12) {
        sinceGrid = 0;
        const [q, c] = currentPose();
        pushPose(q, c);
      }
    }
    if (mode === "moving") {
      trail = 4;
      const m = measure(coin.disc, motion);
      const upright = m.lean > UPRIGHT;
      const laps = upright ? 0 : m.wobble / (Math.PI * 2);
      sound.update({
        laps,
        speed: upright ? 0 : Math.abs(m.wobble) * aMm(),
        spin: upright ? m.turn / (Math.PI * 2) : 0,
        loud: table.loud * settings.speed ** 0.5,
        bright: table.bright,
      });
      if (
        !notedTopple &&
        m.lean < 45 * DEG &&
        performance.now() - launched < 1400 &&
        table.id !== "baize"
      ) {
        notedTopple = true;
        onNote?.(
          "Too gentle: without enough spin to hold it up, it just falls over. Flick it harder.",
        );
      }
    }
    // What the eye saw lingers a moment after it stops.
    if (trail > 0) {
      trail--;
      dirty = true;
    }

    // The camera drifts after the coin when it travels.
    const c = coinMiddle();
    // Gently while it spins on the spot, and harder the further it gets from the middle, so a
    // rolled coin stays in view.
    const off = Math.hypot(c[0] - target.x, c[1] - target.y) / cam.span;
    const follow = reduceMotion ? 1 : 1 - Math.exp(-dt * (2.2 + 60 * off));
    const dx = c[0] - target.x;
    const dy = c[1] - target.y;
    if (Math.abs(dx) + Math.abs(dy) > 0.01) {
      target.x += dx * follow;
      target.y += dy * follow;
      dirty = true;
    }
  };

  const render = () => {
    placeCamera();
    countSamples();
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, accumFb);
    gl.viewport(0, 0, width, height);
    // biome-ignore lint/correctness/useHookAtTopLevel: WebGL's useProgram, not a React hook.
    gl.useProgram(scene.program);
    gl.uniform2f(u.uRes, width, height);
    gl.uniform3fv(u.uEye, cam.eye);
    gl.uniform3fv(u.uRight, cam.right);
    gl.uniform3fv(u.uUp, cam.up);
    gl.uniform3fv(u.uFwd, cam.fwd);
    gl.uniform2f(u.uTan, cam.tanX, cam.tanY);
    gl.uniform4fv(u.uQ, poseQ);
    gl.uniform3fv(u.uC, poseC);
    gl.uniform1i(u.uPoseCount, POSES);
    gl.uniform1i(u.uSamples, samples);
    gl.uniform4f(u.uBound, bound.x, bound.y, bound.z, bound.r);
    const a = aMm();
    gl.uniform1f(u.uReach, a * 2.4);
    gl.uniform1f(u.uA, a);
    gl.uniform1f(u.uHH, coin.disc.thickness * 500);
    gl.uniform1f(u.uRho, coin.disc.edge * 1000);
    gl.uniform1f(u.uHole, coin.disc.hole > 0 ? coin.disc.hole * 1000 : -1e3);
    gl.uniform1i(u.uMetal, coin.metal);
    gl.uniform1f(u.uReeds, coin.reeds);
    gl.uniform1i(u.uFaces, coin.faces ? 1 : 0);
    gl.uniform1i(u.uSurface, table.surface);
    gl.uniform1f(u.uNight, night ? 1 : 0);
    const sun = unit([-0.62, 0.42, 0.66]);
    gl.uniform3fv(u.uSun, sun);
    const s = cam.span;
    const lamp: Vec = [target.x - s * 0.2, target.y + s * 0.42, s * 0.85];
    const toLamp: Vec = [lamp[0] - target.x, lamp[1] - target.y, lamp[2]];
    const lampDist = Math.hypot(...toLamp);
    gl.uniform3fv(u.uLamp, lamp);
    gl.uniform3fv(u.uLampDir, unit(toLamp));
    gl.uniform1f(u.uLampFall, lampDist * lampDist);
    gl.uniform1f(u.uLampSize, Math.atan((s * 0.08) / lampDist));
    gl.uniform1f(u.uFrame, frameNo % 4096);
    gl.uniform4f(
      u.uTraceRect,
      traceRect.x,
      traceRect.y,
      traceRect.size,
      settings.trace ? 1 : 0,
    );
    gl.uniform1i(u.uSlopes, 0);
    gl.uniform1i(u.uHeights, 1);
    gl.uniform1i(u.uTrace, 2);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, slopesTex);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, heightsTex);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, traceTex);
    if (traceDirty && settings.trace) {
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        trace,
      );
      traceDirty = false;
    }
    const panned =
      Math.hypot(target.x - lastTarget.x, target.y - lastTarget.y) > a * 0.01;
    lastTarget.x = target.x;
    lastTarget.y = target.y;
    if (!fresh && !panned && (mode !== "rest" || trail > 0)) {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.CONSTANT_ALPHA, gl.ONE_MINUS_CONSTANT_ALPHA);
      gl.blendColor(0, 0, 0, 0.5);
    }
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.disable(gl.BLEND);
    fresh = false;

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    // biome-ignore lint/correctness/useHookAtTopLevel: WebGL's useProgram, not a React hook.
    gl.useProgram(present.program);
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, accumTex);
    gl.uniform1i(present.u.uImage, 3);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  const statsNow = (): CoinStats => {
    const base = {
      tally: { ...tally() },
      showing,
      fps,
      lean: 0,
      laps: 0,
      spin: 0,
      face: 0,
    };
    if (mode === "rest") return { ...base, mode: "rest" };
    if (mode === "held")
      return { ...base, mode: "held", showing: null, lean: 90 };
    const m = measure(coin.disc, motion);
    const upright = m.lean > UPRIGHT;
    return {
      ...base,
      showing: null,
      mode: upright ? "upright" : "wobbling",
      lean: m.lean / DEG,
      laps: upright ? 0 : Math.abs(m.wobble) / (Math.PI * 2),
      spin: upright ? Math.abs(m.turn) / (Math.PI * 2) : 0,
      face: Math.abs(m.turn) / (Math.PI * 2),
    };
  };

  const loop = (now: number) => {
    if (disposed) return;
    raf = requestAnimationFrame(loop);
    const raw = (now - last) / 1000;
    const dt = clamp(raw, 0, 1 / 30);
    last = now;
    if (raw > 0 && raw < 0.1) interval += (raw - interval) * 0.05;
    resize();
    update(dt);
    if (dirty) {
      if (mode !== "rest") frameNo++;
      render();
      dirty = false;
      // Drop the resolution a little if the coin can't be kept moving smoothly.
      slowFrames =
        mode === "moving" && interval > 1 / 42
          ? slowFrames + 1
          : Math.max(0, slowFrames - 1);
      if (slowFrames > 90 && quality > 0.55) {
        quality *= 0.85;
        slowFrames = 0;
      }
    }
    if (now - statStamp > 120) {
      statStamp = now;
      fps = Math.round(1 / interval);
      onStats?.(statsNow());
    }
  };

  // ---- Input ----------------------------------------------------------------------------

  let pointer: {
    id: number;
    start: Point;
    last: Point;
    v: Point;
    moved: number;
  } | null = null;

  const holdUp = () => {
    const c = coinMiddle();
    const q0 = mode === "moving" ? motion.q : restQ;
    const facingCamera = showing !== "tails";
    stand.from = q0;
    stand.fromC = c;
    stand.t = reduceMotion ? 1 : 0;
    restQ = standingPose(facingCamera ? [0, -1, 0] : [0, 1, 0]);
    restC = [c[0], c[1], aMm()];
    mode = "held";
    dirty = true;
  };

  // A sideways flick in CSS px/s, as a spin rate.
  const flickRate = (vx: number) => {
    const s = project(coinMiddle()).scale * aMm();
    const radii = Math.abs(vx) / Math.max(s, 1);
    return clamp(radii * 4.5, 0, coin.flick * 1.6) * Math.sign(vx || 1);
  };

  const release = (v: Point, moved: number) => {
    sound.wake();
    const scale = project(coinMiddle()).scale;
    const speed = Math.hypot(v.x, v.y);
    const tap = moved < 6 || speed < 60;
    if (tap) {
      spinFrom(
        restQ,
        restC,
        coin.flick * rand(0.85, 1.1) * (Math.random() < 0.5 ? -1 : 1),
      );
      return;
    }
    if (Math.abs(v.y) > Math.abs(v.x) * 1.2) {
      // Screen up is away across the table; the table is foreshortened that way.
      const dir: Vec = [v.x / scale, -v.y / scale / Math.sin(ELEVATION), 0];
      const mmps = clamp(Math.hypot(dir[0], dir[1]) * 0.7, 60, 650);
      rollFrom(restC, dir, mmps);
      return;
    }
    spinFrom(restQ, restC, flickRate(v.x));
  };

  sound.setEnabled(settings.sound);
  strike(coin);
  resize();
  placeCamera();
  fillPoses(restQ, restC);
  raf = requestAnimationFrame(loop);

  return {
    setSettings(next: CoinSettings) {
      const prev = settings;
      settings = { ...next };
      sound.setEnabled(settings.sound);
      if (next.coin !== prev.coin) {
        coin = coinSpec(next.coin);
        strike(coin);
        const c = coinMiddle();
        sound.silence();
        layDown(true, rand(-0.6, 0.6), [c[0], c[1], 0]);
        fillPoses(restQ, restC);
        target.x = c[0];
        target.y = c[1];
      }
      if (next.table !== prev.table) table = tableSpec(next.table);
      if (next.trace !== prev.trace) traceDirty = true;
      dirty = true;
    },
    setNight(on: boolean) {
      night = on;
      dirty = true;
    },
    // A brisk flick from wherever it is.
    spin(strength = 1) {
      sound.wake();
      if (mode !== "held") holdUp();
      stand.t = 1;
      spinFrom(
        restQ,
        restC,
        coin.flick * strength * rand(0.9, 1.1) * (Math.random() < 0.5 ? -1 : 1),
      );
    },
    roll() {
      sound.wake();
      if (mode !== "held") holdUp();
      stand.t = 1;
      const angle = rand(-0.5, 0.5) + Math.PI / 2;
      rollFrom(restC, [Math.cos(angle), Math.sin(angle), 0], rand(220, 340));
    },
    slap() {
      sound.wake();
      if (mode === "moving") settle(false);
    },
    clearTally() {
      tallies.delete(coin.id);
      onStats?.(statsNow());
    },
    hover(p: Point) {
      if (mode === "moving") return onCoin(p) ? "pointer" : "default";
      return onCoin(p) ? "grab" : "default";
    },
    pointerDown(id: number, p: Point) {
      sound.wake();
      if (!onCoin(p)) return null;
      if (mode === "moving") {
        settle(false);
        return "default";
      }
      holdUp();
      pointer = { id, start: p, last: p, v: { x: 0, y: 0 }, moved: 0 };
      return "grabbing";
    },
    pointerMove(id: number, p: Point, dt: number) {
      if (!pointer || pointer.id !== id) return;
      const vx = (p.x - pointer.last.x) / dt;
      const vy = (p.y - pointer.last.y) / dt;
      // Smoothed over the last few moves, so the release speed is the flick, not one jitter.
      const k = Math.min(1, dt / 0.04);
      pointer.v = {
        x: pointer.v.x + (vx - pointer.v.x) * k,
        y: pointer.v.y + (vy - pointer.v.y) * k,
      };
      pointer.moved = Math.max(
        pointer.moved,
        Math.hypot(p.x - pointer.start.x, p.y - pointer.start.y),
      );
      pointer.last = p;
    },
    pointerUp(id: number, at: number) {
      if (!pointer || pointer.id !== id) return;
      // A finger that stopped before letting go has no flick left in it.
      const still = at > 0.09;
      const v = still ? { x: 0, y: 0 } : pointer.v;
      const moved = still && pointer.moved > 6 ? 7 : pointer.moved;
      pointer = null;
      if (mode !== "held") return;
      if (still && moved > 6) {
        // Stood up and let go without a flick: it just topples.
        spinFrom(restQ, restC, rand(-2, 2));
        return;
      }
      release(v, moved);
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      sound.dispose();
      const lose = gl.getExtension("WEBGL_lose_context");
      lose?.loseContext();
    },
  };
}
