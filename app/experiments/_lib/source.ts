import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { BundledLanguage } from "shiki";
import type { SourcePanelTab } from "@/app/experiments/_components/SourcePanel";
import { tokenize } from "@/helpers/syntax";

type SourceTabInput = {
  label: string;
  source: string;
  value: string;
  language?: BundledLanguage;
};

export function readSourceFile(pathFromRoot: string) {
  return readFile(
    join(/* turbopackIgnore: true */ process.cwd(), pathFromRoot),
    "utf-8",
  );
}

export async function buildSourceTabs(
  inputs: readonly SourceTabInput[],
): Promise<SourcePanelTab[]> {
  return Promise.all(
    inputs.map(async ({ label, language = "tsx", source, value }) => ({
      label,
      lines: await tokenize(source, language),
      source,
      value,
    })),
  );
}
