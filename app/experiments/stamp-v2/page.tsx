import type { Metadata } from "next";
import { ExperimentPage } from "@/app/experiments/_components/ExperimentPage";
import { SourcePanel } from "@/app/experiments/_components/SourcePanel";
import { buildSourceTabs, readSourceFile } from "@/app/experiments/_lib/source";
import { StampV2Showcase } from "./stamp-v2-showcase";

export const metadata: Metadata = {
  title: "Stamp v2 | dqnamo",
  description:
    "A little postage, made of paper and perforations. One stamp or a connected sheet, shaped entirely with CSS.",
};

const example = `import Image from "next/image";
import { StampSheet, StampV2 } from "@/components/StampV2";

function Artwork() {
  return (
    <figure style={{ margin: 0, color: "#512181" }}>
      <Image
        src="/experiments/stamp-v2/tokyo.png"
        alt="Tokyo skyline, Mount Fuji and cherry blossoms"
        width={1254}
        height={1254}
        sizes="160px"
        style={{ display: "block", width: "100%", height: "auto", aspectRatio: "1" }}
      />
      <figcaption style={{ paddingTop: 8 }}>
        <div style={{ fontFamily: "Georgia, serif", fontSize: 20, lineHeight: 1.1 }}>
          Tokyo
        </div>
        <div style={{ marginTop: 3, fontSize: 8, letterSpacing: "0.06em" }}>
          JAPAN · 2026
        </div>
      </figcaption>
    </figure>
  );
}

// The image stays square; the taller stamp leaves room for the caption.
export function SingleStamp() {
  return (
    <StampV2 stampWidth={184} aspectRatio={4 / 5}>
      <Artwork />
    </StampV2>
  );
}

// Each direct child is one stamp. Two columns + four children = 2 × 2.
// Use two children for a strip, or columns={1} for a vertical strip.
// Set tugOnHover={false} to keep it flat.
export function ConnectedSheet() {
  return (
    <StampSheet columns={2} stampWidth={184} paper="#fffdf7">
      {[1, 2, 3, 4].map((number) => <Artwork key={number} />)}
    </StampSheet>
  );
}`;

export default async function StampV2Page() {
  const [componentSource, cssSource] = await Promise.all([
    readSourceFile("components/StampV2.tsx"),
    readSourceFile("components/StampV2.module.css"),
  ]);
  const tabs = await buildSourceTabs([
    { label: "Usage", source: example, value: "usage" },
    { label: "StampV2.tsx", source: componentSource, value: "component" },
    {
      label: "StampV2.module.css",
      source: cssSource,
      value: "css",
      language: "css",
    },
  ]);

  return (
    <ExperimentPage
      description="A little postage, made of paper and perforations. One stamp or a connected sheet, shaped entirely with CSS."
      slug="stamp-v2"
      title="Stamp v2"
    >
      <StampV2Showcase />
      <div className="w-full overflow-hidden rounded-[13px] border border-grayscale-3 bg-grayscale-1 small-shadow dark:border-grayscale-4 dark:bg-grayscale-3 dark:shadow-none">
        <SourcePanel tabs={tabs} />
      </div>
    </ExperimentPage>
  );
}
