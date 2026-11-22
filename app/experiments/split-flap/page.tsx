import type { Metadata } from "next";
import { ExperimentPage } from "@/app/experiments/_components/ExperimentPage";
import { SourcePanel } from "@/app/experiments/_components/SourcePanel";
import { buildSourceTabs, readSourceFile } from "@/app/experiments/_lib/source";
import { usageSource } from "./copy-content";
import { SplitFlapShowcase } from "./split-flap-showcase";

const description =
  "A departures board of split-flap drums that only turn forwards, leaf by leaf, until each one clacks onto its letter.";

export const metadata: Metadata = {
  title: "Split-Flap Display | dqnamo",
  description,
};

export default async function SplitFlapPage() {
  const [componentSource, styleSource] = await Promise.all([
    readSourceFile("components/SplitFlap.tsx"),
    readSourceFile("components/SplitFlap.module.css"),
  ]);
  const tabs = await buildSourceTabs([
    {
      label: "SplitFlap.tsx",
      source: componentSource,
      value: "component",
    },
    {
      label: "SplitFlap.module.css",
      language: "css",
      source: styleSource,
      value: "styles",
    },
    { label: "Usage.tsx", source: usageSource, value: "usage" },
  ]);

  return (
    <ExperimentPage
      description={description}
      slug="split-flap"
      title="Split-Flap Display"
    >
      <SplitFlapShowcase />
      <div className="w-full overflow-hidden rounded-[13px] border border-grayscale-3 bg-grayscale-1 small-shadow dark:border-grayscale-4 dark:bg-grayscale-3 dark:shadow-none">
        <SourcePanel tabs={tabs} />
      </div>
    </ExperimentPage>
  );
}
