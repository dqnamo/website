"use client";

import { ArrowClockwiseIcon, HouseIcon } from "@phosphor-icons/react/dist/ssr";
import { type MouseEvent, useEffect, useState } from "react";
import {
  ReceiptPrinter,
  type ReceiptPrinterStage,
} from "@/components/ReceiptPrinter";
import { TactileButton } from "@/components/TactileButton";
import { cn } from "@/helpers/classname-helper";

const demoOrder = {
  orderNumber: "ORD-2048",
  plan: "Pro plan",
  billingPeriod: "Annual subscription",
  subtotal: "£192.00",
  tax: "£38.40",
  total: "£230.40",
  paymentMethod: "Visa •••• 4242",
  purchasedAt: "11 AUG 2026 · 14:32",
};

function ShowcaseLogo({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "block aspect-square w-6 bg-current [-webkit-mask-image:url('/images/receipt-printer-logo.png')] [-webkit-mask-position:center] [-webkit-mask-repeat:no-repeat] [-webkit-mask-size:contain] [mask-image:url('/images/receipt-printer-logo.png')] [mask-position:center] [mask-repeat:no-repeat] [mask-size:contain]",
        className,
      )}
    />
  );
}

export function ReceiptPrinterShowcase() {
  const [cycle, setCycle] = useState(0);
  const [animate, setAnimate] = useState(true);

  function replay(event: MouseEvent<HTMLButtonElement>) {
    setAnimate(event.detail !== 0);
    setCycle((currentCycle) => currentCycle + 1);
  }

  return (
    <div className="relative flex min-h-[48rem] w-full items-start justify-center overflow-hidden rounded-[13px] border border-grayscale-3 bg-grayscale-1 px-4 pt-20 small-shadow dark:border-grayscale-4 dark:bg-grayscale-2 dark:shadow-none sm:px-8 sm:pt-16">
      <button
        aria-label="Replay receipt printing"
        className="absolute top-2 right-2 z-30 flex h-8 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-grayscale-3 bg-grayscale-1 px-2 font-medium text-grayscale-11 text-xs transition-[background-color,border-color,transform] duration-150 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)] hover:border-grayscale-4 hover:bg-grayscale-2 active:scale-[0.97] dark:border-grayscale-4 dark:bg-grayscale-3 dark:hover:border-grayscale-5 dark:hover:bg-grayscale-4"
        onClick={replay}
        type="button"
      >
        <ArrowClockwiseIcon aria-hidden="true" size={15} weight="bold" />
        Replay
      </button>

      <ReceiptSequence animate={animate} key={cycle} />
    </div>
  );
}

function ReceiptSequence({ animate }: { animate: boolean }) {
  const [stage, setStage] = useState<ReceiptPrinterStage>("processing");

  useEffect(() => {
    const printTimer = window.setTimeout(() => setStage("printing"), 1600);
    const completeTimer = window.setTimeout(() => setStage("complete"), 3600);

    return () => {
      window.clearTimeout(printTimer);
      window.clearTimeout(completeTimer);
    };
  }, []);

  return (
    <ReceiptPrinter.Root animate={animate} stage={stage}>
      <ReceiptPrinter.Machine>
        <ReceiptPrinter.Header>
          <ShowcaseLogo className="mt-1 ml-1 text-grayscale-10 opacity-70 drop-shadow-sm" />
          <TactileButton depth="shallow" href="/" size="sm">
            <HouseIcon aria-hidden="true" size={13} weight="fill" />
            Home
          </TactileButton>
        </ReceiptPrinter.Header>

        <ReceiptPrinter.Screen>
          <div className="flex flex-col gap-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="truncate font-medium text-sm">{demoOrder.plan}</p>
                <p className="mt-0.5 truncate text-grayscale-8 text-xs dark:text-grayscale-11">
                  {demoOrder.billingPeriod}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-grayscale-8 text-xs dark:text-grayscale-11">
                  Total
                </p>
                <p className="mt-0.5 font-semibold text-base leading-none">
                  {demoOrder.total}
                </p>
              </div>
            </div>

            <ReceiptPrinter.Status />
          </div>
        </ReceiptPrinter.Screen>
      </ReceiptPrinter.Machine>

      <ReceiptPrinter.Output>
        <ReceiptPrinter.Paper aria-label="Order receipt">
          <ShowcaseLogo className="mx-auto w-10 text-grayscale-12 opacity-90 dark:text-grayscale-1" />

          <div className="my-5 border-current/25 border-t border-dashed" />

          <div className="flex items-start justify-between gap-4 text-[9px] leading-4">
            <div>
              <p className="font-bold uppercase tracking-[0.08em]">
                {demoOrder.plan}
              </p>
              <p className="opacity-55">{demoOrder.billingPeriod}</p>
            </div>
            <span className="shrink-0 font-bold">{demoOrder.subtotal}</span>
          </div>

          <div className="my-4 border-current/20 border-t border-dashed" />

          <dl className="space-y-1.5 text-[9px] leading-none">
            <div className="flex justify-between gap-4">
              <dt className="opacity-55">Subtotal</dt>
              <dd>{demoOrder.subtotal}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="opacity-55">Tax</dt>
              <dd>{demoOrder.tax}</dd>
            </div>
            <div className="flex items-end justify-between gap-4 pt-2 font-bold">
              <dt className="text-[10px] uppercase tracking-[0.08em]">
                Total paid
              </dt>
              <dd className="text-[15px] tracking-[-0.04em]">
                {demoOrder.total}
              </dd>
            </div>
          </dl>

          <div className="my-4 border-current/20 border-t border-dashed" />

          <div className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-[8px] leading-3">
            <span className="opacity-55">Order</span>
            <span>{demoOrder.orderNumber}</span>
            <span className="opacity-55">Paid with</span>
            <span>{demoOrder.paymentMethod}</span>
            <span className="opacity-55">Date</span>
            <span>{demoOrder.purchasedAt}</span>
          </div>

          <div className="mt-5 text-center">
            <div className="mx-auto h-7 w-32 bg-[repeating-linear-gradient(90deg,currentColor_0_1px,transparent_1px_3px,currentColor_3px_5px,transparent_5px_7px,currentColor_7px_8px,transparent_8px_11px)]" />
            <p className="mt-1 text-[7px] tracking-[0.18em] opacity-50">
              {demoOrder.orderNumber.replaceAll("-", " ")}
            </p>
          </div>
        </ReceiptPrinter.Paper>
      </ReceiptPrinter.Output>
    </ReceiptPrinter.Root>
  );
}
