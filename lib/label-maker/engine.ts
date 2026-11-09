// A handheld tape embosser on a desk, seen from straight above on a 2D canvas, laid out in
// millimetres from the centre of its dial. The dial carries the type round its rim: turn it until
// the letter you want sits under the pointer, squeeze the handle, and the punch drives that
// letter up through the tape into the die. Let the handle come back and a pawl pulls the tape on
// by one letter, the same for every character. The tape comes out of the nose to the left, so
// the word reads the right way round as it grows.
//
// The guillotine sits four letters in front of the punch. So the last few letters are still in
// the head when you finish a word: cut straight away and the blade goes through them, and what's
// left starts the next label. You feed blanks until the word is clear, and every label starts
// with a long blank lead that people trim off with scissors. Squeeze again before the handle has
// come all the way back and the pawl never resets, so the next letter lands on the last one; turn
// the dial while you squeeze and the punch catches the edges of two letters.
//
// Cut labels fall to the desk with their backing on. Peel it and they stick down, but a label
// embossed right to its ends has its face stretched, so in a while the ends begin to lift. Warm
// air relaxes the vinyl: the white crazes close, the letters slowly sink, a lifted end lies down,
// and anything not stuck down gets blown across the desk.

import { type ClickKind, createVoice } from "./sound";
import {
  createPiece,
  drawGlyph,
  emboss,
  HALF,
  type Light,
  PITCH,
  type Piece,
  RES,
  relax,
  relief,
  remainder,
  ROWS,
  SWATCHES,
  setGlyphFont,
  shade,
  slicePiece,
  type Stroke,
  TAPE_WIDTH,
  TAPES,
  type TapeKind,
} from "./tape";

export type { TapeKind } from "./tape";
export { SWATCHES } from "./tape";

export type Surface = "desk" | "fridge" | "toolbox";

export type LabelMakerSettings = {
  tape: TapeKind;
  surface: Surface;
  sound: boolean;
  hotAir: boolean;
};

export const DEFAULT_SETTINGS: LabelMakerSettings = {
  tape: "red",
  surface: "desk",
  sound: true,
  hotAir: false,
};

export type LabelMakerStats = {
  letters: number;
  // Metres left on the reel.
  reel: number;
  labels: number;
  queued: number;
  fps: number | null;
};

// The wheel, in order round the rim. The first place is blank: squeezing on it feeds a space.
export const WHEEL = [
  " ",
  ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  ..."0123456789",
  ..."&-.,'!?/+:",
  "★",
  "♥",
];
const N = WHEEL.length;
const STEP = (Math.PI * 2) / N;

// Characters typed that the wheel can stand in for.
const ALIASES: Record<string, string> = {
  "*": "★",
  "’": "'",
  "‘": "'",
  "–": "-",
  "—": "-",
};

// --- The embosser, in millimetres from the dial's centre ------------------------------------

const DIAL_R = 28;
const KNURL_R = 25.4;
const CHAR_R = 21.2;
const HUB_R = 8.4;
const HEAD_R = 32;
// The tape runs straight across the top of the head, through the punch at x = 0.
const TAPE_Y = -34.4;
const CUT_GAP = 4 * PITCH;
const CUTTER_X = -CUT_GAP;
const NOSE_X = CUTTER_X - 4.2;
const NOSE = { x: NOSE_X, y: TAPE_Y - 7.8, w: 15 - NOSE_X, h: 13.8 };
const WINDOW = {
  x: CUTTER_X + 0.5,
  y: TAPE_Y - 5.6,
  w: -2.6 - CUTTER_X - 0.5,
  h: 11.2,
};
const LEVER = { x: NOSE_X + 0.9, y: TAPE_Y - 13.6, w: 9.4, h: 6.6 };
const REEL = { x: 31, y: -25, r: 15, window: 11 };
const HANDLE = { x: 18, y: -12.5, w: 170, h: 25 };
// Where the punch's type sits: the spacing of letters round the wheel at the die.
const TYPE_PITCH = CHAR_R * STEP;
// How high the tape is held above the desk as it comes out of the nose.
const STRIP_Z = 10;
// A three-metre reel.
const REEL_LENGTH = 3000;
const STRIP_CAPACITY = 520;

// The handle: how far it has to go before the punch meets the tape, and how far back before the
// feed pawl drops into the next tooth.
const CONTACT = 0.3;
const FEED = 0.12;

const FEED_CUT = "\n";
const CUT_NOW = "\u0001";

const clamp = (v: number, lo: number, hi: number) =>
  v < lo ? lo : v > hi ? hi : v;
const smoothstep = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const mod = (a: number, n: number) => ((a % n) + n) % n;

