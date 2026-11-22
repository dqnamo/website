import type { Metadata } from "next";
import { ExperimentPage } from "@/app/experiments/_components/ExperimentPage";
import { SourcePanel } from "@/app/experiments/_components/SourcePanel";
import { buildSourceTabs, readSourceFile } from "@/app/experiments/_lib/source";
import { GuardedSwitchShowcase } from "./guarded-switch-showcase";

export const metadata: Metadata = {
  title: "Guarded Switch | dqnamo",
  description:
    "A toggle under a flip-up safety guard. Lift the guard, throw the switch, and closing it knocks the switch back off.",
};

export default async function GuardedSwitchPage() {
  const [componentSource, showcaseSource] = await Promise.all([
    readSourceFile("components/GuardedSwitch.tsx"),
    readSourceFile(
      "app/experiments/guarded-switch/guarded-switch-showcase.tsx",
    ),
  ]);
  const tabs = await buildSourceTabs([
    {
      label: "GuardedSwitch.tsx",
      source: componentSource,
      value: "component",
    },
    {
      label: "Example.tsx",
      source: showcaseSource,
      value: "example",
    },
  ]);

  return (
    <ExperimentPage
      description="A toggle under a flip-up safety guard. Click or drag the guard up, then throw the switch. Shut the guard on a thrown switch and its lip knocks the lever back to safe."
      slug="guarded-switch"
      title="Guarded Switch"
    >
      <GuardedSwitchShowcase />
      <div className="w-full overflow-hidden rounded-[13px] border border-grayscale-3 bg-grayscale-1 small-shadow dark:border-grayscale-4 dark:bg-grayscale-3 dark:shadow-none">
        <SourcePanel tabs={tabs} />
      </div>
    </ExperimentPage>
  );
}
