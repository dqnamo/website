"use client";

import { useReducedMotion } from "motion/react";
import {
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  type Ref,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { cn } from "@/helpers/classname-helper";

type Point = { x: number; y: number };
type Size = { width: number; height: number };

export type PeelCorner =
  | "top-left"
  | "top-right"
  | "bottom-right"
  | "bottom-left";

const CORNER_SIGNS: Record<PeelCorner, Point> = {
  "top-left": { x: -1, y: -1 },
  "top-right": { x: 1, y: -1 },
  "bottom-right": { x: 1, y: 1 },
  "bottom-left": { x: -1, y: 1 },
};
const CORNERS = Object.keys(CORNER_SIGNS) as PeelCorner[];

/** How far the resting dog-ear stands off the sticker. */
const REST_LIFT = 14;
/** How far it lifts when you hover or focus it. */
const HOVER_LIFT = 26;
/** How close to a corner you have to press to get a fingernail under it. */
const GRAB_RADIUS = 64;
/** Peeled further than this, letting go finishes the job. */
const PEEL_THRESHOLD = 0.5;
/** A quick flick off the sticker peels it from much less. */
const FLICK_SPEED = 650;

const DRAG_SPRING = { stiffness: 1400, damping: 62 };
const SNAP_SPRING = { stiffness: 560, damping: 30 };
const CALM_SPRING = { stiffness: 560, damping: 48 };
const LEAVE_SPRING = { stiffness: 150, damping: 19 };

const EMPTY_POLYGON = "polygon(0px 0px, 0px 0px, 0px 0px)";

/* -------------------------------------------------------------------------- */
/* Geometry                                                                    */
/* -------------------------------------------------------------------------- */

function clampRadius(radius: number, { width, height }: Size) {
  return Math.max(0, Math.min(radius, width / 2, height / 2));
}

/** The point on a rounded corner's arc that sits on its 45° diagonal. */
function grabPoint(corner: PeelCorner, size: Size, radius: number): Point {
  const sign = CORNER_SIGNS[corner];
  const inset = clampRadius(radius, size) * (1 - Math.SQRT1_2);

  return {
    x: sign.x < 0 ? inset : size.width - inset,
    y: sign.y < 0 ? inset : size.height - inset,
  };
}

function inwardOf(corner: PeelCorner): Point {
  const sign = CORNER_SIGNS[corner];
  return { x: -sign.x * Math.SQRT1_2, y: -sign.y * Math.SQRT1_2 };
}

/**
 * Where the corner has been folded to when it stands `lift` pixels off the
 * sticker. The crease sits halfway, so a lift of 14 shows a 7px dog-ear.
 */
function restPoint(
  corner: PeelCorner,
  size: Size,
  radius: number,
  lift: number,
): Point {
  const grab = grabPoint(corner, size, radius);
  const inward = inwardOf(corner);
  return { x: grab.x + inward.x * lift, y: grab.y + inward.y * lift };
}

/** Sutherland–Hodgman: keep the part of a polygon where `side` is ≥ 0. */
function clipPolygon(points: Point[], side: (point: Point) => number) {
  const output: Point[] = [];

  for (let index = 0; index < points.length; index += 1) {
    const a = points[index];
    const b = points[(index + 1) % points.length];
    const sideA = side(a);
    const sideB = side(b);

    if (sideA >= 0) {
      output.push(a);
    }

    if (sideA >= 0 !== sideB >= 0) {
      const t = sideA / (sideA - sideB);
      output.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }

  return output;
}

function polygonArea(points: Point[]) {
  let area = 0;

  for (let index = 0; index < points.length; index += 1) {
    const a = points[index];
    const b = points[(index + 1) % points.length];
    area += a.x * b.y - b.x * a.y;
  }

  return Math.abs(area) / 2;
}

function toPolygon(points: Point[]) {
  if (points.length < 3) {
    return EMPTY_POLYGON;
  }

  return `polygon(${points
    .map(({ x, y }) => `${x.toFixed(2)}px ${y.toFixed(2)}px`)
    .join(", ")})`;
}

type PeelVariable =
  | "front-clip"
  | "flap-clip"
  | "flap-transform"
  | "shade-transform"
  | "ground-clip"
  | "flap-shadow";

type Fold = {
  variables: Record<PeelVariable, string>;
  /** Share of the sticker that is off the surface, 0–1. */
  fraction: number;
  /** Distance between where the corner was and where it is now. */
  lift: number;
};

/**
 * Fold the sticker so that corner `from` lands on `to`. Paper does not
 * stretch, so the crease is the perpendicular bisector of the two points and
 * the flap is everything past it, mirrored across it.
 */
function foldSticker(size: Size, from: Point, to: Point): Fold {
  const { width, height } = size;
  const box = [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: height },
    { x: 0, y: height },
  ];
  const dx = from.x - to.x;
  const dy = from.y - to.y;
  const lift = Math.hypot(dx, dy);

  if (lift < 0.01 || width === 0 || height === 0) {
    return {
      fraction: 0,
      lift: 0,
      variables: {
        "flap-clip": EMPTY_POLYGON,
        "flap-shadow": "drop-shadow(0px 0px 0px transparent)",
        "flap-transform": "matrix(1, 0, 0, 1, 0, 0)",
        "front-clip": toPolygon(box),
        "ground-clip": EMPTY_POLYGON,
        "shade-transform": "translate(0px, 0px) rotate(0rad)",
      },
    };
  }

  // Unit normal of the crease, pointing towards the lifted corner.
  const nx = dx / lift;
  const ny = dy / lift;
  const mx = (from.x + to.x) / 2;
  const my = (from.y + to.y) / 2;
  const side = (point: Point) => (point.x - mx) * nx + (point.y - my) * ny;

  const kept = clipPolygon(box, (point) => -side(point));
  const lifted = clipPolygon(box, side);

  // Reflection across the crease: X' = (I − 2nnᵀ)X + 2(n·M)n.
  const k = nx * mx + ny * my;
  const a = 1 - 2 * nx * nx;
  const b = -2 * nx * ny;
  const d = 1 - 2 * ny * ny;
  const flapTransform = `matrix(${a.toFixed(5)}, ${b.toFixed(5)}, ${b.toFixed(5)}, ${d.toFixed(5)}, ${(2 * k * nx).toFixed(3)}, ${(2 * k * ny).toFixed(3)})`;

  // A 2000px wide shade strip, hung from the crease, facing the lifted side.
  const angle = Math.atan2(-nx, ny);
  const shadeTransform = `translate(${(mx - 1000).toFixed(2)}px, ${my.toFixed(2)}px) rotate(${angle.toFixed(5)}rad)`;

  // The further the flap stands off, the softer and longer its shadow.
  const rise = Math.min(lift, 220);
  const flapShadow = `drop-shadow(${(rise * 0.015).toFixed(2)}px ${(0.8 + rise * 0.03).toFixed(2)}px ${(1.4 + rise * 0.05).toFixed(2)}px rgba(0, 0, 0, ${(0.16 + (rise / 220) * 0.12).toFixed(3)}))`;

  return {
    fraction: Math.min(1, polygonArea(lifted) / (width * height)),
    lift,
    variables: {
      "flap-clip": toPolygon(lifted),
      "flap-shadow": flapShadow,
      "flap-transform": flapTransform,
      "front-clip": toPolygon(kept),
      "ground-clip": toPolygon(lifted),
      "shade-transform": shadeTransform,
    },
  };
}

function prefixed(variables: Record<PeelVariable, string>, suffix = "") {
  return Object.fromEntries(
    Object.entries(variables).map(([name, value]) => [
      `--peel-${name}${suffix}`,
      value,
    ]),
  ) as CSSProperties;
}

/* -------------------------------------------------------------------------- */
/* Sound                                                                       */
/* -------------------------------------------------------------------------- */

let sharedAudioContext: AudioContext | null = null;
let crackleBuffer: AudioBuffer | null = null;
let patBuffer: AudioBuffer | null = null;

function getAudioContext() {
  if (typeof window === "undefined" || !("AudioContext" in window)) {
    return null;
  }

  sharedAudioContext ??= new AudioContext();

  if (sharedAudioContext.state === "suspended") {
    void sharedAudioContext.resume();
  }

  return sharedAudioContext;
}

/** Sparse pops over a little hiss: adhesive letting go, fibre by fibre. */
function createCrackleBuffer(context: AudioContext) {
  const length = context.sampleRate;
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);

  for (let index = 0; index < length; index += 1) {
    const noise = Math.random() * 2 - 1;
    data[index] = Math.random() < 0.06 ? noise : noise * 0.22;
  }

  return buffer;
}

