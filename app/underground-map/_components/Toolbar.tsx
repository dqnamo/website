import type { ReactNode } from "react";
import { cn } from "@/helpers/classname-helper";
import { panelCover } from "../_lib/layout";
import type { Tool } from "../_lib/types";
import { useMap } from "../_store/useMap";
import {
  PikaEraserIcon,
  PikaMaximizeIcon,
  PikaMinusIcon,
  PikaPencilEditLineIcon,
  PikaPlusIcon,
  PikaPointerCursorIcon,
} from "./icons";

const TOOLS: { value: Tool; label: string; icon: ReactNode }[] = [
  {
    value: "draw",
    label: "Draw (D)",
    icon: <PikaPencilEditLineIcon size={16} />,
  },
  {
    value: "move",
    label: "Move (V)",
    icon: <PikaPointerCursorIcon size={16} />,
  },
  { value: "erase", label: "Erase (E)", icon: <PikaEraserIcon size={16} /> },
];

const btn =
  "press cursor-pointer flex size-8 items-center justify-center rounded-lg text-grayscale-10 transition-[transform,background-color,color] hover:bg-grayscale-3 hover:text-grayscale-12";

/** Floating over the canvas's top-left corner: the tools, then the zoom. */
export function Toolbar() {
  const tool = useMap((s) => s.tool);
  const k = useMap((s) => s.view.k);
  const zoom = (f: number) => {
    const { size, zoomAt } = useMap.getState();
    // Zoom about the middle of what's visible, left of the sidebar.
    zoomAt(f, (size.w - panelCover(size.w)) / 2, size.h / 2);
  };

  return (
    <div className="absolute top-4 left-4 flex items-center gap-0.5 rounded-xl bg-grayscale-1/90 p-1 shadow-[0_1px_3px_rgb(0_0_0/0.08),0_0_0_1px_var(--color-grayscale-3)] backdrop-blur-md">
      {TOOLS.map((t) => (
        <button
          key={t.value}
          type="button"
          aria-label={t.label}
          aria-pressed={tool === t.value}
          title={t.label}
          className={cn(
            btn,
            tool === t.value && "bg-grayscale-3 text-grayscale-12",
          )}
          onClick={() => useMap.getState().setTool(t.value, "pointer")}
        >
          {t.icon}
        </button>
      ))}
      <div className="mx-0.5 h-4 w-px bg-grayscale-4" />
      <button
        type="button"
        className={btn}
        onClick={() => zoom(1 / 1.25)}
        aria-label="Zoom out"
      >
        <PikaMinusIcon size={16} />
      </button>
      <button
        type="button"
        className="press cursor-pointer h-8 min-w-12 rounded-lg px-1 font-mono text-[11px] text-grayscale-11 tabular-nums transition-[transform,background-color] hover:bg-grayscale-3"
        onClick={() => zoom(1 / k)}
        title="Reset to 100%"
      >
        {Math.round(k * 100)}%
      </button>
      <button
        type="button"
        className={btn}
        onClick={() => zoom(1.25)}
        aria-label="Zoom in"
      >
        <PikaPlusIcon size={16} />
      </button>
      <button
        type="button"
        className={btn}
        onClick={() => useMap.getState().fit()}
        aria-label="Fit map to screen"
        title="Fit to screen (F)"
      >
        <PikaMaximizeIcon size={16} />
      </button>
    </div>
  );
}
