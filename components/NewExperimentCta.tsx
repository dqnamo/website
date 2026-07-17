"use client";

import {
  ArrowRightIcon,
  CheckCircleIcon,
  CheckIcon,
  CopyIcon,
  FileArrowUpIcon,
  FileZipIcon,
  FloppyDiskIcon,
  PaperPlaneTiltIcon,
  TrashIcon,
} from "@phosphor-icons/react/dist/ssr";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Image from "next/image";
import Link from "next/link";
import posthog from "posthog-js";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { ScrambleTextShowcase } from "@/app/experiments/scramble-text/scramble-text-showcase";
import { IridescentFoil } from "@/components/IridescentFoil";
import { LogoTraceLoader } from "@/components/LogoTraceLoader";
import { PlayingCard } from "@/components/PlayingCard";
import { Signature } from "@/components/Signature";
import { cn } from "@/helpers/classname-helper";

type NewExperimentCtaProps = {
  className?: string;
};

const experiments = [
  {
    title: "Hold to Confirm",
    href: "/experiments/hold-to-confirm",
    description:
      "A deliberate action that fills while held, then offers a timed undo.",
    preview: "hold-to-confirm",
  },
  {
    title: "Magnetic Drop Zone",
    href: "/experiments/magnetic-drop-zone",
    description:
      "A file target that pulls toward an incoming drag before the file lands.",
    preview: "magnetic-drop-zone",
  },
  {
    title: "Dynamic Button",
    href: "/experiments/dynamic-button",
    description: "A button that smoothly resizes as its label animates.",
    preview: "dynamic-button",
  },
  {
    title: "Playing Cards",
    href: "/experiments/playing-cards",
    description:
      "A composable playing card, plus a fanned hand you can thumb through and play.",
    preview: "playing-cards",
  },
  {
    title: "Voice Dock",
    href: "/experiments/voice-dock",
    description:
      "A voice dock that expands into a live audio waveform as it listens.",
    preview: "voice-dock",
  },
  {
    title: "Scroll Fade List",
    href: "/experiments/scroll-fade-list",
    description: "A compact list surface with a soft overflow fade.",
    preview: "scroll-fade-list",
  },
  {
    title: "Advanced Model Selector",
    href: "/experiments/model-selector",
    description: "A benchmark-informed picker with model configuration.",
    preview: "model-selector",
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
const featuredPreviewSurfaceClassName =
  "h-40 shrink-0 overflow-hidden rounded-lg";
const experimentCardClassName =
  "group flex min-h-64 flex-col overflow-hidden rounded-[13px] border border-grayscale-3 bg-grayscale-1 p-1 small-shadow transition-colors hover:border-grayscale-4 hover:bg-grayscale-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-grayscale-7 dark:border-grayscale-4 dark:bg-grayscale-3 dark:shadow-none dark:hover:border-grayscale-6 dark:hover:bg-grayscale-4";
const [featuredExperiment, ...secondaryExperiments] = experiments;
const scrollPreviewItems = [
  ["🇿🇦", "South Africa"],
  ["🇨🇦", "Canada"],
  ["🇧🇷", "Brazil"],
  ["🇯🇵", "Japan"],
  ["🇩🇪", "Germany"],
  ["🇵🇾", "Paraguay"],
] as const;

const dynamicButtonPreviewStates = [
  {
    icon: FloppyDiskIcon,
    iconClassName: undefined,
    label: "Save",
    stateKey: "save",
  },
  {
    icon: CheckIcon,
    iconClassName: "text-green-9",
    label: "Saved",
    stateKey: "saved",
  },
  {
    icon: CopyIcon,
    iconClassName: undefined,
    label: "Copy invite link",
    stateKey: "copy",
  },
] as const;

type HoldPreviewPhase = "holding" | "idle" | "undo";

const holdPreviewSequence: Record<
  HoldPreviewPhase,
  { delay: number; next: HoldPreviewPhase }
> = {
  holding: { delay: 1600, next: "undo" },
  idle: { delay: 650, next: "holding" },
  undo: { delay: 2750, next: "idle" },
};

function DynamicButtonPreview({ featured = false }: { featured?: boolean }) {
  const shouldReduceMotion = useReducedMotion();
  const buttonRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const [index, setIndex] = useState(0);
  const [measuredWidth, setMeasuredWidth] = useState<number | null>(null);
  const state = dynamicButtonPreviewStates[index];
  const Icon = state.icon;

  const syncWidth = useCallback(() => {
    const button = buttonRef.current;
    const measure = measureRef.current;

    if (!button || !measure) {
      return;
    }

    const styles = window.getComputedStyle(button);
    const horizontalPadding =
      Number.parseFloat(styles.paddingLeft) +
      Number.parseFloat(styles.paddingRight) +
      Number.parseFloat(styles.borderLeftWidth) +
      Number.parseFloat(styles.borderRightWidth);
    const nextWidth = Math.ceil(measure.scrollWidth + horizontalPadding);

    setMeasuredWidth((currentWidth) =>
      currentWidth === nextWidth ? currentWidth : nextWidth,
    );
  }, []);

  useEffect(() => {
    if (shouldReduceMotion) {
      return;
    }

    const interval = window.setInterval(() => {
      setIndex((currentIndex) => {
        return (currentIndex + 1) % dynamicButtonPreviewStates.length;
      });
    }, 1450);

    return () => window.clearInterval(interval);
  }, [shouldReduceMotion]);

  useLayoutEffect(() => {
    const measure = measureRef.current;

    if (!measure) {
      return;
    }

    syncWidth();

    const observer = new ResizeObserver(syncWidth);
    observer.observe(measure);
    window.addEventListener("resize", syncWidth);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", syncWidth);
    };
  }, [syncWidth]);

  useLayoutEffect(() => {
    syncWidth();
  });

  return (
    <div
      aria-hidden="true"
      className={cn(
        featured ? featuredPreviewSurfaceClassName : previewSurfaceClassName,
        "flex items-center justify-center bg-grayscale-2 p-3 transition-colors group-hover:bg-grayscale-3 dark:bg-grayscale-2 dark:group-hover:bg-grayscale-3",
      )}
    >
      <motion.div
        animate={{ width: measuredWidth ?? "auto" }}
        className="relative inline-flex h-8 items-center justify-center gap-1.5 overflow-hidden whitespace-nowrap rounded-lg border border-grayscale-12 bg-grayscale-12 px-3 font-medium text-grayscale-2 text-xs dark:border-grayscale-6 dark:bg-grayscale-5 dark:text-grayscale-11"
        ref={buttonRef}
        transition={
          shouldReduceMotion
            ? { width: { duration: 0 } }
            : { width: { bounce: 0, duration: 0.32, type: "spring" } }
        }
      >
        <span className="relative inline-grid size-[15px] shrink-0 overflow-hidden">
          <AnimatePresence initial={false} mode="popLayout">
            <motion.span
              animate={{ opacity: 1, y: 0 }}
              className="col-start-1 row-start-1 flex size-[15px] items-center justify-center"
              exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -8 }}
              initial={
                shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }
              }
              key={state.stateKey}
              transition={{ duration: shouldReduceMotion ? 0 : 0.18 }}
            >
              <Icon
                aria-hidden="true"
                className={state.iconClassName}
                size={15}
                weight="bold"
              />
            </motion.span>
          </AnimatePresence>
        </span>
        <span className="relative inline-grid overflow-hidden whitespace-nowrap">
          <AnimatePresence initial={false} mode="popLayout">
            <motion.span
              animate={{ opacity: 1, y: 0 }}
              className="col-start-1 row-start-1 block"
              exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -8 }}
              initial={
                shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }
              }
              key={state.label}
              transition={{ duration: shouldReduceMotion ? 0 : 0.18 }}
            >
              {state.label}
            </motion.span>
          </AnimatePresence>
        </span>
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inline-flex items-center gap-1.5 opacity-0"
          ref={measureRef}
        >
          <span className="flex size-[15px] shrink-0 items-center justify-center">
            <Icon
              aria-hidden="true"
              className={state.iconClassName}
              size={15}
              weight="bold"
            />
          </span>
          <span>{state.label}</span>
        </span>
      </motion.div>
    </div>
  );
}

