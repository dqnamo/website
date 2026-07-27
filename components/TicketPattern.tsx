import type { ComponentPropsWithoutRef } from "react";
import { cn } from "@/helpers/classname-helper";

export type TicketPatternProps = Omit<
  ComponentPropsWithoutRef<"svg">,
  "children"
> & {
  ink?: string;
};

const columnCount = 11;
const rowCount = 11;
const centerColumn = (columnCount - 1) / 2;
const centerRow = (rowCount - 1) / 2;
const maximumDistance = Math.hypot(centerColumn, centerRow);

const dots = Array.from({ length: columnCount * rowCount }, (_, index) => {
  const column = index % columnCount;
  const row = Math.floor(index / columnCount);
  const distance = Math.hypot(column - centerColumn, row - centerRow);
  const proximity = 1 - distance / maximumDistance;
  const manhattanDistance =
    Math.abs(column - centerColumn) + Math.abs(row - centerRow);
  const highlight =
    manhattanDistance <= 2 && (column + row) % 2 === 0 ? 0.14 : 0;

  return {
    cx: 8 + column * 16,
    cy: 12 + row * 16,
    opacity: Math.min(1, 0.34 + proximity * 0.52 + highlight),
    size: 2.25 + proximity * 3.75,
  };
});

export function TicketPattern({
  className,
  ink = "currentColor",
  ...props
}: TicketPatternProps) {
  return (
    <svg
      aria-hidden="true"
      className={cn("block size-full", className)}
      fill="none"
      preserveAspectRatio="xMidYMid meet"
      viewBox="0 0 176 184"
      {...props}
    >
      {dots.map((dot) => (
        <rect
          fill={ink}
          key={`${dot.cx}-${dot.cy}`}
          opacity={dot.opacity}
          height={dot.size}
          width={dot.size}
          x={dot.cx - dot.size / 2}
          y={dot.cy - dot.size / 2}
        />
      ))}
    </svg>
  );
}
