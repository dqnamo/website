"use client";

import NumberFlow from "@number-flow/react";
import {
  SpeakerHighIcon,
  SpeakerSlashIcon,
} from "@phosphor-icons/react/dist/ssr";
import { useState } from "react";
import { HolePunch } from "@/components/HolePunch";
import { cn } from "@/helpers/classname-helper";

const stageGridStyle = {
  backgroundImage:
    "linear-gradient(var(--color-grayscale-4) 1px, transparent 1px), linear-gradient(90deg, var(--color-grayscale-4) 1px, transparent 1px)",
  backgroundSize: "24px 24px",
  maskImage: "radial-gradient(circle at center, black, transparent 76%)",
};

const SHEET_OPTIONS = [1, 3, 5] as const;

export function HolePunchShowcase() {
  const [sound, setSound] = useState(true);
  const [sheets, setSheets] = useState<number>(3);
  const [punched, setPunched] = useState(0);
  const [chads, setChads] = useState(0);

  return (
    <div className="w-full overflow-hidden rounded-[13px] border border-grayscale-3 bg-grayscale-1 small-shadow dark:border-grayscale-4 dark:bg-grayscale-3 dark:shadow-none">
      <div className="relative flex min-h-[480px] flex-col items-center justify-center overflow-hidden bg-grayscale-1 px-6 pt-12 pb-8 dark:bg-grayscale-2 max-[520px]:px-3">
        <div
          aria-hidden="true"
          className="absolute inset-0 opacity-[0.38]"
          style={stageGridStyle}
        />

        <button
          aria-label={sound ? "Mute the punch" : "Play punch sounds"}
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

        <HolePunch
          className="relative z-[1]"
          onChadsChange={setChads}
          onPunch={(count) => setPunched((total) => total + count)}
          sheets={sheets}
          sound={sound}
        />

        <div className="relative z-[1] mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
          <fieldset className="flex items-center gap-2">
            <legend className="sr-only">Sheets in the stack</legend>
            <span
              aria-hidden="true"
              className="font-mono text-[10px] text-grayscale-9 uppercase tracking-wider"
            >
              Sheets
            </span>
            <div className="flex rounded-lg border border-grayscale-4 bg-grayscale-2 p-0.5 dark:bg-grayscale-3">
              {SHEET_OPTIONS.map((option) => (
                <button
                  aria-label={`${option} ${option === 1 ? "sheet" : "sheets"}`}
                  aria-pressed={sheets === option}
                  className={cn(
                    "h-6 min-w-7 rounded-md px-2 font-medium font-mono text-[11px] tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-grayscale-7",
                    sheets === option
                      ? "bg-grayscale-1 text-grayscale-12 shadow-[0_1px_2px_rgb(0_0_0/0.08)] dark:bg-grayscale-5"
                      : "text-grayscale-10 hover:text-grayscale-12",
                  )}
                  key={option}
                  onClick={() => setSheets(option)}
                  type="button"
                >
                  {option}
                </button>
              ))}
            </div>
          </fieldset>

          <dl className="flex items-center gap-4 font-mono text-[10px] text-grayscale-9 uppercase tracking-wider">
            <div className="flex items-baseline gap-1.5">
              <dt>Punched</dt>
              <dd className="text-grayscale-12 text-xs tabular-nums">
                <NumberFlow value={punched} />
              </dd>
            </div>
            <div className="flex items-baseline gap-1.5">
              <dt>Chads</dt>
              <dd className="text-grayscale-12 text-xs tabular-nums">
                <NumberFlow value={chads} />
              </dd>
            </div>
          </dl>
        </div>

        <p className="relative z-[1] mt-4 text-center text-grayscale-9 text-xs">
          Drag the lever down until the paper gives. Tap the tray to empty it.
        </p>
      </div>
    </div>
  );
}
