import type { Metadata } from "next";
import { ExperimentPage } from "@/app/experiments/_components/ExperimentPage";
import { SourcePanel } from "@/app/experiments/_components/SourcePanel";
import { buildSourceTabs, readSourceFile } from "@/app/experiments/_lib/source";
import { DetentKnobShowcase } from "./detent-knob-showcase";

export const metadata: Metadata = {
  title: "Detent Knob | dqnamo",
  description:
    "A knurled hi-fi knob that hangs on to each notch, then clicks into the next.",
};

export default async function DetentKnobPage() {
  const [knobSource, showcaseSource] = await Promise.all([
    readSourceFile("components/DetentKnob.tsx"),
    readSourceFile("app/experiments/detent-knob/detent-knob-showcase.tsx"),
  ]);
  const tabs = await buildSourceTabs([
    {
      label: "DetentKnob.tsx",
      source: knobSource,
      value: "knob",
    },
    {
      label: "Example.tsx",
      source: showcaseSource,
      value: "example",
    },
  ]);

  return (
    <ExperimentPage
      description="A knurled hi-fi knob that hangs on to each notch, then clicks into the next. Drag it round, scroll it, or use the arrow keys."
      slug="detent-knob"
      title="Detent Knob"
    >
      <DetentKnobShowcase />
      <div className="w-full overflow-hidden rounded-[13px] border border-grayscale-3 bg-grayscale-1 small-shadow dark:border-grayscale-4 dark:bg-grayscale-3 dark:shadow-none">
        <SourcePanel tabs={tabs} />
      </div>
    </ExperimentPage>
  );
}
