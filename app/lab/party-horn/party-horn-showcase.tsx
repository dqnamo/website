"use client";

import {
  SpeakerHighIcon,
  SpeakerSlashIcon,
} from "@phosphor-icons/react/dist/ssr";
import { useId, useState } from "react";
import {
  PartyHorn,
  type PartyHornPaper,
  partyHornPapers,
} from "@/components/PartyHorn";
import { cn } from "@/helpers/classname-helper";

const stageGridStyle = {
  backgroundImage:
    "linear-gradient(var(--color-grayscale-4) 1px, transparent 1px), linear-gradient(90deg, var(--color-grayscale-4) 1px, transparent 1px)",
  backgroundSize: "24px 24px",
  maskImage: "radial-gradient(circle at center, black, transparent 76%)",
};

const paperNames = Object.keys(partyHornPapers) as PartyHornPaper[];

function swatchBackground(name: PartyHornPaper) {
  const [first, second] = partyHornPapers[name].stripes;
  return `repeating-linear-gradient(-55deg, rgb(${first.join(" ")}) 0 5px, rgb(${second.join(" ")}) 5px 10px)`;
}

export function PartyHornShowcase() {
  const [sound, setSound] = useState(true);
  const [paper, setPaper] = useState<PartyHornPaper>("carnival");
  const hintId = useId();

  return (
    <div className="w-full overflow-hidden rounded-[13px] border border-grayscale-3 bg-grayscale-1 small-shadow dark:border-grayscale-4 dark:bg-grayscale-3 dark:shadow-none">
      <div className="relative flex min-h-[460px] flex-col items-center justify-center overflow-hidden bg-grayscale-1 px-6 py-12 dark:bg-grayscale-2 max-[520px]:px-3">
        <div
          aria-hidden="true"
          className="absolute inset-0 opacity-[0.38]"
          style={stageGridStyle}
        />

        <button
          aria-label={sound ? "Mute the party horn" : "Play the party horn"}
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

        <PartyHorn
          aria-describedby={hintId}
          className="relative z-[1] max-w-[640px]"
          paper={paper}
          sound={sound}
        />

        <fieldset className="relative z-[1] mt-6 flex items-center gap-2">
          <legend className="sr-only">Paper</legend>
          {paperNames.map((name) => (
            <label
              className={cn(
                "relative flex size-7 cursor-pointer items-center justify-center rounded-full border border-grayscale-4 bg-grayscale-1 transition-transform duration-150 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-grayscale-7 active:scale-95 dark:bg-grayscale-3",
                paper === name && "border-grayscale-8",
              )}
              key={name}
              title={partyHornPapers[name].label}
            >
              <input
                checked={paper === name}
                className="sr-only"
                name="party-horn-paper"
                onChange={() => setPaper(name)}
                type="radio"
                value={name}
              />
              <span className="sr-only">{partyHornPapers[name].label}</span>
              <span
                aria-hidden="true"
                className="size-5 rounded-full shadow-[inset_0_0_0_0.5px_rgb(0_0_0/0.18),inset_0_1px_1px_rgb(255_255_255/0.5)]"
                style={{ background: swatchBackground(name) }}
              />
            </label>
          ))}
        </fieldset>

        <p
          className="relative z-[1] mt-5 text-center text-grayscale-9 text-xs"
          id={hintId}
        >
          Press and hold to blow, or tap for a short toot. Space works too.
        </p>
      </div>
    </div>
  );
}
