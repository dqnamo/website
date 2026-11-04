"use client";

import NumberFlow from "@number-flow/react";
import {
  ArrowCounterClockwiseIcon,
  ArrowDownIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowUpIcon,
  BackspaceIcon,
  CalendarBlankIcon,
  CellSignalHighIcon,
  CircleDashedIcon,
  EyeIcon,
  HashIcon,
  StackIcon,
  TagIcon,
  TextAaIcon,
  UserCircleIcon,
} from "@phosphor-icons/react/dist/ssr";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { type ReactNode, useMemo, useState } from "react";
import {
  type Filter,
  type FilterField,
  FilterQueryBuilder,
  filterItems,
} from "@/components/FilterQueryBuilder";
import { cn } from "@/helpers/classname-helper";
import {
  Avatar,
  type IssuePriority,
  type IssueStatus,
  type Person,
  PriorityIcon,
  people,
  StatusIcon,
} from "./issue-icons";

type Label = "bug" | "feature" | "improvement" | "design";

type Issue = {
  assignee: Person | null;
  createdDaysAgo: number;
  estimate: number;
  id: string;
  labels: Label[];
  priority: IssuePriority;
  status: IssueStatus;
  title: string;
};

const easeOut = [0.23, 1, 0.32, 1] as const;
const DAY_MS = 86_400_000;
// A fixed "now" keeps the demo data stable between server and client renders.
const NOW = Date.UTC(2026, 8, 25, 12);

const issues: Issue[] = [
  {
    assignee: "mira",
    createdDaysAgo: 1,
    estimate: 3,
    id: "INT-148",
    labels: ["bug"],
    priority: "high",
    status: "in_progress",
    title: "Filter tokens lose focus after removing a value",
  },
  {
    assignee: "jonah",
    createdDaysAgo: 2,
    estimate: 5,
    id: "INT-147",
    labels: ["bug"],
    priority: "urgent",
    status: "in_progress",
    title: "Sync fails silently when the session token expires",
  },
  {
    assignee: "theo",
    createdDaysAgo: 3,
    estimate: 2,
    id: "INT-145",
    labels: ["feature"],
    priority: "medium",
    status: "todo",
    title: "Command menu should remember recent searches",
  },
  {
    assignee: "ava",
    createdDaysAgo: 12,
    estimate: 8,
    id: "INT-144",
    labels: ["design"],
    priority: "low",
    status: "backlog",
    title: "Redesign the billing settings page",
  },
  {
    assignee: "mira",
    createdDaysAgo: 5,
    estimate: 3,
    id: "INT-142",
    labels: ["feature"],
    priority: "medium",
    status: "todo",
    title: "Add CSV export to the issues table",
  },
  {
    assignee: "theo",
    createdDaysAgo: 21,
    estimate: 2,
    id: "INT-141",
    labels: ["improvement"],
    priority: "low",
    status: "done",
    title: "Keyboard shortcut overlay",
  },
  {
    assignee: "jonah",
    createdDaysAgo: 6,
    estimate: 3,
    id: "INT-139",
    labels: ["improvement"],
    priority: "high",
    status: "in_review",
    title: "Webhook retries should back off exponentially",
  },
  {
    assignee: "ava",
    createdDaysAgo: 9,
    estimate: 1,
    id: "INT-138",
    labels: ["design"],
    priority: "low",
    status: "todo",
    title: "Empty states for archived projects",
  },
  {
    assignee: "theo",
    createdDaysAgo: 4,
    estimate: 5,
    id: "INT-136",
    labels: ["improvement"],
    priority: "high",
    status: "in_progress",
    title: "Rate limit the public search endpoint",
  },
  {
    assignee: "mira",
    createdDaysAgo: 8,
    estimate: 1,
    id: "INT-135",
    labels: ["design", "bug"],
    priority: "medium",
    status: "in_review",
    title: "Dark mode contrast on status badges",
  },
  {
    assignee: null,
    createdDaysAgo: 30,
    estimate: 5,
    id: "INT-133",
    labels: ["feature"],
    priority: "none",
    status: "backlog",
    title: "Bulk-assign issues from the list view",
  },
  {
    assignee: "jonah",
    createdDaysAgo: 1,
    estimate: 2,
    id: "INT-131",
    labels: ["bug"],
    priority: "urgent",
    status: "todo",
    title: "Crash when pasting images into comments",
  },
  {
    assignee: "ava",
    createdDaysAgo: 45,
    estimate: 8,
    id: "INT-128",
    labels: ["improvement"],
    priority: "medium",
    status: "done",
    title: "Migrate notifications to the new queue",
  },
  {
    assignee: "theo",
    createdDaysAgo: 60,
    estimate: 5,
    id: "INT-126",
    labels: ["feature", "design"],
    priority: "medium",
    status: "backlog",
    title: "Onboarding checklist for new workspaces",
  },
];

