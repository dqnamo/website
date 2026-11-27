// The plate and what's under it, painted once for each size, plate and theme rather than every
// frame: the shadow it casts on the bench from its stand, the metal itself, and the washer and
// nut that hold it down. Sand is drawn over this. The light is above and to the left, as it is
// for the sand, so every shadow falls down and to the right.
//
// Painted steel is the classroom plate, black so sand shows up. Brass is what Chladni used, and
// it's brushed, so its highlight stretches across the grain. Glass is the other thing he used:
// you see the bench and the driver through it, and sand on it throws its shadow on the bench
// below, a second, softer figure a little way off.

import type { PlateShape } from "./modes";

export type Metal = "steel" | "brass" | "glass";

// Where the plate sits on the canvas, in device pixels: its centre and half-width (or radius).
export type Placement = { cx: number; cy: number; a: number };

const TAU = Math.PI * 2;

// The washer's radius and the nut's, as fractions of the plate's half-width.
export const WASHER = 0.11;
const NUT = 0.068;

// How far the plate's shadow lands from it, as fractions of the half-width: it stands on a post
// a few centimetres above the bench.
export const SHADOW_OFFSET = { x: 0.06, y: 0.09 };

function random(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function outline(
  ctx: CanvasRenderingContext2D,
  shape: PlateShape,
  { cx, cy, a }: Placement,
  inset = 0,
) {
  ctx.beginPath();
  if (shape === "round") {
    ctx.arc(cx, cy, Math.max(0, a - inset), 0, TAU);
  } else {
    const half = a - inset;
    ctx.roundRect(
      cx - half,
      cy - half,
      half * 2,
      half * 2,
      Math.max(0, a * 0.006 - inset),
    );
  }
}

export function paintPlate(
  ctx: CanvasRenderingContext2D,
  shape: PlateShape,
  metal: Metal,
  place: Placement,
  dark: boolean,
) {
  const { a } = place;
  ctx.save();

  // The shadow on the bench, drawn from a copy of the plate far off the canvas, so only the
  // shadow lands here and glass can stay see-through above it.
  const away = 20000;
  ctx.save();
  ctx.translate(-away, 0);
  ctx.shadowColor =
    metal === "glass"
      ? `rgba(0, 0, 0, ${dark ? 0.22 : 0.08})`
      : `rgba(0, 0, 0, ${dark ? 0.6 : 0.3})`;
  ctx.shadowBlur = a * 0.08;
  ctx.shadowOffsetX = away + a * SHADOW_OFFSET.x;
  ctx.shadowOffsetY = a * SHADOW_OFFSET.y;
  ctx.fillStyle = "#000";
  outline(ctx, shape, place);
  ctx.fill();
  ctx.restore();

  if (metal === "glass") paintDriver(ctx, place, dark);

  ctx.save();
  outline(ctx, shape, place);
  ctx.clip();
  if (metal === "steel") paintSteel(ctx, place);
  else if (metal === "brass") paintBrass(ctx, place);
  else paintGlass(ctx, place, dark);
  ctx.restore();

  paintRim(ctx, shape, metal, place);
  paintFixing(ctx, place, metal);
  ctx.restore();
}

// Black paint over steel, a little satin: the light is a broad soft glow rather than a spot.
function paintSteel(ctx: CanvasRenderingContext2D, { cx, cy, a }: Placement) {
  ctx.fillStyle = "#1c1d20";
  ctx.fillRect(cx - a, cy - a, a * 2, a * 2);
  const sheen = ctx.createLinearGradient(cx - a, cy - a, cx + a, cy + a);
  sheen.addColorStop(0, "rgba(255, 255, 255, 0.075)");
  sheen.addColorStop(0.45, "rgba(255, 255, 255, 0.015)");
  sheen.addColorStop(1, "rgba(0, 0, 0, 0.18)");
  ctx.fillStyle = sheen;
  ctx.fillRect(cx - a, cy - a, a * 2, a * 2);
  const glow = ctx.createRadialGradient(
    cx - a * 0.45,
    cy - a * 0.5,
    0,
    cx - a * 0.45,
    cy - a * 0.5,
    a * 0.9,
  );
  glow.addColorStop(0, "rgba(255, 255, 255, 0.06)");
  glow.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(cx - a, cy - a, a * 2, a * 2);
  speckle(ctx, { cx, cy, a }, 7, 0x51ee1);
}

// Brass brushed side to side: thousands of fine scratches, and a highlight drawn out across
// them, as brushed metal pulls a reflection into a streak.
function paintBrass(ctx: CanvasRenderingContext2D, { cx, cy, a }: Placement) {
  const base = ctx.createLinearGradient(cx - a, cy - a, cx + a, cy + a);
  base.addColorStop(0, "#c29646");
  base.addColorStop(0.35, "#d8b267");
  base.addColorStop(0.7, "#b98b3c");
  base.addColorStop(1, "#9a7029");
  ctx.fillStyle = base;
  ctx.fillRect(cx - a, cy - a, a * 2, a * 2);

  const rand = random(0xb2a55);
  const lines = Math.round(a * 3.2);
  ctx.lineWidth = Math.max(0.6, a / 420);
  for (let i = 0; i < lines; i++) {
    const y = cy - a + rand() * a * 2;
    const x = cx - a - a * 0.2 + rand() * a * 2.2;
    const length = a * (0.08 + rand() * 0.9);
    const light = rand() < 0.5;
    ctx.strokeStyle = light
      ? `rgba(255, 236, 190, ${0.04 + rand() * 0.08})`
      : `rgba(80, 50, 10, ${0.04 + rand() * 0.08})`;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + length, y + (rand() - 0.5) * a * 0.004);
    ctx.stroke();
  }

  ctx.save();
  ctx.translate(cx - a * 0.25, cy);
  ctx.scale(0.28, 1.6);
  const streak = ctx.createRadialGradient(0, 0, 0, 0, 0, a);
  streak.addColorStop(0, "rgba(255, 244, 210, 0.34)");
  streak.addColorStop(0.5, "rgba(255, 240, 200, 0.12)");
  streak.addColorStop(1, "rgba(255, 240, 200, 0)");
  ctx.fillStyle = streak;
  ctx.fillRect(-a * 4, -a, a * 8, a * 2);
  ctx.restore();
  speckle(ctx, { cx, cy, a }, 5, 0xb2a56);
}

