"use client";

import { useReducedMotion } from "motion/react";
import {
  type CSSProperties,
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

/** Bead width and height, in pixels. */
const BEAD_WIDTH = 40;
const BEAD_HEIGHT = 21;
/** How far a bead slides between resting on the frame and touching the beam. */
const TRAVEL = 19;
/** Distance between neighbouring rods. */
const ROD_PITCH = 46;
const BEAM_HEIGHT = 12;
const FRAME = 14;
const EARTH_BEADS = 4;
const UPPER_DECK = BEAD_HEIGHT + TRAVEL;
const LOWER_DECK = BEAD_HEIGHT * EARTH_BEADS + TRAVEL;
/** A drag shorter than this, in pixels, counts as a tap. */
const TAP_SLOP = 3;

/* -------------------------------------------------------------------------- */
/* Physics                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Every bead stores `p`: how far it sits from the beam, from 0 (touching the
 * beam, counted) to TRAVEL (resting against the frame). Index 0 is the heaven
 * bead, 1–4 are the earth beads from the beam outwards. Earth beads cannot
 * pass each other, so their `p` never decreases moving away from the beam.
 */
type Bead = {
  p: number;
  v: number;
  target: number;
  /** Seconds to wait before setting off, so a clear sweeps across the rods. */
  delay: number;
};

/** A stiff, underdamped pull; the beam and frame stop the overshoot. */
const PULL = 1500;
const DAMPING = 22;
/** How much speed survives a knock against the beam, frame or a neighbour. */
const RESTITUTION = 0.32;
/** Slower impacts than this, in px/s, are too soft to hear. */
const SILENT_IMPACT = 45;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

function digitTargets(digit: number) {
  const ones = digit % 5;

  return [
    digit >= 5 ? 0 : TRAVEL,
    ...Array.from({ length: EARTH_BEADS }, (_, index) =>
      index < ones ? 0 : TRAVEL,
    ),
  ];
}

function digitFromPositions(beads: readonly { p: number }[]) {
  let digit = beads[0].p < TRAVEL / 2 ? 5 : 0;

  for (let index = 1; index <= EARTH_BEADS; index += 1) {
    if (beads[index].p < TRAVEL / 2) {
      digit += 1;
    }
  }

  return digit;
}

function digitsOf(value: number, rods: number) {
  const safe = clamp(Math.round(value), 0, 10 ** rods - 1);

  return Array.from(
    { length: rods },
    (_, rod) => Math.floor(safe / 10 ** (rods - 1 - rod)) % 10,
  );
}

function totalOf(digits: readonly number[]) {
  return digits.reduce((total, digit) => total * 10 + digit, 0);
}

/** Where a bead is drawn, from the top of its deck. */
function beadTop(index: number, p: number) {
  if (index === 0) {
    return TRAVEL - p;
  }

  return (index - 1) * BEAD_HEIGHT + p;
}

/* -------------------------------------------------------------------------- */
/* Sound                                                                       */
/* -------------------------------------------------------------------------- */

let sharedAudioContext: AudioContext | null = null;
let clackBuffer: AudioBuffer | null = null;
let lastClackAt = 0;

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

/**
 * Hard wood on hard wood: a short knock of noise with a hollow ring inside it.
 */
function createClackBuffer(context: AudioContext) {
  const length = Math.floor(context.sampleRate * 0.045);
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);

  for (let index = 0; index < length; index += 1) {
    const t = index / context.sampleRate;
    const knock = (Math.random() * 2 - 1) * Math.exp(-t / 0.0022);
    const ring =
      (Math.sin(2 * Math.PI * 2350 * t) * 0.6 +
        Math.sin(2 * Math.PI * 3900 * t) * 0.25) *
      Math.exp(-t / 0.009);
    data[index] = knock * 0.7 + ring * 0.5;
  }

  return buffer;
}

