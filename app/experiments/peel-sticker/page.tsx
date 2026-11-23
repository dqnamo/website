import type { Metadata } from "next";
import { ExperimentPage } from "@/app/experiments/_components/ExperimentPage";
import { SourcePanel } from "@/app/experiments/_components/SourcePanel";
import { buildSourceTabs, readSourceFile } from "@/app/experiments/_lib/source";
import { PeelStickerShowcase } from "./peel-sticker-showcase";

const title = "Peel Sticker | dqnamo";
const description =
  "A seal you peel back by any corner, folding over its crease to show the code underneath.";

export const metadata: Metadata = {
  title,
  description,
  openGraph: {
    title,
    description,
    siteName: "dqnamo",
    type: "website",
    url: "/experiments/peel-sticker",
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
  },
};

export default async function PeelStickerPage() {
  const [stickerSource, showcaseSource] = await Promise.all([
    readSourceFile("components/PeelSticker.tsx"),
    readSourceFile("app/experiments/peel-sticker/peel-sticker-showcase.tsx"),
  ]);
  const tabs = await buildSourceTabs([
    {
      label: "PeelSticker.tsx",
      source: stickerSource,
      value: "sticker",
    },
    {
      label: "Example.tsx",
      source: showcaseSource,
      value: "example",
    },
  ]);

  return (
    <ExperimentPage
      description="A seal you peel back by any corner. The paper folds over a real crease, shows its mirrored back, and slaps back down if you let go too soon."
      slug="peel-sticker"
      title="Peel Sticker"
    >
      <PeelStickerShowcase />
      <div className="w-full overflow-hidden rounded-[13px] border border-grayscale-3 bg-grayscale-1 small-shadow dark:border-grayscale-4 dark:bg-grayscale-3 dark:shadow-none">
        <SourcePanel tabs={tabs} />
      </div>
    </ExperimentPage>
  );
}
