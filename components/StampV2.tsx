import {
  Children,
  type ComponentPropsWithoutRef,
  type CSSProperties,
  Fragment,
  isValidElement,
  type ReactNode,
} from "react";
import styles from "./StampV2.module.css";

type CssLength = number | string;
type StampStyle = CSSProperties &
  Record<`--stamp-v2-${string}`, string | number>;

export type StampV2Props = Omit<ComponentPropsWithoutRef<"div">, "children"> & {
  /** Decorative artwork. The peel renders a second, inert copy for its front. */
  children: ReactNode;
  /** Preferred width of each stamp. The whole sheet shrinks to fit its parent. */
  stampWidth?: CssLength;
  /** Width / height of each stamp. */
  aspectRatio?: number;
  paper?: string;
  ink?: string;
  padding?: CssLength;
  perforationRadius?: CssLength;
  horizontalPerforations?: number;
  verticalPerforations?: number;
  contentClassName?: string;
  /** Peel a corner forward while the rest of the stamp stays attached. */
  peelOnHover?: boolean;
};

export type StampSheetProps = StampV2Props & {
  /** Each direct child is one stamp's content, in reading order. */
  columns?: number;
};

function cssLength(value: CssLength) {
  return typeof value === "number" ? `${value}px` : value;
}

function positiveNumber(value: number, fallback: number) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function peelCorner(index: number, columns: number, count: number) {
  const rows = Math.ceil(count / columns);
  const row = Math.floor(index / columns);
  // Reach in from the outside of the sheet, away from its shared centre.
  const vertical = rows === 1 || row >= rows / 2 ? "bottom" : "top";
  const horizontal =
    columns === 1 || index % columns >= columns / 2 ? "end" : "start";
  return `${vertical}-${horizontal}`;
}

/** Matching perforations join the stamps into a sheet. No DOM measurement. */
export function StampSheet({
  children,
  columns = 2,
  stampWidth = 184,
  aspectRatio = 4 / 5,
  paper = "#fffdf7",
  ink = "#292820",
  padding = "7.5%",
  perforationRadius = 2.5,
  horizontalPerforations = 16,
  verticalPerforations = 20,
  peelOnHover = true,
  className,
  contentClassName,
  style,
  ...props
}: StampSheetProps) {
  const stamps = Children.toArray(children);
  if (stamps.length === 0) return null;

  const resolvedColumns = Math.min(
    stamps.length,
    Math.max(1, Math.floor(positiveNumber(columns, 2))),
  );
  const contentClasses = [styles.content, contentClassName]
    .filter(Boolean)
    .join(" ");
  const rootStyle: StampStyle = {
    "--stamp-v2-columns": resolvedColumns,
    "--stamp-v2-width": cssLength(stampWidth),
    "--stamp-v2-ratio": positiveNumber(aspectRatio, 4 / 5),
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
      data-peel={peelOnHover ? "true" : undefined}
      style={rootStyle}
      {...props}
    >
      <div className={styles.sheet}>
        {stamps.map((content, index) => (
          <div
            className={styles.stamp}
            data-corner={peelCorner(index, resolvedColumns, stamps.length)}
            key={isValidElement(content) ? content.key : index}
          >
            <div className={styles.surface}>
              <div className={styles.paper}>
                <div className={contentClasses}>{content}</div>
              </div>
              {peelOnHover && (
                <div aria-hidden="true" inert className={styles.corner}>
                  <div className={styles.turn}>
                    <div className={`${styles.paper} ${styles.front}`}>
                      <div className={contentClasses}>{content}</div>
                    </div>
                    <div className={`${styles.paper} ${styles.reverse}`} />
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
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
