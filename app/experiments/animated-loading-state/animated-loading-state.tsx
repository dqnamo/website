"use client";

import { ArrowClockwiseIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import Button from "@/components/public/Button";
import { GameOfLife } from "@/components/random/GameOfLife";
import { cn } from "@/helpers/classname-helper";

const LOAD_DURATION = 3800;
const CARD_TRANSITION_DURATION = 520;
const CHART_ANIMATION_DURATION = 900;
const TEXT_ROTATION_INTERVAL = 1450;
const TEXT_TRANSITION_DURATION = 260;
const chartWidth = 520;
const chartHeight = 170;

const chartData = [
  { date: "Jan 23", Organic: 232, Sponsored: 0 },
  { date: "Feb 23", Organic: 241, Sponsored: 0 },
  { date: "Mar 23", Organic: 291, Sponsored: 0 },
  { date: "Apr 23", Organic: 101, Sponsored: 0 },
  { date: "May 23", Organic: 318, Sponsored: 0 },
  { date: "Jun 23", Organic: 205, Sponsored: 0 },
  { date: "Jul 23", Organic: 372, Sponsored: 0 },
  { date: "Aug 23", Organic: 341, Sponsored: 0 },
  { date: "Sep 23", Organic: 387, Sponsored: 120 },
  { date: "Oct 23", Organic: 220, Sponsored: 0 },
  { date: "Nov 23", Organic: 372, Sponsored: 0 },
  { date: "Dec 23", Organic: 321, Sponsored: 0 },
];

const summary = [
  { name: "Organic", value: 3273, color: "bg-blue-500" },
  { name: "Sponsored", value: 120, color: "bg-violet-500" },
];

const gridLineIds = ["grid-0", "grid-1", "grid-2", "grid-3"];
const loadingSentences = [
  "Loading events...",
  "Preparing chart data...",
  "Mapping follower signals...",
  "Resolving live metrics...",
];

const maxChartValue = Math.max(
  ...chartData.flatMap((item) => [item.Organic, item.Sponsored]),
);

function buildLinePath(values: number[]) {
  return values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * chartWidth;
      const y = chartHeight - (value / maxChartValue) * chartHeight;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

function buildAreaPath(values: number[]) {
  return `${buildLinePath(values)} L ${chartWidth} ${chartHeight} L 0 ${chartHeight} Z`;
}

function valueFormatter(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function LoadingText() {
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<"entering" | "exiting" | "visible">(
    "visible",
  );

  useEffect(() => {
    let exitTimeout = 0;
    let enterTimeout = 0;

    const interval = window.setInterval(() => {
      setPhase("exiting");

      exitTimeout = window.setTimeout(() => {
        setIndex((value) => (value + 1) % loadingSentences.length);
        setPhase("entering");

        enterTimeout = window.setTimeout(() => {
          setPhase("visible");
        }, 20);
      }, TEXT_TRANSITION_DURATION);
    }, TEXT_ROTATION_INTERVAL);

    return () => {
      window.clearInterval(interval);
      window.clearTimeout(exitTimeout);
      window.clearTimeout(enterTimeout);
    };
  }, []);

  return (
    <p
      aria-live="polite"
      className="flex h-7 items-center overflow-hidden font-medium text-grayscale-11 text-sm leading-5"
    >
      <span
        className={cn(
          "inline-block ease-out",
          phase === "visible" &&
            "translate-y-0 opacity-100 transition-[translate,opacity]",
          phase === "exiting" &&
            "-translate-y-full opacity-0 transition-[translate,opacity]",
          phase === "entering" && "translate-y-full opacity-0 transition-none",
        )}
        style={{ transitionDuration: `${TEXT_TRANSITION_DURATION}ms` }}
      >
        {loadingSentences[index]}
      </span>
    </p>
  );
}

function ChartBody({ isVisible }: { isVisible: boolean }) {
  const organicValues = chartData.map((item) => item.Organic);
  const sponsoredValues = chartData.map((item) => item.Sponsored);
  const organicPath = buildLinePath(organicValues);
  const sponsoredPath = buildLinePath(sponsoredValues);

  return (
    <>
      <div className="relative mt-5 h-44">
        <div className="absolute inset-x-0 top-0 bottom-6 grid grid-rows-4">
          {gridLineIds.map((id) => (
            <div
              className="border-grayscale-3 border-t dark:border-grayscale-5"
              key={id}
            />
          ))}
        </div>
        <svg
          aria-hidden="true"
          className="absolute inset-x-0 top-0 bottom-6 h-auto w-full overflow-visible"
          preserveAspectRatio="none"
          viewBox={`0 0 ${chartWidth} ${chartHeight}`}
        >
          <defs>
            <linearGradient id="organic-area" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="rgb(59 130 246)" stopOpacity="0.2" />
              <stop offset="100%" stopColor="rgb(59 130 246)" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="sponsored-area" x1="0" x2="0" y1="0" y2="1">
              <stop
                offset="0%"
                stopColor="rgb(139 92 246)"
                stopOpacity="0.16"
              />
              <stop offset="100%" stopColor="rgb(139 92 246)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path
            d={buildAreaPath(organicValues)}
            fill="url(#organic-area)"
            style={{
              opacity: isVisible ? 1 : 0,
              transition: "opacity 700ms ease-out 180ms",
            }}
          />
          <path
            d={buildAreaPath(sponsoredValues)}
            fill="url(#sponsored-area)"
            style={{
              opacity: isVisible ? 1 : 0,
              transition: "opacity 700ms ease-out 280ms",
            }}
          />
          <path
            d={organicPath}
            fill="none"
            pathLength={1}
            stroke="rgb(59 130 246)"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            style={{
              opacity: isVisible ? 1 : 0,
              strokeDasharray: 1,
              strokeDashoffset: isVisible ? 0 : 1,
              transition: `stroke-dashoffset ${CHART_ANIMATION_DURATION}ms cubic-bezier(0.22, 1, 0.36, 1), opacity 300ms ease-out`,
            }}
            vectorEffect="non-scaling-stroke"
          />
          <path
            d={sponsoredPath}
            fill="none"
            pathLength={1}
            stroke="rgb(139 92 246)"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            style={{
              opacity: isVisible ? 1 : 0,
              strokeDasharray: 1,
              strokeDashoffset: isVisible ? 0 : 1,
              transition: `stroke-dashoffset ${CHART_ANIMATION_DURATION}ms cubic-bezier(0.22, 1, 0.36, 1) 120ms, opacity 300ms ease-out 120ms`,
            }}
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        <div
          className={cn(
            "absolute inset-x-0 bottom-0 flex justify-between font-mono text-[10px] text-grayscale-9 uppercase leading-none transition-all duration-500 ease-out",
            isVisible ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0",
          )}
        >
          <span>{chartData[0].date}</span>
          <span>{chartData.at(-1)?.date}</span>
        </div>
      </div>

      <div className="mt-2 divide-y divide-grayscale-3 dark:divide-grayscale-5">
        {summary.map((item) => (
          <div
            className={cn(
              "flex items-center justify-between py-2 text-grayscale-10 text-sm transition-all duration-500 ease-out",
              isVisible
                ? "translate-y-0 opacity-100"
                : "translate-y-2 opacity-0",
            )}
            key={item.name}
            style={{
              transitionDelay: isVisible
                ? `${520 + summary.findIndex((entry) => entry.name === item.name) * 90}ms`
                : "0ms",
            }}
          >
            <div className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className={cn("h-0.5 w-3", item.color)}
              />
              <span>{item.name}</span>
            </div>
            <span className="font-medium text-grayscale-12">
              {valueFormatter(item.value)}
            </span>
          </div>
        ))}
      </div>
    </>
  );
}

function ChartReveal() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setIsVisible(true);
    });

    return () => window.cancelAnimationFrame(frame);
  }, []);

  return (
    <div
      className={cn(
        "absolute inset-0 z-10 p-6 transition-all duration-700 ease-out",
        isVisible ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0",
      )}
    >
      <h3 className="font-medium text-grayscale-12 text-sm">
        Follower metrics
      </h3>

      <ChartBody isVisible={isVisible} />
    </div>
  );
}

