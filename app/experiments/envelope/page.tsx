import type { Metadata } from "next";
import { ExperimentPage } from "@/app/experiments/_components/ExperimentPage";
import { SourcePanel } from "@/app/experiments/_components/SourcePanel";
import { buildSourceTabs, readSourceFile } from "@/app/experiments/_lib/source";
import { EnvelopeShowcase } from "./envelope-showcase";

const title = "Envelope | dqnamo";
const description =
  "A sealed envelope whose wax cracks along the flap, then lets the letter slide out.";

export const metadata: Metadata = {
  title,
  description,
  openGraph: {
    title,
    description,
    siteName: "dqnamo",
    type: "website",
    url: "/experiments/envelope",
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
  },
};

export default async function EnvelopePage() {
  const [envelopeSource, showcaseSource] = await Promise.all([
    readSourceFile("components/Envelope.tsx"),
    readSourceFile("app/experiments/envelope/envelope-showcase.tsx"),
  ]);
  const tabs = await buildSourceTabs([
    {
      label: "Envelope.tsx",
      source: envelopeSource,
      value: "envelope",
    },
    {
      label: "Example.tsx",
      source: showcaseSource,
      value: "example",
    },
  ]);

  return (
    <ExperimentPage
      description="A sealed envelope whose wax cracks along the flap, then lets the letter slide out. Click it, press Enter, or drag the flap over and pull the letter up by hand."
      slug="envelope"
      title="Envelope"
    >
      <EnvelopeShowcase />
      <div className="w-full overflow-hidden rounded-[13px] border border-grayscale-3 bg-grayscale-1 small-shadow dark:border-grayscale-4 dark:bg-grayscale-3 dark:shadow-none">
        <SourcePanel tabs={tabs} />
      </div>
    </ExperimentPage>
  );
}
