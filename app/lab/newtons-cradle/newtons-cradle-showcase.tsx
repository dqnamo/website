"use client";

import {
  HandIcon,
  SpeakerHighIcon,
  SpeakerSlashIcon,
} from "@phosphor-icons/react/dist/ssr";
import { useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import {
  NewtonsCradle,
  type NewtonsCradleHandle,
} from "@/components/NewtonsCradle";

const stageGridStyle = {
  backgroundImage:
    "linear-gradient(var(--color-grayscale-4) 1px, transparent 1px), linear-gradient(90deg, var(--color-grayscale-4) 1px, transparent 1px)",
  backgroundSize: "24px 24px",
  maskImage: "radial-gradient(circle at center, black, transparent 76%)",
};

const controlClassName =
  "flex h-8 items-center justify-center gap-1.5 rounded-lg border border-grayscale-4 bg-grayscale-1 px-3 font-medium text-grayscale-11 text-xs transition-[color,background-color,transform] duration-150 hover:bg-grayscale-3 hover:text-grayscale-12 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-grayscale-7 active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100 dark:bg-grayscale-3 dark:hover:bg-grayscale-4";

const drops = [
  { count: 1, label: "One" },
  { count: 2, label: "Two" },
  { count: 3, label: "Three" },
] as const;

export function NewtonsCradleShowcase() {
  const cradleRef = useRef<NewtonsCradleHandle>(null);
  const shouldReduceMotion = useReducedMotion();
  const [sound, setSound] = useState(true);
  const [clacks, setClacks] = useState(0);

  // Start the toy off once, so the page opens on a swing rather than a still.
  useEffect(() => {
    if (shouldReduceMotion) {
      return;
    }

    const timeout = window.setTimeout(() => cradleRef.current?.drop(1), 700);
    return () => window.clearTimeout(timeout);
  }, [shouldReduceMotion]);

  return (
    <div className="w-full overflow-hidden rounded-[13px] border border-grayscale-3 bg-grayscale-1 small-shadow dark:border-grayscale-4 dark:bg-grayscale-3 dark:shadow-none">
      <div className="relative flex min-h-[460px] flex-col items-center justify-center overflow-hidden bg-grayscale-1 px-6 py-12 dark:bg-grayscale-2 max-[520px]:px-3">
        <div
          aria-hidden="true"
          className="absolute inset-0 opacity-[0.38]"
          style={stageGridStyle}
        />

        <p className="absolute top-3 left-4 z-[1] font-mono text-[11px] text-grayscale-9 tabular-nums">
          {clacks.toLocaleString("en-GB")} {clacks === 1 ? "clack" : "clacks"}
        </p>

        <button
          aria-label={sound ? "Mute the clacks" : "Play the clacks"}
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

        <NewtonsCradle
          className="z-[1] max-w-[540px]"
          onClack={() => setClacks((count) => count + 1)}
          ref={cradleRef}
          sound={sound}
        />

        <fieldset className="relative z-[1] mt-9 flex flex-wrap items-center justify-center gap-1.5">
          <legend className="sr-only">Lift and drop balls from the left</legend>
          {drops.map((drop) => (
            <button
              aria-label={`Lift ${drop.count} ${drop.count === 1 ? "ball" : "balls"} and let go`}
              className={controlClassName}
              key={drop.count}
              onClick={() => cradleRef.current?.drop(drop.count)}
              type="button"
            >
              <span aria-hidden="true" className="flex items-center gap-[3px]">
                {Array.from({ length: drop.count }, (_, index) => (
                  <span
                    className="size-[7px] rounded-full bg-[radial-gradient(circle_at_35%_30%,#ffffff,#a9aeb6_45%,#3b3f45)]"
                    // biome-ignore lint/suspicious/noArrayIndexKey: identical dots
                    key={index}
                  />
                ))}
              </span>
              {drop.label}
            </button>
          ))}
          <button
            className={controlClassName}
            onClick={() => cradleRef.current?.still()}
            type="button"
          >
            <HandIcon aria-hidden="true" size={13} weight="bold" />
            Stop
          </button>
        </fieldset>

        <p className="relative z-[1] mt-5 text-center text-grayscale-9 text-xs">
          Pull a ball out and let go, or throw it.
        </p>
      </div>
    </div>
  );
}
