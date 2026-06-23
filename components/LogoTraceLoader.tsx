"use client";

import { motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/helpers/classname-helper";

type LogoTraceLoaderProps = {
  loading?: boolean;
  isComplete?: boolean;
  size?: number;
  strokeWidth?: number;
  showInnerTrace?: boolean;
  loopDurationSeconds?: number;
  fillFadeSeconds?: number;
  className?: string;
  ariaLabel?: string;
  onDone?: () => void;
};

type LoaderPhase =
  | "loop"
  | "closingOuter"
  | "closingInner"
  | "fadingFill"
  | "done";

const OUTER_PATH =
  "M68.6484 121.746L112.751 21.0823C118.355 8.29253 131.211 0 145.436 0H169.659C183.884 0 196.74 8.29253 202.344 21.0823L246.447 121.746L306.119 209.304C313.198 219.69 314.044 232.99 308.338 244.155L293.469 273.244C286.624 286.636 271.786 294.241 256.634 292.123L157.548 278.277L58.0126 293.577C43.0841 295.871 28.3036 288.686 21.1586 275.661L4.31779 244.96C-2.02676 233.393 -1.17512 219.319 6.51994 208.565L68.6484 121.746Z";
const INNER_TRIANGLE_PATH =
  "M68.6484 121.746L246.447 121.746L157.548 278.277L68.6484 121.746";
const LOGO_SEGMENT_PATHS = [
  "M58.0126 293.577L157.548 278.277L68.6484 121.746L6.51994 208.565C-1.17512 219.319 -2.02676 233.393 4.31779 244.96L21.1586 275.661C28.3036 288.686 43.0841 295.871 58.0126 293.577Z",
  "M112.751 21.0823L68.6484 121.746H246.447L202.344 21.0823C196.74 8.29253 183.884 0 169.659 0H145.436C131.211 0 118.355 8.29253 112.751 21.0823Z",
  "M246.447 121.746L157.548 278.277L256.634 292.123C271.786 294.241 286.624 286.636 293.469 273.244L308.338 244.155C314.044 232.99 313.198 219.69 306.119 209.304L246.447 121.746Z",
] as const;

const TRACE_SEGMENT_LENGTH = 0.16;
const DEFAULT_LOOP_DURATION_SECONDS = 0.62;
const INNER_TRACE_DURATION_SECONDS = 0.24;
const DEFAULT_FILL_FADE_SECONDS = 0.14;
const FALLBACK_BUFFER_MS = 180;
const MIN_FALLBACK_MS = 120;

function toFallbackMs(seconds: number) {
  return Math.max(
    MIN_FALLBACK_MS,
    Math.round(seconds * 1000) + FALLBACK_BUFFER_MS,
  );
}

function FilledLogo() {
  return (
    <g>
      {LOGO_SEGMENT_PATHS.map((path) => (
        <path d={path} fill="currentColor" key={path} />
      ))}
    </g>
  );
}

export function LogoTraceLoader({
  loading = true,
  isComplete = false,
  size = 40,
  strokeWidth = 12,
  showInnerTrace = true,
  loopDurationSeconds = DEFAULT_LOOP_DURATION_SECONDS,
  fillFadeSeconds = DEFAULT_FILL_FADE_SECONDS,
  className,
  ariaLabel = "Loading",
  onDone,
}: LogoTraceLoaderProps) {
  const prefersReducedMotion = useReducedMotion();
  const complete = isComplete || !loading;
  const [phase, setPhase] = useState<LoaderPhase>("loop");
  const hasCalledDoneRef = useRef(false);
  const isFilled = phase === "fadingFill" || phase === "done";
  const guideStrokeWidth = Math.max(1, strokeWidth / 2);
  const outerCloseDurationSeconds =
    loopDurationSeconds * (1 - TRACE_SEGMENT_LENGTH);

  useEffect(() => {
    if (!complete && phase !== "loop") {
      hasCalledDoneRef.current = false;
      setPhase("loop");
    }
  }, [complete, phase]);

  useEffect(() => {
    if (prefersReducedMotion && complete) {
      setPhase("done");
    }
  }, [complete, prefersReducedMotion]);

  useEffect(() => {
    if (phase !== "done" || hasCalledDoneRef.current) {
      return;
    }

    hasCalledDoneRef.current = true;
    onDone?.();
  }, [onDone, phase]);

  useEffect(() => {
    if (!complete || phase === "done" || prefersReducedMotion) {
      return;
    }

    let timeoutId: number | undefined;

    if (phase === "loop") {
      timeoutId = window.setTimeout(
        () => setPhase("closingOuter"),
        toFallbackMs(loopDurationSeconds),
      );
    } else if (phase === "closingOuter") {
      timeoutId = window.setTimeout(
        () => setPhase(showInnerTrace ? "closingInner" : "fadingFill"),
        toFallbackMs(outerCloseDurationSeconds),
      );
    } else if (phase === "closingInner") {
      timeoutId = window.setTimeout(
        () => setPhase("fadingFill"),
        toFallbackMs(INNER_TRACE_DURATION_SECONDS),
      );
    } else if (phase === "fadingFill") {
      timeoutId = window.setTimeout(
        () => setPhase("done"),
        toFallbackMs(fillFadeSeconds),
      );
    }

    return () => {
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [
    complete,
    fillFadeSeconds,
    loopDurationSeconds,
    outerCloseDurationSeconds,
    phase,
    prefersReducedMotion,
    showInnerTrace,
  ]);

  return (
    <svg
      aria-label={ariaLabel}
      className={cn(
        "overflow-visible transition-colors duration-200",
        isFilled ? "text-grayscale-12" : "text-blue-9",
        className,
      )}
      fill="none"
      height={size}
      role="status"
      viewBox="-8 -8 329 310"
      width={size}
    >
      <g opacity="0.18">
        <path
          d={OUTER_PATH}
          fill="none"
          stroke="currentColor"
          strokeLinejoin="round"
          strokeWidth={guideStrokeWidth}
        />
      </g>

      {phase === "loop" && !prefersReducedMotion ? (
        <path
          d={OUTER_PATH}
          fill="none"
          onAnimationIteration={() => {
            if (complete) {
              setPhase("closingOuter");
            }
          }}
          pathLength={1}
          stroke="currentColor"
          strokeDasharray={`${TRACE_SEGMENT_LENGTH} ${1 - TRACE_SEGMENT_LENGTH}`}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={strokeWidth}
          style={{
            animation: `logo-trace-loader-loop ${loopDurationSeconds}s linear infinite`,
            strokeDashoffset: 0,
          }}
        />
      ) : null}

      {phase === "closingOuter" ? (
        <motion.path
          animate={{ pathLength: 1 }}
          d={OUTER_PATH}
          fill="none"
          initial={{ pathLength: TRACE_SEGMENT_LENGTH }}
          onAnimationComplete={() =>
            setPhase(showInnerTrace ? "closingInner" : "fadingFill")
          }
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={strokeWidth}
          transition={{
            duration: outerCloseDurationSeconds,
            ease: "linear",
          }}
        />
      ) : null}

      {phase === "closingInner" ? (
        <>
          <path
            d={OUTER_PATH}
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={strokeWidth}
          />
          <motion.path
            animate={{ pathLength: 1 }}
            d={INNER_TRIANGLE_PATH}
            fill="none"
            initial={{ pathLength: 0 }}
            onAnimationComplete={() => setPhase("fadingFill")}
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={strokeWidth}
            transition={{
              duration: INNER_TRACE_DURATION_SECONDS,
              ease: "linear",
            }}
          />
        </>
      ) : null}

      {phase === "fadingFill" ? (
        <>
          <motion.g
            animate={{ opacity: 1 }}
            initial={{ opacity: 0 }}
            onAnimationComplete={() => setPhase("done")}
            transition={{ duration: fillFadeSeconds, ease: "easeOut" }}
          >
            <FilledLogo />
          </motion.g>
          <path
            d={OUTER_PATH}
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={strokeWidth}
          />
          {showInnerTrace ? (
            <path
              d={INNER_TRIANGLE_PATH}
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={strokeWidth}
            />
          ) : null}
        </>
      ) : null}

      {phase === "done" ? (
        <>
          <FilledLogo />
          <path
            d={OUTER_PATH}
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={strokeWidth}
          />
          {showInnerTrace ? (
            <path
              d={INNER_TRIANGLE_PATH}
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={strokeWidth}
            />
          ) : null}
        </>
      ) : null}
    </svg>
  );
}
