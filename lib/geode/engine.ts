// A rough nodule on a trim saw's table. Turn it under the laser line, cut it, and the two halves
// open like a book to show what filled the cavity inside.
//
// The inside is one solid model, not a picture painted on the cut. Everything in a nodule was
// laid down from the cavity wall inwards, so each point inside is described by how far the
// filling had got when it reached there: bands of chalcedony following every bump of the wall,
// flat layers that settled across the floor (still level, so they say which way was up while it
// formed), then quartz, then in a geode a hollow that the crystals point into. The shader works
// that out wherever the saw's plane passes, so a cut anywhere through the stone shows a section
// consistent with every other, and the two faces of one cut are mirror images a kerf apart.
//
// The faces come off the saw wet with coolant, which is when they look best: a dry sawn face is
// covered in fine scratches that scatter white light, and water fills them, so the colours come
// up deep and glossy. As it dries the quartz goes first and the porous bands last. Polishing
// takes the scratches out for good. A thin slab held to a light box shows the opposite of the
// face: translucent bands glow, white ones go dull, and the rind stays black.

import { FS, VS } from "./shaders";
import { createSound } from "./sound";
import {
  cutMeetsCavity,
  makeStone,
  type Rgb,
  type SpecimenId,
  type Stone,
} from "./stones";

export type { SpecimenId } from "./stones";

export type DyeId = "none" | "blue" | "pink" | "green";
export type ViewId = "halves" | "slab";

export type GeodeSettings = {
  specimen: SpecimenId;
  dye: DyeId;
  view: ViewId;
  light: boolean;
  sound: boolean;
};

export const DEFAULT_SETTINGS: GeodeSettings = {
  specimen: "amethyst",
  dye: "none",
  view: "halves",
  light: true,
  sound: true,
};

export type Phase = "whole" | "cutting" | "opening" | "open";

export type GeodeStats = {
  phase: Phase;
  // Where the cut will go, from −1 to 1 across the stone.
  cut: number;
  polish: "sawn" | "polishing" | "polished";
  // How far the flat layers' up leans from upright on the left-hand face, in degrees, when the
  // stone has them.
  up: number | null;
  // Across its longest way, in centimetres.
  size: number;
  fps: number | null;
};

type Point = { x: number; y: number };
type Vec = [number, number, number];
type Mat3 = number[];
type Inner = Phase | "lifting";

// A unit is 4 cm. The bench is at y = −1; the blade is 20 cm across.
const UNIT_CM = 4;
const BENCH = -1;
const BLADE_R = 2.6;
const KERF = 0.033;
const CUT_TIME = 4.2;
const LIFT_TIME = 0.7;
const OPEN_TIME = 1.7;
const POLISH_TIME = 3.8;
// How far the halves turn in towards each other when they stand open.
const BOOK = (14 * Math.PI) / 180;
const SLAB = 0.1;

const DYES: Record<DyeId, Vec> = {
  none: [1, 1, 1],
  blue: [0.16, 0.42, 1.25],
  pink: [1.25, 0.24, 0.6],
  green: [0.22, 0.95, 0.4],
};

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const smooth = (t: number) => {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const toLinear = (c: Rgb): Vec => [c[0] ** 2.2, c[1] ** 2.2, c[2] ** 2.2];

const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec, b: Vec): Vec => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const add = (a: Vec, b: Vec): Vec => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a: Vec, s: number): Vec => [a[0] * s, a[1] * s, a[2] * s];
const norm = (a: Vec): Vec => scale(a, 1 / (Math.hypot(...a) || 1));
const mix3 = (a: Vec, b: Vec, t: number): Vec => [
  lerp(a[0], b[0], t),
  lerp(a[1], b[1], t),
  lerp(a[2], b[2], t),
];

