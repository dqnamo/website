"use client";

import { Slider } from "@base-ui/react/slider";
import {
  ArrowsInSimpleIcon,
  ArrowsOutSimpleIcon,
  BroomIcon,
  CaretLeftIcon,
  CaretRightIcon,
  GrainsIcon,
  HandIcon,
  MicrophoneIcon,
  MusicNoteIcon,
  PauseIcon,
  PlayIcon,
  WaveformIcon,
} from "@phosphor-icons/react";
import {
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { flushSync } from "react-dom";
import Button, { getButtonClassName } from "@/components/public/Button";
import { Radio } from "@/components/public/Radio";
import { Switch } from "@/components/public/Switch";
import { cn } from "@/helpers/classname-helper";
import {
  type Chladni,
  type ChladniResponse,
  type ChladniSettings,
  type ChladniStats,
  createChladni,
  MAX_HZ,
  MIN_HZ,
  type Resonance,
} from "@/lib/chladni/engine";
import { createSound, type Sound } from "@/lib/chladni/sound";
import { type Heard, listen } from "@/lib/chladni/voice";
import { DEFAULTS, GRAINS, METALS, type Settings, SHAPES } from "./presets";

type Point = { x: number; y: number };

type Gesture = {
  start: Point;
  last: Point;
  mode: "pending" | "pouring" | "bowing";
};

const NOTES = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"];

function noteName(hz: number) {
  const midi = 69 + 12 * Math.log2(hz / 440);
  const nearest = Math.round(midi);
  const cents = Math.round((midi - nearest) * 100);
  const name = `${NOTES[((nearest % 12) + 12) % 12]}${Math.floor(nearest / 12) - 1}`;
  if (!cents) return name;
  return `${name} ${cents > 0 ? "+" : "−"}${Math.abs(cents)}¢`;
}

function formatHz(hz: number) {
  return hz >= 1000 ? `${(hz / 1000).toFixed(2)} kHz` : `${hz.toFixed(1)} Hz`;
}

// The coarse dial turns evenly in pitch, so each octave gets the same travel.
const DIAL = 1000;
const toDial = (hz: number) =>
  Math.round((Math.log(hz / MIN_HZ) / Math.log(MAX_HZ / MIN_HZ)) * DIAL);
const fromDial = (value: number) =>
  MIN_HZ * (MAX_HZ / MIN_HZ) ** (value / DIAL);

const frequencyOf = (settings: Settings) =>
  settings.coarse * 2 ** (settings.fine / 1200);

// Where round the edge the bow sits, read as a clock face.
function clockFace(t: number) {
  const hours = (((12 * t - 1.5) % 12) + 12) % 12;
  const hour = Math.round(hours) % 12 || 12;
  return `${hour} o'clock`;
}

function engineSettings(settings: Settings): ChladniSettings {
  return {
    shape: settings.shape,
    metal: settings.metal,
    grains: settings.grains,
    driver: settings.driver,
    frequency: frequencyOf(settings),
    amplitude: settings.amplitude,
    bowAt: settings.bowAt,
  };
}

// One of the counts at the top of the panel: a small chip with an icon and the figure. What it
// counts is in the tooltip and for screen readers.
function Metric({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-md bg-grayscale-2 px-1.5 py-0.5 font-medium text-grayscale-11 text-xs tabular-nums dark:bg-grayscale-3"
      title={label}
    >
      <span aria-hidden="true" className="opacity-80">
        {icon}
      </span>
      <span>{value}</span>
      <span className="sr-only">{label}</span>
    </span>
  );
}

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="grid gap-3 border-grayscale-3 border-t px-4 py-3.5 dark:border-grayscale-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-medium text-grayscale-12 text-xs">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Range({
  label,
  value,
  min,
  max,
  step = 1,
  disabled = false,
  format,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  disabled?: boolean;
  format: (value: number) => string;
  onChange: (value: number) => void;
}) {
  return (
    <Slider.Root
      className="grid gap-1.5 transition-opacity data-[disabled]:opacity-45"
      disabled={disabled}
      max={max}
      min={min}
      onValueChange={(next) => onChange(next)}
      step={step}
      value={value}
    >
      <div className="flex items-baseline justify-between gap-3 text-xs">
        <Slider.Label className="text-grayscale-11">{label}</Slider.Label>
        <span className="shrink-0 whitespace-nowrap text-grayscale-10 tabular-nums">
          {format(value)}
        </span>
      </div>
      <Slider.Control className="flex h-4 w-full cursor-pointer touch-none items-center data-[disabled]:cursor-default">
        <Slider.Track className="relative h-1.5 w-full rounded-full bg-grayscale-3 dark:bg-grayscale-5">
          <Slider.Indicator className="absolute h-full rounded-full bg-grayscale-6 dark:bg-grayscale-8" />
          <Slider.Thumb
            className="block size-4 rounded-full border border-grayscale-4 bg-white small-shadow outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-grayscale-7 dark:border-grayscale-9 dark:bg-grayscale-8"
            getAriaValueText={(_, next) => format(next)}
          />
        </Slider.Track>
      </Slider.Control>
    </Slider.Root>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-3">
      <label className="cursor-pointer text-grayscale-11 text-xs" htmlFor={id}>
        {label}
      </label>
      <Switch.Composed
        checked={checked}
        id={id}
        onCheckedChange={(next) => onChange(next)}
      />
    </div>
  );
}

function Choice<T extends string>({
  label,
  value,
  options,
  columns,
  onChange,
}: {
  label: string;
  value: T | null;
  options: { value: T; label: string; detail?: string }[];
  columns: 2 | 3 | 4;
  onChange: (value: T) => void;
}) {
  return (
    <Radio.Group
      aria-label={label}
      className={cn(
        "grid gap-1",
        columns === 2 && "grid-cols-2",
        columns === 3 && "grid-cols-3",
        columns === 4 && "grid-cols-4",
      )}
      onValueChange={(next) => onChange(next as T)}
      value={value}
    >
      {options.map((option) => (
        <Radio.Root
          className="py-1 text-center"
          key={option.value}
          title={option.detail}
          value={option.value}
        >
          {option.label}
        </Radio.Root>
      ))}
    </Radio.Group>
  );
}

// The plate's response to the driver across the generator's range, as a resonance curve: tall
// peaks where a mode answers, the line where sand starts to lift, and a needle at the dial.
// Pressing on it tunes there, settling on a peak if one is close.
const PLOT_LOW = -1.6;
const PLOT_HIGH = 2;

const yOf = (g: number) =>
  1 - (Math.log10(Math.max(g, 1e-3)) - PLOT_LOW) / (PLOT_HIGH - PLOT_LOW);
const xOf = (value: number) =>
  Math.log(value / MIN_HZ) / Math.log(MAX_HZ / MIN_HZ);

function ResponsePlot({
  response,
  hz,
  onPick,
}: {
  response: ChladniResponse | null;
  hz: number;
  onPick: (hz: number) => void;
}) {
  const path = useMemo(() => {
    if (!response) return null;
    const { curve } = response;
    let line = "";
    for (let s = 0; s < curve.length; s++) {
      const x = (s / (curve.length - 1)) * 100;
      const y = Math.min(1, Math.max(0, yOf(curve[s]))) * 100;
      line += `${s ? "L" : "M"}${x.toFixed(2)} ${y.toFixed(2)}`;
    }
    return { line, area: `${line}L100 100L0 100Z` };
  }, [response]);

  const pick = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const t = Math.min(
      1,
      Math.max(0, (event.clientX - rect.left) / rect.width),
    );
    onPick(MIN_HZ * (MAX_HZ / MIN_HZ) ** t);
  };
  const lift = Math.min(1, Math.max(0, yOf(1))) * 100;

  return (
    <div className="grid gap-1">
      <div
        aria-hidden="true"
        className="relative h-16 cursor-pointer touch-none select-none overflow-hidden rounded-md bg-grayscale-2 dark:bg-grayscale-3"
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          pick(event);
        }}
        onPointerMove={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId))
            pick(event);
        }}
      >
        <svg
          className="absolute inset-0 size-full"
          preserveAspectRatio="none"
          viewBox="0 0 100 100"
        >
          <title>The plate's response to the driver</title>
          {path && (
            <>
              <path
                className="fill-grayscale-5 dark:fill-grayscale-6"
                d={path.area}
                opacity={0.55}
              />
              <path
                className="fill-none stroke-grayscale-10"
                d={path.line}
                strokeWidth={1.2}
                vectorEffect="non-scaling-stroke"
              />
            </>
          )}
          <line
            className="stroke-grayscale-8"
            strokeDasharray="3 3"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
            x1={0}
            x2={100}
            y1={lift}
            y2={lift}
          />
          <line
            className="stroke-accent-9"
            strokeWidth={1.5}
            vectorEffect="non-scaling-stroke"
            x1={xOf(hz) * 100}
            x2={xOf(hz) * 100}
            y1={0}
            y2={100}
          />
        </svg>
        <span className="pointer-events-none absolute top-1 right-1.5 text-[10px] text-grayscale-10">
          1 g
        </span>
      </div>
      <div className="flex justify-between text-[10px] text-grayscale-10 tabular-nums">
        <span>{MIN_HZ} Hz</span>
        <span>300 Hz</span>
        <span>{MAX_HZ / 1000} kHz</span>
      </div>
    </div>
  );
}

