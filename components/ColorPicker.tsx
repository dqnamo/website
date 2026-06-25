"use client";

import { Combobox } from "@base-ui/react/combobox";
import { AnimatePresence, motion } from "motion/react";
import { type CSSProperties, useId, useRef, useState } from "react";
import { cn } from "@/helpers/classname-helper";

const RADIX_COLOR_SCALE_DEFINITIONS = [
  { id: "gold", label: "Gold", family: "Warm" },
  { id: "bronze", label: "Bronze", family: "Warm" },
  { id: "brown", label: "Brown", family: "Warm" },
  { id: "orange", label: "Orange", family: "Warm" },
  { id: "tomato", label: "Tomato", family: "Red" },
  { id: "red", label: "Red", family: "Red" },
  { id: "ruby", label: "Ruby", family: "Red" },
  { id: "crimson", label: "Crimson", family: "Red" },
  { id: "pink", label: "Pink", family: "Red" },
  { id: "plum", label: "Plum", family: "Purple" },
  { id: "purple", label: "Purple", family: "Purple" },
  { id: "violet", label: "Violet", family: "Purple" },
  { id: "iris", label: "Iris", family: "Purple" },
  { id: "indigo", label: "Indigo", family: "Blue" },
  { id: "blue", label: "Blue", family: "Blue" },
  { id: "cyan", label: "Cyan", family: "Blue" },
  { id: "teal", label: "Teal", family: "Green" },
  { id: "jade", label: "Jade", family: "Green" },
  { id: "green", label: "Green", family: "Green" },
  { id: "grass", label: "Grass", family: "Green" },
] as const;

export const RADIX_COLOR_SCALES = RADIX_COLOR_SCALE_DEFINITIONS.map(
  ({ id, label, family }) => ({ id, label, family }),
);

export const RADIX_COLOR_STEP = 9 as const;

export type RadixColorScale =
  (typeof RADIX_COLOR_SCALE_DEFINITIONS)[number]["id"];
export type RadixColorStep = typeof RADIX_COLOR_STEP;
export type RadixColorValue = `${RadixColorScale}-${RadixColorStep}`;

export type RadixColorOption = {
  value: RadixColorValue;
  label: string;
  scale: RadixColorScale;
  scaleLabel: string;
  family: string;
  step: RadixColorStep;
  cssVariable: string;
};

export const DEFAULT_RADIX_COLOR_VALUE = "blue-9" satisfies RadixColorValue;

export const RADIX_COLOR_OPTIONS: RadixColorOption[] =
  RADIX_COLOR_SCALE_DEFINITIONS.map((scale) => ({
    value: `${scale.id}-${RADIX_COLOR_STEP}` as RadixColorValue,
    label: scale.label,
    scale: scale.id,
    scaleLabel: scale.label,
    family: scale.family,
    step: RADIX_COLOR_STEP,
    cssVariable: `var(--${scale.id}-${RADIX_COLOR_STEP})`,
  }));

const RADIX_COLOR_OPTION_BY_VALUE = new Map(
  RADIX_COLOR_OPTIONS.map((option) => [option.value, option]),
);

export function getRadixColorOption(value: RadixColorValue | null | undefined) {
  if (!value) {
    return null;
  }

  return RADIX_COLOR_OPTION_BY_VALUE.get(value) ?? null;
}

function getSwatchStyle(option: RadixColorOption | null): CSSProperties {
  return {
    backgroundColor: option?.cssVariable ?? "transparent",
  };
}

type ColorPickerProps = {
  className?: string;
  defaultValue?: RadixColorValue | null;
  label?: string;
  name?: string;
  onValueChange?: (
    value: RadixColorValue | null,
    option: RadixColorOption | null,
  ) => void;
  placeholder?: string;
  value?: RadixColorValue | null;
};

