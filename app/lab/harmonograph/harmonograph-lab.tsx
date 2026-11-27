"use client";

import { Slider } from "@base-ui/react/slider";
import {
  ArrowsInSimpleIcon,
  ArrowsOutSimpleIcon,
  DownloadSimpleIcon,
  DropIcon,
  FilePlusIcon,
  GaugeIcon,
  HandIcon,
  PenNibIcon,
  RulerIcon,
  SpiralIcon,
} from "@phosphor-icons/react";
import {
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { flushSync } from "react-dom";
import Button, { getButtonClassName } from "@/components/public/Button";
import { Radio } from "@/components/public/Radio";
import { cn } from "@/helpers/classname-helper";
import {
  createHarmonograph,
  DEFAULT_SETTINGS,
  type FigureId,
  type Grab,
  type Harmonograph,
  type HarmonographSettings,
  type HarmonographStats,
  type InkId,
} from "@/lib/harmonograph/engine";
import { FIGURES } from "@/lib/harmonograph/figures";
import { INKS, PAPERS, PENS } from "@/lib/harmonograph/paper";

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
  options: { value: T; label: string; disabled?: boolean }[];
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
          disabled={option.disabled}
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

// A pendulum's rate from its length, and a length as the panel shows it.
const hertz = (length: number) => Math.sqrt(9810 / length) / (2 * Math.PI);
const describeLength = (length: number) =>
  `${(length / 10).toFixed(1)} cm · ${hertz(length).toFixed(2)} Hz`;

// How the two pen pendulums' rates compare, as the nearest small ratio and how far off it they
// are, which is what decides whether the figure turns as it shrinks.
function describeRatio(across: number, along: number) {
  const ratio = Math.sqrt(across / along);
  let best = { p: 1, q: 1, error: Number.POSITIVE_INFINITY };
  for (let q = 1; q <= 5; q++) {
    const p = Math.round(ratio * q);
    if (p < 1) continue;
    const error = Math.abs(ratio - p / q);
    if (error < best.error - 1e-9) best = { p, q, error };
  }
  const off = (ratio / (best.p / best.q) - 1) * 100;
  const tune =
    Math.abs(off) < 0.05
      ? "exactly, so it retraces itself"
      : `${Math.abs(off).toFixed(1)}% ${off > 0 ? "sharp" : "flat"}, so it turns`;
  return `Up and down to side to side: ${best.p} : ${best.q}, ${tune}`;
}

const INK_IDS = Object.keys(INKS) as InkId[];

export default function HarmonographLab() {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const machineRef = useRef<Harmonograph | null>(null);
  const [settings, setSettings] =
    useState<HarmonographSettings>(DEFAULT_SETTINGS);
  const [figure, setFigure] = useState<FigureId | null>("fifth");
  const [stats, setStats] = useState<HarmonographStats>({
    metres: 0,
    swing: 0,
    penDown: false,
    ink: 1,
    fps: null,
  });
  const [note, setNote] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const [holding, setHolding] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set =
    <K extends keyof HarmonographSettings>(key: K) =>
    (value: HarmonographSettings[K]) =>
      setSettings((current) => ({ ...current, [key]: value }));

  // Moving a bob by hand means the figure on the panel no longer describes the machine.
  const setLength = (key: "across" | "along" | "table") => (value: number) => {
    setFigure(null);
    set(key)(value);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let machine: Harmonograph;
    try {
      machine = createHarmonograph(canvas, {
        onStats: setStats,
        onNote: setNote,
      });
    } catch (err) {
      console.error(err);
      setError("This browser couldn't start WebGL2 for the harmonograph.");
      return;
    }
    machineRef.current = machine;
    // A first figure to say hello, unless motion is unwelcome.
    const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const hello = reduceMotion
      ? undefined
      : setTimeout(() => machine.start("fifth"), 500);
    return () => {
      clearTimeout(hello);
      machineRef.current = null;
      machine.dispose();
    };
  }, []);

  useEffect(() => {
    machineRef.current?.setSettings(settings);
  }, [settings]);

  // The light follows the site's theme: a window by day, a lamp in the evening.
  useEffect(() => {
    const root = document.documentElement;
    const follow = () =>
      machineRef.current?.setNight(root.classList.contains("dark"));
    follow();
    const theme = new MutationObserver(follow);
    theme.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => theme.disconnect();
  }, []);

  // A note on the stage for a few seconds, about what just happened.
  useEffect(() => {
    if (!note) return;
    const timer = setTimeout(() => setNote(null), 9000);
    return () => clearTimeout(timer);
  }, [note]);

  const startFigure = (id: FigureId) => {
    const entry = FIGURES.find((f) => f.value === id);
    if (!entry) return;
    setFigure(id);
    const next = {
      ...settings,
      across: entry.across,
      along: entry.along,
      table: entry.table,
    };
    setSettings(next);
    machineRef.current?.setSettings(next);
    machineRef.current?.start(id);
    setTouched(true);
  };

  const togglePen = () => {
    machineRef.current?.setPen();
    setTouched(true);
  };

  const save = async () => {
    const blob = await machineRef.current?.save();
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "harmonograph.png";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const local = (event: { clientX: number; clientY: number }) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    return rect
      ? { x: event.clientX - rect.left, y: event.clientY - rect.top }
      : { x: 0, y: 0 };
  };

  const pressed = useRef(new Map<number, Grab>());

  const setCursor = (cursor: string) => {
    if (stageRef.current) stageRef.current.style.cursor = cursor;
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const machine = machineRef.current;
    if (!machine || pressed.current.has(event.pointerId)) return;
    const took = machine.pointerDown(event.pointerId, local(event));
    if (!took) return;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // A pointer the browser no longer tracks; moves still arrive while it's over the stage.
    }
    pressed.current.set(event.pointerId, took);
    setHolding(true);
    setCursor("grabbing");
    setFigure(null);
    setTouched(true);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const machine = machineRef.current;
    if (!machine) return;
    if (pressed.current.has(event.pointerId)) {
      machine.pointerMove(event.pointerId, local(event));
      return;
    }
    if (event.pointerType === "mouse") setCursor(machine.hover(local(event)));
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!pressed.current.has(event.pointerId)) return;
    pressed.current.delete(event.pointerId);
    machineRef.current?.pointerUp(event.pointerId);
    setHolding(pressed.current.size > 0);
    setCursor("grab");
  };

  // From the keyboard: Space lifts or lowers the pen, D dips a nib, Enter sets the last figure
  // going again, and S catches the pendulums.
  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const machine = machineRef.current;
    if (!machine || event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.key === " ") {
      event.preventDefault();
      if (!event.repeat) togglePen();
    } else if (event.key === "d" || event.key === "D") {
      machine.dip();
    } else if (event.key === "Enter") {
      event.preventDefault();
      startFigure(figure ?? "fifth");
    } else if (event.key === "s" || event.key === "S") {
      machine.stop();
    }
  };

  // Full screen is the same machine in a bigger frame. The page under it collapses meanwhile, so
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
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") showFullscreen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showFullscreen]);

  const nib = settings.pen === "nib";
  const level = Math.min(1, stats.ink);

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
            aria-label="Harmonograph. Drag the pen, the card or the brass knuckles and let go to set the pendulums swinging; press Space to lower or lift the pen."
            className={cn(
              "relative touch-none select-none overflow-hidden bg-grayscale-3 outline-none [view-transition-name:lab-pane] focus-visible:ring-2 focus-visible:ring-grayscale-7 dark:bg-black",
              fullscreen
                ? "h-[55dvh] shrink-0 lg:h-auto lg:min-w-0 lg:flex-1"
                : "h-[34rem] w-full min-w-0 rounded-[13px] border border-grayscale-3 small-shadow lg:sticky lg:top-6 lg:h-[calc(100dvh-3rem)] lg:max-h-full dark:border-grayscale-4",
            )}
            onContextMenu={(event) => event.preventDefault()}
            onKeyDown={onKeyDown}
            onLostPointerCapture={onPointerUp}
            onPointerCancel={onPointerUp}
            onPointerDown={onPointerDown}
            onPointerLeave={() => {
              if (!pressed.current.size) setCursor("default");
            }}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            ref={stageRef}
            role="application"
            // biome-ignore lint/a11y/noNoninteractiveTabindex: the stage is played with a pointer, or with Space lowering and lifting the pen.
            tabIndex={0}
          >
            <canvas className="absolute inset-0 size-full" ref={canvasRef} />

            <p
              aria-live="polite"
              className={cn(
                "pointer-events-none absolute right-3 bottom-3 left-3 mx-auto w-fit max-w-sm rounded-2xl bg-black/55 px-3 py-1.5 text-center text-white/90 text-xs backdrop-blur-sm transition-opacity duration-500",
                ((touched && !note) || error || holding) && "opacity-0",
              )}
            >
              {note ??
                "Drag the pen or the card and let go to swing them, then press Space to lower the pen"}
            </p>

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
          aria-label="Harmonograph controls"
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
                icon={<RulerIcon size={12} weight="bold" />}
                label="line drawn on this card"
                value={`${stats.metres.toFixed(stats.metres < 10 ? 1 : 0)} m`}
              />
              <Metric
                icon={<SpiralIcon size={12} weight="bold" />}
                label="widest swing"
                value={`${Math.round(stats.swing)} mm`}
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
                onClick={togglePen}
                type="button"
              >
                <PenNibIcon aria-hidden="true" size={13} weight="bold" />
                {stats.penDown ? "Lift pen" : "Lower pen"}
              </Button>
              <Button
                aria-label="Catch the pendulums"
                className="w-7 shrink-0 px-0"
                onClick={() => {
                  machineRef.current?.stop();
                  setFigure(null);
                }}
                title="Catch the pendulums (S)"
                type="button"
                variant="secondary"
              >
                <HandIcon aria-hidden="true" size={14} weight="bold" />
              </Button>
              <Button
                aria-label="New card"
                className="w-7 shrink-0 px-0"
                onClick={() => machineRef.current?.newSheet()}
                title="New card"
                type="button"
                variant="secondary"
              >
                <FilePlusIcon aria-hidden="true" size={14} weight="bold" />
              </Button>
              <Button
                aria-label="Save the card as a PNG"
                className="w-7 shrink-0 px-0"
                onClick={save}
                title="Save the card"
                type="button"
                variant="secondary"
              >
                <DownloadSimpleIcon
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
          </div>

          <Section title="Figure">
            <Choice
              columns={3}
              label="Figure"
              onChange={startFigure}
              onReselect={startFigure}
              options={FIGURES.map((f) => ({ value: f.value, label: f.label }))}
              value={figure}
            />
            <p className="text-grayscale-10 text-xs leading-4">
              Each lifts the pen, pulls the pendulums to their marks, lets go
              and lowers the pen on the same card.
            </p>
          </Section>

          <Section title="Pendulums">
            <Range
              format={describeLength}
              label="Side to side"
              max={1000}
              min={220}
              onChange={setLength("across")}
              value={settings.across}
            />
            <Range
              format={describeLength}
              label="Up and down"
              max={1000}
              min={220}
              onChange={setLength("along")}
              value={settings.along}
            />
            <Range
              format={describeLength}
              label="Table, round and round"
              max={1000}
              min={100}
              onChange={setLength("table")}
              value={settings.table}
            />
            <p className="text-grayscale-10 text-xs leading-4">
              {describeRatio(settings.across, settings.along)}.
            </p>
          </Section>

          <Section title="Pen">
            <Choice
              columns={3}
              label="Pen"
              onChange={(value) => {
                set("pen")(value);
                if (value === "ballpoint" && settings.ink === "irongall")
                  setSettings((current) => ({
                    ...current,
                    pen: value,
                    ink: "blue",
                  }));
              }}
              options={(["fineliner", "nib", "ballpoint"] as const).map(
                (value) => ({ value, label: PENS[value].label }),
              )}
              value={settings.pen}
            />
            <Radio.Group
              aria-label="Ink"
              className="grid grid-cols-2 gap-1"
              onValueChange={(next) => set("ink")(next as InkId)}
              value={settings.ink}
            >
              {INK_IDS.map((id) => (
                <Radio.Root
                  className="flex items-center justify-center gap-1.5 py-1"
                  disabled={id === "irongall" && settings.pen === "ballpoint"}
                  key={id}
                  value={id}
                >
                  <span
                    aria-hidden="true"
                    className="size-2.5 rounded-full shadow-[0_0_0_1px_var(--gray-1)] dark:shadow-[0_0_0_1px_var(--gray-4)]"
                    style={{ background: INKS[id].swatch }}
                  />
                  {INKS[id].label}
                </Radio.Root>
              ))}
            </Radio.Group>
            <Range
              format={(v) => `${v} g`}
              label="Weight on the pen"
              max={20}
              min={2}
              onChange={set("pressure")}
              value={settings.pressure}
            />
            {nib && (
              <div className="flex items-center gap-2">
                <span className="sr-only">
                  Ink on the nib: {Math.round(level * 100)}%
                </span>
                <div
                  aria-hidden="true"
                  className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-grayscale-3 dark:bg-grayscale-5"
                >
                  <div
                    className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-200"
                    style={{
                      width: `${level * 100}%`,
                      background: INKS[settings.ink].swatch,
                    }}
                  />
                </div>
                <button
                  className={getButtonClassName({
                    variant: "secondary",
                    className: "h-6 whitespace-nowrap px-2 text-xs",
                  })}
                  onClick={() => machineRef.current?.dip()}
                  title="Dip the nib (D)"
                  type="button"
                >
                  <DropIcon aria-hidden="true" size={12} weight="bold" />
                  Dip
                </button>
              </div>
            )}
            <p className="text-grayscale-10 text-xs leading-4">
              {settings.pen === "fineliner"
                ? "Feeds ink at a steady rate, so it draws darker as the swing slows, and blots if it stands still."
                : settings.pen === "nib"
                  ? "A broad edge: thick across, hairline along. It empties as it goes; dip it when the line breaks up."
                  : "Rolls the same amount on to every millimetre and drags least, so it draws longest. Too light and it skips."}
              {settings.ink === "irongall" &&
                " Iron gall goes on blue-grey and blackens as it meets the air."}
            </p>
          </Section>

          <Section title="Card">
            <Choice
              columns={3}
              label="Card"
              onChange={set("paper")}
              options={(["bristol", "cartridge", "blotting"] as const).map(
                (value) => ({ value, label: PAPERS[value].label }),
              )}
              value={settings.paper}
            />
            <p className="text-grayscale-10 text-xs leading-4">
              Changing it pins a new card on. Bristol keeps a crisp, glossy
              line; blotting paper drinks it and feathers.
            </p>
          </Section>

          <Section title="Clock">
            <Choice
              columns={3}
              label="Clock"
              onChange={(value) => set("speed")(Number(value))}
              options={[
                { value: "1", label: "Real time" },
                { value: "3", label: "3×" },
                { value: "10", label: "10×" },
              ]}
              value={String(settings.speed)}
            />
          </Section>
        </aside>
      </div>
    </div>
  );
}
