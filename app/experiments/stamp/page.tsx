import type { Metadata } from "next";
import { ExperimentPage } from "@/app/experiments/_components/ExperimentPage";
import { SourcePanel } from "@/app/experiments/_components/SourcePanel";
import { buildSourceTabs, readSourceFile } from "@/app/experiments/_lib/source";
import { StampShowcase } from "./stamp-showcase";

export const metadata: Metadata = {
  title: "Stamp | dqnamo",
  description:
    "A reusable postage stamp frame for images, text, and custom React content.",
};

export default async function StampPage() {
  const [stampSource, showcaseSource] = await Promise.all([
    readSourceFile("components/Stamp.tsx"),
    readSourceFile("app/experiments/stamp/stamp-showcase.tsx"),
  ]);
  const tabs = await buildSourceTabs([
    {
      label: "Stamp.tsx",
      source: stampSource,
      value: "stamp",
    },
    {
      label: "Example.tsx",
      source: showcaseSource,
      value: "example",
    },
  ]);

  return (
    <ExperimentPage
      description="A reusable postage stamp frame for images, text, and custom React content."
      slug="stamp"
      title="Stamp"
    >
      <StampShowcase />
      <div className="w-full overflow-hidden rounded-[13px] border border-grayscale-3 bg-grayscale-1 small-shadow dark:border-grayscale-4 dark:bg-grayscale-3 dark:shadow-none">
        <SourcePanel tabs={tabs} />
      </div>
    </ExperimentPage>
  );
}