function playClack(speed: number) {
  const context = getAudioContext();

  if (!context) {
    return;
  }

  const now = context.currentTime;

  // A whole stack landing at once is one clack, not five.
  if (now - lastClackAt < 0.014) {
    return;
  }

  lastClackAt = now;
  clackBuffer ??= createClackBuffer(context);

  const loudness = clamp(speed / 900, 0.08, 1);
  const source = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const gain = context.createGain();

  source.buffer = clackBuffer;
  source.playbackRate.value = 0.92 + Math.random() * 0.16;
  filter.type = "highpass";
  filter.frequency.value = 700;
  gain.gain.value = 0.6 * loudness;

  source.connect(filter).connect(gain).connect(context.destination);
  source.start(now);
}

function buzz(duration: number) {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    navigator.vibrate?.(duration);
  }
}

/* -------------------------------------------------------------------------- */
/* Visual pieces                                                               */
/* -------------------------------------------------------------------------- */

/** A bicone soroban bead seen side-on: pointed waist, flat faces. */
export const abacusBeadClipPath =
  "polygon(0 50%, 20% 6%, 30% 0, 70% 0, 80% 6%, 100% 50%, 80% 94%, 70% 100%, 30% 100%, 20% 94%)";

/** Boxwood, lit from above: a bright upper cone, a shadowed lower one. */
export const abacusBeadBackground = [
  "radial-gradient(ellipse 46% 60% at 38% 22%, rgb(255 244 222 / 0.55), transparent 70%)",
  "linear-gradient(180deg, #f3cf95 0%, #e2ad66 38%, #cf9149 49%, #a46a31 53%, #8a5626 78%, #6f4219 100%)",
].join(", ");

/** Ebony for the frame, in both themes. */
export const abacusFrameBackground = [
  "linear-gradient(180deg, rgb(255 255 255 / 0.07), transparent 22%, transparent 78%, rgb(0 0 0 / 0.3))",
  "repeating-linear-gradient(91deg, rgb(255 255 255 / 0.018) 0 2px, transparent 2px 7px)",
  "linear-gradient(180deg, #2b2320, #1a1513)",
].join(", ");

const beamBackground = [
  "linear-gradient(180deg, rgb(255 255 255 / 0.12), transparent 40%, rgb(0 0 0 / 0.28))",
  "linear-gradient(180deg, #3a302b, #241d1a)",
].join(", ");

const rodBackground =
  "linear-gradient(90deg, #6b5a3e, #d8c08a 45%, #8a7350 100%)";

const beadStyle: CSSProperties = {
  background: abacusBeadBackground,
  clipPath: abacusBeadClipPath,
  height: BEAD_HEIGHT,
  width: BEAD_WIDTH,
};

const rodNames = [
  "Ones",
  "Tens",
  "Hundreds",
  "Thousands",
  "Ten thousands",
  "Hundred thousands",
  "Millions",
  "Ten millions",
  "Hundred millions",
] as const;

/* -------------------------------------------------------------------------- */
/* Component                                                                   */
/* -------------------------------------------------------------------------- */

export type AbacusProps = {
  /** Accessible name for the whole frame. */
  label?: string;
  /** Number of rods, one per decimal place. */
  rods?: number;
  value?: number;
  defaultValue?: number;
  onValueChange?: (value: number) => void;
  /** Play a synthesised wooden clack whenever beads knock together. */
  sound?: boolean;
  /** Show each rod's digit under the frame. */
  showDigits?: boolean;
  className?: string;
};

type Drag = {
  bead: number;
  lastTime: number;
  lastY: number;
  moved: boolean;
  pointerId: number;
  rod: number;
  /** Screen pixels per layout pixel, in case the frame is scaled. */
  scale: number;
  startP: number;
  startY: number;
  velocity: number;
};

