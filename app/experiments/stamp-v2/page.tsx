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

const example = `import { StampSheet, StampV2 } from "@/components/StampV2";

// Any React content fits inside the frame.
export function SingleStamp() {
  return (
    <StampV2 stampWidth={184}>
      <div style={{ height: "100%", background: "#b6d6d6", padding: 16 }}>
        A little elsewhere.
      </div>
    </StampV2>
  );
}

// Each direct child is one stamp. Two columns + four children = 2 × 2.
// Use two children for a strip, or columns={1} for a vertical strip.
// Hover peels back a corner. Set peelOnHover={false} to keep it flat.
export function ConnectedSheet() {
  return (
    <StampSheet columns={2} stampWidth={184} paper="#fffdf7">
      {["#ebbe7c", "#b6d6d6", "#c7cba6", "#75819a"].map((color, index) => (
        <div key={color} style={{ height: "100%", background: color, padding: 16 }}>
          {String(index + 1).padStart(2, "0")}
        </div>
      ))}
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
