"use client";

import { Slider } from "@base-ui/react/slider";
import { ArrowClockwiseIcon } from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AnimatedSparkChart,
  type SparkCurve,
} from "@/components/AnimatedSparkChart";
import { Tabs } from "@/components/public/Tabs";
import { cn } from "@/helpers/classname-helper";

const sparkPointCount = 64;
const revenueValue = 12_478;
const trendRange = {
  max: 200,
  min: -200,
};
const trendDebounceMs = 180;
const trendMorphDuration = 280;

type SparkAnchor = {
  at: number;
  value: number;
};

type SparkShock = {
  at: number;
  size: number;
  width: number;
};

function smoothStep(value: number) {
  return value * value * (3 - 2 * value);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function seededNoise(seed: number) {
  const value = Math.sin(seed * 12.9898) * 43758.5453;

  return value - Math.floor(value);
}

function interpolateAnchors(anchors: readonly SparkAnchor[], progress: number) {
  const nextAnchorIndex = anchors.findIndex((anchor) => anchor.at >= progress);

  if (nextAnchorIndex <= 0) {
    return anchors[0]?.value ?? 0;
  }

  const previousAnchor = anchors[nextAnchorIndex - 1];
  const nextAnchor = anchors[nextAnchorIndex];
  const anchorRange = nextAnchor.at - previousAnchor.at || 1;
  const anchorProgress = smoothStep(
    (progress - previousAnchor.at) / anchorRange,
  );

  return (
    previousAnchor.value +
    (nextAnchor.value - previousAnchor.value) * anchorProgress
  );
}

function getShockValue(progress: number, shock: SparkShock) {
  const distance = (progress - shock.at) / shock.width;

  return shock.size * Math.exp(-(distance ** 2));
}

function buildSparkPoints({
  endValue,
  trendPercent,
}: {
  endValue: number;
  trendPercent: number;
}) {
  const direction = trendPercent >= 0 ? 1 : -1;
  const intensity = Math.abs(trendPercent) / trendRange.max;
  const startValue = endValue * (1 - direction * 0.5 * intensity);
  const controlCount = 9;
  const anchors = Array.from({ length: controlCount }, (_, index) => {
    const progress = index / (controlCount - 1);
    const drift = startValue + (endValue - startValue) * progress;
    const envelope = Math.sin(progress * Math.PI);
    const seed = trendPercent * 0.131 + index * 4.91;
    const noise = (seededNoise(seed) - 0.5) * endValue * 0.18 * intensity;
    const counterMove =
      Math.sin((progress * 3.4 + seededNoise(seed + 3)) * Math.PI) *
      endValue *
      0.045 *
      (0.35 + intensity);

    return {
      at: progress,
      value:
        index === 0
          ? startValue
          : index === controlCount - 1
            ? endValue
            : clamp(drift + envelope * (noise + counterMove), 2200, 22_000),
    };
  });
  const shocks = [0.22, 0.46, 0.68, 0.84].map((at, index) => {
    const seed = trendPercent * 0.217 + index * 7.37;
    const polarity = seededNoise(seed) > 0.5 ? 1 : -1;

    return {
      at,
      size:
        polarity *
        endValue *
        (0.035 + seededNoise(seed + 1) * 0.08) *
        (0.35 + intensity),
      width: 0.028 + seededNoise(seed + 2) * 0.035,
    };
  });

  return Array.from({ length: sparkPointCount }, (_, index) => {
    const progress = index / (sparkPointCount - 1);
    const envelope = Math.sin(progress * Math.PI);
    const trend = interpolateAnchors(anchors, progress);
    const frequency = 6.5 + intensity * 4.5 + seededNoise(trendPercent) * 2;
    const phase = seededNoise(trendPercent * 0.5 + 11) * Math.PI * 2;
    const secondaryFrequency = 14 + seededNoise(trendPercent + 5) * 12;
    const secondaryPhase = seededNoise(trendPercent - 13) * Math.PI * 2;
    const noise = endValue * (0.012 + intensity * 0.035);
    const wave =
      Math.sin(progress * Math.PI * frequency + phase) * noise +
      Math.sin(progress * Math.PI * secondaryFrequency + secondaryPhase) *
        noise *
        0.55 +
      Math.sin(progress * Math.PI * frequency * 2.9 + phase * 1.7) *
        noise *
        0.22;
    const shock = shocks.reduce(
      (value, item) => value + getShockValue(progress, item),
      0,
    );

    return {
      label: `${index + 1}`,
      value: Number(
        clamp(trend + envelope * wave + shock, 500, 24_000).toFixed(2),
      ),
    };
  });
}

function interpolateSparkPoints({
  fromData,
  progress,
  toData,
}: {
  fromData: ReturnType<typeof buildSparkPoints>;
  progress: number;
  toData: ReturnType<typeof buildSparkPoints>;
}) {
  return toData.map((point, index) => {
    const fromValue = fromData[index]?.value ?? point.value;

    return {
      ...point,
      value: Number(
        (fromValue + (point.value - fromValue) * progress).toFixed(2),
      ),
    };
  });
}

function SparkChartPreview({
  curve,
  replayKey,
  trendPercent,
}: {
  curve: SparkCurve;
  replayKey: number;
  trendPercent: number;
}) {
  const data = useMemo(
    () => buildSparkPoints({ endValue: revenueValue, trendPercent }),
    [trendPercent],
  );
  const [displayData, setDisplayData] = useState(data);
  const displayDataRef = useRef(data);
  const morphFrameRef = useRef<number | null>(null);

  useEffect(() => {
    if (morphFrameRef.current !== null) {
      window.cancelAnimationFrame(morphFrameRef.current);
    }

    const fromData = displayDataRef.current;

    if (fromData === data) {
      setDisplayData(data);
      return;
    }

    let startTime: number | null = null;

    const tick = (timestamp: number) => {
      startTime ??= timestamp;
      const elapsed = timestamp - startTime;
      const nextProgress = Math.min(elapsed / trendMorphDuration, 1);
      const easedProgress = smoothStep(nextProgress);
      const nextData = interpolateSparkPoints({
        fromData,
        progress: easedProgress,
        toData: data,
      });

      displayDataRef.current = nextData;
      setDisplayData(nextData);

      if (nextProgress < 1) {
        morphFrameRef.current = window.requestAnimationFrame(tick);
      } else {
        morphFrameRef.current = null;
        displayDataRef.current = data;
        setDisplayData(data);
      }
    };

    morphFrameRef.current = window.requestAnimationFrame(tick);

    return () => {
      if (morphFrameRef.current !== null) {
        window.cancelAnimationFrame(morphFrameRef.current);
        morphFrameRef.current = null;
      }
    };
  }, [data]);

  return (
    <div className="flex flex-col items-center justify-center w-full gap-3">
      <AnimatedSparkChart
        className="mx-auto w-60"
        curve={curve}
        data={displayData}
        label="Revenue"
        replayKey={replayKey}
        trendPercent={trendPercent}
        valueFormat={{ maximumFractionDigits: 0 }}
        valuePrefix="$"
        width={320}
      />
    </div>
  );
}

export function AnimatedSparkChartShowcase() {
  const [curve, setCurve] = useState<SparkCurve>("smooth");
  const [trendPercent, setTrendPercent] = useState(42);
  const [chartTrendPercent, setChartTrendPercent] = useState(trendPercent);
  const [replayKey, setReplayKey] = useState(0);

  useEffect(() => {
    if (chartTrendPercent === trendPercent) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setChartTrendPercent(trendPercent);
    }, trendDebounceMs);

    return () => window.clearTimeout(timeout);
  }, [chartTrendPercent, trendPercent]);

  return (
    <div className="flex w-full flex-col gap-1.5">
      <div className="relative rounded-[13px] border border-transparent bg-grayscale-2 p-3 py-32 dark:bg-grayscale-2">
        <button
          className="absolute top-1 right-1 flex h-8 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-grayscale-3 bg-white px-2 font-medium text-grayscale-11 text-xs transition-colors hover:border-grayscale-4 hover:bg-grayscale-2 dark:border-grayscale-4 dark:bg-grayscale-3 dark:hover:border-grayscale-5 dark:hover:bg-grayscale-4"
          onClick={() => setReplayKey((value) => value + 1)}
          type="button"
        >
          <ArrowClockwiseIcon aria-hidden size={15} weight="bold" />
          Replay
        </button>
        <SparkChartPreview
          curve={curve}
          replayKey={replayKey}
          trendPercent={chartTrendPercent}
        />
      </div>

      <div className="grid gap-3 rounded-[13px] border border-grayscale-3 bg-grayscale-1 p-3 small-shadow dark:border-grayscale-4 dark:bg-grayscale-3 dark:shadow-none md:grid-cols-[auto_1fr] md:items-center">
        <div className="grid gap-2">
          <p className="font-mono px-2 font-semibold text-[10px] text-grayscale-10 uppercase leading-none">
            Curve
          </p>
          <Tabs.Root
            onValueChange={(value) => {
              if (value !== "smooth" && value !== "sharp") {
                return;
              }

              setCurve(value);
              setReplayKey((currentValue) => currentValue + 1);
            }}
            value={curve}
          >
            <Tabs.List aria-label="Spark chart curve" className="">
              {(["smooth", "sharp"] as const).map((nextCurve) => (
                <Tabs.Tab
                  className={cn(
                    "flex h-6 min-w-14 items-center justify-center rounded-md px-2 py-0 font-medium text-grayscale-11 text-xs capitalize transition-colors data-active:text-grayscale-12",
                    curve === nextCurve && "text-grayscale-12",
                  )}
                  key={nextCurve}
                  value={nextCurve}
                >
                  {nextCurve}
                </Tabs.Tab>
              ))}
              <Tabs.Indicator className="bg-grayscale-3 dark:bg-grayscale-4" />
            </Tabs.List>
          </Tabs.Root>
        </div>

        <Slider.Root
          className="grid min-w-0 gap-2 md:px-3"
          max={trendRange.max}
          min={trendRange.min}
          onValueChange={(value) => setTrendPercent(value)}
          step={1}
          value={trendPercent}
        >
          <div className="flex items-center justify-between gap-3">
            <Slider.Label className="font-mono font-semibold text-[10px] text-grayscale-10 uppercase leading-none">
              Trend
            </Slider.Label>
            <span className="font-number font-semibold text-grayscale-11 text-xs tabular-nums">
              {trendPercent > 0 ? "+" : ""}
              {trendPercent}%
            </span>
          </div>
          <Slider.Control className="flex h-4 w-full cursor-pointer items-center">
            <Slider.Track className="relative h-2 w-full rounded-full bg-grayscale-3 dark:bg-grayscale-5">
              <Slider.Indicator className="absolute h-full rounded-full bg-grayscale-5 dark:bg-grayscale-7" />
              <Slider.Thumb
                aria-label="Trend percentage"
                className="block size-4 rounded-full border border-grayscale-4 bg-white small-shadow outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-grayscale-7 dark:border-grayscale-9 dark:bg-grayscale-8"
              />
            </Slider.Track>
          </Slider.Control>
        </Slider.Root>
      </div>
    </div>
  );
}
