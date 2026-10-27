import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  addSegment,
  insertIntoPair,
  makeStation,
  mergeStations,
  removeStation,
  stationAt,
  uid,
} from "../_lib/doc";
import { easeCamera } from "../_lib/ease";
import { exampleDoc } from "../_lib/example";
import { clamp, LABEL_DIRS } from "../_lib/geometry";
import { panelCover } from "../_lib/layout";
import { londonDoc } from "../_lib/london";
import { nextPaletteEntry } from "../_lib/palette";
import { getBounds } from "../_lib/render";
import type {
  ConnectState,
  DropTarget,
  LabelDir,
  Line,
  MapDoc,
  MapStyle,
  RadialTarget,
  RouteMode,
  Tool,
  Vec,
  View,
} from "../_lib/types";

export const DEFAULT_STYLE: MapStyle = {
  gridSize: 40,
  showGrid: true,
  snap: true,
  theme: "paper",
};

/** Drops settings from older saves (line weight, label size…) that are now fixed. */
function pickStyle(
  p: Partial<MapStyle> | undefined,
  base = DEFAULT_STYLE,
): MapStyle {
  const s = { ...base, ...p };
  return {
    gridSize: s.gridSize,
    showGrid: s.showGrid,
    snap: s.snap,
    theme: s.theme,
  };
}

// Low enough to fit the whole London map on screen.
export const MIN_ZOOM = 0.15;
export const MAX_ZOOM = 4;

function emptyDoc(): MapDoc {
  const first = nextPaletteEntry([]);
  return {
    title: "Untitled Underground",
    stations: [],
    lines: [{ id: uid(), name: first.name, color: first.color }],
    segments: [],
    routes: {},
  };
}

interface MapState {
  doc: MapDoc;
  style: MapStyle;
  tool: Tool;
  /** keyboard-driven changes skip their transition */
  toolVia: "pointer" | "keyboard";
  activeLine: string | null;
  radial: RadialTarget | null;
  connect: ConnectState | null;
  renaming: string | null;
  view: View;
  size: { w: number; h: number };
  past: MapDoc[];
  future: MapDoc[];
  /** true briefly after loading the example — drives the draw-in intro */
  intro: boolean;

  apply: (recipe: (d: MapDoc) => MapDoc, history?: boolean) => void;
  checkpoint: () => void;
  undo: () => void;
  redo: () => void;

  addStation: (p: Vec) => string;
  moveStation: (id: string, p: Vec) => void;
  deleteStation: (id: string) => void;
  connectTo: (
    from: string,
    target: DropTarget,
    line: string,
    history?: boolean,
  ) => string | null;
  /** Steps of a longer gesture that has already checkpointed, so they add no history of their own. */
  link: (from: string, to: string, line: string) => string | null;
  unlink: (segment: string) => void;
  merge: (from: string, into: string) => void;
  insertStation: (key: string, p: Vec) => string;
  deleteSegment: (id: string) => void;
  /** Step the pair's shape on from the one currently drawn (auto-picked unless overridden). */
  cycleRoute: (key: string, current: RouteMode) => void;
  renameStation: (id: string, name: string) => void;
  setLabel: (id: string, dir: LabelDir | null, history?: boolean) => void;
  cycleLabel: (id: string, current: LabelDir) => void;
  setTitle: (title: string) => void;

  addLine: () => string;
  updateLine: (id: string, patch: Partial<Omit<Line, "id">>) => void;
  deleteLine: (id: string) => void;
  setActiveLine: (id: string) => void;
  ensureLine: () => string;

  setStyle: (patch: Partial<MapStyle>) => void;
  setTool: (tool: Tool, via?: "pointer" | "keyboard") => void;
  openRadial: (t: RadialTarget) => void;
  closeRadial: () => void;
  startConnect: (from: string, line: string, via: ConnectState["via"]) => void;
  stopConnect: () => void;
  startRename: (id: string) => void;
  stopRename: () => void;

  setSize: (w: number, h: number) => void;
  setView: (v: View) => void;
  zoomAt: (factor: number, sx: number, sy: number) => void;
  fit: (animate?: boolean) => void;

  loadDoc: (
    doc: MapDoc,
    opts?: { intro?: boolean; style?: Partial<MapStyle> },
  ) => void;
  loadExample: () => void;
  loadLondon: () => void;
  clear: () => void;
}

let viewAnim = 0;
let introTimer: ReturnType<typeof setTimeout> | undefined;

