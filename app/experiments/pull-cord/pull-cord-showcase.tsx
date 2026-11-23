"use client";

import {
  SpeakerHighIcon,
  SpeakerSlashIcon,
} from "@phosphor-icons/react/dist/ssr";
import {
  motion,
  type TargetAndTransition,
  useReducedMotion,
} from "motion/react";
import { useState } from "react";
import { PullCord } from "@/components/PullCord";

const stageGridStyle = {
  backgroundImage:
    "linear-gradient(var(--color-grayscale-4) 1px, transparent 1px), linear-gradient(90deg, var(--color-grayscale-4) 1px, transparent 1px)",
  backgroundSize: "24px 24px",
  maskImage: "radial-gradient(circle at center, black, transparent 76%)",
};

/** A clear pear-shaped bulb on a fabric flex, lit from its filament. */
function PendantBulb({ on }: { on: boolean }) {
  const shouldReduceMotion = useReducedMotion();
  // Filaments flicker as they catch, and fade slowly as they cool.
  const glow: TargetAndTransition = on
    ? {
        opacity: shouldReduceMotion ? 1 : [0, 0.75, 0.45, 1],
        transition: shouldReduceMotion
          ? { duration: 0 }
          : { duration: 0.26, times: [0, 0.3, 0.55, 1] },
      }
    : {
        opacity: 0,
        transition: { duration: shouldReduceMotion ? 0 : 0.6, ease: "easeOut" },
      };

  return (
    <div aria-hidden="true" className="flex flex-col items-center">
      {/* Ceiling rose */}
      <div className="h-[9px] w-[38px] rounded-b-[10px] bg-[linear-gradient(180deg,#fdfcf9,#e3dfd8)] shadow-[0_0_0_0.5px_rgb(0_0_0_/_0.14),0_2px_4px_rgb(0_0_0_/_0.12)]" />
      {/* Twisted fabric flex */}
      <div className="h-[118px] w-[3px] bg-[repeating-linear-gradient(160deg,#3b3631_0_1.6px,#1f1b18_1.6px_3.2px)]" />
      {/* Lampholder */}
      <div className="h-[22px] w-[18px] rounded-t-[4px] rounded-b-[2px] bg-[linear-gradient(90deg,#6b4f1a,#f0d48a_38%,#c49c45_60%,#5e4416)] shadow-[0_2px_3px_rgb(0_0_0_/_0.2)]" />
      <div className="relative -mt-px">
        {/* Halo */}
        <motion.div
          animate={glow}
          className="pointer-events-none absolute top-[38px] left-1/2 size-[220px] -translate-x-1/2 -translate-y-1/2 rounded-full"
          initial={false}
          style={{
            background:
              "radial-gradient(circle, rgb(255 214 150 / 0.55) 0%, rgb(255 178 92 / 0.18) 35%, transparent 68%)",
          }}
        />
        <svg
          aria-hidden="true"
          className="relative"
          fill="none"
          height="74"
          viewBox="0 0 56 74"
          width="56"
        >
          <defs>
            <radialGradient cx="0.4" cy="0.38" id="bulb-glass" r="0.65">
              <stop offset="0" stopColor="#ffffff" stopOpacity="0.5" />
              <stop offset="0.7" stopColor="#e9e4dc" stopOpacity="0.28" />
              <stop offset="1" stopColor="#bfb7aa" stopOpacity="0.5" />
            </radialGradient>
            <radialGradient cx="0.5" cy="0.5" id="bulb-lit" r="0.55">
              <stop offset="0" stopColor="#fff6dc" />
              <stop offset="0.55" stopColor="#ffd38c" />
              <stop offset="1" stopColor="#f2a24a" stopOpacity="0.85" />
            </radialGradient>
          </defs>
          {/* Screw base */}
          <path
            d="M20 0H36V9C36 11 34 12 33 13H23C22 12 20 11 20 9Z"
            fill="#b9b2a6"
          />
          <path d="M20 3H36M20 6H36" stroke="#7b746a" strokeWidth="1" />
          {/* Glass */}
          <path
            d="M23 12C23 20 6 26 6 46C6 61 16 72 28 72C40 72 50 61 50 46C50 26 33 20 33 12Z"
            fill="url(#bulb-glass)"
            stroke="#9a9286"
            strokeOpacity="0.55"
            strokeWidth="0.8"
          />
          <motion.path
            animate={glow}
            d="M23 12C23 20 6 26 6 46C6 61 16 72 28 72C40 72 50 61 50 46C50 26 33 20 33 12Z"
            fill="url(#bulb-lit)"
            initial={false}
          />
          {/* Stem and filament */}
          <path d="M26 13V36M30 13V36" stroke="#8d867b" strokeWidth="0.8" />
          <path
            d="M26 36C22 40 21 46 24 48M30 36C34 40 35 46 32 48M24 48Q28 52 32 48"
            stroke="#6f675d"
            strokeLinecap="round"
            strokeWidth="0.9"
          />
          <motion.path
            animate={glow}
            d="M26 36C22 40 21 46 24 48M30 36C34 40 35 46 32 48M24 48Q28 52 32 48"
            initial={false}
            stroke="#fffaf0"
            strokeLinecap="round"
            strokeWidth="1.4"
            style={{ filter: "drop-shadow(0 0 2px #ffb347)" }}
          />
          {/* Reflection */}
          <path
            d="M14 40C14 33 18 28 21 25"
            opacity="0.7"
            stroke="#ffffff"
            strokeLinecap="round"
            strokeWidth="1.6"
          />
        </svg>
      </div>
    </div>
  );
}

