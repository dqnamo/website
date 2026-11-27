"use client";

import {
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
} from "motion/react";
import {
  type KeyboardEvent,
  type PointerEvent,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { cn } from "@/helpers/classname-helper";

/* -------------------------------------------------------------------------- */
/* Geometry                                                                    */
/* -------------------------------------------------------------------------- */

/** Width of a sheet. */
const SHEET_WIDTH = 220;
/** Height of a sheet below the stub strip. */
const SHEET_HEIGHT = 232;
/** The stub strip runs from the top of the pad down to here. */
const STRIP_HEIGHT = 18;
/** Where the row of perforations sits, measured from the top of the pad. */
const PERFORATION_Y = 14;
/** Where a sheet's body starts. It tucks up under the strip until it tears. */
const BODY_TOP = 8;
/** Number of perforations across the sheet. */
const HOLE_COUNT = 23;
/** How far the hand has to pull, in pixels, to tear all the way across. */
const TEAR_LENGTH = 150;
/** Pull taken up by the paper before the first perforation gives. */
const TEAR_SLACK = 10;
/** The furthest a part-torn sheet hangs, in degrees. */
const MAX_HANG = 17;
/** How far the attached end may lift as the sheet swings, in pixels. */
const MAX_LIFT = 12;
/** Torn stubs kept under the binding. */
const MAX_STUBS = 7;

const HOLE_SPACING = SHEET_WIDTH / HOLE_COUNT;
const HANG_SPRING = { damping: 9, stiffness: 160, type: "spring" } as const;
const SETTLE_SPRING = { damping: 22, stiffness: 420, type: "spring" } as const;

type Side = "left" | "right";
type Point = readonly [number, number];

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

/* -------------------------------------------------------------------------- */
/* Dates                                                                       */
/* -------------------------------------------------------------------------- */

const DAY = 86_400_000;

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

/** Days since the epoch in local time, used to seed each sheet's tear. */
function dayNumber(date: Date) {
  return Math.round(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / DAY,
  );
}

function dayOfYear(date: Date) {
  return dayNumber(date) - dayNumber(new Date(date.getFullYear(), 0, 0));
}

function daysInYear(year: number) {
  return dayOfYear(new Date(year, 11, 31));
}

/** ISO 8601 week number. */
function isoWeek(date: Date) {
  const thursday = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
  );
  thursday.setUTCDate(
    thursday.getUTCDate() + 3 - ((thursday.getUTCDay() + 6) % 7),
  );
  const yearStart = Date.UTC(thursday.getUTCFullYear(), 0, 1);
  return Math.floor((thursday.getTime() - yearStart) / DAY / 7) + 1;
}

/** Age of the moon through its cycle, from 0 (new) through 0.5 (full). */
function moonPhase(date: Date) {
  const knownNewMoon = Date.UTC(2000, 0, 6, 18, 14);
  const synodicMonth = 29.530588853;
  const noon = Date.UTC(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    12,
  );
  const age = (noon - knownNewMoon) / DAY / synodicMonth;
  return age - Math.floor(age);
}

const longDate = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  weekday: "long",
  year: "numeric",
});
const monthName = new Intl.DateTimeFormat("en-GB", { month: "long" });
const weekdayName = new Intl.DateTimeFormat("en-GB", { weekday: "long" });

/* -------------------------------------------------------------------------- */
/* Torn edges                                                                  */
/* -------------------------------------------------------------------------- */

function seededRandom(seed: number) {
  let state = (seed * 2_654_435_761) >>> 0 || 1;

  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return ((state >>> 0) % 10_000) / 10_000;
  };
}

/**
 * The line a sheet tears along. It runs through the middle of every
 * perforation and wanders a little through the paper between them. The stub
 * and the sheet share it, so the two halves always fit back together.
 */
