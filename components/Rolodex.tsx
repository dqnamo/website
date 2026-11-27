"use client";

import { useReducedMotion } from "motion/react";
import {
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
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

/** Card size in pixels. The tab sits on top of the body. */
const CARD_W = 272;
const BODY_H = 156;
const TAB_H = 16;
const TAB_W = 38;
const CARD_H = BODY_H + TAB_H;

/** Radius of the drum the cards are clipped on to. */
const DRUM_R = 64;
/** Where on the drum the open card stands, in degrees from the top. */
const OPEN_AT = -14;
/** How far round the drum each card sits from the next. */
const CARD_PITCH = 7;
/** Extra room the fallen cards leave in front of the open one. */
const FALLEN_GAP = 16;
/** Standing cards rest a little back on the ones behind them. */
const LEAN_BACK = 8;
/** Fallen cards drop this much further forward than the drum points them. */
const FALL_FORWARD = 62;
/** The end wheels are big enough to hold the drum up off the desk. */
const WHEEL_R = 112;
/** Cards outside this window are round the back of the drum, out of sight. */
const BACK_LIMIT = 10.5;
const FRONT_LIMIT = -4.6;

/** Pixels of drag that flip one card. */
const PX_PER_CARD = 34;
/** Wheel distance that flips one card. */
const WHEEL_PER_CARD = 50;

/** The drum turns on a soft spring; each card flops on a bouncier one. */
const DRUM_STIFFNESS = 120;
const DRUM_DAMPING = 21;
const CARD_STIFFNESS = 420;
const CARD_DAMPING = 17;

/** Each letter's tab steps along the top edge, six positions wide. */
const TAB_SLOTS = 6;
const TAB_COLORS = ["#f1d184", "#a8c7ea", "#b3d9ab", "#f2b19e"] as const;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

function mod(value: number, size: number) {
  return ((value % size) + size) % size;
}

function smoothstep(edge0: number, edge1: number, value: number) {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Two decimal places keeps server and client markup identical. */
function round(value: number) {
  return Math.round(value * 100) / 100;
}

/**
 * How far a card wants to have fallen, from 0 (standing in the back fan) to 1
 * (lying on the front stack). It hangs on until it is pushed past upright,
 * then tips over.
 */
function fallTarget(distance: number) {
  return smoothstep(0.18, 0.55, -distance);
}

/**
 * A card's distance from the open position, wrapped round the drum so the
 * file spins forever. Negative cards have been flipped past.
 */
function wrapDistance(index: number, position: number, count: number) {
  const distance = mod(index - position, count);
  const frontWindow = Math.min(7, count / 2);
  return distance >= count - frontWindow ? distance - count : distance;
}

type CardPose = {
  backShade: number;
  frontShade: number;
  opacity: number;
  transform: string;
};

function poseFor(distance: number, fallen: number): CardPose {
  let drumAngle = OPEN_AT + distance * CARD_PITCH - FALLEN_GAP * fallen;

  // Far cards sweep on round the drum, over the back and under the front.
  if (distance > 6) {
    drumAngle += (distance - 6) ** 2 * 3;
  }

  if (distance < -3) {
    drumAngle -= (-distance - 3) ** 2 * 3;
  }

  const lean = LEAN_BACK * (1 - fallen) - FALL_FORWARD * fallen;
  let opacity = 1;

  if (distance > BACK_LIMIT - 1.5) {
    opacity = clamp((BACK_LIMIT - distance) / 1.5, 0, 1);
  } else if (distance < FRONT_LIMIT + 1.5) {
    opacity = clamp((distance - FRONT_LIMIT) / 1.5, 0, 1);
  }

  return {
    // Cards further into the file sit in the shadow of the ones in front.
    backShade: round(clamp(0.04 + (-distance - 1) * 0.07, 0.04, 0.4)),
    frontShade: round(clamp(distance * 0.065, 0, 0.46)),
    opacity: round(opacity),
    transform: `translateY(${DRUM_R}px) rotateX(${round(drumAngle)}deg) translateY(${-DRUM_R}px) rotateX(${round(lean)}deg)`,
  };
}

/** The card outline: a body, a tab on top, and two rail slots underneath. */
function cardPath(tabX: number) {
  const r = 7;
  const t = TAB_H;
  const h = CARD_H;
  const w = CARD_W;
  const slots = [w * 0.68, w * 0.32]
    .map(
      (x) =>
        `L ${x + 3} ${h} L ${x + 3} ${h - 7} A 5 5 0 1 0 ${x - 3} ${h - 7} L ${x - 3} ${h}`,
    )
    .join(" ");

  return [
    `M 0 ${t + r}`,
    `Q 0 ${t} ${r} ${t}`,
    `L ${tabX - 3} ${t}`,
    `Q ${tabX + 1} ${t} ${tabX + 2} ${t - 4}`,
    `L ${tabX + 4} 4`,
    `Q ${tabX + 5} 0 ${tabX + 9} 0`,
    `L ${tabX + TAB_W - 9} 0`,
    `Q ${tabX + TAB_W - 5} 0 ${tabX + TAB_W - 4} 4`,
    `L ${tabX + TAB_W - 2} ${t - 4}`,
    `Q ${tabX + TAB_W - 1} ${t} ${tabX + TAB_W + 3} ${t}`,
    `L ${w - r} ${t}`,
    `Q ${w} ${t} ${w} ${t + r}`,
    `L ${w} ${h - r}`,
    `Q ${w} ${h} ${w - r} ${h}`,
    slots,
    `L ${r} ${h}`,
    `Q 0 ${h} 0 ${h - r}`,
    "Z",
  ].join(" ");
}

function tabSlot(tab: string) {
  const code = tab.toUpperCase().charCodeAt(0) - 65;
  return mod(Number.isNaN(code) ? 0 : code, 26);
}

function tabX(tab: string) {
  const travel = CARD_W - 28 - TAB_W;
  return 14 + ((tabSlot(tab) % TAB_SLOTS) / (TAB_SLOTS - 1)) * travel;
}

/* -------------------------------------------------------------------------- */
/* Sound                                                                       */
/* -------------------------------------------------------------------------- */

let sharedAudioContext: AudioContext | null = null;
let flickBuffer: AudioBuffer | null = null;
let tapBuffer: AudioBuffer | null = null;
let lastFlickAt = 0;
let lastTapAt = 0;

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

/** Decaying noise with a little grit in it, like card stock dragging. */
function createNoiseBuffer(
  context: AudioContext,
  duration: number,
  decay: number,
  grit: number,
) {
  const length = Math.floor(context.sampleRate * duration);
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);

  for (let index = 0; index < length; index += 1) {
    const t = index / context.sampleRate;
    const crackle = Math.random() < grit ? 2.2 : 1;
    data[index] = (Math.random() * 2 - 1) * crackle * Math.exp(-t / decay);
  }

  return buffer;
}

function playPaper(kind: "flick" | "tap", strength: number) {
  const context = getAudioContext();

  if (!context) {
    return;
  }

  const now = context.currentTime;

  // A fast spin should whirr, not clip.
  if (kind === "flick") {
    if (now - lastFlickAt < 0.022) {
      return;
    }
    lastFlickAt = now;
  } else {
    if (now - lastTapAt < 0.03) {
      return;
    }
    lastTapAt = now;
  }

  flickBuffer ??= createNoiseBuffer(context, 0.05, 0.009, 0.04);
  tapBuffer ??= createNoiseBuffer(context, 0.03, 0.0035, 0);

  const source = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const gain = context.createGain();

  source.buffer = kind === "flick" ? flickBuffer : tapBuffer;
  source.playbackRate.value = 0.92 + Math.random() * 0.16;
  filter.type = kind === "flick" ? "bandpass" : "lowpass";
  filter.frequency.value = kind === "flick" ? 2900 : 1300;
  filter.Q.value = kind === "flick" ? 0.7 : 0.8;
  gain.gain.value = (kind === "flick" ? 0.32 : 0.5) * clamp(strength, 0.25, 1);

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

type CardStyle = CSSProperties &
  Partial<Record<"--back-shade" | "--card-opacity" | "--front-shade", number>>;

/** Ruled index card stock, cream in light theme and a touch dimmer in dark. */
const paperClassName = "bg-[#fbf8ef] dark:bg-[#e4ddcc]";
const backPaperClassName = "bg-[#f1ebdd] dark:bg-[#d6ceba]";

function ruledLinesStyle(): CSSProperties {
  return {
    backgroundImage: `linear-gradient(to bottom, transparent ${TAB_H + 29}px, rgba(214, 92, 92, 0.55) ${TAB_H + 29}px, rgba(214, 92, 92, 0.55) ${TAB_H + 30}px, transparent ${TAB_H + 30}px), repeating-linear-gradient(to bottom, transparent 0 17px, rgba(92, 140, 200, 0.28) 17px 18px)`,
    backgroundPosition: `0 0, 0 ${TAB_H + 30}px`,
    backgroundRepeat: "no-repeat, no-repeat",
    backgroundSize: `100% 100%, 100% ${BODY_H - 30 - 26}px`,
  };
}

type CardFaceProps = {
  children?: ReactNode;
  tab: string;
};

/** The printed side: tab, ruled lines, and whatever is written on it. */
function CardFront({ children, tab }: CardFaceProps) {
  const x = tabX(tab);

  return (
    <div
      className={cn(
        "absolute inset-0 [backface-visibility:hidden]",
        paperClassName,
      )}
      style={{
        clipPath: `path("${cardPath(x)}")`,
        opacity: "var(--card-opacity, 1)",
      }}
    >
      <div
        className="absolute inset-x-0 top-0"
        style={{
          backgroundColor:
            TAB_COLORS[
              Math.floor(tabSlot(tab) / TAB_SLOTS) % TAB_COLORS.length
            ],
          height: TAB_H + 1,
        }}
      />
      <span
        className="absolute top-0 flex items-center justify-center font-bold font-mono text-[#2b2a27] text-[10px]"
        style={{ height: TAB_H, left: x, width: TAB_W }}
      >
        {tab}
      </span>
      <div className="absolute inset-0" style={ruledLinesStyle()} />
      <div className="absolute inset-x-0 bottom-0" style={{ top: TAB_H }}>
        {children}
      </div>
      {/* Light falls from above, so the card dims towards the drum. */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "linear-gradient(to bottom, rgba(255,255,255,0.18), transparent 30%, transparent 62%, rgba(60,40,10,0.14))",
        }}
      />
      <div
        className="pointer-events-none absolute inset-0 bg-[#1f160a]"
        style={{ opacity: "var(--front-shade, 0)" }}
      />
    </div>
  );
}

/** The blank reverse, mirrored so its tab lines up with the front. */
function CardBack({ tab }: CardFaceProps) {
  const x = CARD_W - tabX(tab) - TAB_W;

  return (
    <div
      className={cn(
        "absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)]",
        backPaperClassName,
      )}
      style={{
        clipPath: `path("${cardPath(x)}")`,
        opacity: "var(--card-opacity, 1)",
      }}
    >
      <div
        className="absolute inset-x-0 top-0 opacity-80"
        style={{
          backgroundColor:
            TAB_COLORS[
              Math.floor(tabSlot(tab) / TAB_SLOTS) % TAB_COLORS.length
            ],
          height: TAB_H + 1,
        }}
      />
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "linear-gradient(to top, rgba(255,255,255,0.22), transparent 45%, rgba(60,40,10,0.12))",
        }}
      />
      <div
        className="pointer-events-none absolute inset-0 bg-[#1f160a]"
        style={{ opacity: "var(--back-shade, 0)" }}
      />
    </div>
  );
}

