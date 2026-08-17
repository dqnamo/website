"use client";

import { FireSimpleIcon } from "@phosphor-icons/react/dist/ssr";
import { useState } from "react";
import { PaperBurn } from "@/components/PaperBurn";
import Button from "@/components/public/Button";

export function PaperBurnShowcase() {
  const [active, setActive] = useState(false);
  const [burnt, setBurnt] = useState(false);

  function reset() {
    setActive(false);
    setBurnt(false);
  }

  return (
    <div className="flex min-h-96 w-full flex-col items-center justify-center gap-7 overflow-hidden rounded-[13px] bg-grayscale-2 px-5 py-12 dark:bg-grayscale-3">
      <PaperBurn
        active={active}
        aria-live="polite"
        className="w-full max-w-[21rem]"
        duration={900}
        onBurnComplete={() => setBurnt(true)}
      >
        <article className="min-h-52 border border-[#d9d9d9] bg-white p-7 text-[#252525]">
          <p className="font-mono font-semibold text-[9px] uppercase tracking-[0.2em] opacity-55">
            Private note · 14 Aug
          </p>
          <h2 className="mt-8 font-pirata text-3xl leading-none">
            Burn after reading.
          </h2>
          <p className="mt-4 max-w-60 text-sm leading-6 opacity-70">
            Some messages are only meant to exist for a moment.
          </p>
        </article>
      </PaperBurn>

      <div className="flex min-h-7 items-center gap-2">
        {!burnt ? (
          <Button
            disabled={active}
            onClick={() => setActive(true)}
            type="button"
          >
            <FireSimpleIcon aria-hidden="true" size={15} weight="fill" />
            {active ? "Burning…" : "Burn paper"}
          </Button>
        ) : (
          <Button onClick={reset} type="button" variant="secondary">
            Reset paper
          </Button>
        )}
      </div>
    </div>
  );
}
