import type { Metadata } from "next";
import { ExperimentPage } from "@/app/experiments/_components/ExperimentPage";
import { SourcePanel } from "@/app/experiments/_components/SourcePanel";
import { buildSourceTabs, readSourceFile } from "@/app/experiments/_lib/source";
import { usageSource } from "./copy-content";
import { InviteFieldShowcase } from "./invite-field-showcase";

export const metadata: Metadata = {
  title: "Invite Field | dqnamo",
  description:
    "A teammate invite field whose email chips fold into the team's avatar stack on send.",
};

export default async function InviteFieldPage() {
  const componentSource = await readSourceFile("components/InviteField.tsx");
  const tabs = await buildSourceTabs([
    {
      label: "InviteField.tsx",
      source: componentSource,
      value: "component",
    },
    { label: "Usage.tsx", source: usageSource, value: "usage" },
  ]);

  return (
    <ExperimentPage
      description="A teammate invite field that turns pasted lists into role-tagged chips, keeps count of plan seats, and folds each invite into the team's avatar stack when it's sent."
      slug="invite-field"
      title="Invite Field"
    >
      <InviteFieldShowcase />
      <div className="w-full overflow-hidden rounded-[13px] border border-grayscale-3 bg-grayscale-1 small-shadow dark:border-grayscale-4 dark:bg-grayscale-3 dark:shadow-none">
        <SourcePanel tabs={tabs} />
      </div>
    </ExperimentPage>
  );
}
