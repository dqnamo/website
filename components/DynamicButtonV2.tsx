"use client";

import {
  AnimatePresence,
  animate,
  type HTMLMotionProps,
  motion,
  useMotionValue,
  useReducedMotion,
} from "motion/react";
import {
  forwardRef,
  type Key,
  type ReactNode,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
} from "react";
import { cn } from "@/helpers/classname-helper";
import { buttonSurfaceClassNames } from "./public/Button";

type DynamicButtonTone = "default" | "success" | "danger";
type DynamicButtonVariant = "primary" | "secondary";
type DynamicButtonSize = "sm" | "md";

const uiEaseOut = [0.23, 1, 0.32, 1] as const;
const resizeSpring = { bounce: 0, duration: 0.34, type: "spring" } as const;
const wordStaggerSeconds = 0.04;
const maxWordDelaySeconds = 0.12;

const toneClassNames: Record<
  DynamicButtonVariant,
  Record<DynamicButtonTone, string>
> = {
  primary: {
    default:
      "bg-grayscale-12 text-grayscale-2 hover:bg-grayscale-12/90 dark:bg-grayscale-5 dark:text-grayscale-12 dark:hover:bg-grayscale-6",
    success:
      "bg-green-11 text-white hover:bg-green-11/90 dark:bg-green-5 dark:text-green-12 dark:hover:bg-green-6",
    danger:
      "bg-red-10 text-white hover:bg-red-10/90 dark:bg-red-5 dark:text-red-12 dark:hover:bg-red-6",
  },
  secondary: {
    default:
      "border-grayscale-4 bg-white text-grayscale-11 hover:bg-grayscale-1 dark:border-grayscale-5 dark:bg-grayscale-3 dark:hover:bg-grayscale-4",
    success:
      "border-green-6 bg-green-2 text-green-11 hover:bg-green-3 dark:border-green-6 dark:bg-green-3 dark:hover:bg-green-4",
    danger:
      "border-red-6 bg-red-2 text-red-11 hover:bg-red-3 dark:border-red-6 dark:bg-red-3 dark:hover:bg-red-4",
  },
};

const sizeClassNames: Record<
  DynamicButtonSize,
  { button: string; content: string }
> = {
  sm: { button: "h-7 rounded-lg", content: "px-2" },
  md: { button: "h-9 rounded-[10px]", content: "px-3" },
};

type Segment = {
  key: string;
  text: string;
};

// Key each word by its text and occurrence so words shared between labels
// keep their identity and slide into place instead of re-entering.
function toSegments(text: string): Segment[] {
  const occurrences = new Map<string, number>();

  return text
    .split(/(\s+)/)
    .filter(Boolean)
    .map((segment) => {
      const occurrence = occurrences.get(segment) ?? 0;
      occurrences.set(segment, occurrence + 1);

      return { key: `${segment}:${occurrence}`, text: segment };
    });
}

function MorphText({ children }: { children: string }) {
  const shouldReduceMotion = useReducedMotion();
  const segments = useMemo(() => toSegments(children), [children]);
  const offset = shouldReduceMotion ? 0 : 8;
  const blur = shouldReduceMotion ? "blur(0px)" : "blur(2px)";

  return (
    <span className="relative inline-flex whitespace-pre">
      <AnimatePresence initial={false} mode="popLayout">
        {segments.map((segment, index) => (
          <motion.span
            animate={{
              filter: "blur(0px)",
              opacity: 1,
              transition: {
                delay: shouldReduceMotion
                  ? 0
                  : Math.min(index * wordStaggerSeconds, maxWordDelaySeconds),
                duration: 0.22,
                ease: uiEaseOut,
              },
              y: 0,
            }}
            className="inline-block"
            exit={{
              filter: blur,
              opacity: 0,
              transition: { duration: 0.16, ease: uiEaseOut },
              y: -offset,
            }}
            initial={{ filter: blur, opacity: 0, y: offset }}
            key={segment.key}
            layout={shouldReduceMotion ? false : "position"}
            transition={{ layout: resizeSpring }}
          >
            {segment.text}
          </motion.span>
        ))}
      </AnimatePresence>
    </span>
  );
}

