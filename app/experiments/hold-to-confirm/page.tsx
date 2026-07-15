import type { Metadata } from "next";
import { ExperimentPage } from "@/app/experiments/_components/ExperimentPage";
import { SourcePanel } from "@/app/experiments/_components/SourcePanel";
import { buildSourceTabs, readSourceFile } from "@/app/experiments/_lib/source";
import { usageSource } from "./copy-content";
import { HoldToConfirmShowcase } from "./hold-to-confirm-showcase";

export const metadata: Metadata = {
  title: "Hold to Confirm | dqnamo",
  description:
    "A deliberate confirmation button with reversible hold progress and a timed undo state.",
};

export default async function HoldToConfirmPage() {
  const [componentSource, undoNoticeSource] = await Promise.all([
    readSourceFile("components/HoldToConfirmButton.tsx"),
    readSourceFile("components/UndoNotice.tsx"),
  ]);
  const tabs = await buildSourceTabs([
    {
      label: "HoldToConfirmButton.tsx",
      source: componentSource,
      value: "component",
    },
    {
      label: "UndoNotice.tsx",
      source: undoNoticeSource,
      value: "undo",
    },
    { label: "Usage.tsx", source: usageSource, value: "usage" },
  ]);

  return (
    <ExperimentPage
      description="A press-and-hold confirmation for destructive actions. Releasing rolls the fill back, while completion replaces the actions with a timed undo notice before the modal closes."
      slug="hold-to-confirm"
      title="Hold to Confirm"
    >
      <HoldToConfirmShowcase />
      <div className="w-full overflow-hidden rounded-[13px] border border-grayscale-3 bg-grayscale-1 small-shadow dark:border-grayscale-4 dark:bg-grayscale-3 dark:shadow-none">
        <SourcePanel tabs={tabs} />
      </div>
    </ExperimentPage>
  );
}
