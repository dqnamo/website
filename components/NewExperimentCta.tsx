"use client";

import {
  ArrowCounterClockwiseIcon,
  ArrowRightIcon,
  CheckCircleIcon,
  CheckIcon,
  CopyIcon,
  FileArrowUpIcon,
  FileZipIcon,
  FloppyDiskIcon,
  PaperPlaneTiltIcon,
  PlayIcon,
  SpeakerHighIcon,
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
import { experiments } from "@/components/experiment-catalog";
import { GoldenTicket } from "@/components/GoldenTicket";
import { IridescentFoil } from "@/components/IridescentFoil";
import { LogoTraceLoader } from "@/components/LogoTraceLoader";
import { PaperBurn } from "@/components/PaperBurn";
import { PlayingCard } from "@/components/PlayingCard";
import { ReceiptPrinter } from "@/components/ReceiptPrinter";
import { Signature } from "@/components/Signature";
import { Stamp } from "@/components/Stamp";
import { tactileButtonColorTokens } from "@/components/TactileButton";
import { Ticket } from "@/components/Ticket";
import { cn } from "@/helpers/classname-helper";

type NewExperimentCtaProps = {
  className?: string;
};

const previewSurfaceClassName = "h-32 shrink-0 overflow-hidden rounded-lg";
const featuredPreviewSurfaceClassName =
  "h-40 shrink-0 overflow-hidden rounded-lg";
const playingCardPreviewClassName =
  "shadow-[0_2px_8px_rgba(0,0,0,0.035),0_14px_30px_rgba(0,0,0,0.055)]";
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
const CASSETTE_PREVIEW_REEL_SPOKES = [0, 60, 120, 180, 240, 300] as const;

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

function PaperBurnPreview({ featured = false }: { featured?: boolean }) {
  const [active, setActive] = useState(false);
  const cycleTimerRef = useRef<number | null>(null);

  const clearCycleTimer = useCallback(() => {
    if (cycleTimerRef.current !== null) {
      window.clearTimeout(cycleTimerRef.current);
      cycleTimerRef.current = null;
    }
  }, []);

  const queueBurn = useCallback(
    (delay: number) => {
      clearCycleTimer();
      cycleTimerRef.current = window.setTimeout(() => setActive(true), delay);
    },
    [clearCycleTimer],
  );

  useEffect(() => {
    queueBurn(700);
    return clearCycleTimer;
  }, [clearCycleTimer, queueBurn]);

  const handleBurnComplete = useCallback(() => {
    clearCycleTimer();
    cycleTimerRef.current = window.setTimeout(() => {
      setActive(false);
      queueBurn(2300);
    }, 420);
  }, [clearCycleTimer, queueBurn]);

  return (
    <div
      aria-hidden="true"
      className={cn(
        featured ? featuredPreviewSurfaceClassName : previewSurfaceClassName,
        "flex items-center justify-center overflow-hidden bg-grayscale-2 px-5 transition-colors group-hover:bg-grayscale-3 dark:bg-grayscale-3 dark:group-hover:bg-grayscale-4",
      )}
    >
      <PaperBurn
        active={active}
        className={cn("w-44", featured && "w-56")}
        duration={800}
        onBurnComplete={handleBurnComplete}
      >
        <div className="-rotate-1 border border-[#d8cfbd] bg-[#f3eddf] px-5 py-4 text-[#352f29] shadow-[0_8px_24px_rgba(55,42,25,0.12)]">
          <p className="font-mono font-semibold text-[6px] uppercase tracking-[0.18em] opacity-45">
            Private note
          </p>
          <p className="mt-3 font-pirata text-xl leading-none">
            Burn after reading.
          </p>
        </div>
      </PaperBurn>
    </div>
  );
}

function TactileButtonPreview({ featured = false }: { featured?: boolean }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        featured ? featuredPreviewSurfaceClassName : previewSurfaceClassName,
        "relative grid place-items-center overflow-hidden bg-grayscale-2 transition-colors group-hover:bg-grayscale-3 dark:bg-grayscale-2 dark:group-hover:bg-grayscale-3",
      )}
    >
      <span
        className="group/tactile relative block h-[38px] w-max cursor-pointer"
        style={tactileButtonColorTokens}
      >
        <span className="absolute inset-x-0 top-[6px] h-8 rounded-xl bg-[var(--tactile-base)] shadow-[inset_0_-1px_0_var(--tactile-base-shadow)]" />
        <span className="relative flex h-8 items-center justify-center gap-1.5 rounded-xl bg-[var(--tactile-face)] px-3 font-medium text-[var(--tactile-content)] text-xs shadow-[inset_0_1px_0_var(--tactile-face-highlight)] transition-transform duration-150 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)] [@media(hover:hover)_and_(pointer:fine)]:group-hover/tactile:translate-y-0.5 group-active/tactile:translate-y-[6px] motion-reduce:transform-none motion-reduce:transition-none">
          <span>Continue</span>
          <ArrowRightIcon aria-hidden="true" size={14} weight="bold" />
        </span>
      </span>
    </div>
  );
}

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
          aria-hidden={true}
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

