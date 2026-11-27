"use client";

import { useReducedMotion } from "motion/react";
import {
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type Ref,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { cn } from "@/helpers/classname-helper";

/* -------------------------------------------------------------------------- */
/* Physics                                                                     */
/* -------------------------------------------------------------------------- */

/** Gravity in px/s². Sets how quickly the pull swings back and forth. */
const GRAVITY = 3800;
/** The switch spring that the cord stretches against, per unit mass. */
const SPRING = 3200;
/** Friction in the switch, which only acts while the cord is taut. */
const SPRING_DAMPING = 45;
/** The spring winds the cord in no faster than this, so the pull hops, not flies. */
const MAX_RETRACT_SPEED = 680;
/** Air drag on the swing, per second. */
const AIR_DRAG = 0.55;
/** Physics substep, for a stiff spring that stays stable at any frame rate. */
const STEP = 1 / 240;

/** How far the cord can be drawn out of the switch, in px. */
const MAX_PULL = 40;
/** Draw the cord this far and the switch throws. */
const CLICK_AT = 22;
/** Let it back this far and the ratchet resets for the next pull. */
const RESET_AT = 7;
/** The little drop the cord gives once the switch has thrown. */
const GIVE = 5;
/** The pull can't rise closer than this to the switch. */
const CEILING_GAP = 8;

const SWITCH_WIDTH = 46;
const SWITCH_HEIGHT = 22;
const KNOB_WIDTH = 26;
const KNOB_HEIGHT = 46;
const HANDLE_WIDTH = 44;
const HANDLE_HEIGHT = 58;

type Vector = { x: number; y: number };

function restLength(length: number) {
  return length + GRAVITY / SPRING;
}

/** Past the click, every extra px of pull costs more hand. */
function rubberBand(over: number) {
  return MAX_PULL * (1 - Math.exp(-over / MAX_PULL));
}

/**
 * The cord as an SVG path. Taut, it's a straight line. Slack, it sags into a
 * curve whose length roughly matches the cord's.
 */
function cordPath(anchor: Vector, bob: Vector, length: number) {
  const chord = Math.hypot(bob.x, bob.y);
  const endX = anchor.x + bob.x;
  const endY = anchor.y + bob.y;

  if (chord >= length - 0.5 || chord < 1) {
    return {
      d: `M ${anchor.x} ${anchor.y} L ${endX} ${endY}`,
      tangent: { x: bob.x, y: bob.y },
    };
  }

  // A parabola's arc is about chord + 8s²/3chord, so solve for the sag s.
  const sag = Math.min(
    length * 0.45,
    Math.sqrt((3 * chord * (length - chord)) / 8),
  );
  // Sag to whichever side of the chord faces the floor.
  let normalX = -bob.y / chord;
  let normalY = bob.x / chord;

  if (normalY < 0 || (normalY === 0 && normalX < 0)) {
    normalX = -normalX;
    normalY = -normalY;
  }

  const controlX = anchor.x + bob.x / 2 + normalX * sag * 2;
  const controlY = anchor.y + bob.y / 2 + normalY * sag * 2;

  return {
    d: `M ${anchor.x} ${anchor.y} Q ${controlX} ${controlY} ${endX} ${endY}`,
    tangent: { x: endX - controlX, y: endY - controlY },
  };
}

/* -------------------------------------------------------------------------- */
/* Sound                                                                       */
/* -------------------------------------------------------------------------- */

let sharedAudioContext: AudioContext | null = null;

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

function noiseBurst(
  context: AudioContext,
  at: number,
  {
    decay,
    frequency,
    gain,
    q,
  }: Record<"decay" | "frequency" | "gain" | "q", number>,
) {
  const length = Math.floor(context.sampleRate * decay * 8);
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);

  for (let index = 0; index < length; index += 1) {
    data[index] =
      (Math.random() * 2 - 1) * Math.exp(-index / context.sampleRate / decay);
  }

  const source = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const level = context.createGain();

  source.buffer = buffer;
  filter.type = "bandpass";
  filter.frequency.value = frequency;
  filter.Q.value = q;
  level.gain.value = gain;
  source.connect(filter).connect(level).connect(context.destination);
  source.start(at);
}

