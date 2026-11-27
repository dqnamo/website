"use client";

import {
  SpeakerHighIcon,
  SpeakerSlashIcon,
} from "@phosphor-icons/react/dist/ssr";
import { useState } from "react";
import {
  SnowGlobe,
  type SnowGlobeScene,
  snowGlobeScenes,
} from "@/components/SnowGlobe";
import { cn } from "@/helpers/classname-helper";

const stageGridStyle = {
  backgroundImage:
    "linear-gradient(var(--color-grayscale-4) 1px, transparent 1px), linear-gradient(90deg, var(--color-grayscale-4) 1px, transparent 1px)",
  backgroundSize: "24px 24px",
  maskImage: "radial-gradient(circle at center, black, transparent 76%)",
};

const sceneLabels: Record<SnowGlobeScene, string> = {
  cabin: "Cabin",
  lighthouse: "Lighthouse",
  snowman: "Snowman",
};

export function SnowGlobeShowcase() {
  const [sound, setSound] = useState(true);
  const [scene, setScene] = useState<SnowGlobeScene>("cabin");

  return (
    <div className="w-full overflow-hidden rounded-[13px] border border-grayscale-3 bg-grayscale-1 small-shadow dark:border-grayscale-4 dark:bg-grayscale-3 dark:shadow-none">
      <div className="relative flex min-h-[540px] flex-col items-center justify-center overflow-hidden bg-grayscale-1 px-6 pt-16 pb-10 dark:bg-grayscale-2 max-[520px]:px-4">
        <div
          aria-hidden="true"
          className="absolute inset-0 opacity-[0.38]"
          style={stageGridStyle}
        />

        <fieldset className="absolute top-3 left-3 z-[1] flex gap-0.5 rounded-lg border border-grayscale-4 bg-grayscale-1 p-0.5 dark:bg-grayscale-3">
          <legend className="sr-only">Scene</legend>
          {snowGlobeScenes.map((option) => (
            <button
              aria-pressed={scene === option}
              className={cn(
                "h-7 rounded-md px-2.5 font-medium text-grayscale-11 text-xs transition-colors hover:text-grayscale-12 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-grayscale-7",
                scene === option &&
                  "bg-grayscale-3 text-grayscale-12 dark:bg-grayscale-5",
              )}
              key={option}
              onClick={() => setScene(option)}
              type="button"
            >
              {sceneLabels[option]}
            </button>
          ))}
        </fieldset>

        <button
          aria-label={sound ? "Mute the snow globe" : "Play the snow globe"}
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

        <SnowGlobe
          className="z-[1]"
          label={`${sceneLabels[scene]} snow globe`}
          scene={scene}
          size={300}
          sound={sound}
        />

        <p className="relative z-[1] mt-6 text-center text-grayscale-9 text-xs">
          Pick it up and shake it, or tap it. Set it down hard to kick the snow
          up.
        </p>
      </div>
    </div>
  );
}
