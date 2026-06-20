import { ArrowRightIcon } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { ExperimentBannerPreview } from "@/components/ExperimentBannerPreview";
import { IridescentFoil } from "@/components/IridescentFoil";
import { GameOfLife } from "@/components/random/GameOfLife";
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
    title: "Iridescent Foil",
    href: "/experiments/iridescent-foil",
    description:
      "A layered CSS foil treatment that reacts to scroll and pointer.",
    preview: "foil",
  },
] as const;

const previewSurfaceClassName = "h-32 overflow-hidden rounded-lg";

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
      <GameOfLife
        aria-hidden={false}
        aria-label="Animated Game of Life loading preview"
        cellRadius={3}
        cellSize={14}
        className={cn(
          previewSurfaceClassName,
          "bg-white [--game-of-life-color:var(--color-grayscale-3)] dark:bg-grayscale-3 dark:[--game-of-life-color:var(--color-grayscale-5)]",
        )}
        density={0.28}
        fadeDuration={920}
        maxOpacity={1}
        role="img"
        stepInterval={620}
      />
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

      <div className="grid gap-1.5 rounded-[16px] border border-grayscale-3 bg-grayscale-2 p-1.5 sm:grid-cols-3">
        {experiments.map((experiment) => (
          <Link
            className="group flex min-h-64 flex-col overflow-hidden rounded-[13px] border border-grayscale-3 bg-grayscale-1 p-1 small-shadow transition-colors hover:border-grayscale-4 hover:bg-grayscale-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-grayscale-7 dark:border-grayscale-4 dark:bg-grayscale-3 dark:shadow-none dark:hover:border-grayscale-6 dark:hover:bg-grayscale-4"
            data-experiment-card=""
            href={experiment.href}
            key={experiment.href}
          >
            <ExperimentPreview type={experiment.preview} />

            <div className="mt-4 flex flex-1 flex-col px-2 pb-2">
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
