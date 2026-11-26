"use client";

import {
  SpeakerHighIcon,
  SpeakerSlashIcon,
} from "@phosphor-icons/react/dist/ssr";
import { useState } from "react";
import {
  ENVELOPE_PAPERS,
  Envelope,
  type EnvelopePaper,
} from "@/components/Envelope";
import { cn } from "@/helpers/classname-helper";

const stageGridStyle = {
  backgroundImage:
    "linear-gradient(var(--color-grayscale-4) 1px, transparent 1px), linear-gradient(90deg, var(--color-grayscale-4) 1px, transparent 1px)",
  backgroundSize: "24px 24px",
  maskImage: "radial-gradient(circle at center, black, transparent 76%)",
};

const papers: { label: string; value: EnvelopePaper }[] = [
  { label: "Cream", value: "cream" },
  { label: "Kraft", value: "kraft" },
  { label: "Airmail", value: "airmail" },
];

export function EnvelopeShowcase() {
  const [sound, setSound] = useState(true);
  const [paper, setPaper] = useState<EnvelopePaper>("cream");

  return (
    <div className="w-full overflow-hidden rounded-[13px] border border-grayscale-3 bg-grayscale-1 small-shadow dark:border-grayscale-4 dark:bg-grayscale-3 dark:shadow-none">
      <div className="relative flex min-h-[540px] flex-col items-center justify-end overflow-hidden bg-grayscale-1 px-6 pt-44 pb-10 dark:bg-grayscale-2 max-[520px]:px-4">
        <div
          aria-hidden="true"
          className="absolute inset-0 opacity-[0.38]"
          style={stageGridStyle}
        />

        <button
          aria-label={sound ? "Mute paper sounds" : "Play paper sounds"}
          aria-pressed={sound}
          className="absolute top-3 right-3 z-[6] flex size-8 items-center justify-center rounded-lg border border-grayscale-4 bg-grayscale-1 text-grayscale-11 transition-colors hover:bg-grayscale-3 hover:text-grayscale-12 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-grayscale-7 dark:bg-grayscale-3 dark:hover:bg-grayscale-4"
          onClick={() => setSound((current) => !current)}
          type="button"
        >
          {sound ? (
            <SpeakerHighIcon size={15} weight="bold" />
          ) : (
            <SpeakerSlashIcon size={15} weight="bold" />
          )}
        </button>

        <Envelope
          className="w-[340px]"
          label="Letter from dqnamo"
          paper={paper}
          sound={sound}
        >
          <div className="flex h-full flex-col px-[8cqw] pt-[6.5cqw] font-serif">
            <p className="font-sans text-[2.6cqw] text-[#9a8f7c] uppercase tracking-[0.2em]">
              24 November
            </p>
            <p className="mt-[3.2cqw] text-[5.6cqw] italic leading-none">
              Dear you,
            </p>
            <p className="mt-[2.6cqw] text-[3.7cqw] text-[#4a4237] leading-[1.45]">
              Thanks for breaking the seal. Some things are nicer when they take
              a moment to open.
            </p>
            <p className="mt-[2.6cqw] text-[4.2cqw] italic">— dqnamo</p>
          </div>
        </Envelope>

        <fieldset className="relative z-[6] mt-10 flex gap-1 rounded-[11px] border border-grayscale-4 bg-grayscale-1 p-1 dark:bg-grayscale-3">
          <legend className="sr-only">Paper</legend>
          {papers.map((option) => {
            const selected = option.value === paper;
            const theme = ENVELOPE_PAPERS[option.value];

            return (
              <button
                aria-pressed={selected}
                className={cn(
                  "flex h-7 items-center gap-1.5 rounded-[7px] px-2.5 font-medium text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-grayscale-7",
                  selected
                    ? "bg-grayscale-3 text-grayscale-12 dark:bg-grayscale-5"
                    : "text-grayscale-10 hover:text-grayscale-12",
                )}
                key={option.value}
                onClick={() => setPaper(option.value)}
                type="button"
              >
                <span
                  aria-hidden="true"
                  className="size-3 rounded-full shadow-[inset_0_0_0_1px_rgba(0,0,0,0.14)]"
                  style={{
                    background: `linear-gradient(135deg, ${theme.paper} 50%, ${theme.wax.base} 50%)`,
                  }}
                />
                {option.label}
              </button>
            );
          })}
        </fieldset>

        <p className="relative z-[6] mt-4 text-center text-grayscale-9 text-xs">
          Click to open, or drag the flap up and pull the letter out.
        </p>
      </div>
    </div>
  );
}
