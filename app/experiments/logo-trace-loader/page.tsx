import type { Metadata } from "next";
import { ExperimentPage } from "@/app/experiments/_components/ExperimentPage";
import { AgentPromptPanel } from "./agent-prompt-panel";
import { LOGO_TRACE_LOADER_PROMPT } from "./copy-content";
import { LogoTraceLoaderShowcase } from "./logo-trace-loader-showcase";

export const metadata: Metadata = {
  title: "Logo trace loader | dqnamo",
  description: "A compact SVG loader that resolves into a content reveal.",
};

export default function LogoTraceLoaderPage() {
  return (
    <ExperimentPage
      description="A compact reveal pattern: the logo traces while loading, resolves into the filled mark, then moves up as the content panel appears."
      slug="logo-trace-loader"
      title="Logo Trace Loader"
    >
      <LogoTraceLoaderShowcase />
      <div className="w-full overflow-hidden rounded-[13px] border border-grayscale-3 bg-grayscale-1 small-shadow dark:border-grayscale-4 dark:bg-grayscale-3 dark:shadow-none">
        <AgentPromptPanel prompt={LOGO_TRACE_LOADER_PROMPT} />
      </div>
    </ExperimentPage>
  );
}
