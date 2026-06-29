import type { Metadata } from "next";
import { ExperimentPage } from "@/app/experiments/_components/ExperimentPage";
import { SourcePanel } from "@/app/experiments/_components/SourcePanel";
import { buildSourceTabs } from "@/app/experiments/_lib/source";
import { componentSource, usageSource } from "./copy-content";
import { ScrollFadeListShowcase } from "./scroll-fade-list";

export const metadata: Metadata = {
  title: "Scroll fade list | dqnamo",
  description: "A compact scrollable list with scroll-linked edge fades.",
};

export default async function ScrollFadeListPage() {
  const tabs = await buildSourceTabs([
    {
      label: "ScrollFadeList.tsx",
      source: componentSource,
      value: "component",
    },
    { label: "Usage.tsx", source: usageSource, value: "usage" },
  ]);

  return (
    <ExperimentPage
      description="A scrollable list with gradient fade edges to show that there is more content above or below."
      sectionClassName="dark:border-grayscale-3 dark:bg-grayscale-2"
      slug="scroll-fade-list"
      title="Scroll Fade List"
    >
      <div className="flex min-h-[34rem] w-full items-center justify-center rounded-[13px] border border-grayscale-3 bg-grayscale-1 p-4 small-shadow dark:border-grayscale-4 dark:bg-grayscale-2 dark:shadow-none md:p-8">
        <ScrollFadeListShowcase />
      </div>
      <div className="w-full overflow-hidden rounded-[13px] border border-grayscale-3 bg-grayscale-1 small-shadow dark:border-grayscale-4 dark:bg-grayscale-3 dark:shadow-none">
        <SourcePanel tabs={tabs} />
      </div>
    </ExperimentPage>
  );
}
