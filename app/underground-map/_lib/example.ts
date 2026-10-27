import { uid } from "./doc";
import { PALETTE } from "./palette";
import type { LabelDir, MapDoc, Segment, Station } from "./types";

// [name, gridX, gridY, label?]
const STATIONS: Record<string, [string, number, number, LabelDir?]> = {
  A: ["Westbourne Rise", -9, 0],
  B: ["Hollow Lane", -6, 0],
  C: ["Market Cross", -3, 0],
  D: ["Kingsgate", 0, 0],
  E: ["Bell Street", 3, 0],
  F: ["Riverside", 6, 0],
  G: ["Eastfield", 9, 0],
  H: ["Northcote", -3, -7],
  I: ["Highfield", -3, -4],
  J: ["Fleetwick", 0, 3],
  K: ["Southmere", 0, 6],
  L: ["Cranmoor", -3, 9],
  N: ["Ashby Hill", 4, -7],
  O: ["Copper Row", 4, -4],
  T: ["Elm Park", -6, -3],
  U: ["Larkspur", 8, -4],
  V: ["Thornbury", 10, -2],
  W: ["Mill Green", -10, 3],
  X: ["Oakhurst", -6, 3],
  Y: ["Quayside", 4, 3],
  Z: ["Lantern Wharf", 8, 3],
  AA: ["Saltmarsh", 11, 3],
};

const LINES: [name: string, paletteIndex: number, stops: string][] = [
  ["Crimson", 0, "A B C D E F G"],
  ["Cobalt", 1, "H I C J K"],
  ["Emerald", 2, "N O D J K L"],
  ["Saffron", 3, "T C D O U V"],
  ["Plum", 4, "W X J Y Z AA"],
];

export function exampleDoc(grid: number): MapDoc {
  const ids: Record<string, string> = {};
  const stations: Station[] = Object.entries(STATIONS).map(
    ([k, [name, x, y, label]]) => {
      ids[k] = uid();
      return {
        id: ids[k],
        name,
        x: x * grid,
        y: y * grid,
        label: label ?? null,
      };
    },
  );
  const lines = LINES.map(([name, p]) => ({
    id: uid(),
    name,
    color: PALETTE[p].color,
  }));
  const segments: Segment[] = [];
  LINES.forEach(([, , stops], i) => {
    const seq = stops.split(" ");
    for (let j = 0; j < seq.length - 1; j++) {
      segments.push({
        id: uid(),
        line: lines[i].id,
        a: ids[seq[j]],
        b: ids[seq[j + 1]],
      });
    }
  });
  return {
    title: "Fleetwick Underground",
    stations,
    lines,
    segments,
    routes: {},
  };
}
