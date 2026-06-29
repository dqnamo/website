"use client";

import { Radio as BaseRadio } from "@base-ui/react/radio";
import { RadioGroup as BaseRadioGroup } from "@base-ui/react/radio-group";
import { cn } from "@/helpers/classname-helper";

export function getRadioBadgeClassName(className?: string) {
  return cn(
    "cursor-pointer rounded-md bg-grayscale-2 px-1.5 py-0.5 text-grayscale-10 text-xs transition-colors",
    "hover:border-grayscale-4 hover:bg-grayscale-3 dark:border-grayscale-5 dark:bg-grayscale-4 dark:hover:border-grayscale-6 dark:hover:bg-grayscale-5",
    "data-[checked]:border-grayscale-5 data-[checked]:bg-grayscale-3 data-[checked]:text-grayscale-12",
    "dark:data-[checked]:border-grayscale-6 dark:data-[checked]:bg-grayscale-5 dark:data-[checked]:text-grayscale-12",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-grayscale-6 focus-visible:ring-offset-1 focus-visible:ring-offset-white dark:focus-visible:ring-grayscale-5 dark:focus-visible:ring-offset-grayscale-3",
    "data-[disabled]:cursor-default data-[disabled]:opacity-40",
    className,
  );
}

const Group = ({
  className,
  ...props
}: React.ComponentProps<typeof BaseRadioGroup>) => (
  <BaseRadioGroup
    className={cn("flex flex-wrap items-center gap-1", className)}
    {...props}
  />
);

const Root = ({
  className,
  children,
  ...props
}: React.ComponentProps<typeof BaseRadio.Root>) => (
  <BaseRadio.Root
    className={cn(getRadioBadgeClassName(), className)}
    nativeButton
    render={<button type="button" />}
    {...props}
  >
    {children}
    <BaseRadio.Indicator className="sr-only" />
  </BaseRadio.Root>
);

const Indicator = ({
  className,
  ...props
}: React.ComponentProps<typeof BaseRadio.Indicator>) => (
  <BaseRadio.Indicator className={cn("sr-only", className)} {...props} />
);

export const Radio = {
  Group,
  Root,
  Indicator,
};
