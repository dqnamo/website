// A neon sign on a wall, bent from whatever you draw. See glass.ts for the colours and the
// bending, and shaders.ts for the light; this file keeps the tubes, runs the transformer and
// turns a pointer on the stage into lines on the pattern.
//
// The things to look for are all real. A drawn line becomes glass a stretch at a time, glowing
// orange behind the burner and cooling as it goes, and no corner comes out tighter than the
// glass will bend. Each tube ends in a black cap where it turns back through the wall to its
// electrode, and the light stops just short of it. Tubes strike with a stutter. Argon tubes
// need their drop of mercury to warm into vapour before they come up to colour, so they start
// dim and lilac, and in the cold they never quite get there; neon doesn't care. Paint stays
// dark when the sign is lit, which is how one tube is made to look as if it passes behind
// another. And one transformer only lights so much tube: past that the sign stutters and
// sizzles, and further still it won't strike at all.

import {
  bend,
  COLOUR_BY_VALUE,
  type Colour,
  type Point,
  pathLength,
  TUBE_RADIUS,
  type Vec3,
} from "./glass";
import { createHum } from "./hum";
import { type Sign, SIGNS } from "./signs";
import {
  BLOOM_DOWN,
  BLOOM_UP,
  COMPOSITE,
  EMIT,
  QUAD,
  TUBE_FRAGMENT,
  TUBE_VERTEX,
  WALL,
} from "./shaders";

export type Tool = "bend" | "recolour" | "blockout" | "remove";
export type Light = "day" | "dusk" | "night";
export type Wall = "brick" | "whitewash" | "board";

export type NeonSettings = {
  colour: Colour;
  tool: Tool;
  light: Light;
  wall: Wall;
  // Degrees Celsius, outside.
  temperature: number;
  hum: boolean;
};

export type NeonStats = {
  tubes: number;
  // Metres of tube on the wall.
  metres: number;
  // Tube on the wall over what the transformer can light.
  load: number;
  canUndo: boolean;
  fps: number | null;
};

// One 10 kV, 30 mA transformer lights about this much 12 mm tube, in millimetres.
export const CAPACITY = 5000;
// Past this share of it the transformer can't strike the sign at all.
const HARD_LIMIT = 1.3;
// Millimetres across the stage's shorter side.
const VIEW = 520;
const MAX_TUBES = 256;
const MAX_PIXELS = 2_600_000;
const CAP_RADIUS = TUBE_RADIUS * 1.4;
const SKETCH_RADIUS = 1.1;
// How far the tubes stand off the wall, which sets how far their shadows fall.
const STANDOFF = 40;
// How bright a lit tube is against the room's light.
const BRIGHTNESS = 1.35;
const STRIKE_DELAY = 0.35;

const LIGHTING: Record<
  Light,
  {
    ambient: Vec3;
    exposure: number;
    shadow: number;
    sun: number;
    bloom: number;
    near: number;
    far: number;
    vignette: number;
    sketch: number;
  }
> = {
  day: {
    ambient: [0.56, 0.56, 0.55],
    exposure: 1.5,
    shadow: 0.5,
    sun: 1.5,
    bloom: 0.05,
    near: 0.07,
    far: 0.045,
    vignette: 0.12,
    sketch: 0,
  },
  dusk: {
    ambient: [0.07, 0.08, 0.125],
    exposure: 1.5,
    shadow: 0.3,
    sun: 0.3,
    bloom: 0.1,
    near: 0.32,
    far: 0.24,
    vignette: 0.4,
    sketch: 0.04,
  },
  night: {
    ambient: [0.005, 0.0055, 0.008],
    exposure: 1.7,
    shadow: 0.15,
    sun: 0.03,
    bloom: 0.13,
    near: 0.42,
    far: 0.32,
    vignette: 0.6,
    sketch: 0.06,
  },
};

const WALL_KIND: Record<Wall, number> = { brick: 0, whitewash: 1, board: 2 };
const GLASS_KIND = { clear: 0, coated: 1, tinted: 2 } as const;

export const DEFAULT_SETTINGS: NeonSettings = {
  colour: "red",
  tool: "bend",
  light: "night",
  wall: "brick",
  temperature: 18,
  hum: false,
};

