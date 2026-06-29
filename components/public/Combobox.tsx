"use client";

import { Combobox as BaseCombobox } from "@base-ui/react/combobox";
import { getButtonClassName } from "@/components/public/Button";
import { cn } from "@/helpers/classname-helper";

const Root = <Value, Multiple extends boolean | undefined = false>(
  props: React.ComponentProps<typeof BaseCombobox.Root<Value, Multiple>>,
) => <BaseCombobox.Root {...props} />;

const Label = ({
  className,
  ...props
}: React.ComponentProps<typeof BaseCombobox.Label>) => (
  <BaseCombobox.Label
    className={cn(
      "font-mono font-semibold text-[10px] text-grayscale-10 uppercase leading-none",
      className,
    )}
    {...props}
  />
);

const Value = (props: React.ComponentProps<typeof BaseCombobox.Value>) => (
  <BaseCombobox.Value {...props} />
);

const Icon = ({
  className,
  ...props
}: React.ComponentProps<typeof BaseCombobox.Icon>) => (
  <BaseCombobox.Icon
    className={cn("ml-auto shrink-0 text-grayscale-10", className)}
    {...props}
  />
);

const Input = ({
  className,
  ...props
}: React.ComponentProps<typeof BaseCombobox.Input>) => (
  <BaseCombobox.Input
    className={cn(
      "w-full bg-transparent px-2 py-1.5 text-grayscale-12 text-sm outline-none placeholder:text-grayscale-9",
      className,
    )}
    {...props}
  />
);

const InputGroup = ({
  className,
  ...props
}: React.ComponentProps<typeof BaseCombobox.InputGroup>) => (
  <BaseCombobox.InputGroup
    className={cn(
      "flex items-center gap-1 rounded-lg border border-grayscale-3 bg-white px-2 dark:border-grayscale-4 dark:bg-grayscale-3",
      className,
    )}
    {...props}
  />
);

const Clear = ({
  className,
  ...props
}: React.ComponentProps<typeof BaseCombobox.Clear>) => (
  <BaseCombobox.Clear
    className={cn(
      "cursor-pointer rounded p-0.5 text-grayscale-10 transition-colors hover:bg-grayscale-2 hover:text-grayscale-11 dark:hover:bg-grayscale-4",
      className,
    )}
    {...props}
  />
);

const Trigger = ({
  className,
  ...props
}: React.ComponentProps<typeof BaseCombobox.Trigger>) => (
  <BaseCombobox.Trigger
    className={cn(
      getButtonClassName({ variant: "secondary" }),
      "data-[popup-open]:border-grayscale-4 data-[popup-open]:bg-grayscale-2 dark:data-[popup-open]:border-grayscale-5 dark:data-[popup-open]:bg-grayscale-4",
      className,
    )}
    {...props}
  />
);

const Chips = ({
  className,
  ...props
}: React.ComponentProps<typeof BaseCombobox.Chips>) => (
  <BaseCombobox.Chips
    className={cn("flex flex-wrap items-center gap-1", className)}
    {...props}
  />
);

const Chip = ({
  className,
  ...props
}: React.ComponentProps<typeof BaseCombobox.Chip>) => (
  <BaseCombobox.Chip
    className={cn(
      "flex items-center gap-1 rounded-md border border-grayscale-3 bg-grayscale-2 px-1.5 py-0.5 text-grayscale-11 text-xs dark:border-grayscale-5 dark:bg-grayscale-4",
      className,
    )}
    {...props}
  />
);

const ChipRemove = ({
  className,
  ...props
}: React.ComponentProps<typeof BaseCombobox.ChipRemove>) => (
  <BaseCombobox.ChipRemove
    className={cn(
      "cursor-pointer rounded p-0.5 text-grayscale-10 transition-colors hover:bg-grayscale-3 hover:text-grayscale-11 dark:hover:bg-grayscale-5",
      className,
    )}
    {...props}
  />
);

const List = ({
  className,
  ref,
  ...props
}: React.ComponentProps<typeof BaseCombobox.List>) => (
  <BaseCombobox.List
    ref={ref}
    className={cn("max-h-60 overflow-y-auto p-1 outline-none", className)}
    {...props}
  />
);

const Portal = ({
  ...props
}: React.ComponentProps<typeof BaseCombobox.Portal>) => (
  <BaseCombobox.Portal {...props} />
);

