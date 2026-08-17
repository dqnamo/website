import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Metadata } from "next";
import { ExperimentPage } from "@/app/experiments/_components/ExperimentPage";
import { tokenize } from "@/helpers/syntax";
import { usageSource } from "./copy-content";
import { ScrambleTextShowcase } from "./scramble-text-showcase";
import { SourcePanel } from "./source-panel";

export const metadata: Metadata = {
  title: "Scramble text | dqnamo",
  description:
    "A compact text component that reveals changed text through an encrypted scramble.",
};

export default async function ScrambleTextPage() {
  const componentSource = await readFile(
    join(process.cwd(), "components/ScrambleText.tsx"),
    "utf-8",
  );
  const [componentLines, usageLines] = await Promise.all([
    tokenize(componentSource, "tsx"),
    tokenize(usageSource, "tsx"),
  ]);

  return (
    <ExperimentPage
      description="A small text component that masks changed text with encrypted characters, then reveals the new value one character at a time."
      slug="scramble-text"
      title="Scramble Text"
    >
      <div className="flex min-h-[28rem] w-full items-center justify-center rounded-[13px] border border-grayscale-3 bg-grayscale-1 p-4 small-shadow dark:border-transparent dark:bg-grayscale-2 dark:shadow-none sm:p-8 md:p-24">
        <div className="w-full max-w-2xl">
          <ScrambleTextShowcase />
        </div>
      </div>

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
