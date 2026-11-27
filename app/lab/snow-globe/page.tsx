import type { Metadata } from "next";
import { ExperimentPage } from "@/app/lab/_components/ExperimentPage";
import { SourcePanel } from "@/app/lab/_components/SourcePanel";
import { buildSourceTabs, readSourceFile } from "@/app/lab/_lib/source";
import { SnowGlobeShowcase } from "./snow-globe-showcase";

const title = "Snow Globe | dqnamo";
const description =
  "A snow globe you pick up and shake. The water swirls, the snow tumbles and slowly settles on the roofs.";

export const metadata: Metadata = {
  title,
  description,
  openGraph: {
    title,
    description,
    siteName: "dqnamo",
    type: "website",
    url: "/lab/snow-globe",
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
  },
};

export default async function SnowGlobePage() {
  const [globeSource, showcaseSource] = await Promise.all([
    readSourceFile("components/SnowGlobe.tsx"),
    readSourceFile("app/lab/snow-globe/snow-globe-showcase.tsx"),
  ]);
  const tabs = await buildSourceTabs([
    {
      label: "SnowGlobe.tsx",
      source: globeSource,
      value: "globe",
    },
    {
      label: "Example.tsx",
      source: showcaseSource,
      value: "example",
    },
  ]);

  return (
    <ExperimentPage
      description="A snow globe you pick up and shake. The water sloshes and swirls, glitter flashes as it turns, and the snow drifts down onto the roofs, the branches and the snowman's hat."
      slug="snow-globe"
      title="Snow Globe"
    >
      <SnowGlobeShowcase />
      <div className="w-full overflow-hidden rounded-[13px] border border-grayscale-3 bg-grayscale-1 small-shadow dark:border-grayscale-4 dark:bg-grayscale-3 dark:shadow-none">
        <SourcePanel tabs={tabs} />
      </div>
    </ExperimentPage>
  );
}
