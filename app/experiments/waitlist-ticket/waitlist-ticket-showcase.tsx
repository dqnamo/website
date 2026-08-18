"use client";

import { useState } from "react";
import {
  type BurnColor,
  ThreeWaitlistTicket,
} from "@/components/ThreeWaitlistTicket";

const burnOptions = [
  { color: "#ff4d0a", label: "Orange", value: "orange" },
  { color: "#2878ff", label: "Blue", value: "blue" },
  { color: "#39d353", label: "Green", value: "green" },
  { color: "#b050ff", label: "Purple", value: "purple" },
] as const satisfies ReadonlyArray<{
  color: string;
  label: string;
  value: BurnColor;
}>;

export function WaitlistTicketShowcase() {
  const [burnColor, setBurnColor] = useState<BurnColor>("blue");

  return (
    <div className="w-full overflow-hidden rounded-[13px] border border-grayscale-3 bg-grayscale-1 small-shadow dark:border-grayscale-4 dark:bg-grayscale-2 dark:shadow-none">
      <div className="flex min-h-[34rem] items-center justify-center px-5 py-14 sm:px-10">
        <ThreeWaitlistTicket
          burnColor={burnColor}
          className="w-full max-w-[40rem]"
        />
      </div>

      <fieldset className="m-0 min-w-0 border-0 p-0">
        <legend className="sr-only">Burn color</legend>
        <div className="flex min-h-14 flex-wrap items-center justify-between gap-3 border-grayscale-3 border-t px-4 py-3 dark:border-grayscale-4">
          <span
            aria-hidden="true"
            className="font-mono font-semibold text-[10px] text-grayscale-10 uppercase leading-none"
          >
            Burn color
          </span>
          <div className="flex flex-wrap items-center gap-1">
            {burnOptions.map((option) => (
              <button
                aria-pressed={burnColor === option.value}
                className="flex h-8 cursor-pointer items-center gap-2 rounded-lg border border-transparent px-2.5 font-medium text-grayscale-10 text-xs transition-[background-color,border-color,color,transform] duration-160 ease-[cubic-bezier(0.23,1,0.32,1)] hover:bg-grayscale-2 hover:text-grayscale-12 focus-visible:outline-2 focus-visible:outline-grayscale-8 focus-visible:outline-offset-2 active:scale-[0.97] data-[active=true]:border-grayscale-4 data-[active=true]:bg-grayscale-2 data-[active=true]:text-grayscale-12 dark:hover:bg-grayscale-3 dark:data-[active=true]:border-grayscale-5 dark:data-[active=true]:bg-grayscale-4 motion-reduce:transition-none"
                data-active={burnColor === option.value}
                key={option.value}
                onClick={() => setBurnColor(option.value)}
                type="button"
              >
                <span
                  aria-hidden="true"
                  className="size-3 rounded-full border border-black/10 shadow-[inset_0_1px_0_rgb(255_255_255_/_28%)]"
                  style={{ backgroundColor: option.color }}
                />
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </fieldset>
    </div>
  );
}