export function Abacus({
  label = "Abacus",
  rods = 7,
  value: controlledValue,
  defaultValue = 0,
  onValueChange,
  sound = true,
  showDigits = true,
  className,
}: AbacusProps) {
  const shouldReduceMotion = useReducedMotion();
  const labelId = useId();
  const isControlled = controlledValue !== undefined;
  const [uncontrolledValue, setUncontrolledValue] = useState(defaultValue);
  const value = isControlled ? controlledValue : uncontrolledValue;

  const [digits, setDigits] = useState(() => digitsOf(value, rods));
  const [focusedRod, setFocusedRod] = useState(rods - 1);
  const [heldRod, setHeldRod] = useState<number | null>(null);

  const beadsRef = useRef<Bead[][]>([]);
  const nodesRef = useRef<(HTMLSpanElement | null)[][]>([]);
  const rodNodesRef = useRef<(HTMLDivElement | null)[]>([]);
  const dragRef = useRef<Drag | null>(null);
  const frameRef = useRef<number | null>(null);
  const lastTickRef = useRef<number | null>(null);
  const digitsRef = useRef(digits);
  /** The last value this abacus reported, so its own echo is not re-applied. */
  const emittedRef = useRef(value);
  const soundRef = useRef(sound);
  const reduceRef = useRef(shouldReduceMotion);
  soundRef.current = sound;
  reduceRef.current = shouldReduceMotion;

  if (beadsRef.current.length !== rods) {
    beadsRef.current = digitsOf(value, rods).map((digit) =>
      digitTargets(digit).map((target) => ({
        delay: 0,
        p: target,
        target,
        v: 0,
      })),
    );
    nodesRef.current = Array.from({ length: rods }, () => []);
  }

  const paint = useCallback((rod: number) => {
    const beads = beadsRef.current[rod];
    const nodes = nodesRef.current[rod];

    for (let index = 0; index < beads.length; index += 1) {
      const node = nodes?.[index];

      if (node) {
        node.style.transform = `translate3d(0, ${beadTop(index, beads[index].p).toFixed(2)}px, 0)`;
      }
    }
  }, []);

  /** Show each rod's digit as the beads cross the halfway mark. */
  const syncDigits = useCallback(() => {
    const live = beadsRef.current.map(digitFromPositions);
    const previous = digitsRef.current;

    if (live.some((digit, rod) => digit !== previous[rod])) {
      digitsRef.current = live;
      setDigits(live);
    }
  }, []);

  const emit = useCallback(
    (nextDigits: readonly number[]) => {
      const next = totalOf(nextDigits);

      if (next === emittedRef.current) {
        return;
      }

      emittedRef.current = next;

      if (!isControlled) {
        setUncontrolledValue(next);
      }

      onValueChange?.(next);
    },
    [isControlled, onValueChange],
  );

  const step = useCallback(
    (dt: number) => {
      let moving = false;
      const drag = dragRef.current;

      beadsRef.current.forEach((beads, rod) => {
        let rodMoving = false;

        beads.forEach((bead, index) => {
          if (drag && drag.rod === rod && drag.bead === index) {
            return;
          }

          if (bead.delay > 0) {
            bead.delay -= dt;
            rodMoving = true;
            return;
          }

          const settled =
            Math.abs(bead.p - bead.target) < 0.05 && Math.abs(bead.v) < 2;

          if (settled) {
            bead.p = bead.target;
            bead.v = 0;
            return;
          }

          rodMoving = true;
          bead.v += ((bead.target - bead.p) * PULL - bead.v * DAMPING) * dt;
          bead.p += bead.v * dt;

          // The beam and the frame are hard stops: knock, and bounce back.
          if (bead.p < 0 || bead.p > TRAVEL) {
            const impact = Math.abs(bead.v);
            bead.p = bead.p < 0 ? 0 : TRAVEL;
            bead.v = -bead.v * RESTITUTION;

            if (impact > SILENT_IMPACT && soundRef.current) {
              playClack(impact);
            }
          }
        });

        // Earth beads cannot pass through each other; they knock and share.
        for (let index = 1; index < EARTH_BEADS; index += 1) {
          const inner = beads[index];
          const outer = beads[index + 1];

          if (inner.p <= outer.p) {
            continue;
          }

          const impact = Math.abs(inner.v - outer.v);
          const innerHeld = drag?.rod === rod && drag.bead === index;
          const outerHeld = drag?.rod === rod && drag.bead === index + 1;

          if (innerHeld) {
            outer.p = inner.p;
            outer.v = Math.max(outer.v, 0);
          } else if (outerHeld) {
            inner.p = outer.p;
            inner.v = Math.min(inner.v, 0);
          } else {
            const shared = (inner.v + outer.v) / 2;
            const middle = (inner.p + outer.p) / 2;
            inner.p = middle;
            outer.p = middle;
            inner.v = shared;
            outer.v = shared;
          }

          if (impact > SILENT_IMPACT && soundRef.current) {
            playClack(impact);
          }
        }

        if (rodMoving) {
          moving = true;
        }

        paint(rod);
      });

      return moving;
    },
    [paint],
  );

  const tick = useCallback(
    (time: number) => {
      const last = lastTickRef.current ?? time;
      const elapsed = Math.min((time - last) / 1000, 1 / 30);
      lastTickRef.current = time;

      let moving = false;
      const substeps = 4;

      for (let index = 0; index < substeps; index += 1) {
        moving = step(elapsed / substeps) || moving;
      }

      syncDigits();

      if (moving || dragRef.current) {
        frameRef.current = requestAnimationFrame(tick);
      } else {
        frameRef.current = null;
        lastTickRef.current = null;
      }
    },
    [step, syncDigits],
  );

  const wake = useCallback(() => {
    if (frameRef.current === null) {
      lastTickRef.current = null;
      frameRef.current = requestAnimationFrame(tick);
    }
  }, [tick]);

  useEffect(
    () => () => {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
      }
    },
    [],
  );

  /** Send a rod's beads to show a digit. Reduced motion jumps straight there. */
  const setRodTargets = useCallback(
    (rod: number, digit: number, delay = 0) => {
      const beads = beadsRef.current[rod];

      digitTargets(digit).forEach((target, index) => {
        const bead = beads[index];
        bead.delay = bead.target === target ? 0 : delay;
        bead.target = target;

        if (reduceRef.current) {
          bead.p = target;
          bead.v = 0;
          bead.delay = 0;
        }
      });

      if (reduceRef.current) {
        paint(rod);
        syncDigits();
        return;
      }

      wake();
    },
    [paint, syncDigits, wake],
  );

  // Follow a value set from outside, sweeping across the rods like a hand.
  useEffect(() => {
    if (value === emittedRef.current) {
      return;
    }

    emittedRef.current = value;
    const next = digitsOf(value, rods);
    let order = 0;

    next.forEach((digit, rod) => {
      const current = beadsRef.current[rod].map((bead) => bead.target);
      const wanted = digitTargets(digit);

      if (current.some((target, index) => target !== wanted[index])) {
        setRodTargets(rod, digit, order * 0.045);
        order += 1;
      }
    });

    digitsRef.current = next;
    setDigits(next);
  }, [rods, setRodTargets, value]);

  const targetDigits = useCallback(
    () =>
      beadsRef.current.map((beads) =>
        digitFromPositions(beads.map((bead) => ({ p: bead.target }))),
      ),
    [],
  );

  const setDigit = useCallback(
    (rod: number, digit: number) => {
      const current = targetDigits();
      const next = clamp(digit, 0, 9);

      if (current[rod] === next) {
        return;
      }

      getAudioContext();
      setRodTargets(rod, next);
      current[rod] = next;
      emit(current);
    },
    [emit, setRodTargets, targetDigits],
  );

  /* ------------------------------------------------------------------------ */
  /* Pointer                                                                   */
  /* ------------------------------------------------------------------------ */

  /** Move the held bead and shove any neighbours that are in its way. */
  function placeHeld(drag: Drag, p: number) {
    const beads = beadsRef.current[drag.rod];
    const held = beads[drag.bead];
    const wasAtStop = held.p <= 0 || held.p >= TRAVEL;
    const next = clamp(p, 0, TRAVEL);
    const isAtStop = next <= 0 || next >= TRAVEL;

    held.p = next;
    held.target = next;
    held.delay = 0;

    if (drag.bead > 0) {
      for (let index = 1; index <= EARTH_BEADS; index += 1) {
        const bead = beads[index];

        if (index < drag.bead && bead.p > next) {
          bead.p = next;
          bead.target = next;
          bead.v = 0;
        } else if (index > drag.bead && bead.p < next) {
          bead.p = next;
          bead.target = next;
          bead.v = 0;
        }
      }
    }

    if (!wasAtStop && isAtStop && soundRef.current) {
      playClack(Math.abs(drag.velocity));
    }

    paint(drag.rod);
    syncDigits();
  }

  function handlePointerDown(
    event: PointerEvent<HTMLSpanElement>,
    rod: number,
    bead: number,
  ) {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    const rodNode = rodNodesRef.current[rod];
    // Take focus for the keyboard, without lighting the ring for a mouse.
    rodNode?.focus({
      focusVisible: false,
      preventScroll: true,
    } as FocusOptions);
    setFocusedRod(rod);
    event.currentTarget.setPointerCapture(event.pointerId);

    const bounds = event.currentTarget.getBoundingClientRect();
    const scale = bounds.height / BEAD_HEIGHT || 1;

    dragRef.current = {
      bead,
      lastTime: event.timeStamp,
      lastY: event.clientY,
      moved: false,
      pointerId: event.pointerId,
      rod,
      scale,
      startP: beadsRef.current[rod][bead].p,
      startY: event.clientY,
      velocity: 0,
    };
    beadsRef.current[rod][bead].v = 0;
    setHeldRod(rod);
    getAudioContext();
    wake();
  }

  function handlePointerMove(event: PointerEvent<HTMLSpanElement>) {
    const drag = dragRef.current;

    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    const dy = (event.clientY - drag.startY) / drag.scale;

    if (!drag.moved && Math.abs(dy) < TAP_SLOP) {
      return;
    }

    drag.moved = true;
    // Heaven beads count when pushed down, earth beads when pushed up.
    const direction = drag.bead === 0 ? -1 : 1;
    const dt = Math.max((event.timeStamp - drag.lastTime) / 1000, 1 / 240);
    const instant =
      ((event.clientY - drag.lastY) / drag.scale / dt) * direction;
    drag.velocity = drag.velocity * 0.6 + instant * 0.4;
    drag.lastTime = event.timeStamp;
    drag.lastY = event.clientY;

    placeHeld(drag, drag.startP + dy * direction);
  }

  function endDrag(event: PointerEvent<HTMLSpanElement>) {
    const drag = dragRef.current;

    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    dragRef.current = null;
    setHeldRod(null);

    const beads = beadsRef.current[drag.rod];
    const held = beads[drag.bead];
    const current = targetDigits();

    let counted: boolean;

    if (!drag.moved) {
      // A tap flicks the bead across to the other side.
      counted = held.p >= TRAVEL / 2;
      held.v = counted ? -420 : 420;
    } else {
      // A flick carries on; a slow release settles on the nearer side.
      const projected = held.p + drag.velocity * 0.07;
      counted = projected < TRAVEL / 2;
      held.v = clamp(drag.velocity, -1400, 1400);
    }

    let digit: number;

    if (drag.bead === 0) {
      digit = (counted ? 5 : 0) + (current[drag.rod] % 5);
    } else {
      const ones = counted ? drag.bead : drag.bead - 1;
      digit = (current[drag.rod] >= 5 ? 5 : 0) + ones;
    }

    // Keep the pushed beads' momentum; only the targets change.
    digitTargets(digit).forEach((target, index) => {
      beads[index].target = target;
    });

    if (reduceRef.current) {
      setRodTargets(drag.rod, digit);
    } else {
      wake();
    }

    current[drag.rod] = digit;
    buzz(6);
    emit(current);
  }

  /* ------------------------------------------------------------------------ */
  /* Keyboard                                                                  */
  /* ------------------------------------------------------------------------ */

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>, rod: number) {
    const digit = targetDigits()[rod];
    const moveFocus = (next: number) => {
      const target = clamp(next, 0, rods - 1);
      setFocusedRod(target);
      rodNodesRef.current[target]?.focus();
    };

    if (/^[0-9]$/.test(event.key)) {
      event.preventDefault();
      setDigit(rod, Number(event.key));
      moveFocus(rod + 1);
      return;
    }

    switch (event.key) {
      case "ArrowUp":
      case "PageUp":
        event.preventDefault();
        setDigit(rod, digit + 1);
        return;
      case "ArrowDown":
      case "PageDown":
        event.preventDefault();
        setDigit(rod, digit - 1);
        return;
      case "Home":
      case "Backspace":
      case "Delete":
        event.preventDefault();
        setDigit(rod, 0);
        return;
      case "End":
        event.preventDefault();
        setDigit(rod, 9);
        return;
      case "ArrowLeft":
        event.preventDefault();
        moveFocus(rod - 1);
        return;
      case "ArrowRight":
        event.preventDefault();
        moveFocus(rod + 1);
        return;
      default:
    }
  }

  /* ------------------------------------------------------------------------ */
  /* Render                                                                    */
  /* ------------------------------------------------------------------------ */

  const innerWidth = rods * ROD_PITCH;
  const innerHeight = UPPER_DECK + BEAM_HEIGHT + LOWER_DECK;

  return (
    <div className={cn("flex flex-col items-center gap-3", className)}>
      <fieldset
        aria-labelledby={labelId}
        className="relative min-w-0 select-none rounded-[10px] dark:outline-1 dark:outline-white/[0.07] shadow-[0_1px_0_rgb(255_255_255_/_0.08)_inset,0_2px_4px_rgb(0_0_0_/_0.18),0_18px_40px_-12px_rgb(0_0_0_/_0.45)]"
        style={{
          background: abacusFrameBackground,
          padding: FRAME,
        }}
      >
        <span className="sr-only" id={labelId}>
          {label}, showing {totalOf(digits).toLocaleString("en-US")}
        </span>

        <div
          className="relative overflow-hidden rounded-[3px] shadow-[inset_0_2px_6px_rgb(0_0_0_/_0.55),inset_0_0_0_1px_rgb(0_0_0_/_0.4)]"
          style={{
            background:
              "radial-gradient(ellipse at 50% 40%, #1d1715, #0f0c0b 80%)",
            height: innerHeight,
            width: innerWidth,
          }}
        >
          {Array.from({ length: rods }, (_, rod) => {
            const place = rods - 1 - rod;
            const isFocused = focusedRod === rod;

            return (
              <div
                aria-label={`${rodNames[place] ?? `10^${place}`} rod`}
                aria-valuemax={9}
                aria-valuemin={0}
                aria-valuenow={digits[rod]}
                className="group/rod absolute top-0 h-full outline-none"
                // biome-ignore lint/suspicious/noArrayIndexKey: rods never reorder.
                key={rod}
                onFocus={() => setFocusedRod(rod)}
                onKeyDown={(event) => handleKeyDown(event, rod)}
                ref={(node) => {
                  rodNodesRef.current[rod] = node;
                }}
                role="slider"
                style={{ left: rod * ROD_PITCH, width: ROD_PITCH }}
                tabIndex={isFocused ? 0 : -1}
              >
                {/* Focus shows as a soft lit lane behind the rod. */}
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-x-[3px] inset-y-1 rounded-[4px] opacity-0 ring-1 ring-[#e9b871]/60 transition-opacity duration-150 group-focus-visible/rod:opacity-100"
                  style={{
                    background:
                      "linear-gradient(180deg, rgb(233 184 113 / 0.06), rgb(233 184 113 / 0.12), rgb(233 184 113 / 0.06))",
                  }}
                />

                <span
                  aria-hidden="true"
                  className="absolute inset-y-0 left-1/2 w-[3px] -translate-x-1/2"
                  style={{ background: rodBackground }}
                />

                <Deck
                  beads={[0]}
                  held={heldRod === rod}
                  height={UPPER_DECK}
                  nodes={nodesRef.current[rod]}
                  onPointerDown={(event, bead) =>
                    handlePointerDown(event, rod, bead)
                  }
                  onPointerEnd={endDrag}
                  onPointerMove={handlePointerMove}
                  positions={beadsRef.current[rod]}
                  top={0}
                />
                <Deck
                  beads={[1, 2, 3, 4]}
                  held={heldRod === rod}
                  height={LOWER_DECK}
                  nodes={nodesRef.current[rod]}
                  onPointerDown={(event, bead) =>
                    handlePointerDown(event, rod, bead)
                  }
                  onPointerEnd={endDrag}
                  onPointerMove={handlePointerMove}
                  positions={beadsRef.current[rod]}
                  top={UPPER_DECK + BEAM_HEIGHT}
                />
              </div>
            );
          })}

          {/* The reckoning bar, with a unit dot on every third rod. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 shadow-[0_2px_3px_rgb(0_0_0_/_0.45),0_-1px_2px_rgb(0_0_0_/_0.35)]"
            style={{
              background: beamBackground,
              height: BEAM_HEIGHT,
              top: UPPER_DECK,
            }}
          >
            {Array.from({ length: rods }, (_, rod) => {
              const place = rods - 1 - rod;

              if (place % 3 !== 0) {
                return null;
              }

              return (
                <span
                  className="absolute top-1/2 size-[4px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#e8dcc4] shadow-[0_0_0_1px_rgb(0_0_0_/_0.3)]"
                  // biome-ignore lint/suspicious/noArrayIndexKey: rods never reorder.
                  key={rod}
                  style={{ left: rod * ROD_PITCH + ROD_PITCH / 2 }}
                />
              );
            })}
          </div>
        </div>
      </fieldset>

      {showDigits ? (
        <div
          aria-hidden="true"
          className="flex font-medium font-mono text-[11px] text-grayscale-9 tabular-nums"
          style={{ width: innerWidth }}
        >
          {digits.map((digit, rod) => (
            <span
              className={cn(
                "text-center transition-colors duration-150",
                digit > 0 && "text-grayscale-12",
              )}
              // biome-ignore lint/suspicious/noArrayIndexKey: rods never reorder.
              key={rod}
              style={{ width: ROD_PITCH }}
            >
              {digit}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

type DeckProps = {
  beads: readonly number[];
  held: boolean;
  height: number;
  nodes: (HTMLSpanElement | null)[];
  onPointerDown: (event: PointerEvent<HTMLSpanElement>, bead: number) => void;
  onPointerEnd: (event: PointerEvent<HTMLSpanElement>) => void;
  onPointerMove: (event: PointerEvent<HTMLSpanElement>) => void;
  positions: readonly Bead[];
  top: number;
};

function Deck({
  beads,
  held,
  height,
  nodes,
  onPointerDown,
  onPointerEnd,
  onPointerMove,
  positions,
  top,
}: DeckProps) {
  return (
    <div
      className="absolute inset-x-0 drop-shadow-[0_2px_1.5px_rgb(0_0_0_/_0.55)]"
      style={{ height, top }}
    >
      {beads.map((bead) => (
        <span
          aria-hidden="true"
          className={cn(
            "absolute top-0 left-1/2 -ml-[20px] block touch-none will-change-transform",
            held ? "cursor-grabbing" : "cursor-grab",
          )}
          key={bead}
          onLostPointerCapture={onPointerEnd}
          onPointerCancel={onPointerEnd}
          onPointerDown={(event) => onPointerDown(event, bead)}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          ref={(node) => {
            nodes[bead] = node;
          }}
          style={{
            transform: `translate3d(0, ${beadTop(bead, positions[bead].p)}px, 0)`,
          }}
        >
          <span
            className="block transition-[filter] duration-150 [@media(hover:hover)_and_(pointer:fine)]:hover:brightness-110"
            style={beadStyle}
          />
        </span>
      ))}
    </div>
  );
}
