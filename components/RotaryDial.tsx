"use client";

import {
  type AnimationPlaybackControls,
  animate,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
} from "motion/react";
import {
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type Ref,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { cn } from "@/helpers/classname-helper";

/*
 * Angles are in degrees, clockwise from twelve o'clock, in a 200 unit
 * viewBox centred on the dial's axle.
 */

/** Where the finger stop sits, at about four o'clock. */
const STOP_ANGLE = 122;
/** How far short of the stop a hole's centre is when a finger hits it. */
const STOP_CLEARANCE = 13;
/** How far the plate turns to dial a 1. Each digit after it adds a hole. */
const FIRST_TRAVEL = 48;
const HOLE_PITCH = 30;
const HOLE_RING = 64;
const HOLE_RADIUS = 11.5;
const PLATE_RADIUS = 86;
const CARD_RADIUS = 38;
/** The governor returns the plate at ten pulses a second, a hole per pulse. */
const RETURN_SPEED = HOLE_PITCH * 10;
/** How close to the stop counts as having reached it. */
const STOP_TOLERANCE = 6;
/** Less than this much turning and a press is a tap, which auto-dials. */
const TAP_SLOP = 3;
/** How far past the stop the plate gives under a hard pull. */
const STOP_GIVE = 1.6;

const DIGITS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 0] as const;

const LETTERS: Partial<Record<number, string>> = {
  0: "OPER",
  2: "ABC",
  3: "DEF",
  4: "GHI",
  5: "JKL",
  6: "MNO",
  7: "PRS",
  8: "TUV",
  9: "WXY",
};

function pulsesFor(digit: number) {
  return digit === 0 ? 10 : digit;
}

/** How far the plate turns from rest for a finger in this digit's hole. */
export function rotaryTravel(digit: number) {
  return FIRST_TRAVEL + (pulsesFor(digit) - 1) * HOLE_PITCH;
}

function restAngle(digit: number) {
  return STOP_ANGLE - STOP_CLEARANCE - rotaryTravel(digit);
}

/** The plate angle at which the k-th pulse of the way home breaks contact. */
function pulseAngle(pulse: number) {
  return FIRST_TRAVEL - HOLE_PITCH / 2 + (pulse - 1) * HOLE_PITCH;
}

function polar(angle: number, radius: number) {
  const radians = (angle * Math.PI) / 180;
  return { x: Math.sin(radians) * radius, y: -Math.cos(radians) * radius };
}

function wrapDegrees(degrees: number) {
  return ((((degrees + 180) % 360) + 360) % 360) - 180;
}

/* -------------------------------------------------------------------------- */
/* Sound                                                                       */
/* -------------------------------------------------------------------------- */

let sharedAudioContext: AudioContext | null = null;
const noiseBuffers = new Map<string, AudioBuffer>();

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

/** Decaying noise. Short and sharp is a contact; long and flat is a whirr. */
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
    data[index] =
      (Math.random() * 2 - 1) * (decay > 0 ? Math.exp(-t / decay) : 1);
  }

  noiseBuffers.set(key, buffer);
  return buffer;
}

type Thud = "pulse" | "stop" | "home";

const THUDS: Record<
  Thud,
  {
    decay: number;
    duration: number;
    frequency: number;
    gain: number;
    q: number;
  }
> = {
  home: { decay: 0.007, duration: 0.06, frequency: 520, gain: 0.7, q: 0.8 },
  pulse: { decay: 0.0018, duration: 0.02, frequency: 2900, gain: 0.5, q: 1.3 },
  stop: { decay: 0.005, duration: 0.05, frequency: 880, gain: 0.85, q: 0.9 },
};

function playThud(kind: Thud) {
  const context = getAudioContext();

  if (!context) {
    return;
  }

  const settings = THUDS[kind];
  const source = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const gain = context.createGain();

  source.buffer = noiseBuffer(context, settings.duration, settings.decay);
  source.playbackRate.value = 0.94 + Math.random() * 0.12;
  filter.type = "bandpass";
  filter.frequency.value = settings.frequency;
  filter.Q.value = settings.q;
  gain.gain.value = settings.gain;

  source.connect(filter).connect(gain).connect(context.destination);
  source.start();
}

