export const usageSource = `"use client";

import { HouseIcon } from "@phosphor-icons/react";
import { useState } from "react";
import {
  ReceiptPrinter,
  type ReceiptPrinterStage,
} from "@/components/ReceiptPrinter";
import { TactileButton } from "@/components/TactileButton";

function Logo() {
  return (
    <img
      alt=""
      className="size-6"
      src="/images/receipt-printer-logo.png"
    />
  );
}

export function CheckoutStatus() {
  const [stage] = useState<ReceiptPrinterStage>("processing");

  return (
    <ReceiptPrinter.Root stage={stage}>
      <ReceiptPrinter.Machine>
        <ReceiptPrinter.Header>
          <Logo />
          <TactileButton depth="shallow" href="/" size="sm">
            <HouseIcon aria-hidden="true" size={13} weight="fill" />
            Home
          </TactileButton>
        </ReceiptPrinter.Header>

        <ReceiptPrinter.Screen>
          {/* Any React DOM can go on the screen. */}
          <div className="space-y-4">
            <div className="flex justify-between">
              <div>
                <p>Pro plan</p>
                <p>Annual subscription</p>
              </div>
              <strong>£230.40</strong>
            </div>
            <ReceiptPrinter.Status />
          </div>
        </ReceiptPrinter.Screen>
      </ReceiptPrinter.Machine>

      <ReceiptPrinter.Output>
        <ReceiptPrinter.Paper>
          {/* Any React DOM can be printed. */}
          <h2>Receipt</h2>
          <hr />
          <dl>
            <div>
              <dt>Total paid</dt>
              <dd>£230.40</dd>
            </div>
          </dl>
          <p>Thanks for your order.</p>
        </ReceiptPrinter.Paper>
      </ReceiptPrinter.Output>
    </ReceiptPrinter.Root>
  );
}`;
