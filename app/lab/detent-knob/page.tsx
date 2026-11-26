import type { Metadata } from "next";
import { ExperimentPage } from "@/app/lab/_components/ExperimentPage";
import { SourcePanel } from "@/app/lab/_components/SourcePanel";
import { buildSourceTabs, readSourceFile } from "@/app/lab/_lib/source";
import { DetentKnobShowcase } from "./detent-knob-showcase";

const title = "Detent Knob | dqnamo";
const description =
  "A hi-fi volume knob that hangs on to each notch, then clicks into the next.";

export const metadata: Metadata = {
  title,
  description,
  openGraph: {
    title,
    description,
    siteName: "dqnamo",
    type: "website",
    url: "/lab/detent-knob",
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
  },
};

export default async function DetentKnobPage() {
  const [knobSource, showcaseSource] = await Promise.all([
    readSourceFile("components/DetentKnob.tsx"),
    readSourceFile("app/lab/detent-knob/detent-knob-showcase.tsx"),
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
      description="A hi-fi volume knob that hangs on to each notch, then clicks into the next. Drag it round, scroll it, or use the arrow keys."
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
