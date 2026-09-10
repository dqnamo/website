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
      <figcaption style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: "var(--stamp-v2-padding)" }}>
        <span style={{ fontFamily: "var(--font-jetbrains-mono), monospace", fontSize: "14.45cqi", fontWeight: 800, lineHeight: 1 }}>
          TYO
        </span>
        <span style={{ display: "flex", flexDirection: "column", fontFamily: "var(--font-barlow), sans-serif", fontSize: "8.075cqi", fontWeight: 600, lineHeight: 0.85 }}>
          <span className="sr-only">2026</span>
          <span aria-hidden="true">20</span>
          <span aria-hidden="true">26</span>
        </span>
      </figcaption>
    </figure>
  );
}

// Uses the JetBrains Mono and Barlow font variables from the root layout.
// The stamp fits its content. One inset spaces the border and caption equally.
// cqi units are relative to the stamp's width. Use aspectRatio for a fixed frame.
// Single stamps lift on hover; connected stamps gently tug from the sheet.
export function SingleStamp() {
  return (
    <StampV2 stampWidth={184} padding="7.5cqi">
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
      <StampV2Showcase>
        <SourcePanel tabs={tabs} />
      </StampV2Showcase>
    </ExperimentPage>
  );
}
