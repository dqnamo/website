import type { Metadata } from "next";
import { ExperimentPage } from "@/app/experiments/_components/ExperimentPage";
import { SourcePanel } from "@/app/experiments/_components/SourcePanel";
import { buildSourceTabs, readSourceFile } from "@/app/experiments/_lib/source";
import { WaitlistTicketShowcase } from "./waitlist-ticket-showcase";

export const metadata: Metadata = {
  title: "Waitlist Ticket | dqnamo",
  description:
    "A Three.js gold-foil invitation with physical tilt, shader-driven burning, embers, and ash.",
};

export default async function WaitlistTicketPage() {
  const [componentSource, cssSource, showcaseSource] = await Promise.all([
    readSourceFile("components/ThreeWaitlistTicket.tsx"),
    readSourceFile("components/ThreeWaitlistTicket.module.css"),
    readSourceFile(
      "app/experiments/waitlist-ticket/waitlist-ticket-showcase.tsx",
    ),
  ]);
  const tabs = await buildSourceTabs([
    {
      label: "ThreeWaitlistTicket.tsx",
      source: componentSource,
      value: "component",
    },
    {
      label: "ThreeWaitlistTicket.module.css",
      language: "css",
      source: cssSource,
      value: "styles",
    },
    {
      label: "Example.tsx",
      source: showcaseSource,
      value: "example",
    },
  ]);

  return (
    <ExperimentPage
      description="A physically lit gold-foil invitation rendered in Three.js, with spring-like pointer tilt and a multi-origin shader burn."
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
