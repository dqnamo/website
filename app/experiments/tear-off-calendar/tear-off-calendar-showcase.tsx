"use client";

import {
  ArrowCounterClockwiseIcon,
  SpeakerHighIcon,
  SpeakerSlashIcon,
} from "@phosphor-icons/react/dist/ssr";
import { useEffect, useState } from "react";
import { TearOffCalendar } from "@/components/TearOffCalendar";
import { cn } from "@/helpers/classname-helper";

const stageGridStyle = {
  backgroundImage:
    "linear-gradient(var(--color-grayscale-4) 1px, transparent 1px), linear-gradient(90deg, var(--color-grayscale-4) 1px, transparent 1px)",
  backgroundSize: "24px 24px",
  maskImage: "radial-gradient(circle at center, black, transparent 76%)",
};

const iconButtonClassName =
  "absolute top-3 z-[1] flex h-8 items-center justify-center gap-1.5 rounded-lg border border-grayscale-4 bg-grayscale-1 text-grayscale-11 transition-[background-color,color,opacity] hover:bg-grayscale-3 hover:text-grayscale-12 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-grayscale-7 dark:bg-grayscale-3 dark:hover:bg-grayscale-4";

function today() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export function TearOffCalendarShowcase() {
  const [sound, setSound] = useState(true);
  // Today is only known in the browser, so the pad appears once it is.
  const [date, setDate] = useState<Date | null>(null);

  useEffect(() => {
    setDate(today());
  }, []);

  const ahead = date !== null && date.getTime() !== today().getTime();

  return (
    <div className="w-full overflow-hidden rounded-[13px] border border-grayscale-3 bg-grayscale-1 small-shadow dark:border-grayscale-4 dark:bg-grayscale-3 dark:shadow-none">
      <div className="relative flex min-h-[520px] flex-col items-center justify-center overflow-hidden bg-grayscale-1 px-6 py-12 dark:bg-grayscale-2 max-[520px]:px-4">
        <div
          aria-hidden="true"
          className="absolute inset-0 opacity-[0.38]"
          style={stageGridStyle}
        />

        <button
          aria-hidden={!ahead}
          className={cn(
            iconButtonClassName,
            "left-3 px-2.5 font-medium text-xs",
            !ahead && "pointer-events-none opacity-0",
          )}
          onClick={() => setDate(today())}
          tabIndex={ahead ? 0 : -1}
          type="button"
        >
          <ArrowCounterClockwiseIcon size={13} weight="bold" />
          Back to today
        </button>

        <button
          aria-label={sound ? "Mute tearing sounds" : "Play tearing sounds"}
          aria-pressed={sound}
          className={cn(iconButtonClassName, "right-3 w-8")}
          onClick={() => setSound((current) => !current)}
          type="button"
        >
          {sound ? (
            <SpeakerHighIcon size={15} weight="bold" />
          ) : (
            <SpeakerSlashIcon size={15} weight="bold" />
          )}
        </button>

        <div
          className={cn(
            "relative z-[1] transition-opacity duration-500",
            date ? "opacity-100" : "opacity-0",
          )}
        >
          {date && (
            <TearOffCalendar date={date} onDateChange={setDate} sound={sound} />
          )}
        </div>

        <p className="relative z-[1] mt-8 text-center text-grayscale-9 text-xs">
          Pull the page down to tear it off, a little or all the way. Or press
          Enter.
        </p>
      </div>
    </div>
  );
}
