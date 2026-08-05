import type { Metadata } from "next";
import { ExperimentPage } from "@/app/experiments/_components/ExperimentPage";
import { SourcePanel } from "@/app/experiments/_components/SourcePanel";
import { buildSourceTabs, readSourceFile } from "@/app/experiments/_lib/source";
import { CassettePlayer } from "./cassette-player";
import { usageSource } from "./copy-content";

const title = "Cassette Audio Player | dqnamo";
const description =
  "A tactile audio player inspired by the labels, reels, and mechanical controls of a compact cassette.";

export const metadata: Metadata = {
  title,
  description,
  openGraph: {
    title,
    description,
    siteName: "dqnamo",
    type: "website",
    url: "/experiments/cassette-player",
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
  },
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
    { label: "Usage.tsx", source: usageSource, value: "usage" },
  ]);

  return (
    <ExperimentPage
      description="A compact audio player built into a cassette."
      slug="cassette-player"
      title="Cassette Audio Player"
    >
      <CassettePlayer />
      <div className="w-full overflow-hidden rounded-[13px] border border-grayscale-3 bg-grayscale-1 small-shadow dark:border-grayscale-4 dark:bg-grayscale-3 dark:shadow-none">
        <SourcePanel defaultValue="usage" tabs={tabs} />
      </div>
    </ExperimentPage>
  );
}
