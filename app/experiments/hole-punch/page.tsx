import type { Metadata } from "next";
import { ExperimentPage } from "@/app/experiments/_components/ExperimentPage";
import { SourcePanel } from "@/app/experiments/_components/SourcePanel";
import { buildSourceTabs, readSourceFile } from "@/app/experiments/_lib/source";
import { HolePunchShowcase } from "./hole-punch-showcase";

const title = "Hole Punch | dqnamo";
const description =
  "A two-hole punch that pushes back until the paper gives, then drops its chads in the tray.";

export const metadata: Metadata = {
  title,
  description,
  openGraph: {
    title,
    description,
    siteName: "dqnamo",
    type: "website",
    url: "/experiments/hole-punch",
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
  },
};

export default async function HolePunchPage() {
  const [punchSource, showcaseSource] = await Promise.all([
    readSourceFile("components/HolePunch.tsx"),
    readSourceFile("app/experiments/hole-punch/hole-punch-showcase.tsx"),
  ]);
  const tabs = await buildSourceTabs([
    {
      label: "HolePunch.tsx",
      source: punchSource,
      value: "punch",
    },
    {
      label: "Example.tsx",
      source: showcaseSource,
      value: "example",
    },
  ]);

  return (
    <ExperimentPage
      description="A two-hole punch that pushes back until the paper gives, then drops its chads in the tray. Drag the lever down, tap it, or press Space."
      slug="hole-punch"
      title="Hole Punch"
    >
      <HolePunchShowcase />
      <div className="w-full overflow-hidden rounded-[13px] border border-grayscale-3 bg-grayscale-1 small-shadow dark:border-grayscale-4 dark:bg-grayscale-3 dark:shadow-none">
        <SourcePanel tabs={tabs} />
      </div>
    </ExperimentPage>
  );
}