export function PullCordShowcase() {
  const [sound, setSound] = useState(true);
  const [on, setOn] = useState(true);
  const shouldReduceMotion = useReducedMotion();

  return (
    <div className="w-full overflow-hidden rounded-[13px] border border-grayscale-3 bg-grayscale-1 small-shadow dark:border-grayscale-4 dark:bg-grayscale-3 dark:shadow-none">
      <div className="relative flex min-h-[440px] justify-center overflow-hidden bg-grayscale-1 dark:bg-grayscale-2">
        <div
          aria-hidden="true"
          className="absolute inset-0 opacity-[0.38]"
          style={stageGridStyle}
        />

        {/* Warm light thrown across the wall */}
        <motion.div
          animate={{ opacity: on ? 1 : 0 }}
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          initial={false}
          style={{
            background:
              "radial-gradient(ellipse 60% 70% at calc(50% - 70px) 190px, rgb(255 190 110 / 0.2), transparent 70%)",
          }}
          transition={{ duration: shouldReduceMotion ? 0 : 0.25 }}
        />

        <div className="relative z-0 flex items-start gap-14 max-[420px]:gap-6">
          <PendantBulb on={on} />
          <PullCord
            checked={on}
            className="-mx-12"
            label="Light"
            onCheckedChange={setOn}
            sound={sound}
          />
        </div>

        {/* The room with the light off */}
        <motion.div
          animate={{ opacity: on ? 0 : 1 }}
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[#141210]/55 dark:bg-black/60"
          initial={false}
          transition={
            shouldReduceMotion
              ? { duration: 0 }
              : on
                ? { duration: 0.22, ease: "easeOut" }
                : { duration: 0.16, ease: "easeIn" }
          }
        />

        <button
          aria-label={sound ? "Mute switch sounds" : "Play switch sounds"}
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

        <div className="absolute inset-x-0 bottom-6 z-[1] flex flex-col items-center gap-1 px-6 text-center">
          <span className="rounded-full bg-grayscale-1/80 px-2 py-0.5 font-medium font-mono text-[9px] text-grayscale-11 uppercase tracking-[0.06em] dark:bg-grayscale-3/80">
            Light {on ? "on" : "off"}
          </span>
          <p
            className={
              on
                ? "text-grayscale-9 text-xs"
                : "text-white/70 text-xs dark:text-grayscale-10"
            }
          >
            Pull the cord, tap it, or focus it and press Space.
          </p>
        </div>
      </div>
    </div>
  );
}