function ReceiptPrinterPreview({ featured = false }: { featured?: boolean }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        featured ? featuredPreviewSurfaceClassName : previewSurfaceClassName,
        "relative overflow-hidden bg-grayscale-2 px-4 transition-colors group-hover:bg-grayscale-3 dark:bg-grayscale-2 dark:group-hover:bg-grayscale-3",
      )}
    >
      <div
        className={cn(
          "absolute inset-x-0 bottom-2 mx-auto w-40 transition-transform duration-200 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)] [@media(hover:hover)_and_(pointer:fine)]:group-hover:-translate-y-0.5 motion-reduce:transform-none motion-reduce:transition-none",
          featured && "w-48",
        )}
      >
        <ReceiptPrinter.Paper
          className={cn(
            "flex h-44 min-h-0 flex-col px-4 pt-4 pb-5 drop-shadow-lg",
            featured && "h-52 px-5 pt-5",
          )}
        >
          <span className="mx-auto block aspect-square w-7 bg-current opacity-85 [-webkit-mask-image:url('/images/receipt-printer-logo.png')] [-webkit-mask-position:center] [-webkit-mask-repeat:no-repeat] [-webkit-mask-size:contain] [mask-image:url('/images/receipt-printer-logo.png')] [mask-position:center] [mask-repeat:no-repeat] [mask-size:contain]" />

          <div className="my-2 border-current/20 border-t border-dashed" />

          <div className="flex items-start justify-between gap-3 text-[6px] leading-3">
            <div>
              <p className="font-bold uppercase tracking-[0.08em]">Pro plan</p>
              <p className="opacity-50">Annual subscription</p>
            </div>
            <span className="font-bold text-[8px]">£192.00</span>
          </div>

          <div className="mt-auto flex items-end justify-between border-current/20 border-t border-dashed pt-2 font-bold uppercase">
            <span className="text-[6px] tracking-[0.08em]">Total paid</span>
            <span className="text-[10px] tracking-[-0.04em]">£230.40</span>
          </div>

          <div className="mx-auto mt-2 h-3 w-20 bg-[repeating-linear-gradient(90deg,currentColor_0_1px,transparent_1px_3px,currentColor_3px_5px,transparent_5px_7px)] opacity-80" />
        </ReceiptPrinter.Paper>
      </div>
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

function CassettePreviewReel({ className }: { className: string }) {
  return (
    <div
      className={cn(
        "absolute top-1/2 z-3 aspect-square w-[78cqh] -translate-x-1/2 -translate-y-1/2",
        className,
      )}
    >
      <svg
        aria-hidden="true"
        className="absolute inset-0 origin-center rounded-full transition-transform duration-500 group-hover:rotate-180"
        viewBox="0 0 100 100"
      >
        <circle className="fill-grayscale-1" cx="50" cy="50" r="48" />
        {CASSETTE_PREVIEW_REEL_SPOKES.map((rotation) => (
          <path
            className="fill-[#1b1a18] stroke-[#11100f] [filter:drop-shadow(0_1px_1px_rgba(0,0,0,0.32))] [stroke-linejoin:round] [stroke-width:1.25]"
            d="M46 3h8v9a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2z"
            key={rotation}
            transform={`rotate(${rotation} 50 50)`}
          />
        ))}
        <circle
          className="fill-none stroke-[#1b1a18] [stroke-width:3]"
          cx="50"
          cy="50"
          r="48"
        />
      </svg>
    </div>
  );
}

function CassettePreviewScrew({ className }: { className: string }) {
  const slotClassName =
    "absolute top-1/2 right-[18%] left-[18%] h-[14%] -translate-y-1/2 rounded-full bg-[#1d1d1b] shadow-[inset_0_1px_1px_rgba(0,0,0,0.82),0_1px_rgba(255,255,255,0.1)]";

  return (
    <div
      className={cn(
        "absolute z-10 aspect-square w-[3.3%] rounded-full border border-[#060606] bg-[radial-gradient(circle_at_36%_30%,#5f5f5c,#30302e_48%,#171716_78%)] shadow-[inset_0_1px_1px_rgba(255,255,255,0.26),0_1px_1px_rgba(0,0,0,0.38)]",
        className,
      )}
    >
      <span className={cn(slotClassName, "rotate-45")} />
      <span className={cn(slotClassName, "-rotate-45")} />
    </div>
  );
}

