"use client";

import {
  SpeakerHighIcon,
  SpeakerSlashIcon,
} from "@phosphor-icons/react/dist/ssr";
import { useState } from "react";
import {
  TallyCounter,
  type TallyCounterFinish,
} from "@/components/TallyCounter";
import { cn } from "@/helpers/classname-helper";

const stageGridStyle = {
  backgroundImage:
    "linear-gradient(var(--color-grayscale-4) 1px, transparent 1px), linear-gradient(90deg, var(--color-grayscale-4) 1px, transparent 1px)",
  backgroundSize: "24px 24px",
  maskImage: "radial-gradient(circle at center, black, transparent 76%)",
};

const finishes: { label: string; swatch: string; value: TallyCounterFinish }[] =
  [
    {
      label: "Chrome",
      swatch: "linear-gradient(135deg, #ffffff, #a9adb4 55%, #e9ebee)",
      value: "chrome",
    },
    {
      label: "Graphite",
      swatch: "linear-gradient(135deg, #6b6f76, #232528 55%, #45484e)",
      value: "graphite",
    },
    {
      label: "Signal",
      swatch: "linear-gradient(135deg, #ff8a55, #e04d12 55%, #ff7b40)",
      value: "signal",
    },
  ];

export function TallyCounterShowcase() {
  const [sound, setSound] = useState(true);
  const [finish, setFinish] = useState<TallyCounterFinish>("chrome");

  return (
    <div className="w-full overflow-hidden rounded-[13px] border border-grayscale-3 bg-grayscale-1 small-shadow dark:border-grayscale-4 dark:bg-grayscale-3 dark:shadow-none">
      <div className="relative flex min-h-[480px] flex-col items-center justify-center overflow-hidden bg-grayscale-1 px-6 py-12 dark:bg-grayscale-2 max-[520px]:px-4">
        <div
          aria-hidden="true"
          className="absolute inset-0 opacity-[0.38]"
          style={stageGridStyle}
        />

        <button
          aria-label={sound ? "Mute counter clicks" : "Play counter clicks"}
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

        <TallyCounter
          className="relative z-[1]"
          defaultValue={96}
          finish={finish}
          size={200}
          sound={sound}
        />

        <fieldset className="relative z-[1] mt-8 flex items-center gap-1 rounded-full border border-grayscale-4 bg-grayscale-1 p-1 dark:bg-grayscale-3">
          <legend className="sr-only">Finish</legend>
          {finishes.map((option) => (
            <label
              className={cn(
                "flex cursor-pointer items-center gap-1.5 rounded-full px-2.5 py-1 font-medium text-grayscale-10 text-xs transition-colors hover:text-grayscale-12 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-grayscale-7",
                finish === option.value &&
                  "bg-grayscale-3 text-grayscale-12 dark:bg-grayscale-5",
              )}
              key={option.value}
            >
              <input
                checked={finish === option.value}
                className="sr-only"
                name="tally-finish"
                onChange={() => setFinish(option.value)}
                type="radio"
                value={option.value}
              />
              <span
                aria-hidden="true"
                className="size-3 rounded-full shadow-[inset_0_0_0_0.5px_rgb(0_0_0_/_25%)]"
                style={{ background: option.swatch }}
              />
              {option.label}
            </label>
          ))}
        </fieldset>

        <p className="relative z-[1] mt-4 text-center text-grayscale-9 text-xs">
          Press the plunger, or Space. Turn the knob to send it back to zero.
        </p>
      </div>
    </div>
  );
}
