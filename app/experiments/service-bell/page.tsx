import type { Metadata } from "next";
import { ExperimentPage } from "@/app/experiments/_components/ExperimentPage";
import { SourcePanel } from "@/app/experiments/_components/SourcePanel";
import { buildSourceTabs, readSourceFile } from "@/app/experiments/_lib/source";
import { ServiceBellShowcase } from "./service-bell-showcase";

const title = "Service Bell | dqnamo";
const description =
  "A desk bell that rings on until you rest a hand on the dome.";

export const metadata: Metadata = {
  title,
  description,
  openGraph: {
    title,
    description,
    siteName: "dqnamo",
    type: "website",
    url: "/experiments/service-bell",
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
  },
};

export default async function ServiceBellPage() {
  const [bellSource, showcaseSource] = await Promise.all([
    readSourceFile("components/ServiceBell.tsx"),
    readSourceFile("app/experiments/service-bell/service-bell-showcase.tsx"),
  ]);
  const tabs = await buildSourceTabs([
    {
      label: "ServiceBell.tsx",
      source: bellSource,
      value: "bell",
    },
    {
      label: "Example.tsx",
      source: showcaseSource,
      value: "example",
    },
  ]);

  return (
    <ExperimentPage
      description="A desk bell that rings on until you rest a hand on the dome. Tap the plunger, or hold the dome to hush it. Space and Enter work on both."
      slug="service-bell"
      title="Service Bell"
    >
      <ServiceBellShowcase />
      <div className="w-full overflow-hidden rounded-[13px] border border-grayscale-3 bg-grayscale-1 small-shadow dark:border-grayscale-4 dark:bg-grayscale-3 dark:shadow-none">
        <SourcePanel tabs={tabs} />
      </div>
    </ExperimentPage>
  );
}
