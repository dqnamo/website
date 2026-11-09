// A zip, close up. Two tapes run down the middle of the fabric, each a string of teeth, and a
// slider rides on them: going up, its Y-shaped channel brings the two rows together so they
// lock; going down, the diamond in its throat prises them apart. That's all a zip is, and
// everything here follows from it.
//
// Each tape is a chain of points, one per tooth, simulated with position-based dynamics: the
// tape doesn't stretch more than a little, resists bending in its own plane, and is pulled
// outward by the fabric (more so the fuller the thing it closes). Pairs of teeth are either
// locked or not, and only the slider changes that, except where the fabric pulls harder than a
// pair can hold: a coil can burst, and the teeth a worn slider has closed come apart again
// behind it. The same pull is what pushes an unlocked slider back down the teeth by itself.
//
// The pull hangs from a bridge on the slider and turns about it in 3D. Gravity lays it flat
// against the slider, which is what lets an auto-lock slider's pin drop between the teeth; it
// swings, flips over to show its back as you zip up, and clinks when it falls. The sound is
// the teeth going by: see sound.ts.

import { ATLAS_HEIGHT, ATLAS_WIDTH, drawAtlas } from "./atlas";
import {
  FABRICS,
  type Fabric,
  INSIDES,
  type Inside,
  type SliderKind,
  SLIDERS,
  spread,
  TEETH,
  type Teeth,
  type TeethSpec,
  WEAK,
} from "./parts";
import {
  BLUR_FRAGMENT,
  INSIDE_FRAGMENT,
  MASK_FRAGMENT,
  PANEL_FRAGMENT,
  PANEL_VERTEX,
  PART_FRAGMENT,
  PART_VERTEX,
  PULL_FRAGMENT,
  PULL_VERTEX,
  SCREEN_VERTEX,
  TOOTH_FRAGMENT,
  TOOTH_VERTEX,
} from "./shaders";
import { type Click, createRattle } from "./sound";

export type ZipSettings = {
  teeth: Teeth;
  slider: SliderKind;
  fabric: Fabric;
  inside: Inside;
  // 0–100: how hard what's inside pushes the zip apart.
  fullness: number;
  sound: boolean;
};

export const DEFAULT_SETTINGS: ZipSettings = {
  teeth: "metal",
  slider: "autolock",
  fabric: "waxed",
  inside: "pocket",
  fullness: INSIDES.pocket.fullness,
  sound: true,
};

export type ZipStats = {
  // Share of the pairs of teeth that are locked together, 0–1.
  closed: number;
  // Where the slider is, 0 at the top stop to 1 at the bottom.
  open: number;
  // Teeth past the slider per second, which is the note it sings.
  hertz: number;
  locked: boolean;
  fps: number | null;
};

type Point = { x: number; y: number };

// The stage shows this many millimetres top to bottom; the zip runs between these.
const VIEW = 128;
const FIRST_TOOTH = -55;
const LAST_TOOTH = 33;
const MAX_PIXELS = 4.2e6;

// The tapes: how strongly the fabric pulls on them (per second squared), how much they can
// stretch, how stiffly they bend in their own plane, and how fast motion dies away.
const FABRIC_PULL = 900;
const ALONG_PULL = 320;
const HAND_PULL = 2200;
const HOLD = 2600;
const GRAB_REACH = 12;
const STRETCH = 0.035;
const BEND = 0.28;
const DAMPING = 0.88;
const SUBSTEPS = 3;
const ITERATIONS = 10;

// The panels: tape this wide moves with it rigidly, and the cloth beyond takes up the movement
// over about this distance.
const RIGID = 7;
const TAKE_UP = 24;
const ROW = 1.2;

// The pull: gravity over the distance to its centre of mass, and how high its hinge sits.
const SWING = 9810 / 11;
const HINGE_HEIGHT = 3.2;
const PULL_THICKNESS = 1.3;
// Its hinge stands above the teeth, so flipped right over it can't lie quite flat.
const FLIPPED = Math.PI - 0.14;

type Tape = {
  x: Float32Array;
  y: Float32Array;
  ox: Float32Array;
  oy: Float32Array;
  // Where each point was when the fabric beside it was grabbed.
  gx: Float32Array;
  gy: Float32Array;
  free: Float32Array;
};

type Chain = {
  spec: TeethSpec;
  pitch: number;
  half: number;
  count: number;
  first: number;
  last: number;
  // Rest position along the zip of each left tooth; each right one is half a pitch lower.
  v: Float32Array;
  tapes: [Tape, Tape];
  meshed: Uint8Array;
  strength: Float32Array;
  load: Float32Array;
  topStop: number;
  bottomStop: number;
  // The slider: its length, how far its shoulder reaches above the point where pairs lock and
  // its throat below, and the limits of that point set by the stops.
  length: number;
  up: number;
  down: number;
  sMin: number;
  sMax: number;
  toothLength: number;
  toothWidth: number;
};

function buildChain(spec: TeethSpec): Chain {
  const pitch = spec.pitch;
  const teeth = Math.floor((LAST_TOOTH - FIRST_TOOTH) / pitch) + 1;
  const first = 2;
  const last = first + teeth - 1;
  const count = last + 3;
  const half = spec.chain / 2;
  const v = new Float32Array(count);
  for (let k = 0; k < count; k++) v[k] = FIRST_TOOTH + (k - first) * pitch;
  const tape = (side: number): Tape => {
    const x = new Float32Array(count);
    const y = new Float32Array(count);
    for (let k = 0; k < count; k++) {
      x[k] = (side ? 1 : -1) * half;
      y[k] = v[k] + (side * pitch) / 2;
    }
    return {
      x,
      y,
      ox: x.slice(),
      oy: y.slice(),
      gx: x.slice(),
      gy: y.slice(),
      free: new Float32Array(count),
    };
  };
  const length = spec.slider.length;
  const up = length * 0.62;
  const down = length * 0.38;
  const topStop = v[first] - pitch * 0.95;
  const bottomStop = v[last] + pitch * 1.15;
  return {
    spec,
    pitch,
    half,
    count,
    first,
    last,
    v,
    tapes: [tape(0), tape(1)],
    meshed: new Uint8Array(count),
    strength: new Float32Array(count).fill(spec.strength),
    load: new Float32Array(count),
    topStop,
    bottomStop,
    length,
    up,
    down,
    sMin: topStop + 1.3 + up,
    sMax: bottomStop - 1.5 - down,
    toothLength: spec.chain * (spec.value === "coil" ? 0.84 : 0.8),
    toothWidth: pitch * (spec.value === "moulded" ? 0.52 : 0.5),
  };
}

type Program = {
  program: WebGLProgram;
  loc: (name: string) => WebGLUniformLocation | null;
};

type Hand =
  | { kind: "pull"; id: number; reach: number; at: Point }
  | { kind: "slider"; id: number; offset: number; at: Point }
  | { kind: "auto"; goal: number; speed: number; v: number };

type Grab = { id: number; side: 0 | 1; start: Point; at: Point };

const clamp = (v: number, lo: number, hi: number) =>
  v < lo ? lo : v > hi ? hi : v;
const smoothstep = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

