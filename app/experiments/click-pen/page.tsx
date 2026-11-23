import type { Metadata } from "next";
import { ExperimentPage } from "@/app/experiments/_components/ExperimentPage";
import { SourcePanel } from "@/app/experiments/_components/SourcePanel";
import { buildSourceTabs, readSourceFile } from "@/app/experiments/_lib/source";
import { ClickPenShowcase } from "./click-pen-showcase";

const title = "Click Pen | dqnamo";
const description =
  "A retractable pen that latches its nib out on one click and lets it go on the next.";

export const metadata: Metadata = {
  title,
  description,
  openGraph: {
    title,
    description,
    siteName: "dqnamo",
    type: "website",
    url: "/experiments/click-pen",
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
  },
};

export default async function ClickPenPage() {
  const [penSource, showcaseSource] = await Promise.all([
    readSourceFile("components/ClickPen.tsx"),
    readSourceFile("app/experiments/click-pen/click-pen-showcase.tsx"),
  ]);
  const tabs = await buildSourceTabs([
    {
      label: "ClickPen.tsx",
      source: penSource,
      value: "pen",
    },
    {
      label: "Example.tsx",
      source: showcaseSource,
      value: "example",
    },
  ]);

  return (
    <ExperimentPage
      description="A retractable pen as a switch. The cam turns at the bottom of every press, then catches the plunger with the nib out, or lets the spring fire it back in."
      slug="click-pen"
      title="Click Pen"
    >
      <ClickPenShowcase />
      <div className="w-full overflow-hidden rounded-[13px] border border-grayscale-3 bg-grayscale-1 small-shadow dark:border-grayscale-4 dark:bg-grayscale-3 dark:shadow-none">
        <SourcePanel tabs={tabs} />
      </div>
    </ExperimentPage>
  );
}
