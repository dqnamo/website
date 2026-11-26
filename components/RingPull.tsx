"use client";

import {
  animate,
  type MotionValue,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useTransform,
} from "motion/react";
import {
  type CSSProperties,
  type KeyboardEvent,
  memo,
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

/** Lid diameter in CSS pixels. Everything else is drawn around its centre. */
const LID = 260;
const HALF = LID / 2;
/** How far the lid is tipped back from facing the viewer. */
const TILT = 54;
const PERSPECTIVE = 1600;
/** The lid's near half on screen, foreshortened and swollen by perspective. */
const BODY_RADIUS_Y = 82;
/** How far below the lid's centre the printed body begins. */
const NECK_DROP = 34;
/** The lid's box is taller than its foreshortened face; pull it up to fit. */
const SCENE_OFFSET = -52;
const SCENE_HEIGHT = 300;

/**
 * The opening faces you and the ring lies on the far side of the rivet, as
 * when you hold a can to open it. The tab turns about a line by the rivet.
 */
const TAB_HINGE_Y = -4;
/** The tongue hinges on its edge nearest the rivet and drops into the can. */
const TONGUE_HINGE_Y = 21;
/** Degrees of lift per pixel the finger drags upwards. */
const DRAG_GAIN = 1.15;

/** How far the hand has to lift before the score gives. */
const CRACK_AT = 38;
/** Most the tab will lift while the can is still sealed. */
const SEALED_LIMIT = 16;
const MAX_LIFT = 112;
/** The tongue tears off the score at this angle, and never springs back. */
const TONGUE_POPPED = 20;
const TONGUE_OPEN = 76;

/** Mirror a path of absolute M, L, Q and C commands top to bottom. */
function flipY(path: string) {
  let index = 0;
  return path.replace(/-?\d+(\.\d+)?/g, (number) => {
    index += 1;
    return index % 2 === 0 ? String(-Number(number)) : number;
  });
}

const TONGUE_PATH = flipY(
  "M -17 -21 Q 0 -15 17 -21 L 29 -84 Q 31 -104 0 -106 Q -31 -104 -29 -84 Z",
);
const TAB_OUTLINE = flipY(
  "M -14 -20 Q -14 -29 0 -29 Q 14 -29 14 -20 L 20 -5 C 24 4 32 10 32 22 C 34 40 34 66 22 80 C 14 88 -14 88 -22 80 C -34 66 -34 40 -32 22 C -32 10 -24 4 -20 -5 Z",
);
const FINGER_HOLE = flipY(
  "M 0 30 C 16 30 22 42 22 54 C 22 70 12 76 0 76 C -12 76 -22 70 -22 54 C -22 42 -16 30 0 30 Z",
);
const RIVET_SLOT = flipY("M -11 -6 L -11 8 Q -11 15 0 15 Q 11 15 11 8 L 11 -6");
const PANEL_RADIUS = 115;

const RAD = Math.PI / 180;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

/** Where a point on the lid lands on screen, relative to the lid's centre. */
function project(x: number, y: number, z = 0) {
  const screenY = y * Math.cos(TILT * RAD) - z * Math.sin(TILT * RAD);
  const depth = y * Math.sin(TILT * RAD) + z * Math.cos(TILT * RAD);
  const scale = PERSPECTIVE / (PERSPECTIVE - depth);
  return { x: x * scale, y: screenY * scale };
}

/** The tab pushes the tongue down further the higher it lifts. */
function tongueFor(tabAngle: number) {
  return clamp(TONGUE_POPPED + (tabAngle - CRACK_AT) * 1.05, 0, TONGUE_OPEN);
}

/** Sealed, the tab only bends a little however hard you pull. */
function sealedLift(handAngle: number) {
  return SEALED_LIMIT * (1 - Math.exp(-Math.max(0, handAngle) / 15));
}

/* -------------------------------------------------------------------------- */
/* Flavours                                                                    */
/* -------------------------------------------------------------------------- */

export type RingPullFlavour = "cola" | "lemon" | "orange" | "seltzer";

type FlavourTokens = {
  name: string;
  body: string;
  bodyDeep: string;
  ink: string;
  tab: [string, string, string];
  drink: string;
  drinkDeep: string;
  bubble: string;
  /** How lively the hiss is. */
  fizz: number;
};

export const ringPullFlavours: Record<RingPullFlavour, FlavourTokens> = {
  cola: {
    body: "#c4161c",
    bodyDeep: "#6e080c",
    bubble: "rgb(255 236 214 / 70%)",
    drink: "#4a2111",
    drinkDeep: "#1a0904",
    fizz: 1,
    ink: "#fff4ea",
    name: "Cola",
    tab: ["#ff7a76", "#d42a2a", "#7f1014"],
  },
  lemon: {
    body: "#e9df45",
    bodyDeep: "#8d8613",
    bubble: "rgb(255 255 255 / 80%)",
    drink: "#e8e6a4",
    drinkDeep: "#8c8a4d",
    fizz: 0.9,
    ink: "#2d4a12",
    name: "Lemon",
    tab: ["#b8f07c", "#4fa83a", "#21581c"],
  },
  orange: {
    body: "#f2701e",
    bodyDeep: "#8a330a",
    bubble: "rgb(255 240 220 / 75%)",
    drink: "#f59428",
    drinkDeep: "#8b4007",
    fizz: 0.85,
    ink: "#fff6e8",
    name: "Blood Orange",
    tab: ["#ffe58a", "#e0a422", "#7d5106"],
  },
  seltzer: {
    body: "#dbe7ee",
    bodyDeep: "#7f97a6",
    bubble: "rgb(255 255 255 / 92%)",
    drink: "#bcd9e6",
    drinkDeep: "#56798b",
    fizz: 1.25,
    ink: "#1d4e6b",
    name: "Seltzer",
    tab: ["#9bd2ff", "#2f7fd4", "#103f78"],
  },
};

/* -------------------------------------------------------------------------- */
/* Sound                                                                       */
/* -------------------------------------------------------------------------- */

let sharedAudioContext: AudioContext | null = null;
let noiseBuffer: AudioBuffer | null = null;

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
    const length = context.sampleRate * 2;
    noiseBuffer = context.createBuffer(1, length, context.sampleRate);
    const data = noiseBuffer.getChannelData(0);

    for (let index = 0; index < length; index += 1) {
      data[index] = Math.random() * 2 - 1;
    }
  }

  return noiseBuffer;
}

