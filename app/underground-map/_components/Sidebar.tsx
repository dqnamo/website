import { type ReactNode, useRef } from "react";
import { Tooltip } from "@/components/public/Tooltip";
import { cn } from "@/helpers/classname-helper";
import { exportJson, exportSvg, readJson } from "../_lib/export";
import { PANEL_GAP, PANEL_WIDTH } from "../_lib/layout";
import type { MapStyle } from "../_lib/types";
import { DEFAULT_STYLE, useMap } from "../_store/useMap";
import {
  PikaDownloadIcon,
  PikaDustbinIcon,
  PikaFloppyIcon,
  PikaFolderOpenIcon,
  PikaSparkleIcon,
  PikaUturnLeftIcon,
  PikaUturnRightIcon,
} from "./icons";
import { LinesPanel } from "./LinesPanel";
import { Segmented } from "./ui/Segmented";
import { Slider } from "./ui/Slider";
import { Switch } from "./ui/Switch";

/** An inner card of the site's nested card style, as on the homepage. */
const CARD =
  "um-card rounded-[13px] border border-grayscale-4 border-b-2 bg-white dark:bg-grayscale-3";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-1.5 text-[11.5px] font-medium text-grayscale-9">
        {title}
      </h3>
      <div className="flex flex-col gap-1">{children}</div>
    </section>
  );
}

function StyleSlider({
  k,
  label,
  min,
  max,
  step,
  unit,
}: {
  k: keyof MapStyle;
  label: string;
  min: number;
  max: number;
  step?: number;
  unit?: string;
}) {
  const value = useMap((s) => s.style[k]) as number;
  return (
    <Slider
      label={label}
      value={value}
      min={min}
      max={max}
      step={step}
      unit={unit}
      defaultValue={DEFAULT_STYLE[k] as number}
      onChange={(v) => useMap.getState().setStyle({ [k]: v })}
    />
  );
}

function IconButton({
  label,
  onClick,
  disabled,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: ReactNode;
}) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger
        aria-label={label}
        disabled={disabled}
        onClick={onClick}
        className={cn(
          "press flex size-8 cursor-pointer items-center justify-center rounded-lg text-grayscale-10 transition-[transform,background-color,color,opacity] hover:bg-grayscale-2 hover:text-grayscale-12 disabled:pointer-events-none disabled:opacity-35",
          danger && "hover:bg-red-50 hover:text-red-600",
        )}
      >
        {children}
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Positioner>
          <Tooltip.Popup>{label}</Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

export function Sidebar() {
  const title = useMap((s) => s.doc.title);
  const canUndo = useMap((s) => s.past.length > 0);
  const canRedo = useMap((s) => s.future.length > 0);
  const style = useMap((s) => s.style);
  const fileRef = useRef<HTMLInputElement>(null);
  const set = (patch: Partial<MapStyle>) => useMap.getState().setStyle(patch);

  return (
    // Floats over the canvas, clear of the screen's edges: the site's nested card, a grey frame
    // holding the tools in one card and the file actions in another.
    <Tooltip.Provider>
      <aside
        className="absolute flex flex-col gap-1.5 rounded-[16px] border border-grayscale-3 bg-grayscale-2 p-1.5"
        style={{
          top: PANEL_GAP,
          right: PANEL_GAP,
          bottom: PANEL_GAP,
          width: PANEL_WIDTH,
        }}
      >
        <div className={cn(CARD, "flex min-h-0 flex-1 flex-col")}>
          <header className="flex items-center gap-2.5 px-4 pt-4 pb-3">
            <input
              value={title}
              aria-label="Map title"
              spellCheck={false}
              onChange={(e) => useMap.getState().setTitle(e.target.value)}
              className="-mx-1 min-w-0 flex-1 truncate rounded-md bg-transparent px-1 text-[13px] font-semibold tracking-[-0.01em] text-grayscale-12 outline-none transition-shadow hover:shadow-[0_0_0_1px_var(--color-grayscale-4)] focus:shadow-[0_0_0_1.5px_rgb(59_130_246)]"
            />
            <div className="flex">
              <IconButton
                label="Undo (⌘Z)"
                onClick={() => useMap.getState().undo()}
                disabled={!canUndo}
              >
                <PikaUturnLeftIcon size={16} />
              </IconButton>
              <IconButton
                label="Redo (⇧⌘Z)"
                onClick={() => useMap.getState().redo()}
                disabled={!canRedo}
              >
                <PikaUturnRightIcon size={16} />
              </IconButton>
            </div>
          </header>

          <div className="scrollbar-thin flex-1 space-y-5 overflow-y-auto px-4 pt-1 pb-5">
            <LinesPanel />

            <Section title="Canvas">
              <Segmented
                size="sm"
                options={[
                  { value: "paper", label: "Paper" },
                  { value: "night", label: "Night" },
                ]}
                value={style.theme}
                onChange={(v) => set({ theme: v })}
              />
              <StyleSlider
                k="gridSize"
                label="Grid size"
                min={16}
                max={80}
                step={4}
              />
              <Switch
                label="Snap to grid"
                checked={style.snap}
                onChange={(v) => set({ snap: v })}
              />
              <Switch
                label="Show grid"
                checked={style.showGrid}
                onChange={(v) => set({ showGrid: v })}
              />
            </Section>
          </div>
        </div>

        <footer className={cn(CARD, "flex items-center gap-0.5 p-1.5")}>
          <IconButton
            label="Load the example"
            onClick={() => useMap.getState().loadExample()}
          >
            <PikaSparkleIcon size={17} />
          </IconButton>
          <IconButton
            label="Export SVG"
            onClick={() => {
              const svg = document.querySelector<SVGSVGElement>("svg.canvas");
              const { doc, style } = useMap.getState();
              if (svg) exportSvg(svg, doc, style);
            }}
          >
            <PikaDownloadIcon size={17} />
          </IconButton>
          <IconButton
            label="Save file"
            onClick={() => {
              const { doc, style } = useMap.getState();
              exportJson(doc, style);
            }}
          >
            <PikaFloppyIcon size={17} />
          </IconButton>
          <IconButton
            label="Open file"
            onClick={() => fileRef.current?.click()}
          >
            <PikaFolderOpenIcon size={17} />
          </IconButton>
          <div className="ml-auto">
            <IconButton
              danger
              label="Clear map"
              onClick={() => {
                if (!useMap.getState().doc.stations.length) return;
                useMap.getState().clear();
              }}
            >
              <PikaDustbinIcon size={17} />
            </IconButton>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              try {
                const { doc, style } = await readJson(file);
                useMap.getState().loadDoc(doc, { style });
              } catch {
                // Not a map file: leave the current map as it is.
              }
            }}
          />
        </footer>
      </aside>
    </Tooltip.Provider>
  );
}
