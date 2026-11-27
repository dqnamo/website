// A telephone dial seen from above, on a 2D canvas. The finger wheel turns over a fixed number
// plate: pull a hole round to the finger stop and let go, and a spring winds the wheel home
// while a governor holds it to a steady speed, ten pulses a second as standard. On the way home
// a cam on the wheel opens the line's contacts once for every hole's width it passes, so the
// digit isn't read from the hole at all, it's counted from the return: let go early and it
// sends fewer pulses. The first 30° of every pull is lost motion, which sends nothing, so
// there's always a pause between one digit's pulses and the next.
//
// The light is fixed above left. Whatever doesn't change as the wheel turns is painted once:
// the case and the well the dial sits in, the plate and its figures, the card in the middle and
// the finger stop. Each frame only the wheel is drawn between them, and its sheen is fixed to
// the light rather than to the wheel, so a chrome wheel's highlight stays put as it turns. The
// wheel throws a shadow into each of its holes.

import { THIS_NUMBER } from "./exchange";

export type Body = "black" | "ivory" | "red" | "green";
export type Finish = "clear" | "chrome";

export type DialSettings = {
  body: Body;
  finish: Finish;
  // Pulses a second, the speed the governor holds the return to.
  speed: number;
  // The share of each pulse the line spends broken, 0–1.
  ratio: number;
};

export type Train = {
  pulses: number;
  // Seconds from release when the line breaks and makes again for each pulse.
  events: { at: number; made: boolean }[];
  // Seconds from release until the wheel is home.
  home: number;
  speed: number;
};

type Point = { x: number; y: number };
type Mode = "rest" | "pulling" | "auto" | "returning" | "settling";

export const BODIES: Record<
  Body,
  { case: string; plate: string; card: string; gloss: number }
> = {
  black: { case: "#1d1c1b", plate: "#f4f1e9", card: "#f1e7cd", gloss: 0.15 },
  ivory: { case: "#e2d6bb", plate: "#fbf8ef", card: "#f3e9cf", gloss: 0.42 },
  red: { case: "#b0232a", plate: "#f6f2ea", card: "#f2e8ce", gloss: 0.24 },
  green: { case: "#5d7b5b", plate: "#f5f2ea", card: "#f2e8ce", gloss: 0.24 },
};

const INK = "#1c1a18";
const RED = "#ad2a2c";
const CARD_INK = "#26303f";

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
// Angles run clockwise from three o'clock, as the canvas has them. The finger stop sits at
// four o'clock, the holes are 30° apart, and 1 sits two holes' widths short of the stop: one
// width of lost motion, and one pulse.
const STOP = 30 * DEG;
const STEP = 30 * DEG;
const LOST = 30 * DEG;
// Sizes as fractions of the finger wheel's radius.
const HOLE_AT = 0.735;
const HOLE = 0.148;
const CARD = 0.405;
const BEZEL = 0.035;
const PLATE = 1.035;
const WELL = 1.14;
// How far the dial reaches, finger stop and all, for fitting it to the stage.
const EXTENT = 1.19;
// The spring takes the wheel up to the governor's speed in this long.
const SPIN_UP = 0.03;
// The ratchet's teeth, one tick each as the wheel is wound.
const NOTCH = 7 * DEG;
const BOUNCE = 1.6 * DEG;
// Keyboard dialling holds at the stop for a moment, then waits a moment before the next digit.
const HOLD = 0.12;
const GAP = 0.18;

const DIGITS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"];
const LETTERS = [
  "",
  "ABC",
  "DEF",
  "GHI",
  "JKL",
  "MN",
  "PRS",
  "TUV",
  "WXY",
  "O",
];

