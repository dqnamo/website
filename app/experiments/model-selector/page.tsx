import type { Metadata } from "next";
import { ExperimentPage } from "@/app/experiments/_components/ExperimentPage";
import { SourcePanel } from "@/app/experiments/_components/SourcePanel";
import { buildSourceTabs, readSourceFile } from "@/app/experiments/_lib/source";
import { ModelSelectorPrompt } from "@/app/experiments/model-selector/model-selector-prompt";
import { MODEL_SELECTOR_PROMPT, MODEL_SELECTOR_USAGE } from "./copy-content";

export const metadata: Metadata = {
  title: "Advanced Model Selector | dqnamo",
  description:
    "A benchmark-informed model selection interface for current frontier models.",
};

export default async function ModelSelectorPage() {
  const componentSource = await readSourceFile(
    "app/experiments/model-selector/model-selector-prompt.tsx",
  );
  const tabs = await buildSourceTabs([
    {
      label: "Usage.tsx",
      source: MODEL_SELECTOR_USAGE,
      value: "usage",
    },
    {
      label: "Prompt.md",
      language: "markdown",
      source: MODEL_SELECTOR_PROMPT,
      value: "prompt",
    },
    { label: "Component.tsx", source: componentSource, value: "component" },
  ]);

  return (
    <ExperimentPage
      description="A benchmark informed selector for comparing current frontier models across capability, speed, context, and cost."
      slug="model-selector"
      title="Advanced Model Selector"
    >
      <div className="flex min-h-[28rem] w-full items-center justify-center rounded-[13px] border border-grayscale-3 bg-grayscale-1 small-shadow dark:border-transparent dark:bg-grayscale-2 dark:shadow-none">
        <ModelSelectorPrompt />
      </div>
      <div className="w-full overflow-hidden rounded-[13px] border border-grayscale-3 bg-grayscale-1 small-shadow dark:border-grayscale-4 dark:bg-grayscale-3 dark:shadow-none">
        <SourcePanel tabs={tabs} />
      </div>
    </ExperimentPage>
  );
}