/** A filtered slice of noise with a sharp attack and an exponential tail. */
function noiseBurst(
  context: AudioContext,
  {
    at,
    decay,
    frequency,
    gain,
    q = 0.8,
    type = "bandpass",
  }: {
    at: number;
    decay: number;
    frequency: number;
    gain: number;
    q?: number;
    type?: BiquadFilterType;
  },
) {
  const source = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const envelope = context.createGain();

  source.buffer = getNoise(context);
  filter.type = type;
  filter.frequency.value = frequency;
  filter.Q.value = q;
  envelope.gain.setValueAtTime(0.0001, at);
  envelope.gain.exponentialRampToValueAtTime(gain, at + 0.004);
  envelope.gain.exponentialRampToValueAtTime(0.0001, at + decay);

  source.connect(filter).connect(envelope).connect(context.destination);
  source.start(at, Math.random() * 1.5, decay + 0.05);
}

/** The score giving way, the gas rushing out, then the drink fizzing. */
function playCrack(fizz: number) {
  const context = getAudioContext();

  if (!context) {
    return;
  }

  const now = context.currentTime;

  // The snap of the score: a hard click with a little body under it.
  noiseBurst(context, {
    at: now,
    decay: 0.03,
    frequency: 2600,
    gain: 0.9,
    q: 1.1,
  });

  const thump = context.createOscillator();
  const thumpGain = context.createGain();
  thump.frequency.setValueAtTime(190, now);
  thump.frequency.exponentialRampToValueAtTime(70, now + 0.07);
  thumpGain.gain.setValueAtTime(0.0001, now);
  thumpGain.gain.exponentialRampToValueAtTime(0.35, now + 0.004);
  thumpGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);
  thump.connect(thumpGain).connect(context.destination);
  thump.start(now);
  thump.stop(now + 0.1);

  // The hiss: bright, loud, and quick to die away.
  noiseBurst(context, {
    at: now + 0.012,
    decay: 0.55 + fizz * 0.35,
    frequency: 4200,
    gain: 0.34 * fizz,
    q: 0.35,
    type: "highpass",
  });
  noiseBurst(context, {
    at: now + 0.02,
    decay: 0.28,
    frequency: 1800,
    gain: 0.16,
    q: 0.6,
  });

  // Then hundreds of tiny bubbles bursting at the surface, thinning out.
  const pops = Math.round(70 * fizz);

  for (let pop = 0; pop < pops; pop += 1) {
    const progress = pop / pops;
    const at = now + 0.15 + progress ** 1.8 * 3.2 + Math.random() * 0.04;

    noiseBurst(context, {
      at,
      decay: 0.004 + Math.random() * 0.006,
      frequency: 5000 + Math.random() * 4000,
      gain: (0.05 + Math.random() * 0.12) * (1 - progress * 0.75),
      q: 2,
    });
  }
}

/** Aluminium on aluminium: the tab landing back on the lid. */
function playClack(strength = 1) {
  const context = getAudioContext();

  if (!context) {
    return;
  }

  const now = context.currentTime;
  noiseBurst(context, {
    at: now,
    decay: 0.035,
    frequency: 3600,
    gain: 0.35 * strength,
    q: 3,
  });
  noiseBurst(context, {
    at: now + 0.002,
    decay: 0.06,
    frequency: 7800,
    gain: 0.08 * strength,
    q: 8,
  });
}

/** The tab lifting off its seat with a dry little tick. */
function playTick() {
  const context = getAudioContext();

  if (!context) {
    return;
  }

  noiseBurst(context, {
    at: context.currentTime,
    decay: 0.014,
    frequency: 5200,
    gain: 0.18,
    q: 2.5,
  });
}

function buzz(pattern: number | number[]) {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    navigator.vibrate?.(pattern);
  }
}

/* -------------------------------------------------------------------------- */
/* Deterministic randomness, so server and client draw the same bubbles        */
/* -------------------------------------------------------------------------- */

