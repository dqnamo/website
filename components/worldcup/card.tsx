import { forwardRef, type HTMLAttributes } from "react";
import { cn } from "@/helpers/classname-helper";

export const Card = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "rounded-md bg-grayscale-2 p-3 dark:bg-grayscale-2",
        className,
      )}
      {...props}
    />
  ),
);

Card.displayName = "Card";
