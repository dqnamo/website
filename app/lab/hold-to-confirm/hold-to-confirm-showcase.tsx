"use client";

import { ArrowClockwiseIcon, TrashIcon } from "@phosphor-icons/react/dist/ssr";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useState } from "react";
import {
  type ConfirmationInput,
  HoldToConfirmButton,
} from "@/components/HoldToConfirmButton";
import { type UndoInteraction, UndoNotice } from "@/components/UndoNotice";

type DeleteStage = "closed" | "idle" | "undo";
type TransitionDirection = -1 | 1;

const easeOut = [0.23, 1, 0.32, 1] as const;

type ModalMotionSettings = {
  enterDuration: number;
  exitDuration: number;
  shouldMove: boolean;
};

type SwapMotionSettings = {
  direction: TransitionDirection;
  enterDuration: number;
  exitDuration: number;
  offset: number;
};

const modalVariants = {
  enter: ({ shouldMove }: ModalMotionSettings) => ({
    opacity: 0,
    transform: shouldMove ? "scale(0.97)" : "scale(1)",
  }),
  exit: ({ exitDuration, shouldMove }: ModalMotionSettings) => ({
    opacity: 0,
    transform: shouldMove ? "scale(0.97)" : "scale(1)",
    transition: { duration: exitDuration, ease: easeOut },
  }),
  visible: ({ enterDuration }: ModalMotionSettings) => ({
    opacity: 1,
    transform: "scale(1)",
    transition: { duration: enterDuration, ease: easeOut },
  }),
};

const swapVariants = {
  enter: ({ direction, offset }: SwapMotionSettings) => ({
    opacity: 0,
    transform: `translateY(${direction * offset}px)`,
  }),
  exit: ({ direction, exitDuration, offset }: SwapMotionSettings) => ({
    opacity: 0,
    transform: `translateY(${-direction * offset}px)`,
    transition: { duration: exitDuration, ease: easeOut },
  }),
  visible: ({ enterDuration }: SwapMotionSettings) => ({
    opacity: 1,
    transform: "translateY(0px)",
    transition: { duration: enterDuration, ease: easeOut },
  }),
};

export function HoldToConfirmShowcase() {
  const [stage, setStage] = useState<DeleteStage>("idle");
  const [direction, setDirection] = useState<TransitionDirection>(1);
  const [animateTransition, setAnimateTransition] = useState(true);
  const shouldReduceMotion = useReducedMotion();
  const shouldMove = animateTransition && !shouldReduceMotion;
  const motionOffset = shouldMove ? 4 : 0;
  const enterDuration = animateTransition ? 0.18 : 0;
  const exitDuration = animateTransition ? 0.12 : 0;
  const modalMotion: ModalMotionSettings = {
    enterDuration: animateTransition ? 0.24 : 0,
    exitDuration: animateTransition ? 0.18 : 0,
    shouldMove,
  };
  const swapMotion: SwapMotionSettings = {
    direction,
    enterDuration,
    exitDuration,
    offset: motionOffset,
  };

  const closeModal = useCallback((animate = true) => {
    setAnimateTransition(animate);
    setStage("closed");
  }, []);

  function handleConfirm(input: ConfirmationInput) {
    setAnimateTransition(input === "pointer");
    setDirection(1);
    setStage("undo");
  }

  function handleUndo(input: UndoInteraction) {
    setAnimateTransition(input === "pointer");
    setDirection(-1);
    setStage("idle");
  }

  const handleNoticeExpire = useCallback(() => {
    closeModal();
  }, [closeModal]);

  function replayModal(animate = true) {
    setAnimateTransition(animate);
    setDirection(1);
    setStage("idle");
  }

  return (
    <div className="relative flex min-h-[34rem] w-full items-center justify-center overflow-hidden rounded-[13px] border border-grayscale-3 bg-grayscale-1 p-4 small-shadow dark:border-grayscale-4 dark:bg-grayscale-2 dark:shadow-none sm:p-8">
      <button
        aria-label="Replay delete modal"
        className="absolute top-2 right-2 flex h-8 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-grayscale-3 bg-white px-2 font-medium text-grayscale-11 text-xs transition-[background-color,border-color,transform] duration-150 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)] hover:border-grayscale-4 hover:bg-grayscale-2 active:scale-[0.97] dark:border-grayscale-4 dark:bg-grayscale-3 dark:hover:border-grayscale-5 dark:hover:bg-grayscale-4"
        onClick={(event) => replayModal(event.detail !== 0)}
        type="button"
      >
        <ArrowClockwiseIcon aria-hidden="true" size={15} weight="bold" />
        Replay
      </button>

      <AnimatePresence custom={modalMotion}>
        {stage !== "closed" ? (
          <motion.div
            animate="visible"
            aria-labelledby="delete-project-title"
            className="w-full max-w-sm origin-center rounded-2xl border border-grayscale-4 bg-grayscale-1 p-2 shadow-[0_1px_2px_rgba(0,0,0,0.03),0_6px_16px_-8px_rgba(0,0,0,0.1),0_16px_32px_-16px_rgba(0,0,0,0.08)] dark:border-grayscale-5 dark:bg-grayscale-3 dark:shadow-[0_1px_2px_rgba(0,0,0,0.18),0_12px_28px_-12px_rgba(0,0,0,0.36)]"
            custom={modalMotion}
            exit="exit"
            initial="enter"
            key="delete-modal"
            role="dialog"
            variants={modalVariants}
          >
            <div className="p-2">
              <h2
                className="font-medium text-grayscale-12 text-sm"
                id="delete-project-title"
              >
                Delete this project?
              </h2>
              <p className="mt-1 text-balance text-grayscale-10 text-xs leading-5">
                This permanently removes the project and everything stored
                inside it.
              </p>
            </div>

            <AnimatePresence custom={swapMotion} initial={false} mode="wait">
              {stage === "idle" ? (
                <motion.div
                  animate="visible"
                  className="mt-2 grid h-9 grid-cols-2 gap-2"
                  custom={swapMotion}
                  exit="exit"
                  initial="enter"
                  key="actions"
                  variants={swapVariants}
                >
                  <button
                    className="h-9 cursor-pointer rounded-lg border border-grayscale-4 bg-grayscale-1 px-3 font-medium text-grayscale-11 text-sm transition-[background-color,border-color,transform] duration-150 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)] hover:bg-grayscale-2 active:scale-[0.97] dark:border-grayscale-6 dark:bg-grayscale-4 dark:hover:bg-grayscale-5"
                    onClick={(event) => closeModal(event.detail !== 0)}
                    type="button"
                  >
                    Cancel
                  </button>
                  <HoldToConfirmButton
                    className="min-w-0 w-full"
                    onConfirm={handleConfirm}
                    resetAfter={0}
                  >
                    <TrashIcon aria-hidden="true" size={15} weight="bold" />
                    Hold to delete
                  </HoldToConfirmButton>
                </motion.div>
              ) : null}

              {stage === "undo" ? (
                <motion.div
                  animate="visible"
                  className="mt-2 h-9"
                  custom={swapMotion}
                  exit="exit"
                  initial="enter"
                  key="undo"
                  variants={swapVariants}
                >
                  <UndoNotice
                    className="h-9"
                    onExpire={handleNoticeExpire}
                    onUndo={handleUndo}
                  />
                </motion.div>
              ) : null}
            </AnimatePresence>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