export function ColorPicker({
  className,
  defaultValue = DEFAULT_RADIX_COLOR_VALUE,
  label = "Color",
  name,
  onValueChange,
  placeholder = "Pick a color",
  value,
}: ColorPickerProps) {
  const id = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [uncontrolledValue, setUncontrolledValue] =
    useState<RadixColorValue | null>(defaultValue);
  const selectedValue = value === undefined ? uncontrolledValue : value;
  const selectedOption = getRadixColorOption(selectedValue);

  function selectOption(option: RadixColorOption | null) {
    const nextValue = option?.value ?? null;

    if (value === undefined) {
      setUncontrolledValue(nextValue);
    }

    onValueChange?.(nextValue, option);
  }

  function handleOpenChange(
    nextOpen: boolean,
    eventDetails: Combobox.Root.ChangeEventDetails,
  ) {
    if (!nextOpen && eventDetails.reason === "item-press") {
      eventDetails.cancel();
      return;
    }

    setOpen(nextOpen);
  }

  return (
    <Combobox.Root
      autoHighlight
      isItemEqualToValue={(item, selectedItem) =>
        item.value === selectedItem.value
      }
      inputValue=""
      itemToStringLabel={(item) => item.label}
      itemToStringValue={(item) => item.value}
      items={RADIX_COLOR_OPTIONS}
      name={name}
      onOpenChange={handleOpenChange}
      onValueChange={selectOption}
      open={open}
      value={selectedOption}
    >
      <div
        className={cn("flex min-w-0 flex-col gap-2 items-center", className)}
      >
        <label
          className="font-mono font-semibold text-[10px] text-grayscale-10 uppercase leading-none"
          htmlFor={id}
        >
          {label}
        </label>

        <Combobox.Trigger
          aria-label="Open color list"
          className="flex h-8 px-2 cursor-pointer items-center justify-center rounded-lg border border-grayscale-3 bg-white text-grayscale-12 transition-colors hover:bg-grayscale-2 focus-visible:border-grayscale-7 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-grayscale-4 data-[disabled]:cursor-default data-[disabled]:opacity-40 dark:border-grayscale-6 dark:bg-grayscale-4 dark:hover:bg-grayscale-5 dark:focus-visible:ring-grayscale-5"
          ref={triggerRef}
          type="button"
        >
          <span
            aria-hidden="true"
            className="size-4 shrink-0 rounded border border-black/10 "
            style={getSwatchStyle(selectedOption)}
          />
        </Combobox.Trigger>
        <Combobox.Input
          className="sr-only"
          id={id}
          placeholder={placeholder}
          readOnly
        />
      </div>

      <AnimatePresence>
        {open && (
          <Combobox.Portal keepMounted>
            <Combobox.Positioner
              align="start"
              anchor={triggerRef}
              className="z-50 w-max max-w-[calc(100vw-2rem)]"
              side="bottom"
              sideOffset={6}
            >
              <Combobox.Popup
                className="max-h-80 overflow-hidden rounded-lg border border-grayscale-3 bg-white small-shadow outline-none dark:border-grayscale-6 dark:bg-grayscale-4"
                render={
                  <motion.div
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.96, y: -4 }}
                    initial={{ opacity: 0, scale: 0.96, y: -4 }}
                    transition={{ duration: 0.14, ease: "easeOut" }}
                  />
                }
              >
                <Combobox.Empty>
                  <div className="text-center text-grayscale-10 text-sm">
                    No colors found.
                  </div>
                </Combobox.Empty>
                <Combobox.List className="grid max-h-72 w-max grid-cols-4 gap-2 p-2 overflow-y-auto">
                  {(item: RadixColorOption) => (
                    <Combobox.Item
                      aria-label={`${item.label} ${item.value}`}
                      className="group relative flex size-5 cursor-pointer items-center justify-center rounded-md outline-none transition-transform hover:scale-105 focus-visible:outline-2 focus-visible:outline-grayscale-12 focus-visible:outline-offset-2 data-[highlighted]:scale-105"
                      key={item.value}
                      style={getSwatchStyle(item)}
                      value={item}
                    >
                      <span
                        aria-hidden="true"
                        className="size-2 rounded bg-white/85 opacity-0 shadow-sm group-data-[selected]:opacity-100"
                      />
                    </Combobox.Item>
                  )}
                </Combobox.List>
              </Combobox.Popup>
            </Combobox.Positioner>
          </Combobox.Portal>
        )}
      </AnimatePresence>
    </Combobox.Root>
  );
}