// Glass: the bench shows through, a little green, with the sky of the room in it.
function paintGlass(
  ctx: CanvasRenderingContext2D,
  { cx, cy, a }: Placement,
  dark: boolean,
) {
  ctx.fillStyle = dark
    ? "rgba(150, 200, 190, 0.07)"
    : "rgba(150, 205, 190, 0.1)";
  ctx.fillRect(cx - a, cy - a, a * 2, a * 2);
  const sky = ctx.createLinearGradient(
    cx - a,
    cy - a,
    cx + a * 0.4,
    cy + a * 0.4,
  );
  sky.addColorStop(0, `rgba(255, 255, 255, ${dark ? 0.12 : 0.3})`);
  sky.addColorStop(0.3, "rgba(255, 255, 255, 0.04)");
  sky.addColorStop(0.32, `rgba(255, 255, 255, ${dark ? 0.06 : 0.14})`);
  sky.addColorStop(0.42, "rgba(255, 255, 255, 0.02)");
  sky.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.fillStyle = sky;
  ctx.fillRect(cx - a, cy - a, a * 2, a * 2);
}

// The mechanical driver under the bolt, only seen through glass: a black can with its shaft.
function paintDriver(
  ctx: CanvasRenderingContext2D,
  { cx, cy, a }: Placement,
  dark: boolean,
) {
  const dx = cx + a * SHADOW_OFFSET.x * 0.5;
  const dy = cy + a * SHADOW_OFFSET.y * 0.5;
  ctx.save();
  ctx.shadowColor = `rgba(0, 0, 0, ${dark ? 0.5 : 0.25})`;
  ctx.shadowBlur = a * 0.06;
  ctx.shadowOffsetX = a * 0.03;
  ctx.shadowOffsetY = a * 0.045;
  const can = ctx.createRadialGradient(
    dx - a * 0.1,
    dy - a * 0.1,
    0,
    dx,
    dy,
    a * 0.34,
  );
  can.addColorStop(0, "#3a3b3f");
  can.addColorStop(1, "#18191b");
  ctx.fillStyle = can;
  ctx.beginPath();
  ctx.arc(dx, dy, a * 0.34, 0, TAU);
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
  ctx.lineWidth = a * 0.008;
  for (const r of [0.3, 0.2]) {
    ctx.beginPath();
    ctx.arc(dx, dy, a * r, 0, TAU);
    ctx.stroke();
  }
  ctx.fillStyle = "#9a9da3";
  ctx.beginPath();
  ctx.arc((dx + cx) / 2, (dy + cy) / 2, a * 0.035, 0, TAU);
  ctx.fill();
}