function poseStyle(pose: CardPose): CardStyle {
  return {
    "--back-shade": pose.backShade,
    // Opacity on the card itself would flatten its two faces into one.
    "--card-opacity": pose.opacity,
    "--front-shade": pose.frontShade,
    transform: pose.transform,
    visibility: pose.opacity > 0 ? "visible" : "hidden",
  };
}

const cardBoxStyle: CSSProperties = {
  height: CARD_H,
  left: -CARD_W / 2,
  top: -DRUM_R - CARD_H,
  transformOrigin: "50% 100%",
  transformStyle: "preserve-3d",
  width: CARD_W,
};

/** Smoked black end wheel, seen from the side of the drum. */
function EndWheel({ side }: { side: "left" | "right" }) {
  const size = WHEEL_R * 2;
  const x = (side === "left" ? -1 : 1) * (CARD_W / 2 + 8);

  return (
    <>
      {[-2, 2].map((offset) => (
        <div
          className="absolute rounded-full"
          key={offset}
          style={{
            background:
              offset > 0 === (side === "right")
                ? "radial-gradient(circle at 38% 30%, #4a4a4c, #1b1b1d 48%, #0c0c0d 72%), #111"
                : "#0b0b0c",
            boxShadow:
              "inset 0 0 0 2px rgba(255,255,255,0.08), inset 0 0 0 7px #161618, inset 0 0 0 8px rgba(255,255,255,0.06)",
            height: size,
            left: -size / 2,
            top: -size / 2,
            transform: `translateX(${x + offset}px) rotateY(90deg)`,
            width: size,
          }}
        />
      ))}
    </>
  );
}

