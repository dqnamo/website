// A glass dish of ferrofluid on a table, with a magnet underneath that you drag about. See
// shaders.ts for the fluid and its spikes and magnets.ts for the field; this file runs the
// grids, keeps the magnet and the camera, and turns a pointer on the screen into a place under
// the dish.
//
// The things worth watching for are all real. The fluid crawls to the magnet and heaps up over
// it. Spikes appear only once the field normal to the surface passes about 22 mT, all at once,
// and once up they hold on until the field drops a good way below that, so bringing the magnet
// up and taking it away again goes round a loop. Their spacing is the fluid's own, so a bigger
// magnet makes more spikes, not bigger ones. They lean out along the field lines round its
// edge. The fluid feels the field's strength, not its direction, so turning a magnet over
// changes nothing, though turning one of a pair over changes everything between them. An
// alternating coil raises the spikes twice each cycle. And wherever it has been, the fluid
// leaves a brown film on the glass that drains away slowly.

import {
  type Charge,
  chargesFor,
  fieldAt,
  MAX_CHARGES,
  type Magnet,
  type MagnetKind,
  SOFTENING,
} from "./magnets";
import {
  ADVECT,
  BACKGROUND,
  FIELD,
  FLOW,
  FLUID_FRAGMENT,
  FLUID_VERTEX,
  GLASS_FRAGMENT,
  GLASS_VERTEX,
  PEAK,
  PRESSURE,
  QUAD,
  RESCALE,
  SURFACE,
  SWIFT_U,
  SWIFT_W,
} from "./shaders";

export type Light = "softbox" | "window" | "ring";

export type FerrofluidSettings = {
  magnet: MagnetKind;
  // Millimetres from the dish's floor down to the magnet's top.
  gap: number;
  // Degrees: which way a bar or a pair lies.
  angle: number;
  // The coil's current, in hertz; 0 is direct current.
  frequency: number;
  // Millilitres of fluid in the dish.
  amount: number;
  light: Light;
};

export type FerrofluidStats = {
  // The strongest field normal to the dish's floor, in mT.
  field: number;
  spikes: number;
  fps: number | null;
};

type Point = { x: number; y: number };
type Vec3 = [number, number, number];
type Target = { texture: WebGLTexture; framebuffer: WebGLFramebuffer };
type Program = {
  program: WebGLProgram;
  at(name: string): WebGLUniformLocation | null;
};

// The grids cover a 96 mm square: the dish's floor.
const HALF = 48;
const RADIUS = 46;
const OUTER = 47.6;
const WALL = 13;
const FLUID_SIZE = 64;
const SPIKE_SIZE = 96;
const SURFACE_SIZE = 384;
const FLUID_CELL = (HALF * 2) / FLUID_SIZE;
const SPIKE_CELL = (HALF * 2) / SPIKE_SIZE;
const SURFACE_CELL = (HALF * 2) / SURFACE_SIZE;

// Flow: how readily a deep layer moves (mm²/s), surface tension (mm²), and the step, short
// enough to stay stable.
const MOBILITY = 900;
const TENSION = 0.15;
const FLOW_STEP = 1 / 2700;
const MAX_FLOW_STEPS = 60;
// The spike pattern's own clock, in model time per second, and its step.
const SWIFT_RATE = 50;
const SWIFT_STEP = 0.07;
const MAX_SWIFT_STEPS = 20;
// A film on the glass drains away over about this many seconds.
const FILM_TIME = 18;
// Where the field is measured: just above the floor.
const PLANE = 0.5;
// The magnet can wander this far from the dish's middle.
const REACH = 85;

const MAX_PIXELS = 2_400_000;
const DEG = Math.PI / 180;
const KINDS: MagnetKind[] = ["disc", "ring", "bar", "pair", "coil"];
const LIGHTS: Light[] = ["softbox", "window", "ring"];

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function smoothstep(edge0: number, edge1: number, x: number) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

// Column-major 4 × 4 matrices, as GL wants them.
function perspective(fovy: number, aspect: number, near: number, far: number) {
  const f = 1 / Math.tan(fovy / 2);
  const out = new Float32Array(16);
  out[0] = f / aspect;
  out[5] = f;
  out[10] = (far + near) / (near - far);
  out[11] = -1;
  out[14] = (2 * far * near) / (near - far);
  return out;
}

function lookAt(eye: Vec3, target: Vec3, up: Vec3) {
  const z = normalize([
    eye[0] - target[0],
    eye[1] - target[1],
    eye[2] - target[2],
  ]);
  const x = normalize(cross(up, z));
  const y = cross(z, x);
  return new Float32Array([
    x[0],
    y[0],
    z[0],
    0,
    x[1],
    y[1],
    z[1],
    0,
    x[2],
    y[2],
    z[2],
    0,
    -dot(x, eye),
    -dot(y, eye),
    -dot(z, eye),
    1,
  ]);
}

function multiply(a: Float32Array, b: Float32Array) {
  const out = new Float32Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) sum += a[k * 4 + r] * b[c * 4 + k];
      out[c * 4 + r] = sum;
    }
  }
  return out;
}

