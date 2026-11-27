import type { Metadata } from "next";
import { ExperimentPage } from "@/app/lab/_components/ExperimentPage";
import { SourcePanel } from "@/app/lab/_components/SourcePanel";
import { buildSourceTabs, readSourceFile } from "@/app/lab/_lib/source";
import { AbacusShowcase } from "./abacus-showcase";

const title = "Abacus | dqnamo";
const description =
  "A boxwood soroban whose beads shove their neighbours along the rod and clack against the bar.";

export const metadata: Metadata = {
  title,
  description,
  openGraph: {
    title,
    description,
    siteName: "dqnamo",
    type: "website",
    url: "/lab/abacus",
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
  },
};

export default async function AbacusPage() {
  const [abacusSource, showcaseSource] = await Promise.all([
    readSourceFile("components/Abacus.tsx"),
    readSourceFile("app/lab/abacus/abacus-showcase.tsx"),
  ]);
  const tabs = await buildSourceTabs([
    {
      label: "Abacus.tsx",
      source: abacusSource,
      value: "abacus",
    },
    {
      label: "Example.tsx",
      source: showcaseSource,
      value: "example",
    },
  ]);

  return (
    <ExperimentPage
      description="A boxwood soroban whose beads shove their neighbours along the rod and clack against the bar. Tap a bead, drag a stack, or type digits with the keyboard."
      slug="abacus"
      title="Abacus"
    >
      <AbacusShowcase />
      <div className="w-full overflow-hidden rounded-[13px] border border-grayscale-3 bg-grayscale-1 small-shadow dark:border-grayscale-4 dark:bg-grayscale-3 dark:shadow-none">
        <SourcePanel tabs={tabs} />
      </div>
    </ExperimentPage>
  );
}
