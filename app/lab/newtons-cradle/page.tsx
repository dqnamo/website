import type { Metadata } from "next";
import { ExperimentPage } from "@/app/lab/_components/ExperimentPage";
import { SourcePanel } from "@/app/lab/_components/SourcePanel";
import { buildSourceTabs, readSourceFile } from "@/app/lab/_lib/source";
import { NewtonsCradleShowcase } from "./newtons-cradle-showcase";

const title = "Newton's Cradle | dqnamo";
const description =
  "A desk toy whose steel balls pass a knock down the line, then slowly fall into step.";

export const metadata: Metadata = {
  title,
  description,
  openGraph: {
    title,
    description,
    siteName: "dqnamo",
    type: "website",
    url: "/lab/newtons-cradle",
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
  },
};

export default async function NewtonsCradlePage() {
  const [cradleSource, showcaseSource] = await Promise.all([
    readSourceFile("components/NewtonsCradle.tsx"),
    readSourceFile("app/lab/newtons-cradle/newtons-cradle-showcase.tsx"),
  ]);
  const tabs = await buildSourceTabs([
    {
      label: "NewtonsCradle.tsx",
      source: cradleSource,
      value: "cradle",
    },
    {
      label: "Example.tsx",
      source: showcaseSource,
      value: "example",
    },
  ]);

  return (
    <ExperimentPage
      description="A desk toy whose steel balls pass a knock down the line. Every knock loses a little, so a clean one-in, one-out swing slowly turns into the whole row swinging together. Drag a ball out, or press 1 to 4."
      slug="newtons-cradle"
      title="Newton's Cradle"
    >
      <NewtonsCradleShowcase />
      <div className="w-full overflow-hidden rounded-[13px] border border-grayscale-3 bg-grayscale-1 small-shadow dark:border-grayscale-4 dark:bg-grayscale-3 dark:shadow-none">
        <SourcePanel tabs={tabs} />
      </div>
    </ExperimentPage>
  );
}
