import type { Metadata } from "next";
import Image from "next/image";
import { ExperimentLayout } from "@/app/experiments/_components/ExperimentPage";
import { WorkWithMeCta } from "@/components/WorkWithMeCta";
import { WorldCupCard } from "@/components/worldcup/world-cup-card";
import { BANNER_DEMO_COPY, BANNER_DEMO_INSTRUCTIONS } from "./copy-content";
import { InstructionPanel } from "./instruction-panel";

export const metadata: Metadata = {
  title: "Animated banner | dqnamo",
  description: "A centered animated World Cup 2026 banner component demo.",
};

export default function AnimatedBannerPage() {
  return (
    <ExperimentLayout
      description="A reusable animated banner pattern built from a generated poster, short video loop, gradient overlay, and compact call to action."
      title="Animated Banner"
    >
        <section className="mt-12 flex flex-col items-center justify-center gap-1.5 rounded-[16px] border border-grayscale-3 bg-grayscale-2 p-1.5">
          <div className="flex w-full items-center justify-center rounded-[13px] border border-grayscale-3 bg-grayscale-1 p-4 small-shadow dark:border-transparent dark:bg-grayscale-2 dark:shadow-none md:p-28">
            <div className="w-full">
              <WorldCupCard />
            </div>
          </div>
          <div className="w-full overflow-hidden rounded-[13px] border border-grayscale-3 bg-grayscale-1 small-shadow dark:border-grayscale-4 dark:bg-grayscale-3">
            <InstructionPanel
              copyText={BANNER_DEMO_COPY}
              instructions={BANNER_DEMO_INSTRUCTIONS}
            />
          </div>
        </section>

        <section className="flex flex-col items-start gap-2 px-2 pt-10 text-left">
          <p className="text-grayscale-10 text-xs leading-5">
            Built as part of my work on
          </p>
          <div className="flex items-center justify-start gap-3">
            <Image
              src="/images/beret.svg"
              alt=""
              width={28}
              height={28}
              className="size-7"
            />
            <Image
              src="/images/typography-full-blackOnNone-v2.svg"
              alt="Ask Gina"
              width={98}
              height={19}
              className="h-[19px] w-auto dark:hidden"
            />
            <Image
              src="/images/typography-full-whiteOnNone-v2.svg"
              alt="Ask Gina"
              width={98}
              height={19}
              className="hidden h-[19px] w-auto dark:block"
            />
          </div>
        </section>

        <WorkWithMeCta className="mt-10 mb-16" />
    </ExperimentLayout>
  );
}
