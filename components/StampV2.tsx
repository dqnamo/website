"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  Children,
  type ComponentPropsWithoutRef,
  type CSSProperties,
  Fragment,
  isValidElement,
  type ReactNode,
  useLayoutEffect,
  useRef,
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
  /** Called after a stamp pulls free. Update the children to keep that stamp. */
  onStampDetach?: (index: number) => void;
  /** Accessible name for each detachable stamp, e.g. "Tokyo stamp". */
  getStampLabel?: (index: number) => string;
};

type StampTear = {
  key: string | number;
  source: string;
  index: number;
  corner: string;
  joined: string;
  x: number;
  y: number;
  rotate: number;
  phase: "pulling" | "released";
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
  onStampDetach,
  getStampLabel,
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
  const stampKeys = stamps.map((content, index) =>
    isValidElement(content) ? (content.key ?? index) : index,
  );
  const stampSignature = JSON.stringify(stampKeys);
  const resolvedColumns = Math.min(
    Math.max(1, stamps.length),
    Math.max(1, Math.floor(positiveNumber(columns, 2))),
  );
  const reducedMotion = useReducedMotion();
  const shouldAnimate = animateLayout && !reducedMotion;
  const [tear, setTear] = useState<StampTear | null>(null);
  const pendingTear = useRef<StampTear | null>(null);
  useLayoutEffect(() => {
    pendingTear.current = tear;
    return () => {
      pendingTear.current = null;
    };
  }, [tear]);

  // A layout change cancels an unfinished pull, including callbacks retained
  // by an exiting stamp. Restoring the sheet also releases a held tear.
  if (
    tear &&
    (tear.phase === "pulling"
      ? tear.source !== stampSignature
      : stamps.length !== 1 || stampKeys[0] !== tear.key)
  ) {
    setTear(null);
  }

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
  const Stamp = onStampDetach
    ? motion.button
    : animateLayout
      ? motion.div
      : "div";
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
          onExitComplete={() => {
            setLayout({ columns: resolvedColumns, count: stamps.length });
            if (pendingTear.current?.phase === "released") {
              pendingTear.current = null;
              setTear(null);
            }
          }}
        >
          {stamps.map((content, index) => {
            const key = stampKeys[index];
            const isTearing = tear?.key === key;
            const position = isTearing
              ? tear
              : sheetPosition(index, layoutColumns, layoutCount);
            const canDetach = stamps.length > 1 && !tear;
            const label = getStampLabel?.(index) ?? `Stamp ${index + 1}`;
            return (
              <Stamp
                className={styles.stamp}
                data-corner={position.corner}
                data-joined={position.joined || undefined}
                data-ripping={isTearing ? tear.phase : undefined}
                key={key}
                {...(onStampDetach && {
                  type: "button",
                  "aria-label": canDetach ? `Detach ${label}` : label,
                  "aria-disabled": !canDetach,
                  tabIndex: stamps.length > 1 ? 0 : -1,
                  onClick: (event: React.MouseEvent<HTMLElement>) => {
                    if (!canDetach || pendingTear.current) return;
                    if (reducedMotion) {
                      onStampDetach(index);
                      return;
                    }
                    const direction = event.currentTarget.matches(":dir(rtl)")
                      ? -1
                      : 1;
                    const sheet =
                      event.currentTarget.parentElement?.parentElement;
                    const horizontalSpace = sheet?.parentElement
                      ? (sheet.parentElement.clientWidth - sheet.clientWidth) /
                        2
                      : 0;
                    // Leave room for the paper's rotation inside narrow previews.
                    const pullDistance = Math.min(
                      30,
                      Math.max(7, horizontalSpace),
                    );
                    const x = position.corner.endsWith("start") ? -1 : 1;
                    const y = position.corner.startsWith("top") ? -1 : 1;
                    const nextTear: StampTear = {
                      key,
                      source: stampSignature,
                      index,
                      ...position,
                      x: x * direction * pullDistance,
                      y:
                        y *
                        Math.min(26, event.currentTarget.clientHeight * 0.12),
                      rotate: x * direction * 3,
                      phase: "pulling",
                    };
                    pendingTear.current = nextTear;
                    setTear(nextTear);
                  },
                })}
                {...((animateLayout || onStampDetach) && {
                  layout: shouldAnimate,
                  initial: { opacity: 0, scale: shouldAnimate ? 0.6 : 1 },
                  animate: isTearing ? "detached" : "rest",
                  variants: {
                    rest: { opacity: 1, scale: 1, x: 0, y: 0, rotate: 0 },
                    detached: {
                      opacity: 1,
                      scale: 1,
                      x: tear?.x ?? 0,
                      y: tear?.y ?? 0,
                      rotate: tear?.rotate ?? 0,
                      transition: {
                        type: "tween",
                        duration: 0.22,
                        ease: [0.77, 0, 0.175, 1],
                      },
                    },
                  },
                  onAnimationComplete: (definition: unknown) => {
                    if (
                      definition !== "detached" ||
                      !tear ||
                      tear.key !== key ||
                      tear.phase !== "pulling" ||
                      pendingTear.current !== tear
                    )
                      return;
                    const released = { ...tear, phase: "released" as const };
                    pendingTear.current = released;
                    setTear(released);
                    onStampDetach?.(tear.index);
                  },
                  exit: {
                    opacity: 0,
                    scale: shouldAnimate ? 0.6 : 1,
                    transition: { duration: shouldAnimate ? 0.12 : 0 },
                  },
                  transition: {
                    type: "spring",
                    duration: shouldAnimate ? 0.3 : 0,
                    bounce: 0.12,
                    layout: { type: "spring", duration: 0.3, bounce: 0.12 },
                    scale: {
                      type: "spring",
                      duration: shouldAnimate ? 0.24 : 0,
                      bounce: 0.2,
                      delay: shouldAnimate ? 0.08 + index * 0.025 : 0,
                    },
                    opacity: {
                      duration: shouldAnimate ? 0.1 : 0,
                      delay: shouldAnimate ? 0.08 + index * 0.025 : 0,
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
