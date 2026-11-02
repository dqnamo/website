// A diffusion cloud chamber on a bench, from above: the particles are particles.ts and
// sources.ts, the droplets they leave are droplets.ts, and this file is the rest of the room:
// the torch, the magnet, the lid, the camera, and drawing it all.
//
// The torch lies on the frosted plate and shines in low through the glass. Droplets only show
// where its beam falls on them, brighter near it, and the things on the floor cast shadows
// across the layer. The magnet sits under the plate, so you can't see it, only what it does (a
// dashed ring marks where it is, to drag it by): its field is strongest over its middle and falls
// away over a few centimetres.
//
// Lifting the lid lets the room's warm air in. The supersaturated layer is gone at once, the air
// tumbles, and it takes ten seconds or so to settle and start showing tracks again.
//
// The long exposure adds up the droplets frame by frame, as a camera with its shutter open
// would, so tracks pile up into a picture like the old cloud chamber photographs, smeared where
// the air moved them and with falling rain drawn as streaks.

import { clamp, GLASS, HALF, perspective, smoothstep } from "./chamber";
import { createDroplets, createFlow } from "./droplets";
import { createParticles, type Kind, type Track } from "./particles";
import {
  ACCUMULATE,
  BLUR,
  COMPOSITE,
  DOWN,
  DROP_FRAGMENT,
  DROP_VERTEX,
  QUAD,
} from "./shaders";
import {
  createSources,
  drawFloor,
  footprint,
  type Note,
  onHand,
  type Placed,
  SOURCES,
  type SourceId,
  source,
} from "./sources";

export type { SourceId } from "./sources";
export { SOURCES } from "./sources";

export type Magnet = "off" | "north" | "south";

export type ChamberSettings = {
  sources: SourceId[];
  magnet: Magnet;
  torch: boolean;
  labels: boolean;
  exposure: boolean;
  // Simulated seconds per real second.
  speed: number;
};

export const DEFAULT_SETTINGS: ChamberSettings = {
  sources: ["mantle", "americium"],
  magnet: "off",
  torch: true,
  labels: false,
  exposure: false,
  speed: 1,
};

export type ChamberStats = {
  alpha: number;
  beta: number;
  muon: number;
  vees: number;
  droplets: number;
  exposure: number;
  fps: number | null;
};

export type Hover = {
  name: string;
  detail: string;
  x: number;
  y: number;
} | null;

type Point = { x: number; y: number };

type Target = {
  texture: WebGLTexture;
  framebuffer: WebGLFramebuffer;
  width: number;
  height: number;
};

const MAX_DROPLETS = 80000;
const MAX_PIXELS = 2_400_000;
const FLOOR_TEXTURE = 1024;
// How much of the scene the shorter side of the stage shows, from the middle, in floor cm.
const VIEW = 17.2;
// The torch lies just outside the glass, its lens 1.3 cm off the plate.
const TORCH_RING = HALF + GLASS + 0.7;
const TORCH_Z = 1.3;
const TORCH_LENGTH = 10;
const TORCH_RADIUS = 1.25;
// The magnet's field: a quarter of a tesla over its middle, as a big neodymium magnet gives
// through the plate, falling off over about 5 cm. Strong enough to coil a beta particle in a
// centimetre or two; an alpha's circle would be two metres across.
const FIELD = 0.25;
const FIELD_REACH = 5;
const RAIN = 180;
const LABEL_LIFE = 2.6;

const COLOURS: Record<Kind | "delta", string> = {
  alpha: "255, 220, 178",
  electron: "176, 212, 255",
  positron: "255, 176, 206",
  muon: "190, 246, 206",
  delta: "176, 212, 255",
};

function compile(gl: WebGL2RenderingContext, vs: string, fs: string) {
  const make = (type: number, source: string) => {
    const shader = gl.createShader(type);
    if (!shader) throw new Error("Couldn't make a shader");
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(shader) ?? "Shader didn't compile");
    }
    return shader;
  };
  const program = gl.createProgram();
  if (!program) throw new Error("Couldn't make a program");
  gl.attachShader(program, make(gl.VERTEX_SHADER, vs));
  gl.attachShader(program, make(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program) ?? "Program didn't link");
  }
  const uniforms = new Map<string, WebGLUniformLocation | null>();
  const at = (name: string) => {
    if (!uniforms.has(name))
      uniforms.set(name, gl.getUniformLocation(program, name));
    return uniforms.get(name) ?? null;
  };
  return { program, at };
}

