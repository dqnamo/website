import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/helpers/classname-helper";
import { stationsOnLine } from "../_lib/doc";
import { EASE_OUT } from "../_lib/ease";
import { PALETTE } from "../_lib/palette";
import type { Line } from "../_lib/types";
import { activeLineOf, useMap } from "../_store/useMap";
import { PikaDustbinIcon, PikaPlusIcon } from "./icons";

export function LinesPanel() {
  const doc = useMap((s) => s.doc);
  const active = useMap((s) => activeLineOf(s));
  const counts = useMemo(
    () => new Map(doc.lines.map((l) => [l.id, stationsOnLine(doc, l.id).size])),
    [doc],
  );

  return (
    <section>
      <div className="mb-1.5 flex items-center justify-between">
        <h3 className="text-[11.5px] font-medium text-grayscale-9">Lines</h3>
        <button
          type="button"
          className="press cursor-pointer -mr-1.5 flex h-6 items-center gap-1 rounded-md px-1.5 text-[11.5px] font-medium text-grayscale-10 transition-[transform,background-color,color] hover:bg-grayscale-3 hover:text-grayscale-12"
          onClick={() => useMap.getState().addLine()}
        >
          <PikaPlusIcon size={14} strokeWidth={2.25} /> New line
        </button>
      </div>
      <div className="-mx-2 flex flex-col">
        <AnimatePresence initial={false}>
          {doc.lines.map((l, i) => (
            <motion.div
              key={l.id}
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0, transition: { duration: 0.14 } }}
              transition={{ duration: 0.22, ease: EASE_OUT }}
            >
              <LineRow
                line={l}
                index={i}
                active={active?.id === l.id}
                count={counts.get(l.id) ?? 0}
              />
            </motion.div>
          ))}
        </AnimatePresence>
        {doc.lines.length === 0 && (
          <p className="px-2 py-2 text-[12px] text-grayscale-9">
            No lines yet.
          </p>
        )}
      </div>
    </section>
  );
}

