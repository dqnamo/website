import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Metadata } from "next";
import { ExperimentPage } from "@/app/experiments/_components/ExperimentPage";
import { tokenize } from "@/helpers/syntax";
import { usageSource } from "./copy-content";
import { SignatureLab } from "./signature-lab";

export const metadata: Metadata = {
  title: "Animated signature | dqnamo",
  description: "A reusable SVG signature component that draws itself on mount.",
};

export default async function SignaturePage() {
  const componentSource = await readFile(
    join(process.cwd(), "components/Signature.tsx"),
    "utf-8",
  );
  const [componentLines, usageLines] = await Promise.all([
    tokenize(componentSource, "tsx"),
    tokenize(usageSource, "tsx"),
  ]);

  return (
    <ExperimentPage
      description="A reusable SVG path component for drawing handwritten marks and signatures."
      slug="signature"
      title="Animated Signature"
    >
      <SignatureLab
        componentLines={componentLines}
        componentSource={componentSource}
        usageLines={usageLines}
        usageSource={usageSource}
      />
    </ExperimentPage>
  );
}