function seeded(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

/** Two decimal places: stable between server and client. */
function round(value: number) {
  return Math.round(value * 100) / 100;
}

const bubbles = (() => {
  const random = seeded(7);
  return Array.from({ length: 26 }, () => ({
    delay: round(random() * 1.6),
    duration: round(0.7 + random() * 0.9),
    size: round(1.4 + random() * 2.8),
    x: round(-26 + random() * 52),
    // Seen through the opening, the drink lies further back than the hole.
    y: round(-32 + random() * 74),
  }));
})();

/* -------------------------------------------------------------------------- */
/* Drawing                                                                     */
/* -------------------------------------------------------------------------- */

type Transform = MotionValue<string> | string;

const layerClassName = "absolute inset-0 [transform-style:preserve-3d]";
const svgBox = `${-HALF} ${-HALF} ${LID} ${LID}`;

function layerStyle(transform: Transform, origin?: string) {
  return {
    transform,
    transformOrigin: origin,
  } as const;
}

/** The can's printed side, seen below the rim. Drawn flat, behind the lid. */
function CanBody({ flavour }: { flavour: FlavourTokens }) {
  const cylinder = (base: string, deep: string, shine: string) =>
    `linear-gradient(90deg, ${deep} 0%, ${base} 20%, ${shine} 33%, ${base} 46%, ${base} 70%, ${deep} 100%)`;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-[-10px]"
      style={{
        height: NECK_DROP + BODY_RADIUS_Y + 150,
        maskImage: "linear-gradient(180deg, black 68%, transparent 100%)",
        top: HALF + NECK_DROP - BODY_RADIUS_Y,
      }}
    >
      {/* The printed body, its shoulder curving away under the neck. */}
      <div
        className="absolute inset-0"
        style={{
          background: cylinder(
            flavour.body,
            flavour.bodyDeep,
            `color-mix(in oklab, ${flavour.body}, white 40%)`,
          ),
          borderTopLeftRadius: `50% ${BODY_RADIUS_Y}px`,
          borderTopRightRadius: `50% ${BODY_RADIUS_Y}px`,
        }}
      >
        <p
          className="absolute inset-x-0 text-center font-black font-sans text-[25px] uppercase italic leading-none tracking-[-0.02em]"
          style={{
            color: flavour.ink,
            textShadow: "0 1px 0 rgb(0 0 0 / 12%)",
            top: BODY_RADIUS_Y * 2 + 2,
          }}
        >
          {flavour.name}
        </p>
        <p
          className="absolute inset-x-0 text-center font-medium font-mono text-[8px] uppercase tracking-[0.3em]"
          style={{
            color: flavour.ink,
            opacity: 0.75,
            top: BODY_RADIUS_Y * 2 + 32,
          }}
        >
          Sparkling · 330 ml
        </p>
      </div>

      {/* The bare aluminium neck between the rim and the print. */}
      <div
        className="absolute rounded-[50%]"
        style={{
          background: cylinder("#b4b9be", "#4d5156", "#f6f7f8"),
          boxShadow:
            "inset 0 -3px 3px rgb(0 0 0 / 22%), 0 2px 3px rgb(0 0 0 / 18%)",
          height: BODY_RADIUS_Y * 2,
          left: 12,
          right: 12,
          top: -NECK_DROP + 18,
        }}
      />
    </div>
  );
}

/** Shift a path of absolute M, L, Q and C commands. */
function offsetPath(path: string, dx: number, dy: number) {
  let index = 0;
  return path.replace(/-?\d+(\.\d+)?/g, (number) => {
    index += 1;
    return String(Number(number) + (index % 2 === 0 ? dy : dx));
  });
}

/** The opening in the lid's own pixels, for CSS `clip-path`. */
const openingClipPath = `path("${offsetPath(TONGUE_PATH, HALF, HALF)}")`;

/**
 * Everything seen through the opening: the drink, fizzing once the can is
 * open, and the tongue, which folds down and away under the rivet.
 */
