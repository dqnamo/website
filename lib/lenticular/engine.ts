// A lenticular card held up in front of a wall: a print of interlaced pictures under a sheet of
// tiny cylindrical lenses, which shows one picture or another as it's tilted. It's drawn by
// following rays through the lenses to the print (see shaders.ts), so what it shows comes from
// the optics alone: tilt it and it changes picture; tilt it past the end of a lens's view and the
// pictures come round again; hold it closer or further than the print was made for and it
// changes in bands; lay the print a fraction of a degree off square and the bands run diagonally.
//
// Water put on it nearly cancels the lenses, since water bends light almost as much as the
// plastic does, so under a drop the striped print shows through. Drops on the grooved face wick
// along the grooves into ovals, and dry as drops do: first thinning in place with their edge
// pinned, then shrinking, leaving a faint ring of whatever was dissolved in them where the edge
// held.

import {
  CARD,
  DESIGN_DISTANCE,
  LENSES,
  type Lpi,
  printScale,
  sliceAt,
  throughLens,
} from "./lens";
import {
  type CardId,
  cardDef,
  drawFrame,
  IMAGE_HEIGHT,
  IMAGE_WIDTH,
} from "./cards";
import { FS, MAX_DROPS, MAX_RINGS, VS } from "./shaders";

export type { CardId } from "./cards";
export type { Lpi } from "./lens";

export type LenticularSettings = {
  card: CardId;
  lpi: Lpi;
  // Lenses running across the card, so it changes as it's tipped towards you rather than turned.
  across: boolean;
  // How far from the eye the card is held, in millimetres.
  distance: number;
  // How far off square to the lenses the print was laid, in degrees.
  skew: number;
  // The lens sheet peeled off, leaving the bare print.
  bare: boolean;
  words: [string, string];
};

export const DEFAULT_SETTINGS: LenticularSettings = {
  card: "eye",
  lpi: 75,
  across: false,
  distance: DESIGN_DISTANCE,
  skew: 0,
  bare: false,
  words: ["Hello", "Goodbye"],
};

export type LenticularStats = {
  // Degrees: turned to the right, and its top tipped towards you.
  yaw: number;
  pitch: number;
  // The picture seen at the middle of the card, from 0, and how many there are.
  frame: number;
  frames: number;
  drops: number;
  fps: number | null;
};

// The view across the lenses at the middle of the card, for the panel's cross-section: the angle
// the eye's line of sight makes with the card's face, and the picture it lands on there.
export type LensView = {
  angle: number;
  slice: number;
};

type Point = { x: number; y: number };
type Vec = [number, number, number];

type Drop = {
  u: number;
  v: number;
  // Footprint radius across the grooves, and its contact angle.
  r: number;
  theta: number;
  age: number;
  // How long it stays pinned, and then how long it takes to shrink away.
  pinned: number;
  shrink: number;
  r0: number;
};

type Ring = { u: number; v: number; r: number; strength: number };

const DEG = Math.PI / 180;
const MAX_TILT = 50 * DEG;
// Degrees of turn for each pixel dragged.
const DRAG = 0.22 * DEG;
const CONTACT = 74 * DEG;
const DRY = 20 * DEG;
const LOUPE_RADIUS = 92;
const LOUPE_POWER = 8;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

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

// The card's axes in the world, tipped (pitch) and then turned about the vertical (yaw). Yaw
// turns its face to the right; pitch tips its top towards you, so its face looks down.
function cardAxes(yaw: number, pitch: number): [Vec, Vec, Vec] {
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const u: Vec = [cy, 0, -sy];
  const v: Vec = [sy * sp, cp, cy * sp];
  const w: Vec = [sy * cp, -sp, cy * cp];
  return [u, v, w];
}

export type Lenticular = ReturnType<typeof createLenticular>;

