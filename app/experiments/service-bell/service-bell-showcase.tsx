"use client";

import {
  SpeakerHighIcon,
  SpeakerSlashIcon,
} from "@phosphor-icons/react/dist/ssr";
import { useState } from "react";
import {
  SERVICE_BELL_FINISHES,
  ServiceBell,
  type ServiceBellFinish,
} from "@/components/ServiceBell";
import { cn } from "@/helpers/classname-helper";

const stageGridStyle = {
  backgroundImage:
    "linear-gradient(var(--color-grayscale-4) 1px, transparent 1px), linear-gradient(90deg, var(--color-grayscale-4) 1px, transparent 1px)",
  backgroundSize: "24px 24px",
  maskImage: "radial-gradient(circle at center, black, transparent 76%)",
};

const finishes = Object.entries(SERVICE_BELL_FINISHES) as [
  ServiceBellFinish,
  (typeof SERVICE_BELL_FINISHES)[ServiceBellFinish],
][];

export function ServiceBellShowcase() {
  const [sound, setSound] = useState(true);
  const [finish, setFinish] = useState<ServiceBellFinish>("brass");

  return (
    <div className="w-full overflow-hidden rounded-[13px] border border-grayscale-3 bg-grayscale-1 small-shadow dark:border-grayscale-4 dark:bg-grayscale-3 dark:shadow-none">
      <div className="relative flex min-h-[460px] flex-col items-center justify-center overflow-hidden bg-grayscale-1 px-6 py-12 dark:bg-grayscale-2 max-[520px]:px-4">
        <div
          aria-hidden="true"
          className="absolute inset-0 opacity-[0.38]"
          style={stageGridStyle}
        />

        <button
          aria-label={sound ? "Mute the bell" : "Unmute the bell"}
          aria-pressed={!sound}
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

        <ServiceBell className="relative z-[1]" finish={finish} sound={sound} />

        <fieldset className="relative z-[1] mt-8 flex items-center gap-1 rounded-full border border-grayscale-4 bg-grayscale-1 p-1 dark:bg-grayscale-3">
          <legend className="sr-only">Finish</legend>
          {finishes.map(([key, spec]) => (
            <button
              aria-pressed={finish === key}
              className={cn(
                "flex h-7 items-center gap-1.5 rounded-full pr-3 pl-1.5 font-medium text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-grayscale-7",
                finish === key
                  ? "bg-grayscale-3 text-grayscale-12 dark:bg-grayscale-5"
                  : "text-grayscale-10 hover:text-grayscale-12",
              )}
              key={key}
              onClick={() => setFinish(key)}
              type="button"
            >
              <span
                aria-hidden="true"
                className="size-4 rounded-full shadow-[inset_0_1px_0_rgb(255_255_255_/_60%),inset_0_-1px_1px_rgb(0_0_0_/_35%),0_0_0_1px_rgb(0_0_0_/_12%)]"
                style={{
                  background: `radial-gradient(circle at 35% 30%, ${spec.sky}, ${spec.swatch} 55%, ${spec.horizon})`,
                }}
              />
              {spec.label}
            </button>
          ))}
        </fieldset>

        <p className="relative z-[1] mt-4 text-center text-grayscale-9 text-xs">
          Tap the plunger to ring. Hold the dome to hush it.
        </p>
      </div>
    </div>
  );
}
