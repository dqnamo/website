// A polariscope: a light box with a polarising film over it, and a round polarising filter you
// hold above it. Between them goes either a glass plate you lay clear tape on, or a
// polycarbonate disc in a screw clamp. See shaders.ts for the optics; this file keeps the
// things on the light box, where they are, and how a pointer moves them.
//
// Positions are kept in plate units: from the middle of the film, scaled by its shorter side,
// so a composition keeps its shape when the stage changes size or goes full screen.
//
// Tape's slow axis runs along the strip, so a strip turned to line up with either filter goes
// dark, two strips crossed at right angles cancel to black where they overlap, and stacking
// layers the same way adds their retardance and climbs the colour chart. The disc's stress
// comes from the forces on its rim: the clamp's jaws, and a finger and thumb if you squeeze.
// Squeezed between two points across a diameter, a disc fails by splitting along that diameter,
// which is how the Brazilian test measures the tensile strength of brittle things; turn the
// clamp all the way and that's what this one does.

import { FRAGMENT, MAX_LOADS, MAX_STRIPS, VERTEX } from "./shaders";
import { FIRST_WAVELENGTH, STEP, spectralWeights } from "./spectrum";

export type Specimen = "tape" | "disc";
export type Plate = "none" | "circular" | "tint";
export type TapeKind = "office" | "packing";

export type Point = { x: number; y: number };

// A strip of tape from a to b along its middle, in plate units.
export type Strip = { a: Point; b: Point; kind: TapeKind };

export type PolariscopeSettings = {
  specimen: Specimen;
  plate: Plate;
  tape: TapeKind;
  // Turning one polariser turns the other with it.
  locked: boolean;
};

export type PolariscopeStats = {
  strips: number;
  full: boolean;
  // Each filter's angle in degrees, 0–180.
  analyser: number;
  polariser: number;
  load: number;
  // The fringe order at the disc's centre: its retardance in wavelengths of green light.
  fringes: number;
  cracked: boolean;
};

export type PolariscopeSounds = {
  pull(speed: number): void;
  snip(): void;
  peel(): void;
  click(): void;
  creak(): void;
  crack(): void;
};

export type Hit = "tab" | "ring" | "plate" | "disc" | "none";

type LaidStrip = Strip & {
  seed: number;
  // 0–1 while it's being laid by a preset, and while it's peeled off.
  grow: number;
  delay: number;
  peel: number;
};

type Gesture =
  | { kind: "turn"; offset: number }
  | { kind: "move"; dx: number; dy: number }
  | { kind: "lay"; strip: LaidStrip; start: Point; time: number; last: Point }
  | { kind: "tap"; start: Point }
  | { kind: "pinch" };