function MagneticDropZonePreview({ featured = false }: { featured?: boolean }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        featured ? featuredPreviewSurfaceClassName : previewSurfaceClassName,
        "relative flex items-center justify-center bg-grayscale-2 p-4 transition-colors group-hover:bg-blue-2 dark:bg-grayscale-2 dark:group-hover:bg-blue-2",
      )}
    >
      <div className="absolute top-3 right-[12%] z-10 flex rotate-6 items-center gap-1.5 rounded-lg border border-grayscale-4 bg-grayscale-1 p-1.5 pr-2 shadow-sm transition-transform duration-300 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)] group-hover:-translate-x-8 group-hover:translate-y-8 group-hover:rotate-2 dark:border-grayscale-6 dark:bg-grayscale-3">
        <div className="flex size-6 items-center justify-center rounded-md bg-amber-3 text-amber-11 dark:bg-amber-4">
          <FileZipIcon size={13} weight="fill" />
        </div>
        <span className="font-medium text-[10px] text-grayscale-11">
          assets.zip
        </span>
      </div>
      <div className="flex h-24 w-full max-w-60 translate-y-2 flex-col items-center justify-center rounded-xl border border-grayscale-4 bg-grayscale-1 shadow-sm transition-[transform,border-color,background-color] duration-300 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)] group-hover:translate-x-1 group-hover:translate-y-1 group-hover:scale-[1.02] group-hover:border-blue-7 group-hover:bg-blue-3/50 dark:border-grayscale-5 dark:bg-grayscale-3">
        <FileArrowUpIcon
          className="text-grayscale-10 transition-colors duration-200 group-hover:text-blue-11"
          size={19}
          weight="fill"
        />
        <span className="mt-1.5 font-medium text-[10px] text-grayscale-10">
          Drop a file here
        </span>
      </div>
    </div>
  );
}

