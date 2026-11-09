// The picture strips, drawn as a printer would have made them: a long band of cream paper ruled
// top and bottom, with one picture per slit (or one either side of that) evenly along it, each a
// step further through a movement that loops. Line work is in ink and the colour is a wash laid
// over it, as Victorian strips were hand-tinted. The strip is drawn flat here and wraps round the
// inside of the drum; its two ends meet at a glued join.

import { STRIP_ROWS, STRIP_TEXELS } from "./drum";

export type StripId = "ball" | "runner" | "gull" | "juggler" | "own";

export const STRIPS: { value: StripId; label: string; title: string }[] = [
  { value: "ball", label: "Ball", title: "The Bouncing Ball" },
  { value: "runner", label: "Runner", title: "The Runner" },
  { value: "gull", label: "Gull", title: "The Gull" },
  { value: "juggler", label: "Juggler", title: "The Juggler" },
  { value: "own", label: "Your own", title: "" },
];

// Where the pictures stand, in strip rows from the top.
export const GROUND = 300;
// A picture's width when there are twelve, which is what the drawings are made for.
export const FRAME_WIDTH = STRIP_TEXELS / 12;

const INK = "#1d1610";
const TAU = Math.PI * 2;

type Draw = (ctx: CanvasRenderingContext2D, p: number) => void;

