import type { Metadata } from "next";
import { ExperimentPage } from "@/app/experiments/_components/ExperimentPage";
import { SourcePanel } from "@/app/experiments/_components/SourcePanel";
import { buildSourceTabs, readSourceFile } from "@/app/experiments/_lib/source";
import { GoldenTicketShowcase } from "./golden-ticket-showcase";

export const metadata: Metadata = {
  title: "Golden Ticket | dqnamo",
  description:
    "A luxurious special-invite ticket with a pointer-responsive metallic shine.",
};

export default async function GoldenTicketPage() {
  const [componentSource, cssSource, showcaseSource] = await Promise.all([
    readSourceFile("components/GoldenTicket.tsx"),
    readSourceFile("components/GoldenTicket.module.css"),
    readSourceFile("app/experiments/golden-ticket/golden-ticket-showcase.tsx"),
  ]);
  const tabs = await buildSourceTabs([
    {
      label: "GoldenTicket.tsx",
      source: componentSource,
      value: "component",
    },
    {
      label: "GoldenTicket.module.css",
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
      description="A luxurious invitation ticket with embossed details, a perforated stub, and metallic shine that follows your pointer."
      slug="golden-ticket"
      title="Golden Ticket"
    >
      <GoldenTicketShowcase />
      <div className="w-full overflow-hidden rounded-[13px] border border-grayscale-3 bg-grayscale-1 small-shadow dark:border-grayscale-4 dark:bg-grayscale-3 dark:shadow-none">
        <SourcePanel tabs={tabs} />
      </div>
    </ExperimentPage>
  );
}
