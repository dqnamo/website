import type { Metadata } from "next";
import { ExperimentPage } from "@/app/experiments/_components/ExperimentPage";
import { SourcePanel } from "@/app/experiments/_components/SourcePanel";
import { buildSourceTabs, readSourceFile } from "@/app/experiments/_lib/source";
import { CassettePlayer } from "./cassette-player";

export const metadata: Metadata = {
  title: "Cassette Player | dqnamo",
  description:
    "A tactile audio player inspired by the labels, reels, and mechanical controls of a compact cassette.",
};

export default async function CassettePlayerPage() {
  const componentSource = await readSourceFile(
    "app/experiments/cassette-player/cassette-player.tsx",
  );
  const tabs = await buildSourceTabs([
    {
      label: "CassettePlayer.tsx",
      source: componentSource,
      value: "component",
    },
  ]);

  return (
    <ExperimentPage
      description="A compact audio player built into a cassette. Press play on the shell and the reels turn, the tape transfers from left to right, and the printed stripe becomes the seek control."
      slug="cassette-player"
      title="Cassette Player"
    >
      <CassettePlayer />
      <div className="w-full overflow-hidden rounded-[13px] border border-grayscale-3 bg-grayscale-1 small-shadow dark:border-grayscale-4 dark:bg-grayscale-3 dark:shadow-none">
        <SourcePanel tabs={tabs} />
      </div>
    </ExperimentPage>
  );
}
