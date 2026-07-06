import type { Metadata } from "next";
import { ExperimentPage } from "@/app/experiments/_components/ExperimentPage";
import { SourcePanel } from "@/app/experiments/_components/SourcePanel";
import { buildSourceTabs, readSourceFile } from "@/app/experiments/_lib/source";
import { PlayingCardsShowcase } from "./playing-cards-showcase";

export const metadata: Metadata = {
  title: "Playing Cards | dqnamo",
  description:
    "Classic playing cards you can fan out, thumb through, and play.",
};

export default async function PlayingCardsPage() {
  const [playingCardSource, playingCardFanSource] = await Promise.all([
    readSourceFile("components/PlayingCard.tsx"),
    readSourceFile("components/PlayingCardFan.tsx"),
  ]);
  const tabs = await buildSourceTabs([
    {
      label: "PlayingCard.tsx",
      source: playingCardSource,
      value: "card",
    },
    {
      label: "PlayingCardFan.tsx",
      source: playingCardFanSource,
      value: "fan",
    },
  ]);

  return (
    <ExperimentPage
      description="A composable playing card and an interactive fan. Hover to thumb through the hand, then click or flick a card upward to play it."
      slug="playing-cards"
      title="Playing Cards"
    >
      <PlayingCardsShowcase />
      <div className="w-full overflow-hidden rounded-[13px] border border-grayscale-3 bg-grayscale-1 small-shadow dark:border-grayscale-4 dark:bg-grayscale-3 dark:shadow-none">
        <SourcePanel tabs={tabs} />
      </div>
    </ExperimentPage>
  );
}