function Opening({
  flavour,
  live,
  tongue,
}: {
  flavour: FlavourTokens;
  live: boolean;
  tongue: MotionValue<number>;
}) {
  const shouldReduceMotion = useReducedMotion();
  const gradientId = useId();
  const tongueScale = useTransform(tongue, (angle) =>
    Math.max(0.08, Math.cos(angle * RAD)),
  );
  const tongueShade = useTransform(tongue, [0, TONGUE_OPEN], [0, 0.7]);

  return (
    <div
      aria-hidden="true"
      className="absolute inset-0"
      style={{ clipPath: openingClipPath, transform: "translateZ(-0.5px)" }}
    >
      <div
        className="absolute"
        style={{
          background: `radial-gradient(ellipse 70% 60% at 50% 62%, ${flavour.drink}, ${flavour.drinkDeep})`,
          height: 90,
          left: HALF - 34,
          top: HALF + 18,
          width: 68,
        }}
      />
      {/* Bubbles bursting at the surface. They slow as the can goes flat. */}
      <motion.div
        animate={{ opacity: live ? [1, 0.35] : 0 }}
        className="absolute inset-0"
        initial={false}
        transition={{ duration: live ? 9 : 0.3, ease: "easeOut" }}
      >
        {bubbles.map((bubble) => (
          <motion.span
            animate={
              shouldReduceMotion || !live
                ? { opacity: 0.6, scale: 1 }
                : { opacity: [0, 1, 0], scale: [0.3, 1, 1.25] }
            }
            className="absolute rounded-full"
            key={`${bubble.x}-${bubble.y}`}
            style={{
              border: `0.75px solid ${flavour.bubble}`,
              height: bubble.size,
              left: HALF + bubble.x,
              top: HALF + bubble.y,
              width: bubble.size,
            }}
            transition={{
              delay: bubble.delay,
              duration: bubble.duration,
              ease: "easeOut",
              repeat: Number.POSITIVE_INFINITY,
              repeatDelay: bubble.delay * 0.5,
            }}
          />
        ))}
      </motion.div>

      <svg
        aria-hidden="true"
        className="absolute inset-0 overflow-visible"
        viewBox={svgBox}
      >
        <defs>
          <filter id={`${gradientId}-soft`}>
            <feGaussianBlur stdDeviation="3" />
          </filter>
        </defs>
        {/* The lid's cut edge throws a shadow in round the inside. */}
        <path
          d={TONGUE_PATH}
          fill="none"
          filter={`url(#${gradientId}-soft)`}
          stroke="rgb(0 0 0 / 70%)"
          strokeWidth="10"
        />
      </svg>

      {/* Seen from above, a tongue swinging down shortens towards its hinge. */}
      <motion.div
        className="absolute inset-0"
        style={{
          scaleY: tongueScale,
          transformOrigin: `${HALF}px ${HALF + TONGUE_HINGE_Y}px`,
        }}
      >
        <svg
          aria-hidden="true"
          className="absolute inset-0 overflow-visible"
          viewBox={svgBox}
        >
          <defs>
            {/* The same light as the panel, so sealed it reads as one sheet. */}
            <radialGradient
              cx="-11.5"
              cy="-46"
              gradientUnits="userSpaceOnUse"
              id={`${gradientId}-metal`}
              r="184"
            >
              <stop offset="0" stopColor="#eef0f2" />
              <stop offset="0.6" stopColor="#c8ccd0" />
              <stop offset="1" stopColor="#a5abb0" />
            </radialGradient>
          </defs>
          <path d={TONGUE_PATH} fill={`url(#${gradientId}-metal)`} />
          <motion.path
            d={TONGUE_PATH}
            fill="#16181a"
            style={{ opacity: tongueShade }}
          />
        </svg>
      </motion.div>
    </div>
  );
}

