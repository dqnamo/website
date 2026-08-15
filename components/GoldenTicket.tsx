"use client";

import type {
  ComponentPropsWithoutRef,
  PointerEvent as ReactPointerEvent,
} from "react";
import { cn } from "@/helpers/classname-helper";
import styles from "./GoldenTicket.module.css";

export type GoldenTicketProps = ComponentPropsWithoutRef<"article"> & {
  admit?: string;
  code?: string;
  date?: string;
  eyebrow?: string;
  eventName?: string;
  invitee?: string;
  message?: string;
  venue?: string;
};

export function GoldenTicket({
  admit = "Admit one",
  "aria-hidden": ariaHidden,
  "aria-label": ariaLabel,
  className,
  code = "GT · 001 · 2026",
  date = "17 October · 8PM",
  eyebrow = "Private invitation",
  eventName = "The Golden Hour",
  invitee = "For the bearer",
  message = "An intimate evening reserved for a very small circle.",
  onPointerLeave,
  onPointerMove,
  venue = "The Orangery · London",
  ...props
}: GoldenTicketProps) {
  function handlePointerMove(event: ReactPointerEvent<HTMLElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    const style = event.currentTarget.style;

    style.setProperty("--gold-x", `${x * 100}%`);
    style.setProperty("--gold-y", `${y * 100}%`);
    style.setProperty("--gold-tilt-x", `${(0.5 - y) * 5}deg`);
    style.setProperty("--gold-tilt-y", `${(x - 0.5) * 7}deg`);
    onPointerMove?.(event);
  }

  function handlePointerLeave(event: ReactPointerEvent<HTMLElement>) {
    const style = event.currentTarget.style;

    style.setProperty("--gold-x", "50%");
    style.setProperty("--gold-y", "50%");
    style.setProperty("--gold-tilt-x", "0deg");
    style.setProperty("--gold-tilt-y", "0deg");
    onPointerLeave?.(event);
  }

  return (
    <article
      {...props}
      aria-hidden={ariaHidden}
      aria-label={
        ariaHidden ? undefined : (ariaLabel ?? `${eventName}, ${eyebrow}`)
      }
      className={cn(styles.ticket, className)}
      onPointerLeave={handlePointerLeave}
      onPointerMove={handlePointerMove}
    >
      <span aria-hidden="true" className={styles.texture} />
      <span aria-hidden="true" className={styles.engineTurn} />
      <span aria-hidden="true" className={styles.shimmer} />
      <span aria-hidden="true" className={styles.sweep} />

      <div className={styles.invitation}>
        <header className={styles.header}>
          <span className={styles.eyebrow}>{eyebrow}</span>
          <span aria-hidden="true" className={styles.flourish}>
            ✦
          </span>
        </header>

        <div className={styles.copy}>
          <p className={styles.presents}>You are cordially invited to</p>
          <h2 className={styles.eventName}>{eventName}</h2>
          <p className={styles.message}>{message}</p>
        </div>

        <dl className={styles.details}>
          <div>
            <dt>When</dt>
            <dd>{date}</dd>
          </div>
          <div>
            <dt>Where</dt>
            <dd>{venue}</dd>
          </div>
        </dl>
      </div>

      <aside className={styles.stub}>
        <span className={styles.stubLabel}>Special invite</span>
        <span aria-hidden="true" className={styles.seal}>
          <span>✦</span>
        </span>
        <div className={styles.admission}>
          <strong>{admit}</strong>
          <span>{invitee}</span>
        </div>
        <span className={styles.code}>{code}</span>
      </aside>
    </article>
  );
}