function hash(x: number, y: number) {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function valueNoise(x: number, y: number) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy);
  const b = hash(ix + 1, iy);
  const c = hash(ix, iy + 1);
  const d = hash(ix + 1, iy + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

const LIGHT: Light = (() => {
  const x = -0.5;
  const y = -0.62;
  const z = 0.6;
  const n = Math.hypot(x, y, z);
  return { x: x / n, y: y / n, z: z / n, ambient: 0.42 };
})();

type Label = {
  piece: Piece;
  heat: Float32Array;
  x: number;
  y: number;
  angle: number;
  z: number;
  fall: {
    t: number;
    x: number;
    y: number;
    angle: number;
    dx: number;
    dy: number;
    turn: number;
  } | null;
  vx: number;
  vy: number;
  spin: number;
  backing: boolean;
  peel: number | null;
  stuck: boolean;
  adhesion: number;
  stuckAt: number;
  lift: [number, number];
  ends: [number, number];
  first: number | null;
  last: number | null;
  reliefDirty: boolean;
  held: boolean;
  // Stuck down by you rather than already on the desk.
  byHand: boolean;
};

type Drag =
  | { kind: "dial"; angle: number; offset: number; vel: number }
  | { kind: "squeeze" }
  | { kind: "blow" }
  | {
      kind: "label";
      label: Label;
      dx: number;
      dy: number;
      startX: number;
      startY: number;
      moved: boolean;
    };

export type Pick = "dial" | "squeeze" | "label" | "blow" | "lever" | null;

const SCISSORS = `url("data:image/svg+xml,${encodeURIComponent(
  "<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'><g fill='none' stroke-linecap='round'><g stroke='white' stroke-width='4'><circle cx='6.5' cy='18' r='3'/><circle cx='17.5' cy='18' r='3'/><path d='M8.4 15.7 17 3.5M15.6 15.7 7 3.5'/></g><g stroke='black' stroke-width='1.6'><circle cx='6.5' cy='18' r='3'/><circle cx='17.5' cy='18' r='3'/><path d='M8.4 15.7 17 3.5M15.6 15.7 7 3.5'/></g></g></svg>",
)}") 12 10, pointer`;

export function createLabelMaker(
  canvas: HTMLCanvasElement,
  {
    onStats,
    onNote,
  }: {
    onStats?: (stats: LabelMakerStats) => void;
    onNote?: (note: string) => void;
  } = {},
) {
  const maybe = canvas.getContext("2d");
  if (!maybe) throw new Error("No 2D context");
  const ctx: CanvasRenderingContext2D = maybe;
  const voice = createVoice();
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");

  let settings: LabelMakerSettings = { ...DEFAULT_SETTINGS };
  let night = false;
  let width = 0;
  let height = 0;
  let ratio = 1;
  let s = 4;
  let ox = 0;
  let oy = 0;
  let fontReady = false;
  let now = 0;

  const backdrop = document.createElement("canvas");
  const dialFace = document.createElement("canvas");

  // --- Notes -----------------------------------------------------------------------------------

  const said = new Map<string, number>();
  function say(key: string, text: string, again = Number.POSITIVE_INFINITY) {
    const at = said.get(key);
    if (at !== undefined && now - at < again) return;
    said.set(key, now);
    onNote?.(text);
  }

  // --- The tape in the machine -----------------------------------------------------------------

  let strip = newStrip(settings.tape);
  let stripHeat = new Float32Array(STRIP_CAPACITY);
  // How far the punch is from the strip's left end, and the same eased for drawing.
  let feed = CUT_GAP;
  let feedShown = CUT_GAP;
  let reelLeft = REEL_LENGTH;
  // Where each letter on the strip sits, so a cut knows what it went through.
  let cells: number[] = [];

  function newStrip(kind: TapeKind) {
    const piece = createPiece(
      kind,
      STRIP_CAPACITY,
      Math.floor(Math.random() * 1e6),
    );
    shade(piece, 0, piece.cols, LIGHT);
    return piece;
  }

  const labels: Label[] = [];

  function makeLabel(piece: Piece, x: number, y: number, angle: number): Label {
    const label: Label = {
      piece,
      heat: new Float32Array(Math.ceil(piece.cols / RES) + 1),
      x,
      y,
      angle,
      z: 0,
      fall: null,
      vx: 0,
      vy: 0,
      spin: 0,
      backing: true,
      peel: null,
      stuck: false,
      adhesion: 1,
      stuckAt: 0,
      lift: [0, 0],
      ends: [0, 0],
      first: null,
      last: null,
      reliefDirty: true,
      held: false,
      byHand: false,
    };
    refreshRelief(label);
    return label;
  }

  function refreshRelief(label: Label) {
    const r = relief(label.piece);
    label.first = r.first;
    label.last = r.last;
    label.ends = r.ends;
    label.reliefDirty = false;
  }

  function relight(label: Label) {
    if (Math.abs(label.piece.angle - label.angle) < 0.03) return;
    label.piece.angle = label.angle;
    shade(label.piece, 0, label.piece.cols, LIGHT);
  }

  // --- The dial and handle ---------------------------------------------------------------------

  // The dial's position in letters: the one under the pointer is round(phi).
  let phi = 1;
  let phiV = 0;
  let lastNotch = 1;
  let manualGoal: number | null = null;
  let p = 0;
  // Whatever is squeezing the handle, and when it started. A tap still moves the handle for a
  // moment, so one shorter than a frame isn't lost.
  const holders = new Map<string, number>();
  const letGo = new Map<string, number>();
  const MIN_PRESS = 0.05;

  function squeeze(on: boolean, source: string) {
    if (on) {
      holders.set(source, now);
      letGo.delete(source);
      return;
    }
    const at = holders.get(source);
    if (at === undefined) return;
    if (at + MIN_PRESS > now) letGo.set(source, at + MIN_PRESS);
    else holders.delete(source);
  }
  let stroke = {
    active: false,
    committed: false,
    peak: 0,
    overstrike: false,
  };
  let lastHeld = false;
  let cutPress = 0;
  let lockedAt: number | null = null;

  type Auto =
    | { phase: "turn"; goal: number }
    | { phase: "press" }
    | { phase: "release" }
    | { phase: "rest"; until: number };
  let auto: Auto | null = null;
  const queue: string[] = [];

  // --- Pointer state ---------------------------------------------------------------------------

  const drags = new Map<number, Drag>();
  let nozzle: { x: number; y: number } | null = null;
  let blowing = 0;
  let lastTap: { label: Label; at: number } | null = null;

  // --- Layout ----------------------------------------------------------------------------------

  function layout() {
    // Sized so the dial and a good run of tape fit across a narrow stage, with the handle
    // running off the right-hand edge; a wide one shows more of the handle.
    s = clamp(Math.min(width / 105, height / 150), 2.6, 5.4);
    const right = clamp((width * 0.33) / s, 33, 72);
    ox = width - right * s;
    oy = height - (DIAL_R + 15) * s;
    // Keep everything on the desk where it can be reached.
    for (const label of labels) keepOnDesk(label);
  }

  const toWorld = (x: number, y: number) => ({
    x: (x - ox) / s,
    y: (y - oy) / s,
  });

  function keepOnDesk(label: Label) {
    const len = label.piece.cols / RES;
    const left = -ox / s;
    const top = -oy / s;
    const right = (width - ox) / s;
    const bottom = (height - oy) / s;
    const margin = Math.min(len / 2, 12);
    label.x = clamp(label.x, left + margin, right - margin);
    label.y = clamp(label.y, top + 6, bottom - 6);
  }

  // --- Typing ----------------------------------------------------------------------------------

  function type(text: string) {
    const missing = new Set<string>();
    for (const raw of text) {
      if (raw === FEED_CUT) {
        queue.push(FEED_CUT);
        continue;
      }
      const upper = raw.toUpperCase();
      const char = ALIASES[raw] ?? (upper.length === 1 ? upper : raw);
      if (char === "\t" || char === "\r") continue;
      if (WHEEL.includes(char)) queue.push(char);
      else missing.add(raw);
    }
    if (missing.size) {
      const list = [...missing].slice(0, 3).map((c) => `‘${c}’`);
      say(
        `missing-${[...missing].join("")}`,
        `There’s no ${list.join(" or ")} on this wheel: it has capitals, figures, a little punctuation, a star and a heart.`,
        6,
      );
    }
  }

  function blanksNeeded() {
    if (!cells.length) return 0;
    const lastEdge = Math.max(...cells) + PITCH / 2 + 0.8;
    return Math.max(0, Math.ceil((lastEdge + CUT_GAP - feed) / PITCH));
  }

  function nearestGoal(index: number) {
    return index + N * Math.round((phi - index) / N);
  }

  // --- Squeezing -------------------------------------------------------------------------------

  function commit() {
    stroke.committed = true;
    const strength = clamp(smoothstep(CONTACT, 0.95, stroke.peak), 0.08, 1);
    const look = TAPES[strip.kind];
    if (reelLeft < PITCH) {
      voice.play("empty", 0.7);
      say("empty", "The reel’s run out. Pick a tape to load a new one.", 4);
      return;
    }
    const notch = Math.round(phi);
    const frac = phi - notch;
    const k = mod(notch, N);
    let strokes: Stroke[];
    let force = strength;
    if (Math.abs(frac) < 0.14) {
      // Near enough a notch, the punch's taper pulls the wheel square.
      phi = notch;
      strokes = [{ char: WHEEL[k], dx: 0 }];
    } else {
      const other = frac > 0 ? mod(k + 1, N) : mod(k - 1, N);
      strokes = [
        { char: WHEEL[k], dx: -frac * TYPE_PITCH },
        {
          char: WHEEL[other],
          dx: frac > 0 ? (1 - frac) * TYPE_PITCH : -(1 + frac) * TYPE_PITCH,
        },
      ];
      force *= 0.85;
      say(
        "between",
        "Squeezed between two letters: the punch caught the edges of both.",
        20,
      );
    }
    const blank = strokes.every((entry) => entry.char === " ");
    if (!blank) {
      const [a, b] = emboss(strip, feed, strokes, force);
      strip.angle = 0;
      shade(strip, a, b, LIGHT);
      if (!cells.includes(feed)) cells.push(feed);
    }
    const kind: ClickKind = look.metal ? "clank" : "crunch";
    voice.play(kind, 0.35 + 0.65 * strength, blank ? 1.15 : 1);
    if (stroke.overstrike && !blank) {
      say(
        "overstrike",
        "Squeezed again before the handle came all the way back, so the pawl never pulled the tape on: that letter landed on top of the last.",
        30,
      );
    }
    if (blank) return;
    if (look.metal) {
      say(
        "metal",
        "Aluminium can’t craze, so it never turns white: the letters only show by how their edges catch the light.",
      );
    } else if (strength < 0.9) {
      say(
        "light",
        "A light squeeze: only the vinyl stretched hardest (and the weakest bits of film) went white. Squeeze right home for a solid letter.",
        25,
      );
    }
  }

  function advance() {
    if (reelLeft < PITCH) return;
    feed += PITCH;
    reelLeft -= PITCH;
    voice.play("advance", 0.45);
    if (feed > STRIP_CAPACITY - 24) {
      // Far off the desk by now: let the tape's tail go.
      const drop = 160;
      strip = remainder(strip, drop * RES);
      shade(strip, strip.cols - drop * RES - 2, strip.cols, LIGHT);
      feed -= drop;
      feedShown -= drop;
      cells = cells.map((u) => u - drop).filter((u) => u > 0);
      stripHeat = new Float32Array(STRIP_CAPACITY);
    }
  }

  function stepHandle(dt: number) {
    for (const [source, at] of letGo) {
      if (now >= at) {
        holders.delete(source);
        letGo.delete(source);
      }
    }
    const held = holders.size > 0 || auto?.phase === "press";
    if (held && !lastHeld && stroke.active && stroke.committed && p > FEED) {
      // A fresh squeeze before the handle got back: same cell, no feed.
      stroke = { active: true, committed: false, peak: p, overstrike: true };
    }
    lastHeld = held;
    const target = held ? 1 : 0;
    // Typing squeezes firmly and quickly; a hand on the handle goes at its own pace.
    const rate = held ? (auto?.phase === "press" ? 24 : 15) : 24;
    p += (target - p) * (1 - Math.exp(-dt * rate));
    if (!stroke.active && p > CONTACT) {
      stroke = { active: true, committed: false, peak: p, overstrike: false };
      lockedAt = phi;
    }
    if (!stroke.active) return;
    stroke.peak = Math.max(stroke.peak, p);
    if (!stroke.committed && (p >= 0.96 || (!held && p < stroke.peak))) {
      commit();
    }
    if (stroke.committed && p < FEED && !held) {
      if (reelLeft >= PITCH) advance();
      stroke = { active: false, committed: false, peak: 0, overstrike: false };
      lockedAt = null;
    }
  }

  const locked = () => stroke.active && p > CONTACT * 0.8;

  // --- The dial --------------------------------------------------------------------------------

  function driveTo(goal: number, dt: number) {
    if (reduceMotion.matches) {
      phi = goal;
      phiV = 0;
      return true;
    }
    for (let i = 0; i < 4; i++) {
      const h = dt / 4;
      const acc = 900 * (goal - phi) - 60 * phiV;
      phiV = clamp(phiV + acc * h, -44, 44);
      phi += phiV * h;
    }
    if (Math.abs(goal - phi) < 0.02 && Math.abs(phiV) < 0.8) {
      phi = goal;
      phiV = 0;
      return true;
    }
    return false;
  }

  function stepDial(dt: number) {
    const dial = [...drags.values()].find((drag) => drag.kind === "dial");
    if (locked()) {
      phiV = 0;
      if (lockedAt !== null) phi = lockedAt;
      if (dial && dial.kind === "dial") dial.offset = phi + dial.angle / STEP;
    } else if (dial && dial.kind === "dial") {
      const t = dial.offset - dial.angle / STEP;
      // A little stickiness at each notch, as the ball drops in.
      const next = t - (0.5 * Math.sin(2 * Math.PI * t)) / (2 * Math.PI);
      if (dt > 0) dial.vel += ((next - phi) / dt - dial.vel) * 0.35;
      phi = next;
      manualGoal = null;
    } else if (auto?.phase === "turn") {
      if (driveTo(auto.goal, dt)) auto = { phase: "press" };
    } else if (manualGoal !== null) {
      if (driveTo(manualGoal, dt)) manualGoal = null;
    } else {
      for (let i = 0; i < 4; i++) {
        const h = dt / 4;
        const speed = Math.abs(phiV);
        const damp = 4 + 26 * Math.exp(-speed / 4);
        const acc =
          -300 * Math.sin(2 * Math.PI * phi) -
          damp * phiV -
          (speed > 0.05 ? 10 * Math.sign(phiV) : 0);
        phiV += acc * h;
        phi += phiV * h;
      }
      if (Math.abs(phiV) < 0.01 && Math.abs(phi - Math.round(phi)) < 0.002) {
        phi = Math.round(phi);
        phiV = 0;
      }
    }
    // Keep phi from wandering off over a long session.
    if (Math.abs(phi) > N * 8 && !dial && !auto && manualGoal === null) {
      const shift = N * Math.round(phi / N);
      phi -= shift;
      lastNotch -= shift;
    }
    const notch = Math.round(phi);
    if (notch !== lastNotch) {
      voice.play("detent", 0.35);
      lastNotch = notch;
    }
  }

  function stepQueue() {
    if (auto?.phase === "press" && stroke.committed)
      auto = { phase: "release" };
    if (auto?.phase === "release" && !stroke.active) {
      auto = reduceMotion.matches ? null : { phase: "rest", until: now + 0.03 };
    }
    if (auto?.phase === "rest" && now >= auto.until) auto = null;
    if (auto || !queue.length || !fontReady) return;
    if (holders.size || stroke.active) return;
    if ([...drags.values()].some((drag) => drag.kind === "dial")) return;
    const char = queue.shift() as string;
    if (char === FEED_CUT) {
      const blanks = blanksNeeded();
      queue.unshift(...Array.from({ length: blanks }, () => " "), CUT_NOW);
      return;
    }
    if (char === CUT_NOW) {
      cut();
      auto = { phase: "rest", until: now + 0.3 };
      return;
    }
    auto = { phase: "turn", goal: nearestGoal(WHEEL.indexOf(char)) };
  }

  // --- Cutting and trimming --------------------------------------------------------------------

  function columnPeak(piece: Piece, a: number, b: number) {
    let peak = 0;
    for (let y = 0; y < ROWS; y += 3) {
      for (let x = Math.max(0, a); x < Math.min(piece.cols, b); x++) {
        peak = Math.max(peak, piece.height[y * piece.cols + x]);
      }
    }
    return peak;
  }

  function cut() {
    cutPress = 1;
    voice.play("cut", 0.8);
    const cutU = feed - CUT_GAP;
    if (cutU < 0.8) return;
    const cutCol = Math.round(cutU * RES);
    const through = columnPeak(strip, cutCol - 3, cutCol + 3) > 0.03;
    const left = cells.filter((u) => u > cutU).length;
    const piece = slicePiece(strip, 0, cutCol);
    const leftEnd = -feedShown;
    strip = remainder(strip, cutCol);
    shade(strip, strip.cols - cutCol - 2, strip.cols, LIGHT);
    stripHeat = new Float32Array(STRIP_CAPACITY);
    feed -= cutCol / RES;
    feedShown -= cutCol / RES;
    cells = cells.map((u) => u - cutCol / RES).filter((u) => u > 0);
    const len = cutCol / RES;
    const label = makeLabel(piece, leftEnd + len / 2, TAPE_Y, 0);
    label.z = STRIP_Z;
    const [dx, dy] = landing(label.x, label.y, len);
    if (!reduceMotion.matches) {
      label.fall = {
        t: 0,
        x: label.x,
        y: label.y,
        angle: 0,
        dx,
        dy,
        turn: (Math.random() - 0.5) * 0.16,
      };
    } else {
      label.z = 0;
      label.x += dx;
      label.y += dy;
    }
    labels.push(label);
    if (through || left) {
      say(
        "chopped",
        "Cut with letters still in the head: the blade sits four letters in front of the punch. What it didn’t take will start your next label. Feed & cut feeds blanks first.",
        20,
      );
    } else if (label.first !== null && label.first > 8) {
      say(
        "lead",
        "Every label starts with a long blank lead, because the blade is four letters ahead of the punch. Click the blank end with the scissors to trim it.",
      );
    }
  }

  // Where a falling label comes to rest: it drops off the nose and drifts up the desk, and if
  // the last one is lying there it slides off the pile into the nearest clear patch.
  function landing(x: number, y: number, len: number): [number, number] {
    const top = -oy / s + 6;
    const left = -ox / s + 4;
    const jitter = Math.random() * 5;
    const free = (cx: number, cy: number) =>
      cy - HALF > top &&
      cx - len / 2 > left &&
      // Clear of the machine's nose and cut lever.
      (cx + len / 2 < NOSE_X - 2 || cy + HALF < LEVER.y - 2) &&
      labels.every((other) => {
        if (other.fall) return true;
        const olen = other.piece.cols / RES;
        return (
          Math.abs(other.x - cx) > (olen + len) / 2 + 1.5 ||
          Math.abs(other.y - cy) > TAPE_WIDTH + 1.5
        );
      });
    for (let row = 0; row < 8; row++) {
      for (const shift of [0, -14, -30, 14]) {
        const dx = -5 - jitter + shift;
        const dy = -12 - jitter - row * 12;
        if (free(x + dx, y + dy)) return [dx, dy];
      }
    }
    return [-5 - jitter, -12 - jitter];
  }

  // Snips a label's blank end off a millimetre and a half from the lettering.
  function trim(label: Label, side: "left" | "right") {
    if (label.first === null || label.last === null) return;
    const piece = label.piece;
    const len = piece.cols / RES;
    const at = side === "left" ? label.first - 1.5 : label.last + 1.5;
    const col = Math.round(at * RES);
    if (col < 12 || col > piece.cols - 12) return;
    const keep =
      side === "left"
        ? slicePiece(piece, col, piece.cols)
        : slicePiece(piece, 0, col);
    const scrap =
      side === "left"
        ? slicePiece(piece, 0, col)
        : slicePiece(piece, col, piece.cols);
    const keepLen = keep.cols / RES;
    const scrapLen = scrap.cols / RES;
    const c = Math.cos(label.angle);
    const sn = Math.sin(label.angle);
    const keepU = side === "left" ? at + keepLen / 2 : keepLen / 2;
    const scrapU = side === "left" ? scrapLen / 2 : at + scrapLen / 2;
    const place = (u: number) => ({
      x: label.x + (u - len / 2) * c,
      y: label.y + (u - len / 2) * sn,
    });
    const index = labels.indexOf(label);
    const kept = place(keepU);
    label.piece = keep;
    label.heat = new Float32Array(Math.ceil(keep.cols / RES) + 1);
    label.x = kept.x;
    label.y = kept.y;
    refreshRelief(label);
    const off = place(scrapU);
    const bit = makeLabel(scrap, off.x, off.y, label.angle);
    bit.backing = label.backing;
    if (label.stuck) {
      // Snipped where it's stuck down, the offcut stays put.
      bit.stuck = true;
      bit.stuckAt = now;
    } else {
      // Loose, it springs off the blades.
      const away = side === "left" ? -1 : 1;
      bit.angle += (Math.random() - 0.5) * 0.6;
      bit.vx = away * c * 40 + (Math.random() - 0.5) * 10;
      bit.vy = away * sn * 40 + (Math.random() - 0.5) * 10;
      bit.spin = (Math.random() - 0.5) * 3;
      relight(bit);
    }
    labels.splice(index, 0, bit);
    voice.play("snip", 0.8);
  }

  // --- Labels on the desk ----------------------------------------------------------------------

  function local(label: Label, x: number, y: number) {
    const len = label.piece.cols / RES;
    const dx = x - label.x;
    const dy = y - label.y;
    const c = Math.cos(label.angle);
    const sn = Math.sin(label.angle);
    return { u: dx * c + dy * sn + len / 2, v: -dx * sn + dy * c, len };
  }

  function labelAt(x: number, y: number) {
    for (let i = labels.length - 1; i >= 0; i--) {
      const label = labels[i];
      if (label.fall) continue;
      const { u, v, len } = local(label, x, y);
      if (u >= -0.8 && u <= len + 0.8 && Math.abs(v) <= HALF + 1) return label;
    }
    return null;
  }

  function trimSide(
    label: Label,
    x: number,
    y: number,
  ): "left" | "right" | null {
    if (label.first === null || label.last === null) return null;
    const { u, len } = local(label, x, y);
    if (label.first > 3.4 && u < label.first - 1.4) return "left";
    if (len - label.last > 3.4 && u > label.last + 1.4) return "right";
    return null;
  }

  function peel(label: Label) {
    if (!label.backing) return;
    label.backing = false;
    label.peel = reduceMotion.matches ? null : 0;
    label.stuck = true;
    label.byHand = true;
    label.stuckAt = now;
    label.adhesion = 1;
    label.lift = [0, 0];
    voice.play("peel", 0.7);
  }

  function pressDown(label: Label) {
    if (!label.stuck) return;
    label.lift = [0, 0];
    label.stuckAt = now;
    voice.play("press", 0.6);
  }

  function liftTarget(label: Label, end: 0 | 1) {
    const curl = label.ends[end] * 3.6 * (1.25 - 0.5 * label.adhesion);
    return clamp(curl + (1 - label.adhesion) * 1.6, 0, 3.6);
  }

  function stepLabels(dt: number) {
    for (const label of labels) {
      if (label.fall) {
        const fall = label.fall;
        fall.t = Math.min(1, fall.t + dt / 0.42);
        const t = fall.t;
        label.z =
          STRIP_Z * (1 - t * t) +
          (t > 0.85 ? Math.sin(((t - 0.85) / 0.15) * Math.PI) * 0.5 : 0);
        const ease = 1 - (1 - t) ** 2;
        label.x = fall.x + fall.dx * ease + Math.sin(t * 9) * 0.6 * (1 - t);
        label.y = fall.y + fall.dy * ease;
        label.angle = fall.angle + fall.turn * ease;
        if (t >= 1) {
          label.fall = null;
          label.z = 0;
          relight(label);
          voice.play("land", 0.6);
          keepOnDesk(label);
        }
        continue;
      }
      if (label.peel !== null) {
        label.peel += dt / 0.5;
        if (label.peel >= 1) label.peel = null;
      }
      const lifted = label.held ? 2.4 : 0;
      label.z += (lifted - label.z) * (1 - Math.exp(-dt * 18));
      if (!label.stuck && !label.held) {
        const speed = Math.hypot(label.vx, label.vy);
        if (speed > 0.05 || Math.abs(label.spin) > 0.01) {
          label.x += label.vx * dt;
          label.y += label.vy * dt;
          label.angle += label.spin * dt;
          const drag = Math.exp(-dt * 5);
          label.vx *= drag;
          label.vy *= drag;
          label.spin *= drag;
          keepOnDesk(label);
          relight(label);
        } else {
          label.vx = 0;
          label.vy = 0;
          label.spin = 0;
        }
      }
      if (label.stuck && !label.held) {
        if (label.reliefDirty) refreshRelief(label);
        const settle = now - label.stuckAt > 1.6;
        for (const end of [0, 1] as const) {
          const target = settle ? liftTarget(label, end) : 0;
          const rate = target > label.lift[end] ? 1 / 6 : 2;
          label.lift[end] +=
            (target - label.lift[end]) * (1 - Math.exp(-dt * rate));
        }
        if (settle && label.byHand && Math.max(...label.lift) > 0.9) {
          say(
            "lift",
            "Embossing stretches the face, so a label lettered close to its ends wants to curl, and the ends lift. Click to press it down, or warm it.",
          );
        }
      }
    }
  }

  // --- Hot air ---------------------------------------------------------------------------------

  const SOFT = 0.65;

  function heatPiece(
    piece: Piece,
    heat: Float32Array,
    x: number,
    y: number,
    angle: number,
    dt: number,
  ) {
    const len = piece.cols / RES;
    if (blowing > 0.05 && nozzle) {
      const dx = nozzle.x - x;
      const dy = nozzle.y - y;
      const c = Math.cos(angle);
      const sn = Math.sin(angle);
      const lu = dx * c + dy * sn + len / 2;
      const lv = -dx * sn + dy * c;
      if (Math.abs(lv) < 30 && lu > -30 && lu < len + 30) {
        const a = Math.max(0, Math.floor(lu - 30));
        const b = Math.min(heat.length, Math.ceil(lu + 30));
        for (let i = a; i < b; i++) {
          const du = i + 0.5 - lu;
          heat[i] = Math.min(
            2.6,
            heat[i] + 1.5 * blowing * Math.exp(-(du * du + lv * lv) / 128) * dt,
          );
        }
      }
    }
    let lo = Number.POSITIVE_INFINITY;
    let hi = -1;
    let warm = 0;
    for (let i = 0; i < heat.length; i++) {
      const t = heat[i];
      if (t < 0.002) continue;
      heat[i] = t - t * 0.5 * dt;
      warm = Math.max(warm, t);
      if (t > SOFT) {
        lo = Math.min(lo, i);
        hi = Math.max(hi, i);
      }
    }
    if (hi >= lo && !TAPES[piece.kind].metal) {
      relax(
        piece,
        lo * RES,
        (hi + 1) * RES,
        (col) => Math.max(0, heat[Math.floor(col / RES)] - SOFT) * 0.6,
        dt,
      );
      shade(piece, lo * RES - 1, (hi + 1) * RES + 1, LIGHT);
      say(
        "heat",
        "Warmed past about 80 °C the vinyl gives up its stretch: the crazes close, so the white goes first, then the letters slowly sink back.",
      );
      return { changed: true, warm };
    }
    return { changed: false, warm };
  }

  function stepHeat(dt: number) {
    const target =
      settings.hotAir && [...drags.values()].some((d) => d.kind === "blow")
        ? 1
        : 0;
    blowing += (target - blowing) * (1 - Math.exp(-dt * 6));
    if (blowing < 0.002) blowing = 0;
    voice.blow(blowing > 0.02 ? blowing : 0);
    for (const label of labels) {
      if (label.fall) continue;
      const { changed, warm } = heatPiece(
        label.piece,
        label.heat,
        label.x,
        label.y,
        label.angle,
        dt,
      );
      if (changed) label.reliefDirty = true;
      if (warm > SOFT && label.stuck) {
        // Soft vinyl and warm adhesive: a lifted end lies down and grips again.
        label.lift[0] *= Math.exp(-dt * 3);
        label.lift[1] *= Math.exp(-dt * 3);
        label.adhesion = Math.min(1, label.adhesion + dt * 0.3);
        label.stuckAt = now;
      }
      // The airflow pushes anything that isn't stuck down.
      if (blowing > 0.05 && nozzle && !label.stuck && !label.held) {
        const dx = label.x - nozzle.x;
        const dy = label.y - nozzle.y;
        const d = Math.hypot(dx, dy) || 1;
        const len = label.piece.cols / RES;
        const reach = 16 + len * 0.25;
        const push =
          700 *
          blowing *
          Math.exp(-(d * d) / (2 * reach * reach)) *
          (60 / (40 + len));
        if (push > 4) {
          label.vx += (dx / d) * push * dt;
          label.vy += (dy / d) * push * dt;
          const { u, len: l } = local(label, nozzle.x, nozzle.y);
          label.spin += clamp((l / 2 - u) / l, -1, 1) * push * 0.004 * dt * 60;
          say(
            "blown",
            "The hot air pushes anything that isn’t stuck down across the desk. Double-click a label to peel its backing and stick it.",
          );
        }
      }
    }
    const len = strip.cols / RES;
    heatPiece(strip, stripHeat, -feedShown + len / 2, TAPE_Y, 0, dt);
  }

  // --- Drawing ---------------------------------------------------------------------------------

  function shadowRect(
    x: number,
    y: number,
    w: number,
    h: number,
    offset: number,
    blur: number,
    alpha: number,
  ) {
    // Canvas shadows are offset in device pixels, whatever the transform, so the shape is drawn
    // far away and its shadow brought back to where it belongs.
    const m = ctx.getTransform();
    const far = 4000;
    ctx.save();
    ctx.shadowColor = `rgba(20, 14, 8, ${alpha})`;
    ctx.shadowBlur = blur * s * ratio;
    ctx.shadowOffsetX = -m.c * far + offset * 0.55 * s * ratio;
    ctx.shadowOffsetY = -m.d * far + offset * 0.8 * s * ratio;
    ctx.fillStyle = "#000";
    ctx.fillRect(x, y + far, w, h);
    ctx.restore();
  }

  function sheen(x: number, y: number, w: number, h: number, strength: number) {
    // A glossy face shows the lamp, wherever on the desk that reflection happens to fall.
    const m = ctx.getTransform();
    let x0 = Number.POSITIVE_INFINITY;
    let y0 = Number.POSITIVE_INFINITY;
    let x1 = Number.NEGATIVE_INFINITY;
    let y1 = Number.NEGATIVE_INFINITY;
    for (const [px, py] of [
      [x, y],
      [x + w, y],
      [x, y + h],
      [x + w, y + h],
    ]) {
      const dx = m.a * px + m.c * py + m.e;
      const dy = m.b * px + m.d * py + m.f;
      x0 = Math.min(x0, dx);
      y0 = Math.min(y0, dy);
      x1 = Math.max(x1, dx);
      y1 = Math.max(y1, dy);
    }
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const cx = width * ratio * (night ? 0.3 : 0.24);
    const cy = height * ratio * (night ? 0.28 : 0.16);
    const r = Math.max(width, height) * ratio * 0.62;
    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    glow.addColorStop(0, `rgba(255, 255, 255, ${0.24 * strength})`);
    glow.addColorStop(0.35, `rgba(255, 255, 255, ${0.09 * strength})`);
    glow.addColorStop(1, "rgba(255, 255, 255, 0)");
    ctx.globalCompositeOperation = "screen";
    ctx.fillStyle = glow;
    ctx.fillRect(x0 - 1, y0 - 1, x1 - x0 + 2, y1 - y0 + 2);
    ctx.restore();
  }

  function drawBacking(len: number, alpha = 1) {
    ctx.fillStyle = `rgba(242, 239, 230, ${alpha})`;
    ctx.fillRect(0, -HALF, len, TAPE_WIDTH);
    // The split down the middle that you crack to start peeling.
    ctx.strokeStyle = `rgba(150, 140, 125, ${0.35 * alpha})`;
    ctx.lineWidth = 0.12;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    for (let u = 0.5; u <= len; u += 0.5)
      ctx.lineTo(u, Math.sin(u * 1.1) * 0.25);
    ctx.stroke();
  }

  function drawPiece(piece: Piece, len: number, from = 0, to = len) {
    const a = Math.max(0, Math.floor(from * RES));
    const b = Math.min(piece.cols, Math.ceil(to * RES));
    if (b <= a) return;
    ctx.drawImage(
      piece.canvas,
      a,
      0,
      b - a,
      ROWS,
      a / RES,
      -HALF,
      (b - a) / RES,
      TAPE_WIDTH,
    );
  }

  function drawLabel(label: Label) {
    const piece = label.piece;
    const len = piece.cols / RES;
    const look = TAPES[piece.kind];
    ctx.save();
    ctx.translate(label.x, label.y);
    ctx.rotate(label.angle);
    ctx.translate(-len / 2, 0);
    const [l0, l1] = label.lift;
    const lifting = label.stuck && Math.max(l0, l1) > 0.05;
    const base = label.stuck ? 0.25 : 0.55;
    if (!lifting) {
      shadowRect(
        0,
        -HALF,
        len,
        TAPE_WIDTH,
        base + label.z * 0.7,
        0.5 + label.z * 0.35,
        look.alpha < 1 && !label.backing ? 0.04 : 0.32,
      );
    }
    // The backing coming away in two halves.
    if (label.peel !== null) {
      const t = label.peel;
      const out = t * 9;
      const fade = 1 - t;
      ctx.save();
      ctx.globalAlpha = fade;
      ctx.fillStyle = "rgb(240, 236, 226)";
      ctx.fillRect(t * 2, -HALF - out, len - t * 4, HALF * (1 - t * 0.4));
      ctx.fillRect(
        t * 2,
        out + t * HALF * 0.4,
        len - t * 4,
        HALF * (1 - t * 0.4),
      );
      ctx.restore();
    }
    if (lifting) {
      // Each lifted end is a flap rising from where it still grips, drawn a slice at a time so
      // each slice gets its own shadow and catches the light at its own tilt.
      const slices: { a: number; b: number; z: number; tilt: number }[] = [];
      const flap = (lift: number) => Math.min(len * 0.32, 7 + lift * 3);
      const fl = flap(l0);
      const fr = flap(l1);
      const SLICES = 12;
      for (let i = 0; i < SLICES; i++) {
        const a = (fl * i) / SLICES;
        const b = (fl * (i + 1)) / SLICES;
        const t = 1 - (a + b) / 2 / fl;
        slices.push({ a, b, z: l0 * t * t, tilt: (2 * l0 * t) / fl });
      }
      slices.push({ a: fl, b: len - fr, z: 0, tilt: 0 });
      for (let i = 0; i < SLICES; i++) {
        const a = len - fr + (fr * i) / SLICES;
        const b = len - fr + (fr * (i + 1)) / SLICES;
        const t = ((a + b) / 2 - (len - fr)) / fr;
        slices.push({ a, b, z: l1 * t * t, tilt: -(2 * l1 * t) / fr });
      }
      for (const slice of slices) {
        shadowRect(
          slice.a,
          -HALF,
          slice.b - slice.a + 0.05,
          TAPE_WIDTH,
          base + slice.z * 1.2,
          0.5 + slice.z * 0.6,
          look.alpha < 1 ? 0.04 : 0.3,
        );
      }
      const lx =
        LIGHT.x * Math.cos(-label.angle) - LIGHT.y * Math.sin(-label.angle);
      for (const slice of slices) {
        drawPiece(piece, len, slice.a, slice.b + 0.04);
      }
      if (look.alpha === 1) {
        // Each flap tilts more towards its tip: turned up towards the light it brightens, away
        // from it it darkens.
        const flapShade = (from: number, to: number, tilt: number) => {
          const facing = -tilt * lx;
          if (Math.abs(facing) < 0.005) return;
          const tone = facing > 0 ? "255, 255, 255" : "0, 0, 0";
          const alpha = Math.min(facing > 0 ? 0.3 : 0.35, Math.abs(facing));
          const gradient = ctx.createLinearGradient(from, 0, to, 0);
          gradient.addColorStop(0, `rgba(${tone}, 0)`);
          gradient.addColorStop(1, `rgba(${tone}, ${alpha})`);
          ctx.fillStyle = gradient;
          ctx.fillRect(
            Math.min(from, to),
            -HALF,
            Math.abs(to - from),
            TAPE_WIDTH,
          );
        };
        flapShade(fl, 0, (2 * l0) / fl);
        flapShade(len - fr, len, -(2 * l1) / fr);
      }
    } else {
      if (label.backing && look.alpha < 1) drawBacking(len);
      drawPiece(piece, len);
    }
    sheen(
      0,
      -HALF,
      len,
      TAPE_WIDTH,
      look.metal ? 0.7 : look.alpha < 1 ? 0.35 : 0.85,
    );
    ctx.restore();
  }

  function drawStrip() {
    const len = strip.cols / RES;
    const left = -feedShown;
    // Only as far as the punch: the rest is still on the reel inside.
    const shown = feedShown + PITCH * 0.6;
    const look = TAPES[strip.kind];
    ctx.save();
    ctx.translate(left, TAPE_Y);
    const outside = Math.max(0, NOSE_X - left);
    if (outside > 0) {
      shadowRect(
        0,
        -HALF,
        Math.min(outside + 4, shown),
        TAPE_WIDTH,
        STRIP_Z * 0.8,
        3.4,
        look.alpha < 1 ? 0.1 : 0.24,
      );
    }
    if (look.alpha < 1) drawBacking(Math.min(shown, len));
    drawPiece(strip, len, 0, Math.min(shown, len));
    sheen(0, -HALF, Math.min(shown, len), TAPE_WIDTH, look.metal ? 0.7 : 0.8);
    ctx.restore();
  }

  // The parts of the shell, as one outline.
  function bodyPath() {
    const path = new Path2D();
    path.arc(0, 0, HEAD_R, 0, Math.PI * 2);
    path.roundRect(NOSE.x, NOSE.y, NOSE.w, NOSE.h, 4.6);
    path.moveTo(REEL.x + REEL.r, REEL.y);
    path.arc(REEL.x, REEL.y, REEL.r, 0, Math.PI * 2);
    path.roundRect(HANDLE.x, HANDLE.y, HANDLE.w, HANDLE.h, 12.5);
    return path;
  }

  function renderDialFace() {
    const size = Math.max(16, Math.ceil(DIAL_R * 2 * s * ratio) + 4);
    dialFace.width = size;
    dialFace.height = size;
    const g = dialFace.getContext("2d");
    if (!g) return;
    const k = (size - 4) / (DIAL_R * 2);
    g.setTransform(k, 0, 0, k, size / 2, size / 2);
    // The knurled rim.
    g.fillStyle = "#1c1e22";
    g.beginPath();
    g.arc(0, 0, DIAL_R, 0, Math.PI * 2);
    g.fill();
    const ridges = 120;
    for (let i = 0; i < ridges; i++) {
      const a = (i / ridges) * Math.PI * 2;
      g.strokeStyle = i % 2 ? "rgba(255,255,255,0.13)" : "rgba(0,0,0,0.45)";
      g.lineWidth = 0.5;
      g.beginPath();
      g.moveTo(Math.cos(a) * (KNURL_R + 0.3), Math.sin(a) * (KNURL_R + 0.3));
      g.lineTo(Math.cos(a) * (DIAL_R - 0.2), Math.sin(a) * (DIAL_R - 0.2));
      g.stroke();
    }
    // The face, black and glossy, with the type printed round it.
    const face = g.createRadialGradient(-6, -8, 2, 0, 0, KNURL_R);
    face.addColorStop(0, "#26282d");
    face.addColorStop(1, "#111215");
    g.fillStyle = face;
    g.beginPath();
    g.arc(0, 0, KNURL_R, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = "rgba(236, 235, 227, 0.22)";
    g.lineWidth = 0.18;
    for (const r of [CHAR_R + 2.5, CHAR_R - 2.4]) {
      g.beginPath();
      g.arc(0, 0, r, 0, Math.PI * 2);
      g.stroke();
    }
    g.fillStyle = "#ecebe3";
    for (let i = 0; i < N; i++) {
      const a = -Math.PI / 2 + i * STEP;
      g.save();
      g.translate(Math.cos(a) * CHAR_R, Math.sin(a) * CHAR_R);
      g.rotate(a + Math.PI / 2);
      if (WHEEL[i] === " ") {
        g.beginPath();
        g.arc(0, 0, 0.45, 0, Math.PI * 2);
        g.fill();
      } else {
        drawGlyph(g, WHEEL[i], 0, 0, 2.5, 600);
      }
      g.restore();
      // Little ticks between the letters.
      const b = a + STEP / 2;
      g.fillRect(
        Math.cos(b) * (CHAR_R + 1.9) - 0.12,
        Math.sin(b) * (CHAR_R + 1.9) - 0.12,
        0.24,
        0.24,
      );
    }
    // The finger dish in the middle.
    const dish = g.createRadialGradient(1.5, 2, 0.5, 0, 0, HUB_R);
    dish.addColorStop(0, "#2b2e33");
    dish.addColorStop(0.7, "#17181b");
    dish.addColorStop(1, "#0b0b0d");
    g.fillStyle = dish;
    g.beginPath();
    g.arc(0, 0, HUB_R, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = "rgba(255,255,255,0.12)";
    g.lineWidth = 0.3;
    g.beginPath();
    g.arc(0, 0, HUB_R + 0.2, 0, Math.PI * 2);
    g.stroke();
  }

  function drawReel() {
    ctx.save();
    ctx.beginPath();
    ctx.arc(REEL.x, REEL.y, REEL.window, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = "#0d1014";
    ctx.fillRect(
      REEL.x - REEL.window,
      REEL.y - REEL.window,
      REEL.window * 2,
      REEL.window * 2,
    );
    const core = 3.8;
    const full = 9.6;
    const left = Math.max(0, reelLeft) / REEL_LENGTH;
    const radius = Math.sqrt(core * core + left * (full * full - core * core));
    // Tape wound flat, seen edge-on from above: thin layers of vinyl and backing.
    const swatch = SWATCHES[strip.kind];
    ctx.fillStyle = swatch;
    ctx.beginPath();
    ctx.arc(REEL.x, REEL.y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(240, 236, 226, 0.35)";
    ctx.lineWidth = 0.08;
    for (let r = core + 0.25; r < radius; r += 0.3) {
      ctx.beginPath();
      ctx.arc(REEL.x, REEL.y, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = "#5c6066";
    ctx.beginPath();
    ctx.arc(REEL.x, REEL.y, core, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#2c2f34";
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.4;
      ctx.beginPath();
      ctx.arc(
        REEL.x + Math.cos(a) * 2.1,
        REEL.y + Math.sin(a) * 2.1,
        0.9,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
    // Smoked plastic over it.
    ctx.fillStyle = "rgba(14, 20, 28, 0.38)";
    ctx.fillRect(
      REEL.x - REEL.window,
      REEL.y - REEL.window,
      REEL.window * 2,
      REEL.window * 2,
    );
    const gloss = ctx.createLinearGradient(
      REEL.x - 8,
      REEL.y - 10,
      REEL.x + 4,
      REEL.y + 6,
    );
    gloss.addColorStop(0, "rgba(255,255,255,0.28)");
    gloss.addColorStop(0.45, "rgba(255,255,255,0.04)");
    gloss.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gloss;
    ctx.fillRect(
      REEL.x - REEL.window,
      REEL.y - REEL.window,
      REEL.window * 2,
      REEL.window * 2,
    );
    ctx.restore();
    ctx.strokeStyle = "rgba(0,0,0,0.5)";
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.arc(REEL.x, REEL.y, REEL.window, 0, Math.PI * 2);
    ctx.stroke();
  }

  function drawWindow() {
    // A smoked window over the tape path, so you can see what's still in the head.
    const len = strip.cols / RES;
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(WINDOW.x, WINDOW.y, WINDOW.w, WINDOW.h, 1.4);
    ctx.clip();
    ctx.fillStyle = "#0b0d10";
    ctx.fillRect(WINDOW.x, WINDOW.y, WINDOW.w, WINDOW.h);
    ctx.save();
    ctx.translate(-feedShown, TAPE_Y);
    if (TAPES[strip.kind].alpha < 1)
      drawBacking(Math.min(feedShown + PITCH, len));
    drawPiece(
      strip,
      len,
      Math.max(0, feedShown - CUT_GAP - 2),
      Math.min(feedShown + PITCH, len),
    );
    ctx.restore();
    // The guillotine at the left end of the window.
    const blade = cutPress > 0 ? Math.sin(cutPress * Math.PI) : 0;
    ctx.fillStyle = `rgba(200, 204, 210, ${0.75 + blade * 0.25})`;
    ctx.fillRect(CUTTER_X - 0.4, TAPE_Y - 5.6 + blade * 2, 0.8, 11.2);
    ctx.fillStyle = "rgba(14, 20, 28, 0.42)";
    ctx.fillRect(WINDOW.x, WINDOW.y, WINDOW.w, WINDOW.h);
    const gloss = ctx.createLinearGradient(
      WINDOW.x,
      WINDOW.y,
      WINDOW.x + 6,
      WINDOW.y + WINDOW.h,
    );
    gloss.addColorStop(0, "rgba(255,255,255,0.22)");
    gloss.addColorStop(0.5, "rgba(255,255,255,0.03)");
    gloss.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gloss;
    ctx.fillRect(WINDOW.x, WINDOW.y, WINDOW.w, WINDOW.h);
    ctx.restore();
    ctx.strokeStyle = "rgba(0,0,0,0.55)";
    ctx.lineWidth = 0.45;
    ctx.beginPath();
    ctx.roundRect(WINDOW.x, WINDOW.y, WINDOW.w, WINDOW.h, 1.4);
    ctx.stroke();
  }

  function drawDevice() {
    const body = bodyPath();
    const gap = 0.6 + 6 * (1 - p);
    // The trigger under the handle, closing up as it's squeezed.
    const lever = new Path2D();
    lever.roundRect(
      HANDLE.x + 20,
      HANDLE.y + HANDLE.h - 4 + gap,
      HANDLE.w,
      11.5,
      5.5,
    );
    ctx.save();
    ctx.shadowColor = "rgba(20, 14, 8, 0.35)";
    ctx.shadowBlur = 3.5 * s * ratio;
    ctx.shadowOffsetX = 1.4 * s * ratio;
    ctx.shadowOffsetY = 2.2 * s * ratio;
    ctx.fillStyle = "#222830";
    ctx.fill(lever);
    ctx.restore();
    ctx.save();
    ctx.clip(lever);
    for (let x = HANDLE.x + 30; x < HANDLE.x + HANDLE.w; x += 4.2) {
      ctx.fillStyle = "rgba(255,255,255,0.06)";
      ctx.fillRect(x, HANDLE.y + HANDLE.h + gap, 1.6, 8);
    }
    ctx.restore();

    ctx.save();
    ctx.shadowColor = "rgba(20, 14, 8, 0.42)";
    ctx.shadowBlur = 5 * s * ratio;
    ctx.shadowOffsetX = 1.8 * s * ratio;
    ctx.shadowOffsetY = 3 * s * ratio;
    ctx.fillStyle = "#222a33";
    ctx.fill(body);
    ctx.restore();
    ctx.save();
    ctx.clip(body);
    // A bevel round the outline of the whole shell, not each part of it: the shell filled again
    // nudged up and left in a lighter tone, then once more inside both nudges in its own colour,
    // leaves light along the upper left edges and shade along the lower right.
    ctx.save();
    ctx.translate(-0.45, -0.55);
    ctx.fillStyle = "#56667a";
    ctx.fill(body);
    ctx.clip(body);
    ctx.translate(0.9, 1.1);
    ctx.fillStyle = "#334150";
    ctx.fill(body);
    ctx.restore();
    const shell = ctx.createLinearGradient(-30, -50, 40, 30);
    shell.addColorStop(0, "rgba(255,255,255,0.16)");
    shell.addColorStop(0.5, "rgba(255,255,255,0)");
    shell.addColorStop(1, "rgba(0,0,0,0.22)");
    ctx.fillStyle = shell;
    ctx.fillRect(-60, -60, 240, 120);
    // Rubber ribs on the grip.
    for (let x = HANDLE.x + 26; x < HANDLE.x + HANDLE.w; x += 4.2) {
      ctx.fillStyle = "#1e252d";
      ctx.beginPath();
      ctx.roundRect(x, HANDLE.y + 4, 2.2, HANDLE.h - 8, 1.1);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.08)";
      ctx.fillRect(x, HANDLE.y + 4.5, 0.5, HANDLE.h - 9);
    }
    ctx.restore();

    drawReel();
    drawWindow();

    // The cut lever on the nose.
    const press = cutPress > 0 ? Math.sin(cutPress * Math.PI) : 0;
    ctx.save();
    ctx.translate(0, press * 1.4);
    ctx.shadowColor = "rgba(20, 14, 8, 0.35)";
    ctx.shadowBlur = 1.6 * s * ratio;
    ctx.shadowOffsetX = 0.6 * s * ratio * (1 - press);
    ctx.shadowOffsetY = 1 * s * ratio * (1 - press);
    const steel = ctx.createLinearGradient(
      LEVER.x,
      LEVER.y,
      LEVER.x + LEVER.w,
      LEVER.y + LEVER.h,
    );
    steel.addColorStop(0, "#d9dcdf");
    steel.addColorStop(1, "#8d9196");
    ctx.fillStyle = steel;
    ctx.beginPath();
    ctx.roundRect(LEVER.x, LEVER.y, LEVER.w, LEVER.h, 1.8);
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.strokeStyle = "rgba(0,0,0,0.25)";
    ctx.lineWidth = 0.3;
    for (let i = 1; i < 5; i++) {
      const x = LEVER.x + (LEVER.w * i) / 5;
      ctx.beginPath();
      ctx.moveTo(x, LEVER.y + 1.2);
      ctx.lineTo(x, LEVER.y + LEVER.h - 1.2);
      ctx.stroke();
    }
    ctx.restore();

    // The dial, standing proud of the shell.
    ctx.save();
    ctx.shadowColor = "rgba(0, 0, 0, 0.45)";
    ctx.shadowBlur = 2.4 * s * ratio;
    ctx.shadowOffsetX = 0.8 * s * ratio;
    ctx.shadowOffsetY = 1.3 * s * ratio;
    ctx.fillStyle = "#16171a";
    ctx.beginPath();
    ctx.arc(0, 0, DIAL_R, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    if (dialFace.width > 16) {
      ctx.save();
      ctx.rotate(-phi * STEP);
      ctx.drawImage(
        dialFace,
        -DIAL_R - (2 / (dialFace.width - 4)) * DIAL_R * 2,
        -DIAL_R - (2 / (dialFace.width - 4)) * DIAL_R * 2,
        (dialFace.width / (dialFace.width - 4)) * DIAL_R * 2,
        (dialFace.height / (dialFace.height - 4)) * DIAL_R * 2,
      );
      ctx.restore();
    }
    // The light on the dial stays where the lamp is, however it turns.
    const gloss = ctx.createRadialGradient(-11, -13, 1, -4, -6, DIAL_R * 1.1);
    gloss.addColorStop(0, "rgba(255,255,255,0.16)");
    gloss.addColorStop(0.5, "rgba(255,255,255,0.03)");
    gloss.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gloss;
    ctx.beginPath();
    ctx.arc(0, 0, DIAL_R, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(205, 209, 214, 0.55)";
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.arc(0, 0, DIAL_R + 0.1, 0, Math.PI * 2);
    ctx.stroke();
    const hub = ctx.createRadialGradient(-2.4, -3, 0.2, -1, -1.5, HUB_R);
    hub.addColorStop(0, "rgba(255,255,255,0)");
    hub.addColorStop(0.75, "rgba(255,255,255,0)");
    hub.addColorStop(0.95, "rgba(255,255,255,0.1)");
    hub.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = hub;
    ctx.beginPath();
    ctx.arc(0, 0, HUB_R, 0, Math.PI * 2);
    ctx.fill();

    // The pointer, moulded into the shell above the letter that's under the punch.
    ctx.fillStyle = "#d8322a";
    ctx.beginPath();
    ctx.moveTo(-1.5, -DIAL_R - 1.6);
    ctx.lineTo(1.5, -DIAL_R - 1.6);
    ctx.lineTo(0, -DIAL_R + 0.9);
    ctx.closePath();
    ctx.fill();
  }

  function drawNozzle() {
    if (!settings.hotAir || !nozzle) return;
    const { x, y } = nozzle;
    ctx.save();
    if (blowing > 0.02) {
      // Shimmer in the hot air below the nozzle.
      for (let i = 0; i < 4; i++) {
        const r = 6 + ((now * 22 + i * 5) % 20);
        ctx.strokeStyle = `rgba(255, 170, 90, ${0.1 * blowing * (1 - (r - 6) / 20)})`;
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.shadowColor = "rgba(20, 14, 8, 0.35)";
    ctx.shadowBlur = 6 * s * ratio;
    ctx.shadowOffsetX = 4 * s * ratio;
    ctx.shadowOffsetY = 7 * s * ratio;
    ctx.fillStyle = "#2a2d31";
    ctx.beginPath();
    ctx.arc(x, y, 5.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.fillStyle =
      blowing > 0.05
        ? `rgb(${60 + 140 * blowing}, ${40 + 30 * blowing}, 30)`
        : "#121315";
    ctx.beginPath();
    ctx.arc(x, y, 4.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(160, 165, 170, 0.6)";
    ctx.lineWidth = 0.35;
    for (let i = -3; i <= 3; i++) {
      const h = Math.sqrt(Math.max(0, 4.2 * 4.2 - (i * 1.2) ** 2));
      ctx.beginPath();
      ctx.moveTo(x + i * 1.2, y - h);
      ctx.lineTo(x + i * 1.2, y + h);
      ctx.stroke();
    }
    ctx.restore();
  }

  function renderBackdrop() {
    const w = Math.max(1, Math.ceil((width * ratio) / 2));
    const h = Math.max(1, Math.ceil((height * ratio) / 2));
    backdrop.width = w;
    backdrop.height = h;
    const g = backdrop.getContext("2d");
    if (!g) return;
    const image = g.createImageData(w, h);
    const data = image.data;
    const k = 2 / ratio;
    for (let py = 0; py < h; py++) {
      for (let px = 0; px < w; px++) {
        const X = (px * k - ox) / s;
        const Y = (py * k - oy) / s;
        let r: number;
        let gg: number;
        let b: number;
        if (settings.surface === "desk") {
          // Oak: long rings drifting across the board, and fine pores along the grain.
          const warp =
            valueNoise(X * 0.006, Y * 0.03) * 3 +
            valueNoise(X * 0.02, Y * 0.08) * 0.6;
          const ring = Y * 0.16 + warp * 1.1;
          const line = (0.5 + 0.5 * Math.cos(ring * Math.PI * 2)) ** 5 * 0.42;
          const pores =
            valueNoise(X * 0.06, Y * 2.2) * 0.16 +
            hash(Math.floor(X * 3), Math.floor(Y * 5)) * 0.05;
          const t = line + pores;
          r = 214 - 52 * t;
          gg = 184 - 52 * t;
          b = 144 - 50 * t;
        } else if (settings.surface === "fridge") {
          // Enamel: a faint orange-peel ripple.
          const peel = valueNoise(X * 1.2, Y * 1.2) - 0.5;
          const t =
            peel * 0.025 + (valueNoise(X * 0.05, Y * 0.05) - 0.5) * 0.02;
          r = 238 * (1 + t);
          gg = 235 * (1 + t);
          b = 226 * (1 + t);
        } else {
          // Hammered paint: the film pulls into shallow dishes a few millimetres across as it
          // cures, each lit on its far side and shaded on its near one, with flecks of the
          // metal powder in it.
          const cell = 2.6;
          const cx = X / cell;
          const cy = Y / cell;
          let best = 9;
          let ddx = 0;
          let ddy = 0;
          for (let j = -1; j <= 1; j++) {
            for (let i = -1; i <= 1; i++) {
              const gx = Math.floor(cx) + i;
              const gy = Math.floor(cy) + j;
              const fx = gx + hash(gx, gy) - cx;
              const fy = gy + hash(gy * 7 + 3, gx * 5 + 1) - cy;
              const d = fx * fx + fy * fy;
              if (d < best) {
                best = d;
                ddx = fx;
                ddy = fy;
              }
            }
          }
          const dish =
            (ddx * LIGHT.x + ddy * LIGHT.y) *
            0.5 *
            Math.min(1, Math.sqrt(best) * 1.6);
          const fleck =
            hash(Math.floor(X * 6), Math.floor(Y * 6)) > 0.985 ? 0.25 : 0;
          const t =
            dish * 0.38 + (valueNoise(X * 0.08, Y * 0.08) - 0.5) * 0.12 + fleck;
          r = 72 * (1 + t);
          gg = 96 * (1 + t);
          b = 88 * (1 + t);
        }
        const o = (py * w + px) * 4;
        data[o] = r;
        data[o + 1] = gg;
        data[o + 2] = b;
        data[o + 3] = 255;
      }
    }
    g.putImageData(image, 0, 0);
  }

  function drawLight() {
    // Day is a window over the desk; night is a lamp, warm and falling away into the dark.
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const w = canvas.width;
    const h = canvas.height;
    ctx.globalCompositeOperation = "multiply";
    const cx = w * (night ? 0.32 : 0.3);
    const cy = h * (night ? 0.3 : 0.15);
    const r = Math.hypot(w, h) * (night ? 0.75 : 1.05);
    const light = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    if (night) {
      light.addColorStop(0, "rgb(255, 232, 196)");
      light.addColorStop(0.45, "rgb(190, 150, 112)");
      light.addColorStop(1, "rgb(40, 32, 28)");
    } else {
      light.addColorStop(0, "rgb(255, 255, 255)");
      light.addColorStop(0.6, "rgb(238, 238, 236)");
      light.addColorStop(1, "rgb(196, 196, 198)");
    }
    ctx.fillStyle = light;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  function render() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(backdrop, 0, 0, canvas.width, canvas.height);
    ctx.setTransform(s * ratio, 0, 0, s * ratio, ox * ratio, oy * ratio);
    for (const label of labels) if (!label.fall) drawLabel(label);
    drawStrip();
    for (const label of labels) if (label.fall) drawLabel(label);
    drawDevice();
    drawNozzle();
    drawLight();
  }

  // --- Stepping --------------------------------------------------------------------------------

  function step(dt: number) {
    now += dt;
    stepQueue();
    stepDial(dt);
    stepHandle(dt);
    const ease = reduceMotion.matches ? 1 : 1 - Math.exp(-dt * 30);
    feedShown += (feed - feedShown) * ease;
    if (Math.abs(feed - feedShown) < 0.01) feedShown = feed;
    if (cutPress > 0) cutPress = Math.max(0, cutPress - dt / 0.22);
    stepLabels(dt);
    stepHeat(dt);
  }

  // --- The desk to start with ------------------------------------------------------------------

  function letter(kind: TapeKind, text: string, lead: number, tail: number) {
    const len = lead + text.length * PITCH + tail;
    const piece = createPiece(kind, len, Math.floor(Math.random() * 1e6));
    [...text].forEach((char, i) => {
      if (char !== " ")
        emboss(piece, lead + (i + 0.5) * PITCH, [{ char, dx: 0 }], 0.97);
    });
    return piece;
  }

  function seedDesk() {
    const top = -oy / s;
    const left = -ox / s;
    const right = (width - ox) / s;
    const span = right - left;
    const keys = letter("blue", "SPARE KEYS", 1.5, 1.6);
    const a = makeLabel(
      keys,
      left + span * 0.08 + keys.cols / RES / 2,
      top + 30,
      -0.05,
    );
    a.backing = true;
    relight(a);
    const hello = letter("black", "HELLO ★", 1.4, 1.4);
    const b = makeLabel(
      hello,
      left + span * 0.2 + hello.cols / RES / 2,
      top + 50,
      0.035,
    );
    b.backing = false;
    b.stuck = true;
    b.stuckAt = 0;
    relight(b);
    for (const label of [a, b]) {
      keepOnDesk(label);
      labels.push(label);
    }
  }

  // --- The loop --------------------------------------------------------------------------------

  let lastStats = "";
  let statsAt = 0;
  let frames = 0;
  let fpsSince = 0;
  let fps: number | null = null;

  function report(time: number) {
    frames++;
    if (time - fpsSince > 1000) {
      fps = Math.round((frames * 1000) / (time - fpsSince));
      frames = 0;
      fpsSince = time;
    }
    if (time - statsAt < 150) return;
    statsAt = time;
    const stats: LabelMakerStats = {
      letters: cells.length,
      reel: Math.max(0, reelLeft) / 1000,
      labels: labels.length,
      queued: queue.filter((c) => c !== CUT_NOW).length,
      fps,
    };
    const key = JSON.stringify(stats);
    if (key === lastStats) return;
    lastStats = key;
    onStats?.(stats);
  }

  let running = false;
  let visible = true;
  let frame = 0;
  let last = 0;

  function tick(time: number) {
    const dt = clamp((time - last) / 1000, 0, 1 / 20);
    last = time;
    if (width && height) {
      if (dt > 0) step(dt);
      render();
    }
    report(time);
    if (visible) frame = requestAnimationFrame(tick);
    else running = false;
  }

  function start() {
    if (running) return;
    running = true;
    last = performance.now();
    fpsSince = last;
    frames = 0;
    frame = requestAnimationFrame(tick);
  }

  const MAX_PIXELS = 4_200_000;

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
    layout();
    renderBackdrop();
    if (fontReady) renderDialFace();
    if (!running) render();
  }

  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  const intersection = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible) start();
  });
  intersection.observe(canvas);

  resize();
  start();

  // The type is drawn in the site's Barlow; wait for it so the first letters aren't a fallback.
  const fontFamily =
    getComputedStyle(document.documentElement)
      .getPropertyValue("--font-barlow")
      .trim() || "sans-serif";
  let disposed = false;
  const ready = () => {
    if (disposed) return;
    const probe = document.createElement("canvas").getContext("2d");
    let capRatio = 0.7;
    if (probe) {
      probe.font = `700 100px ${fontFamily}`;
      const measured = probe.measureText("H").actualBoundingBoxAscent / 100;
      if (measured > 0.4 && measured < 0.9) capRatio = measured;
    }
    setGlyphFont(fontFamily, capRatio);
    fontReady = true;
    renderDialFace();
    if (!labels.length) seedDesk();
  };
  Promise.all([
    document.fonts.load(`700 40px ${fontFamily}`),
    document.fonts.load(`600 40px ${fontFamily}`),
  ]).then(ready, ready);

  function loadReel(kind: TapeKind) {
    // Swapping reels takes the tape in the head with the old one, so anything already out of
    // the nose is cut off first.
    if (feed - CUT_GAP > 0.8 && cells.some((u) => u < feed - CUT_GAP)) cut();
    queue.length = 0;
    auto = null;
    strip = newStrip(kind);
    stripHeat = new Float32Array(STRIP_CAPACITY);
    feed = CUT_GAP;
    feedShown = CUT_GAP;
    cells = [];
    reelLeft = REEL_LENGTH;
  }

  return {
    setSettings(next: LabelMakerSettings) {
      const surface = next.surface !== settings.surface;
      const tape = next.tape !== settings.tape;
      settings = { ...next };
      voice.setEnabled(next.sound);
      if (surface) renderBackdrop();
      if (tape) loadReel(next.tape);
      if (!next.hotAir) nozzle = null;
    },
    // A fresh reel of the same tape.
    reload() {
      loadReel(settings.tape);
    },
    setNight(on: boolean) {
      if (on === night) return;
      night = on;
      if (!running) render();
    },
    wake() {
      voice.wake();
    },
    type(text: string) {
      type(text);
    },
    feedAndCut() {
      queue.push(FEED_CUT);
    },
    cut() {
      cut();
    },
    // From the keyboard: one notch either way.
    nudge(direction: number) {
      if (locked() || auto) return;
      manualGoal = (manualGoal ?? Math.round(phi)) + direction;
    },
    squeeze(on: boolean, source = "key") {
      squeeze(on, source);
    },
    backspace() {
      say(
        "backspace",
        "There’s no taking a letter back out of vinyl. Cut it off, or start a new label.",
        8,
      );
    },
    clearDesk() {
      labels.length = 0;
    },
    pointerDown(id: number, point: { x: number; y: number }): Pick {
      voice.wake();
      const { x, y } = toWorld(point.x, point.y);
      const onLever =
        x >= LEVER.x - 1 &&
        x <= LEVER.x + LEVER.w + 1 &&
        y >= LEVER.y - 1.5 &&
        y <= LEVER.y + LEVER.h;
      if (onLever) {
        cut();
        return "lever";
      }
      if (Math.hypot(x, y) <= DIAL_R + 0.5) {
        const angle = Math.atan2(y, x);
        drags.set(id, {
          kind: "dial",
          angle,
          offset: phi + angle / STEP,
          vel: 0,
        });
        manualGoal = null;
        return "dial";
      }
      if (onBody(x, y)) {
        squeeze(true, `pointer-${id}`);
        drags.set(id, { kind: "squeeze" });
        return "squeeze";
      }
      if (settings.hotAir) {
        nozzle = { x, y };
        drags.set(id, { kind: "blow" });
        return "blow";
      }
      const label = labelAt(x, y);
      if (label) {
        const side = trimSide(label, x, y);
        if (side) {
          trim(label, side);
          return "lever";
        }
        labels.splice(labels.indexOf(label), 1);
        labels.push(label);
        drags.set(id, {
          kind: "label",
          label,
          dx: label.x - x,
          dy: label.y - y,
          startX: x,
          startY: y,
          moved: false,
        });
        return "label";
      }
      return null;
    },
    pointerMove(id: number, point: { x: number; y: number }) {
      const drag = drags.get(id);
      const { x, y } = toWorld(point.x, point.y);
      if (settings.hotAir && (!drag || drag.kind === "blow")) nozzle = { x, y };
      if (!drag) return;
      if (drag.kind === "dial") {
        const angle = Math.atan2(y, x);
        let d = angle - drag.angle;
        d -= Math.round(d / (Math.PI * 2)) * Math.PI * 2;
        drag.angle += d;
        return;
      }
      if (drag.kind === "label") {
        const label = drag.label;
        if (!drag.moved && Math.hypot(x - drag.startX, y - drag.startY) > 1.2) {
          drag.moved = true;
          label.held = true;
          label.vx = 0;
          label.vy = 0;
          label.spin = 0;
          if (label.stuck) {
            // Peeling it up again: the adhesive never grips quite as well twice.
            label.stuck = false;
            label.adhesion *= 0.72;
            label.lift = [0, 0];
            voice.play("peel", 0.45, 1.3);
          }
        }
        if (drag.moved) {
          label.x = x + drag.dx;
          label.y = y + drag.dy;
        }
      }
    },
    pointerUp(id: number) {
      const drag = drags.get(id);
      drags.delete(id);
      if (!drag) return;
      if (drag.kind === "squeeze") squeeze(false, `pointer-${id}`);
      if (drag.kind === "dial") {
        phiV = clamp(drag.vel, -40, 40);
      }
      if (drag.kind === "label") {
        const label = drag.label;
        if (drag.moved) {
          label.held = false;
          keepOnDesk(label);
          if (!label.backing) {
            label.stuck = true;
            label.byHand = true;
            label.stuckAt = now;
            label.lift = [0, 0];
            voice.play("press", 0.4);
          } else {
            voice.play("land", 0.4);
          }
          return;
        }
        const double =
          lastTap && lastTap.label === label && now - lastTap.at < 0.4;
        lastTap = { label, at: now };
        if (label.stuck) pressDown(label);
        else if (double) peel(label);
        else {
          say(
            "peel-hint",
            "Double-click a label to crack its backing and peel it, then it sticks where it lies.",
          );
        }
      }
    },
    // What's under the pointer, for the cursor.
    hover(point: { x: number; y: number } | null) {
      if (!point) {
        if (settings.hotAir) nozzle = null;
        return "default";
      }
      const { x, y } = toWorld(point.x, point.y);
      if (
        x >= LEVER.x - 1 &&
        x <= LEVER.x + LEVER.w + 1 &&
        y >= LEVER.y - 1.5 &&
        y <= LEVER.y + LEVER.h
      ) {
        return "pointer";
      }
      if (Math.hypot(x, y) <= DIAL_R + 0.5) return "grab";
      if (onBody(x, y)) return "pointer";
      if (settings.hotAir) {
        nozzle = { x, y };
        return "none";
      }
      const label = labelAt(x, y);
      if (!label) return "default";
      if (trimSide(label, x, y)) return SCISSORS;
      return "grab";
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(frame);
      running = false;
      observer.disconnect();
      intersection.disconnect();
      voice.dispose();
    },
  };

  function onBody(x: number, y: number) {
    if (Math.hypot(x, y) <= HEAD_R) return true;
    if (
      x >= NOSE.x &&
      x <= NOSE.x + NOSE.w &&
      y >= NOSE.y &&
      y <= NOSE.y + NOSE.h
    )
      return true;
    if (Math.hypot(x - REEL.x, y - REEL.y) <= REEL.r) return true;
    if (x >= HANDLE.x && y >= HANDLE.y && y <= HANDLE.y + HANDLE.h + 14)
      return true;
    return false;
  }
}

export type LabelMaker = ReturnType<typeof createLabelMaker>;