function ChartCard({ isLoaded }: { isLoaded: boolean }) {
  const [showLoadingLayer, setShowLoadingLayer] = useState(true);

  useEffect(() => {
    if (!isLoaded) {
      setShowLoadingLayer(true);
      return;
    }

    const timeout = window.setTimeout(() => {
      setShowLoadingLayer(false);
    }, CARD_TRANSITION_DURATION);

    return () => window.clearTimeout(timeout);
  }, [isLoaded]);

  return (
    <div className="relative h-[22rem] w-full max-w-md overflow-hidden rounded-xl border border-grayscale-3 bg-white small-shadow dark:border-grayscale-5 dark:bg-grayscale-3">
      {isLoaded && <ChartReveal />}

      {showLoadingLayer && (
        <div
          className={cn(
            "absolute inset-0 z-20 overflow-hidden bg-white p-6 transition-all ease-out dark:bg-grayscale-3",
            isLoaded ? "-translate-y-2 opacity-0" : "translate-y-0 opacity-100",
          )}
          style={{ transitionDuration: `${CARD_TRANSITION_DURATION}ms` }}
        >
          <GameOfLife
            aria-hidden
            cellRadius={3}
            cellSize={14}
            density={0.28}
            fadeDuration={920}
            maxOpacity={1}
            stepInterval={620}
            className="absolute inset-0 [--game-of-life-color:var(--color-grayscale-3)] dark:[--game-of-life-color:var(--color-grayscale-5)]"
          />
          <div className="relative z-10 flex h-full flex-col items-center justify-center text-center">
            <LoadingText />
          </div>
        </div>
      )}
    </div>
  );
}

function AnimatedLoadingStatePreview() {
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setIsLoaded(true);
    }, LOAD_DURATION);

    return () => window.clearTimeout(timeout);
  }, []);

  return (
    <div className="flex min-h-[31rem] items-center justify-center rounded-[13px] border border-transparent bg-grayscale-2 shadow-none p-4 dark:border-transparent dark:shadow-none dark:bg-grayscale-2 sm:p-8">
      <ChartCard isLoaded={isLoaded} />
    </div>
  );
}

export function AnimatedLoadingStateMiniPreview() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-grayscale-2 p-3 dark:bg-grayscale-2">
      <div className="w-[448px] origin-center scale-[0.31]">
        <ChartCard isLoaded={false} />
      </div>
    </div>
  );
}

export function AnimatedLoadingState() {
  const [run, setRun] = useState(0);

  return (
    <div className="flex flex-col gap-1.5">
      <AnimatedLoadingStatePreview key={run} />

      <div className="flex items-center justify-between rounded-[13px] border border-grayscale-3 bg-grayscale-1 p-3 small-shadow dark:border-grayscale-4 dark:bg-grayscale-3">
        <div>
          <p className="font-medium text-grayscale-12 text-sm leading-none">
            Animated loading state
          </p>
          <p className="mt-1.5 text-grayscale-10 text-xs leading-5">
            A live loading state resolves into follower metrics.
          </p>
        </div>
        <Button
          aria-label="Replay loading animation"
          onClick={() => setRun((value) => value + 1)}
          type="button"
          variant="secondary"
        >
          <ArrowClockwiseIcon aria-hidden="true" size={15} weight="bold" />
          Replay
        </Button>
      </div>
    </div>
  );
}
