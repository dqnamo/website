import type { Metadata } from "next";
import { ExperimentPage } from "@/app/experiments/_components/ExperimentPage";
import { SourcePanel } from "@/app/experiments/_components/SourcePanel";
import { buildSourceTabs, readSourceFile } from "@/app/experiments/_lib/source";
import { PullCordShowcase } from "./pull-cord-showcase";

const title = "Pull Cord | dqnamo";
const description =
  "A ceiling light switch whose cord stretches, clacks, and swings back on its own.";

export const metadata: Metadata = {
  title,
  description,
  openGraph: {
    title,
    description,
    siteName: "dqnamo",
    type: "website",
    url: "/experiments/pull-cord",
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
  },
};

export default async function PullCordPage() {
  const [cordSource, showcaseSource] = await Promise.all([
    readSourceFile("components/PullCord.tsx"),
    readSourceFile("app/experiments/pull-cord/pull-cord-showcase.tsx"),
  ]);
  const tabs = await buildSourceTabs([
    {
      label: "PullCord.tsx",
      source: cordSource,
      value: "cord",
    },
    {
      label: "Example.tsx",
      source: showcaseSource,
      value: "example",
    },
  ]);

  return (
    <ExperimentPage
      description="A ceiling light switch on a braided cord. Draw it down until the switch clacks, then let go and watch it hop back and swing. Flick it sideways for a bigger swing."
      slug="pull-cord"
      title="Pull Cord"
    >
      <PullCordShowcase />
      <div className="w-full overflow-hidden rounded-[13px] border border-grayscale-3 bg-grayscale-1 small-shadow dark:border-grayscale-4 dark:bg-grayscale-3 dark:shadow-none">
        <SourcePanel tabs={tabs} />
      </div>
    </ExperimentPage>
  );
}
