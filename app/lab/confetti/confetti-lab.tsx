"use client";

import { Slider } from "@base-ui/react/slider";
import { Toggle } from "@base-ui/react/toggle";
import { ToggleGroup } from "@base-ui/react/toggle-group";
import {
  ArrowsInSimpleIcon,
  ArrowsOutSimpleIcon,
  BroomIcon,
  ConfettiIcon,
  GaugeIcon,
  RepeatIcon,
} from "@phosphor-icons/react";
import {
  type MouseEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { flushSync } from "react-dom";
import Button, { getButtonClassName } from "@/components/public/Button";
import { getRadioBadgeClassName, Radio } from "@/components/public/Radio";
import { cn } from "@/helpers/classname-helper";
import {
  type Confetti,
  type ConfettiStats,
  createConfetti,
  type Shape,
} from "@/lib/confetti/engine";
import {
  colorsFor,
  DEFAULTS,
  matchPreset,
  PALETTES,
  PRESETS,
  type Settings,
  SHAPES,
} from "./presets";

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

function Choice<T extends string>({
  label,
  value,
  options,
  columns,
  onChange,
  onReselect,
}: {
  label: string;
  value: T | null;
  options: { value: T; label: string }[];
  columns: 3 | 4;
  onChange: (value: T) => void;
  // Picking the option that's already chosen doesn't change anything, so it's told apart.
  onReselect?: (value: T) => void;
}) {
  return (
    <Radio.Group
      aria-label={label}
      className={cn(
        "grid gap-1",
        columns === 3 ? "grid-cols-3" : "grid-cols-4",
      )}
      onValueChange={(next) => onChange(next as T)}
      value={value}
    >
      {options.map((option) => (
        <Radio.Root
          className="py-1 text-center"
          key={option.value}
          onClick={
            onReselect && option.value === value
              ? () => onReselect(option.value)
              : undefined
          }
          value={option.value}
        >
          {option.label}
        </Radio.Root>
      ))}
    </Radio.Group>
  );
}

const STAR =
  "M6 1.3 7.29 4.72 10.95 4.89 8.09 7.18 9.06 10.71 6 8.7 2.94 10.71 3.91 7.18 1.05 4.89 4.71 4.72Z";

function ShapeGlyph({ shape }: { shape: Shape }) {
  return (
    <svg
      aria-hidden="true"
      className="size-3 shrink-0"
      fill="currentColor"
      viewBox="0 0 12 12"
    >
      {shape === "strip" && (
        <rect
          height="9"
          rx="0.6"
          transform="rotate(24 6 6)"
          width="3.6"
          x="4.2"
          y="1.5"
        />
      )}
      {shape === "square" && (
        <rect
          height="7"
          rx="0.8"
          transform="rotate(14 6 6)"
          width="7"
          x="2.5"
          y="2.5"
        />
      )}
      {shape === "circle" && <circle cx="6" cy="6" r="3.8" />}
      {shape === "triangle" && <path d="M6 1.6 10.7 10H1.3Z" />}
      {shape === "star" && <path d={STAR} />}
      {shape === "streamer" && (
        <path
          d="M1.4 3.2c2.3 0 2.1 2.8 4.6 2.8s2.3 2.8 4.6 2.8"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="1.7"
        />
      )}
    </svg>
  );
}

// Theme colours are named by their custom property; swatches show them as the page does.
function swatch(color: string) {
  return color.startsWith("--") ? `var(${color})` : color;
}

export default function ConfettiLab() {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const confettiRef = useRef<Confetti | null>(null);
  const [settings, setSettings] = useState(DEFAULTS);
  const [stats, setStats] = useState<ConfettiStats>({ pieces: 0, fps: null });
  const [looping, setLooping] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set =
    <K extends keyof Settings>(key: K) =>
    (value: Settings[K]) =>
      setSettings((current) => ({ ...current, [key]: value }));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let confetti: Confetti;
    try {
      confetti = createConfetti(canvas, { onStats: setStats });
    } catch (err) {
      console.error(err);
      setError("This browser couldn't start a canvas for the confetti.");
      return;
    }
    confettiRef.current = confetti;
    // A first volley to say hello, unless motion is unwelcome.
    const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const hello = reduceMotion
      ? undefined
      : setTimeout(() => confetti.fire(), 450);
    return () => {
      clearTimeout(hello);
      confettiRef.current = null;
      confetti.dispose();
    };
  }, []);

  useEffect(() => {
    const { palette, ...rest } = settings;
    confettiRef.current?.setSettings({ ...rest, colors: colorsFor(palette) });
  }, [settings]);

  useEffect(() => {
    confettiRef.current?.setLoop(looping);
  }, [looping]);

  // Fire from where the stage was clicked; a burst starts there, the other patterns have their
  // own places to start from.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const onClick = (event: globalThis.MouseEvent) => {
      if ((event.target as Element).closest("button")) return;
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      confettiRef.current?.fire({
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      });
    };
    stage.addEventListener("click", onClick);
    return () => stage.removeEventListener("click", onClick);
  }, []);

  const fireFrom = (event: MouseEvent<HTMLElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    const from = event.currentTarget.getBoundingClientRect();
    if (!rect) return;
    confettiRef.current?.fire({
      x: from.left + from.width / 2 - rect.left,
      y: from.top + from.height / 2 - rect.top,
    });
  };

  // Full screen is the same stage in a bigger frame. The page under it collapses meanwhile, so
  // its scroll position is put back on the way out. Where the browser can, the stage and its
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

  const preset = matchPreset(settings);
  const rain = settings.pattern === "rain";

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
        {/* Beside the panel, the stage fills the window and stays in view while the panel
            scrolls. Its cell takes the panel's height without counting the stage towards it, so
            on a very tall window the stage stops at the panel's height rather than outgrowing it. */}
        <div
          className={
            fullscreen ? "contents" : "w-full min-w-0 lg:[contain:size]"
          }
        >
          <div
            className={cn(
              "relative cursor-crosshair select-none overflow-hidden bg-white [view-transition-name:lab-pane] dark:bg-grayscale-2",
              fullscreen
                ? "h-[55dvh] shrink-0 lg:h-auto lg:min-w-0 lg:flex-1"
                : "h-[34rem] w-full min-w-0 rounded-[13px] border border-grayscale-3 small-shadow lg:sticky lg:top-6 lg:h-[calc(100dvh-3rem)] lg:max-h-full dark:border-grayscale-4",
            )}
            ref={stageRef}
          >
            {/* A faint dot grid, so there's a surface for the pieces to move across. */}
            <div
              aria-hidden="true"
              className="absolute inset-0 bg-[radial-gradient(var(--gray-5)_1px,transparent_1.5px)] bg-size-[20px_20px] bg-center opacity-60 dark:bg-[radial-gradient(var(--gray-4)_1px,transparent_1.5px)]"
            />

            <div className="absolute inset-0 flex items-center justify-center">
              <Button
                className="h-9 gap-2 rounded-[10px] px-4"
                onClick={fireFrom}
                type="button"
              >
                <ConfettiIcon aria-hidden="true" size={16} weight="bold" />
                Celebrate
              </Button>
            </div>

            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0"
            >
              <canvas className="size-full" ref={canvasRef} />
            </div>

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
          aria-label="Confetti controls"
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
                icon={<ConfettiIcon size={12} weight="bold" />}
                label="pieces in the air"
                value={stats.pieces.toLocaleString("en-GB")}
              />
              <Metric
                icon={<GaugeIcon size={12} weight="bold" />}
                label="frames per second"
                value={stats.fps === null ? "—" : `${stats.fps} fps`}
              />
            </div>
            <div className="flex gap-1.5">
              <Button
                className="flex-auto whitespace-nowrap text-xs"
                onClick={() => confettiRef.current?.fire()}
                type="button"
              >
                Fire
              </Button>
              <button
                aria-pressed={looping}
                className={getButtonClassName({
                  variant: "secondary",
                  className:
                    "flex-auto whitespace-nowrap text-xs aria-pressed:border-grayscale-6 aria-pressed:bg-grayscale-3 aria-pressed:text-grayscale-12 dark:aria-pressed:bg-grayscale-5",
                })}
                onClick={() => setLooping((on) => !on)}
                type="button"
              >
                <RepeatIcon aria-hidden="true" size={13} weight="bold" />
                Loop
              </button>
              <Button
                aria-label="Clear"
                className="w-7 shrink-0 px-0"
                onClick={() => {
                  setLooping(false);
                  confettiRef.current?.clear();
                }}
                title="Clear"
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
          </div>

          <Section title="Preset">
            <Choice
              columns={3}
              label="Preset"
              onChange={(value) => {
                const next = PRESETS.find((entry) => entry.value === value);
                if (!next) return;
                setSettings(next.settings);
                // Straight to the engine as well, so this fire already uses the preset.
                confettiRef.current?.setSettings({
                  ...next.settings,
                  colors: colorsFor(next.settings.palette),
                });
                confettiRef.current?.fire();
              }}
              onReselect={() => confettiRef.current?.fire()}
              options={PRESETS}
              value={preset}
            />
          </Section>

          <Section title="Launch">
            <Choice
              columns={4}
              label="Pattern"
              onChange={set("pattern")}
              options={[
                { value: "burst", label: "Burst" },
                { value: "cannons", label: "Cannons" },
                { value: "fountain", label: "Fountain" },
                { value: "rain", label: "Rain" },
              ]}
              value={settings.pattern}
            />
            <Range
              format={(v) => `${v} pieces`}
              label="Amount"
              max={500}
              min={10}
              onChange={set("amount")}
              step={10}
              value={settings.amount}
            />
            <Range
              disabled={rain}
              format={(v) => (v >= 360 ? "All round" : `${v}°`)}
              label="Spread"
              max={360}
              min={0}
              onChange={set("spread")}
              step={2}
              value={settings.spread}
            />
            <Range
              disabled={rain}
              format={(v) => `${v}%`}
              label="Power"
              max={100}
              min={0}
              onChange={set("power")}
              value={settings.power}
            />
          </Section>

          <Section title="Air">
            <Range
              format={(v) => (v ? `${(v / 50).toFixed(1)}×` : "Weightless")}
              label="Gravity"
              max={100}
              min={0}
              onChange={set("gravity")}
              value={settings.gravity}
            />
            <Range
              format={(v) => {
                const factor = 2 ** ((v - 50) / 25);
                return `${factor < 1 ? factor.toFixed(2) : factor.toFixed(1)}×`;
              }}
              label="Air resistance"
              max={100}
              min={0}
              onChange={set("air")}
              value={settings.air}
            />
            <Range
              format={(v) =>
                v ? `${v < 0 ? "←" : "→"} ${Math.abs(v)}` : "Still"
              }
              label="Wind"
              max={100}
              min={-100}
              onChange={set("wind")}
              step={5}
              value={settings.wind}
            />
            <Range
              format={(v) => (v ? `${v}%` : "Calm")}
              label="Gusts"
              max={100}
              min={0}
              onChange={set("gusts")}
              value={settings.gusts}
            />
            <Range
              format={(v) => (v ? `${(v / 50).toFixed(1)}×` : "None")}
              label="Tumble"
              max={100}
              min={0}
              onChange={set("tumble")}
              value={settings.tumble}
            />
          </Section>

          <Section title="Pieces">
            <ToggleGroup
              aria-label="Shapes"
              className="grid grid-cols-3 gap-1"
              multiple
              onValueChange={(next) => {
                // There's always something to throw.
                if (next.length) set("shapes")(next as Shape[]);
              }}
              value={settings.shapes}
            >
              {SHAPES.map((shape) => (
                <Toggle
                  className={getRadioBadgeClassName(
                    "flex items-center justify-center gap-1.5 py-1 data-[pressed]:border-grayscale-5 data-[pressed]:bg-grayscale-3 data-[pressed]:text-grayscale-12 dark:data-[pressed]:border-grayscale-6 dark:data-[pressed]:bg-grayscale-5",
                  )}
                  key={shape.value}
                  value={shape.value}
                >
                  <ShapeGlyph shape={shape.value} />
                  {shape.label}
                </Toggle>
              ))}
            </ToggleGroup>
            <Range
              format={(v) => `${v} px`}
              label="Size"
              max={20}
              min={4}
              onChange={set("size")}
              value={settings.size}
            />
            <Radio.Group
              aria-label="Palette"
              className="grid grid-cols-3 gap-1"
              onValueChange={(next) =>
                set("palette")(next as Settings["palette"])
              }
              value={settings.palette}
            >
              {PALETTES.map((palette) => (
                <Radio.Root
                  className="flex items-center justify-center gap-1.5 py-1"
                  key={palette.value}
                  value={palette.value}
                >
                  <span aria-hidden="true" className="flex -space-x-1">
                    {palette.colors.slice(0, 4).map((color) => (
                      <span
                        className="size-2.5 rounded-full shadow-[0_0_0_1px_var(--gray-1)] dark:shadow-[0_0_0_1px_var(--gray-4)]"
                        key={color}
                        style={{ background: swatch(color) }}
                      />
                    ))}
                  </span>
                  {palette.label}
                </Radio.Root>
              ))}
            </Radio.Group>
            <Choice
              columns={3}
              label="Finish"
              onChange={set("finish")}
              options={[
                { value: "paper", label: "Paper" },
                { value: "foil", label: "Foil" },
                { value: "holo", label: "Holo" },
              ]}
              value={settings.finish}
            />
          </Section>
        </aside>
      </div>
    </div>
  );
}