function HoldToConfirmPreview({ featured = false }: { featured?: boolean }) {
  const shouldReduceMotion = useReducedMotion();
  const [phase, setPhase] = useState<HoldPreviewPhase>("idle");

  useEffect(() => {
    if (shouldReduceMotion) {
      return;
    }

    const { delay, next } = holdPreviewSequence[phase];
    const timer = window.setTimeout(() => setPhase(next), delay);

    return () => window.clearTimeout(timer);
  }, [phase, shouldReduceMotion]);

  return (
    <div
      aria-hidden="true"
      className={cn(
        featured ? featuredPreviewSurfaceClassName : previewSurfaceClassName,
        "flex items-center justify-center bg-grayscale-2 p-4 transition-colors group-hover:bg-grayscale-3 dark:bg-grayscale-2 dark:group-hover:bg-grayscale-3",
      )}
    >
      <AnimatePresence initial={false} mode="wait">
        {phase === "undo" ? (
          <motion.div
            animate={{ opacity: 1, transform: "translateY(0px)" }}
            className="flex h-9 min-w-60 items-center justify-between gap-3 rounded-xl bg-grayscale-1 p-1 pl-3 text-xs shadow-sm dark:bg-grayscale-4"
            exit={{
              opacity: 0,
              transform: "translateY(-4px)",
              transition: { duration: 0.12, ease: [0.23, 1, 0.32, 1] },
            }}
            initial={{ opacity: 0, transform: "translateY(4px)" }}
            key="undo-preview"
            transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
          >
            <span className="flex items-center gap-1.5 font-medium text-grayscale-12">
              <CheckCircleIcon
                className="text-green-9"
                size={15}
                weight="fill"
              />
              Project deleted
            </span>
            <div className="relative isolate flex h-7 min-w-18 items-center justify-center overflow-hidden rounded-lg border border-grayscale-4 bg-grayscale-1 px-2 font-medium text-grayscale-11 dark:border-grayscale-6 dark:bg-grayscale-3">
              <span>Undo</span>
              <motion.span
                animate={{ clipPath: "inset(0 100% 0 0)" }}
                className="absolute inset-0 flex items-center justify-center bg-grayscale-12 px-2 text-grayscale-1"
                initial={{ clipPath: "inset(0 0 0 0)" }}
                transition={{ duration: 2.75, ease: "linear" }}
              >
                Undo
              </motion.span>
            </div>
          </motion.div>
        ) : (
          <motion.div
            animate={{ opacity: 1, transform: "translateY(0px)" }}
            className="relative isolate flex h-9 min-w-44 items-center justify-center overflow-hidden rounded-lg border border-red-9 bg-red-3 px-3 font-medium text-red-11 text-xs transition-[border-color,background-color,color] duration-150 dark:bg-red-4"
            exit={{
              opacity: 0,
              transform: "translateY(-4px)",
              transition: { duration: 0.12, ease: [0.23, 1, 0.32, 1] },
            }}
            initial={{ opacity: 0, transform: "translateY(4px)" }}
            key="hold-preview"
            transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
          >
            <span className="relative flex items-center gap-1.5">
              <TrashIcon size={14} weight="bold" />
              Hold to delete
            </span>
            <motion.span
              animate={{
                clipPath:
                  phase === "holding" ? "inset(0 0 0 0)" : "inset(0 100% 0 0)",
              }}
              className="absolute inset-0 flex items-center justify-center gap-1.5 bg-red-9 px-3 text-white"
              transition={{
                duration: phase === "holding" ? 1.6 : 0.18,
                ease: phase === "holding" ? "linear" : [0.23, 1, 0.32, 1],
              }}
            >
              <TrashIcon size={14} weight="bold" />
              Hold to delete
            </motion.span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ExperimentPreview({
  featured = false,
  type,
}: {
  featured?: boolean;
  type: (typeof experiments)[number]["preview"];
}) {
  if (type === "hold-to-confirm") {
    return <HoldToConfirmPreview featured={featured} />;
  }

  if (type === "magnetic-drop-zone") {
    return <MagneticDropZonePreview featured={featured} />;
  }

  if (type === "dynamic-button") {
    return <DynamicButtonPreview featured={featured} />;
  }

  if (type === "playing-cards") {
    return (
      <div
        aria-hidden="true"
        className={cn(
          previewSurfaceClassName,
          "relative bg-grayscale-2 transition-colors group-hover:bg-grayscale-3 dark:bg-grayscale-2 dark:group-hover:bg-grayscale-3",
        )}
      >
        <div className="-translate-x-1/2 absolute bottom-[-26px] left-1/2">
          <div className="-rotate-[14deg] absolute bottom-0 left-[-58px] origin-bottom transition-transform duration-300 group-hover:-rotate-[18deg] group-hover:-translate-y-1">
            <PlayingCard rank="7" suit="clubs" width={64} />
          </div>
          <div className="absolute bottom-1 left-[-32px] origin-bottom transition-transform duration-300 group-hover:-translate-y-2">
            <PlayingCard rank="Q" suit="hearts" width={64} />
          </div>
          <div className="absolute bottom-0 left-[-6px] origin-bottom rotate-[14deg] transition-transform duration-300 group-hover:-translate-y-1 group-hover:rotate-[18deg]">
            <PlayingCard rank="A" suit="spades" width={64} />
          </div>
        </div>
      </div>
    );
  }

  if (type === "voice-dock") {
    const waveformBars = [
      0.35, 0.6, 0.85, 0.5, 0.95, 0.7, 0.4, 0.75, 1, 0.55, 0.8, 0.45, 0.65, 0.9,
      0.5, 0.7, 0.38, 0.6,
    ];

    return (
      <div
        aria-hidden="true"
        className={cn(
          previewSurfaceClassName,
          "flex items-center justify-center bg-grayscale-2 p-3 transition-colors group-hover:bg-grayscale-3 dark:bg-grayscale-2 dark:group-hover:bg-grayscale-3",
        )}
      >
        <div className="w-full max-w-[13.25rem] overflow-hidden rounded-[13px] border border-grayscale-12 bg-grayscale-12 p-1.5 text-grayscale-2 shadow-[0_10px_28px_rgba(0,0,0,0.12)] dark:border-grayscale-4 dark:bg-grayscale-4 dark:text-grayscale-12 dark:shadow-none">
          <div className="mb-1.5 flex h-8 items-center gap-[3px] rounded-[8px] bg-grayscale-11/25 px-2 dark:bg-grayscale-3/60">
            {waveformBars.map((height, index) => (
              <span
                className="w-[3px] shrink-0 rounded-full bg-accent-9"
                // biome-ignore lint/suspicious/noArrayIndexKey: static decorative bars
                key={index}
                style={{ height: `${Math.round(height * 100)}%` }}
              />
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            <Image
              alt=""
              aria-hidden="true"
              className="size-7 shrink-0 rounded-[9px]"
              height={28}
              src="https://api.dicebear.com/10.x/initial-face/svg?seed=Aria&size=80"
              unoptimized
              width={28}
            />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-[10px] leading-none">
                Aria
              </p>
              <p className="mt-1 truncate text-[8px] text-grayscale-8 leading-none dark:text-grayscale-10">
                Listening...
              </p>
            </div>
            <div className="flex h-6 items-center gap-1 rounded-[7px] bg-grayscale-11/60 px-1 font-medium text-[8px] leading-none dark:bg-grayscale-6">
              <MicrophoneIcon size={11} weight="bold" />
              <span>Stop</span>
              <span className="flex size-4 items-center justify-center rounded-[4px] bg-grayscale-11/55 font-mono font-semibold text-[8px] text-grayscale-1 dark:bg-grayscale-7 dark:text-grayscale-12">
                V
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (type === "scroll-fade-list") {
    return (
      <div
        aria-hidden="true"
        className={cn(
          previewSurfaceClassName,
          "flex items-center justify-center bg-grayscale-2 p-3 transition-colors group-hover:bg-grayscale-3 dark:bg-grayscale-2 dark:group-hover:bg-grayscale-3",
        )}
      >
        <div className="relative h-full w-44 overflow-hidden rounded-[12px] border border-grayscale-3 bg-grayscale-1 p-1 dark:border-grayscale-5 dark:bg-grayscale-3">
          <div className="absolute inset-x-1 top-1 z-10 h-7 bg-linear-to-b from-grayscale-1 to-transparent dark:from-grayscale-3" />
          <div className="absolute inset-x-1 bottom-1 z-10 h-8 bg-linear-to-b from-transparent to-grayscale-1 dark:to-grayscale-3" />
          <div className="flex flex-col gap-1">
            {scrollPreviewItems.map(([flag, name]) => (
              <div
                className="flex h-7 items-center gap-2 rounded-md px-2 text-grayscale-12 text-xs"
                key={name}
              >
                <span className="text-sm leading-none">{flag}</span>
                <span className="truncate font-medium">{name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (type === "model-selector") {
    return (
      <div
        aria-hidden="true"
        className={cn(
          previewSurfaceClassName,
          "flex items-center justify-center bg-grayscale-2 p-3 transition-colors group-hover:bg-grayscale-3 dark:bg-grayscale-2 dark:group-hover:bg-grayscale-3",
        )}
      >
        <div className="flex h-full w-full max-w-68 flex-col rounded-xl border border-grayscale-3 bg-white p-2 dark:border-grayscale-5 dark:bg-grayscale-3">
          <div className="min-h-0 flex-1 rounded-lg bg-white px-1 pt-1 dark:bg-grayscale-3">
            <p className="truncate font-medium text-[11px] text-grayscale-9 leading-none">
              What do you want to do?
            </p>
          </div>
          <div className="mt-2 flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-1.5 rounded-lg border border-grayscale-3 bg-white px-2 py-1.5 dark:border-grayscale-5 dark:bg-grayscale-4">
              <Image
                alt=""
                aria-hidden="true"
                className="size-3 shrink-0 object-contain"
                height={14}
                src="/logos/model-selector/anthropic.png"
                width={14}
              />
              <span className="truncate font-medium text-grayscale-12 text-xs">
                Claude Fable 5
              </span>
            </div>
            <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-grayscale-12 text-grayscale-1 dark:bg-grayscale-5 dark:text-grayscale-12">
              <PaperPlaneTiltIcon size={13} weight="fill" />
            </div>
          </div>
        </div>
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

function ExperimentCard({
  className,
  experiment,
  featured = false,
}: {
  className?: string;
  experiment: (typeof experiments)[number];
  featured?: boolean;
}) {
  return (
    <Link
      className={cn(experimentCardClassName, className)}
      data-experiment-card=""
      href={experiment.href}
      onClick={() =>
        posthog.capture("experiment_card_clicked", {
          experiment: experiment.title,
          href: experiment.href,
        })
      }
    >
      <ExperimentPreview featured={featured} type={experiment.preview} />

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
        <ExperimentCard
          className="sm:col-span-2 lg:col-span-3"
          experiment={featuredExperiment}
          featured
        />

        <Link
          className={experimentCardClassName}
          data-experiment-card=""
          href="/experiments/scramble-text"
          onClick={() =>
            posthog.capture("experiment_card_clicked", {
              experiment: "Scramble Text",
              href: "/experiments/scramble-text",
            })
          }
        >
          <div className="flex h-32 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-grayscale-2 p-4 transition-colors group-hover:bg-grayscale-3 dark:bg-grayscale-3 dark:group-hover:bg-grayscale-4">
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

        {secondaryExperiments.map((experiment) => (
          <ExperimentCard experiment={experiment} key={experiment.href} />
        ))}
      </div>
    </section>
  );
}