/**
 * The throw is a sharp plastic clack with a thump from the ceiling behind it.
 * The reset is the ratchet's lighter tick on the way back up.
 */
function playSwitch(kind: "clack" | "tick") {
  const context = getAudioContext();

  if (!context) {
    return;
  }

  const now = context.currentTime;
  const wobble = 0.94 + Math.random() * 0.12;

  if (kind === "tick") {
    noiseBurst(context, now, {
      decay: 0.0012,
      frequency: 4600 * wobble,
      gain: 0.3,
      q: 2.2,
    });
    return;
  }

  noiseBurst(context, now, {
    decay: 0.0028,
    frequency: 2300 * wobble,
    gain: 0.75,
    q: 1.6,
  });
  noiseBurst(context, now + 0.006, {
    decay: 0.0016,
    frequency: 3600 * wobble,
    gain: 0.35,
    q: 2,
  });

  const thump = context.createOscillator();
  const level = context.createGain();

  thump.type = "sine";
  thump.frequency.setValueAtTime(170 * wobble, now);
  thump.frequency.exponentialRampToValueAtTime(70, now + 0.05);
  level.gain.setValueAtTime(0.0001, now);
  level.gain.exponentialRampToValueAtTime(0.4, now + 0.003);
  level.gain.exponentialRampToValueAtTime(0.0001, now + 0.07);
  thump.connect(level).connect(context.destination);
  thump.start(now);
  thump.stop(now + 0.08);
}

function buzz(duration: number) {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    navigator.vibrate?.(duration);
  }
}

/* -------------------------------------------------------------------------- */
/* Visual pieces                                                               */
/* -------------------------------------------------------------------------- */

/** A turned beech acorn on a brass ferrule. Its top centre ties onto the cord. */
function PullKnob({ className }: { className?: string }) {
  const id = useId().replace(/:/g, "");

  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      height={KNOB_HEIGHT}
      viewBox={`0 0 ${KNOB_WIDTH} ${KNOB_HEIGHT}`}
      width={KNOB_WIDTH}
    >
      <defs>
        <linearGradient id={`${id}-wood`} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#8a5a2e" />
          <stop offset="0.3" stopColor="#d49a5c" />
          <stop offset="0.46" stopColor="#e6b47a" />
          <stop offset="0.75" stopColor="#b47a42" />
          <stop offset="1" stopColor="#6e4522" />
        </linearGradient>
        <radialGradient cx="0.36" cy="0.62" id={`${id}-sheen`} r="0.5">
          <stop offset="0" stopColor="#fff4e2" stopOpacity="0.55" />
          <stop offset="1" stopColor="#fff4e2" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${id}-brass`} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#7d5f22" />
          <stop offset="0.35" stopColor="#f3d98d" />
          <stop offset="0.6" stopColor="#c9a24a" />
          <stop offset="1" stopColor="#6b4f1a" />
        </linearGradient>
      </defs>

      {/* Acorn body */}
      <path
        d="M13 7.5C17.2 7.5 23 18 23 29.5C23 38.4 18.6 44.5 13 44.5C7.4 44.5 3 38.4 3 29.5C3 18 8.8 7.5 13 7.5Z"
        fill={`url(#${id}-wood)`}
      />
      {/* Grain */}
      <path
        d="M9 15C8 22 7.6 31 9.4 41M16.4 13.5C17.6 21 18.4 30 16.8 42M12.6 9.5C12.2 20 12.4 33 13 44"
        opacity="0.16"
        stroke="#4a2a10"
        strokeLinecap="round"
        strokeWidth="0.6"
      />
      {/* Turned grooves */}
      <path
        d="M7.6 15.6Q13 17.4 18.4 15.6M5.6 19.6Q13 21.8 20.4 19.6"
        opacity="0.45"
        stroke="#5b3517"
        strokeLinecap="round"
        strokeWidth="0.8"
      />
      <path
        d="M7.8 16.5Q13 18.2 18.2 16.5M5.8 20.5Q13 22.6 20.2 20.5"
        opacity="0.35"
        stroke="#ffe2b8"
        strokeLinecap="round"
        strokeWidth="0.5"
      />
      <path
        d="M13 7.5C17.2 7.5 23 18 23 29.5C23 38.4 18.6 44.5 13 44.5C7.4 44.5 3 38.4 3 29.5C3 18 8.8 7.5 13 7.5Z"
        fill={`url(#${id}-sheen)`}
      />
      <path
        d="M13 7.5C17.2 7.5 23 18 23 29.5C23 38.4 18.6 44.5 13 44.5C7.4 44.5 3 38.4 3 29.5C3 18 8.8 7.5 13 7.5Z"
        stroke="#3d2210"
        strokeOpacity="0.35"
        strokeWidth="0.6"
      />

      {/* Ferrule */}
      <rect
        fill={`url(#${id}-brass)`}
        height="8"
        rx="1.6"
        width="7"
        x="9.5"
        y="0.5"
      />
      <path
        d="M9.8 3.2H16.2M9.8 5.4H16.2"
        opacity="0.35"
        stroke="#4b3610"
        strokeWidth="0.5"
      />
    </svg>
  );
}

