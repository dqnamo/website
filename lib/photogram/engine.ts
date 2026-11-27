// A darkroom on a 2D canvas for making photograms: things laid straight on photographic paper
// under an enlarger with nothing in its carrier, so the paper records only their shadows. The
// room is lit by a red safelight the paper can't see, the enlarger throws a rectangle of white
// light on the easel, and the sheet then goes along the bench through developer, stop and fixer.
//
// The light under the enlarger comes from its lens, 40 cm up and a few millimetres wide, not
// from a point. Everything that stands off the paper therefore casts a shadow spread out from the
// lens axis by its height, with an edge softened by the lens's width: a lens stopped down gives
// crisper shadows than one wide open, and a hand-held dodger far above the paper gives a soft
// one. All the shadows multiply into one map of how much light reaches each part of the sheet;
// translucent things let some through, and a glass marble gathers light into a bright spot. While
// the lamp is on that map is what the paper takes up, a second at a time, so anything moved
// during an exposure leaves a ghost. Opening the lens also lets light fall away towards the
// corners, as real enlarging lenses do. What happens to the sheet afterwards is in ./paper.

import {
  createSheet,
  develop,
  expose,
  FIELD_H,
  FIELD_W,
  FILTERS,
  fog,
  fogged,
  immerse,
  PAPERS,
  type PaperKind,
  PX_PER_MM,
  progress,
  render,
  SHEET_MM,
  type Sheet,
} from "./paper";
import {
  buildShape,
  dodger,
  LAYOUT,
  type Paint,
  type Part,
  type PropKind,
  type Shape,
} from "./props";

export type Station = "easel" | "developer" | "stop" | "fixer";
export const STATIONS: Station[] = ["easel", "developer", "stop", "fixer"];
export type Lamp = "off" | "timer" | "hold" | "strip";

export type PhotogramSettings = {
  // The enlarger lens's f-number.
  aperture: number;
  // The timer, in seconds.
  seconds: number;
  // Multigrade filter, 0 (soft) to 5 (hard).
  grade: number;
  // The red swing filter under the lens.
  redFilter: boolean;
  paper: PaperKind;
  rock: boolean;
  roomLight: boolean;
  props: PropKind[];
};

export const DEFAULT_SETTINGS: PhotogramSettings = {
  aperture: 8,
  seconds: 6,
  grade: 2,
  redFilter: false,
  paper: "glossy",
  rock: true,
  roomLight: false,
  props: ["fern", "doily", "key", "marble", "feather", "buttons"],
};

export type PhotogramStats = {
  station: Station;
  moving: boolean;
  lamp: Lamp;
  // Seconds left on the timer.
  remaining: number;
  // Seconds in the current bath.
  clock: number;
  // Development at the middle of the sheet; 1 is the full time.
  developed: number;
  fixed: boolean;
  fogged: boolean;
  // The next sheet is still in the paper safe.
  empty: boolean;
  exposed: boolean;
  fps: number | null;
};

export type Print = { url: string; caption: string; paper: PaperKind };

type Prop = {
  kind: PropKind;
  shape: Shape;
  x: number;
  y: number;
  angle: number;
  lift: number;
  liftTo: number;
};

type Caster = {
  shape: Shape;
  x: number;
  y: number;
  angle: number;
  lift: number;
};

type Pose = { x: number; y: number; angle: number };
type Point = { x: number; y: number };
type Rgb = [number, number, number];

const TAU = Math.PI * 2;
// An 80 mm enlarging lens 40 cm above the baseboard.
const LENS_HEIGHT = 400;
const FOCAL_LENGTH = 80;
// Baths run at this many seconds a second, so a minute in the developer takes fifteen.
const BATH_SPEED = 4;
// The light covers the sheet and 10 mm round it.
const BEAM_MARGIN = 10;
const MARGIN_PX = BEAM_MARGIN * PX_PER_MM;
const BEAM_W = FIELD_W + 2 * MARGIN_PX;
const BEAM_H = FIELD_H + 2 * MARGIN_PX;
const BEAM_MM = {
  width: SHEET_MM.width + 2 * BEAM_MARGIN,
  height: SHEET_MM.height + 2 * BEAM_MARGIN,
};
// The easel's blades lie this far over the sheet, which leaves the print a white border.
const BORDER = 6;
const OPENING = {
  width: SHEET_MM.width - 2 * BORDER,
  height: SHEET_MM.height - 2 * BORDER,
};
// How high a prop is lifted while you hold it, and how high the dodger is held.
const HOLD_HEIGHT = 40;
const DODGER_HEIGHT = 90;
// The room light against an unfixed sheet, in seconds at f/8 every second.
const ROOM_FOG = 2.5;
// The focus map is stored at 1/16, so a lens can brighten the light up to sixteen times.
const FOCUS_SCALE = 16;
const TRAVEL_TIME = 1.1;
const STRIP_BANDS = 5;
const STATION_X: Record<Station, number> = {
  easel: 0,
  developer: 380,
  stop: 720,
  fixer: 1060,
};
const TRAY = { width: 282, height: 340, rim: 12, radius: 18 };
const TRAYS: Record<
  Exclude<Station, "easel">,
  { label: string; colour: Rgb; liquid: Rgb }