function createPatBuffer(context: AudioContext) {
  const length = Math.floor(context.sampleRate * 0.07);
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);

  for (let index = 0; index < length; index += 1) {
    const t = index / context.sampleRate;
    data[index] = (Math.random() * 2 - 1) * Math.exp(-t / 0.012);
  }

  return buffer;
}

type Crackle = {
  context: AudioContext;
  filter: BiquadFilterNode;
  gain: GainNode;
  source: AudioBufferSourceNode;
};

function startCrackle(): Crackle | null {
  const context = getAudioContext();

  if (!context) {
    return null;
  }

  crackleBuffer ??= createCrackleBuffer(context);

  const source = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const gain = context.createGain();

  source.buffer = crackleBuffer;
  source.loop = true;
  filter.type = "bandpass";
  filter.frequency.value = 2600;
  filter.Q.value = 0.8;
  gain.gain.value = 0;
  source.connect(filter).connect(gain).connect(context.destination);
  source.start();

  return { context, filter, gain, source };
}

function stopCrackle(crackle: Crackle | null) {
  if (!crackle) {
    return;
  }

  const now = crackle.context.currentTime;
  crackle.gain.gain.setTargetAtTime(0, now, 0.03);
  crackle.source.stop(now + 0.3);
}

function playPat() {
  const context = getAudioContext();

  if (!context) {
    return;
  }

  patBuffer ??= createPatBuffer(context);

  const source = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const gain = context.createGain();

  source.buffer = patBuffer;
  filter.type = "lowpass";
  filter.frequency.value = 760;
  gain.gain.value = 0.9;
  source.connect(filter).connect(gain).connect(context.destination);
  source.start();
}