function tornProfile(seed: number): Point[] {
  const random = seededRandom(seed);
  const points: Point[] = [];
  const stepsPerHole = 4;

  for (let hole = 0; hole <= HOLE_COUNT; hole += 1) {
    for (let step = 0; step < stepsPerHole; step += 1) {
      if (hole === HOLE_COUNT && step > 0) {
        break;
      }

      const x = (hole + step / stepsPerHole - 0.5) * HOLE_SPACING;

      if (x < 0) {
        continue;
      }

      // Through a hole the edge is clean; between holes the fibres pull.
      const throughHole = step === 0;
      const wander = throughHole ? 0 : (random() - 0.5) * 3.4;
      points.push([Math.min(x, SHEET_WIDTH), PERFORATION_Y + wander]);
    }
  }

  points.unshift([0, PERFORATION_Y + (random() - 0.5) * 2]);
  points.push([SHEET_WIDTH, PERFORATION_Y + (random() - 0.5) * 2]);

  return points;
}

function toPolygon(points: readonly Point[]) {
  return `polygon(${points
    .map(([x, y]) => `${x.toFixed(2)}px ${y.toFixed(2)}px`)
    .join(", ")})`;
}

/** The strip above the perforations, torn open for `progress` of its width. */
function stripClipPath(profile: Point[], progress: number, side: Side) {
  const top: Point[] = [
    [0, 0],
    [SHEET_WIDTH, 0],
  ];

  if (progress <= 0) {
    return toPolygon([...top, [SHEET_WIDTH, STRIP_HEIGHT], [0, STRIP_HEIGHT]]);
  }

  if (progress >= 1) {
    return toPolygon([...top, ...[...profile].reverse()]);
  }

  if (side === "left") {
    const front = progress * SHEET_WIDTH;
    const torn = profile.filter(([x]) => x <= front).reverse();
    return toPolygon([
      ...top,
      [SHEET_WIDTH, STRIP_HEIGHT],
      [front, STRIP_HEIGHT],
      ...torn,
    ]);
  }

  const front = (1 - progress) * SHEET_WIDTH;
  const torn = profile.filter(([x]) => x >= front).reverse();
  return toPolygon([...top, ...torn, [front, STRIP_HEIGHT], [0, STRIP_HEIGHT]]);
}

/** The sheet below the perforations, with its torn top edge. */
function bodyClipPath(profile: Point[]) {
  return toPolygon([
    ...profile.map(([x, y]): Point => [x, y - BODY_TOP]),
    [SHEET_WIDTH, SHEET_HEIGHT],
    [0, SHEET_HEIGHT],
  ]);
}

/**
 * How far a part-torn sheet swings about the end of the tear. It droops
 * further as the tear runs on, but never so far that the end still held by
 * the binding has to lift out from under it.
 */
function hangAngle(progress: number, side: Side) {
  if (progress <= 0) {
    return 0;
  }

  const held = Math.max(1, (1 - progress) * SHEET_WIDTH);
  const allowed = (Math.asin(Math.min(1, MAX_LIFT / held)) * 180) / Math.PI;
  const angle = Math.min(progress ** 1.3 * MAX_HANG, allowed);

  return side === "left" ? -angle : angle;
}

/** Where the tear has got to, which is also the point the sheet swings on. */
function hingeX(progress: number, side: Side) {
  return side === "left"
    ? progress * SHEET_WIDTH
    : (1 - progress) * SHEET_WIDTH;
}

/* -------------------------------------------------------------------------- */
/* Sound                                                                       */
/* -------------------------------------------------------------------------- */

let sharedAudioContext: AudioContext | null = null;
let noiseBuffer: AudioBuffer | null = null;
let lastTickAt = 0;

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

function getNoise(context: AudioContext) {
  if (!noiseBuffer) {
    const length = Math.floor(context.sampleRate * 0.4);
    noiseBuffer = context.createBuffer(1, length, context.sampleRate);
    const data = noiseBuffer.getChannelData(0);

    for (let index = 0; index < length; index += 1) {
      data[index] = Math.random() * 2 - 1;
    }
  }

  return noiseBuffer;
}

