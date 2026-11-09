// The panel's cross-section through the lenses at the middle of the card: three lenses, the
// slices of print under them in each picture's colour, and the eye's lines of sight coming in at
// the angle the card is turned to, bent by the middle lens on to the slice that's seen.

import {
  type LensSpec,
  PLASTIC,
  sliceAt,
  throughLens,
} from "@/lib/lenticular/lens";

export type DiagramState = {
  lens: LensSpec;
  frames: number;
  phase: number;
  swatches: string[];
  bare: boolean;
};

const RAYS = 9;

export function drawDiagram(
  canvas: HTMLCanvasElement,
  state: DiagramState,
  angle: number,
  slice: number,
) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const cssW = canvas.clientWidth || 288;
  const cssH = canvas.clientHeight || 150;
  if (canvas.width !== Math.round(cssW * dpr))
    canvas.width = Math.round(cssW * dpr);
  if (canvas.height !== Math.round(cssH * dpr))
    canvas.height = Math.round(cssH * dpr);
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);

  const css = getComputedStyle(canvas);
  const grey = (n: number) =>
    css.getPropertyValue(`--gray-${n}`).trim() || "#888";
  const { lens, frames, phase, swatches, bare } = state;
  const P = lens.pitch;
  const k = 66 / P;
  const printH = 9;
  const baseY = cssH - 14;
  const cx = cssW / 2;
  // Millimetres across from the middle lens's centre, and up from the print, to the canvas.
  const X = (x: number) => cx + x * k;
  const Y = (z: number) => baseY - printH - z * k;

  // The print, a column at a time, each in its picture's colour.
  for (let px = 0; px < cssW; px++) {
    const x = (px + 0.5 - cx) / k;
    const s = Math.floor(sliceAt(x / P + 0.5, frames, phase));
    ctx.fillStyle = swatches[s % swatches.length];
    ctx.fillRect(px, baseY - printH, 1, printH);
  }
  ctx.fillStyle = grey(12);
  ctx.globalAlpha = 0.25;
  ctx.fillRect(0, baseY, cssW, 1);
  ctx.globalAlpha = 1;

  // The sheet: flat at the back, a row of arcs on the front.
  const lift = bare ? -18 : 0;
  ctx.save();
  ctx.translate(0, lift);
  const sheet = new Path2D();
  const half = P / 2;
  const sag = lens.radius - Math.sqrt(lens.radius ** 2 - half ** 2);
  sheet.moveTo(0, Y(0));
  const first = Math.floor(-cx / k / P - 0.5);
  const last = Math.ceil(cx / k / P + 0.5);
  sheet.lineTo(0, Y(lens.thickness - sag));
  for (let i = first; i <= last; i++) {
    const c = i * P;
    const zc = lens.thickness - lens.radius;
    const from = Math.asin(half / lens.radius);
    const steps = 18;
    for (let j = 0; j <= steps; j++) {
      const a = -from + (j / steps) * from * 2;
      const x = c + lens.radius * Math.sin(a);
      const z = zc + lens.radius * Math.cos(a);
      sheet.lineTo(X(x), Y(z));
    }
  }
  sheet.lineTo(cssW, Y(lens.thickness - sag));
  sheet.lineTo(cssW, Y(0));
  sheet.closePath();
  ctx.fillStyle = grey(6);
  ctx.globalAlpha = bare ? 0.18 : 0.32;
  ctx.fill(sheet);
  ctx.globalAlpha = bare ? 0.35 : 0.8;
  ctx.strokeStyle = grey(9);
  ctx.lineWidth = 1;
  ctx.stroke(sheet);
  ctx.restore();
  ctx.globalAlpha = 1;

  // Lines of sight, parallel from a distant eye, into the middle lens.
  const dx = -Math.sin(angle);
  const dz = -Math.cos(angle);
  const ray = "#f59e0b";
  ctx.strokeStyle = ray;
  ctx.lineWidth = 1;
  // The height of the canvas top above the print, where the lines of sight come in.
  const above = (baseY - printH - 6) / k;
  for (let i = 0; i < RAYS; i++) {
    const x0 = (i / (RAYS - 1) - 0.5) * P * 0.9;
    if (bare) {
      // With the sheet lifted off, the lines go straight on to the print.
      ctx.globalAlpha = 0.7;
      ctx.beginPath();
      ctx.moveTo(X(x0 + (dx / dz) * above), Y(above));
      ctx.lineTo(X(x0), Y(0));
      ctx.stroke();
      continue;
    }
    const path = throughLens(lens, x0, [dx, 0, dz]);
    if (!path) continue;
    const [hx, , hz] = path.hit;
    const back = (above - hz) / -dz;
    ctx.globalAlpha = 0.75;
    ctx.beginPath();
    ctx.moveTo(X(hx - dx * back), Y(hz - dz * back));
    ctx.lineTo(X(hx), Y(hz));
    ctx.lineTo(X(path.print), Y(0));
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // The slice the middle of the lens sees, ringed.
  if (!bare && Number.isFinite(slice)) {
    const s = Math.floor(slice);
    const width = P / frames;
    // Find the slice's ends near where the middle line lands.
    const middle = throughLens(lens, 0, [dx, 0, dz]);
    const at = middle ? middle.print : 0;
    let lo = at;
    let hi = at;
    const same = (x: number) =>
      Math.floor(sliceAt(x / P + 0.5, frames, phase)) === s;
    const step = width / 40;
    while (same(lo - step) && at - lo < P) lo -= step;
    while (same(hi + step) && hi - at < P) hi += step;
    ctx.strokeStyle = grey(12);
    ctx.lineWidth = 1.5;
    ctx.strokeRect(
      X(lo) - 1,
      baseY - printH - 2,
      (hi - lo) * k + 2,
      printH + 4,
    );
  }

  ctx.font = "500 10px ui-sans-serif, system-ui, sans-serif";
  ctx.fillStyle = grey(10);
  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  ctx.fillText(`n = ${PLASTIC}`, 4, 4);
  ctx.textAlign = "right";
  ctx.fillText(
    `${Math.round((Math.abs(angle) * 180) / Math.PI)}° off square`,
    cssW - 4,
    4,
  );
}