// Rotations are row-major arrays of nine.
const mul = (a: Mat3, b: Mat3): Mat3 => {
  const o = new Array(9).fill(0);
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      o[r * 3 + c] =
        a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c];
    }
  }
  return o;
};
const apply = (m: Mat3, v: Vec): Vec => [
  m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
  m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
  m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
];
const row = (m: Mat3, r: number): Vec => [m[r * 3], m[r * 3 + 1], m[r * 3 + 2]];
const fromColumns = (a: Vec, b: Vec, c: Vec): Mat3 => [
  a[0],
  b[0],
  c[0],
  a[1],
  b[1],
  c[1],
  a[2],
  b[2],
  c[2],
];
const rotation = (axis: Vec, angle: number): Mat3 => {
  const [x, y, z] = norm(axis);
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const t = 1 - c;
  return [
    t * x * x + c,
    t * x * y - s * z,
    t * x * z + s * y,
    t * x * y + s * z,
    t * y * y + c,
    t * y * z - s * x,
    t * x * z - s * y,
    t * y * z + s * x,
    t * z * z + c,
  ];
};
// Keeps a rotation that's been turned many times from drifting out of true.
const orthonormal = (m: Mat3): Mat3 => {
  const a = norm(row(m, 0));
  const b = norm(sub(row(m, 1), scale(a, dot(a, row(m, 1)))));
  const c = cross(a, b);
  return [...a, ...b, ...c];
};
// The axis and angle of a rotation, to swing towards it a fraction at a time.
const axisAngle = (m: Mat3) => {
  const tr = m[0] + m[4] + m[8];
  let w: number;
  let x: number;
  let y: number;
  let z: number;
  if (tr > 0) {
    const s = Math.sqrt(tr + 1) * 2;
    w = 0.25 * s;
    x = (m[7] - m[5]) / s;
    y = (m[2] - m[6]) / s;
    z = (m[3] - m[1]) / s;
  } else if (m[0] > m[4] && m[0] > m[8]) {
    const s = Math.sqrt(1 + m[0] - m[4] - m[8]) * 2;
    w = (m[7] - m[5]) / s;
    x = 0.25 * s;
    y = (m[1] + m[3]) / s;
    z = (m[2] + m[6]) / s;
  } else if (m[4] > m[8]) {
    const s = Math.sqrt(1 + m[4] - m[0] - m[8]) * 2;
    w = (m[2] - m[6]) / s;
    x = (m[1] + m[3]) / s;
    y = 0.25 * s;
    z = (m[5] + m[7]) / s;
  } else {
    const s = Math.sqrt(1 + m[8] - m[0] - m[4]) * 2;
    w = (m[3] - m[1]) / s;
    x = (m[2] + m[6]) / s;
    y = (m[5] + m[7]) / s;
    z = 0.25 * s;
  }
  if (w < 0) {
    w = -w;
    x = -x;
    y = -y;
    z = -z;
  }
  const angle = 2 * Math.acos(clamp(w, -1, 1));
  const axis: Vec = Math.hypot(x, y, z) > 1e-6 ? norm([x, y, z]) : [0, 1, 0];
  return { axis, angle };
};
const partial = (m: Mat3, t: number) => {
  const { axis, angle } = axisAngle(m);
  return rotation(axis, angle * t);
};
const randomRotation = () =>
  rotation(
    norm([Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5]),
    Math.random() * Math.PI * 2,
  );

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
  const cache = new Map<string, WebGLUniformLocation | null>();
  const u = (name: string) => {
    if (!cache.has(name)) cache.set(name, gl.getUniformLocation(program, name));
    return cache.get(name) ?? null;
  };
  return { program, u };
}

// The light by day is a window up to the left; in the evening a lamp up to the right, warmer
// and harder.
const LIGHTS = {
  day: {
    dir: norm([-0.5, 0.78, 0.55]),
    color: [1.7, 1.64, 1.55] as Vec,
    sky: [0.3, 0.33, 0.38] as Vec,
    ground: [0.15, 0.14, 0.13] as Vec,
    bench: toLinear([0.79, 0.78, 0.75]),
    shadowK: 7,
  },
  night: {
    dir: norm([0.55, 0.8, 0.38]),
    color: [2.5, 1.95, 1.4] as Vec,
    sky: [0.03, 0.034, 0.045] as Vec,
    ground: [0.016, 0.015, 0.014] as Vec,
    bench: toLinear([0.12, 0.118, 0.115]),
    shadowK: 16,
  },
};

type Camera = {
  yaw: number;
  pitch: number;
  dist: number;
  target: Vec;
  w: number;
  h: number;
};

export type Geode = ReturnType<typeof createGeode>;

