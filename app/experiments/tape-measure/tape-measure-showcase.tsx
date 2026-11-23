"use client";

import {
  SpeakerHighIcon,
  SpeakerSlashIcon,
} from "@phosphor-icons/react/dist/ssr";
import { useState } from "react";
import { TapeMeasure, type TapeMeasureUnit } from "@/components/TapeMeasure";
import { cn } from "@/helpers/classname-helper";

const stageGridStyle = {
  backgroundImage:
    "linear-gradient(var(--color-grayscale-4) 1px, transparent 1px), linear-gradient(90deg, var(--color-grayscale-4) 1px, transparent 1px)",
  backgroundSize: "24px 24px",
  maskImage: "radial-gradient(circle at center, black, transparent 76%)",
};

const units: { label: string; value: TapeMeasureUnit }[] = [
  { label: "cm", value: "cm" },
  { label: "in", value: "in" },
];

const controlClassName =
  "flex items-center justify-center rounded-lg border border-grayscale-4 bg-grayscale-1 text-grayscale-11 transition-colors hover:bg-grayscale-3 hover:text-grayscale-12 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-grayscale-7 dark:bg-grayscale-3 dark:hover:bg-grayscale-4";

export function TapeMeasureShowcase() {
  const [sound, setSound] = useState(true);
  const [unit, setUnit] = useState<TapeMeasureUnit>("cm");

  return (
    <div className="w-full overflow-hidden rounded-[13px] border border-grayscale-3 bg-grayscale-1 small-shadow dark:border-grayscale-4 dark:bg-grayscale-3 dark:shadow-none">
      <div className="relative flex min-h-[420px] flex-col justify-center overflow-hidden bg-grayscale-1 px-8 py-14 dark:bg-grayscale-2 max-[520px]:px-4">
        <div
          aria-hidden="true"
          className="absolute inset-0 opacity-[0.38]"
          style={stageGridStyle}
        />

        <div className="absolute top-3 right-3 z-[3] flex gap-1.5">
          <fieldset className="flex h-8 rounded-lg border border-grayscale-4 bg-grayscale-1 p-0.5 dark:bg-grayscale-3">
            <legend className="sr-only">Readout unit</legend>
            {units.map((option) => (
              <button
                aria-pressed={unit === option.value}
                className={cn(
                  "min-w-8 rounded-md px-2 font-medium font-mono text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-grayscale-7",
                  unit === option.value
                    ? "bg-grayscale-4 text-grayscale-12 dark:bg-grayscale-5"
                    : "text-grayscale-10 hover:text-grayscale-12",
                )}
                key={option.value}
                onClick={() => setUnit(option.value)}
                type="button"
              >
                {option.label}
              </button>
            ))}
          </fieldset>
          <button
            aria-label={sound ? "Mute tape sounds" : "Play tape sounds"}
            aria-pressed={sound}
            className={cn(controlClassName, "size-8")}
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

        <TapeMeasure className="z-[1]" sound={sound} unit={unit} />

        <p className="relative z-[1] mt-10 text-center text-grayscale-9 text-xs">
          Pull the hook out. Flick the slide on top to lock it, or let go and
          watch it wind home.
        </p>
      </div>
    </div>
  );
}
