import type { Metadata } from "next";
import { ExperimentPage } from "@/app/experiments/_components/ExperimentPage";
import { SourcePanel } from "@/app/experiments/_components/SourcePanel";
import { buildSourceTabs, readSourceFile } from "@/app/experiments/_lib/source";
import { RingPullShowcase } from "./ring-pull-showcase";

const title = "Ring Pull | dqnamo";
const description =
  "A can's ring pull that strains against the score until it cracks with a hiss.";

export const metadata: Metadata = {
  title,
  description,
  openGraph: {
    title,
    description,
    siteName: "dqnamo",
    type: "website",
    url: "/experiments/ring-pull",
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
  },
};

export default async function RingPullPage() {
  const [ringPullSource, showcaseSource] = await Promise.all([
    readSourceFile("components/RingPull.tsx"),
    readSourceFile("app/experiments/ring-pull/ring-pull-showcase.tsx"),
  ]);
  const tabs = await buildSourceTabs([
    {
      label: "RingPull.tsx",
      source: ringPullSource,
      value: "ring-pull",
    },
    {
      label: "Example.tsx",
      source: showcaseSource,
      value: "example",
    },
  ]);

  return (
    <ExperimentPage
      description="A can's ring pull that strains against the score until it cracks with a hiss, then levers the tongue down into the drink. Drag the ring up, or use the arrow keys."
      slug="ring-pull"
      title="Ring Pull"
    >
      <RingPullShowcase />
      <div className="w-full overflow-hidden rounded-[13px] border border-grayscale-3 bg-grayscale-1 small-shadow dark:border-grayscale-4 dark:bg-grayscale-3 dark:shadow-none">
        <SourcePanel tabs={tabs} />
      </div>
    </ExperimentPage>
  );
}
