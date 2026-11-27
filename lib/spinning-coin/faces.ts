// The coin's two faces, struck in relief: a wren on heads, the value in a wreath on tails, a
// legend round each, a ring of beads and a raised rim that stands proud of everything so coins
// stack. Each design is drawn as masks on a 2D canvas, then built into a height in millimetres:
// lettering is a flat step, the wren and the numeral are a low dome with a crisp edge, and the
// wren's wing, eyebrow and tail bars are cut back in. The shader gets the slope of that height,
// for light, and the height itself, for the grime that collects low down and the polish worn on
// the high points.

export const FACE_SIZE = 1024;

// Tallest relief, in millimetres, which the heights are stored as a fraction of.
export const RELIEF = 0.16;

type Design = { numeral: string; value: string };

export const DESIGNS: Record<string, Design> = {
  silver: { numeral: "10", value: "TEN PENCE" },
  copper: { numeral: "1", value: "ONE PENNY" },
};

const SERIF = "Georgia, 'Times New Roman', serif";

function canvas2d() {
  const canvas = document.createElement("canvas");
  canvas.width = FACE_SIZE;
  canvas.height = FACE_SIZE;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("No 2D canvas");
  return ctx;
}

// Draws with the given painter and returns the coverage, 0–1, per pixel.
function mask(ctx: CanvasRenderingContext2D, paint: () => void) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, FACE_SIZE, FACE_SIZE);
  ctx.fillStyle = "#fff";
  ctx.strokeStyle = "#fff";
  paint();
  const data = ctx.getImageData(0, 0, FACE_SIZE, FACE_SIZE).data;
  const out = new Float32Array(FACE_SIZE * FACE_SIZE);
  for (let i = 0; i < out.length; i++) out[i] = data[i * 4 + 3] / 255;
  return out;
}

// Three box blurs, which come close to a Gaussian, each done as running sums along rows and
// then columns.
function blur(src: Float32Array, radius: number) {
  const n = FACE_SIZE;
  let a = Float32Array.from(src);
  let b = new Float32Array(n * n);
  const r = Math.max(1, Math.round(radius / Math.sqrt(3)));
  const span = 2 * r + 1;
  for (let pass = 0; pass < 3; pass++) {
    for (let dir = 0; dir < 2; dir++) {
      const stride = dir === 0 ? 1 : n;
      const line = dir === 0 ? n : 1;
      for (let l = 0; l < n; l++) {
        const base = l * line;
        let sum = 0;
        for (let i = -r; i <= r; i++) {
          sum += a[base + Math.min(n - 1, Math.max(0, i)) * stride];
        }
        for (let i = 0; i < n; i++) {
          b[base + i * stride] = sum / span;
          const out = Math.max(0, i - r);
          const inn = Math.min(n - 1, i + r + 1);
          sum += a[base + inn * stride] - a[base + out * stride];
        }
      }
      [a, b] = [b, a];
    }
  }
  return a;
}