/** The governor's flutter as the plate runs home. Returns a stop function. */
function playWhirr(seconds: number) {
  const context = getAudioContext();

  if (!context) {
    return () => {};
  }

  const now = context.currentTime;
  const source = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const gain = context.createGain();
  const flutter = context.createOscillator();
  const flutterDepth = context.createGain();

  source.buffer = noiseBuffer(context, 1, 0);
  source.loop = true;
  filter.type = "bandpass";
  filter.frequency.value = 1500;
  filter.Q.value = 2.4;
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.055, now + 0.04);
  gain.gain.setValueAtTime(0.055, now + Math.max(0.05, seconds - 0.04));
  gain.gain.linearRampToValueAtTime(0, now + seconds);
  flutter.frequency.value = 46;
  flutterDepth.gain.value = 0.025;

  flutter.connect(flutterDepth).connect(gain.gain);
  source.connect(filter).connect(gain).connect(context.destination);
  source.start(now);
  flutter.start(now);
  source.stop(now + seconds + 0.05);
  flutter.stop(now + seconds + 0.05);

  return () => {
    const at = context.currentTime;
    gain.gain.cancelScheduledValues(at);
    gain.gain.setTargetAtTime(0, at, 0.01);
    source.stop(at + 0.05);
    flutter.stop(at + 0.05);
  };
}

function buzz(duration: number) {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    navigator.vibrate?.(duration);
  }
}

/* -------------------------------------------------------------------------- */
/* Drawing                                                                     */
/* -------------------------------------------------------------------------- */

const FINGER_STOP_PATH =
  "M -3.4 -97 L 3.4 -97 L 2.3 -56.5 Q 0 -52.2 -2.3 -56.5 Z";

type DialArtProps = {
  /** The hole with a finger in it. */
  activeDigit?: number | null;
  cardNumber?: string;
  cardTitle?: string;
  /** The hole under the pointer. */
  hoverDigit?: number | null;
  /** Props for the turning layer and the counter-turning light on it. */
  plate?: { className?: string; ref?: Ref<SVGGElement>; style?: CSSProperties };
  light?: { className?: string; ref?: Ref<SVGGElement>; style?: CSSProperties };
};

/**
 * The dial is the same ivory and black in both themes, like the object it is.
 * Only the plate turns: the printed digits, the card and the stop stay put.
 */