/* -------------------------------------------------------------------------- */
/* Layers                                                                      */
/* -------------------------------------------------------------------------- */

const DEFAULT_BACKING = "#f3f0e8";

const FLAP_SHADE =
  "linear-gradient(to bottom, rgba(0, 0, 0, 0.16) 0px, rgba(255, 255, 255, 0.7) 3px, rgba(255, 255, 255, 0.18) 12px, rgba(255, 255, 255, 0) 34px, rgba(0, 0, 0, 0) 80px, rgba(0, 0, 0, 0.07) 260px)";
const GROUND_SHADE =
  "linear-gradient(to bottom, rgba(0, 0, 0, 0.22) 0px, rgba(0, 0, 0, 0.07) 7px, rgba(0, 0, 0, 0) 22px)";
const STICKER_EDGE =
  "drop-shadow(0 0.5px 0.5px rgba(0, 0, 0, 0.22)) drop-shadow(0 2px 3px rgba(0, 0, 0, 0.08))";

function StickerLayers({
  backing,
  children,
  flapRef,
  radius,
  transitionClassName,
}: {
  backing: string;
  children: ReactNode;
  flapRef?: Ref<HTMLDivElement>;
  radius: number;
  transitionClassName?: string;
}) {
  const shade = cn(
    "pointer-events-none absolute top-0 left-0 h-[600px] w-[2000px] origin-[1000px_0]",
    transitionClassName,
  );

  return (
    <>
      {/* The surface the sticker has come away from, darkened under the curl. */}
      <div
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-0 overflow-hidden bg-black/[0.035] dark:bg-white/[0.035]",
          transitionClassName,
        )}
        style={{
          borderRadius: radius,
          clipPath: `var(--peel-ground-clip, ${EMPTY_POLYGON})`,
        }}
      >
        <div
          className={shade}
          style={{
            background: GROUND_SHADE,
            transform: "var(--peel-shade-transform)",
          }}
        />
      </div>

      {/* The face, still stuck down. */}
      <div className="absolute inset-0" style={{ filter: STICKER_EDGE }}>
        <div
          className={cn(
            "absolute inset-0 overflow-hidden",
            transitionClassName,
          )}
          style={{
            borderRadius: radius,
            clipPath: "var(--peel-front-clip, none)",
          }}
        >
          {children}
        </div>
      </div>

      {/* The flap: the adhesive side, mirrored over the crease. */}
      <div
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-0",
          transitionClassName,
        )}
        ref={flapRef}
        style={{ filter: "var(--peel-flap-shadow, none)" }}
      >
        <div
          className={cn(
            "absolute inset-0 origin-top-left overflow-hidden",
            transitionClassName,
          )}
          style={{
            background: backing,
            borderRadius: radius,
            clipPath: `var(--peel-flap-clip, ${EMPTY_POLYGON})`,
            transform: "var(--peel-flap-transform, none)",
          }}
        >
          {/* Thin paper: the print shows through the back, mirrored. */}
          <div
            className="absolute inset-0 opacity-[0.13] blur-[0.4px] grayscale-[0.4]"
            inert
          >
            {children}
          </div>
          <div
            className={shade}
            style={{
              background: FLAP_SHADE,
              transform: "var(--peel-shade-transform)",
            }}
          />
        </div>
      </div>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* PeelSticker                                                                 */
