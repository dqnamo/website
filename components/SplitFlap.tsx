"use client";

import { useReducedMotion } from "motion/react";
import { type CSSProperties, useEffect, useState } from "react";
import { cn } from "@/helpers/classname-helper";
import styles from "./SplitFlap.module.css";

/**
 * The order of the leaves on each drum. Like a real split-flap unit, a cell
 * can only turn forwards, so going from B back to A means a full lap.
 */
export const SPLIT_FLAP_CHARSET = " ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789:.-'&/";

export type SplitFlapProps = {
  /** Text to show. Lowercase is uppercased; unknown characters become blanks. */
  value: string;
  /** Fixed number of cells. Defaults to the length of `value`. */
  length?: number;
  align?: "left" | "right";
  charset?: string;
  /** Milliseconds for a single leaf to fall. */
  flipDuration?: number;
  /** Wait before the first cell starts turning. */
  delay?: number;
  /** Extra wait per cell, so a word ripples in from the left. */
  stagger?: number;
  /** Start every cell blank and flip in on mount. */
  bootFromBlank?: boolean;
  /** Play a soft clack for every leaf (needs a prior user gesture). */
  sound?: boolean;
  /** Glyph colour. */
  ink?: string;
  className?: string;
  cellClassName?: string;
  "aria-hidden"?: boolean;
};

export function normalizeSplitFlapText(
  value: string,
  charset = SPLIT_FLAP_CHARSET,
) {
  return Array.from(value.toUpperCase())
    .map((character) => (charset.includes(character) ? character : " "))
    .join("");
}

function fitToLength(text: string, length: number, align: "left" | "right") {
  const clipped = text.slice(0, length);
  return align === "right"
    ? clipped.padStart(length, " ")
    : clipped.padEnd(length, " ");
}

/** Deterministic 0–1 noise so every drum has its own slightly worn motor. */
function wobble(seed: number) {
  // Integer hash, so server and browser agree to the last bit.
  let hash = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b);
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0xc2b2ae35);
  hash ^= hash >>> 16;
  return (hash >>> 0) / 4294967296;
}

export function SplitFlap({
  align = "left",
  bootFromBlank = true,
  cellClassName,
  charset = SPLIT_FLAP_CHARSET,
  className,
  delay = 0,
  flipDuration = 64,
  ink,
  length,
  sound = false,
  stagger = 24,
  value,
  "aria-hidden": ariaHidden,
}: SplitFlapProps) {
  const reduceMotion = useReducedMotion() ?? false;
  const text = normalizeSplitFlapText(value, charset);
  const characters = Array.from(
    fitToLength(text, length ?? text.length, align),
  );
  const label = text.trim();

  return (
    <span
      aria-hidden={ariaHidden}
      className={cn(styles.display, className)}
      style={ink ? ({ "--split-flap-ink": ink } as CSSProperties) : undefined}
    >
      {!ariaHidden && <span className="sr-only">{label}</span>}
      {characters.map((character, index) => (
        <SplitFlapCell
          bootFromBlank={bootFromBlank}
          character={character}
          charset={charset}
          className={cellClassName}
          delay={delay + index * stagger + wobble(index + 1) * stagger}
          flipDuration={flipDuration * (0.88 + wobble(index + 41) * 0.26)}
          // Cells are positional: the drum in slot 3 stays in slot 3.
          // biome-ignore lint/suspicious/noArrayIndexKey: positional cells
          key={index}
          reduceMotion={reduceMotion}
          sound={sound}
        />
      ))}
    </span>
  );
}

type CellState = {
  /** Leaf showing before the current flip. */
  from: number;
  /** Leaf showing now (or about to land). */
  to: number;
  /** Increments for every leaf that falls; remounts the moving flaps. */
  flip: number;
  moving: boolean;
};