function DialArt({
  activeDigit = null,
  cardNumber,
  cardTitle = "dqnamo",
  hoverDigit = null,
  light,
  plate,
}: DialArtProps) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const url = (name: string) => `url(#${id}-${name})`;

  return (
    <svg
      aria-hidden="true"
      className="block size-full overflow-visible"
      viewBox="-100 -100 200 200"
    >
      <defs>
        <linearGradient id={`${id}-rim`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#fffdf7" />
          <stop offset="1" stopColor="#c4baa4" />
        </linearGradient>
        <radialGradient cx="50%" cy="30%" id={`${id}-housing`} r="75%">
          <stop offset="0" stopColor="#fbf7ee" />
          <stop offset="0.7" stopColor="#e9e2d2" />
          <stop offset="1" stopColor="#d2c8b2" />
        </radialGradient>
        <radialGradient id={`${id}-well`} r="50%">
          <stop offset="0.82" stopColor="#f1ebdd" />
          <stop offset="1" stopColor="#d8cfbb" />
        </radialGradient>
        <linearGradient id={`${id}-plate`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#3a3a40" />
          <stop offset="0.5" stopColor="#161618" />
          <stop offset="1" stopColor="#09090a" />
        </linearGradient>
        <linearGradient id={`${id}-gloss`} x1="0.1" x2="0.65" y1="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.2" />
          <stop offset="0.42" stopColor="#fff" stopOpacity="0.04" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0" />
          <stop offset="1" stopColor="#fff" stopOpacity="0.06" />
        </linearGradient>
        <radialGradient id={`${id}-hole-shade`} r="50%">
          <stop offset="0.6" stopColor="#2a2214" stopOpacity="0" />
          <stop offset="1" stopColor="#2a2214" stopOpacity="0.42" />
        </radialGradient>
        <linearGradient id={`${id}-chrome`} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#7d8087" />
          <stop offset="0.35" stopColor="#f6f7f9" />
          <stop offset="0.55" stopColor="#adb0b7" />
          <stop offset="0.8" stopColor="#eef0f3" />
          <stop offset="1" stopColor="#71747a" />
        </linearGradient>
        <linearGradient id={`${id}-chrome-ring`} x1="0" x2="0.4" y1="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.5" stopColor="#8e9197" />
          <stop offset="1" stopColor="#e6e8eb" />
        </linearGradient>
        <radialGradient cx="50%" cy="40%" id={`${id}-card`} r="60%">
          <stop offset="0" stopColor="#fffdf8" />
          <stop offset="1" stopColor="#efe9dc" />
        </radialGradient>
        <mask
          height="200"
          id={`${id}-plate-mask`}
          maskUnits="userSpaceOnUse"
          width="200"
          x="-100"
          y="-100"
        >
          <circle fill="#fff" r={PLATE_RADIUS} />
          <circle fill="#000" r={CARD_RADIUS + 1.5} />
          {DIGITS.map((digit) => {
            const point = polar(restAngle(digit), HOLE_RING);
            return (
              <circle
                cx={point.x}
                cy={point.y}
                fill="#000"
                key={digit}
                r={HOLE_RADIUS}
              />
            );
          })}
        </mask>
        <filter height="140%" id={`${id}-soft`} width="140%" x="-20%" y="-20%">
          <feGaussianBlur stdDeviation="1.6" />
        </filter>
      </defs>

      {/* Housing, and the ring well the digits are printed in. */}
      <circle fill={url("rim")} r="99.5" />
      <circle fill={url("housing")} r="97" />
      <circle fill={url("well")} r="92" />
      <circle
        fill="none"
        r="92"
        stroke="#3a2f1a"
        strokeOpacity="0.16"
        strokeWidth="0.8"
      />

      {DIGITS.map((digit) => {
        const point = polar(restAngle(digit), HOLE_RING);
        const letters = LETTERS[digit];
        return (
          <g key={digit} transform={`translate(${point.x} ${point.y})`}>
            <text
              className="font-sans"
              fill="#1e1b15"
              fontSize="11"
              fontWeight="600"
              textAnchor="middle"
              y={letters ? 1.6 : 3.9}
            >
              {digit}
            </text>
            {letters ? (
              <text
                className="font-mono"
                fill="#7a705c"
                fontSize="3.3"
                fontWeight="600"
                letterSpacing="0.4"
                textAnchor="middle"
                y="6.9"
              >
                {letters}
              </text>
            ) : null}
          </g>
        );
      })}

      {/* The plate's shadow on the ring well. It is round, so it need not turn. */}
      <circle
        cy="2.2"
        fill="none"
        filter={url("soft")}
        r={PLATE_RADIUS - 0.5}
        stroke="#2a2214"
        strokeOpacity="0.4"
        strokeWidth="3"
      />

      <g {...plate}>
        {DIGITS.map((digit) => {
          const point = polar(restAngle(digit), HOLE_RING);
          return (
            <circle
              cx={point.x}
              cy={point.y}
              fill={url("hole-shade")}
              key={digit}
              r={HOLE_RADIUS}
            />
          );
        })}

        <g mask={url("plate-mask")}>
          {/* The light does not turn with the plate, so undo the turn. */}
          <g {...light}>
            <circle fill={url("plate")} r={PLATE_RADIUS} />
            <circle fill={url("gloss")} r={PLATE_RADIUS} />
          </g>
        </g>

        <circle
          fill="none"
          r={PLATE_RADIUS - 0.4}
          stroke="#fff"
          strokeOpacity="0.13"
          strokeWidth="0.8"
        />
        <circle
          fill="none"
          r={CARD_RADIUS + 1.9}
          stroke="#fff"
          strokeOpacity="0.1"
          strokeWidth="0.6"
        />

        {DIGITS.map((digit) => {
          const point = polar(restAngle(digit), HOLE_RING);
          const active = digit === activeDigit;
          const hovered = digit === hoverDigit && !active;
          return (
            <g key={digit}>
              <circle
                cx={point.x}
                cy={point.y}
                fill="none"
                r={HOLE_RADIUS + 0.35}
                stroke="#fff"
                strokeOpacity={hovered ? 0.5 : 0.16}
                strokeWidth={hovered ? 1 : 0.7}
                style={{
                  transition: "stroke-opacity 160ms, stroke-width 160ms",
                }}
              />
              {active ? (
                <>
                  <circle
                    cx={point.x}
                    cy={point.y}
                    fill="#2a2214"
                    fillOpacity="0.14"
                    r={HOLE_RADIUS - 1.2}
                  />
                  <circle
                    cx={point.x}
                    cy={point.y}
                    fill="none"
                    r={HOLE_RADIUS - 0.6}
                    stroke="#ff8a3d"
                    strokeWidth="1.3"
                  />
                </>
              ) : null}
            </g>
          );
        })}
      </g>

      {/* The number card under its chrome retaining ring and clear cover. */}
      <circle fill={url("card")} r={CARD_RADIUS} />
      <text
        className="font-mono"
        fill="#8a7f6a"
        fontSize="3.6"
        fontWeight="600"
        letterSpacing="0.9"
        textAnchor="middle"
        y="-15"
      >
        KITCHEN
      </text>
      <line
        stroke="#c33b2a"
        strokeOpacity="0.55"
        strokeWidth="0.5"
        x1="-24"
        x2="24"
        y1="-9.5"
        y2="-9.5"
      />
      <text
        className="font-pirata"
        fill="#1e1b15"
        fontSize="15"
        textAnchor="middle"
        y="4.6"
      >
        {cardTitle}
      </text>
      <line
        stroke="#c33b2a"
        strokeOpacity="0.55"
        strokeWidth="0.5"
        x1="-24"
        x2="24"
        y1="9.5"
        y2="9.5"
      />
      {cardNumber ? (
        <text
          className="font-mono"
          fill="#3d362a"
          fontSize="4.6"
          fontWeight="600"
          letterSpacing="0.6"
          textAnchor="middle"
          y="18"
        >
          {cardNumber}
        </text>
      ) : null}
      <path
        d="M -27 -21 A 34 34 0 0 1 8 -33.5"
        fill="none"
        stroke="#fff"
        strokeLinecap="round"
        strokeOpacity="0.85"
        strokeWidth="2.4"
      />
      <circle
        fill="none"
        r={CARD_RADIUS}
        stroke={url("chrome-ring")}
        strokeWidth="2.8"
      />

      {/* The finger stop, screwed to the housing, reaching over the plate. */}
      <g transform={`rotate(${STOP_ANGLE})`}>
        <path
          d={FINGER_STOP_PATH}
          fill="#000"
          fillOpacity="0.45"
          filter={url("soft")}
          transform="translate(-1.6 1)"
        />
        <path
          d={FINGER_STOP_PATH}
          fill={url("chrome")}
          stroke="#000"
          strokeOpacity="0.3"
          strokeWidth="0.4"
        />
        <circle
          cy="-93.2"
          fill={url("chrome-ring")}
          r="2.3"
          stroke="#000"
          strokeOpacity="0.3"
          strokeWidth="0.4"
        />
        <line
          stroke="#000"
          strokeOpacity="0.35"
          strokeWidth="0.5"
          x1="-1.4"
          x2="1.4"
          y1="-93.2"
          y2="-93.2"
        />
      </g>
    </svg>
  );
}

/** A decorative, non-interactive dial for thumbnails and previews. */
export function RotaryDialFace({
  activeDigit,
  className,
  lightClassName,
  plateClassName,
  rotation,
  size = 96,
}: {
  activeDigit?: number | null;
  className?: string;
  /** Classes for the counter-turning light, the inverse of `plateClassName`. */
  lightClassName?: string;
  /** Classes for the turning plate, e.g. to wind it on hover. */
  plateClassName?: string;
  /** Fixed plate angle. Leave unset to turn it with `plateClassName`. */
  rotation?: number;
  size?: number;
}) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "rounded-full shadow-[0_2px_3px_rgb(0_0_0_/_14%),0_8px_18px_rgb(0_0_0_/_14%)]",
        className,
      )}
      style={{ height: size, width: size }}
    >
      <DialArt
        activeDigit={activeDigit}
        light={{
          className: lightClassName,
          style:
            rotation === undefined ? undefined : { rotate: `${-rotation}deg` },
        }}
        plate={{
          className: plateClassName,
          style:
            rotation === undefined ? undefined : { rotate: `${rotation}deg` },
        }}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* The dial                                                                    */
