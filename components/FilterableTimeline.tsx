"use client";

import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { LifeTimeline } from "@/components/LifeTimeline";
import { PikaArrowRightIcon } from "@/components/PikaDockIcons";
import { cn } from "@/helpers/classname-helper";
import type {
  TimelineEntry,
  TimelineKind,
  TimelineYear,
} from "@/lib/life-timeline";

type Filter =
  | "everything"
  | "projects"
  | "jobs"
  | "components"
  | "essays"
  | "life";

const filters: { id: Filter; label: string }[] = [
  { id: "everything", label: "Everything" },
  { id: "projects", label: "Projects" },
  { id: "jobs", label: "Jobs" },
  { id: "components", label: "Components" },
  { id: "essays", label: "Essays" },
  { id: "life", label: "Life events" },
];

const kindFor: Partial<Record<Filter, TimelineKind>> = {
  projects: "project",
  jobs: "job",
  components: "component",
  essays: "essay",
  life: "life",
};

/**
 * The life timeline with a row of chips to narrow it down by kind of
 * entry. Years left with nothing in them drop out, and a filter with
 * nothing at all says so.
 */
export function FilterableTimeline({ years }: { years: TimelineYear[] }) {
  const [filter, setFilter] = useState<Filter>("everything");

  const kind = kindFor[filter];
  const isVisible = (entry: TimelineEntry) =>
    kind ? entry.kinds.includes(kind) : true;
  const isEmpty = !years.some((year) => year.entries.some(isVisible));

  // How many things each kind has, e.g. every component rather than every month of them.
  const countOf = (filterKind: TimelineKind) =>
    years
      .flatMap((year) => year.entries)
      .filter((entry) => entry.kinds.includes(filterKind))
      .reduce((total, entry) => total + (entry.count ?? 1), 0);

  return (
    <>
      <div className="mt-24 px-3 sm:text-center">
        <p className="text-grayscale-11 text-sm max-sm:pr-9">
          Here is a timeline of my life. What do you want to see?{" "}
          <button
            className="group inline-flex cursor-pointer items-center gap-1 whitespace-nowrap text-grayscale-12 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-grayscale-7"
            onClick={scrollToStart}
            type="button"
          >
            <span className="underline decoration-grayscale-6 underline-offset-2 transition-colors group-hover:decoration-grayscale-10">
              Take me to the start
            </span>
            <PikaArrowRightIcon
              className="transition-transform duration-200 group-hover:translate-x-0.5"
              size={14}
            />
          </button>
        </p>
        <div className="mt-3 flex flex-wrap gap-1.5 max-sm:pr-9 sm:justify-center">
          {filters.map((option) => {
            const selected = option.id === filter;
            return (
              <button
                aria-pressed={selected}
                className={cn(
                  "flex cursor-pointer items-center gap-1.5 rounded-full border border-b-2 px-2.5 py-0.5 font-medium text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-grayscale-7",
                  selected
                    ? "border-grayscale-12 bg-grayscale-12 text-grayscale-1 dark:border-grayscale-7 dark:bg-grayscale-6 dark:text-grayscale-12"
                    : "border-grayscale-4 bg-white text-grayscale-11 hover:border-grayscale-5 hover:bg-grayscale-2 dark:bg-grayscale-3 dark:hover:bg-grayscale-4",
                )}
                key={option.id}
                onClick={() => setFilter(option.id)}
                type="button"
              >
                {option.label}
                {kindFor[option.id] ? (
                  <>
                    <span
                      aria-hidden="true"
                      className="-my-0.5 w-px self-stretch bg-current opacity-20"
                    />
                    <span className="tabular-nums opacity-60">
                      {countOf(kindFor[option.id] as TimelineKind)}
                    </span>
                  </>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      {/* A hairline across the whole screen that the timeline's rail hangs from. The shadow
          carries it to both edges without widening the page (shadows don't scroll). */}
      <div
        aria-hidden="true"
        className="mt-6 h-px bg-grayscale-4 shadow-[0_0_0_100vmax_var(--color-grayscale-4)] [clip-path:inset(0_-100vmax)]"
      />
      <LifeTimeline isVisible={isVisible} years={years} />
      <AnimatePresence>
        {isEmpty ? (
          <motion.p
            animate={{ opacity: 1, transition: { delay: 0.15, duration: 0.3 } }}
            className="py-16 text-center text-grayscale-10 text-sm"
            exit={{ opacity: 0, transition: { duration: 0.15 } }}
            initial={{ opacity: 0 }}
            key="empty"
          >
            Nothing here yet.
          </motion.p>
        ) : null}
      </AnimatePresence>
    </>
  );
}

// The timeline runs newest first, so the start of it all is at the very bottom of the page.
function scrollToStart() {
  const reduceMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;
  window.scrollTo({
    behavior: reduceMotion ? "auto" : "smooth",
    top: document.documentElement.scrollHeight,
  });
}
