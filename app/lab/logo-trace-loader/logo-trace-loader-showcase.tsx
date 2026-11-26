"use client";

import {
  ArrowClockwiseIcon,
  CheckCircleIcon,
  DotsThreeCircleIcon,
  type Icon,
  SpinnerGapIcon,
} from "@phosphor-icons/react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { LogoTraceLoader } from "@/components/LogoTraceLoader";
import Button from "@/components/public/Button";

const completeDelayMs = 900;
const signInFallbackDelayMs = 2500;
const revealTransition = {
  duration: 0.45,
  ease: [0.22, 1, 0.36, 1],
} as const;

type Status = {
  icon: Icon;
  iconClassName?: string;
  iconWeight?: "regular" | "bold" | "fill";
  text: string;
};

function getStatus({
  isComplete,
  isLoaderDone,
}: {
  isComplete: boolean;
  isLoaderDone: boolean;
}): Status {
  if (isLoaderDone) {
    return {
      icon: CheckCircleIcon,
      iconClassName: "text-green-9",
      iconWeight: "fill",
      text: "Ready",
    };
  }

  if (isComplete) {
    return {
      icon: DotsThreeCircleIcon,
      iconClassName: "text-blue-9",
      iconWeight: "fill",
      text: "Completing",
    };
  }

  return {
    icon: SpinnerGapIcon,
    iconClassName: "animate-spin text-grayscale-10",
    iconWeight: "fill",
    text: "Loading",
  };
}

function SignInPreview() {
  return (
    <div className="w-full overflow-hidden rounded-[13px] border border-grayscale-3 bg-grayscale-1 small-shadow dark:border-grayscale-4 dark:bg-grayscale-3 dark:shadow-none">
      <div className="p-4">
        <h2 className="font-semibold text-grayscale-12 text-sm">Sign In</h2>
        <p className="text-pretty text-grayscale-11 text-sm leading-6">
          Enter your email and we&apos;ll send you a verification code.
          We&apos;ll create your account too if you don&apos;t already have one.
        </p>
      </div>

      <form className="flex flex-col">
        <input
          autoComplete="email"
          className="mt-2 w-full border-0 border-grayscale-4 border-b bg-transparent px-4 py-2 text-grayscale-12 text-sm outline-none placeholder:text-grayscale-10 focus:border-blue-9"
          defaultValue=""
          placeholder="you@email.com"
          readOnly
          type="email"
        />

        <div className="flex items-center justify-end p-4">
          <Button type="button">Send code</Button>
        </div>
      </form>
    </div>
  );
}

export function LogoTraceLoaderShowcase() {
  const [runKey, setRunKey] = useState(0);
  const [isComplete, setIsComplete] = useState(false);
  const [isLoaderDone, setIsLoaderDone] = useState(false);
  const completeTimerRef = useRef<number | null>(null);
  const fallbackTimerRef = useRef<number | null>(null);

  const clearTimers = useCallback(() => {
    if (completeTimerRef.current !== null) {
      window.clearTimeout(completeTimerRef.current);
      completeTimerRef.current = null;
    }

    if (fallbackTimerRef.current !== null) {
      window.clearTimeout(fallbackTimerRef.current);
      fallbackTimerRef.current = null;
    }
  }, []);

  const scheduleRun = useCallback(() => {
    completeTimerRef.current = window.setTimeout(() => {
      setIsComplete(true);
    }, completeDelayMs);

    fallbackTimerRef.current = window.setTimeout(() => {
      setIsLoaderDone(true);
    }, signInFallbackDelayMs);
  }, []);

  useEffect(() => {
    scheduleRun();

    return () => {
      clearTimers();
    };
  }, [clearTimers, scheduleRun]);

  function replay() {
    clearTimers();
    setIsComplete(false);
    setIsLoaderDone(false);
    setRunKey((currentRunKey) => currentRunKey + 1);
    scheduleRun();
  }

  const status = getStatus({ isComplete, isLoaderDone });
  const StatusIcon = status.icon;

  return (
    <div className="w-full overflow-hidden rounded-[13px] border border-grayscale-3 bg-grayscale-1 small-shadow dark:border-grayscale-4 dark:bg-grayscale-3 dark:shadow-none">
      <div className="flex min-h-[30rem] items-center justify-center bg-grayscale-1 px-4 py-10 dark:bg-grayscale-2">
        <div
          className={`flex w-full max-w-md flex-col items-center ${
            isLoaderDone ? "-mt-6 gap-6" : ""
          }`}
        >
          <motion.div
            animate={{
              scale: isLoaderDone ? 0.8 : 1,
              y: isLoaderDone ? -12 : 0,
            }}
            className="flex items-center justify-center"
            layout
            transition={revealTransition}
          >
            <LogoTraceLoader
              ariaLabel="Loading logo"
              fillFadeSeconds={0.2}
              isComplete={isComplete}
              key={runKey}
              loopDurationSeconds={0.5}
              onDone={() => setIsLoaderDone(true)}
              showInnerTrace={false}
              size={40}
            />
            <span className="sr-only">Loading content</span>
          </motion.div>

          {isLoaderDone ? (
            <motion.div
              animate={{ opacity: 1, y: 0 }}
              className="w-full"
              initial={{ opacity: 0, y: 48 }}
              transition={revealTransition}
            >
              <SignInPreview />
            </motion.div>
          ) : null}
        </div>
      </div>

      <div className="flex flex-col gap-4 border-grayscale-3 border-t p-4 dark:border-grayscale-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex h-7 min-w-0 flex-1 items-center overflow-hidden">
          <AnimatePresence initial={false} mode="popLayout">
            <motion.p
              animate={{ opacity: 1, y: 0 }}
              className="absolute inset-y-0 left-0 flex items-center text-grayscale-11 text-sm"
              exit={{ opacity: 0, y: -10 }}
              initial={{ opacity: 0, y: 10 }}
              key={status.text}
              transition={{ duration: 0.18, ease: "easeOut" }}
            >
              <StatusIcon
                aria-hidden="true"
                className={status.iconClassName}
                size={15}
                weight={status.iconWeight}
              />
              <span className="ml-1.5">{status.text}</span>
            </motion.p>
          </AnimatePresence>
        </div>

        <div className="flex flex-wrap gap-1.5">
          <Button
            aria-label="Replay logo trace loader reveal"
            className="text-xs"
            onClick={replay}
            type="button"
            variant="secondary"
          >
            <ArrowClockwiseIcon aria-hidden="true" size={15} weight="bold" />
            Replay
          </Button>
        </div>
      </div>
    </div>
  );
}
