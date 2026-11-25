"use client";

import { ArrowClockwiseIcon } from "@phosphor-icons/react/dist/ssr";
import { type MouseEvent, useState } from "react";
import {
  type WaitlistJoinResult,
  WaitlistTicket,
} from "@/components/WaitlistTicket";

function mockJoinWaitlist(_email: string): Promise<WaitlistJoinResult> {
  return new Promise((resolve) => {
    window.setTimeout(() => {
      resolve({ peopleAhead: 247, position: 248 });
    }, 850);
  });
}

export function WaitlistTicketShowcase() {
  const [cycle, setCycle] = useState(0);

  function replay(_event: MouseEvent<HTMLButtonElement>) {
    setCycle((currentCycle) => currentCycle + 1);
  }

  return (
    <div className="relative flex min-h-[38rem] w-full items-start justify-center overflow-hidden rounded-[13px] border border-grayscale-3 bg-grayscale-1 px-4 pt-20 small-shadow dark:border-grayscale-4 dark:bg-grayscale-2 dark:shadow-none sm:px-8 sm:pt-16">
      <button
        aria-label="Reset waitlist ticket demo"
        className="absolute top-2 right-2 z-30 flex h-8 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-grayscale-3 bg-grayscale-1 px-2 font-medium text-grayscale-11 text-xs transition-[background-color,border-color,transform] duration-150 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)] hover:border-grayscale-4 hover:bg-grayscale-2 active:scale-[0.97] dark:border-grayscale-4 dark:bg-grayscale-3 dark:hover:border-grayscale-5 dark:hover:bg-grayscale-4 motion-reduce:transition-none"
        onClick={replay}
        type="button"
      >
        <ArrowClockwiseIcon aria-hidden="true" size={15} weight="bold" />
        Reset
      </button>

      <WaitlistTicket key={cycle} onJoin={mockJoinWaitlist} />
    </div>
  );
}
