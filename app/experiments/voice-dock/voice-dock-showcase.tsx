"use client";

import {
  MicrophoneIcon,
  MicrophoneSlashIcon,
  SpinnerGapIcon,
} from "@phosphor-icons/react";
import type AudioMotionAnalyzer from "audiomotion-analyzer";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Image from "next/image";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { cn } from "@/helpers/classname-helper";

type VoiceMode = "idle" | "listening" | "thinking";

const panelHeight = 120;

const dockTransition = {
  duration: 0.3,
  ease: [0.22, 1, 0.36, 1],
} as const;

const agentAvatarUrl =
  "https://api.dicebear.com/10.x/initial-face/svg?seed=Aria&size=80";

const buttonClassName =
  "relative flex h-9 items-center justify-center gap-1.5 rounded-[9px] px-2.5 py-1 font-medium text-grayscale-1 text-sm leading-none transition-[background-color,color] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-grayscale-11/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-grayscale-7 disabled:cursor-not-allowed disabled:opacity-60 dark:text-grayscale-12 dark:hover:bg-grayscale-6";

const shortcutKeyClassName =
  "flex h-6 min-w-6 shrink-0 items-center justify-center rounded-[6px] bg-grayscale-11/55 px-1.5 font-mono font-semibold text-grayscale-1 text-xs leading-none shadow-[inset_0_1px_rgba(255,255,255,0.18),inset_0_-1px_rgba(0,0,0,0.14)] dark:bg-grayscale-7 dark:text-grayscale-12";

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

type VoiceButtonProps = ComponentPropsWithoutRef<"button"> & {
  active?: boolean;
  icon: ReactNode;
  label: string;
  shortcut: string;
  pulseRef?: React.Ref<HTMLSpanElement>;
};

function VoiceButton({
  active,
  className,
  icon,
  label,
  pulseRef,
  shortcut,
  type = "button",
  ...buttonProps
}: VoiceButtonProps) {
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
      <span className="relative flex size-4 items-center justify-center">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-full bg-current opacity-0"
          ref={pulseRef}
          style={{ transformOrigin: "center" }}
        />
        <span className="relative flex size-4 items-center justify-center">
          {icon}
        </span>
      </span>
      <span>{label}</span>
      <kbd
        aria-label={`Keyboard shortcut ${shortcut}`}
        className={shortcutKeyClassName}
      >
        {shortcut}
      </kbd>
    </button>
  );
}

