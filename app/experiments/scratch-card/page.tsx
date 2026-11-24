import type { Metadata } from "next";
import { ExperimentPage } from "@/app/experiments/_components/ExperimentPage";
import { SourcePanel } from "@/app/experiments/_components/SourcePanel";
import { buildSourceTabs, readSourceFile } from "@/app/experiments/_lib/source";
import { ScratchCardShowcase } from "./scratch-card-showcase";

const title = "Scratch Card | dqnamo";
const description =
  "A scratch card whose latex flakes off under a coin and crumbles away once you're nearly there.";

export const metadata: Metadata = {
  title,
  description,
  openGraph: {
    title,
    description,
    siteName: "dqnamo",
    type: "website",
    url: "/experiments/scratch-card",
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
  },
};

export default async function ScratchCardPage() {
  const [cardSource, showcaseSource] = await Promise.all([
    readSourceFile("components/ScratchCard.tsx"),
    readSourceFile("app/experiments/scratch-card/scratch-card-showcase.tsx"),
  ]);
  const tabs = await buildSourceTabs([
    {
      label: "ScratchCard.tsx",
      source: cardSource,
      value: "card",
    },
    {
      label: "Example.tsx",
      source: showcaseSource,
      value: "example",
    },
  ]);

  return (
    <ExperimentPage
      description="A scratch card whose latex flakes off under a coin and crumbles away once you're nearly there. Drag across the panel, or press Enter to scratch it a strip at a time."
      slug="scratch-card"
      title="Scratch Card"
    >
      <ScratchCardShowcase />
      <div className="w-full overflow-hidden rounded-[13px] border border-grayscale-3 bg-grayscale-1 small-shadow dark:border-grayscale-4 dark:bg-grayscale-3 dark:shadow-none">
        <SourcePanel tabs={tabs} />
      </div>
    </ExperimentPage>
  );
}