const initialFilters: Filter[] = [
  {
    field: "status",
    id: "initial-status",
    operator: "is_any_of",
    values: ["in_progress", "todo"],
  },
  {
    field: "assignee",
    id: "initial-assignee",
    operator: "is_any_of",
    values: ["mira", "theo", "jonah"],
  },
];

const statusLabels: Record<IssueStatus, string> = {
  backlog: "Backlog",
  todo: "Todo",
  in_progress: "In Progress",
  in_review: "In Review",
  done: "Done",
};

const priorityLabels: Record<IssuePriority, string> = {
  urgent: "Urgent",
  high: "High",
  medium: "Medium",
  low: "Low",
  none: "No priority",
};

const labelStyles: Record<Label, { dot: string; name: string }> = {
  bug: { dot: "bg-red-9", name: "Bug" },
  feature: { dot: "bg-violet-9", name: "Feature" },
  improvement: { dot: "bg-blue-9", name: "Improvement" },
  design: { dot: "bg-pink-9", name: "Design" },
};

function getIssueValue(issue: Issue, field: string): unknown {
  switch (field) {
    case "status":
      return issue.status;
    case "assignee":
      return issue.assignee ?? "none";
    case "priority":
      return issue.priority;
    case "labels":
      return issue.labels;
    case "title":
      return `${issue.id} ${issue.title}`;
    case "estimate":
      return issue.estimate;
    case "created":
      return NOW - issue.createdDaysAgo * DAY_MS;
    default:
      return undefined;
  }
}

