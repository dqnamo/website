import { cn } from "@/helpers/classname-helper";

export type IssueStatus =
  | "backlog"
  | "todo"
  | "in_progress"
  | "in_review"
  | "done";

export type IssuePriority = "none" | "urgent" | "high" | "medium" | "low";

export type Person = "mira" | "theo" | "ava" | "jonah";

const statusColors: Record<IssueStatus, string> = {
  backlog: "text-grayscale-9",
  todo: "text-grayscale-10",
  in_progress: "text-amber-9",
  in_review: "text-green-9",
  done: "text-indigo-9",
};

const statusProgress: Partial<Record<IssueStatus, number>> = {
  in_progress: 0.5,
  in_review: 0.75,
};

const pieRadius = 1.75;
const pieCircumference = 2 * Math.PI * pieRadius;

export function StatusIcon({
  className,
  status,
}: {
  className?: string;
  status: IssueStatus;
}) {
  const progress = statusProgress[status];

  return (
    <svg
      aria-hidden="true"
      className={cn("size-3.5 shrink-0", statusColors[status], className)}
      fill="none"
      viewBox="0 0 14 14"
    >
      {status === "done" ? (
        <>
          <circle cx="7" cy="7" fill="currentColor" r="6.25" />
          <path
            d="M4.4 7.2 6.1 8.9 9.6 5.2"
            stroke="white"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.5"
          />
        </>
      ) : (
        <circle
          cx="7"
          cy="7"
          r="5.5"
          stroke="currentColor"
          strokeDasharray={status === "backlog" ? "1.4 1.8" : undefined}
          strokeWidth="1.5"
        />
      )}
      {progress ? (
        <circle
          cx="7"
          cy="7"
          r={pieRadius}
          stroke="currentColor"
          strokeDasharray={`${pieCircumference * progress} ${pieCircumference}`}
          strokeWidth={pieRadius * 2}
          transform="rotate(-90 7 7)"
        />
      ) : null}
    </svg>
  );
}

const priorityBars: Partial<Record<IssuePriority, number>> = {
  high: 3,
  low: 1,
  medium: 2,
};

export function PriorityIcon({
  className,
  priority,
}: {
  className?: string;
  priority: IssuePriority;
}) {
  if (priority === "urgent") {
    return (
      <svg
        aria-hidden="true"
        className={cn("size-3.5 shrink-0 text-orange-9", className)}
        fill="none"
        viewBox="0 0 14 14"
      >
        <rect fill="currentColor" height="12" rx="3" width="12" x="1" y="1" />
        <rect
          fill="white"
          height="4.5"
          rx="0.75"
          width="1.5"
          x="6.25"
          y="3.5"
        />
        <circle cx="7" cy="10" fill="white" r="0.9" />
      </svg>
    );
  }

  if (priority === "none") {
    return (
      <svg
        aria-hidden="true"
        className={cn("size-3.5 shrink-0 text-grayscale-9", className)}
        fill="currentColor"
        viewBox="0 0 14 14"
      >
        <circle cx="3" cy="7" r="1" />
        <circle cx="7" cy="7" r="1" />
        <circle cx="11" cy="7" r="1" />
      </svg>
    );
  }

  const active = priorityBars[priority] ?? 0;

  return (
    <svg
      aria-hidden="true"
      className={cn("size-3.5 shrink-0 text-grayscale-11", className)}
      fill="currentColor"
      viewBox="0 0 14 14"
    >
      {[5, 8, 11].map((height, index) => (
        <rect
          height={height}
          key={height}
          opacity={index < active ? 1 : 0.28}
          rx="1"
          width="2.5"
          x={1.75 + index * 4}
          y={12.5 - height}
        />
      ))}
    </svg>
  );
}

export const people: Record<Person, { className: string; name: string }> = {
  ava: { className: "bg-teal-9", name: "Ava Lindqvist" },
  jonah: { className: "bg-orange-9", name: "Jonah Reyes" },
  mira: { className: "bg-pink-9", name: "Mira Chen" },
  theo: { className: "bg-blue-9", name: "Theo Park" },
};

export function Avatar({
  className,
  person,
}: {
  className?: string;
  person: Person | null;
}) {
  if (!person) {
    return (
      <span
        aria-hidden="true"
        className={cn(
          "block size-4 shrink-0 rounded-full border border-grayscale-8 border-dashed",
          className,
        )}
      />
    );
  }

  const { className: colorClassName, name } = people[person];
  const initials = name
    .split(" ")
    .map((part) => part[0])
    .join("");

  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex size-4 shrink-0 items-center justify-center rounded-full font-semibold text-[7px] text-white tracking-tight",
        colorClassName,
        className,
      )}
    >
      {initials}
    </span>
  );
}
