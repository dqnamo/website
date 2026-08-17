"use client";

import Image from "next/image";
import type {
  ComponentPropsWithoutRef,
  PointerEvent as ReactPointerEvent,
} from "react";
import { cn } from "@/helpers/classname-helper";
import styles from "./GoldenTicket.module.css";

const ticketToothCount = 24;
const rightToothPoints = Array.from(
  { length: ticketToothCount * 2 },
  (_, index) => {
    const step = index + 1;
    const x = step % 2 === 0 ? "calc(100% - var(--gold-tooth-depth))" : "100%";
    const y = (step * 100) / (ticketToothCount * 2);

    return `${x} ${y}%`;
  },
).join(", ");
const leftToothPoints = Array.from(
  { length: ticketToothCount * 2 },
  (_, index) => {
    const step = index + 1;
    const x = step % 2 === 0 ? "var(--gold-tooth-depth)" : "0";
    const y = 100 - (step * 100) / (ticketToothCount * 2);

    return `${x} ${y}%`;
  },
).join(", ");
const ticketClipPath = `polygon(
  var(--gold-tooth-depth) 0,
  calc(var(--gold-stub) - var(--gold-notch)) 0,
  var(--gold-stub) var(--gold-notch),
  calc(var(--gold-stub) + var(--gold-notch)) 0,
  calc(100% - var(--gold-tooth-depth)) 0,
  ${rightToothPoints},
  calc(var(--gold-stub) + var(--gold-notch)) 100%,
  var(--gold-stub) calc(100% - var(--gold-notch)),
  calc(var(--gold-stub) - var(--gold-notch)) 100%,
  var(--gold-tooth-depth) 100%,
  ${leftToothPoints}
)`;

export type GoldenTicketProps = ComponentPropsWithoutRef<"article"> & {
  admit?: string;
  code?: string;
  eventName?: string;
};

export function GoldenTicket({
  admit = "Admit one",
  "aria-hidden": ariaHidden,
  "aria-label": ariaLabel,
  className,
  code = "HA · 001 · 2026",
  eventName = "Invite",
  onPointerLeave,
  onPointerMove,
  style,
  ...props
}: GoldenTicketProps) {
  function handlePointerMove(event: ReactPointerEvent<HTMLElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    const style = event.currentTarget.style;

    style.setProperty("--gold-tilt-x", `${(0.5 - y) * 14}deg`);
    style.setProperty("--gold-tilt-y", `${(x - 0.5) * 18}deg`);
    onPointerMove?.(event);
  }

  function handlePointerLeave(event: ReactPointerEvent<HTMLElement>) {
    const style = event.currentTarget.style;

    style.setProperty("--gold-tilt-x", "0deg");
    style.setProperty("--gold-tilt-y", "0deg");
    onPointerLeave?.(event);
  }

  return (
    <article
      {...props}
      aria-hidden={ariaHidden}
      aria-label={ariaHidden ? undefined : (ariaLabel ?? "Hyperaide invite")}
      className={cn(styles.ticket, className)}
      onPointerLeave={handlePointerLeave}
      onPointerMove={handlePointerMove}
      style={{ clipPath: ticketClipPath, ...style }}
    >
      <span aria-hidden="true" className={styles.texture} />

      <div className={styles.invitation}>
        <Image
          alt=""
          className={styles.logo}
          height={294}
          src="/logos/hyperaide.svg"
          width={313}
        />
        <div className={styles.copy}>
          <span className={styles.leadIn}>Your</span>
          <h2 className={styles.eventName}>{eventName}</h2>
          <span className={styles.tagline}>
            To try out the next generation personal assistant
          </span>
        </div>
      </div>

      <aside className={styles.stub}>
        <span className={styles.stubLabel}>{admit}</span>
        <span aria-hidden="true" className={styles.seal}>
          <span>✦</span>
        </span>
        <span className={styles.code}>{code}</span>
      </aside>
    </article>
  );
}
