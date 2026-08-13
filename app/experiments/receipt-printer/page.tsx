import type { Metadata } from "next";
import { ExperimentPage } from "@/app/experiments/_components/ExperimentPage";
import { SourcePanel } from "@/app/experiments/_components/SourcePanel";
import { buildSourceTabs, readSourceFile } from "@/app/experiments/_lib/source";
import { usageSource } from "./copy-content";
import { ReceiptPrinterShowcase } from "./receipt-printer-showcase";

export const metadata: Metadata = {
  title: "Receipt Printer | dqnamo",
  description:
    "A SaaS checkout state that turns payment processing into a printed order receipt.",
};

export default async function ReceiptPrinterPage() {
  const componentSource = await readSourceFile("components/ReceiptPrinter.tsx");
  const tabs = await buildSourceTabs([
    {
      label: "ReceiptPrinter.tsx",
      source: componentSource,
      value: "component",
    },
    { label: "Usage.tsx", source: usageSource, value: "usage" },
  ]);

  return (
    <ExperimentPage
      description="A tactile checkout experience that turns payment processing into a printed receipt, complete with the order details."
      slug="receipt-printer"
      title="Receipt Printer"
    >
      <ReceiptPrinterShowcase />
      <div className="w-full overflow-hidden rounded-[13px] border border-grayscale-3 bg-grayscale-1 small-shadow dark:border-grayscale-4 dark:bg-grayscale-3 dark:shadow-none">
        <SourcePanel tabs={tabs} />
      </div>
    </ExperimentPage>
  );
}
