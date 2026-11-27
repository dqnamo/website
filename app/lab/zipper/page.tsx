import type { Metadata } from "next";
import { ExperimentPage } from "@/app/lab/_components/ExperimentPage";
import { SourcePanel } from "@/app/lab/_components/SourcePanel";
import { buildSourceTabs, readSourceFile } from "@/app/lab/_lib/source";
import { ZipperShowcase } from "./zipper-showcase";

const title = "Zipper | dqnamo";
const description =
  "A pouch whose teeth tick through the slider one by one as the fabric falls open.";

export const metadata: Metadata = {
  title,
  description,
  openGraph: {
    title,
    description,
    siteName: "dqnamo",
    type: "website",
    url: "/lab/zipper",
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
  },
};

export default async function ZipperPage() {
  const [zipperSource, showcaseSource] = await Promise.all([
    readSourceFile("components/Zipper.tsx"),
    readSourceFile("app/lab/zipper/zipper-showcase.tsx"),
  ]);
  const tabs = await buildSourceTabs([
    {
      label: "Zipper.tsx",
      source: zipperSource,
      value: "zipper",
    },
    {
      label: "Example.tsx",
      source: showcaseSource,
      value: "example",
    },
  ]);

  return (
    <ExperimentPage
      description="A pouch whose teeth tick through the slider one by one as the fabric falls open. Drag the pull, double-click it, or use the arrow keys."
      slug="zipper"
      title="Zipper"
    >
      <ZipperShowcase />
      <div className="w-full overflow-hidden rounded-[13px] border border-grayscale-3 bg-grayscale-1 small-shadow dark:border-grayscale-4 dark:bg-grayscale-3 dark:shadow-none">
        <SourcePanel tabs={tabs} />
      </div>
    </ExperimentPage>
  );
}
