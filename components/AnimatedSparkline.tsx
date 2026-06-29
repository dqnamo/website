"use client";

import NumberFlow, { type Format } from "@number-flow/react";
import { ArrowDownLeftIcon, ArrowUpRightIcon } from "@phosphor-icons/react";
import type { CSSProperties } from "react";
import { Sparkline, type SparklineCurve } from "@/components/Sparkline";
import { cn } from "@/helpers/classname-helper";

type AnimatedSparklinePoint = {
  label: string;
  value: number;
};

type AnimatedSparklineProps = {
  className?: string;
  curve?: SparkCurve;
  data: readonly AnimatedSparklinePoint[];
  height?: number;
  label?: string;
  replayKey?: number;
  showValue?: boolean;
  trendPercent?: number;
  valueFormat?: Format;
  valuePrefix?: string;
  valueSuffix?: string;
  width?: number;
};

export type SparkCurve = SparklineCurve;

const defaultValueFormat = {
  maximumFractionDigits: 1,
} satisfies Format;

const sparklineAnimationTiming = {
  duration: 980,
  easing: "cubic-bezier(0.25, 1, 0.5, 1)",
} as const;

function formatSparklineValue({
  format,
  prefix = "",
  suffix = "",
  value,
}: {
  format: Format;
  prefix?: string;
  suffix?: string;
  value: number;
}) {
  return `${prefix}${new Intl.NumberFormat("en-US", format).format(value)}${suffix}`;
}

export function AnimatedSparkline({
  className,
  curve = "smooth",
  data,
  height = 72,
  label = "Trend",
  replayKey = 0,
  showValue = true,
  trendPercent,
  valueFormat = defaultValueFormat,
  valuePrefix,
  valueSuffix,
  width = 220,
}: AnimatedSparklineProps) {
  const firstValue = data[0]?.value ?? 0;
  const lastValue = data.at(-1)?.value ?? firstValue;
  const delta =
    firstValue === 0 ? 0 : ((lastValue - firstValue) / firstValue) * 100;
  const displayDelta = trendPercent ?? delta;
  const absoluteDelta = Math.abs(displayDelta);
  const isPositive = displayDelta >= 0;
  const color = isPositive ? "green" : "red";

  return (
    <div
      className={cn(
        "overflow-hidden rounded-[13px] max-w-xs h-max border border-grayscale-3 bg-white p-3 small-shadow dark:border-grayscale-4 dark:bg-grayscale-3 dark:shadow-none",
        className,
      )}
      style={
        {
          "--spark-3": `var(--${color}-3)`,
          "--spark-4": `var(--${color}-4)`,
          "--spark-9": `var(--${color}-9)`,
          "--spark-11": `var(--${color}-11)`,
        } as CSSProperties
      }
    >
      <div className="flex items-start gap-4 justify-between">
        <div className="min-w-0">
          <p className="font-mono font-semibold text-[10px] text-grayscale-10 uppercase leading-none">
            {label}
          </p>
          {showValue ? (
            <p className="mt-1 font-bold font-number font-semibold text-grayscale-12 text-2xl leading-none">
              {formatSparklineValue({
                format: valueFormat,
                prefix: valuePrefix,
                suffix: valueSuffix,
                value: lastValue,
              })}
            </p>
          ) : null}
        </div>
        <div className="grid grid-cols-[14px_auto] items-center gap-0.5 rounded-full font-number font-semibold text-grayscale-11 text-sm uppercase leading-none tabular-nums">
          {isPositive ? (
            <ArrowUpRightIcon
              aria-hidden
              className="text-[var(--spark-9)]"
              size={14}
              weight="bold"
            />
          ) : (
            <ArrowDownLeftIcon
              aria-hidden
              className="text-[var(--spark-9)]"
              size={14}
              weight="bold"
            />
          )}
          <NumberFlow
            format={defaultValueFormat}
            spinTiming={sparklineAnimationTiming}
            suffix="%"
            transformTiming={sparklineAnimationTiming}
            value={absoluteDelta}
          />
        </div>
      </div>

      <Sparkline
        aria-label={`${label} ${isPositive ? "up" : "down"} ${absoluteDelta.toFixed(1)} percent`}
        className="mt-2 block h-auto w-full overflow-visible"
        color="var(--spark-9)"
        curve={curve}
        data={data}
        duration={sparklineAnimationTiming.duration}
        glow
        height={height}
        key={replayKey}
        replayKey={replayKey}
        showEndpoint
        strokeWidth={2}
        width={width}
      />
    </div>
  );
}
