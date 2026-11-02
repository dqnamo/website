// A pencil sharpener on a desk, seen from above. Turn the pencil in the block and the blade
// pares a strip off it; the strip comes out of the slot and fans out into a frilly ring.
//
// The ring is geometry, not decoration. The blade lies along the bore, a cone, and every turn
// it takes off a layer of that cone's surface. A cone's surface rolls out flat into a fan (that
// is how paper party hats are made), and a cone of half-angle α rolls out to a fan of 2π·sin α
// for each turn: 72° for an ordinary 23° point, so about five turns close a ring, and seven for a
// long point. The paint is on the outside of the pencil, so it lands on the outer edge of the
// fan; on a six-sided pencil the corners reach further out than the flats, so they meet the
// cone further back and the edge waves six times a turn, while a round pencil leaves a plain
// edge. The lead runs down the middle, so once the cut reaches it the inner edge goes grey and
// the lead itself crumbles. The wood comes in two slats glued round the lead, so each turn
// crosses the glue line twice. A new pencil's flat end meets the bore at its corners first and
// comes off as chips until the cone is round.
//
// So the model keeps the pencil's actual shape, the prism cut by the cones it has been
// sharpened to and the end of its lead, and each few degrees of turn it works out which band of
// the section the blade passes through: from how far out the new cone meets what's left of the
// old shape, to the pencil's skin. That band is recorded against the angle the pencil faced, and
// the shader unrolls the record into the shaving, paint, glue line, grain and all. The blade has
// one edge, so turned backwards it cuts nothing; each turn feeds the pencil in by the
// shaving's thickness, so it slides visibly into the block; once sharp, every turn only shortens
// it. Soft leads snap if they're turned hard as the point forms, a dropped pencil's lead is
// cracked inside and keeps falling out, and writing wears the point back down.

import {
  BODY,
  type BladeId,
  type BodyId,
  bodyLength,
  boreLength,
  FEED,
  HALF_ANGLE,
  PENCILS,
  type PencilId,
  type PencilSpec,
  type PointId,
  pencilIndex,
  reach,
} from "./pencils";
import { FS, VS } from "./shaders";
import { createSound } from "./sound";

export type { BladeId, BodyId, PencilId, PointId } from "./pencils";

export type SharpenerSettings = {
  pencil: PencilId;
  point: PointId;
  blade: BladeId;
  body: BodyId;
  sound: boolean;
};

export const DEFAULT_SETTINGS: SharpenerSettings = {
  pencil: "yellow",
  point: "standard",
  blade: "sharp",
  body: "magnesium",
  sound: true,
};

export type SharpenerStats = {
  // The width of the point, in millimetres.
  point: number;
  length: number;
  // Turns that cut since the pencil went into the sharpener.
  turns: number;
  docked: boolean;
  fps: number | null;
};

type Point = { x: number; y: number };
type Vec = [number, number, number];
type Cone = { a: number; tan: number };

type Pencil = {
  spec: PencilSpec;
  pal: number;
  // Where the lead (and, before it's sharpened, the factory-cut end) stops, along the pencil
  // from the back of the wood.
  end: number;
  // The cones it has been sharpened to, newest first.
  cones: Cone[];
  glue: number;
  ringAngle: number;
  ringPhase: number;
  // Cracks in the lead, from being dropped.
  cracks: number[];
  // How roughly its cone was last cut.
  torn: number;
  pitch: number;
};

type Shaving = {
  row: number;
  pal: number;
  sides: number;
  flat: number;
  rounding: number;
  corner: number;
  lead: number;
  sinA: number;
  theta0: number;
  data: Float32Array;
  count: number;
  seed: number;
  torn: number;
  glue: number;
  ringAngle: number;
  ringPhase: number;
  breakAt: number;
  x: number;
  y: number;
  z: number;
  rot: number;
  mirror: number;
  alpha: number;
  state: "live" | "falling" | "resting" | "swept";
  // A fall from where it broke off to where it lands.
  from: Vec & { r?: number };
  to: Vec;
  fromRot: number;
  toRot: number;
  t: number;
  span: number;
  order: number;
  dirty: boolean;
};

type Mode = "docked" | "carried" | "writing" | "lying";

type Pose = {
  // The tip, the way the pencil points (round from +x) and how steeply it points down.
  tip: Vec;
  heading: number;
  tilt: number;
};

// Each recorded slice of a shaving is 4° of turn.
const SLICE = Math.PI / 45;
const MAX_SLICES = 1024;
const ROWS = 64;
const HEAD_W = 6;
const PAPER = { w: 78, h: 58, texels: 14 };
// The writing hand holds the pencil at 40° to the page, leaning up and to the right.
const WRITE_TILT = (40 * Math.PI) / 180;
const WRITE_HEADING = Math.atan2(0.77, -0.64);
// Below this the sharpener can't be held against the fingers.
const SHORTEST = 48;
// Graphite left on the paper, cubic millimetres for each square millimetre of line, at HB.
const WEAR = 0.0011;

const LAYOUTS = {
  wide: { w: 160, h: 112, sharpener: [114, 36], paper: [54, 75, -0.04] },
  tall: { w: 84, h: 128, sharpener: [50, 30], paper: [42, 91, -0.03] },
} as const;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const smooth = (t: number) => t * t * (3 - 2 * t);
const wrap = (a: number) => a - Math.PI * 2 * Math.round(a / (Math.PI * 2));
const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);

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

// ---- The pencil's shape ---------------------------------------------------------------------------

// The solid is everything no further along than min(end, aᵢ − ρ/tan αᵢ) at radius ρ: each of
// these is a straight line in ρ, written as c0 − c1·ρ.
const terms = (p: Pencil) => [
  { c0: p.end, c1: 0 },
  ...p.cones.map((c) => ({ c0: c.a, c1: 1 / c.tan })),
];

const tipOf = (p: Pencil) => Math.min(p.end, ...p.cones.map((c) => c.a));

// How wide the point is: the radius where the lead stops.
function pointRadius(p: Pencil) {
  const tip = tipOf(p);
  let r = p.spec.corner;
  for (const c of p.cones) r = Math.min(r, Math.max(0, (c.a - tip) * c.tan));
  return r;
}

// Where the bore's apex sits, along the pencil, when it's pushed in until it touches.
function contactApex(p: Pencil, tan: number) {
  const ts = terms(p);
  const k = 1 / tan;
  const R = p.spec.corner;
  const g = (rho: number) =>
    Math.min(...ts.map((t) => t.c0 + (k - t.c1) * rho));
  let best = Math.max(g(0), g(R));
  for (let i = 0; i < ts.length; i++) {
    for (let j = i + 1; j < ts.length; j++) {
      const ds = ts[j].c1 - ts[i].c1;
      if (Math.abs(ds) < 1e-9) continue;
      const rho = (ts[j].c0 - ts[i].c0) / ds;
      if (rho > 0 && rho < R) best = Math.max(best, g(rho));
    }
  }
  return best;
}

