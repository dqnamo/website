import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Metadata } from "next";
import { ExperimentPage } from "@/app/experiments/_components/ExperimentPage";
import { tokenize } from "@/helpers/syntax";
import { ColorPickerShowcase } from "./color-picker-showcase";
import { usageSource } from "./copy-content";
import { SourcePanel } from "./source-panel";

export const metadata: Metadata = {
  title: "Color picker | dqnamo",
  description: "A simple Base UI Combobox color picker.",
};

export default async function ColorPickerPage() {
  const componentSource = await readFile(
    join(process.cwd(), "components/ColorPicker.tsx"),
    "utf-8",
  );
  const [componentLines, usageLines] = await Promise.all([
    tokenize(componentSource, "tsx"),
    tokenize(usageSource, "tsx"),
  ]);

  return (
    <ExperimentPage
      description="A simple dropdown-style color picker built on Base UI Combobox."
      slug="color-picker"
      title="Color Picker"
    >
      <ColorPickerShowcase />
      <div className="w-full overflow-hidden rounded-[13px] border border-grayscale-3 bg-grayscale-1 small-shadow dark:border-grayscale-4 dark:bg-grayscale-3 dark:shadow-none">
        <SourcePanel
          componentLines={componentLines}
          componentSource={componentSource}
          usageLines={usageLines}
          usageSource={usageSource}
        />
      </div>
    </ExperimentPage>
  );
}
