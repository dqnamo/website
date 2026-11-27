"use client";

import NumberFlow from "@number-flow/react";
import {
  ArrowCounterClockwiseIcon,
  SpeakerHighIcon,
  SpeakerSlashIcon,
} from "@phosphor-icons/react/dist/ssr";
import { useState } from "react";
import { Abacus } from "@/components/Abacus";

const stageGridStyle = {
  backgroundImage:
    "linear-gradient(var(--color-grayscale-4) 1px, transparent 1px), linear-gradient(90deg, var(--color-grayscale-4) 1px, transparent 1px)",
  backgroundSize: "24px 24px",
  maskImage: "radial-gradient(circle at center, black, transparent 76%)",
};

const iconButtonClassName =
  "flex size-8 items-center justify-center rounded-lg border border-grayscale-4 bg-grayscale-1 text-grayscale-11 transition-colors hover:bg-grayscale-3 hover:text-grayscale-12 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-grayscale-7 disabled:pointer-events-none disabled:opacity-40 dark:bg-grayscale-3 dark:hover:bg-grayscale-4";

export function AbacusShowcase() {
  const [sound, setSound] = useState(true);
  const [value, setValue] = useState(2026);

  return (
    <div className="w-full overflow-hidden rounded-[13px] border border-grayscale-3 bg-grayscale-1 small-shadow dark:border-grayscale-4 dark:bg-grayscale-3 dark:shadow-none">
      <div className="relative flex min-h-[500px] flex-col items-center justify-center overflow-hidden bg-grayscale-1 px-6 py-14 dark:bg-grayscale-2 max-[520px]:px-2">
        <div
          aria-hidden="true"
          className="absolute inset-0 opacity-[0.38]"
          style={stageGridStyle}
        />

        <div className="absolute top-3 right-3 z-[1] flex gap-1.5">
          <button
            aria-label="Clear the abacus"
            className={iconButtonClassName}
            disabled={value === 0}
            onClick={() => setValue(0)}
            type="button"
          >
            <ArrowCounterClockwiseIcon size={15} weight="bold" />
          </button>
          <button
            aria-label={sound ? "Mute bead clacks" : "Play bead clacks"}
            aria-pressed={sound}
            className={iconButtonClassName}
            onClick={() => setSound((current) => !current)}
            type="button"
          >
            {sound ? (
              <SpeakerHighIcon size={15} weight="bold" />
            ) : (
              <SpeakerSlashIcon size={15} weight="bold" />
            )}
          </button>
        </div>

        <output
          aria-live="polite"
          className="relative z-[1] mb-7 font-medium font-mono text-2xl text-grayscale-12 tabular-nums tracking-tight"
        >
          <NumberFlow locales="en-US" value={value} />
        </output>

        <Abacus
          className="relative z-[1] max-[420px]:-mb-14 max-[420px]:origin-top max-[420px]:scale-[0.84] max-[360px]:-mb-20 max-[360px]:scale-[0.76]"
          label="Soroban"
          onValueChange={setValue}
          sound={sound}
          value={value}
        />

        <p className="relative z-[1] mt-8 max-w-xs text-pretty text-center text-grayscale-9 text-xs leading-5">
          Tap or drag a bead to the bar. Beads only count when they touch it.
        </p>
      </div>
    </div>
  );
}