// The band of radii the bore takes off when its apex moves to a: material that was further
// along than the new cone.
function cutBand(p: Pencil, a: number, tan: number) {
  const k = 1 / tan;
  let lo = 0;
  let hi = 9;
  for (const t of terms(p)) {
    const c0 = t.c0 - a;
    const c1 = k - t.c1;
    if (Math.abs(c1) < 1e-9) {
      if (c0 <= 0) return null;
      continue;
    }
    const r = -c0 / c1;
    if (c1 > 0) lo = Math.max(lo, r);
    else hi = Math.min(hi, r);
  }
  return lo < hi ? { lo, hi } : null;
}

// Take the new cone, and forget any older one that no longer shapes the pencil anywhere.
function recut(p: Pencil, a: number, tan: number) {
  const others = p.cones.filter((c) => Math.abs(c.tan - tan) > 1e-6);
  p.cones = [{ a, tan }, ...others];
  if (p.cones.length > 1) {
    const used = new Set<number>([0]);
    const R = p.spec.corner;
    for (let i = 0; i <= 40; i++) {
      const rho = (R * i) / 40;
      let best = Number.POSITIVE_INFINITY;
      let who = -1;
      p.cones.forEach((c, j) => {
        const s = c.a - rho / c.tan;
        if (s < best - 1e-7) {
          best = s;
          who = j;
        }
      });
      if (who >= 0 && best < p.end) used.add(who);
    }
    p.cones = p.cones.filter((_, j) => used.has(j)).slice(0, 3);
  }
}

function makePencil(spec: PencilSpec, used: boolean, tan: number): Pencil {
  const p: Pencil = {
    spec,
    pal: pencilIndex(spec.id),
    end: used ? spec.usedLength : spec.length,
    cones: [],
    glue: rand(0, Math.PI),
    ringAngle: rand(0, Math.PI * 2),
    ringPhase: rand(0, 10),
    cracks: [],
    torn: 0,
    pitch: FEED.sharp,
  };
  // A used pencil was sharpened once and written blunt.
  if (used) p.cones = [{ a: p.end + 0.5 / tan, tan }];
  return p;
}

// ---- The engine -----------------------------------------------------------------------------------

export type Sharpener = ReturnType<typeof createSharpener>;