/** A dry tick of paper fibre as the tear crosses one perforation. */
function playTick() {
  const context = getAudioContext();

  if (!context) {
    return;
  }

  const now = context.currentTime;

  if (now - lastTickAt < 0.012) {
    return;
  }

  lastTickAt = now;

  const source = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const gain = context.createGain();
  const duration = 0.014 + Math.random() * 0.012;

  source.buffer = getNoise(context);
  filter.type = "bandpass";
  filter.frequency.value = 2400 + Math.random() * 1800;
  filter.Q.value = 1.1;
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(
    0.22 + Math.random() * 0.14,
    now + 0.002,
  );
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  source.connect(filter).connect(gain).connect(context.destination);
  source.start(now, Math.random() * 0.3, duration);
}

/** The last fibres giving way, and the sheet coming free. */
function playRip() {
  const context = getAudioContext();

  if (!context) {
    return;
  }

  const now = context.currentTime;
  const source = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const gain = context.createGain();

  source.buffer = getNoise(context);
  filter.type = "bandpass";
  filter.Q.value = 0.8;
  filter.frequency.setValueAtTime(1400, now);
  filter.frequency.exponentialRampToValueAtTime(4200, now + 0.09);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.32, now + 0.006);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);

  source.connect(filter).connect(gain).connect(context.destination);
  source.start(now, 0, 0.13);
}

/* -------------------------------------------------------------------------- */
/* Visual pieces                                                               */
/* -------------------------------------------------------------------------- */

/** Paper stays paper in both themes, just a little dimmer in the dark. */
const paperClassName =
  "bg-[#fbf9f3] text-[#1d1b17] dark:bg-[#e6e0d3] dark:text-[#1d1b17]";
const redInk = "text-[#c4362b] dark:text-[#b3302a]";

function MoonGlyph({ phase }: { phase: number }) {
  const radius = 5;
  const waxing = phase < 0.5;
  const lit = Math.cos(phase * 2 * Math.PI);
  const gibbous = Math.abs(phase - 0.5) < 0.25;
  const terminator = Math.abs(lit) * radius;

  return (
    <svg aria-hidden="true" className="size-3" viewBox="-6 -6 12 12">
      <circle cx={0} cy={0} fill="currentColor" opacity={0.14} r={radius} />
      <path
        d={`M 0 ${-radius} A ${radius} ${radius} 0 0 1 0 ${radius} A ${terminator} ${radius} 0 0 ${gibbous ? 1 : 0} 0 ${-radius} Z`}
        fill="currentColor"
        opacity={0.78}
        transform={waxing ? undefined : "scale(-1 1)"}
      />
    </svg>
  );
}

/** The printed face of one day's sheet. Reused by the catalog preview. */
export function CalendarSheetFace({
  className,
  date,
}: {
  className?: string;
  date: Date;
}) {
  const sunday = date.getDay() === 0;
  const remaining = daysInYear(date.getFullYear()) - dayOfYear(date);

  return (
    <div
      className={cn(
        "flex size-full flex-col items-center px-4 pt-[18px] pb-3",
        className,
      )}
    >
      <div className="flex w-full items-center justify-between">
        <span
          className={cn(
            "font-semibold text-[10.5px] uppercase tracking-[0.24em]",
            sunday ? redInk : "opacity-85",
          )}
        >
          {monthName.format(date)}
        </span>
        <span className="opacity-70">
          <MoonGlyph phase={moonPhase(date)} />
        </span>
      </div>

      <span
        className={cn(
          "mt-2 font-bold font-number text-[118px] tabular-nums leading-[0.9] tracking-[-0.045em]",
          sunday && redInk,
        )}
      >
        {date.getDate()}
      </span>

      <span
        className={cn(
          "mt-2.5 font-semibold text-[12px] uppercase tracking-[0.32em]",
          sunday ? redInk : "opacity-80",
        )}
      >
        {weekdayName.format(date)}
      </span>

      <div className="mt-auto flex w-full items-center justify-between border-current/15 border-t border-dashed pt-2 font-mono text-[8.5px] uppercase tracking-[0.08em] opacity-55">
        <span>Wk {isoWeek(date)}</span>
        <span>
          Day {dayOfYear(date)} · {remaining} to go
        </span>
      </div>
    </div>
  );
}

