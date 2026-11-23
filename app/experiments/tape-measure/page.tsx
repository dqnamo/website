import type { Metadata } from "next";
import { ExperimentPage } from "@/app/experiments/_components/ExperimentPage";
import { SourcePanel } from "@/app/experiments/_components/SourcePanel";
import { buildSourceTabs, readSourceFile } from "@/app/experiments/_lib/source";
import { TapeMeasureShowcase } from "./tape-measure-showcase";

export const metadata: Metadata = {
  title: "Tape Measure | dqnamo",
  description:
    "A pocket tape you pull out by the hook, lock with your thumb, and let snap back home.",
};

export default async function TapeMeasurePage() {
  const [tapeSource, showcaseSource] = await Promise.all([
    readSourceFile("components/TapeMeasure.tsx"),
    readSourceFile("app/experiments/tape-measure/tape-measure-showcase.tsx"),
  ]);
  const tabs = await buildSourceTabs([
    {
      label: "TapeMeasure.tsx",
      source: tapeSource,
      value: "tape",
    },
    {
      label: "Example.tsx",
      source: showcaseSource,
      value: "example",
    },
  ]);

  return (
    <ExperimentPage
      description="A pocket tape you pull out by the hook, lock with your thumb, and let snap back home. The spring winds it in faster and faster until the hook clacks against the case."
      slug="tape-measure"
      title="Tape Measure"
    >
      <TapeMeasureShowcase />
      <div className="w-full overflow-hidden rounded-[13px] border border-grayscale-3 bg-grayscale-1 small-shadow dark:border-grayscale-4 dark:bg-grayscale-3 dark:shadow-none">
        <SourcePanel tabs={tabs} />
      </div>
    </ExperimentPage>
  );
}
