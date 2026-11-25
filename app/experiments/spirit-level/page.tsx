import type { Metadata } from "next";
import { ExperimentPage } from "@/app/experiments/_components/ExperimentPage";
import { SourcePanel } from "@/app/experiments/_components/SourcePanel";
import { buildSourceTabs, readSourceFile } from "@/app/experiments/_lib/source";
import { SpiritLevelShowcase } from "./spirit-level-showcase";

const title = "Spirit Level | dqnamo";
const description =
  "A spirit level whose bubble drifts uphill through the spirit and settles between the lines.";

export const metadata: Metadata = {
  title,
  description,
  openGraph: {
    title,
    description,
    siteName: "dqnamo",
    type: "website",
    url: "/experiments/spirit-level",
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
  },
};

export default async function SpiritLevelPage() {
  const [levelSource, showcaseSource] = await Promise.all([
    readSourceFile("components/SpiritLevel.tsx"),
    readSourceFile("app/experiments/spirit-level/spirit-level-showcase.tsx"),
  ]);
  const tabs = await buildSourceTabs([
    {
      label: "SpiritLevel.tsx",
      source: levelSource,
      value: "level",
    },
    {
      label: "Example.tsx",
      source: showcaseSource,
      value: "example",
    },
  ]);

  return (
    <ExperimentPage
      description="A spirit level whose bubble drifts uphill through the spirit and settles between the lines. Tilt it level, stand it plumb, or find 45°."
      slug="spirit-level"
      title="Spirit Level"
    >
      <SpiritLevelShowcase />
      <div className="w-full overflow-hidden rounded-[13px] border border-grayscale-3 bg-grayscale-1 small-shadow dark:border-grayscale-4 dark:bg-grayscale-3 dark:shadow-none">
        <SourcePanel tabs={tabs} />
      </div>
    </ExperimentPage>
  );
}
