export type Vec = { x: number; y: number };

export type LabelDir = "E" | "SE" | "S" | "SW" | "W" | "NW" | "N" | "NE";

/** 0: diagonal in the middle, 1: straight leg first, 2: diagonal first */
export type RouteMode = 0 | 1 | 2;

export type Tool = "draw" | "move" | "erase";

export interface Station {
  id: string;
  x: number;
  y: number;
  name: string;
  /** null = place the label automatically */
  label: LabelDir | null;
}

export interface Line {
  id: string;
  name: string;
  color: string;
}

/** One hop of one line between two stations. */
export interface Segment {
  id: string;
  line: string;
  a: string;
  b: string;
}

export interface MapDoc {
  title: string;
  stations: Station[];
  lines: Line[];
  segments: Segment[];
  /** Route shape per station pair, keyed by pairKey(a, b) */
  routes: Record<string, RouteMode>;
}

/** Canvas preferences only. Track and station proportions are fixed (see TUBE in render.ts). */
export interface MapStyle {
  gridSize: number;
  showGrid: boolean;
  snap: boolean;
  theme: "paper" | "night";
}

export interface View {
  x: number;
  y: number;
  k: number;
}

export type RadialTarget =
  | { kind: "station"; id: string }
  | { kind: "segment"; id: string; at: Vec };

export interface ConnectState {
  from: string;
  line: string;
  /** drag: one hop while the pointer is down. click: keeps chaining until Esc. */
  via: "drag" | "click";
}

export type DropTarget =
  | { kind: "station"; id: string }
  | { kind: "point"; p: Vec }
  | { kind: "segment"; key: string; p: Vec };
