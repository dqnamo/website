// The cards' pictures, drawn flat on a canvas one picture at a time. The engine slices them into
// the print, so each is a whole picture as it would be seen through the lenses: an eye that
// follows you and winks at the ends, a seaside postcard by day and by night, a tunnel of frames
// seen from twelve places side by side for depth, and two words of your own.

export type CardId = "eye" | "postcard" | "depth" | "words";

export type CardOptions = {
  // Which way the lenses run decides which way the eye looks and the depth parallaxes.
  across: boolean;
  words: [string, string];
  // The family the page sets its text in, for the words.
  sans: string;
};

export type CardDef = {
  value: CardId;
  label: string;
  frames: number;
  // Shifts the slices so that seen square on the card shows a whole picture.
  phase: number;
  // One colour per picture, for the cross-section of the print in the panel.
  swatches: string[];
};

export const IMAGE_WIDTH = 1024;
export const IMAGE_HEIGHT = 726;

const EYE_FRAMES = 11;
const DEPTH_FRAMES = 12;

export const CARDS: CardDef[] = [
  {
    value: "eye",
    label: "Eye",
    frames: EYE_FRAMES,
    phase: 0,
    swatches: Array.from({ length: EYE_FRAMES }, (_, i) =>
      i === 0 || i === EYE_FRAMES - 1
        ? "#1c2236"
        : i === 1 || i === EYE_FRAMES - 2
          ? "#3c6f73"
          : `hsl(${172 + Math.abs(i - (EYE_FRAMES - 1) / 2) * 6} 48% ${58 - Math.abs(i - (EYE_FRAMES - 1) / 2) * 6}%)`,
    ),
  },
  {
    value: "postcard",
    label: "Postcard",
    frames: 2,
    phase: -0.25,
    swatches: ["#7cc0e2", "#14244a"],
  },
  {
    value: "depth",
    label: "Depth",
    frames: DEPTH_FRAMES,
    phase: 0.5 / DEPTH_FRAMES,
    swatches: Array.from({ length: DEPTH_FRAMES }, (_, i) => {
      const hue = 190 + (i / (DEPTH_FRAMES - 1)) * 170;
      return `hsl(${hue % 360} 62% 56%)`;
    }),
  },
  {
    value: "words",
    label: "Words",
    frames: 2,
    phase: -0.25,
    swatches: ["#ef5b45", "#1d2a4a"],
  },
];

export const cardDef = (id: CardId) =>
  CARDS.find((card) => card.value === id) ?? CARDS[0];

type Ctx = CanvasRenderingContext2D;

