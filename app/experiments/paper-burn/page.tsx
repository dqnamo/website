import type { Metadata } from "next";
import { ExperimentPage } from "@/app/experiments/_components/ExperimentPage";
import { SourcePanel } from "@/app/experiments/_components/SourcePanel";
import { buildSourceTabs, readSourceFile } from "@/app/experiments/_lib/source";
import { PaperBurnShowcase } from "./paper-burn-showcase";

export const metadata: Metadata = {
  title: "Paper Burn | dqnamo",
  description:
    "A reusable paper-burn effect made with an SVG turbulence mask, ember edge, and ash particles.",
};

export default async function PaperBurnPage() {
  const [componentSource, cssSource] = await Promise.all([
    readSourceFile("components/PaperBurn.tsx"),
    readSourceFile("components/PaperBurn.module.css"),
  ]);
  const tabs = await buildSourceTabs([
    {
      label: "PaperBurn.tsx",
      source: componentSource,
      value: "component",
    },
    {
      label: "PaperBurn.module.css",
      language: "css",
      source: cssSource,
      value: "styles",
    },
  ]);

  return (
    <ExperimentPage
      description="An arbitrary div burns away from one corner with a distorted SVG mask, a hot ember edge, and a short trail of ash."
      slug="paper-burn"
      title="Paper Burn"
    >
      <PaperBurnShowcase />
      <div className="w-full overflow-hidden rounded-[13px] border border-grayscale-3 bg-grayscale-1 small-shadow dark:border-grayscale-4 dark:bg-grayscale-3 dark:shadow-none">
        <SourcePanel tabs={tabs} />
      </div>
    </ExperimentPage>
  );
}
