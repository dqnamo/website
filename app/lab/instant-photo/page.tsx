import type { Metadata } from "next";
import { ExperimentPage } from "@/app/lab/_components/ExperimentPage";
import { SourcePanel } from "@/app/lab/_components/SourcePanel";
import { buildSourceTabs, readSourceFile } from "@/app/lab/_lib/source";
import { InstantPhotoShowcase } from "./instant-photo-showcase";

const title = "Instant Photo | dqnamo";
const description =
  "An instant print that develops in your hand, and faster where your thumb warms it.";

export const metadata: Metadata = {
  title,
  description,
  openGraph: {
    title,
    description,
    siteName: "dqnamo",
    type: "website",
    url: "/lab/instant-photo",
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
  },
};

export default async function InstantPhotoPage() {
  const [photoSource, scenesSource, showcaseSource] = await Promise.all([
    readSourceFile("components/InstantPhoto.tsx"),
    readSourceFile("components/instant-photo-scenes.ts"),
    readSourceFile("app/lab/instant-photo/instant-photo-showcase.tsx"),
  ]);
  const tabs = await buildSourceTabs([
    {
      label: "InstantPhoto.tsx",
      source: photoSource,
      value: "photo",
    },
    {
      label: "instant-photo-scenes.ts",
      source: scenesSource,
      value: "scenes",
    },
    {
      label: "Example.tsx",
      source: showcaseSource,
      value: "example",
    },
  ]);

  return (
    <ExperimentPage
      description="An instant print that feeds out of the camera dark and murky, then develops in your hand: cyan first, yellow last. Shaking it does nothing. Press your thumb on the picture and the warmth brings that patch up faster."
      slug="instant-photo"
      title="Instant Photo"
    >
      <InstantPhotoShowcase />
      <div className="w-full overflow-hidden rounded-[13px] border border-grayscale-3 bg-grayscale-1 small-shadow dark:border-grayscale-4 dark:bg-grayscale-3 dark:shadow-none">
        <SourcePanel tabs={tabs} />
      </div>
    </ExperimentPage>
  );
}
