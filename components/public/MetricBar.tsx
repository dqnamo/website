"use client";

import { InfoIcon } from "@phosphor-icons/react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useLayoutEffect, useRef } from "react";
import { Tooltip } from "@/components/public/Tooltip";
import { cn } from "@/helpers/classname-helper";

type MetricBarProps = {
  animationKey?: string | number;
  className?: string;
  info?: string;
  invert?: boolean;
  label: string;
  max?: number;
  value: number;
};

const METRIC_COLORS = {
  red: "var(--red-9)",
  orange: "var(--orange-9)",
  grass: "var(--grass-9)",
  green: "var(--green-9)",
} as const;

function getEffectiveValue(value: number, max: number, invert: boolean) {
  if (!invert) {
    return value;
  }

  return max - value + 1;
}

function getColorStopsForLevel(level: number) {
  if (level < 3) {
    return [METRIC_COLORS.red, METRIC_COLORS.red];
  }

  if (level < 6) {
    return [METRIC_COLORS.red, METRIC_COLORS.orange];
  }

  if (level < 8) {
    return [METRIC_COLORS.red, METRIC_COLORS.orange, METRIC_COLORS.grass];
  }

  return [
    METRIC_COLORS.red,
    METRIC_COLORS.orange,
    METRIC_COLORS.grass,
    METRIC_COLORS.green,
  ];
}

function getKeyframeTimes(stopCount: number) {
  if (stopCount <= 1) {
    return [0];
  }

  return Array.from(
    { length: stopCount },
    (_, index) => index / (stopCount - 1),
  );
}

function MetricInfoTooltip({ content }: { content: string }) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger aria-label={content}>
        <InfoIcon
          aria-hidden="true"
          className="text-grayscale-8"
          size={11}
          weight="fill"
        />
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Positioner align="end">
          <Tooltip.Popup>{content}</Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

export function MetricBar({
  animationKey,
  className,
  info,
  invert = false,
  label,
  max = 10,
  value,
}: MetricBarProps) {
  const shouldReduceMotion = useReducedMotion();
  const clampedValue = Math.min(max, Math.max(0, Math.round(value)));
  const effectiveValue = getEffectiveValue(clampedValue, max, invert);
  const colorStops = getColorStopsForLevel(effectiveValue);
  const targetColor = colorStops[colorStops.length - 1];

  const previousRef = useRef<{
    key: MetricBarProps["animationKey"];
    value: number;
  } | null>(null);

  const isReset =
    previousRef.current === null || previousRef.current.key !== animationKey;
  const previousValue = isReset ? 0 : (previousRef.current?.value ?? 0);
  const segmentKeys = Array.from(
    { length: max },
    (_, index) => `${label}-segment-${index + 1}`,
  );

  useLayoutEffect(() => {
    previousRef.current = { key: animationKey, value: clampedValue };
  }, [animationKey, clampedValue]);

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <div className="flex items-center justify-between gap-1">
        <span className="font-mono font-medium text-grayscale-9 text-tiny uppercase leading-none">
          {label}
        </span>
        {info ? <MetricInfoTooltip content={info} /> : null}
      </div>
      <div
        aria-label={`${label}: ${clampedValue} out of ${max}`}
        className="grid grid-cols-10 gap-1"
        role="img"
      >
        {segmentKeys.map((segmentKey, index) => {
          const isFilled = index < clampedValue;
          const wasFilled = index < previousValue;
          const isNewSegment = isFilled && (!wasFilled || isReset);
          const newSegmentDelay =
            shouldReduceMotion || !isNewSegment
              ? 0
              : Math.max(0, index - (isReset ? 0 : previousValue)) * 0.035;

          return (
            <div
              className="h-3 overflow-hidden rounded-sm bg-grayscale-3 dark:bg-grayscale-6"
              key={segmentKey}
            >
              <AnimatePresence initial={false}>
                {isFilled ? (
                  <motion.div
                    animate={
                      shouldReduceMotion
                        ? { scaleY: 1, backgroundColor: targetColor }
                        : isNewSegment
                          ? { scaleY: 1, backgroundColor: colorStops }
                          : { scaleY: 1, backgroundColor: targetColor }
                    }
                    className="h-full w-full rounded-sm"
                    exit={
                      shouldReduceMotion
                        ? undefined
                        : { scaleY: 0, transition: { duration: 0.15 } }
                    }
                    initial={
                      shouldReduceMotion
                        ? false
                        : isNewSegment
                          ? { scaleY: 0, backgroundColor: METRIC_COLORS.red }
                          : false
                    }
                    key={`${animationKey ?? label}-${segmentKey}-fill`}
                    style={{ transformOrigin: "bottom" }}
                    transition={{
                      scaleY: {
                        duration: isNewSegment ? 0.28 : 0.15,
                        delay: newSegmentDelay,
                        ease: [0.22, 1, 0.36, 1],
                      },
                      backgroundColor: isNewSegment
                        ? {
                            duration: 0.28,
                            delay: newSegmentDelay,
                            ease: "linear",
                            times: getKeyframeTimes(colorStops.length),
                          }
                        : {
                            duration: 0.2,
                            ease: "easeOut",
                          },
                    }}
                  />
                ) : null}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </div>
  );
}
