import type { Metadata } from "next";
import { ExperimentPage } from "@/app/experiments/_components/ExperimentPage";
import { SourcePanel } from "@/app/experiments/_components/SourcePanel";
import { buildSourceTabs } from "@/app/experiments/_lib/source";
import { componentSource, usageSource } from "./copy-content";
import { VoiceDockShowcase } from "./voice-dock-showcase";

export const metadata: Metadata = {
  title: "Voice Dock | dqnamo",
  description:
    "A compact agent dock for voice sessions with a live audio waveform, listening, thinking, and speaking states.",
};

export default async function VoiceDockPage() {
  const tabs = await buildSourceTabs([
    {
      label: "VoiceDock.tsx",
      source: componentSource,
      value: "component",
    },
    { label: "Usage.tsx", source: usageSource, value: "usage" },
  ]);

  return (
    <ExperimentPage
      description="A voice counterpart to the agent dock: tap to talk and it expands into a live audio waveform powered by audioMotion-analyzer, cycling through listening, thinking, and speaking states."
      slug="voice-dock"
      title="Voice Dock"
    >
      <div className="flex min-h-[28rem] w-full items-end justify-center rounded-[13px] border border-grayscale-3 bg-grayscale-1 small-shadow dark:border-transparent dark:bg-grayscale-2 dark:shadow-none">
        <VoiceDockShowcase />
      </div>
      <div className="w-full overflow-hidden rounded-[13px] border border-grayscale-3 bg-grayscale-1 small-shadow dark:border-grayscale-4 dark:bg-grayscale-3 dark:shadow-none">
        <SourcePanel tabs={tabs} />
      </div>
    </ExperimentPage>
  );
}
