import { useEffect } from "react";
import { buildRender } from "../_lib/render";
import { useMap } from "../_store/useMap";
import { Canvas } from "./Canvas";
import { Sidebar } from "./Sidebar";

function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        (e.target as HTMLElement).closest?.(
          "input, textarea, [contenteditable='true']",
        )
      )
        return;
      const st = useMap.getState();
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();

      if (mod && key === "z") {
        e.preventDefault();
        if (e.shiftKey) st.redo();
        else st.undo();
        return;
      }
      if (mod && key === "y") {
        e.preventDefault();
        st.redo();
        return;
      }
      if (mod || e.altKey) return;

      const radialStation = st.radial?.kind === "station" ? st.radial.id : null;

      if (/^[1-9]$/.test(e.key)) {
        const line = st.doc.lines[Number(e.key) - 1];
        if (!line) return;
        st.setActiveLine(line.id);
        if (radialStation) st.startConnect(radialStation, line.id, "click");
        return;
      }

      switch (key) {
        case "d":
          st.setTool("draw", "keyboard");
          break;
        case "v":
          st.setTool("move", "keyboard");
          break;
        case "e":
          st.setTool("erase", "keyboard");
          break;
        case "f":
          st.fit();
          break;
        case "n":
          if (radialStation)
            st.startConnect(radialStation, st.addLine(), "click");
          else st.addLine();
          break;
        case "r":
          if (radialStation) st.startRename(radialStation);
          break;
        case "l":
          if (radialStation) {
            const rs = buildRender(st.doc).stationMap.get(radialStation);
            if (rs) st.cycleLabel(radialStation, rs.label.dir);
          }
          break;
        case "escape":
        case "enter":
          if (st.connect) st.stopConnect();
          else if (st.radial) st.closeRadial();
          break;
        case "backspace":
        case "delete":
          if (radialStation) {
            st.deleteStation(radialStation);
          } else if (st.radial?.kind === "segment") {
            st.deleteSegment(st.radial.id);
          }
          break;
        default:
          return;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

export default function UndergroundMap() {
  useShortcuts();
  return (
    <div className="relative size-full overflow-hidden">
      <main className="absolute inset-0">
        <Canvas />
      </main>
      <Sidebar />
    </div>
  );
}
