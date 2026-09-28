export const usageSource = `import {
  PricingConfigurator,
  type PricingFeature,
  type PricingTier,
} from "@/components/PricingConfigurator";

const tiers = [
  { id: "starter", minSeats: 1, name: "Starter", price: { annual: 8, monthly: 10 } },
  { id: "pro", minSeats: 6, name: "Pro", price: { annual: 16, monthly: 20 } },
  { id: "business", minSeats: 26, name: "Business", price: { annual: 28, monthly: 35 } },
  // Omit \`price\` to turn a tier into a contact-sales state.
  { id: "enterprise", minSeats: 101, name: "Enterprise" },
] satisfies PricingTier[];

const features = [
  { id: "projects", label: "Unlimited projects", tier: "starter" },
  { id: "history", label: "Unlimited history", tier: "pro" },
  { id: "sso", label: "SAML single sign-on", tier: "business" },
  { id: "scim", label: "SCIM provisioning", tier: "enterprise" },
] satisfies PricingFeature[];

export function PlanPicker() {
  return (
    <PricingConfigurator.Root defaultSeats={12} max={150} tiers={tiers}>
      <PricingConfigurator.BillingToggle />
      <PricingConfigurator.TierName />
      <PricingConfigurator.Price />
      <PricingConfigurator.Summary />
      <PricingConfigurator.Savings />
      <PricingConfigurator.Seats />
      <PricingConfigurator.SeatSlider />
      <PricingConfigurator.Features features={features} />
    </PricingConfigurator.Root>
  );
}`;
