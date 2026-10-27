import { useId } from "react";
import { cn } from "@/helpers/classname-helper";

export function Switch({
  label,
  checked,
  onChange,
  hint,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  hint?: string;
}) {
  const id = useId();
  return (
    <div className="flex h-8 items-center justify-between">
      <label
        htmlFor={id}
        className="cursor-pointer text-[12px] text-grayscale-11"
      >
        {label}
        {hint && (
          <kbd className="ml-1.5 text-[10.5px] text-grayscale-9">{hint}</kbd>
        )}
      </label>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          "group cursor-pointer relative h-[18px] w-[30px] shrink-0 rounded-full outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-blue-500/60",
          checked ? "bg-grayscale-12" : "bg-grayscale-5",
        )}
      >
        {/* Thumb stretches while pressed, then settles — feels physical */}
        <span
          className={cn(
            "absolute top-[2px] left-[2px] h-[14px] w-[14px] rounded-full bg-grayscale-1 shadow-[0_1px_2px_rgb(0_0_0/0.2)]",
            "transition-[translate,width] duration-200 ease-(--um-ease-out) group-active:w-[17px]",
            // On a dark page the off thumb lightens so it still stands out from its track.
            checked
              ? "translate-x-[12px] group-active:translate-x-[9px]"
              : "dark:bg-grayscale-11",
          )}
        />
      </button>
    </div>
  );
}
