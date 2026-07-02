export const componentSource = `"use client";

import {
  MicrophoneIcon,
  MicrophoneSlashIcon,
  SpinnerGapIcon,
} from "@phosphor-icons/react";
import type AudioMotionAnalyzer from "audiomotion-analyzer";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";

type VoiceMode = "idle" | "listening" | "thinking" | "speaking";

type VoiceDockProps = {
  agentName: string;
  avatarSrc: string;
  className?: string;
  reply?: string;
  onStart?: () => void;
  onStop?: () => void;
};

const panelHeight = 132;

const dockTransition = { duration: 0.3, ease: [0.22, 1, 0.36, 1] } as const;

export function VoiceDock({
  agentName,
  avatarSrc,
  className,
  reply = "Sure — give me one second.",
  onStart,
  onStop,
}: VoiceDockProps) {
  const [mode, setMode] = useState<VoiceMode>("idle");
  const [denied, setDenied] = useState(false);
  const shouldReduceMotion = useReducedMotion();

  const modeRef = useRef<VoiceMode>("idle");
  const hostRef = useRef<HTMLDivElement>(null);
  const analyzerRef = useRef<AudioMotionAnalyzer | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const inputRef = useRef<AudioNode | null>(null);
  const syntheticRef = useRef<{ nodes: AudioNode[]; interval: number } | null>(
    null,
  );
  const timersRef = useRef<number[]>([]);

  modeRef.current = mode;

  // Resolve a themed gradient from the host element's own colors.
  const registerGradient = useCallback((analyzer: AudioMotionAnalyzer) => {
    const host = hostRef.current;
    if (!host) return;
    const base = window.getComputedStyle(host).color;
    const probe = document.createElement("span");
    probe.style.color = "var(--color-accent-9)";
    host.appendChild(probe);
    const accent = window.getComputedStyle(probe).color;
    host.removeChild(probe);
    analyzer.registerGradient("voice", {
      colorStops: [
        { color: accent, pos: 0 },
        { color: base, pos: 1 },
      ],
    });
    analyzer.gradient = "voice";
  }, []);

  const ensureAnalyzer = useCallback(async () => {
    if (analyzerRef.current) return analyzerRef.current;
    if (!hostRef.current) return null;
    const { default: AudioMotionAnalyzer } = await import(
      "audiomotion-analyzer"
    );
    const analyzer = new AudioMotionAnalyzer(hostRef.current, {
      connectSpeakers: false, // analyze only, no feedback
      fillAlpha: 0.28,
      frequencyScale: "log",
      lineWidth: 2,
      mode: 10,
      overlay: true,
      showBgColor: false,
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
          } catch {}
        }
        try {
          node.disconnect();
        } catch {}
      }
      syntheticRef.current = null;
    }
    if (analyzer && inputRef.current) analyzer.disconnectInput(inputRef.current);
    inputRef.current = null;
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) track.stop();
      streamRef.current = null;
    }
  }, []);

  // A silent oscillator bank stands in for the agent's voice (or a mic
  // fallback), so the analyzer always has something to visualize.
  const startSynthetic = useCallback(
    (analyzer: AudioMotionAnalyzer, kind: "speaking" | "ambient") => {
      const ctx = analyzer.audioCtx;
      const gain = ctx.createGain();
      gain.gain.value = 0.0001;
      const oscillators = [130, 92, 320].map((frequency, index) => {
        const osc = ctx.createOscillator();
        osc.type = (["sawtooth", "sine", "triangle"] as const)[index];
        osc.frequency.value = frequency;
        osc.connect(gain);
        osc.start();
        return osc;
      });
      analyzer.connectInput(gain);
      inputRef.current = gain;

      const isSpeaking = kind === "speaking";
      const interval = window.setInterval(
        () => {
          const level = isSpeaking
            ? 0.16 + Math.random() * 0.78
            : 0.04 + Math.random() * 0.14;
          gain.gain.setTargetAtTime(level, ctx.currentTime, 0.06);
        },
        isSpeaking ? 130 : 300,
      );
      syntheticRef.current = { interval, nodes: [...oscillators, gain] };
    },
    [],
  );

  const goIdle = useCallback(() => {
    clearInput();
    setMode("idle");
    onStop?.();
  }, [clearInput, onStop]);

  const endListening = useCallback(() => {
    if (modeRef.current !== "listening") return;
    clearInput();
    setMode("thinking");
    const analyzer = analyzerRef.current;
    timersRef.current.push(
      window.setTimeout(() => {
        setMode("speaking");
        if (analyzer) startSynthetic(analyzer, "speaking");
        timersRef.current.push(window.setTimeout(goIdle, 3400));
      }, 1100),
    );
  }, [clearInput, goIdle, startSynthetic]);

  const beginListening = useCallback(async () => {
    clearInput();
    setMode("listening");
    onStart?.();
    const analyzer = await ensureAnalyzer();
    if (!analyzer) return;
    registerGradient(analyzer);
    await analyzer.audioCtx.resume().catch(() => {});
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const source = analyzer.audioCtx.createMediaStreamSource(stream);
      analyzer.connectInput(source);
      inputRef.current = source;
      setDenied(false);
    } catch {
      setDenied(true);
      startSynthetic(analyzer, "ambient");
    }
  }, [clearInput, ensureAnalyzer, onStart, registerGradient, startSynthetic]);

  const toggle = useCallback(() => {
    const current = modeRef.current;
    if (current === "idle") return void beginListening();
    if (current === "listening") return endListening();
    for (const timer of timersRef.current) window.clearTimeout(timer);
    timersRef.current = [];
    goIdle();
  }, [beginListening, endListening, goIdle]);

  useEffect(() => {
    return () => {
      for (const timer of timersRef.current) window.clearTimeout(timer);
      clearInput();
      analyzerRef.current?.destroy();
      analyzerRef.current = null;
    };
  }, [clearInput]);

  const active = mode !== "idle";

  return (
    <div className={className}>
      <div className="flex w-full flex-col-reverse overflow-hidden rounded-2xl bg-neutral-950 p-2 text-white shadow-lg">
        <div className="flex items-center gap-3">
          <Image
            alt=""
            aria-hidden="true"
            className="size-9 shrink-0 rounded-xl"
            height={36}
            src={avatarSrc}
            unoptimized
            width={36}
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium leading-none">
              {agentName}
            </p>
            <AnimatePresence initial={false} mode="popLayout">
              <motion.p
                animate={{ opacity: 1, y: 0 }}
                className="mt-1 flex items-center gap-1.5 truncate text-xs text-neutral-400"
                exit={{ opacity: 0, y: -6 }}
                initial={{ opacity: 0, y: 6 }}
                key={mode}
                transition={{ duration: 0.16, ease: "easeOut" }}
              >
                {mode === "thinking" && (
                  <SpinnerGapIcon className="size-3.5 animate-spin" weight="bold" />
                )}
                {mode === "idle"
                  ? "Tap to talk"
                  : mode === "listening"
                    ? "Listening..."
                    : mode === "thinking"
                      ? "Thinking..."
                      : "Speaking..."}
              </motion.p>
            </AnimatePresence>
          </div>
          <button
            className="flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium hover:bg-white/10"
            onClick={toggle}
            type="button"
          >
            {denied ? (
              <MicrophoneSlashIcon className="size-4" weight="bold" />
            ) : (
              <MicrophoneIcon className="size-4" weight="bold" />
            )}
            {active ? "Stop" : "Voice"}
          </button>
        </div>

        <motion.div
          animate={{ height: active ? panelHeight : 0, opacity: active ? 1 : 0 }}
          aria-hidden={!active}
          className="overflow-hidden"
          initial={false}
          transition={shouldReduceMotion ? { duration: 0 } : dockTransition}
        >
          <div className="mb-2 flex flex-col gap-2 rounded-xl bg-white/5 p-3">
            <div className="h-14 w-full overflow-hidden rounded-md text-white" ref={hostRef} />
            <p className="text-xs leading-4 text-neutral-400">
              {mode === "speaking" ? reply : "Press to stop."}
            </p>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
`;

export const usageSource = `import { VoiceDock } from "./voice-dock";

const avatarSrc =
  "https://api.dicebear.com/10.x/initial-face/svg?seed=Aria&size=80";

export function VoiceDockExample() {
  return (
    <VoiceDock
      agentName="Aria"
      avatarSrc={avatarSrc}
      className="w-full max-w-md"
      onStart={() => console.log("listening")}
      onStop={() => console.log("stopped")}
      reply="Sure — I've pulled your latest numbers together."
    />
  );
}
`;