export function createSharpener(
  canvas: HTMLCanvasElement,
  {
    onStats,
    onNote,
  }: {
    onStats?: (stats: SharpenerStats) => void;
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

  const texture = (unit: number) => {
    const t = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  };

  // Shavings: a row of numbers each, and a row of cut bands each.
  const headTex = texture(0);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA32F,
    HEAD_W,
    ROWS,
    0,
    gl.RGBA,
    gl.FLOAT,
    null,
  );
  const headData = new Float32Array(HEAD_W * ROWS * 4);
  const sliceTex = texture(1);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RG32F,
    MAX_SLICES,
    ROWS,
    0,
    gl.RG,
    gl.FLOAT,
    null,
  );

  // The notepad's marks, in the page's own millimetres.
  const marks = document.createElement("canvas");
  marks.width = PAPER.w * PAPER.texels;
  marks.height = PAPER.h * PAPER.texels;
  const marksCtx = marks.getContext("2d");
  if (!marksCtx) throw new Error("Couldn't draw on the page");
  const marksTex = texture(2);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  let marksDirty = true;

  // The stamp along the pencil, as a mask.
  const stamp = document.createElement("canvas");
  stamp.width = 1600;
  stamp.height = 72;
  const stampCtx = stamp.getContext("2d");
  if (!stampCtx) throw new Error("Couldn't stamp the pencil");
  const stampTex = texture(3);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  const STAMP = { from: 80, length: 58, half: 1.35 };
  const drawStamp = (text: string) => {
    stampCtx.clearRect(0, 0, stamp.width, stamp.height);
    stampCtx.fillStyle = "#fff";
    stampCtx.textBaseline = "middle";
    stampCtx.font = "600 46px Georgia, 'Times New Roman', serif";
    stampCtx.letterSpacing = "6px";
    stampCtx.fillText(text, 8, stamp.height / 2 + 2);
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, stampTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, stamp);
  };

  // biome-ignore lint/correctness/useHookAtTopLevel: WebGL's useProgram, not a React hook.
  gl.useProgram(scene.program);
  gl.uniform1i(u("uHead"), 0);
  gl.uniform1i(u("uSlices"), 1);
  gl.uniform1i(u("uMarks"), 2);
  gl.uniform1i(u("uStamp"), 3);
  const palette = (pick: (p: PencilSpec) => number[]) =>
    new Float32Array(PENCILS.flatMap(pick));
  gl.uniform3fv(
    u("uPaintA"),
    palette((p) => p.paint),
  );
  gl.uniform3fv(
    u("uPaintB"),
    palette((p) => p.paint2),
  );
  gl.uniform3fv(
    u("uPrimer"),
    palette((p) => p.primer),
  );
  gl.uniform3fv(
    u("uEndCol"),
    palette((p) => p.endColour),
  );
  gl.uniform3fv(
    u("uFoil"),
    palette((p) => p.foil),
  );
  gl.uniform3fv(
    u("uCore"),
    palette((p) => p.core),
  );
  gl.uniform2fv(
    u("uCoreFx"),
    palette((p) => [p.sheen, p.wood === "lime" ? 1 : 0]),
  );

  const sound = createSound();
  let settings: SharpenerSettings = { ...DEFAULT_SETTINGS };
  let night = false;
  let dirty = true;
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---- The view -----------------------------------------------------------------------------

  let width = 0;
  let height = 0;
  let cssW = 0;
  let cssH = 0;
  // CSS pixels to the millimetre, and the desk under the top-left corner.
  let pxPerMm = 5;
  let origin = { x: 0, y: 0 };
  let layout: keyof typeof LAYOUTS = "wide";
  const block = { x: 114, y: 36 };
  const paper = { x: 54, y: 75, rot: -0.04 };

  const tan = () => Math.tan(HALF_ANGLE[settings.point]);
  const sinA = () => Math.sin(HALF_ANGLE[settings.point]);
  const halfLength = () => bodyLength(settings.point) / 2;
  // The bore's apex, in the block's own frame and on the desk.
  const apexX = () => halfLength() - BODY.beyond;
  const apex = (): Vec => [block.x + apexX(), block.y, BODY.axis];

  const placeLayout = (next: keyof typeof LAYOUTS) => {
    const l = LAYOUTS[next];
    const dx = l.sharpener[0] - block.x;
    const dy = l.sharpener[1] - block.y;
    const px = l.paper[0] - paper.x;
    const py = l.paper[1] - paper.y;
    block.x = l.sharpener[0];
    block.y = l.sharpener[1];
    paper.x = l.paper[0];
    paper.y = l.paper[1];
    paper.rot = l.paper[2];
    for (const s of shavings) {
      s.x += dx;
      s.y += dy;
      s.to[0] += dx;
      s.to[1] += dy;
    }
    if (mode === "lying" || mode === "carried") {
      pose.tip[0] += px;
      pose.tip[1] += py;
    }
    layout = next;
  };

  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cw = Math.max(1, canvas.clientWidth);
    const ch = Math.max(1, canvas.clientHeight);
    let scale = Math.max(dpr, 1.5);
    scale = Math.min(scale, Math.sqrt(2.8e6 / (cw * ch)));
    const w = Math.max(1, Math.round(cw * scale));
    const h = Math.max(1, Math.round(ch * scale));
    if (w === width && h === height && cw === cssW && ch === cssH) return;
    width = w;
    height = h;
    cssW = cw;
    cssH = ch;
    canvas.width = w;
    canvas.height = h;
    const next = cw / ch < 1.05 ? "tall" : "wide";
    if (next !== layout) placeLayout(next);
    const box = LAYOUTS[layout];
    pxPerMm = Math.min(cw / box.w, ch / box.h);
    origin = {
      x: box.w / 2 - cw / 2 / pxPerMm,
      y: box.h / 2 - ch / 2 / pxPerMm,
    };
    dirty = true;
  };

  const toDesk = (p: Point): Point => ({
    x: origin.x + p.x / pxPerMm,
    y: origin.y + p.y / pxPerMm,
  });
  const view = () => ({
    x0: origin.x,
    y0: origin.y,
    x1: origin.x + cssW / pxPerMm,
    y1: origin.y + cssH / pxPerMm,
  });

  // ---- The pencil ---------------------------------------------------------------------------

  let pencil = makePencil(PENCILS[0], true, tan());
  let mode: Mode = "docked";
  // Where the bore's apex is along the pencil while it's in the sharpener.
  let bite = contactApex(pencil, tan());
  let roll = 1.25;
  // The furthest it has been turned forwards, and the turn the last slice was cut at: the blade
  // only cuts on new ground.
  let ahead = roll;
  let sliceAt = roll;
  let lastSlice: { g: number; lo: number; hi: number } | null = null;
  let turns = 0;
  let backwards = 0;
  let spin = 0;
  let spinLast = roll;
  const pose: Pose = { tip: [0, 0, 0], heading: 0, tilt: 0 };
  // A move from one pose to another.
  let glide: { from: Pose; to: () => Pose; t: number; span: number } | null =
    null;
  let rollSpeed = 0;

  const axisDir = (p: Pose): Vec => [
    Math.cos(p.tilt) * Math.cos(p.heading),
    Math.cos(p.tilt) * Math.sin(p.heading),
    -Math.sin(p.tilt),
  ];
  const meanRadius = () => 0.5 * (pencil.spec.flat + pencil.spec.corner);

  const dockedPose = (): Pose => {
    const tip = tipOf(pencil);
    const a = apex();
    return { tip: [a[0] - (bite - tip), a[1], a[2]], heading: 0, tilt: 0 };
  };

  // How high the axis rides when the pencil lies on its side at this turn.
  const lyingHeight = () => {
    const { sides, flat, rounding } = pencil.spec;
    if (sides === 0) return flat;
    return reach(-Math.PI / 2 - roll, sides, flat, rounding);
  };

  const backEnd = () => (pencil.spec.end === "eraser" ? -7.5 : 0);

  // The pencil's place in the world for the shader: the back of the wood and the axis.
  const frame = () => {
    const d = axisDir(pose);
    const tip = tipOf(pencil);
    const o: Vec = [
      pose.tip[0] - tip * d[0],
      pose.tip[1] - tip * d[1],
      pose.tip[2] - tip * d[2],
    ];
    return { o, d, tip };
  };

  // How far p is from the pencil's shadow on the desk as seen from above, in millimetres.
  const pencilDistance = (p: Point) => {
    const { o, d, tip } = frame();
    const a = { x: o[0] + backEnd() * d[0], y: o[1] + backEnd() * d[1] };
    const b = { x: o[0] + tip * d[0], y: o[1] + tip * d[1] };
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const t = clamp(
      ((p.x - a.x) * abx + (p.y - a.y) * aby) / (abx * abx + aby * aby || 1),
      0,
      1,
    );
    return Math.hypot(p.x - a.x - t * abx, p.y - a.y - t * aby);
  };

  const onBlock = (p: Point) => {
    const qx = Math.abs(p.x - block.x) - halfLength();
    const qy = Math.abs(p.y - block.y) - BODY.width / 2;
    return Math.max(qx, qy) < 2;
  };

  const toPaper = (p: Point): Point => {
    const dx = p.x - paper.x;
    const dy = p.y - paper.y;
    const c = Math.cos(paper.rot);
    const s = Math.sin(paper.rot);
    return { x: c * dx + s * dy, y: -s * dx + c * dy };
  };
  const onPaper = (p: Point) => {
    const q = toPaper(p);
    return Math.abs(q.x) < PAPER.w / 2 && Math.abs(q.y) < PAPER.h / 2;
  };

  const glideTo = (to: () => Pose, span = 0.28) => {
    if (reduceMotion) {
      Object.assign(pose, to());
      glide = null;
      dirty = true;
      return;
    }
    glide = {
      from: {
        tip: [...pose.tip] as Vec,
        heading: pose.heading,
        tilt: pose.tilt,
      },
      to,
      t: 0,
      span,
    };
  };

  // ---- Shavings -----------------------------------------------------------------------------

  const shavings: Shaving[] = [];
  const freeRows = Array.from({ length: ROWS }, (_, i) => ROWS - 1 - i);
  let live: Shaving | null = null;
  let landed = 0;
  let firstRing = false;
  let glueNoted = false;

  const release = (s: Shaving) => {
    const i = shavings.indexOf(s);
    if (i >= 0) shavings.splice(i, 1);
    freeRows.push(s.row);
    if (live === s) live = null;
  };

  const newShaving = (g: number): Shaving | null => {
    if (!freeRows.length) {
      const oldest = shavings
        .filter((s) => s.state === "resting" || s.state === "swept")
        .sort((a, b) => a.order - b.order)[0];
      if (!oldest) return null;
      release(oldest);
    }
    const row = freeRows.pop() as number;
    const { spec } = pencil;
    const dull = settings.blade === "dull";
    const s: Shaving = {
      row,
      pal: pencil.pal,
      sides: spec.sides,
      flat: spec.flat,
      rounding: spec.rounding,
      corner: spec.corner,
      lead: spec.lead,
      sinA: sinA(),
      theta0: g,
      data: new Float32Array(MAX_SLICES * 2),
      count: 0,
      seed: Math.random(),
      torn: dull ? 1 : 0,
      glue: pencil.glue,
      ringAngle: pencil.ringAngle,
      ringPhase: pencil.ringPhase,
      breakAt: dull
        ? rand(0.12, 0.45) * Math.PI * 2
        : rand(0.45, 1.2) * Math.PI * 2,
      x: 0,
      y: 0,
      z: BODY.height + 0.35,
      rot: 0,
      mirror: 1,
      alpha: 1,
      state: "live",
      from: [0, 0, 0],
      to: [0, 0, 0],
      fromRot: 0,
      toRot: 0,
      t: 0,
      span: 0.35,
      order: 0,
      dirty: true,
    };
    shavings.push(s);
    return s;
  };

  // The live shaving fans out from the slot: centred where the cone's tip unrolls to, its
  // newest edge along the blade.
  const placeLive = (s: Shaving) => {
    const a = apex();
    const newest = Math.max(0, s.count - 1) * SLICE * s.sinA;
    s.x = a[0];
    s.y = a[1];
    s.rot = Math.PI - 0.07 - newest;
    s.z = BODY.height + 0.35;
  };

  const spread = (s: Shaving) => Math.max(0, s.count - 1) * SLICE * s.sinA;

  const drop = (s: Shaving) => {
    if (live === s) live = null;
    if (s.count < 2) {
      release(s);
      return;
    }
    s.state = "falling";
    s.t = 0;
    s.span = rand(0.3, 0.42);
    s.from = [s.x, s.y, s.z];
    s.fromRot = s.rot;
    const size = s.corner / s.sinA;
    const v = view();
    let tx = 0;
    let ty = 0;
    // Off the edge of the block and on to the desk, mostly on the side it came out of.
    const m = 0.4 * size;
    const tall = layout === "tall";
    for (let k = 0; k < 10; k++) {
      const ang = (tall ? rand(0.12, 0.88) : rand(-0.3, 0.95)) * Math.PI;
      const dist = 0.45 * size + 12 + rand(0, 16);
      tx = block.x + 4 + Math.cos(ang) * dist;
      ty = block.y + Math.sin(ang) * dist * 0.9;
      if (tx > v.x0 + m && tx < v.x1 - m && ty > v.y0 + m && ty < v.y1 - m)
        break;
    }
    tx = clamp(tx, v.x0 + m, v.x1 - m);
    ty = clamp(ty, v.y0 + m, v.y1 - m);
    s.to = [tx, ty, 0.9];
    s.toRot = s.rot + rand(0.6, 2.4) * (Math.random() < 0.5 ? -1 : 1);
    if (Math.random() < 0.5) {
      // It lands the other way up: the same strip, mirrored.
      s.mirror = -1;
      s.fromRot = -s.fromRot;
      s.toRot = -s.toRot;
    }
    if (reduceMotion) s.t = s.span;
  };

  // Every few degrees of turn: what the blade takes off.
  const record = (g: number, band: { lo: number; hi: number } | null) => {
    const { lead, sides, flat, rounding } = pencil.spec;
    const outer = reach(g, sides, flat, rounding);
    const lo = band ? band.lo : 9;
    const hi = band ? band.hi : 0;
    const wood = band && Math.min(hi, outer) - Math.max(lo, lead) > 0.012;
    if (wood) {
      if (!live) {
        live = newShaving(lastSlice ? lastSlice.g : g);
        if (live && lastSlice) {
          live.data[0] = lastSlice.lo;
          live.data[1] = lastSlice.hi;
          live.count = 1;
        } else if (live) {
          live.theta0 = g;
        }
      }
      if (live) {
        live.data[live.count * 2] = lo;
        live.data[live.count * 2 + 1] = Math.min(hi, 9);
        live.count++;
        live.dirty = true;
        placeLive(live);
        const fan = spread(live);
        if (!firstRing && fan > Math.PI * 2) {
          firstRing = true;
          const n = 1 / sinA();
          onNote?.(
            `A full ring. Unrolled, the cone is a fan of ${Math.round(360 * sinA())}° a turn, so ${n.toFixed(1)} turns of shaving close the circle.`,
          );
        }
        if (fan > live.breakAt || live.count >= MAX_SLICES - 2) drop(live);
      }
    } else if (live) {
      live.data[live.count * 2] = lo;
      live.data[live.count * 2 + 1] = Math.min(hi, 9);
      live.count++;
      live.dirty = true;
      placeLive(live);
      drop(live);
    }
    lastSlice = { g, lo, hi: Math.min(hi, 9) };
  };

  // ---- Cutting ------------------------------------------------------------------------------

  const noted = new Set<string>();
  const once = (key: string, note: string) => {
    if (noted.has(key)) return;
    noted.add(key);
    onNote?.(note);
  };

  let cutWidth = 0;
  let cutLead = 0;

  // The lead past a crack falls out once the cone has bared it there.
  const checkCracks = () => {
    const { lead } = pencil.spec;
    for (const c of [...pencil.cracks]) {
      const tip = tipOf(pencil);
      if (c >= tip) {
        pencil.cracks = pencil.cracks.filter((x) => x !== c);
        continue;
      }
      let r = pencil.spec.corner;
      for (const cone of pencil.cones) r = Math.min(r, (cone.a - c) * cone.tan);
      if (r < lead * 0.92) {
        pencil.end = Math.min(pencil.end, c);
        pencil.cracks = pencil.cracks.filter((x) => x !== c);
        sound.snap();
        onNote?.(
          "Out it falls: the lead was already broken inside. A dropped pencil cracks along its lead, and the point keeps coming away as you sharpen down to each crack.",
        );
      }
    }
  };

  const cutSlice = (g: number) => {
    if (tipOf(pencil) < SHORTEST) {
      once(
        "short",
        "Too short to hold against the blade. Time for a new pencil.",
      );
      return;
    }
    const T = tan();
    const f = FEED[settings.blade];
    bite = Math.min(bite, contactApex(pencil, T));
    const next = bite - (f * SLICE) / (Math.PI * 2);
    const band = cutBand(pencil, next, T);
    recut(pencil, next, T);
    bite = next;
    pencil.torn = settings.blade === "dull" ? 1 : 0;
    pencil.pitch = f;
    record(g, band);
    const { lead, corner } = pencil.spec;
    if (band) {
      cutWidth = clamp((Math.min(band.hi, corner) - band.lo) / corner, 0, 1);
      cutLead = band.lo < lead ? 1 : 0;
      if (band.lo > pencil.spec.flat + 0.01 && pencil.spec.sides > 0)
        once(
          "chips",
          `A new pencil's flat end meets the blade at its ${pencil.spec.sides === 6 ? "six" : "three"} corners first, so it comes away in chips until the cone is round.`,
        );
      if (band.lo < lead)
        once(
          `lead-${pencil.spec.id}`,
          "Into the lead: from here the shaving's inner edge is grey, and the lead itself crumbles to dust.",
        );
    }
    checkCracks();
    // A soft lead snaps if it's turned hard while the point is thin.
    const r = pointRadius(pencil);
    if (r < 0.2) {
      const rate = Math.abs(spin) / (Math.PI * 2);
      const chance =
        (0.012 * rate * rate) / (pencil.spec.strength * pencil.spec.strength);
      if (Math.random() < (chance * SLICE) / (Math.PI * 2)) {
        const keep = rand(0.35, 0.7) * pencil.spec.lead;
        pencil.end = bite - keep / T;
        sound.snap();
        onNote?.(
          pencil.spec.strength < 0.6
            ? "Snap. A soft lead breaks off in the bore if it's turned hard as the point forms: turn it gently at the end."
            : "Snap. Even a firm lead breaks if it's whipped round as the point forms.",
        );
      }
    }
    if (pointRadius(pencil) < 0.02)
      once(
        `sharp-${pencil.spec.id}`,
        "Sharp. From here every turn only shortens the pencil.",
      );
  };

  // Turning the pencil: forwards past where it has been, the blade cuts.
  const twist = (dTheta: number) => {
    roll += dTheta;
    dirty = true;
    if (mode !== "docked" || glide) return;
    if (roll > ahead) {
      ahead = roll;
      backwards = 0;
      while (ahead - sliceAt >= SLICE) {
        sliceAt += SLICE;
        cutSlice(Math.PI / 2 - sliceAt);
        turns += SLICE / (Math.PI * 2);
      }
    } else if (dTheta < 0) {
      backwards -= dTheta;
      if (backwards > Math.PI * 1.5)
        once(
          "backwards",
          "Turned backwards, the blade has nothing to cut: it only has the one edge.",
        );
    }
  };

  // Pushed into the bore until it touches, with the count started afresh.
  const seat = () => {
    mode = "docked";
    bite = contactApex(pencil, tan());
    ahead = roll;
    sliceAt = roll;
    spinLast = roll;
    lastSlice = null;
    turns = 0;
    backwards = 0;
    rollSpeed = 0;
  };

  const dock = () => {
    if (mode === "docked" && !glide) return;
    seat();
    glideTo(dockedPose, 0.3);
    sound.knock(0.7);
  };

  const undock = (into: Mode) => {
    if (live) drop(live);
    lastSlice = null;
    mode = into;
    sound.stopCut();
  };

  const layDown = () => {
    mode = "lying";
    const heading = pose.heading;
    const tip = [...pose.tip] as Vec;
    // Settle onto the nearest flat.
    const { sides } = pencil.spec;
    if (sides > 0) {
      const sector = (Math.PI * 2) / sides;
      const k = Math.round((-Math.PI / 2 - roll) / sector);
      roll = -Math.PI / 2 - k * sector;
    }
    glideTo(
      () => ({ tip: [tip[0], tip[1], lyingHeight()], heading, tilt: 0 }),
      0.22,
    );
    sound.knock(0.5);
  };

  // ---- Writing ------------------------------------------------------------------------------

  let pen: { x: number; y: number; t: number } | null = null;
  let scribble: { path: Point[]; i: number; t: number } | null = null;
  let scribbleRow = 0;

  const writingPose = (p: Point): Pose => ({
    tip: [p.x, p.y, 0.15],
    heading: WRITE_HEADING,
    tilt: WRITE_TILT,
  });

  const writeTo = (p: Point, dt: number) => {
    const { spec } = pencil;
    const prev = pen;
    pen = { x: p.x, y: p.y, t: performance.now() };
    if (!prev) return;
    const a = toPaper(prev);
    const b = toPaper(p);
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < 1e-3) return;
    const r = pointRadius(pencil);
    const wood = r > spec.lead * 1.04;
    const w = 2 * clamp(r, 0.11, spec.lead) + (wood ? 0.15 : 0);
    // The graphite left behind is worn off the point: a sharp point blunts fast at first, then
    // more slowly as the worn face grows.
    const volume = WEAR * spec.softness * w * len;
    const tip = tipOf(pencil);
    const face = Math.PI * Math.max(r, 0.08) ** 2;
    pencil.end = tip - (volume / face) * (wood ? 0.35 : 1);
    checkCracks();
    if (wood)
      once(
        `wood-${spec.id}`,
        "Worn right down: the wood is dragging on the paper now. Back to the sharpener.",
      );
    const ink = spec.id === "colour" ? "rgb(200, 54, 44)" : "rgb(58, 60, 66)";
    marksCtx.fillStyle = ink;
    const px = PAPER.texels;
    const rad = (w / 2) * px;
    const step = Math.max(0.5, rad * 0.45);
    const n = Math.ceil((len * px) / step);
    const alpha = spec.darkness * (wood ? 0.2 : 0.55) * Math.min(1, step / rad);
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      const x = (a.x + (b.x - a.x) * t + PAPER.w / 2) * px;
      const y = (a.y + (b.y - a.y) * t + PAPER.h / 2) * px;
      marksCtx.globalAlpha = alpha * (0.75 + 0.5 * Math.random());
      marksCtx.beginPath();
      marksCtx.arc(
        x + rand(-0.15, 0.15),
        y + rand(-0.15, 0.15),
        rad,
        0,
        Math.PI * 2,
      );
      marksCtx.fill();
    }
    marksCtx.globalAlpha = 1;
    marksDirty = true;
    sound.write(len / Math.max(dt, 1 / 120), spec.softness, wood);
  };

  const startScribble = () => {
    const rows = 6;
    const row = scribbleRow++ % rows;
    const y0 = -PAPER.h / 2 + 12 + 7 * (row + 1) - 0.4;
    const x0 = -PAPER.w / 2 + 17;
    const len = Math.min(48, PAPER.w - 26);
    const loops = 7;
    const path: Point[] = [];
    for (let i = 0; i <= 140; i++) {
      const t = i / 140;
      const ph = Math.PI * 2 * loops * t;
      const lx = x0 + len * t - 1.7 * Math.sin(ph);
      const ly = y0 - 1.6 * (1 - Math.cos(ph)) * 0.95;
      // Back from the page's frame to the desk's.
      const c = Math.cos(paper.rot);
      const s = Math.sin(paper.rot);
      path.push({ x: paper.x + c * lx - s * ly, y: paper.y + s * lx + c * ly });
    }
    if (mode === "docked") undock("writing");
    mode = "writing";
    pen = null;
    glideTo(() => writingPose(path[0]), 0.3);
    scribble = { path, i: 0, t: -0.3 };
  };

  // ---- Interaction --------------------------------------------------------------------------

  type Grab =
    | { id: number; kind: "twist"; start: Point; last: Point; pulled: boolean }
    | { id: number; kind: "carry"; last: Point; vx: number; vy: number }
    | { id: number; kind: "write"; last: Point }
    | { id: number; kind: "brush"; last: Point };
  let grab: Grab | null = null;

  const pickUp = (p: Point) => {
    if (mode === "docked") undock("carried");
    mode = "carried";
    rollSpeed = 0;
    const tip = [...pose.tip] as Vec;
    const offX = tip[0] - p.x;
    const offY = tip[1] - p.y;
    glideTo(
      () => ({ tip: [p.x + offX, p.y + offY, 12], heading: 0, tilt: 0 }),
      0.2,
    );
  };

  // Let go near the mouth of the bore, it goes in.
  const nearMouth = () => {
    const mouth = block.x - halfLength();
    const t = pose.tip;
    return (
      t[0] > mouth - 26 && t[0] < mouth + 10 && Math.abs(t[1] - block.y) < 9
    );
  };

  // ---- Frame --------------------------------------------------------------------------------

  let raf = 0;
  let last = performance.now();
  let fpsStamp = last;
  let frames = 0;
  let fps: number | null = null;
  let statStamp = 0;
  let disposed = false;
  let auto = 0;
  let autoWant = false;
  let keyTurn = 0;
  let wasRolling = false;

  const updateGlide = (dt: number) => {
    if (!glide) return;
    glide.t += dt;
    const k = smooth(clamp(glide.t / glide.span, 0, 1));
    const to = glide.to();
    const f = glide.from;
    pose.tip = [
      f.tip[0] + (to.tip[0] - f.tip[0]) * k,
      f.tip[1] + (to.tip[1] - f.tip[1]) * k,
      f.tip[2] + (to.tip[2] - f.tip[2]) * k,
    ];
    pose.heading = f.heading + wrap(to.heading - f.heading) * k;
    pose.tilt = f.tilt + (to.tilt - f.tilt) * k;
    if (glide.t >= glide.span) glide = null;
    dirty = true;
  };

  const updateShavings = (dt: number) => {
    for (const s of [...shavings]) {
      if (s.state === "falling") {
        s.t += dt;
        const k = clamp(s.t / s.span, 0, 1);
        const e = 1 - (1 - k) * (1 - k);
        s.x = s.from[0] + (s.to[0] - s.from[0]) * e;
        s.y = s.from[1] + (s.to[1] - s.from[1]) * e;
        s.z = s.from[2] + (s.to[2] - s.from[2]) * k * k;
        s.rot = s.fromRot + (s.toRot - s.fromRot) * e;
        if (k >= 1) {
          s.state = "resting";
          s.order = ++landed;
          s.z = 0.9 + (landed % 40) * 0.002;
          if (landed === 3 && !glueNoted) {
            glueNoted = true;
            onNote?.(
              "Look along a shaving: the two fine dark lines across every turn of it are the glue between the pencil's two slats.",
            );
          }
        }
        dirty = true;
      } else if (s.state === "swept") {
        s.t += dt;
        s.x += 260 * dt;
        s.y += 40 * dt;
        s.alpha = Math.max(0, 1 - s.t / 0.45);
        if (s.alpha <= 0) release(s);
        dirty = true;
      }
    }
  };

  const updateRolling = (dt: number) => {
    if (mode !== "lying" || glide) return;
    const { sides } = pencil.spec;
    if (Math.abs(rollSpeed) < 0.02 && sides === 0) {
      rollSpeed = 0;
      return;
    }
    if (sides > 0) {
      // Rocking over a corner costs height: it settles on a flat.
      const sector = (Math.PI * 2) / sides;
      const off = wrap((-Math.PI / 2 - roll) * sides) / sides;
      rollSpeed += off * 60 * dt;
      rollSpeed *= Math.exp(-dt / 0.12);
      if (Math.abs(rollSpeed) < 0.05 && Math.abs(off) < 0.002) {
        rollSpeed = 0;
        roll =
          -Math.PI / 2 - Math.round((-Math.PI / 2 - roll) / sector) * sector;
      }
    } else {
      rollSpeed *= Math.exp(-dt / 1.6);
    }
    if (rollSpeed === 0) return;
    const d = axisDir(pose);
    // Rolling without slipping: the axis moves as far as the surface turns.
    const sx = d[1];
    const sy = -d[0];
    const step = rollSpeed * dt * meanRadius();
    roll += rollSpeed * dt;
    pose.tip[0] -= sx * step;
    pose.tip[1] -= sy * step;
    pose.tip[2] = lyingHeight();
    const v = view();
    if (
      pose.tip[0] < v.x0 - 10 ||
      pose.tip[0] > v.x1 + 10 ||
      pose.tip[1] < v.y0 + 4 ||
      pose.tip[1] > v.y1 - 4
    ) {
      rollSpeed = -rollSpeed * 0.3;
    }
    if (sides === 0 && Math.abs(rollSpeed) > 1 && !wasRolling) {
      wasRolling = true;
      once(
        "roll",
        "Round pencils roll away. That's why most pencils have six sides.",
      );
    }
    dirty = true;
  };

  const update = (dt: number) => {
    updateGlide(dt);
    updateShavings(dt);
    updateRolling(dt);

    // Turning by itself (Space or the Turn button) at a turn a second, or an eighth of a turn
    // from the arrow keys.
    const want = autoWant && mode === "docked" && !glide ? 1 : 0;
    auto += (want - auto) * (1 - Math.exp(-dt / 0.18));
    if (auto < 0.01 && !want) auto = 0;
    let turned = 0;
    if (auto > 0) turned += auto * Math.PI * 2 * dt;
    if (keyTurn !== 0 && mode === "docked" && !glide) {
      const stepTurn = Math.sign(keyTurn) * Math.min(Math.abs(keyTurn), 9 * dt);
      keyTurn -= stepTurn;
      turned += stepTurn;
    }
    if (turned !== 0) twist(turned);

    // How fast the pencil is turning, for the sound and the lead's chances.
    const rollNow = roll;
    spin +=
      ((rollNow - spinLast) / Math.max(dt, 1e-3) - spin) *
      (1 - Math.exp(-dt / 0.12));
    const cutting =
      mode === "docked" && rollNow > spinLast + 1e-6 && rollNow >= ahead - 1e-6;
    spinLast = rollNow;
    if (cutting) {
      sound.cut(
        dt,
        Math.abs(spin) / (Math.PI * 2),
        cutWidth,
        cutLead,
        pencil.torn,
      );
    } else {
      sound.stopCut();
    }

    if (scribble) {
      scribble.t += dt;
      if (scribble.t >= 0) {
        const target = Math.min(
          scribble.path.length - 1,
          Math.floor((scribble.t / 1.7) * scribble.path.length),
        );
        while (scribble.i < target) {
          scribble.i++;
          const pt = scribble.path[scribble.i];
          pose.tip = [pt.x, pt.y, 0.15];
          writeTo(pt, dt);
        }
        dirty = true;
        if (scribble.i >= scribble.path.length - 1) {
          scribble = null;
          pen = null;
          sound.stopWrite();
          layDown();
        }
      }
    }
    // In the bore, the pencil feeds in as it's cut.
    if (mode === "docked" && !glide) {
      const at = dockedPose();
      if (Math.abs(at.tip[0] - pose.tip[0]) > 1e-4) {
        Object.assign(pose, at);
        dirty = true;
      }
    }
    if (live) placeLive(live);
  };

  // ---- Rendering ----------------------------------------------------------------------------

  let stampFor = "";

  const render = () => {
    gl.viewport(0, 0, width, height);
    // biome-ignore lint/correctness/useHookAtTopLevel: WebGL's useProgram, not a React hook.
    gl.useProgram(scene.program);
    gl.bindVertexArray(vao);

    const mm = 1 / (pxPerMm * (width / cssW));
    gl.uniform2f(u("uRes"), width, height);
    gl.uniform2f(u("uOrigin"), origin.x, origin.y);
    gl.uniform1f(u("uMm"), mm);
    gl.uniform1f(u("uNight"), night ? 1 : 0);
    const v = view();
    // A desk lamp beyond the top right corner, its shade tipped towards the middle of the desk.
    gl.uniform3f(u("uLamp"), v.x1 + 30, v.y0 - 10, 120);
    gl.uniform3f(
      u("uLampAim"),
      v.x0 + (v.x1 - v.x0) * 0.55,
      v.y0 + (v.y1 - v.y0) * 0.42,
      0,
    );

    gl.uniform2f(u("uPaperC"), paper.x, paper.y);
    gl.uniform2f(u("uPaperH"), PAPER.w / 2, PAPER.h / 2);
    gl.uniform1f(u("uPaperRot"), paper.rot);

    gl.uniform2f(u("uShC"), block.x, block.y);
    gl.uniform3f(u("uShDim"), halfLength(), BODY.width / 2, BODY.height);
    gl.uniform3f(u("uShBore"), apexX(), boreLength(settings.point), tan());
    gl.uniform1f(u("uShBrass"), settings.body === "brass" ? 1 : 0);

    // The pencil.
    const { spec } = pencil;
    if (stampFor !== spec.stamp) {
      stampFor = spec.stamp;
      drawStamp(spec.stamp);
    }
    const { o, d, tip } = frame();
    gl.uniform1f(u("uPencilOn"), 1);
    gl.uniform1f(u("uDocked"), mode === "docked" ? 1 : 0);
    gl.uniform3f(u("uPO"), o[0], o[1], o[2]);
    gl.uniform3f(u("uPD"), d[0], d[1], d[2]);
    gl.uniform1f(u("uRoll"), roll);
    gl.uniform4f(u("uProf"), spec.sides, spec.flat, spec.corner, spec.lead);
    gl.uniform1f(u("uRounding"), spec.rounding);
    for (let i = 0; i < 3; i++) {
      const c = pencil.cones[i];
      gl.uniform4f(u(`uCone${i}`), c ? c.a : 0, c ? c.tan : 0, c ? 1 : 0, 0);
    }
    gl.uniform4f(u("uEnds"), pencil.end, 0, backEnd(), tip);
    if (spec.end === "eraser") gl.uniform4f(u("uBack"), 0, -1, 9, -7.5);
    else gl.uniform4f(u("uBack"), 1, 7, 0, 0);
    gl.uniform1i(u("uPal"), pencil.pal);
    gl.uniform4f(
      u("uStampAt"),
      STAMP.from,
      STAMP.from + STAMP.length,
      STAMP.half,
      0,
    );
    gl.uniform3f(u("uWoodFx"), pencil.glue, pencil.ringAngle, pencil.ringPhase);
    gl.uniform1f(u("uPitch"), pencil.pitch);
    gl.uniform1f(u("uRough"), pencil.torn);

    // Shavings: the live and falling ones first, then those lying about, oldest first.
    const high = shavings.filter(
      (s) => s.state === "live" || s.state === "falling",
    );
    const low = shavings
      .filter((s) => s.state === "resting" || s.state === "swept")
      .sort((a, b) => a.order - b.order);
    const list = [...high, ...low];
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, sliceTex);
    list.forEach((s, i) => {
      const h = i * HEAD_W * 4;
      const reachMm = s.corner / s.sinA + 1.5;
      headData.set([s.x, s.y, reachMm, s.z], h);
      headData.set([s.rot, s.mirror, s.sinA, s.count], h + 4);
      headData.set([s.theta0, SLICE, s.seed, s.torn], h + 8);
      headData.set([s.sides, s.flat, s.rounding, s.lead], h + 12);
      headData.set([s.pal, s.glue, s.ringAngle, s.alpha], h + 16);
      headData.set([s.row, s.ringPhase, 0, 0], h + 20);
      if (s.dirty && s.count > 0) {
        gl.texSubImage2D(
          gl.TEXTURE_2D,
          0,
          0,
          s.row,
          s.count,
          1,
          gl.RG,
          gl.FLOAT,
          s.data,
          0,
        );
        s.dirty = false;
      }
    });
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, headTex);
    if (list.length) {
      gl.texSubImage2D(
        gl.TEXTURE_2D,
        0,
        0,
        0,
        HEAD_W,
        list.length,
        gl.RGBA,
        gl.FLOAT,
        headData,
        0,
      );
    }
    gl.uniform1i(u("uHigh"), high.length);
    gl.uniform1i(u("uCount"), list.length);

    if (marksDirty) {
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, marksTex);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        marks,
      );
      marksDirty = false;
    }
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, stampTex);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, marksTex);

    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  const loop = (stamp: number) => {
    if (disposed) return;
    raf = requestAnimationFrame(loop);
    const now = stamp;
    const dt = clamp((now - last) / 1000, 0, 0.05);
    last = now;
    frames++;
    if (stamp - fpsStamp > 1000) {
      fps = Math.round((frames * 1000) / (stamp - fpsStamp));
      frames = 0;
      fpsStamp = stamp;
    }
    resize();
    update(dt);
    if (dirty) {
      render();
      dirty = false;
    }
    if (stamp - statStamp > 200) {
      statStamp = stamp;
      onStats?.({
        point: 2 * pointRadius(pencil),
        length: tipOf(pencil) - backEnd(),
        turns,
        docked: mode === "docked",
        fps,
      });
    }
  };

  // ---- A desk that's been used --------------------------------------------------------------

  // A couple of shavings from earlier, cut from this same pencil the honest way.
  const lay = (places: [number, number, number][]) => {
    const saved = { pencil, bite, roll, ahead, sliceAt, mode };
    pencil = makePencil(pencil.spec, true, tan());
    pencil.end -= 30;
    pencil.cones = [{ a: pencil.end + 0.9 / tan(), tan: tan() }];
    mode = "docked";
    bite = contactApex(pencil, tan());
    lastSlice = null;
    let n = 0;
    let guard = 0;
    while (n < places.length && guard++ < 4000) {
      sliceAt += SLICE;
      cutSlice(Math.PI / 2 - sliceAt);
      const fell = shavings.find((s) => s.state === "falling");
      if (fell) {
        const [x, y, r] = places[n++];
        fell.state = "resting";
        fell.order = ++landed;
        fell.x = block.x + x;
        fell.y = block.y + y;
        fell.z = 0.9 + landed * 0.002;
        fell.rot = r;
        fell.mirror = n % 2 ? 1 : -1;
      }
    }
    if (live) release(live);
    live = null;
    lastSlice = null;
    ({ pencil, bite, roll, ahead, sliceAt, mode } = saved);
    noted.clear();
    firstRing = false;
    turns = 0;
  };

  resize();
  lay([
    [22, 28, 0.6],
    [-6, 34, 2.4],
  ]);
  Object.assign(pose, dockedPose());
  raf = requestAnimationFrame(loop);

  return {
    setSettings(next: SharpenerSettings) {
      const prev = settings;
      settings = { ...next };
      sound.setEnabled(next.sound);
      if (next.pencil !== prev.pencil) {
        undock(mode === "docked" ? "docked" : mode);
        pencil = makePencil(PENCILS[pencilIndex(next.pencil)], true, tan());
        roll = 1.25;
        seat();
        Object.assign(pose, dockedPose());
        glide = null;
        onNote?.(pencil.spec.note);
      }
      if (next.point !== prev.point) {
        if (mode === "docked") {
          if (live) drop(live);
          seat();
          Object.assign(pose, dockedPose());
        }
        onNote?.(
          next.point === "long"
            ? `A long-point bore is a narrower cone: it unrolls to a narrower fan, ${Math.round(360 * sinA())}° a turn, so a shaving takes ${(1 / sinA()).toFixed(1)} turns to close its ring. It first cuts at the shoulder of the old point.`
            : `An ordinary point: the shaving's fan opens ${Math.round(360 * sinA())}° a turn.`,
        );
      }
      if (next.blade !== prev.blade && next.blade === "dull") {
        onNote?.(
          "A dull blade crushes and tears the wood instead of slicing it: the shavings break up and the cone comes out rough.",
        );
      }
      dirty = true;
    },
    setNight(on: boolean) {
      night = on;
      dirty = true;
    },
    // A fresh pencil, flat-ended from the box.
    fresh() {
      if (live) drop(live);
      pencil = makePencil(pencil.spec, false, tan());
      roll = 1.25;
      seat();
      glide = null;
      Object.assign(pose, dockedPose());
      noted.delete("chips");
      noted.delete(`sharp-${pencil.spec.id}`);
      noted.delete(`lead-${pencil.spec.id}`);
      dirty = true;
    },
    // Dropped on the floor: the lead cracks in a few places along its length.
    dropIt() {
      const tip = tipOf(pencil);
      const n = 3 + Math.floor(Math.random() * 3);
      pencil.cracks = Array.from({ length: n }, () => tip - rand(3, 40)).sort(
        (a, b) => b - a,
      );
      sound.knock(1);
      setTimeout(() => sound.knock(0.6), 90);
      onNote?.(
        "Clatter. It looks fine, but the lead inside has cracked. Sharpen it and see.",
      );
    },
    sweep() {
      for (const s of shavings) {
        if (s.state === "resting") {
          s.state = "swept";
          s.t = 0;
        }
      }
      dirty = true;
    },
    clearPage() {
      marksCtx.clearRect(0, 0, marks.width, marks.height);
      marksDirty = true;
      scribbleRow = 0;
      dirty = true;
    },
    scribble() {
      sound.wake();
      if (scribble) return;
      startScribble();
    },
    toggleDock() {
      sound.wake();
      if (mode === "docked") {
        undock("lying");
        const p = { x: paper.x + 6, y: paper.y - 6 };
        roll = -Math.PI / 2;
        glideTo(
          () => ({ tip: [p.x + 40, p.y, lyingHeight()], heading: 0, tilt: 0 }),
          0.35,
        );
      } else {
        dock();
      }
    },
    // Hold to turn: Space, or the Turn button.
    turn(on: boolean) {
      sound.wake();
      autoWant = on;
      if (on && mode !== "docked") dock();
    },
    // A nudge from the arrow keys: forwards cuts, backwards rubs.
    nudge(dir: number) {
      sound.wake();
      if (mode !== "docked") dock();
      keyTurn += dir * (Math.PI / 4);
    },
    pointerDown(id: number, at: Point) {
      if (grab) return false;
      sound.wake();
      const p = toDesk(at);
      const nearPencil = pencilDistance(p) < pencil.spec.corner + 1.5;
      if (mode === "docked" && (nearPencil || onBlock(p))) {
        grab = { id, kind: "twist", start: p, last: p, pulled: false };
        return "grabbing";
      }
      if (mode !== "docked" && nearPencil) {
        grab = { id, kind: "carry", last: p, vx: 0, vy: 0 };
        pickUp(p);
        return "grabbing";
      }
      if (onPaper(p) && !scribble) {
        if (mode === "docked") undock("writing");
        mode = "writing";
        pen = null;
        glideTo(() => writingPose(grab ? grab.last : p), 0.14);
        grab = { id, kind: "write", last: p };
        return "none";
      }
      grab = { id, kind: "brush", last: p };
      return "grabbing";
    },
    pointerMove(id: number, at: Point, dt = 1 / 60) {
      if (!grab || grab.id !== id) return;
      const p = toDesk(at);
      const dx = p.x - grab.last.x;
      const dy = p.y - grab.last.y;
      if (grab.kind === "twist") {
        const ox = p.x - grab.start.x;
        const oy = p.y - grab.start.y;
        if (ox < -9 && Math.abs(ox) > 1.2 * Math.abs(oy)) {
          // Pulled out along its length.
          const id2 = grab.id;
          grab = { id: id2, kind: "carry", last: p, vx: 0, vy: 0 };
          pickUp(p);
          return;
        }
        // Rolling it under the finger: the surface goes where the finger goes.
        twist(dy / meanRadius());
      } else if (grab.kind === "carry") {
        if (!glide) {
          pose.tip[0] += dx;
          pose.tip[1] += dy;
          pose.heading += wrap(0 - pose.heading) * 0.2;
          dirty = true;
        } else {
          const g = glide;
          const prevTo = g.to;
          g.to = () => {
            const t = prevTo();
            return { ...t, tip: [t.tip[0] + dx, t.tip[1] + dy, t.tip[2]] };
          };
        }
        const k = 1 - Math.exp(-dt / 0.06);
        grab.vx += (dx / Math.max(dt, 1e-3) - grab.vx) * k;
        grab.vy += (dy / Math.max(dt, 1e-3) - grab.vy) * k;
      } else if (grab.kind === "write") {
        if (!glide) {
          pose.tip = [p.x, p.y, 0.15];
          writeTo(p, dt);
          dirty = true;
        } else {
          pen = { x: p.x, y: p.y, t: 0 };
        }
      } else if (grab.kind === "brush") {
        // A fingertip pushing shavings about.
        for (const s of shavings) {
          if (s.state !== "resting") continue;
          const r = Math.hypot(p.x - s.x, p.y - s.y);
          const size = (s.corner / s.sinA) * 0.75;
          if (r < size) {
            const k = 1 - r / size;
            s.x += dx * k;
            s.y += dy * k;
            s.rot +=
              ((dx * (p.y - s.y) - dy * (p.x - s.x)) / (size * size)) * k * 0.6;
            dirty = true;
          }
        }
      }
      grab.last = p;
    },
    pointerUp(id: number) {
      if (!grab || grab.id !== id) return;
      const g = grab;
      grab = null;
      if (g.kind === "carry") {
        if (nearMouth()) {
          dock();
        } else {
          layDown();
          // Let go moving sideways, it rolls.
          const d = axisDir(pose);
          const across = g.vx * d[1] - g.vy * d[0];
          rollSpeed = clamp(-across / meanRadius(), -40, 40) * 0.6;
          wasRolling = false;
        }
      } else if (g.kind === "write") {
        pen = null;
        sound.stopWrite();
        layDown();
      }
    },
    hover(at: Point) {
      const p = toDesk(at);
      const nearPencil = pencilDistance(p) < pencil.spec.corner + 1.5;
      if (mode === "docked" && (nearPencil || onBlock(p))) return "ns-resize";
      if (nearPencil) return "grab";
      if (onPaper(p)) return "crosshair";
      return "default";
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      sound.dispose();
      // The context is left for the canvas to take with it: a remount on the same canvas (a
      // hot reload, or React's double mount in development) gets it back working.
      gl.deleteTexture(headTex);
      gl.deleteTexture(sliceTex);
      gl.deleteTexture(marksTex);
      gl.deleteTexture(stampTex);
    },
  };
}
