"use client";

import {
  MicrophoneIcon,
  MicrophoneSlashIcon,
  SpinnerGapIcon,
  WaveformIcon,
} from "@phosphor-icons/react";
import type AudioMotionAnalyzer from "audiomotion-analyzer";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Image from "next/image";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { cn } from "@/helpers/classname-helper";

type VoiceMode = "idle" | "listening" | "thinking" | "speaking";

const panelHeight = 132;

const dockTransition = {
  duration: 0.3,
  ease: [0.22, 1, 0.36, 1],
} as const;

const agentAvatarUrl =
  "https://api.dicebear.com/10.x/initial-face/svg?seed=Aria&size=80";

const spokenReply =
  "Sure — I've pulled your latest numbers and I'm drafting the summary now.";

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

function resolveColor(element: HTMLElement, value: string) {
  const probe = document.createElement("span");
  probe.style.color = value;
  probe.style.display = "none";
  element.appendChild(probe);
  const resolved = window.getComputedStyle(probe).color;
  element.removeChild(probe);
  return resolved;
}

function formatElapsed(ms: number) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
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
        {mode === "idle" ? (
          <motion.p
            animate={{ opacity: 1, y: 0 }}
            className="truncate text-grayscale-8 text-xs leading-none dark:text-grayscale-10"
            exit={{ opacity: 0, y: -6 }}
            initial={{ opacity: 0, y: 6 }}
            key="idle"
            transition={{ duration: 0.16, ease: "easeOut" }}
          >
            {denied ? "Mic blocked — running a demo voice" : "Tap to talk"}
          </motion.p>
        ) : (
          <motion.p
            animate={{ opacity: 1, y: 0 }}
            className="flex min-w-0 items-center gap-1.5 text-grayscale-8 text-xs leading-none dark:text-grayscale-10"
            exit={{ opacity: 0, y: -6 }}
            initial={{ opacity: 0, y: 6 }}
            key={mode}
            transition={{ duration: 0.16, ease: "easeOut" }}
          >
            {mode === "thinking" ? (
              <>
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
              </>
            ) : (
              <span className="truncate text-grayscale-1 dark:text-grayscale-12">
                {mode === "listening" ? "Listening..." : "Speaking..."}
              </span>
            )}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}

export function VoiceDockShowcase() {
  const [mode, setMode] = useState<VoiceMode>("idle");
  const [denied, setDenied] = useState(false);
  const [elapsed, setElapsed] = useState(0);
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
  const timersRef = useRef<number[]>([]);
  const timerStartRef = useRef<number | null>(null);
  const pulseRef = useRef<HTMLSpanElement>(null);

  modeRef.current = mode;

  const registerGradient = useCallback((analyzer: AudioMotionAnalyzer) => {
    const host = canvasHostRef.current;
    if (!host) {
      return;
    }
    const base = window.getComputedStyle(host).color;
    const accent = resolveColor(host, "var(--color-accent-9)");
    analyzer.registerGradient("voice", {
      colorStops: [
        { color: accent, pos: 0 },
        { color: base, pos: 1 },
      ],
    });
    analyzer.gradient = "voice";
  }, []);

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
      channelLayout: "single",
      connectSpeakers: false,
      fillAlpha: 0.28,
      frequencyScale: "log",
      lineWidth: 2,
      maxFreq: 16000,
      minFreq: 50,
      mode: 10,
      overlay: true,
      showBgColor: false,
      showPeaks: false,
      showScaleX: false,
      showScaleY: false,
      smoothing: 0.82,
    });
    analyzerRef.current = analyzer;
    registerGradient(analyzer);
    return analyzer;
  }, [registerGradient]);

  const clearInput = useCallback(() => {
    const analyzer = analyzerRef.current;
    if (syntheticRef.current) {
      window.clearInterval(syntheticRef.current.interval);
      for (const node of syntheticRef.current.nodes) {
        if (node instanceof OscillatorNode) {
          try {
            node.stop();
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

  const startSynthetic = useCallback(
    (analyzer: AudioMotionAnalyzer, kind: "speaking" | "ambient") => {
      const ctx = analyzer.audioCtx;
      const gain = ctx.createGain();
      gain.gain.value = 0.0001;
      const oscillators = [
        { frequency: 130, type: "sawtooth" as OscillatorType },
        { frequency: 92, type: "sine" as OscillatorType },
        { frequency: 320, type: "triangle" as OscillatorType },
      ].map(({ frequency, type }) => {
        const osc = ctx.createOscillator();
        osc.type = type;
        osc.frequency.value = frequency;
        osc.connect(gain);
        osc.start();
        return osc;
      });
      analyzer.connectInput(gain);
      inputNodeRef.current = gain;

      const isSpeaking = kind === "speaking";
      const interval = window.setInterval(
        () => {
          const level = isSpeaking
            ? 0.16 + Math.random() * 0.78
            : 0.04 + Math.random() * 0.14;
          gain.gain.setTargetAtTime(
            level,
            ctx.currentTime,
            isSpeaking ? 0.05 : 0.16,
          );
          if (isSpeaking) {
            oscillators[0].frequency.setTargetAtTime(
              105 + Math.random() * 90,
              ctx.currentTime,
              0.08,
            );
          }
        },
        isSpeaking ? 130 : 300,
      );

      syntheticRef.current = { interval, nodes: [...oscillators, gain] };
    },
    [],
  );

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

  const clearTimers = useCallback(() => {
    for (const timer of timersRef.current) {
      window.clearTimeout(timer);
    }
    timersRef.current = [];
    timerStartRef.current = null;
  }, []);

  const goIdle = useCallback(() => {
    clearInput();
    stopLevelLoop();
    setMode("idle");
    setElapsed(0);
  }, [clearInput, stopLevelLoop]);

  const endListening = useCallback(() => {
    if (modeRef.current !== "listening") {
      return;
    }
    clearInput();
    timerStartRef.current = null;
    setMode("thinking");

    const analyzer = analyzerRef.current;
    const toSpeaking = window.setTimeout(() => {
      setMode("speaking");
      if (analyzer) {
        registerGradient(analyzer);
        startSynthetic(analyzer, "speaking");
        runLevelLoop();
      }
      const toIdle = window.setTimeout(() => {
        goIdle();
      }, 3400);
      timersRef.current.push(toIdle);
    }, 1100);
    timersRef.current.push(toSpeaking);
  }, [clearInput, goIdle, registerGradient, runLevelLoop, startSynthetic]);

  const beginListening = useCallback(async () => {
    clearTimers();
    clearInput();
    setMode("listening");
    setElapsed(0);
    timerStartRef.current = performance.now();

    const analyzer = await ensureAnalyzer();
    if (!analyzer) {
      return;
    }
    registerGradient(analyzer);
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
      startSynthetic(analyzer, "ambient");
    }

    runLevelLoop();
  }, [
    clearInput,
    clearTimers,
    ensureAnalyzer,
    registerGradient,
    runLevelLoop,
    startSynthetic,
  ]);

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
    clearTimers();
    goIdle();
  }, [beginListening, clearTimers, endListening, goIdle]);

  useEffect(() => {
    if (mode !== "listening") {
      return;
    }
    const interval = window.setInterval(() => {
      if (timerStartRef.current !== null) {
        setElapsed(performance.now() - timerStartRef.current);
      }
    }, 250);
    return () => window.clearInterval(interval);
  }, [mode]);

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
      clearTimers();
      goIdle();
    }

    window.addEventListener("keydown", handleGlobalKeyDown);
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("keydown", handleGlobalKeyDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [clearTimers, goIdle, toggleVoice]);

  useEffect(() => {
    return () => {
      clearTimers();
      clearInput();
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
      }
      analyzerRef.current?.destroy();
      analyzerRef.current = null;
    };
  }, [clearInput, clearTimers]);

  const isActive = mode !== "idle";
  const buttonLabel = mode === "idle" ? "Voice" : "Stop";
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
                isActive ? "bg-green-9" : "bg-grayscale-8 dark:bg-grayscale-7",
              )}
            />
          </div>

          <div className="flex h-full min-w-0 flex-1 flex-col justify-center gap-1 leading-none">
            <p className="truncate font-medium text-sm leading-none">Aria</p>
            <VoiceStatus denied={denied} mode={mode} />
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            <VoiceButton
              active={isActive}
              aria-label={mode === "idle" ? "Start voice session" : "Stop"}
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
            height: isActive ? panelHeight : 0,
            opacity: isActive ? 1 : 0,
          }}
          aria-hidden={!isActive}
          className="overflow-hidden"
          initial={false}
          transition={shouldReduceMotion ? { duration: 0 } : dockTransition}
        >
          <div className="mb-2 flex flex-col gap-2 rounded-[12px] bg-grayscale-11/25 p-3 dark:bg-grayscale-3/60">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 font-medium text-grayscale-2 text-xs leading-none dark:text-grayscale-12">
                <WaveformIcon
                  aria-hidden="true"
                  className="size-3.5 shrink-0"
                  weight="bold"
                />
                {mode === "speaking" ? "Aria" : "You"}
              </span>
              <span className="font-mono text-[11px] text-grayscale-8 tabular-nums leading-none dark:text-grayscale-10">
                {formatElapsed(elapsed)}
              </span>
            </div>

            <div
              className="h-14 w-full overflow-hidden rounded-[8px] text-grayscale-2 dark:text-grayscale-12"
              ref={canvasHostRef}
            />

            <div className="min-h-4">
              <AnimatePresence initial={false} mode="wait">
                {mode === "speaking" ? (
                  <motion.p
                    animate={{ opacity: 1, y: 0 }}
                    className="line-clamp-1 text-grayscale-4 text-xs leading-4 dark:text-grayscale-11"
                    exit={{ opacity: 0 }}
                    initial={{ opacity: 0, y: 4 }}
                    key="reply"
                    transition={{ duration: 0.2, ease: "easeOut" }}
                  >
                    {spokenReply}
                  </motion.p>
                ) : (
                  <motion.p
                    animate={{ opacity: 1 }}
                    className="text-grayscale-8 text-xs leading-4 dark:text-grayscale-10"
                    exit={{ opacity: 0 }}
                    initial={{ opacity: 0 }}
                    key="hint"
                    transition={{ duration: 0.2, ease: "easeOut" }}
                  >
                    {denied
                      ? "Allow microphone access for a live waveform."
                      : "Press V or Escape to stop."}
                  </motion.p>
                )}
              </AnimatePresence>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