function invert(m: Float32Array) {
  const inv = new Float32Array(16);
  inv[0] =
    m[5] * m[10] * m[15] -
    m[5] * m[11] * m[14] -
    m[9] * m[6] * m[15] +
    m[9] * m[7] * m[14] +
    m[13] * m[6] * m[11] -
    m[13] * m[7] * m[10];
  inv[4] =
    -m[4] * m[10] * m[15] +
    m[4] * m[11] * m[14] +
    m[8] * m[6] * m[15] -
    m[8] * m[7] * m[14] -
    m[12] * m[6] * m[11] +
    m[12] * m[7] * m[10];
  inv[8] =
    m[4] * m[9] * m[15] -
    m[4] * m[11] * m[13] -
    m[8] * m[5] * m[15] +
    m[8] * m[7] * m[13] +
    m[12] * m[5] * m[11] -
    m[12] * m[7] * m[9];
  inv[12] =
    -m[4] * m[9] * m[14] +
    m[4] * m[10] * m[13] +
    m[8] * m[5] * m[14] -
    m[8] * m[6] * m[13] -
    m[12] * m[5] * m[10] +
    m[12] * m[6] * m[9];
  inv[1] =
    -m[1] * m[10] * m[15] +
    m[1] * m[11] * m[14] +
    m[9] * m[2] * m[15] -
    m[9] * m[3] * m[14] -
    m[13] * m[2] * m[11] +
    m[13] * m[3] * m[10];
  inv[5] =
    m[0] * m[10] * m[15] -
    m[0] * m[11] * m[14] -
    m[8] * m[2] * m[15] +
    m[8] * m[3] * m[14] +
    m[12] * m[2] * m[11] -
    m[12] * m[3] * m[10];
  inv[9] =
    -m[0] * m[9] * m[15] +
    m[0] * m[11] * m[13] +
    m[8] * m[1] * m[15] -
    m[8] * m[3] * m[13] -
    m[12] * m[1] * m[11] +
    m[12] * m[3] * m[9];
  inv[13] =
    m[0] * m[9] * m[14] -
    m[0] * m[10] * m[13] -
    m[8] * m[1] * m[14] +
    m[8] * m[2] * m[13] +
    m[12] * m[1] * m[10] -
    m[12] * m[2] * m[9];
  inv[2] =
    m[1] * m[6] * m[15] -
    m[1] * m[7] * m[14] -
    m[5] * m[2] * m[15] +
    m[5] * m[3] * m[14] +
    m[13] * m[2] * m[7] -
    m[13] * m[3] * m[6];
  inv[6] =
    -m[0] * m[6] * m[15] +
    m[0] * m[7] * m[14] +
    m[4] * m[2] * m[15] -
    m[4] * m[3] * m[14] -
    m[12] * m[2] * m[7] +
    m[12] * m[3] * m[6];
  inv[10] =
    m[0] * m[5] * m[15] -
    m[0] * m[7] * m[13] -
    m[4] * m[1] * m[15] +
    m[4] * m[3] * m[13] +
    m[12] * m[1] * m[7] -
    m[12] * m[3] * m[5];
  inv[14] =
    -m[0] * m[5] * m[14] +
    m[0] * m[6] * m[13] +
    m[4] * m[1] * m[14] -
    m[4] * m[2] * m[13] -
    m[12] * m[1] * m[6] +
    m[12] * m[2] * m[5];
  inv[3] =
    -m[1] * m[6] * m[11] +
    m[1] * m[7] * m[10] +
    m[5] * m[2] * m[11] -
    m[5] * m[3] * m[10] -
    m[9] * m[2] * m[7] +
    m[9] * m[3] * m[6];
  inv[7] =
    m[0] * m[6] * m[11] -
    m[0] * m[7] * m[10] -
    m[4] * m[2] * m[11] +
    m[4] * m[3] * m[10] +
    m[8] * m[2] * m[7] -
    m[8] * m[3] * m[6];
  inv[11] =
    -m[0] * m[5] * m[11] +
    m[0] * m[7] * m[9] +
    m[4] * m[1] * m[11] -
    m[4] * m[3] * m[9] -
    m[8] * m[1] * m[7] +
    m[8] * m[3] * m[5];
  inv[15] =
    m[0] * m[5] * m[10] -
    m[0] * m[6] * m[9] -
    m[4] * m[1] * m[10] +
    m[4] * m[2] * m[9] +
    m[8] * m[1] * m[6] -
    m[8] * m[2] * m[5];
  const det = m[0] * inv[0] + m[1] * inv[4] + m[2] * inv[8] + m[3] * inv[12];
  for (let i = 0; i < 16; i++) inv[i] /= det || 1;
  return inv;
}

function transform(m: Float32Array, x: number, y: number, z: number, w = 1) {
  return [
    m[0] * x + m[4] * y + m[8] * z + m[12] * w,
    m[1] * x + m[5] * y + m[9] * z + m[13] * w,
    m[2] * x + m[6] * y + m[10] * z + m[14] * w,
    m[3] * x + m[7] * y + m[11] * z + m[15] * w,
  ];
}

