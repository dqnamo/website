import { pairKey } from "./geometry";
import { stationName } from "./names";
import type { MapDoc, Segment, Station, Vec } from "./types";

export const uid = () => Math.random().toString(36).slice(2, 10);

export function stationAt(d: MapDoc, p: Vec, tol = 0.5) {
  return d.stations.find(
    (s) => Math.abs(s.x - p.x) < tol && Math.abs(s.y - p.y) < tol,
  );
}

export function makeStation(d: MapDoc, p: Vec): Station {
  return {
    id: uid(),
    x: p.x,
    y: p.y,
    name: stationName(new Set(d.stations.map((s) => s.name))),
    label: null,
  };
}

export function addSegment(
  d: MapDoc,
  a: string,
  b: string,
  line: string,
): MapDoc {
  if (a === b || !d.lines.some((l) => l.id === line)) return d;
  const key = pairKey(a, b);
  if (d.segments.some((s) => s.line === line && pairKey(s.a, s.b) === key))
    return d;
  return { ...d, segments: [...d.segments, { id: uid(), line, a, b }] };
}

/** Drop a station onto an existing hop: every line on that hop now calls at it. */
export function insertIntoPair(d: MapDoc, key: string, st: Station): MapDoc {
  const segments: Segment[] = [];
  for (const s of d.segments) {
    if (pairKey(s.a, s.b) === key) {
      segments.push(
        { id: uid(), line: s.line, a: s.a, b: st.id },
        { id: uid(), line: s.line, a: st.id, b: s.b },
      );
    } else segments.push(s);
  }
  const routes = { ...d.routes };
  delete routes[key];
  return { ...d, stations: [...d.stations, st], segments, routes };
}

/** Remove a station. Lines that passed straight through it are re-joined. */
export function removeStation(d: MapDoc, id: string): MapDoc {
  const keep = d.segments.filter((s) => s.a !== id && s.b !== id);
  const byLine = new Map<string, Segment[]>();
  for (const s of d.segments) {
    if (s.a !== id && s.b !== id) continue;
    byLine.set(s.line, [...(byLine.get(s.line) ?? []), s]);
  }
  const healed: Segment[] = [];
  for (const [line, segs] of byLine) {
    if (segs.length !== 2) continue;
    const [n1, n2] = segs.map((s) => (s.a === id ? s.b : s.a));
    const key = pairKey(n1, n2);
    if (
      n1 === n2 ||
      keep.some((s) => s.line === line && pairKey(s.a, s.b) === key)
    )
      continue;
    healed.push({ id: uid(), line, a: n1, b: n2 });
  }
  const routes = Object.fromEntries(
    Object.entries(d.routes).filter(([k]) => !k.split("|").includes(id)),
  );
  return {
    ...d,
    stations: d.stations.filter((s) => s.id !== id),
    segments: [...keep, ...healed],
    routes,
  };
}

/** Fold one station into another: every hop to `from` now goes to `into`, and `from` is gone. */
export function mergeStations(d: MapDoc, from: string, into: string): MapDoc {
  if (from === into) return d;
  const seen = new Set<string>();
  const segments: Segment[] = [];
  for (const s of d.segments) {
    const a = s.a === from ? into : s.a;
    const b = s.b === from ? into : s.b;
    const key = `${s.line} ${pairKey(a, b)}`;
    if (a === b || seen.has(key)) continue;
    seen.add(key);
    segments.push(a === s.a && b === s.b ? s : { ...s, a, b });
  }
  const routes = Object.fromEntries(
    Object.entries(d.routes).filter(([k]) => !k.split("|").includes(from)),
  );
  return {
    ...d,
    stations: d.stations.filter((s) => s.id !== from),
    segments,
    routes,
  };
}

export function stationsOnLine(d: MapDoc, line: string) {
  const ids = new Set<string>();
  for (const s of d.segments) {
    if (s.line !== line) continue;
    ids.add(s.a);
    ids.add(s.b);
  }
  return ids;
}
