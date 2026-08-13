import type { Metadata } from "next";
import { ExperimentPage } from "@/app/experiments/_components/ExperimentPage";
import { SourcePanel } from "@/app/experiments/_components/SourcePanel";
import { buildSourceTabs, readSourceFile } from "@/app/experiments/_lib/source";
import { TactileButtonShowcase } from "./tactile-button-showcase";

export const metadata: Metadata = {
  title: "Tactile Button | dqnamo",
  description: "A tactile button study rebuilt one layer at a time.",
};

export default async function TactileButtonPage() {
  const componentSource = await readSourceFile(
    "app/experiments/tactile-button/tactile-button-showcase.tsx",
  );
  const tabs = await buildSourceTabs([
    {
      label: "Prototype.tsx",
      source: componentSource,
      value: "component",
    },
  ]);

  return (
    <ExperimentPage
      description="A tactile button study rebuilt one layer at a time, starting from a simple face."
      slug="tactile-button"
      title="Tactile Button"
    >
      <TactileButtonShowcase />
      <div className="w-full overflow-hidden rounded-[13px] border border-grayscale-3 bg-grayscale-1 small-shadow dark:border-grayscale-4 dark:bg-grayscale-3 dark:shadow-none">
        <SourcePanel tabs={tabs} />
      </div>
    </ExperimentPage>
  );
}
