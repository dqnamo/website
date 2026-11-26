"use client";

import { CheckCircleIcon } from "@phosphor-icons/react/dist/ssr";
import { type CSSProperties, useState } from "react";
import {
  ColorPicker,
  DEFAULT_RADIX_COLOR_VALUE,
  getRadixColorOption,
  type RadixColorValue,
} from "@/components/ColorPicker";

export function ColorPickerShowcase() {
  const [value, setValue] = useState<RadixColorValue | null>(
    DEFAULT_RADIX_COLOR_VALUE,
  );
  const selectedOption = getRadixColorOption(value);
  const selectedScale = selectedOption?.scale ?? "blue";

  return (
    <div className="grid h-full w-full grid-cols-2 gap-2">
      <div className="flex h-full w-full items-center justify-center rounded-[13px] border border-grayscale-3 bg-grayscale-1 px-8 py-16 small-shadow dark:border-grayscale-4 dark:bg-grayscale-3 dark:shadow-none">
        <ColorPicker
          label="Color"
          onValueChange={(nextValue) => setValue(nextValue)}
          value={value}
        />
      </div>
      <div className="flex h-full w-full flex-col items-center justify-center rounded-[13px] border border-grayscale-3 bg-grayscale-1 px-8 py-16 small-shadow dark:border-grayscale-4 dark:bg-grayscale-3 dark:shadow-none">
        <div
          className="flex flex-row items-center gap-2 rounded-lg border border-[var(--badge-border-color)] bg-[var(--badge-background-color)] px-2 py-1 text-[var(--badge-color)] transition-colors duration-150 ease-out dark:border-grayscale-7 dark:bg-grayscale-5"
          style={
            {
              "--badge-background-color": `var(--${selectedScale}-3)`,
              "--badge-border-color": `var(--${selectedScale}-4)`,
              "--badge-color": `var(--${selectedScale}-9)`,
            } as CSSProperties
          }
        >
          <CheckCircleIcon size={16} weight="fill" />
          <p className="text-sm font-medium">Color Coded</p>
        </div>
      </div>
    </div>
  );
}
