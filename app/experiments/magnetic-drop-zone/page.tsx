import type { Metadata } from "next";
import { ExperimentPage } from "@/app/experiments/_components/ExperimentPage";
import { SourcePanel } from "@/app/experiments/_components/SourcePanel";
import { buildSourceTabs, readSourceFile } from "@/app/experiments/_lib/source";
import { usageSource } from "./copy-content";
import { MagneticDropZoneShowcase } from "./magnetic-drop-zone-showcase";

export const metadata: Metadata = {
  title: "Magnetic Drop Zone | dqnamo",
  description:
    "A file drop zone that responds to an incoming drag before the pointer reaches it.",
};

export default async function MagneticDropZonePage() {
  const componentSource = await readSourceFile(
    "components/MagneticDropZone.tsx",
  );
  const tabs = await buildSourceTabs([
    {
      label: "MagneticDropZone.tsx",
      source: componentSource,
      value: "component",
    },
    { label: "Usage.tsx", source: usageSource, value: "usage" },
  ]);

  return (
    <ExperimentPage
      description="A file drop zone that notices an incoming drag, pulls gently toward the pointer, and settles into a clear ready state after the file lands."
      slug="magnetic-drop-zone"
      title="Magnetic Drop Zone"
    >
      <MagneticDropZoneShowcase />
      <div className="w-full overflow-hidden rounded-[13px] border border-grayscale-3 bg-grayscale-1 small-shadow dark:border-grayscale-4 dark:bg-grayscale-3 dark:shadow-none">
        <SourcePanel tabs={tabs} />
      </div>
    </ExperimentPage>
  );
}