export type DynamicButtonProps = Omit<
  HTMLMotionProps<"button">,
  "animate" | "children" | "initial" | "ref" | "transition"
> & {
  children: string;
  icon?: ReactNode;
  iconKey?: Key;
  size?: DynamicButtonSize;
  tone?: DynamicButtonTone;
  variant?: DynamicButtonVariant;
};

export const DynamicButton = forwardRef<HTMLButtonElement, DynamicButtonProps>(
  function DynamicButton(
    {
      children,
      className,
      icon,
      iconKey,
      size = "md",
      style,
      tone = "default",
      type = "button",
      variant = "primary",
      ...props
    },
    forwardedRef,
  ) {
    const shouldReduceMotion = useReducedMotion();
    const buttonRef = useRef<HTMLButtonElement>(null);
    const contentRef = useRef<HTMLSpanElement>(null);
    const hasMeasuredRef = useRef(false);
    const width = useMotionValue<number | "auto">("auto");
    const hasIcon = icon != null;

    useImperativeHandle(
      forwardedRef,
      () => buttonRef.current as HTMLButtonElement,
    );

    // The content row is sized to the incoming label straight away (exiting
    // words pop out of flow), so the button only has to chase its width.
    const syncWidth = useCallback(() => {
      const button = buttonRef.current;
      const content = contentRef.current;

      if (!button || !content) {
        return;
      }

      const borderWidth = button.offsetWidth - button.clientWidth;
      const nextWidth = content.offsetWidth + borderWidth;

      if (nextWidth === width.get()) {
        return;
      }

      if (!hasMeasuredRef.current || shouldReduceMotion) {
        hasMeasuredRef.current = true;
        width.jump(nextWidth);
        return;
      }

      animate(width, nextWidth, resizeSpring);
    }, [shouldReduceMotion, width]);

    // biome-ignore lint/correctness/useExhaustiveDependencies: re-measure whenever the rendered content changes.
    useLayoutEffect(() => {
      syncWidth();
    }, [children, hasIcon, size, syncWidth]);

    useEffect(() => {
      const content = contentRef.current;

      if (!content) {
        return;
      }

      const observer = new ResizeObserver(syncWidth);
      observer.observe(content);

      return () => observer.disconnect();
    }, [syncWidth]);

    return (
      <motion.button
        {...props}
        className={cn(
          "inline-flex shrink-0 cursor-pointer items-center overflow-hidden whitespace-nowrap border font-medium text-sm",
          "transition-[color,background-color,border-color,box-shadow,transform] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.97]",
          "outline-offset-2 focus-visible:outline-2 focus-visible:outline-grayscale-8",
          sizeClassNames[size].button,
          buttonSurfaceClassNames[variant],
          toneClassNames[variant][tone],
          className,
        )}
        data-tone={tone}
        ref={buttonRef}
        style={{ ...style, width }}
        type={type}
      >
        <span aria-live="polite" className="sr-only">
          {children}
        </span>
        <span
          aria-hidden="true"
          className={cn(
            "inline-flex w-max shrink-0 items-center gap-1.5",
            sizeClassNames[size].content,
          )}
          ref={contentRef}
        >
          {hasIcon ? (
            <span className="relative inline-grid size-[15px] shrink-0 place-items-center">
              <AnimatePresence initial={false} mode="popLayout">
                <motion.span
                  animate={{ filter: "blur(0px)", opacity: 1, scale: 1 }}
                  className="col-start-1 row-start-1 flex size-[15px] items-center justify-center"
                  exit={{
                    filter: shouldReduceMotion ? "blur(0px)" : "blur(2px)",
                    opacity: 0,
                    scale: shouldReduceMotion ? 1 : 0.4,
                  }}
                  initial={{
                    filter: shouldReduceMotion ? "blur(0px)" : "blur(2px)",
                    opacity: 0,
                    scale: shouldReduceMotion ? 1 : 0.4,
                  }}
                  key={iconKey ?? children}
                  transition={{ duration: 0.2, ease: uiEaseOut }}
                >
                  {icon}
                </motion.span>
              </AnimatePresence>
            </span>
          ) : null}
          <MorphText>{children}</MorphText>
        </span>
      </motion.button>
    );
  },
);