/** The white ceiling switch the cord disappears into. */
function SwitchHousing({
  className,
  ref,
  style,
}: {
  className?: string;
  ref?: Ref<HTMLDivElement>;
  style?: CSSProperties;
}) {
  return (
    <div
      aria-hidden="true"
      className={cn("absolute top-0", className)}
      ref={ref}
      style={{
        background: "linear-gradient(180deg, #fdfcf9 0%, #ebe7e0 100%)",
        borderRadius: "3px 3px 8px 8px",
        boxShadow:
          "inset 0 -1px 0 rgb(0 0 0 / 10%), inset 0 1px 0 rgb(255 255 255 / 90%), 0 0 0 0.5px rgb(0 0 0 / 14%), 0 2px 3px rgb(0 0 0 / 12%), 0 8px 16px rgb(0 0 0 / 10%)",
        height: SWITCH_HEIGHT,
        width: SWITCH_WIDTH,
        ...style,
      }}
    >
      {/* Screws */}
      {[7, SWITCH_WIDTH - 13].map((left) => (
        <span
          className="absolute top-[6px] size-[6px] rounded-full"
          key={left}
          style={{
            background: "radial-gradient(circle at 35% 30%, #fff, #cfcac2)",
            boxShadow: "inset 0 0 0 0.5px rgb(0 0 0 / 25%)",
            left,
          }}
        >
          <span className="absolute top-1/2 left-[1px] h-px w-[4px] -translate-y-1/2 rotate-[35deg] bg-black/30" />
        </span>
      ))}
      {/* Cord slot */}
      <span
        className="absolute bottom-[3px] left-1/2 h-[4px] w-[9px] -translate-x-1/2 rounded-full"
        style={{
          background: "#2b2723",
          boxShadow: "inset 0 1px 1px rgb(0 0 0 / 60%), 0 0.5px 0 #fff",
        }}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Preview face                                                                */
/* -------------------------------------------------------------------------- */

/**
 * A decorative, non-interactive pull cord for thumbnails. The cord runs up
 * behind the switch, so translating `pullClassName` draws more of it out.
 */
export function PullCordFace({
  className,
  length = 64,
  pullClassName,
}: {
  className?: string;
  length?: number;
  pullClassName?: string;
}) {
  return (
    <div
      aria-hidden="true"
      className={cn("relative", className)}
      style={{
        height: SWITCH_HEIGHT + length + KNOB_HEIGHT + 12,
        width: SWITCH_WIDTH,
      }}
    >
      <div
        className={cn("absolute left-1/2 -translate-x-1/2", pullClassName)}
        style={{ top: SWITCH_HEIGHT - 4 - 24 }}
      >
        <div
          className="mx-auto w-[2.6px] rounded-full"
          style={{
            background:
              "repeating-linear-gradient(160deg, #f1ebdf 0 1.6px, #cbbfa9 1.6px 3.2px)",
            height: length + 24,
          }}
        />
        <PullKnob className="-mt-px drop-shadow-[0_3px_3px_rgb(0_0_0_/_0.22)]" />
      </div>
      <SwitchHousing />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* The pull cord                                                               */
/* -------------------------------------------------------------------------- */

export type PullCordProps = {
  /** Accessible name for the switch, e.g. "Light". */
  label: string;
  checked?: boolean;
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  /** Length of cord that hangs below the switch, in px. */
  length?: number;
  /** Play a synthesised clack on the throw and a tick on the reset. */
  sound?: boolean;
  className?: string;
};

type Sim = {
  /** Where the pointer wants the pull, relative to the anchor. */
  aim: Vector | null;
  /** Offset from the pointer to the pull, kept for the whole drag. */
  grab: Vector;
  /** A scripted tug from a tap or the keyboard. */
  tug: { elapsed: number } | null;
  give: number;
  latched: boolean;
  pointerId: number | null;
  position: Vector;
  velocity: Vector;
  downAt: { time: number; x: number; y: number; moved: boolean } | null;
};

const TUG_DURATION = 0.11;
const TUG_HOLD = 0.06;

export function PullCord({
  checked: controlledChecked,
  className,
  defaultChecked = false,
  label,
  length = 170,
  onCheckedChange,
  sound = true,
}: PullCordProps) {
  const shouldReduceMotion = useReducedMotion();
  const [uncontrolledChecked, setUncontrolledChecked] =
    useState(defaultChecked);
  const checked = controlledChecked ?? uncontrolledChecked;

  const width = Math.max(160, length * 1.1);
  const height = SWITCH_HEIGHT + length + MAX_PULL + KNOB_HEIGHT + 12;
  const anchor = { x: width / 2, y: SWITCH_HEIGHT - 4 };
  const rest = restLength(length);

  const rootRef = useRef<HTMLDivElement>(null);
  const cordRef = useRef<SVGPathElement>(null);
  const twistRef = useRef<SVGPathElement>(null);
  const shadowRef = useRef<SVGPathElement>(null);
  const handleRef = useRef<HTMLDivElement>(null);
  const housingRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<number | null>(null);
  const simRef = useRef<Sim>({
    aim: null,
    downAt: null,
    give: 0,
    grab: { x: 0, y: 0 },
    latched: false,
    pointerId: null,
    position: { x: 0, y: rest },
    tug: null,
    velocity: { x: 0, y: 0 },
  });

  // Keep the latest props for the animation loop without restarting it.
  const latest = useRef({
    anchor,
    checked,
    controlled: controlledChecked !== undefined,
    length,
    onCheckedChange,
    reduce: Boolean(shouldReduceMotion),
    sound,
  });
  latest.current = {
    anchor,
    checked,
    controlled: controlledChecked !== undefined,
    length,
    onCheckedChange,
    reduce: Boolean(shouldReduceMotion),
    sound,
  };

  const draw = useCallback(() => {
    const { anchor: origin, length: cordLength } = latest.current;
    const { position } = simRef.current;
    const { d, tangent } = cordPath(origin, position, cordLength);
    const angle = (-Math.atan2(tangent.x, tangent.y) * 180) / Math.PI;

    cordRef.current?.setAttribute("d", d);
    twistRef.current?.setAttribute("d", d);
    shadowRef.current?.setAttribute("d", d);

    if (handleRef.current) {
      handleRef.current.style.transform = `translate(${origin.x + position.x - HANDLE_WIDTH / 2}px, ${origin.y + position.y - 1}px) rotate(${angle}deg)`;
    }
  }, []);

  const toggle = useCallback(() => {
    const {
      checked: current,
      controlled,
      onCheckedChange: notify,
    } = latest.current;
    const next = !current;

    if (!controlled) {
      setUncontrolledChecked(next);
    }

    notify?.(next);
  }, []);

  /** Throw the switch on the way down, reset the ratchet on the way back. */
  const checkSwitch = useCallback(() => {
    const sim = simRef.current;
    const { length: cordLength, reduce, sound: withSound } = latest.current;
    const extension =
      Math.hypot(sim.position.x, sim.position.y) - cordLength - sim.give;

    if (!sim.latched && extension >= CLICK_AT) {
      sim.latched = true;
      toggle();
      buzz(10);

      if (withSound) {
        playSwitch("clack");
      }

      if (!reduce) {
        housingRef.current?.animate(
          [
            { transform: "translateY(0)" },
            { transform: "translateY(1.5px)" },
            { transform: "translateY(0)" },
          ],
          { duration: 110, easing: "cubic-bezier(0.2, 0.8, 0.3, 1)" },
        );
      }
    } else if (sim.latched && extension <= RESET_AT) {
      sim.latched = false;

      if (withSound) {
        playSwitch("tick");
      }
    }
  }, [toggle]);

  /** Set the pull where the hand has it, with resistance past the slack. */
  const followHand = useCallback((target: Vector, dt: number) => {
    const sim = simRef.current;
    const { length: cordLength } = latest.current;
    let x = target.x;
    let y = Math.max(CEILING_GAP, target.y);
    const distance = Math.hypot(x, y);

    if (distance > cordLength) {
      const pulled = cordLength + rubberBand(distance - cordLength) + sim.give;
      x = (x / distance) * pulled;
      y = (y / distance) * pulled;
    }

    if (dt > 0) {
      // Smooth the hand's speed so a flick carries into the swing.
      const blend = Math.min(1, dt * 30);
      sim.velocity.x += ((x - sim.position.x) / dt - sim.velocity.x) * blend;
      sim.velocity.y += ((y - sim.position.y) / dt - sim.velocity.y) * blend;
    }

    sim.position.x = x;
    sim.position.y = y;
  }, []);

  const integrate = useCallback((dt: number) => {
    const sim = simRef.current;
    const { length: cordLength } = latest.current;
    const { position: p, velocity: v } = sim;
    const drag = Math.exp(-AIR_DRAG * dt);
    let ax = 0;
    let ay = GRAVITY;
    const distance = Math.hypot(p.x, p.y);

    if (distance > cordLength) {
      const nx = p.x / distance;
      const ny = p.y / distance;
      const radial = v.x * nx + v.y * ny;
      const force = -SPRING * (distance - cordLength) - SPRING_DAMPING * radial;

      ax += force * nx;
      ay += force * ny;
    }

    v.x = (v.x + ax * dt) * drag;
    v.y = (v.y + ay * dt) * drag;

    if (distance > cordLength) {
      const nx = p.x / distance;
      const ny = p.y / distance;
      const radial = v.x * nx + v.y * ny;

      if (radial < -MAX_RETRACT_SPEED) {
        v.x -= (radial + MAX_RETRACT_SPEED) * nx;
        v.y -= (radial + MAX_RETRACT_SPEED) * ny;
      }
    }

    p.x += v.x * dt;
    p.y += v.y * dt;

    if (p.y < CEILING_GAP) {
      p.y = CEILING_GAP;
      v.y = Math.abs(v.y) * 0.25;
    }

    // The switch has a hard stop inside.
    const limit = cordLength + MAX_PULL + GIVE;
    const after = Math.hypot(p.x, p.y);

    if (after > limit) {
      p.x = (p.x / after) * limit;
      p.y = (p.y / after) * limit;
    }
  }, []);

  const tick = useCallback(
    (dt: number) => {
      const sim = simRef.current;
      const { length: cordLength } = latest.current;

      sim.give += ((sim.latched ? GIVE : 0) - sim.give) * Math.min(1, dt * 40);

      if (sim.tug) {
        sim.tug.elapsed += dt;
        const progress = Math.min(1, sim.tug.elapsed / TUG_DURATION);
        const eased = 1 - (1 - progress) ** 3;
        const depth = (CLICK_AT + 8) * eased;

        followHand(
          { x: sim.position.x * 0.8, y: cordLength + depth / 0.62 },
          dt,
        );

        if (sim.tug.elapsed >= TUG_DURATION + TUG_HOLD) {
          sim.tug = null;
        }
      } else if (sim.aim) {
        followHand(
          { x: sim.aim.x + sim.grab.x, y: sim.aim.y + sim.grab.y },
          dt,
        );
      } else {
        let remaining = dt;

        while (remaining > 1e-6) {
          const step = Math.min(STEP, remaining);
          integrate(step);
          remaining -= step;
        }
      }

      checkSwitch();
      draw();

      const atRest =
        !sim.aim &&
        !sim.tug &&
        Math.abs(sim.velocity.x) < 3 &&
        Math.abs(sim.velocity.y) < 3 &&
        Math.abs(sim.position.x) < 0.25 &&
        Math.abs(sim.position.y - restLength(cordLength)) < 0.25;

      return !atRest;
    },
    [checkSwitch, draw, followHand, integrate],
  );

  const wake = useCallback(() => {
    if (frameRef.current !== null) {
      return;
    }

    let last = performance.now();

    const frame = (now: number) => {
      // Cap long frames, e.g. after a background tab, so nothing explodes.
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      if (tick(dt)) {
        frameRef.current = requestAnimationFrame(frame);
      } else {
        const sim = simRef.current;
        sim.position = { x: 0, y: restLength(latest.current.length) };
        sim.velocity = { x: 0, y: 0 };
        draw();
        frameRef.current = null;
      }
    };

    frameRef.current = requestAnimationFrame(frame);
  }, [draw, tick]);

  useEffect(() => {
    const sim = simRef.current;

    if (!sim.aim && !sim.tug) {
      sim.position = { x: 0, y: restLength(length) };
    }

    draw();
  }, [draw, length]);

  useEffect(
    () => () => {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
      }
    },
    [],
  );

  /** Pull the cord for the person: on a tap, Enter or Space. */
  const tug = useCallback(() => {
    getAudioContext();

    if (latest.current.reduce) {
      // No swing: just throw the switch.
      const sim = simRef.current;
      sim.latched = false;
      toggle();
      buzz(10);

      if (latest.current.sound) {
        playSwitch("clack");
      }

      return;
    }

    simRef.current.tug = { elapsed: 0 };
    wake();
  }, [toggle, wake]);

  function localPoint(event: PointerEvent<HTMLDivElement>) {
    const bounds = rootRef.current?.getBoundingClientRect();
    const origin = latest.current.anchor;

    return {
      x: event.clientX - (bounds?.left ?? 0) - origin.x,
      y: event.clientY - (bounds?.top ?? 0) - origin.y,
    };
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) {
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    getAudioContext();

    const sim = simRef.current;
    const point = localPoint(event);

    sim.tug = null;
    sim.pointerId = event.pointerId;
    sim.aim = point;
    sim.grab = { x: sim.position.x - point.x, y: sim.position.y - point.y };
    sim.downAt = {
      moved: false,
      time: performance.now(),
      x: event.clientX,
      y: event.clientY,
    };
    wake();
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    const sim = simRef.current;

    if (sim.pointerId !== event.pointerId) {
      return;
    }

    sim.aim = localPoint(event);

    if (
      sim.downAt &&
      Math.hypot(event.clientX - sim.downAt.x, event.clientY - sim.downAt.y) > 5
    ) {
      sim.downAt.moved = true;
    }
  }

  function endDrag(event: PointerEvent<HTMLDivElement>) {
    const sim = simRef.current;

    if (sim.pointerId !== event.pointerId) {
      return;
    }

    const wasTap =
      event.type === "pointerup" &&
      sim.downAt &&
      !sim.downAt.moved &&
      performance.now() - sim.downAt.time < 350;

    sim.pointerId = null;
    sim.aim = null;
    sim.downAt = null;

    // Cap the throw so a wild flick can't fling the pull off the stage.
    const speed = Math.hypot(sim.velocity.x, sim.velocity.y);

    if (speed > 2600) {
      sim.velocity.x *= 2600 / speed;
      sim.velocity.y *= 2600 / speed;
    }

    if (latest.current.reduce) {
      sim.velocity = { x: 0, y: 0 };
      sim.position = { x: 0, y: restLength(latest.current.length) };
      checkSwitch();
      draw();
      return;
    }

    if (wasTap && !sim.latched) {
      tug();
      return;
    }

    wake();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();

      if (!event.repeat) {
        tug();
      }

      return;
    }

    if (
      (event.key === "ArrowLeft" || event.key === "ArrowRight") &&
      !latest.current.reduce
    ) {
      event.preventDefault();
      simRef.current.velocity.x += event.key === "ArrowLeft" ? -520 : 520;
      wake();
    }
  }

  const initialPath = cordPath(anchor, { x: 0, y: rest }, length).d;

  return (
    <div
      className={cn("relative select-none", className)}
      ref={rootRef}
      style={{ height, width }}
    >
      <svg
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 overflow-visible"
        height={height}
        width={width}
      >
        {/* A soft shadow on the wall behind */}
        <path
          className="text-black dark:text-black"
          d={initialPath}
          opacity="0.12"
          ref={shadowRef}
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="3"
          style={{ filter: "blur(1.5px)", transform: "translate(5px, 4px)" }}
        />
        <path
          d={initialPath}
          ref={cordRef}
          stroke="#efe8da"
          strokeLinecap="round"
          strokeWidth="2.6"
        />
        {/* Braid: short dark dashes that read as a twist */}
        <path
          d={initialPath}
          ref={twistRef}
          stroke="#a99a80"
          strokeDasharray="1.4 1.8"
          strokeOpacity="0.7"
          strokeWidth="2.6"
        />
      </svg>

      <SwitchHousing
        className="left-1/2 -translate-x-1/2"
        ref={housingRef}
        style={{ zIndex: 1 }}
      />

      <div
        aria-checked={checked}
        aria-label={label}
        className="absolute top-0 left-0 flex origin-[50%_0] cursor-grab touch-none justify-center rounded-[22px] outline-none focus-visible:ring-2 focus-visible:ring-[#e0a05a] focus-visible:ring-offset-2 focus-visible:ring-offset-grayscale-1 active:cursor-grabbing dark:focus-visible:ring-offset-grayscale-2"
        onKeyDown={handleKeyDown}
        onLostPointerCapture={endDrag}
        onPointerCancel={endDrag}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        ref={handleRef}
        role="switch"
        style={{
          height: HANDLE_HEIGHT,
          transform: `translate(${anchor.x - HANDLE_WIDTH / 2}px, ${anchor.y + rest - 1}px)`,
          width: HANDLE_WIDTH,
          willChange: "transform",
        }}
        tabIndex={0}
      >
        <PullKnob className="pointer-events-none drop-shadow-[0_4px_4px_rgb(0_0_0_/_0.22)]" />
      </div>
    </div>
  );
}
