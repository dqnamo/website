import type { Metadata } from "next";
import { ExperimentPage } from "@/app/experiments/_components/ExperimentPage";
import { SourcePanel } from "@/app/experiments/_components/SourcePanel";
import { buildSourceTabs, readSourceFile } from "@/app/experiments/_lib/source";
import { AnimatedSparklineShowcase } from "./animated-sparkline-showcase";
import { usageSource } from "./copy-content";

export const metadata: Metadata = {
  title: "Animated sparkline | dqnamo",
  description:
    "A compact SVG sparkline that animates between trend states and adapts its color to the data.",
};

export default async function AnimatedSparklinePage() {
  const [animatedSparklineSource, sparklineSource] = await Promise.all([
    readSourceFile("components/AnimatedSparkline.tsx"),
    readSourceFile("components/Sparkline.tsx"),
  ]);
  const tabs = await buildSourceTabs([
    {
      label: "AnimatedSparkline.tsx",
      source: animatedSparklineSource,
      value: "component",
    },
    { label: "Sparkline.tsx", source: sparklineSource, value: "sparkline" },
    { label: "Usage.tsx", source: usageSource, value: "usage" },
  ]);

  return (
    <ExperimentPage
      description="A compact SVG sparkline that draws itself, morphs between trend states, and shifts color for positive or negative movement."
      slug="animated-sparkline"
      title="Animated Sparkline"
    >
      <AnimatedSparklineShowcase />
      <div className="w-full overflow-hidden rounded-[13px] border border-grayscale-3 bg-grayscale-1 small-shadow dark:border-grayscale-4 dark:bg-grayscale-3 dark:shadow-none">
        <SourcePanel tabs={tabs} />
      </div>
    </ExperimentPage>
  );
}
