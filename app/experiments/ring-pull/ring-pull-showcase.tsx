"use client";

import {
  ArrowCounterClockwiseIcon,
  SpeakerHighIcon,
  SpeakerSlashIcon,
} from "@phosphor-icons/react/dist/ssr";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import {
  RingPull,
  type RingPullFlavour,
  ringPullFlavours,
} from "@/components/RingPull";
import { cn } from "@/helpers/classname-helper";

const stageGridStyle = {
  backgroundImage:
    "linear-gradient(var(--color-grayscale-4) 1px, transparent 1px), linear-gradient(90deg, var(--color-grayscale-4) 1px, transparent 1px)",
  backgroundSize: "24px 24px",
  maskImage: "radial-gradient(circle at center, black, transparent 76%)",
};

const flavourOrder: RingPullFlavour[] = ["cola", "lemon", "orange", "seltzer"];

export function RingPullShowcase() {
  const shouldReduceMotion = useReducedMotion();
  const [sound, setSound] = useState(true);
  const [flavour, setFlavour] = useState<RingPullFlavour>("cola");
  const [can, setCan] = useState(0);
  const [opened, setOpened] = useState(false);

  function nextCan(nextFlavour = flavour) {
    setFlavour(nextFlavour);
    setOpened(false);
    setCan((current) => current + 1);
  }

  return (
    <div className="w-full overflow-hidden rounded-[13px] border border-grayscale-3 bg-grayscale-1 small-shadow dark:border-grayscale-4 dark:bg-grayscale-3 dark:shadow-none">
      <div className="relative flex min-h-[500px] flex-col items-center justify-center overflow-hidden bg-grayscale-1 px-6 pt-14 pb-8 dark:bg-grayscale-2 max-[520px]:px-4">
        <div
          aria-hidden="true"
          className="absolute inset-0 opacity-[0.38]"
          style={stageGridStyle}
        />

        <button
          aria-label={sound ? "Mute the can" : "Play the can's hiss"}
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

        <div className="relative z-[1] max-[420px]:scale-[0.86]">
          <AnimatePresence mode="wait">
            <motion.div
              animate={{ opacity: 1, y: 0 }}
              exit={
                shouldReduceMotion
                  ? { opacity: 0 }
                  : { opacity: 0, transition: { duration: 0.18 }, y: 36 }
              }
              initial={
                // The first can is already on the counter; later ones slide in.
                can === 0
                  ? false
                  : shouldReduceMotion
                    ? { opacity: 0 }
                    : { opacity: 0, y: 48 }
              }
              key={can}
              transition={{ damping: 24, stiffness: 300, type: "spring" }}
            >
              <RingPull
                flavour={flavour}
                onOpen={() => setOpened(true)}
                sound={sound}
              />
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="relative z-[1] mt-4 flex flex-wrap items-center justify-center gap-2">
          <fieldset className="flex items-center gap-0.5 rounded-[10px] border border-grayscale-4 bg-grayscale-2 p-0.5 dark:bg-grayscale-3">
            <legend className="sr-only">Flavour</legend>
            {flavourOrder.map((option) => {
              const tokens = ringPullFlavours[option];
              const selected = option === flavour;

              return (
                <button
                  aria-pressed={selected}
                  className={cn(
                    "flex h-7 items-center gap-1.5 rounded-lg px-2.5 font-medium text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-grayscale-7",
                    selected
                      ? "bg-grayscale-1 text-grayscale-12 shadow-[0_1px_2px_rgb(0_0_0_/_8%)] dark:bg-grayscale-5"
                      : "text-grayscale-10 hover:text-grayscale-12",
                  )}
                  key={option}
                  onClick={() => {
                    if (!selected) {
                      nextCan(option);
                    }
                  }}
                  type="button"
                >
                  <span
                    aria-hidden="true"
                    className="size-2.5 rounded-full shadow-[inset_0_0_0_0.5px_rgb(0_0_0_/_25%)]"
                    style={{ backgroundColor: tokens.body }}
                  />
                  {tokens.name}
                </button>
              );
            })}
          </fieldset>

          <button
            className={cn(
              "flex h-8 items-center gap-1.5 rounded-[10px] border border-grayscale-4 bg-grayscale-1 px-3 font-medium text-grayscale-11 text-xs transition-[opacity,background-color,color] hover:bg-grayscale-3 hover:text-grayscale-12 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-grayscale-7 disabled:pointer-events-none disabled:opacity-40 dark:bg-grayscale-3 dark:hover:bg-grayscale-4",
            )}
            disabled={!opened}
            onClick={() => nextCan()}
            type="button"
          >
            <ArrowCounterClockwiseIcon size={13} weight="bold" />
            New can
          </button>
        </div>

        <p className="relative z-[1] mt-4 text-center text-grayscale-9 text-xs">
          {opened
            ? "Push the tab back down, or crack another."
            : "Hook the ring and drag it up until the score gives."}
        </p>
      </div>
    </div>
  );
}