function Perforations() {
  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 top-0"
      height={STRIP_HEIGHT}
      width={SHEET_WIDTH}
    >
      {Array.from({ length: HOLE_COUNT }, (_, hole) => (
        <circle
          className="fill-[#3a352e]/55"
          cx={(hole + 0.5) * HOLE_SPACING}
          cy={PERFORATION_Y}
          // biome-ignore lint/suspicious/noArrayIndexKey: holes are fixed
          key={hole}
          r={1.15}
        />
      ))}
    </svg>
  );
}

type Stub = { id: number; offset: number; seed: number; tilt: number };

type FallingSheetProps = {
  angle: number;
  date: Date;
  originX: number;
  reduceMotion: boolean;
  seed: number;
  side: Side;
  velocity: { x: number; y: number };
  onDone: () => void;
};

/**
 * A sheet that has come free. It keeps the swing it tore off with, falls,
 * catches the air and flutters, then fades out.
 */
function FallingSheet({
  angle,
  date,
  onDone,
  originX,
  reduceMotion,
  seed,
  side,
  velocity,
}: FallingSheetProps) {
  const ref = useRef<HTMLDivElement>(null);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    const element = ref.current;

    if (!element) {
      return;
    }

    if (reduceMotion) {
      const fade = animate(element, { opacity: 0 }, { duration: 0.2 });
      fade.then(() => onDoneRef.current());
      return () => fade.stop();
    }

    // The sheet swung about the end of its tear. Re-express that as a turn
    // about its centre plus a shift, so it can spin freely from here on.
    const centreX = SHEET_WIDTH / 2;
    const centreY = SHEET_HEIGHT / 2;
    const pivotY = PERFORATION_Y - BODY_TOP;
    const radians = (angle * Math.PI) / 180;
    const fromPivotX = centreX - originX;
    const fromPivotY = centreY - pivotY;
    let x =
      originX +
      fromPivotX * Math.cos(radians) -
      fromPivotY * Math.sin(radians) -
      centreX;
    let y =
      pivotY +
      fromPivotX * Math.sin(radians) +
      fromPivotY * Math.cos(radians) -
      centreY;
    let rotation = angle;
    let vx = clamp(velocity.x, -1400, 1400);
    let vy = clamp(velocity.y, -500, 1400);
    const direction = side === "left" ? -1 : 1;
    let spin = direction * (70 + Math.abs(vx) * 0.12) + vx * 0.05;
    const flutterRate = 6 + (seed % 5);
    let elapsed = 0;
    let previous = performance.now();
    let frame = 0;

    const step = (now: number) => {
      const dt = Math.min(0.032, (now - previous) / 1000);
      previous = now;
      elapsed += dt;

      // Paper is all drag: it falls fast, then the air takes over.
      vy += 1900 * dt;
      const drag = Math.exp(-2.4 * dt);
      vx *= drag;
      vy *= Math.exp(-1.1 * dt);
      vx += Math.sin(elapsed * flutterRate) * 520 * dt;
      spin *= Math.exp(-0.8 * dt);
      x += vx * dt;
      y += vy * dt;
      rotation += spin * dt;

      const flutter = Math.sin(elapsed * flutterRate + 0.6) * 34;
      const opacity = clamp(1 - (elapsed - 0.55) / 0.45, 0, 1);

      element.style.transform = `translate3d(${x}px, ${y}px, 0) rotate(${rotation}deg) rotateX(${flutter}deg) rotateY(${flutter * 0.4}deg)`;
      element.style.opacity = String(opacity);

      if (opacity <= 0) {
        onDoneRef.current();
        return;
      }

      frame = requestAnimationFrame(step);
    };

    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [angle, originX, reduceMotion, seed, side, velocity]);

  const profile = tornProfile(seed);

  return (
    <div
      className="pointer-events-none absolute left-0 [perspective:700px]"
      style={{ top: BODY_TOP }}
    >
      <div
        className="origin-center drop-shadow-[0_10px_14px_rgba(0,0,0,0.22)]"
        ref={ref}
        style={{
          height: SHEET_HEIGHT,
          transform: reduceMotion ? `rotate(${angle}deg)` : undefined,
          transformOrigin: reduceMotion
            ? `${originX}px ${PERFORATION_Y - BODY_TOP}px`
            : undefined,
          width: SHEET_WIDTH,
        }}
      >
        <div
          className={cn("size-full", paperClassName)}
          style={{ clipPath: bodyClipPath(profile) }}
        >
          <CalendarSheetFace date={date} />
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Calendar                                                                    */
/* -------------------------------------------------------------------------- */

export type TearOffCalendarProps = {
  /** The day on the front sheet. Pair with `onDateChange` to control it. */
  date?: Date;
  /** The first day shown when uncontrolled. Defaults to today. */
  defaultDate?: Date;
  /** Called with the next day each time a sheet tears free. */
  onDateChange?: (date: Date) => void;
  /** Play a tick for each perforation and a rip as the sheet comes free. */
  sound?: boolean;
  className?: string;
};

type Falling = Omit<FallingSheetProps, "onDone" | "reduceMotion"> & {
  id: number;
};

export function TearOffCalendar({
  className,
  date: controlledDate,
  defaultDate,
  onDateChange,
  sound = true,
}: TearOffCalendarProps) {
  const reduceMotion = useReducedMotion() ?? false;
  const hintId = useId();
  const [internalDate, setInternalDate] = useState(() =>
    startOfDay(defaultDate ?? new Date()),
  );
  const date = controlledDate ? startOfDay(controlledDate) : internalDate;
  const seed = dayNumber(date);
  const profile = tornProfile(seed);

  const [progress, setProgress] = useState(0);
  const [side, setSide] = useState<Side>("right");
  const [grabbed, setGrabbed] = useState(false);
  const [stubs, setStubs] = useState<Stub[]>([]);
  const [falling, setFalling] = useState<Falling[]>([]);
  const [announcement, setAnnouncement] = useState("");

  const rotate = useMotionValue(0);
  const lift = useMotionValue(0);
  const sag = useMotionValue(0);

  const progressRef = useRef(0);
  const sideRef = useRef<Side>("right");
  const dragRef = useRef<{
    pointerId: number;
    startProgress: number;
    startX: number;
    startY: number;
    samples: { t: number; x: number; y: number }[];
  } | null>(null);
  const autoTearRef = useRef<ReturnType<typeof animate> | null>(null);
  const idRef = useRef(0);
  const soundRef = useRef(sound);
  soundRef.current = sound;

  const dateRef = useRef(date);
  dateRef.current = date;

  // Start every new day flat, with no tear in it.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset per sheet
  useEffect(() => {
    progressRef.current = 0;
    setProgress(0);
    rotate.jump(0);
    lift.jump(0);
    sag.jump(0);
  }, [seed]);

  const setTear = useCallback(
    (next: number) => {
      const previous = progressRef.current;

      if (next <= previous) {
        return;
      }

      const crossedBefore = Math.floor(previous * HOLE_COUNT);
      const crossedNow = Math.floor(next * HOLE_COUNT);

      if (soundRef.current && crossedNow > crossedBefore) {
        playTick();
      }

      progressRef.current = next;
      setProgress(next);
      rotate.set(hangAngle(next, sideRef.current));
    },
    [rotate],
  );

  const detach = useCallback(
    (velocity: { x: number; y: number }) => {
      const current = dateRef.current;
      const tornSide = sideRef.current;
      idRef.current += 1;
      const id = idRef.current;

      if (soundRef.current) {
        playRip();
      }

      setFalling((list) => [
        ...list.slice(-3),
        {
          angle: rotate.get(),
          date: current,
          id,
          originX: hingeX(1, tornSide),
          seed: dayNumber(current),
          side: tornSide,
          velocity,
        },
      ]);
      setStubs((list) => {
        const random = seededRandom(dayNumber(current) + 7);
        return [
          ...list,
          {
            id,
            offset: (random() - 0.5) * 1.6,
            seed: dayNumber(current),
            tilt: (random() - 0.5) * 0.7,
          },
        ].slice(-MAX_STUBS);
      });

      const next = addDays(current, 1);
      progressRef.current = 0;
      setProgress(0);
      rotate.jump(0);
      lift.jump(0);
      sag.jump(0);
      setAnnouncement(longDate.format(next));

      if (!controlledDate) {
        setInternalDate(next);
      }

      onDateChange?.(next);
    },
    [controlledDate, lift, onDateChange, rotate, sag],
  );

  const tearOff = useCallback(() => {
    if (autoTearRef.current) {
      return;
    }

    if (soundRef.current) {
      getAudioContext();
    }

    if (progressRef.current === 0) {
      sideRef.current = "right";
      setSide("right");
    }

    const outward = sideRef.current === "left" ? -1 : 1;

    if (reduceMotion) {
      setTear(1);
      detach({ x: outward * 200, y: 300 });
      return;
    }

    const from = progressRef.current;
    autoTearRef.current = animate(from, 1, {
      duration: 0.12 + (1 - from) * 0.36,
      ease: [0.5, 0, 0.9, 0.6],
      onUpdate: setTear,
      onComplete: () => {
        autoTearRef.current = null;
        detach({ x: outward * 260, y: 380 });
      },
    });
  }, [detach, reduceMotion, setTear]);

  useEffect(() => () => autoTearRef.current?.stop(), []);

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || autoTearRef.current) {
      return;
    }

    if (soundRef.current) {
      getAudioContext();
    }

    const bounds = event.currentTarget.getBoundingClientRect();

    // A fresh sheet tears from whichever side you take hold of.
    if (progressRef.current === 0) {
      const grabbedSide: Side =
        event.clientX - bounds.left < bounds.width / 2 ? "left" : "right";
      sideRef.current = grabbedSide;
      setSide(grabbedSide);
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      samples: [{ t: event.timeStamp, x: event.clientX, y: event.clientY }],
      startProgress: progressRef.current,
      startX: event.clientX,
      startY: event.clientY,
    };
    setGrabbed(true);

    if (!reduceMotion) {
      animate(lift, 9, SETTLE_SPRING);
    }
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;

    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    drag.samples.push({
      t: event.timeStamp,
      x: event.clientX,
      y: event.clientY,
    });

    if (drag.samples.length > 6) {
      drag.samples.shift();
    }

    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    const outward = sideRef.current === "left" ? -dx : dx;
    // Pulling down tears; pulling away from the binding's held end helps.
    const pull = dy * 0.92 + outward * 0.42;
    // Take back the tear you already made before pulling any further.
    const alreadyTorn = drag.startProgress * TEAR_LENGTH;
    const slack = drag.startProgress > 0 ? 0 : TEAR_SLACK;
    const target = clamp((pull - slack + alreadyTorn) / TEAR_LENGTH, 0, 1);

    // The paper gives a little under the hand before it tears.
    sag.set(clamp(dy * 0.05, -2, 5));

    if (target > progressRef.current) {
      setTear(target);
    }

    if (progressRef.current >= 1) {
      const first = drag.samples[0];
      const last = drag.samples[drag.samples.length - 1];
      const elapsed = Math.max(16, last.t - first.t) / 1000;
      dragRef.current = null;
      setGrabbed(false);
      detach({
        x: (last.x - first.x) / elapsed,
        y: Math.max(120, (last.y - first.y) / elapsed),
      });
    }
  };

  const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) {
      return;
    }

    dragRef.current = null;
    setGrabbed(false);

    // A part-torn sheet lets go and swings on what is left holding it.
    animate(lift, 0, SETTLE_SPRING);
    animate(sag, 0, SETTLE_SPRING);

    if (!reduceMotion && progressRef.current > 0) {
      const angle = hangAngle(progressRef.current, sideRef.current);
      rotate.set(angle * 1.35);
      animate(rotate, angle, HANG_SPRING);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      tearOff();
    }
  };

  const nextDate = addDays(date, 1);
  const nextProfile = tornProfile(dayNumber(nextDate));
  const remaining = daysInYear(date.getFullYear()) - dayOfYear(date);
  const padThickness = 3 + Math.round((remaining / 365) * 11);
  const hinge = hingeX(progress, side);
  const shade = Math.min(1, progress * 1.6);
  const label = longDate.format(date);

  return (
    <section
      aria-label="Tear-off calendar"
      className={cn(
        "relative select-none rounded-[10px] bg-[#26231f] p-2.5 pt-0 shadow-[0_1px_0_rgba(255,255,255,0.08)_inset,0_18px_30px_-12px_rgba(0,0,0,0.45),0_2px_4px_rgba(0,0,0,0.2)] ring-1 ring-black/40",
        className,
      )}
      style={{ width: SHEET_WIDTH + 20 }}
    >
      {/* Header board with the hanging eyelet and the year in gold foil */}
      <div className="relative flex h-[46px] flex-col items-center justify-end pb-[7px]">
        <span
          aria-hidden="true"
          className="absolute top-[9px] size-[13px] rounded-full bg-[radial-gradient(circle_at_50%_50%,#121110_0_3.2px,transparent_3.6px),linear-gradient(145deg,#f2d79a,#9c7434_60%,#d8b56c)] shadow-[0_1px_1px_rgba(0,0,0,0.5)]"
        />
        <span className="bg-[linear-gradient(180deg,#f4dca0,#b98d40)] bg-clip-text font-number font-semibold text-[11px] text-transparent tracking-[0.4em]">
          {date.getFullYear()}
        </span>
      </div>

      <div
        className="relative"
        style={{ height: BODY_TOP + SHEET_HEIGHT + padThickness }}
      >
        {/* The edges of the sheets still to come */}
        <div
          aria-hidden="true"
          className="absolute inset-x-[1px] rounded-b-[2px] bg-[repeating-linear-gradient(180deg,#f3efe5_0_1px,#cfc8b8_1px_2px)] dark:bg-[repeating-linear-gradient(180deg,#ddd6c7_0_1px,#aaa292_1px_2px)]"
          style={{ height: padThickness, top: BODY_TOP + SHEET_HEIGHT }}
        />

        {/* Tomorrow, waiting underneath */}
        <div aria-hidden="true">
          <div
            className={cn("absolute left-0", paperClassName)}
            style={{
              clipPath: bodyClipPath(nextProfile),
              height: SHEET_HEIGHT,
              top: BODY_TOP,
              width: SHEET_WIDTH,
            }}
          >
            <CalendarSheetFace date={nextDate} />
            <div
              className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(40,30,20,0.22),transparent_42%)] transition-opacity duration-300"
              style={{ opacity: grabbed ? Math.max(shade, 0.35) : shade }}
            />
          </div>
          <div
            className={cn("absolute top-0 left-0", paperClassName)}
            style={{ height: STRIP_HEIGHT, width: SHEET_WIDTH }}
          >
            <Perforations />
          </div>
        </div>

        {/* Today */}
        <div
          className="absolute left-0 [perspective:800px]"
          style={{ top: BODY_TOP, width: SHEET_WIDTH }}
        >
          <motion.div
            aria-describedby={hintId}
            aria-label={`Tear off ${label}`}
            className="relative cursor-grab touch-none outline-none active:cursor-grabbing [&:focus-visible>div]:ring-2 [&:focus-visible>div]:ring-[#c4362b]/60 [&:focus-visible>div]:ring-inset"
            onKeyDown={handleKeyDown}
            onLostPointerCapture={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            role="button"
            style={{
              height: SHEET_HEIGHT,
              rotate,
              rotateX: lift,
              transformOrigin: `${hinge}px ${PERFORATION_Y - BODY_TOP}px`,
              y: sag,
            }}
            tabIndex={0}
          >
            <div
              className={cn("size-full", paperClassName)}
              style={{ clipPath: bodyClipPath(profile) }}
            >
              <CalendarSheetFace date={date} />
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,transparent_55%,rgba(60,45,25,0.06))]"
              />
            </div>
          </motion.div>
        </div>

        {/* Today's stub, tearing open as you pull */}
        <div
          aria-hidden="true"
          className={cn("absolute top-0 left-0", paperClassName)}
          style={{
            clipPath: stripClipPath(profile, progress, side),
            height: STRIP_HEIGHT,
            width: SHEET_WIDTH,
          }}
        >
          <Perforations />
        </div>

        {/* Stubs from days already gone */}
        {stubs.map((stub, index) => (
          <div
            aria-hidden="true"
            className="absolute top-0 left-0 drop-shadow-[0_0.5px_0.6px_rgba(40,30,20,0.35)]"
            key={stub.id}
            style={{
              transform: `translateY(${stub.offset}px) rotate(${stub.tilt}deg)`,
            }}
          >
            <div
              className={paperClassName}
              style={{
                clipPath: stripClipPath(tornProfile(stub.seed), 1, "left"),
                filter: `brightness(${1 - (stubs.length - 1 - index) * 0.03})`,
                height: STRIP_HEIGHT,
                width: SHEET_WIDTH,
              }}
            />
          </div>
        ))}

        {/* The tin binding crimped over the top of the pad */}
        <div
          aria-hidden="true"
          className="absolute inset-x-[-3px] top-[-1px] h-[8px] rounded-[2px] bg-[linear-gradient(180deg,#e9e9e6,#a9a8a3_45%,#cfcfca_70%,#8d8c87)] shadow-[0_1px_2px_rgba(0,0,0,0.35)]"
        />

        {falling.map((sheet) => (
          <FallingSheet
            {...sheet}
            key={sheet.id}
            onDone={() =>
              setFalling((list) => list.filter((item) => item.id !== sheet.id))
            }
            reduceMotion={reduceMotion}
          />
        ))}
      </div>

      <p className="sr-only" id={hintId}>
        Drag the sheet down to tear it along the perforations, or press Enter.
      </p>
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </section>
  );
}