// The same stars, waves and gulls in every picture, or they'd twinkle as the card turns.
function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function roundRect(
  ctx: CanvasPath,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ---- Eye -------------------------------------------------------------------------------------
// Seen square on it looks straight out; turned, it looks to whichever side you're on, so it keeps
// its eye on you; at either end of the lenses' view it shuts, which is where the pictures come
// round again, so turning on past the end it winks.

function drawEye(ctx: Ctx, k: number, opts: CardOptions) {
  const W = IMAGE_WIDTH;
  const H = IMAGE_HEIGHT;
  const mid = (EYE_FRAMES - 1) / 2;
  const look = Math.max(-1, Math.min(1, (k - mid) / (mid - 2)));
  const shut =
    k === 0 || k === EYE_FRAMES - 1
      ? 1
      : k === 1 || k === EYE_FRAMES - 2
        ? 0.6
        : 0;

  // A mustard card with a sunburst behind the eye.
  ctx.fillStyle = "#efbd47";
  ctx.fillRect(0, 0, W, H);
  const cx = W / 2;
  const cy = H * 0.5;
  ctx.save();
  ctx.fillStyle = "#f4c95c";
  for (let i = 0; i < 40; i += 2) {
    const a0 = (i / 40) * Math.PI * 2;
    const a1 = ((i + 1) / 40) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, W, a0, a1);
    ctx.closePath();
    ctx.fill();
  }
  const vignette = ctx.createRadialGradient(cx, cy, 160, cx, cy, W * 0.7);
  vignette.addColorStop(0, "rgba(255, 230, 150, 0.35)");
  vignette.addColorStop(1, "rgba(150, 90, 10, 0.28)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();

  const ink = "#1c2236";
  const half = 300;
  const up = -150;
  const down = 108;
  // The upper lid comes down from open to meeting the lower one.
  const lid = lerp(up, down * 0.86, shut);
  const upper = (path: CanvasPath, peak: number) => {
    path.moveTo(cx - half, cy);
    path.quadraticCurveTo(cx, cy + peak * 2, cx + half, cy);
  };
  const lower = (path: CanvasPath) => {
    path.moveTo(cx + half, cy);
    path.quadraticCurveTo(cx, cy + down * 2, cx - half, cy);
  };
  const opening = new Path2D();
  upper(opening, lid);
  opening.quadraticCurveTo(cx, cy + down * 2, cx - half, cy);
  opening.closePath();

  // Brow.
  ctx.save();
  ctx.fillStyle = ink;
  ctx.beginPath();
  const browY = cy - 238 + shut * 18;
  ctx.moveTo(cx - 280, browY + 40);
  ctx.quadraticCurveTo(cx - 40, browY - 120, cx + 290, browY + 10);
  ctx.quadraticCurveTo(cx - 30, browY - 74, cx - 280, browY + 40);
  ctx.fill();
  ctx.restore();

  // The eyeball, iris and pupil, inside the opening.
  if (shut < 1) {
    ctx.save();
    ctx.clip(opening);
    const white = ctx.createRadialGradient(cx, cy + 10, 60, cx, cy, half);
    white.addColorStop(0, "#fdf8ec");
    white.addColorStop(0.7, "#f3ead6");
    white.addColorStop(1, "#d9c9a8");
    ctx.fillStyle = white;
    ctx.fillRect(cx - half, cy - 200, half * 2, 400);
    const ix = cx + (opts.across ? 0 : look * 118);
    const iy = cy + 8 + (opts.across ? -look * 52 : 0);
    const r = 122;
    const iris = ctx.createRadialGradient(ix, iy, 30, ix, iy, r);
    iris.addColorStop(0, "#7fd0c2");
    iris.addColorStop(0.45, "#3a9e98");
    iris.addColorStop(0.86, "#1f6a70");
    iris.addColorStop(1, "#10303a");
    ctx.fillStyle = iris;
    ctx.beginPath();
    ctx.arc(ix, iy, r, 0, Math.PI * 2);
    ctx.fill();
    // Fibres running out from the pupil.
    const rand = seeded(7);
    ctx.lineCap = "round";
    for (let i = 0; i < 120; i++) {
      const a = (i / 120) * Math.PI * 2 + rand() * 0.03;
      const r0 = 50 + rand() * 8;
      const r1 = 92 + rand() * 24;
      ctx.strokeStyle =
        rand() < 0.5 ? "rgba(220, 255, 240, 0.22)" : "rgba(8, 40, 46, 0.3)";
      ctx.lineWidth = 2 + rand() * 2;
      ctx.beginPath();
      ctx.moveTo(ix + Math.cos(a) * r0, iy + Math.sin(a) * r0);
      ctx.lineTo(ix + Math.cos(a) * r1, iy + Math.sin(a) * r1);
      ctx.stroke();
    }
    ctx.fillStyle = "#0c1016";
    ctx.beginPath();
    ctx.arc(ix, iy, 47, 0, Math.PI * 2);
    ctx.fill();
    // The window, caught in the cornea.
    ctx.fillStyle = "rgba(255, 255, 255, 0.92)";
    ctx.beginPath();
    ctx.ellipse(ix - 36, iy - 40, 22, 17, -0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(ix + 34, iy + 30, 8, 0, Math.PI * 2);
    ctx.fill();
    // The upper lid's shadow on the eyeball.
    const shade = new Path2D();
    upper(shade, lid);
    shade.lineTo(cx + half, cy - 260);
    shade.lineTo(cx - half, cy - 260);
    shade.closePath();
    ctx.save();
    ctx.translate(0, 34);
    ctx.fillStyle = "rgba(60, 40, 20, 0.22)";
    ctx.fill(shade);
    ctx.restore();
    ctx.restore();
  }

  // The lid above the line, a shade deeper than the card.
  ctx.save();
  const lidSkin = new Path2D();
  upper(lidSkin, up);
  lidSkin.lineTo(cx + half, cy);
  lidSkin.quadraticCurveTo(cx, cy + lid * 2, cx - half, cy);
  lidSkin.closePath();
  ctx.fillStyle = "#e3ab36";
  if (shut > 0) ctx.fill(lidSkin);
  ctx.strokeStyle = ink;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // Lid lines and lashes. Shut, the lashes hang down from the closed lid.
  ctx.lineWidth = 15;
  ctx.beginPath();
  upper(ctx, lid);
  ctx.stroke();
  ctx.lineWidth = 6;
  ctx.beginPath();
  lower(ctx);
  ctx.stroke();
  for (let i = 0; i < 9; i++) {
    const t = 0.12 + (i / 8) * 0.8;
    // A point on the lid's curve and the way out from it.
    const x0 = lerp(lerp(cx - half, cx, t), lerp(cx, cx + half, t), t);
    const y0 = lerp(lerp(cy, cy + lid * 2, t), lerp(cy + lid * 2, cy, t), t);
    const side = (t - 0.5) * 2;
    const len = 58 - Math.abs(side) * 12;
    const dir = shut > 0.9 ? 1 : -1;
    // Fanned out from the middle and curled at the tips.
    const a = side * 0.95;
    const ex = x0 + Math.sin(a) * len;
    const ey = y0 + dir * Math.cos(a) * len;
    const qx = x0 + Math.sin(a * 0.4) * len * 0.45;
    const qy = y0 + dir * len * 0.7;
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.quadraticCurveTo(qx, qy, ex, ey);
    ctx.stroke();
  }
  ctx.restore();

  // A line along the bottom, as these were sold.
  ctx.fillStyle = ink;
  ctx.font = "italic 34px Georgia, 'Times New Roman', serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillText("I've got my eye on you", cx, H - 52);
}

// ---- Postcard --------------------------------------------------------------------------------
// The same bay by day and by night.

function drawPostcard(ctx: Ctx, k: number) {
  const W = IMAGE_WIDTH;
  const H = IMAGE_HEIGHT;
  const night = k === 1;
  const m = 20;
  const iw = W - m * 2;
  const ih = H - m * 2;
  ctx.fillStyle = "#f6f0e2";
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.beginPath();
  roundRect(ctx, m, m, iw, ih, 8);
  ctx.clip();
  ctx.translate(m, m);

  const horizon = ih * 0.56;
  const sky = ctx.createLinearGradient(0, 0, 0, horizon);
  if (night) {
    sky.addColorStop(0, "#081230");
    sky.addColorStop(1, "#22355e");
  } else {
    sky.addColorStop(0, "#6fb6df");
    sky.addColorStop(0.75, "#bfe0ea");
    sky.addColorStop(1, "#f7e6c4");
  }
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, iw, horizon + 2);

  const rand = seeded(19);
  const sunX = iw * 0.27;
  const sunY = horizon * 0.42;
  if (night) {
    for (let i = 0; i < 140; i++) {
      const x = rand() * iw;
      const y = rand() * horizon * 0.95;
      const r = rand() < 0.08 ? 2.4 : 0.8 + rand() * 1.1;
      ctx.fillStyle = `rgba(255, 248, 225, ${0.45 + rand() * 0.5})`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    const glow = ctx.createRadialGradient(sunX, sunY, 40, sunX, sunY, 170);
    glow.addColorStop(0, "rgba(230, 230, 255, 0.28)");
    glow.addColorStop(1, "rgba(230, 230, 255, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, iw, horizon);
    ctx.fillStyle = "#f3eed8";
    ctx.beginPath();
    ctx.arc(sunX, sunY, 50, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(170, 165, 140, 0.35)";
    for (const [dx, dy, r] of [
      [-14, -10, 11],
      [16, 8, 8],
      [-4, 22, 6],
      [20, -20, 5],
    ]) {
      ctx.beginPath();
      ctx.arc(sunX + dx, sunY + dy, r, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    for (let i = 0; i < 2; i++) rand();
    const glow = ctx.createRadialGradient(sunX, sunY, 50, sunX, sunY, 230);
    glow.addColorStop(0, "rgba(255, 240, 180, 0.7)");
    glow.addColorStop(1, "rgba(255, 240, 180, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, iw, horizon);
    ctx.fillStyle = "#ffd65c";
    ctx.beginPath();
    ctx.arc(sunX, sunY, 64, 0, Math.PI * 2);
    ctx.fill();
    // Clouds: rows of puffs with flat bottoms.
    const cloud = (x: number, y: number, s: number) => {
      ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
      ctx.beginPath();
      for (const [dx, dy, r] of [
        [0, 0, 34],
        [40, -16, 44],
        [92, -4, 36],
        [128, 8, 26],
        [-34, 10, 24],
      ]) {
        ctx.moveTo(x + dx * s + r * s, y + dy * s);
        ctx.arc(x + dx * s, y + dy * s, r * s, 0, Math.PI * 2);
      }
      ctx.fill();
      ctx.fillRect(x - 58 * s, y + 10 * s, 210 * s, 24 * s);
    };
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, iw, horizon - 8);
    ctx.clip();
    cloud(iw * 0.55, horizon * 0.3, 1);
    cloud(iw * 0.82, horizon * 0.52, 0.7);
    cloud(iw * 0.06, horizon * 0.72, 0.6);
    ctx.restore();
  }

  // The sea, with lines of swell drawn closer together towards the horizon.
  const sea = ctx.createLinearGradient(0, horizon, 0, ih);
  if (night) {
    sea.addColorStop(0, "#14284a");
    sea.addColorStop(1, "#071326");
  } else {
    sea.addColorStop(0, "#3d9bb2");
    sea.addColorStop(1, "#1d6782");
  }
  ctx.fillStyle = sea;
  ctx.fillRect(0, horizon, iw, ih - horizon);
  const waves = seeded(31);
  ctx.lineCap = "round";
  for (let row = 0; row < 26; row++) {
    const t = row / 25;
    const y = horizon + 6 + t * t * (ih - horizon - 10);
    const len = 14 + t * 60;
    for (let i = 0; i < 9 + row; i++) {
      const x = waves() * iw;
      const near = Math.abs(x - sunX) < 40 + t * 70;
      ctx.lineWidth = 1.2 + t * 2.6;
      if (night) {
        ctx.strokeStyle = near
          ? `rgba(245, 240, 210, ${0.55 + waves() * 0.4})`
          : "rgba(120, 150, 200, 0.18)";
      } else {
        ctx.strokeStyle = near
          ? "rgba(255, 245, 200, 0.85)"
          : "rgba(225, 245, 250, 0.45)";
      }
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + len / 2, y - 2 - t * 3, x + len, y);
      ctx.stroke();
    }
  }

  // The headland, its cliff face and the lighthouse on top.
  const land = new Path2D();
  land.moveTo(iw * 0.6, horizon + 2);
  land.bezierCurveTo(
    iw * 0.66,
    horizon - 30,
    iw * 0.68,
    horizon - 110,
    iw * 0.73,
    horizon - 128,
  );
  land.bezierCurveTo(
    iw * 0.8,
    horizon - 150,
    iw * 0.9,
    horizon - 142,
    iw,
    horizon - 160,
  );
  land.lineTo(iw, ih);
  land.lineTo(iw * 0.74, ih);
  land.bezierCurveTo(
    iw * 0.7,
    horizon + 120,
    iw * 0.66,
    horizon + 30,
    iw * 0.6,
    horizon + 2,
  );
  ctx.fillStyle = night ? "#17222e" : "#c79a68";
  ctx.fill(land);
  const grass = new Path2D();
  grass.moveTo(iw * 0.71, horizon - 118);
  grass.bezierCurveTo(
    iw * 0.8,
    horizon - 150,
    iw * 0.9,
    horizon - 142,
    iw,
    horizon - 160,
  );
  grass.lineTo(iw, horizon - 112);
  grass.bezierCurveTo(
    iw * 0.9,
    horizon - 104,
    iw * 0.82,
    horizon - 118,
    iw * 0.71,
    horizon - 118,
  );
  ctx.fillStyle = night ? "#0f1820" : "#6f9a4f";
  ctx.fill(grass);
  // Strata in the cliff.
  ctx.strokeStyle = night
    ? "rgba(255, 255, 255, 0.04)"
    : "rgba(120, 70, 30, 0.28)";
  ctx.lineWidth = 3;
  for (let i = 0; i < 6; i++) {
    const y = horizon - 90 + i * 34;
    ctx.beginPath();
    ctx.moveTo(iw * 0.66 + i * 6, y);
    ctx.quadraticCurveTo(iw * 0.82, y - 14, iw, y - 8);
    ctx.stroke();
  }

  const lx = iw * 0.84;
  const base = horizon - 140;
  const top = base - 168;
  const bw = 26;
  const tw = 17;
  const bands = 5;
  for (let i = 0; i < bands; i++) {
    const y0 = lerp(base, top, i / bands);
    const y1 = lerp(base, top, (i + 1) / bands);
    const w0 = lerp(bw, tw, i / bands);
    const w1 = lerp(bw, tw, (i + 1) / bands);
    ctx.fillStyle =
      i % 2 === 0
        ? night
          ? "#4a1d24"
          : "#d8473b"
        : night
          ? "#59636e"
          : "#fbf6ea";
    ctx.beginPath();
    ctx.moveTo(lx - w0, y0);
    ctx.lineTo(lx + w0, y0);
    ctx.lineTo(lx + w1, y1);
    ctx.lineTo(lx - w1, y1);
    ctx.closePath();
    ctx.fill();
  }
  // Gallery, lantern and dome.
  ctx.fillStyle = night ? "#0c1218" : "#2b2f3a";
  ctx.fillRect(lx - 26, top - 6, 52, 8);
  ctx.fillStyle = night ? "#ffe6a0" : "#bfd9e0";
  ctx.fillRect(lx - 14, top - 34, 28, 28);
  ctx.strokeStyle = night ? "#ffc65a" : "#2b2f3a";
  ctx.lineWidth = 2;
  ctx.strokeRect(lx - 14, top - 34, 28, 28);
  ctx.fillStyle = night ? "#3a1218" : "#9e2f2a";
  ctx.beginPath();
  ctx.moveTo(lx - 20, top - 34);
  ctx.quadraticCurveTo(lx, top - 66, lx + 20, top - 34);
  ctx.closePath();
  ctx.fill();
  if (night) {
    // The beam, swung out over the bay, and the lamp's glow.
    const beam = ctx.createLinearGradient(
      lx,
      top - 20,
      lx - iw * 0.75,
      top + 30,
    );
    beam.addColorStop(0, "rgba(255, 236, 170, 0.75)");
    beam.addColorStop(1, "rgba(255, 236, 170, 0)");
    ctx.fillStyle = beam;
    ctx.beginPath();
    ctx.moveTo(lx, top - 20);
    ctx.lineTo(lx - iw * 0.8, top - 90);
    ctx.lineTo(lx - iw * 0.8, top + 70);
    ctx.closePath();
    ctx.fill();
    const lamp = ctx.createRadialGradient(lx, top - 20, 4, lx, top - 20, 70);
    lamp.addColorStop(0, "rgba(255, 240, 190, 0.9)");
    lamp.addColorStop(1, "rgba(255, 220, 140, 0)");
    ctx.fillStyle = lamp;
    ctx.beginPath();
    ctx.arc(lx, top - 20, 70, 0, Math.PI * 2);
    ctx.fill();
    // The keeper's window.
    ctx.fillStyle = "#ffd77a";
    ctx.fillRect(lx - 5, base - 70, 10, 15);
  } else {
    ctx.fillStyle = "#2b2f3a";
    ctx.fillRect(lx - 5, base - 70, 10, 15);
    // Gulls.
    ctx.strokeStyle = "#2b3440";
    ctx.lineWidth = 3.2;
    for (const [x, y, s] of [
      [iw * 0.44, horizon * 0.5, 1],
      [iw * 0.49, horizon * 0.42, 0.75],
      [iw * 0.4, horizon * 0.36, 0.6],
    ]) {
      ctx.beginPath();
      ctx.moveTo(x - 20 * s, y - 4 * s);
      ctx.quadraticCurveTo(x - 10 * s, y - 14 * s, x, y);
      ctx.quadraticCurveTo(x + 10 * s, y - 14 * s, x + 20 * s, y - 4 * s);
      ctx.stroke();
    }
  }

  // Greetings across the water.
  ctx.save();
  ctx.font = "italic 700 64px Georgia, 'Times New Roman', serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = night ? "rgba(0, 0, 0, 0.45)" : "rgba(10, 50, 70, 0.35)";
  ctx.fillText("Wish you were here", 46, ih - 46);
  ctx.fillStyle = night ? "#f3d27a" : "#fff8e8";
  ctx.fillText("Wish you were here", 42, ih - 50);
  ctx.restore();
  ctx.restore();
}

// ---- Depth -----------------------------------------------------------------------------------
// A tunnel of frames, a ball in front of it and stars behind, drawn from twelve places in a row.
// Each layer slides with or against the eye by how far behind or in front of the card it is,
// which is how a flat print is given depth: the two eyes see two of the pictures at once.

function drawDepth(ctx: Ctx, k: number, opts: CardOptions) {
  const W = IMAGE_WIDTH;
  const H = IMAGE_HEIGHT;
  // −1 seen from one end of the row, 1 from the other.
  const s = (k - (DEPTH_FRAMES - 1) / 2) / ((DEPTH_FRAMES - 1) / 2);
  const reach = 30;
  const shift = (depth: number) =>
    opts.across
      ? { x: 0, y: -s * depth * reach }
      : { x: s * depth * reach, y: 0 };

  ctx.fillStyle = "#0e1530";
  ctx.fillRect(0, 0, W, H);
  const rand = seeded(5);
  const far = shift(1.4);
  for (let i = 0; i < 180; i++) {
    const x = rand() * (W + 120) - 60 + far.x;
    const y = rand() * (H + 120) - 60 + far.y;
    const r = rand() < 0.1 ? 2.2 : 0.7 + rand();
    ctx.fillStyle = `rgba(240, 236, 255, ${0.35 + rand() * 0.55})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  const colours = ["#f25f4c", "#f6e7cf", "#2fb0a0", "#f2b33d"];
  const rings = 8;
  for (let i = 0; i < rings; i++) {
    const t = i / (rings - 1);
    // From far and small to near and filling the card.
    const depth = lerp(1.1, 0.04, t);
    const w = lerp(W * 0.2, W * 0.96, t * t * 0.5 + t * 0.5);
    const h = w * (H / W) * 0.98;
    const band = lerp(10, 34, t);
    const o = shift(depth);
    const x = (W - w) / 2 + o.x;
    const y = (H - h) / 2 + o.y;
    const ring = new Path2D();
    roundRect(ring, x, y, w, h, lerp(8, 28, t));
    roundRect(
      ring,
      x + band,
      y + band,
      w - band * 2,
      h - band * 2,
      lerp(4, 16, t),
    );
    ctx.fillStyle = colours[i % colours.length];
    ctx.fill(ring, "evenodd");
    // A shade along the inner edge, so each frame reads as standing proud of the next.
    ctx.save();
    ctx.clip(ring, "evenodd");
    ctx.strokeStyle = "rgba(0, 0, 0, 0.18)";
    ctx.lineWidth = 6;
    ctx.beginPath();
    roundRect(
      ctx,
      x + band,
      y + band,
      w - band * 2,
      h - band * 2,
      lerp(4, 16, t),
    );
    ctx.stroke();
    ctx.restore();
  }

  // The ball, a hand's breadth in front of the card.
  const o = shift(-0.55);
  const bx = W / 2 + o.x;
  const by = H / 2 + o.y;
  const br = 92;
  const ball = ctx.createRadialGradient(bx - 34, by - 40, 8, bx, by, br);
  ball.addColorStop(0, "#fff4e2");
  ball.addColorStop(0.25, "#ff8a6a");
  ball.addColorStop(0.75, "#d63b3b");
  ball.addColorStop(1, "#6b1424");
  ctx.fillStyle = ball;
  ctx.beginPath();
  ctx.arc(bx, by, br, 0, Math.PI * 2);
  ctx.fill();
}

// ---- Words -----------------------------------------------------------------------------------

function drawWords(ctx: Ctx, k: number, opts: CardOptions) {
  const W = IMAGE_WIDTH;
  const H = IMAGE_HEIGHT;
  const [ground, ink] =
    k === 0 ? ["#ef5b45", "#fbf3e4"] : ["#1d2a4a", "#f3b63f"];
  ctx.fillStyle = ground;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = ink;
  ctx.globalAlpha = 0.5;
  ctx.lineWidth = 4;
  ctx.beginPath();
  roundRect(ctx, 34, 34, W - 68, H - 68, 18);
  ctx.stroke();
  ctx.globalAlpha = 1;
  const text = (opts.words[k] || " ").trim() || " ";
  let size = 260;
  const font = (px: number) => `800 ${px}px ${opts.sans}`;
  ctx.font = font(size);
  const width = ctx.measureText(text).width;
  size = Math.min(size, (size * (W * 0.8)) / Math.max(1, width));
  ctx.font = font(size);
  ctx.fillStyle = ink;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, W / 2, H / 2 + size * 0.04);
}

export function drawFrame(
  ctx: Ctx,
  card: CardId,
  k: number,
  opts: CardOptions,
) {
  ctx.save();
  ctx.clearRect(0, 0, IMAGE_WIDTH, IMAGE_HEIGHT);
  if (card === "eye") drawEye(ctx, k, opts);
  else if (card === "postcard") drawPostcard(ctx, k);
  else if (card === "depth") drawDepth(ctx, k, opts);
  else drawWords(ctx, k, opts);
  ctx.restore();
}
