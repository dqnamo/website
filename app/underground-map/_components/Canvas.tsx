import {
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { cn } from "@/helpers/classname-helper";
import {
  dist,
  nearestOnPolyline,
  norm,
  octantOf,
  octilinearRoute,
  roundedPath,
  snapTo,
  sub,
} from "../_lib/geometry";
import { buildRender, THEMES, TUBE } from "../_lib/render";
import type { DropTarget, MapDoc, Station, Vec } from "../_lib/types";
import { useMap } from "../_store/useMap";
import { EmptyState } from "./EmptyState";
import { MapGraphics, MapLabels } from "./MapLayer";
import { RadialMenu } from "./RadialMenu";
import { RenameOverlay } from "./RenameOverlay";
import { Toolbar } from "./Toolbar";

interface Gesture {
  kind: "pan" | "empty" | "station" | "move" | "connect" | "seg" | "label";
  sx: number;
  sy: number;
  vx: number;
  vy: number;
  moved: boolean;
  id?: string;
  key?: string;
  grab?: Vec;
  mode?: "move" | "connect";
  dismiss?: boolean;
  checkpointed?: boolean;
  /** Drawing: the stations this drag has joined so far, and the hop it made to reach each (null if it was there already). */
  chain?: { id: string; seg: string | null }[];
}

interface Guide {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

const DRAG_THRESHOLD = 4;
const MAGNET_PX = 22;

const isTyping = (e: Event) =>
  !!(e.target as HTMLElement | null)?.closest?.(
    "input, textarea, [contenteditable='true']",
  );

function findNearest(doc: MapDoc, p: Vec, radius: number, exclude?: string) {
  let best: Station | null = null;
  let bd = radius;
  for (const s of doc.stations) {
    if (s.id === exclude) continue;
    const d = dist(s, p);
    if (d < bd) {
      bd = d;
      best = s;
    }
  }
  return best;
}

function neighboursOf(doc: MapDoc, id: string) {
  const ids = new Set<string>();
  for (const s of doc.segments) {
    if (s.a === id) ids.add(s.b);
    else if (s.b === id) ids.add(s.a);
  }
  return doc.stations.filter((s) => ids.has(s.id));
}

/** Dashed guides through any neighbour this station now lines up with octilinearly. */
function guidesFor(p: Vec, neighbours: Station[]): Guide[] {
  return neighbours.flatMap((n) => {
    const dx = p.x - n.x;
    const dy = p.y - n.y;
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return [];
    const aligned =
      Math.abs(dx) < 0.5 ||
      Math.abs(dy) < 0.5 ||
      Math.abs(Math.abs(dx) - Math.abs(dy)) < 0.5;
    if (!aligned) return [];
    const u = norm({ x: dx, y: dy });
    const ext = 4000;
    return [
      {
        x1: n.x - u.x * ext,
        y1: n.y - u.y * ext,
        x2: p.x + u.x * ext,
        y2: p.y + u.y * ext,
      },
    ];
  });
}

export function Canvas() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const doc = useMap((s) => s.doc);
  const style = useMap((s) => s.style);
  const view = useMap((s) => s.view);
  const tool = useMap((s) => s.tool);
  const connect = useMap((s) => s.connect);
  const radial = useMap((s) => s.radial);
  const renaming = useMap((s) => s.renaming);
  const intro = useMap((s) => s.intro);
  const activeLineId = useMap((s) => s.activeLine);

  const model = useMemo(() => buildRender(doc), [doc]);
  const modelRef = useRef(model);
  useLayoutEffect(() => {
    modelRef.current = model;
  }, [model]);
  const theme = THEMES[style.theme];

  const [pointer, setPointer] = useState<Vec | null>(null);
  const [hoverEmpty, setHoverEmpty] = useState(false);
  const [guides, setGuides] = useState<Guide[]>([]);
  const [cursor, setCursor] = useState<"grab" | "grabbing" | null>(null);
  /** Moving: the station the dragged one would merge into if let go now. */
  const [mergeInto, setMergeInto] = useState<string | null>(null);
  const gesture = useRef<Gesture | null>(null);
  const space = useRef(false);

  useEffect(() => {
    const el = wrapRef.current!;
    let first = true;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      const st = useMap.getState();
      const prev = st.size;
      st.setSize(width, height);
      if (first) {
        first = false;
        st.fit(false);
      } else if (prev.w) {
        st.setView({
          ...st.view,
          x: st.view.x + (width - prev.w) / 2,
          y: st.view.y + (height - prev.h) / 2,
        });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const svg = svgRef.current!;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const st = useMap.getState();
      const r = svg.getBoundingClientRect();
      const sx = e.clientX - r.left;
      const sy = e.clientY - r.top;
      const notchy =
        e.deltaMode !== 0 ||
        (e.deltaX === 0 &&
          Math.abs(e.deltaY) >= 40 &&
          Number.isInteger(e.deltaY));
      if (e.ctrlKey || e.metaKey || notchy) {
        const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
        st.zoomAt(Math.exp(-dy * (notchy ? 0.0022 : 0.01)), sx, sy);
      } else {
        st.setView({
          ...st.view,
          x: st.view.x - e.deltaX,
          y: st.view.y - e.deltaY,
        });
      }
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, []);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code !== "Space" || isTyping(e)) return;
      e.preventDefault();
      if (space.current) return;
      space.current = true;
      if (!gesture.current) setCursor("grab");
    };
    const up = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      space.current = false;
      if (gesture.current?.kind !== "pan") setCursor(null);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  const toWorld = (cx: number, cy: number): Vec => {
    const r = svgRef.current!.getBoundingClientRect();
    const v = useMap.getState().view;
    return { x: (cx - r.left - v.x) / v.k, y: (cy - r.top - v.y) / v.k };
  };
  const snapP = (p: Vec) => {
    const { style } = useMap.getState();
    return style.snap
      ? snapTo(p, style.gridSize)
      : { x: Math.round(p.x), y: Math.round(p.y) };
  };
  const pointOnPair = (key: string, p: Vec) => {
    const pair = modelRef.current.pairs.get(key);
    return snapP(pair ? nearestOnPolyline(pair.pts, p).point : p);
  };

  /** A snapped point that lands on an existing track should join it, not float on top of it. */
  const pairUnder = (p: Vec, exclude?: string) => {
    for (const pair of modelRef.current.pairs.values()) {
      if (exclude && (pair.a === exclude || pair.b === exclude)) continue;
      // A bundle can sit to one side of its route, so allow for it reaching a full width either way.
      const tol =
        TUBE.lineWidth / 2 +
        (pair.lines.length - 1) * (TUBE.lineWidth + TUBE.lineGap) +
        1;
      const ends = [pair.pts[0], pair.pts[pair.pts.length - 1]];
      if (ends.some((e) => dist(e, p) < 1)) continue;
      if (nearestOnPolyline(pair.pts, p).d <= tol) return pair.key;
    }
    return null;
  };

  const placeAt = (world: Vec): Extract<DropTarget, { p: Vec }> => {
    const p = snapP(world);
    const key = pairUnder(p);
    return key ? { kind: "segment", key, p } : { kind: "point", p };
  };

  const resolveDrop = (
    world: Vec,
    cx: number,
    cy: number,
    from: string,
  ): DropTarget | null => {
    const st = useMap.getState();
    const near = findNearest(st.doc, world, MAGNET_PX / st.view.k);
    if (near) return near.id === from ? null : { kind: "station", id: near.id };
    const segEl = document.elementFromPoint(cx, cy)?.closest("[data-pair]");
    const key = segEl?.getAttribute("data-pair");
    if (key && !key.split("|").includes(from))
      return { kind: "segment", key, p: pointOnPair(key, world) };
    const p = snapP(world);
    const src = st.doc.stations.find((s) => s.id === from);
    if (src && dist(src, p) < 1) return null;
    const under = pairUnder(p, from);
    return under ? { kind: "segment", key: under, p } : { kind: "point", p };
  };

  const moveStationTo = (g: Gesture, world: Vec) => {
    const st = useMap.getState();
    let p = sub(world, g.grab!);
    const ns = neighboursOf(st.doc, g.id!);
    if (st.style.snap) p = snapTo(p, st.style.gridSize);
    else {
      // Off-grid: gently magnetise onto straight and 45° runs from neighbours.
      const tol = 8 / st.view.k;
      for (const n of ns) {
        if (Math.abs(p.x - n.x) < tol) p = { ...p, x: n.x };
        if (Math.abs(p.y - n.y) < tol) p = { ...p, y: n.y };
      }
      for (const n of ns) {
        const dx = p.x - n.x;
        const dy = p.y - n.y;
        if (
          Math.abs(dx) > tol &&
          Math.abs(Math.abs(dx) - Math.abs(dy)) < tol * 1.4
        ) {
          const m = (Math.abs(dx) + Math.abs(dy)) / 2;
          p = { x: n.x + Math.sign(dx) * m, y: n.y + Math.sign(dy) * m };
          break;
        }
      }
    }
    // Dropped on another station, the two become one; off-grid, a near miss is pulled on top of it.
    const onto =
      findNearest(st.doc, p, 0.5, g.id) ??
      (st.style.snap
        ? null
        : findNearest(
            st.doc,
            p,
            Math.min(MAGNET_PX / st.view.k, st.style.gridSize / 2),
            g.id,
          ));
    if (onto) p = { x: onto.x, y: onto.y };
    setMergeInto(onto?.id ?? null);
    const cur = st.doc.stations.find((s) => s.id === g.id);
    if (cur && (cur.x !== p.x || cur.y !== p.y)) {
      if (!g.checkpointed) {
        st.checkpoint();
        g.checkpointed = true;
      }
      st.moveStation(g.id!, p);
    }
    setGuides(guidesFor(p, ns));
  };

  /**
   * Drawing: passing over a station joins the line to it and carries on from there, and backing up
   * over the station before undoes that last hop. The whole drag is one step of history.
   */
  const snapThrough = (g: Gesture, world: Vec) => {
    const st = useMap.getState();
    const line = st.connect?.line;
    const chain = g.chain;
    if (!line || !chain) return;
    const tail = chain[chain.length - 1];
    const near = findNearest(st.doc, world, MAGNET_PX / st.view.k, tail.id);
    if (!near) return;
    if (!g.checkpointed) {
      st.checkpoint();
      g.checkpointed = true;
    }
    const prev = chain[chain.length - 2];
    if (prev && near.id === prev.id) {
      chain.pop();
      if (tail.seg) st.unlink(tail.seg);
      st.startConnect(prev.id, line, "drag");
    } else {
      chain.push({ id: near.id, seg: st.link(tail.id, near.id, line) });
      st.startConnect(near.id, line, "drag");
    }
  };

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0 && e.button !== 1) return;
    const st = useMap.getState();
    svgRef.current!.setPointerCapture(e.pointerId);
    setHoverEmpty(false);
    const world = toWorld(e.clientX, e.clientY);
    const base = {
      sx: e.clientX,
      sy: e.clientY,
      vx: st.view.x,
      vy: st.view.y,
      moved: false,
    };

    if (e.button === 1 || space.current) {
      gesture.current = { kind: "pan", ...base };
      setCursor("grabbing");
      return;
    }

    const t = e.target as Element;
    const stationId = t.closest("[data-station]")?.getAttribute("data-station");
    const labelId = t.closest("[data-label]")?.getAttribute("data-label");
    const segEl = t.closest("[data-seg]");

    const sid = stationId ?? (st.tool === "erase" ? labelId : null);
    if (sid) {
      const s = st.doc.stations.find((x) => x.id === sid)!;
      gesture.current = {
        kind: "station",
        ...base,
        id: sid,
        grab: sub(world, s),
        mode: st.tool === "move" || e.altKey ? "move" : "connect",
      };
      return;
    }
    if (labelId) {
      gesture.current = { kind: "label", ...base, id: labelId };
      return;
    }
    if (segEl) {
      gesture.current = {
        kind: "seg",
        ...base,
        id: segEl.getAttribute("data-seg")!,
        key: segEl.getAttribute("data-pair")!,
      };
      return;
    }
    // A press that only dismisses an open menu shouldn't also drop a station.
    gesture.current = { kind: "empty", ...base, dismiss: !!st.radial };
    if (st.radial) st.closeRadial();
  };

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const world = toWorld(e.clientX, e.clientY);
    setPointer(world);
    const g = gesture.current;
    if (!g) {
      setHoverEmpty(
        !(e.target as Element).closest(
          "[data-station], [data-seg], [data-label]",
        ),
      );
      return;
    }
    const dx = e.clientX - g.sx;
    const dy = e.clientY - g.sy;
    if (!g.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    const firstMove = !g.moved;
    g.moved = true;
    const st = useMap.getState();

    switch (g.kind) {
      case "pan":
      case "empty":
      case "seg":
        if (firstMove) setCursor("grabbing");
        st.setView({ ...st.view, x: g.vx + dx, y: g.vy + dy });
        break;
      case "station":
        if (st.tool === "erase") {
          g.kind = "pan";
          break;
        }
        if (g.mode === "move") {
          g.kind = "move";
          st.closeRadial();
          setCursor("grabbing");
          moveStationTo(g, world);
        } else {
          g.kind = "connect";
          g.chain = [{ id: g.id!, seg: null }];
          st.startConnect(g.id!, st.connect?.line ?? st.ensureLine(), "drag");
          snapThrough(g, world);
        }
        break;
      case "connect":
        snapThrough(g, world);
        break;
      case "move":
        moveStationTo(g, world);
        break;
      case "label": {
        const s = st.doc.stations.find((x) => x.id === g.id);
        const rs = modelRef.current.stationMap.get(g.id!);
        if (!s || !rs) break;
        const dir = octantOf(sub(world, s));
        if (dir !== rs.label.dir || s.label === null) {
          if (!g.checkpointed) {
            st.checkpoint();
            g.checkpointed = true;
          }
          st.setLabel(s.id, dir, false);
        }
        break;
      }
    }
  };

  const onPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    const g = gesture.current;
    gesture.current = null;
    setCursor(space.current ? "grab" : null);
    setGuides([]);
    setMergeInto(null);
    if (!g) return;
    const st = useMap.getState();
    const world = toWorld(e.clientX, e.clientY);
    const chain = st.connect?.via === "click" ? st.connect : null;

    switch (g.kind) {
      case "move":
        // Part of the same step of history as the move itself.
        if (mergeInto && g.id) st.merge(g.id, mergeInto);
        break;
      case "connect": {
        // Let go on open map or a line and the last stretch ends at a new station there.
        const line = st.connect?.line;
        const tail = g.chain?.[g.chain.length - 1]?.id ?? g.id!;
        const target = resolveDrop(world, e.clientX, e.clientY, tail);
        if (line && target) st.connectTo(tail, target, line, !g.checkpointed);
        st.stopConnect();
        break;
      }
      case "station":
      case "label":
        if (g.moved) break;
        if (st.tool === "erase") st.deleteStation(g.id!);
        else if (chain) {
          if (g.id === chain.from) st.stopConnect();
          else {
            const to = st.connectTo(
              chain.from,
              { kind: "station", id: g.id! },
              chain.line,
            );
            if (to) st.startConnect(to, chain.line, "click");
          }
        } else if (st.radial?.kind === "station" && st.radial.id === g.id)
          st.closeRadial();
        else st.openRadial({ kind: "station", id: g.id! });
        break;
      case "seg":
        if (g.moved) break;
        if (st.tool === "erase") st.deleteSegment(g.id!);
        else if (chain) {
          const to = st.connectTo(
            chain.from,
            { kind: "segment", key: g.key!, p: pointOnPair(g.key!, world) },
            chain.line,
          );
          if (to) st.startConnect(to, chain.line, "click");
        } else if (st.tool === "draw")
          st.insertStation(g.key!, pointOnPair(g.key!, world));
        else st.openRadial({ kind: "segment", id: g.id!, at: world });
        break;
      case "empty":
        if (g.moved || g.dismiss) break;
        if (chain) {
          const to = st.connectTo(chain.from, placeAt(world), chain.line);
          if (to) st.startConnect(to, chain.line, "click");
        } else if (st.tool === "draw") {
          const target = placeAt(world);
          const existing = findNearest(st.doc, target.p, 0.5);
          if (existing) st.openRadial({ kind: "station", id: existing.id });
          else if (target.kind === "segment")
            st.insertStation(target.key, target.p);
          else st.addStation(target.p);
        }
        break;
    }
  };

  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    const st = useMap.getState();
    if (st.connect) {
      st.stopConnect();
      return;
    }
    const t = e.target as Element;
    const id =
      t.closest("[data-station]")?.getAttribute("data-station") ??
      t.closest("[data-label]")?.getAttribute("data-label");
    if (id) st.openRadial({ kind: "station", id });
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    const st = useMap.getState();
    if (st.tool === "erase") return;
    // Pointer capture retargets the dblclick to the <svg>, so hit-test what's actually under the cursor.
    const t = document.elementFromPoint(e.clientX, e.clientY);
    if (!t) return;
    const id =
      t.closest("[data-label]")?.getAttribute("data-label") ??
      t.closest("[data-station]")?.getAttribute("data-station");
    if (id) st.startRename(id);
  };

  // ── overlays ──────────────────────────────────────────────
  const lw = TUBE.lineWidth;
  const k = view.k;
  const dotR = Math.max(lw * 0.5 + 1, TUBE.stationSize * 0.62);
  const ringW = Math.max(1.75, lw * 0.36);
  const activeColor =
    doc.lines.find((l) => l.id === activeLineId)?.color ??
    doc.lines[0]?.color ??
    theme.ink;

  let preview: ReactNode = null;
  const from = connect
    ? doc.stations.find((s) => s.id === connect.from)
    : undefined;
  if (connect && from && pointer) {
    const color =
      doc.lines.find((l) => l.id === connect.line)?.color ?? theme.ink;
    const target = findNearest(doc, pointer, MAGNET_PX / k, connect.from);
    const end = target ?? snapP(pointer);
    const tr = target ? model.stationMap.get(target.id) : undefined;
    const fr = model.stationMap.get(from.id);
    preview = (
      <g pointerEvents="none">
        {connect.via === "drag" && (
          <circle
            key={`from-${from.id}`}
            className="pop"
            cx={from.x}
            cy={from.y}
            r={Math.max(fr?.extent ?? 0, lw * 0.6) + 7}
            fill="none"
            stroke={color}
            strokeWidth={2.5 / k}
            opacity={0.6}
          />
        )}
        <path
          d={roundedPath(octilinearRoute(from, end, 0), TUBE.cornerRadius)}
          fill="none"
          stroke={color}
          strokeWidth={lw}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={0.5}
        />
        {target ? (
          <circle
            key={target.id}
            className="pop"
            cx={target.x}
            cy={target.y}
            r={Math.max(tr?.extent ?? 0, lw * 0.6) + 7}
            fill="none"
            stroke={color}
            strokeWidth={2.5 / k}
          />
        ) : (
          dist(end, from) > 1 && (
            <circle
              cx={end.x}
              cy={end.y}
              r={dotR}
              fill={theme.fill}
              stroke={color}
              strokeWidth={ringW}
              opacity={0.9}
            />
          )
        )}
      </g>
    );
  }

  const mergeTarget = mergeInto ? model.stationMap.get(mergeInto) : undefined;
  if (mergeTarget) {
    preview = (
      <circle
        key={`merge-${mergeTarget.s.id}`}
        className="pop"
        pointerEvents="none"
        cx={mergeTarget.s.x}
        cy={mergeTarget.s.y}
        r={Math.max(mergeTarget.extent, lw * 0.6) + 7}
        fill="none"
        stroke="#3B82F6"
        strokeWidth={2.5 / k}
      />
    );
  }

  const ghost =
    tool === "draw" && !connect && !radial && hoverEmpty && pointer
      ? snapP(pointer)
      : null;
  const selected =
    radial?.kind === "station" ? model.stationMap.get(radial.id) : undefined;
  const selectedSeg =
    radial?.kind === "segment"
      ? model.segs.find((s) => s.id === radial.id)
      : undefined;
  const gridPx = style.gridSize * k;

  return (
    <div
      ref={wrapRef}
      data-theme={style.theme}
      className={cn(
        "um-map-scope absolute inset-0 overflow-hidden transition-[background-color] duration-300",
        style.theme === "night" ? "dark-theme" : "light-theme",
      )}
      style={{ backgroundColor: theme.bg }}
    >
      <svg
        ref={svgRef}
        role="application"
        aria-label="Tube map canvas"
        className="canvas absolute inset-0 size-full touch-none select-none"
        data-tool={tool}
        data-cursor={cursor ?? undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={() => {
          if (!gesture.current) {
            setPointer(null);
            setHoverEmpty(false);
          }
        }}
        onContextMenu={onContextMenu}
        onDoubleClick={onDoubleClick}
      >
        <defs>
          <pattern
            id="grid-dots"
            width={gridPx}
            height={gridPx}
            patternUnits="userSpaceOnUse"
            x={view.x - gridPx / 2}
            y={view.y - gridPx / 2}
          >
            <circle
              cx={gridPx / 2}
              cy={gridPx / 2}
              r={k > 0.6 ? 1.15 : 0.85}
              fill={theme.grid}
            />
          </pattern>
        </defs>
        {style.showGrid && gridPx >= 10 && (
          <rect width="100%" height="100%" fill="url(#grid-dots)" />
        )}

        <g transform={`translate(${view.x} ${view.y}) scale(${k})`}>
          <MapGraphics model={model} theme={theme} intro={intro} />

          <g data-ui>
            {model.segs.map((s) => (
              <path
                key={s.id}
                d={s.d}
                className="seg-hit"
                data-seg={s.id}
                data-pair={s.key}
                fill="none"
                stroke="transparent"
                strokeWidth={Math.max((lw + 8) * k, 16)}
                strokeLinecap="round"
              />
            ))}
          </g>

          <g pointerEvents="none">
            {guides.map((gd) => (
              <line
                key={`${gd.x1}:${gd.y1}:${gd.x2}:${gd.y2}`}
                {...gd}
                stroke="#0A84FF"
                strokeWidth={1.25 / k}
                strokeDasharray={`${4 / k} ${4 / k}`}
              />
            ))}
            {selectedSeg && (
              <path
                d={selectedSeg.d}
                fill="none"
                stroke="#3B82F6"
                strokeOpacity={0.28}
                strokeWidth={lw + 10}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}
            {selected && (
              <circle
                key={selected.s.id}
                className="pop"
                cx={selected.s.x}
                cy={selected.s.y}
                r={Math.max(selected.extent, lw * 0.6) + 7}
                fill="none"
                stroke="#3B82F6"
                strokeWidth={2 / k}
              />
            )}
            {preview}
            {ghost && (
              <circle
                cx={ghost.x}
                cy={ghost.y}
                r={dotR}
                fill={theme.fill}
                stroke={activeColor}
                strokeWidth={ringW}
                opacity={0.45}
              />
            )}
          </g>

          <g data-ui>
            {model.stations.map((rs) => (
              <circle
                key={rs.s.id}
                className="station-hit"
                data-station={rs.s.id}
                cx={rs.s.x}
                cy={rs.s.y}
                r={Math.max(rs.extent + 4, 12 / k)}
                fill="transparent"
                stroke="transparent"
              />
            ))}
          </g>

          <MapLabels
            model={model}
            theme={theme}
            intro={intro}
            hidden={renaming}
          />
        </g>
      </svg>

      <RadialMenu model={model} />
      <RenameOverlay model={model} />
      <EmptyState visible={doc.stations.length === 0} />
      <Toolbar />
    </div>
  );
}
