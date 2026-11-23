"use client";

import NumberFlow from "@number-flow/react";
import {
  ArrowCounterClockwiseIcon,
  SpeakerHighIcon,
  SpeakerSlashIcon,
} from "@phosphor-icons/react/dist/ssr";
import { useState } from "react";
import { BubbleWrap } from "@/components/BubbleWrap";

const ROWS = 5;
const COLUMNS = 8;
const TOTAL = ROWS * COLUMNS;

const stageGridStyle = {
  backgroundImage:
    "linear-gradient(var(--color-grayscale-4) 1px, transparent 1px), linear-gradient(90deg, var(--color-grayscale-4) 1px, transparent 1px)",
  backgroundSize: "24px 24px",
  maskImage: "radial-gradient(circle at center, black, transparent 76%)",
};

const toolButtonClassName =
  "flex size-8 items-center justify-center rounded-lg border border-grayscale-4 bg-grayscale-1 text-grayscale-11 transition-colors hover:bg-grayscale-3 hover:text-grayscale-12 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-grayscale-7 dark:bg-grayscale-3 dark:hover:bg-grayscale-4";

export function BubbleWrapShowcase() {
  const [sound, setSound] = useState(true);
  const [sheet, setSheet] = useState(0);
  const [popped, setPopped] = useState(0);
  const done = popped === TOTAL;

  function freshSheet() {
    setSheet((current) => current + 1);
    setPopped(0);
  }

  return (
    <div className="w-full overflow-hidden rounded-[13px] border border-grayscale-3 bg-grayscale-1 small-shadow dark:border-grayscale-4 dark:bg-grayscale-3 dark:shadow-none">
      <div className="relative flex min-h-[460px] flex-col items-center justify-center overflow-hidden bg-grayscale-1 px-6 py-14 dark:bg-grayscale-2 max-[520px]:px-4">
        <div
          aria-hidden="true"
          className="absolute inset-0 opacity-[0.38]"
          style={stageGridStyle}
        />

        <div className="absolute top-3 right-3 z-[1] flex gap-1.5">
          <button
            aria-label="Lay down a fresh sheet"
            className={toolButtonClassName}
            onClick={freshSheet}
            type="button"
          >
            <ArrowCounterClockwiseIcon size={15} weight="bold" />
          </button>
          <button
            aria-label={sound ? "Mute pops" : "Play pops"}
            aria-pressed={sound}
            className={toolButtonClassName}
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

        <div className="relative z-[1] w-full max-w-[440px] -rotate-[1.5deg]">
          <BubbleWrap
            columns={COLUMNS}
            key={sheet}
            onPop={setPopped}
            rows={ROWS}
            seed={sheet}
            sound={sound}
          />
        </div>

        <p
          aria-live="polite"
          className="relative z-[1] mt-8 font-mono text-[11px] text-grayscale-10 uppercase tracking-wider"
        >
          {done ? (
            "Every last one"
          ) : (
            <>
              <NumberFlow value={popped} /> / {TOTAL} popped
            </>
          )}
        </p>
        <p className="relative z-[1] mt-1.5 text-center text-grayscale-9 text-xs">
          Press and hold to squeeze, or drag across the sheet. Space works too.
        </p>
      </div>
    </div>
  );
}
