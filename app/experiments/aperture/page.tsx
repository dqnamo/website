import type { Metadata } from "next";
import { ExperimentPage } from "@/app/experiments/_components/ExperimentPage";
import { SourcePanel } from "@/app/experiments/_components/SourcePanel";
import { buildSourceTabs, readSourceFile } from "@/app/experiments/_lib/source";
import { ApertureShowcase } from "./aperture-showcase";

const title = "Aperture | dqnamo";
const description =
  "A camera lens whose iris blades close as you turn the ring, and whose bokeh closes with them.";

export const metadata: Metadata = {
  title,
  description,
  openGraph: {
    title,
    description,
    siteName: "dqnamo",
    type: "website",
    url: "/experiments/aperture",
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
  },
};

export default async function AperturePage() {
  const [apertureSource, showcaseSource] = await Promise.all([
    readSourceFile("components/Aperture.tsx"),
    readSourceFile("app/experiments/aperture/aperture-showcase.tsx"),
  ]);
  const tabs = await buildSourceTabs([
    {
      label: "Aperture.tsx",
      source: apertureSource,
      value: "aperture",
    },
    {
      label: "Example.tsx",
      source: showcaseSource,
      value: "example",
    },
  ]);

  return (
    <ExperimentPage
      description="A camera lens whose seven iris blades swing shut as you turn the aperture ring, stop by stop. The lights in the viewfinder are shaped by the same blades, so the bokeh closes with them."
      slug="aperture"
      title="Aperture"
    >
      <ApertureShowcase />
      <div className="w-full overflow-hidden rounded-[13px] border border-grayscale-3 bg-grayscale-1 small-shadow dark:border-grayscale-4 dark:bg-grayscale-3 dark:shadow-none">
        <SourcePanel tabs={tabs} />
      </div>
    </ExperimentPage>
  );
}
