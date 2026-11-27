import type { Metadata } from "next";
import { ExperimentPage } from "@/app/experiments/_components/ExperimentPage";
import { SourcePanel } from "@/app/experiments/_components/SourcePanel";
import { buildSourceTabs, readSourceFile } from "@/app/experiments/_lib/source";
import { usageSource } from "./copy-content";
import { ScrollFadeV2Showcase } from "./scroll-fade-v2-showcase";

export const metadata: Metadata = {
  title: "Scroll Fade v2 | dqnamo",
  description:
    "A scroll container whose edges fade out as content scrolls past them, on any background and in either direction.",
};

export default async function ScrollFadeV2Page() {
  const [componentSource, styleSource] = await Promise.all([
    readSourceFile("components/ScrollFade.tsx"),
    readSourceFile("components/ScrollFade.module.css"),
  ]);
  const tabs = await buildSourceTabs([
    {
      label: "ScrollFade.tsx",
      source: componentSource,
      value: "component",
    },
    {
      label: "ScrollFade.module.css",
      language: "css",
      source: styleSource,
      value: "styles",
    },
    { label: "Usage.tsx", source: usageSource, value: "usage" },
  ]);

  return (
    <ExperimentPage
      description="A scroll container whose edges fade out as content scrolls past them. The fade is a mask, so it works on any background and in either direction."
      slug="scroll-fade-v2"
      title="Scroll Fade v2"
    >
      <ScrollFadeV2Showcase />
      <div className="w-full overflow-hidden rounded-[13px] border border-grayscale-3 bg-grayscale-1 small-shadow dark:border-grayscale-4 dark:bg-grayscale-3 dark:shadow-none">
        <SourcePanel tabs={tabs} />
      </div>
    </ExperimentPage>
  );
}