function CassettePlayerPreview({ featured = false }: { featured?: boolean }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        featured ? featuredPreviewSurfaceClassName : previewSurfaceClassName,
        "relative bg-grayscale-1 transition-colors group-hover:bg-grayscale-2 dark:bg-grayscale-2 dark:group-hover:bg-grayscale-3",
      )}
    >
      <div
        className={cn(
          "absolute top-4 left-[7%] aspect-[1.58] w-[26rem] overflow-hidden rounded-[18px] border border-[#050505] bg-[linear-gradient(165deg,#373735_0%,#20201f_52%,#0e0e0d_100%)] shadow-[0_18px_32px_rgba(0,0,0,0.22),inset_0_2px_1px_rgba(255,255,255,0.2),inset_0_-3px_3px_rgba(0,0,0,0.74)] transition-transform duration-200 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)] [@media(hover:hover)_and_(pointer:fine)]:group-hover:-translate-x-0.5 [@media(hover:hover)_and_(pointer:fine)]:group-hover:-translate-y-0.5 motion-reduce:transform-none motion-reduce:transition-none",
          featured && "top-5 left-[8%] w-[31rem]",
        )}
      >
        <div className="pointer-events-none absolute inset-1.5 rounded-[13px] border border-white/[0.12] shadow-[inset_0_0_0_1px_rgba(0,0,0,0.62)]" />
        <div className="pointer-events-none absolute inset-0 bg-[url('/textures/plastic-noise.svg')] bg-[length:180px_180px] bg-repeat opacity-35 mix-blend-multiply" />

        <CassettePreviewScrew className="top-[4%] left-[2.53%]" />
        <CassettePreviewScrew className="top-[4%] right-[2.53%]" />
        <CassettePreviewScrew className="bottom-[4%] left-[2.53%]" />
        <CassettePreviewScrew className="right-[2.53%] bottom-[4%]" />

        <div className="absolute top-[9.5%] right-[8.5%] bottom-[24%] left-[8.5%] overflow-hidden rounded-[5px] border-2 border-grayscale-2 bg-grayscale-1 text-grayscale-12 dark:border-[#dc2626] dark:bg-[#dc2626] dark:text-white">
          <div className="relative z-10 mx-[5%] mt-[5%] flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-bold font-mono text-[5px] uppercase leading-none tracking-[0.12em] opacity-80">
                Archive 11
              </p>
              <p className="mt-1 truncate font-semibold text-[9px] leading-none tracking-[-0.04em] sm:text-[10px]">
                One Small Step
              </p>
            </div>
            <div className="grid shrink-0 justify-items-end gap-1 font-bold font-mono text-[4px] uppercase leading-none tracking-[0.08em]">
              <span className="rounded-full bg-grayscale-12 px-1.5 py-1 text-grayscale-1 dark:bg-white dark:text-[#dc2626]">
                Side A
              </span>
              <span className="opacity-65">200769</span>
            </div>
          </div>

          <div className="absolute inset-x-0 top-[43%] grid h-[27%] grid-rows-3 gap-px">
            <span className="bg-green-500 dark:bg-white" />
            <span className="bg-teal-500 dark:bg-white" />
            <span className="bg-blue-500 dark:bg-white" />
          </div>

          <div className="absolute inset-x-[17.5%] top-[39%] h-[34%] overflow-hidden rounded-full border border-[#11100f] bg-[#1b1a18] shadow-[0_0_0_2px_rgba(37,33,29,0.18),inset_0_2px_4px_rgba(0,0,0,0.72)] [container-type:size]">
            <div className="absolute inset-y-[14%] right-[29%] left-[29%] rounded-[2px] border border-[#11100f] bg-[#393631] shadow-[inset_0_2px_3px_rgba(0,0,0,0.65)]" />
            <CassettePreviewReel className="left-[50cqh]" />
            <CassettePreviewReel className="left-[calc(100%-50cqh)]" />
          </div>

          <div className="absolute right-[5%] bottom-[7%] left-[5%]">
            <div className="h-px overflow-hidden rounded-full bg-grayscale-12/30 dark:bg-white/35">
              <div className="h-full w-[28%] rounded-full bg-grayscale-12 dark:bg-white" />
            </div>
            <div className="mt-1 flex justify-between font-mono text-[4px] tabular-nums opacity-75">
              <span>0:03</span>
              <span>0:13</span>
            </div>
          </div>
        </div>

        <div className="absolute right-[27%] bottom-[3.5%] left-[27%] grid h-[16%] grid-cols-[1fr_auto_1fr] place-items-center gap-1 bg-grayscale-10/20 px-[12%] shadow-[inset_0_2px_4px_rgba(0,0,0,0.45)] [clip-path:polygon(13%_0,87%_0,100%_100%,0_100%)]">
          <span className="grid size-3 place-items-center rounded-full border border-grayscale-8 bg-grayscale-9 text-white sm:size-3.5">
            <ArrowCounterClockwiseIcon aria-hidden size={6} weight="bold" />
          </span>
          <span className="grid size-4 place-items-center rounded-full border border-grayscale-8 bg-grayscale-9 text-white sm:size-[18px]">
            <PlayIcon aria-hidden size={7} weight="fill" />
          </span>
          <span className="grid size-3 place-items-center rounded-full border border-grayscale-8 bg-grayscale-9 text-white sm:size-3.5">
            <SpeakerHighIcon aria-hidden size={6} weight="bold" />
          </span>
        </div>
      </div>
    </div>
  );
}