function random(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Cream paper with a few fibres and age spots, darker towards its cut edges, ruled top and
// bottom as printed strips were.
function paper(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const fill = ctx.createLinearGradient(0, 0, 0, h);
  fill.addColorStop(0, "#dfd0ae");
  fill.addColorStop(0.06, "#ebdfc3");
  fill.addColorStop(0.94, "#ebdfc3");
  fill.addColorStop(1, "#d8c8a4");
  ctx.fillStyle = fill;
  ctx.fillRect(0, 0, w, h);
  const r = random(7);
  for (let i = 0; i < 2600; i++) {
    const x = r() * w;
    const y = r() * h;
    const len = 2 + r() * 7;
    const a = (r() - 0.5) * 2;
    ctx.strokeStyle =
      r() < 0.5 ? "rgba(255, 252, 240, 0.35)" : "rgba(120, 95, 60, 0.12)";
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
    ctx.stroke();
  }
  for (let i = 0; i < 26; i++) {
    const x = r() * w;
    const y = r() * h;
    const rad = 2 + r() * 7;
    const spot = ctx.createRadialGradient(x, y, 0, x, y, rad);
    spot.addColorStop(0, "rgba(150, 100, 50, 0.22)");
    spot.addColorStop(1, "rgba(150, 100, 50, 0)");
    ctx.fillStyle = spot;
    ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  ctx.fillStyle = INK;
  ctx.globalAlpha = 0.82;
  ctx.fillRect(0, 9, w, 2.4);
  ctx.fillRect(0, 14, w, 1);
  ctx.fillRect(0, h - 15, w, 1);
  ctx.fillRect(0, h - 11.4, w, 2.4);
  ctx.globalAlpha = 1;
}

function line(
  ctx: CanvasRenderingContext2D,
  points: [number, number][],
  width: number,
  color = INK,
) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  points.forEach(([x, y], i) => {
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
}

// A blob of watercolour: a little darker at its edge, where the wash dried.
function wash(
  ctx: CanvasRenderingContext2D,
  shape: () => void,
  color: string | CanvasGradient,
  edge: string,
) {
  ctx.beginPath();
  shape();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = edge;
  ctx.lineWidth = 2;
  ctx.stroke();
}

// ---- The pictures, each drawn about its spot on the ground, a fraction p through its loop -----

// A rubber ball dropping and bouncing back up: an even arc each time, squashed flat where it
// lands and stretched where it's fastest, with a shadow that tightens as it nears the ground.
const ball: Draw = (ctx, p) => {
  const r = 30;
  const h = 4 * p * (1 - p);
  const speed = Math.abs(1 - 2 * p);
  let sx = 1;
  let sy = 1;
  if (p < 1e-6) {
    sx = 1.32;
    sy = 0.7;
  } else {
    sy = 1 + 0.22 * speed ** 3;
    sx = 1 / Math.sqrt(sy);
  }
  const lift = h * 205;
  ctx.fillStyle = `rgba(70, 50, 30, ${0.3 * (1 - 0.6 * h)})`;
  ctx.beginPath();
  ctx.ellipse(0, -2, 40 * (1 - 0.45 * h), 6 * (1 - 0.45 * h), 0, 0, TAU);
  ctx.fill();
  ctx.save();
  ctx.translate(0, -lift);
  ctx.scale(sx, sy);
  const shade = ctx.createRadialGradient(-10, -r - 12, 4, 0, -r, r);
  shade.addColorStop(0, "#e9876d");
  shade.addColorStop(0.55, "#c2412b");
  shade.addColorStop(1, "#8f2a1b");
  wash(ctx, () => ctx.arc(0, -r, r, 0, TAU), shade, INK);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 3.2;
  ctx.beginPath();
  ctx.arc(0, -r, r, 0, TAU);
  ctx.stroke();
  // A band round the ball, so it can be seen to turn as it goes.
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.ellipse(0, -r, r, r * 0.34, p * TAU * 0.5, 0, TAU);
  ctx.stroke();
  ctx.restore();
};

// A runner, side on, a stride for each leg in the loop. Each leg swings from the hip, its knee
// folding as it comes through and straightening to land; the arms swing against the legs. He
// faces left, the way thirteen pictures to twelve slits carry him.
const runner: Draw = (ctx, p) => {
  ctx.scale(-1, 1);
  const thigh = 56;
  const shin = 58;
  const upper = 40;
  const fore = 38;
  const lean = 0.2;
  const leg = (q: number) => {
    const th = 0.64 * Math.sin(TAU * q);
    const swing = Math.max(0, Math.cos(TAU * (q + 0.06)));
    const kn = 0.22 + 1.6 * swing ** 1.4;
    const knee: [number, number] = [thigh * Math.sin(th), thigh * Math.cos(th)];
    const foot: [number, number] = [
      knee[0] + shin * Math.sin(th - kn),
      knee[1] + shin * Math.cos(th - kn),
    ];
    const toe: [number, number] = [
      foot[0] + 16 * Math.cos(th - kn * 0.4),
      foot[1] - 2 + 16 * Math.sin(-(th - kn) * 0.3),
    ];
    return { knee, foot, toe };
  };
  const near = leg(p);
  const far = leg(p + 0.5);
  const low = Math.max(near.foot[1], far.foot[1]);
  const hip: [number, number] = [
    0,
    -low - 6 - 6 * Math.max(0, Math.cos(TAU * 2 * p)),
  ];
  const shoulder: [number, number] = [
    hip[0] + Math.sin(lean) * 66,
    hip[1] - Math.cos(lean) * 66,
  ];
  const arm = (q: number) => {
    const ua = -0.85 * Math.sin(TAU * q);
    const elbow: [number, number] = [
      shoulder[0] + upper * Math.sin(ua),
      shoulder[1] + upper * Math.cos(ua),
    ];
    const fa = ua + 1.7;
    const hand: [number, number] = [
      elbow[0] + fore * Math.sin(fa),
      elbow[1] + fore * Math.cos(fa),
    ];
    return { elbow, hand };
  };
  const limb = (
    l: ReturnType<typeof leg>,
    a: ReturnType<typeof arm>,
    color: string,
  ) => {
    line(
      ctx,
      [
        hip,
        [hip[0] + l.knee[0], hip[1] + l.knee[1]],
        [hip[0] + l.foot[0], hip[1] + l.foot[1]],
        [hip[0] + l.toe[0], hip[1] + l.toe[1]],
      ],
      15,
      color,
    );
    line(ctx, [shoulder, a.elbow, a.hand], 11, color);
  };
  // The shadow on the ground under him.
  ctx.fillStyle = "rgba(70, 50, 30, 0.22)";
  ctx.beginPath();
  ctx.ellipse(4, -2, 46, 5, 0, 0, TAU);
  ctx.fill();
  limb(far, arm(p), "#4a3c30");
  line(ctx, [hip, shoulder], 27, INK);
  line(ctx, [hip, shoulder], 19, "#b03b27");
  limb(near, arm(p + 0.5), INK);
  // Shorts over the hips, then the head.
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.arc(hip[0], hip[1], 13, 0, TAU);
  ctx.fill();
  const head: [number, number] = [
    shoulder[0] + Math.sin(lean) * 24 + 3,
    shoulder[1] - Math.cos(lean) * 24,
  ];
  wash(ctx, () => ctx.arc(head[0], head[1], 14, 0, TAU), "#e3b48d", INK);
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(head[0], head[1], 14, 0, TAU);
  ctx.stroke();
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.arc(head[0] - 2, head[1] - 4, 14, Math.PI * 0.95, Math.PI * 1.95);
  ctx.fill();
};

// A gull coming towards you, seen from a little above: the arm of each wing beats and the hand
// follows it a moment late, so the tips flick at the turn; the body rises on the downstroke.
const gull: Draw = (ctx, p) => {
  const a = 0.78 * Math.sin(TAU * p);
  const b = a + 0.6 * Math.sin(TAU * p - 1.1);
  const by = -150 + 12 * Math.sin(TAU * p + 1.2);
  // The sea, which doesn't move.
  ctx.strokeStyle = "rgba(40, 70, 100, 0.55)";
  ctx.lineWidth = 2;
  for (let i = 0; i < 3; i++) {
    const y = -6 - i * 10;
    ctx.beginPath();
    for (let x = -170; x <= 170; x += 4) {
      const yy = y + 2.5 * Math.sin(x * 0.08 + i * 2);
      if (x === -170) ctx.moveTo(x, yy);
      else ctx.lineTo(x, yy);
    }
    ctx.stroke();
  }
  for (const side of [-1, 1]) {
    const sh: [number, number] = [side * 12, by - 4];
    const el: [number, number] = [
      sh[0] + side * 62 * Math.cos(a),
      sh[1] - 62 * Math.sin(a),
    ];
    const tip: [number, number] = [
      el[0] + side * 80 * Math.cos(b),
      el[1] - 80 * Math.sin(b),
    ];
    // The wing's back edge, a little behind the bones (up the page from above).
    const back = (pt: [number, number], k: number): [number, number] => [
      pt[0] - side * 4 * k,
      pt[1] + 20 * k,
    ];
    const outline = () => {
      ctx.moveTo(sh[0], sh[1] - 4);
      ctx.quadraticCurveTo(
        (sh[0] + el[0]) / 2,
        (sh[1] + el[1]) / 2 - 8,
        el[0],
        el[1] - 3,
      );
      ctx.lineTo(tip[0], tip[1]);
      const e = back(el, 1);
      const s = back(sh, 1.3);
      ctx.quadraticCurveTo(
        (tip[0] + e[0]) / 2,
        (tip[1] + e[1]) / 2 + 6,
        e[0],
        e[1],
      );
      ctx.lineTo(s[0], s[1]);
      ctx.closePath();
    };
    wash(ctx, outline, "#c9cdcc", INK);
    // Black tips.
    ctx.save();
    ctx.beginPath();
    outline();
    ctx.clip();
    ctx.fillStyle = INK;
    const k = 0.62;
    ctx.beginPath();
    ctx.arc(
      el[0] + (tip[0] - el[0]) * 1.05,
      el[1] + (tip[1] - el[1]) * 1.05,
      80 * (1 - k) + 13,
      0,
      TAU,
    );
    ctx.fill();
    ctx.restore();
    ctx.lineWidth = 2.6;
    ctx.strokeStyle = INK;
    ctx.beginPath();
    outline();
    ctx.stroke();
  }
  wash(ctx, () => ctx.ellipse(0, by + 6, 15, 26, 0, 0, TAU), "#f1efe6", INK);
  wash(ctx, () => ctx.arc(0, by - 22, 12, 0, TAU), "#f4f2ea", INK);
  ctx.fillStyle = "#d9a62e";
  ctx.beginPath();
  ctx.moveTo(-4, by - 18);
  ctx.lineTo(4, by - 18);
  ctx.lineTo(0, by - 6);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.arc(-5, by - 25, 1.8, 0, TAU);
  ctx.arc(5, by - 25, 1.8, 0, TAU);
  ctx.fill();
};

// A juggler keeping three balls up in a cascade. Each hand throws from inside and catches
// outside, a throw every beat between them, and a ball is in the air for a little over two
// beats; six beats bring every ball back to where it started.
const juggler: Draw = (ctx, p) => {
  const t = p * 6;
  const hy = -122;
  const inner = 28;
  const outer = 88;
  const high = 150;
  const flight = 2.3;
  const scoop = (s: number, side: number): [number, number] => [
    side * (outer - (outer - inner) * s),
    hy + 20 * Math.sin(Math.PI * s),
  ];
  const ballAt = (tb: number): [number, number] => {
    const b = ((tb % 6) + 6) % 6;
    if (b < flight) {
      const s = b / flight;
      return [-inner + (outer + inner) * s, hy - 4 * high * s * (1 - s)];
    }
    if (b < 3) return scoop((b - flight) / (3 - flight), 1);
    if (b < 3 + flight) {
      const s = (b - 3) / flight;
      return [inner - (outer + inner) * s, hy - 4 * high * s * (1 - s)];
    }
    return scoop((b - 3 - flight) / (3 - flight), -1);
  };
  const hand = (tau: number, side: number): [number, number] => {
    const c = ((tau % 2) + 2) % 2;
    if (c < 2 - (3 - flight)) {
      const s = c / (2 - (3 - flight));
      return [
        side * (inner + (outer - inner) * s),
        hy - 10 * Math.sin(Math.PI * s),
      ];
    }
    return scoop((c - (2 - (3 - flight))) / (3 - flight), side);
  };
  const left = hand(t, -1);
  const right = hand(t - 1, 1);
  // Legs apart in striped stockings, a tunic, and a tall hat.
  ctx.fillStyle = "rgba(70, 50, 30, 0.2)";
  ctx.beginPath();
  ctx.ellipse(0, -2, 56, 5, 0, 0, TAU);
  ctx.fill();
  for (const side of [-1, 1]) {
    line(
      ctx,
      [
        [side * 12, -74],
        [side * 22, -36],
        [side * 30, -4],
      ],
      14,
      INK,
    );
    line(
      ctx,
      [
        [side * 12, -74],
        [side * 22, -36],
        [side * 30, -4],
      ],
      9,
      "#b03b27",
    );
    line(
      ctx,
      [
        [side * 30, -4],
        [side * 44, -3],
      ],
      9,
      INK,
    );
  }
  const shoulders: [number, number][] = [
    [-22, -150],
    [22, -150],
  ];
  wash(
    ctx,
    () => {
      ctx.moveTo(-24, -154);
      ctx.lineTo(24, -154);
      ctx.lineTo(30, -70);
      ctx.lineTo(-30, -70);
      ctx.closePath();
    },
    "#3f6a96",
    INK,
  );
  ctx.lineWidth = 2.6;
  ctx.strokeStyle = INK;
  ctx.beginPath();
  ctx.moveTo(-24, -154);
  ctx.lineTo(24, -154);
  ctx.lineTo(30, -70);
  ctx.lineTo(-30, -70);
  ctx.closePath();
  ctx.stroke();
  // Diamonds down the tunic.
  ctx.fillStyle = "#d9a62e";
  for (let i = 0; i < 3; i++) {
    const y = -138 + i * 24;
    ctx.beginPath();
    ctx.moveTo(0, y - 9);
    ctx.lineTo(7, y);
    ctx.lineTo(0, y + 9);
    ctx.lineTo(-7, y);
    ctx.closePath();
    ctx.fill();
  }
  // Arms reach for the hands: two bones each, the elbows out to the sides.
  const reach = (s: [number, number], h: [number, number], side: number) => {
    const a = 42;
    const b = 42;
    const dx = h[0] - s[0];
    const dy = h[1] - s[1];
    const d = Math.min(Math.hypot(dx, dy), a + b - 0.5);
    const base = Math.atan2(dy, dx);
    const off = Math.acos((a * a + d * d - b * b) / (2 * a * d));
    const ang = base + (side < 0 ? off : -off);
    const elbow: [number, number] = [
      s[0] + a * Math.cos(ang),
      s[1] + a * Math.sin(ang),
    ];
    line(ctx, [s, elbow, h], 12, INK);
    line(ctx, [s, elbow], 7, "#3f6a96");
  };
  reach(shoulders[0], left, -1);
  reach(shoulders[1], right, 1);
  wash(ctx, () => ctx.arc(0, -172, 15, 0, TAU), "#e3b48d", INK);
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(0, -172, 15, 0, TAU);
  ctx.stroke();
  wash(
    ctx,
    () => {
      ctx.moveTo(-15, -182);
      ctx.lineTo(15, -182);
      ctx.lineTo(3, -232);
      ctx.closePath();
    },
    "#b03b27",
    INK,
  );
  ctx.fillStyle = "#f1efe6";
  ctx.beginPath();
  ctx.arc(3, -234, 6, 0, TAU);
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.stroke();
  const colours = ["#c2412b", "#d9a62e", "#3f6a96"];
  [ballAt(t), ballAt(t + 2), ballAt(t - 2)].forEach(([x, y], i) => {
    wash(ctx, () => ctx.arc(x, y - 10, 11, 0, TAU), colours[i], INK);
    ctx.lineWidth = 2.6;
    ctx.strokeStyle = INK;
    ctx.beginPath();
    ctx.arc(x, y - 10, 11, 0, TAU);
    ctx.stroke();
  });
};

const DRAWINGS: Record<Exclude<StripId, "own">, Draw> = {
  ball,
  runner,
  gull,
  juggler,
};

// Draws a whole strip of n pictures into ctx. Your own strip takes its pictures from frames,
// one canvas per picture, drawn at the twelve-picture width.
export function drawStrip(
  ctx: CanvasRenderingContext2D,
  id: StripId,
  n: number,
  frames: (HTMLCanvasElement | OffscreenCanvas)[] = [],
) {
  const w = STRIP_TEXELS;
  const h = STRIP_ROWS;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, w, h);
  paper(ctx, w, h);
  const fw = w / n;
  const scale = Math.min(1, fw / FRAME_WIDTH);
  // The ground the figures stand on runs the whole way round.
  if (id === "ball" || id === "runner" || id === "juggler") {
    ctx.fillStyle = INK;
    ctx.globalAlpha = 0.75;
    ctx.fillRect(0, GROUND, w, 2);
    ctx.globalAlpha = 1;
  }
  for (let k = 0; k < n; k++) {
    const cx = (k + 0.5) * fw;
    ctx.save();
    ctx.beginPath();
    ctx.rect(k * fw, 16, fw, h - 32);
    ctx.clip();
    if (id === "own") {
      // Faint pencil marks for where each picture goes.
      ctx.fillStyle = "rgba(90, 90, 110, 0.35)";
      ctx.fillRect(k * fw, h - 30, 1, 12);
      ctx.font = "15px Georgia, serif";
      ctx.textAlign = "center";
      ctx.fillText(String(k + 1), cx, h - 20);
      const frame = frames[k];
      if (frame) {
        ctx.drawImage(
          frame,
          cx - frame.width / 2,
          0,
          frame.width,
          frame.height,
        );
      }
    } else {
      ctx.translate(cx, GROUND);
      ctx.scale(scale, scale);
      DRAWINGS[id](ctx, k / n);
    }
    ctx.restore();
  }
  // The printer's title along the foot of the first picture.
  const entry = STRIPS.find((s) => s.value === id);
  if (entry?.title) {
    ctx.fillStyle = INK;
    ctx.globalAlpha = 0.7;
    ctx.font = "italic 15px Georgia, serif";
    ctx.textAlign = "left";
    ctx.fillText(
      `No. ${STRIPS.indexOf(entry) + 1} · ${entry.title} · ${n} pictures`,
      22,
      h - 20,
    );
    ctx.globalAlpha = 1;
  }
  // The join: one end lapped over the other and glued, a slightly darker band with an edge.
  ctx.fillStyle = "rgba(120, 90, 50, 0.16)";
  ctx.fillRect(0, 0, 12, h);
  ctx.fillStyle = "rgba(60, 40, 20, 0.35)";
  ctx.fillRect(12, 0, 1.5, h);
  ctx.restore();
}
