"use client";

import {
  AnimatePresence,
  type HTMLMotionProps,
  motion,
  useReducedMotion,
} from "motion/react";
import { useLayoutEffect, useRef, useState } from "react";
import { getButtonClassName } from "./public/Button";

type DynamicButtonProps = Omit<HTMLMotionProps<"button">, "children"> & {
  children: string;
  icon?: React.ReactNode;
  iconKey?: React.Key;
  variant?: "primary" | "secondary";
};

export function DynamicButton({
  children,
  className,
  icon,
  iconKey,
  type = "button",
  variant = "primary",
  ...props
}: DynamicButtonProps) {
  const shouldReduceMotion = useReducedMotion();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const [width, setWidth] = useState<number | null>(null);

  useLayoutEffect(() => {
    const button = buttonRef.current;
    const measure = measureRef.current;

    if (!button || !measure) {
      return;
    }

    const syncWidth = () => {
      const styles = window.getComputedStyle(button);
      const horizontalPadding =
        Number.parseFloat(styles.paddingLeft) +
        Number.parseFloat(styles.paddingRight) +
        Number.parseFloat(styles.borderLeftWidth) +
        Number.parseFloat(styles.borderRightWidth);
      const nextWidth = Math.ceil(measure.scrollWidth + horizontalPadding);

      setWidth((currentWidth) =>
        currentWidth === nextWidth ? currentWidth : nextWidth,
      );
    };

    syncWidth();

    const observer = new ResizeObserver(syncWidth);
    observer.observe(measure);
    window.addEventListener("resize", syncWidth);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", syncWidth);
    };
  });

  return (
    <motion.button
      className={getButtonClassName({
        className: `relative overflow-hidden whitespace-nowrap ${className ?? ""}`,
        variant,
      })}
      animate={{ width: width ?? "auto" }}
      initial={false}
      ref={buttonRef}
      transition={{
        width: shouldReduceMotion
          ? { duration: 0 }
          : { bounce: 0, duration: 0.32, type: "spring" },
      }}
      type={type}
      {...props}
    >
      <span className="relative inline-flex items-center gap-1.5">
        {icon ? (
          <span className="relative inline-grid size-[15px] shrink-0 overflow-hidden">
            <AnimatePresence initial={false} mode="popLayout">
              <motion.span
                animate={{ opacity: 1, y: 0 }}
                className="col-start-1 row-start-1 flex size-[15px] items-center justify-center"
                exit={
                  shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -8 }
                }
                initial={
                  shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }
                }
                key={iconKey ?? children}
                transition={{ duration: shouldReduceMotion ? 0 : 0.18 }}
              >
                {icon}
              </motion.span>
            </AnimatePresence>
          </span>
        ) : null}

        <span className="relative inline-grid overflow-hidden">
          <AnimatePresence initial={false} mode="popLayout">
            <motion.span
              animate={{ opacity: 1, y: 0 }}
              className="col-start-1 row-start-1 block"
              exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -8 }}
              initial={
                shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }
              }
              key={children}
              transition={{ duration: shouldReduceMotion ? 0 : 0.18 }}
            >
              {children}
            </motion.span>
          </AnimatePresence>
        </span>
      </span>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inline-flex items-center gap-1.5 opacity-0"
        ref={measureRef}
      >
        {icon ? (
          <span className="flex size-[15px] shrink-0 items-center justify-center">
            {icon}
          </span>
        ) : null}
        <span>{children}</span>
      </span>
    </motion.button>
  );
}
