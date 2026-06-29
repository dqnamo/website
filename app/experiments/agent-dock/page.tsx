import type { Metadata } from "next";
import { ExperimentPage } from "@/app/experiments/_components/ExperimentPage";
import { SourcePanel } from "@/app/experiments/_components/SourcePanel";
import { buildSourceTabs } from "@/app/experiments/_lib/source";
import { AgentDockShowcase } from "./agent-dock-showcase";
import { componentSource, usageSource } from "./copy-content";

export const metadata: Metadata = {
  title: "Agent Dock | dqnamo",
  description:
    "A compact agent dock with voice, chat, composer, and working-state interactions.",
};

export default async function AgentDockPage() {
  const tabs = await buildSourceTabs([
    {
      label: "AgentDock.tsx",
      source: componentSource,
      value: "component",
    },
    { label: "Usage.tsx", source: usageSource, value: "usage" },
  ]);

  return (
    <ExperimentPage
      description="A compact control surface for switching between voice, chat, and lightweight agent states without pulling focus from the current screen."
      slug="agent-dock"
      title="Agent Dock"
    >
      <div className="flex min-h-[28rem] w-full items-end justify-center rounded-[13px] border border-grayscale-3 bg-grayscale-1 small-shadow dark:border-transparent dark:bg-grayscale-2 dark:shadow-none">
        <AgentDockShowcase />
      </div>
      <div className="w-full overflow-hidden rounded-[13px] border border-grayscale-3 bg-grayscale-1 small-shadow dark:border-grayscale-4 dark:bg-grayscale-3 dark:shadow-none">
        <SourcePanel tabs={tabs} />
      </div>
    </ExperimentPage>
  );
}
