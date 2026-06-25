export const usageSource = `import { useState } from "react";
import {
  ColorPicker,
  DEFAULT_RADIX_COLOR_VALUE,
  type RadixColorValue,
} from "@/components/ColorPicker";

export function ColorPickerExample() {
  const [value, setValue] = useState<RadixColorValue | null>(
    DEFAULT_RADIX_COLOR_VALUE,
  );

  return (
    <ColorPicker
      label="Color"
      onValueChange={(nextValue) => setValue(nextValue)}
      value={value}
    />
  );
}
`;