function LineRow({
  line,
  index,
  active,
  count,
}: {
  line: Line;
  index: number;
  active: boolean;
  count: number;
}) {
  const [editing, setEditing] = useState(false);
  const [picking, setPicking] = useState(false);

  return (
    <div
      data-active={active || undefined}
      className={cn(
        "group relative flex h-9 items-center gap-2.5 rounded-lg px-2 transition-colors duration-150",
        active ? "bg-grayscale-2" : "hover:bg-grayscale-2/60",
      )}
    >
      <button
        type="button"
        aria-label={`Change ${line.name} colour`}
        className="press cursor-pointer relative z-10 size-[18px] shrink-0 rounded-[5px] shadow-[inset_0_0_0_1px_rgb(0_0_0/0.1)] transition-transform"
        style={{ backgroundColor: line.color }}
        onClick={(e) => {
          e.stopPropagation();
          setPicking((p) => !p);
        }}
      />

      {editing ? (
        <NameInput
          initial={line.name}
          onDone={(name) => {
            if (name) useMap.getState().updateLine(line.id, { name });
            setEditing(false);
          }}
        />
      ) : (
        // The name's hit area stretches over the whole row, so anywhere on it picks the line.
        <button
          type="button"
          aria-pressed={active}
          className={cn(
            "min-w-0 flex-1 cursor-pointer truncate text-left text-[13px] outline-none after:absolute after:inset-0 after:rounded-lg focus-visible:after:ring-2 focus-visible:after:ring-blue-500/60",
            active ? "font-medium text-grayscale-12" : "text-grayscale-11",
          )}
          onClick={() => useMap.getState().setActiveLine(line.id)}
          onDoubleClick={() => setEditing(true)}
          title={
            index < 9
              ? `Press ${index + 1} to draw with this line · double-click to rename`
              : "Double-click to rename"
          }
        >
          {line.name}
        </button>
      )}

      <span className="text-[11px] text-grayscale-9 tabular-nums group-hover:hidden">
        {count === 1 ? "1 stop" : `${count} stops`}
      </span>
      <button
        type="button"
        aria-label={`Delete ${line.name}`}
        className="press cursor-pointer relative z-10 hidden size-6 items-center justify-center rounded-md text-grayscale-9 transition-[transform,background-color,color] group-hover:flex hover:bg-red-50 hover:text-red-600"
        onClick={(e) => {
          e.stopPropagation();
          useMap.getState().deleteLine(line.id);
        }}
      >
        <PikaDustbinIcon size={14} />
      </button>

      <AnimatePresence>
        {picking && (
          <ColorPicker
            value={line.color}
            onPick={(color, name) => {
              const patch: Partial<Line> = { color };
              // Keep auto-generated names in sync with the colour they describe.
              if (name && PALETTE.some((p) => p.name === line.name))
                patch.name = name;
              useMap.getState().updateLine(line.id, patch);
            }}
            onClose={() => setPicking(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function NameInput({
  initial,
  onDone,
}: {
  initial: string;
  onDone: (v: string | null) => void;
}) {
  const [v, setV] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);
  const done = useRef(false);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  const finish = (val: string | null) => {
    if (done.current) return;
    done.current = true;
    onDone(val?.trim() || null);
  };
  return (
    <input
      ref={ref}
      value={v}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => finish(v)}
      onKeyDown={(e) => {
        if (e.key === "Enter") finish(v);
        if (e.key === "Escape") finish(null);
      }}
      className="-mx-1 min-w-0 flex-1 rounded-md bg-grayscale-1 px-1 py-0.5 text-[13px] text-grayscale-12 shadow-[0_0_0_1.5px_rgb(59_130_246)] outline-none"
    />
  );
}

function ColorPicker({
  value,
  onPick,
  onClose,
}: {
  value: string;
  onPick: (color: string, name?: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const down = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    // Defer so the click that opened us doesn't immediately close us.
    const t = setTimeout(
      () => document.addEventListener("pointerdown", down),
      0,
    );
    document.addEventListener("keydown", key);
    return () => {
      clearTimeout(t);
      document.removeEventListener("pointerdown", down);
      document.removeEventListener("keydown", key);
    };
  }, [onClose]);

  return (
    <motion.div
      ref={ref}
      className="absolute top-full left-0 z-30 mt-1 w-[212px] origin-top-left rounded-xl bg-grayscale-1 p-2.5 shadow-[0_8px_24px_rgb(0_0_0/0.12),0_0_0_1px_var(--color-grayscale-4)]"
      initial={{ opacity: 0, transform: "scale(0.96) translateY(-2px)" }}
      animate={{ opacity: 1, transform: "scale(1) translateY(0px)" }}
      exit={{
        opacity: 0,
        transform: "scale(0.98)",
        transition: { duration: 0.1 },
      }}
      transition={{ duration: 0.16, ease: EASE_OUT }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="grid grid-cols-7 gap-1.5">
        {PALETTE.map((p) => (
          <button
            key={p.color}
            type="button"
            title={p.name}
            aria-label={p.name}
            className={cn(
              "press cursor-pointer size-[22px] rounded-[6px] shadow-[inset_0_0_0_1px_rgb(0_0_0/0.1)] transition-[transform,box-shadow]",
              p.color.toLowerCase() === value.toLowerCase() &&
                "shadow-[0_0_0_2px_var(--color-grayscale-1),0_0_0_3.5px_var(--color-grayscale-12)]",
            )}
            style={{ backgroundColor: p.color }}
            onClick={() => onPick(p.color, p.name)}
          />
        ))}
      </div>
      <label className="mt-2.5 flex h-7 cursor-pointer items-center gap-2 rounded-md px-1 text-[12px] text-grayscale-10 hover:bg-grayscale-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onPick(e.target.value)}
          className="size-4 cursor-pointer rounded-sm border-0 bg-transparent p-0 [&::-webkit-color-swatch]:rounded-sm [&::-webkit-color-swatch]:border-0 [&::-webkit-color-swatch-wrapper]:p-0"
        />
        Custom colour
        <span className="ml-auto font-mono text-[10.5px] uppercase">
          {value}
        </span>
      </label>
    </motion.div>
  );
}
