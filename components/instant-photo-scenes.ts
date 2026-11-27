/**
 * The pictures on the film. Each one is painted from scratch onto a canvas,
 * so nothing needs downloading and every print grains a little differently.
 */

type Painter = (
  context: CanvasRenderingContext2D,
  size: number,
  random: () => number,
) => void;

export type InstantPhotoScene = {
  alt: string;
  id: string;
  paint: Painter;
  title: string;
};

/** A small seeded random, so a scene can be painted the same way twice. */
export function seededRandom(seed: number) {
  let state = seed >>> 0;

  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let next = Math.imul(state ^ (state >>> 15), 1 | state);
    next ^= next + Math.imul(next ^ (next >>> 7), 61 | next);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

const lerp = (from: number, to: number, amount: number) =>
  from + (to - from) * amount;

/** Draw a shape's blurred shadow without drawing the shape itself. */
function softShadow(
  context: CanvasRenderingContext2D,
  blur: number,
  color: string,
  trace: () => void,
) {
  const away = 10_000;

  context.save();
  context.shadowBlur = blur;
  context.shadowColor = color;
  context.shadowOffsetX = away;
  context.translate(-away, 0);
  context.beginPath();
  trace();
  context.fillStyle = "#000";
  context.fill();
  context.restore();
}

/* -------------------------------------------------------------------------- */
/* Pier at dusk                                                                */
/* -------------------------------------------------------------------------- */

const paintPier: Painter = (context, size, random) => {
  const s = size;
  const horizon = s * 0.57;

  const sky = context.createLinearGradient(0, 0, 0, horizon);
  sky.addColorStop(0, "#2c3768");
  sky.addColorStop(0.42, "#775c93");
  sky.addColorStop(0.78, "#e2897a");
  sky.addColorStop(1, "#f8c788");
  context.fillStyle = sky;
  context.fillRect(0, 0, s, horizon);

  // Long, thin clouds catching the last of the light.
  for (let cloud = 0; cloud < 7; cloud += 1) {
    context.fillStyle = `rgba(255, 188, 168, ${0.1 + random() * 0.14})`;
    context.beginPath();
    context.ellipse(
      random() * s,
      horizon * (0.3 + random() * 0.5),
      s * (0.1 + random() * 0.2),
      s * (0.006 + random() * 0.01),
      0,
      0,
      Math.PI * 2,
    );
    context.fill();
  }

  const sunX = s * 0.64;
  const sunY = horizon - s * 0.028;
  const glow = context.createRadialGradient(
    sunX,
    sunY,
    0,
    sunX,
    sunY,
    s * 0.32,
  );
  glow.addColorStop(0, "rgba(255, 222, 160, 0.75)");
  glow.addColorStop(0.25, "rgba(255, 186, 130, 0.32)");
  glow.addColorStop(1, "rgba(255, 170, 130, 0)");
  context.fillStyle = glow;
  context.fillRect(0, 0, s, horizon);

  context.fillStyle = "#fff2d2";
  context.beginPath();
  context.arc(sunX, sunY, s * 0.052, 0, Math.PI * 2);
  context.fill();

  const sea = context.createLinearGradient(0, horizon, 0, s);
  sea.addColorStop(0, "#94728f");
  sea.addColorStop(0.3, "#4c4567");
  sea.addColorStop(1, "#1f1f37");
  context.fillStyle = sea;
  context.fillRect(0, horizon, s, s - horizon);

  // Ripples everywhere, then a glittering path under the sun.
  for (let ripple = 0; ripple < 140; ripple += 1) {
    const depth = random() ** 1.4;
    const y = horizon + depth * (s - horizon);
    const width = s * (0.01 + random() * 0.05) * (0.3 + depth);
    context.fillStyle = `rgba(210, 176, 214, ${0.05 + random() * 0.1})`;
    context.fillRect(random() * s, y, width, Math.max(1, s * 0.003 * depth));
  }

  for (let glint = 0; glint < 260; glint += 1) {
    const depth = random() ** 1.7;
    const y = horizon + depth * (s - horizon);
    const spread = s * (0.03 + depth * 0.2);
    const x = sunX + (random() - 0.5) * 2 * spread * random();
    const width = s * (0.008 + random() * 0.03) * (0.4 + depth);
    const alpha = (1 - depth * 0.55) * (0.25 + random() * 0.6);
    context.fillStyle = `rgba(255, 216, 160, ${alpha})`;
    context.fillRect(
      x - width / 2,
      y,
      width,
      Math.max(1, s * 0.0035 * (0.4 + depth)),
    );
  }

  // The pier runs from the near left out towards the horizon.
  const pierEnd = s * 0.47;
  const deckTop = (t: number) =>
    lerp(horizon + s * 0.16, horizon + s * 0.03, t);
  const deckDepth = (t: number) => lerp(s * 0.034, s * 0.009, t);
  const ink = "#15141f";

  context.fillStyle = ink;
  context.beginPath();
  context.moveTo(-s * 0.02, deckTop(0));
  context.lineTo(pierEnd, deckTop(1));
  context.lineTo(pierEnd, deckTop(1) + deckDepth(1));
  context.lineTo(-s * 0.02, deckTop(0) + deckDepth(0));
  context.closePath();
  context.fill();

  for (let post = 0; post <= 16; post += 1) {
    const t = post / 16;
    const x = t * pierEnd;
    const top = deckTop(t) + deckDepth(t);
    const length = lerp(s * 0.075, s * 0.014, t);
    const width = lerp(s * 0.013, s * 0.0035, t);
    context.fillStyle = ink;
    context.fillRect(x - width / 2, top, width, length);
    // Each post's broken reflection.
    context.fillStyle = "rgba(14, 12, 26, 0.35)";
    context.fillRect(x - width / 2, top + length, width, length * 0.7);
  }

  context.strokeStyle = ink;
  context.lineCap = "round";
  for (let rail = 0; rail <= 22; rail += 1) {
    const t = rail / 22;
    const x = t * pierEnd;
    const height = lerp(s * 0.03, s * 0.008, t);
    context.lineWidth = lerp(s * 0.004, s * 0.0015, t);
    context.beginPath();
    context.moveTo(x, deckTop(t));
    context.lineTo(x, deckTop(t) - height);
    context.stroke();
  }
  context.lineWidth = s * 0.0035;
  context.beginPath();
  context.moveTo(-s * 0.02, deckTop(0) - s * 0.03);
  context.lineTo(pierEnd, deckTop(1) - s * 0.008);
  context.stroke();

  // A little pavilion at the end, with its lamps already lit.
  const pavilionX = s * 0.405;
  const pavilionWidth = s * 0.07;
  const pavilionBase = deckTop(0.88);
  context.fillStyle = ink;
  context.fillRect(
    pavilionX,
    pavilionBase - s * 0.04,
    pavilionWidth,
    s * 0.042,
  );
  context.beginPath();
  context.ellipse(
    pavilionX + pavilionWidth / 2,
    pavilionBase - s * 0.04,
    pavilionWidth / 2,
    s * 0.026,
    0,
    Math.PI,
    0,
  );
  context.fill();
  context.fillRect(
    pavilionX + pavilionWidth / 2 - s * 0.002,
    pavilionBase - s * 0.082,
    s * 0.004,
    s * 0.02,
  );

  for (let lamp = 0; lamp < 6; lamp += 1) {
    const t = 0.08 + lamp * 0.13;
    const x = t * pierEnd;
    const height = lerp(s * 0.06, s * 0.02, t);
    const top = deckTop(t) - height;
    context.fillStyle = ink;
    context.fillRect(x - s * 0.0015, top, s * 0.003, height);
    const light = context.createRadialGradient(x, top, 0, x, top, s * 0.03);
    light.addColorStop(0, "rgba(255, 226, 170, 0.95)");
    light.addColorStop(0.2, "rgba(255, 200, 140, 0.4)");
    light.addColorStop(1, "rgba(255, 190, 130, 0)");
    context.fillStyle = light;
    context.fillRect(x - s * 0.03, top - s * 0.03, s * 0.06, s * 0.06);
  }

  // Three gulls heading home.
  context.strokeStyle = "rgba(30, 24, 48, 0.8)";
  context.lineWidth = s * 0.004;
  for (const [x, y, span] of [
    [0.74, 0.2, 0.03],
    [0.8, 0.25, 0.022],
    [0.69, 0.27, 0.018],
  ] as const) {
    context.beginPath();
    context.moveTo((x - span) * s, (y - span * 0.3) * s);
    context.quadraticCurveTo(
      (x - span * 0.4) * s,
      (y - span * 0.6) * s,
      x * s,
      y * s,
    );
    context.quadraticCurveTo(
      (x + span * 0.4) * s,
      (y - span * 0.6) * s,
      (x + span) * s,
      (y - span * 0.3) * s,
    );
    context.stroke();
  }
};

/* -------------------------------------------------------------------------- */
/* Lemons                                                                      */
/* -------------------------------------------------------------------------- */

function lemon(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  radiusX: number,
  radiusY: number,
  angle: number,
  random: () => number,
) {
  context.save();
  context.translate(x, y);
  context.rotate(angle);

  const trace = () => {
    context.moveTo(-radiusX * 1.12, 0);
    context.bezierCurveTo(
      -radiusX * 0.95,
      -radiusY * 0.62,
      -radiusX * 0.6,
      -radiusY,
      0,
      -radiusY,
    );
    context.bezierCurveTo(
      radiusX * 0.6,
      -radiusY,
      radiusX * 0.95,
      -radiusY * 0.62,
      radiusX * 1.12,
      0,
    );
    context.bezierCurveTo(
      radiusX * 0.95,
      radiusY * 0.62,
      radiusX * 0.6,
      radiusY,
      0,
      radiusY,
    );
    context.bezierCurveTo(
      -radiusX * 0.6,
      radiusY,
      -radiusX * 0.95,
      radiusY * 0.62,
      -radiusX * 1.12,
      0,
    );
  };

  const skin = context.createRadialGradient(
    -radiusX * 0.35,
    -radiusY * 0.45,
    radiusY * 0.05,
    0,
    0,
    radiusX * 1.15,
  );
  skin.addColorStop(0, "#fff8bd");
  skin.addColorStop(0.3, "#f9d93a");
  skin.addColorStop(0.75, "#e6b414");
  skin.addColorStop(1, "#a9770a");

  context.beginPath();
  trace();
  context.fillStyle = skin;
  context.fill();

  context.save();
  context.clip();
  for (let pore = 0; pore < 90; pore += 1) {
    context.fillStyle = `rgba(150, 100, 0, ${0.05 + random() * 0.08})`;
    context.beginPath();
    context.arc(
      (random() - 0.5) * radiusX * 2,
      (random() - 0.5) * radiusY * 2,
      radiusX * 0.018,
      0,
      Math.PI * 2,
    );
    context.fill();
  }
  context.restore();

  // The little nub at the tip.
  context.fillStyle = "#c79a12";
  context.beginPath();
  context.ellipse(
    radiusX * 1.12,
    0,
    radiusX * 0.07,
    radiusY * 0.1,
    0,
    0,
    Math.PI * 2,
  );
  context.fill();
  context.restore();
}

const paintLemons: Painter = (context, size, random) => {
  const s = size;
  const table = s * 0.58;

  const wall = context.createLinearGradient(0, 0, 0, table);
  wall.addColorStop(0, "#ead9b6");
  wall.addColorStop(1, "#cfb68b");
  context.fillStyle = wall;
  context.fillRect(0, 0, s, table);

  // Morning sun through a two-pane window.
  context.save();
  context.fillStyle = "rgba(255, 248, 226, 0.34)";
  for (const offset of [0, 0.2]) {
    context.beginPath();
    context.moveTo(s * (0.08 + offset), 0);
    context.lineTo(s * (0.25 + offset), 0);
    context.lineTo(s * (0.42 + offset), table);
    context.lineTo(s * (0.25 + offset), table);
    context.closePath();
    context.fill();
  }
  context.restore();

  // A gingham cloth, its stripes running away to a vanishing point.
  context.fillStyle = "#f4efe4";
  context.fillRect(0, table, s, s - table);

  const vanishX = s * 0.5;
  const vanishY = table - s * 0.95;
  const reach = (s - table) / (s - vanishY);
  context.fillStyle = "rgba(48, 92, 152, 0.4)";
  for (let stripe = -14; stripe <= 14; stripe += 1) {
    const left = vanishX + stripe * s * 0.1;
    const right = left + s * 0.05;
    context.beginPath();
    context.moveTo(left, s);
    context.lineTo(right, s);
    context.lineTo(right + (vanishX - right) * reach, table);
    context.lineTo(left + (vanishX - left) * reach, table);
    context.closePath();
    context.fill();
  }
  for (let row = 0; row < 12; row += 1) {
    const top = table + (s - table) * (row / 11) ** 1.5;
    const next = table + (s - table) * ((row + 1) / 11) ** 1.5;
    context.fillRect(0, top, s, (next - top) * 0.5);
  }

  const fold = context.createLinearGradient(0, table, 0, table + s * 0.05);
  fold.addColorStop(0, "rgba(70, 45, 20, 0.25)");
  fold.addColorStop(1, "rgba(70, 45, 20, 0)");
  context.fillStyle = fold;
  context.fillRect(0, table, s, s * 0.05);

  // Shadows first, falling away from the window.
  const bowlX = s * 0.42;
  const rim = s * 0.66;
  const bowlWidth = s * 0.26;
  softShadow(context, s * 0.04, "rgba(50, 34, 18, 0.45)", () =>
    context.ellipse(
      bowlX + s * 0.08,
      rim + s * 0.17,
      bowlWidth * 0.95,
      s * 0.05,
      0,
      0,
      Math.PI * 2,
    ),
  );
  softShadow(context, s * 0.03, "rgba(50, 34, 18, 0.5)", () =>
    context.ellipse(s * 0.82, s * 0.92, s * 0.1, s * 0.035, 0, 0, Math.PI * 2),
  );

  // The inside of the bowl, then the lemons in it, then its front.
  const inside = context.createLinearGradient(
    bowlX - bowlWidth,
    0,
    bowlX + bowlWidth,
    0,
  );
  inside.addColorStop(0, "#bdb6a6");
  inside.addColorStop(1, "#ece8df");
  context.fillStyle = inside;
  context.beginPath();
  context.ellipse(bowlX, rim, bowlWidth, s * 0.055, 0, 0, Math.PI * 2);
  context.fill();

  lemon(
    context,
    bowlX - s * 0.1,
    rim - s * 0.03,
    s * 0.1,
    s * 0.07,
    -0.35,
    random,
  );
  lemon(
    context,
    bowlX + s * 0.1,
    rim - s * 0.035,
    s * 0.095,
    s * 0.068,
    0.45,
    random,
  );
  lemon(
    context,
    bowlX + s * 0.005,
    rim - s * 0.085,
    s * 0.1,
    s * 0.07,
    0.1,
    random,
  );

  const glaze = context.createLinearGradient(
    bowlX - bowlWidth,
    0,
    bowlX + bowlWidth,
    0,
  );
  glaze.addColorStop(0, "#ffffff");
  glaze.addColorStop(0.45, "#f3f0ea");
  glaze.addColorStop(1, "#aaa293");
  context.fillStyle = glaze;
  context.beginPath();
  context.ellipse(bowlX, rim, bowlWidth, s * 0.055, 0, 0, Math.PI);
  context.lineTo(bowlX - bowlWidth * 0.55, rim + s * 0.16);
  context.ellipse(
    bowlX,
    rim + s * 0.16,
    bowlWidth * 0.55,
    s * 0.025,
    0,
    Math.PI,
    0,
    true,
  );
  context.closePath();
  context.fill();

  // A blue band glazed under the rim.
  context.strokeStyle = "rgba(40, 84, 150, 0.85)";
  context.lineWidth = s * 0.008;
  context.beginPath();
  context.ellipse(
    bowlX,
    rim + s * 0.025,
    bowlWidth * 0.95,
    s * 0.05,
    0,
    0.12,
    Math.PI - 0.12,
  );
  context.stroke();

  lemon(context, s * 0.79, s * 0.86, s * 0.1, s * 0.07, 0.25, random);

  // One leaf, still on its stalk.
  context.save();
  context.translate(bowlX + s * 0.05, rim - s * 0.15);
  context.rotate(-0.6);
  const leaf = context.createLinearGradient(0, -s * 0.03, 0, s * 0.03);
  leaf.addColorStop(0, "#6f9b45");
  leaf.addColorStop(1, "#365d25");
  context.fillStyle = leaf;
  context.beginPath();
  context.moveTo(0, 0);
  context.quadraticCurveTo(s * 0.07, -s * 0.045, s * 0.15, 0);
  context.quadraticCurveTo(s * 0.07, s * 0.045, 0, 0);
  context.fill();
  context.strokeStyle = "rgba(220, 240, 180, 0.5)";
  context.lineWidth = s * 0.003;
  context.beginPath();
  context.moveTo(0, 0);
  context.lineTo(s * 0.14, 0);
  context.stroke();
  context.restore();
};

/* -------------------------------------------------------------------------- */
/* Alpine lake                                                                 */
/* -------------------------------------------------------------------------- */

type Point = { x: number; y: number };

/** A ridge line: peaks and saddles, roughened by midpoint displacement. */
function ridge(
  random: () => number,
  size: number,
  base: number,
  height: number,
  peaks: number,
) {
  let points: Point[] = [{ x: -size * 0.05, y: base - height * 0.2 }];

  for (let peak = 0; peak < peaks; peak += 1) {
    const x = ((peak + 0.3 + random() * 0.4) / peaks) * size;
    points.push({
      x: x - size * 0.06,
      y: base - height * (0.25 + random() * 0.3),
    });
    points.push({ x, y: base - height * (0.7 + random() * 0.3) });
  }
  points.push({ x: size * 1.05, y: base - height * 0.3 });

  for (let pass = 0; pass < 3; pass += 1) {
    const rough: Point[] = [];
    for (let index = 0; index < points.length - 1; index += 1) {
      const from = points[index];
      const to = points[index + 1];
      rough.push(from, {
        x: (from.x + to.x) / 2,
        y: (from.y + to.y) / 2 + (random() - 0.5) * height * 0.18 * 0.5 ** pass,
      });
    }
    rough.push(points[points.length - 1]);
    points = rough;
  }

  return points;
}

function fillRange(
  context: CanvasRenderingContext2D,
  points: Point[],
  bottom: number,
  color: string,
  snowLine: number | null,
  random: () => number,
) {
  context.save();
  context.beginPath();
  context.moveTo(points[0].x, bottom);
  for (const point of points) {
    context.lineTo(point.x, point.y);
  }
  context.lineTo(points[points.length - 1].x, bottom);
  context.closePath();
  context.fillStyle = color;
  context.fill();

  if (snowLine !== null) {
    context.clip();
    const size = context.canvas.width;
    const snow = context.createLinearGradient(0, 0, size, 0);
    snow.addColorStop(0, "#ffffff");
    snow.addColorStop(1, "#dfe6f2");
    context.fillStyle = snow;
    context.beginPath();
    context.moveTo(0, 0);
    for (let x = 0; x <= size; x += size / 40) {
      context.lineTo(x, snowLine + (random() - 0.3) * size * 0.04);
    }
    context.lineTo(size, 0);
    context.closePath();
    context.fill();

    // Shade the far side of every peak.
    context.fillStyle = "rgba(40, 52, 96, 0.22)";
    for (let index = 1; index < points.length - 1; index += 1) {
      const point = points[index];
      if (point.y < points[index - 1].y && point.y < points[index + 1].y) {
        context.beginPath();
        context.moveTo(point.x, point.y);
        context.lineTo(point.x + size * 0.14, bottom);
        context.lineTo(point.x + size * 0.01, bottom);
        context.closePath();
        context.fill();
      }
    }
  }
  context.restore();
}

const paintAlps: Painter = (context, size, random) => {
  const s = size;
  const shore = Math.round(s * 0.6);
  const upper = document.createElement("canvas");
  upper.width = s;
  upper.height = shore;
  const land = upper.getContext("2d");

  if (!land) {
    return;
  }

  const sky = land.createLinearGradient(0, 0, 0, shore);
  sky.addColorStop(0, "#4a81c4");
  sky.addColorStop(0.6, "#9cc1e6");
  sky.addColorStop(1, "#e4edf2");
  land.fillStyle = sky;
  land.fillRect(0, 0, s, shore);

  for (let cloud = 0; cloud < 5; cloud += 1) {
    const x = random() * s;
    const y = s * (0.06 + random() * 0.16);
    land.fillStyle = "rgba(255, 255, 255, 0.55)";
    land.shadowColor = "rgba(255, 255, 255, 0.9)";
    land.shadowBlur = s * 0.03;
    for (let puff = 0; puff < 4; puff += 1) {
      land.beginPath();
      land.ellipse(
        x + puff * s * 0.035,
        y + (random() - 0.5) * s * 0.01,
        s * 0.04,
        s * 0.016,
        0,
        0,
        Math.PI * 2,
      );
      land.fill();
    }
  }
  land.shadowBlur = 0;

  const far = ridge(random, s, shore, s * 0.42, 3);
  fillRange(land, far, shore, "#8ca2c2", shore - s * 0.27, random);
  const near = ridge(random, s, shore, s * 0.24, 4);
  fillRange(land, near, shore, "#5c707e", shore - s * 0.19, random);

  // A band of pines along the shore.
  land.fillStyle = "#1f3b2c";
  land.fillRect(0, shore - s * 0.03, s, s * 0.03);
  for (let x = -s * 0.02; x < s * 1.02; x += s * (0.012 + random() * 0.012)) {
    const height = s * (0.035 + random() * 0.05);
    const width = height * 0.32;
    land.fillStyle = random() > 0.5 ? "#1c3627" : "#264733";
    land.beginPath();
    land.moveTo(x, shore - s * 0.02 - height);
    land.lineTo(x + width, shore - s * 0.01);
    land.lineTo(x - width, shore - s * 0.01);
    land.closePath();
    land.fill();
  }

  context.drawImage(upper, 0, 0);

  // The lake holds a slightly darker copy of it all, upside down.
  context.save();
  context.beginPath();
  context.rect(0, shore, s, s - shore);
  context.clip();
  context.setTransform(1, 0, 0, -1, 0, shore * 2);
  context.drawImage(upper, 0, 0);
  context.restore();

  const water = context.createLinearGradient(0, shore, 0, s);
  water.addColorStop(0, "rgba(34, 74, 104, 0.3)");
  water.addColorStop(1, "rgba(16, 36, 56, 0.62)");
  context.fillStyle = water;
  context.fillRect(0, shore, s, s - shore);

  for (let ripple = 0; ripple < 120; ripple += 1) {
    const y = shore + random() ** 1.3 * (s - shore);
    context.fillStyle =
      random() > 0.5
        ? `rgba(255, 255, 255, ${0.05 + random() * 0.12})`
        : `rgba(10, 30, 50, ${0.08 + random() * 0.12})`;
    context.fillRect(
      random() * s,
      y,
      s * (0.02 + random() * 0.08),
      Math.max(1, s * 0.0025),
    );
  }
  context.fillStyle = "rgba(255, 255, 255, 0.35)";
  context.fillRect(0, shore, s, Math.max(1, s * 0.003));

  // A red rowing boat, and its rings on the water.
  const boatX = s * 0.64;
  const boatY = s * 0.78;
  context.strokeStyle = "rgba(255, 255, 255, 0.22)";
  context.lineWidth = s * 0.003;
  for (let ring = 1; ring <= 3; ring += 1) {
    context.beginPath();
    context.ellipse(
      boatX,
      boatY + s * 0.008,
      s * (0.06 + ring * 0.03),
      s * (0.008 + ring * 0.006),
      0,
      0,
      Math.PI * 2,
    );
    context.stroke();
  }
  context.fillStyle = "rgba(200, 64, 44, 0.35)";
  context.beginPath();
  context.ellipse(boatX, boatY + s * 0.018, s * 0.05, s * 0.012, 0, 0, Math.PI);
  context.fill();
  context.fillStyle = "#c63f2b";
  context.beginPath();
  context.moveTo(boatX - s * 0.065, boatY - s * 0.012);
  context.lineTo(boatX + s * 0.065, boatY - s * 0.016);
  context.quadraticCurveTo(
    boatX + s * 0.05,
    boatY + s * 0.01,
    boatX,
    boatY + s * 0.01,
  );
  context.quadraticCurveTo(
    boatX - s * 0.05,
    boatY + s * 0.01,
    boatX - s * 0.065,
    boatY - s * 0.012,
  );
  context.fill();
  context.fillStyle = "#6f2418";
  context.beginPath();
  context.ellipse(
    boatX,
    boatY - s * 0.013,
    s * 0.058,
    s * 0.005,
    -0.03,
    0,
    Math.PI * 2,
  );
  context.fill();
};

/* -------------------------------------------------------------------------- */
/* Finishing                                                                   */
/* -------------------------------------------------------------------------- */

/** Lifted blacks, a warm-cool cast, a vignette and grain: the film's look. */
function finish(
  context: CanvasRenderingContext2D,
  size: number,
  random: () => number,
) {
  const vignette = context.createRadialGradient(
    size / 2,
    size / 2,
    size * 0.28,
    size / 2,
    size / 2,
    size * 0.76,
  );
  vignette.addColorStop(0, "rgba(24, 12, 32, 0)");
  vignette.addColorStop(1, "rgba(24, 12, 32, 0.42)");
  context.fillStyle = vignette;
  context.fillRect(0, 0, size, size);

  const image = context.getImageData(0, 0, size, size);
  const data = image.data;

  for (let index = 0; index < data.length; index += 4) {
    const grain = (random() - 0.5) * 16;
    data[index] = data[index] * 0.9 + 16 + grain;
    data[index + 1] = data[index + 1] * 0.88 + 14 + grain;
    data[index + 2] = data[index + 2] * 0.84 + 22 + grain;
  }

  context.putImageData(image, 0, 0);
}

export function paintScene(
  canvas: HTMLCanvasElement,
  scene: InstantPhotoScene,
  seed: number,
) {
  const context = canvas.getContext("2d");

  if (!context) {
    return;
  }

  const random = seededRandom(seed);
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, canvas.width, canvas.height);
  scene.paint(context, canvas.width, random);
  context.setTransform(1, 0, 0, 1, 0, 0);
  finish(context, canvas.width, random);
}

export const instantPhotoScenes: InstantPhotoScene[] = [
  {
    alt: "A pier running out to sea at dusk, its lamps lit and the low sun glittering on the water",
    id: "pier",
    paint: paintPier,
    title: "Pier at dusk",
  },
  {
    alt: "Lemons in a white bowl on a blue gingham tablecloth, in morning sun",
    id: "lemons",
    paint: paintLemons,
    title: "Lemons",
  },
  {
    alt: "Snowy peaks over a still alpine lake, with a red rowing boat",
    id: "alps",
    paint: paintAlps,
    title: "Alpine lake",
  },
];