export function ExperimentPreview({
  featured = false,
  type,
}: {
  featured?: boolean;
  type: (typeof experiments)[number]["preview"];
}) {
  if (type === "paper-burn") {
    return <PaperBurnPreview featured={featured} />;
  }

  if (type === "tactile-button") {
    return <TactileButtonPreview featured={featured} />;
  }

  if (type === "receipt-printer") {
    return <ReceiptPrinterPreview featured={featured} />;
  }

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
            <PlayingCard
              className={playingCardPreviewClassName}
              rank="7"
              suit="clubs"
              width={64}
            />
          </div>
          <div className="absolute bottom-1 left-[-32px] origin-bottom transition-transform duration-300 group-hover:-translate-y-2">
            <PlayingCard
              className={playingCardPreviewClassName}
              rank="Q"
              suit="hearts"
              width={64}
            />
          </div>
          <div className="absolute bottom-0 left-[-6px] origin-bottom rotate-[14deg] transition-transform duration-300 group-hover:-translate-y-1 group-hover:rotate-[18deg]">
            <PlayingCard
              className={playingCardPreviewClassName}
              rank="A"
              suit="spades"
              width={64}
            />
          </div>
        </div>
      </div>
    );
  }

  if (type === "cassette-player") {
    return <CassettePlayerPreview featured={featured} />;
  }

  if (type === "ticket") {
    return (
      <div
        aria-hidden="true"
        className={cn(
          previewSurfaceClassName,
          "flex items-center justify-center bg-grayscale-2 transition-colors group-hover:bg-grayscale-3 dark:bg-grayscale-2 dark:group-hover:bg-grayscale-3",
        )}
      >
        <Ticket
          aria-hidden={true}
          body={
            <div className="flex h-full flex-col justify-between p-2">
              <div className="h-10 w-full bg-[radial-gradient(circle,currentColor_0_1px,transparent_1.5px)] bg-size-[7px_7px] opacity-70" />
              <span className="font-bold text-[6px] uppercase leading-[0.85] tracking-[-0.06em]">
                Optical
                <br />
                Signals
              </span>
            </div>
          }
          className="h-[116px] w-[54px] aspect-auto"
          cornerSize={4}
          notchSize={6}
          stub={
            <div className="flex h-full items-end p-2">
              <div className="h-2.5 w-full bg-[repeating-linear-gradient(90deg,currentColor_0_1px,transparent_1px_3px)]" />
            </div>
          }
          stubHeight={29}
          tilt={false}
        />
      </div>
    );
  }

  if (type === "golden-ticket" || type === "waitlist-ticket") {
    return (
      <div
        aria-hidden="true"
        className={cn(
          previewSurfaceClassName,
          "relative flex items-center justify-center overflow-hidden bg-[#160f08] px-4",
        )}
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(199,135,30,0.22),transparent_58%)]" />
        <GoldenTicket
          aria-hidden="true"
          className="w-full max-w-[14rem] transition-transform duration-300 group-hover:scale-[1.025]"
        />
      </div>
    );
  }

  if (type === "stamp") {
    return (
      <div
        aria-hidden="true"
        className={cn(
          previewSurfaceClassName,
          "flex items-center justify-center bg-grayscale-2 transition-colors group-hover:bg-grayscale-3 dark:bg-grayscale-2 dark:group-hover:bg-grayscale-3",
        )}
      >
        <Stamp
          aria-hidden={true}
          className="w-[78px]"
          horizontalPerforations={10}
          padding={5}
          perforationDepth={3.3}
          verticalPerforations={13}
        >
          <Image
            alt=""
            className="object-cover [image-rendering:pixelated]"
            fill
            sizes="68px"
            src="/experiments/stamp/retro-landscape.png"
          />
        </Stamp>
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
    <section className={cn("flex flex-col gap-3", className)} id="experiments">
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
