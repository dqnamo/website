import { useRef, useState } from "react";
import { cn } from "@/helpers/classname-helper";
import { clamp } from "../../_lib/geometry";

interface Props {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  defaultValue?: number;
  unit?: string;
  onChange: (v: number) => void;
}

/**
 * A scrubber: the whole bar is the hit target, the fill tracks the pointer 1:1
 * (no easing — it should feel attached to your finger), double-click resets.
 */
export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  defaultValue,
  unit,
  onChange,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const t = (value - min) / (max - min);
  const decimals = step < 1 ? 1 : 0;

  const commit = (v: number) => {
    const snapped = clamp(Math.round(v / step) * step, min, max);
    const rounded = Number(snapped.toFixed(decimals));
    if (rounded !== value) onChange(rounded);
  };
  const fromPointer = (clientX: number) => {
    const r = ref.current!.getBoundingClientRect();
    commit(min + clamp((clientX - r.left) / r.width, 0, 1) * (max - min));
  };

  return (
    <div
      ref={ref}
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      data-dragging={dragging || undefined}
      className="group relative h-8 cursor-ew-resize touch-none select-none overflow-hidden rounded-lg bg-grayscale-2 outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60"
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        setDragging(true);
        fromPointer(e.clientX);
      }}
      onPointerMove={(e) => dragging && fromPointer(e.clientX)}
      onPointerUp={() => setDragging(false)}
      onPointerCancel={() => setDragging(false)}
      onDoubleClick={() => defaultValue !== undefined && onChange(defaultValue)}
      onKeyDown={(e) => {
        const mult = e.shiftKey ? 10 : 1;
        if (e.key === "ArrowRight" || e.key === "ArrowUp")
          commit(value + step * mult);
        else if (e.key === "ArrowLeft" || e.key === "ArrowDown")
          commit(value - step * mult);
        else return;
        e.preventDefault();
      }}
    >
      <div
        className="absolute inset-0 origin-left bg-grayscale-3 group-data-[dragging]:bg-grayscale-4"
        style={{ transform: `scaleX(${t})` }}
      />
      {/* Handle only appears while you're engaging with the bar, so it never sits on the label at rest */}
      <div
        className={cn(
          "absolute top-1/2 h-3 w-[3px] -translate-y-1/2 rounded-full bg-grayscale-10 opacity-0",
          "transition-[height,opacity,background-color] duration-150 ease-(--um-ease-out)",
          "group-hover:h-4 group-hover:opacity-100 group-focus-visible:opacity-100 group-data-[dragging]:h-4 group-data-[dragging]:bg-grayscale-12 group-data-[dragging]:opacity-100",
        )}
        style={{ left: `max(4px, calc(${t * 100}% - 7px))` }}
      />
      <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-[12px] text-grayscale-11">
        {label}
      </span>
      <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center font-mono text-[11px] text-grayscale-10 tabular-nums">
        {value.toFixed(decimals)}
        {unit}
      </span>
    </div>
  );
}