type Program = ReturnType<typeof compile>;

// Where a ray from the middle at this angle meets a square of half-width `half`.
function onSquare(angle: number, half: number) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const k = half / Math.max(Math.abs(c), Math.abs(s));
  return { x: c * k, y: s * k };
}

export function createCloudChamber(
  canvas: HTMLCanvasElement,
  overlay: HTMLCanvasElement,
  {
    onStats,
    onNote,
    onHover,
  }: {
    onStats?: (stats: ChamberStats) => void;
    onNote?: (note: string) => void;
    onHover?: (hover: Hover) => void;
  } = {},
) {
  const gl = canvas.getContext("webgl2", {
    antialias: false,
    alpha: false,
    depth: false,
    premultipliedAlpha: false,
  });
  if (!gl) throw new Error("WebGL2 isn't available");
  if (!gl.getExtension("EXT_color_buffer_float")) {
    throw new Error("This browser can't draw into float textures.");
  }
  const ctx = overlay.getContext("2d");
  if (!ctx) throw new Error("No 2D canvas");

  const drops = compile(gl, DROP_VERTEX, DROP_FRAGMENT);
  const down = compile(gl, QUAD, DOWN);
  const blur = compile(gl, QUAD, BLUR);
  const accumulate = compile(gl, QUAD, ACCUMULATE);
  const composite = compile(gl, QUAD, COMPOSITE);
  const empty = gl.createVertexArray();
  const select = (p: Program) => {
    // biome-ignore lint/correctness/useHookAtTopLevel: WebGL's useProgram, not a React hook.
    gl.useProgram(p.program);
  };

  // Droplets: x, y, z, brightness and track, five floats each.
  const dropData = new Float32Array(MAX_DROPLETS * 5);
  const dropVao = gl.createVertexArray();
  const dropBuffer = gl.createBuffer();
  gl.bindVertexArray(dropVao);
  gl.bindBuffer(gl.ARRAY_BUFFER, dropBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, dropData.byteLength, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 20, 0);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 20, 16);
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
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    return { texture, framebuffer, width: w, height: h };
  };
  const freeTarget = (t: Target | null) => {
    if (!t) return;
    gl.deleteTexture(t.texture);
    gl.deleteFramebuffer(t.framebuffer);
  };

  // The floor's things: their colours, and the radium paint's glow.
  const floorCanvas = document.createElement("canvas");
  const glowCanvas = document.createElement("canvas");
  floorCanvas.width = floorCanvas.height = FLOOR_TEXTURE;
  glowCanvas.width = glowCanvas.height = FLOOR_TEXTURE / 2;
  const floorCtx = floorCanvas.getContext("2d");
  const glowCtx = glowCanvas.getContext("2d");
  if (!floorCtx || !glowCtx) throw new Error("No 2D canvas");
  const floorTexture = gl.createTexture();
  const glowTexture = gl.createTexture();
  const upload = (
    texture: WebGLTexture | null,
    image: HTMLCanvasElement,
    srgb: boolean,
  ) => {
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      srgb ? gl.SRGB8_ALPHA8 : gl.RGBA8,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      image,
    );
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(
      gl.TEXTURE_2D,
      gl.TEXTURE_MIN_FILTER,
      gl.LINEAR_MIPMAP_LINEAR,
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  };

  let width = 0;
  let height = 0;
  let cssW = 1;
  let cssH = 1;
  let ratio = 1;
  // CSS pixels per centimetre on the floor, and the point under the camera.
  let scale = 20;
  let center: Point = { x: 0, y: 0 };
  let main: Target | null = null;
  let exposureTarget: Target | null = null;
  let small: Target | null = null;
  let smallB: Target | null = null;
  let aimed = false;

  const resize = () => {
    const cw = Math.max(1, canvas.clientWidth);
    const ch = Math.max(1, canvas.clientHeight);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const s = Math.min(dpr, Math.sqrt(MAX_PIXELS / (cw * ch)));
    const w = Math.max(1, Math.round(cw * s));
    const h = Math.max(1, Math.round(ch * s));
    if (w === width && h === height && cw === cssW && ch === cssH) return;
    width = w;
    height = h;
    cssW = cw;
    cssH = ch;
    ratio = w / cw;
    canvas.width = w;
    canvas.height = h;
    overlay.width = w;
    overlay.height = h;
    scale = Math.min(cw, ch) / 2 / VIEW;
    center = { x: cw / 2, y: ch / 2 };
    // The torch starts on whichever side has room for it on the bench.
    if (!aimed) {
      aimed = true;
      torchAngle = ch > cw * 1.1 ? Math.PI / 2 + 0.5 : Math.PI + 0.42;
    }
    freeTarget(main);
    freeTarget(exposureTarget);
    freeTarget(small);
    freeTarget(smallB);
    main = makeTarget(w, h);
    exposureTarget = makeTarget(w, h);
    exposed = 0;
    const sw = Math.max(1, Math.round(w / 4));
    const sh = Math.max(1, Math.round(h / 4));
    small = makeTarget(sw, sh);
    smallB = makeTarget(sw, sh);
  };
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);

  // Floor centimetres to CSS pixels, for a point at height z, and back for the floor itself.
  const toScreen = (x: number, y: number, z = 0): Point => {
    const k = scale * perspective(z);
    return { x: center.x + x * k, y: center.y + y * k };
  };
  const toFloor = (pt: Point): Point => ({
    x: (pt.x - center.x) / scale,
    y: (pt.y - center.y) / scale,
  });

  let settings: ChamberSettings = { ...DEFAULT_SETTINGS };
  let day = true;
  const placed = new Map<SourceId, Placed>(
    SOURCES.map((s) => [s.id, { id: s.id, ...s.start }]),
  );
  const present = () =>
    settings.sources
      .map((id) => placed.get(id))
      .filter((p): p is Placed => Boolean(p));
  let floorDirty = true;

  // It starts beside the salt, so the salt's electrons curl as they cross it.
  const magnet = { x: -1.6, y: -2.4 };
  const field = (x: number, y: number) => {
    if (settings.magnet === "off") return 0;
    const sign = settings.magnet === "north" ? 1 : -1;
    const rho2 = ((x - magnet.x) ** 2 + (y - magnet.y) ** 2) / FIELD_REACH ** 2;
    return (sign * FIELD) / (1 + rho2) ** 1.5;
  };

  let torchAngle = Math.PI + 0.42;
  const torch = () => {
    const lens = onSquare(torchAngle, TORCH_RING);
    const aim = { x: -lens.x, y: -lens.y, z: 0.5 - TORCH_Z };
    const l = Math.hypot(aim.x, aim.y, aim.z);
    const flat = Math.hypot(lens.x, lens.y);
    return {
      lens,
      dir: { x: aim.x / l, y: aim.y / l, z: aim.z / l },
      back: {
        x: lens.x + (lens.x / flat) * TORCH_LENGTH,
        y: lens.y + (lens.y / flat) * TORCH_LENGTH,
      },
    };
  };

  // The layer's readiness: it starts part-formed and builds, and the lid wrecks it.
  let readiness = 0.35;
  let lidOff = 0;
  let rainBoost = 0;
  let haze = 0.3;
  let clock = 0;
  let exposed = 0;
  const drift = { x: 0, y: 0 };

  const flow = createFlow();
  const droplets = createDroplets(MAX_DROPLETS, flow);
  const particles = createParticles({
    emit: (x, y, z, start, weight, id) =>
      droplets.add(x, y, z, start, weight, id),
    field,
    readiness: () => readiness,
  });

  // Notes about what just happened, a few of each and not too often.
  const shown = new Map<string, number>();
  const NOTE_LIMIT: Record<string, number> = {
    thoron: 2,
    pair: 3,
    decay: 3,
    kink: 2,
    shower: 99,
    lid: 99,
    lingering: 1,
  };
  let lastNote = -10;
  const note = (key: Note | "lid", text: string, force = false) => {
    const count = shown.get(key) ?? 0;
    if (count >= (NOTE_LIMIT[key] ?? 1)) return;
    if (!force && clock - lastNote < 6) return;
    shown.set(key, count + 1);
    lastNote = clock;
    onNote?.(text);
  };
  const sources = createSources(particles, flow, (key, text) =>
    note(key, text),
  );

  const counted = new Set<number>();
  const stats: ChamberStats = {
    alpha: 0,
    beta: 0,
    muon: 0,
    vees: 0,
    droplets: 0,
    exposure: 0,
    fps: null,
  };
  const seenVees = new Set<number>();

  // The tracks' labels are carried along on the air, as the droplets are.
  const air = new Float32Array(2);
  const carry = (t: Track, dt: number) => {
    flow.sample(t.ax, t.ay, air);
    const shear = Math.min(1, t.az * 1.1);
    t.ax += air[0] * shear * dt;
    t.ay += air[1] * shear * dt;
  };

  const tally = () => {
    for (const t of particles.tracks) {
      if (counted.has(t.id) || clock - t.born < 0.25 || t.drops < 10) continue;
      counted.add(t.id);
      if (t.kind === "alpha") stats.alpha++;
      else if (t.kind === "muon") stats.muon++;
      else stats.beta++;
      if (t.kinked) {
        note(
          "kink",
          "That alpha bounced off a nucleus: a sharp kink, and a short thick stub where the nucleus recoiled.",
        );
      }
      if (t.tag === "α Po-216" && !seenVees.has(t.group)) {
        const first = particles.tracks.find(
          (o) => o.group === t.group && o.id !== t.id,
        );
        if (first && first.drops >= 10) {
          seenVees.add(t.group);
          stats.vees++;
        }
      }
    }
    if (counted.size > 4000) {
      const alive = new Set(particles.tracks.map((t) => t.id));
      for (const id of counted) if (!alive.has(id)) counted.delete(id);
    }
  };

  // Pointer state.
  type Drag =
    | { kind: "source"; id: number; source: Placed; dx: number; dy: number }
    | { kind: "torch"; id: number }
    | { kind: "magnet"; id: number; dx: number; dy: number };
  let drag: Drag | null = null;
  let pointer: Point | null = null;
  let hovered = -1;
  let hoverAt: Point | null = null;

  const torchHit = (pt: Point) => {
    const t = torch();
    const a = toScreen(t.lens.x, t.lens.y, TORCH_Z);
    const b = toScreen(t.back.x, t.back.y, TORCH_Z);
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const f = clamp(
      ((pt.x - a.x) * abx + (pt.y - a.y) * aby) / (abx * abx + aby * aby),
      0,
      1,
    );
    const d = Math.hypot(pt.x - (a.x + abx * f), pt.y - (a.y + aby * f));
    return d < TORCH_RADIUS * scale * perspective(TORCH_Z * 2) + 6;
  };

  const sourceAt = (pt: Point) => {
    const p = toFloor(pt);
    const list = present();
    for (let i = list.length - 1; i >= 0; i--) {
      const s = list[i];
      if (s.id === "radium") {
        if (onHand(s, p.x, p.y)) return s;
      } else if (Math.hypot(p.x - s.x, p.y - s.y) < footprint(s) + 0.15) {
        return s;
      }
    }
    return null;
  };

  const magnetAt = (pt: Point) => {
    if (settings.magnet === "off") return false;
    const p = toFloor(pt);
    return Math.hypot(p.x - magnet.x, p.y - magnet.y) < 1.1;
  };

  const cursorAt = (pt: Point) => {
    if (torchHit(pt) || sourceAt(pt) || magnetAt(pt)) return "grab";
    return "default";
  };

  const findHover = () => {
    if (!pointer || drag) {
      if (hovered !== -1) {
        hovered = -1;
        onHover?.(null);
      }
      return;
    }
    const p = toFloor(pointer);
    const oldest = particles.tracks[0]?.id ?? 1;
    const id = droplets.nearest(p.x, p.y, 14 / scale, Math.max(1, oldest));
    if (id !== hovered || (id > 0 && hoverAt !== pointer)) {
      hovered = id;
      hoverAt = pointer;
      const t = particles.tracks.find((o) => o.id === id);
      onHover?.(
        t
          ? { name: t.name, detail: t.detail, x: pointer.x, y: pointer.y }
          : null,
      );
      if (!t) hovered = -1;
    }
  };

  // The simulation, one step.
  const step = (dt: number) => {
    clock += dt;
    particles.clock = clock;
    if (lidOff > 0) {
      lidOff -= dt;
      readiness = 0;
    } else {
      readiness = Math.min(1, readiness + dt / 7);
    }
    rainBoost *= Math.exp(-dt / 3);
    haze = 0.3 + 0.9 * flow.stirring;
    flow.update(dt);
    drift.x += dt * 0.05;
    drift.y -= dt * 0.03;
    sources.step(dt, present());
    if (
      !settings.sources.includes("mantle") &&
      sources.thoron > 40 &&
      (shown.get("thoron") ?? 0) > 0
    ) {
      note(
        "lingering",
        "The mantle's gone, but its thoron is still in the air: V's keep coming for a minute or two.",
      );
    }
    // Rain: droplets that have grown on specks of dust and fall through the beam all the time.
    const rain =
      RAIN * (1 + rainBoost) * dt * smoothstep(0, 1, readiness + 0.3);
    for (let n = Math.floor(rain + Math.random()); n > 0; n--) {
      droplets.add(
        (Math.random() * 2 - 1) * HALF,
        (Math.random() * 2 - 1) * HALF,
        0.5 + Math.random() * 4.5,
        clock - 0.05 - Math.random() * 0.3,
        0.2 + Math.random() * 0.6,
        0,
        2.2 + Math.random() * 1.6,
      );
    }
    droplets.step(dt, clock);
    for (const t of particles.tracks) carry(t, dt);
    particles.prune(7.5);
    tally();
  };

  const objects = new Float32Array(16);
  const objectCount = () => {
    const list = present();
    list.forEach((p, i) => {
      const s = source(p.id);
      let x = p.x;
      let y = p.y;
      if (p.id === "radium") {
        x += Math.cos(p.angle) * 1.2;
        y += Math.sin(p.angle) * 1.2;
      }
      objects.set([x, y, s.radius, s.height], i * 4);
    });
    return list.length;
  };

  const setBeam = (p: Program) => {
    const t = torch();
    gl.uniform3f(p.at("uTorchPos"), t.lens.x, t.lens.y, TORCH_Z);
    gl.uniform3f(p.at("uTorchDir"), t.dir.x, t.dir.y, t.dir.z);
    gl.uniform1f(p.at("uTorchOn"), settings.torch ? 1 : 0);
    gl.uniform4fv(p.at("uObj"), objects);
    gl.uniform1i(p.at("uObjCount"), objectCount());
  };

  const quad = () => {
    gl.bindVertexArray(empty);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  const render = (dtSim: number) => {
    if (!main || !small || !smallB || !exposureTarget) return;
    if (floorDirty) {
      drawFloor(floorCtx, glowCtx, present());
      upload(floorTexture, floorCanvas, true);
      upload(glowTexture, glowCanvas, false);
      floorDirty = false;
    }
    const count = droplets.write(dropData, clock);
    stats.droplets = count;

    // Droplets.
    gl.bindFramebuffer(gl.FRAMEBUFFER, main.framebuffer);
    gl.viewport(0, 0, width, height);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    select(drops);
    gl.uniform2f(drops.at("uRes"), width, height);
    gl.uniform2f(drops.at("uCenter"), center.x * ratio, center.y * ratio);
    gl.uniform1f(drops.at("uScale"), scale * ratio);
    gl.uniform1f(drops.at("uPx"), ratio);
    gl.uniform1f(drops.at("uHover"), hovered);
    gl.uniform1f(drops.at("uAmbient"), day ? 0.02 : 0.0015);
    gl.uniform1f(drops.at("uGain"), 0.3);
    setBeam(drops);
    gl.bindVertexArray(dropVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, dropBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, dropData, 0, count * 5);
    gl.drawArrays(gl.POINTS, 0, count);

    // The long exposure adds them up.
    if (settings.exposure) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, exposureTarget.framebuffer);
      select(accumulate);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, main.texture);
      gl.uniform1i(accumulate.at("uSource"), 0);
      gl.uniform1f(accumulate.at("uWeight"), dtSim * 0.9);
      quad();
      exposed += dtSim;
    }
    gl.disable(gl.BLEND);
    const display = settings.exposure ? exposureTarget : main;

    // A glow, from a quarter-size blurred copy.
    select(down);
    gl.bindFramebuffer(gl.FRAMEBUFFER, small.framebuffer);
    gl.viewport(0, 0, small.width, small.height);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, display.texture);
    gl.uniform1i(down.at("uSource"), 0);
    gl.uniform2f(down.at("uTexel"), 1 / width, 1 / height);
    quad();
    select(blur);
    gl.uniform1i(blur.at("uSource"), 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, smallB.framebuffer);
    gl.bindTexture(gl.TEXTURE_2D, small.texture);
    gl.uniform2f(blur.at("uStep"), 1 / small.width, 0);
    quad();
    gl.bindFramebuffer(gl.FRAMEBUFFER, small.framebuffer);
    gl.bindTexture(gl.TEXTURE_2D, smallB.texture);
    gl.uniform2f(blur.at("uStep"), 0, 1 / small.height);
    quad();

    // Everything else, and the droplets over it.
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, width, height);
    select(composite);
    const bind = (unit: number, texture: WebGLTexture | null, name: string) => {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.uniform1i(composite.at(name), unit);
    };
    bind(0, display.texture, "uDrops");
    bind(1, small.texture, "uBloom");
    bind(2, floorTexture, "uObjects");
    bind(3, glowTexture, "uGlow");
    gl.uniform2f(composite.at("uRes"), width, height);
    gl.uniform2f(composite.at("uCenter"), center.x * ratio, center.y * ratio);
    gl.uniform1f(composite.at("uScale"), scale * ratio);
    gl.uniform1f(composite.at("uDay"), day ? 1 : 0);
    gl.uniform1f(composite.at("uTime"), clock);
    gl.uniform1f(composite.at("uHaze"), haze);
    gl.uniform1f(composite.at("uLid"), lidOff > 0 ? 0 : 1);
    // The long exposure stops down as it goes, as a camera's meter would, so the sources don't
    // burn out to white.
    gl.uniform1f(
      composite.at("uDropGain"),
      settings.exposure ? 1 / (1 + exposed * 0.07) : 1,
    );
    gl.uniform2f(composite.at("uDrift"), drift.x, drift.y);
    setBeam(composite);
    quad();
    gl.activeTexture(gl.TEXTURE0);

    drawOverlay();
  };

  const fontFamily =
    getComputedStyle(overlay).fontFamily || "system-ui, sans-serif";

  const drawTorch = () => {
    const t = torch();
    const a = toScreen(t.lens.x, t.lens.y, TORCH_Z);
    const b = toScreen(t.back.x, t.back.y, TORCH_Z);
    const angle = Math.atan2(a.y - b.y, a.x - b.x);
    const length = Math.hypot(a.x - b.x, a.y - b.y);
    const r = TORCH_RADIUS * scale * perspective(TORCH_Z * 2);
    const light = day ? 1 : 0.16;
    const shade = (v: number) => Math.round(v * light);
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(angle);
    // Its shadow on the frost and the polystyrene, by day.
    if (day) {
      ctx.shadowColor = "rgba(0, 0, 0, 0.32)";
      ctx.shadowBlur = r * 0.9;
      ctx.shadowOffsetX = r * 0.25;
      ctx.shadowOffsetY = r * 0.45;
    }
    // Anodised aluminium, a cylinder lit from above.
    const body = ctx.createLinearGradient(0, -r, 0, r);
    body.addColorStop(0, `rgb(${shade(28)}, ${shade(29)}, ${shade(32)})`);
    body.addColorStop(0.3, `rgb(${shade(96)}, ${shade(98)}, ${shade(104)})`);
    body.addColorStop(0.42, `rgb(${shade(150)}, ${shade(152)}, ${shade(158)})`);
    body.addColorStop(0.62, `rgb(${shade(66)}, ${shade(68)}, ${shade(74)})`);
    body.addColorStop(1, `rgb(${shade(18)}, ${shade(18)}, ${shade(20)})`);
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.roundRect(0, -r * 0.86, length - r * 1.1, r * 1.72, r * 0.4);
    ctx.fill();
    ctx.shadowColor = "transparent";
    // The head, wider, with its bezel.
    const head = ctx.createLinearGradient(0, -r * 1.1, 0, r * 1.1);
    head.addColorStop(0, `rgb(${shade(40)}, ${shade(41)}, ${shade(44)})`);
    head.addColorStop(0.38, `rgb(${shade(184)}, ${shade(186)}, ${shade(190)})`);
    head.addColorStop(0.6, `rgb(${shade(84)}, ${shade(86)}, ${shade(90)})`);
    head.addColorStop(1, `rgb(${shade(22)}, ${shade(22)}, ${shade(24)})`);
    ctx.fillStyle = head;
    ctx.beginPath();
    ctx.roundRect(length - r * 1.9, -r * 1.1, r * 1.9, r * 2.2, r * 0.25);
    ctx.fill();
    // Knurling on the grip.
    ctx.strokeStyle = `rgba(0, 0, 0, ${day ? 0.28 : 0.5})`;
    ctx.lineWidth = Math.max(0.6, r * 0.05);
    for (let x = length * 0.22; x < length * 0.55; x += r * 0.16) {
      ctx.beginPath();
      ctx.moveTo(x, -r * 0.8);
      ctx.lineTo(x, r * 0.8);
      ctx.stroke();
    }
    // The tail cap's rubber button.
    ctx.fillStyle = `rgb(${shade(20)}, ${shade(20)}, ${shade(22)})`;
    ctx.beginPath();
    ctx.roundRect(-r * 0.12, -r * 0.5, r * 0.3, r, r * 0.12);
    ctx.fill();
    // The lens, seen edge-on as a bright sliver when it's on.
    if (settings.torch) {
      const glow = ctx.createRadialGradient(length, 0, 0, length, 0, r * 2.2);
      glow.addColorStop(0, "rgba(255, 252, 240, 0.9)");
      glow.addColorStop(0.35, "rgba(255, 250, 235, 0.25)");
      glow.addColorStop(1, "rgba(255, 250, 235, 0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(length, 0, r * 2.2, -Math.PI / 2, Math.PI / 2);
      ctx.fill();
      ctx.fillStyle = "rgb(255, 253, 246)";
      ctx.fillRect(length - r * 0.12, -r * 0.82, r * 0.16, r * 1.64);
    } else {
      ctx.fillStyle = `rgba(200, 210, 220, ${day ? 0.6 : 0.12})`;
      ctx.fillRect(length - r * 0.1, -r * 0.82, r * 0.12, r * 1.64);
    }
    ctx.restore();
  };

  const drawMagnet = () => {
    if (settings.magnet === "off") return;
    const c = toScreen(magnet.x, magnet.y);
    const r = FIELD_REACH * scale;
    const strong = drag?.kind === "magnet" ? 0.55 : 0.2;
    ctx.save();
    ctx.strokeStyle = `rgba(255, 255, 255, ${strong})`;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 5]);
    ctx.beginPath();
    ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = `rgba(255, 255, 255, ${strong * 0.5})`;
    ctx.beginPath();
    ctx.arc(c.x, c.y, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = `rgba(0, 0, 0, ${0.5 + strong})`;
    ctx.font = `600 10px ${fontFamily}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(settings.magnet === "north" ? "N" : "S", c.x, c.y + 0.5);
    ctx.restore();
  };

  // Labels at the tracks' ends, newest first, skipping any that would cover one already placed.
  const placedLabels: { x: number; y: number; w: number }[] = [];
  const drawLabels = () => {
    if (!settings.labels) return;
    ctx.save();
    ctx.font = `500 10px ${fontFamily}`;
    ctx.textBaseline = "middle";
    placedLabels.length = 0;
    for (let i = particles.tracks.length - 1; i >= 0; i--) {
      const t = particles.tracks[i];
      const age = clock - t.born;
      if (t.drops < 12 || age < 0.12 || age > LABEL_LIFE) continue;
      const fade =
        smoothstep(0.12, 0.3, age) *
        (1 - smoothstep(LABEL_LIFE - 0.8, LABEL_LIFE, age));
      const p = toScreen(t.ax, t.ay, t.az);
      const colour = t.tag === "δ" ? COLOURS.delta : COLOURS[t.kind];
      const w = ctx.measureText(t.tag).width;
      if (
        placedLabels.some(
          (o) =>
            p.x + 4 < o.x + o.w + 8 &&
            o.x + 4 < p.x + w + 8 &&
            Math.abs(p.y - o.y) < 15,
        )
      ) {
        continue;
      }
      placedLabels.push({ x: p.x, y: p.y, w });
      ctx.fillStyle = `rgba(0, 0, 0, ${0.45 * fade})`;
      ctx.beginPath();
      ctx.roundRect(p.x + 4, p.y - 13, w + 8, 14, 4);
      ctx.fill();
      ctx.fillStyle = `rgba(${colour}, ${0.95 * fade})`;
      ctx.fillText(t.tag, p.x + 8, p.y - 6);
    }
    ctx.restore();
  };

  const drawOverlay = () => {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    drawMagnet();
    drawLabels();
    drawTorch();
  };

  let raf = 0;
  let last = performance.now();
  let frames = 0;
  let windowStart = last;
  let lastReport = 0;
  let disposed = false;

  const loop = (now: number) => {
    if (disposed) return;
    const real = Math.min((now - last) / 1000, 1 / 20);
    last = now;
    const dt = real * settings.speed;
    resize();
    step(dt);
    findHover();
    render(dt);
    frames++;
    if (now - windowStart >= 500) {
      stats.fps = Math.round((frames * 1000) / (now - windowStart));
      frames = 0;
      windowStart = now;
    }
    if (now - lastReport > 250) {
      lastReport = now;
      stats.exposure = exposed;
      onStats?.({ ...stats });
    }
    raf = requestAnimationFrame(loop);
  };

  resize();
  raf = requestAnimationFrame(loop);

  return {
    setSettings(next: ChamberSettings) {
      if (next.sources.join() !== settings.sources.join()) floorDirty = true;
      if (next.exposure && !settings.exposure) {
        exposed = 0;
        if (exposureTarget) {
          gl.bindFramebuffer(gl.FRAMEBUFFER, exposureTarget.framebuffer);
          gl.clearColor(0, 0, 0, 1);
          gl.clear(gl.COLOR_BUFFER_BIT);
        }
      }
      settings = { ...next, sources: [...next.sources] };
    },
    setDay(on: boolean) {
      day = on;
    },
    // Returns the cursor for what a press here does.
    pointerDown(id: number, pt: Point) {
      pointer = pt;
      if (torchHit(pt)) {
        drag = { kind: "torch", id };
        return "grabbing";
      }
      const s = sourceAt(pt);
      if (s) {
        const p = toFloor(pt);
        drag = { kind: "source", id, source: s, dx: s.x - p.x, dy: s.y - p.y };
        return "grabbing";
      }
      if (magnetAt(pt)) {
        const p = toFloor(pt);
        drag = { kind: "magnet", id, dx: magnet.x - p.x, dy: magnet.y - p.y };
        return "grabbing";
      }
      return "default";
    },
    pointerMove(id: number, pt: Point) {
      pointer = pt;
      if (!drag || drag.id !== id) return;
      const p = toFloor(pt);
      if (drag.kind === "torch") {
        torchAngle = Math.atan2(p.y, p.x);
      } else if (drag.kind === "source") {
        const s = drag.source;
        const keep = HALF - Math.min(1.2, source(s.id).radius * 0.7);
        s.x = clamp(p.x + drag.dx, -keep, keep);
        s.y = clamp(p.y + drag.dy, -keep, keep);
        floorDirty = true;
      } else {
        magnet.x = clamp(p.x + drag.dx, -HALF + 1, HALF - 1);
        magnet.y = clamp(p.y + drag.dy, -HALF + 1, HALF - 1);
      }
    },
    pointerUp(id: number) {
      if (drag && drag.id === id) drag = null;
    },
    hover(pt: Point) {
      pointer = pt;
      return cursorAt(pt);
    },
    leave() {
      pointer = null;
    },
    // Turns the torch round the chamber, a step at a time from the keyboard.
    turnTorch(by: number) {
      torchAngle += by;
    },
    liftLid() {
      lidOff = 1.4;
      readiness = 0;
      rainBoost = 5;
      flow.stir(1);
      droplets.disturb();
      note(
        "lid",
        "The lid's off: the room's warm air has spoilt the cold layer. It takes a few seconds to settle again.",
        true,
      );
    },
    restartExposure() {
      exposed = 0;
      if (exposureTarget) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, exposureTarget.framebuffer);
        gl.clearColor(0, 0, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
      }
    },
    // A PNG of the stage as it is, torch and all.
    snapshot() {
      render(0);
      const out = document.createElement("canvas");
      out.width = width;
      out.height = height;
      const c = out.getContext("2d");
      if (!c) return null;
      c.drawImage(canvas, 0, 0);
      c.drawImage(overlay, 0, 0);
      return out.toDataURL("image/png");
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      observer.disconnect();
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    },
  };
}

export type CloudChamber = ReturnType<typeof createCloudChamber>;

// How far an arrow key turns the torch round the chamber.
export const TORCH_STEP = Math.PI / 36;