export function createLenticular(
  canvas: HTMLCanvasElement,
  {
    onStats,
    onView,
    onNote,
  }: {
    onStats?: (stats: LenticularStats) => void;
    onView?: (view: LensView) => void;
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

  let settings: LenticularSettings = { ...DEFAULT_SETTINGS };
  let sans = "sans-serif";
  let night = false;
  let dirty = true;
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---- The print's pictures ---------------------------------------------------------------------

  const frameCanvas = document.createElement("canvas");
  frameCanvas.width = IMAGE_WIDTH;
  frameCanvas.height = IMAGE_HEIGHT;
  const frameCtx = frameCanvas.getContext("2d");
  if (!frameCtx) throw new Error("Couldn't draw the pictures");
  const pictures = gl.createTexture();
  let layers = 0;
  const uploadFrames = () => {
    const def = cardDef(settings.card);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, pictures);
    if (layers !== def.frames) {
      gl.texImage3D(
        gl.TEXTURE_2D_ARRAY,
        0,
        gl.SRGB8_ALPHA8,
        IMAGE_WIDTH,
        IMAGE_HEIGHT,
        def.frames,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        null,
      );
      layers = def.frames;
    }
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    for (let k = 0; k < def.frames; k++) {
      drawFrame(frameCtx, settings.card, k, {
        across: settings.across,
        words: settings.words,
        sans,
      });
      gl.texSubImage3D(
        gl.TEXTURE_2D_ARRAY,
        0,
        0,
        0,
        k,
        IMAGE_WIDTH,
        IMAGE_HEIGHT,
        1,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        frameCanvas,
      );
    }
    gl.generateMipmap(gl.TEXTURE_2D_ARRAY);
    gl.texParameteri(
      gl.TEXTURE_2D_ARRAY,
      gl.TEXTURE_MIN_FILTER,
      gl.LINEAR_MIPMAP_LINEAR,
    );
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    dirty = true;
  };

  // ---- Camera -----------------------------------------------------------------------------------

  let width = 1;
  let height = 1;
  let cssW = 1;
  let cssH = 1;
  // The view keeps the whole card in frame wherever it's held, so bringing it nearer shows up
  // as stronger perspective rather than a bigger card.
  let tanX = 1;
  let tanY = 1;

  const solveCamera = () => {
    const aspect = cssW / cssH;
    const fill = aspect < 0.9 ? 0.86 : 0.7;
    const needX = CARD.width / 2 / (fill * settings.distance);
    const needY = CARD.height / 2 / (0.7 * settings.distance);
    tanY = Math.max(needX / aspect, needY);
    tanX = tanY * aspect;
    dirty = true;
  };

  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cw = Math.max(1, canvas.clientWidth);
    const ch = Math.max(1, canvas.clientHeight);
    // Full resolution on ordinary screens; huge full-screen views are kept affordable.
    let scale = Math.max(dpr, 1);
    scale = Math.min(scale, Math.sqrt(2.6e6 / (cw * ch)));
    const w = Math.max(1, Math.round(cw * scale));
    const h = Math.max(1, Math.round(ch * scale));
    if (w === width && h === height && cw === cssW && ch === cssH) return;
    width = w;
    height = h;
    cssW = cw;
    cssH = ch;
    canvas.width = w;
    canvas.height = h;
    solveCamera();
  };

  const rayAt = (p: Point): Vec => {
    const nx = (p.x / cssW) * 2 - 1;
    const ny = 1 - (p.y / cssH) * 2;
    const d: Vec = [nx * tanX, ny * tanY, -1];
    const l = Math.hypot(...d);
    return [d[0] / l, d[1] / l, d[2] / l];
  };

  // ---- Tilt -------------------------------------------------------------------------------------

  let yaw = 0;
  let pitch = 0;
  let aimYaw = 0;
  let aimPitch = 0;
  let wiggle: { t: number; duration: number } | null = null;
  let grab: {
    id: number;
    x: number;
    y: number;
    moved: number;
    start: Point;
  } | null = null;
  let lastFrame = -1;
  let sweep = 0;

  const eye = (): Vec => [0, 0, settings.distance];

  // Where a point on the stage falls on the card's face, in the card's millimetres.
  const onCard = (p: Point) => {
    const [u, v, w] = cardAxes(yaw, pitch);
    const lens = LENSES[settings.lpi];
    const o = eye();
    const d = rayAt(p);
    // The plane of the crests: w·x = thickness.
    const denom = d[0] * w[0] + d[1] * w[1] + d[2] * w[2];
    if (Math.abs(denom) < 1e-6) return null;
    const s =
      (lens.thickness - (o[0] * w[0] + o[1] * w[1] + o[2] * w[2])) / denom;
    const x: Vec = [o[0] + d[0] * s, o[1] + d[1] * s, o[2] + d[2] * s];
    const cu = x[0] * u[0] + x[1] * u[1] + x[2] * u[2];
    const cv = x[0] * v[0] + x[1] * v[1] + x[2] * v[2];
    const qx = Math.abs(cu) - CARD.width / 2 + CARD.corner;
    const qy = Math.abs(cv) - CARD.height / 2 + CARD.corner;
    const outside =
      Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) +
        Math.min(Math.max(qx, qy), 0) -
        CARD.corner >
      0;
    return outside ? null : { u: cu, v: cv };
  };

  // What the eye sees at the middle of the card: the line of sight through the lens nearest the
  // middle, followed to the print.
  const centreView = (): LensView & { frame: number } => {
    const def = cardDef(settings.card);
    const lens = LENSES[settings.lpi];
    const [u, v, w] = cardAxes(yaw, pitch);
    const o = eye();
    const len = Math.hypot(...o);
    const toCard: Vec = [-o[0] / len, -o[1] / len, -o[2] / len];
    const local: Vec = [
      toCard[0] * u[0] + toCard[1] * u[1] + toCard[2] * u[2],
      toCard[0] * v[0] + toCard[1] * v[1] + toCard[2] * v[2],
      toCard[0] * w[0] + toCard[1] * w[1] + toCard[2] * w[2],
    ];
    const d: Vec = settings.across
      ? [local[1], local[0], local[2]]
      : [local[0], local[1], local[2]];
    const angle = Math.atan2(-d[0], -d[2]);
    if (settings.bare) return { angle, slice: Number.NaN, frame: -1 };
    // A line of sight through the middle of the lens, from where it crosses the crest's height.
    const ray = throughLens(lens, 0, d);
    if (!ray) return { angle, slice: Number.NaN, frame: -1 };
    const halfA = (settings.across ? CARD.height : CARD.width) / 2;
    const scale = printScale(lens);
    // The lens nearest the middle, and where its line of sight lands across the print's strips,
    // counted as the shader counts them.
    const column = Math.floor(halfA / lens.pitch);
    const a = (column + 0.5) * lens.pitch - halfA;
    const x = (a + ray.print + halfA * scale) / (lens.pitch * scale);
    const slice = sliceAt(x, def.frames, def.phase);
    return { angle, slice, frame: Math.floor(slice) };
  };

  // ---- Water ------------------------------------------------------------------------------------

  const drops: Drop[] = [];
  const rings: Ring[] = [];
  let toldWater = false;
  let toldRing = false;

  const addDrop = (u: number, v: number) => {
    const r = 3 + Math.random() * 1.6;
    drops.push({
      u,
      v,
      r,
      r0: r,
      theta: CONTACT - Math.random() * 6 * DEG,
      age: 0,
      pinned: 70 + Math.random() * 20,
      shrink: 22 + Math.random() * 8,
    });
    while (drops.length > MAX_DROPS) drops.shift();
    if (!toldWater) {
      toldWater = true;
      onNote?.(
        "Water bends light almost as much as the plastic does, so under the drop the lenses all but stop working and the striped print shows through.",
      );
    }
    dirty = true;
  };

  const evaporate = (dt: number) => {
    for (let i = drops.length - 1; i >= 0; i--) {
      const drop = drops[i];
      drop.age += dt;
      if (drop.age < drop.pinned) {
        // Pinned at its edge, it thins: the contact angle falls as the water goes.
        const k = drop.age / drop.pinned;
        drop.theta = CONTACT + (DRY - CONTACT) * k;
      } else {
        const k = (drop.age - drop.pinned) / drop.shrink;
        drop.theta = DRY;
        drop.r = drop.r0 * Math.sqrt(Math.max(0, 1 - k));
        if (k >= 1) {
          drops.splice(i, 1);
          rings.push({ u: drop.u, v: drop.v, r: drop.r0, strength: 0.5 });
          while (rings.length > MAX_RINGS) rings.shift();
          if (!toldRing) {
            toldRing = true;
            onNote?.(
              "Dry, it leaves a faint ring where its edge was pinned: whatever was dissolved in the water, carried out to the edge as it evaporated.",
            );
          }
        }
      }
    }
  };

  // ---- Frame ------------------------------------------------------------------------------------

  let loupe: Point | null = null;
  let raf = 0;
  let last = performance.now();
  let frameCount = 0;
  let fpsStamp = last;
  let fps: number | null = null;
  let statStamp = 0;
  let disposed = false;
  let lastView = { angle: Number.NaN, slice: Number.NaN };
  let quiet = 0;
  let wasMoving = false;

  const render = (samples: number) => {
    const def = cardDef(settings.card);
    const lens = LENSES[settings.lpi];
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, width, height);
    // biome-ignore lint/correctness/useHookAtTopLevel: WebGL's useProgram, not a React hook.
    gl.useProgram(scene.program);
    const u = scene.u;
    const [cu, cv, cw] = cardAxes(yaw, pitch);
    gl.uniform2f(u("uRes"), width, height);
    gl.uniform3f(u("uEye"), ...eye());
    gl.uniform3f(u("uRight"), 1, 0, 0);
    gl.uniform3f(u("uUp"), 0, 1, 0);
    gl.uniform3f(u("uFwd"), 0, 0, -1);
    gl.uniform2f(u("uTan"), tanX, tanY);
    gl.uniformMatrix3fv(u("uCard"), false, [...cu, ...cv, ...cw]);
    gl.uniform3f(u("uLens"), lens.pitch, lens.radius, lens.thickness);
    gl.uniform1i(u("uAcross"), settings.across ? 1 : 0);
    gl.uniform4f(
      u("uPrint"),
      printScale(lens),
      settings.skew * DEG,
      def.frames,
      def.phase,
    );
    gl.uniform1i(u("uBare"), settings.bare ? 1 : 0);
    gl.uniform1i(u("uSamples"), samples);
    if (loupe) {
      const s = width / cssW;
      gl.uniform4f(
        u("uLoupe"),
        loupe.x * s,
        height - loupe.y * s,
        LOUPE_RADIUS * s,
        LOUPE_POWER,
      );
    } else {
      gl.uniform4f(u("uLoupe"), 0, 0, 0, 1);
    }
    const dropData = new Float32Array(MAX_DROPS * 4);
    for (const [i, d] of drops.entries()) {
      dropData.set([d.u, d.v, d.r, d.theta], i * 4);
    }
    gl.uniform4fv(u("uDrops"), dropData);
    gl.uniform1i(u("uDropCount"), drops.length);
    const ringData = new Float32Array(MAX_RINGS * 4);
    for (const [i, r] of rings.entries()) {
      ringData.set([r.u, r.v, r.r, r.strength], i * 4);
    }
    gl.uniform4fv(u("uRings"), ringData);
    gl.uniform1i(u("uRingCount"), rings.length);
    gl.uniform1f(u("uNight"), night ? 1 : 0);
    // The pictures are read one column a lens, so they're blurred to that first.
    const columns = CARD.width / lens.pitch;
    gl.uniform1f(u("uLod"), Math.max(0, Math.log2(IMAGE_WIDTH / columns)));
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, pictures);
    gl.uniform1i(u("uFrames"), 0);
    gl.bindVertexArray(vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  const frame = (stamp: number) => {
    if (disposed) return;
    raf = requestAnimationFrame(frame);
    const dt = Math.min(Math.max((stamp - last) / 1000, 0), 1 / 20);
    last = stamp;
    frameCount++;
    if (stamp - fpsStamp > 1000) {
      fps = Math.round((frameCount * 1000) / (stamp - fpsStamp));
      frameCount = 0;
      fpsStamp = stamp;
    }
    resize();

    if (wiggle) {
      wiggle.t += dt;
      const k = wiggle.t / wiggle.duration;
      if (k >= 1) {
        wiggle = null;
        aimYaw = 0;
        aimPitch = 0;
      } else {
        // Rocked to and fro twice, the swing easing in and out.
        const swing =
          Math.sin(k * Math.PI * 2 * 2) * Math.sin(k * Math.PI) * 26 * DEG;
        if (settings.across) {
          aimPitch = swing;
          aimYaw = 0;
        } else {
          aimYaw = swing;
          aimPitch = 0;
        }
      }
    }
    // The card follows the hand closely, but not instantly.
    const ease = reduceMotion ? 1 : 1 - Math.exp(-dt / 0.045);
    const dy = aimYaw - yaw;
    const dp = aimPitch - pitch;
    if (Math.abs(dy) > 1e-5 || Math.abs(dp) > 1e-5) {
      yaw += dy * ease;
      pitch += dp * ease;
      dirty = true;
    } else if (yaw !== aimYaw || pitch !== aimPitch) {
      yaw = aimYaw;
      pitch = aimPitch;
      dirty = true;
    }

    if (drops.length) {
      evaporate(dt);
      // Drying is slow; a few redraws a second keep up with it.
      quiet += dt;
      if (quiet > 0.1) {
        quiet = 0;
        dirty = true;
      }
    }

    const view = centreView();
    if (
      view.angle !== lastView.angle ||
      (view.slice !== lastView.slice &&
        !(Number.isNaN(view.slice) && Number.isNaN(lastView.slice)))
    ) {
      lastView = view;
      onView?.(view);
    }
    // Turning on past the last picture brings the first round again.
    const n = cardDef(settings.card).frames;
    if (view.frame >= 0 && lastFrame >= 0 && view.frame !== lastFrame) {
      const jump = view.frame - lastFrame;
      if (n > 2 && Math.abs(jump) > n / 2) {
        sweep++;
        if (sweep === 1 && !wiggle) {
          onNote?.(
            "Past the edge of a lens's view it looks through to the next lens's strip, so the pictures come round again from the start.",
          );
        }
      }
    }
    lastFrame = view.frame;

    // Fewer rays while the card's moving; the full count once it settles.
    const moving = wiggle !== null || Math.abs(dy) + Math.abs(dp) > 1e-4;
    if (dirty || wasMoving) {
      render(moving ? 12 : 64);
      dirty = false;
      wasMoving = moving;
    }

    if (stamp - statStamp > 150) {
      statStamp = stamp;
      onStats?.({
        yaw: yaw / DEG,
        pitch: pitch / DEG,
        frame: view.frame,
        frames: n,
        drops: drops.length,
        fps,
      });
    }
  };

  const loadFonts = async () => {
    const family = getComputedStyle(document.documentElement)
      .getPropertyValue("--font-inter")
      .trim();
    if (family) sans = family;
    try {
      await document.fonts.load(`800 100px ${sans}`);
    } catch {
      // The fallback face will do.
    }
    if (!disposed && settings.card === "words") uploadFrames();
  };

  uploadFrames();
  loadFonts();
  raf = requestAnimationFrame(frame);

  let toldAcross = false;
  let toldBands = 0;

  // Turning a card with its lenses running across does nothing, which is worth saying once.
  const sayAcross = () => {
    if (
      settings.across &&
      !toldAcross &&
      Math.abs(aimYaw) > 20 * DEG &&
      Math.abs(aimPitch) < 6 * DEG
    ) {
      toldAcross = true;
      onNote?.(
        "With the lenses running across, turning it sideways changes nothing: tip it towards you or away instead.",
      );
    }
  };

  return {
    setSettings(next: LenticularSettings) {
      const redraw =
        next.card !== settings.card ||
        next.across !== settings.across ||
        (next.card === "words" &&
          (next.words[0] !== settings.words[0] ||
            next.words[1] !== settings.words[1]));
      const before = settings;
      settings = { ...next, words: [...next.words] };
      if (redraw) uploadFrames();
      // Another card is a clean, dry one.
      if (next.card !== before.card) {
        drops.length = 0;
        rings.length = 0;
      }
      if (next.across !== before.across) {
        // Squared up, ready to be tipped the new way.
        aimYaw = 0;
        aimPitch = 0;
      }
      const off = settings.distance / DESIGN_DISTANCE;
      const band = off < 0.75 ? -1 : off > 1.6 ? 1 : 0;
      if (band !== toldBands && band !== 0) {
        onNote?.(
          band < 0
            ? "Closer than the print was made for, the edges see the card from wider angles than its middle does, so it changes in bands."
            : "Further than the print was made for, the strips no longer line up with every lens at once, and it bands the other way.",
        );
      }
      toldBands = band;
      solveCamera();
    },
    setNight(on: boolean) {
      night = on;
      dirty = true;
    },
    // Rock the card to and fro through its pictures.
    wiggle() {
      wiggle = { t: 0, duration: reduceMotion ? 4 : 2.6 };
    },
    level() {
      wiggle = null;
      aimYaw = 0;
      aimPitch = 0;
    },
    tilt(nextYaw: number, nextPitch: number) {
      wiggle = null;
      aimYaw = clamp(nextYaw * DEG, -MAX_TILT, MAX_TILT);
      aimPitch = clamp(nextPitch * DEG, -MAX_TILT, MAX_TILT);
    },
    nudge(dYaw: number, dPitch: number) {
      wiggle = null;
      aimYaw = clamp(aimYaw + dYaw * DEG, -MAX_TILT, MAX_TILT);
      aimPitch = clamp(aimPitch + dPitch * DEG, -MAX_TILT, MAX_TILT);
      sayAcross();
    },
    setLoupe(p: Point | null) {
      loupe = p;
      dirty = true;
    },
    // A drop of water where the stage was tapped, if that's on the card.
    dropAt(p: Point) {
      const at = onCard(p);
      if (!at) return false;
      addDrop(at.u, at.v);
      return true;
    },
    // A cloth over the card: the water and the rings it left.
    wipe() {
      drops.length = 0;
      rings.length = 0;
      dirty = true;
    },
    pointerDown(id: number, p: Point) {
      if (grab) return false;
      wiggle = null;
      grab = { id, x: p.x, y: p.y, moved: 0, start: p };
      return true;
    },
    // Dragging turns the card as if pushing its face along: right turns it to the right, down
    // tips its top towards you.
    pointerMove(id: number, p: Point) {
      if (!grab || grab.id !== id) return;
      const dx = p.x - grab.x;
      const dy = p.y - grab.y;
      grab.x = p.x;
      grab.y = p.y;
      grab.moved += Math.hypot(dx, dy);
      aimYaw = clamp(aimYaw + dx * DRAG, -MAX_TILT, MAX_TILT);
      aimPitch = clamp(aimPitch + dy * DRAG, -MAX_TILT, MAX_TILT);
      sayAcross();
    },
    // Whether the press was a tap rather than a drag.
    pointerUp(id: number) {
      if (!grab || grab.id !== id) return null;
      const tap = grab.moved < 6 ? grab.start : null;
      grab = null;
      return tap;
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    },
  };
}