/** The rim, the countersink and the panel, with the opening cut out of it. */
function Lid({ opened, tension }: { opened: boolean; tension: MotionValue }) {
  const gradientId = useId();
  const scoreOpacity = useTransform(tension, [0, 1], [0.35, 0.85]);
  const arcId = `${gradientId}-arc`;

  return (
    <div aria-hidden="true" className={layerClassName}>
      <svg
        aria-hidden="true"
        className="absolute inset-0 overflow-visible"
        viewBox={svgBox}
      >
        <defs>
          <linearGradient
            id={`${gradientId}-rim`}
            x1="0"
            x2="0.3"
            y1="0"
            y2="1"
          >
            <stop offset="0" stopColor="#f7f8f9" />
            <stop offset="0.45" stopColor="#b9bec3" />
            <stop offset="0.7" stopColor="#dfe2e5" />
            <stop offset="1" stopColor="#80868c" />
          </linearGradient>
          <linearGradient id={`${gradientId}-sink`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#6f757b" />
            <stop offset="1" stopColor="#d8dbde" />
          </linearGradient>
          <radialGradient cx="0.45" cy="0.3" id={`${gradientId}-panel`} r="0.8">
            <stop offset="0" stopColor="#eef0f2" />
            <stop offset="0.6" stopColor="#c8ccd0" />
            <stop offset="1" stopColor="#a5abb0" />
          </radialGradient>
          <path d="M -103 0 A 103 103 0 0 1 103 0" fill="none" id={arcId} />
          {/* The whole lid, less the opening. */}
          <clipPath id={`${gradientId}-cut`}>
            <path
              clipRule="evenodd"
              d={`M ${-HALF} 0 A ${HALF} ${HALF} 0 1 0 ${HALF} 0 A ${HALF} ${HALF} 0 1 0 ${-HALF} 0 Z ${TONGUE_PATH}`}
            />
          </clipPath>
        </defs>

        <g clipPath={`url(#${gradientId}-cut)`}>
          <circle fill={`url(#${gradientId}-rim)`} r={HALF} />
          <circle fill="none" r={HALF - 3} stroke="rgb(255 255 255 / 55%)" />
          <circle fill={`url(#${gradientId}-sink)`} r={PANEL_RADIUS + 6} />
          <circle fill={`url(#${gradientId}-panel)`} r={PANEL_RADIUS} />
          {/* Brushed rings pressed into the panel. */}
          <circle
            fill="none"
            r={PANEL_RADIUS - 4}
            stroke="rgb(0 0 0 / 10%)"
            strokeWidth="1.5"
          />
          <circle
            fill="none"
            r={PANEL_RADIUS - 5.5}
            stroke="rgb(255 255 255 / 45%)"
          />

          {/* Debossed lettering round the far side of the panel. */}
          <text
            fill="rgb(255 255 255 / 55%)"
            fontFamily="ui-monospace, monospace"
            fontSize="7"
            fontWeight="600"
            letterSpacing="2.4"
          >
            <textPath href={`#${arcId}`} startOffset="50%" textAnchor="middle">
              LIFT · PULL BACK · RECYCLE ME
            </textPath>
          </text>
          <text
            fill="rgb(0 0 0 / 28%)"
            fontFamily="ui-monospace, monospace"
            fontSize="7"
            fontWeight="600"
            letterSpacing="2.4"
            transform="translate(0 -0.7)"
          >
            <textPath href={`#${arcId}`} startOffset="50%" textAnchor="middle">
              LIFT · PULL BACK · RECYCLE ME
            </textPath>
          </text>
        </g>

        {/* The score is a dark hairline with a highlight; open, it's a raw edge. */}
        {opened ? (
          <path
            d={TONGUE_PATH}
            fill="none"
            stroke="#f6f7f8"
            strokeLinejoin="round"
            strokeWidth="1.4"
          />
        ) : (
          <motion.g style={{ opacity: scoreOpacity }}>
            <path
              d={TONGUE_PATH}
              fill="none"
              stroke="rgb(255 255 255 / 80%)"
              strokeWidth="1"
              transform="translate(0 0.9)"
            />
            <path
              d={TONGUE_PATH}
              fill="none"
              stroke="rgb(40 44 48 / 80%)"
              strokeWidth="0.9"
            />
          </motion.g>
        )}
      </svg>
    </div>
  );
}

function TabShadow({ transform }: { transform: Transform }) {
  return (
    <motion.div
      aria-hidden="true"
      className={layerClassName}
      style={layerStyle(transform, `${HALF}px ${HALF + TAB_HINGE_Y}px`)}
    >
      <svg
        aria-hidden="true"
        className="absolute inset-0 overflow-visible blur-[2px]"
        viewBox={svgBox}
      >
        <path
          d={`${TAB_OUTLINE} ${FINGER_HOLE}`}
          fill="rgb(20 24 28 / 38%)"
          fillRule="evenodd"
          transform="translate(0 2)"
        />
      </svg>
    </motion.div>
  );
}

/** The anodised ring pull. */
function Tab({
  className,
  flavour,
  glare,
  transform,
}: {
  className?: string;
  flavour: FlavourTokens;
  glare: MotionValue<number> | number;
  transform: Transform;
}) {
  const gradientId = useId();
  const [light, mid, deep] = flavour.tab;

  return (
    <motion.div
      aria-hidden="true"
      className={cn(layerClassName, className)}
      style={layerStyle(transform, `${HALF}px ${HALF + TAB_HINGE_Y}px`)}
    >
      <svg
        aria-hidden="true"
        className="absolute inset-0 overflow-visible"
        viewBox={svgBox}
      >
        <defs>
          <linearGradient id={gradientId} x1="0.1" x2="0.9" y1="0" y2="1">
            <stop offset="0" stopColor={light} />
            <stop offset="0.45" stopColor={mid} />
            <stop offset="1" stopColor={deep} />
          </linearGradient>
        </defs>
        <path
          d={`${TAB_OUTLINE} ${FINGER_HOLE}`}
          fill={`url(#${gradientId})`}
          fillRule="evenodd"
        />
        {/* Rolled edges round the outside and the finger hole. */}
        <path
          d={TAB_OUTLINE}
          fill="none"
          stroke="rgb(255 255 255 / 55%)"
          strokeWidth="1.6"
          transform="translate(0 -0.4) scale(0.975)"
        />
        <path
          d={FINGER_HOLE}
          fill="none"
          stroke="rgb(0 0 0 / 35%)"
          strokeWidth="1.4"
        />
        <path
          d={FINGER_HOLE}
          fill="none"
          stroke="rgb(255 255 255 / 45%)"
          strokeWidth="1"
          transform="translate(0 1.1) scale(1.06)"
        />
        <path
          d={TAB_OUTLINE}
          fill="none"
          stroke={deep}
          strokeOpacity="0.8"
          strokeWidth="0.8"
        />
        {/* The U cut round the rivet that lets the tab lever. */}
        <path
          d={RIVET_SLOT}
          fill="none"
          stroke="rgb(0 0 0 / 45%)"
          strokeLinecap="round"
          strokeWidth="1.4"
        />
        <path
          d={RIVET_SLOT}
          fill="none"
          stroke="rgb(255 255 255 / 40%)"
          strokeLinecap="round"
          strokeWidth="0.8"
          transform="translate(0 1.2)"
        />
        {/* Light catching the ring as it comes up towards you. */}
        <motion.path
          d={`${TAB_OUTLINE} ${FINGER_HOLE}`}
          fill="white"
          fillRule="evenodd"
          style={{ opacity: glare }}
        />
      </svg>
    </motion.div>
  );
}

/** The rivet and the bridge of tab it clamps flat to the lid. */
function Rivet({ flavour }: { flavour: FlavourTokens }) {
  const gradientId = useId();
  const [light, mid] = flavour.tab;

  return (
    <div
      aria-hidden="true"
      className={layerClassName}
      style={{ transform: "translateZ(2px)" }}
    >
      <svg
        aria-hidden="true"
        className="absolute inset-0 overflow-visible"
        viewBox={svgBox}
      >
        <defs>
          <radialGradient cx="0.38" cy="0.32" id={gradientId} r="0.7">
            <stop offset="0" stopColor="#ffffff" />
            <stop offset="0.5" stopColor="#c9cdd1" />
            <stop offset="1" stopColor="#7d838a" />
          </radialGradient>
        </defs>
        <path
          d="M -9 4 L 9 4 L 9 -7 Q 9 -12 0 -12 Q -9 -12 -9 -7 Z"
          fill={mid}
        />
        <path
          d="M -9 4 L 9 4"
          stroke={light}
          strokeOpacity="0.8"
          strokeWidth="1"
        />
        <circle cy="-1.4" fill="rgb(0 0 0 / 30%)" r="6.6" />
        <circle cy="-2" fill={`url(#${gradientId})`} r="5.8" />
        <circle
          cy="-2"
          fill="none"
          r="3.4"
          stroke="rgb(0 0 0 / 12%)"
          strokeWidth="0.8"
        />
      </svg>
    </div>
  );
}

type SceneProps = {
  children?: ReactNode;
  flavour: FlavourTokens;
  opened: boolean;
  tension: MotionValue<number>;
  tabTransform: Transform;
  tabClassName?: string;
  shadowTransform: Transform;
  tongue: MotionValue<number>;
  tabGlare: MotionValue<number> | number;
  live: boolean;
};

/** The top of the can in perspective: body, drink, lid, tongue and tab. */
function CanScene({
  children,
  flavour,
  live,
  opened,
  shadowTransform,
  tabClassName,
  tabGlare,
  tabTransform,
  tension,
  tongue,
}: SceneProps) {
  return (
    <div className="relative" style={{ height: SCENE_HEIGHT, width: LID }}>
      <div
        className="absolute left-0"
        style={{ height: LID, top: SCENE_OFFSET, width: LID }}
      >
        <CanBody flavour={flavour} />
        <div className="absolute inset-0" style={{ perspective: PERSPECTIVE }}>
          <div
            className={layerClassName}
            style={{ transform: `rotateX(${TILT}deg)` }}
          >
            <Opening flavour={flavour} live={live} tongue={tongue} />
            <Lid opened={opened} tension={tension} />
            <TabShadow transform={shadowTransform} />
            <Tab
              className={tabClassName}
              flavour={flavour}
              glare={tabGlare}
              transform={tabTransform}
            />
            <Rivet flavour={flavour} />
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Spray                                                                       */
/* -------------------------------------------------------------------------- */

/** Where the gas escapes: the far end of the opening, on screen. */
const ventPoint = project(0, 70);

/** Mist and droplets thrown up by the escaping gas. Drawn once, then left alone. */
const Spray = memo(function Spray({
  flavour,
  seed,
}: {
  flavour: FlavourTokens;
  seed: number;
}) {
  const [{ droplets, puffs }] = useState(() => sprayParticles(seed));

  return <SprayParticles droplets={droplets} flavour={flavour} puffs={puffs} />;
});

function sprayParticles(seed: number) {
  const random = seeded(seed * 7919 + 13);
  const droplets = Array.from({ length: 24 }, () => {
    const spread = (random() - 0.5) * 2.4;
    const height = 34 + random() * 70;
    return {
      duration: 0.65 + random() * 0.5,
      fall: 24 + random() * 50,
      height,
      size: 2.2 + random() * 3,
      x: spread * (22 + random() * 34),
    };
  });
  const puffs = Array.from({ length: 5 }, (_, index) => ({
    delay: index * 0.05,
    drift: (random() - 0.5) * 34,
    rise: 46 + random() * 44,
    size: 34 + random() * 30,
  }));

  return { droplets, puffs };
}

function SprayParticles({
  droplets,
  flavour,
  puffs,
}: ReturnType<typeof sprayParticles> & { flavour: FlavourTokens }) {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute z-10"
      style={{
        left: HALF + ventPoint.x,
        top: HALF + ventPoint.y,
      }}
    >
      {puffs.map((puff) => (
        <motion.span
          animate={{
            opacity: [0, 0.75, 0],
            scale: [0.3, 1, 1.6],
            x: [0, puff.drift],
            y: [0, -puff.rise],
          }}
          className="absolute rounded-full"
          key={`puff-${puff.delay}`}
          style={{
            // A soft gradient, not a blur filter: far cheaper to paint.
            background:
              "radial-gradient(circle, rgb(255 255 255 / 95%), rgb(255 255 255 / 45%) 40%, transparent 70%)",
            height: puff.size,
            left: -puff.size / 2,
            top: -puff.size / 2,
            width: puff.size,
          }}
          transition={{ delay: puff.delay, duration: 1.1, ease: "easeOut" }}
        />
      ))}
      {droplets.map((drop) => (
        <motion.span
          animate={{
            opacity: [1, 1, 0],
            x: [0, drop.x * 0.6, drop.x],
            y: [0, -drop.height, -drop.height + drop.fall],
          }}
          className="absolute rounded-full"
          key={`drop-${drop.x}-${drop.height}`}
          style={{
            backgroundColor: flavour.drink,
            boxShadow:
              "inset 0 -0.5px 0 rgb(0 0 0 / 25%), 0 0 0 0.5px rgb(255 255 255 / 40%)",
            height: drop.size,
            left: -drop.size / 2,
            top: -drop.size / 2,
            width: drop.size,
          }}
          transition={{
            duration: drop.duration,
            ease: "easeOut",
            times: [0, 0.45, 1],
          }}
        />
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Decorative face for previews                                                */
/* -------------------------------------------------------------------------- */

/**
 * A still, sealed can for thumbnails. Set `--ring-pull-lift` (in degrees) from
 * `className`, e.g. on hover, to lift the tab.
 */
export function RingPullFace({
  className,
  flavour = "cola",
  scale = 0.5,
  style,
}: {
  className?: string;
  flavour?: RingPullFlavour;
  scale?: number;
  style?: CSSProperties;
}) {
  const tension = useMotionValue(0);
  const tongue = useMotionValue(0);
  const tokens = ringPullFlavours[flavour];

  return (
    <div
      aria-hidden="true"
      className={cn("relative", className)}
      style={{ height: SCENE_HEIGHT * scale, width: LID * scale, ...style }}
    >
      <div
        className="absolute top-0 left-0 origin-top-left"
        style={{ transform: `scale(${scale})` }}
      >
        <CanScene
          flavour={tokens}
          live={false}
          opened={false}
          shadowTransform="translateZ(0.5px)"
          tabClassName="transition-transform duration-500 [transition-timing-function:cubic-bezier(0.34,1.4,0.64,1)] motion-reduce:transition-none"
          tabGlare={0}
          tabTransform="translateZ(1px) rotateX(calc(-1 * var(--ring-pull-lift, 0deg)))"
          tension={tension}
          tongue={tongue}
        />
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* The can                                                                     */
/* -------------------------------------------------------------------------- */

export type RingPullState = "sealed" | "open";

export type RingPullProps = {
  flavour?: RingPullFlavour;
  /** Play a synthesised crack, hiss and fizz. */
  sound?: boolean;
  /** Called once, the moment the score gives. */
  onOpen?: () => void;
  className?: string;
};

export function RingPull({
  className,
  flavour = "cola",
  onOpen,
  sound = true,
}: RingPullProps) {
  const shouldReduceMotion = useReducedMotion();
  const tokens = ringPullFlavours[flavour];
  const descriptionId = useId();

  const [state, setState] = useState<RingPullState>("sealed");
  const [lift, setLift] = useState(0);
  const [pressed, setPressed] = useState(false);
  const [sprays, setSprays] = useState<number[]>([]);
  const [announcement, setAnnouncement] = useState("");

  const stateRef = useRef<RingPullState>("sealed");
  const handRef = useRef(0);
  const soundRef = useRef(sound);
  soundRef.current = sound;

  const tab = useMotionValue(0);
  const tongue = useMotionValue(0);
  const tension = useMotionValue(0);
  const jolt = useMotionValue(0);
  /** How far the tab still has to catch up with the hand after the crack. */
  const slack = useMotionValue(0);

  useMotionValueEvent(slack, "change", (gap) => {
    if (stateRef.current === "open" && dragRef.current) {
      tab.set(handRef.current - gap);
    }
  });

  const tabTransform = useTransform(
    tab,
    (angle) => `translateZ(1px) rotateX(${-angle}deg)`,
  );
  const shadowTransform = useTransform(tab, (angle) => {
    const lifted = Math.min(angle, 90) * RAD;
    return `translateZ(0.5px) translateY(${Math.sin(lifted) * -4}px) scaleY(${Math.max(0.12, Math.cos(lifted))})`;
  });
  const tabGlare = useTransform(tab, [0, 50, 100], [0, 0.18, 0.04]);

  // Keep the accessible value in step without re-rendering every frame.
  useMotionValueEvent(tab, "change", (angle) => {
    const percent = Math.round((clamp(angle, 0, MAX_LIFT) / MAX_LIFT) * 20) * 5;
    setLift((current) => (current === percent ? current : percent));
  });

  const spring = useCallback(
    (
      value: MotionValue<number>,
      target: number,
      options: { damping?: number; stiffness?: number } = {},
    ) => {
      if (shouldReduceMotion) {
        value.set(target);
        return;
      }

      animate(value, target, {
        damping: options.damping ?? 22,
        stiffness: options.stiffness ?? 420,
        type: "spring",
      });
    },
    [shouldReduceMotion],
  );

  const crack = useCallback(() => {
    stateRef.current = "open";
    setState("open");
    setAnnouncement("Pssst. The can is open.");
    tension.set(0);

    if (soundRef.current) {
      playCrack(tokens.fizz);
    }

    buzz([14, 30, 8]);
    onOpen?.();

    if (shouldReduceMotion) {
      tongue.set(TONGUE_POPPED);
      return;
    }

    setSprays((current) => [...current.slice(-2), (current.at(-1) ?? 0) + 1]);
    animate(tongue, [0, TONGUE_POPPED + 9, TONGUE_POPPED], {
      duration: 0.32,
      ease: [0.2, 0.9, 0.3, 1],
      times: [0, 0.45, 1],
    });
    animate(jolt, [0, -2.5, 1.2, 0], { duration: 0.28, ease: "easeOut" });
  }, [jolt, onOpen, shouldReduceMotion, tension, tokens.fizz, tongue]);

  /** Turn where the hand has lifted the ring to into what the tab does. */
  const applyHand = useCallback(
    (handAngle: number) => {
      const hand = clamp(handAngle, 0, MAX_LIFT);
      const wasFlat = handRef.current < 0.5;
      handRef.current = hand;

      if (wasFlat && hand >= 0.5 && soundRef.current) {
        playTick();
      }

      if (stateRef.current === "sealed") {
        if (hand < CRACK_AT) {
          const strain = hand / CRACK_AT;
          tab.set(sealedLift(hand));
          tension.set(strain);
          // The tongue bows a touch under the tab's nose before it gives.
          tongue.set(strain ** 2 * 3);
          return;
        }

        const gap = hand - tab.get();
        crack();

        if (shouldReduceMotion || !dragRef.current) {
          spring(tab, hand, { damping: 16, stiffness: 520 });
          return;
        }

        // Freed, the tab snaps up to meet the finger, overshooting a little.
        slack.jump(gap);
        animate(slack, 0, { damping: 15, stiffness: 520, type: "spring" });
        return;
      }

      tab.set(hand - slack.get());
      tongue.set(Math.max(tongue.get(), tongueFor(hand)));
    },
    [crack, shouldReduceMotion, slack, spring, tab, tension, tongue],
  );

  /** Let go: the tab is bent aluminium, so it only springs back a little. */
  const release = useCallback(() => {
    const hand = handRef.current;
    slack.stop();
    slack.jump(0);

    if (stateRef.current === "sealed" || hand < 7) {
      handRef.current = 0;
      tension.set(0);
      spring(tab, 0, { damping: 14, stiffness: 600 });

      if (stateRef.current === "sealed") {
        spring(tongue, 0);
      }

      if (hand > 0.5 && soundRef.current) {
        window.setTimeout(
          () => playClack(Math.min(1, 0.4 + hand / 20)),
          shouldReduceMotion ? 0 : 70,
        );
      }

      return;
    }

    const rest = hand - Math.min(7, hand * 0.12);
    handRef.current = rest;
    spring(tab, rest, { damping: 12, stiffness: 380 });
  }, [shouldReduceMotion, slack, spring, tab, tension, tongue]);

  /* Pointer ---------------------------------------------------------------- */

  const dragRef = useRef<{
    pointerId: number;
    startHand: number;
    startY: number;
  } | null>(null);

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) {
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    tab.stop();
    dragRef.current = {
      pointerId: event.pointerId,
      startHand: handRef.current,
      startY: event.clientY,
    };
    setPressed(true);
    getAudioContext();
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;

    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    applyHand(drag.startHand + (drag.startY - event.clientY) * DRAG_GAIN);
  }

  function endDrag(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;

    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    dragRef.current = null;
    setPressed(false);
    release();
  }

  /* Keyboard --------------------------------------------------------------- */

  const sweepRef = useRef<ReturnType<typeof animate> | null>(null);

  function sweepTo(target: number) {
    sweepRef.current?.stop();
    getAudioContext();

    if (shouldReduceMotion) {
      applyHand(target);
      release();
      return;
    }

    sweepRef.current = animate(handRef.current, target, {
      duration: 0.75,
      ease: [0.45, 0, 0.2, 1],
      onComplete: release,
      onUpdate: applyHand,
    });
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const steps: Record<string, number> = {
      ArrowDown: -8,
      ArrowLeft: -8,
      ArrowRight: 8,
      ArrowUp: 8,
    };

    if (event.key in steps) {
      event.preventDefault();
      sweepRef.current?.stop();
      getAudioContext();
      applyHand(handRef.current + steps[event.key]);

      return;
    }

    if (event.key === "Home") {
      event.preventDefault();
      sweepTo(0);
      return;
    }

    if (event.key === "End") {
      event.preventDefault();
      sweepTo(90);
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      sweepTo(handRef.current > 20 ? 0 : 90);
    }
  }

  function handleKeyUp(event: KeyboardEvent<HTMLDivElement>) {
    // A sealed tab can't stay bent: let go of the arrows and it drops back.
    if (
      stateRef.current === "sealed" &&
      (event.key === "ArrowUp" || event.key === "ArrowRight")
    ) {
      release();
    }
  }

  useEffect(() => () => sweepRef.current?.stop(), []);

  const valueText =
    state === "sealed"
      ? lift === 0
        ? "Sealed, tab flat"
        : `Sealed, tab straining at ${lift}%`
      : lift === 0
        ? "Open, tab pushed flat"
        : `Open, tab lifted ${lift}%`;

  return (
    <div className={cn("relative flex flex-col items-center", className)}>
      <motion.div
        aria-describedby={descriptionId}
        aria-label={`${tokens.name} can ring pull`}
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={lift}
        aria-valuetext={valueText}
        className={cn(
          "relative cursor-grab touch-none select-none rounded-[28px] outline-none focus-visible:ring-2 focus-visible:ring-grayscale-8 focus-visible:ring-offset-8 focus-visible:ring-offset-grayscale-1 dark:focus-visible:ring-offset-grayscale-2",
          pressed && "cursor-grabbing",
        )}
        onKeyDown={handleKeyDown}
        onKeyUp={handleKeyUp}
        onLostPointerCapture={endDrag}
        onPointerCancel={endDrag}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        role="slider"
        style={{ y: jolt }}
        tabIndex={0}
      >
        <CanScene
          flavour={tokens}
          live={state === "open"}
          opened={state === "open"}
          shadowTransform={shadowTransform}
          tabGlare={tabGlare}
          tabTransform={tabTransform}
          tension={tension}
          tongue={tongue}
        >
          {sprays.map((seed) => (
            <Spray flavour={tokens} key={seed} seed={seed} />
          ))}
        </CanScene>
      </motion.div>

      <span className="sr-only" id={descriptionId}>
        Drag up, or use the arrow keys, to lift the ring. Enter pulls it all the
        way, or pushes it back flat.
      </span>
      <span aria-live="polite" className="sr-only">
        {announcement}
      </span>
    </div>
  );
}
