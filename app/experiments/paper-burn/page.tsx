import type { Metadata } from "next";
import { ExperimentPage } from "@/app/experiments/_components/ExperimentPage";
import { SourcePanel } from "@/app/experiments/_components/SourcePanel";
import { buildSourceTabs, readSourceFile } from "@/app/experiments/_lib/source";
import { PaperBurnShowcase } from "./paper-burn-showcase";

export const metadata: Metadata = {
  title: "Paper Burn | dqnamo",
  description:
    "A reusable GPU paper-burn effect with a procedural ember edge and ash particles, rendered without Three.js.",
};

export default async function PaperBurnPage() {
  const [componentSource, rendererSource, cssSource] = await Promise.all([
    readSourceFile("components/PaperBurn.tsx"),
    readSourceFile("components/PaperBurnWebGL.ts"),
    readSourceFile("components/PaperBurn.module.css"),
  ]);
  const tabs = await buildSourceTabs([
    {
      label: "PaperBurn.tsx",
      source: componentSource,
      value: "component",
    },
    {
      label: "PaperBurnWebGL.ts",
      language: "ts",
      source: rendererSource,
      value: "renderer",
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
      description="An arbitrary div burns away with a procedural WebGL edge, glow, curl, embers, and ash—without Three.js."
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
