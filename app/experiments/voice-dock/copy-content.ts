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

type VoiceMode = "idle" | "listening" | "thinking";

type VoiceDockProps = {
  agentName: string;
  avatarSrc: string;
  className?: string;
  onSubmit?: () => void | Promise<void>;
};

const panelHeight = 120;

const dockTransition = { duration: 0.3, ease: [0.22, 1, 0.36, 1] } as const;

export function VoiceDock({
  agentName,
  avatarSrc,
  className,
  onSubmit,
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

  modeRef.current = mode;

  const ensureAnalyzer = useCallback(async () => {
    if (analyzerRef.current) return analyzerRef.current;
    if (!hostRef.current) return null;
    const { default: AudioMotionAnalyzer } = await import(
      "audiomotion-analyzer"
    );
    const analyzer = new AudioMotionAnalyzer(hostRef.current, {
      barSpace: 0.32,
      colorMode: "bar-index", // rainbow across bars
      connectSpeakers: false, // analyze only, no feedback
      gradient: "rainbow",
      mode: 4, // 1/6 octave bands
      overlay: true,
      reflexAlpha: 0.22,
      reflexRatio: 0.34,
      roundBars: true,
      showBgColor: false,
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

  // Filtered broadband noise stands in when a mic isn't available, so the
  // whole colorful spectrum still lights up during the demo.
  const startSyntheticAmbient = useCallback((analyzer: AudioMotionAnalyzer) => {
    const ctx = analyzer.audioCtx;
    const buffer = ctx.createBuffer(1, 2 * ctx.sampleRate, ctx.sampleRate);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < channel.length; i++) channel[i] = Math.random() * 2 - 1;
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
    inputRef.current = gain;
    const interval = window.setInterval(() => {
      gain.gain.setTargetAtTime(0.3 + Math.random() * 0.5, ctx.currentTime, 0.1);
      filter.frequency.setTargetAtTime(300 + Math.random() * 3200, ctx.currentTime, 0.18);
    }, 180);
    syntheticRef.current = { interval, nodes: [noise, filter, gain] };
  }, []);

  // Stop capturing and hand off to the agent's thinking state.
  const endListening = useCallback(() => {
    if (modeRef.current !== "listening") return;
    clearInput();
    setMode("thinking");
    void onSubmit?.();
  }, [clearInput, onSubmit]);

  const goIdle = useCallback(() => {
    clearInput();
    setMode("idle");
  }, [clearInput]);

  const beginListening = useCallback(async () => {
    clearInput();
    setDenied(false);
    setMode("listening");
    const analyzer = await ensureAnalyzer();
    if (!analyzer) return;
    await analyzer.audioCtx.resume().catch(() => {});
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const source = analyzer.audioCtx.createMediaStreamSource(stream);
      analyzer.connectInput(source);
      inputRef.current = source;
    } catch {
      setDenied(true);
      startSyntheticAmbient(analyzer);
    }
  }, [clearInput, ensureAnalyzer, startSyntheticAmbient]);

  const toggle = useCallback(() => {
    const current = modeRef.current;
    if (current === "idle") return void beginListening();
    if (current === "listening") return endListening();
    goIdle();
  }, [beginListening, endListening, goIdle]);

  useEffect(() => {
    return () => {
      clearInput();
      analyzerRef.current?.destroy();
      analyzerRef.current = null;
    };
  }, [clearInput]);

  const listening = mode === "listening";

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
                    : "Thinking..."}
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
            {listening ? "Stop" : "Voice"}
          </button>
        </div>

        <motion.div
          animate={{ height: listening ? panelHeight : 0, opacity: listening ? 1 : 0 }}
          aria-hidden={!listening}
          className="overflow-hidden"
          initial={false}
          transition={shouldReduceMotion ? { duration: 0 } : dockTransition}
        >
          <div className="mb-2 rounded-xl bg-white/5 p-2">
            <div className="h-24 w-full overflow-hidden rounded-md" ref={hostRef} />
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
      onSubmit={async () => {
        // hand the captured audio off to your agent here
        await transcribeAndRespond();
      }}
    />
  );
}
`;
