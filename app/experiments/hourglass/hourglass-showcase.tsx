"use client";

import {
  SpeakerHighIcon,
  SpeakerSlashIcon,
} from "@phosphor-icons/react/dist/ssr";
import { useState } from "react";
import {
  HOURGLASS_SANDS,
  Hourglass,
  type HourglassSand,
} from "@/components/Hourglass";
import { cn } from "@/helpers/classname-helper";

const stageGridStyle = {
  backgroundImage:
    "linear-gradient(var(--color-grayscale-4) 1px, transparent 1px), linear-gradient(90deg, var(--color-grayscale-4) 1px, transparent 1px)",
  backgroundSize: "24px 24px",
  maskImage: "radial-gradient(circle at center, black, transparent 76%)",
};

const glasses: { duration: number; label: string; sand: HourglassSand }[] = [
  { duration: 30, label: "30 sec", sand: "rose" },
  { duration: 60, label: "1 min", sand: "gold" },
  { duration: 180, label: "3 min", sand: "lilac" },
];

export function HourglassShowcase() {
  const [sound, setSound] = useState(true);
  const [glass, setGlass] = useState(glasses[0]);

  return (
    <div className="w-full overflow-hidden rounded-[13px] border border-grayscale-3 bg-grayscale-1 small-shadow dark:border-grayscale-4 dark:bg-grayscale-3 dark:shadow-none">
      <div className="relative flex min-h-[520px] flex-col items-center justify-center overflow-hidden bg-grayscale-1 px-6 py-12 dark:bg-grayscale-2 max-[520px]:px-4">
        <div
          aria-hidden="true"
          className="absolute inset-0 opacity-[0.38]"
          style={stageGridStyle}
        />

        <button
          aria-label={sound ? "Mute the hourglass" : "Play hourglass sounds"}
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

        <Hourglass
          className="relative z-[1]"
          duration={glass.duration}
          height={300}
          sand={glass.sand}
          sound={sound}
        />

        <fieldset className="relative z-[1] mt-6 flex gap-1 rounded-[10px] border border-grayscale-4 bg-grayscale-2 p-1 dark:bg-grayscale-3">
          <legend className="sr-only">Glass</legend>
          {glasses.map((option) => {
            const selected = option.label === glass.label;

            return (
              <button
                aria-pressed={selected}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-2.5 py-1 font-medium text-grayscale-10 text-xs transition-colors hover:text-grayscale-12 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-grayscale-7",
                  selected &&
                    "bg-grayscale-1 text-grayscale-12 shadow-sm dark:bg-grayscale-5",
                )}
                key={option.label}
                onClick={() => setGlass(option)}
                type="button"
              >
                <span
                  aria-hidden="true"
                  className="size-2 rounded-full"
                  style={{ background: HOURGLASS_SANDS[option.sand].base }}
                />
                {option.label}
              </button>
            );
          })}
        </fieldset>

        <p className="relative z-[1] mt-5 text-center text-grayscale-9 text-xs">
          Click to turn it over, drag to tip it, or use the arrow keys.
        </p>
      </div>
    </div>
  );
}
