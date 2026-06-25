"use client";

import { ArrowRightIcon } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import posthog from "posthog-js";
import { ScrambleTextShowcase } from "@/app/experiments/scramble-text/scramble-text-showcase";
import { AnimatedSparkChart } from "@/components/AnimatedSparkChart";
import { ExperimentBannerPreview } from "@/components/ExperimentBannerPreview";
import { IridescentFoil } from "@/components/IridescentFoil";
import { LogoTraceLoader } from "@/components/LogoTraceLoader";
import { GameOfLife } from "@/components/random/GameOfLife";
import { Signature } from "@/components/Signature";
import { cn } from "@/helpers/classname-helper";

type NewExperimentCtaProps = {
  className?: string;
};

const experiments = [
  {
    title: "Animated Banner",
    href: "/experiments/animated-banner",
    description:
      "A compact animated promo card with video, countdown, and CTA.",
    preview: "banner",
  },
  {
    title: "Animated Loading State",
    href: "/experiments/animated-loading-state",
    description: "Game of Life loading cells transition into an area chart.",
    preview: "loading",
  },
  {
    title: "Animated Spark Chart",
    href: "/experiments/animated-spark-chart",
    description: "An SVG sparkline that draws itself and colors by trend.",
    preview: "spark-chart",
  },
  {
    title: "Animated Signature",
    href: "/experiments/signature",
    description:
      "A reusable SVG signature component that draws itself on mount.",
    preview: "signature",
  },
  {
    title: "Logo Trace Loader",
    href: "/experiments/logo-trace-loader",
    description: "A traced logo loader that resolves into a filled mark.",
    preview: "logo-loader",
  },
  {
    title: "Iridescent Foil",
    href: "/experiments/iridescent-foil",
    description:
      "A layered CSS foil treatment that reacts to scroll and pointer.",
    preview: "foil",
  },
] as const;

const previewSurfaceClassName = "h-32 shrink-0 overflow-hidden rounded-lg";
const sparkChartPreviewData = Array.from({ length: 64 }, (_, index) => {
  const progress = index / 63;
  const envelope = Math.sin(progress * Math.PI);
  const trend = 8_790 + (12_478 - 8_790) * progress;
  const wave =
    Math.sin(progress * Math.PI * 5.4 + 0.45) * 420 +
    Math.sin(progress * Math.PI * 11.6 + 0.3) * 180;

  return {
    label: `${index + 1}`,
    value: index === 63 ? 12_478 : Number((trend + envelope * wave).toFixed(2)),
  };
});

function ExperimentPreview({
  type,
}: {
  type: (typeof experiments)[number]["preview"];
}) {
  if (type === "banner") {
    return (
      <ExperimentBannerPreview
        className={cn(
          previewSurfaceClassName,
          "relative bg-grayscale-3 [--worldcup-overlay:var(--color-grayscale-2)] dark:bg-grayscale-3 dark:[--worldcup-overlay:var(--color-grayscale-3)]",
        )}
      />
    );
  }

  if (type === "loading") {
    return (
      <div
        className={cn(
          previewSurfaceClassName,
          "bg-white [--game-of-life-color:var(--color-grayscale-3)] dark:bg-grayscale-3 dark:[--game-of-life-color:var(--color-grayscale-5)]",
        )}
      >
        <GameOfLife
          aria-hidden={false}
          aria-label="Animated Game of Life loading preview"
          cellRadius={3}
          cellSize={14}
          className="h-full w-full"
          density={0.28}
          fadeDuration={920}
          maxOpacity={1}
          role="img"
          stepInterval={620}
        />
      </div>
    );
  }

  if (type === "signature") {
    return (
      <div
        aria-hidden="true"
        className={cn(
          previewSurfaceClassName,
          "flex items-center justify-center bg-grayscale-2 px-5 text-grayscale-12 transition-colors group-hover:bg-grayscale-3 dark:bg-grayscale-3 dark:group-hover:bg-grayscale-4",
        )}
      >
        <div className="-rotate-6 w-44">
          <Signature
            ariaLabel="Animated signature preview"
            duration={2.4}
            strokeWidth={12}
          />
        </div>
      </div>
    );
  }

  if (type === "spark-chart") {
    return (
      <div
        aria-hidden="true"
        className={cn(
          previewSurfaceClassName,
          "flex items-center justify-center bg-grayscale-2 p-3 transition-colors group-hover:bg-grayscale-3 dark:bg-grayscale-2 dark:group-hover:bg-grayscale-3",
        )}
      >
        <AnimatedSparkChart
          className="w-52 border-grayscale-3 p-2 shadow-none dark:border-grayscale-5"
          data={sparkChartPreviewData}
          height={54}
          label="Revenue"
          trendPercent={42}
          valueFormat={{ maximumFractionDigits: 0 }}
          valuePrefix="$"
          width={320}
        />
      </div>
    );
  }

  if (type === "logo-loader") {
    return (
      <div
        aria-hidden="true"
        className={cn(
          previewSurfaceClassName,
          "flex items-center justify-center bg-grayscale-2 transition-colors group-hover:bg-grayscale-3 dark:bg-grayscale-3 dark:group-hover:bg-grayscale-4",
        )}
      >
        <LogoTraceLoader
          ariaLabel="Logo trace loader preview"
          loopDurationSeconds={0.72}
          showInnerTrace={false}
          size={54}
          strokeWidth={11}
        />
      </div>
    );
  }

  return (
    <IridescentFoil
      aria-label="Interactive iridescent foil sticker preview"
      className={cn(previewSurfaceClassName, "group cursor-pointer")}
      role="img"
      scrollProgressMode="document"
    />
  );
}