// The light comes from above left; this points towards it.
const LIGHT = { x: -0.6, y: -0.8 };

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function wrap(angle: number) {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

function rgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mix(hex: string, toward: string, t: number) {
  const a = rgb(hex);
  const b = rgb(toward);
  const channel = (i: number) => Math.round(a[i] + (b[i] - a[i]) * t);
  return `rgb(${channel(0)} ${channel(1)} ${channel(2)})`;
}

// Hole i dials DIGITS[i], which is i + 1 pulses; at rest it sits that many widths, plus the
// lost motion, short of the stop.
function restAngle(i: number) {
  return STOP - LOST - (i + 1) * STEP;
}

function travel(i: number) {
  return LOST + (i + 1) * STEP;
}

function easeInOut(t: number) {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

// How far the wheel has come back t seconds after it was let go, and the reverse: it spins
// up over SPIN_UP, then runs at the governor's speed.
function distanceAt(t: number, omega: number) {
  return t <= SPIN_UP
    ? (omega * t * t) / (2 * SPIN_UP)
    : (omega * SPIN_UP) / 2 + omega * (t - SPIN_UP);
}

function timeAt(distance: number, omega: number) {
  const ramp = (omega * SPIN_UP) / 2;
  return distance <= ramp
    ? Math.sqrt((2 * distance * SPIN_UP) / omega)
    : SPIN_UP + (distance - ramp) / omega;
}

// The pulses a wheel let go at `from` will send. The cam opens the contacts once in every
// STEP above the lost motion, centred in it, for `ratio` of it.
export function planTrain(from: number, speed: number, ratio: number): Train {
  const omega = speed * STEP;
  const pulses = clamp(Math.floor((from - LOST) / STEP + 0.5), 0, 10);
  const events: Train["events"] = [];
  for (let k = pulses - 1; k >= 0; k--) {
    const centre = LOST + (k + 0.5) * STEP;
    const opens = Math.min(from, centre + (ratio * STEP) / 2);
    const closes = centre - (ratio * STEP) / 2;
    events.push(
      { at: timeAt(from - opens, omega), made: false },
      { at: timeAt(from - closes, omega), made: true },
    );
  }
  return { pulses, events, home: timeAt(from, omega), speed };
}

export function createDial(
  canvas: HTMLCanvasElement,
  {
    onGrab,
    onRelease,
    onRatchet,
    onStop,
  }: {
    onGrab?: () => void;
    onRelease?: (train: Train) => void;
    onRatchet?: () => void;
    onStop?: () => void;
  } = {},
) {
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas 2D is not available.");
  const ctx = context;

  // The parts that don't move, under and over the wheel, and the wheel's own surface.
  const layers = {
    base: document.createElement("canvas"),
    disc: document.createElement("canvas"),
    top: document.createElement("canvas"),
  };
  const base = layers.base.getContext("2d");
  const disc = layers.disc.getContext("2d");
  const top = layers.top.getContext("2d");
  if (!base || !disc || !top) throw new Error("Canvas 2D is not available.");

  let settings: DialSettings = {
    body: "black",
    finish: "clear",
    speed: 10,
    ratio: 2 / 3,
  };
  let width = 1;
  let height = 1;
  let dpr = 1;
  let cx = 0;
  let cy = 0;
  let R = 100;

  let mode: Mode = "rest";
  let angle = 0;
  let target = 0;
  let active = -1;
  let pointer = 0;
  let notch = 0;
  let atStop = false;
  let from = 0;
  let omega = 0;
  let home = 0;
  let since = 0;
  let autoLength = 0;
  const queue: number[] = [];

  let clock = 0;
  let last = 0;
  let frame = 0;
  let running = false;

  function font() {
    return getComputedStyle(canvas).fontFamily || "system-ui, sans-serif";
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    width = Math.max(1, rect.width);
    height = Math.max(1, rect.height);
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(width * dpr));
    const h = Math.max(1, Math.round(height * dpr));
    for (const layer of [canvas, layers.base, layers.disc, layers.top]) {
      layer.width = w;
      layer.height = h;
    }
    // Room at the top for the readout, and a margin all round.
    const head = clamp(height * 0.11, 44, 64);
    R = clamp(
      Math.min(
        (width - 20) / (2 * EXTENT),
        (height - head - 16) / (2 * EXTENT),
      ),
      40,
      300,
    );
    cx = width / 2;
    cy = head + (height - head) / 2;
    paint();
    draw(true);
  }
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);

  // Shadows aren't scaled by the canvas transform, so they're given in device pixels.
  function shadow(
    c: CanvasRenderingContext2D,
    color: string,
    blur: number,
    x: number,
    y: number,
  ) {
    const k = (R / 200) * dpr;
    c.shadowColor = color;
    c.shadowBlur = blur * k;
    c.shadowOffsetX = x * k;
    c.shadowOffsetY = y * k;
  }

  function circle(
    c: CanvasRenderingContext2D,
    x: number,
    y: number,
    r: number,
  ) {
    c.beginPath();
    c.arc(x, y, r, 0, TAU);
  }

  // A gradient across a circle from the side facing the light to the side facing away.
  function across(
    c: CanvasRenderingContext2D,
    x: number,
    y: number,
    r: number,
    stops: [number, string][],
  ) {
    const gradient = c.createLinearGradient(
      x + LIGHT.x * r,
      y + LIGHT.y * r,
      x - LIGHT.x * r,
      y - LIGHT.y * r,
    );
    for (const [at, color] of stops) gradient.addColorStop(at, color);
    return gradient;
  }

  function reset(c: CanvasRenderingContext2D) {
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, c.canvas.width, c.canvas.height);
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function paint() {
    paintBase();
    paintDisc();
    paintTop();
  }

  // The case, the well the dial sits down in, and the number plate.
  function paintBase() {
    const c = base as CanvasRenderingContext2D;
    reset(c);
    const body = BODIES[settings.body];

    c.fillStyle = body.case;
    c.fillRect(0, 0, width, height);
    const reach = Math.max(width, height);
    const gloss = c.createRadialGradient(
      width * 0.18,
      -height * 0.05,
      0,
      width * 0.18,
      -height * 0.05,
      reach * 1.05,
    );
    gloss.addColorStop(0, `rgb(255 255 255 / ${body.gloss})`);
    gloss.addColorStop(0.6, "rgb(255 255 255 / 0)");
    c.fillStyle = gloss;
    c.fillRect(0, 0, width, height);
    const fall = c.createRadialGradient(cx, cy, R * 1.2, cx, cy, reach * 0.85);
    fall.addColorStop(0, "rgb(0 0 0 / 0)");
    fall.addColorStop(1, "rgb(0 0 0 / 0.28)");
    c.fillStyle = fall;
    c.fillRect(0, 0, width, height);

    // The well: its floor in shade, darkest under the wall nearest the light.
    const well = WELL * R;
    circle(c, cx, cy, well);
    c.fillStyle = mix(body.case, "#000000", 0.3);
    c.fill();
    c.save();
    circle(c, cx, cy, well);
    c.clip();
    shadow(c, "rgb(0 0 0 / 0.6)", 12, 4, 6);
    c.beginPath();
    c.arc(cx, cy, well + 60, 0, TAU);
    c.arc(cx, cy, well, 0, TAU, true);
    c.fill();
    c.restore();
    // The case rolls over into the well: its edge catches the light nearest it, and the wall
    // inside catches it on the far side.
    c.lineWidth = Math.max(1, R * 0.012);
    circle(c, cx, cy, well + c.lineWidth / 2);
    c.strokeStyle = across(c, cx, cy, well, [
      [0, "rgb(255 255 255 / 0.4)"],
      [0.5, "rgb(255 255 255 / 0.04)"],
      [1, "rgb(0 0 0 / 0.25)"],
    ]);
    c.stroke();
    c.lineWidth = Math.max(1, R * 0.008);
    circle(c, cx, cy, well - c.lineWidth / 2);
    c.strokeStyle = across(c, cx, cy, well, [
      [0, "rgb(0 0 0 / 0.3)"],
      [0.6, "rgb(255 255 255 / 0)"],
      [1, "rgb(255 255 255 / 0.3)"],
    ]);
    c.stroke();

    // The plate, standing a little proud of the floor.
    const plate = PLATE * R;
    c.save();
    shadow(c, "rgb(0 0 0 / 0.45)", 6, 1.5, 2.5);
    circle(c, cx, cy, plate);
    c.fillStyle = body.plate;
    c.fill();
    c.restore();
    const plateShade = c.createRadialGradient(
      cx - plate * 0.35,
      cy - plate * 0.4,
      0,
      cx,
      cy,
      plate,
    );
    plateShade.addColorStop(0, "rgb(255 255 255 / 0.4)");
    plateShade.addColorStop(1, "rgb(0 0 0 / 0.07)");
    circle(c, cx, cy, plate);
    c.fillStyle = plateShade;
    c.fill();

    // Figures and letters, printed upright where each hole rests.
    c.textAlign = "center";
    c.textBaseline = "middle";
    const family = font();
    for (let i = 0; i < 10; i++) {
      const a = restAngle(i);
      const x = cx + Math.cos(a) * HOLE_AT * R;
      const y = cy + Math.sin(a) * HOLE_AT * R;
      if (LETTERS[i]) {
        c.font = `600 ${R * 0.052}px ${family}`;
        c.fillStyle = RED;
        if ("letterSpacing" in c) c.letterSpacing = `${R * 0.006}px`;
        c.fillText(LETTERS[i], x, y - R * 0.064);
        if ("letterSpacing" in c) c.letterSpacing = "0px";
      }
      c.font = `600 ${R * 0.15}px ${family}`;
      c.fillStyle = INK;
      c.fillText(DIGITS[i], x, y + (LETTERS[i] ? R * 0.026 : 0));
    }

    // The wheel's edge throws a shadow onto the rim of the plate.
    c.save();
    c.beginPath();
    c.arc(cx, cy, plate, 0, TAU);
    c.arc(cx, cy, R, 0, TAU, true);
    c.clip();
    shadow(
      c,
      settings.finish === "chrome" ? "rgb(0 0 0 / 0.5)" : "rgb(0 0 0 / 0.18)",
      5,
      2,
      3,
    );
    circle(c, cx, cy, R);
    c.fillStyle = "#000";
    c.fill();
    c.restore();
  }

  // The wheel's surface without its holes. Nothing on it changes as it turns: clear acrylic
  // shows the light's reflection, and chrome is spun round and round, so its sheen is a fan
  // towards the light and away from it, whichever way the wheel is facing.
  function paintDisc() {
    const c = disc as CanvasRenderingContext2D;
    reset(c);
    const r = R;
    if (settings.finish === "chrome") {
      const fan = c.createConicGradient(Math.atan2(LIGHT.y, LIGHT.x), cx, cy);
      const stops: [number, string][] = [
        [0, "#f6f7f8"],
        [0.07, "#d3d7db"],
        [0.25, "#7b8188"],
        [0.43, "#c2c7cc"],
        [0.5, "#eef0f2"],
        [0.57, "#c2c7cc"],
        [0.75, "#6d737a"],
        [0.93, "#d3d7db"],
        [1, "#f6f7f8"],
      ];
      for (const [at, color] of stops) fan.addColorStop(at, color);
      circle(c, cx, cy, r);
      c.fillStyle = fan;
      c.fill();
      // Fine rings from the spinning, the same all the way round.
      let seed = 11;
      const random = () => {
        seed = (seed * 16807) % 2147483647;
        return seed / 2147483647;
      };
      c.lineWidth = 0.6;
      for (let ring = CARD * r; ring < r; ring += 0.8) {
        const light = random() > 0.5;
        c.strokeStyle = light
          ? `rgb(255 255 255 / ${0.04 + random() * 0.08})`
          : `rgb(0 0 0 / ${0.03 + random() * 0.06})`;
        circle(c, cx, cy, ring);
        c.stroke();
      }
    } else {
      circle(c, cx, cy, r);
      c.fillStyle = "rgb(255 255 255 / 0.12)";
      c.fill();
      const band = c.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
      band.addColorStop(0, "rgb(255 255 255 / 0)");
      band.addColorStop(0.2, "rgb(255 255 255 / 0.3)");
      band.addColorStop(0.32, "rgb(255 255 255 / 0.06)");
      band.addColorStop(0.64, "rgb(255 255 255 / 0)");
      band.addColorStop(0.8, "rgb(255 255 255 / 0.12)");
      band.addColorStop(1, "rgb(255 255 255 / 0)");
      c.fillStyle = band;
      c.fill();
      c.fillStyle = "rgb(40 36 30 / 0.04)";
      c.fill();
    }
    c.lineWidth = r * 0.016;
    circle(c, cx, cy, r - c.lineWidth / 2);
    c.strokeStyle = across(c, cx, cy, r, [
      [0, "rgb(255 255 255 / 0.85)"],
      [0.5, "rgb(255 255 255 / 0.12)"],
      [1, "rgb(0 0 0 / 0.35)"],
    ]);
    c.stroke();
  }

  // The card in the middle under its clear cover, and the finger stop.
  function paintTop() {
    const c = top as CanvasRenderingContext2D;
    reset(c);
    const body = BODIES[settings.body];
    const card = CARD * R;
    const ring = card + BEZEL * R;

    c.save();
    shadow(c, "rgb(0 0 0 / 0.4)", 7, 2, 3);
    circle(c, cx, cy, ring);
    c.fillStyle = "#9a9ea3";
    c.fill();
    c.restore();
    circle(c, cx, cy, ring);
    c.fillStyle = across(c, cx, cy, ring, [
      [0, "#fbfcfc"],
      [0.35, "#c3c8cd"],
      [0.7, "#80868d"],
      [1, "#5f656c"],
    ]);
    c.fill();

    circle(c, cx, cy, card);
    c.fillStyle = body.card;
    c.fill();
    c.save();
    circle(c, cx, cy, card);
    c.clip();
    // The ring holds the card down, so it's in shade just inside the edge nearest the light.
    shadow(c, "rgb(0 0 0 / 0.35)", 5, 1.2, 2);
    c.beginPath();
    c.arc(cx, cy, card + 30, 0, TAU);
    c.arc(cx, cy, card, 0, TAU, true);
    c.fill();
    c.restore();

    const family = font();
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillStyle = RED;
    c.font = `600 ${R * 0.04}px ${family}`;
    if ("letterSpacing" in c) c.letterSpacing = `${R * 0.008}px`;
    c.fillText("TELEPHONE", cx, cy - R * 0.17);
    if ("letterSpacing" in c) c.letterSpacing = "0px";
    c.fillRect(
      cx - R * 0.24,
      cy - R * 0.115,
      R * 0.48,
      Math.max(0.75, R * 0.004),
    );
    c.fillRect(
      cx - R * 0.24,
      cy + R * 0.105,
      R * 0.48,
      Math.max(0.75, R * 0.004),
    );
    c.fillStyle = CARD_INK;
    c.font = `600 ${R * 0.082}px ${family}`;
    c.fillText(THIS_NUMBER, cx, cy - R * 0.004);
    c.font = `500 ${R * 0.04}px ${family}`;
    c.fillText("Speaking clock 123", cx, cy + R * 0.165);

    // The cover's glare.
    c.save();
    circle(c, cx, cy, card);
    c.clip();
    const glare = c.createRadialGradient(
      cx - card * 0.5,
      cy - card * 0.6,
      0,
      cx - card * 0.3,
      cy - card * 0.35,
      card * 1.15,
    );
    glare.addColorStop(0, "rgb(255 255 255 / 0.6)");
    glare.addColorStop(0.28, "rgb(255 255 255 / 0.12)");
    glare.addColorStop(0.6, "rgb(255 255 255 / 0)");
    c.fillStyle = glare;
    c.fillRect(cx - card, cy - card, card * 2, card * 2);
    c.lineWidth = R * 0.014;
    c.strokeStyle = "rgb(255 255 255 / 0.4)";
    c.lineCap = "round";
    c.beginPath();
    c.arc(cx, cy, card * 0.88, Math.PI * 1.05, Math.PI * 1.42);
    c.stroke();
    c.restore();

    paintStop(c);
  }

  // A curved finger of chrome screwed down beyond the well and reaching in over the wheel,
  // just clockwise of where a hole comes to rest, its tip turned in a little to cup the finger.
  function paintStop(c: CanvasRenderingContext2D) {
    const edge = Math.asin(HOLE / HOLE_AT);
    const a = STOP + edge + 3.6 * DEG;
    const polar = (r: number, at: number) => ({
      x: cx + Math.cos(at) * r * R,
      y: cy + Math.sin(at) * r * R,
    });
    const root = polar(1.12, a + 0.6 * DEG);
    const bend = polar(0.84, a + 0.4 * DEG);
    const tip = polar(0.645, a - 1.6 * DEG);
    const length = Math.hypot(tip.x - root.x, tip.y - root.y);
    const u = { x: (tip.x - root.x) / length, y: (tip.y - root.y) / length };
    // Across the bar, pointing to whichever side faces the light.
    let n = { x: -u.y, y: u.x };
    if (n.x * LIGHT.x + n.y * LIGHT.y < 0) n = { x: -n.x, y: -n.y };
    const wide = R * 0.042;
    const trace = (dx = 0, dy = 0) => {
      c.beginPath();
      c.moveTo(root.x + dx, root.y + dy);
      c.quadraticCurveTo(bend.x + dx, bend.y + dy, tip.x + dx, tip.y + dy);
    };

    c.lineCap = "round";
    c.lineWidth = wide * 2;
    c.save();
    shadow(c, "rgb(0 0 0 / 0.5)", 6, 3.5, 5);
    c.strokeStyle = "#777";
    trace();
    c.stroke();
    c.restore();
    const metal = c.createLinearGradient(
      root.x + n.x * wide,
      root.y + n.y * wide,
      root.x - n.x * wide,
      root.y - n.y * wide,
    );
    metal.addColorStop(0, "#b9bfc5");
    metal.addColorStop(0.2, "#f4f6f7");
    metal.addColorStop(0.45, "#aab0b6");
    metal.addColorStop(0.8, "#5d636a");
    metal.addColorStop(1, "#43484e");
    c.strokeStyle = metal;
    trace();
    c.stroke();
    // A bright line where the curve of the metal faces the light.
    c.lineWidth = Math.max(0.75, R * 0.007);
    c.strokeStyle = "rgb(255 255 255 / 0.85)";
    trace(n.x * wide * 0.5, n.y * wide * 0.5);
    c.stroke();

    // The screw that holds it.
    const screw = R * 0.042;
    c.save();
    shadow(c, "rgb(0 0 0 / 0.45)", 3, 1, 1.5);
    circle(c, root.x, root.y, screw);
    c.fillStyle = "#8d9399";
    c.fill();
    c.restore();
    circle(c, root.x, root.y, screw);
    const dome = c.createRadialGradient(
      root.x + LIGHT.x * screw * 0.45,
      root.y + LIGHT.y * screw * 0.45,
      0,
      root.x,
      root.y,
      screw,
    );
    dome.addColorStop(0, "#ffffff");
    dome.addColorStop(0.45, "#b7bcc2");
    dome.addColorStop(1, "#5c6269");
    c.fillStyle = dome;
    c.fill();
    c.save();
    c.translate(root.x, root.y);
    c.rotate(0.5);
    c.fillStyle = "rgb(30 32 36 / 0.7)";
    c.fillRect(-screw * 0.75, -screw * 0.11, screw * 1.5, screw * 0.22);
    c.restore();
  }

  function holeCentre(i: number, turn: number): Point {
    const a = restAngle(i) + turn;
    return {
      x: cx + Math.cos(a) * HOLE_AT * R,
      y: cy + Math.sin(a) * HOLE_AT * R,
    };
  }

  function drawWheel(c: CanvasRenderingContext2D) {
    const chrome = settings.finish === "chrome";
    const r = HOLE * R;
    const holes = DIGITS.map((_, i) => holeCentre(i, angle));

    // Inside each hole, the wheel's shadow on the plate below, on the side nearest the light.
    for (const hole of holes) {
      c.save();
      circle(c, hole.x, hole.y, r);
      c.clip();
      shadow(
        c,
        chrome ? "rgb(0 0 0 / 0.55)" : "rgb(0 0 0 / 0.22)",
        chrome ? 5 : 4,
        2,
        3,
      );
      c.beginPath();
      c.arc(hole.x, hole.y, r + 40, 0, TAU);
      c.arc(hole.x, hole.y, r, 0, TAU, true);
      c.fillStyle = "#000";
      c.fill();
      c.restore();
    }

    const wheel = new Path2D();
    wheel.arc(cx, cy, R, 0, TAU);
    for (const hole of holes) {
      wheel.moveTo(hole.x + r, hole.y);
      wheel.arc(hole.x, hole.y, r, 0, TAU);
    }
    c.save();
    c.clip(wheel, "evenodd");
    c.drawImage(layers.disc, 0, 0, width, height);
    c.restore();

    // Each hole's wall: in shade on the side nearest the light, lit on the far side.
    c.lineWidth = R * (chrome ? 0.02 : 0.024);
    for (const hole of holes) {
      circle(c, hole.x, hole.y, r - c.lineWidth / 2);
      c.strokeStyle = across(
        c,
        hole.x,
        hole.y,
        r,
        chrome
          ? [
              [0, "rgb(20 22 26 / 0.75)"],
              [0.5, "rgb(40 44 50 / 0.35)"],
              [1, "rgb(255 255 255 / 0.95)"],
            ]
          : [
              [0, "rgb(0 0 0 / 0.28)"],
              [0.5, "rgb(255 255 255 / 0.1)"],
              [1, "rgb(255 255 255 / 0.85)"],
            ],
      );
      c.stroke();
    }
  }

  // The dial covers a square; only that much is redrawn as the wheel turns.
  function draw(full = false) {
    const w = canvas.width;
    const h = canvas.height;
    let x0 = 0;
    let y0 = 0;
    let x1 = w;
    let y1 = h;
    if (!full) {
      const reach = EXTENT * R + 8;
      x0 = clamp(Math.floor((cx - reach) * dpr), 0, w);
      y0 = clamp(Math.floor((cy - reach) * dpr), 0, h);
      x1 = clamp(Math.ceil((cx + reach) * dpr), 0, w);
      y1 = clamp(Math.ceil((cy + reach) * dpr), 0, h);
    }
    const bw = x1 - x0;
    const bh = y1 - y0;
    if (bw <= 0 || bh <= 0) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(x0, y0, bw, bh);
    ctx.drawImage(layers.base, x0, y0, bw, bh, x0, y0, bw, bh);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x0, y0, bw, bh);
    ctx.clip();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawWheel(ctx);
    ctx.restore();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(layers.top, x0, y0, bw, bh, x0, y0, bw, bh);
  }

  function letGo() {
    mode = "returning";
    from = angle;
    omega = settings.speed * STEP;
    since = clock;
    const train = planTrain(from, settings.speed, settings.ratio);
    home = train.home;
    onRelease?.(train);
  }

  function pull(i: number) {
    active = i;
    target = angle;
    notch = Math.floor(angle / NOTCH);
    atStop = false;
    onGrab?.();
  }

  function update(dt: number) {
    if (mode === "auto") {
      const t = clock - since;
      target = travel(active) * easeInOut(Math.min(1, t / autoLength));
      if (t >= autoLength + HOLD) letGo();
    }
    if (mode === "pulling" || mode === "auto") {
      angle += (target - angle) * (1 - Math.exp(-dt * 45));
      const tooth = Math.floor(angle / NOTCH);
      if (tooth > notch) onRatchet?.();
      notch = tooth;
      const end = travel(active);
      if (angle > end - 0.5 * DEG) {
        if (!atStop) onStop?.();
        atStop = true;
      } else if (angle < end - 3 * DEG) {
        atStop = false;
      }
    } else if (mode === "returning") {
      const t = clock - since;
      if (t >= home) {
        angle = 0;
        mode = "settling";
        since = clock;
      } else {
        angle = from - distanceAt(t, omega);
      }
    } else if (mode === "settling") {
      // It knocks against its rest and rebounds a hair, unless motion is unwelcome.
      const t = clock - since;
      const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (still || t > 0.24) {
        angle = 0;
        mode = "rest";
        since = clock;
      } else {
        angle =
          BOUNCE *
          Math.abs(Math.sin((t * Math.PI) / 0.07)) *
          Math.exp(-t / 0.05);
      }
    } else if (queue.length && clock - since > GAP) {
      const digit = queue.shift() as number;
      const i = digit === 0 ? 9 : digit - 1;
      mode = "auto";
      since = clock;
      autoLength = 0.16 + (travel(i) / TAU) * 0.5;
      pull(i);
    }
  }

  function tick(now: number) {
    // A long gap (a hidden tab, a busy main thread) resumes rather than leaps.
    const dt = Math.min((now - last) / 1000, 1 / 20);
    last = now;
    clock += dt;
    update(dt);
    draw();
    if (mode !== "rest" || queue.length) {
      frame = requestAnimationFrame(tick);
    } else {
      running = false;
    }
  }

  function start() {
    if (running) return;
    running = true;
    last = performance.now();
    frame = requestAnimationFrame(tick);
  }

  function local(point: Point) {
    return { x: point.x - cx, y: point.y - cy };
  }

  function holeAt(point: Point) {
    const reach = HOLE * R * 1.1;
    for (let i = 0; i < 10; i++) {
      const hole = holeCentre(i, angle);
      if (Math.hypot(point.x - hole.x, point.y - hole.y) < reach) return i;
    }
    return -1;
  }

  resize();
  // Figures are drawn in the page's typeface, which may still be on its way.
  document.fonts?.ready.then(() => {
    paint();
    draw(true);
  });

  return {
    // Whether a press here takes hold of a hole; the wheel has to be home first.
    canGrab(point: Point) {
      return (mode === "rest" || mode === "settling") && holeAt(point) >= 0;
    },
    grab(point: Point) {
      if (mode !== "rest" && mode !== "settling") return false;
      const i = holeAt(point);
      if (i < 0) return false;
      queue.length = 0;
      mode = "pulling";
      const p = local(point);
      pointer = Math.atan2(p.y, p.x);
      pull(i);
      start();
      return true;
    },
    // The wheel follows the finger round, clockwise from rest as far as the stop and no
    // further. Near the middle the angle means little, so it's ignored there.
    drag(point: Point) {
      if (mode !== "pulling") return;
      const p = local(point);
      const a = Math.atan2(p.y, p.x);
      if (Math.hypot(p.x, p.y) > R * 0.2) {
        target = clamp(target + wrap(a - pointer), 0, travel(active));
      }
      pointer = a;
      start();
    },
    release() {
      if (mode === "pulling") {
        letGo();
        start();
      }
    },
    // Dials a digit as a finger would, after any already waiting.
    dial(digit: number) {
      if (queue.length < 24) queue.push(digit);
      start();
    },
    setSettings(next: DialSettings) {
      const repaint =
        next.body !== settings.body || next.finish !== settings.finish;
      settings = next;
      if (repaint) {
        paint();
        draw(true);
      }
    },
    dispose() {
      cancelAnimationFrame(frame);
      running = false;
      observer.disconnect();
    },
  };
}

export type Dial = ReturnType<typeof createDial>;
