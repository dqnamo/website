import Link from "next/link";
import { experimentCount, experiments } from "@/components/experiment-catalog";
import { ExperimentPreview } from "@/components/NewExperimentCta";
import { PikaArrowRightIcon } from "@/components/PikaDockIcons";
import { cn } from "@/helpers/classname-helper";
import type { TimelineEntry } from "@/lib/life-timeline";

type Experiment = (typeof experiments)[number];

interface MonthGroup {
  /** YYYY-MM */
  key: string;
  label: string;
  /** Newest first. */
  items: Experiment[];
}

const monthFormat = new Intl.DateTimeFormat("en", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

/** Experiments bucketed by the month they were added, newest month first. */
function groupByMonth(): MonthGroup[] {
  const groups = new Map<string, Experiment[]>();
  const newestFirst = [...experiments].sort((a, b) =>
    b.added.localeCompare(a.added),
  );

  for (const experiment of newestFirst) {
    const key = experiment.added.slice(0, 7);
    groups.set(key, [...(groups.get(key) ?? []), experiment]);
  }

  return [...groups].map(([key, items]) => ({
    key,
    label: monthFormat.format(new Date(`${key}-01`)),
    items,
  }));
}

/**
 * The kitchen's experiments as timeline entries: one per month, dated by
 * that month's newest experiment, so they sit among everything else that
 * happened at the time.
 */
export function kitchenTimelineEntries(): TimelineEntry[] {
  const months = groupByMonth();

  return months.map((month, index) => {
    const count = month.items.length;
    return {
      id: `kitchen-${month.key}`,
      title: `${count} new component${count === 1 ? "" : "s"}`,
      meta: month.label,
      description: "",
      href: "/kitchen",
      date: month.items[0].added,
      kinds: ["component"],
      count,
      content: (
        <KitchenMonthCard
          month={month}
          showViewAll={index === months.length - 1}
        />
      ),
    };
  });
}

function KitchenMonthCard({
  month,
  showViewAll,
}: {
  month: MonthGroup;
  showViewAll: boolean;
}) {
  const count = month.items.length;

  return (
    <div
      className={cn(
        "w-full rounded-[16px] border border-grayscale-3 bg-grayscale-2 p-1.5",
        count === 1 && "sm:max-w-56",
      )}
    >
      <div
        className={cn(
          "grid gap-1.5",
          count === 1 ? "grid-cols-1" : "grid-cols-2",
        )}
      >
        {month.items.map((experiment) => (
          <Link
            className="group flex flex-col overflow-hidden rounded-[13px] border border-grayscale-4 border-b-2 bg-white p-1 transition-colors hover:border-grayscale-5 hover:bg-grayscale-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-grayscale-7 dark:bg-grayscale-3 dark:hover:bg-grayscale-4"
            href={experiment.href}
            key={experiment.href}
          >
            <ExperimentPreview type={experiment.preview} />
            <h4 className="truncate px-1.5 pt-2.5 pb-1 font-medium text-grayscale-12 text-xs">
              {experiment.title}
            </h4>
          </Link>
        ))}

        {showViewAll ? (
          <Link
            className={cn(
              "group flex items-center gap-2 rounded-[13px] border border-grayscale-4 border-b-2 bg-white p-2 transition-colors hover:border-grayscale-5 hover:bg-grayscale-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-grayscale-7 dark:bg-grayscale-3 dark:hover:bg-grayscale-4",
              count > 1 && "col-span-2",
            )}
            href="/kitchen"
          >
            <span className="flex h-5 min-w-5 items-center justify-center rounded-md bg-grayscale-12 px-1 font-medium text-[11px] text-grayscale-1 leading-none dark:bg-grayscale-5 dark:text-grayscale-12">
              {experimentCount}
            </span>
            <span className="font-medium text-grayscale-12 text-xs">
              View all components
            </span>
            <PikaArrowRightIcon
              aria-hidden="true"
              className="ml-auto text-grayscale-9 transition-transform duration-200 group-hover:translate-x-0.5"
              size={14}
            />
          </Link>
        ) : null}
      </div>
    </div>
  );
}
