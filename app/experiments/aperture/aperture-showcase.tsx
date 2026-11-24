"use client";

import {
  ApertureIcon,
  SpeakerHighIcon,
  SpeakerSlashIcon,
} from "@phosphor-icons/react/dist/ssr";
import {
  animate,
  type MotionValue,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from "motion/react";
import { useId, useRef, useState } from "react";
import {
  Aperture,
  type ApertureHandle,
  FULL_STOPS,
  irisOpeningPoints,
} from "@/components/Aperture";

const stageGridStyle = {
  backgroundImage:
    "linear-gradient(var(--color-grayscale-4) 1px, transparent 1px), linear-gradient(90deg, var(--color-grayscale-4) 1px, transparent 1px)",
  backgroundSize: "24px 24px",
  maskImage: "radial-gradient(circle at center, black, transparent 76%)",
};

/** Aperture priority: every stop down doubles the time the shutter stays open. */
const SHUTTER_SPEEDS = [2000, 1000, 500, 250, 125, 60, 30, 15] as const;
const FRAMES_PER_ROLL = 36;
const BLADES = 7;

/** Street lights behind the subject, far out of focus. */
const LIGHTS = [
  { color: "#ffb35c", size: 1, x: 32, y: 46 },
  { color: "#ffd38a", size: 0.8, x: 62, y: 70 },
  { color: "#ff8a4c", size: 1.15, x: 96, y: 34 },
  { color: "#9fd0ff", size: 0.75, x: 118, y: 82 },
  { color: "#ffc76e", size: 0.9, x: 196, y: 40 },
  { color: "#ff9e6b", size: 1.2, x: 232, y: 74 },
  { color: "#b9e2ff", size: 0.7, x: 262, y: 30 },
  { color: "#ffcf7a", size: 1, x: 280, y: 96 },
  { color: "#ffe2a8", size: 0.65, x: 150, y: 24 },
  { color: "#ff7b5c", size: 0.85, x: 14, y: 104 },
  { color: "#ffd38a", size: 0.6, x: 176, y: 98 },
] as const;

function shapePath(openness: number) {
  // Even stopped right down a light is a point, not nothing.
  const scale = 1.2 + openness * 15;
  const points = irisOpeningPoints(Math.max(openness, 0.12), BLADES, scale);
  return `${points
    .map(
      ([x, y], index) =>
        `${index === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`,
    )
    .join(" ")} Z`;
}

function Viewfinder({
  blackout,
  frames,
  openness,
  stopIndex,
}: {
  blackout: MotionValue<number>;
  frames: number;
  openness: MotionValue<number>;
  stopIndex: number;
}) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const bokeh = useTransform(openness, shapePath);
  // Bokeh rounds off wide open, and sharpens into the blades' polygon closed.
  const rounding = useTransform(openness, (value) => value * 5);
  // The same light through a smaller hole: smaller, but just as bright.
  const glow = useTransform(openness, (value) => 0.5 + (1 - value) * 0.45);
  const haze = useTransform(openness, (value) => value * 3.2);

  return (
    <figure className="w-[300px] max-w-full overflow-hidden rounded-[14px] bg-[#09090b] p-2 shadow-[0_0_0_1px_rgb(0_0_0_/_40%),0_3px_6px_rgb(0_0_0_/_18%),0_16px_36px_rgb(0_0_0_/_16%)] dark:shadow-[0_0_0_1px_rgb(255_255_255_/_6%),0_16px_36px_rgb(0_0_0_/_40%)]">
      <div className="relative overflow-hidden rounded-[7px]">
        <svg
          aria-hidden="true"
          className="block h-auto w-full"
          viewBox="0 0 300 200"
        >
          <defs>
            <linearGradient id={`${id}-sky`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="#0d1124" />
              <stop offset="0.7" stopColor="#1e1630" />
              <stop offset="1" stopColor="#2a1a2a" />
            </linearGradient>
            <linearGradient id={`${id}-cup`} x1="0" x2="1" y1="0" y2="0">
              <stop offset="0" stopColor="#5a524a" />
              <stop offset="0.45" stopColor="#d9d1c4" />
              <stop offset="0.75" stopColor="#f3ece0" />
              <stop offset="1" stopColor="#8d8478" />
            </linearGradient>
            <linearGradient id={`${id}-table`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="#3b2a22" />
              <stop offset="1" stopColor="#140e0b" />
            </linearGradient>
            <filter
              height="1.6"
              id={`${id}-defocus`}
              width="1.6"
              x="-0.3"
              y="-0.3"
            >
              <motion.feGaussianBlur stdDeviation={haze} />
            </filter>
            <motion.path
              d={bokeh}
              fill="currentColor"
              id={`${id}-bokeh`}
              stroke="currentColor"
              strokeLinejoin="round"
              strokeWidth={rounding}
            />
          </defs>

          <rect fill={`url(#${id}-sky)`} height="200" width="300" />

          {/* The far side of the street, softened by the shallow focus. */}
          <g filter={`url(#${id}-defocus)`} opacity="0.9">
            <path
              d="M0 118 V70 H34 V52 H70 V86 H104 V40 H150 V78 H178 V58 H222 V92 H250 V48 H300 V118 Z"
              fill="#151829"
            />
            <rect
              fill="#ffcf8a"
              height="5"
              opacity="0.35"
              width="6"
              x="44"
              y="62"
            />
            <rect
              fill="#ffcf8a"
              height="5"
              opacity="0.25"
              width="6"
              x="118"
              y="54"
            />
            <rect
              fill="#9fd0ff"
              height="5"
              opacity="0.25"
              width="6"
              x="190"
              y="70"
            />
            <rect
              fill="#ffcf8a"
              height="5"
              opacity="0.3"
              width="6"
              x="268"
              y="60"
            />
          </g>

          <motion.g style={{ mixBlendMode: "screen", opacity: glow }}>
            {LIGHTS.map((light) => (
              <use
                color={light.color}
                href={`#${id}-bokeh`}
                key={`${light.x}-${light.y}`}
                opacity="0.85"
                transform={`translate(${light.x} ${light.y}) scale(${light.size})`}
              />
            ))}
          </motion.g>

          {/* The subject, in focus at every stop. */}
          <rect fill={`url(#${id}-table)`} height="44" width="300" y="156" />
          <rect fill="#5a4032" height="1" opacity="0.8" width="300" y="156" />
          <ellipse
            cx="150"
            cy="160"
            fill="#000"
            opacity="0.45"
            rx="30"
            ry="4"
          />
          <path
            d="M176 124 C192 124 192 148 174 148"
            fill="none"
            stroke="#c9c0b2"
            strokeLinecap="round"
            strokeWidth="5"
          />
          <path
            d="M124 112 H178 V150 C178 156 172 160 166 160 H136 C130 160 124 156 124 150 Z"
            fill={`url(#${id}-cup)`}
          />
          <ellipse cx="151" cy="112" fill="#e9e2d6" rx="27" ry="4" />
          <ellipse cx="151" cy="112.6" fill="#2a1710" rx="24" ry="3" />
          <path
            d="M146 104 C142 96 152 92 147 84 M156 102 C152 94 162 90 157 80"
            fill="none"
            opacity="0.18"
            stroke="#fff"
            strokeLinecap="round"
            strokeWidth="2"
          />

          {/* Focus brackets and the spot meter circle. */}
          <g fill="none" opacity="0.75" stroke="#e8f7ec" strokeWidth="1">
            <path d="M112 96 v-8 h8 M190 96 v-8 h-8 M112 156 v8 h8 M190 156 v8 h-8" />
            <circle cx="151" cy="126" r="6" />
          </g>
        </svg>

        {/* The mirror swings up for the exposure, and the finder goes dark. */}
        <motion.div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-black"
          style={{ opacity: blackout }}
        />
      </div>

      <figcaption className="mt-2 flex items-center justify-between px-1 font-medium font-mono text-[#7dffa0] text-[11px] tabular-nums tracking-[0.04em] [text-shadow:0_0_6px_rgb(125_255_160_/_45%)]">
        <span>1/{SHUTTER_SPEEDS[stopIndex]}</span>
        <span>F{FULL_STOPS[stopIndex]}</span>
        <span>ISO 100</span>
        <span>
          <span aria-hidden="true">[{frames}]</span>
          <span className="sr-only">{frames} frames left</span>
        </span>
      </figcaption>
    </figure>
  );
}

export function ApertureShowcase() {
  const shouldReduceMotion = useReducedMotion();
  const lensRef = useRef<ApertureHandle>(null);
  const [sound, setSound] = useState(true);
  const [fNumber, setFNumber] = useState<number>(2.8);
  const [frames, setFrames] = useState(FRAMES_PER_ROLL);
  const [exposing, setExposing] = useState(false);
  const openness = useMotionValue(1);
  const blackout = useMotionValue(0);
  const stopIndex = Math.max(
    0,
    (FULL_STOPS as readonly number[]).indexOf(fNumber),
  );

  async function release() {
    if (exposing || !lensRef.current) {
      return;
    }

    setExposing(true);
    blackout.set(1);
    await lensRef.current.release(1 / SHUTTER_SPEEDS[stopIndex]);
    setFrames((current) => (current <= 1 ? FRAMES_PER_ROLL : current - 1));

    if (shouldReduceMotion) {
      blackout.set(0);
    } else {
      await animate(blackout, 0, { duration: 0.22, ease: "easeOut" });
    }

    setExposing(false);
  }

  return (
    <div className="w-full overflow-hidden rounded-[13px] border border-grayscale-3 bg-grayscale-1 small-shadow dark:border-grayscale-4 dark:bg-grayscale-3 dark:shadow-none">
      <div className="relative flex min-h-[500px] flex-col items-center justify-center overflow-hidden bg-grayscale-1 px-6 py-12 dark:bg-grayscale-2 max-[520px]:px-4">
        <div
          aria-hidden="true"
          className="absolute inset-0 opacity-[0.38]"
          style={stageGridStyle}
        />

        <button
          aria-label={sound ? "Mute lens sounds" : "Play lens sounds"}
          aria-pressed={sound}
          className="absolute top-3 right-3 z-[1] flex size-8 items-center justify-center rounded-lg border border-grayscale-4 bg-grayscale-1 text-grayscale-11 transition-colors hover:bg-grayscale-3 hover:text-grayscale-12 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-grayscale-7 dark:bg-grayscale-3 dark:hover:bg-grayscale-4"
          onClick={() => setSound((current) => !current)}
          type="button"
        >
          {sound ? (
            <SpeakerHighIcon size={15} weight="bold" />
          ) : (
            <SpeakerSlashIcon size={15} weight="bold" />
          )}
        </button>

        <div className="relative z-[1] flex flex-wrap items-center justify-center gap-x-12 gap-y-10">
          <Aperture
            blades={BLADES}
            onIrisChange={(value) => openness.set(value)}
            onValueChange={setFNumber}
            ref={lensRef}
            size={248}
            sound={sound}
            value={fNumber}
          />

          <div className="flex flex-col items-center gap-5">
            <Viewfinder
              blackout={blackout}
              frames={frames}
              openness={openness}
              stopIndex={stopIndex}
            />

            <button
              className="group/shutter flex items-center gap-2.5 rounded-full py-1 pr-4 pl-1 font-medium text-grayscale-11 text-xs transition-colors hover:text-grayscale-12 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-grayscale-7"
              disabled={exposing}
              onClick={release}
              type="button"
            >
              <span className="relative grid size-10 place-items-center rounded-full bg-[radial-gradient(circle_at_50%_30%,#f4f4f2,#a9a9a6_60%,#7c7c79)] shadow-[0_0_0_1px_rgb(0_0_0_/_35%),0_2px_4px_rgb(0_0_0_/_25%),inset_0_1px_0_rgb(255_255_255_/_80%)]">
                <span className="size-6 rounded-full bg-[radial-gradient(circle_at_50%_30%,#ff6a4d,#d6331c_60%,#9c1f0e)] shadow-[0_2px_2px_rgb(0_0_0_/_35%),inset_0_1px_0_rgb(255_255_255_/_45%)] transition-transform duration-100 group-active/shutter:translate-y-px group-active/shutter:scale-[0.94] group-disabled/shutter:translate-y-px group-disabled/shutter:scale-[0.94] motion-reduce:transition-none" />
              </span>
              Release shutter
            </button>
          </div>
        </div>

        <p className="relative z-[1] mt-10 flex items-center gap-1.5 text-center text-grayscale-9 text-xs">
          <ApertureIcon aria-hidden size={13} weight="bold" />
          Turn the ring with a drag, a scroll or the arrow keys.
        </p>
      </div>
    </div>
  );
}
