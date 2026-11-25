import type { Metadata } from "next";
import { ExperimentPage } from "@/app/experiments/_components/ExperimentPage";
import { SourcePanel } from "@/app/experiments/_components/SourcePanel";
import { buildSourceTabs, readSourceFile } from "@/app/experiments/_lib/source";
import { MatchboxShowcase } from "./matchbox-showcase";

const title = "Matchbox | dqnamo";
const description =
  "A box of safety matches that only catch if you strike them hard and fast enough.";

export const metadata: Metadata = {
  title,
  description,
  openGraph: {
    title,
    description,
    siteName: "dqnamo",
    type: "website",
    url: "/experiments/matchbox",
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
  },
};

export default async function MatchboxPage() {
  const [matchboxSource, showcaseSource] = await Promise.all([
    readSourceFile("components/Matchbox.tsx"),
    readSourceFile("app/experiments/matchbox/matchbox-showcase.tsx"),
  ]);
  const tabs = await buildSourceTabs([
    {
      label: "Matchbox.tsx",
      source: matchboxSource,
      value: "matchbox",
    },
    {
      label: "Example.tsx",
      source: showcaseSource,
      value: "example",
    },
  ]);

  return (
    <ExperimentPage
      description="A box of safety matches that only catch if you strike them hard and fast enough. Scrape one along the side until it flares, carry the flame around, then shake it out."
      slug="matchbox"
      title="Matchbox"
    >
      <MatchboxShowcase />
      <div className="w-full overflow-hidden rounded-[13px] border border-grayscale-3 bg-grayscale-1 small-shadow dark:border-grayscale-4 dark:bg-grayscale-3 dark:shadow-none">
        <SourcePanel tabs={tabs} />
      </div>
    </ExperimentPage>
  );
}
