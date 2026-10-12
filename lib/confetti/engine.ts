// Confetti on a 2D canvas. Every piece is a flat shape tumbling in 3D: drawn through the top of
// its rotation matrix, so it narrows to a sliver as it turns edge-on, and lit by a light above
// left, so foil catches it as it turns. Each piece moves with two velocities: the throw, which
// air soaks up in a fraction of a second, and the drift, which gravity, air and wind steer. Air
// pushes on a piece along its face, so one lying flat floats, one falling edge-first drops, and
// as it tumbles the push swings side to side, which is what makes paper flutter as it falls.
// Streamers are ribbons that trail their head's path, twisting along their length.

export type Pattern = "burst" | "cannons" | "fountain" | "rain";
export type Shape =
  | "strip"
  | "square"
  | "circle"
  | "triangle"
  | "star"
  | "streamer";
export type Finish = "paper" | "foil" | "holo";

export type ConfettiSettings = {
  pattern: Pattern;
  // Pieces per fire; the continuous patterns spread them over their run.
  amount: number;
  // Degrees either side of the aim, in total.
  spread: number;
  // 0–100 for these, with 50 as the natural setting where that applies.
  power: number;
  gravity: number;
  air: number;
  // −100 (blowing left) to 100 (blowing right).
  wind: number;
  gusts: number;
  tumble: number;
  // Piece size in CSS pixels.
  size: number;
  shapes: Shape[];
  // Any CSS colour, or a custom property name such as "--gray-12", read when a piece is made so
  // it follows the theme.
  colors: string[];
  finish: Finish;
};

export type ConfettiStats = { pieces: number; fps: number | null };

type Point = { x: number; y: number };

type Piece = {
  streamer: boolean;
  path: number;
  x: number;
  y: number;
  // The throw, which decays, and the drift, which falls.
  lx: number;
  ly: number;
  dx: number;
  dy: number;
  w: number;
  h: number;
  // Tumbling about a fixed axis, while the shape turns in its own plane.
  ax: number;
  ay: number;
  az: number;
  theta: number;
  omega: number;
  beta: number;
  omegaB: number;
  // A side-to-side sway on top, as paper rocks on the air beneath it.
  sway: number;
  swayRate: number;
  swayReach: number;
  // The rotation as last computed: the 2×2 that draws the face, and the face's normal.
  m00: number;
  m01: number;
  m10: number;
  m11: number;
  nx: number;
  ny: number;
  nz: number;
  color: number;
  hue: number;
  age: number;
  life: number;
  // Streamers only: the trail, oldest point first, and how the ribbon twists along it.
  tx: number[];
  ty: number[];
  laid: number;
  spacing: number;
  points: number;
  width: number;
  twist: number;
  twistSpeed: number;
};

const MAX_PIECES = 2600;
const FADE = 0.9;
const TAU = Math.PI * 2;
const DEG = Math.PI / 180;

// The light sits above left and in front; H is halfway between it and the eye, for highlights.
const LIGHT = normalize3(-0.4, -0.65, 0.65);
const HALF = normalize3(LIGHT[0], LIGHT[1], LIGHT[2] + 1);

// Drag at the natural air setting, on a stage 760px tall: a piece lying flat falls at
// about 70px/s, one falling edge-first at about 380px/s.
const G = 900;
const FALL_FLAT = 70;
const FALL_EDGE = 380;