function VoiceStatus({ mode, denied }: { mode: VoiceMode; denied: boolean }) {
  return (
    <div className="min-w-0 overflow-hidden">
      <AnimatePresence initial={false} mode="popLayout">
        {mode === "thinking" ? (
          <motion.p
            animate={{ opacity: 1, y: 0 }}
            className="flex min-w-0 items-center gap-1.5 text-grayscale-8 text-xs leading-none dark:text-grayscale-10"
            exit={{ opacity: 0, y: -6 }}
            initial={{ opacity: 0, y: 6 }}
            key="thinking"
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
              Thinking...
            </Shimmer>
          </motion.p>
        ) : mode === "listening" ? (
          <motion.p
            animate={{ opacity: 1, y: 0 }}
            className="truncate text-grayscale-1 text-xs leading-none dark:text-grayscale-12"
            exit={{ opacity: 0, y: -6 }}
            initial={{ opacity: 0, y: 6 }}
            key="listening"
            transition={{ duration: 0.16, ease: "easeOut" }}
          >
            Listening...
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
            {denied ? "Mic blocked — running a demo waveform" : "Tap to talk"}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}

export function VoiceDockShowcase() {
  const [mode, setMode] = useState<VoiceMode>("idle");
  const [denied, setDenied] = useState(false);
  const shouldReduceMotion = useReducedMotion();

  const modeRef = useRef<VoiceMode>("idle");
  const canvasHostRef = useRef<HTMLDivElement>(null);
  const analyzerRef = useRef<AudioMotionAnalyzer | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const inputNodeRef = useRef<AudioNode | null>(null);
  const syntheticRef = useRef<{ nodes: AudioNode[]; interval: number } | null>(
    null,
  );
  const rafRef = useRef<number | null>(null);
  const pulseRef = useRef<HTMLSpanElement>(null);

  modeRef.current = mode;

  const ensureAnalyzer = useCallback(async () => {
    if (analyzerRef.current) {
      return analyzerRef.current;
    }
    const host = canvasHostRef.current;
    if (!host) {
      return null;
    }
    const { default: AudioMotionAnalyzer } = await import(
      "audiomotion-analyzer"
    );
    const analyzer = new AudioMotionAnalyzer(host, {
      barSpace: 0.32,
      channelLayout: "single",
      colorMode: "bar-index",
      connectSpeakers: false,
      frequencyScale: "log",
      gradient: "rainbow",
      maxFreq: 16000,
      minFreq: 40,
      mode: 4,
      overlay: true,
      reflexAlpha: 0.22,
      reflexBright: 1,
      reflexRatio: 0.34,
      roundBars: true,
      showBgColor: false,
      showPeaks: false,
      showScaleX: false,
      showScaleY: false,
      smoothing: 0.7,
    });
    analyzerRef.current = analyzer;
    return analyzer;
  }, []);

  const clearInput = useCallback(() => {
    const analyzer = analyzerRef.current;
    if (syntheticRef.current) {
      window.clearInterval(syntheticRef.current.interval);
      for (const node of syntheticRef.current.nodes) {
        if ("stop" in node && typeof node.stop === "function") {
          try {
            (node as OscillatorNode | AudioBufferSourceNode).stop();
          } catch {
            // already stopped
          }
        }
        try {
          node.disconnect();
        } catch {
          // already disconnected
        }
      }
      syntheticRef.current = null;
    }
    if (analyzer && inputNodeRef.current) {
      analyzer.disconnectInput(inputNodeRef.current);
    }
    inputNodeRef.current = null;
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop();
      }
      streamRef.current = null;
    }
  }, []);

  // Fallback source so the whole spectrum still lights up when a mic isn't
  // available: filtered broadband noise with a wandering band-pass sweep.
  const startSyntheticAmbient = useCallback((analyzer: AudioMotionAnalyzer) => {
    const ctx = analyzer.audioCtx;
    const bufferSize = 2 * ctx.sampleRate;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      channel[i] = Math.random() * 2 - 1;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 900;
    filter.Q.value = 0.7;

    const gain = ctx.createGain();
    gain.gain.value = 0.0001;

    noise.connect(filter);
    filter.connect(gain);
    analyzer.connectInput(gain);
    noise.start();
    inputNodeRef.current = gain;

    const interval = window.setInterval(() => {
      gain.gain.setTargetAtTime(
        0.3 + Math.random() * 0.5,
        ctx.currentTime,
        0.1,
      );
      filter.frequency.setTargetAtTime(
        300 + Math.random() * 3200,
        ctx.currentTime,
        0.18,
      );
    }, 180);

    syntheticRef.current = { interval, nodes: [noise, filter, gain] };
  }, []);

  const runLevelLoop = useCallback(() => {
    if (rafRef.current !== null) {
      return;
    }
    const loop = () => {
      const analyzer = analyzerRef.current;
      const pulse = pulseRef.current;
      if (analyzer && pulse) {
        const energy = Math.min(1, analyzer.getEnergy("peak") * 1.4);
        pulse.style.transform = `scale(${(1 + energy * 1.8).toFixed(3)})`;
        pulse.style.opacity = (0.12 + energy * 0.4).toFixed(3);
      }
      rafRef.current = window.requestAnimationFrame(loop);
    };
    rafRef.current = window.requestAnimationFrame(loop);
  }, []);

  const stopLevelLoop = useCallback(() => {
    if (rafRef.current !== null) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (pulseRef.current) {
      pulseRef.current.style.transform = "scale(1)";
      pulseRef.current.style.opacity = "0";
    }
  }, []);

  const goIdle = useCallback(() => {
    clearInput();
    stopLevelLoop();
    setMode("idle");
  }, [clearInput, stopLevelLoop]);

  // Stop capturing and hand off to the agent's thinking state.
  const endListening = useCallback(() => {
    if (modeRef.current !== "listening") {
      return;
    }
    clearInput();
    stopLevelLoop();
    setMode("thinking");
  }, [clearInput, stopLevelLoop]);

  const beginListening = useCallback(async () => {
    clearInput();
    setDenied(false);
    setMode("listening");

    const analyzer = await ensureAnalyzer();
    if (!analyzer) {
      return;
    }
    try {
      await analyzer.audioCtx.resume();
    } catch {
      // resume can reject if already running
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const source = analyzer.audioCtx.createMediaStreamSource(stream);
      analyzer.connectInput(source);
      inputNodeRef.current = source;
      setDenied(false);
    } catch {
      setDenied(true);
      startSyntheticAmbient(analyzer);
    }

    runLevelLoop();
  }, [clearInput, ensureAnalyzer, runLevelLoop, startSyntheticAmbient]);

  const toggleVoice = useCallback(() => {
    const current = modeRef.current;
    if (current === "idle") {
      void beginListening();
      return;
    }
    if (current === "listening") {
      endListening();
      return;
    }
    goIdle();
  }, [beginListening, endListening, goIdle]);

  useEffect(() => {
    function handleGlobalKeyDown(event: KeyboardEvent) {
      if (
        event.key.toLowerCase() !== "v" ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        isTextInputTarget(event.target)
      ) {
        return;
      }
      event.preventDefault();
      toggleVoice();
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key !== "Escape" || modeRef.current === "idle") {
        return;
      }
      if (modeRef.current === "listening") {
        endListening();
        return;
      }
      goIdle();
    }

    window.addEventListener("keydown", handleGlobalKeyDown);
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("keydown", handleGlobalKeyDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [endListening, goIdle, toggleVoice]);

  useEffect(() => {
    return () => {
      clearInput();
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
      }
      analyzerRef.current?.destroy();
      analyzerRef.current = null;
    };
  }, [clearInput]);

  const isBusy = mode !== "idle";
  const isListening = mode === "listening";
  const buttonLabel = isListening ? "Stop" : "Voice";
  const buttonIcon = denied ? (
    <MicrophoneSlashIcon
      aria-hidden="true"
      className="size-4 shrink-0"
      weight="bold"
    />
  ) : (
    <MicrophoneIcon
      aria-hidden="true"
      className="size-4 shrink-0"
      weight="bold"
    />
  );

  return (
    <div className="mb-32 w-full max-w-md">
      <div className="flex w-full flex-col-reverse overflow-hidden rounded-[16px] border border-grayscale-12 bg-grayscale-12 p-2 text-grayscale-2 shadow-[0_12px_36px_rgba(0,0,0,0.14)] dark:border-grayscale-4 dark:bg-grayscale-4 dark:text-grayscale-12 dark:shadow-none">
        <div className="flex items-center gap-3">
          <div className="relative size-9 shrink-0">
            <Image
              alt=""
              aria-hidden="true"
              className="size-9 rounded-[12px]"
              height={36}
              src={agentAvatarUrl}
              unoptimized
              width={36}
            />
            <span
              aria-hidden="true"
              className={cn(
                "absolute -right-0.5 -bottom-0.5 size-3 rounded-full border-2 border-grayscale-12 transition-colors duration-300 dark:border-grayscale-4",
                isBusy ? "bg-green-9" : "bg-grayscale-8 dark:bg-grayscale-7",
              )}
            />
          </div>

          <div className="flex h-full min-w-0 flex-1 flex-col justify-center gap-1 leading-none">
            <p className="truncate font-medium text-sm leading-none">Aria</p>
            <VoiceStatus denied={denied} mode={mode} />
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            <VoiceButton
              active={isListening}
              aria-label={isListening ? "Stop" : "Start voice session"}
              icon={buttonIcon}
              label={buttonLabel}
              onClick={toggleVoice}
              pulseRef={pulseRef}
              shortcut="V"
            />
          </div>
        </div>

        <motion.div
          animate={{
            height: isListening ? panelHeight : 0,
            opacity: isListening ? 1 : 0,
          }}
          aria-hidden={!isListening}
          className="overflow-hidden"
          initial={false}
          transition={shouldReduceMotion ? { duration: 0 } : dockTransition}
        >
          <div className="mb-2 rounded-[12px] bg-grayscale-11/25 p-2 dark:bg-grayscale-3/60">
            <div
              className="h-24 w-full overflow-hidden rounded-[8px]"
              ref={canvasHostRef}
            />
          </div>
        </motion.div>
      </div>
    </div>
  );
}