const Backdrop = ({
  className,
  ...props
}: React.ComponentProps<typeof BaseCombobox.Backdrop>) => (
  <BaseCombobox.Backdrop
    className={cn("fixed inset-0 z-40 bg-black/10", className)}
    {...props}
  />
);

const Positioner = ({
  className,
  side = "top",
  ...props
}: React.ComponentProps<typeof BaseCombobox.Positioner>) => (
  <BaseCombobox.Positioner
    className={cn("z-50 w-[var(--anchor-width)] min-w-48", className)}
    side={side}
    {...props}
  />
);

const Popup = ({
  className,
  ...props
}: React.ComponentProps<typeof BaseCombobox.Popup>) => (
  <BaseCombobox.Popup
    className={cn(
      "overflow-hidden rounded-lg border border-grayscale-3 bg-white small-shadow outline-none dark:border-grayscale-4 dark:bg-grayscale-3 dark:shadow-none",
      className,
    )}
    {...props}
  />
);

const Arrow = ({
  className,
  ...props
}: React.ComponentProps<typeof BaseCombobox.Arrow>) => (
  <BaseCombobox.Arrow
    className={cn(
      "fill-white stroke-grayscale-3 dark:fill-grayscale-3",
      className,
    )}
    {...props}
  />
);

const Status = ({
  className,
  ...props
}: React.ComponentProps<typeof BaseCombobox.Status>) => (
  <BaseCombobox.Status className={cn("sr-only", className)} {...props} />
);

const Empty = ({
  className,
  ...props
}: React.ComponentProps<typeof BaseCombobox.Empty>) => (
  <BaseCombobox.Empty
    className={cn(
      "px-2 py-3 text-center text-grayscale-10 text-sm empty:px-0 empty:py-0",
      className,
    )}
    {...props}
  />
);

const Collection = (
  props: React.ComponentProps<typeof BaseCombobox.Collection>,
) => <BaseCombobox.Collection {...props} />;

const Row = ({
  className,
  ...props
}: React.ComponentProps<typeof BaseCombobox.Row>) => (
  <BaseCombobox.Row className={cn(className)} {...props} />
);

const Item = ({
  className,
  ...props
}: React.ComponentProps<typeof BaseCombobox.Item>) => (
  <BaseCombobox.Item
    className={cn(
      "flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-grayscale-11 text-sm outline-none transition-colors data-[highlighted]:bg-grayscale-2 data-[selected]:text-grayscale-12 dark:data-[highlighted]:bg-grayscale-4",
      className,
    )}
    {...props}
  />
);

const ItemIndicator = ({
  className,
  ...props
}: React.ComponentProps<typeof BaseCombobox.ItemIndicator>) => (
  <BaseCombobox.ItemIndicator
    className={cn(
      "flex size-4 shrink-0 items-center justify-center",
      className,
    )}
    {...props}
  />
);

const Group = ({
  className,
  ...props
}: React.ComponentProps<typeof BaseCombobox.Group>) => (
  <BaseCombobox.Group className={cn(className)} {...props} />
);

const GroupLabel = ({
  className,
  ...props
}: React.ComponentProps<typeof BaseCombobox.GroupLabel>) => (
  <BaseCombobox.GroupLabel
    className={cn(
      "px-2 py-1 font-mono font-semibold text-[10px] text-grayscale-9 uppercase",
      className,
    )}
    {...props}
  />
);

const Separator = ({
  className,
  ...props
}: React.ComponentProps<typeof BaseCombobox.Separator>) => (
  <BaseCombobox.Separator
    className={cn("my-1 h-px bg-grayscale-3 dark:bg-grayscale-5", className)}
    {...props}
  />
);

export const Combobox = {
  Root,
  Label,
  Value,
  Icon,
  Input,
  InputGroup,
  Clear,
  Trigger,
  Chips,
  Chip,
  ChipRemove,
  List,
  Portal,
  Backdrop,
  Positioner,
  Popup,
  Arrow,
  Status,
  Empty,
  Collection,
  Row,
  Item,
  ItemIndicator,
  Group,
  GroupLabel,
  Separator,
  useFilter: BaseCombobox.useFilter,
  useFilteredItems: BaseCombobox.useFilteredItems,
};
