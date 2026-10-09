"use client";

import { Slider } from "@base-ui/react/slider";
import {
  ArrowCounterClockwiseIcon,
  ArrowsInSimpleIcon,
  ArrowsOutSimpleIcon,
  PaletteIcon,
  SparkleIcon,
  SquaresFourIcon,
  TimerIcon,
} from "@phosphor-icons/react";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { flushSync } from "react-dom";
import Button, { getButtonClassName } from "@/components/public/Button";
import { Radio } from "@/components/public/Radio";
import { Switch } from "@/components/public/Switch";
import { cn } from "@/helpers/classname-helper";
import { createMosaic, type MosaicStats } from "@/lib/tesserae/mosaic";

type Mosaic = ReturnType<typeof createMosaic>;
type Busy = { label: string; progress: number };

// The panel's settings, in the units its controls show: detail and grout as percentages.
type Settings = {
  tiles: number;
  detail: number;
  echo: number;
  contours: number;
  border: boolean;
  style: "stone" | "smalti";
  palette: number;
  grout: number;
  tilt: number;
  gold: boolean;
  light: "lamp" | "day";
};

const DEFAULTS: Settings = {
  tiles: 12000,
  detail: 42,
  echo: 5,
  contours: 6,
  border: true,
  style: "stone",
  palette: 28,
  grout: 14,
  tilt: 3.5,
  gold: true,
  light: "lamp",
};

// A Byzantine-style icon of the Archangel Michael, made with ChatGPT.
const PICTURE = "/lab/mosaics/archangel-michael.webp";

// One of the counts at the top of the panel: a small chip with an icon and the figure. What it
// counts is in the tooltip and for screen readers.
function Metric({
  icon,
  label,
  value,
  gold = false,
}: {
  icon: ReactNode;
  label: string;
  value?: string | null;
  gold?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-medium text-xs tabular-nums",
        gold
          ? "bg-accent-3 text-accent-11"
          : "bg-grayscale-2 text-grayscale-11 dark:bg-grayscale-3",
      )}
      title={label}
    >
      <span aria-hidden="true" className="opacity-80">
        {icon}
      </span>
      <span className={cn(!value && "animate-pulse opacity-50")}>
        {value ?? "—"}
      </span>
      <span className="sr-only">{label}</span>
    </span>
  );
}

