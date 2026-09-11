"use client";

import {
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useSpring,
} from "motion/react";
import Image from "next/image";
import type {
  ComponentPropsWithoutRef,
  PointerEvent as ReactPointerEvent,
} from "react";
import { useId, useRef } from "react";
import { cn } from "@/helpers/classname-helper";
import styles from "./GoldenTicket.module.css";

const ticketToothCount = 24;
const foilSpring = { damping: 20, mass: 0.55, stiffness: 150 };
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

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function toPercent(value: number) {
  return `${(value * 100).toFixed(3)}%`;
}

function applyGoldFoil(style: CSSStyleDeclaration, x: number, y: number) {
  const foilX = 0.5 + (x - 0.5) * 0.72;
  const foilY = 0.5 + (y - 0.5) * 0.44;
  const shineAngle = 116 + (x - 0.5) * 26 + (y - 0.5) * 12;
  const shineOpacity =
    0.56 + Math.abs(x - 0.5) * 0.12 + Math.abs(y - 0.5) * 0.06;

  style.setProperty("--gold-tilt-x", `${((0.5 - y) * 14).toFixed(3)}deg`);
  style.setProperty("--gold-tilt-y", `${((x - 0.5) * 18).toFixed(3)}deg`);
  style.setProperty("--gold-foil-x", toPercent(foilX));
  style.setProperty("--gold-foil-y", toPercent(foilY));
  style.setProperty("--gold-shine-angle", `${shineAngle.toFixed(3)}deg`);
  style.setProperty("--gold-shine-opacity", shineOpacity.toFixed(3));
}

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
  const ticketRef = useRef<HTMLElement>(null);
  const debossFilterId = `gold-deboss-${useId().replaceAll(":", "")}`;
  const shouldReduceMotion = useReducedMotion();
  const pointerX = useMotionValue(0.5);
  const pointerY = useMotionValue(0.5);
  const springX = useSpring(pointerX, foilSpring);
  const springY = useSpring(pointerY, foilSpring);

  function paintFoil() {
    const ticket = ticketRef.current;

    if (ticket) {
      applyGoldFoil(ticket.style, springX.get(), springY.get());
    }
  }

  useMotionValueEvent(springX, "change", paintFoil);
  useMotionValueEvent(springY, "change", paintFoil);

  function handlePointerMove(event: ReactPointerEvent<HTMLElement>) {
    if (!shouldReduceMotion) {
      const rect = event.currentTarget.getBoundingClientRect();
      const x = clamp((event.clientX - rect.left) / rect.width, 0, 1);
      const y = clamp((event.clientY - rect.top) / rect.height, 0, 1);

      pointerX.set(x);
      pointerY.set(y);
    }

    onPointerMove?.(event);
  }

  function handlePointerLeave(event: ReactPointerEvent<HTMLElement>) {
    pointerX.set(0.5);
    pointerY.set(0.5);
    onPointerLeave?.(event);
  }

  return (
    <article
      {...props}
      ref={ticketRef}
      aria-hidden={ariaHidden}
      aria-label={ariaHidden ? undefined : (ariaLabel ?? "Hyperaide invite")}
      className={cn(styles.ticket, className)}
      onPointerLeave={handlePointerLeave}
      onPointerMove={handlePointerMove}
      style={{ clipPath: ticketClipPath, ...style }}
    >
      <svg aria-hidden="true" className={styles.filterDefinitions}>
        <defs>
          <filter
            id={debossFilterId}
            x="-10%"
            y="-10%"
            width="120%"
            height="120%"
            colorInterpolationFilters="sRGB"
          >
            <feOffset in="SourceAlpha" dx="1.2" dy="1.2" result="shadowShift" />
            <feGaussianBlur
              in="shadowShift"
              stdDeviation="0.45"
              result="shadowBlur"
            />
            <feComposite
              in="SourceAlpha"
              in2="shadowBlur"
              operator="out"
              result="shadowEdge"
            />
            <feFlood
              floodColor="#070400"
              floodOpacity="0.9"
              result="shadowColor"
            />
            <feComposite
              in="shadowColor"
              in2="shadowEdge"
              operator="in"
              result="innerShadow"
            />

            <feOffset
              in="SourceAlpha"
              dx="-1.1"
              dy="-1.1"
              result="highlightShift"
            />
            <feGaussianBlur
              in="highlightShift"
              stdDeviation="0.4"
              result="highlightBlur"
            />
            <feComposite
              in="SourceAlpha"
              in2="highlightBlur"
              operator="out"
              result="highlightEdge"
            />
            <feFlood
              floodColor="#c99b38"
              floodOpacity="0.44"
              result="highlightColor"
            />
            <feComposite
              in="highlightColor"
              in2="highlightEdge"
              operator="in"
              result="innerHighlight"
            />

            <feMerge>
              <feMergeNode in="SourceGraphic" />
              <feMergeNode in="innerShadow" />
              <feMergeNode in="innerHighlight" />
            </feMerge>
          </filter>
        </defs>
      </svg>

      <span aria-hidden="true" className={styles.foil} />
      <span aria-hidden="true" className={styles.sheen} />
      <span aria-hidden="true" className={styles.shine} />
      <span aria-hidden="true" className={styles.texture} />

      <div className={styles.invitation}>
        <Image
          alt=""
          className={styles.logo}
          height={294}
          src="/logos/hyperaide.svg"
          style={{ filter: `url(#${debossFilterId})` }}
          width={313}
        />
        <div className={styles.copy}>
          <span className={styles.leadIn}>Your</span>
          <h2
            className={styles.eventName}
            style={{ filter: `url(#${debossFilterId})` }}
          >
            {eventName}
          </h2>
          <span className={styles.tagline}>
            To try out the next generation personal assistant
          </span>
        </div>
      </div>

      <aside className={styles.stub}>
        <span className={styles.stubLabel}>{admit}</span>
        <span className={styles.stubAccess}>
          <span>Early</span>
          <strong>Access</strong>
        </span>
        <span className={styles.code}>{code}</span>
      </aside>

      <span aria-hidden="true" className={styles.clearcoat} />
    </article>
  );
}
