import type { Metadata } from "next";
import { ExperimentPage } from "@/app/experiments/_components/ExperimentPage";
import { SourcePanel } from "@/app/experiments/_components/SourcePanel";
import { buildSourceTabs, readSourceFile } from "@/app/experiments/_lib/source";
import { TicketShowcase } from "./ticket-showcase";

export const metadata: Metadata = {
  title: "Ticket | dqnamo",
  description:
    "A composable ticket with a perforated stub and subtle tilt on hover.",
};

export default async function TicketPage() {
  const [ticketSource, showcaseSource] = await Promise.all([
    readSourceFile("components/Ticket.tsx"),
    readSourceFile("app/experiments/ticket/ticket-showcase.tsx"),
  ]);
  const tabs = await buildSourceTabs([
    {
      label: "Ticket.tsx",
      source: ticketSource,
      value: "ticket",
    },
    {
      label: "Example.tsx",
      source: showcaseSource,
      value: "example",
    },
  ]);

  return (
    <ExperimentPage
      description="A composable ticket with a perforated stub and subtle tilt on hover."
      slug="ticket"
      title="Ticket"
    >
      <TicketShowcase />
      <div className="w-full overflow-hidden rounded-[13px] border border-grayscale-3 bg-grayscale-1 small-shadow dark:border-grayscale-4 dark:bg-grayscale-3 dark:shadow-none">
        <SourcePanel tabs={tabs} />
      </div>
    </ExperimentPage>
  );
}
