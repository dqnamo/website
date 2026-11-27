"use client";

import {
  ArrowCounterClockwiseIcon,
  SpeakerHighIcon,
  SpeakerSlashIcon,
} from "@phosphor-icons/react/dist/ssr";
import { useState } from "react";
import { ScratchCard, type ScratchCoating } from "@/components/ScratchCard";
import { cn } from "@/helpers/classname-helper";

const stageGridStyle = {
  backgroundImage:
    "linear-gradient(var(--color-grayscale-4) 1px, transparent 1px), linear-gradient(90deg, var(--color-grayscale-4) 1px, transparent 1px)",
  backgroundSize: "24px 24px",
  maskImage: "radial-gradient(circle at center, black, transparent 76%)",
};

/** Fine concentric rings, like the security print on a lottery ticket. */
const guillocheStyle = {
  backgroundImage:
    "repeating-radial-gradient(circle at 18% 120%, transparent 0 5px, var(--color-grayscale-4) 5px 5.6px), repeating-radial-gradient(circle at 92% -30%, transparent 0 7px, var(--color-grayscale-4) 7px 7.6px)",
};

const PRIZES = [
  { code: "DQN-7F3K", prize: "A free design crit" },
  { code: "DQN-Q2MX", prize: "One hour of pairing" },
  { code: "DQN-81ZP", prize: "First look at the next drop" },
];

const COATINGS: { label: string; value: ScratchCoating }[] = [
  { label: "Silver", value: "silver" },
  { label: "Gold", value: "gold" },
];

const controlClassName =
  "flex h-8 items-center justify-center rounded-lg border border-grayscale-4 bg-grayscale-1 text-grayscale-11 transition-colors hover:bg-grayscale-3 hover:text-grayscale-12 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-grayscale-7 dark:bg-grayscale-3 dark:hover:bg-grayscale-4";

export function ScratchCardShowcase() {
  const [sound, setSound] = useState(true);
  const [coating, setCoating] = useState<ScratchCoating>("silver");
  const [round, setRound] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const { code, prize } = PRIZES[round % PRIZES.length];
  const serial = String(4271 + round * 37).padStart(6, "0");

  const newCard = () => {
    setRevealed(false);
    setRound((current) => current + 1);
  };

  return (
    <div className="w-full overflow-hidden rounded-[13px] border border-grayscale-3 bg-grayscale-1 small-shadow dark:border-grayscale-4 dark:bg-grayscale-3 dark:shadow-none">
      <div className="relative flex min-h-[460px] flex-col items-center justify-center overflow-hidden bg-grayscale-1 px-6 py-12 dark:bg-grayscale-2 max-[520px]:px-4">
        <div
          aria-hidden="true"
          className="absolute inset-0 opacity-[0.38]"
          style={stageGridStyle}
        />

        <div className="absolute top-3 right-3 z-[4] flex gap-1.5">
          <fieldset className="flex rounded-lg border border-grayscale-4 bg-grayscale-1 p-0.5 dark:bg-grayscale-3">
            <legend className="sr-only">Coating</legend>
            {COATINGS.map((option) => (
              <label
                className={cn(
                  "flex h-[26px] cursor-pointer items-center rounded-md px-2 font-medium text-[11px] transition-colors has-focus-visible:ring-2 has-focus-visible:ring-grayscale-7",
                  coating === option.value
                    ? "bg-grayscale-3 text-grayscale-12 dark:bg-grayscale-5"
                    : "text-grayscale-10 hover:text-grayscale-12",
                )}
                key={option.value}
              >
                <input
                  checked={coating === option.value}
                  className="sr-only"
                  name="scratch-coating"
                  onChange={() => {
                    setCoating(option.value);
                    newCard();
                  }}
                  type="radio"
                  value={option.value}
                />
                {option.label}
              </label>
            ))}
          </fieldset>
          <button
            aria-label={sound ? "Mute scratching" : "Play scratching"}
            aria-pressed={sound}
            className={cn(controlClassName, "w-8")}
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

        <article
          aria-label={`Scratch card number ${serial}`}
          className="relative z-[1] w-[340px] max-w-full rounded-2xl border border-grayscale-4 bg-grayscale-1 p-4 shadow-[0_1px_0_rgb(255_255_255/0.7)_inset,0_14px_30px_-12px_rgb(0_0_0/0.25),0_2px_4px_rgb(0_0_0/0.06)] dark:border-grayscale-5 dark:bg-grayscale-3 dark:shadow-[0_1px_0_rgb(255_255_255/0.06)_inset,0_14px_30px_-12px_rgb(0_0_0/0.6)]"
        >
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 rounded-[inherit] opacity-60"
            style={guillocheStyle}
          />

          <header className="relative flex items-start justify-between gap-3">
            <div>
              <p className="font-mono text-[9px] text-grayscale-10 uppercase tracking-[0.18em]">
                Studio draw
              </p>
              <h2 className="mt-1 font-black text-[26px] text-grayscale-12 uppercase leading-[0.85] tracking-[-0.04em]">
                Lucky
                <br />
                <span className="text-[#e5484d]">Pixel</span>
              </h2>
            </div>
            <div className="text-right">
              <p className="font-mono text-[9px] text-grayscale-10 uppercase tracking-[0.18em]">
                No.
              </p>
              <p className="mt-1 font-mono font-semibold text-grayscale-12 text-sm tabular-nums">
                {serial}
              </p>
            </div>
          </header>

          <ScratchCard
            className="relative mt-4 h-[124px] rounded-lg"
            coating={coating}
            key={`${coating}-${round}`}
            label="Scratch the panel to reveal your prize"
            onReveal={() => setRevealed(true)}
            sound={sound}
          >
            <div className="flex size-full flex-col items-center justify-center rounded-lg border border-grayscale-4 border-dashed bg-grayscale-2 text-center dark:bg-grayscale-2">
              <p className="font-mono text-[9px] text-grayscale-10 uppercase tracking-[0.2em]">
                You&rsquo;ve won
              </p>
              <p className="mt-1.5 font-semibold text-base text-grayscale-12 tracking-[-0.01em]">
                {prize}
              </p>
              <p className="mt-2 rounded bg-grayscale-12 px-2 py-0.5 font-mono font-semibold text-[11px] text-grayscale-1 tracking-[0.14em]">
                {code}
              </p>
            </div>
          </ScratchCard>

          <footer className="relative mt-3 flex items-end justify-between gap-3">
            <p className="max-w-[190px] text-[9px] text-grayscale-9 leading-[1.35]">
              Scratch gently with a coin. One panel per card. Void if torn or
              tampered with.
            </p>
            <div
              aria-hidden="true"
              className="h-6 w-20 bg-[repeating-linear-gradient(90deg,var(--color-grayscale-12)_0_1px,transparent_1px_3px,var(--color-grayscale-12)_3px_5px,transparent_5px_6px)] opacity-70"
            />
          </footer>
        </article>

        <div className="relative z-[1] mt-8 flex h-8 items-center">
          {revealed ? (
            <button
              className={cn(controlClassName, "gap-1.5 px-3 text-xs")}
              onClick={newCard}
              type="button"
            >
              <ArrowCounterClockwiseIcon size={13} weight="bold" />
              New card
            </button>
          ) : (
            <p className="text-center text-grayscale-9 text-xs">
              Scratch with a drag, or press Enter to scratch a strip.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