function isEditable(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      /^(input|textarea|select)$/i.test(target.tagName))
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid gap-3 border-grayscale-3 border-t px-4 py-3.5 dark:border-grayscale-4">
      <h2 className="font-medium text-grayscale-12 text-xs">{title}</h2>
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
  format,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  format: (value: number) => string;
  onChange: (value: number) => void;
}) {
  return (
    <Slider.Root
      className="grid gap-1.5"
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
      <Slider.Control className="flex h-4 w-full cursor-pointer touch-none items-center">
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
  ariaLabel,
  value,
  options,
  onChange,
}: {
  label?: string;
  ariaLabel?: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  const id = useId();
  return (
    <div className="grid gap-2">
      {label && (
        <span className="text-grayscale-11 text-xs" id={id}>
          {label}
        </span>
      )}
      <Radio.Group
        aria-label={label ? undefined : ariaLabel}
        aria-labelledby={label ? id : undefined}
        className="grid grid-cols-2 gap-1"
        onValueChange={(next) => onChange(next as T)}
        value={value}
      >
        {options.map((option) => (
          <Radio.Root
            className="py-1 text-center"
            key={option.value}
            value={option.value}
          >
            {option.label}
          </Radio.Root>
        ))}
      </Radio.Group>
    </div>
  );
}

export default function MosaicsLab() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const mosaicRef = useRef<Mosaic | null>(null);
  const [settings, setSettings] = useState(DEFAULTS);
  const [stats, setStats] = useState<MosaicStats | null>(null);
  const [busy, setBusy] = useState<Busy | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dropping, setDropping] = useState(false);
  const [comparing, setComparing] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  const set =
    <K extends keyof Settings>(key: K) =>
    (value: Settings[K]) =>
      setSettings((current) => ({ ...current, [key]: value }));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let mosaic: Mosaic;
    try {
      mosaic = createMosaic(canvas, {
        onStats: setStats,
        onBusy: setBusy,
        onError: setError,
      });
    } catch (err) {
      console.error(err);
      setError(
        "This browser could not start WebGL, which the mosaic needs. Try a recent Chrome, Safari or Firefox.",
      );
      return;
    }
    mosaicRef.current = mosaic;
    mosaic.loadImage(PICTURE);
    return () => {
      mosaicRef.current = null;
      mosaic.dispose();
    };
  }, []);

  useEffect(() => {
    mosaicRef.current?.setParams({
      ...settings,
      detail: settings.detail / 100,
      grout: settings.grout / 100,
    });
  }, [settings]);

  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(null), 7000);
    return () => clearTimeout(timer);
  }, [error]);

  const setCompare = useCallback((on: boolean) => {
    setComparing(on);
    mosaicRef.current?.setCompare(on);
  }, []);

  // Full screen is the same mosaic in a bigger frame, so the picture and settings carry over.
  // The page under it collapses meanwhile, so its scroll position is put back on the way out.
  // Where the browser can, the mosaic and its panel grow into place as a view transition (the
  // timing is in globals.css); elsewhere, and with reduced motion, they simply switch.
  const fullscreenRef = useRef(false);
  const pageScroll = useRef(0);
  const showFullscreen = useCallback((on: boolean) => {
    if (fullscreenRef.current === on) return;
    fullscreenRef.current = on;
    if (on) pageScroll.current = window.scrollY;
    const update = () => {
      flushSync(() => setFullscreen(on));
      if (!on) window.scrollTo(0, pageScroll.current);
      mosaicRef.current?.resetView();
    };
    const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (document.startViewTransition && !reduceMotion) {
      document.startViewTransition(update);
    } else {
      update();
    }
  }, []);

  // Hold C to see the original picture; drop or paste an image anywhere to set it in stone.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") showFullscreen(false);
      if (
        event.key.toLowerCase() === "c" &&
        !event.repeat &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !isEditable(event.target)
      ) {
        setCompare(true);
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "c") setCompare(false);
    };
    const release = () => setCompare(false);

    let depth = 0;
    const hasFiles = (event: DragEvent) =>
      Array.from(event.dataTransfer?.types ?? []).includes("Files");
    const onDragEnter = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      depth++;
      setDropping(true);
    };
    const onDragLeave = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      depth = Math.max(0, depth - 1);
      if (!depth) setDropping(false);
    };
    const onDragOver = (event: DragEvent) => {
      if (hasFiles(event)) event.preventDefault();
    };
    const onDrop = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      depth = 0;
      setDropping(false);
      mosaicRef.current?.setFile(event.dataTransfer?.files[0]);
    };
    const onPaste = (event: ClipboardEvent) => {
      const item = Array.from(event.clipboardData?.items ?? []).find((entry) =>
        entry.type.startsWith("image/"),
      );
      if (item) mosaicRef.current?.setFile(item.getAsFile());
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", release);
    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("drop", onDrop);
    window.addEventListener("paste", onPaste);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", release);
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("drop", onDrop);
      window.removeEventListener("paste", onPaste);
    };
  }, [setCompare, showFullscreen]);

  return (
    <div
      className={
        fullscreen
          ? "fixed inset-0 z-50 flex flex-col bg-grayscale-1"
          : "contents"
      }
      data-lab-fullscreen={fullscreen ? "" : undefined}
    >
      <div
        className={
          fullscreen ? "flex min-h-0 flex-1 flex-col lg:flex-row" : "contents"
        }
      >
        <div
          className={cn(
            "relative overflow-hidden [view-transition-name:lab-pane]",
            fullscreen
              ? "h-[55dvh] shrink-0 bg-grayscale-1 lg:h-auto lg:min-w-0 lg:flex-1"
              : "h-[34rem] w-full min-w-0 rounded-[13px] border border-grayscale-3 bg-grayscale-3 small-shadow lg:h-auto lg:min-h-[42rem] dark:border-grayscale-4 dark:bg-grayscale-2",
          )}
        >
          <canvas
            ref={canvasRef}
            role="img"
            aria-label="Three-dimensional mosaic of the picture. Move the pointer to carry the lamp, drag to tilt, scroll to zoom."
            className="absolute inset-0 size-full"
          />

          <div
            aria-live="polite"
            className="pointer-events-none absolute inset-0 flex items-center justify-center"
            role="status"
          >
            {busy && (
              <div className="flex flex-col items-center gap-2 rounded-xl border border-grayscale-3 bg-grayscale-1 px-4 py-3 font-medium text-grayscale-11 text-xs small-shadow dark:border-grayscale-4">
                <span>{busy.label}</span>
                <span className="h-1 w-32 overflow-hidden rounded-full bg-grayscale-4">
                  <span
                    className="block h-full rounded-full bg-grayscale-11 transition-[width] duration-200"
                    style={{ width: `${Math.round(busy.progress * 100)}%` }}
                  />
                </span>
              </div>
            )}
          </div>

          {error && (
            <p
              className="absolute top-3 right-3 left-3 mx-auto w-fit rounded-lg border border-grayscale-4 bg-grayscale-1 px-3 py-2 text-grayscale-12 text-xs small-shadow"
              role="alert"
            >
              {error}
            </p>
          )}

          {dropping && (
            <div className="pointer-events-none absolute inset-2 flex items-center justify-center rounded-[10px] border-2 border-grayscale-8 border-dashed bg-grayscale-1/80 font-medium text-grayscale-12 text-sm">
              Drop to set it in stone
            </div>
          )}
        </div>

        <aside
          aria-label="Mosaic controls"
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
                icon={<SquaresFourIcon size={12} weight="bold" />}
                label="tesserae"
                value={stats?.tesserae.toLocaleString("en-GB")}
              />
              <Metric
                icon={<PaletteIcon size={12} weight="bold" />}
                label={
                  (stats?.style ?? settings.style) === "smalti"
                    ? "glass colours"
                    : "stone colours"
                }
                value={stats && String(stats.colours)}
              />
              <Metric
                gold
                icon={<SparkleIcon size={12} weight="bold" />}
                label="in gold leaf"
                value={stats?.gold.toLocaleString("en-GB")}
              />
              <Metric
                icon={<TimerIcon size={12} weight="bold" />}
                label="to lay"
                value={stats && `${stats.seconds.toFixed(1)} s`}
              />
            </div>
            <div className="flex gap-1.5">
              <Button
                className="flex-auto whitespace-nowrap text-xs"
                onClick={() => fileRef.current?.click()}
                type="button"
              >
                New image
              </Button>
              <button
                aria-pressed={comparing}
                className={getButtonClassName({
                  variant: "secondary",
                  className:
                    "flex-auto select-none whitespace-nowrap text-xs [-webkit-touch-callout:none]",
                })}
                onContextMenu={(event) => event.preventDefault()}
                onKeyDown={(event) => {
                  if (
                    (event.key === " " || event.key === "Enter") &&
                    !event.repeat
                  ) {
                    event.preventDefault();
                    setCompare(true);
                  }
                }}
                onKeyUp={() => setCompare(false)}
                onPointerCancel={() => setCompare(false)}
                onPointerDown={(event) => {
                  event.preventDefault();
                  setCompare(true);
                }}
                onPointerLeave={() => setCompare(false)}
                onPointerUp={() => setCompare(false)}
                title="Or hold the C key"
                type="button"
              >
                Hold to compare
              </button>
              <Button
                aria-label="Reset view"
                className="w-7 shrink-0 px-0"
                onClick={() => mosaicRef.current?.resetView()}
                title="Reset view"
                type="button"
                variant="secondary"
              >
                <ArrowCounterClockwiseIcon
                  aria-hidden="true"
                  size={14}
                  weight="bold"
                />
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
            <input
              ref={fileRef}
              accept="image/*"
              hidden
              onChange={(event) => {
                mosaicRef.current?.setFile(event.target.files?.[0]);
                event.target.value = "";
              }}
              type="file"
            />
          </div>

          <Section title="Laying">
            <Range
              format={(v) => `≈${(v / 1000).toFixed(v % 1000 ? 1 : 0)}k`}
              label="Tesserae"
              max={30000}
              min={4000}
              onChange={set("tiles")}
              step={500}
              value={settings.tiles}
            />
            <Range
              format={(v) => (v ? `${v}% smaller` : "Uniform")}
              label="Finer tiles where detailed"
              max={60}
              min={0}
              onChange={set("detail")}
              value={settings.detail}
            />
            <Range
              format={(v) => (v === 1 ? "1 row" : `${v} rows`)}
              label="Rows echoing each contour"
              max={12}
              min={1}
              onChange={set("echo")}
              value={settings.echo}
            />
            <Range
              format={(v) =>
                v <= 3 ? "Only bold" : v <= 7 ? "Main lines" : "Fine lines"
              }
              label="Contours traced"
              max={10}
              min={1}
              onChange={set("contours")}
              value={settings.contours}
            />
            <Toggle
              checked={settings.border}
              label="Banded Roman border"
              onChange={set("border")}
            />
          </Section>

          <Section title="Finish">
            <Choice
              ariaLabel="Material"
              onChange={set("style")}
              options={[
                { value: "stone", label: "Marble & stone" },
                { value: "smalti", label: "Glass smalti" },
              ]}
              value={settings.style}
            />
            <Range
              format={(v) => `${v}`}
              label={
                settings.style === "smalti" ? "Glass colours" : "Stone colours"
              }
              max={64}
              min={6}
              onChange={set("palette")}
              value={settings.palette}
            />
            <Range
              format={(v) => `${v}% of a tile`}
              label="Grout width"
              max={32}
              min={4}
              onChange={set("grout")}
              value={settings.grout}
            />
            <Range
              format={(v) => (v ? `±${v}°` : "Flat")}
              label="Setting tilt"
              max={10}
              min={0}
              onChange={set("tilt")}
              step={0.5}
              value={settings.tilt}
            />
            <Toggle
              checked={settings.gold}
              label="Gold leaf on golden tones"
              onChange={set("gold")}
            />
          </Section>

          <div className="flex items-center justify-between gap-3 border-grayscale-3 border-t px-4 py-3.5 dark:border-grayscale-4">
            <h2 className="font-medium text-grayscale-12 text-xs">Light</h2>
            <Choice
              ariaLabel="Light"
              onChange={set("light")}
              options={[
                { value: "lamp", label: "Oil lamp" },
                { value: "day", label: "Daylight" },
              ]}
              value={settings.light}
            />
          </div>
        </aside>
      </div>
    </div>
  );
}
