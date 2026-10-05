import type { Metadata } from "next";
import { ExperimentPage } from "@/app/experiments/_components/ExperimentPage";
import { SourcePanel } from "@/app/experiments/_components/SourcePanel";
import { buildSourceTabs, readSourceFile } from "@/app/experiments/_lib/source";
import { usageSource } from "./copy-content";
import { DynamicButtonV2Showcase } from "./dynamic-button-v2-showcase";

export const metadata: Metadata = {
  title: "Dynamic Button v2 | dqnamo",
  description:
    "A button that follows an action from idle to loading to done, resizing to fit each label and animating only the words that change.",
};

export default async function DynamicButtonV2Page() {
  const componentSource = await readSourceFile(
    "components/DynamicButtonV2.tsx",
  );
  const tabs = await buildSourceTabs([
    {
      label: "DynamicButton.tsx",
      source: componentSource,
      value: "component",
    },
    { label: "Usage.tsx", source: usageSource, value: "usage" },
  ]);

  return (
    <ExperimentPage
      description="A button that follows an action from idle to loading to done, resizing to fit each label and animating only the words that change."
      slug="dynamic-button-v2"
      title="Dynamic Button v2"
    >
      <DynamicButtonV2Showcase />
      <div className="w-full overflow-hidden rounded-[13px] border border-grayscale-3 bg-grayscale-1 small-shadow dark:border-grayscale-4 dark:bg-grayscale-3 dark:shadow-none">
        <SourcePanel tabs={tabs} />
      </div>
    </ExperimentPage>
  );
}