function normalize(v: Vec3): Vec3 {
  const length = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / length, v[1] / length, v[2] / length];
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function dot(a: Vec3, b: Vec3) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function compile(gl: WebGL2RenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("Couldn't create a shader.");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`A shader didn't compile: ${log}`);
  }
  return shader;
}

// Any CSS colour, as linear RGB, by letting a canvas parse it.
function linearColour(css: string): Vec3 {
  const probe = document.createElement("canvas").getContext("2d");
  if (!probe) return [1, 1, 1];
  probe.fillStyle = css;
  probe.fillRect(0, 0, 1, 1);
  const [r, g, b] = probe.getImageData(0, 0, 1, 1).data;
  return [r, g, b].map((v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as Vec3;
}

// A puddle in the middle of the dish, as poured: flat on top with a rounded edge, and wider
// the more there is.
function puddle(amount: number) {
  const data = new Float32Array(FLUID_SIZE * FLUID_SIZE * 4);
  const spread = Math.min(RADIUS - 2, 18 + amount * 5);
  const shape = new Float32Array(FLUID_SIZE * FLUID_SIZE);
  let area = 0;
  for (let j = 0; j < FLUID_SIZE; j++) {
    for (let i = 0; i < FLUID_SIZE; i++) {
      const x = (i + 0.5) * FLUID_CELL - HALF;
      const y = (j + 0.5) * FLUID_CELL - HALF;
      const r = Math.hypot(x, y);
      if (r >= RADIUS) continue;
      const s = smoothstep(spread, spread - 8, r);
      shape[j * FLUID_SIZE + i] = s;
      area += s * FLUID_CELL * FLUID_CELL;
    }
  }
  const depth = (amount * 1000) / Math.max(area, 1);
  for (let k = 0; k < shape.length; k++) {
    const h = shape[k] * depth;
    data[k * 4] = h;
    data[k * 4 + 3] = Math.min(h, 0.004);
  }
  return data;
}

// The dish's wall as triangles, with normals: inside, outside and the rounded rim. The far half
// comes first, so drawing in order lays the glass down back to front.
function dishMesh() {
  const segments = 160;
  const far: number[] = [];
  const near: number[] = [];
  const quad = (
    out: number[],
    a: number[],
    b: number[],
    c: number[],
    d: number[],
  ) => {
    out.push(...a, ...b, ...c, ...a, ...c, ...d);
  };
  for (let i = 0; i < segments; i++) {
    const a0 = (i / segments) * Math.PI * 2;
    const a1 = ((i + 1) / segments) * Math.PI * 2;
    const middle = (a0 + a1) / 2;
    const out = Math.sin(middle) > 0 ? far : near;
    const c0 = Math.cos(a0);
    const s0 = Math.sin(a0);
    const c1 = Math.cos(a1);
    const s1 = Math.sin(a1);
    const vertex = (c: number, s: number, r: number, z: number, n: Vec3) => [
      c * r,
      s * r,
      z,
      ...n,
    ];
    const outside = (c: number, s: number): Vec3 => [c, s, 0];
    const inside = (c: number, s: number): Vec3 => [-c, -s, 0];
    // On the far side the outside face is further away, so it goes first; nearer, the inside.
    const faces = [
      () =>
        quad(
          out,
          vertex(c0, s0, OUTER, 0, outside(c0, s0)),
          vertex(c1, s1, OUTER, 0, outside(c1, s1)),
          vertex(c1, s1, OUTER, WALL, outside(c1, s1)),
          vertex(c0, s0, OUTER, WALL, outside(c0, s0)),
        ),
      () =>
        quad(
          out,
          vertex(c0, s0, RADIUS, 0, inside(c0, s0)),
          vertex(c0, s0, RADIUS, WALL, inside(c0, s0)),
          vertex(c1, s1, RADIUS, WALL, inside(c1, s1)),
          vertex(c1, s1, RADIUS, 0, inside(c1, s1)),
        ),
    ];
    if (out === near) faces.reverse();
    for (const face of faces) face();
    // The rim, rounded over in three facets.
    const rim = (OUTER - RADIUS) / 2;
    const centre = (OUTER + RADIUS) / 2;
    for (let k = 0; k < 3; k++) {
      const b0 = (k / 3) * Math.PI;
      const b1 = ((k + 1) / 3) * Math.PI;
      const ring = (c: number, s: number, b: number) =>
        vertex(c, s, centre + Math.cos(b) * rim, WALL + Math.sin(b) * rim, [
          c * Math.cos(b),
          s * Math.cos(b),
          Math.sin(b),
        ]);
      quad(
        out,
        ring(c0, s0, b0),
        ring(c1, s1, b0),
        ring(c1, s1, b1),
        ring(c0, s0, b1),
      );
    }
  }
  return new Float32Array([...far, ...near]);
}

export function createFerrofluid(
  canvas: HTMLCanvasElement,
  { onStats }: { onStats?: (stats: FerrofluidStats) => void } = {},
) {
  const context = canvas.getContext("webgl2", {
    alpha: false,
    antialias: true,
    depth: true,
    powerPreference: "high-performance",
  });
  if (!context) throw new Error("WebGL2 is not available.");
  const gl = context;

  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");

  let settings: FerrofluidSettings = {
    magnet: "disc",
    gap: 12,
    angle: 0,
    frequency: 0,
    amount: 3,
    light: "softbox",
  };

  // Layout, in CSS pixels, and the camera.
  let width = 0;
  let height = 0;
  let ratio = 1;
  let viewProjection = new Float32Array(16);
  let inverse = new Float32Array(16);
  let eye: Vec3 = [0, -200, 160];
  let table: Vec3 = [1, 1, 1];
  let room: Vec3 = [0.2, 0.2, 0.2];

  // The magnet: where it is, where the hand is taking it, and a first slide in under the dish.
  const magnet: Magnet = {
    kind: "disc",
    x: 0,
    y: -2,
    gap: 12,
    angle: 0,
    flipped: false,
    current: 1,
  };
  let present = true;
  let target: Point = { x: 0, y: -2 };
  let intro: { from: Point; start: number } | null = reduceMotion.matches
    ? null
    : { from: { x: -78, y: 22 }, start: 0.35 };
  if (intro) {
    magnet.x = intro.from.x;
    magnet.y = intro.from.y;
  }
  let dragging: number | null = null;
  let overlay = 0;
  let phase = 0;
  let charges: Charge[] = [];
  const chargeData = new Float32Array(MAX_CHARGES * 4);

  let clock = 0;
  let seed = 0;
  let rescale = 1;
  let lastStats = "";
  let statsAt = 0;
  let spikeCount = 0;
  let frames = 0;
  let fpsSince = 0;
  let fps: number | null = null;
  const readback = new Float32Array(SPIKE_SIZE * SPIKE_SIZE * 4);
  let canRead = true;

  // GL objects, made again if the context is lost and comes back.
  let programs: Record<string, Program> = {};
  let quadArray: WebGLVertexArrayObject | null = null;
  let meshArray: WebGLVertexArrayObject | null = null;
  let glassArray: WebGLVertexArrayObject | null = null;
  let meshCount = 0;
  let glassCount = 0;
  let glassFar = 0;
  let field: Target;
  let pressure: Target;
  let fluid: Target[] = [];
  let spikes: Target[] = [];
  let w: Target;
  let peakAcross: Target;
  let peak: Target;
  let surface: Target;
  let floatType = 0;
  let floatFormat = 0;
  let lost = false;

  function link(vertex: string, fragment: string, attributes: string[] = []) {
    const program = gl.createProgram();
    if (!program) throw new Error("Couldn't create a program.");
    gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, vertex));
    gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, fragment));
    attributes.forEach((name, index) => {
      gl.bindAttribLocation(program, index, name);
    });
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(
        `A program didn't link: ${gl.getProgramInfoLog(program)}`,
      );
    }
    const locations = new Map<string, WebGLUniformLocation | null>();
    return {
      program,
      at(name: string) {
        if (!locations.has(name)) {
          locations.set(name, gl.getUniformLocation(program, name));
        }
        return locations.get(name) ?? null;
      },
    };
  }

  function makeTarget(size: number, data: Float32Array | null = null) {
    const texture = gl.createTexture();
    const framebuffer = gl.createFramebuffer();
    if (!texture || !framebuffer) throw new Error("Couldn't create a texture.");
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      floatFormat,
      size,
      size,
      0,
      gl.RGBA,
      gl.FLOAT,
      data,
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
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
    return { texture, framebuffer };
  }

  function setupGl() {
    // Float targets hold depths of a few hundredths of a millimetre; half floats will do where
    // full ones can't be drawn into.
    if (gl.getExtension("EXT_color_buffer_float")) {
      floatFormat = gl.RGBA32F;
      floatType = gl.FLOAT;
    } else if (gl.getExtension("EXT_color_buffer_half_float")) {
      floatFormat = gl.RGBA16F;
      floatType = gl.HALF_FLOAT;
    } else {
      throw new Error("This browser can't draw into float textures.");
    }

    programs = {
      field: link(QUAD, FIELD, ["aPosition"]),
      pressure: link(QUAD, PRESSURE, ["aPosition"]),
      flow: link(QUAD, FLOW, ["aPosition"]),
      rescale: link(QUAD, RESCALE, ["aPosition"]),
      advect: link(QUAD, ADVECT, ["aPosition"]),
      swiftW: link(QUAD, SWIFT_W, ["aPosition"]),
      swiftU: link(QUAD, SWIFT_U, ["aPosition"]),
      peak: link(QUAD, PEAK, ["aPosition"]),
      surface: link(QUAD, SURFACE, ["aPosition"]),
      background: link(QUAD, BACKGROUND, ["aPosition"]),
      fluid: link(FLUID_VERTEX, FLUID_FRAGMENT),
      glass: link(GLASS_VERTEX, GLASS_FRAGMENT, ["aPosition", "aNormal"]),
    };

    // One triangle that covers the screen.
    quadArray = gl.createVertexArray();
    gl.bindVertexArray(quadArray);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]),
      gl.STATIC_DRAW,
    );
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    // The fluid's surface: a grid of points, one per surface texel, lifted in the shader.
    meshArray = gl.createVertexArray();
    gl.bindVertexArray(meshArray);
    const n = SURFACE_SIZE;
    const indices = new Uint32Array((n - 1) * (n - 1) * 6);
    let k = 0;
    for (let j = 0; j < n - 1; j++) {
      for (let i = 0; i < n - 1; i++) {
        const a = j * n + i;
        indices[k++] = a;
        indices[k++] = a + 1;
        indices[k++] = a + n + 1;
        indices[k++] = a;
        indices[k++] = a + n + 1;
        indices[k++] = a + n;
      }
    }
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
    meshCount = indices.length;

    glassArray = gl.createVertexArray();
    gl.bindVertexArray(glassArray);
    const glass = dishMesh();
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, glass, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12);
    glassCount = glass.length / 6;
    glassFar = glassCount / 2;
    gl.bindVertexArray(null);

    field = makeTarget(FLUID_SIZE);
    pressure = makeTarget(FLUID_SIZE);
    fluid = [
      makeTarget(FLUID_SIZE, puddle(settings.amount)),
      makeTarget(FLUID_SIZE),
    ];
    spikes = [makeTarget(SPIKE_SIZE), makeTarget(SPIKE_SIZE)];
    w = makeTarget(SPIKE_SIZE);
    peakAcross = makeTarget(SPIKE_SIZE);
    peak = makeTarget(SPIKE_SIZE);
    surface = makeTarget(SURFACE_SIZE);
    rescale = 1;
    canRead = floatType === gl.FLOAT;
  }

  setupGl();

  // Draws a full-screen pass of a program into a target.
  function run(into: Target | null, size: number) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, into ? into.framebuffer : null);
    gl.viewport(0, 0, size, size);
    gl.bindVertexArray(quadArray);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function use(program: Program) {
    // biome-ignore lint/correctness/useHookAtTopLevel: WebGL's useProgram, not a React hook.
    gl.useProgram(program.program);
    return program;
  }

  function bindTexture(
    program: Program,
    name: string,
    unit: number,
    texture: WebGLTexture,
  ) {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform1i(program.at(name), unit);
  }

  function readSurround() {
    const host = canvas.parentElement;
    if (!host) return;
    table = linearColour(getComputedStyle(host).backgroundColor);
    const light = (table[0] + table[1] + table[2]) / 3;
    // A pale table sits in a dim room; a dark one in a darker one.
    room =
      light > 0.3
        ? [0.06, 0.062, 0.066]
        : [light * 0.6 + 0.01, light * 0.6 + 0.012, light * 0.6 + 0.015];
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
    canvas.width = Math.max(1, Math.round(width * ratio));
    canvas.height = Math.max(1, Math.round(height * ratio));
    placeCamera();
  }

  // Looks down on the dish from the front, steeper on a tall, narrow stage, and backs off until
  // the whole dish and its shadow fit.
  function placeCamera() {
    const aspect = width / height;
    const elevation = (40 + 18 * smoothstep(1.05, 0.55, aspect)) * DEG;
    const aim: Vec3 = [0, 0, 4];
    const projection = perspective(30 * DEG, aspect, 20, 3000);
    const across = aspect < 0.8 ? 1 : 0.84;
    let distance = 300;
    for (let pass = 0; pass < 6; pass++) {
      eye = [
        aim[0],
        aim[1] - Math.cos(elevation) * distance,
        aim[2] + Math.sin(elevation) * distance,
      ];
      viewProjection = multiply(projection, lookAt(eye, aim, [0, 0, 1]));
      let extent = 0;
      for (let k = 0; k < 32; k++) {
        const a = (k / 32) * Math.PI * 2;
        for (const z of [0, WALL]) {
          const r = OUTER + (z ? 0 : 5);
          const [x, y, , q] = transform(
            viewProjection,
            Math.cos(a) * r,
            Math.sin(a) * r,
            z,
          );
          extent = Math.max(
            extent,
            Math.abs(x / q) / across,
            Math.abs(y / q) / 0.8,
          );
        }
      }
      distance *= extent;
    }
    inverse = invert(viewProjection);
  }

  // A point on the stage, in CSS pixels, to the place on the table under it, in millimetres.
  function tableAt(p: Point): Point {
    const x = (p.x / width) * 2 - 1;
    const y = 1 - (p.y / height) * 2;
    const near = transform(inverse, x, y, -1);
    const far = transform(inverse, x, y, 1);
    const a = [near[0] / near[3], near[1] / near[3], near[2] / near[3]];
    const b = [far[0] / far[3], far[1] / far[3], far[2] / far[3]];
    const t = a[2] / (a[2] - b[2] || 1);
    const hit = {
      x: a[0] + (b[0] - a[0]) * t,
      y: a[1] + (b[1] - a[1]) * t,
    };
    const r = Math.hypot(hit.x, hit.y);
    if (r > REACH) {
      hit.x *= REACH / r;
      hit.y *= REACH / r;
    }
    return hit;
  }

  function moveMagnet(dt: number) {
    if (intro) {
      const t = clamp((clock - intro.start) / 2.6, 0, 1);
      const ease = t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
      magnet.x = intro.from.x + (target.x - intro.from.x) * ease;
      magnet.y = intro.from.y + (target.y - intro.from.y) * ease;
      if (t >= 1) intro = null;
    } else {
      // A hand under the table follows the pointer closely, not instantly.
      const k = 1 - Math.exp(-dt / 0.05);
      magnet.x += (target.x - magnet.x) * k;
      magnet.y += (target.y - magnet.y) * k;
    }
    magnet.kind = settings.magnet;
    magnet.gap = settings.gap;
    magnet.angle = settings.angle * DEG;
    if (settings.magnet === "coil" && settings.frequency > 0) {
      phase = (phase + dt * settings.frequency) % 1;
      magnet.current = Math.sin(phase * Math.PI * 2);
    } else {
      phase = 0;
      magnet.current = 1;
    }
    charges = chargesFor(present ? magnet : null);
    chargeData.fill(0);
    charges.forEach((charge, i) => {
      chargeData.set(charge, i * 4);
    });
    overlay =
      dragging !== null
        ? Math.min(1, overlay + dt * 6)
        : Math.max(0, overlay - dt * 1.5);
  }

  function step(dt: number) {
    clock += dt;
    moveMagnet(dt);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);

    let p = use(programs.field);
    gl.uniform4fv(p.at("uCharges"), chargeData);
    gl.uniform1i(p.at("uCount"), charges.length);
    gl.uniform1f(p.at("uCell"), FLUID_CELL);
    gl.uniform1f(p.at("uHalf"), HALF);
    gl.uniform1f(p.at("uPlane"), PLANE);
    gl.uniform1f(p.at("uSoft"), SOFTENING);
    run(field, FLUID_SIZE);

    if (rescale !== 1) {
      p = use(programs.rescale);
      bindTexture(p, "uFluid", 0, fluid[0].texture);
      gl.uniform1f(p.at("uScale"), rescale);
      run(fluid[1], FLUID_SIZE);
      fluid.reverse();
      rescale = 1;
    }

    // The fluid flows in short steps, as many as fit the frame.
    const flowSteps = Math.min(
      MAX_FLOW_STEPS,
      Math.max(1, Math.ceil(dt / FLOW_STEP)),
    );
    const flowDt = Math.min(dt / flowSteps, FLOW_STEP);
    for (let i = 0; i < flowSteps; i++) {
      p = use(programs.pressure);
      bindTexture(p, "uFluid", 0, fluid[0].texture);
      bindTexture(p, "uField", 1, field.texture);
      gl.uniform1f(p.at("uCell"), FLUID_CELL);
      gl.uniform1f(p.at("uHalf"), HALF);
      gl.uniform1f(p.at("uRadius"), RADIUS);
      gl.uniform1i(p.at("uSize"), FLUID_SIZE);
      gl.uniform1f(p.at("uTension"), TENSION);
      run(pressure, FLUID_SIZE);

      p = use(programs.flow);
      bindTexture(p, "uFluid", 0, fluid[0].texture);
      bindTexture(p, "uPressure", 1, pressure.texture);
      gl.uniform1f(p.at("uCell"), FLUID_CELL);
      gl.uniform1f(p.at("uHalf"), HALF);
      gl.uniform1f(p.at("uRadius"), RADIUS);
      gl.uniform1i(p.at("uSize"), FLUID_SIZE);
      gl.uniform1f(p.at("uDt"), flowDt);
      gl.uniform1f(p.at("uMobility"), MOBILITY);
      gl.uniform1f(p.at("uFilmKeep"), Math.exp(-flowDt / FILM_TIME));
      run(fluid[1], FLUID_SIZE);
      fluid.reverse();
    }

    // The spikes ride along with the fluid.
    p = use(programs.advect);
    bindTexture(p, "uSpikes", 0, spikes[0].texture);
    bindTexture(p, "uFluid", 1, fluid[0].texture);
    gl.uniform1f(p.at("uCell"), SPIKE_CELL);
    gl.uniform1f(p.at("uFluidCell"), FLUID_CELL);
    gl.uniform1f(p.at("uHalf"), HALF);
    gl.uniform1f(p.at("uDt"), dt);
    gl.uniform1i(p.at("uSize"), SPIKE_SIZE);
    gl.uniform1i(p.at("uFluidSize"), FLUID_SIZE);
    run(spikes[1], SPIKE_SIZE);
    spikes.reverse();

    const swiftSteps = Math.min(
      MAX_SWIFT_STEPS,
      Math.max(1, Math.round((dt * SWIFT_RATE) / SWIFT_STEP)),
    );
    for (let i = 0; i < swiftSteps; i++) {
      for (const name of ["swiftW", "swiftU"] as const) {
        p = use(programs[name]);
        bindTexture(p, "uSpikes", 0, spikes[0].texture);
        bindTexture(p, "uField", 1, field.texture);
        bindTexture(p, "uFluid", 2, fluid[0].texture);
        gl.uniform1f(p.at("uCell"), SPIKE_CELL);
        gl.uniform1f(p.at("uFluidCell"), FLUID_CELL);
        gl.uniform1f(p.at("uHalf"), HALF);
        gl.uniform1f(p.at("uRadius"), RADIUS);
        gl.uniform1i(p.at("uSize"), SPIKE_SIZE);
        gl.uniform1i(p.at("uFluidSize"), FLUID_SIZE);
        if (name === "swiftW") {
          run(w, SPIKE_SIZE);
        } else {
          bindTexture(p, "uW", 3, w.texture);
          gl.uniform1f(p.at("uDt"), SWIFT_STEP);
          seed = (seed + 0.618034) % 1;
          gl.uniform1f(p.at("uSeed"), seed);
          gl.uniform1f(p.at("uNoise"), 0.004);
          run(spikes[1], SPIKE_SIZE);
          spikes.reverse();
        }
      }
    }

    p = use(programs.peak);
    gl.uniform1i(p.at("uSize"), SPIKE_SIZE);
    bindTexture(p, "uSource", 0, spikes[0].texture);
    gl.uniform2i(p.at("uAxis"), 1, 0);
    run(peakAcross, SPIKE_SIZE);
    bindTexture(p, "uSource", 0, peakAcross.texture);
    gl.uniform2i(p.at("uAxis"), 0, 1);
    run(peak, SPIKE_SIZE);

    p = use(programs.surface);
    bindTexture(p, "uFluid", 0, fluid[0].texture);
    bindTexture(p, "uSpikes", 1, spikes[0].texture);
    bindTexture(p, "uPeak", 2, peak.texture);
    bindTexture(p, "uField", 3, field.texture);
    gl.uniform1f(p.at("uCell"), SURFACE_CELL);
    gl.uniform1f(p.at("uFluidCell"), FLUID_CELL);
    gl.uniform1f(p.at("uSpikeCell"), SPIKE_CELL);
    gl.uniform1f(p.at("uHalf"), HALF);
    gl.uniform1f(p.at("uRadius"), RADIUS);
    gl.uniform1i(p.at("uFluidSize"), FLUID_SIZE);
    gl.uniform1i(p.at("uSpikeSize"), SPIKE_SIZE);
    run(surface, SURFACE_SIZE);
  }

  function sceneUniforms(p: Program) {
    gl.uniform1i(p.at("uLight"), LIGHTS.indexOf(settings.light));
    gl.uniform3fv(p.at("uTable"), table);
    gl.uniform3fv(p.at("uRoom"), room);
    gl.uniform4f(
      p.at("uMagnet"),
      magnet.x,
      magnet.y,
      magnet.angle,
      present ? KINDS.indexOf(magnet.kind) : -1,
    );
    gl.uniform1f(p.at("uOutline"), 0.55);
    gl.uniform1f(p.at("uDishOuter"), OUTER);
    gl.uniform3fv(p.at("uCamera"), eye);
  }

  function render() {
    if (lost || !width) return;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);

    let p = use(programs.background);
    sceneUniforms(p);
    gl.uniformMatrix4fv(p.at("uInverse"), false, inverse);
    gl.uniform2f(p.at("uResolution"), canvas.width, canvas.height);
    gl.uniform1i(p.at("uOverlay"), 0);
    gl.bindVertexArray(quadArray);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);
    p = use(programs.fluid);
    sceneUniforms(p);
    bindTexture(p, "uSurface", 0, surface.texture);
    gl.uniformMatrix4fv(p.at("uViewProjection"), false, viewProjection);
    gl.uniform1f(p.at("uCell"), SURFACE_CELL);
    gl.uniform1f(p.at("uHalf"), HALF);
    gl.uniform1i(p.at("uSize"), SURFACE_SIZE);
    gl.uniform1f(p.at("uRadius"), RADIUS);
    gl.bindVertexArray(meshArray);
    gl.drawElements(gl.TRIANGLES, meshCount, gl.UNSIGNED_INT, 0);

    // The glass, far side first, over the fluid without hiding it.
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    p = use(programs.glass);
    sceneUniforms(p);
    gl.uniformMatrix4fv(p.at("uViewProjection"), false, viewProjection);
    gl.bindVertexArray(glassArray);
    gl.drawArrays(gl.TRIANGLES, 0, glassFar);
    gl.drawArrays(gl.TRIANGLES, glassFar, glassCount - glassFar);
    gl.depthMask(true);
    gl.disable(gl.DEPTH_TEST);

    if (overlay > 0.01 && present) {
      p = use(programs.background);
      sceneUniforms(p);
      gl.uniform1f(p.at("uOutline"), overlay);
      gl.uniformMatrix4fv(p.at("uInverse"), false, inverse);
      gl.uniform2f(p.at("uResolution"), canvas.width, canvas.height);
      gl.uniform1i(p.at("uOverlay"), 1);
      gl.bindVertexArray(quadArray);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    gl.disable(gl.BLEND);
    gl.bindVertexArray(null);
  }

  // Counts the peaks: points in the pattern taller than all eight of their neighbours.
  function countSpikes() {
    if (!canRead) return spikeCount;
    try {
      gl.bindFramebuffer(gl.FRAMEBUFFER, spikes[0].framebuffer);
      gl.readPixels(0, 0, SPIKE_SIZE, SPIKE_SIZE, gl.RGBA, gl.FLOAT, readback);
    } catch {
      canRead = false;
      return spikeCount;
    }
    let count = 0;
    const n = SPIKE_SIZE;
    for (let j = 1; j < n - 1; j++) {
      for (let i = 1; i < n - 1; i++) {
        const u = readback[(j * n + i) * 4];
        if (u < 0.35) continue;
        let top = true;
        for (let dj = -1; dj <= 1 && top; dj++) {
          for (let di = -1; di <= 1; di++) {
            if (!di && !dj) continue;
            const other = readback[((j + dj) * n + i + di) * 4];
            if (other > u || (other === u && dj * n + di > 0)) {
              top = false;
              break;
            }
          }
        }
        if (top) count++;
      }
    }
    return count;
  }

  // The strongest field normal to the floor, anywhere in the dish.
  function peakField() {
    let most = 0;
    for (let j = -10; j <= 10; j++) {
      for (let i = -10; i <= 10; i++) {
        const x = i * 4.4;
        const y = j * 4.4;
        if (x * x + y * y > RADIUS * RADIUS) continue;
        const [, , bz] = fieldAt(charges, x, y, PLANE);
        most = Math.max(most, Math.abs(bz));
      }
    }
    return most;
  }

  function report(now: number) {
    frames++;
    if (now - fpsSince >= 1000) {
      fps = Math.round((frames * 1000) / (now - fpsSince));
      frames = 0;
      fpsSince = now;
    }
    if (now - statsAt < 250) return;
    statsAt = now;
    spikeCount = countSpikes();
    if (!onStats) return;
    const stats: FerrofluidStats = {
      field: Math.round(peakField()),
      spikes: spikeCount,
      fps,
    };
    const key = JSON.stringify(stats);
    if (key === lastStats) return;
    lastStats = key;
    onStats(stats);
  }

  let running = false;
  let visible = true;
  let frame = 0;
  let last = 0;

  function tick(now: number) {
    const dt = clamp((now - last) / 1000, 0, 1 / 20);
    last = now;
    if (!lost) {
      step(dt);
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
  // The table follows the site's theme.
  const theme = new MutationObserver(readSurround);
  theme.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class", "style", "data-theme"],
  });

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

  readSurround();
  resize();
  start();

  return {
    setSettings(next: FerrofluidSettings) {
      if (next.amount !== settings.amount) {
        rescale *= next.amount / settings.amount;
      }
      settings = next;
    },
    // Turns the magnet over (or, of a pair, the second one), and says which way up it is now.
    flip() {
      magnet.flipped = !magnet.flipped;
      return magnet.flipped;
    },
    setPresent(on: boolean) {
      present = on;
    },
    // A clean dish with the fluid poured back in the middle.
    reset() {
      if (lost) return;
      gl.bindTexture(gl.TEXTURE_2D, fluid[0].texture);
      gl.texSubImage2D(
        gl.TEXTURE_2D,
        0,
        0,
        0,
        FLUID_SIZE,
        FLUID_SIZE,
        gl.RGBA,
        gl.FLOAT,
        puddle(settings.amount),
      );
      rescale = 1;
      gl.clearColor(0, 0, 0, 0);
      for (const target of spikes) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
        gl.clear(gl.COLOR_BUFFER_BIT);
      }
    },
    pointerDown(id: number, p: Point) {
      dragging = id;
      intro = null;
      target = tableAt(p);
    },
    pointerMove(id: number, p: Point) {
      if (dragging === id) target = tableAt(p);
    },
    pointerUp(id: number) {
      if (dragging === id) dragging = null;
    },
    // Moves the magnet by millimetres, from the keyboard.
    nudge(dx: number, dy: number) {
      intro = null;
      target = { x: target.x + dx, y: target.y + dy };
      const r = Math.hypot(target.x, target.y);
      if (r > REACH) {
        target.x *= REACH / r;
        target.y *= REACH / r;
      }
    },
    dispose() {
      cancelAnimationFrame(frame);
      running = false;
      observer.disconnect();
      intersection.disconnect();
      theme.disconnect();
      canvas.removeEventListener("webglcontextlost", onLost);
      canvas.removeEventListener("webglcontextrestored", onRestored);
    },
  };
}

export type Ferrofluid = ReturnType<typeof createFerrofluid>;
