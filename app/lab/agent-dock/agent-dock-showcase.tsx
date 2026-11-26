"use client";

import {
  ChatIcon,
  MicrophoneIcon,
  PaperPlaneTiltIcon,
  SpinnerGapIcon,
  XIcon,
} from "@phosphor-icons/react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Image from "next/image";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { cn } from "@/helpers/classname-helper";

type DockMode = "idle" | "composing" | "working";

const dockTransition = {
  duration: 0.3,
  ease: [0.22, 1, 0.36, 1],
} as const;

const composerHeight = 120;

const buttonClassName =
  "flex h-9 items-center justify-center gap-1.5 rounded-[9px] px-1.5 py-1 font-medium text-grayscale-1 text-sm leading-none transition-[width,background-color,color,border-color] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-grayscale-11/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-grayscale-7 disabled:cursor-not-allowed disabled:opacity-60 dark:text-grayscale-12 dark:hover:bg-grayscale-6";

const buttonLabelClassName = "flex min-w-0 items-center gap-2";

const shortcutKeyClassName =
  "flex h-6 min-w-6 shrink-0 items-center justify-center rounded-[6px] bg-grayscale-11/55 px-1.5 font-mono font-semibold text-xs text-grayscale-1 leading-none shadow-[inset_0_1px_rgba(255,255,255,0.18),inset_0_-1px_rgba(0,0,0,0.14)] dark:bg-grayscale-7 dark:text-grayscale-12";

const composerCloseClassName =
  "absolute top-1.5 right-1.5 flex size-6 items-center justify-center rounded-[6px] text-grayscale-8 transition-colors hover:bg-grayscale-11/50 hover:text-grayscale-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-grayscale-7 dark:text-grayscale-10 dark:hover:bg-grayscale-6 dark:hover:text-grayscale-12";

const agentAvatarUrl =
  "https://api.dicebear.com/10.x/initial-face/svg?seed=Zaraaaa&size=80";

function isTextInputTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    Boolean(
      target.closest(
        "input, textarea, select, [contenteditable='true'], [contenteditable='']",
      ),
    )
  );
}

type AgentActionButtonProps = ComponentPropsWithoutRef<"button"> & {
  active?: boolean;
  icon: ReactNode;
  label: string;
  shortcut: string;
};

function AgentActionButton({
  active,
  className,
  icon,
  label,
  shortcut,
  type = "button",
  ...buttonProps
}: AgentActionButtonProps) {
  return (
    <button
      className={cn(
        buttonClassName,
        active &&
          "bg-grayscale-11/50 hover:bg-grayscale-10/50 dark:bg-grayscale-6 dark:hover:bg-grayscale-7",
        className,
      )}
      type={type}
      {...buttonProps}
    >
      <span className={buttonLabelClassName}>
        {icon}
        <span>{label}</span>
      </span>
      <kbd
        className={shortcutKeyClassName}
        aria-label={`Keyboard shortcut ${shortcut}`}
      >
        {shortcut}
      </kbd>
    </button>
  );
}

