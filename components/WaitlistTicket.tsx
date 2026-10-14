"use client";

import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { useState } from "react";
import { cn } from "@/helpers/classname-helper";
import { GoldenTicket, type GoldenTicketProps } from "./GoldenTicket";
import { PaperBurn } from "./PaperBurn";
import Button from "./public/Button";
import styles from "./WaitlistTicket.module.css";

export type WaitlistTicketProps = Omit<
  ComponentPropsWithoutRef<"section">,
  "children"
> & {
  burnDuration?: number;
  buttonLabel?: string;
  description?: ReactNode;
  heading?: ReactNode;
  onBurnComplete?: () => void;
  onJoin?: () => void;
  ticketProps?: GoldenTicketProps;
};

export function WaitlistTicket({
  burnDuration = 850,
  buttonLabel = "Join the waitlist",
  className,
  description = "Join the waitlist for early access to Hyperaide.",
  heading = "Your invitation is waiting.",
  onBurnComplete,
  onJoin,
  ticketProps,
  ...props
}: WaitlistTicketProps) {
  const [burning, setBurning] = useState(false);
  const { className: ticketClassName, ...resolvedTicketProps } =
    ticketProps ?? {};

  function handleJoin() {
    if (burning) {
      return;
    }

    setBurning(true);
    onJoin?.();
  }

  return (
    <section
      {...props}
      className={cn(styles.root, className)}
      data-burning={burning}
    >
      <PaperBurn
        active={burning}
        className={styles.burn}
        duration={burnDuration}
        onBurnComplete={onBurnComplete}
      >
        <GoldenTicket
          {...resolvedTicketProps}
          className={cn(styles.ticket, ticketClassName)}
        />
      </PaperBurn>

      <div
        aria-hidden={burning}
        className={styles.actions}
        data-hidden={burning}
      >
        <div className={styles.copy}>
          <h2>{heading}</h2>
          <p>{description}</p>
        </div>
        <Button
          className={styles.button}
          disabled={burning}
          onClick={handleJoin}
          type="button"
        >
          {buttonLabel}
        </Button>
      </div>
    </section>
  );
}
