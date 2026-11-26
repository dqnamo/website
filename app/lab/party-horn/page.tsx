import type { Metadata } from "next";
import { ExperimentPage } from "@/app/lab/_components/ExperimentPage";
import { SourcePanel } from "@/app/lab/_components/SourcePanel";
import { buildSourceTabs, readSourceFile } from "@/app/lab/_lib/source";
import { PartyHornShowcase } from "./party-horn-showcase";

const title = "Party Horn | dqnamo";
const description =
  "A party horn whose paper coil unrolls as you blow and curls back home when you stop.";

export const metadata: Metadata = {
  title,
  description,
  openGraph: {
    title,
    description,
    siteName: "dqnamo",
    type: "website",
    url: "/lab/party-horn",
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
  },
};

export default async function PartyHornPage() {
  const [hornSource, showcaseSource] = await Promise.all([
    readSourceFile("components/PartyHorn.tsx"),
    readSourceFile("app/lab/party-horn/party-horn-showcase.tsx"),
  ]);
  const tabs = await buildSourceTabs([
    {
      label: "PartyHorn.tsx",
      source: hornSource,
      value: "horn",
    },
    {
      label: "Example.tsx",
      source: showcaseSource,
      value: "example",
    },
  ]);

  return (
    <ExperimentPage
      description="A party horn whose paper coil unrolls as you blow and curls back home when you stop. Hold it for the full length, or tap it for a short toot."
      slug="party-horn"
      title="Party Horn"
    >
      <PartyHornShowcase />
      <div className="w-full overflow-hidden rounded-[13px] border border-grayscale-3 bg-grayscale-1 small-shadow dark:border-grayscale-4 dark:bg-grayscale-3 dark:shadow-none">
        <SourcePanel tabs={tabs} />
      </div>
    </ExperimentPage>
  );
}