function formatCreated(daysAgo: number) {
  return new Date(NOW - daysAgo * DAY_MS).toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

const fieldIcon = (Icon: typeof TagIcon) => (
  <Icon aria-hidden="true" size={14} weight="bold" />
);

function buildFields(filters: readonly Filter[]): FilterField[] {
  const baseFields: FilterField[] = [
    {
      icon: fieldIcon(CircleDashedIcon),
      key: "status",
      label: "Status",
      options: (Object.keys(statusLabels) as IssueStatus[]).map((status) => ({
        icon: <StatusIcon status={status} />,
        label: statusLabels[status],
        value: status,
      })),
      pluralLabel: "statuses",
      type: "select",
    },
    {
      icon: fieldIcon(UserCircleIcon),
      key: "assignee",
      label: "Assignee",
      options: [
        ...(Object.keys(people) as Person[]).map((person) => ({
          icon: <Avatar person={person} />,
          keywords: [people[person].name],
          label: people[person].name.split(" ")[0],
          value: person,
        })),
        { icon: <Avatar person={null} />, label: "No assignee", value: "none" },
      ],
      pluralLabel: "assignees",
      type: "select",
    },
    {
      icon: fieldIcon(CellSignalHighIcon),
      key: "priority",
      label: "Priority",
      options: (Object.keys(priorityLabels) as IssuePriority[]).map(
        (priority) => ({
          icon: <PriorityIcon priority={priority} />,
          label: priorityLabels[priority],
          value: priority,
        }),
      ),
      pluralLabel: "priorities",
      type: "select",
    },
    {
      icon: fieldIcon(TagIcon),
      key: "labels",
      label: "Label",
      options: (Object.keys(labelStyles) as Label[]).map((label) => ({
        icon: (
          <span className={cn("size-2 rounded-full", labelStyles[label].dot)} />
        ),
        label: labelStyles[label].name,
        value: label,
      })),
      pluralLabel: "labels",
      type: "select",
    },
    {
      icon: fieldIcon(TextAaIcon),
      key: "title",
      label: "Title",
      type: "text",
    },
    {
      icon: fieldIcon(HashIcon),
      key: "estimate",
      label: "Estimate",
      type: "number",
      unit: "pts",
    },
    {
      icon: fieldIcon(CalendarBlankIcon),
      key: "created",
      label: "Created",
      type: "date",
    },
  ];

  // Each option shows how many issues it would match alongside the other
  // active filters, so the menu doubles as a facet count.
  return baseFields.map((field) => {
    if (field.type !== "select" || !field.options) {
      return field;
    }

    const scoped = filterItems(
      issues,
      filters.filter((filter) => filter.field !== field.key),
      baseFields,
      getIssueValue,
      NOW,
    );

    return {
      ...field,
      options: field.options.map((option) => ({
        ...option,
        count: scoped.filter((issue) => {
          const value = getIssueValue(issue, field.key);
          return Array.isArray(value)
            ? value.includes(option.value)
            : value === option.value;
        }).length,
      })),
    };
  });
}

export function FilterQueryBuilderShowcase() {
  const shouldReduceMotion = useReducedMotion();
  const [filters, setFilters] = useState<Filter[]>(initialFilters);
  const [preview, setPreview] = useState<Filter[] | null>(null);
  const fields = useMemo(() => buildFields(filters), [filters]);
  const applied = useMemo(
    () => filterItems(issues, filters, fields, getIssueValue, NOW),
    [fields, filters],
  );
  const previewed = useMemo(
    () =>
      preview ? filterItems(issues, preview, fields, getIssueValue, NOW) : null,
    [fields, preview],
  );
  const appliedIds = new Set(applied.map((issue) => issue.id));
  const previewIds = previewed ? new Set(previewed.map(({ id }) => id)) : null;
  const rows = issues.filter(
    (issue) => appliedIds.has(issue.id) || previewIds?.has(issue.id),
  );
  const count = previewed ? previewed.length : applied.length;
  const rowTransition = shouldReduceMotion
    ? { duration: 0.12 }
    : {
        height: { bounce: 0, duration: 0.34, type: "spring" as const },
        opacity: { duration: 0.2, ease: easeOut },
      };

  return (
    <div className="w-full overflow-hidden rounded-[13px] border border-grayscale-3 bg-grayscale-1 small-shadow dark:border-grayscale-4 dark:bg-grayscale-2 dark:shadow-none">
      <div className="flex h-12 items-center justify-between gap-3 border-grayscale-3 border-b px-4 dark:border-grayscale-4">
        <div className="flex min-w-0 items-center gap-2 text-sm">
          <span className="flex size-5 items-center justify-center rounded-md bg-grayscale-12 text-grayscale-1 dark:bg-grayscale-5 dark:text-grayscale-12">
            <StackIcon aria-hidden="true" size={12} weight="fill" />
          </span>
          <span className="font-medium text-grayscale-12">Issues</span>
          <span
            aria-live="polite"
            className={cn(
              "flex items-center gap-1 text-grayscale-10 tabular-nums transition-colors duration-200",
              previewed && "text-blue-11",
            )}
          >
            <NumberFlow animated={!shouldReduceMotion} value={count} />
            <span>{count === 1 ? "issue" : "issues"}</span>
          </span>
          <AnimatePresence initial={false}>
            {previewed ? (
              <motion.span
                animate={{ opacity: 1, scale: 1 }}
                className="flex h-5 items-center gap-1 rounded-md bg-blue-3 px-1.5 font-medium text-[11px] text-blue-11 dark:bg-blue-4"
                exit={{ opacity: 0, scale: shouldReduceMotion ? 1 : 0.94 }}
                initial={{ opacity: 0, scale: shouldReduceMotion ? 1 : 0.94 }}
                transition={{ duration: 0.15, ease: easeOut }}
              >
                <EyeIcon aria-hidden="true" size={12} weight="bold" />
                Preview
              </motion.span>
            ) : null}
          </AnimatePresence>
        </div>
        <button
          className="flex h-7 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-grayscale-3 bg-grayscale-1 px-2 font-medium text-grayscale-11 text-xs transition-[background-color,border-color,transform] duration-150 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)] hover:border-grayscale-4 hover:bg-grayscale-2 active:scale-[0.97] dark:border-grayscale-4 dark:bg-grayscale-3 dark:hover:border-grayscale-5 dark:hover:bg-grayscale-4"
          onClick={() => setFilters(initialFilters)}
          type="button"
        >
          <ArrowCounterClockwiseIcon
            aria-hidden="true"
            size={13}
            weight="bold"
          />
          Reset
        </button>
      </div>

      <FilterQueryBuilder.Root
        aria-label="Issue filters"
        className="border-grayscale-3 border-b px-3 py-2.5 dark:border-grayscale-4"
        fields={fields}
        filters={filters}
        onFiltersChange={setFilters}
        onPreviewChange={setPreview}
      >
        <FilterQueryBuilder.List>
          <FilterQueryBuilder.Add />
        </FilterQueryBuilder.List>
        <FilterQueryBuilder.Clear />
      </FilterQueryBuilder.Root>

      <div className="relative min-h-[22rem]">
        <ul aria-label="Issues">
          <AnimatePresence initial={false}>
            {rows.map((issue) => {
              const isDimmed = previewIds !== null && !previewIds.has(issue.id);

              return (
                <motion.li
                  animate={{
                    height: "auto",
                    opacity: isDimmed ? 0.32 : 1,
                  }}
                  className="overflow-hidden"
                  exit={{ height: shouldReduceMotion ? "auto" : 0, opacity: 0 }}
                  initial={{
                    height: shouldReduceMotion ? "auto" : 0,
                    opacity: 0,
                  }}
                  key={issue.id}
                  transition={rowTransition}
                >
                  <IssueRow issue={issue} />
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>

        <AnimatePresence>
          {rows.length === 0 ? (
            <motion.div
              animate={{ opacity: 1 }}
              className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center"
              exit={{ opacity: 0 }}
              initial={{ opacity: 0 }}
              transition={{ delay: 0.1, duration: 0.2, ease: easeOut }}
            >
              <p className="text-grayscale-10 text-sm">
                No issues match these filters.
              </p>
              <button
                className="h-7 cursor-pointer rounded-lg border border-grayscale-3 bg-grayscale-1 px-2 font-medium text-grayscale-11 text-xs transition-colors hover:border-grayscale-4 hover:bg-grayscale-2 dark:border-grayscale-4 dark:bg-grayscale-3 dark:hover:bg-grayscale-4"
                onClick={() => setFilters([])}
                type="button"
              >
                Clear filters
              </button>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-grayscale-3 border-t px-4 py-2.5 text-[11px] text-grayscale-9 dark:border-grayscale-4">
        <ShortcutHint keys={[["F", "F"]]}>Add filter</ShortcutHint>
        <ShortcutHint
          keys={[
            ["Left", <ArrowLeftIcon key="left" size={9} weight="bold" />],
            ["Right", <ArrowRightIcon key="right" size={9} weight="bold" />],
          ]}
        >
          Move between tokens
        </ShortcutHint>
        <ShortcutHint
          keys={[
            ["Backspace", <BackspaceIcon key="back" size={10} weight="bold" />],
          ]}
        >
          Remove
        </ShortcutHint>
        <ShortcutHint
          keys={[
            ["Up", <ArrowUpIcon key="up" size={9} weight="bold" />],
            ["Down", <ArrowDownIcon key="down" size={9} weight="bold" />],
          ]}
        >
          Preview a value
        </ShortcutHint>
      </div>
    </div>
  );
}

function ShortcutHint({
  children,
  keys,
}: {
  children: string;
  keys: [label: string, glyph: ReactNode][];
}) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="flex gap-0.5">
        {keys.map(([label, glyph]) => (
          <kbd
            aria-label={label}
            className="inline-flex h-4 min-w-4 items-center justify-center rounded border border-grayscale-4 bg-grayscale-2 px-1 font-medium font-sans text-[10px] text-grayscale-10 leading-none dark:border-grayscale-6 dark:bg-grayscale-4"
            key={label}
          >
            {glyph}
          </kbd>
        ))}
      </span>
      {children}
    </span>
  );
}

function IssueRow({ issue }: { issue: Issue }) {
  return (
    <div className="flex h-10 items-center gap-3 border-grayscale-3 border-b px-4 text-[13px] dark:border-grayscale-4">
      <PriorityIcon priority={issue.priority} />
      <span className="hidden w-14 shrink-0 font-mono text-[11px] text-grayscale-9 sm:block">
        {issue.id}
      </span>
      <StatusIcon status={issue.status} />
      <span className="min-w-0 flex-1 truncate text-grayscale-12">
        {issue.title}
      </span>
      <span className="hidden shrink-0 items-center gap-1 md:flex">
        {issue.labels.map((label) => (
          <span
            className="flex h-5 items-center gap-1.5 rounded-full border border-grayscale-4 px-2 text-[11px] text-grayscale-11 dark:border-grayscale-5"
            key={label}
          >
            <span
              className={cn("size-1.5 rounded-full", labelStyles[label].dot)}
            />
            {labelStyles[label].name}
          </span>
        ))}
      </span>
      <span className="hidden w-10 shrink-0 text-right text-[11px] text-grayscale-9 tabular-nums sm:block">
        {issue.estimate} pts
      </span>
      <span className="w-12 shrink-0 text-right text-[11px] text-grayscale-9">
        {formatCreated(issue.createdDaysAgo)}
      </span>
      <Avatar className="size-5 text-[8px]" person={issue.assignee} />
    </div>
  );
}
