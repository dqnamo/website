// A manual typewriter seen from the typist's chair, drawn on a 2D canvas. The print point stays
// where it is, in the middle, and everything else moves past it: each letter hits the paper there,
// then the escapement lets the carriage step one letter to the left, so the line grows out to the
// left as you type. Eight spaces before the right margin a bell rings, and at the margin the
// carriage locks until it's returned. A return throws the line-space ratchet first, so the paper
// rolls up a line (or one and a half, or two), and then the carriage runs back to the left margin
// and knocks against its stop.
//
// The paper is a real sheet of A4 at 300 pixels to the inch, and every blow is printed into it as
// it happens (see type.ts): ink from the ribbon, a dent where the type pressed in, and now and
// then a hole. With a carbon and a second sheet behind it, the same blow, softened by the top
// sheet, prints a copy. Pull the sheet out to see it whole: under raking light the dents show
// (including any typing done with the ribbon out of the way, on stencil), and turned over, the
// back shows the letters raised and reversed, with the ink showing faintly through.
//
// There are few rules here beyond the machine's own. Two keys struck almost together jam their
// typebars at the type guide. There's no 1 and no ! on the keyboard. Dragging the paper is like
// holding the carriage release and the platen's free-turning knob together: nothing clicks into
// place, so you can type between the lines or over what's there.

import { createVoice, type Sound } from "./sound";
import {
  type Condition,
  createFibres,
  createMachine,
  DENT_H,
  DENT_SCALE,
  DENT_W,
  DPI,
  FIBRE_SIZE,
  GH,
  GW,
  INK,
  KEYS,
  LINE,
  type Machine,
  mulberry,
  ORIGIN_X,
  PITCH,
  type RibbonMode,
  SHEET_H,
  SHEET_W,
  setTypeFace,
  smoothstep,
  startingGunk,
  strike,
  BASE_Y,
} from "./type";

export type { Condition, RibbonMode } from "./type";

export type Ribbon = "fresh" | "worn" | "dry";
export type Touch = "light" | "even" | "heavy";
export type Paper = "bond" | "onionskin";
export type SheetView = "top" | "copy" | "carbon";

export type TypewriterSettings = {
  condition: Condition;
  ribbon: Ribbon;
  mode: RibbonMode;
  touch: Touch;
  spacing: 1 | 1.5 | 2;
  paper: Paper;
  carbon: boolean;
  sound: boolean;
  view: SheetView;
  flipped: boolean;
  raking: boolean;
};

export const DEFAULT_SETTINGS: TypewriterSettings = {
  condition: "used",
  ribbon: "fresh",
  mode: "black",
  touch: "even",
  spacing: 1,
  paper: "bond",
  carbon: false,
  sound: true,
  view: "top",
  flipped: false,
  raking: false,
};

export type TypewriterStats = {
  column: number;
  line: number;
  letters: number;
  out: boolean;
  copy: boolean;
  jammed: boolean;
  typing: boolean;
  clogged: number;
  ink: number;
};

export type Pick = "paper" | "jam" | "lever" | "sheet" | null;

// The carriage, in letters from the left edge of the paper: an inch of margin either side of a
// sixty-two letter line, the bell eight letters before the end.
const LEFT_MARGIN = 10;
const RIGHT_MARGIN = 72;
const BELL = RIGHT_MARGIN - 8;
const COLUMNS = Math.floor(SHEET_W / PITCH);
const TAB = 5;
// The first line sits an inch down, and nothing types closer than a sixth of an inch to the foot.
const FIRST_LINE = 340;
const LAST_LINE = SHEET_H - 60;
// Two keys within this many milliseconds and their bars meet at the type guide.
const JAM_MS = 32;

const TOUCH: Record<Touch, number> = { light: 0.72, even: 1, heavy: 1.32 };
const RIBBONS: Record<Ribbon, number> = { fresh: 1, worn: 0.55, dry: 0.24 };
const WEAKNESS: Record<Paper, number> = { bond: 1, onionskin: 1.6 };

type Rgb = [number, number, number];
const BODIES: Record<Condition, { body: Rgb; crackle: number }> = {
  new: { body: [230, 223, 205], crackle: 0 },
  used: { body: [120, 137, 116], crackle: 0 },
  battered: { body: [42, 40, 38], crackle: 1 },
};

const rgb = ([r, g, b]: Rgb, k = 1, a = 1) =>
  `rgba(${Math.round(Math.min(255, r * k))},${Math.round(Math.min(255, g * k))},${Math.round(Math.min(255, b * k))},${a})`;

type Action =
  | { kind: "char"; char: string; wait: number; auto: boolean }
  | { kind: "space" | "back" | "return" | "tab"; wait: number; auto: boolean };

type Hole = { x: number; y: number; r: number; seed: number };

type Sheet = {
  ink: HTMLCanvasElement;
  inkCtx: CanvasRenderingContext2D;
  copy: HTMLCanvasElement | null;
  copyCtx: CanvasRenderingContext2D | null;
  dents: Float32Array;
  holes: Hole[];
  paper: Paper;
  letters: number;
  version: number;
};

type Bar = { basket: number; char: string; age: number };

const SAMPLE = `Dear Ruth,

Thank you for the new ribbon. The old one had worn so thin that every page came out grey, and the e and the a had filled in solid, so I gave the type a good scrub with the brush as well.

Do mind the full stops. On thin paper they go straight through if I hit them hard, and I always hit them hard!

The 1st chapter is in the post.

With love,
Tom`;

