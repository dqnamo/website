"use client";

import {
  SpeakerHighIcon,
  SpeakerSlashIcon,
} from "@phosphor-icons/react/dist/ssr";
import { useState } from "react";
import { SpiritLevel } from "@/components/SpiritLevel";

const stageGridStyle = {
  backgroundImage:
    "linear-gradient(var(--color-grayscale-4) 1px, transparent 1px), linear-gradient(90deg, var(--color-grayscale-4) 1px, transparent 1px)",
  backgroundSize: "24px 24px",
  maskImage: "radial-gradient(circle at center, black, transparent 76%)",
};

export function SpiritLevelShowcase() {
  const [sound, setSound] = useState(true);

  return (
    <div className="w-full overflow-hidden rounded-[13px] border border-grayscale-3 bg-grayscale-1 small-shadow dark:border-grayscale-4 dark:bg-grayscale-3 dark:shadow-none">
      <div className="relative flex min-h-[560px] flex-col items-center justify-center overflow-hidden bg-grayscale-1 px-6 py-10 dark:bg-grayscale-2 max-[520px]:min-h-[440px] max-[520px]:px-4">
        <div
          aria-hidden="true"
          className="absolute inset-0 opacity-[0.38]"
          style={stageGridStyle}
        />

        <button
          aria-label={sound ? "Mute the level beep" : "Play the level beep"}
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

        {/* The level is drawn at a fixed size, so shrink it on small screens. */}
        <div className="relative z-[1] max-[520px]:-my-[67px] max-[520px]:scale-[0.68]">
          <SpiritLevel sound={sound} />
        </div>

        <p className="relative z-[1] mt-6 text-center text-grayscale-9 text-xs">
          Grab an end and tilt it, or use the arrow keys. Home sets it level.
        </p>
      </div>
    </div>
  );
}