export const useMap = create<MapState>()(
  persist(
    (set, get) => ({
      doc: emptyDoc(),
      style: DEFAULT_STYLE,
      tool: "draw",
      toolVia: "pointer",
      activeLine: null,
      radial: null,
      connect: null,
      renaming: null,
      view: { x: 0, y: 0, k: 1 },
      size: { w: 0, h: 0 },
      past: [],
      future: [],
      intro: false,

      apply: (recipe, history = true) => {
        const { doc, past } = get();
        const next = recipe(doc);
        if (next === doc) return;
        set(
          history
            ? { doc: next, past: [...past.slice(-99), doc], future: [] }
            : { doc: next },
        );
      },
      checkpoint: () => {
        const { doc, past } = get();
        set({ past: [...past.slice(-99), doc], future: [] });
      },
      undo: () => {
        const { past, doc, future } = get();
        if (!past.length) return;
        set({
          doc: past[past.length - 1],
          past: past.slice(0, -1),
          future: [doc, ...future],
          radial: null,
          connect: null,
          renaming: null,
        });
      },
      redo: () => {
        const { past, doc, future } = get();
        if (!future.length) return;
        set({
          doc: future[0],
          past: [...past, doc],
          future: future.slice(1),
          radial: null,
          connect: null,
          renaming: null,
        });
      },

      addStation: (p) => {
        const existing = stationAt(get().doc, p);
        if (existing) return existing.id;
        const st = makeStation(get().doc, p);
        get().apply((d) => ({ ...d, stations: [...d.stations, st] }));
        return st.id;
      },
      moveStation: (id, p) =>
        get().apply(
          (d) => ({
            ...d,
            stations: d.stations.map((s) =>
              s.id === id ? { ...s, x: p.x, y: p.y } : s,
            ),
          }),
          false,
        ),
      deleteStation: (id) => {
        const { radial, connect, renaming } = get();
        get().apply((d) => removeStation(d, id));
        set({
          radial:
            radial?.kind === "station" && radial.id === id ? null : radial,
          connect: connect?.from === id ? null : connect,
          renaming: renaming === id ? null : renaming,
        });
      },
      connectTo: (from, target, line, history = true) => {
        let result: string | null = null;
        get().apply((d) => {
          let doc = d;
          let to: string;
          if (target.kind === "station") {
            to = target.id;
          } else {
            const existing = stationAt(doc, target.p);
            if (existing) to = existing.id;
            else {
              const st = makeStation(doc, target.p);
              doc =
                target.kind === "segment"
                  ? insertIntoPair(doc, target.key, st)
                  : { ...doc, stations: [...doc.stations, st] };
              to = st.id;
            }
          }
          result = to;
          return to === from ? doc : addSegment(doc, from, to, line);
        }, history);
        return result;
      },
      link: (from, to, line) => {
        const before = get().doc;
        get().apply((d) => addSegment(d, from, to, line), false);
        const after = get().doc;
        // The new hop's id, or null when the line already ran between them.
        return after === before
          ? null
          : after.segments[after.segments.length - 1].id;
      },
      merge: (from, into) => {
        get().apply((d) => mergeStations(d, from, into), false);
        const { radial } = get();
        if (radial?.kind === "station" && radial.id === from)
          set({ radial: null });
      },
      unlink: (segment) =>
        get().apply(
          (d) => ({
            ...d,
            segments: d.segments.filter((s) => s.id !== segment),
          }),
          false,
        ),
      insertStation: (key, p) => {
        const existing = stationAt(get().doc, p);
        if (existing) return existing.id;
        const st = makeStation(get().doc, p);
        get().apply((d) => insertIntoPair(d, key, st));
        return st.id;
      },
      deleteSegment: (id) => {
        get().apply((d) => ({
          ...d,
          segments: d.segments.filter((s) => s.id !== id),
        }));
        const { radial } = get();
        if (radial?.kind === "segment" && radial.id === id)
          set({ radial: null });
      },
      cycleRoute: (key, current) =>
        get().apply((d) => ({
          ...d,
          routes: { ...d.routes, [key]: ((current + 1) % 3) as RouteMode },
        })),
      renameStation: (id, name) =>
        get().apply((d) => {
          const s = d.stations.find((x) => x.id === id);
          if (!s || s.name === name || !name.trim()) return d;
          return {
            ...d,
            stations: d.stations.map((x) =>
              x.id === id ? { ...x, name: name.trim() } : x,
            ),
          };
        }),
      setLabel: (id, dir, history = true) =>
        get().apply(
          (d) => ({
            ...d,
            stations: d.stations.map((s) =>
              s.id === id ? { ...s, label: dir } : s,
            ),
          }),
          history,
        ),
      cycleLabel: (id, current) => {
        const next =
          LABEL_DIRS[(LABEL_DIRS.indexOf(current) + 1) % LABEL_DIRS.length];
        get().setLabel(id, next);
      },
      setTitle: (title) =>
        get().apply((d) => (d.title === title ? d : { ...d, title }), false),

      addLine: () => {
        const entry = nextPaletteEntry(get().doc.lines.map((l) => l.color));
        const line = { id: uid(), name: entry.name, color: entry.color };
        get().apply((d) => ({ ...d, lines: [...d.lines, line] }));
        set({ activeLine: line.id });
        return line.id;
      },
      updateLine: (id, patch) =>
        get().apply((d) => ({
          ...d,
          lines: d.lines.map((l) => (l.id === id ? { ...l, ...patch } : l)),
        })),
      deleteLine: (id) => {
        get().apply((d) => ({
          ...d,
          lines: d.lines.filter((l) => l.id !== id),
          segments: d.segments.filter((s) => s.line !== id),
        }));
        const { activeLine, connect, doc } = get();
        set({
          activeLine:
            activeLine === id ? (doc.lines[0]?.id ?? null) : activeLine,
          connect: connect?.line === id ? null : connect,
        });
      },
      setActiveLine: (id) => {
        const { connect } = get();
        set({
          activeLine: id,
          connect: connect ? { ...connect, line: id } : null,
        });
      },
      ensureLine: () => {
        const { doc, activeLine } = get();
        if (activeLine && doc.lines.some((l) => l.id === activeLine))
          return activeLine;
        if (doc.lines[0]) {
          set({ activeLine: doc.lines[0].id });
          return doc.lines[0].id;
        }
        return get().addLine();
      },

      setStyle: (patch) => set({ style: { ...get().style, ...patch } }),
      setTool: (tool, via = "pointer") =>
        set({ tool, toolVia: via, connect: null, radial: null }),
      openRadial: (t) => set({ radial: t, connect: null }),
      closeRadial: () => set({ radial: null }),
      startConnect: (from, line, via) =>
        set({ connect: { from, line, via }, radial: null }),
      stopConnect: () => set({ connect: null }),
      startRename: (id) => set({ renaming: id, radial: null, connect: null }),
      stopRename: () => set({ renaming: null }),

      setSize: (w, h) => set({ size: { w, h } }),
      setView: (v) => {
        cancelAnimationFrame(viewAnim);
        set({ view: v });
      },
      zoomAt: (factor, sx, sy) => {
        const { view } = get();
        const k = clamp(view.k * factor, MIN_ZOOM, MAX_ZOOM);
        const r = k / view.k;
        get().setView({
          k,
          x: sx - (sx - view.x) * r,
          y: sy - (sy - view.y) * r,
        });
      },
      fit: (animate = true) => {
        const { doc, size, view } = get();
        if (!size.w || !size.h) return;
        // Frame the map in the part of the canvas the sidebar doesn't cover.
        const w = size.w - panelCover(size.w);
        const b = getBounds(doc.stations);
        let target: View;
        if (!b) target = { x: w / 2, y: size.h / 2, k: 1 };
        else {
          const pad = 120;
          const k = clamp(
            Math.min(
              (w - pad * 2) / Math.max(1, b.maxX - b.minX),
              (size.h - pad * 2) / Math.max(1, b.maxY - b.minY),
            ),
            MIN_ZOOM,
            1.5,
          );
          const cx = (b.minX + b.maxX) / 2;
          const cy = (b.minY + b.maxY) / 2;
          target = { k, x: w / 2 - cx * k, y: size.h / 2 - cy * k };
        }
        cancelAnimationFrame(viewAnim);
        if (
          !animate ||
          window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ) {
          set({ view: target });
          return;
        }
        // Tween the world-space centre linearly and zoom geometrically, so the
        // camera glides instead of swinging out and back.
        const c0 = {
          x: (w / 2 - view.x) / view.k,
          y: (size.h / 2 - view.y) / view.k,
        };
        const c1 = {
          x: (w / 2 - target.x) / target.k,
          y: (size.h / 2 - target.y) / target.k,
        };
        const start = performance.now();
        const duration = 480;
        const step = (now: number) => {
          const t = easeCamera(Math.min(1, (now - start) / duration));
          const k = view.k * (target.k / view.k) ** t;
          const cx = c0.x + (c1.x - c0.x) * t;
          const cy = c0.y + (c1.y - c0.y) * t;
          set({ view: { k, x: w / 2 - cx * k, y: size.h / 2 - cy * k } });
          if (t < 1) viewAnim = requestAnimationFrame(step);
        };
        viewAnim = requestAnimationFrame(step);
      },

      loadDoc: (doc, opts) => {
        get().checkpoint();
        set({
          doc,
          style: pickStyle(opts?.style, get().style),
          activeLine: doc.lines[0]?.id ?? null,
          radial: null,
          connect: null,
          renaming: null,
          intro: !!opts?.intro,
        });
        clearTimeout(introTimer);
        if (opts?.intro)
          introTimer = setTimeout(() => set({ intro: false }), 2400);
        requestAnimationFrame(() => get().fit(!opts?.intro));
      },
      loadExample: () =>
        get().loadDoc(exampleDoc(get().style.gridSize), { intro: true }),
      loadLondon: () =>
        get().loadDoc(londonDoc(get().style.gridSize), { intro: true }),
      clear: () => {
        get().checkpoint();
        const doc = emptyDoc();
        set({
          doc,
          activeLine: doc.lines[0].id,
          radial: null,
          connect: null,
          renaming: null,
        });
      },
    }),
    {
      name: "underground-map",
      version: 1,
      partialize: (s) => ({
        doc: s.doc,
        style: s.style,
        activeLine: s.activeLine,
      }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<MapState>;
        return { ...current, ...p, style: pickStyle(p.style) };
      },
    },
  ),
);

export function activeLineOf(s: Pick<MapState, "doc" | "activeLine">) {
  return (
    s.doc.lines.find((l) => l.id === s.activeLine) ?? s.doc.lines[0] ?? null
  );
}
