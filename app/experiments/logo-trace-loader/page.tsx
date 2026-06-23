import { MoonStarsIcon } from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { ThemeToggle } from "@/components/ThemeToggle";
import { WorkWithMeCta } from "@/components/WorkWithMeCta";
import { AgentPromptPanel } from "./agent-prompt-panel";
import { LOGO_TRACE_LOADER_PROMPT } from "./copy-content";
import { LogoTraceLoaderShowcase } from "./logo-trace-loader-showcase";

export const metadata: Metadata = {
  title: "Logo trace loader | dqnamo",
  description: "A compact SVG loader that resolves into a content reveal.",
};

export default function LogoTraceLoaderPage() {
  return (
    <main className="w-full bg-grayscale-1">
      <div className="mx-auto flex w-full max-w-4xl flex-col border-grayscale-3 border-x px-4 pb-16 dark:border-grayscale-2 md:px-8 lg:px-16">
        <div className="flex flex-row items-center justify-between px-2">
          <div className="flex flex-col gap-1.5 py-10">
            <Link
              className="w-max font-pirata font-bold text-2xl text-grayscale-11 transition-colors duration-200 hover:text-grayscale-12"
              href="/"
            >
              dqnamo
            </Link>
            <span className="font-mono font-semibold text-[10px] text-grayscale-10 uppercase leading-none">
              experiments / logo-trace-loader
            </span>
          </div>
          <div className="flex items-center gap-1.5 rounded-full bg-grayscale-3 p-1 text-grayscale-10">
            <MoonStarsIcon
              aria-hidden="true"
              className="text-grayscale-10"
              size={16}
              weight="fill"
            />
            <ThemeToggle size={16} />
          </div>
        </div>

        <div className="flex flex-col gap-px px-2 py-8">
          <h1 className="font-medium text-grayscale-12 text-md">
            Logo Trace Loader
          </h1>
          <p className="text-balance text-grayscale-11 text-sm leading-6">
            A compact reveal pattern: the logo traces while loading, resolves
            into the filled mark, then moves up as the content panel appears.
          </p>
        </div>

        <section className="flex flex-col items-center justify-center gap-1.5 rounded-[16px] border border-grayscale-3 bg-grayscale-2 p-1.5 dark:border-grayscale-4">
          <LogoTraceLoaderShowcase />
          <div className="w-full overflow-hidden rounded-[13px] border border-grayscale-3 bg-grayscale-1 small-shadow dark:border-grayscale-4 dark:bg-grayscale-3 dark:shadow-none">
            <AgentPromptPanel prompt={LOGO_TRACE_LOADER_PROMPT} />
          </div>
        </section>

        <WorkWithMeCta className="my-16" />
      </div>
    </main>
  );
}
