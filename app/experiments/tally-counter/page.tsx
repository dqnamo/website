import type { Metadata } from "next";
import { ExperimentPage } from "@/app/experiments/_components/ExperimentPage";
import { SourcePanel } from "@/app/experiments/_components/SourcePanel";
import { buildSourceTabs, readSourceFile } from "@/app/experiments/_lib/source";
import { TallyCounterShowcase } from "./tally-counter-showcase";

const title = "Tally Counter | dqnamo";
const description =
  "A steel hand counter whose wheels roll over with every press and race home to zero.";

export const metadata: Metadata = {
  title,
  description,
  openGraph: {
    title,
    description,
    siteName: "dqnamo",
    type: "website",
    url: "/experiments/tally-counter",
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
  },
};

export default async function TallyCounterPage() {
  const [counterSource, showcaseSource] = await Promise.all([
    readSourceFile("components/TallyCounter.tsx"),
    readSourceFile("app/experiments/tally-counter/tally-counter-showcase.tsx"),
  ]);
  const tabs = await buildSourceTabs([
    {
      label: "TallyCounter.tsx",
      source: counterSource,
      value: "counter",
    },
    {
      label: "Example.tsx",
      source: showcaseSource,
      value: "example",
    },
  ]);

  return (
    <ExperimentPage
      description="A steel hand counter whose wheels roll over with every press and race home to zero. Each count lands as the plunger bottoms out, carries tip the next wheel along, and the reset knob drags every wheel forward until it drops into its catch."
      slug="tally-counter"
      title="Tally Counter"
    >
      <TallyCounterShowcase />
      <div className="w-full overflow-hidden rounded-[13px] border border-grayscale-3 bg-grayscale-1 small-shadow dark:border-grayscale-4 dark:bg-grayscale-3 dark:shadow-none">
        <SourcePanel tabs={tabs} />
      </div>
    </ExperimentPage>
  );
}
