import type { Metadata } from "next";
import { ExperimentPage } from "@/app/experiments/_components/ExperimentPage";
import { SourcePanel } from "@/app/experiments/_components/SourcePanel";
import { buildSourceTabs, readSourceFile } from "@/app/experiments/_lib/source";
import { VenetianBlindShowcase } from "./venetian-blind-showcase";

const title = "Venetian Blind | dqnamo";
const description =
  "A blind whose slats follow the wand down their ladder tapes, then clap shut.";

export const metadata: Metadata = {
  title,
  description,
  openGraph: {
    title,
    description,
    siteName: "dqnamo",
    type: "website",
    url: "/experiments/venetian-blind",
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
  },
};

export default async function VenetianBlindPage() {
  const [blindSource, showcaseSource] = await Promise.all([
    readSourceFile("components/VenetianBlind.tsx"),
    readSourceFile(
      "app/experiments/venetian-blind/venetian-blind-showcase.tsx",
    ),
  ]);
  const tabs = await buildSourceTabs([
    {
      label: "VenetianBlind.tsx",
      source: blindSource,
      value: "blind",
    },
    {
      label: "Example.tsx",
      source: showcaseSource,
      value: "example",
    },
  ]);

  return (
    <ExperimentPage
      description="A blind whose slats follow the wand down their ladder tapes, then clap shut. Twist the wand to let the light in, in stripes."
      slug="venetian-blind"
      title="Venetian Blind"
    >
      <VenetianBlindShowcase />
      <div className="w-full overflow-hidden rounded-[13px] border border-grayscale-3 bg-grayscale-1 small-shadow dark:border-grayscale-4 dark:bg-grayscale-3 dark:shadow-none">
        <SourcePanel tabs={tabs} />
      </div>
    </ExperimentPage>
  );
}
