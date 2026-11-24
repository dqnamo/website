import type { Metadata } from "next";
import { ExperimentPage } from "@/app/experiments/_components/ExperimentPage";
import { SourcePanel } from "@/app/experiments/_components/SourcePanel";
import { buildSourceTabs, readSourceFile } from "@/app/experiments/_lib/source";
import { RotaryDialShowcase } from "./rotary-dial-showcase";

const title = "Rotary Dial | dqnamo";
const description =
  "A code input you dial in. Pull a hole round to the stop, let go, and the plate counts the digit home in clicks.";

export const metadata: Metadata = {
  title,
  description,
  openGraph: {
    title,
    description,
    siteName: "dqnamo",
    type: "website",
    url: "/experiments/rotary-dial",
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
  },
};

export default async function RotaryDialPage() {
  const [dialSource, showcaseSource] = await Promise.all([
    readSourceFile("components/RotaryDial.tsx"),
    readSourceFile("app/experiments/rotary-dial/rotary-dial-showcase.tsx"),
  ]);
  const tabs = await buildSourceTabs([
    {
      label: "RotaryDial.tsx",
      source: dialSource,
      value: "dial",
    },
    {
      label: "Example.tsx",
      source: showcaseSource,
      value: "example",
    },
  ]);

  return (
    <ExperimentPage
      description="A verification code you dial in. Put a finger in a hole, pull the plate round to the stop and let go: it runs home at ten pulses a second, and each pulse counts up the digit."
      slug="rotary-dial"
      title="Rotary Dial"
    >
      <RotaryDialShowcase />
      <div className="w-full overflow-hidden rounded-[13px] border border-grayscale-3 bg-grayscale-1 small-shadow dark:border-grayscale-4 dark:bg-grayscale-3 dark:shadow-none">
        <SourcePanel tabs={tabs} />
      </div>
    </ExperimentPage>
  );
}
