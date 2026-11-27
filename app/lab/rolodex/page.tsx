import type { Metadata } from "next";
import { ExperimentPage } from "@/app/lab/_components/ExperimentPage";
import { SourcePanel } from "@/app/lab/_components/SourcePanel";
import { buildSourceTabs, readSourceFile } from "@/app/lab/_lib/source";
import { RolodexShowcase } from "./rolodex-showcase";

const title = "Rolodex | dqnamo";
const description =
  "A spinning card file whose cards tip over the top and flop onto the stack.";

export const metadata: Metadata = {
  title,
  description,
  openGraph: {
    title,
    description,
    siteName: "dqnamo",
    type: "website",
    url: "/lab/rolodex",
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
  },
};

export default async function RolodexPage() {
  const [rolodexSource, showcaseSource] = await Promise.all([
    readSourceFile("components/Rolodex.tsx"),
    readSourceFile("app/lab/rolodex/rolodex-showcase.tsx"),
  ]);
  const tabs = await buildSourceTabs([
    {
      label: "Rolodex.tsx",
      source: rolodexSource,
      value: "rolodex",
    },
    {
      label: "Example.tsx",
      source: showcaseSource,
      value: "example",
    },
  ]);

  return (
    <ExperimentPage
      description="A spinning card file whose cards tip over the top and flop onto the stack. Flick through it, scroll it, tap a tab, or type a letter to spin there."
      slug="rolodex"
      title="Rolodex"
    >
      <RolodexShowcase />
      <div className="w-full overflow-hidden rounded-[13px] border border-grayscale-3 bg-grayscale-1 small-shadow dark:border-grayscale-4 dark:bg-grayscale-3 dark:shadow-none">
        <SourcePanel tabs={tabs} />
      </div>
    </ExperimentPage>
  );
}