// Fine noise in the paint or the metal, so it reads as a surface rather than a fill.
function speckle(
  ctx: CanvasRenderingContext2D,
  { cx, cy, a }: Placement,
  amount: number,
  seed: number,
) {
  const x0 = Math.max(0, Math.floor(cx - a));
  const y0 = Math.max(0, Math.floor(cy - a));
  const x1 = Math.min(ctx.canvas.width, Math.ceil(cx + a));
  const y1 = Math.min(ctx.canvas.height, Math.ceil(cy + a));
  if (x1 <= x0 || y1 <= y0) return;
  const image = ctx.getImageData(x0, y0, x1 - x0, y1 - y0);
  const data = image.data;
  const rand = random(seed);
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] !== 255) continue;
    const n = (rand() - 0.5) * amount * 2;
    data[i] += n;
    data[i + 1] += n;
    data[i + 2] += n;
  }
  ctx.putImageData(image, x0, y0);
}

// The edge catches the light along its top and left, and falls into shade along the others.
function paintRim(
  ctx: CanvasRenderingContext2D,
  shape: PlateShape,
  metal: Metal,
  place: Placement,
) {
  const { cx, cy, a } = place;
  const edge = ctx.createLinearGradient(cx - a, cy - a, cx + a, cy + a);
  if (metal === "glass") {
    edge.addColorStop(0, "rgba(220, 255, 240, 0.9)");
    edge.addColorStop(0.5, "rgba(120, 175, 155, 0.7)");
    edge.addColorStop(1, "rgba(60, 110, 95, 0.8)");
  } else if (metal === "brass") {
    edge.addColorStop(0, "rgba(255, 240, 200, 0.9)");
    edge.addColorStop(0.5, "rgba(150, 110, 40, 0.6)");
    edge.addColorStop(1, "rgba(70, 45, 10, 0.9)");
  } else {
    edge.addColorStop(0, "rgba(255, 255, 255, 0.45)");
    edge.addColorStop(0.5, "rgba(255, 255, 255, 0.1)");
    edge.addColorStop(1, "rgba(0, 0, 0, 0.6)");
  }
  ctx.strokeStyle = edge;
  ctx.lineWidth = Math.max(1, a * (metal === "glass" ? 0.012 : 0.006));
  outline(ctx, shape, place, ctx.lineWidth / 2);
  ctx.stroke();
}

