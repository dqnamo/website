import type { Metadata } from "next";
import { ExperimentPage } from "@/app/experiments/_components/ExperimentPage";
import { SourcePanel } from "@/app/experiments/_components/SourcePanel";
import { buildSourceTabs, readSourceFile } from "@/app/experiments/_lib/source";
import { HourglassShowcase } from "./hourglass-showcase";

const title = "Hourglass | dqnamo";
const description =
  "A sand timer you turn over, whose sand slumps, funnels and heaps grain by grain.";

export const metadata: Metadata = {
  title,
  description,
  openGraph: {
    title,
    description,
    siteName: "dqnamo",
    type: "website",
    url: "/experiments/hourglass",
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
  },
};

export default async function HourglassPage() {
  const [hourglassSource, showcaseSource] = await Promise.all([
    readSourceFile("components/Hourglass.tsx"),
    readSourceFile("app/experiments/hourglass/hourglass-showcase.tsx"),
  ]);
  const tabs = await buildSourceTabs([
    {
      label: "Hourglass.tsx",
      source: hourglassSource,
      value: "hourglass",
    },
    {
      label: "Example.tsx",
      source: showcaseSource,
      value: "example",
    },
  ]);

  return (
    <ExperimentPage
      description="A sand timer you turn over. The sand slumps onto its new floor, sinks into a funnel as it drains, and heaps up underneath. Click it, flick it over, or use the arrow keys."
      slug="hourglass"
      title="Hourglass"
    >
      <HourglassShowcase />
      <div className="w-full overflow-hidden rounded-[13px] border border-grayscale-3 bg-grayscale-1 small-shadow dark:border-grayscale-4 dark:bg-grayscale-3 dark:shadow-none">
        <SourcePanel tabs={tabs} />
      </div>
    </ExperimentPage>
  );
}