> = {
  developer: {
    label: "DEV",
    colour: [234, 234, 228],
    liquid: [246, 226, 170],
  },
  stop: { label: "STOP", colour: [196, 54, 42], liquid: [248, 236, 170] },
  fixer: { label: "FIX", colour: [146, 158, 166], liquid: [232, 240, 244] },
};
// What the camera fits on the stage: one station and a little bench.
const VIEW = { width: 304, height: 368 };
const SAFELIGHT: Rgb = [0.56, 0.12, 0.045];
const ROOM: Rgb = [1, 0.97, 0.92];

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function ease(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

function reduceMotion() {
  return matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function rgb([r, g, b]: Rgb, a = 1) {
  return `rgba(${Math.round(clamp(r, 0, 1) * 255)},${Math.round(clamp(g, 0, 1) * 255)},${Math.round(clamp(b, 0, 1) * 255)},${a})`;
}

function grey(value: number) {
  const v = Math.round(clamp(value, 0, 1) * 255);
  return `rgb(${v},${v},${v})`;
}

// Albedo colours drawn as they are, for the parts of the scene lit afterwards in one pass.
const albedo: Paint = (r, g, b, a = 1) =>
  `rgba(${Math.round(clamp(r, 0, 255))},${Math.round(clamp(g, 0, 255))},${Math.round(clamp(b, 0, 255))},${a})`;

// Albedo colours under a given light.
function painter([lr, lg, lb]: Rgb): Paint {
  return (r, g, b, a = 1) =>
    `rgba(${Math.round(clamp(r * lr, 0, 255))},${Math.round(clamp(g * lg, 0, 255))},${Math.round(clamp(b * lb, 0, 255))},${a})`;
}

function canvasOf(width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function contextOf(canvas: HTMLCanvasElement, willReadFrequently = false) {
  const ctx = canvas.getContext("2d", { willReadFrequently });
  if (!ctx) throw new Error("This browser can't draw on a 2D canvas.");
  return ctx;
}

// Whether canvas filters work here; where they don't, soft shadows are made by shrinking.
function filtersWork() {
  const ctx = contextOf(canvasOf(9, 9));
  if (!("filter" in ctx)) return false;
  ctx.filter = "blur(2px)";
  ctx.fillStyle = "#000";
  ctx.fillRect(4, 4, 1, 1);
  ctx.filter = "none";
  return ctx.getImageData(1, 4, 1, 1).data[3] > 0;
}

// The easel's four blades, black enamel with a scale along their inner edges.
function blades(): Shape {
  const ox = OPENING.width / 2;
  const oy = OPENING.height / 2;
  const wide = 26;
  const top = new Path2D();
  top.rect(-ox - wide, -oy - wide, 2 * (ox + wide), wide);
  const bottom = new Path2D();
  bottom.rect(-ox - wide, oy, 2 * (ox + wide), wide);
  const left = new Path2D();
  left.rect(-ox - wide, -oy, wide, 2 * oy);
  const right = new Path2D();
  right.rect(ox, -oy, wide, 2 * oy);
  const ticks = new Path2D();
  for (let x = -ox + 5; x < ox; x += 5) {
    const long = Math.round((x + ox) / 5) % 2 === 0;
    ticks.moveTo(x, -oy - 1.2);
    ticks.lineTo(x, -oy - (long ? 5 : 2.8));
  }
  for (let y = -oy + 5; y < oy; y += 5) {
    const long = Math.round((y + oy) / 5) % 2 === 0;
    ticks.moveTo(-ox - 1.2, y);
    ticks.lineTo(-ox - (long ? 5 : 2.8), y);
  }
  const frame = [top, bottom, left, right];
  return {
    parts: frame.map((path) => ({ path, pass: 0, height: 1.5 })),
    draw(ctx, paint) {
      ctx.fillStyle = paint(30, 30, 33);
      for (const path of frame) ctx.fill(path);
      ctx.strokeStyle = paint(84, 84, 92);
      ctx.lineWidth = 0.6;
      ctx.strokeRect(-ox - 0.3, -oy - 0.3, 2 * ox + 0.6, 2 * oy + 0.6);
      ctx.strokeStyle = paint(214, 214, 204, 0.8);
      ctx.lineWidth = 0.3;
      ctx.stroke(ticks);
      ctx.fillStyle = paint(214, 214, 204, 0.8);
      ctx.font = "600 3.4px ui-sans-serif, system-ui, sans-serif";
      ctx.textAlign = "center";
      for (let inch = 1; inch < 8; inch++) {
        const x = -ox + inch * 25.4 - 4.2;
        if (x < ox - 4) ctx.fillText(String(inch), x, -oy - 7);
      }
    },
  };
}

// A sheet of black card for test strips: everything above y = 0 in its own coordinates.
function card(): Shape {
  const path = new Path2D();
  path.rect(-150, -330, 300, 330);
  return {
    parts: [{ path, pass: 0, height: 0 }],
    draw(ctx, paint) {
      ctx.fillStyle = paint(20, 20, 22);
      ctx.fill(path);
      ctx.strokeStyle = paint(70, 70, 76);
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.moveTo(-150, -0.3);
      ctx.lineTo(150, -0.3);
      ctx.stroke();
    },
  };
}

// Speckled grey laminate, the bench everything stands on.
function benchPattern(ctx: CanvasRenderingContext2D) {
  const tile = canvasOf(160, 160);
  const t = contextOf(tile);
  t.fillStyle = "rgb(64,68,68)";
  t.fillRect(0, 0, 160, 160);
  for (let i = 0; i < 2400; i++) {
    const light = Math.random() > 0.5;
    t.fillStyle = light
      ? `rgba(116,122,120,${0.2 + 0.3 * Math.random()})`
      : `rgba(28,30,30,${0.25 + 0.3 * Math.random()})`;
    t.fillRect(Math.random() * 160, Math.random() * 160, 1, 1);
  }
  const pattern = ctx.createPattern(tile, "repeat");
  pattern?.setTransform(new DOMMatrix().scale(0.55));
  return pattern;
}

export function createPhotogram(
  canvas: HTMLCanvasElement,
  {
    onStats,
    onNote,
    onPrint,
  }: {
    onStats?: (stats: PhotogramStats) => void;
    onNote?: (note: string) => void;
    onPrint?: (print: Print) => void;
  } = {},
) {
  const ctx = contextOf(canvas);
  const lightCanvas = canvasOf(1, 1);
  const lctx = contextOf(lightCanvas);
  // How much of the light gets through to each pixel round the sheet, and what lenses add.
  const shadowCanvas = canvasOf(BEAM_W, BEAM_H);
  // Read back for every exposure, so it's kept in memory rather than on the GPU.
  const sctx = contextOf(shadowCanvas, true);
  const focusCanvas = canvasOf(BEAM_W, BEAM_H);
  const fctx = contextOf(focusCanvas);
  // The same light as it looks, tinted by the filter.
  const beamCanvas = canvasOf(BEAM_W, BEAM_H);
  const bctx = contextOf(beamCanvas);
  const paperCanvas = canvasOf(FIELD_W, FIELD_H);
  const pctx = contextOf(paperCanvas);
  const paperImage = pctx.createImageData(FIELD_W, FIELD_H);
  const paperPixels = new Uint32Array(paperImage.data.buffer);
  const hitCtx = contextOf(canvasOf(1, 1));
  const light = new Float32Array(BEAM_W * BEAM_H);
  const canFilter = filtersWork();
  let shrink: {
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;
  } | null = null;
  const bench = benchPattern(ctx);
  const easel = blades();
  const dodgerShape = dodger();
  const stripCard = card();

  let settings: PhotogramSettings = { ...DEFAULT_SETTINGS };
  let sheet: Sheet = createSheet(settings.paper);
  let station: Station = "easel";
  let pose: Pose = { x: 0, y: 0, angle: 0 };
  let travel: {
    from: Station;
    to: Station;
    t: number;
    start: Pose;
    end: Pose;
  } | null = null;
  // Seconds in the current bath.
  let clock = 0;
  let lamp: Lamp = "off";
  let remaining = 0;
  let exposing: { seconds: number; strip: boolean } | null = null;
  let log: string[] = [];
  let strip: {
    band: number;
    t: number;
    step: number;
    edge: number;
    from: number;
    to: number;
    slide: number;
    leaving: boolean;
  } | null = null;
  let props: Prop[] = [];
  let selected: Prop | null = null;
  let grab: { id: number; prop: Prop; last: Point } | null = null;
  let dodge: { id: number; x: number; y: number } | null = null;
  let rocker: { id: number; y: number; tilt: number } | null = null;
  // Tray rocking: the tilt, how much it's stirring the developer, and the wave on the liquid.
  let rockPhase = 0;
  let tilt = 0;
  let stir = 0;
  let wave = 0;
  let splash = 9;
  let roomSince = 9;
  let time = 0;
  // The easel is empty while the next sheet waits in the paper safe.
  let boxed = false;
  let shadowStale = true;
  let lightStale = true;
  let beamStale = true;
  // Things said about this sheet, so each is said once.
  let said = new Set<string>();
  const saidEver = new Set<string>();

  const cam = { x: 0, y: 0, scale: 1 };
  let width = 0;
  let height = 0;
  let dpr = 1;
  let vignette: CanvasGradient | null = null;

  function say(text: string, key?: string, ever = false) {
    if (key) {
      const set = ever ? saidEver : said;
      if (set.has(key)) return;
      set.add(key);
    }
    onNote?.(text);
  }

  // ——— Props ———

  function seedFor(kind: PropKind) {
    let h = 7;
    for (const c of kind) h = Math.imul(h ^ c.charCodeAt(0), 2654435761);
    return h >>> 0;
  }

  function syncProps() {
    const want = new Set(settings.props);
    props = props.filter((prop) => want.has(prop.kind));
    if (selected && !want.has(selected.kind)) selected = null;
    for (const kind of settings.props) {
      if (props.some((prop) => prop.kind === kind)) continue;
      LAYOUT[kind].forEach((spot, variant) => {
        props.push({
          kind,
          shape: buildShape(kind, variant, seedFor(kind)),
          x: spot.x,
          y: spot.y,
          angle: spot.angle,
          lift: 0,
          liftTo: 0,
        });
      });
    }
    shadowStale = true;
  }

  function casters() {
    const list: Caster[] = [{ shape: easel, x: 0, y: 0, angle: 0, lift: 0 }];
    for (const prop of props) list.push(prop);
    if (strip)
      list.push({ shape: stripCard, x: 0, y: strip.edge, angle: 0, lift: 3 });
    if (dodge)
      list.push({
        shape: dodgerShape,
        x: dodge.x,
        y: dodge.y,
        angle: 0.12,
        lift: DODGER_HEIGHT,
      });
    return list;
  }

  // ——— The light under the enlarger ———

  function trace(target: CanvasRenderingContext2D, part: Part, value: string) {
    if (part.line) {
      target.strokeStyle = value;
      target.lineWidth = part.line;
      target.lineCap = "round";
      target.lineJoin = "round";
      target.stroke(part.path);
    } else {
      target.fillStyle = value;
      target.fill(part.path, part.rule ?? "nonzero");
    }
  }

  // Multiplies a part's shadow into the map, blurred by `blur` pixels (a standard deviation).
  function shade(
    part: Part,
    m: [number, number, number, number, number, number],
    blur: number,
  ) {
    const value = grey(part.pass);
    if (blur < 0.35) {
      sctx.setTransform(...m);
      trace(sctx, part, value);
      return;
    }
    if (canFilter) {
      sctx.filter = `blur(${blur.toFixed(2)}px)`;
      sctx.setTransform(...m);
      trace(sctx, part, value);
      sctx.filter = "none";
      return;
    }
    // No canvas filters: draw it small and scale it back up, which blurs it about as much.
    const f = clamp(blur * 1.6, 2, 12);
    const w = Math.ceil(BEAM_W / f);
    const h = Math.ceil(BEAM_H / f);
    if (!shrink) {
      const c = canvasOf(w, h);
      shrink = { canvas: c, ctx: contextOf(c) };
    }
    const { canvas: small, ctx: sm } = shrink;
    if (small.width !== w || small.height !== h) {
      small.width = w;
      small.height = h;
    }
    sm.setTransform(1, 0, 0, 1, 0, 0);
    sm.fillStyle = "#fff";
    sm.fillRect(0, 0, w, h);
    sm.setTransform(m[0] / f, m[1] / f, m[2] / f, m[3] / f, m[4] / f, m[5] / f);
    trace(sm, part, value);
    sctx.setTransform(1, 0, 0, 1, 0, 0);
    sctx.imageSmoothingEnabled = true;
    sctx.drawImage(small, 0, 0, w, h, 0, 0, w * f, h * f);
  }

  function rebuildShadow() {
    shadowStale = false;
    lightStale = true;
    beamStale = true;
    sctx.setTransform(1, 0, 0, 1, 0, 0);
    sctx.globalCompositeOperation = "source-over";
    sctx.fillStyle = "#fff";
    sctx.fillRect(0, 0, BEAM_W, BEAM_H);
    fctx.setTransform(1, 0, 0, 1, 0, 0);
    fctx.globalCompositeOperation = "source-over";
    fctx.fillStyle = "#000";
    fctx.fillRect(0, 0, BEAM_W, BEAM_H);
    sctx.globalCompositeOperation = "multiply";
    fctx.globalCompositeOperation = "lighter";
    const aperture = FOCAL_LENGTH / settings.aperture;
    for (const caster of casters()) {
      const cos = Math.cos(caster.angle);
      const sin = Math.sin(caster.angle);
      for (const part of caster.shape.parts) {
        const h = Math.max(0, part.height + caster.lift);
        // Seen from the lens, a part this high lands this much further out, with an edge
        // as wide as the lens's opening seen from the paper.
        const spread = LENS_HEIGHT / (LENS_HEIGHT - h);
        const penumbra = ((aperture / 2) * h) / (LENS_HEIGHT - h);
        const s = PX_PER_MM * spread;
        const m: [number, number, number, number, number, number] = [
          s * cos,
          s * sin,
          -s * sin,
          s * cos,
          BEAM_W / 2 + caster.x * s,
          BEAM_H / 2 + caster.y * s,
        ];
        if (part.focus) {
          fctx.setTransform(...m);
          trace(fctx, part, grey(part.focus / FOCUS_SCALE));
        } else {
          shade(part, m, (penumbra / 2) * PX_PER_MM);
        }
      }
    }
    // The edge of the light, a little out of focus, and the lens's fall-off towards the
    // corners, which goes as it's stopped down.
    sctx.setTransform(1, 0, 0, 1, 0, 0);
    const soft = 4 * PX_PER_MM;
    for (const [x0, y0, x1, y1, rx, ry, rw, rh] of [
      [0, 0, soft, 0, 0, 0, soft, BEAM_H],
      [BEAM_W, 0, BEAM_W - soft, 0, BEAM_W - soft, 0, soft, BEAM_H],
      [0, 0, 0, soft, 0, 0, BEAM_W, soft],
      [0, BEAM_H, 0, BEAM_H - soft, 0, BEAM_H - soft, BEAM_W, soft],
    ]) {
      const ramp = sctx.createLinearGradient(x0, y0, x1, y1);
      ramp.addColorStop(0, "#000");
      ramp.addColorStop(1, "#fff");
      sctx.fillStyle = ramp;
      sctx.fillRect(rx, ry, rw, rh);
    }
    const n = settings.aperture;
    const falloff =
      n <= 4 ? 0.16 : n <= 5.6 ? 0.08 : n <= 8 ? 0.03 : n <= 11 ? 0.01 : 0;
    if (falloff) {
      const r = Math.hypot(BEAM_W, BEAM_H) / 2;
      const spot = sctx.createRadialGradient(
        BEAM_W / 2,
        BEAM_H / 2,
        0,
        BEAM_W / 2,
        BEAM_H / 2,
        r,
      );
      spot.addColorStop(0, "#fff");
      spot.addColorStop(0.5, grey(1 - falloff / 4));
      spot.addColorStop(1, grey(1 - falloff));
      sctx.fillStyle = spot;
      sctx.fillRect(0, 0, BEAM_W, BEAM_H);
    }
    sctx.globalCompositeOperation = "source-over";
    fctx.globalCompositeOperation = "source-over";
  }

  // The light map as numbers, for the paper. Reading pixels back is the slow part, so while
  // something is being moved it's read at most every other frame.
  let lightRead = 0;
  function readLight() {
    if (shadowStale) rebuildShadow();
    if (!lightStale) return;
    const now = performance.now();
    if ((grab || dodge) && now - lightRead < 30) return;
    lightStale = false;
    lightRead = now;
    const shadows = sctx.getImageData(0, 0, BEAM_W, BEAM_H).data;
    for (let i = 0, j = 0; i < light.length; i++, j += 4) {
      light[i] = shadows[j] / 255;
    }
    // A lens's hot spot, added as the disc it is.
    for (const caster of casters()) {
      const cos = Math.cos(caster.angle);
      const sin = Math.sin(caster.angle);
      for (const part of caster.shape.parts) {
        if (!part.focus || !part.disc) continue;
        const [dx, dy, r] = part.disc;
        const h = part.height + caster.lift;
        const s = (PX_PER_MM * LENS_HEIGHT) / (LENS_HEIGHT - h);
        const cx = BEAM_W / 2 + (caster.x + cos * dx - sin * dy) * s;
        const cy = BEAM_H / 2 + (caster.y + sin * dx + cos * dy) * s;
        const radius = r * s;
        const x0 = Math.max(0, Math.floor(cx - radius - 1));
        const x1 = Math.min(BEAM_W - 1, Math.ceil(cx + radius + 1));
        const y0 = Math.max(0, Math.floor(cy - radius - 1));
        const y1 = Math.min(BEAM_H - 1, Math.ceil(cy + radius + 1));
        for (let y = y0; y <= y1; y++) {
          for (let x = x0; x <= x1; x++) {
            const cover = clamp(
              radius + 0.5 - Math.hypot(x + 0.5 - cx, y + 0.5 - cy),
              0,
              1,
            );
            light[y * BEAM_W + x] += part.focus * cover;
          }
        }
      }
    }
  }

  function intensity() {
    return (8 / settings.aperture) ** 2;
  }

  function beamColour(): Rgb {
    if (settings.redFilter) return [0.95, 0.1, 0.045];
    const [r, g, b] = FILTERS[settings.grade].colour;
    const bright = clamp(0.4 + (0.6 * 8) / settings.aperture, 0, 1);
    return [r * bright, g * bright, b * bright];
  }

  function rebuildBeam() {
    beamStale = false;
    if (shadowStale) rebuildShadow();
    bctx.setTransform(1, 0, 0, 1, 0, 0);
    bctx.globalCompositeOperation = "source-over";
    bctx.drawImage(shadowCanvas, 0, 0);
    bctx.globalCompositeOperation = "lighter";
    bctx.drawImage(focusCanvas, 0, 0);
    bctx.drawImage(focusCanvas, 0, 0);
    bctx.globalCompositeOperation = "multiply";
    bctx.fillStyle = rgb(beamColour());
    bctx.fillRect(0, 0, BEAM_W, BEAM_H);
    bctx.globalCompositeOperation = "source-over";
  }

  // ——— Lamp ———

  function lampOn(kind: Lamp) {
    if (lamp !== "off") return;
    lamp = kind;
    exposing = { seconds: 0, strip: kind === "strip" };
    if (shadowStale) rebuildShadow();
    beamStale = true;
    if (settings.redFilter)
      say(
        "The paper can't see red, so the swing filter shows you the picture without printing it. Swing it away to expose.",
        "red",
        true,
      );
    else if (station !== "easel" || travel)
      say(
        "The sheet isn't on the easel: that light is falling on the baseboard.",
        "no-sheet",
      );
    start();
  }

  function lampOff() {
    if (lamp === "off") return;
    const was = lamp;
    lamp = "off";
    remaining = 0;
    if (strip && !strip.leaving) {
      strip.leaving = true;
      strip.from = strip.edge;
      strip.to = -OPENING.height / 2 - 340;
      strip.slide = 0;
    }
    const done = exposing;
    exposing = null;
    if (!done || done.seconds < 0.05 || settings.redFilter) return;
    if (station !== "easel" || travel) return;
    const f = `f/${settings.aperture}`;
    const grade = `grade ${settings.grade}`;
    log.push(
      done.strip
        ? `test strip of ${STRIP_BANDS} × ${formatSeconds(done.seconds / STRIP_BANDS)} at ${f}, ${grade}`
        : `${formatSeconds(done.seconds)} at ${f}, ${grade}`,
    );
    if (was === "strip")
      say(
        `Five bands, from ${formatSeconds(done.seconds / STRIP_BANDS)} at the top to ${formatSeconds(done.seconds)} at the bottom. Develop it and pick the band you like.`,
      );
    else
      say(
        "Exposed. Nothing shows yet: the picture is latent until the developer finds it.",
        "latent",
        true,
      );
  }

  function formatSeconds(seconds: number) {
    const rounded = Math.round(seconds * 10) / 10;
    return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)} s`;
  }

  // How long the lamp was lit this frame, running the timer or the test strip.
  function lampStep(dt: number) {
    if (lamp === "hold") return dt;
    if (lamp === "timer") {
      const lit = Math.min(dt, remaining);
      remaining -= dt;
      if (remaining <= 0) lampOff();
      return lit;
    }
    if (lamp === "strip" && strip && !strip.leaving) {
      strip.t += dt;
      if (strip.t < strip.step) return dt;
      const lit = dt - (strip.t - strip.step);
      strip.band += 1;
      strip.t = 0;
      if (strip.band >= STRIP_BANDS) {
        lampOff();
      } else {
        strip.from = strip.edge;
        strip.to =
          -OPENING.height / 2 + (strip.band * OPENING.height) / STRIP_BANDS;
        strip.slide = 0;
      }
      return lit;
    }
    return 0;
  }

  // ——— The sheet's journey ———

  function trayPose(to: Station): Pose {
    if (to === "easel") return { x: 0, y: 0, angle: 0 };
    return {
      x: STATION_X[to] + (Math.random() - 0.5) * 12,
      y: 4 + (Math.random() - 0.5) * 12,
      angle: (Math.random() - 0.5) * 0.07,
    };
  }

  function moveTo(to: Station) {
    if (travel || boxed) return;
    if (STATIONS.indexOf(to) <= STATIONS.indexOf(station)) return;
    lampOff();
    const from = station;
    if (from === "developer" && progress(sheet) < 0.45)
      say(
        "Pulled early: the blacks came up but the greys never caught up, so it'll look muddy and thin.",
      );
    if (from === "developer" && to === "fixer")
      say(
        "Straight into the fixer: with no stop bath, the developer soaked into the sheet works on for a few seconds more.",
      );
    travel = { from, to, t: 0, start: pose, end: trayPose(to) };
    if (reduceMotion()) arrive();
    start();
  }

  function arrive() {
    if (!travel) return;
    station = travel.to;
    pose = travel.end;
    travel = null;
    clock = 0;
    splash = 0;
    if (station === "developer") immerse(sheet);
  }

  // A fresh sheet on the easel. After hanging a print with the light on, the next one waits in
  // the paper safe until it's dark again; asked for outright, it comes out regardless.
  function newSheet(take = true) {
    lampOff();
    sheet = createSheet(settings.paper);
    station = "easel";
    pose = { x: 0, y: 0, angle: 0 };
    travel = null;
    clock = 0;
    log = [];
    said = new Set();
    boxed = !take;
    if (take && settings.roomLight)
      say(
        "A fresh sheet out of the box with the room light on: it's fogged before it reaches the easel.",
      );
    start();
  }

  function hang() {
    if (station === "easel" || travel) return;
    lampOff();
    const unfixed = sheet.sensitivity > 0.05;
    if (unfixed) sheet.printOut = 0.5 * sheet.sensitivity;
    sheet.dry = true;
    render(sheet, paperPixels);
    pctx.putImageData(paperImage, 0, 0);
    const paper = PAPERS[sheet.paper];
    onPrint?.({
      url: paperCanvas.toDataURL("image/png"),
      paper: sheet.paper,
      caption: [
        log.length ? log.join(", then ") : "no exposure",
        paper.label,
      ].join(" · "),
    });
    if (unfixed)
      say(
        "It wasn't fully fixed: the halide left in it darkens as soon as it sees light.",
      );
    else if (settings.roomLight)
      say(
        "Hung up to dry. Switch the room light off to take out a fresh sheet.",
      );
    else if (sheet.paper === "fibre")
      say(
        "Hung up to dry. Fibre dries down a shade darker than it looked wet.",
      );
    else say("Hung up to dry. There's a fresh sheet on the easel.");
    newSheet(!settings.roomLight);
  }

  // ——— Stepping ———

  function step(dt: number) {
    time += dt;
    roomSince += dt;
    const lit = lampStep(dt);
    if (exposing && lit > 0) exposing.seconds += lit;
    if (strip && strip.slide < 1) {
      strip.slide = Math.min(1, strip.slide + dt / 0.22);
      strip.edge = strip.from + (strip.to - strip.from) * ease(strip.slide);
      shadowStale = true;
      if (strip.leaving && strip.slide >= 1) strip = null;
    }
    for (const prop of props) {
      if (prop.lift === prop.liftTo) continue;
      prop.lift += (prop.liftTo - prop.lift) * (1 - Math.exp(-dt / 0.07));
      if (Math.abs(prop.lift - prop.liftTo) < 0.05) prop.lift = prop.liftTo;
      shadowStale = true;
    }
    if (
      lit > 0 &&
      !settings.redFilter &&
      station === "easel" &&
      !travel &&
      !boxed
    ) {
      readLight();
      expose(
        sheet,
        light,
        BEAM_W,
        MARGIN_PX,
        MARGIN_PX,
        intensity(),
        settings.grade,
        lit,
      );
    }

    if (travel) {
      travel.t += dt / TRAVEL_TIME;
      if (travel.t >= 1) arrive();
    }

    // Rocking: steadily by itself, or by hand by dragging the tray.
    const inTray = station !== "easel" && !travel;
    if (inTray && settings.rock && !rocker) {
      rockPhase += (dt * TAU) / 2.4;
      tilt = Math.sin(rockPhase);
      stir = 1;
    } else {
      if (!rocker) tilt *= Math.exp(-dt / 0.35);
      stir *= Math.exp(-dt / 0.8);
    }
    const waveTo = reduceMotion() ? 0 : inTray ? Math.min(1, stir) : 0;
    wave += (waveTo - wave) * (1 - Math.exp(-dt / 0.4));
    splash += dt;

    const bathDt = dt * BATH_SPEED;
    if (travel) {
      develop(sheet, "none", 0, bathDt);
    } else if (station !== "easel") {
      develop(sheet, station, stir, bathDt);
      clock += bathDt;
      watchBath();
    }

    if (
      settings.roomLight &&
      roomGlow() > 0.5 &&
      sheet.sensitivity > 0.01 &&
      !boxed
    ) {
      fog(sheet, ROOM_FOG * dt);
    }

    const target = travel
      ? travelPose().x
      : station === "easel"
        ? 0
        : STATION_X[station];
    if (reduceMotion()) cam.x = target;
    else cam.x += (target - cam.x) * (1 - Math.exp(-dt / 0.2));
    if (Math.abs(target - cam.x) < 0.05) cam.x = target;

    if (sheet.dirty) {
      render(sheet, paperPixels);
      pctx.putImageData(paperImage, 0, 0);
    }
  }

  function watchBath() {
    if (station === "developer") {
      const u = progress(sheet);
      if (u > 0.1 && sheet.exposed)
        say(
          "There it comes: the most exposed parts first. The pale greys need the full time.",
          "appearing",
        );
      if (u >= 1)
        say(
          `That's the full ${PAPERS[sheet.paper].develop} seconds. Leave it longer and the whites start to fog.`,
          "developed",
        );
      if (u >= 2.6)
        say(
          "Over-developed: chemical fog is greying the whites.",
          "overdeveloped",
        );
    }
    if (station === "fixer" && sheet.sensitivity < 0.03)
      say("Fixed. White light can't touch it now.", "fixed");
  }

  function roomGlow() {
    if (!settings.roomLight) return 0;
    // Fluorescent tubes stutter before they settle.
    const t = roomSince;
    if (t < 0.05) return 0.7;
    if (t < 0.12) return 0.08;
    if (t < 0.2) return 0.85;
    if (t < 0.26) return 0.3;
    return 1;
  }

  function ambient(): Rgb {
    const glow = roomGlow();
    return [
      SAFELIGHT[0] + (ROOM[0] - SAFELIGHT[0]) * glow,
      SAFELIGHT[1] + (ROOM[1] - SAFELIGHT[1]) * glow,
      SAFELIGHT[2] + (ROOM[2] - SAFELIGHT[2]) * glow,
    ];
  }

  function travelPose(): Pose & { lift: number } {
    if (!travel) return { ...pose, lift: 0 };
    const t = ease(clamp(travel.t, 0, 1));
    const { start: a, end: b } = travel;
    return {
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t - Math.sin(Math.PI * t) * 10,
      angle: a.angle + (b.angle - a.angle) * t,
      lift: Math.sin(Math.PI * t),
    };
  }

  // ——— Drawing ———

  function resize() {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    width = rect.width;
    height = rect.height;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    lightCanvas.width = canvas.width;
    lightCanvas.height = canvas.height;
    cam.scale = Math.min(width / VIEW.width, height / VIEW.height);
    const big = Math.max(canvas.width, canvas.height);
    vignette = lctx.createRadialGradient(
      canvas.width / 2,
      canvas.height / 2,
      big * 0.22,
      canvas.width / 2,
      canvas.height / 2,
      big * 0.82,
    );
    vignette.addColorStop(0, "#fff");
    vignette.addColorStop(1, grey(0.42));
    draw();
  }

  function worldMatrix(): [number, number, number, number, number, number] {
    const k = cam.scale * dpr;
    return [
      k,
      0,
      0,
      k,
      canvas.width / 2 - cam.x * k,
      canvas.height / 2 - cam.y * k,
    ];
  }

  function vignetteAt(x: number, y: number) {
    const big = Math.max(canvas.width, canvas.height);
    const k = cam.scale * dpr;
    const sx = (x - cam.x) * k;
    const sy = (y - cam.y) * k;
    const t = clamp((Math.hypot(sx, sy) - big * 0.22) / (big * 0.6), 0, 1);
    return 1 - 0.58 * t;
  }

  function lampLit() {
    return lamp !== "off";
  }

  function drawSheet(at: Pose, lift: number, ripple: number) {
    const w = SHEET_MM.width;
    const h = SHEET_MM.height;
    const k = cam.scale * dpr;
    ctx.save();
    ctx.translate(at.x, at.y);
    ctx.rotate(at.angle);
    const s = 1 + lift * 0.04;
    ctx.scale(s, s);
    ctx.shadowColor = `rgba(0,0,0,${0.25 + 0.3 * lift})`;
    ctx.shadowBlur = (1 + lift * 14) * k;
    ctx.shadowOffsetY = (0.6 + lift * 12) * k;
    ctx.fillStyle = albedo(
      ...(PAPERS[sheet.paper].base.map((c) => c * 255) as Rgb),
    );
    ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.shadowColor = "transparent";
    ctx.drawImage(paperCanvas, -w / 2, -h / 2, w, h);
    if (ripple > 0.02) {
      // Seen through a moving wave the print wobbles a strip at a time, over a still copy
      // so no seams show between strips.
      const rows = 6;
      for (let y = 0; y < FIELD_H; y += rows) {
        const mm = y / PX_PER_MM;
        const phase = mm * 0.15 - time * 2.6;
        const dy = ripple * 0.7 * Math.sin(phase);
        const dx = ripple * 0.35 * Math.cos(phase * 0.7 + 1.3);
        ctx.drawImage(
          paperCanvas,
          0,
          y,
          FIELD_W,
          rows,
          -w / 2 + dx,
          -h / 2 + mm + dy,
          w,
          rows / PX_PER_MM + 0.2,
        );
      }
    }
    ctx.restore();
  }

  function drawEasel() {
    const k = cam.scale * dpr;
    const bw = SHEET_MM.width + 80;
    const bh = SHEET_MM.height + 84;
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.55)";
    ctx.shadowBlur = 7 * k;
    ctx.shadowOffsetY = 3 * k;
    ctx.fillStyle = albedo(214, 194, 118);
    ctx.beginPath();
    ctx.roundRect(-bw / 2, -bh / 2 - 3, bw, bh, 5);
    ctx.fill();
    ctx.restore();
    // The base is printed with an inch grid.
    ctx.strokeStyle = albedo(150, 124, 58, 0.45);
    ctx.lineWidth = 0.4;
    ctx.beginPath();
    for (let x = -127; x <= 127; x += 25.4) {
      ctx.moveTo(x, -bh / 2 + 2);
      ctx.lineTo(x, bh / 2 - 8);
    }
    for (let y = -152.4; y <= 152.4; y += 25.4) {
      ctx.moveTo(-bw / 2 + 2, y);
      ctx.lineTo(bw / 2 - 2, y);
    }
    ctx.stroke();
    if (station === "easel" && !travel && !boxed) drawSheet(pose, 0, 0);
  }

  function trayInner(inset: number) {
    const { width: w, height: h, radius } = TRAY;
    return {
      x: -w / 2 + inset,
      y: -h / 2 + inset,
      w: w - 2 * inset,
      h: h - 2 * inset,
      r: Math.max(2, radius - inset * 0.6),
    };
  }

  function drawTray(which: Exclude<Station, "easel">) {
    const spec = TRAYS[which];
    const x = STATION_X[which];
    const k = cam.scale * dpr;
    const [r, g, b] = spec.colour;
    const { width: w, height: h, radius } = TRAY;
    ctx.save();
    ctx.translate(x, 0);
    ctx.shadowColor = "rgba(0,0,0,0.5)";
    ctx.shadowBlur = 9 * k;
    ctx.shadowOffsetY = 4 * k;
    ctx.fillStyle = albedo(r, g, b);
    ctx.beginPath();
    ctx.roundRect(-w / 2, -h / 2, w, h, radius);
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.translate(x, 0);
    // The walls slope in to a ribbed floor.
    const wall = trayInner(TRAY.rim);
    const walls = ctx.createLinearGradient(0, wall.y, 0, wall.y + wall.h);
    walls.addColorStop(0, albedo(r * 0.78, g * 0.78, b * 0.78));
    walls.addColorStop(1, albedo(r * 0.9, g * 0.9, b * 0.9));
    ctx.fillStyle = walls;
    ctx.beginPath();
    ctx.roundRect(wall.x, wall.y, wall.w, wall.h, wall.r);
    ctx.fill();
    const floor = trayInner(TRAY.rim + 7);
    ctx.fillStyle = albedo(r * 0.93, g * 0.93, b * 0.93);
    ctx.beginPath();
    ctx.roundRect(floor.x, floor.y, floor.w, floor.h, floor.r);
    ctx.fill();
    for (const rib of [-96, -32, 32, 96]) {
      ctx.fillStyle = albedo(r * 1.02, g * 1.02, b * 1.02);
      ctx.fillRect(rib - 2.5, floor.y + 12, 5, floor.h - 24);
      ctx.fillStyle = albedo(r * 0.72, g * 0.72, b * 0.72, 0.6);
      ctx.fillRect(rib + 2.5, floor.y + 12, 0.8, floor.h - 24);
    }
    ctx.restore();
    if (station === which && !travel) {
      drawSheet(pose, 0, wave);
    }
    ctx.save();
    ctx.translate(x, 0);
    // The liquid, a little coloured, with a dark line where it meets the walls.
    const [lr, lg, lb] = spec.liquid;
    ctx.globalCompositeOperation = "multiply";
    ctx.fillStyle = albedo(lr, lg, lb, 0.4);
    ctx.beginPath();
    ctx.roundRect(wall.x + 2, wall.y + 2, wall.w - 4, wall.h - 4, wall.r);
    ctx.fill();
    ctx.globalCompositeOperation = "source-over";
    ctx.strokeStyle = albedo(0, 0, 0, 0.22);
    ctx.lineWidth = 1.4;
    ctx.stroke();
    // Masking tape on the rim, marked up in pen.
    ctx.translate(-w / 2 + 40, -h / 2 + 6);
    ctx.rotate(-0.03);
    ctx.fillStyle = albedo(230, 218, 180);
    ctx.fillRect(-22, -7, 44, 13);
    ctx.fillStyle = albedo(28, 30, 60);
    ctx.font = "700 8px ui-sans-serif, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(spec.label, 0, 0);
    ctx.restore();
  }

  // The safelight (or the room light) mirrored in the liquid, waves, and rings from a sheet
  // going in. Drawn over the lit scene.
  function drawLiquid(which: Exclude<Station, "easel">, glow: Rgb) {
    const x = STATION_X[which];
    const wall = trayInner(TRAY.rim + 2);
    ctx.save();
    ctx.translate(x, 0);
    ctx.beginPath();
    ctx.roundRect(wall.x, wall.y, wall.w, wall.h, wall.r);
    ctx.clip();
    ctx.globalCompositeOperation = "screen";
    const here = station === which && !travel;
    const lean = here ? tilt : 0;
    const hx = -52 + lean * 8;
    const hy = -88 + lean * 42;
    const lamp = ctx.createRadialGradient(hx, hy, 0, hx, hy, 74);
    lamp.addColorStop(0, rgb(glow, 0.5));
    lamp.addColorStop(0.35, rgb(glow, 0.16));
    lamp.addColorStop(1, rgb(glow, 0));
    ctx.fillStyle = lamp;
    ctx.fillRect(wall.x, wall.y, wall.w, wall.h);
    if (here && wave > 0.02) {
      ctx.strokeStyle = rgb(glow, 0.22 * wave);
      ctx.lineWidth = 1.6;
      for (let n = 0; n < 4; n++) {
        const y = ((time * 70 + n * 88) % (wall.h + 40)) + wall.y - 20;
        ctx.beginPath();
        for (let px = wall.x; px <= wall.x + wall.w; px += 8) {
          const py = y + Math.sin(px * 0.05 + time * 3 + n) * 2.2;
          if (px === wall.x) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();
      }
    }
    if (here && splash < 1.2 && !reduceMotion()) {
      const t = splash / 1.2;
      ctx.strokeStyle = rgb(glow, 0.45 * (1 - t));
      ctx.lineWidth = 1.2;
      const grow = 6 + t * 46;
      ctx.beginPath();
      ctx.roundRect(
        pose.x - x - SHEET_MM.width / 2 - grow,
        pose.y - SHEET_MM.height / 2 - grow,
        SHEET_MM.width + 2 * grow,
        SHEET_MM.height + 2 * grow,
        grow,
      );
      ctx.stroke();
    }
    ctx.restore();
  }

  function propLight(x: number, y: number, lit: boolean): Rgb {
    const a = ambient();
    const v = vignetteAt(x, y);
    const out: Rgb = [a[0] * v, a[1] * v, a[2] * v];
    if (
      lit &&
      Math.abs(x) < BEAM_MM.width / 2 &&
      Math.abs(y) < BEAM_MM.height / 2
    ) {
      const beam = beamColour();
      out[0] += beam[0];
      out[1] += beam[1];
      out[2] += beam[2];
    }
    return out;
  }

  function drawCaster(caster: Caster, lit: boolean) {
    const [k, , , , e, f] = worldMatrix();
    const cos = Math.cos(caster.angle);
    const sin = Math.sin(caster.angle);
    // Held things come up towards you, so they look a touch bigger.
    const s = k * (1 + Math.min(caster.lift, 120) * 0.0022);
    const m: [number, number, number, number, number, number] = [
      s * cos,
      s * sin,
      -s * sin,
      s * cos,
      e + k * caster.x,
      f + k * caster.y,
    ];
    // A soft contact shadow on the paper, drawn from a copy off to the side so only the
    // shadow lands here. It grows and loosens as the thing is lifted; under the enlarger the
    // real shadow is the one in the beam.
    const away = 1e4;
    const depth = caster.lift;
    ctx.save();
    ctx.setTransform(m[0], m[1], m[2], m[3], m[4] + away, m[5]);
    ctx.shadowColor = `rgba(0,0,0,${(lit ? 0.22 : 0.5) / (1 + depth * 0.05)})`;
    ctx.shadowBlur = (1.2 + depth * 0.35) * k;
    ctx.shadowOffsetX = -away + (0.5 + depth * 0.2) * k;
    ctx.shadowOffsetY = (0.9 + depth * 0.35) * k;
    for (const part of caster.shape.parts) {
      if (part.focus) continue;
      ctx.globalAlpha = 1 - part.pass;
      trace(ctx, part, "#000");
    }
    ctx.restore();
    ctx.save();
    ctx.setTransform(...m);
    caster.shape.draw(ctx, painter(propLight(caster.x, caster.y, lit)));
    ctx.restore();
  }

  function draw() {
    if (!width) return;
    const lit = lampLit();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.setTransform(...worldMatrix());
    const halfW = width / 2 / cam.scale;
    const halfH = height / 2 / cam.scale;
    ctx.fillStyle = bench ?? "rgb(64,68,68)";
    ctx.fillRect(cam.x - halfW, cam.y - halfH, halfW * 2, halfH * 2);
    const visible = (x: number, w: number) =>
      x + w / 2 > cam.x - halfW && x - w / 2 < cam.x + halfW;
    if (visible(0, SHEET_MM.width + 80)) drawEasel();
    for (const which of ["developer", "stop", "fixer"] as const) {
      if (visible(STATION_X[which], TRAY.width)) drawTray(which);
    }
    if (travel) {
      const p = travelPose();
      drawSheet(p, p.lift, 0);
    }

    // Light everything drawn so far: the safelight or room light, and the enlarger's beam
    // with its shadows.
    lctx.setTransform(1, 0, 0, 1, 0, 0);
    lctx.globalCompositeOperation = "source-over";
    lctx.fillStyle = rgb(ambient());
    lctx.fillRect(0, 0, lightCanvas.width, lightCanvas.height);
    if (vignette) {
      lctx.globalCompositeOperation = "multiply";
      lctx.fillStyle = vignette;
      lctx.fillRect(0, 0, lightCanvas.width, lightCanvas.height);
    }
    if (lit) {
      if (shadowStale || beamStale) rebuildBeam();
      lctx.globalCompositeOperation = "lighter";
      lctx.setTransform(...worldMatrix());
      lctx.drawImage(
        beamCanvas,
        -BEAM_MM.width / 2,
        -BEAM_MM.height / 2,
        BEAM_MM.width,
        BEAM_MM.height,
      );
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = "multiply";
    ctx.drawImage(lightCanvas, 0, 0);
    ctx.globalCompositeOperation = "source-over";

    if (visible(0, SHEET_MM.width + 80)) {
      // The blades sit on top of the sheet rather than in their own shadow, and mostly
      // outside the light.
      drawCaster({ shape: easel, x: 0, y: 0, angle: 0, lift: 0 }, false);
      for (const prop of props) drawCaster(prop, lit);
      if (strip)
        drawCaster(
          { shape: stripCard, x: 0, y: strip.edge, angle: 0, lift: 3 },
          lit,
        );
      if (dodge)
        drawCaster(
          {
            shape: dodgerShape,
            x: dodge.x,
            y: dodge.y,
            angle: 0.12,
            lift: DODGER_HEIGHT,
          },
          lit,
        );
      if (lit) drawFocusGlow();
    }

    ctx.setTransform(...worldMatrix());
    const glow = ambient().map((c) => c * 0.62) as Rgb;
    for (const which of ["developer", "stop", "fixer"] as const) {
      if (visible(STATION_X[which], TRAY.width)) drawLiquid(which, glow);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  // A marble's hot spot glows on the paper.
  function drawFocusGlow() {
    const colour = beamColour();
    ctx.save();
    ctx.setTransform(...worldMatrix());
    ctx.globalCompositeOperation = "lighter";
    for (const prop of props) {
      if (prop.kind !== "marble") continue;
      const h = 8 + prop.lift;
      const spread = LENS_HEIGHT / (LENS_HEIGHT - h);
      const x = prop.x * spread;
      const y = prop.y * spread;
      const spot = ctx.createRadialGradient(x, y, 0, x, y, 6);
      spot.addColorStop(0, rgb(colour, 0.9));
      spot.addColorStop(0.35, rgb(colour, 0.35));
      spot.addColorStop(1, rgb(colour, 0));
      ctx.fillStyle = spot;
      ctx.fillRect(x - 6, y - 6, 12, 12);
    }
    ctx.restore();
  }

  // ——— Loop ———

  let frame = 0;
  let running = false;
  let disposed = false;
  let last = 0;
  let frames = 0;
  let since = 0;
  let fps: number | null = null;
  let reported = 0;

  function busy() {
    return (
      lamp !== "off" ||
      Boolean(travel) ||
      station !== "easel" ||
      Boolean(grab) ||
      Boolean(dodge) ||
      Boolean(strip) ||
      (settings.roomLight &&
        (roomSince < 0.4 ||
          (sheet.sensitivity > 0.01 && sheet.fogSoft < 40))) ||
      Math.abs(cam.x - (station === "easel" ? 0 : STATION_X[station])) > 0.05 ||
      props.some((prop) => prop.lift !== prop.liftTo)
    );
  }

  function tick(now: number) {
    frame = 0;
    const dt = clamp((now - last) / 1000, 0, 0.05);
    last = now;
    step(dt);
    draw();
    frames += 1;
    since += dt;
    if (since >= 0.5) {
      fps = Math.round(frames / since);
      frames = 0;
      since = 0;
    }
    report();
    if (!disposed && busy()) {
      frame = requestAnimationFrame(tick);
    } else {
      running = false;
      fps = null;
      report(true);
    }
  }

  function start() {
    if (running || disposed) return;
    running = true;
    last = performance.now();
    frames = 0;
    since = 0;
    frame = requestAnimationFrame(tick);
  }

  function report(force = false) {
    const now = performance.now();
    if (!force && now - reported < 120) return;
    reported = now;
    onStats?.({
      station,
      moving: Boolean(travel),
      lamp,
      remaining: Math.max(0, remaining),
      clock,
      developed: progress(sheet),
      fixed: sheet.sensitivity < 0.03,
      fogged: fogged(sheet),
      empty: boxed,
      exposed: sheet.exposed,
      fps,
    });
  }

  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  syncProps();
  render(sheet, paperPixels);
  pctx.putImageData(paperImage, 0, 0);
  resize();
  report(true);

  // ——— Input ———

  function toWorld(point: Point): Point {
    return {
      x: (point.x - width / 2) / cam.scale + cam.x,
      y: (point.y - height / 2) / cam.scale + cam.y,
    };
  }

  function hits(prop: Prop, point: Point) {
    const dx = point.x - prop.x;
    const dy = point.y - prop.y;
    const cos = Math.cos(-prop.angle);
    const sin = Math.sin(-prop.angle);
    const lx = dx * cos - dy * sin;
    const ly = dx * sin + dy * cos;
    if (Math.hypot(lx, ly) < 5) return true;
    for (const part of prop.shape.parts) {
      if (part.line) {
        hitCtx.lineWidth = part.line + 4;
        if (hitCtx.isPointInStroke(part.path, lx, ly)) return true;
      } else if (hitCtx.isPointInPath(part.path, lx, ly)) return true;
    }
    return false;
  }

  function propAt(point: Point) {
    for (let i = props.length - 1; i >= 0; i--) {
      if (hits(props[i], point)) return props[i];
    }
    return null;
  }

  function onPaper(point: Point) {
    return (
      Math.abs(point.x) < SHEET_MM.width / 2 + 20 &&
      Math.abs(point.y) < SHEET_MM.height / 2 + 20
    );
  }

  function keepOnBench(prop: Prop) {
    prop.x = clamp(prop.x, -150, 150);
    prop.y = clamp(prop.y, -180, 180);
  }

  return {
    setSettings(next: PhotogramSettings) {
      const before = settings;
      settings = { ...next, props: [...next.props] };
      if (next.roomLight !== before.roomLight) {
        roomSince = 0;
        if (!next.roomLight && boxed) boxed = false;
        if (next.roomLight && sheet.sensitivity > 0.05) {
          const lines: Record<Station, string> = {
            easel: sheet.exposed
              ? "Room light on before developing: the picture is fogged over and will come up grey to black."
              : "Room light on with paper out: this sheet is fogged and will come up grey whatever you do.",
            developer: "Lights on in the developer: watch the whites go grey.",
            stop: "Lights on in the stop bath. The developer is dead, so the fog can't come up: it's safe enough.",
            fixer:
              "Lights on in the fixer. With no developer left the fog can't come up.",
          };
          say(lines[station]);
        }
      }
      if (next.props.join() !== before.props.join()) syncProps();
      if (
        next.aperture !== before.aperture ||
        next.grade !== before.grade ||
        next.redFilter !== before.redFilter
      ) {
        shadowStale = shadowStale || next.aperture !== before.aperture;
        beamStale = true;
      }
      if (
        next.paper !== before.paper &&
        station === "easel" &&
        !sheet.exposed &&
        !fogged(sheet)
      ) {
        sheet = createSheet(next.paper);
        render(sheet, paperPixels);
        pctx.putImageData(paperImage, 0, 0);
      }
      if (next.redFilter && !before.redFilter && lamp !== "off")
        say(
          "The paper can't see red, so the swing filter shows you the picture without printing it. Swing it away to expose.",
          "red",
          true,
        );
      start();
    },

    // The timer: starts a timed exposure, or cuts one short.
    expose() {
      if (lamp !== "off") {
        lampOff();
        return;
      }
      remaining = settings.seconds;
      lampOn("timer");
    },

    // The foot switch: the lamp stays on while it's held.
    hold(on: boolean) {
      if (on) lampOn("hold");
      else if (lamp === "hold") lampOff();
    },

    testStrip() {
      if (lamp !== "off" || station !== "easel" || travel) return;
      strip = {
        band: 0,
        t: 0,
        step: settings.seconds / 3,
        edge: -OPENING.height / 2 - 340,
        from: -OPENING.height / 2 - 340,
        to: -OPENING.height / 2,
        slide: 0,
        leaving: false,
      };
      shadowStale = true;
      lampOn("strip");
    },

    moveTo,
    hang,
    newSheet,

    shuffle() {
      for (const prop of props) {
        prop.x = (Math.random() - 0.5) * (OPENING.width - 40);
        prop.y = (Math.random() - 0.5) * (OPENING.height - 40);
        prop.angle = Math.random() * TAU;
      }
      shadowStale = true;
      start();
    },

    rotate(by: number) {
      if (!selected) return false;
      selected.angle += by;
      shadowStale = true;
      start();
      return true;
    },

    nudge(dx: number, dy: number) {
      if (!selected) return false;
      selected.x += dx;
      selected.y += dy;
      keepOnBench(selected);
      shadowStale = true;
      start();
      return true;
    },

    // What a press does: picks up a prop, dodges, or rocks the tray. Null if nothing.
    pointerDown(id: number, point: Point): "grab" | "dodge" | "rock" | null {
      if (travel) return null;
      const at = toWorld(point);
      if (station === "easel") {
        const prop = propAt(at);
        if (prop) {
          props.splice(props.indexOf(prop), 1);
          props.push(prop);
          prop.liftTo = HOLD_HEIGHT;
          grab = { id, prop, last: at };
          selected = prop;
          shadowStale = true;
          start();
          return "grab";
        }
        if (lamp !== "off" && onPaper(at)) {
          dodge = { id, x: at.x, y: at.y };
          shadowStale = true;
          say(
            "Dodging: the card holds back light from under it. Keep it moving, or its edge and the wire's shadow will show.",
            "dodge",
            true,
          );
          start();
          return "dodge";
        }
        return null;
      }
      rocker = { id, y: point.y, tilt };
      start();
      return "rock";
    },

    pointerMove(id: number, point: Point) {
      if (grab && grab.id === id) {
        const at = toWorld(point);
        const { prop, last: from } = grab;
        // Dragged by one point, a thing on a table turns to trail behind it.
        const ox = prop.x - from.x;
        const oy = prop.y - from.y;
        const r = Math.hypot(ox, oy);
        let turn = 0;
        if (r > 1 && (at.x !== from.x || at.y !== from.y)) {
          const behind =
            Math.atan2(prop.y - at.y, prop.x - at.x) - Math.atan2(oy, ox);
          const wrapped = Math.atan2(Math.sin(behind), Math.cos(behind));
          const t = clamp((r - 5) / 25, 0, 1);
          turn = wrapped * t * t * (3 - 2 * t) * 0.85;
        }
        const cos = Math.cos(turn);
        const sin = Math.sin(turn);
        const x = at.x + ox * cos - oy * sin;
        const y = at.y + ox * sin + oy * cos;
        prop.x = x;
        prop.y = y;
        prop.angle += turn;
        keepOnBench(prop);
        // At the edge of the bench it stops, and the hand slides over it.
        grab.last = { x: at.x + prop.x - x, y: at.y + prop.y - y };
        shadowStale = true;
        start();
        return;
      }
      if (dodge && dodge.id === id) {
        const at = toWorld(point);
        dodge.x = at.x;
        dodge.y = at.y;
        shadowStale = true;
        return;
      }
      if (rocker && rocker.id === id) {
        const next = clamp(rocker.tilt + (point.y - rocker.y) / 60, -1, 1);
        stir = Math.min(1, stir + Math.abs(next - tilt) * 1.5);
        tilt = next;
        start();
      }
    },

    pointerUp(id: number) {
      if (grab && grab.id === id) {
        grab.prop.liftTo = 0;
        grab = null;
        shadowStale = true;
      }
      if (dodge && dodge.id === id) {
        dodge = null;
        shadowStale = true;
      }
      if (rocker && rocker.id === id) rocker = null;
      start();
    },

    // Turns the prop under the pointer (or the one held). True if there was one.
    wheel(point: Point, delta: number) {
      const prop = grab?.prop ?? propAt(toWorld(point));
      if (!prop || station !== "easel") return false;
      prop.angle += Math.sign(delta) * 0.13;
      selected = prop;
      shadowStale = true;
      start();
      return true;
    },

    dispose() {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
    },
  };
}

export type Photogram = ReturnType<typeof createPhotogram>;