// Letters set round the rim, centred on an angle (radians, clockwise from the top), either
// reading round the top with their feet towards the middle or along the bottom with their
// heads towards it.
function arcText(
  ctx: CanvasRenderingContext2D,
  text: string,
  radius: number,
  centre: number,
  size: number,
  bottom: boolean,
) {
  const c = FACE_SIZE / 2;
  ctx.font = `600 ${size}px ${SERIF}`;
  ctx.textAlign = "center";
  ctx.textBaseline = bottom ? "top" : "alphabetic";
  const track = size * 0.18;
  const widths = [...text].map((ch) => ctx.measureText(ch).width + track);
  const total = widths.reduce((s, w) => s + w, 0) - track;
  let along = -total / 2;
  for (let i = 0; i < widths.length; i++) {
    const mid = along + (widths[i] - track) / 2;
    along += widths[i];
    const angle = centre + (bottom ? -mid : mid) / radius;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.translate(c + Math.sin(angle) * radius, c - Math.cos(angle) * radius);
    ctx.rotate(bottom ? angle + Math.PI : angle);
    ctx.fillText(text[i], 0, 0);
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

// The wren, drawn in a 200-unit box and placed in the middle of the face.
function wren(ctx: CanvasRenderingContext2D, part: "body" | "cuts") {
  const s = FACE_SIZE / 330;
  ctx.setTransform(
    s,
    0,
    0,
    s,
    FACE_SIZE / 2 - 104 * s,
    FACE_SIZE / 2 - 112 * s,
  );
  if (part === "body") {
    ctx.beginPath();
    ctx.moveTo(179, 85);
    ctx.quadraticCurveTo(166, 76, 152, 73);
    ctx.bezierCurveTo(150, 57, 134, 49, 118, 53);
    ctx.bezierCurveTo(108, 56, 100, 63, 92, 70);
    ctx.bezierCurveTo(80, 78, 70, 82, 62, 82);
    ctx.lineTo(44, 54);
    ctx.bezierCurveTo(40, 46, 52, 40, 57, 46);
    ctx.lineTo(72, 80);
    ctx.bezierCurveTo(60, 102, 72, 126, 96, 134);
    ctx.bezierCurveTo(120, 141, 146, 131, 154, 113);
    ctx.bezierCurveTo(160, 101, 160, 93, 154, 88);
    ctx.closePath();
    ctx.fill();
    // Legs, toes and the twig it stands on.
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(108, 132);
    ctx.lineTo(104, 160);
    ctx.lineTo(94, 165);
    ctx.moveTo(104, 160);
    ctx.lineTo(113, 165);
    ctx.moveTo(123, 130);
    ctx.lineTo(127, 158);
    ctx.lineTo(118, 164);
    ctx.moveTo(127, 158);
    ctx.lineTo(137, 163);
    ctx.stroke();
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(52, 170);
    ctx.quadraticCurveTo(110, 160, 170, 166);
    ctx.moveTo(150, 165);
    ctx.quadraticCurveTo(160, 176, 172, 178);
    ctx.stroke();
  } else {
    ctx.lineCap = "round";
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    // The wing and its bars.
    ctx.moveTo(78, 96);
    ctx.bezierCurveTo(98, 86, 126, 92, 136, 112);
    ctx.moveTo(94, 104);
    ctx.lineTo(110, 99);
    ctx.moveTo(99, 114);
    ctx.lineTo(117, 109);
    ctx.moveTo(105, 124);
    ctx.lineTo(124, 118);
    // The pale stripe over the eye.
    ctx.moveTo(126, 63);
    ctx.bezierCurveTo(134, 58, 146, 59, 153, 66);
    // Bars across the tail.
    ctx.moveTo(48, 56);
    ctx.lineTo(57, 52);
    ctx.moveTo(53, 65);
    ctx.lineTo(62, 61);
    ctx.moveTo(58, 74);
    ctx.lineTo(66, 70);
    ctx.stroke();
    // The eye, a ring cut round a bead.
    ctx.beginPath();
    ctx.arc(141, 72, 5.2, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

// Laurel sprigs curving up either side, below the numeral.
function wreath(ctx: CanvasRenderingContext2D) {
  const c = FACE_SIZE / 2;
  const r = FACE_SIZE * 0.3;
  ctx.lineCap = "round";
  ctx.lineWidth = FACE_SIZE * 0.007;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(
      c,
      c + 20,
      r,
      Math.PI / 2 + side * 0.18,
      Math.PI / 2 + side * 1.6,
      side < 0,
    );
    ctx.stroke();
    for (let i = 0; i < 9; i++) {
      const a = Math.PI / 2 + side * (0.28 + i * 0.15);
      for (const out of [-1, 1]) {
        const lr = r + out * FACE_SIZE * 0.022;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.translate(c + Math.cos(a) * lr, c + 20 + Math.sin(a) * lr);
        ctx.rotate(a + Math.PI / 2 + side * out * 0.55);
        ctx.beginPath();
        ctx.ellipse(
          0,
          0,
          FACE_SIZE * 0.026,
          FACE_SIZE * 0.0105,
          0,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }
    }
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

// The rim and the ring of beads are the same on both faces, and drawn analytically.
function frame(x: number, y: number) {
  const r = Math.hypot(x, y);
  const rim = smooth((r - 0.905) / 0.03) * 1.0;
  const angle = Math.atan2(y, x);
  const beads = 108;
  const nearest = Math.round((angle / (Math.PI * 2)) * beads);
  const ba = (nearest / beads) * Math.PI * 2;
  const bx = Math.cos(ba) * 0.868;
  const by = Math.sin(ba) * 0.868;
  const d = Math.hypot(x - bx, y - by) / 0.0115;
  const bead = d < 1 ? Math.sqrt(1 - d * d) * 0.42 : 0;
  return Math.max(rim, bead);
}

const smooth = (t: number) => {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
};

function face(
  ctx: CanvasRenderingContext2D,
  which: "heads" | "tails",
  design: Design,
) {
  const c = FACE_SIZE / 2;
  const legendR = FACE_SIZE * 0.385;
  const legendSize = FACE_SIZE * 0.068;
  const letters = mask(ctx, () => {
    if (which === "heads") {
      arcText(ctx, "DQNAMO", legendR - legendSize * 0.05, 0, legendSize, false);
      arcText(
        ctx,
        "MMXXVI",
        legendR - legendSize * 0.95,
        Math.PI,
        legendSize * 0.8,
        true,
      );
    } else {
      arcText(
        ctx,
        design.value,
        legendR - legendSize * 0.05,
        0,
        legendSize,
        false,
      );
    }
  });
  const figure = mask(ctx, () => {
    if (which === "heads") {
      wren(ctx, "body");
    } else {
      ctx.font = `700 ${FACE_SIZE * 0.43}px ${SERIF}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(design.numeral, c, c + FACE_SIZE * 0.01);
      wreath(ctx);
    }
  });
  const cuts = which === "heads" ? mask(ctx, () => wren(ctx, "cuts")) : null;

  const edge = blur(figure, 2.2);
  const dome = blur(figure, 26);
  const step = blur(letters, 1.6);
  const cut = cuts ? blur(cuts, 1.4) : null;
  const height = new Float32Array(FACE_SIZE * FACE_SIZE);
  for (let j = 0; j < FACE_SIZE; j++) {
    for (let i = 0; i < FACE_SIZE; i++) {
      const k = j * FACE_SIZE + i;
      const x = (i + 0.5) / c - 1;
      const y = 1 - (j + 0.5) / c;
      let h = edge[k] * (0.32 + 0.36 * Math.min(1, dome[k] * 1.25));
      if (cut) h -= cut[k] * 0.22 * edge[k];
      h = Math.max(h, step[k] * 0.38, frame(x, y));
      height[k] = h * (RELIEF * 0.85);
    }
  }
  return height;
}

// Both faces, packed for the shader: slopes (heads x, heads y, tails x, tails y) and heights
// (heads, tails), each as bytes. Slopes are in the coin's own frame, x to the right of the
// design and y up it, per unit of radius (the shader divides by the real radius), and saturate
// at ±12.
export function strikeFaces(coin: keyof typeof DESIGNS) {
  const design = DESIGNS[coin] ?? DESIGNS.silver;
  const ctx = canvas2d();
  const sides = [face(ctx, "heads", design), face(ctx, "tails", design)];
  const n = FACE_SIZE;
  const slopes = new Uint8Array(n * n * 4);
  const heights = new Uint8Array(n * n * 4);
  // A texel's width on a coin of unit radius.
  const texel = 2 / n;
  sides.forEach((h, side) => {
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const k = j * n + i;
        const l = h[j * n + Math.max(0, i - 1)];
        const r = h[j * n + Math.min(n - 1, i + 1)];
        const u = h[Math.max(0, j - 1) * n + i];
        const d = h[Math.min(n - 1, j + 1) * n + i];
        const sx = (r - l) / (2 * texel);
        const sy = (u - d) / (2 * texel);
        slopes[k * 4 + side * 2] = Math.round(
          128 + Math.max(-12, Math.min(12, sx)) * 10.58,
        );
        slopes[k * 4 + side * 2 + 1] = Math.round(
          128 + Math.max(-12, Math.min(12, sy)) * 10.58,
        );
        heights[k * 4 + side] = Math.round((h[k] / RELIEF) * 255);
      }
    }
  });
  return { slopes, heights };
}