/* -------------------------------------------------------------------------- */

export type PeelStickerProps = {
  /** Accessible name, e.g. "Peel the seal to reveal your invite code". */
  label: string;
  /** The printed face of the sticker. Keep it decorative. */
  children: ReactNode;
  /** Corner radius of the die cut, in pixels. */
  radius?: number;
  /** Colour of the adhesive side, seen on the flap. */
  backing?: string;
  /** Which corner starts with a dog-ear to get a nail under. */
  corner?: PeelCorner;
  peeled?: boolean;
  defaultPeeled?: boolean;
  onPeeledChange?: (peeled: boolean) => void;
  /** Crackle while it peels, and pat when it is stuck back down. */
  sound?: boolean;
  /** Size the sticker with classes; it measures itself. */
  className?: string;
};

type Phase = "stuck" | "leaving" | "off";

type Drag = {
  pointerId: number;
  origin: Point;
  start: Point;
  last: Point;
  lastTime: number;
  velocity: Point;
};

export function PeelSticker({
  backing = DEFAULT_BACKING,
  children,
  className,
  corner: restCorner = "bottom-right",
  defaultPeeled = false,
  label,
  onPeeledChange,
  peeled,
  radius = 16,
  sound = false,
}: PeelStickerProps) {
  const shouldReduceMotion = useReducedMotion();
  const rootRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const flapRef = useRef<HTMLDivElement>(null);

  const [innerPeeled, setInnerPeeled] = useState(defaultPeeled);
  const [off, setOff] = useState(defaultPeeled);
  const isPeeled = peeled ?? innerPeeled;

  const latest = useRef({
    onPeeledChange,
    radius,
    reduceMotion: false,
    restCorner,
    sound,
  });
  latest.current = {
    onPeeledChange,
    radius,
    reduceMotion: Boolean(shouldReduceMotion),
    restCorner,
    sound,
  };

  const state = useRef({
    corner: restCorner,
    crackle: null as Crackle | null,
    drag: null as Drag | null,
    exit: null as Animation | null,
    frame: 0,
    hint: 0,
    hovering: false,
    lastLift: 0,
    lastTime: 0,
    phase: (defaultPeeled ? "off" : "stuck") as Phase,
    point: { x: 0, y: 0 },
    size: { height: 0, width: 0 } as Size,
    spring: CALM_SPRING,
    target: { x: 0, y: 0 },
    velocity: { x: 0, y: 0 },
  });

  /* ---- drawing ---------------------------------------------------------- */

  function draw() {
    const root = rootRef.current;
    const s = state.current;

    if (!root) {
      return { fraction: 0, lift: 0 };
    }

    const from = grabPoint(s.corner, s.size, latest.current.radius);
    const fold = foldSticker(s.size, from, s.point);

    for (const [name, value] of Object.entries(fold.variables)) {
      root.style.setProperty(`--peel-${name}`, value);
    }

    return fold;
  }

  function restFor(corner: PeelCorner) {
    const s = state.current;
    const lift = s.hovering || s.drag ? HOVER_LIFT : REST_LIFT;
    return restPoint(corner, s.size, latest.current.radius, lift);
  }

  /* ---- spring loop ------------------------------------------------------ */

  function tick(time: number) {
    const s = state.current;
    const dt = Math.min(0.032, Math.max(0.001, (time - s.lastTime) / 1000));
    s.lastTime = time;

    const steps = 4;
    const h = dt / steps;
    const { damping, stiffness } = s.spring;

    for (let step = 0; step < steps; step += 1) {
      const ax = stiffness * (s.target.x - s.point.x) - damping * s.velocity.x;
      const ay = stiffness * (s.target.y - s.point.y) - damping * s.velocity.y;
      s.velocity.x += ax * h;
      s.velocity.y += ay * h;
      s.point.x += s.velocity.x * h;
      s.point.y += s.velocity.y * h;
    }

    const fold = draw();

    // The crackle follows how fast the crease is travelling across the glue.
    if (s.crackle) {
      const speed = (fold.lift - s.lastLift) / dt;
      const level = speed > 0 ? Math.min(1, speed / 1100) : 0;
      const now = s.crackle.context.currentTime;
      s.crackle.gain.gain.setTargetAtTime(
        level * 0.36 * (0.35 + Math.random() * 0.65),
        now,
        0.012,
      );
      s.crackle.filter.frequency.setTargetAtTime(
        1800 + Math.random() * 2600,
        now,
        0.01,
      );
    }
    s.lastLift = fold.lift;

    // Once the crease has swept past the last corner, it is off.
    if (fold.fraction >= 0.999 && (s.phase === "leaving" || s.drag)) {
      s.frame = 0;
      flyAway();
      return;
    }

    const settled =
      !s.drag &&
      Math.hypot(s.velocity.x, s.velocity.y) < 2 &&
      Math.hypot(s.target.x - s.point.x, s.target.y - s.point.y) < 0.05;

    if (settled) {
      s.point = { ...s.target };
      s.velocity = { x: 0, y: 0 };
      draw();
      s.frame = 0;
      stopCrackle(s.crackle);
      s.crackle = null;
      return;
    }

    s.frame = requestAnimationFrame(tick);
  }

  function run() {
    const s = state.current;

    if (s.frame) {
      return;
    }

    s.lastTime = performance.now();
    s.frame = requestAnimationFrame(tick);
  }

  function settleTo(target: Point, spring = CALM_SPRING) {
    const s = state.current;
    s.target = target;
    s.spring = latest.current.reduceMotion ? CALM_SPRING : spring;
    run();
  }

  function listen() {
    const s = state.current;

    if (latest.current.sound && !s.crackle) {
      s.crackle = startCrackle();
    }
  }

  /* ---- coming off and going back on ------------------------------------ */

  function finishOff() {
    const s = state.current;
    s.phase = "off";
    s.drag = null;
    stopCrackle(s.crackle);
    s.crackle = null;
    setOff(true);
    setInnerPeeled(true);
    latest.current.onPeeledChange?.(true);
  }

  function flyAway() {
    const s = state.current;
    const flap = flapRef.current;
    s.phase = "leaving";

    if (!flap) {
      finishOff();
      return;
    }

    const from = grabPoint(s.corner, s.size, latest.current.radius);
    const away = {
      x: s.point.x - from.x,
      y: s.point.y - from.y,
    };
    const length = Math.hypot(away.x, away.y) || 1;
    const dx = (away.x / length) * 60;
    const dy = (away.y / length) * 60 - 36;

    s.exit = flap.animate(
      [
        { opacity: 1, transform: "translate(0px, 0px) rotate(0deg) scale(1)" },
        {
          opacity: 0,
          transform: `translate(${dx}px, ${dy}px) rotate(${away.x >= 0 ? 7 : -7}deg) scale(1.05)`,
        },
      ],
      {
        duration: 360,
        easing: "cubic-bezier(0.4, 0, 0.9, 0.5)",
        fill: "forwards",
      },
    );
    s.exit.onfinish = finishOff;
  }

  function peelOff(direction: Point) {
    const s = state.current;

    if (latest.current.reduceMotion) {
      s.phase = "leaving";
      s.exit =
        bodyRef.current?.animate([{ opacity: 1 }, { opacity: 0 }], {
          duration: 180,
          easing: "ease-out",
          fill: "forwards",
        }) ?? null;

      if (s.exit) {
        s.exit.onfinish = finishOff;
      } else {
        finishOff();
      }
      return;
    }

    const from = grabPoint(s.corner, s.size, latest.current.radius);
    const corners = [
      { x: 0, y: 0 },
      { x: s.size.width, y: 0 },
      { x: s.size.width, y: s.size.height },
      { x: 0, y: s.size.height },
    ];
    const reach = Math.max(
      ...corners.map(
        (point) =>
          (point.x - from.x) * direction.x + (point.y - from.y) * direction.y,
      ),
    );

    s.phase = "leaving";
    listen();
    settleTo(
      {
        x: from.x + direction.x * (reach * 2 + 80),
        y: from.y + direction.y * (reach * 2 + 80),
      },
      LEAVE_SPRING,
    );
  }

  function peelFromKeyboard() {
    const s = state.current;

    if (s.phase !== "stuck") {
      return;
    }

    peelOff(inwardOf(s.corner));
  }

  function stickBack() {
    const s = state.current;
    s.exit?.cancel();
    s.exit = null;
    s.phase = "stuck";
    s.corner = latest.current.restCorner;
    s.velocity = { x: 0, y: 0 };
    s.point = restFor(s.corner);
    s.target = { ...s.point };
    draw();
    setOff(false);
    setInnerPeeled(false);

    const body = bodyRef.current;

    if (latest.current.reduceMotion || !body) {
      body?.animate([{ opacity: 0 }, { opacity: 1 }], {
        duration: 180,
        easing: "ease-out",
      });
      return;
    }

    // Lowered on, pressed flat, a touch of give as the glue takes.
    body.animate(
      [
        {
          filter: "drop-shadow(0 14px 12px rgba(0, 0, 0, 0.18))",
          opacity: 0,
          transform: "translateY(-14px) scale(1.06) rotate(-2deg)",
        },
        {
          filter: "drop-shadow(0 6px 8px rgba(0, 0, 0, 0.14))",
          offset: 0.55,
          opacity: 1,
          transform: "translateY(-3px) scale(1.02) rotate(-0.4deg)",
        },
        {
          filter: "drop-shadow(0 0 0 rgba(0, 0, 0, 0))",
          offset: 0.78,
          transform: "translateY(0px) scale(0.985) rotate(0deg)",
        },
        {
          filter: "drop-shadow(0 0 0 rgba(0, 0, 0, 0))",
          transform: "translateY(0px) scale(1) rotate(0deg)",
        },
      ],
      { duration: 460, easing: "cubic-bezier(0.3, 0.7, 0.4, 1)" },
    );

    if (latest.current.sound) {
      window.setTimeout(playPat, 330);
    }
  }

  /* ---- measuring and syncing ------------------------------------------- */

  // biome-ignore lint/correctness/useExhaustiveDependencies: draw and restFor only read refs.
  useLayoutEffect(() => {
    const root = rootRef.current;

    if (!root) {
      return;
    }

    const measure = () => {
      const s = state.current;
      const size = { height: root.offsetHeight, width: root.offsetWidth };

      if (size.width === s.size.width && size.height === s.size.height) {
        return;
      }

      s.size = size;

      if (s.phase === "stuck" && !s.drag) {
        s.point = restFor(s.corner);
        s.target = { ...s.point };
        s.velocity = { x: 0, y: 0 };
      }

      draw();
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(root);

    return () => observer.disconnect();
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: the peel helpers only read refs.
  useEffect(() => {
    const s = state.current;

    if (isPeeled && s.phase === "stuck") {
      peelFromKeyboard();
    } else if (!isPeeled && s.phase === "off") {
      stickBack();
    }
  }, [isPeeled]);

  useEffect(() => {
    const s = state.current;

    return () => {
      cancelAnimationFrame(s.frame);
      window.clearTimeout(s.hint);
      stopCrackle(s.crackle);
    };
  }, []);

  /* ---- input ------------------------------------------------------------ */

  function toLocal(event: PointerEvent<HTMLDivElement>): Point {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function nearestCorner(point: Point) {
    const s = state.current;
    let best = s.corner;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const corner of CORNERS) {
      const grab = grabPoint(corner, s.size, latest.current.radius);
      const distance = Math.hypot(point.x - grab.x, point.y - grab.y);

      if (distance < bestDistance) {
        best = corner;
        bestDistance = distance;
      }
    }

    return { corner: best, distance: bestDistance };
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    const s = state.current;

    if (s.phase !== "stuck" || event.button !== 0 || s.drag) {
      return;
    }

    const local = toLocal(event);
    const { corner, distance } = nearestCorner(local);

    // Too far in to get a nail under: flutter the dog-ear as a hint.
    if (distance > GRAB_RADIUS) {
      window.clearTimeout(s.hint);
      settleTo(
        restPoint(s.corner, s.size, latest.current.radius, 36),
        SNAP_SPRING,
      );
      s.hint = window.setTimeout(
        () => settleTo(restFor(s.corner), SNAP_SPRING),
        140,
      );
      return;
    }

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    window.clearTimeout(s.hint);

    if (corner !== s.corner) {
      // A fresh corner starts flat; the old dog-ear presses back down.
      s.corner = corner;
      s.point = grabPoint(corner, s.size, latest.current.radius);
      s.velocity = { x: 0, y: 0 };
    }

    const inward = inwardOf(corner);
    const grab = grabPoint(corner, s.size, latest.current.radius);
    const origin = { ...s.point };
    // Getting a nail under it lifts the corner a little straight away.
    const current = Math.hypot(origin.x - grab.x, origin.y - grab.y);
    const nudge = Math.max(0, HOVER_LIFT - current);

    s.drag = {
      last: local,
      lastTime: performance.now(),
      origin: {
        x: origin.x + inward.x * nudge,
        y: origin.y + inward.y * nudge,
      },
      pointerId: event.pointerId,
      start: local,
      velocity: { x: 0, y: 0 },
    };
    rootRef.current?.style.setProperty("cursor", "grabbing");
    listen();
    settleTo({ ...s.drag.origin }, DRAG_SPRING);
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    const s = state.current;
    const local = toLocal(event);
    const drag = s.drag;

    if (!drag || drag.pointerId !== event.pointerId) {
      if (s.phase === "stuck" && event.pointerType === "mouse") {
        const { distance } = nearestCorner(local);
        event.currentTarget.style.cursor =
          distance <= GRAB_RADIUS ? "grab" : "default";
      }
      return;
    }

    const now = performance.now();
    const dt = Math.max(1, now - drag.lastTime) / 1000;
    const blend = 0.35;
    drag.velocity = {
      x: drag.velocity.x * (1 - blend) + ((local.x - drag.last.x) / dt) * blend,
      y: drag.velocity.y * (1 - blend) + ((local.y - drag.last.y) / dt) * blend,
    };
    drag.last = local;
    drag.lastTime = now;

    s.target = {
      x: drag.origin.x + local.x - drag.start.x,
      y: drag.origin.y + local.y - drag.start.y,
    };
    run();
  }

  function release(event: PointerEvent<HTMLDivElement>) {
    const s = state.current;
    const drag = s.drag;

    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    s.drag = null;
    event.currentTarget.style.cursor = "grab";

    if (s.phase !== "stuck") {
      return;
    }

    const from = grabPoint(s.corner, s.size, latest.current.radius);
    const away = { x: s.point.x - from.x, y: s.point.y - from.y };
    const length = Math.hypot(away.x, away.y);
    const direction =
      length > 1
        ? { x: away.x / length, y: away.y / length }
        : inwardOf(s.corner);
    // Held still before letting go: no flick, however fast it got there.
    const stale = performance.now() - drag.lastTime > 90;
    const fling = stale
      ? 0
      : drag.velocity.x * direction.x + drag.velocity.y * direction.y;
    const { fraction } = foldSticker(s.size, from, s.point);

    if (fraction > PEEL_THRESHOLD || (fraction > 0.06 && fling > FLICK_SPEED)) {
      peelOff(direction);
      return;
    }

    // Not far enough: the glue pulls it back down with a slap.
    s.velocity = {
      x: s.velocity.x + drag.velocity.x * 0.15,
      y: s.velocity.y + drag.velocity.y * 0.15,
    };
    settleTo(restFor(s.corner), SNAP_SPRING);
  }

  function setHovering(hovering: boolean) {
    const s = state.current;
    s.hovering = hovering;

    if (s.phase === "stuck" && !s.drag) {
      settleTo(restFor(s.corner), SNAP_SPRING);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      peelFromKeyboard();
    }
  }

  return (
    // biome-ignore lint/a11y/useSemanticElements: the sticker hosts arbitrary block artwork, which a <button> cannot contain.
    <div
      aria-hidden={off || undefined}
      aria-label={label}
      className={cn(
        "relative touch-none select-none outline-none [-webkit-tap-highlight-color:transparent] focus-visible:outline-2 focus-visible:outline-grayscale-8 focus-visible:outline-offset-4",
        off && "pointer-events-none invisible",
        className,
      )}
      data-peel-sticker=""
      data-state={off ? "off" : "stuck"}
      onBlur={() => setHovering(false)}
      onFocus={(event) => {
        if (event.currentTarget.matches(":focus-visible")) {
          setHovering(true);
        }
      }}
      onKeyDown={handleKeyDown}
      onLostPointerCapture={release}
      onPointerCancel={release}
      onPointerDown={handlePointerDown}
      onPointerEnter={(event) => {
        if (event.pointerType === "mouse") {
          setHovering(true);
        }
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === "mouse") {
          setHovering(false);
        }
      }}
      onPointerMove={handlePointerMove}
      onPointerUp={release}
      ref={rootRef}
      role="button"
      style={{ borderRadius: radius }}
      tabIndex={off ? -1 : 0}
    >
      <div className="absolute inset-0" ref={bodyRef}>
        <StickerLayers backing={backing} flapRef={flapRef} radius={radius}>
          {children}
        </StickerLayers>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* PeelStickerFace                                                             */
/* -------------------------------------------------------------------------- */

const FACE_VARIABLE_CLASSES =
  "[--peel-front-clip:var(--peel-front-clip-rest)] [--peel-flap-clip:var(--peel-flap-clip-rest)] [--peel-flap-transform:var(--peel-flap-transform-rest)] [--peel-shade-transform:var(--peel-shade-transform-rest)] [--peel-ground-clip:var(--peel-ground-clip-rest)] [--peel-flap-shadow:var(--peel-flap-shadow-rest)] group-hover:[--peel-front-clip:var(--peel-front-clip-hover)] group-hover:[--peel-flap-clip:var(--peel-flap-clip-hover)] group-hover:[--peel-flap-transform:var(--peel-flap-transform-hover)] group-hover:[--peel-shade-transform:var(--peel-shade-transform-hover)] group-hover:[--peel-ground-clip:var(--peel-ground-clip-hover)] group-hover:[--peel-flap-shadow:var(--peel-flap-shadow-hover)]";

/**
 * A still sticker for thumbnails. Its dog-ear lifts further while an
 * ancestor `.group` is hovered.
 */
export function PeelStickerFace({
  backing = DEFAULT_BACKING,
  children,
  className,
  corner = "bottom-right",
  height,
  hoverLift = 40,
  lift = REST_LIFT,
  radius = 12,
  width,
}: {
  backing?: string;
  children: ReactNode;
  className?: string;
  corner?: PeelCorner;
  height: number;
  hoverLift?: number;
  lift?: number;
  radius?: number;
  width: number;
}) {
  const size = { height, width };
  const from = grabPoint(corner, size, radius);
  const rest = foldSticker(size, from, restPoint(corner, size, radius, lift));
  const hover = foldSticker(
    size,
    from,
    restPoint(corner, size, radius, hoverLift),
  );

  return (
    <div
      aria-hidden="true"
      className={cn("relative", FACE_VARIABLE_CLASSES, className)}
      style={{
        height,
        width,
        ...prefixed(rest.variables, "-rest"),
        ...prefixed(hover.variables, "-hover"),
      }}
    >
      <StickerLayers
        backing={backing}
        radius={radius}
        transitionClassName="transition-[clip-path,transform,filter] duration-500 ease-[cubic-bezier(0.2,0.9,0.25,1)] motion-reduce:transition-none"
      >
        {children}
      </StickerLayers>
    </div>
  );
}