function SplitFlapCell({
  bootFromBlank,
  character,
  charset,
  className,
  delay,
  flipDuration,
  reduceMotion,
  sound,
}: {
  bootFromBlank: boolean;
  character: string;
  charset: string;
  className?: string;
  delay: number;
  flipDuration: number;
  reduceMotion: boolean;
  sound: boolean;
}) {
  const target = Math.max(0, charset.indexOf(character));
  const [state, setState] = useState<CellState>(() => {
    const start = bootFromBlank ? 0 : target;
    return { flip: 0, from: start, moving: false, to: start };
  });

  useEffect(() => {
    if (reduceMotion) {
      if (state.to !== target) {
        setState({ flip: 0, from: target, moving: false, to: target });
      }
      return;
    }

    if (state.to === target) {
      if (state.moving) {
        setState((current) => ({ ...current, moving: false }));
      }
      return;
    }

    const timer = window.setTimeout(
      () => {
        setState((current) => ({
          flip: current.flip + 1,
          from: current.to,
          moving: true,
          to: (current.to + 1) % charset.length,
        }));
        if (sound) {
          playFlapClack((state.to + 1) % charset.length === target);
        }
      },
      state.moving ? flipDuration : delay,
    );

    return () => window.clearTimeout(timer);
  }, [charset.length, delay, flipDuration, reduceMotion, sound, state, target]);

  const fromGlyph = charset[state.from] ?? " ";
  const toGlyph = charset[state.to] ?? " ";
  const isFlipping = state.flip > 0 && state.from !== state.to;
  const settling = state.to === target;
  const duration = Math.round(flipDuration * (settling ? 2.4 : 1.15));

  return (
    <span
      aria-hidden="true"
      className={cn(styles.cell, className)}
      style={{ "--split-flap-duration": `${duration}ms` } as CSSProperties}
    >
      <span className={cn(styles.half, styles.top)}>
        <span className={styles.glyph}>{toGlyph}</span>
      </span>
      <span className={cn(styles.half, styles.bottom)}>
        <span className={styles.glyph}>{isFlipping ? fromGlyph : toGlyph}</span>
      </span>

      {isFlipping && (
        <span className="contents" key={state.flip}>
          <span className={styles.castShadow} />
          <span className={cn(styles.half, styles.top, styles.flapTop)}>
            <span className={styles.glyph}>{fromGlyph}</span>
          </span>
          <span
            className={cn(
              styles.half,
              styles.bottom,
              styles.flapBottom,
              settling && styles.settle,
            )}
          >
            <span className={styles.glyph}>{toGlyph}</span>
          </span>
        </span>
      )}

      <span className={styles.hinge} />
    </span>
  );
}

/* ---------------------------------------------------------------- Sound -- */

let audioContext: AudioContext | null = null;
let noiseBuffer: AudioBuffer | null = null;
let lastClackAt = 0;

function getAudio() {
  if (typeof window === "undefined") {
    return null;
  }

  if (!audioContext) {
    const AudioContextClass =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioContextClass) {
      return null;
    }
    audioContext = new AudioContextClass();
    const length = Math.floor(audioContext.sampleRate * 0.03);
    noiseBuffer = audioContext.createBuffer(1, length, audioContext.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let index = 0; index < length; index += 1) {
      data[index] = (Math.random() * 2 - 1) * (1 - index / length) ** 3;
    }
  }

  if (audioContext.state === "suspended") {
    void audioContext.resume();
  }

  return audioContext;
}

/** Call from a click handler so browsers let the clacks play. */
export function unlockSplitFlapSound() {
  getAudio();
}

function playFlapClack(final: boolean) {
  const context = getAudio();
  if (!context || !noiseBuffer || context.state !== "running") {
    return;
  }

  // A whole board turning at once is a rattle, not a hundred separate clicks.
  const now = context.currentTime;
  if (!final && now - lastClackAt < 0.009) {
    return;
  }
  lastClackAt = now;

  const source = context.createBufferSource();
  source.buffer = noiseBuffer;
  source.playbackRate.value = 0.8 + Math.random() * 0.5;

  const filter = context.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = final ? 1400 : 2600 + Math.random() * 1200;
  filter.Q.value = final ? 1.4 : 2.2;

  const gain = context.createGain();
  gain.gain.value = final ? 0.22 : 0.07;

  source.connect(filter).connect(gain).connect(context.destination);
  source.start(now);
}