export default function ChladniLab() {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const plateRef = useRef<Chladni | null>(null);
  const soundRef = useRef<Sound | null>(null);
  const meterRef = useRef<HTMLSpanElement>(null);
  const [settings, setSettings] = useState(DEFAULTS);
  const [stats, setStats] = useState<ChladniStats>({
    grains: 0,
    hz: null,
    ready: false,
    fingers: 0,
    bowing: false,
  });
  const [response, setResponse] = useState<ChladniResponse | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [touched, setTouched] = useState(false);
  const [bowing, setBowing] = useState(false);
  const [touring, setTouring] = useState(false);
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [micError, setMicError] = useState<string | null>(null);

  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const grainsRef = useRef(stats.grains);
  grainsRef.current = stats.grains;
  const resonancesRef = useRef<Resonance[]>([]);
  resonancesRef.current = response?.resonances ?? [];

  const set =
    <K extends keyof Settings>(key: K) =>
    (value: Settings[K]) =>
      setSettings((current) => ({ ...current, [key]: value }));

  const frequency = frequencyOf(settings);

  // Gliding the dial from one frequency to another, evenly in pitch, so the sand can be seen
  // letting go of one figure and finding the next.
  const glide = useRef(0);
  const glideTo = useCallback((target: number) => {
    cancelAnimationFrame(glide.current);
    const from = frequencyOf(settingsRef.current);
    const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) {
      setSettings((current) => ({ ...current, coarse: target, fine: 0 }));
      return;
    }
    const started = performance.now();
    const duration =
      500 + Math.min(1100, Math.abs(Math.log2(target / from)) * 900);
    const run = (now: number) => {
      const t = Math.min(1, (now - started) / duration);
      const eased = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
      const hz = from * (target / from) ** eased;
      setSettings((current) => ({ ...current, coarse: hz, fine: 0 }));
      if (t < 1) glide.current = requestAnimationFrame(run);
    };
    glide.current = requestAnimationFrame(run);
  }, []);
  useEffect(() => () => cancelAnimationFrame(glide.current), []);

  // The next resonance up or down from the dial. The tour keeps to those strong enough at
  // this amplitude to draw a whole figure, and skips the lowest, which only sweep sand to the
  // bolt.
  const nextResonance = useCallback((direction: 1 | -1, tour = false) => {
    const list = resonancesRef.current.filter(
      (entry) => !tour || (entry.peak >= 5 && entry.hz > 150),
    );
    if (!list.length) return null;
    const hz = frequencyOf(settingsRef.current);
    if (direction > 0) {
      const next = list.find((entry) => entry.hz > hz * 1.003);
      return next ?? (tour ? list[0] : null);
    }
    const before = list.filter((entry) => entry.hz < hz / 1.003);
    return before[before.length - 1] ?? (tour ? list[list.length - 1] : null);
  }, []);

  // The first time the plate's resonances are known, and after the plate changes, the dial
  // settles on the nearest strong one, as anyone demonstrating would retune.
  const retune = useRef(true);
  const onResponse = useCallback(
    (next: ChladniResponse) => {
      setResponse(next);
      if (!retune.current || !next.resonances.length) return;
      retune.current = false;
      const hz = frequencyOf(settingsRef.current);
      // The lowest mode or two only sweep sand to the bolt, so it looks a little higher.
      const strong = next.resonances.filter(
        (entry) => entry.peak > 3 && entry.hz > 150,
      );
      const pool = strong.length ? strong : next.resonances;
      let best = pool[0];
      for (const entry of pool)
        if (
          Math.abs(Math.log(entry.hz / hz)) < Math.abs(Math.log(best.hz / hz))
        )
          best = entry;
      if (settingsRef.current.driver) glideTo(best.hz);
      else setSettings((current) => ({ ...current, coarse: best.hz, fine: 0 }));
    },
    [glideTo],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const sound = createSound();
    soundRef.current = sound;
    let plate: Chladni;
    try {
      plate = createChladni(canvas, engineSettings(settingsRef.current), {
        onStats: setStats,
        onResponse,
        onSound: (state) => sound.update(state),
      });
    } catch (err) {
      console.error(err);
      setError("This browser couldn't start a canvas for the plate.");
      return;
    }
    plateRef.current = plate;
    return () => {
      plateRef.current = null;
      plate.dispose();
      sound.dispose();
      soundRef.current = null;
    };
  }, [onResponse]);

  const previous = useRef(settings);
  useEffect(() => {
    const before = previous.current;
    previous.current = settings;
    if (before.shape !== settings.shape || before.metal !== settings.metal)
      retune.current = true;
    plateRef.current?.setSettings(engineSettings(settings));
    soundRef.current?.setEnabled(settings.sound);
  }, [settings]);

  // Sound starts with the first press or key anywhere in the lab, as browsers ask.
  const wake = () => {
    soundRef.current?.ensure();
  };

  // Touring: from one resonance to the next every few seconds, round and round.
  useEffect(() => {
    if (!touring) return;
    const advance = () => {
      const next = nextResonance(1, true);
      if (next) glideTo(next.hz);
      // Each figure leaves some sand at the bolt and some on the bench, so a demonstrator
      // shakes a little more on as they go.
      if (grainsRef.current < 9000) plateRef.current?.sprinkle(3500);
    };
    advance();
    const timer = window.setInterval(advance, 6000);
    return () => window.clearInterval(timer);
  }, [touring, nextResonance, glideTo]);

  const gestures = useRef(new Map<number, Gesture>());

  const local = (event: { clientX: number; clientY: number }) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    return rect
      ? { x: event.clientX - rect.left, y: event.clientY - rect.top }
      : { x: 0, y: 0 };
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const plate = plateRef.current;
    if (!plate) return;
    wake();
    const at = local(event);
    const region = plate.region(at, event.pointerType !== "mouse");
    if (region === "bench") return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setTouched(true);
    if (region === "edge") {
      gestures.current.set(event.pointerId, {
        start: at,
        last: at,
        mode: "bowing",
      });
      plate.bow(at);
      setBowing(true);
      if (stageRef.current) stageRef.current.style.cursor = "grabbing";
      return;
    }
    gestures.current.set(event.pointerId, {
      start: at,
      last: at,
      mode: "pending",
    });
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const plate = plateRef.current;
    if (!plate) return;
    const at = local(event);
    const gesture = gestures.current.get(event.pointerId);
    if (!gesture) {
      if (event.pointerType === "mouse" && stageRef.current) {
        const region = plate.region(at);
        stageRef.current.style.cursor =
          region === "edge"
            ? "grab"
            : region === "plate"
              ? "crosshair"
              : "default";
      }
      return;
    }
    if (gesture.mode === "bowing") {
      plate.bow(at);
      gesture.last = at;
      return;
    }
    const moved = Math.hypot(at.x - gesture.start.x, at.y - gesture.start.y);
    if (gesture.mode === "pending" && moved < 6) return;
    gesture.mode = "pouring";
    // A shaker drawn across the plate lets out sand in proportion to the ground it covers.
    const travelled = Math.hypot(at.x - gesture.last.x, at.y - gesture.last.y);
    plate.pour(at, Math.min(120, Math.round(4 + travelled * 3)));
    gesture.last = at;
  };

  const onPointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = gestures.current.get(event.pointerId);
    if (!gesture) return;
    gestures.current.delete(event.pointerId);
    if (gesture.mode === "bowing") {
      if (![...gestures.current.values()].some((g) => g.mode === "bowing")) {
        plateRef.current?.bow(null);
        setBowing(false);
      }
      if (stageRef.current) stageRef.current.style.cursor = "grab";
      return;
    }
    // A tap rests a fingertip on the plate, or lifts one that's there.
    if (gesture.mode === "pending" && event.type === "pointerup") {
      plateRef.current?.touch(gesture.start);
    }
  };

  const startPanelBow = () => {
    wake();
    setTouched(true);
    setBowing(true);
    plateRef.current?.bow("panel");
  };
  const stopPanelBow = () => {
    if (!bowing) return;
    plateRef.current?.bow(null);
    setBowing(false);
  };

  // Singing into the microphone drives the plate at the note it hears. The plate's own sound
  // is held back meanwhile, so it doesn't hear itself and feed back.
  const mic = useRef<{ stop: () => void } | null>(null);
  const micStarting = useRef(false);

  const stopListening = useCallback(() => {
    mic.current?.stop();
    mic.current = null;
    plateRef.current?.setVoice(null);
    soundRef.current?.setMuted(false);
    setListening(false);
    setHeard(null);
  }, []);

  const startListening = async () => {
    if (mic.current || micStarting.current) return;
    micStarting.current = true;
    setMicError(null);
    try {
      let shown = 0;
      mic.current = await listen((next: Heard, level: number) => {
        plateRef.current?.setVoice(next);
        if (meterRef.current)
          meterRef.current.style.transform = `scaleX(${level})`;
        const now = performance.now();
        if (now - shown > 200) {
          shown = now;
          setHeard(next ? next.hz : null);
        }
      });
      soundRef.current?.setMuted(true);
      setListening(true);
      setTouched(true);
      setTouring(false);
    } catch (err) {
      console.error(err);
      setMicError("The microphone isn't available here.");
    } finally {
      micStarting.current = false;
    }
  };

  useEffect(() => stopListening, [stopListening]);

  // Full screen is the same plate in a bigger frame. The page under it collapses meanwhile, so
  // its scroll position is put back on the way out. Where the browser can, the plate and its
  // panel grow into place as a view transition; elsewhere, and with reduced motion, they switch.
  const fullscreenRef = useRef(false);
  const pageScroll = useRef(0);
  const showFullscreen = useCallback((on: boolean) => {
    if (fullscreenRef.current === on) return;
    fullscreenRef.current = on;
    if (on) pageScroll.current = window.scrollY;
    const update = () => {
      flushSync(() => setFullscreen(on));
      if (!on) window.scrollTo(0, pageScroll.current);
    };
    const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (document.startViewTransition && !reduceMotion) {
      document.startViewTransition(update);
    } else {
      update();
    }
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") showFullscreen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showFullscreen]);

  const sounding = stats.hz;
  const previousPeak = nextResonance(-1);
  const nextPeak = nextResonance(1);

  return (
    <div
      className={
        fullscreen
          ? "fixed inset-0 z-50 flex flex-col bg-grayscale-1"
          : "contents"
      }
      data-lab-fullscreen={fullscreen ? "" : undefined}
      onKeyDownCapture={wake}
      onPointerDownCapture={wake}
    >
      <div
        className={
          fullscreen ? "flex min-h-0 flex-1 flex-col lg:flex-row" : "contents"
        }
      >
        {/* Beside the panel, the plate fills the window and stays in view while the panel
            scrolls. Its cell takes the panel's height without counting the plate towards it,
            so on a very tall window the plate stops at the panel's height. */}
        <div
          className={
            fullscreen ? "contents" : "w-full min-w-0 lg:[contain:size]"
          }
        >
          {/* biome-ignore lint/a11y/noStaticElementInteractions: the plate is bowed and touched with a pointer; the panel's buttons do the same things by keyboard. */}
          <div
            className={cn(
              "relative touch-none select-none overflow-hidden bg-white [view-transition-name:lab-pane] dark:bg-grayscale-2",
              fullscreen
                ? "h-[55dvh] shrink-0 lg:h-auto lg:min-w-0 lg:flex-1"
                : "h-[34rem] w-full min-w-0 rounded-[13px] border border-grayscale-3 small-shadow lg:sticky lg:top-6 lg:h-[calc(100dvh-3rem)] lg:max-h-full dark:border-grayscale-4",
            )}
            onContextMenu={(event) => event.preventDefault()}
            onLostPointerCapture={onPointerEnd}
            onPointerCancel={onPointerEnd}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerEnd}
            ref={stageRef}
          >
            {/* A faint dot grid on the bench, so it reads as a surface, and shows through glass. */}
            <div
              aria-hidden="true"
              className="absolute inset-0 bg-[radial-gradient(var(--gray-5)_1px,transparent_1.5px)] bg-size-[20px_20px] bg-center opacity-60 dark:bg-[radial-gradient(var(--gray-4)_1px,transparent_1.5px)]"
            />
            <canvas
              aria-label="A metal plate bolted at its centre, sprinkled with sand. Hold its edge to bow it, tap it to rest a finger on it, or drag across it to pour more sand."
              className="absolute inset-0 size-full"
              ref={canvasRef}
              role="img"
            />

            <p
              aria-hidden="true"
              className={cn(
                "pointer-events-none absolute top-3 right-3 left-3 mx-auto w-fit rounded-full bg-black/55 px-3 py-1 text-center text-white/90 text-xs backdrop-blur-sm transition-opacity duration-500",
                (touched || error) && "opacity-0",
              )}
            >
              Hold the edge to bow · Tap to rest a finger · Drag to pour
            </p>

            {!stats.ready && !error && (
              <p className="pointer-events-none absolute right-3 bottom-3 left-3 mx-auto w-fit rounded-full bg-black/55 px-3 py-1 text-center text-white/90 text-xs backdrop-blur-sm">
                Working out how the plate rings…
              </p>
            )}

            {error && (
              <p
                className="absolute top-3 right-3 left-3 mx-auto w-fit rounded-lg border border-grayscale-4 bg-grayscale-1 px-3 py-2 text-grayscale-12 text-xs small-shadow"
                role="alert"
              >
                {error}
              </p>
            )}
          </div>
        </div>

        <aside
          aria-label="Chladni plate controls"
          className={cn(
            "relative flex flex-col bg-grayscale-1 [view-transition-name:lab-panel]",
            fullscreen
              ? "min-h-0 flex-1 overflow-y-auto border-grayscale-3 border-t [scrollbar-color:var(--gray-6)_transparent] [scrollbar-width:thin] lg:w-80 lg:flex-none lg:border-t-0 lg:border-l dark:border-grayscale-4"
              : "w-full min-w-0 rounded-[13px] border border-grayscale-3 small-shadow dark:border-grayscale-4",
          )}
        >
          <div className="grid gap-3 p-4">
            <div className="flex flex-wrap gap-1.5">
              <Metric
                icon={<WaveformIcon size={12} weight="bold" />}
                label="the pitch the plate is sounding"
                value={sounding ? formatHz(sounding) : "Quiet"}
              />
              <Metric
                icon={<MusicNoteIcon size={12} weight="bold" />}
                label="as a note"
                value={sounding ? noteName(sounding) : "—"}
              />
              <Metric
                icon={<GrainsIcon size={12} weight="bold" />}
                label="grains on the plate"
                value={stats.grains.toLocaleString("en-GB")}
              />
              {stats.fingers > 0 && (
                <Metric
                  icon={<HandIcon size={12} weight="bold" />}
                  label={
                    stats.fingers === 1
                      ? "finger resting on it"
                      : "fingers resting on it"
                  }
                  value={String(stats.fingers)}
                />
              )}
            </div>
            <div className="flex gap-1.5">
              <Button
                className="flex-auto whitespace-nowrap text-xs"
                onClick={() => plateRef.current?.sprinkle()}
                title="Shake more sand over the plate"
                type="button"
              >
                Sprinkle
              </Button>
              <button
                aria-pressed={bowing}
                className={getButtonClassName({
                  variant: "secondary",
                  className:
                    "flex-auto touch-none select-none whitespace-nowrap text-xs aria-pressed:border-grayscale-6 aria-pressed:bg-grayscale-3 aria-pressed:text-grayscale-12 dark:aria-pressed:bg-grayscale-5",
                })}
                onBlur={stopPanelBow}
                onContextMenu={(event) => event.preventDefault()}
                onKeyDown={(event) => {
                  if (
                    (event.key === " " || event.key === "Enter") &&
                    !event.repeat
                  )
                    startPanelBow();
                }}
                onKeyUp={(event) => {
                  if (event.key === " " || event.key === "Enter")
                    stopPanelBow();
                }}
                onPointerCancel={stopPanelBow}
                onPointerDown={startPanelBow}
                onPointerLeave={stopPanelBow}
                onPointerUp={stopPanelBow}
                title="Hold to draw the bow down the edge"
                type="button"
              >
                Hold to bow
              </button>
              <Button
                aria-label="Brush off"
                className="w-7 shrink-0 px-0"
                onClick={() => plateRef.current?.clear()}
                title="Brush the plate and bench clean"
                type="button"
                variant="secondary"
              >
                <BroomIcon aria-hidden="true" size={14} weight="bold" />
              </Button>
              <Button
                aria-label={fullscreen ? "Exit full screen" : "Full screen"}
                className="w-7 shrink-0 px-0"
                onClick={() => showFullscreen(!fullscreen)}
                title={fullscreen ? "Exit full screen (Esc)" : "Full screen"}
                type="button"
                variant="secondary"
              >
                {fullscreen ? (
                  <ArrowsInSimpleIcon
                    aria-hidden="true"
                    size={14}
                    weight="bold"
                  />
                ) : (
                  <ArrowsOutSimpleIcon
                    aria-hidden="true"
                    size={14}
                    weight="bold"
                  />
                )}
              </Button>
            </div>
            <p className="text-pretty text-grayscale-10 text-xs leading-5">
              Hold the plate's edge to bow it, as Chladni did. Tap the plate to
              rest a fingertip there: every mode that moves under it goes quiet,
              and the bow finds another.
            </p>
          </div>

          <Section
            action={
              <Switch.Composed
                aria-label="Signal generator"
                checked={settings.driver}
                onCheckedChange={(next) => {
                  set("driver")(next);
                  if (!next) setTouring(false);
                }}
              />
            }
            title="Signal generator"
          >
            <ResponsePlot
              hz={listening && heard ? heard : frequency}
              onPick={(hz) => {
                setTouring(false);
                // A press near a peak lands on it; tuning to a few cents by hand is the fine
                // dial's job.
                const near = resonancesRef.current.find(
                  (entry) => Math.abs(Math.log2(entry.hz / hz)) < 0.03,
                );
                setSettings((current) => ({
                  ...current,
                  driver: true,
                  coarse: near ? near.hz : hz,
                  fine: 0,
                }));
              }}
              response={response}
            />
            <div className="flex items-center gap-1.5">
              <Button
                aria-label="Previous resonance"
                className="w-7 shrink-0 px-0"
                disabled={!previousPeak}
                onClick={() => {
                  setTouring(false);
                  set("driver")(true);
                  if (previousPeak) glideTo(previousPeak.hz);
                }}
                title="Glide down to the previous resonance"
                type="button"
                variant="secondary"
              >
                <CaretLeftIcon aria-hidden="true" size={13} weight="bold" />
              </Button>
              <p
                aria-live="polite"
                className="flex-auto text-center text-grayscale-12 text-xs tabular-nums"
              >
                {formatHz(frequency)}
                <span className="text-grayscale-10">
                  {" "}
                  · {noteName(frequency)}
                </span>
              </p>
              <Button
                aria-label="Next resonance"
                className="w-7 shrink-0 px-0"
                disabled={!nextPeak}
                onClick={() => {
                  setTouring(false);
                  set("driver")(true);
                  if (nextPeak) glideTo(nextPeak.hz);
                }}
                title="Glide up to the next resonance"
                type="button"
                variant="secondary"
              >
                <CaretRightIcon aria-hidden="true" size={13} weight="bold" />
              </Button>
            </div>
            <Range
              format={(v) =>
                formatHz(
                  v === toDial(settings.coarse) ? settings.coarse : fromDial(v),
                )
              }
              label="Frequency"
              max={DIAL}
              min={0}
              onChange={(v) => {
                setTouring(false);
                setSettings((current) => ({ ...current, coarse: fromDial(v) }));
              }}
              value={toDial(settings.coarse)}
            />
            <Range
              format={(v) =>
                v ? `${v > 0 ? "+" : "−"}${Math.abs(v)} cents` : "Centred"
              }
              label="Fine tune"
              max={50}
              min={-50}
              onChange={(v) => {
                setTouring(false);
                set("fine")(v);
              }}
              value={settings.fine}
            />
            <Range
              format={(v) => {
                const g = 0.003 * 500 ** (v / 100);
                return g < 0.1
                  ? `${(g * 1000).toFixed(0)} mg`
                  : `${g.toFixed(2)} g`;
              }}
              label="Amplitude"
              max={100}
              min={0}
              onChange={set("amplitude")}
              value={settings.amplitude}
            />
            <button
              aria-pressed={touring}
              className={getButtonClassName({
                variant: "secondary",
                className:
                  "w-full whitespace-nowrap text-xs aria-pressed:border-grayscale-6 aria-pressed:bg-grayscale-3 aria-pressed:text-grayscale-12 dark:aria-pressed:bg-grayscale-5",
              })}
              disabled={listening}
              onClick={() => {
                if (!touring) set("driver")(true);
                setTouring((on) => !on);
              }}
              type="button"
            >
              {touring ? (
                <PauseIcon aria-hidden="true" size={13} weight="bold" />
              ) : (
                <PlayIcon aria-hidden="true" size={13} weight="bold" />
              )}
              {touring ? "Touring the resonances" : "Tour the resonances"}
            </button>
            <p className="text-pretty text-grayscale-10 text-xs leading-5">
              The driver shakes the bolt, so it only reaches modes where the
              whole plate rises and falls together. The rest barely answer it,
              but the bow reaches them.
            </p>
          </Section>

          <Section title="Plate">
            <Choice
              columns={2}
              label="Shape"
              onChange={set("shape")}
              options={SHAPES}
              value={settings.shape}
            />
            <Choice
              columns={3}
              label="Material"
              onChange={set("metal")}
              options={METALS}
              value={settings.metal}
            />
          </Section>

          <Section title="Grains">
            <Choice
              columns={4}
              label="Grains"
              onChange={set("grains")}
              options={GRAINS}
              value={settings.grains}
            />
            <p className="text-pretty text-grayscale-10 text-xs leading-5">
              Sand runs to where the plate keeps still. Lycopodium spores are
              light enough for the air to carry, and gather where it moves most.
            </p>
          </Section>

          <Section title="Bow">
            <Range
              format={clockFace}
              label="Bow at"
              max={1}
              min={0}
              onChange={set("bowAt")}
              step={0.01}
              value={settings.bowAt}
            />
            <Button
              className="w-full whitespace-nowrap text-xs"
              disabled={!stats.fingers}
              onClick={() => plateRef.current?.liftFingers()}
              type="button"
              variant="secondary"
            >
              <HandIcon aria-hidden="true" size={13} weight="bold" />
              {stats.fingers > 1 ? "Lift your fingers" : "Lift your finger"}
            </Button>
          </Section>

          <Section title="Sound">
            <Toggle
              checked={settings.sound}
              label="Hear the plate"
              onChange={set("sound")}
            />
            <button
              aria-pressed={listening}
              className={getButtonClassName({
                variant: "secondary",
                className:
                  "w-full whitespace-nowrap text-xs aria-pressed:border-grayscale-6 aria-pressed:bg-grayscale-3 aria-pressed:text-grayscale-12 dark:aria-pressed:bg-grayscale-5",
              })}
              onClick={() => (listening ? stopListening() : startListening())}
              type="button"
            >
              <MicrophoneIcon aria-hidden="true" size={14} weight="bold" />
              {listening
                ? heard
                  ? `Hearing ${noteName(heard)}`
                  : "Listening — sing a note"
                : "Sing to the plate"}
            </button>
            {listening && (
              <span
                aria-hidden="true"
                className="relative block h-1.5 w-full overflow-hidden rounded-full bg-grayscale-3 dark:bg-grayscale-5"
              >
                <span
                  className="absolute inset-0 origin-left scale-x-0 rounded-full bg-grayscale-8"
                  ref={meterRef}
                />
              </span>
            )}
            <p className="text-pretty text-grayscale-10 text-xs leading-5">
              {micError ??
                "The microphone feeds the driver: sing or whistle, and the plate is shaken at your note. Only the pitch is used; nothing is recorded."}
            </p>
          </Section>
        </aside>
      </div>
    </div>
  );
}
