import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { type ReactNode, useState } from "react";
import { cn } from "@/helpers/classname-helper";
import { EASE_OUT } from "../_lib/ease";
import { isLight } from "../_lib/palette";
import type { RenderModel } from "../_lib/render";
import type { Vec } from "../_lib/types";
import { useMap } from "../_store/useMap";
import {
  PikaCheckIcon,
  PikaDustbinIcon,
  PikaEaseInOutIcon,
  PikaPencilEditBoxIcon,
  PikaPlusCircleIcon,
  PikaPlusIcon,
  PikaTagIcon,
} from "./icons";

export interface RadialItem {
  key: string;
  label: string;
  hint?: string;
  color?: string;
  icon?: ReactNode;
  checked?: boolean;
  danger?: boolean;
  onSelect: () => void;
}

const ITEM = 38;

export function RadialMenu({ model }: { model: RenderModel }) {
  const radial = useMap((s) => s.radial);
  const view = useMap((s) => s.view);
  const doc = useMap((s) => s.doc);

  let node: ReactNode = null;

  if (radial?.kind === "station") {
    const rs = model.stationMap.get(radial.id);
    if (rs) {
      const st = useMap.getState;
      const id = rs.s.id;
      const lineItems: RadialItem[] = doc.lines.map((l, i) => ({
        key: l.id,
        label: rs.lines.includes(l.id)
          ? `Extend ${l.name}`
          : `Connect via ${l.name}`,
        hint: i < 9 ? String(i + 1) : undefined,
        color: l.color,
        checked: rs.lines.includes(l.id),
        onSelect: () => {
          st().setActiveLine(l.id);
          st().startConnect(id, l.id, "click");
        },
      }));
      const items: RadialItem[] = [
        {
          key: "delete",
          label: "Delete station",
          hint: "⌫",
          danger: true,
          icon: <PikaDustbinIcon size={17} />,
          onSelect: () => st().deleteStation(id),
        },
        {
          key: "rename",
          label: "Rename",
          hint: "R",
          icon: <PikaPencilEditBoxIcon size={16} />,
          onSelect: () => st().startRename(id),
        },
        ...lineItems,
        {
          key: "new",
          label: "New line from here",
          hint: "N",
          icon: <PikaPlusIcon size={18} strokeWidth={2.25} />,
          onSelect: () => {
            const lid = st().addLine();
            st().startConnect(id, lid, "click");
          },
        },
        {
          key: "label",
          label: "Move label",
          hint: "L",
          icon: <PikaTagIcon size={16} />,
          onSelect: () => st().cycleLabel(id, rs.label.dir),
        },
      ];
      node = (
        <Radial
          key={`s-${id}`}
          center={toScreen(rs.s, view)}
          items={items}
          title={rs.s.name}
          keepOpen={["label"]}
        />
      );
    }
  } else if (radial?.kind === "segment") {
    const seg = doc.segments.find((s) => s.id === radial.id);
    const line = seg && doc.lines.find((l) => l.id === seg.line);
    if (seg && line) {
      const st = useMap.getState;
      const key = model.segs.find((s) => s.id === seg.id)?.key;
      const name = (id: string) =>
        doc.stations.find((s) => s.id === id)?.name ?? "?";
      const items: RadialItem[] = [
        {
          key: "delete",
          label: "Remove this hop",
          danger: true,
          icon: <PikaDustbinIcon size={17} />,
          onSelect: () => st().deleteSegment(seg.id),
        },
        {
          key: "insert",
          label: "Add a station here",
          icon: <PikaPlusCircleIcon size={17} />,
          onSelect: () => {
            if (key) st().insertStation(key, snapAt(radial.at));
          },
        },
        {
          key: "flip",
          label: "Reshape route",
          icon: <PikaEaseInOutIcon size={17} />,
          onSelect: () => {
            const pair = key && model.pairs.get(key);
            if (pair) st().cycleRoute(pair.key, pair.mode);
          },
        },
      ];
      node = (
        <Radial
          key={`g-${seg.id}`}
          center={toScreen(radial.at, view)}
          items={items}
          title={`${line.name} · ${name(seg.a)} — ${name(seg.b)}`}
          accent={line.color}
          keepOpen={["flip"]}
          compact
        />
      );
    }
  }

  return <AnimatePresence>{node}</AnimatePresence>;
}

function toScreen(p: Vec, view: { x: number; y: number; k: number }) {
  return { x: p.x * view.k + view.x, y: p.y * view.k + view.y };
}

function snapAt(p: Vec) {
  const { style } = useMap.getState();
  if (!style.snap) return p;
  const g = style.gridSize;
  return { x: Math.round(p.x / g) * g, y: Math.round(p.y / g) * g };
}

