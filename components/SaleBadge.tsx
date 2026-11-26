"use client";

import { animate, useInView, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/helpers/classname-helper";

// How many "+$" rise per payout, how far apart, and how long each takes: a few, unhurried.
const PAYOUT = 3;
const GAP_MS = 650;
const RISE_S = 1.3;

/**
 * A green "Sold …" pill for things I sold. When it scrolls into view (and
 * again on hover) it racks up dollars like a score in a video game: "+$"
 * chips float up out of its coin, one after another.
 */
export function SaleBadge({
  label,
  className,
}: {
  label: string;
  className?: string;
}) {
  const coin = useRef<HTMLSpanElement>(null);
  const inView = useInView(coin, { once: true, amount: 1 });
  const reduceMotion = useReducedMotion();
  const [chips, setChips] = useState<number[]>([]);
  const timers = useRef<number[]>([]);
  const nextId = useRef(0);

  const paying = useRef(false);

  const payout = useCallback(() => {
    // Let a payout finish rather than piling a second one on top of it.
    if (reduceMotion || paying.current) return;
    paying.current = true;
    timers.current = [];

    for (let i = 0; i < PAYOUT; i++) {
      timers.current.push(
        window.setTimeout(() => {
          const id = nextId.current++;
          setChips((current) => [...current, id]);
        }, i * GAP_MS),
      );
    }
    timers.current.push(
      window.setTimeout(
        () => {
          paying.current = false;
        },
        (PAYOUT - 1) * GAP_MS + RISE_S * 1000,
      ),
    );
  }, [reduceMotion]);

  useEffect(() => {
    if (inView) payout();
  }, [inView, payout]);

  useEffect(
    () => () => {
      for (const timer of timers.current) window.clearTimeout(timer);
    },
    [],
  );

  return (
    <span
      className={cn(
        "flex h-7 w-fit items-center gap-1.5 rounded-lg border border-green-10 border-b-2 bg-green-9 pr-2 pl-1 font-medium text-[13px] text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.25)]",
        className,
      )}
      onPointerEnter={payout}
    >
      <span aria-hidden="true" className="relative flex">
        <span
          className="flex size-[18px] items-center justify-center rounded-full bg-white/20 font-semibold text-[11px] tabular-nums"
          ref={coin}
        >
          $
        </span>
        {chips.map((chip) => (
          <PayoutChip
            key={chip}
            onDone={() =>
              setChips((current) => current.filter((id) => id !== chip))
            }
          />
        ))}
      </span>
      {label}
      <span aria-hidden="true" className="h-3 w-px bg-white/30" />
      <span className="font-normal text-[11px] text-white/70">
        micro acquisition
      </span>
    </span>
  );
}

/**
 * One "+$" floating up and away. Animated by hand rather than with a motion
 * element: the timeline mounts its rows with initial animations turned off,
 * which would otherwise skip every chip straight to its faded-out end.
 */
function PayoutChip({ onDone }: { onDone: () => void }) {
  const ref = useRef<HTMLSpanElement>(null);
  const done = useRef(onDone);
  done.current = onDone;

  useEffect(() => {
    if (!ref.current) return;
    const controls = animate(
      ref.current,
      { opacity: [0, 1, 1, 0], y: [-6, -30] },
      {
        duration: RISE_S,
        ease: [0.33, 1, 0.68, 1],
        opacity: {
          duration: RISE_S,
          times: [0, 0.15, 0.55, 1],
          ease: "linear",
        },
      },
    );
    controls.then(() => done.current());
    return () => controls.stop();
  }, []);

  return (
    <span
      className="pointer-events-none absolute top-0 left-1/2 -ml-2.5 w-5 text-center font-semibold text-[11px] text-green-11 tabular-nums opacity-0"
      ref={ref}
    >
      +$
    </span>
  );
}
