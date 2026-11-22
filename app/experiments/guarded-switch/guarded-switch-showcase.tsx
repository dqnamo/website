"use client";

import { SpeakerHighIcon, SpeakerSlashIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { GuardedSwitch } from "@/components/GuardedSwitch";
import { cn } from "@/helpers/classname-helper";

const stageGridStyle = {
  backgroundImage:
    "linear-gradient(var(--color-grayscale-4) 1px, transparent 1px), linear-gradient(90deg, var(--color-grayscale-4) 1px, transparent 1px)",
  backgroundSize: "24px 24px",
  maskImage: "radial-gradient(circle at center, black, transparent 76%)",
};

export function GuardedSwitchShowcase() {
  const [armed, setArmed] = useState(false);
  const [guardOpen, setGuardOpen] = useState(false);
  const [sound, setSound] = useState(true);

  const status = armed
    ? "Armed — close the guard to make it safe"
    : guardOpen
      ? "Guard up — throw the switch"
      : "Safe — lift the guard to begin";

  return (
    <div className="w-full overflow-hidden rounded-[13px] border border-grayscale-3 bg-grayscale-1 small-shadow dark:border-grayscale-4 dark:bg-grayscale-3 dark:shadow-none">
      <div className="relative flex min-h-[520px] flex-col items-center justify-center gap-8 overflow-hidden bg-grayscale-1 px-6 pt-20 pb-10 dark:bg-grayscale-2">
        <div
          aria-hidden="true"
          className="absolute inset-0 opacity-[0.38]"
          style={stageGridStyle}
        />

        <button
          aria-label={sound ? "Mute switch sounds" : "Unmute switch sounds"}
          aria-pressed={!sound}
          className="absolute top-3 right-3 z-[1] grid size-8 place-items-center rounded-lg text-grayscale-10 transition-colors hover:bg-grayscale-3 hover:text-grayscale-12 focus-visible:outline-2 focus-visible:outline-grayscale-9 focus-visible:outline-offset-2"
          onClick={() => setSound((current) => !current)}
          type="button"
        >
          {sound ? (
            <SpeakerHighIcon aria-hidden="true" size={16} weight="bold" />
          ) : (
            <SpeakerSlashIcon aria-hidden="true" size={16} weight="bold" />
          )}
        </button>

        <GuardedSwitch
          checked={armed}
          className="z-[1]"
          label="Deploy"
          onCheckedChange={setArmed}
          onGuardChange={setGuardOpen}
          sound={sound}
        />

        <p
          className={cn(
            "z-[1] flex items-center gap-2 text-center font-mono text-[11px] uppercase tracking-[0.12em] transition-colors",
            armed ? "text-grayscale-12" : "text-grayscale-10",
          )}
        >
          <span
            aria-hidden="true"
            className={cn(
              "size-1.5 rounded-full transition-colors",
              armed ? "bg-amber-9" : "bg-grayscale-7",
            )}
          />
          {status}
        </p>
      </div>
    </div>
  );
}
