import type { Metadata } from "next";
import { ExperimentPage } from "@/app/experiments/_components/ExperimentPage";
import { SourcePanel } from "@/app/experiments/_components/SourcePanel";
import { buildSourceTabs, readSourceFile } from "@/app/experiments/_lib/source";
import { ToasterShowcase } from "./toaster-showcase";

const title = "Toaster | dqnamo";
const description =
  "A pop-up toaster whose lever fights back until it catches, then throws the toast up when it's done.";

export const metadata: Metadata = {
  title,
  description,
  openGraph: {
    title,
    description,
    siteName: "dqnamo",
    type: "website",
    url: "/experiments/toaster",
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
  },
};

export default async function ToasterPage() {
  const [toasterSource, showcaseSource] = await Promise.all([
    readSourceFile("components/Toaster.tsx"),
    readSourceFile("app/experiments/toaster/toaster-showcase.tsx"),
  ]);
  const tabs = await buildSourceTabs([
    {
      label: "Toaster.tsx",
      source: toasterSource,
      value: "toaster",
    },
    {
      label: "Example.tsx",
      source: showcaseSource,
      value: "example",
    },
  ]);

  return (
    <ExperimentPage
      description="A pop-up toaster whose lever fights back until it catches, then throws the toast up when it's done. Set the shade on the dial, push the lever down, and watch the bread brown."
      slug="toaster"
      title="Toaster"
    >
      <ToasterShowcase />
      <div className="w-full overflow-hidden rounded-[13px] border border-grayscale-3 bg-grayscale-1 small-shadow dark:border-grayscale-4 dark:bg-grayscale-3 dark:shadow-none">
        <SourcePanel tabs={tabs} />
      </div>
    </ExperimentPage>
  );
}