export function createTypewriter(
  canvas: HTMLCanvasElement,
  options: {
    onStats?: (stats: TypewriterStats) => void;
    onNote?: (text: string) => void;
  } = {},
) {
  const maybe = canvas.getContext("2d");
  if (!maybe) throw new Error("No 2D canvas");
  const ctx: CanvasRenderingContext2D = maybe;
  const voice = createVoice();
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const random = mulberry(Date.now() % 100000);
  const fibres = createFibres();

  let settings = { ...DEFAULT_SETTINGS };
  let machine: Machine = createMachine(settings.condition);
  let gunk = startingGunk(machine);
  // What's left on each half of the ribbon, and where along it the type is landing.
  let ribbon = {
    black: RIBBONS[settings.ribbon],
    red: RIBBONS[settings.ribbon],
  };
  let ribbonAt = 0;
  const ribbonPatches = Array.from(
    { length: 64 },
    () => 0.86 + random() * 0.28,
  );

  let night = false;
  let fontReady = false;
  let disposed = false;

  // The sheet in the machine.
  let sheet: Sheet = newSheet(settings.paper, settings.carbon);
  let col = LEFT_MARGIN;
  let line = FIRST_LINE;
  let shownCol = col;
  let shownLine = line;
  let state: "feeding" | "in" | "pulling" | "out" = "feeding";
  let stateAt = 0;
  let outFade = 1;
  let returning: { from: number; to: number; at: number; time: number } | null =
    null;

  const queue: Action[] = [];
  let nextAt = 0;
  let typing = false;
  const bars: Bar[] = [];
  let jam: [number, number] | null = null;
  let lastStrike: { at: number; slug: string; basket: number } | null = null;
  let lift = 0;
  // A magnifier over the sheet on the desk, where the pointer is.
  let loupe: { x: number; y: number } | null = null;
  let drag: {
    id: number;
    x: number;
    y: number;
    col: number;
    line: number;
    moved: boolean;
  } | null = null;
  const said = new Set<string>();

  // The canvas.
  let width = 0;
  let height = 0;
  let ratio = 1;
  let dirty = true;
  let running = false;
  let visible = true;
  let frame = 0;
  let last = 0;
  let clock = 0;

  // Tiles and caches.
  const patch = document.createElement("canvas");
  patch.width = GW;
  patch.height = GH;
  const patchCtx = patch.getContext("2d") as CanvasRenderingContext2D;
  const fibreTile = makeFibreTile(false);
  const rakingTile = makeFibreTile(true);
  let crackle: HTMLCanvasElement | null = null;
  let shading: {
    canvas: HTMLCanvasElement;
    version: number;
    flipped: boolean;
  } | null = null;

  function makeFibreTile(raking: boolean) {
    const tile = document.createElement("canvas");
    tile.width = FIBRE_SIZE;
    tile.height = FIBRE_SIZE;
    const tctx = tile.getContext("2d") as CanvasRenderingContext2D;
    const image = tctx.createImageData(FIBRE_SIZE, FIBRE_SIZE);
    for (let i = 0; i < fibres.length; i++) {
      // Raking light picks out the paper's tooth far more than flat light does.
      const v = 254 + (fibres[i] - 0.55) * (raking ? 26 : 8);
      const c = Math.max(0, Math.min(255, v));
      image.data[i * 4] = c;
      image.data[i * 4 + 1] = c;
      image.data[i * 4 + 2] = c * 0.99;
      image.data[i * 4 + 3] = 255;
    }
    tctx.putImageData(image, 0, 0);
    return tile;
  }

  // The paper's grain, multiplied over a box: the tile laid twice, the second time turned and
  // stretched, so its repeat doesn't show.
  function grain(
    target: CanvasRenderingContext2D,
    tile: HTMLCanvasElement,
    s: number,
    ox: number,
    oy: number,
    x: number,
    y: number,
    w: number,
    h: number,
  ) {
    const first = target.createPattern(tile, "repeat");
    const second = target.createPattern(tile, "repeat");
    if (!first || !second) return;
    first.setTransform(new DOMMatrix([s, 0, 0, s, ox, oy]));
    second.setTransform(
      new DOMMatrix([0, s * 1.37, -s * 1.37, 0, ox + 211 * s, oy + 97 * s]),
    );
    target.fillStyle = first;
    target.fillRect(x, y, w, h);
    target.fillStyle = second;
    target.fillRect(x, y, w, h);
  }

  function newSheet(paper: Paper, carbon: boolean): Sheet {
    const ink = document.createElement("canvas");
    ink.width = SHEET_W;
    ink.height = SHEET_H;
    const inkCtx = ink.getContext("2d") as CanvasRenderingContext2D;
    inkCtx.fillStyle = "#fff";
    inkCtx.fillRect(0, 0, SHEET_W, SHEET_H);
    let copy: HTMLCanvasElement | null = null;
    let copyCtx: CanvasRenderingContext2D | null = null;
    if (carbon) {
      // The copy is softer than the top sheet, so it's kept at half the resolution.
      copy = document.createElement("canvas");
      copy.width = SHEET_W / 2;
      copy.height = Math.ceil(SHEET_H / 2);
      copyCtx = copy.getContext("2d");
    }
    return {
      ink,
      inkCtx,
      copy,
      copyCtx,
      dents: new Float32Array(DENT_W * DENT_H),
      holes: [],
      paper,
      letters: 0,
      version: 0,
    };
  }

  function say(key: string, text: string, again = false) {
    if (!again && said.has(key)) return;
    said.add(key);
    options.onNote?.(text);
  }

  let statsAt = 0;
  let statsDirty = true;
  function report(now: number, force = false) {
    if (!options.onStats || (!statsDirty && !force)) return;
    if (!force && now - statsAt < 100) return;
    statsAt = now;
    statsDirty = false;
    let clogged = 0;
    for (const value of gunk.values()) clogged = Math.max(clogged, value);
    options.onStats({
      column: col,
      line: Math.round((line - FIRST_LINE) / LINE) + 1,
      letters: sheet.letters,
      out: state === "out" || state === "pulling",
      copy: Boolean(sheet.copy),
      jammed: Boolean(jam),
      typing,
      clogged,
      ink: settings.mode === "red" ? ribbon.red : ribbon.black,
    });
  }

  function changed() {
    dirty = true;
    statsDirty = true;
  }

  function play(kind: Sound, level = 1, rate = 1, delay = 0) {
    voice.play(kind, level, rate, delay);
  }

  // -------------------------------------------------------------------------------------------
  // The machine's actions.

  function advance() {
    col += 1;
    play("tick", 0.5, 1, 0.012);
    if (col === BELL) {
      play("bell", 0.55, 1, 0.02);
      say(
        "bell",
        "Ding: the bell rings eight letters before the margin, in time to finish the word (or hyphenate it) and return the carriage.",
      );
    }
    if (col === RIGHT_MARGIN) {
      say(
        "margin",
        "The carriage has reached the margin stop and the keys are locked. Return it (Enter), or backspace.",
      );
    }
  }

  function typeChar(raw: string, now: number, auto: boolean) {
    if (state !== "in") {
      play("thud", 0.5);
      if (state === "out")
        say(
          "out",
          "The sheet’s out of the machine. Feed a new one to type again.",
        );
      return;
    }
    if (jam) {
      play("thud", 0.6);
      say(
        "jammed",
        "The typebars are still jammed together. Click them (or press Backspace) to part them.",
        true,
      );
      return;
    }
    let char = raw;
    if (char === "1") {
      char = "l";
      say(
        "one",
        "There’s no 1 on this keyboard. Typists used a lower-case l, which is what it printed.",
      );
    }
    if (char === "!") {
      say(
        "bang",
        "There’s no ! either. The machine types an apostrophe, backspaces and strikes a full stop under it.",
      );
      queue.unshift(
        { kind: "char", char: "'", wait: 0, auto: true },
        { kind: "back", wait: 0.12, auto: true },
        { kind: "char", char: ".", wait: 0.14, auto: true },
      );
      return;
    }
    const key = KEYS.get(char);
    if (!key) {
      play("thud", 0.3);
      say(`missing ${char}`, `There’s no ${char} key on this machine.`);
      return;
    }
    if (col >= RIGHT_MARGIN) {
      play("thud", 0.6);
      return;
    }
    if (line > LAST_LINE) {
      play("thud", 0.6);
      say(
        "foot",
        "That’s the foot of the sheet. Pull it out, and feed another.",
      );
      return;
    }
    if (
      !auto &&
      lastStrike &&
      now - lastStrike.at < JAM_MS &&
      lastStrike.slug !== key.slug
    ) {
      jam = [lastStrike.basket, key.basket];
      play("jam", 0.8);
      say(
        "jam",
        "Two keys at once: their typebars met at the type guide and jammed. Click them (or press Backspace) to part them.",
        true,
      );
      changed();
      return;
    }
    if (!fontReady) {
      queue.push({ kind: "char", char, wait: 0, auto });
      return;
    }
    const force =
      TOUCH[settings.touch] *
      key.strength *
      Math.max(0.6, 1 + (random() + random() + random() - 1.5) * 0.12);
    imprint(char, force);
    lastStrike = { at: now, slug: key.slug, basket: key.basket };
    if (!reduceMotion.matches) bars.push({ basket: key.basket, char, age: 0 });
    play("strike", 0.35 + 0.5 * Math.min(1.3, force), 0.94 + force * 0.08);
    advance();
    changed();
  }

  function imprint(char: string, force: number) {
    const x0 = Math.round(col * PITCH - ORIGIN_X);
    const y0 = Math.round(line) - BASE_Y;
    const patchy =
      ribbonPatches[Math.floor(ribbonAt / 9) % ribbonPatches.length];
    ribbonAt += 1;
    const impression = strike(
      {
        char,
        machine,
        force,
        mode: settings.mode,
        ink: { black: ribbon.black * patchy, red: ribbon.red * patchy },
        gunk: gunk.get(char) ?? 0,
        weakness: WEAKNESS[sheet.paper],
        sheetX: x0,
        sheetY: y0,
        carbon: Boolean(sheet.copy),
        random,
      },
      fibres,
    );

    patchCtx.putImageData(impression.ink, 0, 0);
    sheet.inkCtx.globalCompositeOperation = "multiply";
    sheet.inkCtx.drawImage(patch, x0, y0);
    sheet.inkCtx.globalCompositeOperation = "source-over";

    if (impression.copy && sheet.copyCtx) {
      const image = new ImageData(GW, GH);
      const [r, g, b] = INK.carbon;
      for (let i = 0; i < impression.copy.length; i++) {
        image.data[i * 4] = r;
        image.data[i * 4 + 1] = g;
        image.data[i * 4 + 2] = b;
        image.data[i * 4 + 3] = Math.round(
          Math.min(1, impression.copy[i]) * 255,
        );
      }
      patchCtx.putImageData(image, 0, 0);
      sheet.copyCtx.drawImage(patch, x0 / 2, y0 / 2, GW / 2, GH / 2);
    }

    // The dent: pressure pushes the paper into the rubber, up to a point.
    for (let y = 0; y < GH; y++) {
      const sy = y0 + y;
      if (sy < 0 || sy >= SHEET_H) continue;
      for (let x = 0; x < GW; x++) {
        const p = impression.press[y * GW + x];
        if (!p) continue;
        const sx = x0 + x;
        if (sx < 0 || sx >= SHEET_W) continue;
        const i =
          Math.floor(sy / DENT_SCALE) * DENT_W + Math.floor(sx / DENT_SCALE);
        sheet.dents[i] = Math.min(
          2.4,
          sheet.dents[i] + Math.min(p, 2.5) * 0.16,
        );
      }
    }

    if (impression.hole) {
      const { hole } = impression;
      sheet.holes.push({ ...hole, x: x0 + hole.x, y: y0 + hole.y });
      say(
        "hole",
        sheet.paper === "onionskin"
          ? "Straight through the onionskin. A full stop takes the same blow as any letter on a face a tenth the size, so the pressure under it is many times higher."
          : "That one went through the paper. A full stop takes the same blow as an n on a tenth of the face, so it presses many times harder.",
      );
    }

    if (settings.mode === "stencil") {
      say(
        "stencil",
        "On stencil the ribbon stays down, so the type hits the paper bare: no ink, just dents. Pull the sheet out and look at it under raking light.",
      );
    } else if (impression.halves.bare && settings.mode === "black") {
      say(
        "bare",
        "This machine’s ribbon vibrator doesn’t lift quite high enough, so the tops of tall letters miss the ribbon and print faint.",
      );
    } else if (settings.mode === "red" && impression.halves.black) {
      say(
        "black tops",
        "Red letters with black tops: the vibrator lifts the ribbon short, so the top of anything tall still catches the black half.",
      );
    }

    // Ink and fluff work into the type's enclosed corners, faster off a wet ribbon.
    const g = gunk.get(char) ?? 0;
    const wet = settings.mode === "stencil" ? 0.2 : 0.5 + ribbon.black * 0.7;
    const next = g + machine.gunkRate * wet * (1 - g);
    gunk.set(char, next);
    if (g < 0.55 && next >= 0.55 && /[aeo]/.test(char)) {
      say(
        "clogged",
        `The ${char} is filling in: ink and paper fluff pack into the eye of the type. Clean the type to clear it.`,
      );
    }
    const used = 0.00004 * (settings.mode === "stencil" ? 0 : 1);
    if (settings.mode === "red") ribbon.red = Math.max(0.05, ribbon.red - used);
    else ribbon.black = Math.max(0.05, ribbon.black - used);

    sheet.letters += 1;
    sheet.version += 1;
    if (sheet.letters === 160) {
      say(
        "fingers",
        "Look at the a, q, z and p. Touch typists strike them with their little fingers, which hit lightest, so they print paler than the rest.",
      );
    }
  }

  function space() {
    if (state !== "in") return;
    if (jam || col >= RIGHT_MARGIN) {
      play("thud", 0.5);
      return;
    }
    play("space", 0.55);
    advance();
    changed();
  }

  function backspace() {
    if (state !== "in") return;
    if (jam) {
      unjam();
      return;
    }
    if (col <= 0) return;
    col -= 1;
    play("tick", 0.6, 0.8);
    changed();
  }

  function tab() {
    if (state !== "in" || jam) return;
    const stop =
      LEFT_MARGIN + TAB * (Math.floor((col - LEFT_MARGIN) / TAB) + 1);
    if (stop >= RIGHT_MARGIN || col < LEFT_MARGIN) return;
    col = stop;
    play("zip", 0.35, 1.6);
    play("stop", 0.25, 1.4, 0.08);
    changed();
  }

  function carriageReturn() {
    if (state !== "in") return;
    if (jam) {
      play("thud", 0.5);
      return;
    }
    const feed = settings.spacing * LINE;
    if (line + feed <= LAST_LINE + LINE) line += feed;
    const clicks = settings.spacing * 2;
    for (let i = 0; i < clicks; i++) play("ratchet", 0.5, 1, i * 0.035);
    const distance = col - LEFT_MARGIN;
    if (distance > 0) {
      const time = reduceMotion.matches ? 0 : 0.09 + 0.0045 * distance;
      returning = { from: col, to: LEFT_MARGIN, at: clock + 0.07, time };
      play("run", Math.min(1, 0.4 + distance / 60), 1, 0.06);
      play("stop", 0.7, 1, 0.07 + time);
    }
    col = LEFT_MARGIN;
    changed();
  }

  function unjam() {
    if (!jam) return;
    jam = null;
    lastStrike = null;
    play("tick", 0.6, 0.6);
    play("thud", 0.4, 1.2, 0.04);
    changed();
  }

  function roll(lines: number) {
    if (state !== "in") return;
    const next = Math.max(40, Math.min(LAST_LINE, line + lines * LINE));
    if (next === line) return;
    line = next;
    play("ratchet", 0.45, 1.1);
    changed();
  }

  // A fresh sheet rolled in, unless the one in hand is still blank and of the right kind.
  function feed(fresh = true) {
    if (fresh) sheet = newSheet(settings.paper, settings.carbon);
    shading = null;
    col = LEFT_MARGIN;
    line = FIRST_LINE;
    shownCol = col;
    returning = null;
    jam = null;
    queue.length = 0;
    typing = false;
    if (reduceMotion.matches) {
      state = "in";
      shownLine = line;
    } else {
      state = "feeding";
      stateAt = clock;
      shownLine = -260;
      play("zip", 0.5, 1);
      play("zip", 0.5, 0.9, 0.28);
    }
    changed();
  }

  function pullOut() {
    if (state !== "in") return;
    queue.length = 0;
    typing = false;
    jam = null;
    shading = null;
    play("zip", 0.6, 1.2);
    play("rustle", 0.6, 1, 0.3);
    if (reduceMotion.matches) {
      state = "out";
      outFade = 1;
    } else {
      state = "pulling";
      stateAt = clock;
    }
    changed();
  }

  function run(action: Action, now: number) {
    switch (action.kind) {
      case "char":
        typeChar(action.char, now, action.auto);
        break;
      case "space":
        space();
        break;
      case "back":
        backspace();
        break;
      case "return":
        carriageReturn();
        break;
      case "tab":
        tab();
        break;
    }
  }

  // Lays the sample letter out the way a typist would, returning at the bell when the next word
  // won't fit, and queues it at a typist's pace.
  function demo() {
    if (state === "out") feed();
    queue.length = 0;
    typing = true;
    const words = SAMPLE.split(/(\n| )/);
    let at = col;
    const push = (action: Action) => queue.push(action);
    let wait = 0.5;
    if (col !== LEFT_MARGIN) {
      push({ kind: "return", wait, auto: true });
      at = LEFT_MARGIN;
      wait = 0.6;
    }
    let pending = false;
    for (const word of words) {
      if (word === "\n") {
        push({ kind: "return", wait: wait + 0.35, auto: true });
        at = LEFT_MARGIN;
        pending = false;
        wait = 0.5;
        continue;
      }
      if (word === " ") {
        pending = true;
        continue;
      }
      if (!word) continue;
      const length = word.length;
      if (pending && at + 1 + length > RIGHT_MARGIN) {
        push({ kind: "return", wait: wait + 0.3, auto: true });
        at = LEFT_MARGIN;
        wait = 0.45;
        pending = false;
      }
      if (pending) {
        push({ kind: "space", wait: 0.1 + random() * 0.06, auto: true });
        at += 1;
        pending = false;
      }
      for (const char of word) {
        push({
          kind: "char",
          char,
          wait: wait + 0.06 + random() * 0.09,
          auto: true,
        });
        wait = /[.,]/.test(char) ? 0.22 : 0;
        at += 1;
      }
    }
    nextAt = clock;
    changed();
  }

  function cleanType() {
    for (const key of gunk.keys()) gunk.set(key, 0);
    play("brush", 0.8);
    changed();
  }

  // -------------------------------------------------------------------------------------------
  // Time.

  function step(dt: number, now: number) {
    clock += dt;
    // Queued strokes: the sample letter, composed characters, and keys pressed while the carriage
    // was still running back.
    while (
      fontReady &&
      queue.length &&
      clock >= nextAt &&
      !returning &&
      state === "in"
    ) {
      const action = queue[0];
      if (clock < nextAt + action.wait) break;
      queue.shift();
      run(action, now);
      nextAt = clock;
      if (!queue.length && typing) {
        typing = false;
        statsDirty = true;
      }
    }

    // The escapement moves the carriage a letter in a few milliseconds; a returning carriage runs
    // back under the typist's push and stops dead at the margin.
    if (returning) {
      const t = (clock - returning.at) / Math.max(returning.time, 1e-3);
      if (t >= 1 || returning.time === 0) {
        shownCol = returning.to;
        returning = null;
      } else if (t > 0) {
        const e = 1 - (1 - t) ** 1.6;
        shownCol = returning.from + (returning.to - returning.from) * e;
      }
      dirty = true;
    } else if (shownCol !== col) {
      const k = reduceMotion.matches ? 1 : 1 - Math.exp(-dt * 70);
      shownCol += (col - shownCol) * k;
      if (Math.abs(col - shownCol) < 0.003) shownCol = col;
      dirty = true;
    }

    if (state === "feeding") {
      const t = Math.min(1, (clock - stateAt) / 0.85);
      const e = smoothstep(0, 1, t);
      shownLine = -260 + (line + 260) * e;
      if (t >= 1) {
        state = "in";
        shownLine = line;
        nextAt = clock;
      }
      dirty = true;
    } else if (state === "pulling") {
      const t = Math.min(1, (clock - stateAt) / 0.7);
      shownLine = line + (SHEET_H + 400 - line) * t * t;
      if (t >= 1) {
        state = "out";
        stateAt = clock;
        outFade = 0;
        statsDirty = true;
      }
      dirty = true;
    } else if (state === "out" && outFade < 1) {
      outFade = Math.min(1, (clock - stateAt) / 0.35);
      dirty = true;
    } else if (shownLine !== line) {
      const k = reduceMotion.matches ? 1 : 1 - Math.exp(-dt * 30);
      shownLine += (line - shownLine) * k;
      if (Math.abs(line - shownLine) < 0.05) shownLine = line;
      dirty = true;
    }

    // Typebars in flight, and the vibrator lifting the ribbon with them.
    let up = 0;
    for (const bar of bars) {
      bar.age += dt;
      up = Math.max(up, swing(bar.age));
    }
    for (let i = bars.length - 1; i >= 0; i--) {
      if (bars[i].age > 0.09) bars.splice(i, 1);
    }
    if (bars.length) dirty = true;
    const nextLift =
      settings.mode === "stencil" ? 0 : Math.max(up, lift - dt * 9);
    if (nextLift !== lift) {
      lift = Math.max(0, nextLift);
      dirty = true;
    }
  }

  // How far up a typebar is, 0 at rest to 1 on the paper, at a given age.
  function swing(age: number) {
    if (age < 0.026) return smoothstep(0, 1, age / 0.026);
    return Math.max(0, 1 - smoothstep(0, 1, (age - 0.026) / 0.05));
  }

  function tick(time: number) {
    frame = 0;
    const dt = Math.min(0.05, Math.max(0, (time - last) / 1000));
    last = time;
    step(dt, time);
    if (dirty && width && height) {
      render();
      dirty = false;
    }
    report(time);
    if (visible && !disposed) frame = requestAnimationFrame(tick);
    else running = false;
  }

  function start() {
    if (running || disposed) return;
    running = true;
    last = performance.now();
    frame = requestAnimationFrame(tick);
  }

  // -------------------------------------------------------------------------------------------
  // Drawing the machine.

  // Layout, in CSS pixels: how big a letter is on screen, and where the print point sits.
  function view() {
    const cell = Math.max(12.5, Math.min(21, width / 34));
    const s = cell / PITCH;
    const inch = s * DPI;
    return { s, inch, px: width / 2, py: Math.round(height * 0.58) };
  }

  function render() {
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    if (state === "out") {
      renderDesk();
      if (outFade < 1) {
        ctx.globalAlpha = 1 - outFade;
        renderMachine();
        ctx.globalAlpha = 1;
      }
    } else {
      renderMachine();
    }
  }

  function renderMachine() {
    const { s, inch, px, py } = view();
    const W = width;
    const H = height;
    const ox = px - (shownCol + 0.5) * PITCH * s;
    const oy = py - shownLine * s;
    const body = BODIES[machine.condition].body;

    // The wall behind, and the paper table the sheet leans back against.
    const wall = ctx.createLinearGradient(0, 0, 0, py);
    if (night) {
      wall.addColorStop(0, "#1f1a16");
      wall.addColorStop(1, "#15120f");
    } else {
      wall.addColorStop(0, "#d9d4c9");
      wall.addColorStop(1, "#c6c0b3");
    }
    ctx.fillStyle = wall;
    ctx.fillRect(0, 0, W, H);

    const carriageL = ox - 1.25 * inch;
    const carriageR = ox + SHEET_W * s + 1.25 * inch;
    const platenTop = py - 0.62 * inch;
    const platenBottom = py + 0.62 * inch;

    // The paper table: a curved plate of enamelled steel behind the platen, leaning back, that
    // the sheet rests against as it comes up.
    const tableTop = platenTop - 1.9 * inch;
    const tableL = carriageL + 0.7 * inch;
    const tableW = carriageR - carriageL - 1.4 * inch;
    const table = ctx.createLinearGradient(0, tableTop, 0, platenTop);
    table.addColorStop(0, rgb(body, 0.95));
    table.addColorStop(0.08, rgb(body, 0.8));
    table.addColorStop(1, rgb(body, 0.42));
    ctx.fillStyle = table;
    roundRect(tableL, tableTop, tableW, platenTop - tableTop + 4, 0.25 * inch);
    ctx.fill();
    ctx.strokeStyle = rgb(body, 1.3, 0.6);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(tableL + 0.25 * inch, tableTop + 0.5);
    ctx.lineTo(tableL + tableW - 0.25 * inch, tableTop + 0.5);
    ctx.stroke();

    // The platen: hard black rubber, a soft highlight along its top.
    const platen = ctx.createLinearGradient(0, platenTop, 0, platenBottom);
    platen.addColorStop(0, "#0c0c0c");
    platen.addColorStop(0.18, "#3a3937");
    platen.addColorStop(0.3, "#262524");
    platen.addColorStop(0.7, "#141413");
    platen.addColorStop(1, "#050505");
    ctx.fillStyle = platen;
    ctx.fillRect(
      carriageL,
      platenTop,
      carriageR - carriageL,
      platenBottom - platenTop,
    );

    drawPaper(ox, oy, s, inch, py, platenTop);

    // The paper bail and its scale, carried with the platen.
    const bailY = py - 0.5 * inch;
    const scaleTop = bailY - 0.13 * inch;
    const scaleL = Math.max(ox - 0.4 * inch, -10);
    const scaleR = Math.min(ox + SHEET_W * s + 0.4 * inch, W + 10);
    if (scaleR > scaleL) {
      ctx.fillStyle = night ? "#d8d0bd" : "#ece6d6";
      ctx.fillRect(scaleL, scaleTop, scaleR - scaleL, 0.1 * inch);
      ctx.fillStyle = "rgba(40,36,30,0.75)";
      ctx.font = `600 ${Math.max(7, 0.062 * inch)}px ui-sans-serif, system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (let c = 0; c <= COLUMNS; c++) {
        const x = ox + (c + 0.5) * PITCH * s;
        if (x < -20 || x > W + 20) continue;
        if (c % 10 === 0) {
          ctx.fillText(String(c), x, scaleTop + 0.055 * inch);
        } else {
          const tall = c % 5 === 0 ? 0.045 : 0.025;
          ctx.fillRect(
            x - 0.5,
            scaleTop + 0.1 * inch - tall * inch,
            1,
            tall * inch,
          );
        }
      }
      // The margin stops, set at an inch each side.
      ctx.fillStyle = "#b8352f";
      for (const c of [LEFT_MARGIN, RIGHT_MARGIN]) {
        const x = ox + c * PITCH * s;
        ctx.beginPath();
        ctx.moveTo(x - 0.035 * inch, scaleTop - 0.05 * inch);
        ctx.lineTo(x + 0.035 * inch, scaleTop - 0.05 * inch);
        ctx.lineTo(x, scaleTop + 0.01 * inch);
        ctx.fill();
      }
    }
    chromeBar(
      carriageL + 0.5 * inch,
      bailY - 0.025 * inch,
      carriageR - carriageL - inch,
      0.05 * inch,
    );
    for (const at of [1.3, SHEET_W / DPI - 1.3]) {
      const x = ox + at * inch;
      if (x < -inch || x > W + inch) continue;
      const roller = ctx.createLinearGradient(
        0,
        bailY - 0.08 * inch,
        0,
        bailY + 0.08 * inch,
      );
      roller.addColorStop(0, "#2b2a28");
      roller.addColorStop(0.35, "#4a4845");
      roller.addColorStop(1, "#0f0f0e");
      ctx.fillStyle = roller;
      roundRect(
        x - 0.25 * inch,
        bailY - 0.08 * inch,
        0.5 * inch,
        0.16 * inch,
        0.05 * inch,
      );
      ctx.fill();
    }

    // The ends of the carriage: knobs, end plates, and the return lever on the left.
    for (const side of [-1, 1]) {
      const edge = side < 0 ? carriageL : carriageR;
      if (edge < -1.5 * inch || edge > W + 1.5 * inch) continue;
      const plateX = side < 0 ? edge : edge - 0.28 * inch;
      const plate = ctx.createLinearGradient(
        plateX,
        0,
        plateX + 0.28 * inch,
        0,
      );
      plate.addColorStop(0, rgb(body, 0.75));
      plate.addColorStop(0.4, rgb(body, 1.08));
      plate.addColorStop(1, rgb(body, 0.6));
      ctx.fillStyle = plate;
      roundRect(plateX, py - 0.95 * inch, 0.28 * inch, 1.7 * inch, 0.08 * inch);
      ctx.fill();
      const knobX = side < 0 ? edge - 0.55 * inch : edge;
      const knob = ctx.createLinearGradient(
        0,
        py - 0.75 * inch,
        0,
        py + 0.75 * inch,
      );
      knob.addColorStop(0, "#111");
      knob.addColorStop(0.25, "#3b3936");
      knob.addColorStop(0.55, "#1b1a19");
      knob.addColorStop(1, "#050505");
      ctx.fillStyle = knob;
      roundRect(knobX, py - 0.75 * inch, 0.55 * inch, 1.5 * inch, 0.12 * inch);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.07)";
      ctx.lineWidth = 1;
      for (let k = 1; k < 8; k++) {
        const x = knobX + (k / 8) * 0.55 * inch;
        ctx.beginPath();
        ctx.moveTo(x, py - 0.7 * inch);
        ctx.lineTo(x, py + 0.7 * inch);
        ctx.stroke();
      }
      if (side < 0) {
        const lever = leverGeometry(carriageL, py, inch);
        ctx.lineCap = "round";
        ctx.strokeStyle = "#5f5e5b";
        ctx.lineWidth = 0.1 * inch;
        ctx.beginPath();
        ctx.moveTo(lever.x0, lever.y0);
        ctx.quadraticCurveTo(lever.cx, lever.cy, lever.x1, lever.y1);
        ctx.stroke();
        ctx.strokeStyle = "#d9d9d5";
        ctx.lineWidth = 0.05 * inch;
        ctx.stroke();
        ctx.fillStyle = "#c9c8c4";
        roundRect(
          lever.x1 - 0.32 * inch,
          lever.y1 - 0.09 * inch,
          0.42 * inch,
          0.18 * inch,
          0.06 * inch,
        );
        ctx.fill();
        ctx.lineCap = "butt";
      }
    }

    drawRibbon(px, py, inch);

    // The card holder: two clear fingers either side of the print point, marked at the baseline
    // and at the centre of the letter.
    ctx.fillStyle = "rgba(240,244,248,0.07)";
    ctx.strokeStyle = "rgba(255,255,255,0.3)";
    ctx.lineWidth = 1;
    for (const side of [-1, 1]) {
      const x = px + side * 0.08 * inch;
      roundRect(
        side < 0 ? x - 0.42 * inch : x,
        py + 0.025 * inch,
        0.42 * inch,
        0.1 * inch,
        0.03 * inch,
      );
      ctx.fill();
      ctx.stroke();
    }
    ctx.fillStyle = "rgba(190,40,40,0.8)";
    ctx.fillRect(px - 0.6, py + 0.025 * inch, 1.2, 0.06 * inch);

    drawCover(px, py, inch, body);
    drawBars(px, py, inch);

    light(W * 0.62, py * 0.55);
  }

  // Light: a window to the left by day; at night a lamp over the right shoulder, centred on x, y.
  function light(x: number, y: number) {
    const W = width;
    const H = height;
    ctx.globalCompositeOperation = "multiply";
    if (night) {
      const lamp = ctx.createRadialGradient(
        x,
        y,
        0,
        x,
        y,
        Math.max(W, H) * 0.95,
      );
      lamp.addColorStop(0, "rgb(255,232,196)");
      lamp.addColorStop(0.45, "rgb(196,164,128)");
      lamp.addColorStop(1, "rgb(46,38,32)");
      ctx.fillStyle = lamp;
    } else {
      const window = ctx.createLinearGradient(0, 0, W, H);
      window.addColorStop(0, "rgb(255,255,255)");
      window.addColorStop(1, "rgb(214,211,204)");
      ctx.fillStyle = window;
    }
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = "source-over";
  }

  function leverGeometry(carriageL: number, py: number, inch: number) {
    return {
      x0: carriageL + 0.12 * inch,
      y0: py - 0.8 * inch,
      cx: carriageL - 0.25 * inch,
      cy: py - 1.4 * inch,
      x1: carriageL - 0.95 * inch,
      y1: py - 1.55 * inch,
    };
  }

  function drawPaper(
    ox: number,
    oy: number,
    s: number,
    inch: number,
    py: number,
    platenTop: number,
  ) {
    const W = width;
    const clipBottom = py + 0.55 * inch;
    const top = Math.max(oy, -2);
    const bottom = Math.min(oy + SHEET_H * s, clipBottom);
    const left = Math.max(ox, -2);
    const right = Math.min(ox + SHEET_W * s, W + 2);
    if (bottom <= top || right <= left) return;

    ctx.save();
    ctx.beginPath();
    ctx.rect(left, top, right - left, bottom - top);
    ctx.clip();
    // Onionskin is thin enough for the platen and the paper table to darken it.
    ctx.globalAlpha = sheet.paper === "onionskin" ? 0.86 : 1;
    ctx.fillStyle = sheet.paper === "onionskin" ? "#f2f2ee" : "#f8f5ec";
    ctx.fillRect(left, top, right - left, bottom - top);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "multiply";
    grain(ctx, fibreTile, s, ox, oy, left, top, right - left, bottom - top);
    // The typing, a pixel of sheet to s of screen.
    const sx = (left - ox) / s;
    const sy = (top - oy) / s;
    const sw = Math.min(SHEET_W - sx, (right - left) / s);
    const sh = Math.min(SHEET_H - sy, (bottom - top) / s);
    if (sw > 0 && sh > 0) {
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(sheet.ink, sx, sy, sw, sh, left, top, sw * s, sh * s);
    }
    ctx.globalCompositeOperation = "source-over";
    // Holes show the platen behind them.
    for (const hole of sheet.holes) {
      const x = ox + hole.x * s;
      const y = oy + hole.y * s;
      if (x < left - 4 || x > right + 4 || y < top - 4 || y > bottom + 4)
        continue;
      ctx.fillStyle = "#121110";
      ctx.beginPath();
      ctx.arc(x, y, Math.max(0.7, hole.r * s), 0, Math.PI * 2);
      ctx.fill();
    }
    // The sheet turning away over the top of the platen and under it at the bottom, and the
    // bail's shadow.
    const curve = ctx.createLinearGradient(0, py, 0, clipBottom);
    curve.addColorStop(0, "rgba(0,0,0,0)");
    curve.addColorStop(0.45, "rgba(30,24,18,0.12)");
    curve.addColorStop(1, "rgba(20,16,12,0.6)");
    ctx.fillStyle = curve;
    ctx.fillRect(left, py, right - left, clipBottom - py);
    // Above the platen the sheet leans back on the paper table, a shade out of the light.
    if (top < platenTop) {
      const over = ctx.createLinearGradient(
        0,
        platenTop - 0.3 * inch,
        0,
        platenTop,
      );
      over.addColorStop(0, "rgba(30,24,18,0.04)");
      over.addColorStop(1, "rgba(30,24,18,0)");
      ctx.fillStyle = over;
      ctx.fillRect(left, top, right - left, platenTop - top);
    }
    const bail = py - 0.5 * inch;
    const shadow = ctx.createLinearGradient(0, bail, 0, bail + 0.18 * inch);
    shadow.addColorStop(0, "rgba(20,16,12,0.22)");
    shadow.addColorStop(1, "rgba(20,16,12,0)");
    ctx.fillStyle = shadow;
    ctx.fillRect(left, bail, right - left, 0.18 * inch);
    // The paper's edges catch a hairline of shadow.
    ctx.strokeStyle = "rgba(0,0,0,0.18)";
    ctx.lineWidth = 1;
    ctx.strokeRect(ox + 0.5, oy + 0.5, SHEET_W * s - 1, SHEET_H * s - 1);
    ctx.restore();
  }

  function drawRibbon(px: number, py: number, inch: number) {
    const W = width;
    const rest = py + 0.07 * inch;
    const tall = 0.51 * inch;
    // The vibrator lifts the ribbon over the print point: a little for the black half, a lot for
    // the red.
    const rise = lift * (settings.mode === "red" ? 0.52 : 0.27) * inch;
    const spool = 2.55 * inch;
    const left = Math.max(-2, px - spool);
    const right = Math.min(W + 2, px + spool);
    const topAt = (x: number) => {
      const d = Math.abs(x - px);
      return rest - rise * (1 - smoothstep(0.22 * inch, 1.1 * inch, d));
    };
    const steps = 48;
    const path = (from: number, to: number) => {
      ctx.beginPath();
      for (let i = 0; i <= steps; i++) {
        const x = left + ((right - left) * i) / steps;
        const y = topAt(x) + from * tall;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      for (let i = steps; i >= 0; i--) {
        const x = left + ((right - left) * i) / steps;
        ctx.lineTo(x, topAt(x) + to * tall);
      }
      ctx.closePath();
    };
    path(0, 0.5);
    const black = ctx.createLinearGradient(
      0,
      rest - rise,
      0,
      rest + tall * 0.5,
    );
    black.addColorStop(0, "#38363a");
    black.addColorStop(0.15, "#1d1c20");
    black.addColorStop(1, "#121114");
    ctx.fillStyle = black;
    ctx.fill();
    path(0.5, 1);
    ctx.fillStyle = "#7c1a20";
    ctx.fill();
    // A sheen along the ribbon's weave.
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 1;
    for (const f of [0.08, 0.2, 0.62]) {
      ctx.beginPath();
      for (let i = 0; i <= steps; i++) {
        const x = left + ((right - left) * i) / steps;
        const y = topAt(x) + f * tall;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    // The vibrator's fork, holding the ribbon either side of the print point.
    const top = topAt(px);
    for (const side of [-1, 1]) {
      chromeBar(
        px + side * 0.24 * inch - 0.012 * inch,
        top - 0.02 * inch,
        0.024 * inch,
        0.2 * inch,
      );
    }
    // The type guide: a small chrome fork the slug passes through just before it lands.
    const guideTop = py + 0.12 * inch;
    chromeBar(px - 0.1 * inch, guideTop, 0.022 * inch, 0.14 * inch);
    chromeBar(px + 0.078 * inch, guideTop, 0.022 * inch, 0.14 * inch);
    chromeBar(
      px - 0.1 * inch,
      guideTop + 0.12 * inch,
      0.2 * inch,
      0.025 * inch,
    );
  }

  function drawCover(px: number, py: number, inch: number, body: Rgb) {
    const W = width;
    const H = height;
    const top = py + 0.34 * inch;
    const windowRx = 1.3 * inch;
    const windowRy = 0.68 * inch;

    // Spools sit in cups either side, on the deck.
    for (const side of [-1, 1]) {
      const x = px + side * 2.55 * inch;
      if (x < -inch || x > W + inch) continue;
      const y = top + 0.04 * inch;
      ctx.fillStyle = "#1a191c";
      ctx.beginPath();
      ctx.ellipse(
        x,
        y - 0.12 * inch,
        0.62 * inch,
        0.16 * inch,
        0,
        0,
        Math.PI * 2,
      );
      ctx.fill();
      ctx.fillRect(x - 0.62 * inch, y - 0.24 * inch, 1.24 * inch, 0.12 * inch);
      ctx.fillStyle = "#2a292d";
      ctx.beginPath();
      ctx.ellipse(
        x,
        y - 0.24 * inch,
        0.62 * inch,
        0.16 * inch,
        0,
        0,
        Math.PI * 2,
      );
      ctx.fill();
      ctx.fillStyle = "#b9b8b3";
      ctx.beginPath();
      ctx.ellipse(
        x,
        y - 0.25 * inch,
        0.12 * inch,
        0.035 * inch,
        0,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }

    // The top cover, with the basket showing through its opening in the middle.
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(-2, top - 0.05 * inch);
    ctx.lineTo(px - windowRx - 0.3 * inch, top);
    ctx.lineTo(px - windowRx, top);
    ctx.ellipse(px, top, windowRx, windowRy, 0, Math.PI, 0, true);
    ctx.lineTo(px + windowRx + 0.3 * inch, top);
    ctx.lineTo(W + 2, top - 0.05 * inch);
    ctx.lineTo(W + 2, H + 2);
    ctx.lineTo(-2, H + 2);
    ctx.closePath();
    const cover = ctx.createLinearGradient(0, top, 0, H);
    cover.addColorStop(0, rgb(body, 1.12));
    cover.addColorStop(0.06, rgb(body, 1));
    cover.addColorStop(0.5, rgb(body, 0.86));
    cover.addColorStop(1, rgb(body, 0.62));
    ctx.fillStyle = cover;
    ctx.fill();
    if (BODIES[machine.condition].crackle) {
      ctx.clip();
      const pattern = ctx.createPattern(crackleTile(), "repeat");
      if (pattern) {
        pattern.setTransform(new DOMMatrix([0.45, 0, 0, 0.45, 0, top]));
        ctx.globalCompositeOperation = "overlay";
        ctx.globalAlpha = 0.6;
        ctx.fillStyle = pattern;
        ctx.fillRect(0, top - 0.1 * inch, W, H - top + 0.1 * inch);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = "source-over";
      }
    }
    ctx.restore();
    // The rolled edge of the cover catches the light.
    ctx.strokeStyle = rgb(body, 1.35, 0.85);
    ctx.lineWidth = Math.max(1, 0.02 * inch);
    ctx.beginPath();
    ctx.moveTo(-2, top - 0.05 * inch);
    ctx.lineTo(px - windowRx - 0.3 * inch, top);
    ctx.lineTo(px - windowRx, top);
    ctx.ellipse(px, top, windowRx, windowRy, 0, Math.PI, 0, true);
    ctx.lineTo(px + windowRx + 0.3 * inch, top);
    ctx.lineTo(W + 2, top - 0.05 * inch);
    ctx.stroke();

    // Inside the opening: the typebars lying in their fan, slugs towards you.
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(px, top, windowRx - 1, windowRy - 1, 0, 0, Math.PI);
    ctx.clip();
    const inside = ctx.createRadialGradient(px, top, 0, px, top, windowRx);
    inside.addColorStop(0, "#0b0a0a");
    inside.addColorStop(1, "#1c1a19");
    ctx.fillStyle = inside;
    ctx.fillRect(px - windowRx, top, windowRx * 2, windowRy);
    const resting = new Set(bars.map((bar) => bar.basket));
    if (jam) for (const b of jam) resting.add(b);
    for (const key of new Set([...KEYS.values()].map((k) => k.basket))) {
      if (resting.has(key)) continue;
      const rest = barRest(key, px, top, inch);
      ctx.strokeStyle = "rgba(150,148,142,0.75)";
      ctx.lineWidth = Math.max(0.8, 0.018 * inch);
      ctx.beginPath();
      ctx.moveTo(rest.pivotX, rest.pivotY);
      ctx.lineTo(rest.x, rest.y);
      ctx.stroke();
      // The slug on the end of the bar, lying face up.
      const angle = Math.atan2(rest.y - rest.pivotY, rest.x - rest.pivotX);
      ctx.save();
      ctx.translate(rest.x, rest.y);
      ctx.rotate(angle);
      ctx.fillStyle = "#a8a7a1";
      roundRect(
        -0.07 * inch,
        -0.025 * inch,
        0.1 * inch,
        0.05 * inch,
        0.01 * inch,
      );
      ctx.fill();
      ctx.restore();
    }
    // The segment, the slotted arc the bars pivot in.
    ctx.strokeStyle = "#4a4946";
    ctx.lineWidth = Math.max(2, 0.05 * inch);
    ctx.beginPath();
    ctx.ellipse(
      px,
      top + 0.02 * inch,
      0.36 * inch,
      0.18 * inch,
      0,
      0.05,
      Math.PI - 0.05,
    );
    ctx.stroke();
    ctx.restore();
  }

  // Where a bar lies at rest: pivoted in the segment, its slug out on the rim of the fan.
  function barRest(basket: number, px: number, top: number, inch: number) {
    const angle = basket * 1.35;
    const sin = Math.sin(angle);
    const cos = Math.cos(angle);
    return {
      pivotX: px + sin * 0.36 * inch,
      pivotY: top + 0.02 * inch + cos * 0.18 * inch,
      x: px + sin * 1.18 * inch,
      y: top + cos * 0.6 * inch,
    };
  }

  function drawBars(px: number, py: number, inch: number) {
    const top = py + 0.34 * inch;
    const target = { x: px, y: py - 0.06 * inch };
    const draw = (
      basket: number,
      f: number,
      char: string | null,
      offset = 0,
    ) => {
      const rest = barRest(basket, px, top, inch);
      // The slug swings up out of the basket and over towards the paper.
      const e = f;
      const mx = rest.x + (target.x + offset - rest.x) * e;
      const my =
        rest.y + (target.y - rest.y) * e - Math.sin(e * Math.PI) * 0.5 * inch;
      ctx.strokeStyle = "#a9a8a3";
      ctx.lineWidth = Math.max(1.5, 0.05 * inch);
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(rest.pivotX, rest.pivotY);
      ctx.lineTo(mx, my + 0.08 * inch);
      ctx.stroke();
      ctx.lineCap = "butt";
      const w = 0.16 * inch + 0.06 * inch * e;
      const h = 0.2 * inch;
      const slug = ctx.createLinearGradient(mx - w / 2, 0, mx + w / 2, 0);
      slug.addColorStop(0, "#77766f");
      slug.addColorStop(0.4, "#dedcd5");
      slug.addColorStop(1, "#6a6964");
      ctx.fillStyle = slug;
      roundRect(mx - w / 2, my - h / 2, w, h, 0.03 * inch);
      ctx.fill();
      // The face of the slug carries its letter in relief, back to front.
      if (char && e > 0.35) {
        ctx.save();
        ctx.translate(mx, my);
        ctx.scale(-1, 1);
        ctx.fillStyle = "rgba(40,38,34,0.85)";
        ctx.font = `600 ${0.15 * inch}px ${glyphFamily}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(char, 0, 0);
        ctx.restore();
      }
    };
    if (jam) {
      draw(jam[0], 0.78, null, -0.07 * inch);
      draw(jam[1], 0.82, null, 0.07 * inch);
    }
    for (const bar of bars) draw(bar.basket, swing(bar.age), bar.char);
  }

  function crackleTile() {
    if (crackle) return crackle;
    const tile = document.createElement("canvas");
    tile.width = 128;
    tile.height = 128;
    const tctx = tile.getContext("2d") as CanvasRenderingContext2D;
    const image = tctx.createImageData(128, 128);
    const r = mulberry(5);
    const cells = Array.from({ length: 40 }, () => [r() * 128, r() * 128]);
    for (let y = 0; y < 128; y++) {
      for (let x = 0; x < 128; x++) {
        let a = 1e9;
        let b = 1e9;
        for (const [cx, cy] of cells) {
          const dx = Math.min(Math.abs(x - cx), 128 - Math.abs(x - cx));
          const dy = Math.min(Math.abs(y - cy), 128 - Math.abs(y - cy));
          const d = dx * dx + dy * dy;
          if (d < a) {
            b = a;
            a = d;
          } else if (d < b) b = d;
        }
        // Crackle finish: wrinkled blisters of lacquer, high in the middle, creased at the joins.
        const edge = Math.sqrt(b) - Math.sqrt(a);
        const v = 128 + Math.min(1, edge / 6) * 60 - 30 + (r() - 0.5) * 10;
        const i = (y * 128 + x) * 4;
        image.data[i] = v;
        image.data[i + 1] = v;
        image.data[i + 2] = v;
        image.data[i + 3] = 255;
      }
    }
    tctx.putImageData(image, 0, 0);
    crackle = tile;
    return tile;
  }

  function chromeBar(x: number, y: number, w: number, h: number) {
    const vertical = h > w;
    const g = vertical
      ? ctx.createLinearGradient(x, 0, x + w, 0)
      : ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, "#7d7c78");
    g.addColorStop(0.35, "#f4f3ef");
    g.addColorStop(0.6, "#b6b5b0");
    g.addColorStop(1, "#5d5c58");
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
  }

  function roundRect(x: number, y: number, w: number, h: number, r: number) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, Math.min(r, w / 2, h / 2));
  }

  // -------------------------------------------------------------------------------------------
  // The sheet out of the machine, on a desk blotter.

  function sheetFrame() {
    const W = width;
    const H = height;
    const aspect = SHEET_W / SHEET_H;
    const margin = Math.max(16, Math.min(W, H) * 0.05);
    let h = H - margin * 2;
    let w = h * aspect;
    if (w > W - margin * 2) {
      w = W - margin * 2;
      h = w / aspect;
    }
    return { x: (W - w) / 2, y: (H - h) / 2, w, h };
  }

  function renderDesk() {
    const W = width;
    const H = height;
    const felt = ctx.createRadialGradient(
      W * 0.4,
      H * 0.3,
      0,
      W * 0.5,
      H * 0.5,
      Math.max(W, H),
    );
    if (night) {
      felt.addColorStop(0, "#41584a");
      felt.addColorStop(1, "#1e2b22");
    } else {
      felt.addColorStop(0, "#4d6a52");
      felt.addColorStop(1, "#2f4434");
    }
    ctx.fillStyle = felt;
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = "overlay";
    const pattern = ctx.createPattern(rakingTile, "repeat");
    if (pattern) {
      pattern.setTransform(new DOMMatrix([0.7, 0, 0, 0.7, 0, 0]));
      ctx.fillStyle = pattern;
      ctx.globalAlpha = 0.35;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }
    ctx.globalCompositeOperation = "source-over";

    const frame = sheetFrame();
    ctx.save();
    ctx.translate(frame.x + frame.w / 2, frame.y + frame.h / 2);
    ctx.rotate(-0.012);
    ctx.translate(-frame.w / 2, -frame.h / 2);
    ctx.shadowColor = "rgba(0,0,0,0.35)";
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 6;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, frame.w, frame.h);
    ctx.shadowColor = "transparent";
    drawFace(
      ctx,
      frame.w,
      frame.h,
      settings.view,
      settings.flipped,
      settings.raking,
      night,
    );
    ctx.restore();

    if (loupe && onSheet(loupe)) drawLoupe(loupe, frame);
    light(width * 0.6, height * 0.25);
  }

  function onSheet(point: { x: number; y: number }) {
    const frame = sheetFrame();
    return (
      point.x >= frame.x &&
      point.x <= frame.x + frame.w &&
      point.y >= frame.y &&
      point.y <= frame.y + frame.h
    );
  }

  // A reading glass: the same face drawn about four times larger, inside a ring.
  function drawLoupe(
    at: { x: number; y: number },
    frame: { x: number; y: number; w: number; h: number },
  ) {
    const radius = Math.max(56, Math.min(96, Math.min(width, height) * 0.16));
    const zoom = Math.min(0.62, (frame.w / SHEET_W) * 4.2) * SHEET_W;
    const u = (at.x - frame.x) / frame.w;
    const v = (at.y - frame.y) / frame.h;
    const zh = (zoom * SHEET_H) / SHEET_W;
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.4)";
    ctx.shadowBlur = 16;
    ctx.shadowOffsetY = 5;
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.arc(at.x, at.y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.clip();
    ctx.fillStyle = night ? "#0d120e" : "#2f4434";
    ctx.fillRect(at.x - radius, at.y - radius, radius * 2, radius * 2);
    ctx.translate(at.x - u * zoom, at.y - v * zh);
    drawFace(
      ctx,
      zoom,
      zh,
      settings.view,
      settings.flipped,
      settings.raking,
      night,
    );
    ctx.restore();
    // The glass's rim, and a highlight on it.
    ctx.lineWidth = 5;
    ctx.strokeStyle = night ? "#3b3631" : "#2a2622";
    ctx.beginPath();
    ctx.arc(at.x, at.y, radius + 2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.beginPath();
    ctx.arc(at.x, at.y, radius - 1, Math.PI * 1.05, Math.PI * 1.45);
    ctx.stroke();
  }

  // One face of one sheet, drawn into a w by h box at the origin: the top copy, the carbon copy,
  // or the carbon itself, from the front or turned over, under flat or raking light.
  function drawFace(
    target: CanvasRenderingContext2D,
    w: number,
    h: number,
    which: SheetView,
    flipped: boolean,
    raking: boolean,
    dark: boolean,
  ) {
    const s = w / SHEET_W;
    const face = which === "top" || !sheet.copy ? "top" : which;
    target.save();
    target.beginPath();
    target.rect(0, 0, w, h);
    target.clip();
    if (flipped) {
      target.translate(w, 0);
      target.scale(-1, 1);
    }
    if (face === "carbon") {
      // Carbon paper: a waxy coat of pigment on tissue. Where type has pressed it, the coat has
      // gone across on to the copy and the tissue shows, back to front from this side.
      target.fillStyle = flipped ? "#3b3f57" : "#1b1e3c";
      target.fillRect(0, 0, w, h);
      const sheen = target.createLinearGradient(0, 0, w, h);
      sheen.addColorStop(0, "rgba(255,255,255,0.08)");
      sheen.addColorStop(0.5, "rgba(255,255,255,0)");
      sheen.addColorStop(1, "rgba(255,255,255,0.05)");
      target.fillStyle = sheen;
      target.fillRect(0, 0, w, h);
      if (sheet.copy) {
        target.save();
        // The coated side faces the copy, so seen from the front the carbon reads reversed.
        target.translate(w, 0);
        target.scale(-1, 1);
        target.globalCompositeOperation = "screen";
        target.drawImage(sheet.copy, 0, 0, w, h);
        target.drawImage(sheet.copy, 0, 0, w, h);
        target.restore();
      }
    } else {
      target.fillStyle = sheet.paper === "onionskin" ? "#f3f3ef" : "#f8f5ec";
      target.fillRect(0, 0, w, h);
      target.globalCompositeOperation = "multiply";
      grain(target, raking ? rakingTile : fibreTile, s, 0, 0, 0, 0, w, h);
      const ink = face === "copy" && sheet.copy ? sheet.copy : sheet.ink;
      if (flipped) {
        // From the back, the typing shows faintly through the paper, reversed (this side is
        // already mirrored), and softened by the thickness of the sheet.
        target.globalAlpha = sheet.paper === "onionskin" ? 0.42 : 0.16;
        target.filter = "blur(0.6px)";
        target.drawImage(ink, 0, 0, w, h);
        target.filter = "none";
        target.globalAlpha = 1;
      } else if (face === "copy") {
        target.globalCompositeOperation = "source-over";
        target.drawImage(ink, 0, 0, w, h);
      } else {
        target.imageSmoothingQuality = "high";
        target.drawImage(ink, 0, 0, w, h);
      }
      target.globalCompositeOperation = "source-over";
    }

    // Raking light: a lamp low to the left. The dents show as tiny shadows and highlights.
    if (raking) {
      const shade = shadingFor(flipped);
      target.globalCompositeOperation = "soft-light";
      target.drawImage(shade, 0, 0, w, h);
      target.globalCompositeOperation = "multiply";
      const fall = target.createLinearGradient(
        flipped ? w : 0,
        0,
        flipped ? 0 : w,
        0,
      );
      fall.addColorStop(0, "rgb(250,248,242)");
      fall.addColorStop(1, "rgb(196,192,184)");
      target.fillStyle = fall;
      target.fillRect(0, 0, w, h);
      target.globalCompositeOperation = "source-over";
    }

    // Holes go right through: the blotter shows in them, through a ragged edge of torn fibres
    // pushed out the back.
    for (const hole of sheet.holes) {
      const r = Math.max(0.6, hole.r * s);
      const jag = mulberry(hole.seed);
      target.beginPath();
      for (let k = 0; k < 9; k++) {
        const a = (k / 9) * Math.PI * 2;
        const rr = r * (0.75 + jag() * 0.5);
        const x = hole.x * s + Math.cos(a) * rr;
        const y = hole.y * s + Math.sin(a) * rr;
        if (k === 0) target.moveTo(x, y);
        else target.lineTo(x, y);
      }
      target.closePath();
      target.fillStyle = dark ? "#0e1410" : "#2b3d2f";
      target.fill();
      if (r > 2) {
        target.strokeStyle = flipped
          ? "rgba(255,255,250,0.75)"
          : "rgba(230,226,214,0.5)";
        target.lineWidth = Math.max(0.6, r * 0.22);
        target.stroke();
      }
    }
    target.restore();
  }

  // The light falling across the dents: a grey image, mid-grey where flat.
  function shadingFor(flipped: boolean) {
    if (
      shading &&
      shading.version === sheet.version &&
      shading.flipped === flipped
    ) {
      return shading.canvas;
    }
    const out = shading?.canvas ?? document.createElement("canvas");
    out.width = DENT_W;
    out.height = DENT_H;
    const sctx = out.getContext("2d") as CanvasRenderingContext2D;
    const image = sctx.createImageData(DENT_W, DENT_H);
    const d = sheet.dents;
    // From the front the type pushed the paper in; from the back it stands up. This side is
    // drawn mirrored, so the light's side swaps with it.
    const sign = flipped ? 1 : -1;
    for (let y = 1; y < DENT_H - 1; y++) {
      for (let x = 1; x < DENT_W - 1; x++) {
        const i = y * DENT_W + x;
        const dx = d[i + 1] - d[i - 1];
        const dy = d[i + DENT_W] - d[i - DENT_W];
        const v = 128 + sign * (dx * 300 + dy * 100);
        const c = Math.max(0, Math.min(255, v));
        image.data[i * 4] = c;
        image.data[i * 4 + 1] = c;
        image.data[i * 4 + 2] = c;
        image.data[i * 4 + 3] = 255;
      }
    }
    for (let i = 0; i < DENT_W * DENT_H; i++) {
      if (!image.data[i * 4 + 3]) {
        image.data[i * 4] = 128;
        image.data[i * 4 + 1] = 128;
        image.data[i * 4 + 2] = 128;
        image.data[i * 4 + 3] = 255;
      }
    }
    sctx.putImageData(image, 0, 0);
    shading = { canvas: out, version: sheet.version, flipped };
    return out;
  }

  // -------------------------------------------------------------------------------------------
  // Size, fonts and lifetime.

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
    dirty = true;
    if (!running) {
      render();
      dirty = false;
    }
  }

  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  const intersection = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible) start();
  });
  intersection.observe(canvas);

  // The type is Courier Prime, loaded by the page; wait for it so no letter is struck in a
  // fallback face.
  const glyphFamily =
    getComputedStyle(canvas).getPropertyValue("--font-courier-prime").trim() ||
    "'Courier New', Courier, monospace";
  const ready = () => {
    if (disposed) return;
    setTypeFace(glyphFamily);
    fontReady = true;
    nextAt = clock;
  };
  document.fonts.load(`400 50px ${glyphFamily}`, "Mmae.").then(ready, ready);

  resize();
  feed(false);
  start();

  function hit(point: { x: number; y: number }): Pick {
    if (state !== "in") return null;
    const { s, inch, px, py } = view();
    if (
      jam &&
      Math.hypot(point.x - px, point.y - (py + 0.2 * inch)) < 0.8 * inch
    )
      return "jam";
    const ox = px - (shownCol + 0.5) * PITCH * s;
    const lever = leverGeometry(ox - 1.25 * inch, py, inch);
    if (Math.hypot(point.x - lever.x1, point.y - lever.y1) < 0.35 * inch)
      return "lever";
    if (point.y < py + 0.05 * inch) return "paper";
    return null;
  }

  return {
    setSettings(next: TypewriterSettings) {
      const before = settings;
      settings = { ...next };
      voice.setEnabled(next.sound);
      if (next.condition !== before.condition) {
        machine = createMachine(next.condition);
        gunk = startingGunk(machine);
      }
      if (next.ribbon !== before.ribbon) {
        ribbon = { black: RIBBONS[next.ribbon], red: RIBBONS[next.ribbon] };
      }
      // A new paper or carbon goes in with the next sheet; a blank sheet is swapped straight away.
      if (
        (next.paper !== before.paper || next.carbon !== before.carbon) &&
        state === "in" &&
        sheet.letters === 0
      ) {
        sheet = newSheet(next.paper, next.carbon);
        shading = null;
      }
      changed();
    },
    setNight(on: boolean) {
      if (on === night) return;
      night = on;
      changed();
      if (!running) {
        render();
        dirty = false;
      }
    },
    wake() {
      voice.wake();
    },
    // A key from the keyboard: a character, or one of the named keys.
    press(key: string) {
      voice.wake();
      const now = performance.now();
      // A person typing takes over from the sample letter.
      if (typing) {
        queue.length = 0;
        typing = false;
        statsDirty = true;
      }
      const action: Action | null =
        key === "Enter"
          ? { kind: "return", wait: 0, auto: false }
          : key === "Backspace"
            ? { kind: "back", wait: 0, auto: false }
            : key === "Tab"
              ? { kind: "tab", wait: 0, auto: false }
              : key === " "
                ? { kind: "space", wait: 0, auto: false }
                : key.length === 1
                  ? { kind: "char", char: key, wait: 0, auto: false }
                  : null;
      if (key === "ArrowUp" || key === "ArrowDown") {
        // The platen knob turns in half-line clicks, for superscripts and subscripts.
        roll(key === "ArrowUp" ? -0.5 : 0.5);
        return;
      }
      if (key === "ArrowLeft") {
        backspace();
        return;
      }
      if (key === "ArrowRight") {
        space();
        return;
      }
      if (!action) return;
      // Keys pressed while the carriage is still running back are taken in turn once it stops.
      if (returning || queue.length || state === "feeding") {
        queue.push({ ...action, wait: 0.04, auto: true });
        return;
      }
      run(action, now);
    },
    // Pasted text is typed out at a typist's pace.
    type(text: string) {
      voice.wake();
      for (const char of text.replace(/\r/g, "")) {
        if (char === "\n")
          queue.push({ kind: "return", wait: 0.4, auto: true });
        else if (char === " ")
          queue.push({ kind: "space", wait: 0.1, auto: true });
        else if (char === "\t")
          queue.push({ kind: "tab", wait: 0.1, auto: true });
        else
          queue.push({
            kind: "char",
            char,
            wait: 0.07 + random() * 0.08,
            auto: true,
          });
      }
      nextAt = clock;
    },
    demo() {
      voice.wake();
      demo();
    },
    stopDemo() {
      queue.length = 0;
      typing = false;
      statsDirty = true;
    },
    carriageReturn() {
      voice.wake();
      carriageReturn();
    },
    pullOut() {
      voice.wake();
      pullOut();
    },
    feed() {
      voice.wake();
      feed();
    },
    cleanType() {
      voice.wake();
      cleanType();
      say(
        "cleaned",
        "Scrubbed with a stiff brush and spirit: the counters of the type are open again.",
        true,
      );
    },
    unjam() {
      unjam();
    },
    pointerDown(id: number, point: { x: number; y: number }): Pick {
      voice.wake();
      const p = point;
      if (state === "out") {
        loupe = onSheet(p) ? { ...p } : null;
        dirty = true;
        return loupe ? "sheet" : null;
      }
      const pick = hit(p);
      if (pick === "jam") {
        unjam();
        return pick;
      }
      if (pick === "lever") {
        carriageReturn();
        return pick;
      }
      if (pick === "paper" && !returning && !queue.length) {
        drag = { id, x: p.x, y: p.y, col, line, moved: false };
      }
      return pick;
    },
    pointerMove(id: number, point: { x: number; y: number }) {
      if (state === "out") {
        loupe = onSheet(point) ? { ...point } : null;
        dirty = true;
        return;
      }
      if (!drag || drag.id !== id || state !== "in") return;
      const { s } = view();
      const dx = point.x - drag.x;
      const dy = point.y - drag.y;
      if (!drag.moved && Math.hypot(dx, dy) < 4) return;
      if (!drag.moved) {
        drag.moved = true;
        say(
          "release",
          "Moving the paper by hand is like holding the carriage release and the platen’s free-turning knob: the line doesn’t click into place, so you can type between lines, or over them.",
        );
      }
      const nextCol = Math.max(
        0,
        Math.min(COLUMNS, Math.round(drag.col - dx / (PITCH * s))),
      );
      if (nextCol !== col) {
        col = nextCol;
        shownCol = col;
        play("tick", 0.3, 1.2);
      }
      line = Math.max(40, Math.min(LAST_LINE, drag.line - dy / s));
      shownLine = line;
      changed();
    },
    pointerUp(id: number, touch = false) {
      if (drag?.id === id) drag = null;
      // A finger takes the glass away with it; a mouse leaves it where it is.
      if (touch && loupe) {
        loupe = null;
        dirty = true;
      }
    },
    hover(point: { x: number; y: number } | null): Pick {
      if (state === "out") {
        const next = point && onSheet(point) ? { ...point } : null;
        if (next || loupe) dirty = true;
        loupe = next;
        return next ? "sheet" : null;
      }
      return point ? hit(point) : null;
    },
    // The sheet as it's shown now, at 150 to the inch.
    async save(): Promise<Blob | null> {
      const out = document.createElement("canvas");
      out.width = SHEET_W / 2;
      out.height = Math.ceil(SHEET_H / 2);
      const octx = out.getContext("2d");
      if (!octx) return null;
      drawFace(
        octx,
        out.width,
        out.height,
        settings.view,
        settings.flipped,
        settings.raking,
        false,
      );
      return new Promise((resolve) => out.toBlob(resolve, "image/png"));
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      intersection.disconnect();
      voice.dispose();
    },
  };
}

export type Typewriter = ReturnType<typeof createTypewriter>;
