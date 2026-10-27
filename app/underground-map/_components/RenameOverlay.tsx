import { useEffect, useRef, useState } from "react";
import { type RenderModel, TUBE } from "../_lib/render";
import { useMap } from "../_store/useMap";

export function RenameOverlay({ model }: { model: RenderModel }) {
  const renaming = useMap((s) => s.renaming);
  const view = useMap((s) => s.view);
  const rs = renaming ? model.stationMap.get(renaming) : undefined;
  if (!rs) return null;

  const { label } = rs;
  const x = label.x * view.k + view.x;
  const y = label.y * view.k + view.y;
  const tx =
    label.anchor === "start"
      ? "-7px"
      : label.anchor === "end"
        ? "calc(-100% + 7px)"
        : "-50%";
  const ty = label.dir.startsWith("N")
    ? "-88%"
    : label.dir.startsWith("S")
      ? "-14%"
      : "-50%";

  return (
    <RenameInput
      key={rs.s.id}
      initial={rs.s.name}
      style={{
        left: x,
        top: y,
        transform: `translate(${tx}, ${ty})`,
        fontSize: Math.max(12, TUBE.labelSize * view.k),
      }}
      onDone={(name) => {
        const st = useMap.getState();
        if (name !== null) st.renameStation(rs.s.id, name);
        st.stopRename();
      }}
    />
  );
}

function RenameInput({
  initial,
  style,
  onDone,
}: {
  initial: string;
  style: React.CSSProperties;
  onDone: (name: string | null) => void;
}) {
  const [value, setValue] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);
  const done = useRef(false);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  const finish = (name: string | null) => {
    if (done.current) return;
    done.current = true;
    onDone(name);
  };

  return (
    <input
      ref={ref}
      value={value}
      spellCheck={false}
      aria-label="Station name"
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") finish(value);
        if (e.key === "Escape") finish(null);
      }}
      onBlur={() => finish(value)}
      className="absolute z-30 min-w-[6ch] rounded-md bg-grayscale-1 px-1.5 py-0.5 font-(family-name:--font-hammersmith-one) leading-tight text-grayscale-12 shadow-[0_4px_16px_rgb(0_0_0/0.12),0_0_0_2px_rgb(59_130_246)] outline-none [field-sizing:content]"
      style={style}
    />
  );
}