export const TAPE: Record<TapeKind, { width: number; retardance: number }> = {
  // 19 mm office tape and 48 mm packing tape on a plate about 40 cm across.
  office: { width: 0.05, retardance: 170 },
  packing: { width: 0.12, retardance: 320 },
};

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
// The drawing buffer stays under this many pixels; every one of them sums a spectrum.
const MAX_PIXELS = 2_600_000;
// How bright the lamp is drawn: the eye adapts to the dark field, so the light box itself
// comes out white and the film over it a pale grey.
const EXPOSURE = 2.2;
// Retardance at the disc's centre with the clamp done right up, in nanometres.
const CLAMP_RETARDANCE = 2600;
const PINCH_RETARDANCE = 1250;
const DENT = 0.025;
const GREEN = 560;
// The filter, in plate units.
const FILTER_RADIUS = 0.4;
// The disc, its centre a little below the middle to leave room for the screw above.
const DISC_RADIUS = 0.26;
const DISC_Y = 0.05;
// How close to a crossed or parallel setting the ring clicks into place.
const DETENT = 1.6 * DEG;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function ease(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
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
function linearColour(css: string): [number, number, number] {
  const probe = document.createElement("canvas").getContext("2d");
  if (!probe) return [1, 1, 1];
  probe.fillStyle = css;
  probe.fillRect(0, 0, 1, 1);
  const [r, g, b] = probe.getImageData(0, 0, 1, 1).data;
  return [r, g, b].map((v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
}

// The stress at a point from forces on the disc's rim, as (xx, yy, xy); the same sum the
// shader does, for the fringe count in the panel.
function stressAt(
  p: Point,
  centre: Point,
  loads: { at: Point; strength: number; spread: number }[],
) {
  let xx = 0;
  let yy = 0;
  let xy = 0;
  for (const load of loads) {
    const ix = centre.x - load.at.x;
    const iy = centre.y - load.at.y;
    const il = Math.hypot(ix, iy) || 1;
    const vx = p.x - load.at.x;
    const vy = p.y - load.at.y;
    const r = Math.sqrt(vx * vx + vy * vy + load.spread * load.spread);
    const ux = vx / r;
    const uy = vy / r;
    const along = Math.max((ux * ix + uy * iy) / il, 0);
    const push = (-load.strength * along) / r;
    xx += push * ux * ux;
    yy += push * uy * uy;
    xy += push * ux * uy;
  }
  return Math.sqrt((xx - yy) ** 2 + 4 * xy * xy);
}

export function createPolariscope(
  canvas: HTMLCanvasElement,
  {
    onStats,
    sounds,
  }: {
    onStats?: (stats: PolariscopeStats) => void;
    sounds?: PolariscopeSounds;
  } = {},
) {
  const context = canvas.getContext("webgl2", {
    alpha: false,
    antialias: false,
    powerPreference: "high-performance",
    // Frames are drawn only when something changes, so the last one has to stay put.
    preserveDrawingBuffer: true,
  });
  if (!context) throw new Error("WebGL2 is not available.");
  const gl = context;

  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const weights = spectralWeights();

  let settings: PolariscopeSettings = {
    specimen: "tape",
    plate: "none",
    tape: "office",
    locked: false,
  };

  // Layout, in CSS pixels.
  let width = 0;
  let height = 0;
  let ratio = 1;
  let box = [0, 0, 0, 0];
  let lamp = [0, 0, 0, 0];
  let film = [0, 0, 0, 0];
  let scale = 1;
  let middle: Point = { x: 0, y: 0 };
  let surround: [number, number, number] = [1, 1, 1];

  // The filters' transmission axes, in radians, measured clockwise from horizontal.
  let polariser = 0;
  let analyser = Math.PI / 2;
  let turning: { from: number; to: number; start: number } | null = null;
  let filter: Point = { x: 0, y: 0 };

  let strips: LaidStrip[] = [];
  let seed = 1;

  let load = 0;
  let cracked = false;
  let crackedAt = 0;
  let creaks = 0;
  let pinch = { angle: 0, held: false, strength: 0, reach: 0 };

  const gestures = new Map<number, Gesture>();
  let clock = 0;
  let dirty = true;
  let lastStats = "";

  // GL objects, made again if the context is lost and comes back.
  let program: WebGLProgram;
  let uniforms: Record<string, WebGLUniformLocation | null> = {};
  let lost = false;

  function setupGl() {
    const linked = gl.createProgram();
    if (!linked) throw new Error("Couldn't create a program.");
    gl.attachShader(linked, compile(gl, gl.VERTEX_SHADER, VERTEX));
    gl.attachShader(linked, compile(gl, gl.FRAGMENT_SHADER, FRAGMENT));
    gl.bindAttribLocation(linked, 0, "aPosition");
    gl.linkProgram(linked);
    if (!gl.getProgramParameter(linked, gl.LINK_STATUS)) {
      throw new Error(
        `The program didn't link: ${gl.getProgramInfoLog(linked)}`,
      );
    }
    program = linked;
    // biome-ignore lint/correctness/useHookAtTopLevel: WebGL's useProgram, not a React hook.
    gl.useProgram(program);
    uniforms = {};
    for (const name of [
      "uSize",
      "uRatio",
      "uWeights",
      "uFirst",
      "uStep",
      "uExposure",
      "uSeed",
      "uSurround",
      "uBox",
      "uLamp",
      "uFilm",
      "uPolariser",
      "uAnalyser",
      "uPlate",
      "uFilter",
      "uSpecimen",
      "uStripCount",
      "uStripEnds",
      "uStripInfo",
      "uDisc",
      "uLoadCount",
      "uLoads",
      "uRig",
    ]) {
      uniforms[name] = gl.getUniformLocation(program, name);
    }
    // One triangle that covers the screen.
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]),
      gl.STATIC_DRAW,
    );
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.uniform4fv(uniforms.uWeights, weights);
    gl.uniform1f(uniforms.uFirst, FIRST_WAVELENGTH);
    gl.uniform1f(uniforms.uStep, STEP);
    gl.uniform1f(uniforms.uExposure, EXPOSURE);
    dirty = true;
  }

  setupGl();

  // Plate units to CSS pixels and back.
  function toPx(p: Point): Point {
    return { x: middle.x + p.x * scale, y: middle.y + p.y * scale };
  }
  function toPlate(p: Point): Point {
    return { x: (p.x - middle.x) / scale, y: (p.y - middle.y) / scale };
  }

  function filterRadius() {
    return FILTER_RADIUS * scale;
  }
  function ringWidth() {
    return clamp(0.034 * scale, 11, 18);
  }

  function disc() {
    return {
      centre: toPx({ x: 0, y: DISC_Y }),
      radius: DISC_RADIUS * scale,
    };
  }

  function readSurround() {
    const host = canvas.parentElement;
    if (!host) return;
    surround = linearColour(getComputedStyle(host).backgroundColor);
    dirty = true;
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
    const narrow = width < 440;
    const margin = narrow ? 10 : 16;
    const bezel = narrow ? 9 : 12;
    const border = narrow ? 10 : 16;
    box = [margin, margin, width - margin, height - margin];
    lamp = [box[0] + bezel, box[1] + bezel, box[2] - bezel, box[3] - bezel];
    film = [
      lamp[0] + border,
      lamp[1] + border,
      lamp[2] - border,
      lamp[3] - border,
    ];
    scale = Math.max(1, Math.min(film[2] - film[0], film[3] - film[1]));
    middle = { x: (film[0] + film[2]) / 2, y: (film[1] + film[3]) / 2 };
    readSurround();
    render();
  }

  // Where a pointer is: on the filter's tab or ring, on the plate, on the disc, or nowhere.
  function hitTest(at: Point, touch = false): Hit {
    const slop = touch ? 10 : 4;
    const centre = toPx(filter);
    const R = filterRadius();
    const ring = ringWidth();
    const dx = at.x - centre.x;
    const dy = at.y - centre.y;
    const tabAngle = analyser + Math.PI;
    const along = dx * Math.cos(tabAngle) + dy * Math.sin(tabAngle);
    const across = -dx * Math.sin(tabAngle) + dy * Math.cos(tabAngle);
    if (
      Math.abs(along - (R + ring * 1.15)) < ring * 0.85 + slop &&
      Math.abs(across) < ring * 0.8 + slop
    ) {
      return "tab";
    }
    const d = Math.hypot(dx, dy);
    if (d > R - slop && d < R + ring + slop) return "ring";
    if (settings.specimen === "disc") {
      const { centre: c, radius } = disc();
      if (Math.hypot(at.x - c.x, at.y - c.y) < radius + slop + 6) return "disc";
      return "none";
    }
    if (at.x > film[0] && at.x < film[2] && at.y > film[1] && at.y < film[3]) {
      return "plate";
    }
    return "none";
  }

  function onFilm(p: Point): Point {
    const inset = 2;
    return {
      x: clamp(p.x, film[0] + inset, film[2] - inset),
      y: clamp(p.y, film[1] + inset, film[3] - inset),
    };
  }

  // Locked, the polariser follows; a flip turns the filter alone, to swap crossed and parallel.
  function setAnalyser(next: number, alone = false) {
    if (settings.locked && !alone) polariser += next - analyser;
    analyser = next;
    dirty = true;
  }

  function setPolariser(next: number) {
    if (settings.locked) analyser += next - polariser;
    polariser = next;
    dirty = true;
  }

  // Turning by the tab clicks into place at crossed and parallel.
  let inDetent = false;
  function turnByHand(next: number) {
    const relative = next - polariser;
    const quarter = Math.PI / 2;
    const nearest = Math.round(relative / quarter) * quarter;
    const snapped = Math.abs(relative - nearest) < DETENT;
    if (snapped && !inDetent) sounds?.click();
    inDetent = snapped;
    setAnalyser(snapped ? polariser + nearest : next);
  }

  function topStripAt(at: Point) {
    for (let i = strips.length - 1; i >= 0; i--) {
      const strip = strips[i];
      if (strip.peel > 0) continue;
      const a = toPx(strip.a);
      const b = toPx(strip.b);
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const length = Math.hypot(dx, dy);
      if (length < 1) continue;
      const along = ((at.x - a.x) * dx + (at.y - a.y) * dy) / length;
      const across = (-(at.x - a.x) * dy + (at.y - a.y) * dx) / length;
      const half = (TAPE[strip.kind].width * scale) / 2;
      if (along >= 0 && along <= length && Math.abs(across) <= half + 2) {
        return strip;
      }
    }
    return null;
  }

  function peel(strip: LaidStrip) {
    sounds?.peel();
    if (reduceMotion.matches) {
      strips = strips.filter((entry) => entry !== strip);
    } else {
      strip.peel = 0.001;
    }
    dirty = true;
  }

  function loads() {
    const { centre, radius } = disc();
    const out: { at: Point; strength: number; spread: number }[] = [];
    // The jaws spread their push over a few millimetres; a fingertip is softer still. Once the
    // disc has split, the dents the jaws pressed into it keep a little stress of their own.
    const clampStrength =
      ((cracked ? DENT : load) * CLAMP_RETARDANCE * radius) / 2;
    const jaw = Math.max(2.5, 0.05 * radius);
    out.push({
      at: { x: centre.x, y: centre.y - radius },
      strength: clampStrength,
      spread: jaw,
    });
    out.push({
      at: { x: centre.x, y: centre.y + radius },
      strength: clampStrength,
      spread: jaw,
    });
    const pinchStrength = (pinch.strength * PINCH_RETARDANCE * radius) / 2;
    const fingertip = Math.max(4, 0.09 * radius);
    for (const side of [0, Math.PI]) {
      out.push({
        at: {
          x: centre.x + Math.cos(pinch.angle + side) * radius,
          y: centre.y + Math.sin(pinch.angle + side) * radius,
        },
        strength: pinchStrength,
        spread: fingertip,
      });
    }
    return out;
  }

  function setLoad(next: number) {
    if (cracked) return;
    const before = load;
    load = clamp(next, 0, 1);
    // Close to the limit the plastic creaks as it's tightened.
    for (const at of [0.82, 0.9, 0.96]) {
      if (before < at && load >= at && creaks < 6) {
        creaks++;
        sounds?.creak();
      }
    }
    if (load >= 1) {
      cracked = true;
      crackedAt = clock;
      load = 0;
      pinch.held = false;
      sounds?.crack();
    }
    dirty = true;
  }

  function report() {
    if (!onStats) return;
    const { centre } = disc();
    const fringes = cracked ? 0 : stressAt(centre, centre, loads()) / GREEN;
    const stats: PolariscopeStats = {
      strips: strips.filter((strip) => strip.peel === 0).length,
      full: strips.length >= MAX_STRIPS,
      analyser: Math.round((((analyser / DEG) % 180) + 180) % 180),
      polariser: Math.round((((polariser / DEG) % 180) + 180) % 180),
      load,
      fringes: Math.round(fringes * 10) / 10,
      cracked,
    };
    const key = JSON.stringify(stats);
    if (key === lastStats) return;
    lastStats = key;
    onStats(stats);
  }

  const stripEnds = new Float32Array(MAX_STRIPS * 4);
  const stripInfo = new Float32Array(MAX_STRIPS * 4);
  const loadData = new Float32Array(MAX_LOADS * 4);

  function render() {
    if (lost || !width) return;
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform2f(uniforms.uSize, width, height);
    gl.uniform1f(uniforms.uRatio, canvas.width / width);
    gl.uniform1f(uniforms.uSeed, (clock * 7.31) % 97);
    gl.uniform3f(uniforms.uSurround, surround[0], surround[1], surround[2]);
    gl.uniform4f(uniforms.uBox, box[0], box[1], box[2], box[3]);
    gl.uniform4f(uniforms.uLamp, lamp[0], lamp[1], lamp[2], lamp[3]);
    gl.uniform4f(uniforms.uFilm, film[0], film[1], film[2], film[3]);
    gl.uniform1f(uniforms.uPolariser, polariser);
    gl.uniform1f(uniforms.uAnalyser, analyser);
    gl.uniform1i(
      uniforms.uPlate,
      settings.plate === "circular" ? 1 : settings.plate === "tint" ? 2 : 0,
    );
    const centre = toPx(filter);
    gl.uniform4f(
      uniforms.uFilter,
      centre.x,
      centre.y,
      filterRadius(),
      ringWidth(),
    );
    gl.uniform1i(uniforms.uSpecimen, settings.specimen === "disc" ? 1 : 0);

    let count = 0;
    for (const strip of strips) {
      if (count >= MAX_STRIPS) break;
      const a = toPx(strip.a);
      const end = toPx(strip.b);
      // Being laid it grows from where it started; being peeled it lifts back towards it.
      const reach = Math.min(strip.grow, 1 - strip.peel);
      if (reach <= 0) continue;
      const tape = TAPE[strip.kind];
      stripEnds.set(
        [a.x, a.y, a.x + (end.x - a.x) * reach, a.y + (end.y - a.y) * reach],
        count * 4,
      );
      stripInfo.set(
        [
          (tape.width * scale) / 2,
          tape.retardance,
          strip.seed,
          strip.kind === "packing" ? 1 : 0,
        ],
        count * 4,
      );
      count++;
    }
    gl.uniform1i(uniforms.uStripCount, count);
    gl.uniform4fv(uniforms.uStripEnds, stripEnds);
    gl.uniform4fv(uniforms.uStripInfo, stripInfo);

    const { centre: discCentre, radius } = disc();
    const since = clock - crackedAt;
    const run = cracked
      ? reduceMotion.matches
        ? 1
        : clamp(since / 0.09, 0, 1)
      : 0;
    const gap = cracked
      ? Math.max(1.6, 0.004 * scale) *
        (reduceMotion.matches ? 1 : ease(clamp((since - 0.08) / 0.18, 0, 1)))
      : 0;
    gl.uniform4f(uniforms.uDisc, discCentre.x, discCentre.y, radius, gap);
    const forces = loads();
    forces.forEach((force, i) => {
      loadData.set(
        [force.at.x, force.at.y, force.strength, force.spread],
        i * 4,
      );
    });
    gl.uniform1i(uniforms.uLoadCount, forces.length);
    gl.uniform4fv(uniforms.uLoads, loadData);
    gl.uniform4f(
      uniforms.uRig,
      run,
      load * 2.2 * TAU,
      pinch.reach,
      pinch.angle,
    );
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    dirty = false;
  }

  function step(dt: number) {
    clock += dt;
    const instant = reduceMotion.matches;
    if (turning) {
      const t = instant ? 1 : clamp((clock - turning.start) / 0.45, 0, 1);
      setAnalyser(turning.from + (turning.to - turning.from) * ease(t), true);
      if (t >= 1) turning = null;
    }
    for (const strip of strips) {
      if (strip.grow < 1) {
        strip.delay -= dt;
        if (strip.delay <= 0) strip.grow = Math.min(1, strip.grow + dt / 0.16);
        dirty = true;
      }
      if (strip.peel > 0) {
        strip.peel = Math.min(1, strip.peel + dt / 0.22);
        dirty = true;
      }
    }
    if (strips.some((strip) => strip.peel >= 1)) {
      strips = strips.filter((strip) => strip.peel < 1);
    }
    // Fingers close in quickly; the squeeze builds and lets go more slowly.
    const target = pinch.held ? 1 : 0;
    const reachRate = 1 - Math.exp(-dt / 0.09);
    const squeezeRate = 1 - Math.exp(-dt / (pinch.held ? 0.45 : 0.16));
    const reach = pinch.reach + (target - pinch.reach) * reachRate;
    const strength =
      pinch.strength + (target * pinch.reach - pinch.strength) * squeezeRate;
    if (
      Math.abs(reach - pinch.reach) > 1e-4 ||
      Math.abs(strength - pinch.strength) > 1e-4
    ) {
      pinch.reach = reach < 1e-3 && !pinch.held ? 0 : reach;
      pinch.strength = strength < 1e-3 && !pinch.held ? 0 : strength;
      dirty = true;
    }
    if (cracked && clock - crackedAt < 0.4) dirty = true;
  }

  let running = false;
  let visible = true;
  let frame = 0;
  let last = 0;

  function tick(now: number) {
    const dt = clamp((now - last) / 1000, 0, 1 / 30);
    last = now;
    step(dt);
    if (dirty) render();
    report();
    if (visible && !lost) frame = requestAnimationFrame(tick);
    else running = false;
  }

  function start() {
    if (running || lost) return;
    running = true;
    last = performance.now();
    frame = requestAnimationFrame(tick);
  }

  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  const intersection = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible) start();
  });
  intersection.observe(canvas);
  // The desk round the light box follows the site's theme.
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

  resize();
  start();

  return {
    setSettings(next: PolariscopeSettings) {
      if (next.specimen !== settings.specimen) {
        gestures.clear();
        pinch = { ...pinch, held: false };
        sounds?.pull(0);
      }
      settings = next;
      dirty = true;
    },
    // In degrees, from the panel.
    setAnalyser(degrees: number) {
      turning = null;
      setAnalyser(degrees * DEG);
    },
    setPolariser(degrees: number) {
      turning = null;
      setPolariser(degrees * DEG);
    },
    // A quarter turn of the filter: crossed to parallel, or back.
    flip() {
      const from = analyser;
      turning = { from, to: (turning?.to ?? from) + Math.PI / 2, start: clock };
      sounds?.click();
    },
    setLoad,
    newDisc() {
      cracked = false;
      load = 0;
      creaks = 0;
      dirty = true;
    },
    lay(next: Strip[], animate: boolean) {
      strips = next.slice(0, MAX_STRIPS).map((strip, i) => ({
        ...strip,
        seed: (seed++ * 0.618034) % 1,
        grow: animate && !reduceMotion.matches ? 0 : 1,
        // However many there are, the whole layout goes down in under two seconds.
        delay: i * Math.min(0.06, 1.6 / next.length),
        peel: 0,
      }));
      dirty = true;
    },
    undo() {
      const strip = strips.findLast((entry) => entry.peel === 0);
      if (strip) peel(strip);
    },
    peelAll() {
      if (!strips.length) return;
      sounds?.peel();
      if (reduceMotion.matches) strips = [];
      else for (const strip of strips) strip.peel ||= 0.001;
      dirty = true;
    },
    // The plate's half width and half height, in plate units.
    plate() {
      return {
        halfWidth: (film[2] - film[0]) / 2 / scale,
        halfHeight: (film[3] - film[1]) / 2 / scale,
      };
    },
    hitTest,
    pointerDown(id: number, at: Point, touch = false) {
      const hit = hitTest(at, touch);
      if (hit === "tab") {
        const centre = toPx(filter);
        const angle = Math.atan2(at.y - centre.y, at.x - centre.x);
        turning = null;
        gestures.set(id, { kind: "turn", offset: angle - analyser });
      } else if (hit === "ring") {
        const centre = toPx(filter);
        gestures.set(id, {
          kind: "move",
          dx: centre.x - at.x,
          dy: centre.y - at.y,
        });
      } else if (hit === "plate") {
        if (strips.length >= MAX_STRIPS) {
          gestures.set(id, { kind: "tap", start: at });
          return hit;
        }
        const start = onFilm(at);
        const strip: LaidStrip = {
          a: toPlate(start),
          b: toPlate(start),
          kind: settings.tape,
          seed: (seed++ * 0.618034) % 1,
          grow: 1,
          delay: 0,
          peel: 0,
        };
        strips.push(strip);
        gestures.set(id, {
          kind: "lay",
          strip,
          start: at,
          time: performance.now(),
          last: start,
        });
      } else if (hit === "disc" && !cracked) {
        const { centre } = disc();
        pinch.angle = Math.atan2(at.y - centre.y, at.x - centre.x);
        pinch.held = true;
        gestures.set(id, { kind: "pinch" });
      }
      dirty = true;
      return hit;
    },
    pointerMove(id: number, at: Point) {
      const gesture = gestures.get(id);
      if (!gesture) return;
      if (gesture.kind === "turn") {
        const centre = toPx(filter);
        const angle = Math.atan2(at.y - centre.y, at.x - centre.x);
        // Keep the turn continuous across the ±180° seam.
        let next = angle - gesture.offset;
        next += Math.round((analyser - next) / TAU) * TAU;
        turnByHand(next);
      } else if (gesture.kind === "move") {
        filter = toPlate({
          x: clamp(at.x + gesture.dx, box[0], box[2]),
          y: clamp(at.y + gesture.dy, box[1], box[3]),
        });
      } else if (gesture.kind === "lay") {
        const end = onFilm(at);
        const now = performance.now();
        const moved = Math.hypot(
          end.x - gesture.last.x,
          end.y - gesture.last.y,
        );
        const dt = Math.max(1, now - gesture.time) / 1000;
        sounds?.pull(moved / dt);
        gesture.time = now;
        gesture.last = end;
        gesture.strip.b = toPlate(end);
      } else if (gesture.kind === "pinch") {
        const { centre } = disc();
        pinch.angle = Math.atan2(at.y - centre.y, at.x - centre.x);
      }
      dirty = true;
    },
    pointerUp(id: number, at: Point) {
      const gesture = gestures.get(id);
      gestures.delete(id);
      if (!gesture) return;
      if (gesture.kind === "lay") {
        sounds?.pull(0);
        const a = toPx(gesture.strip.a);
        const b = toPx(gesture.strip.b);
        if (Math.hypot(b.x - a.x, b.y - a.y) < 6) {
          // A tap rather than a pull: it peels off the strip under it.
          strips = strips.filter((strip) => strip !== gesture.strip);
          const under = topStripAt(gesture.start);
          if (under) peel(under);
        } else {
          sounds?.snip();
        }
      } else if (gesture.kind === "tap") {
        const under = topStripAt(at);
        if (under) peel(under);
      } else if (gesture.kind === "pinch") {
        pinch.held = false;
      }
      dirty = true;
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

export type Polariscope = ReturnType<typeof createPolariscope>;