function Radial({
  center,
  items,
  title,
  accent,
  keepOpen = [],
  compact,
}: {
  center: Vec;
  items: RadialItem[];
  title: string;
  accent?: string;
  keepOpen?: string[];
  compact?: boolean;
}) {
  const reduce = useReducedMotion();
  const [hover, setHover] = useState<string | null>(null);
  const n = items.length;
  const radius = Math.max(compact ? 56 : 74, (n * (ITEM + 8)) / (2 * Math.PI));
  const step = 360 / n;
  const band = ITEM + 18;
  const outer = radius + band / 2;
  const inner = radius - band / 2;
  const hovered = items.find((i) => i.key === hover);
  const text = hovered?.label ?? title;

  return (
    <motion.div
      className="pointer-events-none absolute z-20"
      style={{ left: center.x, top: center.y }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* Frosted donut — the hole leaves the station itself visible */}
      <motion.div
        aria-hidden
        className="absolute rounded-full bg-grayscale-1/75 shadow-[inset_0_0_0_1px_var(--color-grayscale-4)] backdrop-blur-md"
        style={{
          width: outer * 2,
          height: outer * 2,
          left: -outer,
          top: -outer,
          maskImage: `radial-gradient(circle, transparent ${inner - 0.5}px, #000 ${inner + 0.5}px)`,
          WebkitMaskImage: `radial-gradient(circle, transparent ${inner - 0.5}px, #000 ${inner + 0.5}px)`,
        }}
        initial={{ opacity: 0, transform: reduce ? "scale(1)" : "scale(0.88)" }}
        animate={{ opacity: 1, transform: "scale(1)" }}
        exit={{
          opacity: 0,
          transform: reduce ? "scale(1)" : "scale(0.94)",
          transition: { duration: 0.12 },
        }}
        transition={{ duration: 0.22, ease: EASE_OUT }}
      />

      {items.map((it, i) => {
        // Actions sit at the bottom of the ring, colours wrap round the top.
        const a = ((90 + i * step) * Math.PI) / 180;
        const x = Math.cos(a) * radius;
        const y = Math.sin(a) * radius;
        const from = reduce ? 1 : 0.5;
        return (
          <motion.button
            key={it.key}
            type="button"
            aria-label={it.label}
            className="pointer-events-auto cursor-pointer absolute top-0 left-0 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            style={{
              width: ITEM,
              height: ITEM,
              marginLeft: -ITEM / 2,
              marginTop: -ITEM / 2,
            }}
            initial={{
              opacity: 0,
              transform: `translate(${x * from}px, ${y * from}px) scale(${reduce ? 1 : 0.8})`,
            }}
            animate={{
              opacity: 1,
              transform: `translate(${x}px, ${y}px) scale(1)`,
              transition: {
                duration: 0.24,
                ease: EASE_OUT,
                delay: reduce ? 0 : i * 0.014,
              },
            }}
            exit={{
              opacity: 0,
              transform: `translate(${x * (reduce ? 1 : 0.86)}px, ${y * (reduce ? 1 : 0.86)}px) scale(${reduce ? 1 : 0.9})`,
              transition: { duration: 0.12, ease: EASE_OUT },
            }}
            onPointerEnter={() => setHover(it.key)}
            onPointerLeave={() => setHover((h) => (h === it.key ? null : h))}
            onFocus={() => setHover(it.key)}
            onBlur={() => setHover((h) => (h === it.key ? null : h))}
            onClick={() => {
              it.onSelect();
              if (!keepOpen.includes(it.key)) {
                const st = useMap.getState();
                if (st.radial) st.closeRadial();
              }
            }}
          >
            <RadialFace item={it} accent={accent} />
          </motion.button>
        );
      })}

      <div
        className="absolute left-0 flex -translate-x-1/2 justify-center"
        style={{ top: outer + 10 }}
      >
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div
            key={text}
            className="flex items-center gap-2 whitespace-nowrap rounded-full bg-grayscale-12/95 py-1 pr-1.5 pl-3 text-[12px] font-medium text-grayscale-1 shadow-lg shadow-black/10"
            initial={{ opacity: 0, filter: "blur(3px)" }}
            animate={{ opacity: 1, filter: "blur(0px)" }}
            exit={{ opacity: 0, filter: "blur(3px)" }}
            transition={{ duration: 0.14, ease: "easeOut" }}
          >
            {text}
            {hovered?.hint ? (
              <kbd className="rounded-[5px] bg-grayscale-1/15 px-1.5 py-px text-[10.5px] text-grayscale-1/80">
                {hovered.hint}
              </kbd>
            ) : (
              <span className="w-1.5" />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

function RadialFace({ item, accent }: { item: RadialItem; accent?: string }) {
  const base =
    "flex size-full items-center justify-center rounded-full transition-transform duration-150 ease-(--um-ease-out) active:scale-[0.92] [@media(hover:hover)]:hover:scale-[1.08]";
  if (item.color) {
    const light = isLight(item.color);
    return (
      <span
        className={cn(
          base,
          "shadow-[0_1px_2px_rgb(0_0_0/0.2),inset_0_0_0_2px_rgb(255_255_255/0.9)]",
        )}
        style={{ backgroundColor: item.color }}
      >
        {item.checked && (
          <PikaCheckIcon
            size={16}
            strokeWidth={3}
            className={light ? "text-black/80" : "text-white"}
          />
        )}
      </span>
    );
  }
  return (
    <span
      className={cn(
        base,
        "bg-grayscale-1 text-grayscale-11 shadow-[0_1px_2px_rgb(0_0_0/0.12),0_0_0_1px_var(--color-grayscale-4)]",
        item.danger &&
          "[@media(hover:hover)]:hover:bg-red-50 [@media(hover:hover)]:hover:text-red-600",
      )}
      style={accent && item.key === "flip" ? { color: accent } : undefined}
    >
      {item.icon}
    </span>
  );
}
