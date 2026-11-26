import type { Metadata } from "next";
import { ExperimentPage } from "@/app/lab/_components/ExperimentPage";
import { SourcePanel } from "@/app/lab/_components/SourcePanel";
import { buildSourceTabs, readSourceFile } from "@/app/lab/_lib/source";
import { MetronomeShowcase } from "./metronome-showcase";

const title = "Metronome | dqnamo";
const description =
  "A wind-up metronome whose weight clicks into each notch on the rod, and whose pendulum knocks out the beat.";

export const metadata: Metadata = {
  title,
  description,
  openGraph: {
    title,
    description,
    siteName: "dqnamo",
    type: "website",
    url: "/lab/metronome",
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
  },
};

export default async function MetronomePage() {
  const [metronomeSource, showcaseSource] = await Promise.all([
    readSourceFile("components/Metronome.tsx"),
    readSourceFile("app/lab/metronome/metronome-showcase.tsx"),
  ]);
  const tabs = await buildSourceTabs([
    {
      label: "Metronome.tsx",
      source: metronomeSource,
      value: "metronome",
    },
    {
      label: "Example.tsx",
      source: showcaseSource,
      value: "example",
    },
  ]);

  return (
    <ExperimentPage
      description="A wind-up metronome whose weight clicks into each notch on the rod, and whose pendulum knocks out the beat. Slide the weight, tap a tempo, or use the arrow keys and space."
      slug="metronome"
      title="Metronome"
    >
      <MetronomeShowcase />
      <div className="w-full overflow-hidden rounded-[13px] border border-grayscale-3 bg-grayscale-1 small-shadow dark:border-grayscale-4 dark:bg-grayscale-3 dark:shadow-none">
        <SourcePanel tabs={tabs} />
      </div>
    </ExperimentPage>
  );
}
