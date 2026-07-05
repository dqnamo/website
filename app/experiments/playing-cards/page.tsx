import type { Metadata } from "next";
import { ExperimentPage } from "@/app/experiments/_components/ExperimentPage";
import { SourcePanel } from "@/app/experiments/_components/SourcePanel";
import { buildSourceTabs, readSourceFile } from "@/app/experiments/_lib/source";
import { usageSource } from "./copy-content";
import { PlayingCardsShowcase } from "./playing-cards-showcase";

export const metadata: Metadata = {
  title: "Playing Cards | dqnamo",
  description:
    "Mini playing cards built from Phosphor suit icons, dealt into a fanned hand.",
};

export default async function PlayingCardsPage() {
  const componentSource = await readSourceFile("components/PlayingCard.tsx");
  const tabs = await buildSourceTabs([
    {
      label: "PlayingCard.tsx",
      source: componentSource,
      value: "component",
    },
    { label: "Usage.tsx", source: usageSource, value: "usage" },
  ]);

  return (
    <ExperimentPage
      description="Mini playing cards that only need a rank and a Phosphor suit icon. Five cards are dealt into a fanned hand with a springy stagger."
      slug="playing-cards"
      title="Playing Cards"
    >
      <div className="flex min-h-[28rem] w-full items-center justify-center rounded-[13px] border border-grayscale-3 bg-grayscale-1 p-4 small-shadow dark:border-transparent dark:bg-grayscale-2 dark:shadow-none sm:p-8">
        <PlayingCardsShowcase />
      </div>
      <div className="w-full overflow-hidden rounded-[13px] border border-grayscale-3 bg-grayscale-1 small-shadow dark:border-grayscale-4 dark:bg-grayscale-3 dark:shadow-none">
        <SourcePanel tabs={tabs} />
      </div>
    </ExperimentPage>
  );
}