function AgentStatus({ mode }: { mode: DockMode }) {
  return (
    <div className="min-w-0 overflow-hidden">
      <AnimatePresence initial={false} mode="popLayout">
        {mode === "working" ? (
          <motion.p
            animate={{ opacity: 1, y: 0 }}
            className="flex min-w-0 items-center gap-1.5 text-grayscale-8 text-xs leading-none dark:text-grayscale-10"
            exit={{ opacity: 0, y: -6 }}
            initial={{ opacity: 0, y: 6 }}
            key="working"
            transition={{ duration: 0.16, ease: "easeOut" }}
          >
            <SpinnerGapIcon
              aria-hidden="true"
              className="size-3.5 shrink-0 animate-spin text-grayscale-1 dark:text-grayscale-12"
              weight="bold"
            />
            <Shimmer
              as="span"
              className="truncate [--color-background:var(--color-grayscale-1)] [--color-muted-foreground:var(--color-grayscale-8)] dark:[--color-background:var(--color-grayscale-12)] dark:[--color-muted-foreground:var(--color-grayscale-10)]"
            >
              doing stuff...
            </Shimmer>
          </motion.p>
        ) : (
          <motion.p
            animate={{ opacity: 1, y: 0 }}
            className="truncate text-grayscale-8 text-xs leading-none dark:text-grayscale-10"
            exit={{ opacity: 0, y: -6 }}
            initial={{ opacity: 0, y: 6 }}
            key="idle"
            transition={{ duration: 0.16, ease: "easeOut" }}
          >
            Your hyperaide
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}

export function AgentDockShowcase() {
  const [mode, setMode] = useState<DockMode>("idle");
  const [message, setMessage] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const shouldReduceMotion = useReducedMotion();

  useEffect(() => {
    if (mode === "composing") {
      textareaRef.current?.focus();
    }
  }, [mode]);

  useEffect(() => {
    function handleGlobalKeyDown(event: KeyboardEvent) {
      if (
        event.key.toLowerCase() !== "c" ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        isTextInputTarget(event.target)
      ) {
        return;
      }

      event.preventDefault();
      setMode("composing");
    }

    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, []);

  function openComposer() {
    setMode("composing");
  }

  function sendMessage() {
    setMessage("");
    setMode("working");
  }

  function closeComposer() {
    setMode("idle");
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (mode === "composing") {
      sendMessage();
      return;
    }

    openComposer();
  }

  function handleTextareaKeyDown(
    event: React.KeyboardEvent<HTMLTextAreaElement>,
  ) {
    if (event.key !== "Enter" || event.shiftKey) {
      return;
    }

    event.preventDefault();
    sendMessage();
  }

  return (
    <form className="mb-32 w-full max-w-md" onSubmit={handleSubmit}>
      <div className="flex w-full flex-col-reverse overflow-hidden rounded-[16px] border border-grayscale-12 bg-grayscale-12 p-2 text-grayscale-2 shadow-[0_12px_36px_rgba(0,0,0,0.14)] dark:border-grayscale-4 dark:bg-grayscale-4 dark:text-grayscale-12 dark:shadow-none">
        <div className="flex items-center gap-3">
          <Image
            alt=""
            aria-hidden="true"
            className="size-9 shrink-0 rounded-[12px]"
            height={36}
            src={agentAvatarUrl}
            unoptimized
            width={36}
          />

          <div className="flex h-full min-w-0 flex-1 flex-col justify-center gap-1 p-0 leading-none">
            <p className="truncate font-medium text-sm leading-none">Zara</p>
            <AgentStatus mode={mode} />
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            <AgentActionButton
              icon={
                <MicrophoneIcon
                  aria-hidden="true"
                  className="size-4 shrink-0"
                  weight="bold"
                />
              }
              label="Voice"
              shortcut="V"
            />
            <AgentActionButton
              active={mode === "composing"}
              className={cn(
                "overflow-hidden",
                mode === "composing" ? "w-[6.25rem]" : "w-[6.0625rem]",
              )}
              icon={
                mode === "composing" ? (
                  <PaperPlaneTiltIcon
                    aria-hidden="true"
                    className="size-4 shrink-0"
                    weight="fill"
                  />
                ) : (
                  <ChatIcon
                    aria-hidden="true"
                    className="size-4 shrink-0"
                    weight="bold"
                  />
                )
              }
              label={mode === "composing" ? "Send" : "Chat"}
              shortcut="C"
              type="submit"
            />
          </div>
        </div>

        <motion.div
          animate={{
            height: mode === "composing" ? composerHeight : 0,
            opacity: mode === "composing" ? 1 : 0,
          }}
          aria-hidden={mode !== "composing"}
          className="overflow-hidden"
          initial={false}
          transition={shouldReduceMotion ? { duration: 0 } : dockTransition}
        >
          <div className="relative mb-2">
            <button
              aria-label="Close composer"
              className={composerCloseClassName}
              disabled={mode !== "composing"}
              onClick={closeComposer}
              tabIndex={mode === "composing" ? 0 : -1}
              type="button"
            >
              <XIcon aria-hidden="true" className="size-3.5" weight="bold" />
            </button>
            <textarea
              aria-label="Message agent"
              className="h-28 w-full resize-none px-2 py-2 pr-9 text-grayscale-2 text-sm leading-6 outline-none transition-colors placeholder:text-grayscale-8 focus:border-grayscale-7 disabled:pointer-events-none dark:text-grayscale-12 dark:placeholder:text-grayscale-10 dark:focus:border-grayscale-8"
              disabled={mode !== "composing"}
              onChange={(event) => setMessage(event.target.value)}
              onKeyDown={handleTextareaKeyDown}
              placeholder="Type something here..."
              ref={textareaRef}
              tabIndex={mode === "composing" ? 0 : -1}
              value={message}
            />
          </div>
        </motion.div>
      </div>
    </form>
  );
}
