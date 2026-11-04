import type { Metadata } from "next";
import { ExperimentPage } from "@/app/experiments/_components/ExperimentPage";
import { SourcePanel } from "@/app/experiments/_components/SourcePanel";
import { buildSourceTabs, readSourceFile } from "@/app/experiments/_lib/source";
import { usageSource } from "./copy-content";
import { FilterQueryBuilderShowcase } from "./filter-query-builder-showcase";

export const metadata: Metadata = {
  title: "Filter Query Builder | dqnamo",
  description:
    "A keyboard-first filter bar with editable tokens and live previews of each option before you apply it.",
};

export default async function FilterQueryBuilderPage() {
  const componentSource = await readSourceFile(
    "components/FilterQueryBuilder.tsx",
  );
  const tabs = await buildSourceTabs([
    {
      label: "FilterQueryBuilder.tsx",
      source: componentSource,
      value: "component",
    },
    { label: "Usage.tsx", source: usageSource, value: "usage" },
  ]);

  return (
    <ExperimentPage
      description="A Linear-style filter bar for SaaS tables. Every token segment is editable in place, and highlighting an option previews its effect on the list before you commit it."
      slug="filter-query-builder"
      title="Filter Query Builder"
    >
      <FilterQueryBuilderShowcase />
      <div className="w-full overflow-hidden rounded-[13px] border border-grayscale-3 bg-grayscale-1 small-shadow dark:border-grayscale-4 dark:bg-grayscale-3 dark:shadow-none">
        <SourcePanel tabs={tabs} />
      </div>
    </ExperimentPage>
  );
}