/**
 * A still of the calendar for thumbnails. The front sheet swings down from
 * one corner with `sheetClassName`, as if half torn.
 */
export function TearOffCalendarStill({
  className,
  date,
  sheetClassName,
}: {
  className?: string;
  date: Date;
  sheetClassName?: string;
}) {
  const day = startOfDay(date);
  const nextDate = addDays(day, 1);
  const profile = tornProfile(dayNumber(day));

  return (
    <div
      aria-hidden="true"
      className={cn(
        "relative rounded-[10px] bg-[#26231f] p-2.5 pt-0 shadow-[0_18px_30px_-12px_rgba(0,0,0,0.45)] ring-1 ring-black/40",
        className,
      )}
      style={{ width: SHEET_WIDTH + 20 }}
    >
      <div className="relative flex h-[46px] items-start justify-center pt-[9px]">
        <span className="size-[13px] rounded-full bg-[radial-gradient(circle_at_50%_50%,#121110_0_3.2px,transparent_3.6px),linear-gradient(145deg,#f2d79a,#9c7434_60%,#d8b56c)]" />
      </div>
      <div className="relative" style={{ height: BODY_TOP + SHEET_HEIGHT + 8 }}>
        <div
          className="absolute inset-x-[1px] rounded-b-[2px] bg-[repeating-linear-gradient(180deg,#f3efe5_0_1px,#cfc8b8_1px_2px)] dark:bg-[repeating-linear-gradient(180deg,#ddd6c7_0_1px,#aaa292_1px_2px)]"
          style={{ height: 8, top: BODY_TOP + SHEET_HEIGHT }}
        />
        <div
          className={cn("absolute left-0", paperClassName)}
          style={{ height: SHEET_HEIGHT, top: BODY_TOP, width: SHEET_WIDTH }}
        >
          <CalendarSheetFace date={nextDate} />
        </div>
        <div
          className={cn("absolute left-0 origin-top-left", sheetClassName)}
          style={{ height: SHEET_HEIGHT, top: BODY_TOP, width: SHEET_WIDTH }}
        >
          <div
            className={cn("size-full", paperClassName)}
            style={{ clipPath: bodyClipPath(profile) }}
          >
            <CalendarSheetFace date={day} />
          </div>
        </div>
        <div
          className={cn("absolute top-0 left-0", paperClassName)}
          style={{ height: STRIP_HEIGHT, width: SHEET_WIDTH }}
        >
          <Perforations />
        </div>
        <div className="absolute inset-x-[-3px] top-[-1px] h-[8px] rounded-[2px] bg-[linear-gradient(180deg,#e9e9e6,#a9a8a3_45%,#cfcfca_70%,#8d8c87)]" />
      </div>
    </div>
  );
}