/** A small round shadow on the desk under the wheels and the fallen cards. */
function DeskShadow() {
  return (
    <div
      className="absolute"
      style={{
        background:
          "radial-gradient(closest-side, rgba(0,0,0,0.32), rgba(0,0,0,0.12) 60%, transparent)",
        height: 220,
        left: -200,
        top: -110,
        transform: `translateY(${WHEEL_R}px) rotateX(90deg) translateY(-40px)`,
        width: 400,
      }}
    />
  );
}

/** The stage tilts the file so you look down on it, a little from the right. */
const rigStyle: CSSProperties = {
  height: 0,
  left: "50%",
  position: "absolute",
  top: "61%",
  transform: "rotateX(-16deg) rotateY(-20deg)",
  transformStyle: "preserve-3d",
  width: 0,
};

/* -------------------------------------------------------------------------- */
/* A static file for previews                                                  */
/* -------------------------------------------------------------------------- */

const PREVIEW_TABS = ["A", "B", "C", "D", "E", "F", "G", "H", "I"] as const;

/**
 * A still card file. The open card flops forward when a parent `group` is
 * hovered.
 */
export function RolodexFace({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn("relative h-[400px] w-[380px]", className)}
      style={{ perspective: 1100 }}
    >
      <div style={rigStyle}>
        <DeskShadow />
        <EndWheel side="left" />
        {PREVIEW_TABS.map((tab, index) => {
          const distance = index - 3;
          const rest = poseFor(distance, fallTarget(distance));
          const flopped = poseFor(distance - 1, fallTarget(distance - 1));
          const style = poseStyle(rest);
          const isOpen = distance === 0;

          return (
            <div
              className={cn(
                "absolute",
                isOpen &&
                  "transition-transform duration-500 ease-[cubic-bezier(.5,1.6,.6,1)] group-hover:[transform:var(--flopped)] motion-reduce:transition-none",
              )}
              key={tab}
              style={{
                ...cardBoxStyle,
                ...style,
                ...(isOpen ? { "--flopped": flopped.transform } : {}),
              }}
            >
              <CardFront tab={tab}>
                <div className="flex h-[30px] items-end px-4 pb-1.5">
                  <span className="h-2 w-28 rounded-full bg-[#2b2a27]/80" />
                </div>
                <div className="flex flex-col gap-[11px] px-4 pt-[7px]">
                  <span className="h-[5px] w-24 rounded-full bg-[#2b2a27]/45" />
                  <span className="h-[5px] w-36 rounded-full bg-[#2b2a27]/45" />
                  <span className="h-[5px] w-20 rounded-full bg-[#3555a8]/45" />
                </div>
              </CardFront>
              <CardBack tab={tab} />
            </div>
          );
        })}
        <EndWheel side="right" />
        <Knob angle={0} />
      </div>
    </div>
  );
}

