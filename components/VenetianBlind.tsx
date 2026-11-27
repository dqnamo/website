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
import styles from "./VenetianBlind.module.css";

/*
 * A slat's angle is measured from facing you flat: 90° is edge on (open), and
 * the slats close against each other either side of it.
 */

/** Degrees either side of open that the slats can turn before they meet. */
const TILT_RANGE = 76;
/** Degrees the wand turns for a full swing from open to closed. */
const WAND_TURN = 900;
/** The worm gear in the headrail clicks this often as the wand turns. */
const WAND_TICK = 30;
/** How much deeper each slat is than the gap between rungs, so they overlap. */
const SLAT_OVERLAP = 1.2;
/** Height of the headrail and bottom rail, as a share of the opening. */
const HEADRAIL = 0.055;
const BOTTOM_RAIL = 0.032;

const HEADRAIL_SPRING = { damping: 30, stiffness: 340 };
/**
 * The ladder tapes turn every slat from the headrail, but the cloth gives a
 * little more with every rung, so lower slats lag further and sway longer.
 */
const LADDER_STIFFNESS = 900;
const LADDER_GIVE = 0.28;
const LADDER_DAMPING_RATIO = 0.46;
/** How much bounce slats keep when they clap shut against their neighbours. */
const RESTITUTION = 0.32;

type BlindStyle = CSSProperties & {
  "--blind-open"?: number;
  "--blind-shift"?: number;
};

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

function angleFor(tilt: number) {
  return 90 + tilt * TILT_RANGE;
}

/** How much of the gap between two rungs a slat at this angle leaves clear. */
function gapAt(angle: number) {
  const covered = SLAT_OVERLAP * Math.abs(Math.cos((angle * Math.PI) / 180));
  return clamp(1 - covered, 0, 1);
}

/* -------------------------------------------------------------------------- */
/* Sound                                                                       */
/* -------------------------------------------------------------------------- */

let sharedAudioContext: AudioContext | null = null;
const noiseBuffers = new Map<string, AudioBuffer>();
let lastSoundAt = 0;

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

function noiseBuffer(context: AudioContext, duration: number, decay: number) {
  const key = `${duration}:${decay}`;
  const cached = noiseBuffers.get(key);

  if (cached) {
    return cached;
  }

  const length = Math.floor(context.sampleRate * duration);
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);

  for (let index = 0; index < length; index += 1) {
    const t = index / context.sampleRate;
    data[index] = (Math.random() * 2 - 1) * Math.exp(-t / decay);
  }

  noiseBuffers.set(key, buffer);
  return buffer;
}

/**
 * The worm gear ticks quietly. Aluminium slats clapping shut make a brighter,
 * tinnier clack, and the lower ones rattle in after it.
 */
function playSound(kind: "tick" | "clack", strength = 1) {
  const context = getAudioContext();

  if (!context) {
    return;
  }

  const now = context.currentTime;

  if (now - lastSoundAt < (kind === "tick" ? 0.022 : 0.012)) {
    return;
  }

  lastSoundAt = now;

  const source = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const gain = context.createGain();

  source.buffer =
    kind === "tick"
      ? noiseBuffer(context, 0.012, 0.0012)
      : noiseBuffer(context, 0.04, 0.004);
  source.playbackRate.value = 0.92 + Math.random() * 0.16;
  filter.type = "bandpass";
  filter.frequency.value = kind === "tick" ? 2600 : 5200 + Math.random() * 900;
  filter.Q.value = kind === "tick" ? 1.6 : 4;
  gain.gain.value = kind === "tick" ? 0.22 : clamp(strength, 0.08, 1) * 0.7;

  source.connect(filter).connect(gain).connect(context.destination);
  source.start(now);
}

function buzz(duration: number) {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    navigator.vibrate?.(duration);
  }
}

/* -------------------------------------------------------------------------- */
/* The view through the window                                                 */
/* -------------------------------------------------------------------------- */