// A steel washer and a hex nut on the bolt through the middle.
function paintFixing(
  ctx: CanvasRenderingContext2D,
  { cx, cy, a }: Placement,
  metal: Metal,
) {
  ctx.save();
  ctx.shadowColor = "rgba(0, 0, 0, 0.45)";
  ctx.shadowBlur = a * 0.02;
  ctx.shadowOffsetX = a * 0.008;
  ctx.shadowOffsetY = a * 0.012;
  const washer = ctx.createRadialGradient(
    cx - a * 0.03,
    cy - a * 0.04,
    0,
    cx,
    cy,
    a * WASHER,
  );
  washer.addColorStop(0, "#e3e5e8");
  washer.addColorStop(0.7, "#aeb2b8");
  washer.addColorStop(1, "#7d8288");
  ctx.fillStyle = washer;
  ctx.beginPath();
  ctx.arc(cx, cy, a * WASHER, 0, TAU);
  ctx.fill();
  ctx.restore();

  // Turned rings in the washer's face.
  ctx.strokeStyle = "rgba(0, 0, 0, 0.12)";
  ctx.lineWidth = Math.max(0.5, a * 0.002);
  for (let r = 0.075; r < WASHER; r += 0.01) {
    ctx.beginPath();
    ctx.arc(cx, cy, a * r, 0, TAU);
    ctx.stroke();
  }

  ctx.save();
  ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
  ctx.shadowBlur = a * 0.015;
  ctx.shadowOffsetX = a * 0.01;
  ctx.shadowOffsetY = a * 0.014;
  const turn = 0.21;
  const corners = Array.from({ length: 6 }, (_, i) => {
    const angle = turn + (i / 6) * TAU;
    return [cx + Math.cos(angle) * a * NUT, cy + Math.sin(angle) * a * NUT];
  });
  ctx.fillStyle = "#8c9097";
  ctx.beginPath();
  corners.forEach(([x, y], i) => {
    if (i) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
  });
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // Each flat lit by how squarely it faces the light.
  for (let i = 0; i < 6; i++) {
    const [x0, y0] = corners[i];
    const [x1, y1] = corners[(i + 1) % 6];
    const mid = turn + ((i + 0.5) / 6) * TAU;
    const facing = Math.cos(mid - (Math.PI * 5) / 4);
    ctx.fillStyle =
      facing > 0
        ? `rgba(255, 255, 255, ${0.35 * facing})`
        : `rgba(0, 0, 0, ${0.35 * -facing})`;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.lineTo(cx + (x1 - cx) * 0.78, cy + (y1 - cy) * 0.78);
    ctx.lineTo(cx + (x0 - cx) * 0.78, cy + (y0 - cy) * 0.78);
    ctx.closePath();
    ctx.fill();
  }
  const face = ctx.createRadialGradient(
    cx - a * 0.02,
    cy - a * 0.02,
    0,
    cx,
    cy,
    a * NUT * 0.8,
  );
  face.addColorStop(0, "#c4c8cd");
  face.addColorStop(1, "#959aa1");
  ctx.fillStyle = face;
  ctx.beginPath();
  ctx.arc(cx, cy, a * NUT * 0.77, 0, TAU);
  ctx.fill();

  // The bolt's end, cut flat, with its thread showing.
  const bolt = ctx.createRadialGradient(
    cx - a * 0.01,
    cy - a * 0.012,
    0,
    cx,
    cy,
    a * 0.033,
  );
  bolt.addColorStop(0, "#b9bdc3");
  bolt.addColorStop(1, "#6d7279");
  ctx.fillStyle = bolt;
  ctx.beginPath();
  ctx.arc(cx, cy, a * 0.033, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = "rgba(0, 0, 0, 0.3)";
  ctx.lineWidth = Math.max(0.5, a * 0.003);
  ctx.beginPath();
  ctx.arc(cx, cy, a * 0.026, 0, TAU);
  ctx.stroke();
  if (metal === "glass") {
    // A rubber washer under the steel one, so the glass doesn't crack: just its edge shows.
    ctx.strokeStyle = "rgba(20, 20, 20, 0.5)";
    ctx.lineWidth = a * 0.008;
    ctx.beginPath();
    ctx.arc(cx, cy, a * (WASHER + 0.006), 0, TAU);
    ctx.stroke();
  }
}
