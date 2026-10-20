"use client";

import {
  ArrowRightIcon,
  ChatCircleDotsIcon,
  CheckIcon,
} from "@phosphor-icons/react/dist/ssr";
import { useState } from "react";
import { DynamicButton } from "@/components/DynamicButton";
import {
  type BillingCycle,
  getPricingTierIndex,
  PricingConfigurator,
  type PricingFeature,
  type PricingTier,
  usePricingConfigurator,
} from "@/components/PricingConfigurator";

const tiers = [
  {
    id: "starter",
    minSeats: 1,
    name: "Starter",
    price: { annual: 8, monthly: 10 },
  },
  { id: "pro", minSeats: 6, name: "Pro", price: { annual: 16, monthly: 20 } },
  {
    id: "business",
    minSeats: 26,
    name: "Business",
    price: { annual: 28, monthly: 35 },
  },
  { id: "enterprise", minSeats: 101, name: "Enterprise" },
] as const satisfies readonly PricingTier[];

const features = [
  { id: "projects", label: "Unlimited projects", tier: "starter" },
  { id: "inbox", label: "Shared team inbox", tier: "starter" },
  { id: "history", label: "Unlimited history", tier: "pro" },
  { id: "automations", label: "Automations and rules", tier: "pro" },
  { id: "guests", label: "Guest access", tier: "pro" },
  { id: "sso", label: "SAML single sign-on", tier: "business" },
  { id: "audit", label: "Audit log", tier: "business" },
  { id: "scim", label: "SCIM provisioning", tier: "enterprise" },
  { id: "csm", label: "Dedicated support", tier: "enterprise" },
] as const satisfies readonly PricingFeature[];

const currentPlan = { billing: "monthly", seats: 12 } as const;
const currentTierIndex = getPricingTierIndex(tiers, currentPlan.seats);

export function PricingConfiguratorShowcase() {
  const [seats, setSeats] = useState<number>(currentPlan.seats);
  const [billing, setBilling] = useState<BillingCycle>(currentPlan.billing);

  return (
    <div className="relative flex min-h-[38rem] w-full items-center justify-center overflow-hidden rounded-[13px] border border-grayscale-3 bg-grayscale-1 p-4 small-shadow dark:border-grayscale-4 dark:bg-grayscale-2 dark:shadow-none sm:p-8">
      <PricingConfigurator.Root
        aria-labelledby="relay-plan-title"
        billing={billing}
        className="w-full max-w-[46rem] overflow-hidden rounded-2xl border border-grayscale-4 bg-grayscale-1 shadow-[0_1px_2px_rgba(0,0,0,0.03),0_6px_16px_-8px_rgba(0,0,0,0.1),0_16px_32px_-16px_rgba(0,0,0,0.08)] dark:border-grayscale-5 dark:bg-grayscale-3 dark:shadow-[0_1px_2px_rgba(0,0,0,0.18),0_12px_28px_-12px_rgba(0,0,0,0.36)]"
        max={150}
        onBillingChange={setBilling}
        onSeatsChange={setSeats}
        role="group"
        seats={seats}
        tiers={tiers}
      >
        <header className="flex flex-wrap items-center justify-between gap-3 border-grayscale-3 border-b p-4 dark:border-grayscale-5">
          <div className="flex min-w-0 items-center gap-2.5">
            <RelayMark />
            <div className="min-w-0">
              <h2
                className="font-medium text-grayscale-12 text-sm"
                id="relay-plan-title"
              >
                Change plan
              </h2>
              <p className="truncate text-grayscale-10 text-xs">
                Relay · Acme Inc workspace
              </p>
            </div>
          </div>
          <PricingConfigurator.BillingToggle />
        </header>

        <div className="grid md:grid-cols-[minmax(0,1fr)_18.5rem]">
          <div className="flex flex-col p-4 sm:p-5">
            <div className="flex h-6 items-center justify-between gap-3">
              <p className="flex items-center gap-1.5 font-medium text-grayscale-11 text-sm">
                <PricingConfigurator.TierName className="text-grayscale-12" />
                <span className="text-grayscale-9">plan</span>
              </p>
              <PricingConfigurator.Savings />
            </div>
            <PricingConfigurator.Price className="mt-3" />
            <PricingConfigurator.Summary
              className="mt-2"
              contactDescription="Volume pricing, SSO and SCIM, and a tailored contract."
            />

            <div className="mt-auto flex items-baseline justify-between gap-3 pt-10">
              <p className="font-medium text-grayscale-11 text-xs">Team size</p>
              <PricingConfigurator.Seats className="font-medium text-grayscale-12 text-sm" />
            </div>
            <PricingConfigurator.SeatSlider className="mt-3" label="Seats" />
          </div>

          <div className="border-grayscale-3 border-t bg-grayscale-2/60 p-4 sm:p-5 md:border-t-0 md:border-l dark:border-grayscale-5 dark:bg-grayscale-2/40">
            <p className="font-medium text-grayscale-11 text-xs">
              What&apos;s included
            </p>
            <PricingConfigurator.Features
              className="mt-3.5"
              features={features}
            />
          </div>
        </div>

        <PlanFooter />
      </PricingConfigurator.Root>
    </div>
  );
}

function PlanFooter() {
  const { billing, seats, tier, tierIndex } = usePricingConfigurator();
  const isCurrent =
    tierIndex === currentTierIndex &&
    seats === currentPlan.seats &&
    billing === currentPlan.billing;
  const action = !tier.price
    ? {
        icon: <ChatCircleDotsIcon size={15} weight="bold" />,
        key: "sales",
        label: "Contact sales",
      }
    : isCurrent
      ? {
          icon: <CheckIcon size={15} weight="bold" />,
          key: "current",
          label: "Current plan",
        }
      : tierIndex === currentTierIndex
        ? {
            icon: <ArrowRightIcon size={15} weight="bold" />,
            key: "update",
            label: "Update plan",
          }
        : {
            icon: <ArrowRightIcon size={15} weight="bold" />,
            key: tier.id,
            label: `${tierIndex > currentTierIndex ? "Upgrade" : "Downgrade"} to ${tier.name}`,
          };

  return (
    <footer className="flex flex-wrap items-center justify-between gap-3 border-grayscale-3 border-t px-4 py-3 dark:border-grayscale-5">
      <p className="text-grayscale-10 text-xs">
        {isCurrent
          ? `You're on Pro with ${currentPlan.seats} seats, billed monthly.`
          : tier.price
            ? "Changes are prorated on your next invoice."
            : "Our team will reply within one business day."}
      </p>
      <DynamicButton
        aria-disabled={isCurrent}
        className="h-8 px-3 aria-disabled:cursor-default aria-disabled:opacity-50"
        icon={action.icon}
        stateKey={action.key}
      >
        {action.label}
      </DynamicButton>
    </footer>
  );
}

function RelayMark() {
  return (
    <span
      aria-hidden="true"
      className="grid size-8 shrink-0 place-items-center rounded-[9px] bg-grayscale-12 text-grayscale-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.14)] dark:bg-grayscale-12"
    >
      <svg
        aria-hidden="true"
        className="size-4"
        fill="none"
        viewBox="0 0 16 16"
      >
        <path
          d="M3 11.5 7.25 4.5M8.75 11.5 13 4.5"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth={2}
        />
      </svg>
    </span>
  );
}
