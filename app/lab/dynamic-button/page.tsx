import type { Metadata } from "next";
import { ExperimentPage } from "@/app/lab/_components/ExperimentPage";
import { SourcePanel } from "@/app/lab/_components/SourcePanel";
import { buildSourceTabs } from "@/app/lab/_lib/source";
import { componentSource, usageSource } from "./copy-content";
import { DynamicButtonShowcase } from "./dynamic-button-showcase";

export const metadata: Metadata = {
  title: "Dynamic button | dqnamo",
  description:
    "A button component that animates its width and text when the label changes.",
};

export default async function DynamicButtonPage() {
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
      description="A button that resizes to fit its label and crossfades the text and icon when the action or state changes."
      slug="dynamic-button"
      title="Dynamic Button"
    >
      <DynamicButtonShowcase />
      <div className="w-full overflow-hidden rounded-[13px] border border-grayscale-3 bg-grayscale-1 small-shadow dark:border-grayscale-4 dark:bg-grayscale-3 dark:shadow-none">
        <SourcePanel tabs={tabs} />
      </div>
    </ExperimentPage>
  );
}
