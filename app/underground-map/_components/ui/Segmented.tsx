import type { ReactNode } from "react";
import { cn } from "@/helpers/classname-helper";

interface Option<T extends string> {
  value: T;
  label: string;
  icon?: ReactNode;
  shortcut?: string;
}

interface Props<T extends string> {
  options: Option<T>[];
  value: T;
  onChange: (v: T) => void;
  /** skip the transition (keyboard-driven changes shouldn't animate) */
  instant?: boolean;
  size?: "sm" | "md";
}

/**
 * The "active" copy of the control sits on top, clipped down to the selected
 * segment. Animating the clip moves background and text colour as one shape,
 * which per-button colour transitions can never quite line up.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  instant,
  size = "md",
}: Props<T>) {
  const n = options.length;
  const i = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );
  const left = (i / n) * 100;
  const right = ((n - i - 1) / n) * 100;
  const h = size === "sm" ? "h-7" : "h-8";

  const row = (active: boolean) =>
    options.map((o) => (
      <span
        key={o.value}
        className={cn(
          "flex items-center justify-center gap-1.5 text-[12px] font-medium",
          h,
          active
            ? "rounded-md bg-white text-grayscale-12 dark:bg-grayscale-1"
            : "text-grayscale-10",
        )}
      >
        {o.icon}
        {o.label}
      </span>
    ));

  return (
    <div className="relative rounded-lg bg-grayscale-2 p-0.5">
      <div
        className="grid"
        style={{ gridTemplateColumns: `repeat(${n}, 1fr)` }}
      >
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            title={o.shortcut ? `${o.label} (${o.shortcut})` : o.label}
            className={cn(
              "press cursor-pointer relative z-0 flex items-center justify-center gap-1.5 rounded-md text-[12px] font-medium text-grayscale-10 outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60",
              h,
            )}
            onClick={() => onChange(o.value)}
          >
            {o.icon}
            {o.label}
          </button>
        ))}
      </div>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0.5 grid drop-shadow-[0_1px_2px_rgb(0_0_0/0.08)]"
        style={{ gridTemplateColumns: `repeat(${n}, 1fr)` }}
      >
        <div
          className="col-span-full grid"
          style={{
            gridTemplateColumns: `repeat(${n}, 1fr)`,
            clipPath: `inset(0 ${right}% 0 ${left}% round 6px)`,
            transition: instant ? "none" : "clip-path 240ms var(--um-ease-out)",
          }}
        >
          {row(true)}
        </div>
      </div>
    </div>
  );
}
