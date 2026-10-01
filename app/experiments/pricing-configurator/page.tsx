import type { Metadata } from "next";
import { ExperimentPage } from "@/app/experiments/_components/ExperimentPage";
import { SourcePanel } from "@/app/experiments/_components/SourcePanel";
import { buildSourceTabs, readSourceFile } from "@/app/experiments/_lib/source";
import { usageSource } from "./copy-content";
import { PricingConfiguratorShowcase } from "./pricing-configurator-showcase";

export const metadata: Metadata = {
  title: "Pricing Configurator | dqnamo",
  description:
    "A seat-based plan configurator with magnetic tier detents, rolling prices, and features that unlock as you cross tiers.",
};

export default async function PricingConfiguratorPage() {
  const componentSource = await readSourceFile(
    "components/PricingConfigurator.tsx",
  );
  const tabs = await buildSourceTabs([
    {
      label: "PricingConfigurator.tsx",
      source: componentSource,
      value: "component",
    },
    { label: "Usage.tsx", source: usageSource, value: "usage" },
  ]);

  return (
    <ExperimentPage
      description="A seat slider for billing pages. Tier boundaries act as magnetic detents, the price rolls as you drag, and features unlock or lock again as you cross between plans."
      slug="pricing-configurator"
      title="Pricing Configurator"
    >
      <PricingConfiguratorShowcase />
      <div className="w-full overflow-hidden rounded-[13px] border border-grayscale-3 bg-grayscale-1 small-shadow dark:border-grayscale-4 dark:bg-grayscale-3 dark:shadow-none">
        <SourcePanel tabs={tabs} />
      </div>
    </ExperimentPage>
  );
}