function normalize3(x: number, y: number, z: number): [number, number, number] {
  const length = Math.hypot(x, y, z) || 1;
  return [x / length, y / length, z / length];
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

// Shapes are drawn in a unit box and scaled per piece: strips are long, the rest about square.
function makePaths() {
  const rect = new Path2D();
  rect.rect(-0.5, -0.5, 1, 1);
  const circle = new Path2D();
  circle.arc(0, 0, 0.5, 0, TAU);
  const triangle = new Path2D();
  triangle.moveTo(0, -0.56);
  triangle.lineTo(0.5, 0.31);
  triangle.lineTo(-0.5, 0.31);
  triangle.closePath();
  const star = new Path2D();
  for (let i = 0; i < 10; i++) {
    const radius = i % 2 ? 0.21 : 0.52;
    const angle = (i / 10) * TAU - Math.PI / 2;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    if (i) star.lineTo(x, y);
    else star.moveTo(x, y);
  }
  star.closePath();
  return { rect, circle, triangle, star };
}

const SHAPES: Record<
  Exclude<Shape, "streamer">,
  { path: "rect" | "circle" | "triangle" | "star"; w: number; h: number }
> = {
  strip: { path: "rect", w: 0.48, h: 1.15 },
  square: { path: "rect", w: 0.78, h: 0.78 },
  circle: { path: "circle", w: 0.82, h: 0.82 },
  triangle: { path: "triangle", w: 0.98, h: 0.98 },
  star: { path: "star", w: 1.2, h: 1.2 },
};
const PATH_ORDER = ["rect", "circle", "triangle", "star"] as const;

// Shade along t: 0 is the colour in shadow, 1 the colour itself, 2 washed out to white. Each
// colour keeps a ramp of these, so a frame looks colours up rather than writing them.
const LEVELS = 64;
function shade(r: number, g: number, b: number, t: number) {
  if (t < 1) {
    const k = 0.3 + 0.7 * t;
    return `rgb(${(r * k) | 0} ${(g * k) | 0} ${(b * k) | 0})`;
  }
  const k = (t - 1) * 0.92;
  return `rgb(${(r + (255 - r) * k) | 0} ${(g + (255 - g) * k) | 0} ${(b + (255 - b) * k) | 0})`;
}

function shadeRamp(r: number, g: number, b: number) {
  return Array.from({ length: LEVELS }, (_, i) =>
    shade(r, g, b, (i / (LEVELS - 1)) * 2),
  );
}

// Holographic film doesn't show the whole rainbow: it runs through icy cyans, violets and pinks,
// with flashes of pale gold and mint. This loops through those, by angle.
const HOLO_STOPS: [number, number, number][] = [
  [126, 236, 255],
  [143, 176, 255],
  [190, 150, 255],
  [255, 150, 214],
  [255, 222, 160],
  [160, 250, 205],
];

function holoAt(hue: number): [number, number, number] {
  const position = (hue / 360) * HOLO_STOPS.length;
  const i = Math.floor(position) % HOLO_STOPS.length;
  const t = position - Math.floor(position);
  const a = HOLO_STOPS[i];
  const b = HOLO_STOPS[(i + 1) % HOLO_STOPS.length];
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}

const HOLO_HUES = 24;
const HOLO_LEVELS = 20;
const HOLO_MIX = 0.72;

export function createConfetti(
  canvas: HTMLCanvasElement,
  { onStats }: { onStats?: (stats: ConfettiStats) => void } = {},
) {
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas 2D is not available.");
  const ctx = context;
  const paths = makePaths();
  const pathList = PATH_ORDER.map((name) => paths[name]);

  // Colours are parsed by a 1×1 canvas, so anything CSS understands works, P3 included.
  const probe = document.createElement("canvas");
  probe.width = probe.height = 1;
  const probeContext = probe.getContext("2d", { willReadFrequently: true });
  const colorIds = new Map<string, number>();
  const rgb: [number, number, number][] = [];
  const ramps: string[][] = [];
  const holoCache = new Map<number, string>();
  const film = Array.from({ length: HOLO_HUES }, (_, i) =>
    holoAt((i / HOLO_HUES) * 360),
  );

  function colorId(css: string) {
    const known = colorIds.get(css);
    if (known !== undefined) return known;
    let value: [number, number, number] = [128, 128, 128];
    if (probeContext) {
      probeContext.clearRect(0, 0, 1, 1);
      probeContext.fillStyle = "#808080";
      probeContext.fillStyle = css;
      probeContext.fillRect(0, 0, 1, 1);
      const [r, g, b] = probeContext.getImageData(0, 0, 1, 1).data;
      value = [r, g, b];
    }
    const id = rgb.length;
    rgb.push(value);
    ramps.push(shadeRamp(...value));
    colorIds.set(css, id);
    return id;
  }

  function holoColor(color: number, hue: number, t: number) {
    const h =
      ((Math.round(hue / (360 / HOLO_HUES)) % HOLO_HUES) + HOLO_HUES) %
      HOLO_HUES;
    const level = Math.round(clamp(t, 0, 2) * ((HOLO_LEVELS - 1) / 2));
    const key = (color * HOLO_HUES + h) * HOLO_LEVELS + level;
    let css = holoCache.get(key);
    if (!css) {
      const [br, bg, bb] = rgb[color];
      const [rr, rg, rb] = film[h];
      css = shade(
        br + (rr - br) * HOLO_MIX,
        bg + (rg - bg) * HOLO_MIX,
        bb + (rb - bb) * HOLO_MIX,
        (level / (HOLO_LEVELS - 1)) * 2,
      );
      holoCache.set(key, css);
    }
    return css;
  }

  let settings: ConfettiSettings | null = null;
  const pieces: Piece[] = [];
  let width = 0;
  let height = 0;
  let dpr = 1;
  // How tall the stage is against a 760px one, so a throw climbs the same share of any stage.
  let scale = 1;
  let running = false;
  let frame = 0;
  let last = 0;
  let frames = 0;
  let windowStart = 0;
  let fps: number | null = null;
  let lastReport = 0;

  function resize() {
    const rect = canvas.getBoundingClientRect();
    width = rect.width;
    height = rect.height;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
    scale = clamp(height / 760, 0.55, 1.6);
    if (!running) draw();
  }
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  resize();

  // Continuous patterns run as emitters; a few things wait for a moment before firing.
  type Emitter = {
    pattern: "fountain" | "rain";
    rate: number;
    until: number;
    owed: number;
  };
  const emitters: Emitter[] = [];
  const pending: { at: number; run: () => void }[] = [];
  let looping = false;
  let nextLoop = 0;
  let clock = 0;

  // The palette is read afresh now and then rather than every frame, so a theme switch is
  // picked up by the next pieces without a style lookup per frame.
  let paletteIds: number[] = [];
  let paletteFor: string[] | null = null;
  let paletteAt = 0;
  function palette() {
    const list = settings?.colors.length ? settings.colors : ["#888"];
    const now = performance.now();
    if (list === paletteFor && now - paletteAt < 500) return paletteIds;
    const style = getComputedStyle(canvas);
    paletteIds = list.map((color) =>
      colorId(
        color.startsWith("--")
          ? style.getPropertyValue(color).trim() || "#888"
          : color,
      ),
    );
    paletteFor = list;
    paletteAt = now;
    return paletteIds;
  }

  function pickShape(shapes: Shape[]) {
    // Streamers are long, so they come up less often than the pieces they fly among.
    let total = 0;
    for (const shape of shapes) total += shape === "streamer" ? 0.22 : 1;
    let pick = Math.random() * total;
    for (const shape of shapes) {
      pick -= shape === "streamer" ? 0.22 : 1;
      if (pick <= 0) return shape;
    }
    return shapes[shapes.length - 1];
  }

  function spawn(
    x: number,
    y: number,
    angle: number,
    speed: number,
    colors: number[],
    drift: Point = { x: 0, y: 0 },
  ) {
    if (!settings || pieces.length >= MAX_PIECES) return;
    const shapes = settings.shapes.length
      ? settings.shapes
      : ["strip" as const];
    const shape = pickShape(shapes);
    const streamer = shape === "streamer";
    const size =
      settings.size * Math.sqrt(scale) * (0.72 + Math.random() * 0.56);
    const spec = streamer ? SHAPES.strip : SHAPES[shape];

    // Tumble about an axis near the screen's plane and closer to level than upright, so pieces
    // flip face-on and edge-on and most spend some of each turn lying flat on the air.
    const around = (Math.random() - 0.5) * 100 * DEG;
    const [ax, ay, az] = normalize3(
      Math.cos(around),
      Math.sin(around),
      (Math.random() - 0.5) * 0.8,
    );
    const throwSpeed = streamer ? speed * 0.8 : speed;
    const spacing = 3.5 * Math.sqrt(scale);
    const length = settings.size * Math.sqrt(scale) * (9 + Math.random() * 7);
    pieces.push({
      streamer,
      path: PATH_ORDER.indexOf(spec.path),
      x,
      y,
      lx: Math.cos(angle) * throwSpeed,
      ly: Math.sin(angle) * throwSpeed,
      dx: drift.x,
      dy: drift.y,
      w: size * spec.w,
      h: size * spec.h,
      ax,
      ay,
      az,
      theta: Math.random() * TAU,
      omega: (4 + Math.random() * 8) * (Math.random() < 0.5 ? -1 : 1),
      beta: Math.random() * TAU,
      omegaB: (Math.random() - 0.5) * 4,
      sway: Math.random() * TAU,
      swayRate: 2.2 + Math.random() * 2.6,
      swayReach: (6 + Math.random() * 12) * scale,
      m00: 1,
      m01: 0,
      m10: 0,
      m11: 1,
      nx: 0,
      ny: 0,
      nz: 1,
      color: colors[(Math.random() * colors.length) | 0],
      // Holographic pieces take their colour from how they face, so this only nudges it.
      hue: (Math.random() - 0.5) * 60,
      age: 0,
      life: 9 + Math.random() * 5,
      tx: streamer ? [x] : [],
      ty: streamer ? [y] : [],
      laid: 0,
      spacing,
      points: Math.max(6, Math.round(length / spacing)),
      width: settings.size * Math.sqrt(scale) * 0.42,
      twist: Math.random() * TAU,
      twistSpeed: (1.5 + Math.random() * 2.5) * (Math.random() < 0.5 ? -1 : 1),
    });
  }

  function speedFor(power: number) {
    return (350 + 26 * power) * scale;
  }

  // Angles spread with a soft centre, or evenly all the way round once the spread is a ring.
  function aim(center: number, spread: number) {
    if (spread >= 300) return center + (Math.random() - 0.5) * spread * DEG;
    const t = (Math.random() + Math.random()) / 2 - 0.5;
    return center + t * spread * DEG;
  }

  function burst(
    origin: Point,
    count: number,
    center: number,
    colors: number[],
  ) {
    if (!settings) return;
    const ring = settings.spread >= 300;
    const v = speedFor(settings.power);
    for (let i = 0; i < count; i++) {
      const jitter = Math.random() * 6;
      const turn = Math.random() * TAU;
      const speed = ring
        ? v * (0.25 + 0.75 * Math.sqrt(Math.random()))
        : v * (0.35 + 0.65 * Math.random());
      spawn(
        origin.x + Math.cos(turn) * jitter,
        origin.y + Math.sin(turn) * jitter,
        aim(center, settings.spread),
        speed,
        colors,
      );
    }
  }

  function rainOne(colors: number[]) {
    if (!settings) return;
    const wind = (settings.wind / 100) * 260 * scale;
    // Fall in from upwind when it's blowing, so the far side gets its share.
    const reach = clamp(Math.abs(wind) * 1.6, 0, width * 0.6);
    const x = -(wind > 0 ? reach : 0) + Math.random() * (width + reach);
    spawn(x, -20 - Math.random() * 30, Math.PI / 2, 0, colors, {
      x: wind * 0.5,
      y: 60 * scale + Math.random() * 80 * scale,
    });
  }

  function fountainOne(colors: number[]) {
    if (!settings) return;
    const v = speedFor(settings.power);
    spawn(
      width / 2 + (Math.random() - 0.5) * 10,
      height + 8,
      aim(-Math.PI / 2, settings.spread),
      v * (0.72 + 0.28 * Math.random()),
      colors,
    );
  }

  function fire(origin?: Point) {
    if (!settings) return;
    // The observer reports on the next rendered frame, which a hidden page may not have yet.
    if (!width) resize();
    if (!width) return;
    const colors = palette();
    const amount = Math.round(settings.amount);
    switch (settings.pattern) {
      case "burst":
        burst(
          origin ?? { x: width / 2, y: height / 2 },
          amount,
          -Math.PI / 2,
          colors,
        );
        break;
      case "cannons": {
        const half = Math.ceil(amount / 2);
        burst({ x: -6, y: height + 6 }, half, -62 * DEG, colors);
        // The right cannon a beat later, which reads as two pops rather than one.
        pending.push({
          at: clock + 0.09,
          run: () =>
            burst({ x: width + 6, y: height + 6 }, half, -118 * DEG, palette()),
        });
        break;
      }
      case "fountain":
        emitters.push({
          pattern: "fountain",
          rate: amount / 1.3,
          until: clock + 1.3,
          owed: 0,
        });
        break;
      case "rain":
        emitters.push({
          pattern: "rain",
          rate: amount / 2.6,
          until: clock + 2.6,
          owed: 0,
        });
        break;
    }
    start();
  }

  // Looping keeps a continuous pattern running, and repeats a burst at a new spot each time.
  function loopTick() {
    if (!settings || !looping || clock < nextLoop) return;
    const { pattern } = settings;
    if (pattern === "fountain" || pattern === "rain") {
      const live = emitters.find(
        (e) => e.pattern === pattern && e.until === Infinity,
      );
      if (!live) {
        emitters.push({
          pattern,
          rate: settings.amount / (pattern === "rain" ? 2.6 : 1.3),
          until: Infinity,
          owed: 0,
        });
      } else {
        live.rate = settings.amount / (pattern === "rain" ? 2.6 : 1.3);
      }
      // A pattern switched away from stops pouring.
      for (const emitter of emitters) {
        if (emitter.until === Infinity && emitter.pattern !== pattern)
          emitter.until = clock;
      }
      nextLoop = clock + 0.25;
      return;
    }
    for (const emitter of emitters)
      if (emitter.until === Infinity) emitter.until = clock;
    if (pattern === "burst") {
      fire({
        x: width * (0.2 + Math.random() * 0.6),
        y: height * (0.35 + Math.random() * 0.4),
      });
      nextLoop = clock + 1.25;
    } else {
      fire();
      nextLoop = clock + 2.4;
    }
  }

  // Gusts are a slow field of crossing waves, swelling and easing as a whole.
  function gust(x: number, y: number, t: number, out: Point) {
    const unit = 760 * scale;
    const X = x / unit;
    const Y = y / unit;
    const swell = 0.65 + 0.35 * Math.sin(t * 0.37);
    out.x =
      swell *
      (Math.sin(X * 5.1 + t * 0.9) * Math.cos(Y * 3.7 - t * 0.6) +
        0.55 * Math.sin(X * 11.3 - t * 1.7 + Y * 7.1));
    out.y =
      swell *
      0.45 *
      Math.cos(X * 4.3 - t * 0.7 + 1.3) *
      Math.sin(Y * 6.1 + t * 1.1);
  }

  const air: Point = { x: 0, y: 0 };

  function step(dt: number) {
    if (!settings) return;
    clock += dt;

    for (let i = pending.length - 1; i >= 0; i--) {
      if (pending[i].at <= clock) {
        const [job] = pending.splice(i, 1);
        job.run();
      }
    }
    loopTick();
    if (emitters.length) {
      const colors = palette();
      for (let i = emitters.length - 1; i >= 0; i--) {
        const emitter = emitters[i];
        emitter.owed += emitter.rate * dt;
        while (emitter.owed >= 1) {
          emitter.owed -= 1;
          if (emitter.pattern === "rain") rainOne(colors);
          else fountainOne(colors);
        }
        if (clock >= emitter.until) emitters.splice(i, 1);
      }
    }

    const g = (settings.gravity / 50) * G * scale;
    const airK = 2 ** ((settings.air - 50) / 25);
    const skin = (airK * G) / FALL_EDGE;
    const plate = airK * (G / FALL_FLAT - G / FALL_EDGE);
    const settle = Math.exp(-dt / (0.42 / Math.sqrt(airK)));
    const windX = (settings.wind / 100) * 260 * scale;
    const gustAmp = (settings.gusts / 100) * 220 * scale;
    const tumble = settings.tumble / 50;

    for (let i = pieces.length - 1; i >= 0; i--) {
      const p = pieces[i];
      p.age += dt;

      p.lx *= settle;
      p.ly *= settle;
      gust(p.x, p.y, clock, air);
      const wx = windX + air.x * gustAmp;
      const wy = air.y * gustAmp;

      // Pieces whirl faster while they're still flying from the throw.
      const thrown = Math.hypot(p.lx, p.ly);
      p.theta += p.omega * tumble * (1 + thrown / 900) * dt;
      p.beta += p.omegaB * tumble * dt;
      p.sway += p.swayRate * dt;
      rotate(p);

      // Drift: gravity, then air relative to the wind, pushing along the face and, lightly,
      // against all motion. Both are solved implicitly, so strong air can't overshoot.
      p.dy += g * dt;
      let rx = p.dx - wx;
      let ry = p.dy - wy;
      const reach = p.nx * p.nx + p.ny * p.ny;
      if (reach > 1e-6) {
        const m = Math.sqrt(reach);
        const ux = p.nx / m;
        const uy = p.ny / m;
        const along = rx * ux + ry * uy;
        const k = p.streamer ? plate * 1.5 : plate;
        const change = along / (1 + k * reach * dt) - along;
        rx += change * ux;
        ry += change * uy;
      }
      const damp = 1 / (1 + (p.streamer ? skin * 1.6 : skin) * dt);
      p.dx = rx * damp + wx;
      p.dy = ry * damp + wy;

      // The sway fades in as the throw dies away.
      const sway =
        p.swayReach *
        p.swayRate *
        Math.cos(p.sway) *
        tumble *
        Math.exp(-thrown / 300);
      p.x += (p.lx + p.dx + sway) * dt;
      p.y += (p.ly + p.dy) * dt;

      if (p.streamer) {
        lay(p);
        // The tail is carried a little by the wind and settles as it hangs.
        const drift = 0.3 * dt;
        for (let j = 0; j < p.tx.length; j++) {
          p.tx[j] += wx * drift;
          p.ty[j] += 14 * scale * dt;
        }
        p.twist += p.twistSpeed * tumble * dt;
      }

      const margin = 460;
      let gone = p.age > p.life || p.x < -margin || p.x > width + margin;
      if (!gone) {
        if (p.streamer) {
          let top = p.y;
          for (const ty of p.ty) top = Math.min(top, ty);
          gone = top > height + 12;
        } else {
          gone = p.y - Math.max(p.w, p.h) > height + 4;
        }
      }
      if (gone) {
        pieces[i] = pieces[pieces.length - 1];
        pieces.pop();
      }
    }
  }

  // A streamer lays a point every few pixels its head travels, and drops its oldest past its length.
  function lay(p: Piece) {
    let lastX = p.tx[p.tx.length - 1];
    let lastY = p.ty[p.ty.length - 1];
    let ddx = p.x - lastX;
    let ddy = p.y - lastY;
    let distance = Math.hypot(ddx, ddy);
    while (distance >= p.spacing) {
      lastX += (ddx / distance) * p.spacing;
      lastY += (ddy / distance) * p.spacing;
      p.tx.push(lastX);
      p.ty.push(lastY);
      p.laid++;
      ddx = p.x - lastX;
      ddy = p.y - lastY;
      distance = Math.hypot(ddx, ddy);
    }
    const extra = p.tx.length - p.points;
    if (extra > 0) {
      p.tx.splice(0, extra);
      p.ty.splice(0, extra);
    }
  }

  function rotate(p: Piece) {
    const c = Math.cos(p.theta);
    const s = Math.sin(p.theta);
    const C = 1 - c;
    const { ax, ay, az } = p;
    const r00 = c + ax * ax * C;
    const r01 = ax * ay * C - az * s;
    const r02 = ax * az * C + ay * s;
    const r10 = ay * ax * C + az * s;
    const r11 = c + ay * ay * C;
    const r12 = ay * az * C - ax * s;
    const r22 = c + az * az * C;
    // The shape's own turn comes first, within its plane, so it leaves the normal alone.
    const cb = Math.cos(p.beta);
    const sb = Math.sin(p.beta);
    p.m00 = r00 * cb + r01 * sb;
    p.m01 = r01 * cb - r00 * sb;
    p.m10 = r10 * cb + r11 * sb;
    p.m11 = r11 * cb - r10 * sb;
    p.nx = r02;
    p.ny = r12;
    p.nz = r22;
  }

  function fillFor(
    p: Piece,
    nx: number,
    ny: number,
    nz: number,
    back: boolean,
  ) {
    const finish = settings?.finish ?? "paper";
    const diffuse = Math.max(0, nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]);
    const facing = Math.max(0, nx * HALF[0] + ny * HALF[1] + nz * HALF[2]);
    if (finish === "paper") {
      const sheen = facing ** 8 * 0.1;
      const t = 0.56 + 0.44 * diffuse - (back ? 0.07 : 0) + sheen;
      return ramps[p.color][Math.round(clamp(t, 0, 2) * ((LEVELS - 1) / 2))];
    }
    const spec = facing ** 18 + 0.35 * facing ** 4;
    if (finish === "foil") {
      const t = 0.24 + 0.6 * diffuse + 1.0 * spec;
      return ramps[p.color][Math.round(clamp(t, 0, 2) * ((LEVELS - 1) / 2))];
    }
    // Holographic: the colour slides through the film's as the face turns, so pieces turned the
    // same way share a colour, as they would under one light.
    const hue = 200 + p.hue + nx * 240 + ny * 180;
    return holoColor(p.color, hue, 0.62 + 0.4 * diffuse + 0.7 * spec);
  }

  function draw() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const p of pieces) {
      const alpha = clamp((p.life - p.age) / FADE, 0, 1);
      if (alpha <= 0) continue;
      ctx.globalAlpha = alpha;
      if (p.streamer) {
        drawStreamer(p);
        continue;
      }
      // Two-sided: whichever side faces us is the one lit.
      const back = p.nz < 0;
      const sign = back ? -1 : 1;
      ctx.fillStyle = fillFor(p, p.nx * sign, p.ny * sign, p.nz * sign, back);
      ctx.setTransform(
        p.m00 * p.w * dpr,
        p.m10 * p.w * dpr,
        p.m01 * p.h * dpr,
        p.m11 * p.h * dpr,
        p.x * dpr,
        p.y * dpr,
      );
      ctx.fill(pathList[p.path]);
    }
    ctx.globalAlpha = 1;
  }

  // The ribbon is drawn a segment at a time. Its width runs along the twist, crossing through
  // zero where it turns over, and each segment is lit by how squarely it faces us.
  const sideX: number[] = [];
  const sideY: number[] = [];
  function drawStreamer(p: Piece) {
    const xs = p.tx;
    const ys = p.ty;
    const count = xs.length + 1;
    if (count < 3) return;
    const at = (j: number, ofX: boolean) =>
      j < xs.length ? (ofX ? xs[j] : ys[j]) : ofX ? p.x : p.y;
    const first = p.laid - (xs.length - 1);
    for (let j = 0; j < count; j++) {
      const a = Math.max(0, j - 1);
      const b = Math.min(count - 1, j + 1);
      let tx = at(b, true) - at(a, true);
      let ty = at(b, false) - at(a, false);
      const length = Math.hypot(tx, ty) || 1;
      tx /= length;
      ty /= length;
      const half = (p.width / 2) * Math.cos(p.twist + (first + j) * 0.42);
      sideX[j] = -ty * half;
      sideY[j] = tx * half;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (let j = 0; j < count - 1; j++) {
      const turn = Math.cos(p.twist + (first + j + 0.5) * 0.42);
      const x0 = at(j, true);
      const y0 = at(j, false);
      const x1 = at(j + 1, true);
      const y1 = at(j + 1, false);
      // A normal from the twist: square on where the ribbon is widest, leaning one way then the
      // other through each turn, so it catches the light in turn.
      const face = Math.abs(turn);
      const lean = Math.sin(p.twist + (first + j + 0.5) * 0.42);
      ctx.fillStyle = fillFor(p, lean * -0.55, lean * -0.75, face, turn < 0);
      ctx.beginPath();
      ctx.moveTo(x0 + sideX[j], y0 + sideY[j]);
      ctx.lineTo(x1 + sideX[j + 1], y1 + sideY[j + 1]);
      ctx.lineTo(x1 - sideX[j + 1], y1 - sideY[j + 1]);
      ctx.lineTo(x0 - sideX[j], y0 - sideY[j]);
      ctx.closePath();
      ctx.fill();
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  function report(now: number, force = false) {
    if (!force && now - lastReport < 250) return;
    lastReport = now;
    onStats?.({ pieces: pieces.length, fps });
  }

  function tick(now: number) {
    // A long gap (a hidden tab, a busy main thread) resumes rather than leaps.
    const dt = Math.min((now - last) / 1000, 1 / 30);
    last = now;
    step(dt);
    draw();

    frames++;
    if (now - windowStart >= 500) {
      fps = Math.round((frames * 1000) / (now - windowStart));
      frames = 0;
      windowStart = now;
    }
    report(now);

    if (pieces.length || emitters.length || pending.length || looping) {
      frame = requestAnimationFrame(tick);
    } else {
      running = false;
      fps = null;
      draw();
      report(now, true);
    }
  }

  function start() {
    if (running) return;
    running = true;
    last = performance.now();
    windowStart = last;
    frames = 0;
    frame = requestAnimationFrame(tick);
  }

  return {
    fire,
    setSettings(next: ConfettiSettings) {
      settings = next;
    },
    setLoop(on: boolean) {
      looping = on;
      if (on) {
        nextLoop = clock;
        start();
      } else {
        for (const emitter of emitters)
          if (emitter.until === Infinity) emitter.until = clock;
      }
    },
    clear() {
      pieces.length = 0;
      emitters.length = 0;
      pending.length = 0;
      if (!running) {
        draw();
        report(performance.now(), true);
      }
    },
    dispose() {
      cancelAnimationFrame(frame);
      running = false;
      observer.disconnect();
    },
  };
}

export type Confetti = ReturnType<typeof createConfetti>;
