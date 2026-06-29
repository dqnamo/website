"use client";

import { Tooltip as BaseTooltip } from "@base-ui/react/tooltip";
import { cn } from "@/helpers/classname-helper";

const Provider = ({
  delay = 400,
  ...props
}: React.ComponentProps<typeof BaseTooltip.Provider>) => (
  <BaseTooltip.Provider delay={delay} {...props} />
);

const Root = (props: React.ComponentProps<typeof BaseTooltip.Root>) => (
  <BaseTooltip.Root {...props} />
);

const Trigger = ({
  className,
  ...props
}: React.ComponentProps<typeof BaseTooltip.Trigger>) => (
  <BaseTooltip.Trigger
    className={cn(
      "inline-flex shrink-0 cursor-default rounded-sm text-grayscale-9 outline-none transition-colors hover:text-grayscale-11 focus-visible:text-grayscale-11 focus-visible:ring-2 focus-visible:ring-grayscale-6 focus-visible:ring-offset-1 focus-visible:ring-offset-white dark:focus-visible:ring-grayscale-5 dark:focus-visible:ring-offset-grayscale-5",
      className,
    )}
    {...props}
  />
);

const Portal = (props: React.ComponentProps<typeof BaseTooltip.Portal>) => (
  <BaseTooltip.Portal {...props} />
);

const Positioner = ({
  className,
  side = "top",
  sideOffset = 6,
  ...props
}: React.ComponentProps<typeof BaseTooltip.Positioner>) => (
  <BaseTooltip.Positioner
    className={cn("z-[70]", className)}
    side={side}
    sideOffset={sideOffset}
    {...props}
  />
);

const Popup = ({
  className,
  ...props
}: React.ComponentProps<typeof BaseTooltip.Popup>) => (
  <BaseTooltip.Popup
    className={cn(
      "max-w-48 rounded-md border border-grayscale-3 bg-white px-2 py-1 text-grayscale-12 text-xs leading-4 small-shadow outline-none dark:border-grayscale-6 dark:bg-grayscale-5 dark:shadow-none",
      className,
    )}
    {...props}
  />
);

export const Tooltip = {
  Provider,
  Root,
  Trigger,
  Portal,
  Positioner,
  Popup,
};