/* -------------------------------------------------------------------------- */

export type RotaryDialProps = {
  /** Accessible name for the dial. */
  label?: string;
  /** Called on each pulse as the plate runs home: 1, 2, 3… up to 10 for a 0. */
  onPulse?: (pulse: number, digit: number) => void;
  /** Called once the plate is home and the whole digit has been sent. */
  onDial?: (digit: number) => void;
  /** Called on Backspace or Delete. */
  onErase?: () => void;
  disabled?: boolean;
  /** Play synthesised pulses, the stop, and the governor's whirr. */
  sound?: boolean;
  /** Diameter in pixels. It shrinks to fit narrower containers. */
  size?: number;
  /** Small print on the number card. */
  cardNumber?: string;
  cardTitle?: string;
  className?: string;
};

type Drag = {
  centreX: number;
  centreY: number;
  digit: number;
  lastAngle: number;
  moved: number;
  pointerId: number;
  raw: number;
};

type Phase = "idle" | "drag" | "wind" | "return";

/**
 * A pulse-dialling rotary dial. Put a finger in a hole, pull the plate round
 * to the stop and let go: the plate runs home at a governed ten pulses a
 * second and calls `onPulse` for each, then `onDial` with the digit. Let go
 * short of the stop and it runs home without dialling anything.
 */
