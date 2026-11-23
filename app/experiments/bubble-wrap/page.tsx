import type { Metadata } from "next";
import { ExperimentPage } from "@/app/experiments/_components/ExperimentPage";
import { SourcePanel } from "@/app/experiments/_components/SourcePanel";
import { buildSourceTabs, readSourceFile } from "@/app/experiments/_lib/source";
import { BubbleWrapShowcase } from "./bubble-wrap-showcase";

const title = "Bubble Wrap | dqnamo";
const description =
  "A sheet of bubble wrap that holds out under your thumb, then gives with a pop.";

export const metadata: Metadata = {
  title,
  description,
  openGraph: {
    title,
    description,
    siteName: "dqnamo",
    type: "website",
    url: "/experiments/bubble-wrap",
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
  },
};

export default async function BubbleWrapPage() {
  const [bubbleWrapSource, showcaseSource] = await Promise.all([
    readSourceFile("components/BubbleWrap.tsx"),
    readSourceFile("app/experiments/bubble-wrap/bubble-wrap-showcase.tsx"),
  ]);
  const tabs = await buildSourceTabs([
    {
      label: "BubbleWrap.tsx",
      source: bubbleWrapSource,
      value: "bubble-wrap",
    },
    {
      label: "Example.tsx",
      source: showcaseSource,
      value: "example",
    },
  ]);

  return (
    <ExperimentPage
      description="A sheet of bubble wrap that holds out under your thumb, then gives with a pop. Every bubble takes a slightly different squeeze, lets go with a wobble if you stop early, and leaves its own crumpled film behind."
      slug="bubble-wrap"
      title="Bubble Wrap"
    >
      <BubbleWrapShowcase />
      <div className="w-full overflow-hidden rounded-[13px] border border-grayscale-3 bg-grayscale-1 small-shadow dark:border-grayscale-4 dark:bg-grayscale-3 dark:shadow-none">
        <SourcePanel tabs={tabs} />
      </div>
    </ExperimentPage>
  );
}