export function createGeode(
  canvas: HTMLCanvasElement,
  {
    onStats,
    onNote,
  }: {
    onStats?: (stats: GeodeStats) => void;
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

  const sound = createSound();
  let settings: GeodeSettings = { ...DEFAULT_SETTINGS };
  let night = false;
  let dirty = true;
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---- The view -----------------------------------------------------------------------------

  let width = 0;
  let height = 0;
  let cssW = 0;
  let cssH = 0;
  let pxScale = 1;
  // A tall stage lays the halves face up, one above the other, rather than standing them side
  // by side too small to see.
  let flat = false;

  const resize = () => {
    const cw = Math.max(1, canvas.clientWidth);
    const ch = Math.max(1, canvas.clientHeight);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const s = Math.min(Math.max(dpr, 1), Math.sqrt(1.6e6 / (cw * ch)));
    const w = Math.max(1, Math.round(cw * s));
    const h = Math.max(1, Math.round(ch * s));
    if (w === width && h === height && cw === cssW && ch === cssH) return;
    width = w;
    height = h;
    cssW = cw;
    cssH = ch;
    pxScale = s;
    canvas.width = w;
    canvas.height = h;
    flat = cw / ch < 0.9;
    dirty = true;
  };

  // ---- The stone ----------------------------------------------------------------------------

  let stone: Stone = makeStone(settings.specimen, Math.random());
  let R: Mat3 = randomRotation();
  let cutFrac = 0;
  let phase: Inner = "whole";
  let phaseT = 0;
  // The stone as it was when cut: its turn and centre, the cut's plane in the stone's own frame
  // and the world's up and across in that frame too.
  let cutR: Mat3 = R;
  let cutP: Vec = [0, 0, 0];
  let cutXw = 0;
  let nObj: Vec = [1, 0, 0];
  let cObj = 0;
  let upObj: Vec = [0, 1, 0];
  let acrossObj: Vec = [0, 0, 1];
  let meets = true;
  let up: number | null = null;
  // The halves, turned by hand.
  let yaw = 0;
  let pitch = 0;
  let slabRot = -0.12;
  let finish = 0;
  let polishing = false;
  let time = 0;
  let wetAt = -1e4;
  let wetAll = 0;
  let spin = 0;
  let spinSpeed = 0;
  let notes: { at: number; text: string }[] = [];

  const radius = () => Math.max(...stone.radii);
  // How far the stone reaches along a world axis, turned as it is.
  const extent = (m: Mat3, axis: number) =>
    Math.hypot(
      m[axis * 3] * stone.radii[0],
      m[axis * 3 + 1] * stone.radii[1],
      m[axis * 3 + 2] * stone.radii[2],
    ) +
    stone.spec.rough[0] * 0.4;
  const wholeP = (): Vec => [0, BENCH + extent(R, 1) - 0.02, 0];
  const cutLimit = () => Math.max(0.1, extent(R, 0) - 0.24);
  const cutX = () => cutFrac * cutLimit();
  const bladeRest = () => wholeP()[1] + extent(R, 1) + 0.25 + BLADE_R;
  const bladeLow = BENCH - 0.03 + BLADE_R;

  const say = (text: string, delay = 0) => {
    if (delay <= 0) onNote?.(text);
    else notes.push({ at: time + delay, text });
  };

  const freshStone = (id: SpecimenId) => {
    stone = makeStone(id, Math.random());
    R = randomRotation();
    cutFrac = 0;
    phase = "whole";
    phaseT = 0;
    yaw = 0;
    pitch = 0;
    finish = 0;
    polishing = false;
    wetAt = -1e4;
    wetAll = 0;
    up = null;
    notes = [];
    sound.sawStop();
    sound.lapStop();
    dirty = true;
  };

  // ---- Where the pieces are -------------------------------------------------------------------

  type Piece = { R: Mat3; P: Vec; clip: number[] };

  const openEase = () =>
    phase === "open" ? 1 : phase === "opening" ? smooth(phaseT / OPEN_TIME) : 0;

  // Turns the face's outward normal at the cut to where it should face, and the world's up at
  // the cut to the face's up.
  const finalTurn = (side: 1 | -1): Mat3 => {
    const n: Vec = flat
      ? [0, 1, 0]
      : [side * Math.sin(BOOK), 0, Math.cos(BOOK)];
    const v: Vec = flat ? [0, 0, -1] : [0, 1, 0];
    return fromColumns(scale(n, side), v, scale(cross(n, v), side));
  };

  const byHand = (): Mat3 =>
    flat
      ? mul(rotation([1, 0, 0], pitch), rotation([0, 0, 1], -yaw))
      : mul(rotation([0, 1, 0], yaw), rotation([1, 0, 0], pitch));

  const pieces = (): Piece[] => {
    if (phase === "whole" || phase === "cutting") {
      return [{ R, P: wholeP(), clip: [1, 0, 0, 100] }];
    }
    const e = openEase();
    const face: Vec = [cutXw, cutP[1], cutP[2]];
    const out: Piece[] = [];
    for (const side of [1, -1] as const) {
      const turn = mul(byHand(), finalTurn(side));
      const q = partial(turn, e);
      let target: Vec;
      if (flat) {
        const depth =
          side === 1
            ? cutXw + extent(cutR, 0) - 0.1
            : extent(cutR, 0) - cutXw - 0.1;
        target = [0, BENCH + depth, side === 1 ? -radius() * 1.08 : radius()];
      } else {
        target = [side === 1 ? -radius() * 1.12 : radius() * 1.12, face[1], 0];
      }
      const lift = Math.sin(Math.PI * e) * (flat ? 0.9 : 0.15);
      const t = add(mix3(face, target, e), [0, lift, 0]);
      out.push({
        R: mul(q, cutR),
        P: add(t, apply(q, sub(cutP, face))),
        clip:
          side === 1
            ? [...nObj, cObj - KERF]
            : [-nObj[0], -nObj[1], -nObj[2], -(cObj + KERF)],
      });
    }
    return out;
  };

  const cameraFor = (which: "whole" | "book" | "flat"): Camera => {
    if (which === "whole") {
      return {
        yaw: 0.34,
        pitch: 0.3,
        dist: 6.4,
        target: [0, BENCH + 0.85, 0],
        w: 1.6,
        h: 1.45,
      };
    }
    if (which === "book") {
      return {
        yaw: 0,
        pitch: 0.14,
        dist: 7,
        target: [0, cutP[1] - 0.02, 0],
        w: 2.4,
        h: 1.25,
      };
    }
    return {
      yaw: 0,
      pitch: 1.12,
      dist: 7.2,
      target: [0, BENCH + 0.5, 0],
      w: 1.3,
      h: 2.4,
    };
  };

  const camera = () => {
    const a = cameraFor("whole");
    const b = cameraFor(flat ? "flat" : "book");
    const e = openEase();
    const c: Camera = {
      yaw: lerp(a.yaw, b.yaw, e),
      pitch: lerp(a.pitch, b.pitch, e),
      dist: lerp(a.dist, b.dist, e),
      target: mix3(a.target, b.target, e),
      w: lerp(a.w, b.w, e),
      h: lerp(a.h, b.h, e),
    };
    const dir: Vec = [
      Math.sin(c.yaw) * Math.cos(c.pitch),
      Math.sin(c.pitch),
      Math.cos(c.yaw) * Math.cos(c.pitch),
    ];
    const eye = add(c.target, scale(dir, c.dist));
    const f = norm(sub(c.target, eye));
    const r = norm(cross(f, [0, 1, 0]));
    const upv = cross(r, f);
    const aspect = cssW / cssH;
    const focal = Math.min(c.dist / c.h, (c.dist * aspect) / c.w);
    return { eye, f, r, u: upv, focal };
  };

  // A point in the world to CSS pixels on the stage.
  const project = (p: Vec) => {
    const cam = camera();
    const v = sub(p, cam.eye);
    const z = dot(v, cam.f);
    const x = (dot(v, cam.r) / z) * cam.focal;
    const y = (dot(v, cam.u) / z) * cam.focal;
    return {
      x: (x * cssH) / 2 + cssW / 2,
      y: cssH / 2 - (y * cssH) / 2,
      z,
    };
  };

  // ---- Drawing --------------------------------------------------------------------------------

  const bladeY = () => {
    if (phase === "cutting") {
      const k = phaseT / CUT_TIME;
      // Down to the stone quickly, steadily through it.
      const touch = 0.12;
      const top = bladeRest();
      if (k < touch) return lerp(top, top - 0.25, smooth(k / touch));
      return lerp(top - 0.25, bladeLow, (k - touch) / (1 - touch));
    }
    if (phase === "lifting") {
      return lerp(bladeLow, bladeRest() + 1.6, smooth(phaseT / LIFT_TIME));
    }
    return bladeRest();
  };

  const uploadStone = () => {
    const s = stone;
    const spec = s.spec;
    gl.uniform3fv(u("uRadii"), s.radii);
    const sv: Vec = [
      (s.seed * 97.3) % 41,
      (s.seed * 61.7) % 37,
      (s.seed * 43.1) % 29,
    ];
    gl.uniform3fv(u("uSeedV"), sv);
    gl.uniform1f(u("uSeed"), (s.seed * 1000) % 97);
    gl.uniform3fv(u("uRough"), spec.rough);
    const blobs = new Float32Array(32);
    blobs.set(s.blobs.slice(0, 32));
    gl.uniform4fv(u("uBlobs"), blobs);
    gl.uniform1i(u("uBlobN"), s.blobCount);
    gl.uniform1f(u("uBlobK"), s.blobK);
    const arms = new Float32Array(24);
    arms.set(s.arms.slice(0, 24));
    gl.uniform4fv(u("uArms"), arms);
    gl.uniform1i(u("uArmN"), s.armCount);
    gl.uniform1f(u("uBotry"), spec.botryoidal);
    gl.uniform4fv(u("uZones"), s.zones);
    gl.uniform1f(u("uCrystals"), spec.crystals);
    const total = spec.bands.reduce((sum, b) => sum + b.weight, 0);
    const cols = new Float32Array(15);
    const props = new Float32Array(15);
    const mean: Vec = [0, 0, 0];
    let meanT = 0;
    let meanP = 0;
    let cumulative = 0;
    spec.bands.forEach((b, i) => {
      const c = toLinear(b.color);
      cols.set(c, i * 3);
      cumulative += b.weight / total;
      props.set([b.trans, b.porosity, i === 4 ? 1 : cumulative], i * 3);
      const w = b.weight / total;
      mean[0] += c[0] * w;
      mean[1] += c[1] * w;
      mean[2] += c[2] * w;
      meanT += b.trans * w;
      meanP += b.porosity * w;
    });
    gl.uniform3fv(u("uBandCol"), cols);
    gl.uniform3fv(u("uBandProp"), props);
    gl.uniform3fv(u("uBandMean"), mean);
    gl.uniform2f(u("uBandMeanTP"), meanT, meanP);
    gl.uniform3fv(u("uBandFreq"), spec.bandFreq);
    gl.uniform3fv(u("uSkin0"), toLinear(spec.skin[0]));
    gl.uniform3fv(u("uSkin1"), toLinear(spec.skin[1]));
    gl.uniform3fv(u("uHost"), toLinear(spec.host));
    gl.uniform3fv(u("uWallSkin"), toLinear(spec.wallSkin));
    gl.uniform1f(u("uRind"), spec.rind);
    gl.uniform3fv(u("uQuartzCol"), toLinear(spec.quartz));
    gl.uniform3fv(u("uTipCol"), toLinear(spec.tip));
    gl.uniform1f(u("uStain"), spec.stain);
    gl.uniform1f(
      u("uBound"),
      radius() + spec.rough[0] + spec.rough[1] + spec.rough[2] + 0.05,
    );
  };

  const render = () => {
    gl.viewport(0, 0, width, height);
    // biome-ignore lint/correctness/useHookAtTopLevel: WebGL's useProgram, not a React hook.
    gl.useProgram(scene.program);
    uploadStone();
    const light = night ? LIGHTS.night : LIGHTS.day;
    gl.uniform2f(u("uRes"), width, height);
    const cam = camera();
    gl.uniform3fv(u("uEye"), cam.eye);
    gl.uniform3fv(u("uCamF"), cam.f);
    gl.uniform3fv(u("uCamR"), cam.r);
    gl.uniform3fv(u("uCamU"), cam.u);
    gl.uniform1f(u("uFocal"), cam.focal);
    const slab = settings.view === "slab" && phase === "open";
    gl.uniform1i(u("uMode"), slab ? 1 : 0);

    const ps = pieces();
    gl.uniform1i(u("uPieces"), ps.length);
    const inv = new Float32Array(18);
    const pos = new Float32Array(6);
    const clip = new Float32Array(8);
    ps.forEach((p, i) => {
      // Row-major R read as column-major is its transpose: world to object.
      inv.set(p.R, i * 9);
      pos.set(p.P, i * 3);
      clip.set(p.clip, i * 4);
    });
    if (ps.length === 1) {
      inv.set(ps[0].R, 9);
      pos.set(ps[0].P, 3);
      clip.set(ps[0].clip, 4);
    }
    gl.uniformMatrix3fv(u("uInv"), false, inv);
    gl.uniform3fv(u("uPos"), pos);
    gl.uniform4fv(u("uClip"), clip);

    const bladeOn =
      phase === "whole" || phase === "cutting" || phase === "lifting";
    gl.uniform4f(
      u("uBlade"),
      phase === "whole" ? cutX() : cutXw,
      bladeY(),
      0,
      BLADE_R,
    );
    gl.uniform1f(u("uKerfOn"), phase === "cutting" ? 1 : 0);
    gl.uniform1f(u("uBladeOn"), bladeOn ? 1 : 0);
    gl.uniform1f(u("uSpin"), spin);
    gl.uniform1f(u("uSpinBlur"), clamp(spinSpeed, 0, 1));
    gl.uniform1f(u("uLaser"), phase === "whole" ? 1 : 0);
    gl.uniform1f(u("uBench"), BENCH);
    gl.uniform1f(u("uSlot"), 1 - openEase());

    gl.uniform1f(u("uTime"), time);
    gl.uniform1f(u("uWetAt"), wetAt);
    gl.uniform1f(u("uWetAll"), wetAll);
    gl.uniform1f(u("uFinish"), finish);
    gl.uniform3fv(u("uMarkV"), upObj);
    gl.uniform3fv(u("uMarkU"), acrossObj);
    gl.uniform1f(u("uMarkR"), BLADE_R);
    gl.uniform3fv(u("uDye"), DYES[settings.dye]);
    gl.uniform1f(u("uDyeOn"), settings.dye === "none" ? 0 : 1);

    gl.uniform3fv(u("uLightDir"), light.dir);
    gl.uniform3fv(u("uLightCol"), light.color);
    gl.uniform3fv(u("uSky"), light.sky);
    gl.uniform3fv(u("uGround"), light.ground);
    gl.uniform3fv(u("uBenchCol"), light.bench);
    const lit = add(scale(light.color, light.dir[1]), light.sky);
    gl.uniform3fv(u("uBackdrop"), [
      light.bench[0] * lit[0],
      light.bench[1] * lit[1],
      light.bench[2] * lit[2],
    ]);
    gl.uniform1f(u("uNight"), night ? 1 : 0);
    gl.uniform1f(u("uShadowK"), light.shadowK);

    // The slab: the first 4 mm of the right-hand half, seen from the cut side.
    const across = cross(upObj, nObj);
    gl.uniform3fv(u("uSlabN"), nObj);
    gl.uniform1f(u("uSlabD"), cObj + KERF + 0.004);
    gl.uniform3fv(u("uSlabU"), scale(across, -1));
    gl.uniform3fv(u("uSlabV"), upObj);
    gl.uniform2f(u("uSlabC"), width / 2, height / 2);
    const short = Math.min(width, height);
    gl.uniform1f(u("uSlabScale"), (2.25 * radius()) / (0.8 * short));
    gl.uniform1f(u("uSlabRot"), slabRot);
    gl.uniform1f(u("uLightOn"), settings.light ? 1 : 0);
    gl.uniform1f(u("uThick"), SLAB);
    gl.uniform4f(
      u("uBox"),
      Math.min(width, height * 1.35) * 0.44,
      Math.min(height, width * 1.1) * 0.42,
      14 * pxScale,
      9 * pxScale,
    );

    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  // ---- Time -------------------------------------------------------------------------------------

  const polishNotes = [
    { at: 0, text: "80 grit on the lap takes out the saw marks…" },
    {
      at: 0.3,
      text: "…then 220, 600 and 1200, each taking out the last one's scratches…",
    },
    { at: 0.68, text: "…and cerium oxide on felt brings up the shine." },
  ];

  const opened = () => {
    sound.clack(1);
    if (!meets) {
      say(
        "The cut missed the cavity: rind and host rock all the way through. Cut nearer the middle next time.",
      );
      return;
    }
    say(
      "Straight off the saw, wet with coolant, is when it looks its best. Watch the colour go as the faces dry.",
    );
    let second = "";
    if (stone.level && up !== null && Math.abs(nObj[1]) > 0.96) {
      second =
        "This cut ran almost level with the flat layers, so they show as one broad patch rather than stripes.";
    } else if (stone.level && up !== null) {
      const lean = Math.round(Math.abs(up));
      second =
        lean < 4
          ? "The flat layers settled level as they formed, and it sat on the saw nearly the way it grew: they're still almost level."
          : lean > 150
            ? "The flat layers settled level as they formed, so they still show which way was up: this one sat on the saw almost upside down."
            : `The flat layers settled level as they formed, so they still show which way was up: ${lean}° to the ${up > 0 ? "right" : "left"} of how it sat on the saw.`;
    } else if (stone.dud) {
      second =
        "Solid quartz to the middle: a dud. Most are, which is why geodes are sold uncut and cracked open in hope.";
    } else if (stone.hollow) {
      second =
        "Every crystal points inwards: they grew from the walls into the space that was left, and the last of the growth is the darkest.";
    } else if (stone.spec.id === "fortification") {
      second =
        "Each band follows every bump of the band before it, so the corners of the wall carry on inwards like the plan of a star fort.";
    }
    if (second) say(second, 9);
    say(
      "The two faces are mirror images: until the blade went through they were one plane, 2.6 mm apart.",
      18,
    );
  };

  const update = (dt: number) => {
    time += dt;
    const sawing = phase === "cutting" || phase === "lifting";
    spinSpeed = lerp(spinSpeed, sawing ? 1 : 0, 1 - Math.exp(-dt * 4));
    if (spinSpeed > 0.002) {
      spin += dt * spinSpeed * 40;
      dirty = true;
    }

    if (phase === "cutting") {
      phaseT += dt * (reduceMotion ? 6 : 1);
      wetAt = time;
      wetAll = 0;
      const bottom = bladeY() - BLADE_R;
      const p = wholeP();
      const top = p[1] + extent(R, 1);
      const inStone = bottom < top && bottom > BENCH - 0.02;
      const middle = 1 - Math.abs(bottom - p[1]) / extent(R, 1);
      sound.sawLoad(inStone ? 1 : 0, clamp(middle, 0, 1));
      if (phaseT >= CUT_TIME) {
        phase = "lifting";
        phaseT = 0;
        wetAt = time;
        sound.sawStop();
        sound.clack(0.4);
      }
      dirty = true;
    } else if (phase === "lifting") {
      phaseT += dt * (reduceMotion ? 6 : 1);
      if (phaseT >= LIFT_TIME) {
        phase = "opening";
        phaseT = 0;
      }
      dirty = true;
    } else if (phase === "opening") {
      phaseT += reduceMotion ? OPEN_TIME : dt;
      if (phaseT >= OPEN_TIME) {
        phase = "open";
        phaseT = 0;
        opened();
      }
      dirty = true;
    }

    if (polishing) {
      const before = finish;
      finish = reduceMotion ? 1 : Math.min(1, finish + dt / POLISH_TIME);
      for (const n of polishNotes) {
        if (before <= n.at && finish > n.at) say(n.text);
      }
      sound.lapGrit(finish);
      if (finish >= 1) {
        polishing = false;
        sound.lapStop();
        say(
          "Polished, it looks wet for good: the polish does what the water did.",
        );
      }
      dirty = true;
    }

    // While anything is drying, keep drawing.
    if (time - wetAt < 32) dirty = true;

    const due = notes.filter((n) => n.at <= time);
    if (due.length) {
      notes = notes.filter((n) => n.at > time);
      onNote?.(due[due.length - 1].text);
    }
  };

  let raf = 0;
  let last = performance.now();
  let fpsStamp = last;
  let statStamp = last;
  let drawStamp = 0;
  let frames = 0;
  let fps: number | null = null;
  let disposed = false;

  const stats = (): GeodeStats => ({
    phase: phase === "lifting" ? "cutting" : phase,
    cut: cutFrac,
    polish: polishing ? "polishing" : finish >= 1 ? "polished" : "sawn",
    up: stone.level && phase === "open" ? up : null,
    size: radius() * 2 * UNIT_CM,
    fps,
  });

  const loop = (stamp: number) => {
    if (disposed) return;
    raf = requestAnimationFrame(loop);
    const dt = clamp((stamp - last) / 1000, 0, 0.05);
    last = stamp;
    resize();
    update(dt);
    // Drying alone is slow, so it's drawn at 30 frames a second.
    const onlyDrying =
      phase === "open" && !polishing && spinSpeed < 0.002 && !dragging;
    if (dirty && (!onlyDrying || stamp - drawStamp > 33 || needNow)) {
      render();
      frames++;
      drawStamp = stamp;
      dirty = false;
      needNow = false;
    }
    if (stamp - fpsStamp > 1000) {
      fps = frames ? Math.round((frames * 1000) / (stamp - fpsStamp)) : fps;
      frames = 0;
      fpsStamp = stamp;
    }
    if (stamp - statStamp > 200) {
      statStamp = stamp;
      onStats?.(stats());
    }
  };

  // ---- Hands ------------------------------------------------------------------------------------

  type Grip =
    | { kind: "turn"; last: Point }
    | { kind: "line"; last: Point }
    | { kind: "tilt"; last: Point }
    | { kind: "slab"; last: Point };
  let grip: Grip | null = null;
  let dragging = false;
  let needNow = false;

  const onStone = (at: Point) => {
    const p = wholeP();
    const c = project(p);
    const edge = project(add(p, scale(camera().r, radius())));
    const r = Math.hypot(edge.x - c.x, edge.y - c.y);
    return Math.hypot(at.x - c.x, at.y - c.y) < r * 1.1;
  };

  // How far the pointer is from the laser line across the stone, in CSS pixels.
  const fromLine = (at: Point) => {
    const p = wholeP();
    const ey = extent(R, 1);
    const ez = extent(R, 2);
    let best = Number.POSITIVE_INFINITY;
    let prev: { x: number; y: number } | null = null;
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      // Over the top of the stone, from the back to the front.
      const a = Math.PI * t;
      const q = project([
        cutX(),
        p[1] + Math.sin(a) * ey * 0.9,
        -Math.cos(a) * ez * 0.9,
      ]);
      if (prev) {
        const dx = q.x - prev.x;
        const dy = q.y - prev.y;
        const l2 = dx * dx + dy * dy || 1;
        const s = clamp(
          ((at.x - prev.x) * dx + (at.y - prev.y) * dy) / l2,
          0,
          1,
        );
        best = Math.min(
          best,
          Math.hypot(at.x - (prev.x + dx * s), at.y - (prev.y + dy * s)),
        );
      }
      prev = q;
    }
    return best;
  };

  const turnStone = (dx: number, dy: number) => {
    const cam = camera();
    const turn = mul(
      rotation([0, 1, 0], dx * 0.011),
      rotation(cam.r, dy * 0.011),
    );
    R = orthonormal(mul(turn, R));
    dirty = true;
  };

  render();
  raf = requestAnimationFrame(loop);

  return {
    setSettings(next: GeodeSettings) {
      const prev = settings;
      settings = { ...next };
      sound.setEnabled(next.sound);
      if (next.specimen !== prev.specimen) freshStone(next.specimen);
      if (next.dye !== prev.dye && next.dye !== "none" && phase === "open") {
        say(
          "Three weeks in a dye bath: only the porous bands take it up, so the quartz and the densest bands stay as they were.",
        );
      }
      if (next.view !== prev.view && next.view === "slab" && phase === "open") {
        say(
          stone.hollow
            ? "A 4 mm slab on a light box: the translucent bands glow, white ones go dull, the rind stays black and the hollow lets the light straight through."
            : "A 4 mm slab on a light box: the translucent bands glow, white ones go dull and the rind stays black.",
        );
      }
      if (next.light !== prev.light) sound.click();
      dirty = true;
    },
    setNight(on: boolean) {
      night = on;
      dirty = true;
      needNow = true;
    },
    setCut(frac: number) {
      if (phase !== "whole") return;
      cutFrac = clamp(frac, -1, 1);
      dirty = true;
    },
    cut() {
      if (phase !== "whole") return;
      cutR = R;
      cutP = wholeP();
      cutXw = cutX();
      nObj = row(R, 0);
      upObj = row(R, 1);
      acrossObj = row(R, 2);
      cObj = cutXw - cutP[0];
      meets = cutMeetsCavity(stone, nObj, cObj);
      // Where the flat layers' up points on the left-hand face, seen from outside it.
      const across = cross(upObj, nObj);
      up = (Math.atan2(across[1], upObj[1]) * 180) / Math.PI;
      phase = "cutting";
      phaseT = 0;
      yaw = 0;
      pitch = 0;
      finish = 0;
      notes = [];
      sound.sawStart();
      dirty = true;
    },
    another() {
      freshStone(settings.specimen);
    },
    spray() {
      wetAt = time;
      wetAll = 1;
      sound.spray();
      dirty = true;
      if (phase !== "open") return;
      say(
        finish >= 1
          ? "A polished face hardly changes when it's wet: the polish already does what the water does."
          : "The quartz dries first; water stays longest in the porous bands and the rind.",
        finish >= 1 ? 0 : 6,
      );
    },
    polish() {
      if (phase !== "open" || polishing || finish >= 1) return;
      polishing = true;
      sound.lapStart();
      dirty = true;
    },
    nudge(dx: number, dy: number) {
      if (phase === "whole") turnStone(dx * 12, dy * 12);
      else if (phase === "open") {
        yaw = clamp(yaw + dx * 0.08, -0.7, 0.7);
        pitch = clamp(pitch + dy * 0.08, -0.6, 0.6);
        dirty = true;
      }
    },
    pointerDown(_id: number, at: Point): string | null {
      if (phase === "whole") {
        if (fromLine(at) < 14) {
          grip = { kind: "line", last: at };
          dragging = true;
          return "ew-resize";
        }
        if (onStone(at)) {
          grip = { kind: "turn", last: at };
          dragging = true;
          return "grabbing";
        }
        return null;
      }
      if (phase === "open") {
        grip =
          settings.view === "slab"
            ? { kind: "slab", last: at }
            : { kind: "tilt", last: at };
        dragging = true;
        return "grabbing";
      }
      return null;
    },
    pointerMove(_id: number, at: Point) {
      if (!grip) return;
      const dx = at.x - grip.last.x;
      const dy = at.y - grip.last.y;
      grip.last = at;
      if (grip.kind === "turn") {
        turnStone(dx, dy);
      } else if (grip.kind === "line") {
        const p = wholeP();
        const a = project([cutX(), p[1], 0]);
        const b = project([cutX() + 0.1, p[1], 0]);
        const perUnit = Math.max(1, Math.abs(b.x - a.x) / 0.1);
        cutFrac = clamp(cutFrac + dx / perUnit / cutLimit(), -1, 1);
        dirty = true;
      } else if (grip.kind === "tilt") {
        yaw = clamp(yaw + dx * 0.006, -0.7, 0.7);
        pitch = clamp(pitch + dy * 0.006, -0.6, 0.6);
        dirty = true;
      } else {
        slabRot += dx * 0.006;
        dirty = true;
      }
      needNow = true;
    },
    pointerUp(_id: number) {
      grip = null;
      dragging = false;
    },
    hover(at: Point) {
      if (phase === "whole") {
        if (fromLine(at) < 14) return "ew-resize";
        if (onStone(at)) return "grab";
        return "default";
      }
      return phase === "open" ? "grab" : "default";
    },
    // For checking: the current state, without waiting for a stats tick.
    stats,
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      sound.dispose();
      gl.deleteBuffer(triangle);
      gl.deleteVertexArray(vao);
    },
  };
}
