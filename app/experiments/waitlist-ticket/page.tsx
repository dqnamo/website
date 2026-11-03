import type { Metadata } from "next";
import { ExperimentPage } from "@/app/experiments/_components/ExperimentPage";
import { SourcePanel } from "@/app/experiments/_components/SourcePanel";
import { buildSourceTabs, readSourceFile } from "@/app/experiments/_lib/source";
import { usageSource } from "./copy-content";
import { WaitlistTicketShowcase } from "./waitlist-ticket-showcase";

export const metadata: Metadata = {
  title: "Waitlist Ticket | dqnamo",
  description:
    "An email waitlist form that compresses as a numbered queue ticket slides out from behind it.",
};

export default async function WaitlistTicketPage() {
  const componentSource = await readSourceFile("components/WaitlistTicket.tsx");
  const tabs = await buildSourceTabs([
    {
      label: "WaitlistTicket.tsx",
      source: componentSource,
      value: "component",
    },
    { label: "Usage.tsx", source: usageSource, value: "usage" },
  ]);

  return (
    <ExperimentPage
      description="Once the server confirms a place, the email form compresses and a numbered queue ticket slides out from behind it."
      slug="waitlist-ticket"
      title="Waitlist Ticket"
    >
      <WaitlistTicketShowcase />
      <div className="w-full overflow-hidden rounded-[13px] border border-grayscale-3 bg-grayscale-1 small-shadow dark:border-grayscale-4 dark:bg-grayscale-3 dark:shadow-none">
        <SourcePanel tabs={tabs} />
      </div>
    </ExperimentPage>
  );
}