function Knob({
  angle,
  knobRef,
}: {
  angle: number;
  knobRef?: (node: HTMLDivElement | null) => void;
}) {
  const x = CARD_W / 2 + 12;
  const layers = [0, 2, 4, 6, 8, 10, 12];

  return (
    <>
      {layers.map((offset, index) => {
        const isFace = index === layers.length - 1;

        return (
          <div
            className="absolute rounded-full"
            key={offset}
            ref={isFace ? knobRef : undefined}
            style={{
              background: isFace
                ? "repeating-conic-gradient(from 0deg, #2c2c2f 0deg 9deg, #1a1a1c 9deg 18deg)"
                : index % 2 === 0
                  ? "#1d1d1f"
                  : "#151517",
              boxShadow: isFace
                ? "inset 0 0 0 9px #222225, inset 0 0 0 10px rgba(255,255,255,0.08), inset 0 0 0 2px rgba(255,255,255,0.1)"
                : "inset 0 0 0 1px rgba(255,255,255,0.05)",
              height: 44,
              left: -22,
              top: -22,
              transform: `translateX(${x + offset}px) rotateY(90deg) rotateZ(${angle}deg)`,
              width: 44,
            }}
          />
        );
      })}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* The card file                                                               */
/* -------------------------------------------------------------------------- */

export type RolodexItem = {
  id: string;
  /** Letter printed on the card's tab. Typing it jumps to the card. */
  tab: string;
  /** Announced to screen readers when the card comes open. */
  label: string;
  /** What is written on the card, laid out below the tab. */
  content: ReactNode;
};

export type RolodexProps = {
  items: readonly RolodexItem[];
  /** Accessible name for the whole file. */
  label?: string;
  index?: number;
  defaultIndex?: number;
  onIndexChange?: (index: number) => void;
  /** Play a short paper flick as each card goes over. */
  sound?: boolean;
  className?: string;
};

type CardState = {
  distance: number;
  fallen: number;
  velocity: number;
};

type Simulation = {
  cards: CardState[];
  dragging: boolean;
  frame: number;
  lastTime: number;
  position: number;
  reported: number;
  target: number;
  velocity: number;
};

/** Ruled rows on the card body, for content that wants to sit on the lines. */
export const ROLODEX_HEADER_HEIGHT = 30;
export const ROLODEX_ROW_HEIGHT = 18;

export function Rolodex({
  className,
  defaultIndex = 0,
  index: controlledIndex,
  items,
  label = "Card file",
  onIndexChange,
  sound = true,
}: RolodexProps) {
  const shouldReduceMotion = useReducedMotion();
  const hintId = useId();
  const count = items.length;
  const startIndex = clamp(controlledIndex ?? defaultIndex, 0, count - 1);

  const [openIndex, setOpenIndex] = useState(startIndex);
  const [initialStyles] = useState(() =>
    items.map((_, index) => {
      const distance = wrapDistance(index, startIndex, count);
      return poseStyle(poseFor(distance, fallTarget(distance)));
    }),
  );

  const simRef = useRef<Simulation>({
    cards: items.map((_, index) => {
      const distance = wrapDistance(index, startIndex, count);
      return { distance, fallen: fallTarget(distance), velocity: 0 };
    }),
    dragging: false,
    frame: 0,
    lastTime: 0,
    position: startIndex,
    reported: startIndex,
    target: startIndex,
    velocity: 0,
  });
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const knobRef = useRef<HTMLDivElement | null>(null);
  const optionsRef = useRef({ onIndexChange, shouldReduceMotion, sound });
  optionsRef.current = { onIndexChange, shouldReduceMotion, sound };

  const tick = useCallback(
    (time: number) => {
      const sim = simRef.current;
      const { shouldReduceMotion: reduce, sound: withSound } =
        optionsRef.current;
      const elapsed = sim.lastTime ? (time - sim.lastTime) / 1000 : 1 / 60;
      const dt = clamp(elapsed, 0, 1 / 30);
      sim.lastTime = time;

      let moving = sim.dragging;

      if (!sim.dragging) {
        if (reduce) {
          sim.position = sim.target;
          sim.velocity = 0;
        } else {
          for (let step = 0; step < 2; step += 1) {
            const h = dt / 2;
            const force =
              DRUM_STIFFNESS * (sim.target - sim.position) -
              DRUM_DAMPING * sim.velocity;
            sim.velocity += force * h;
            sim.position += sim.velocity * h;
          }

          if (
            Math.abs(sim.target - sim.position) < 0.0005 &&
            Math.abs(sim.velocity) < 0.005
          ) {
            sim.position = sim.target;
            sim.velocity = 0;
          } else {
            moving = true;
          }
        }
      }

      sim.cards.forEach((card, index) => {
        const distance = wrapDistance(index, sim.position, count);
        const goal = fallTarget(distance);
        const wrapped = Math.abs(distance - card.distance) > count / 2;
        const before = card.fallen;
        card.distance = distance;

        if (reduce || wrapped) {
          card.fallen = goal;
          card.velocity = 0;
        } else {
          for (let step = 0; step < 3; step += 1) {
            const h = dt / 3;
            const force =
              CARD_STIFFNESS * (goal - card.fallen) -
              CARD_DAMPING * card.velocity;
            card.velocity += force * h;
            card.fallen += card.velocity * h;
          }

          if (
            Math.abs(goal - card.fallen) < 0.001 &&
            Math.abs(card.velocity) < 0.01
          ) {
            card.fallen = goal;
            card.velocity = 0;
          } else {
            moving = true;
          }

          // Over the top it goes, then slaps on to the stack it lands on.
          if ((before - 0.5) * (card.fallen - 0.5) < 0) {
            if (withSound) {
              playPaper("flick", Math.abs(card.velocity) / 6);
            }
            buzz(3);
          }

          const landed =
            (before < 1 && card.fallen >= 1 && card.velocity > 2) ||
            (before > 0 && card.fallen <= 0 && card.velocity < -2);

          if (landed && withSound) {
            playPaper("tap", Math.abs(card.velocity) / 8);
          }
        }

        const element = cardRefs.current[index];

        if (!element) {
          return;
        }

        const pose = poseFor(distance, card.fallen);
        element.style.transform = pose.transform;
        element.style.setProperty("--card-opacity", String(pose.opacity));
        element.style.visibility = pose.opacity > 0 ? "visible" : "hidden";
        element.style.setProperty("--front-shade", String(pose.frontShade));
        element.style.setProperty("--back-shade", String(pose.backShade));
      });

      const knob = knobRef.current;

      if (knob) {
        knob.style.transform = knob.style.transform.replace(
          /rotateZ\([^)]*\)/,
          `rotateZ(${round(sim.position * 26)}deg)`,
        );
      }

      const settled = mod(
        Math.round(sim.dragging ? sim.position : sim.target),
        count,
      );

      if (settled !== sim.reported) {
        sim.reported = settled;
        setOpenIndex(settled);
        optionsRef.current.onIndexChange?.(settled);
      }

      sim.frame = moving ? requestAnimationFrame(tick) : 0;

      if (!moving) {
        sim.lastTime = 0;
      }
    },
    [count],
  );

  const kick = useCallback(() => {
    const sim = simRef.current;

    if (!sim.frame) {
      sim.frame = requestAnimationFrame(tick);
    }
  }, [tick]);

  useEffect(() => {
    const sim = simRef.current;
    return () => cancelAnimationFrame(sim.frame);
  }, []);

  const flipBy = useCallback(
    (delta: number) => {
      const sim = simRef.current;
      sim.target = Math.round(sim.target) + delta;
      kick();
    },
    [kick],
  );

  /** Spin the shorter way round to a card. */
  const goTo = useCallback(
    (nextIndex: number) => {
      const sim = simRef.current;
      const from = Math.round(sim.target);
      let delta = mod(nextIndex - from, count);

      if (delta > count / 2) {
        delta -= count;
      }

      if (delta !== 0) {
        flipBy(delta);
      }
    },
    [count, flipBy],
  );

  // Follow controlled changes that did not come from a hand on the file.
  useEffect(() => {
    if (
      controlledIndex === undefined ||
      controlledIndex === simRef.current.reported
    ) {
      return;
    }

    goTo(controlledIndex);
  }, [controlledIndex, goTo]);

  const dragRef = useRef<{
    lastTime: number;
    lastY: number;
    moved: boolean;
    pointerId: number;
    startPosition: number;
    startY: number;
    tapped: number | null;
    velocity: number;
  } | null>(null);

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) {
      return;
    }

    const card = (event.target as HTMLElement).closest<HTMLElement>(
      "[data-card-index]",
    );

    event.currentTarget.setPointerCapture(event.pointerId);
    event.currentTarget.focus({ preventScroll: true });
    getAudioContext();
    dragRef.current = {
      lastTime: event.timeStamp,
      lastY: event.clientY,
      moved: false,
      pointerId: event.pointerId,
      startPosition: simRef.current.position,
      startY: event.clientY,
      tapped: card ? Number(card.dataset.cardIndex) : null,
      velocity: 0,
    };
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;

    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    const sim = simRef.current;
    const travel = event.clientY - drag.startY;

    if (!drag.moved) {
      if (Math.abs(travel) < 4) {
        return;
      }

      drag.moved = true;
      sim.dragging = true;
      drag.startPosition = sim.position;
      drag.startY = event.clientY;
    }

    const interval = Math.max(1, event.timeStamp - drag.lastTime) / 1000;
    const instant = (event.clientY - drag.lastY) / PX_PER_CARD / interval;
    drag.velocity = drag.velocity * 0.6 + instant * 0.4;
    drag.lastTime = event.timeStamp;
    drag.lastY = event.clientY;

    sim.position =
      drag.startPosition + (event.clientY - drag.startY) / PX_PER_CARD;
    kick();
  }

  function endDrag(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;

    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    dragRef.current = null;
    const sim = simRef.current;

    if (!drag.moved) {
      if (event.type !== "pointerup" || drag.tapped === null) {
        return;
      }

      // Tap the open card to flip it over; tap any other to spin to it.
      if (drag.tapped === mod(Math.round(sim.target), count)) {
        flipBy(1);
      } else {
        goTo(drag.tapped);
      }

      return;
    }

    // A pause before letting go kills the throw.
    const still = event.timeStamp - drag.lastTime > 80;
    const velocity = still ? 0 : clamp(drag.velocity, -40, 40);
    const throwCards = clamp(velocity * 0.16, -10, 10);

    sim.dragging = false;
    sim.velocity = velocity;
    sim.target = Math.round(sim.position + throwCards);
    kick();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const deltas: Record<string, number> = {
      " ": 1,
      ArrowDown: 1,
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -1,
      Enter: 1,
      PageDown: 5,
      PageUp: -5,
    };

    if (event.metaKey || event.ctrlKey || event.altKey) {
      return;
    }

    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      goTo(event.key === "Home" ? 0 : count - 1);
      return;
    }

    const delta = deltas[event.key];

    if (delta !== undefined) {
      event.preventDefault();
      getAudioContext();
      flipBy(delta);
      return;
    }

    // Type a letter to spin to the next card filed under it.
    if (/^[a-z0-9]$/i.test(event.key)) {
      const from = mod(Math.round(simRef.current.target), count);

      for (let offset = 1; offset <= count; offset += 1) {
        const candidate = (from + offset) % count;

        if (items[candidate]?.tab.toLowerCase().startsWith(event.key)) {
          event.preventDefault();
          getAudioContext();
          goTo(candidate);
          return;
        }
      }
    }
  }

  // React's onWheel is passive, so attach a listener that may cancel scrolling.
  const surfaceRef = useRef<HTMLDivElement>(null);
  const wheelRef = useRef({ accumulated: 0, flipBy });
  wheelRef.current.flipBy = flipBy;

  useEffect(() => {
    const surface = surfaceRef.current;

    if (!surface) {
      return;
    }

    function handleWheel(event: WheelEvent) {
      event.preventDefault();
      const state = wheelRef.current;
      const delta =
        Math.abs(event.deltaY) >= Math.abs(event.deltaX)
          ? event.deltaY
          : event.deltaX;

      state.accumulated += event.deltaMode === 1 ? delta * 40 : delta;

      while (Math.abs(state.accumulated) >= WHEEL_PER_CARD) {
        const direction = Math.sign(state.accumulated);
        state.accumulated -= direction * WHEEL_PER_CARD;
        state.flipBy(direction);
      }
    }

    surface.addEventListener("wheel", handleWheel, { passive: false });
    return () => surface.removeEventListener("wheel", handleWheel);
  }, []);

  const openItem = items[openIndex];

  return (
    <div className={cn("flex flex-col items-center", className)}>
      <div
        aria-describedby={hintId}
        aria-label={label}
        aria-roledescription="card file"
        aria-valuemax={count}
        aria-valuemin={1}
        aria-valuenow={openIndex + 1}
        aria-valuetext={
          openItem
            ? `Card ${openIndex + 1} of ${count}: ${openItem.label}`
            : undefined
        }
        className="relative h-[400px] w-[380px] cursor-grab touch-none select-none rounded-[20px] outline-none focus-visible:ring-2 focus-visible:ring-grayscale-7 active:cursor-grabbing"
        onKeyDown={handleKeyDown}
        onLostPointerCapture={endDrag}
        onPointerCancel={endDrag}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        ref={surfaceRef}
        role="slider"
        style={{ perspective: 1100 }}
        tabIndex={0}
      >
        <div style={rigStyle}>
          <DeskShadow />
          <EndWheel side="left" />
          {items.map((item, index) => (
            <div
              aria-hidden={index !== openIndex}
              className="absolute"
              data-card-index={index}
              key={item.id}
              ref={(node) => {
                cardRefs.current[index] = node;
              }}
              style={{ ...cardBoxStyle, ...initialStyles[index] }}
            >
              <CardFront tab={item.tab}>{item.content}</CardFront>
              <CardBack tab={item.tab} />
            </div>
          ))}
          <EndWheel side="right" />
          <Knob
            angle={round(startIndex * 26)}
            knobRef={(node) => {
              knobRef.current = node;
            }}
          />
        </div>
      </div>

      <p className="sr-only" id={hintId}>
        Use the arrow keys to flip through the cards, or type a letter to jump
        to it.
      </p>
    </div>
  );
}
