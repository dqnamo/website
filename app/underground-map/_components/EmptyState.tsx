import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";
import { EASE_OUT } from "../_lib/ease";
import { panelCover } from "../_lib/layout";
import { useMap } from "../_store/useMap";

export function EmptyState({ visible }: { visible: boolean }) {
  const cover = useMap((s) => panelCover(s.size.w));
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="pointer-events-none absolute inset-y-0 left-0 flex items-center justify-center p-6"
          style={{ right: cover }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.15 } }}
          transition={{ duration: 0.3, ease: EASE_OUT }}
        >
          <motion.div
            className="flex max-w-[320px] flex-col items-center text-center"
            initial={{ transform: "translateY(6px)" }}
            animate={{ transform: "translateY(0px)" }}
            exit={{ transform: "scale(0.97)", transition: { duration: 0.15 } }}
            transition={{ duration: 0.4, ease: EASE_OUT }}
          >
            <Illustration />
            <h2 className="mt-5 text-[15px] font-semibold tracking-[-0.01em] text-grayscale-12">
              Lay your first track
            </h2>
            <p className="mt-1.5 text-[13px] leading-relaxed text-grayscale-10">
              Click anywhere to drop a station. Drag from it to the next and the
              line draws itself.
            </p>
            <div className="pointer-events-auto mt-4 flex gap-2">
              <StartButton onClick={() => useMap.getState().loadExample()}>
                Simple example
              </StartButton>
              <StartButton onClick={() => useMap.getState().loadLondon()}>
                London Underground
              </StartButton>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function StartButton({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="press cursor-pointer rounded-lg bg-grayscale-1 px-3 py-1.5 text-[12.5px] font-medium text-grayscale-11 shadow-[0_1px_2px_rgb(0_0_0/0.08),0_0_0_1px_var(--color-grayscale-4)] transition-[transform,background-color] hover:bg-grayscale-2"
      // Keep the press from reaching the canvas, which would drop a station.
      onPointerDown={(e) => e.stopPropagation()}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

/** A tiny map in the map's own style: two lines, an interchange and a few stops. */
function Illustration() {
  const red = "#E1251B";
  const blue = "#0A9BD7";
  return (
    <svg
      width="140"
      height="64"
      viewBox="0 0 140 64"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M12 46H33Q38 46 41.5 42.5L54.5 29.5Q58 26 63 26H128"
        stroke={red}
        strokeWidth="6"
      />
      <path d="M80 6V58" stroke={blue} strokeWidth="6" />
      <g strokeWidth="4.5">
        <path d="M26 46V38M106 26V18" stroke={red} />
        <path d="M80 44H88" stroke={blue} />
      </g>
      <circle
        cx="80"
        cy="26"
        r="7"
        className="fill-grayscale-1 stroke-grayscale-12"
        strokeWidth="3"
      />
    </svg>
  );
}