function normalise(x: number, y: number, z: number): [number, number, number] {
  const l = Math.hypot(x, y, z) || 1;
  return [x / l, y / l, z / l];
}

const DAY_LIGHT = normalise(-0.42, -0.55, 0.72);
const LAMP_LIGHT = normalise(-0.55, -0.34, 0.76);

export function createZip(
  canvas: HTMLCanvasElement,
  {
    onStats,
    onNote,
  }: {
    onStats?: (stats: ZipStats) => void;
    onNote?: (note: string) => void;
  } = {},
) {
  const context = canvas.getContext("webgl2", {
    alpha: false,
    antialias: true,
    depth: false,
    premultipliedAlpha: true,
    powerPreference: "high-performance",
  });
  if (!context) throw new Error("WebGL2 is not available.");
  const gl = context;

  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const rattle = createRattle();

  let settings: ZipSettings = { ...DEFAULT_SETTINGS };
  let chain = buildChain(TEETH[settings.teeth]);
  let S = chain.sMin;
  let sliderVelocity = 0;
  let sliderAcceleration = 0;
  let squash = 0;
  for (let k = chain.first; k <= chain.last; k++) {
    chain.meshed[k] = chain.v[k] + chain.pitch / 4 > S ? 1 : 0;
  }

  // The pull: flipped through phi about the bridge (0 hanging flat, pi flipped up flat), and
  // swung through psi in the plane of the fabric.
  let phi = 0;
  let phiVelocity = 0;
  let psi = 0;
  let psiVelocity = 0;
  let backShown = 0;

  let hand: Hand | null = null;
  let grab: Grab | null = null;
  let hertz = 0;
  let creepTravel = 0;
  let night = document.documentElement.classList.contains("dark") ? 1 : 0;
  let nightTarget = night;

  // Layout, in CSS pixels, and millimetres to pixels.
  let width = 0;
  let height = 0;
  let ratio = 1;
  let scale = 1;
  let deviceWidth = 1;
  let deviceHeight = 1;
  let viewWidth = 1;
  let viewHeight = 1;

  const noted = new Set<string>();
  function note(key: string, text: string) {
    if (noted.has(key)) return;
    noted.add(key);
    onNote?.(text);
  }

  // GL objects, made again if the context is lost and comes back.
  let lost = false;
  let programs: Record<string, Program> = {};
  let panelArray: WebGLVertexArrayObject | null = null;
  let panelBuffer: WebGLBuffer | null = null;
  let panelIndex: WebGLBuffer | null = null;
  let panelIndexCount = 0;
  let toothArray: WebGLVertexArrayObject | null = null;
  let toothBuffer: WebGLBuffer | null = null;
  let emptyArray: WebGLVertexArrayObject | null = null;
  let atlas: WebGLTexture | null = null;
  let masks: { texture: WebGLTexture; framebuffer: WebGLFramebuffer }[] = [];
  let maskWidth = 1;
  let maskHeight = 1;
  const atlasCanvas = document.createElement("canvas");

  // The panels' mesh: rows down the zip, columns out from the teeth.
  let rowV: number[] = [];
  let colU: number[] = [];
  let panelData = new Float32Array(0);
  const toothData = new Float32Array(2 * 64 * 6);
  let toothCount = 0;

  function compile(type: number, source: string) {
    const shader = gl.createShader(type);
    if (!shader) throw new Error("Couldn't make a shader.");
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error(`Shader didn't compile: ${log}`);
    }
    return shader;
  }

  function makeProgram(vertex: string, fragment: string): Program {
    const program = gl.createProgram();
    if (!program) throw new Error("Couldn't make a program.");
    const vs = compile(gl.VERTEX_SHADER, vertex);
    const fs = compile(gl.FRAGMENT_SHADER, fragment);
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(`Program didn't link: ${gl.getProgramInfoLog(program)}`);
    }
    const cache = new Map<string, WebGLUniformLocation | null>();
    return {
      program,
      loc(name) {
        if (!cache.has(name))
          cache.set(name, gl.getUniformLocation(program, name));
        return cache.get(name) ?? null;
      },
    };
  }

  function makeMask() {
    const texture = gl.createTexture();
    const framebuffer = gl.createFramebuffer();
    if (!texture || !framebuffer) throw new Error("Couldn't make a mask.");
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.R8,
      maskWidth,
      maskHeight,
      0,
      gl.RED,
      gl.UNSIGNED_BYTE,
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
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { texture, framebuffer };
  }

  function sizeMasks() {
    for (const mask of masks) {
      gl.deleteTexture(mask.texture);
      gl.deleteFramebuffer(mask.framebuffer);
    }
    maskWidth = Math.max(1, Math.ceil(deviceWidth / 4));
    maskHeight = Math.max(1, Math.ceil(deviceHeight / 4));
    masks = [makeMask(), makeMask()];
  }

  function uploadAtlas() {
    if (!atlas) return;
    drawAtlas(atlasCanvas, FABRICS[settings.fabric]);
    gl.bindTexture(gl.TEXTURE_2D, atlas);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      atlasCanvas,
    );
    gl.generateMipmap(gl.TEXTURE_2D);
  }

  function setupGl() {
    programs = {
      inside: makeProgram(SCREEN_VERTEX, INSIDE_FRAGMENT),
      blur: makeProgram(SCREEN_VERTEX, BLUR_FRAGMENT),
      panel: makeProgram(PANEL_VERTEX, PANEL_FRAGMENT),
      mask: makeProgram(PANEL_VERTEX, MASK_FRAGMENT),
      tooth: makeProgram(TOOTH_VERTEX, TOOTH_FRAGMENT),
      part: makeProgram(PART_VERTEX, PART_FRAGMENT),
      pull: makeProgram(PULL_VERTEX, PULL_FRAGMENT),
    };
    emptyArray = gl.createVertexArray();

    panelArray = gl.createVertexArray();
    panelBuffer = gl.createBuffer();
    panelIndex = gl.createBuffer();
    gl.bindVertexArray(panelArray);
    gl.bindBuffer(gl.ARRAY_BUFFER, panelBuffer);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, panelIndex);
    // The panel and mask programs share a vertex shader whose attributes have fixed places.
    const stride = 8 * 4;
    const attribute = (location: number, size: number, offset: number) => {
      gl.enableVertexAttribArray(location);
      gl.vertexAttribPointer(
        location,
        size,
        gl.FLOAT,
        false,
        stride,
        offset * 4,
      );
    };
    attribute(0, 2, 0);
    attribute(1, 2, 2);
    attribute(2, 1, 4);
    attribute(3, 2, 5);
    attribute(4, 1, 7);

    toothArray = gl.createVertexArray();
    toothBuffer = gl.createBuffer();
    gl.bindVertexArray(toothArray);
    gl.bindBuffer(gl.ARRAY_BUFFER, toothBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, toothData.byteLength, gl.DYNAMIC_DRAW);
    const toothAttribute = (name: string, size: number, offset: number) => {
      const location = gl.getAttribLocation(programs.tooth.program, name);
      if (location < 0) return;
      gl.enableVertexAttribArray(location);
      gl.vertexAttribPointer(
        location,
        size,
        gl.FLOAT,
        false,
        6 * 4,
        offset * 4,
      );
      gl.vertexAttribDivisor(location, 1);
    };
    toothAttribute("aRoot", 2, 0);
    toothAttribute("aDir", 2, 2);
    toothAttribute("aInfo", 2, 4);
    gl.bindVertexArray(null);

    atlas = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, atlas);
    gl.texParameteri(
      gl.TEXTURE_2D,
      gl.TEXTURE_MIN_FILTER,
      gl.LINEAR_MIPMAP_LINEAR,
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      ATLAS_WIDTH,
      ATLAS_HEIGHT,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      null,
    );
    uploadAtlas();
    sizeMasks();
    layoutMesh();
  }

  // Rows every ROW mm over the view, and columns finer near the teeth, where the detail is.
  function layoutMesh() {
    if (!panelIndex) return;
    const top = -viewHeight / 2 - 4;
    const rows = Math.ceil((viewHeight + 8) / ROW) + 1;
    rowV = Array.from({ length: rows }, (_, r) => top + r * ROW);
    const half = chain.half;
    colU = [-half - 0.02, -half / 2, 0];
    let u = 0;
    let step = 0.5;
    while (u < viewWidth / 2 + 12) {
      u += step;
      colU.push(u);
      if (u >= 4) step = Math.min(step * 1.3, 30);
    }
    const cols = colU.length;
    panelData = new Float32Array(2 * rows * cols * 8);
    const indices = new Uint16Array(2 * (rows - 1) * (cols - 1) * 6);
    let i = 0;
    for (let s = 0; s < 2; s++) {
      const base = s * rows * cols;
      for (let r = 0; r < rows - 1; r++) {
        for (let c = 0; c < cols - 1; c++) {
          const a = base + r * cols + c;
          const b = a + 1;
          const d = a + cols;
          const e = d + 1;
          indices.set([a, d, b, b, d, e], i);
          i += 6;
        }
      }
    }
    panelIndexCount = i;
    gl.bindVertexArray(panelArray);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, panelIndex);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, panelBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, panelData.byteLength, gl.DYNAMIC_DRAW);
    gl.bindVertexArray(null);
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
    scale = Math.min(height / VIEW, width / 60);
    viewWidth = width / scale;
    viewHeight = height / scale;
    const w = Math.max(1, Math.round(width * ratio));
    const h = Math.max(1, Math.round(height * ratio));
    if (w === deviceWidth && h === deviceHeight && masks.length) return;
    deviceWidth = w;
    deviceHeight = h;
    canvas.width = w;
    canvas.height = h;
    if (!lost && programs.panel) {
      sizeMasks();
      layoutMesh();
    }
  }

  function toWorld(p: Point): Point {
    return { x: (p.x - width / 2) / scale, y: (p.y - height / 2) / scale };
  }

  // --- The slider and its pull -------------------------------------------------------------

  const sliderCentre = () => S - chain.length * 0.12;
  const pivotY = () => sliderCentre() + chain.length * 0.5 * 0.45;
  const spreadNow = () => spread(settings.fullness);
  const slider = () => SLIDERS[settings.slider];

  function pullFrame() {
    const cp = Math.cos(phi);
    const sp = Math.sin(phi);
    const cs = Math.cos(psi);
    const ss = Math.sin(psi);
    return {
      w: [cs, ss, 0] as const,
      l: [-ss * cp, cs * cp, sp] as const,
      n: [ss * sp, -cs * sp, cp] as const,
    };
  }

  // Where on the pull a point is, in the pull's own millimetres: across it and along it.
  function onPull(q: Point) {
    const { w } = pullFrame();
    const c =
      Math.sign(Math.cos(phi) || 1) * Math.max(Math.abs(Math.cos(phi)), 0.12);
    const lx = -Math.sin(psi) * c;
    const ly = Math.cos(psi) * c;
    const dx = q.x;
    const dy = q.y - pivotY();
    const det = w[0] * ly - w[1] * lx;
    return {
      a: (dx * ly - dy * lx) / det,
      b: (w[0] * dy - w[1] * dx) / det,
    };
  }

  function hitPull(q: Point) {
    const { a, b } = onPull(q);
    const spec = chain.spec.pull;
    return Math.abs(a) < spec.width / 2 + 3 && b > -4 && b < spec.length + 3;
  }

  function hitSlider(q: Point) {
    const top = S - chain.up;
    const bottom = S + chain.down;
    return (
      Math.abs(q.x) < chain.spec.slider.shoulder / 2 + 2.5 &&
      q.y > top - 2 &&
      q.y < bottom + 2
    );
  }

  function locked() {
    return slider().locks && !hand && (phi < 0.35 || phi > Math.PI - 0.35);
  }

  // How hard the fabric is pushing outward on the teeth inside the slider, in mm of pull. The
  // channel walls slope, so that push drives the slider towards open.
  function wedgeLoad() {
    const D = spreadNow();
    let sum = 0;
    let n = 0;
    for (let s = 0; s < 2; s++) {
      const tape = chain.tapes[s];
      const sx = s ? 1 : -1;
      for (let k = chain.first; k <= chain.last; k++) {
        const va = chain.v[k] + (s * chain.pitch) / 2;
        if (va < S - chain.up || va > S + chain.down) continue;
        sum +=
          D +
          sx * (sx * chain.half - tape.x[k]) +
          Math.max(handLoad(0, k), handLoad(1, k));
        n++;
      }
    }
    return n ? sum / n : 0;
  }

  // The extra outward pull from a hand tugging the fabric beside point k, in mm of fabric
  // pull. The cloth on the far side pulls back as hard, so the pair feels all of it.
  function handLoad(s: number, k: number) {
    if (!grab || grab.side !== s) return 0;
    const sx = s ? 1 : -1;
    const va = chain.v[k] + (s * chain.pitch) / 2;
    const w = Math.exp(-(((va - grab.start.y) / GRAB_REACH) ** 2));
    return (HAND_PULL / FABRIC_PULL) * w * Math.max(sx * grabDelta().x, 0);
  }

  function grabDelta(): Point {
    if (!grab) return { x: 0, y: 0 };
    let dx = grab.at.x - grab.start.x;
    let dy = grab.at.y - grab.start.y;
    const l = Math.hypot(dx, dy);
    if (l > 26) {
      dx *= 26 / l;
      dy *= 26 / l;
    }
    return { x: dx, y: dy };
  }

  function moveSlider(dt: number, clicks: Click[]) {
    const before = S;
    const pitch = chain.pitch;
    let target = S;
    let driven = false;
    if (hand?.kind === "pull") {
      driven = true;
      const q = toWorld(hand.at);
      const dx = q.x;
      const dy = q.y - pivotY();
      const dist = Math.hypot(dx, dy);
      if (dist > hand.reach) {
        const rise = Math.sqrt(Math.max(hand.reach ** 2 - dx * dx, 0));
        const pivot = q.y - Math.sign(dy) * rise;
        target = pivot - (pivotY() - S);
      }
    } else if (hand?.kind === "slider") {
      driven = true;
      target = toWorld(hand.at).y - hand.offset;
    } else if (hand?.kind === "auto") {
      driven = true;
      const remaining = hand.goal - S;
      const speed = reduceMotion.matches ? hand.speed * 2 : hand.speed;
      hand.v = Math.min(speed, hand.v + speed * dt * 5);
      const slow = Math.min(1, Math.abs(remaining) / 6 + 0.2);
      target =
        S +
        Math.sign(remaining) *
          Math.min(Math.abs(remaining), hand.v * slow * dt);
      if (
        Math.abs(remaining) < 0.05 ||
        (S <= chain.sMin && remaining < 0) ||
        (S >= chain.sMax && remaining > 0)
      ) {
        hand = null;
      }
    }

    if (driven) {
      // Closing has to pull the rows together against the fabric, so the fuller it is the
      // harder it goes.
      const closing = target < S;
      const cap = closing ? 1500 / (1 + spreadNow() / 12) : 1600;
      const want = (target - S) * (1 - Math.exp(-dt * 45));
      S += clamp(want, -cap * dt, cap * dt);
      creepTravel = 0;
    } else if (!locked()) {
      const push = wedgeLoad();
      const grip = slider().grip;
      if (push > grip) {
        const was = S;
        S += (push - grip) * 1.6 * dt;
        creepTravel += S - was;
        if (creepTravel > pitch * 2) {
          note(
            "creep",
            "With nothing locking it, the fabric pushing outward drives the slider back down the teeth on its own. It's how flies come undone.",
          );
        }
      }
    } else if (slider().locks && wedgeLoad() > slider().grip + 3) {
      note(
        "hold",
        "The pull is lying flat, so the locking pin is down between the teeth and the slider won't budge. Lift the pull and it slides.",
      );
    }

    // Arriving at a stop knocks against it.
    const stopped = clamp(S, chain.sMin, chain.sMax);
    if (
      stopped !== S &&
      before !== chain.sMin &&
      before !== chain.sMax &&
      Math.abs(sliderVelocity) > 40
    ) {
      clicks.push({
        at: 0.9,
        kind: "stop",
        level: Math.min(1, Math.abs(sliderVelocity) / 500),
      });
    }
    S = stopped;

    const velocity = (S - before) / Math.max(dt, 1e-4);
    sliderAcceleration = (velocity - sliderVelocity) / Math.max(dt, 1e-4);
    sliderVelocity = velocity;

    if (S === before) return 0;
    // Every tooth that passes the slider's diamond knocks once; every pair that passes locks
    // (going up) or is prised apart (going down).
    const closing = S < before;
    const from = Math.min(before, S);
    const to = Math.max(before, S);
    const speed = Math.abs(velocity);
    let teeth = 0;
    for (let k = chain.first; k <= chain.last; k++) {
      for (let s = 0; s < 2; s++) {
        const at = chain.v[k] + (s * pitch) / 2;
        if (at > from && at <= to) {
          const pair = chain.meshed[k];
          const quiet = closing ? 1 : pair ? 1 : 0.6;
          clicks.push({
            at: (at - before) / (S - before),
            kind: "tooth",
            level: (0.45 + 0.55 * Math.min(1, speed / 160)) * quiet,
          });
          teeth++;
        }
      }
      const vp = chain.v[k] + pitch / 4;
      if (vp > from && vp <= to) {
        if (closing) {
          chain.meshed[k] = 1;
          chain.strength[k] =
            settings.slider === "worn" ? WEAK : chain.spec.strength;
        } else {
          chain.meshed[k] = 0;
        }
      }
    }
    return teeth;
  }

  function movePull(dt: number, clicks: Click[]) {
    const n = 3;
    const h = dt / n;
    const tilt = (INSIDES[settings.inside].tilt * Math.PI) / 180;
    const calm = reduceMotion.matches;
    let held = false;
    let phiTarget = phi;
    let psiTarget = psi;
    if (hand?.kind === "pull") {
      held = true;
      const q = toWorld(hand.at);
      const dx = q.x;
      const dy = q.y - pivotY();
      const dist = Math.hypot(dx, dy);
      // Pointing back up past the hinge flips the pull over; a few millimetres either way
      // keeps it from flapping.
      const up = dy < -2 || (dy < 2 && phi > Math.PI / 2);
      const c = Math.min(dist / hand.reach, 1);
      phiTarget = Math.min(up ? Math.acos(-c) : Math.acos(c), FLIPPED);
      psiTarget = clamp(
        Math.atan2(up ? dx : -dx, Math.abs(dy) + 0.001),
        -0.65,
        0.65,
      );
    } else if (hand?.kind === "auto") {
      held = true;
      const closing = hand.goal < S;
      phiTarget = closing ? Math.PI - 0.4 : 0.5;
      psiTarget = 0;
    }
    const gy = clamp(Math.sin(tilt) - sliderAcceleration / 9810, -1.5, 2.5);
    const gz = Math.cos(tilt);
    for (let i = 0; i < n; i++) {
      let accel: number;
      let swing: number;
      if (held) {
        const w = 30;
        accel = w * w * (phiTarget - phi) - 2 * w * phiVelocity;
        swing = w * w * (psiTarget - psi) - 2 * w * psiVelocity;
      } else {
        const flat = phi < 0.15 || phi > Math.PI - 0.15;
        accel =
          -SWING * (gy * Math.sin(phi) + gz * Math.cos(phi)) -
          (calm ? 24 : 3) * phiVelocity;
        swing =
          -SWING * 0.6 * gy * Math.cos(phi) * Math.sin(psi) -
          (flat ? 14 : calm ? 20 : 3.5) * psiVelocity;
      }
      phiVelocity += accel * h;
      psiVelocity += swing * h;
      phi += phiVelocity * h;
      psi += psiVelocity * h;
      const bounce = calm ? 0 : 0.3;
      if (phi < 0) {
        phi = 0;
        if (phiVelocity < 0) {
          if (phiVelocity < -1.5) {
            clicks.push({
              at: (i + 1) / n,
              kind: "clink",
              level: Math.min(1, -phiVelocity / 14),
            });
          }
          phiVelocity = -phiVelocity * bounce;
        }
      } else if (phi > FLIPPED) {
        phi = FLIPPED;
        if (phiVelocity > 0) {
          if (phiVelocity > 1.5) {
            clicks.push({
              at: (i + 1) / n,
              kind: "clink",
              level: Math.min(1, phiVelocity / 14),
            });
          }
          phiVelocity = -phiVelocity * bounce;
        }
      }
      if (Math.abs(psi) > 0.7) {
        psi = Math.sign(psi) * 0.7;
        psiVelocity *= -0.3;
      }
    }
    if (Math.cos(phi) < -0.5) {
      backShown += dt;
      if (backShown > 0.6) {
        note(
          "back",
          "That's the back of the pull. No 5 is the zip's size: about how many millimetres across the teeth are once they're closed.",
        );
      }
    } else {
      backShown = 0;
    }
  }

  // --- The tapes -------------------------------------------------------------------------------

  function moveTapes(dt: number) {
    const h = dt / SUBSTEPS;
    const pitch = chain.pitch;
    const half = chain.half;
    const D = spreadNow();
    const delta = grabDelta();
    const shoulder = S - chain.up;
    const throat = S + chain.down;
    const splay = 1.5;

    for (let s = 0; s < 2; s++) {
      const tape = chain.tapes[s];
      for (let k = 0; k < chain.count; k++) {
        const va = chain.v[k] + (s * pitch) / 2;
        const pinned = k < chain.first || k >= chain.last;
        const held = va >= shoulder && va <= throat;
        tape.free[k] = pinned || held ? 0 : 1;
      }
    }

    for (let sub = 0; sub < SUBSTEPS; sub++) {
      for (let s = 0; s < 2; s++) {
        const tape = chain.tapes[s];
        const sx = s ? 1 : -1;
        const grabbed = grab && grab.side === s;
        for (let k = 0; k < chain.count; k++) {
          if (!tape.free[k]) continue;
          const va = chain.v[k] + (s * pitch) / 2;
          const x = tape.x[k];
          const y = tape.y[k];
          let fx = FABRIC_PULL * (sx * (half + D) - x);
          let fy = ALONG_PULL * (va - y);
          // A closed run is held where it is by the garment either side of it.
          if (k >= chain.first && k <= chain.last && chain.meshed[k]) {
            fx += HOLD * (sx * half - x);
          }
          if (grabbed && grab) {
            const w = Math.exp(-(((va - grab.start.y) / GRAB_REACH) ** 2));
            fx += HAND_PULL * w * (tape.gx[k] + delta.x - x);
            fy += HAND_PULL * w * (tape.gy[k] + delta.y - y);
          }
          const vx = (x - tape.ox[k]) * DAMPING;
          const vy = (y - tape.oy[k]) * DAMPING;
          tape.ox[k] = x;
          tape.oy[k] = y;
          tape.x[k] = x + vx + fx * h * h;
          tape.y[k] = y + vy + fy * h * h;
        }
      }

      for (let iteration = 0; iteration < ITERATIONS; iteration++) {
        for (let s = 0; s < 2; s++) {
          const tape = chain.tapes[s];
          const { x, y, free } = tape;
          // The tape stretches a little but no more.
          for (let k = 0; k < chain.count - 1; k++) {
            const wa = free[k];
            const wb = free[k + 1];
            if (!wa && !wb) continue;
            const dx = x[k + 1] - x[k];
            const dy = y[k + 1] - y[k];
            const d = Math.hypot(dx, dy) || 1e-6;
            const goal =
              d > pitch * (1 + STRETCH)
                ? pitch * (1 + STRETCH)
                : d < pitch
                  ? pitch
                  : d;
            if (goal === d) continue;
            const c = (d - goal) / d / (wa + wb);
            x[k] += dx * c * wa;
            y[k] += dy * c * wa;
            x[k + 1] -= dx * c * wb;
            y[k + 1] -= dy * c * wb;
          }
          // And it's stiff in its own plane: two apart, points keep their distance.
          for (let k = 0; k < chain.count - 2; k++) {
            const wa = free[k];
            const wb = free[k + 2];
            if (!wa && !wb) continue;
            const dx = x[k + 2] - x[k];
            const dy = y[k + 2] - y[k];
            const d = Math.hypot(dx, dy) || 1e-6;
            const goal = pitch * 2;
            if (d >= goal) continue;
            const c = ((d - goal) / d / (wa + wb)) * BEND;
            x[k] += dx * c * wa;
            y[k] += dy * c * wa;
            x[k + 2] -= dx * c * wb;
            y[k + 2] -= dy * c * wb;
          }
        }
        // Locked pairs hold each other at the chain's width, the right tooth half a pitch
        // below the left.
        const L = chain.tapes[0];
        const R = chain.tapes[1];
        for (let k = chain.first; k <= chain.last; k++) {
          if (!chain.meshed[k]) continue;
          const wl = L.free[k];
          const wr = R.free[k];
          if (wl && wr) {
            const cx = (L.x[k] + R.x[k]) / 2;
            const cy = (L.y[k] + R.y[k]) / 2;
            L.x[k] = cx - half;
            L.y[k] = cy - pitch / 4;
            R.x[k] = cx + half;
            R.y[k] = cy + pitch / 4;
          } else if (wl) {
            L.x[k] = R.x[k] - 2 * half;
            L.y[k] = R.y[k] - pitch / 2;
          } else if (wr) {
            R.x[k] = L.x[k] + 2 * half;
            R.y[k] = L.y[k] + pitch / 2;
          }
        }
        // The slider holds whatever's in it to its channel, and the ends are sewn down.
        for (let s = 0; s < 2; s++) {
          const tape = chain.tapes[s];
          const sx = s ? 1 : -1;
          for (let k = 0; k < chain.count; k++) {
            if (tape.free[k]) continue;
            const va = chain.v[k] + (s * pitch) / 2;
            if (k < chain.first || k >= chain.last) {
              tape.x[k] = sx * half;
              tape.y[k] = va;
            } else {
              const t = va < S ? (S - va) / chain.up : 0;
              tape.x[k] = sx * (half + splay * smoothstep(0, 1, t));
              tape.y[k] = va;
            }
          }
        }
      }
    }
  }

  // Pairs pulled harder than they hold let go: one at the edge of an open stretch, or just out
  // of the slider, goes first; one in the middle of a closed run needs far more.
  function popTeeth(clicks: Click[]) {
    const D = spreadNow();
    const throat = S + chain.down;
    let pops = 0;
    let firstBelow = -1;
    for (let k = chain.first; k <= chain.last; k++) {
      if (chain.v[k] + chain.pitch / 4 > throat) {
        firstBelow = k;
        break;
      }
    }
    for (let k = chain.first; k <= chain.last && pops < 2; k++) {
      const vp = chain.v[k] + chain.pitch / 4;
      const L = chain.tapes[0];
      const R = chain.tapes[1];
      const load = D + Math.max(handLoad(0, k), handLoad(1, k));
      chain.load[k] = load;
      if (!chain.meshed[k] || vp <= throat || vp > chain.sMax) continue;
      if (!L.free[k] || !R.free[k]) continue;
      const strength = chain.strength[k];
      if (!Number.isFinite(strength)) {
        if (load > 30) {
          note(
            "strong",
            chain.spec.value === "metal"
              ? "Metal teeth hook over each other and won't come apart sideways; the cloth would tear first."
              : "Moulded teeth lock solid. Tug as hard as you like.",
          );
        }
        continue;
      }
      const edge =
        k === firstBelow ||
        !chain.meshed[k - 1] ||
        (k < chain.last && !chain.meshed[k + 1]);
      if (load > (edge ? strength : strength * 1.8)) {
        chain.meshed[k] = 0;
        pops++;
        clicks.push({
          at: Math.random(),
          kind: "pop",
          level: Math.min(1, 0.4 + (load - strength) / strength),
        });
        if (strength === WEAK) {
          note(
            "worn",
            "The worn slider's jaws have opened a fraction, so the teeth went through without locking and part again behind it. Squeeze it with pliers, then run it down and back up.",
          );
        } else {
          note(
            "burst",
            "Coil zips can burst under strain. Run the slider down past the split and back up, and it closes again good as new.",
          );
        }
      }
    }
  }

  // --- Drawing -----------------------------------------------------------------------------

  function buildPanels() {
    const pitch = chain.pitch;
    const half = chain.half;
    const rows = rowV.length;
    const cols = colU.length;
    const delta = grabDelta();
    let o = 0;
    for (let s = 0; s < 2; s++) {
      const tape = chain.tapes[s];
      const sx = s ? 1 : -1;
      const v0 = chain.v[0] + (s * pitch) / 2;
      for (let r = 0; r < rows; r++) {
        const v = rowV[r];
        const t = (v - v0) / pitch;
        let rx = sx * half;
        let ry = v;
        let nx = sx;
        let ny = 0;
        if (t > 0 && t < chain.count - 1) {
          const k = Math.floor(t);
          const f = t - k;
          rx = tape.x[k] + (tape.x[k + 1] - tape.x[k]) * f;
          ry = tape.y[k] + (tape.y[k + 1] - tape.y[k]) * f;
          const k0 = Math.max(k - 1, 0);
          const k2 = Math.min(k + 2, chain.count - 1);
          const ax = tape.x[k + 1] - tape.x[k0];
          const ay = tape.y[k + 1] - tape.y[k0];
          const bx = tape.x[k2] - tape.x[k];
          const by = tape.y[k2] - tape.y[k];
          let tx = ax + (bx - ax) * f;
          let ty = ay + (by - ay) * f;
          const l = Math.hypot(tx, ty) || 1;
          tx /= l;
          ty /= l;
          nx = sx * ty;
          ny = -sx * tx;
        }
        const lateral = Math.max(sx * (rx - sx * half), 0);
        const dispX = rx + nx * RIGID - sx * (half + RIGID);
        const dispY = ry + ny * RIGID - v;
        for (let c = 0; c < cols; c++) {
          const u = colU[c];
          let px: number;
          let py: number;
          if (u <= RIGID) {
            px = rx + nx * u;
            py = ry + ny * u;
          } else {
            const f = Math.exp(-(u - RIGID) / TAKE_UP);
            px = sx * (half + u) + dispX * f;
            py = v + dispY * f;
          }
          const restX = sx * (half + u);
          if (grab && grab.side === s) {
            const gx = restX - grab.start.x;
            const gy = v - grab.start.y;
            const g = Math.exp(-(gx * gx + gy * gy) / (2 * 14 * 14));
            const ramp = smoothstep(2, 14, u);
            px += delta.x * g * ramp;
            py += delta.y * g * ramp;
          }
          // An open edge tips down into the gap a little.
          const curl =
            u > 3 ? ((0.3 * lateral) / 6) * Math.exp(-(u - 3) / 6) : 0;
          panelData[o++] = px;
          panelData[o++] = py;
          panelData[o++] = restX;
          panelData[o++] = v;
          panelData[o++] = u;
          panelData[o++] = curl * nx;
          panelData[o++] = curl * ny;
          panelData[o++] = sx;
        }
      }
    }
  }

  function buildTeeth() {
    let o = 0;
    let n = 0;
    for (let s = 0; s < 2; s++) {
      const tape = chain.tapes[s];
      const sx = s ? 1 : -1;
      for (let k = chain.first; k <= chain.last; k++) {
        const tx = tape.x[k + 1] - tape.x[k - 1];
        const ty = tape.y[k + 1] - tape.y[k - 1];
        const l = Math.hypot(tx, ty) || 1;
        toothData[o++] = tape.x[k];
        toothData[o++] = tape.y[k];
        toothData[o++] = (-sx * ty) / l;
        toothData[o++] = (sx * tx) / l;
        toothData[o++] = (k * 13.37 + s * 5.1) % 1;
        toothData[o++] = sx;
        n++;
      }
    }
    toothCount = n;
  }

  // Starts drawing with a program, setting the view and the light it shares with the others.
  function begin(program: Program) {
    // biome-ignore lint/correctness/useHookAtTopLevel: WebGL's useProgram, not a React hook.
    gl.useProgram(program.program);
    const t = night;
    const light = normalise(
      DAY_LIGHT[0] + (LAMP_LIGHT[0] - DAY_LIGHT[0]) * t,
      DAY_LIGHT[1] + (LAMP_LIGHT[1] - DAY_LIGHT[1]) * t,
      DAY_LIGHT[2] + (LAMP_LIGHT[2] - DAY_LIGHT[2]) * t,
    );
    gl.uniform4f(program.loc("uView"), 2 / viewWidth, -2 / viewHeight, 0, 0);
    gl.uniform1f(program.loc("uPx"), 1 / (scale * ratio));
    gl.uniform3f(program.loc("uLight"), light[0], light[1], light[2]);
    gl.uniform3f(
      program.loc("uLightColour"),
      1.02 + (1.12 - 1.02) * t,
      1.0 + (0.8 - 1.0) * t,
      0.96 + (0.56 - 0.96) * t,
    );
    gl.uniform3f(
      program.loc("uAmbient"),
      0.38 + (0.05 - 0.38) * t,
      0.4 + (0.055 - 0.4) * t,
      0.44 + (0.08 - 0.44) * t,
    );
    gl.uniform1f(program.loc("uNight"), t);
    gl.uniform2f(program.loc("uLamp"), -30, -38);
    return light;
  }

  function render() {
    if (!programs.panel || !masks.length) return;
    buildPanels();
    buildTeeth();
    const fabric = FABRICS[settings.fabric];
    const teethSpec = chain.spec;
    const half = chain.half;
    const windowTop = chain.topStop - 3;
    const windowBottom = chain.bottomStop + 3.2;
    const windowHalfWidth = half + 3;

    gl.bindBuffer(gl.ARRAY_BUFFER, panelBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, panelData);
    gl.bindBuffer(gl.ARRAY_BUFFER, toothBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, toothData, 0, toothCount * 6);

    // The cover of the fabric, blurred, for the shadows inside.
    gl.disable(gl.BLEND);
    gl.bindFramebuffer(gl.FRAMEBUFFER, masks[0].framebuffer);
    gl.viewport(0, 0, maskWidth, maskHeight);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    begin(programs.mask);
    gl.bindVertexArray(panelArray);
    gl.drawElements(gl.TRIANGLES, panelIndexCount, gl.UNSIGNED_SHORT, 0);

    begin(programs.blur);
    gl.bindVertexArray(emptyArray);
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform1i(programs.blur.loc("uSource"), 0);
    for (const [from, to, dx, dy] of [
      [0, 1, 1.5, 0],
      [1, 0, 0, 1.5],
      [0, 1, 3, 0],
      [1, 0, 0, 3],
    ]) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, masks[to].framebuffer);
      gl.bindTexture(gl.TEXTURE_2D, masks[from].texture);
      gl.uniform2f(programs.blur.loc("uStep"), dx / maskWidth, dy / maskHeight);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, deviceWidth, deviceHeight);

    // What's inside.
    const inside = programs.inside;
    const light = begin(inside);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, masks[0].texture);
    gl.uniform1i(inside.loc("uMask"), 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, atlas);
    gl.uniform1i(inside.loc("uAtlas"), 1);
    gl.uniform2f(inside.loc("uMaskTexel"), 1 / maskWidth, 1 / maskHeight);
    const depth = 5;
    gl.uniform2f(
      inside.loc("uShadowUV"),
      ((light[0] / light[2]) * depth) / viewWidth,
      (-(light[1] / light[2]) * depth) / viewHeight,
    );
    gl.uniform1i(inside.loc("uInside"), INSIDES[settings.inside].index);
    gl.uniform1f(inside.loc("uFull"), settings.fullness / 100);
    gl.uniform4f(inside.loc("uTicket"), 6, -24, 0.42, 0);
    gl.uniform4f(inside.loc("uLabel"), -5, 12, 0, 0);
    gl.bindVertexArray(emptyArray);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    // The fabric and tapes.
    const panel = programs.panel;
    begin(panel);
    gl.uniform1i(panel.loc("uFabric"), fabric.index);
    gl.uniform1i(panel.loc("uTeeth"), teethSpec.index);
    gl.uniform3f(panel.loc("uColour"), ...fabric.colour);
    const tapeColour = fabric.tape;
    gl.uniform3f(panel.loc("uTape"), ...tapeColour);
    gl.uniform3f(panel.loc("uStitch"), ...fabric.stitch);
    gl.uniform4f(
      panel.loc("uWindow"),
      (windowTop + windowBottom) / 2,
      windowHalfWidth,
      (windowBottom - windowTop) / 2,
      2,
    );
    gl.uniform1f(panel.loc("uChainHalf"), half);
    if (grab) {
      const delta = grabDelta();
      gl.uniform4f(
        panel.loc("uGrab"),
        grab.start.x,
        grab.start.y,
        delta.x,
        delta.y,
      );
      gl.uniform1f(panel.loc("uGrabSide"), grab.side ? 1 : -1);
    } else {
      gl.uniform1f(panel.loc("uGrabSide"), 0);
    }
    gl.bindVertexArray(panelArray);
    gl.drawElements(gl.TRIANGLES, panelIndexCount, gl.UNSIGNED_SHORT, 0);

    // The teeth, and their shadows on the tape.
    const tooth = programs.tooth;
    begin(tooth);
    const away = { x: -light[0] / light[2], y: -light[1] / light[2] };
    gl.uniform1i(tooth.loc("uTeeth"), teethSpec.index);
    gl.uniform1f(tooth.loc("uWidth"), chain.toothWidth);
    gl.uniform1f(tooth.loc("uLength"), chain.toothLength);
    gl.uniform2f(tooth.loc("uHalf"), chain.toothWidth * 0.85 + 0.6, 0);
    gl.uniform2f(tooth.loc("uReach"), -1.9, chain.toothLength + 0.7);
    gl.uniform3f(tooth.loc("uMetal"), ...fabric.metal);
    gl.uniform3f(
      tooth.loc("uPlastic"),
      ...(tapeColour.map((c) => Math.min(1, c * 1.08 + 0.015)) as [
        number,
        number,
        number,
      ]),
    );
    gl.bindVertexArray(toothArray);
    gl.uniform1f(tooth.loc("uShadow"), 1);
    gl.uniform2f(tooth.loc("uOffset"), away.x * 0.6, away.y * 0.6);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, toothCount);
    gl.uniform1f(tooth.loc("uShadow"), 0);
    gl.uniform2f(tooth.loc("uOffset"), 0, 0);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, toothCount);

    // The stops and the slider.
    const part = programs.part;
    begin(part);
    gl.bindVertexArray(emptyArray);
    const painted = teethSpec.value !== "metal";
    gl.uniform3f(part.loc("uMetal"), ...fabric.metal);
    gl.uniform2f(part.loc("uAxis"), 1, 0);
    const drawPart = (
      kind: number,
      cx: number,
      cy: number,
      hx: number,
      hy: number,
      height: number,
      paint: boolean,
    ) => {
      gl.uniform1i(part.loc("uKind"), kind);
      gl.uniform2f(part.loc("uCentre"), cx, cy);
      gl.uniform2f(part.loc("uHalf"), hx, hy);
      gl.uniform4f(
        part.loc("uPaint"),
        tapeColour[0] * 1.1 + 0.02,
        tapeColour[1] * 1.1 + 0.02,
        tapeColour[2] * 1.1 + 0.02,
        paint ? 1 : 0,
      );
      gl.uniform1f(part.loc("uShadow"), 1);
      gl.uniform1f(part.loc("uSoft"), 0.35 + height * 0.25);
      gl.uniform2f(part.loc("uOffset"), away.x * height, away.y * height);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.uniform1f(part.loc("uShadow"), 0);
      gl.uniform2f(part.loc("uOffset"), 0, 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };
    gl.uniform1f(part.loc("uLock"), 0);
    gl.uniform1f(part.loc("uWorn"), 0);
    gl.uniform4f(part.loc("uSlider"), 0, 0, 0, half);
    for (const sx of [-1, 1]) {
      drawPart(1, sx * (half + 0.3), chain.topStop, 2.2, 2.2, 0.9, painted);
    }
    drawPart(2, 0, chain.bottomStop + 0.6, half + 2.8, 2.6, 1, painted);

    const worn = settings.slider === "worn";
    const sl = teethSpec.slider;
    const squeeze = squash > 0 ? Math.sin(Math.min(squash, 1) * Math.PI) : 0;
    gl.uniform1f(part.loc("uLock"), slider().locks ? 1 : 0);
    gl.uniform1f(part.loc("uWorn"), worn ? 1 : 0);
    gl.uniform4f(
      part.loc("uSlider"),
      sl.length,
      sl.shoulder + (worn ? 0.9 : 0) - squeeze * 0.9,
      sl.throat,
      half,
    );
    drawPart(
      0,
      0,
      sliderCentre(),
      sl.shoulder / 2 + 1.6,
      sl.length / 2 + 1.6,
      2.6,
      painted,
    );

    // The pull: its shadow, its edge as it tilts, then its face.
    const pull = programs.pull;
    begin(pull);
    const frame = pullFrame();
    const spec = teethSpec.pull;
    const c =
      Math.sign(Math.cos(phi) || 1) * Math.max(Math.abs(Math.cos(phi)), 0.12);
    const lx = -Math.sin(psi) * c;
    const ly = Math.cos(psi) * c;
    const facing = frame.n[2] >= 0 ? 1 : -1;
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, atlas);
    gl.uniform1i(pull.loc("uAtlas"), 1);
    gl.uniform2f(pull.loc("uPull"), spec.length, spec.width);
    gl.uniform3f(pull.loc("uW3"), ...frame.w);
    gl.uniform3f(pull.loc("uL3"), ...frame.l);
    gl.uniform3f(pull.loc("uN3"), ...frame.n);
    gl.uniform3f(pull.loc("uMetal"), ...fabric.metal);
    gl.uniform4f(
      pull.loc("uPaint"),
      tapeColour[0] * 1.1 + 0.02,
      tapeColour[1] * 1.1 + 0.02,
      tapeColour[2] * 1.1 + 0.02,
      painted ? 1 : 0,
    );
    gl.uniform2f(pull.loc("uPivot"), 0, pivotY());
    gl.uniform4f(
      pull.loc("uRange"),
      -spec.width / 2 - 1,
      -3.6,
      spec.width / 2 + 1,
      spec.length + 1,
    );
    gl.uniform2f(pull.loc("uW"), frame.w[0], frame.w[1]);
    gl.bindVertexArray(emptyArray);
    // The shadow falls from each point's height along the light.
    const sp = Math.sin(phi);
    gl.uniform1i(pull.loc("uLayer"), 0);
    gl.uniform1f(pull.loc("uSoft"), 0.5 + 0.06 * spec.length * sp);
    gl.uniform2f(
      pull.loc("uL"),
      frame.l[0] + sp * away.x,
      frame.l[1] + sp * away.y,
    );
    gl.uniform2f(
      pull.loc("uOffset"),
      away.x * HINGE_HEIGHT,
      away.y * HINGE_HEIGHT,
    );
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.uniform2f(pull.loc("uL"), lx, ly);
    gl.uniform1i(pull.loc("uLayer"), 1);
    gl.uniform2f(
      pull.loc("uOffset"),
      -facing * frame.n[0] * PULL_THICKNESS,
      -facing * frame.n[1] * PULL_THICKNESS,
    );
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.uniform1i(pull.loc("uLayer"), 2);
    gl.uniform2f(pull.loc("uOffset"), 0, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
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
    // The few pairs always inside the slider at the top don't count.
    let closed = 0;
    let pairs = 0;
    for (let k = chain.first; k <= chain.last; k++) {
      if (chain.v[k] + chain.pitch / 4 <= chain.sMin) continue;
      pairs++;
      if (chain.meshed[k]) closed++;
    }
    const stats: ZipStats = {
      closed: closed / pairs,
      open: (S - chain.sMin) / (chain.sMax - chain.sMin),
      hertz: hertz < 20 ? 0 : Math.round(hertz),
      locked: locked(),
      fps,
    };
    const key = JSON.stringify(stats);
    if (key === lastStats) return;
    lastStats = key;
    onStats?.(stats);
  }

  function step(dt: number) {
    night += (nightTarget - night) * (1 - Math.exp(-dt * 4));
    if (squash > 0) squash = Math.max(0, squash - dt * 2.5);
    const clicks: Click[] = [];
    const teeth = moveSlider(dt, clicks);
    moveTapes(dt);
    popTeeth(clicks);
    movePull(dt, clicks);
    const rate = teeth / Math.max(dt, 1e-4);
    hertz += (rate - hertz) * (1 - Math.exp(-dt / 0.12));
    if (hertz > 220) {
      note(
        "note",
        "That buzz is only the teeth: its note is how many go past the slider each second. A finer zip, pulled as fast, sings higher.",
      );
    }
    rattle.play(clicks, Math.min(1, Math.abs(sliderVelocity) / 400), dt);
  }

  let running = false;
  let visible = true;
  let frame = 0;
  let last = 0;

  function tick(now: number) {
    const dt = clamp((now - last) / 1000, 0, 1 / 20);
    last = now;
    if (!lost) {
      if (dt > 0) step(dt);
      render();
      report(now);
    }
    if (visible && !lost) frame = requestAnimationFrame(tick);
    else running = false;
  }

  function start() {
    if (running || lost) return;
    running = true;
    last = performance.now();
    fpsSince = last;
    frames = 0;
    frame = requestAnimationFrame(tick);
  }

  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  const intersection = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible) start();
  });
  intersection.observe(canvas);

  function onLost(event: Event) {
    event.preventDefault();
    lost = true;
    cancelAnimationFrame(frame);
    running = false;
  }
  function onRestored() {
    lost = false;
    setupGl();
    start();
  }
  canvas.addEventListener("webglcontextlost", onLost);
  canvas.addEventListener("webglcontextrestored", onRestored);

  resize();
  setupGl();
  // The lettering waits for the site's fonts.
  void document.fonts?.ready.then(() => {
    if (!lost) uploadAtlas();
  });
  start();

  function rebuild(spec: TeethSpec) {
    const open = (S - chain.sMin) / (chain.sMax - chain.sMin);
    chain = buildChain(spec);
    S = chain.sMin + open * (chain.sMax - chain.sMin);
    for (let k = chain.first; k <= chain.last; k++) {
      chain.meshed[k] = chain.v[k] + chain.pitch / 4 > S ? 1 : 0;
      chain.strength[k] = settings.slider === "worn" ? WEAK : spec.strength;
    }
    hand = hand?.kind === "auto" ? hand : null;
    grab = null;
    layoutMesh();
  }

  return {
    setSettings(next: ZipSettings) {
      const previous = settings;
      settings = next;
      if (next.teeth !== previous.teeth) {
        rebuild(TEETH[next.teeth]);
        rattle.setTeeth(next.teeth);
      }
      if (next.fabric !== previous.fabric) uploadAtlas();
      if (next.sound !== previous.sound) rattle.setEnabled(next.sound);
    },
    setNight(on: boolean) {
      nightTarget = on ? 1 : 0;
    },
    pointerDown(id: number, p: Point) {
      rattle.wake();
      const q = toWorld(p);
      if (hitPull(q)) {
        const { b } = onPull(q);
        hand = {
          kind: "pull",
          id,
          reach: clamp(b, 7, chain.spec.pull.length),
          at: p,
        };
        return "pull";
      }
      if (hitSlider(q)) {
        hand = { kind: "slider", id, offset: q.y - S, at: p };
        return "pull";
      }
      if (grab) return null;
      const side = q.x < 0 ? 0 : 1;
      for (const tape of chain.tapes) {
        tape.gx.set(tape.x);
        tape.gy.set(tape.y);
      }
      grab = { id, side, start: q, at: q };
      return "fabric";
    },
    pointerMove(id: number, p: Point) {
      if (hand && hand.kind !== "auto" && hand.id === id) hand.at = p;
      if (grab && grab.id === id) grab.at = toWorld(p);
    },
    pointerUp(id: number) {
      if (hand && hand.kind !== "auto" && hand.id === id) hand = null;
      if (grab && grab.id === id) grab = null;
    },
    // Opens or closes it all the way, as a hand would.
    run(open: boolean) {
      rattle.wake();
      hand = {
        kind: "auto",
        goal: open ? chain.sMax : chain.sMin,
        speed: 260,
        v: 0,
      };
    },
    // A few teeth at a time, from the keyboard: negative closes.
    nudge(teeth: number) {
      rattle.wake();
      const from = hand?.kind === "auto" ? hand.goal : S;
      hand = {
        kind: "auto",
        goal: clamp(from + teeth * chain.pitch, chain.sMin, chain.sMax),
        speed: 160,
        v: 40,
      };
    },
    // Pliers on a worn slider's shoulders, closing its jaws back up.
    squeeze() {
      rattle.wake();
      squash = 1;
      rattle.play([{ at: 0, kind: "squeeze", level: 0.9 }], 0, 1 / 60);
    },
    wake() {
      rattle.wake();
    },
    dispose() {
      cancelAnimationFrame(frame);
      running = false;
      observer.disconnect();
      intersection.disconnect();
      rattle.dispose();
      canvas.removeEventListener("webglcontextlost", onLost);
      canvas.removeEventListener("webglcontextrestored", onRestored);
    },
  };
}

export type Zip = ReturnType<typeof createZip>;
