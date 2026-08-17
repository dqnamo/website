"use client";

import Image from "next/image";
import posthog from "posthog-js";
import { PikaArrowRightIcon, PikaPhoneIcon } from "@/components/PikaDockIcons";
import Button from "@/components/public/Button";
import { GameOfLife } from "@/components/random/GameOfLife";
import { cn } from "@/helpers/classname-helper";

type WorkWithMeCtaProps = {
  className?: string;
};

export function WorkWithMeCta({ className }: WorkWithMeCtaProps) {
  return (
    <section
      className={cn(
        "grid min-h-0 grid-cols-1 gap-1.5 rounded-[16px] border border-grayscale-3 bg-grayscale-2 p-1.5 md:grid-cols-2",
        className,
      )}
    >
      <div className="flex w-full flex-col items-center justify-center gap-1.5 rounded-[13px] border border-grayscale-3 bg-grayscale-1 small-shadow dark:border-transparent dark:bg-grayscale-2 dark:shadow-none">
        <div className="flex flex-col gap-1.5 p-8">
          <p className="text-balance text-grayscale-12 text-sm">
            Want to work with me?
          </p>
          <p className="text-pretty text-grayscale-10 text-sm">
            I run a lil design engineering studio in London where we do
            fractional design engineering for startups.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              href="https://cal.com/interface.london/20min"
              target="_blank"
              rel="noopener noreferrer"
              variant="primary"
              className="w-max justify-start border-b-2"
              onClick={() => posthog.capture("work_with_me_cta_clicked")}
            >
              Jump on a call
              <PikaPhoneIcon aria-hidden="true" size={14} />
            </Button>
            <Button
              href="https://interface.london"
              target="_blank"
              rel="noopener noreferrer"
              variant="secondary"
              className="w-max justify-start border-b-2 text-left dark:border-grayscale-5 dark:bg-grayscale-4 dark:hover:border-grayscale-6 dark:hover:bg-grayscale-5"
            >
              Learn more
              <PikaArrowRightIcon aria-hidden="true" size={14} />
            </Button>
          </div>
        </div>
      </div>
      <a
        href="https://interface.london"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Visit The Interface Company of London"
        className="group relative flex min-h-[12rem] w-full items-center justify-center overflow-hidden rounded-[13px] border border-grayscale-3 bg-grayscale-1 small-shadow transition-colors hover:border-grayscale-4 focus-visible:outline-2 focus-visible:outline-grayscale-12 focus-visible:outline-offset-2 dark:border-grayscale-4 dark:bg-grayscale-3 dark:hover:border-grayscale-5"
      >
        <GameOfLife
          aria-hidden
          cellSize={14}
          density={0.24}
          fadeDuration={520}
          maxOpacity={1}
          stepInterval={520}
          className="absolute inset-0 [--game-of-life-color:var(--color-grayscale-3)] dark:[--game-of-life-color:var(--color-grayscale-4)]"
        />
        <Image
          alt=""
          className="relative z-10 size-16 dark:invert"
          height={64}
          src="/logos/interface-logo-black.svg"
          width={64}
        />
      </a>
    </section>
  );
}