export function NewExperimentCta({ className }: NewExperimentCtaProps) {
  return (
    <section className={cn("flex flex-col gap-3", className)}>
      <div className="flex flex-col gap-px p-2">
        <h2 className="font-medium text-grayscale-11 text-sm">Experiments</h2>
        <p className="max-w-xl text-balance text-grayscale-10 text-sm">
          Small interface studies, animation patterns, and component demos.
        </p>
      </div>

      <div className="grid gap-1.5 rounded-[16px] border border-grayscale-3 bg-grayscale-2 p-1.5 sm:grid-cols-2 lg:grid-cols-3">
        <Link
          className="group flex min-h-64 flex-col overflow-hidden rounded-[13px] border border-grayscale-3 bg-grayscale-1 p-1 small-shadow transition-colors hover:border-grayscale-4 hover:bg-grayscale-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-grayscale-7 dark:border-grayscale-4 dark:bg-grayscale-3 dark:shadow-none dark:hover:border-grayscale-6 dark:hover:bg-grayscale-4 sm:col-span-2 lg:col-span-3"
          data-experiment-card=""
          href="/experiments/scramble-text"
          onClick={() =>
            posthog.capture("experiment_card_clicked", {
              experiment: "Scramble Text",
              href: "/experiments/scramble-text",
            })
          }
        >
          <div className="flex h-40 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-grayscale-2 p-4 dark:bg-grayscale-3 group-hover:bg-grayscale-3 dark:group-hover:bg-grayscale-4 transition-colors">
            <ScrambleTextShowcase interactive={false} />
          </div>

          <div className="mt-auto flex flex-col px-2 pt-4 pb-2">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 flex-col">
                <h3 className="font-medium text-grayscale-12 text-sm">
                  Scramble Text
                </h3>
              </div>
              <ArrowRightIcon
                aria-hidden="true"
                className="mt-0.5 shrink-0 text-grayscale-9 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-grayscale-11"
                size={15}
                weight="bold"
              />
            </div>
            <p className="mt-2 max-w-xl text-pretty text-grayscale-10 text-xs leading-5">
              A compact text component that reveals changed text through an
              encrypted scramble.
            </p>
          </div>
        </Link>

        {experiments.map((experiment) => (
          <Link
            className="group flex min-h-64 flex-col overflow-hidden rounded-[13px] border border-grayscale-3 bg-grayscale-1 p-1 small-shadow transition-colors hover:border-grayscale-4 hover:bg-grayscale-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-grayscale-7 dark:border-grayscale-4 dark:bg-grayscale-3 dark:shadow-none dark:hover:border-grayscale-6 dark:hover:bg-grayscale-4"
            data-experiment-card=""
            href={experiment.href}
            key={experiment.href}
            onClick={() =>
              posthog.capture("experiment_card_clicked", {
                experiment: experiment.title,
                href: experiment.href,
              })
            }
          >
            <ExperimentPreview type={experiment.preview} />

            <div className="mt-auto flex flex-col px-2 pt-4 pb-2">
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-medium text-grayscale-12 text-sm">
                  {experiment.title}
                </h3>
                <ArrowRightIcon
                  aria-hidden="true"
                  className="mt-0.5 shrink-0 text-grayscale-9 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-grayscale-11"
                  size={15}
                  weight="bold"
                />
              </div>
              <p className="mt-2 text-pretty text-grayscale-10 text-xs leading-5">
                {experiment.description}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
