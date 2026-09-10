"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  Children,
  type ComponentPropsWithoutRef,
  type CSSProperties,
  Fragment,
  isValidElement,
  type ReactNode,
  useState,
} from "react";
import styles from "./StampV2.module.css";

type CssLength = number | string;
type StampStyle = CSSProperties &
  Record<`--stamp-v2-${string}`, string | number>;

export type StampV2Props = Omit<ComponentPropsWithoutRef<"div">, "children"> & {
  children: ReactNode;
  /** Preferred width of each stamp. The whole sheet shrinks to fit its parent. */
  stampWidth?: CssLength;
  /** Optional width / height. Omit to fit the stamp to its content. */
  aspectRatio?: number;
  paper?: string;
  ink?: string;
  /** Paper inset. cqi units stay relative to each stamp's width. */
  padding?: CssLength;
  perforationRadius?: CssLength;
  horizontalPerforations?: number;
  verticalPerforations?: number;
  contentClassName?: string;
  /** Lift a single stamp, or gently tug connected stamps from an outside corner. */
  tugOnHover?: boolean;
};

export type StampSheetProps = StampV2Props & {
  /** Each direct child is one stamp's content, in reading order. */
  columns?: number;
  /** Keep keyed stamps in place through animated additions and removals. */
  animateLayout?: boolean;
};

function cssLength(value: CssLength) {
  return typeof value === "number" ? `${value}px` : value;
}

function positiveNumber(value: number, fallback: number) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function sheetPosition(index: number, columns: number, count: number) {
  const rows = Math.ceil(count / columns);
  const row = Math.floor(index / columns);
  const column = index % columns;
  // Reach in from the outside of the sheet, away from its shared centre.
  const vertical = rows === 1 || row >= rows / 2 ? "bottom" : "top";
  const horizontal = columns === 1 || column >= columns / 2 ? "end" : "start";
  const joinedInline =
    horizontal === "start"
      ? column + 1 < columns && index + 1 < count
      : column > 0;
  const joinedBlock =
    vertical === "top" ? index + columns < count : index >= columns;

  return {
    corner: `${vertical}-${horizontal}`,
    joined: [joinedInline && "inline", joinedBlock && "block"]
      .filter(Boolean)
      .join(" "),
  };
}

/** Matching perforations join the stamps into a sheet. */
export function StampSheet({
  children,
  columns = 2,
  animateLayout = false,
  stampWidth = 184,
  aspectRatio,
  paper = "#fffdf7",
  ink = "#292820",
  padding = "7.5cqi",
  perforationRadius = 2.5,
  horizontalPerforations = 16,
  verticalPerforations = 20,
  tugOnHover = true,
  className,
  contentClassName,
  style,
  ...props
}: StampSheetProps) {
  const stamps = Children.toArray(children);
  const resolvedColumns = Math.min(
    Math.max(1, stamps.length),
    Math.max(1, Math.floor(positiveNumber(columns, 2))),
  );
  const reducedMotion = useReducedMotion();
  const shouldAnimate = animateLayout && !reducedMotion;
  const [layout, setLayout] = useState({
    columns: resolvedColumns,
    count: stamps.length,
  });

  // Exiting stamps keep their grid cells until the pop-out finishes. Only then
  // may the sheet shrink and the surviving stamps travel to their new places.
  if (
    (!shouldAnimate || stamps.length >= layout.count) &&
    (layout.columns !== resolvedColumns || layout.count !== stamps.length)
  ) {
    setLayout({ columns: resolvedColumns, count: stamps.length });
  }

  if (stamps.length === 0 && (!shouldAnimate || layout.count === 0))
    return null;

  const layoutColumns = shouldAnimate ? layout.columns : resolvedColumns;
  const layoutCount = shouldAnimate ? layout.count : stamps.length;
  const Stamp = animateLayout ? motion.div : "div";
  const contentClasses = [styles.content, contentClassName]
    .filter(Boolean)
    .join(" ");
  const rootStyle: StampStyle = {
    "--stamp-v2-columns": layoutColumns,
    "--stamp-v2-width": cssLength(stampWidth),
    "--stamp-v2-ratio":
      aspectRatio === undefined ? "auto" : positiveNumber(aspectRatio, 4 / 5),
    "--stamp-v2-paper": paper,
    "--stamp-v2-ink": ink,
    "--stamp-v2-padding": cssLength(padding),
    "--stamp-v2-hole": cssLength(perforationRadius),
    "--stamp-v2-across": Math.max(
      2,
      Math.round(positiveNumber(horizontalPerforations, 16)),
    ),
    "--stamp-v2-down": Math.max(
      2,
      Math.round(positiveNumber(verticalPerforations, 20)),
    ),
    ...style,
  };

  return (
    <div
      className={[styles.root, className].filter(Boolean).join(" ")}
      data-fixed-aspect={aspectRatio === undefined ? undefined : "true"}
      data-tug={tugOnHover ? "true" : undefined}
      style={rootStyle}
      {...props}
    >
      <div className={styles.sheet}>
        <AnimatePresence
          initial={false}
          onExitComplete={() =>
            setLayout({ columns: resolvedColumns, count: stamps.length })
          }
        >
          {stamps.map((content, index) => {
            const position = sheetPosition(index, layoutColumns, layoutCount);
            return (
              <Stamp
                className={styles.stamp}
                data-corner={position.corner}
                data-joined={position.joined || undefined}
                key={isValidElement(content) ? content.key : index}
                {...(animateLayout && {
                  layout: shouldAnimate,
                  initial: { opacity: 0, scale: shouldAnimate ? 0.6 : 1 },
                  animate: { opacity: 1, scale: 1 },
                  exit: {
                    opacity: 0,
                    scale: shouldAnimate ? 0.6 : 1,
                    transition: { duration: shouldAnimate ? 0.16 : 0 },
                  },
                  transition: {
                    layout: { type: "spring", duration: 0.4, bounce: 0.12 },
                    scale: {
                      type: "spring",
                      duration: shouldAnimate ? 0.32 : 0,
                      bounce: 0.2,
                      delay: shouldAnimate ? 0.12 + index * 0.035 : 0,
                    },
                    opacity: {
                      duration: shouldAnimate ? 0.14 : 0,
                      delay: shouldAnimate ? 0.12 + index * 0.035 : 0,
                    },
                  },
                })}
              >
                <div className={styles.surface}>
                  {tugOnHover && position.joined && (
                    <div
                      aria-hidden="true"
                      className={`${styles.paper} ${styles.connections}`}
                    />
                  )}
                  <div className={styles.tug}>
                    <div className={styles.paper}>
                      <div className={contentClasses}>{content}</div>
                    </div>
                  </div>
                </div>
              </Stamp>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}

/** A standalone stamp uses exactly the same paper and perforations as a sheet. */
export function StampV2({ children, ...props }: StampV2Props) {
  return (
    <StampSheet {...props} columns={1}>
      <Fragment key="stamp">{children}</Fragment>
    </StampSheet>
  );
}