export function RotaryDial({
  cardNumber,
  cardTitle,
  className,
  disabled = false,
  label = "Rotary dial",
  onDial,
  onErase,
  onPulse,
  size = 280,
  sound = true,
}: RotaryDialProps) {
  const shouldReduceMotion = useReducedMotion() ?? false;
  const hintId = useId();
  const rotation = useMotionValue(0);
  const plateRef = useRef<SVGGElement>(null);
  const lightRef = useRef<SVGGElement>(null);
  const phaseRef = useRef<Phase>("idle");
  const dragRef = useRef<Drag | null>(null);
  const queueRef = useRef<number[]>([]);
  const controlsRef = useRef<AnimationPlaybackControls | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopWhirrRef = useRef<(() => void) | null>(null);
  const [activeDigit, setActiveDigit] = useState<number | null>(null);
  const [hoverDigit, setHoverDigit] = useState<number | null>(null);
  const [grabbing, setGrabbing] = useState(false);

  // Animation callbacks outlive renders, so read the latest props from here.
  const latest = useRef({
    disabled,
    onDial,
    onPulse,
    shouldReduceMotion,
    sound,
  });
  latest.current = { disabled, onDial, onPulse, shouldReduceMotion, sound };

  useMotionValueEvent(rotation, "change", (value) => {
    plateRef.current?.setAttribute("transform", `rotate(${value})`);
    lightRef.current?.setAttribute("transform", `rotate(${-value})`);
  });

  useEffect(
    () => () => {
      controlsRef.current?.stop();
      stopWhirrRef.current?.();

      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    if (disabled) {
      queueRef.current = [];
    }
  }, [disabled]);

  function hitStop() {
    if (latest.current.sound) {
      playThud("stop");
    }

    buzz(14);
  }

  function next() {
    const queued = queueRef.current.shift();

    if (queued !== undefined && !latest.current.disabled) {
      wind(queued);
    }
  }

  function arriveHome(digit: number | null) {
    phaseRef.current = "idle";
    setActiveDigit(null);

    if (digit !== null) {
      latest.current.onDial?.(digit);
    }

    timerRef.current = setTimeout(next, 140);
  }

  /** Run home at the governor's speed, sending a pulse per hole passed. */
  function runHome(digit: number | null) {
    const from = rotation.get();
    phaseRef.current = "return";

    if (latest.current.shouldReduceMotion || from < 0.5) {
      rotation.set(0);

      if (digit !== null && latest.current.sound) {
        playThud("home");
      }

      arriveHome(digit);
      return;
    }

    const seconds = from / RETURN_SPEED;
    const total = digit === null ? 0 : pulsesFor(digit);
    let pending = total;

    if (latest.current.sound) {
      stopWhirrRef.current = playWhirr(seconds);
    }

    controlsRef.current = animate(rotation, 0, {
      duration: seconds,
      ease: "linear",
      onComplete: () => {
        stopWhirrRef.current = null;

        if (latest.current.sound) {
          playThud("home");
        }

        // Knock against the rest and bounce off it, just a little.
        controlsRef.current = animate(rotation, 0, {
          damping: 22,
          stiffness: 1400,
          type: "spring",
          velocity: -Math.min(160, from * 0.9),
        });
        arriveHome(digit);
      },
      onUpdate: (value) => {
        while (digit !== null && pending > 0 && value <= pulseAngle(pending)) {
          pending -= 1;

          if (latest.current.sound) {
            playThud("pulse");
          }

          buzz(6);
          latest.current.onPulse?.(total - pending, digit);
        }
      },
    });
  }

  /** Wind a digit round to the stop on its own, for taps and typed digits. */
  function wind(digit: number) {
    phaseRef.current = "wind";
    setActiveDigit(digit);
    getAudioContext();

    if (latest.current.shouldReduceMotion) {
      runHome(digit);
      return;
    }

    const travel = rotaryTravel(digit);
    controlsRef.current = animate(rotation, travel, {
      duration: 0.16 + travel / 720,
      ease: [0.45, 0, 0.3, 1],
      onComplete: () => {
        hitStop();
        timerRef.current = setTimeout(() => runHome(digit), 110);
      },
    });
  }

  /** Dial a digit, or queue it behind the one already running home. */
  function dial(digit: number) {
    if (disabled) {
      return;
    }

    if (phaseRef.current === "idle") {
      wind(digit);
    } else if (queueRef.current.length < 12) {
      queueRef.current.push(digit);
    }
  }

  function localPoint(event: PointerEvent<HTMLDivElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const centreX = bounds.left + bounds.width / 2;
    const centreY = bounds.top + bounds.height / 2;
    const scale = 200 / bounds.width;
    const x = (event.clientX - centreX) * scale;
    const y = (event.clientY - centreY) * scale;

    return {
      angle: (Math.atan2(x, -y) * 180) / Math.PI,
      centreX,
      centreY,
      radius: Math.hypot(x, y),
    };
  }

  /** Which hole, if any, is under a point, with the plate at rest. */
  function digitAt(angle: number, radius: number) {
    if (Math.abs(radius - HOLE_RING) > HOLE_RADIUS + 3) {
      return null;
    }

    return (
      DIGITS.find(
        (digit) =>
          Math.abs(wrapDegrees(angle - restAngle(digit))) < HOLE_PITCH / 2,
      ) ?? null
    );
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || disabled || phaseRef.current !== "idle") {
      return;
    }

    const point = localPoint(event);
    const digit = digitAt(point.angle, point.radius);

    if (digit === null) {
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    getAudioContext();
    phaseRef.current = "drag";
    dragRef.current = {
      centreX: point.centreX,
      centreY: point.centreY,
      digit,
      lastAngle: point.angle,
      moved: 0,
      pointerId: event.pointerId,
      raw: 0,
    };
    setActiveDigit(digit);
    setGrabbing(true);
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;

    if (!drag) {
      if (phaseRef.current === "idle" && !disabled) {
        const point = localPoint(event);
        setHoverDigit(digitAt(point.angle, point.radius));
      }

      return;
    }

    if (drag.pointerId !== event.pointerId) {
      return;
    }

    const point = localPoint(event);

    // Too close to the axle and the angle swings wildly; wait for a lever.
    if (point.radius < 22) {
      return;
    }

    const travel = rotaryTravel(drag.digit);
    const delta = wrapDegrees(point.angle - drag.lastAngle);
    const wasAtStop = drag.raw >= travel;

    drag.lastAngle = point.angle;
    drag.moved += Math.abs(delta);
    // The plate only turns one way, and only as far as the stop, but the hand
    // can keep pulling a little either side without losing its place.
    drag.raw = Math.min(Math.max(drag.raw + delta, -30), travel + 40);

    const over = drag.raw - travel;
    rotation.set(
      over > 0
        ? travel + STOP_GIVE * (1 - Math.exp(-over / 8))
        : Math.max(0, drag.raw),
    );

    if (!wasAtStop && drag.raw >= travel) {
      hitStop();
    }
  }

  function endDrag(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;

    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    dragRef.current = null;
    setGrabbing(false);

    if (drag.moved < TAP_SLOP) {
      rotation.set(0);
      wind(drag.digit);
      return;
    }

    const reached = rotation.get() >= rotaryTravel(drag.digit) - STOP_TOLERANCE;
    runHome(reached ? drag.digit : null);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.metaKey || event.ctrlKey || event.altKey) {
      return;
    }

    if (/^[0-9]$/.test(event.key)) {
      event.preventDefault();
      dial(Number(event.key));
      return;
    }

    if (event.key === "Backspace" || event.key === "Delete") {
      event.preventDefault();
      onErase?.();
    }
  }

  return (
    // biome-ignore lint/a11y/useSemanticElements: a fieldset would bring a border and legend the dial has no use for.
    <div
      aria-describedby={hintId}
      aria-disabled={disabled || undefined}
      aria-label={label}
      className={cn(
        "relative aspect-square max-w-full touch-none select-none rounded-full outline-none",
        "shadow-[0_1px_2px_rgb(0_0_0_/_16%),0_10px_24px_rgb(0_0_0_/_14%),0_32px_64px_rgb(0_0_0_/_12%)] dark:shadow-[0_0_0_1px_rgb(255_255_255_/_6%),0_10px_24px_rgb(0_0_0_/_40%),0_32px_64px_rgb(0_0_0_/_35%)]",
        "focus-visible:ring-2 focus-visible:ring-[#ff8a3d] focus-visible:ring-offset-4 focus-visible:ring-offset-grayscale-1 dark:focus-visible:ring-offset-grayscale-2",
        grabbing
          ? "cursor-grabbing"
          : hoverDigit !== null && !disabled
            ? "cursor-grab"
            : "cursor-default",
        className,
      )}
      onKeyDown={handleKeyDown}
      onLostPointerCapture={endDrag}
      onPointerCancel={endDrag}
      onPointerDown={handlePointerDown}
      onPointerLeave={() => setHoverDigit(null)}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      role="group"
      style={{ width: size }}
      tabIndex={disabled ? -1 : 0}
    >
      <DialArt
        activeDigit={activeDigit}
        cardNumber={cardNumber}
        cardTitle={cardTitle}
        hoverDigit={grabbing ? null : hoverDigit}
        light={{ ref: lightRef }}
        plate={{ ref: plateRef }}
      />

      <span className="sr-only" id={hintId}>
        Type a digit to dial it, or press Backspace to erase one.
      </span>
      {/* Screen readers can press the holes directly. */}
      <span className="sr-only">
        {DIGITS.map((digit) => (
          <button
            disabled={disabled}
            key={digit}
            onClick={() => dial(digit)}
            tabIndex={-1}
            type="button"
          >
            Dial {digit}
          </button>
        ))}
      </span>
    </div>
  );
}