/** Rooftops along the bottom of the view, shared by day and night. */
const SKYLINE =
  "M0 100V70h8v-6h10v6h6V58l9-7 9 7v12h7V62h12v-8h5v8h4v8h9V55h16v15h6v-9l7-5 7 5v9h10V60h13v10h5V48l6-6 6 6v22h9V62h14v-6h4v6h8v8h10V58h9v12h4v30Z";

function WindowView() {
  return (
    <div aria-hidden="true" className="absolute inset-0 overflow-hidden">
      {/* Day */}
      <div className="absolute inset-0 bg-[linear-gradient(180deg,#5aa9e8_0%,#93c8f0_48%,#d9ecf7_78%,#f6efe0_100%)] dark:hidden">
        <div className="absolute top-[12%] left-[18%] size-[22%] rounded-full bg-[#fffbea] shadow-[0_0_24px_10px_rgb(255_244_200/80%),0_0_80px_40px_rgb(255_232_170/45%)]" />
        <div
          className={cn(
            styles.cloud,
            "absolute top-[30%] left-[48%] h-[9%] w-[38%] rounded-full bg-white/80 blur-[3px]",
          )}
        />
        <div
          className={cn(
            styles.cloud,
            "absolute top-[44%] left-[8%] h-[6%] w-[26%] rounded-full bg-white/70 blur-[3px] [animation-duration:52s]",
          )}
        />
        <svg
          aria-hidden="true"
          className="absolute inset-x-0 bottom-0 h-[34%] w-full"
          preserveAspectRatio="none"
          viewBox="0 0 200 100"
        >
          <path d={SKYLINE} fill="#7d9bb3" opacity="0.55" />
        </svg>
      </div>

      {/* Night */}
      <div className="absolute inset-0 hidden bg-[linear-gradient(180deg,#060a1c_0%,#0f1a3d_55%,#22305c_100%)] dark:block">
        <div className="absolute top-[13%] right-[20%] size-[15%] rounded-full bg-[#f1f3ff] shadow-[0_0_18px_6px_rgb(186_204_255/45%),0_0_70px_30px_rgb(120_150_255/20%)]">
          <div className="absolute top-[18%] left-[22%] size-[22%] rounded-full bg-[#d5daf0]" />
          <div className="absolute right-[24%] bottom-[22%] size-[14%] rounded-full bg-[#d5daf0]" />
        </div>
        {[
          [12, 14],
          [30, 8],
          [44, 26],
          [22, 38],
          [58, 12],
          [8, 48],
          [50, 42],
          [86, 34],
          [70, 52],
        ].map(([left, top]) => (
          <span
            className={cn(
              styles.star,
              "absolute size-[2px] rounded-full bg-white",
            )}
            key={`${left}-${top}`}
            style={{
              animationDelay: `${(left * 37) % 3000}ms`,
              left: `${left}%`,
              top: `${top}%`,
            }}
          />
        ))}
        <svg
          aria-hidden="true"
          className="absolute inset-x-0 bottom-0 h-[34%] w-full"
          preserveAspectRatio="none"
          viewBox="0 0 200 100"
        >
          <path d={SKYLINE} fill="#070b1a" />
          <rect fill="#ffcf7a" height="4" width="3" x="64" y="62" />
          <rect fill="#ffcf7a" height="4" width="3" x="129" y="64" />
          <rect fill="#ffd894" height="4" width="3" x="178" y="54" />
        </svg>
      </div>

      {/* The glazing bars, seen through the gaps. */}
      <div className="absolute inset-y-0 left-1/2 w-[3.5%] -translate-x-1/2 bg-[#ece8df] shadow-[1px_0_2px_rgb(0_0_0/20%)] dark:bg-[#24262c]" />
      <div className="absolute inset-x-0 top-[52%] h-[3%] bg-[#ece8df] shadow-[0_1px_2px_rgb(0_0_0/20%)] dark:bg-[#24262c]" />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Shared pieces                                                               */
/* -------------------------------------------------------------------------- */

/** Off-white aluminium by day, moonlit grey by night. */
const blindThemeClassName =
  "[--frame:#f6f3ec] [--frame-edge:#d9d3c6] [--slat-hi:#ffffff] [--slat-mid:#efebe3] [--slat-lo:#d3cdc1] [--rail:#e9e5dc] [--light:255_236_196] [--floor-light:255_206_120] [--room:42_30_10] dark:[--frame:#2a2b30] dark:[--frame-edge:#17181b] dark:[--slat-hi:#8e93a3] dark:[--slat-mid:#62666f] dark:[--slat-lo:#3d4048] dark:[--rail:#4a4d55] dark:[--light:150_176_255] dark:[--floor-light:150_176_255] dark:[--room:0_0_0]";

function slatFaceBackground() {
  return "linear-gradient(180deg, var(--slat-hi) 0%, var(--slat-mid) 38%, var(--slat-lo) 100%)";
}

/** The painted frame, sill and reveal around the opening. */
function WindowFrame({
  children,
  frame,
  height,
  width,
}: {
  children: React.ReactNode;
  frame: number;
  height: number;
  width: number;
}) {
  return (
    <div
      className="relative rounded-[3px]"
      style={{
        background:
          "linear-gradient(180deg, var(--frame), color-mix(in oklab, var(--frame) 88%, black))",
        boxShadow:
          "inset 0 1px 0 rgb(255 255 255 / 45%), 0 0 0 1px var(--frame-edge), 0 2px 4px rgb(0 0 0 / 8%), 0 18px 40px rgb(0 0 0 / 12%)",
        height: height + frame * 2,
        padding: frame,
        width: width + frame * 2,
      }}
    >
      <div
        className="relative h-full w-full overflow-hidden rounded-[1px]"
        style={{
          boxShadow: "0 0 0 1px var(--frame-edge)",
        }}
      >
        {children}
        {/* The reveal casts a little shadow onto everything inside it. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-[5]"
          style={{
            boxShadow:
              "inset 0 3px 6px rgb(0 0 0 / 22%), inset 0 0 0 1px rgb(0 0 0 / 12%)",
          }}
        />
      </div>
      {/* The sill sticks out a little past the frame. */}
      <div
        aria-hidden="true"
        className="absolute rounded-[2px]"
        style={{
          background:
            "linear-gradient(180deg, var(--slat-hi), var(--frame) 40%, color-mix(in oklab, var(--frame) 80%, black))",
          bottom: -frame * 0.55,
          boxShadow: "0 0 0 1px var(--frame-edge), 0 6px 10px rgb(0 0 0 / 14%)",
          height: frame * 1.1,
          left: -frame * 0.6,
          right: -frame * 0.6,
        }}
      />
    </div>
  );
}

function Headrail({ height }: { height: number }) {
  return (
    <div
      aria-hidden="true"
      className="absolute inset-x-0 top-0 z-[3]"
      style={{
        background:
          "linear-gradient(180deg, var(--slat-hi), var(--rail) 45%, var(--slat-lo))",
        boxShadow:
          "0 1px 0 rgb(0 0 0 / 12%), 0 3px 5px rgb(0 0 0 / 16%), inset 0 -1px 0 rgb(0 0 0 / 10%)",
        height,
      }}
    />
  );
}

function BottomRail({ height }: { height: number }) {
  return (
    <div
      aria-hidden="true"
      className="absolute inset-x-0 z-[3] rounded-[1px]"
      style={{
        background:
          "linear-gradient(180deg, var(--slat-hi), var(--rail) 50%, var(--slat-lo))",
        bottom: height * 0.4,
        boxShadow:
          "0 2px 3px rgb(0 0 0 / 22%), inset 0 -1px 0 rgb(0 0 0 / 12%)",
        height,
      }}
    />
  );
}

/** The cloth ladder tapes that hang each slat from the one above. */
function LadderTapes({ top, bottom }: { top: number; bottom: number }) {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 z-[2]"
      style={{ bottom, top }}
    >
      {["18%", "82%"].map((left) => (
        <span
          className="absolute inset-y-0 w-[1.5px] -translate-x-1/2 bg-[var(--slat-lo)] opacity-60"
          key={left}
          style={{ left }}
        />
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* A still blind for thumbnails                                                */
/* -------------------------------------------------------------------------- */

/**
 * A decorative, non-interactive blind for thumbnails. The slats turn from
 * `angle` to `hoverAngle` when a parent `group` is hovered, rippling down.
 */
export function VenetianBlindFace({
  angle = 30,
  className,
  height = 104,
  hoverAngle = 90,
  slats = 10,
  width = 96,
}: {
  angle?: number;
  className?: string;
  height?: number;
  hoverAngle?: number;
  slats?: number;
  width?: number;
}) {
  const frame = Math.max(4, Math.round(width * 0.05));
  const headrail = Math.max(5, height * HEADRAIL);
  const bottomRail = Math.max(3, height * BOTTOM_RAIL);
  const spacing = (height - headrail - bottomRail * 1.6) / slats;

  return (
    <div
      aria-hidden="true"
      className={cn(blindThemeClassName, className)}
      style={
        {
          "--face-angle": `${angle}deg`,
          "--face-hover-angle": `${hoverAngle}deg`,
        } as CSSProperties
      }
    >
      <WindowFrame frame={frame} height={height} width={width}>
        <WindowView />
        <div
          className="absolute inset-x-0"
          style={{
            bottom: bottomRail * 1.4,
            perspective: height * 2,
            perspectiveOrigin: "50% 130%",
            top: headrail,
          }}
        >
          {Array.from({ length: slats }, (_, index) => (
            <div
              className="absolute inset-x-0 rotate-x-(--face-angle) transition-transform duration-500 [transition-timing-function:cubic-bezier(0.34,1.4,0.5,1)] group-hover:rotate-x-(--face-hover-angle) motion-reduce:transition-none"
              // biome-ignore lint/suspicious/noArrayIndexKey: slats never reorder
              key={index}
              style={{
                background: slatFaceBackground(),
                height: spacing * SLAT_OVERLAP,
                top: index * spacing + (spacing - spacing * SLAT_OVERLAP) / 2,
                transitionDelay: `${index * 28}ms`,
              }}
            />
          ))}
        </div>
        <LadderTapes bottom={bottomRail * 1.4} top={headrail} />
        <Headrail height={headrail} />
        <BottomRail height={bottomRail} />
      </WindowFrame>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* The blind                                                                   */
/* -------------------------------------------------------------------------- */

export type VenetianBlindProps = {
  /**
   * How far the slats are turned, from -1 (shut, room side down) through 0
   * (open) to 1 (shut, room side up).
   */
  value?: number;
  defaultValue?: number;
  onValueChange?: (value: number) => void;
  /** Width of the window opening in pixels. */
  width?: number;
  /** Height of the window opening in pixels. */
  height?: number;
  /** How many slats hang in the window. */
  slats?: number;
  /** Tick as the wand turns, and clack as the slats shut. */
  sound?: boolean;
  /**
   * Dim everything around the blind as it shuts. The shade spreads out to the
   * nearest ancestor that clips its overflow, so give the stage overflow-hidden.
   */
  dimRoom?: boolean;
  /** Accessible name for the wand. */
  label?: string;
  className?: string;
};

type Body = { angle: number; velocity: number };

function describe(tilt: number) {
  const amount = Math.abs(tilt);

  if (amount < 0.05) {
    return "Open";
  }

  const side = tilt > 0 ? "room side up" : "room side down";

  if (amount > 0.97) {
    return `Shut, ${side}`;
  }

  return `${Math.round(amount * 100)}% shut, ${side}`;
}

export function VenetianBlind({
  className,
  defaultValue = 0.4,
  dimRoom = true,
  height = 300,
  label = "Blind tilt",
  onValueChange,
  slats = 16,
  sound = true,
  value: controlledValue,
  width = 260,
}: VenetianBlindProps) {
  const shouldReduceMotion = useReducedMotion();
  const hintId = useId();
  const [uncontrolledValue, setUncontrolledValue] = useState(defaultValue);
  const value = clamp(controlledValue ?? uncontrolledValue, -1, 1);

  const frame = Math.round(width * 0.05);
  const headrail = height * HEADRAIL;
  const bottomRail = height * BOTTOM_RAIL;
  const slatTop = headrail;
  const slatBottom = bottomRail * 1.4;
  const spacing = (height - slatTop - slatBottom) / slats;
  const depth = spacing * SLAT_OVERLAP;

  // Set once for the server render; after that the animation loop paints.
  const [initialAngle] = useState(() => angleFor(value));
  const rootRef = useRef<HTMLDivElement>(null);
  const slatRefs = useRef<(HTMLDivElement | null)[]>([]);
  const faceRefs = useRef<(HTMLDivElement | null)[]>([]);
  const wandRef = useRef<HTMLDivElement>(null);

  // Everything the animation loop touches lives in one mutable bag.
  const sim = useRef({
    bodies: [] as Body[],
    frame: 0,
    headrail: { angle: angleFor(value), velocity: 0 } as Body,
    lastTick: Math.floor((value * WAND_TURN) / WAND_TICK),
    lastTime: 0,
    reduce: false,
    shutAt: [] as number[],
    sound,
    target: angleFor(value),
  });
  sim.current.sound = sound;
  sim.current.reduce = Boolean(shouldReduceMotion);

  if (sim.current.bodies.length !== slats) {
    sim.current.bodies = Array.from({ length: slats }, () => ({
      angle: sim.current.headrail.angle,
      velocity: 0,
    }));
    sim.current.shutAt = Array.from({ length: slats }, () => 0);
  }

  /** Paint the slats, the wand and the light in the room from the sim. */
  const paint = useCallback(() => {
    const state = sim.current;
    let open = 0;

    state.bodies.forEach((body, index) => {
      const slat = slatRefs.current[index];
      const face = faceRefs.current[index];
      open += gapAt(body.angle);

      if (!slat || !face) {
        return;
      }

      const radians = (body.angle * Math.PI) / 180;
      slat.style.transform = `rotateX(${body.angle.toFixed(2)}deg)`;
      // Whichever face is towards you, the light from the window sits on top.
      face.style.transform = body.angle > 90 ? "scaleY(-1)" : "";
      face.style.filter = `brightness(${(0.84 + 0.16 * Math.abs(Math.cos(radians))).toFixed(3)})`;
    });

    open /= Math.max(1, state.bodies.length);
    const tilt = (state.headrail.angle - 90) / TILT_RANGE;
    const root = rootRef.current;

    if (root) {
      root.style.setProperty("--blind-open", open.toFixed(3));
      // Tipped slats bounce the light up the wall or down onto the floor.
      root.style.setProperty("--blind-shift", tilt.toFixed(3));
    }

    if (wandRef.current) {
      const turned = tilt * WAND_TURN;
      wandRef.current.style.backgroundPositionY = `${((turned / 360) * 18).toFixed(2)}px`;
    }
  }, []);

  /** Advance one frame of springs. Returns true while anything still moves. */
  const step = useCallback(
    (dt: number) => {
      const state = sim.current;
      const minimum = angleFor(-1);
      const maximum = angleFor(1);
      let moving = false;

      const rail = state.headrail;
      rail.velocity +=
        (HEADRAIL_SPRING.stiffness * (state.target - rail.angle) -
          HEADRAIL_SPRING.damping * rail.velocity) *
        dt;
      rail.angle += rail.velocity * dt;

      if (
        Math.abs(rail.velocity) > 0.05 ||
        Math.abs(state.target - rail.angle) > 0.02
      ) {
        moving = true;
      } else {
        rail.angle = state.target;
        rail.velocity = 0;
      }

      // The worm gear clicks as the wand turns it.
      const tick = Math.floor(
        (((rail.angle - 90) / TILT_RANGE) * WAND_TURN) / WAND_TICK,
      );

      if (tick !== state.lastTick) {
        state.lastTick = tick;

        if (state.sound) {
          playSound("tick");
        }
      }

      const now = performance.now();

      state.bodies.forEach((body, index) => {
        const stiffness = LADDER_STIFFNESS / (1 + index * LADDER_GIVE);
        const damping = 2 * Math.sqrt(stiffness) * LADDER_DAMPING_RATIO;
        body.velocity +=
          (stiffness * (rail.angle - body.angle) - damping * body.velocity) *
          dt;
        body.angle += body.velocity * dt;

        // Shut slats press against their neighbours and clap off them.
        if (body.angle < minimum || body.angle > maximum) {
          const limit = body.angle < minimum ? minimum : maximum;
          const speed = Math.abs(body.velocity);
          body.angle = limit;
          body.velocity = -body.velocity * RESTITUTION;

          if (speed > 40 && now - state.shutAt[index] > 120) {
            state.shutAt[index] = now;

            if (state.sound) {
              playSound("clack", (speed / 500) * (1 - index / (slats * 1.6)));
            }

            if (index === 0) {
              buzz(8);
            }
          }
        }

        if (
          Math.abs(body.velocity) > 0.05 ||
          Math.abs(rail.angle - body.angle) > 0.02
        ) {
          moving = true;
        }
      });

      return moving;
    },
    [slats],
  );

  const run = useCallback(() => {
    const state = sim.current;

    if (state.frame) {
      return;
    }

    state.lastTime = performance.now();

    const loop = (time: number) => {
      // Sub-step so that a dropped frame can't explode the springs.
      let remaining = Math.min(0.05, (time - state.lastTime) / 1000);
      state.lastTime = time;
      let moving = false;

      while (remaining > 0) {
        const dt = Math.min(remaining, 1 / 240);
        moving = step(dt) || moving;
        remaining -= dt;
      }

      paint();
      state.frame = moving ? requestAnimationFrame(loop) : 0;
    };

    state.frame = requestAnimationFrame(loop);
  }, [paint, step]);

  const setTarget = useCallback(
    (tilt: number) => {
      const state = sim.current;
      state.target = angleFor(clamp(tilt, -1, 1));

      if (state.reduce) {
        const previousTick = state.lastTick;
        state.headrail = { angle: state.target, velocity: 0 };
        state.lastTick = Math.floor((tilt * WAND_TURN) / WAND_TICK);

        for (const body of state.bodies) {
          body.angle = state.target;
          body.velocity = 0;
        }

        if (state.sound && previousTick !== state.lastTick) {
          playSound("tick");
        }

        paint();
        return;
      }

      run();
    },
    [paint, run],
  );

  // First paint, and stop the loop when we unmount.
  useEffect(() => {
    paint();
    const state = sim.current;

    return () => {
      cancelAnimationFrame(state.frame);
      state.frame = 0;
    };
  }, [paint]);

  // Follow the value, whether it came from the wand or from outside.
  useEffect(() => {
    setTarget(value);
  }, [setTarget, value]);

  const commit = useCallback(
    (next: number) => {
      const clamped = clamp(next, -1, 1);

      if (controlledValue === undefined) {
        setUncontrolledValue(clamped);
      }

      onValueChange?.(clamped);
    },
    [controlledValue, onValueChange],
  );

  const valueRef = useRef(value);
  valueRef.current = value;
  const lastShutRef = useRef(value === 0 ? 1 : Math.sign(value));

  if (Math.abs(value) > 0.5) {
    lastShutRef.current = Math.sign(value);
  }

  /* ---------------------------- Twisting the wand --------------------------- */

  const dragRef = useRef<{
    pointerId: number;
    tilt: number;
    x: number;
    y: number;
  } | null>(null);
  const [twisting, setTwisting] = useState(false);

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) {
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    event.currentTarget.focus({ preventScroll: true });
    dragRef.current = {
      pointerId: event.pointerId,
      tilt: valueRef.current,
      x: event.clientX,
      y: event.clientY,
    };
    setTwisting(true);
    getAudioContext();
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;

    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    // Rolling the wand sideways, or stroking it up and down, both turn it.
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    drag.x = event.clientX;
    drag.y = event.clientY;
    drag.tilt = clamp(drag.tilt + (dx - dy) / 170, -1, 1);
    commit(drag.tilt);
  }

  function endDrag(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;

    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    dragRef.current = null;
    setTwisting(false);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const small = event.shiftKey ? 0.25 : 0.1;
    const current = valueRef.current;
    const targets: Record<string, number> = {
      ArrowDown: current - small,
      ArrowLeft: current - small,
      ArrowRight: current + small,
      ArrowUp: current + small,
      End: 1,
      Home: -1,
      PageDown: current - 0.5,
      PageUp: current + 0.5,
    };

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      commit(Math.abs(current) < 0.05 ? lastShutRef.current : 0);
      return;
    }

    const next = targets[event.key];

    if (next === undefined) {
      return;
    }

    event.preventDefault();
    commit(Math.round(next * 100) / 100);
  }

  // React's onWheel is passive, so attach a listener that may cancel scrolling.
  const wheelRef = useRef(commit);
  wheelRef.current = commit;

  useEffect(() => {
    const root = rootRef.current;

    if (!root) {
      return;
    }

    function handleWheel(event: WheelEvent) {
      event.preventDefault();
      const delta =
        Math.abs(event.deltaY) >= Math.abs(event.deltaX)
          ? -event.deltaY
          : event.deltaX;
      const pixels = event.deltaMode === 1 ? delta * 40 : delta;
      wheelRef.current(clamp(valueRef.current + pixels / 500, -1, 1));
    }

    root.addEventListener("wheel", handleWheel, { passive: false });
    return () => root.removeEventListener("wheel", handleWheel);
  }, []);

  const wandLength = height * 0.6;
  const wandX = width - Math.max(10, width * 0.06);

  return (
    <div
      className={cn("relative", blindThemeClassName, className)}
      ref={rootRef}
      style={{ "--blind-open": 0.5, "--blind-shift": 0 } as BlindStyle}
    >
      {dimRoom ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -inset-[100vmax] bg-[rgb(var(--room))] opacity-[calc(0.09+(1-var(--blind-open))*0.16)] dark:opacity-[calc(0.12+(1-var(--blind-open))*0.4)]"
        />
      ) : null}

      {/* Daylight spilling onto the wall round the window. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -inset-[30%] rounded-full opacity-[calc(var(--blind-open)*0.9)] blur-2xl"
        style={{
          background:
            "radial-gradient(closest-side, rgb(var(--light) / 32%), rgb(var(--light) / 0%))",
        }}
      />

      <WindowFrame frame={frame} height={height} width={width}>
        <WindowView />

        <div
          className="absolute inset-x-0"
          style={{
            bottom: slatBottom,
            perspective: height * 2.2,
            perspectiveOrigin: "50% 125%",
            top: slatTop,
          }}
        >
          <div className="absolute inset-0 transform-3d">
            {Array.from({ length: slats }, (_, index) => (
              <div
                className="absolute inset-x-0 backface-visible"
                // biome-ignore lint/suspicious/noArrayIndexKey: slats never reorder
                key={index}
                ref={(node) => {
                  slatRefs.current[index] = node;
                }}
                style={{
                  height: depth,
                  top: index * spacing + (spacing - depth) / 2,
                  transform: `rotateX(${initialAngle}deg)`,
                }}
              >
                <div
                  className="absolute inset-0 rounded-[1px] shadow-[0_0.5px_0_rgb(0_0_0/10%)]"
                  ref={(node) => {
                    faceRefs.current[index] = node;
                  }}
                  style={{
                    background: slatFaceBackground(),
                    transform: initialAngle > 90 ? "scaleY(-1)" : undefined,
                  }}
                />
              </div>
            ))}
          </div>
        </div>

        <LadderTapes bottom={slatBottom} top={slatTop} />
        <Headrail height={headrail} />
        <BottomRail height={bottomRail} />

        {/* The tilt wand: a twisted acrylic rod hanging off a hook. */}
        <div
          aria-describedby={hintId}
          aria-label={label}
          aria-valuemax={100}
          aria-valuemin={-100}
          aria-valuenow={Math.round(value * 100)}
          aria-valuetext={describe(value)}
          className="group/wand absolute z-[6] flex cursor-grab touch-none select-none justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--light))] active:cursor-grabbing"
          onKeyDown={handleKeyDown}
          onLostPointerCapture={endDrag}
          onPointerCancel={endDrag}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={endDrag}
          role="slider"
          style={{
            height: wandLength + 8,
            left: wandX - 14,
            top: headrail - 3,
            width: 28,
          }}
          tabIndex={0}
        >
          {/* Hook */}
          <span className="absolute top-0 h-[9px] w-[5px] rounded-b-full border-[1.5px] border-[#8b8678] border-t-0 dark:border-[#9aa0b4]" />
          <div
            className={cn(
              "absolute top-[7px] w-[6px] rounded-full transition-[transform,box-shadow] duration-150 group-hover/wand:shadow-[0_0_0_3px_rgb(var(--light)/35%)]",
              twisting && "scale-x-[1.15]",
            )}
            ref={wandRef}
            style={{
              backgroundColor: "rgb(214 228 236 / 30%)",
              backgroundImage:
                "linear-gradient(90deg, rgb(255 255 255 / 10%), rgb(255 255 255 / 75%) 35%, rgb(255 255 255 / 15%) 55%, rgb(120 140 150 / 30%)), repeating-linear-gradient(-58deg, transparent 0 7px, rgb(255 255 255 / 55%) 7px 9px)",
              backgroundSize: "100% 100%, 100% 18px",
              boxShadow:
                "0 0 0 0.5px rgb(90 110 120 / 45%), 2px 3px 4px rgb(0 0 0 / 18%)",
              height: wandLength,
            }}
          />
          {/* End cap */}
          <span
            className="absolute bottom-0 h-[9px] w-[8px] rounded-full"
            style={{
              background:
                "linear-gradient(90deg, rgb(255 255 255 / 30%), rgb(255 255 255 / 85%) 40%, rgb(150 170 180 / 45%))",
              boxShadow:
                "0 0 0 0.5px rgb(90 110 120 / 50%), 0 2px 3px rgb(0 0 0 / 18%)",
            }}
          />
        </div>
      </WindowFrame>

      {/* Stripes of light thrown across the floor through the gaps. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 -translate-x-1/2"
        style={{
          height: height * 0.5,
          perspective: 300,
          top: height + frame * 2 + 10,
          width: width * 1.25,
        }}
      >
        <div
          className="absolute inset-0 origin-top"
          style={{
            backgroundImage:
              "repeating-linear-gradient(180deg, rgb(var(--floor-light) / 80%) 0 calc(var(--blind-open) * 13px), rgb(var(--floor-light) / 0%) calc(var(--blind-open) * 13px + 2px) 15px)",
            backgroundPositionY: "calc(var(--blind-shift) * 22px)",
            maskImage:
              "linear-gradient(180deg, black, transparent 92%), linear-gradient(90deg, transparent, black 18%, black 82%, transparent)",
            maskComposite: "intersect",
            opacity: "calc(0.15 + var(--blind-open) * 0.75)",
            transform: "rotateX(62deg) skewX(-12deg)",
          }}
        />
      </div>

      <p className="sr-only" id={hintId}>
        Drag, scroll or use the arrow keys to turn the wand. Enter opens or
        shuts the blind.
      </p>
    </div>
  );
}