type Tube = {
  colour: Colour;
  points: Point[];
  // Distance along the tube at each point.
  along: Float32Array;
  length: number;
  // Blockout paint, point by point.
  blocked: Uint8Array;
  // When the bender starts on it, by the engine's clock, and how long the bending takes.
  born: number;
  forming: number;
  // When it last struck, while the sign is on.
  struck: number | null;
  // How much of its mercury is vapour, 0–1. Only argon tubes have any.
  warm: number;
  seed: number;
};

type Program = {
  program: WebGLProgram;
  at(name: string): WebGLUniformLocation | null;
};

type Target = {
  texture: WebGLTexture;
  framebuffer: WebGLFramebuffer;
  width: number;
  height: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function smoothstep(edge0: number, edge1: number, x: number) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function hash(n: number) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

// Smooth noise in one dimension, 0–1.
function wobble(x: number) {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  return hash(i) * (1 - u) + hash(i + 1) * u;
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

function distanceToSegment(p: Point, a: Point, b: Point) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length2 = dx * dx + dy * dy;
  const t =
    length2 > 1e-9
      ? clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / length2, 0, 1)
      : 0;
  return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
}

function crosses(a: Point, b: Point, c: Point, d: Point) {
  const d1 = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const d2 = (b.x - a.x) * (d.y - a.y) - (b.y - a.y) * (d.x - a.x);
  const d3 = (d.x - c.x) * (a.y - c.y) - (d.y - c.y) * (a.x - c.x);
  const d4 = (d.x - c.x) * (b.y - c.y) - (d.y - c.y) * (b.x - c.x);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

// How much of an argon tube's mercury can be vapour at a temperature, and how many seconds it
// takes to get there. Both are sped up a great deal: a real tube takes minutes on a cold night.
function vapourAt(temperature: number) {
  return 0.3 + 0.7 * smoothstep(-15, 12, temperature);
}

function warmingTime(temperature: number) {
  return 2.2 + 5 * smoothstep(15, -15, temperature);
}

export function createNeon(
  canvas: HTMLCanvasElement,
  {
    onStats,
    onNote,
  }: {
    onStats?: (stats: NeonStats) => void;
    onNote?: (note: string) => void;
  } = {},
) {
  const context = canvas.getContext("webgl2", {
    alpha: false,
    antialias: false,
    depth: false,
    powerPreference: "high-performance",
  });
  if (!context) throw new Error("WebGL2 is not available.");
  const gl = context;

  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const hum = createHum();

  let settings: NeonSettings = { ...DEFAULT_SETTINGS };

  // Layout, in CSS pixels, and millimetres to pixels.
  let width = 0;
  let height = 0;
  let ratio = 1;
  let scale = 1;
  let deviceWidth = 1;
  let deviceHeight = 1;

  let tubes: Tube[] = [];
  const history: Tube[][] = [];
  let power = true;
  let clock = 0;
  let load = 0;
  let lastStrike = -1;

  // The line being drawn, and the brush being painted with.
  let stroke: Point[] | null = null;
  let strokeId: number | null = null;
  let painting: { id: number; last: Point; changed: boolean } | null = null;

  // Things already explained, so each is said once.
  const noted = new Set<string>();
  function note(key: string, text: string) {
    if (noted.has(key)) return;
    noted.add(key);
    onNote?.(text);
  }

  // GL objects, made again if the context is lost and comes back.
  let programs: Record<string, Program> = {};
  let emptyArray: WebGLVertexArrayObject | null = null;
  let tubeArray: WebGLVertexArrayObject | null = null;
  let tubeBuffer: WebGLBuffer | null = null;
  let tubeData: WebGLTexture | null = null;
  let shapeFormat = 0;
  let gbuffer: {
    framebuffer: WebGLFramebuffer;
    shape: WebGLTexture;
    tag: WebGLTexture;
    depth: WebGLRenderbuffer;
  } | null = null;
  let emit: Target | null = null;
  let wall: Target | null = null;
  let down: Target[] = [];
  let up: Target[] = [];
  let instanceCount = 0;
  let instancesDirty = true;
  let wallDirty = true;
  let lost = false;
  const tubeRows = new Float32Array(MAX_TUBES * 4 * 3);

  function link(vertex: string, fragment: string): Program {
    const program = gl.createProgram();
    if (!program) throw new Error("Couldn't create a program.");
    gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, vertex));
    gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, fragment));
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

  function texture(
    w: number,
    h: number,
    format: number,
    type: number,
    filter: number,
  ) {
    const t = gl.createTexture();
    if (!t) throw new Error("Couldn't create a texture.");
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, format, w, h, 0, gl.RGBA, type, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }

  function makeTarget(w: number, h: number): Target {
    const t = texture(w, h, gl.RGBA16F, gl.HALF_FLOAT, gl.LINEAR);
    const framebuffer = gl.createFramebuffer();
    if (!framebuffer) throw new Error("Couldn't create a framebuffer.");
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      t,
      0,
    );
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      throw new Error("This browser can't draw into float textures.");
    }
    return { texture: t, framebuffer, width: w, height: h };
  }

  function freeTarget(target: Target | null) {
    if (!target) return;
    gl.deleteTexture(target.texture);
    gl.deleteFramebuffer(target.framebuffer);
  }

  function setupGl() {
    // Distances along a tube run to metres and need full floats; half floats will do for the
    // light.
    const full = gl.getExtension("EXT_color_buffer_float");
    if (!full && !gl.getExtension("EXT_color_buffer_half_float")) {
      throw new Error("This browser can't draw into float textures.");
    }
    shapeFormat = full ? gl.RGBA32F : gl.RGBA16F;

    programs = {
      tube: link(TUBE_VERTEX, TUBE_FRAGMENT),
      emit: link(QUAD, EMIT),
      down: link(QUAD, BLOOM_DOWN),
      up: link(QUAD, BLOOM_UP),
      wall: link(QUAD, WALL),
      composite: link(QUAD, COMPOSITE),
    };

    emptyArray = gl.createVertexArray();
    tubeArray = gl.createVertexArray();
    tubeBuffer = gl.createBuffer();
    gl.bindVertexArray(tubeArray);
    gl.bindBuffer(gl.ARRAY_BUFFER, tubeBuffer);
    for (let i = 0; i < 3; i++) {
      gl.enableVertexAttribArray(i);
      gl.vertexAttribPointer(i, 4, gl.FLOAT, false, 48, i * 16);
      gl.vertexAttribDivisor(i, 1);
    }
    gl.bindVertexArray(null);

    tubeData = texture(MAX_TUBES, 3, gl.RGBA32F, gl.FLOAT, gl.NEAREST);

    gbuffer = null;
    emit = null;
    wall = null;
    down = [];
    up = [];
    sizeTargets();
    instancesDirty = true;
    wallDirty = true;
  }

  function sizeTargets() {
    if (gbuffer) {
      gl.deleteFramebuffer(gbuffer.framebuffer);
      gl.deleteTexture(gbuffer.shape);
      gl.deleteTexture(gbuffer.tag);
      gl.deleteRenderbuffer(gbuffer.depth);
    }
    freeTarget(emit);
    freeTarget(wall);
    for (const target of [...down, ...up]) freeTarget(target);

    const w = deviceWidth;
    const h = deviceHeight;
    const shapeType = shapeFormat === gl.RGBA32F ? gl.FLOAT : gl.HALF_FLOAT;
    const shape = texture(w, h, shapeFormat, shapeType, gl.NEAREST);
    const tag = texture(w, h, gl.RGBA16F, gl.HALF_FLOAT, gl.NEAREST);
    const depth = gl.createRenderbuffer();
    const framebuffer = gl.createFramebuffer();
    if (!depth || !framebuffer) throw new Error("Couldn't create a buffer.");
    gl.bindRenderbuffer(gl.RENDERBUFFER, depth);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w, h);
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      shape,
      0,
    );
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT1,
      gl.TEXTURE_2D,
      tag,
      0,
    );
    gl.framebufferRenderbuffer(
      gl.FRAMEBUFFER,
      gl.DEPTH_ATTACHMENT,
      gl.RENDERBUFFER,
      depth,
    );
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      throw new Error("This browser can't draw into float textures.");
    }
    gbuffer = { framebuffer, shape, tag, depth };

    emit = makeTarget(w, h);
    wall = makeTarget(w, h);
    down = [];
    up = [];
    for (let level = 1; level <= 6; level++) {
      const lw = Math.max(1, Math.round(w / 2 ** level));
      const lh = Math.max(1, Math.round(h / 2 ** level));
      down.push(makeTarget(lw, lh));
      if (level < 6) up.push(makeTarget(lw, lh));
    }
    wallDirty = true;
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
    scale = Math.min(width, height) / VIEW;
    const w = Math.max(1, Math.round(width * ratio));
    const h = Math.max(1, Math.round(height * ratio));
    if (w === deviceWidth && h === deviceHeight && gbuffer) return;
    deviceWidth = w;
    deviceHeight = h;
    canvas.width = w;
    canvas.height = h;
    if (!lost && gbuffer) sizeTargets();
  }

  function toWall(p: Point): Point {
    return { x: (p.x - width / 2) / scale, y: (p.y - height / 2) / scale };
  }

  function makeTube(
    colour: Colour,
    points: Point[],
    born: number,
    forming: number,
  ): Tube {
    const along = new Float32Array(points.length);
    for (let i = 1; i < points.length; i++) {
      along[i] =
        along[i - 1] +
        Math.hypot(
          points[i].x - points[i - 1].x,
          points[i].y - points[i - 1].y,
        );
    }
    return {
      colour,
      points,
      along,
      length: along[along.length - 1],
      blocked: new Uint8Array(points.length),
      born,
      forming,
      struck: null,
      warm: 0,
      seed: Math.random() * 1000,
    };
  }

  // How long the bender takes over a tube: a moment to start and then about 1.5 m a second.
  function formingTime(length: number) {
    return reduceMotion.matches ? 0 : 0.22 + length / 1500;
  }

  function snapshot() {
    history.push(tubes.map((t) => ({ ...t, blocked: t.blocked.slice() })));
    if (history.length > 60) history.shift();
  }

  function nearestTube(p: Point, reach: number) {
    let best = -1;
    let bestDistance = reach;
    tubes.forEach((tube, index) => {
      for (let i = 1; i < tube.points.length; i++) {
        const d = distanceToSegment(p, tube.points[i - 1], tube.points[i]);
        if (d < bestDistance) {
          bestDistance = d;
          best = index;
        }
      }
    });
    return best;
  }

  function paint(a: Point, b: Point) {
    const brush = painting;
    if (!brush) return;
    const reach = TUBE_RADIUS + 4;
    for (const tube of tubes) {
      tube.points.forEach((point, i) => {
        if (!tube.blocked[i] && distanceToSegment(point, a, b) < reach) {
          tube.blocked[i] = 1;
          brush.changed = true;
        }
      });
    }
    instancesDirty = true;
  }

  // Paints a tube out where it last crosses another, so it seems to pass behind it there.
  function paintBehind(tube: Tube, over: Tube) {
    let last = -1;
    for (let i = 1; i < tube.points.length; i++) {
      for (let j = 1; j < over.points.length; j++) {
        if (
          crosses(
            tube.points[i - 1],
            tube.points[i],
            over.points[j - 1],
            over.points[j],
          )
        ) {
          last = i;
        }
      }
    }
    if (last < 0) return;
    const at = tube.points[last];
    tube.points.forEach((point, i) => {
      if (Math.hypot(point.x - at.x, point.y - at.y) < TUBE_RADIUS * 2.2) {
        tube.blocked[i] = 1;
      }
    });
  }

  function addTube(colour: Colour, raw: Point[]) {
    const bent = bend(raw);
    if (!bent) {
      if (pathLength(raw) > 8) {
        note(
          "short",
          "Too short for a tube: each one needs room for an electrode at both ends.",
        );
      }
      return;
    }
    if (tubes.length >= MAX_TUBES) {
      note("full", "That's as many tubes as this wall will take.");
      return;
    }
    snapshot();
    const forming = formingTime(bent.length);
    const tube = makeTube(colour, bent.points, clock, forming);
    if (reduceMotion.matches) tube.born = clock - 1;
    tubes.push(tube);
    instancesDirty = true;
    if (bent.sharp) {
      note(
        "sharp",
        "Hot glass won't bend much tighter than its own width, so every corner comes out round.",
      );
    }
  }

  function loadSign(sign: Sign) {
    const entry = SIGNS.find((s) => s.value === sign);
    if (!entry) return;
    if (tubes.length) snapshot();
    const parts = entry.tubes();
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const part of parts) {
      for (const p of part.points) {
        minX = Math.min(minX, p.x);
        maxX = Math.max(maxX, p.x);
        minY = Math.min(minY, p.y);
        maxY = Math.max(maxY, p.y);
      }
    }
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    tubes = [];
    // The bender works through the pattern one tube at a time.
    let start = clock + 0.25;
    for (const part of parts) {
      const bent = bend(part.points.map((p) => ({ x: p.x - cx, y: p.y - cy })));
      if (!bent) continue;
      const forming = formingTime(bent.length);
      const tube = makeTube(
        part.colour,
        bent.points,
        reduceMotion.matches ? clock - 1 : start,
        forming,
      );
      start += forming + 0.12;
      tubes.push(tube);
    }
    parts.forEach((part, index) => {
      if (part.behind !== undefined && tubes[index] && tubes[part.behind]) {
        paintBehind(tubes[index], tubes[part.behind]);
      }
    });
    instancesDirty = true;
  }

  // Every piece of tube as an instance: glass, the two caps, and the line being drawn.
  function upload() {
    instancesDirty = false;
    let count = 0;
    for (const tube of tubes) count += tube.points.length - 1 + 2;
    if (stroke) count += Math.max(0, stroke.length - 1);
    const data = new Float32Array(Math.max(count, 1) * 12);
    let o = 0;
    const push = (
      a: Point,
      b: Point,
      s0: number,
      s1: number,
      index: number,
      kind: number,
      b0: number,
      b1: number,
      radius: number,
      offset: number,
    ) => {
      data[o++] = a.x;
      data[o++] = a.y;
      data[o++] = b.x;
      data[o++] = b.y;
      data[o++] = s0;
      data[o++] = s1;
      data[o++] = index;
      data[o++] = kind;
      data[o++] = b0;
      data[o++] = b1;
      data[o++] = radius;
      data[o++] = offset;
    };
    tubes.forEach((tube, index) => {
      const { points, along, blocked } = tube;
      for (let i = 1; i < points.length; i++) {
        push(
          points[i - 1],
          points[i],
          along[i - 1],
          along[i],
          index,
          0,
          blocked[i - 1],
          blocked[i],
          TUBE_RADIUS,
          tube.length,
        );
      }
      const first = points[0];
      const last = points[points.length - 1];
      push(first, first, 0, 0, index, 1, 0, 0, CAP_RADIUS, 0);
      push(last, last, tube.length, tube.length, index, 1, 0, 0, CAP_RADIUS, 0);
    });
    if (stroke) {
      for (let i = 1; i < stroke.length; i++) {
        push(stroke[i - 1], stroke[i], 0, 0, 0, 2, 0, 0, SKETCH_RADIUS, 0);
      }
    }
    instanceCount = count;
    gl.bindBuffer(gl.ARRAY_BUFFER, tubeBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
  }

  function ignition(t: number, seed: number) {
    if (t < 0) return 0;
    if (reduceMotion.matches || t > 0.5) return 1;
    const k = Math.floor(t * 36);
    const on = hash(k * 12.9898 + seed) < 0.2 + 1.7 * t;
    return on ? 0.55 + 0.45 * hash(k + seed * 3.1) : 0.02;
  }

  // What the transformer manages to give, 0–1: everything within its limit, then less and
  // less steadily, and past the hard limit only the odd failed attempt to strike.
  function supply() {
    if (load <= 1) return 1;
    const strain = (load - 1) / (HARD_LIMIT - 1);
    if (strain >= 1) {
      if (reduceMotion.matches) return 0;
      const phase = clock % 1.7;
      return phase < 0.14 ? 0.3 * hash(Math.floor(clock * 40)) : 0;
    }
    if (reduceMotion.matches) return 1 - 0.5 * strain;
    const flutter = 0.5 + 0.5 * wobble(clock * 14);
    const drop = wobble(clock * 3.1 + 7) < 0.15 + strain * 0.4 ? 0.06 : 1;
    return (1 - 0.35 * strain) * flutter * drop;
  }

  function step(dt: number) {
    clock += dt;
    let total = 0;
    for (const tube of tubes) {
      if (clock >= tube.born + tube.forming) total += tube.length;
    }
    const before = load;
    load = total / CAPACITY;
    if (load > 1 && before <= 1) {
      note(
        "load",
        `One transformer lights about ${CAPACITY / 1000} m of 12 mm tube. Past that the sign struggles: it stutters, sizzles and, further still, won't strike at all.`,
      );
    }
    const vapour = vapourAt(settings.temperature);
    const warming = warmingTime(settings.temperature);
    let struck = false;
    for (const tube of tubes) {
      const ready = clock >= tube.born + tube.forming + STRIKE_DELAY;
      if (!power) tube.struck = null;
      else if (tube.struck === null && ready) {
        tube.struck = clock;
        struck = true;
      }
      if (COLOUR_BY_VALUE[tube.colour].gas !== "argon") continue;
      const lit =
        tube.struck !== null && clock >= tube.struck && load < HARD_LIMIT;
      const goal = lit ? vapour : 0;
      tube.warm +=
        (goal - tube.warm) * (1 - Math.exp(-dt / (lit ? warming : 2.5)));
    }
    if (struck && clock - lastStrike > 0.08) {
      lastStrike = clock;
      if (load < HARD_LIMIT) hum.strike();
    }
    if (stroke) instancesDirty = true;
  }

  function writeTubeRows(given: number) {
    tubeRows.fill(0);
    const row = MAX_TUBES * 4;
    let litLength = 0;
    tubes.forEach((tube, index) => {
      if (index >= MAX_TUBES) return;
      const spec = COLOUR_BY_VALUE[tube.colour];
      let colour = spec.lit;
      let level = 1;
      if (spec.gas === "argon") {
        const w = tube.warm;
        const k = w ** 0.8;
        colour = [
          spec.cold[0] + (spec.lit[0] - spec.cold[0]) * k,
          spec.cold[1] + (spec.lit[1] - spec.cold[1]) * k,
          spec.cold[2] + (spec.lit[2] - spec.cold[2]) * k,
        ];
        level = 0.3 + 0.7 * w;
      }
      const on =
        tube.struck === null
          ? 0
          : ignition(clock - tube.struck, tube.seed) * given;
      const light = on * level * BRIGHTNESS;
      litLength += tube.length * on;
      const o = index * 4;
      tubeRows[o] = colour[0] * light;
      tubeRows[o + 1] = colour[1] * light;
      tubeRows[o + 2] = colour[2] * light;
      tubeRows[o + 3] = GLASS_KIND[spec.glass];
      tubeRows[row + o] = spec.tint[0];
      tubeRows[row + o + 1] = spec.tint[1];
      tubeRows[row + o + 2] = spec.tint[2];
      const progress =
        tube.forming > 0 ? clamp((clock - tube.born) / tube.forming, 0, 1) : 1;
      const doneAt = tube.born + tube.forming;
      tubeRows[row * 2 + o] =
        clock < tube.born
          ? -1
          : progress >= 1
            ? tube.length + 1
            : progress * tube.length;
      // The glass cools for about half a second behind the burner.
      tubeRows[row * 2 + o + 1] =
        tube.forming > 0 ? (tube.length / tube.forming) * 0.45 : 1;
      tubeRows[row * 2 + o + 2] =
        reduceMotion.matches || clock < tube.born
          ? 0
          : progress < 1
            ? 1
            : Math.exp(-(clock - doneAt) / 0.6);
      tubeRows[row * 2 + o + 3] = tube.length;
    });
    gl.bindTexture(gl.TEXTURE_2D, tubeData);
    gl.texSubImage2D(
      gl.TEXTURE_2D,
      0,
      0,
      0,
      MAX_TUBES,
      3,
      gl.RGBA,
      gl.FLOAT,
      tubeRows,
    );
    return litLength;
  }

  function select(program: Program) {
    // biome-ignore lint/correctness/useHookAtTopLevel: WebGL's useProgram, not a React hook.
    gl.useProgram(program.program);
    return program;
  }

  function bind(program: Program, name: string, unit: number, t: WebGLTexture) {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.uniform1i(program.at(name), unit);
  }

  function into(target: Target | null) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.framebuffer : null);
    gl.viewport(
      0,
      0,
      target ? target.width : deviceWidth,
      target ? target.height : deviceHeight,
    );
  }

  function quad() {
    gl.bindVertexArray(emptyArray);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function drawWall() {
    if (!wall) return;
    wallDirty = false;
    const p = select(programs.wall);
    into(wall);
    gl.uniform2f(p.at("uView"), width, height);
    gl.uniform1f(p.at("uScale"), scale);
    gl.uniform1f(p.at("uRatio"), deviceWidth / width);
    gl.uniform1i(p.at("uKind"), WALL_KIND[settings.wall]);
    quad();
  }

  function render() {
    if (!gbuffer || !emit || !wall || !tubeData) return;
    const lighting = LIGHTING[settings.light];
    const given = supply();
    const litLength = writeTubeRows(given);
    hum.update(
      litLength > 0 ? 0.35 + 0.65 * Math.min(1, litLength / 3000) : 0,
      clamp((load - 1) / (HARD_LIMIT - 1), 0, 1) * (litLength > 0 ? 1 : 0.4),
    );
    if (wallDirty) drawWall();
    if (instancesDirty) upload();

    // The tubes into the buffers.
    gl.bindFramebuffer(gl.FRAMEBUFFER, gbuffer.framebuffer);
    gl.viewport(0, 0, deviceWidth, deviceHeight);
    gl.clearBufferfv(gl.COLOR, 0, [0, 0, 0, 0]);
    gl.clearBufferfv(gl.COLOR, 1, [0, 0, 0, 0]);
    gl.clearBufferfv(gl.DEPTH, 0, [1]);
    if (instanceCount) {
      const p = select(programs.tube);
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LESS);
      gl.depthMask(true);
      gl.uniform2f(p.at("uView"), width, height);
      gl.uniform1f(p.at("uScale"), scale);
      gl.uniform1f(p.at("uAa"), 1 / (scale * (deviceWidth / width)));
      gl.uniform1f(p.at("uTubes"), Math.max(tubes.length, 1));
      gl.uniform1f(p.at("uRadius"), TUBE_RADIUS);
      gl.bindVertexArray(tubeArray);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, instanceCount);
      gl.disable(gl.DEPTH_TEST);
    }

    // The light they give.
    {
      const p = select(programs.emit);
      into(emit);
      bind(p, "uShape", 0, gbuffer.shape);
      bind(p, "uTag", 1, gbuffer.tag);
      bind(p, "uTubes", 2, tubeData);
      quad();
    }

    // Spread out, down the pyramid and back up.
    {
      const p = select(programs.down);
      let source: Target = emit;
      for (const target of down) {
        into(target);
        bind(p, "uSource", 0, source.texture);
        gl.uniform2f(p.at("uTexel"), 1 / source.width, 1 / source.height);
        quad();
        source = target;
      }
    }
    {
      const p = select(programs.up);
      let source: Target = down[down.length - 1];
      for (let level = up.length - 1; level >= 0; level--) {
        const target = up[level];
        into(target);
        bind(p, "uSource", 0, source.texture);
        bind(p, "uSame", 1, down[level].texture);
        gl.uniform2f(p.at("uTexel"), 1 / source.width, 1 / source.height);
        quad();
        source = target;
      }
    }

    // And everything together on the screen.
    {
      const p = select(programs.composite);
      into(null);
      bind(p, "uWall", 0, wall.texture);
      bind(p, "uShape", 1, gbuffer.shape);
      bind(p, "uTag", 2, gbuffer.tag);
      bind(p, "uEmit", 3, emit.texture);
      bind(p, "uBloom", 4, up[0].texture);
      bind(p, "uNear", 5, up[2].texture);
      bind(p, "uFar", 6, up[4].texture);
      bind(p, "uShadow", 7, down[1].texture);
      bind(p, "uTubes", 8, tubeData);
      const px = deviceWidth / width;
      gl.uniform2f(p.at("uResolution"), deviceWidth, deviceHeight);
      gl.uniform3fv(p.at("uAmbient"), lighting.ambient);
      // The room's light comes from above left, so shadows fall below right.
      const reach = STANDOFF * scale * px;
      gl.uniform2f(
        p.at("uShadowOffset"),
        (0.45 * reach) / deviceWidth,
        (-0.65 * reach) / deviceHeight,
      );
      gl.uniform1f(p.at("uShadowStrength"), lighting.shadow);
      const sun: Vec3 = [-0.42, -0.62, 0.66];
      const length = Math.hypot(...sun);
      gl.uniform3f(
        p.at("uSun"),
        sun[0] / length,
        sun[1] / length,
        sun[2] / length,
      );
      gl.uniform1f(p.at("uSunStrength"), lighting.sun);
      gl.uniform1f(
        p.at("uRefract"),
        (TUBE_RADIUS * 0.35 * scale * px) / deviceWidth,
      );
      gl.uniform1f(p.at("uRadius"), TUBE_RADIUS);
      gl.uniform1f(p.at("uExposure"), lighting.exposure);
      gl.uniform1f(p.at("uBloomGain"), lighting.bloom);
      gl.uniform1f(p.at("uNearGain"), lighting.near);
      gl.uniform1f(p.at("uFarGain"), lighting.far);
      gl.uniform1f(p.at("uSketchGlow"), lighting.sketch);
      gl.uniform1f(p.at("uVignette"), lighting.vignette);
      gl.uniform1f(p.at("uTime"), clock);
      quad();
    }
  }

  // Stats a few times a second, and only when they change.
  let lastStats = "";
  let statsAt = 0;
  let frames = 0;
  let fpsSince = 0;
  let fps: number | null = null;

  function report(now: number) {
    frames++;
    if (now - fpsSince >= 1000) {
      fps = Math.round((frames * 1000) / (now - fpsSince));
      frames = 0;
      fpsSince = now;
    }
    if (now - statsAt < 250 || !onStats) return;
    statsAt = now;
    const total = tubes.reduce((sum, tube) => sum + tube.length, 0);
    const stats: NeonStats = {
      tubes: tubes.length,
      metres: Math.round(total / 10) / 100,
      load: Math.round((total / CAPACITY) * 100) / 100,
      canUndo: history.length > 0,
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
  loadSign("open");
  history.length = 0;
  start();

  return {
    setSettings(next: NeonSettings) {
      if (next.wall !== settings.wall) wallDirty = true;
      if (next.hum !== settings.hum) hum.setEnabled(next.hum);
      if (
        next.temperature < 5 &&
        settings.temperature >= 5 &&
        tubes.some((t) => COLOUR_BY_VALUE[t.colour].gas === "argon")
      ) {
        note(
          "cold",
          "In the cold, the mercury in the argon tubes won't all turn to vapour, so they stay dim and lilac. Neon has nothing to wait for.",
        );
      }
      settings = next;
    },
    setPower(on: boolean) {
      if (on === power) return;
      power = on;
      for (const tube of tubes) {
        tube.struck =
          on && clock >= tube.born + tube.forming
            ? clock + Math.random() * 0.05
            : null;
      }
    },
    loadSign,
    undo() {
      const previous = history.pop();
      if (!previous) return;
      tubes = previous;
      stroke = null;
      strokeId = null;
      painting = null;
      instancesDirty = true;
    },
    clear() {
      if (!tubes.length) return;
      snapshot();
      tubes = [];
      instancesDirty = true;
    },
    pointerDown(id: number, p: Point) {
      const at = toWall(p);
      const tool = settings.tool;
      if (tool === "bend") {
        stroke = [at];
        strokeId = id;
        instancesDirty = true;
      } else if (tool === "blockout") {
        snapshot();
        painting = { id, last: at, changed: false };
        paint(at, at);
      } else {
        const index = nearestTube(at, TUBE_RADIUS + 5);
        if (index < 0) return;
        snapshot();
        if (tool === "remove") {
          tubes.splice(index, 1);
        } else {
          const tube = tubes[index];
          // Pumped out and filled again: it has to strike, and warm, from the start.
          tubes[index] = {
            ...tube,
            colour: settings.colour,
            struck: null,
            warm: 0,
            seed: Math.random() * 1000,
          };
        }
        instancesDirty = true;
      }
    },
    pointerMove(id: number, p: Point) {
      const at = toWall(p);
      if (stroke && strokeId === id) {
        const tail = stroke[stroke.length - 1];
        if (Math.hypot(at.x - tail.x, at.y - tail.y) > 1) {
          stroke.push(at);
          instancesDirty = true;
        }
      } else if (painting && painting.id === id) {
        paint(painting.last, at);
        painting.last = at;
      }
    },
    pointerUp(id: number) {
      if (stroke && strokeId === id) {
        const raw = stroke;
        stroke = null;
        strokeId = null;
        instancesDirty = true;
        addTube(settings.colour, raw);
      } else if (painting && painting.id === id) {
        if (!painting.changed) history.pop();
        else {
          note(
            "paint",
            "Painted glass stays dark. Black out a tube where it crosses another and it seems to pass behind.",
          );
        }
        painting = null;
      }
    },
    pointerCancel(id: number) {
      if (strokeId === id) {
        stroke = null;
        strokeId = null;
        instancesDirty = true;
      }
      if (painting && painting.id === id) {
        if (!painting.changed) history.pop();
        painting = null;
      }
    },
    dispose() {
      cancelAnimationFrame(frame);
      running = false;
      observer.disconnect();
      intersection.disconnect();
      hum.dispose();
      canvas.removeEventListener("webglcontextlost", onLost);
      canvas.removeEventListener("webglcontextrestored", onRestored);
    },
  };
}

export type Neon = ReturnType<typeof createNeon>;
