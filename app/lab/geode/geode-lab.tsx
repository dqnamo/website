"use client";

import { Slider } from "@base-ui/react/slider";
import {
  ArrowsInSimpleIcon,
  ArrowsOutSimpleIcon,
  ArrowUpIcon,
  DropIcon,
  GaugeIcon,
  KnifeIcon,
  RulerIcon,
  ShuffleIcon,
  SparkleIcon,
} from "@phosphor-icons/react";
import {
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { flushSync } from "react-dom";
import Button from "@/components/public/Button";
import { Radio } from "@/components/public/Radio";
import { Switch } from "@/components/public/Switch";
import { cn } from "@/helpers/classname-helper";
import {
  createGeode,
  DEFAULT_SETTINGS,
  type DyeId,
  type Geode,
  type GeodeSettings,
  type GeodeStats,
  type SpecimenId,
} from "@/lib/geode/engine";
import { SPECIMENS, specimen } from "@/lib/geode/stones";

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
  disabled = false,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  columns: 2 | 4;
  disabled?: boolean;
  onChange: (value: T) => void;
}) {
  return (
    <Radio.Group
      aria-label={label}
      className={cn(
        "grid gap-1",
        columns === 2 ? "grid-cols-2" : "grid-cols-4",
      )}
      disabled={disabled}
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

const SPECIMEN_OPTIONS: { value: SpecimenId; label: string }[] = SPECIMENS.map(
  (s) => ({ value: s.id, label: s.label }),
);

const DYE_OPTIONS: { value: DyeId; label: string }[] = [
  { value: "none", label: "None" },
  { value: "blue", label: "Blue" },
  { value: "pink", label: "Pink" },
  { value: "green", label: "Green" },
];

export default function GeodeLab() {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const geodeRef = useRef<Geode | null>(null);
  const [settings, setSettings] = useState<GeodeSettings>(DEFAULT_SETTINGS);
  const [stats, setStats] = useState<GeodeStats>({
    phase: "whole",
    cut: 0,
    polish: "sawn",
    up: null,
    size: 0,
    fps: null,
  });
  const [note, setNote] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set =
    <K extends keyof GeodeSettings>(key: K) =>
    (value: GeodeSettings[K]) =>
      setSettings((current) => ({ ...current, [key]: value }));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let geode: Geode;
    try {
      geode = createGeode(canvas, { onStats: setStats, onNote: setNote });
    } catch (err) {
      console.error(err);
      setError("This browser couldn't start WebGL2 for the stone.");
      return;
    }
    geodeRef.current = geode;
    return () => {
      geodeRef.current = null;
      geode.dispose();
    };
  }, []);

  useEffect(() => {
    geodeRef.current?.setSettings(settings);
  }, [settings]);

  // The light follows the site's theme: a window by day, a lamp in the evening.
  useEffect(() => {
    const root = document.documentElement;
    const follow = () =>
      geodeRef.current?.setNight(root.classList.contains("dark"));
    follow();
    const theme = new MutationObserver(follow);
    theme.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => theme.disconnect();
  }, []);

  // A note on the stage for a while, about what just happened.
  useEffect(() => {
    if (!note) return;
    const timer = setTimeout(() => setNote(null), 8500);
    return () => clearTimeout(timer);
  }, [note]);

  const local = (event: { clientX: number; clientY: number }) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    return rect
      ? { x: event.clientX - rect.left, y: event.clientY - rect.top }
      : { x: 0, y: 0 };
  };

  const pressed = useRef(new Set<number>());

  const setCursor = (cursor: string) => {
    if (stageRef.current) stageRef.current.style.cursor = cursor;
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const geode = geodeRef.current;
    if (!geode || pressed.current.size) return;
    const cursor = geode.pointerDown(event.pointerId, local(event));
    if (!cursor) return;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // A pointer the browser no longer tracks; moves still arrive while it's over the stage.
    }
    pressed.current.add(event.pointerId);
    setCursor(cursor);
    setTouched(true);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const geode = geodeRef.current;
    if (!geode) return;
    if (pressed.current.has(event.pointerId)) {
      geode.pointerMove(event.pointerId, local(event));
      return;
    }
    if (event.pointerType === "mouse") setCursor(geode.hover(local(event)));
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!pressed.current.has(event.pointerId)) return;
    pressed.current.delete(event.pointerId);
    geodeRef.current?.pointerUp(event.pointerId);
    setCursor(geodeRef.current?.hover(local(event)) ?? "default");
  };

  const cut = () => {
    geodeRef.current?.cut();
    setTouched(true);
  };

  const another = () => {
    geodeRef.current?.another();
    setNote(null);
  };

  const spray = () => {
    geodeRef.current?.spray();
    setTouched(true);
  };

  // From the keyboard: the arrows turn the stone (or the halves), [ and ] move the cut, Enter
  // cuts, W sprays it and N fetches another stone.
  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const geode = geodeRef.current;
    if (!geode || event.metaKey || event.ctrlKey || event.altKey) return;
    const turns: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    if (turns[event.key]) {
      event.preventDefault();
      geode.nudge(...turns[event.key]);
      setTouched(true);
    } else if (event.key === "[" || event.key === "]") {
      geode.setCut(stats.cut + (event.key === "]" ? 0.1 : -0.1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (stats.phase === "open") another();
      else cut();
    } else if (event.key === "w" || event.key === "W") {
      spray();
    } else if (event.key === "n" || event.key === "N") {
      another();
    }
  };

  // Full screen is the same bench in a bigger frame. The page under it collapses meanwhile, so
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

  const spec = specimen(settings.specimen);
  const whole = stats.phase === "whole";
  const open = stats.phase === "open";
  const hint = whole
    ? "Drag the stone to turn it under the laser, then cut"
    : "Drag to turn the halves to the light";

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
            aria-label="A stone on a trim saw. Drag it to turn it under the laser line, or drag the line to move the cut, then press Enter to cut it. Once it's open, drag to turn the halves to the light."
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
            // biome-ignore lint/a11y/noNoninteractiveTabindex: the stone is turned with a pointer, or with the arrows, and cut with Enter.
            tabIndex={0}
          >
            <canvas className="absolute inset-0 size-full" ref={canvasRef} />

            <p
              aria-live="polite"
              className={cn(
                "pointer-events-none absolute right-3 bottom-3 left-3 mx-auto w-fit max-w-sm rounded-2xl bg-black/55 px-3 py-1.5 text-center text-white/90 text-xs backdrop-blur-sm transition-opacity duration-500",
                ((touched && !note) || error) && "opacity-0",
              )}
            >
              {note ?? hint}
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
          aria-label="Geode controls"
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
                label="size of the stone, across its longest way"
                value={`${stats.size.toFixed(1)} cm`}
              />
              {stats.up !== null && (
                <Metric
                  icon={
                    <ArrowUpIcon
                      size={12}
                      style={{ transform: `rotate(${stats.up}deg)` }}
                      weight="bold"
                    />
                  }
                  label="which way was up as the flat layers formed, on the left-hand face"
                  value={`${Math.round(Math.abs(stats.up))}°`}
                />
              )}
              <Metric
                icon={<GaugeIcon size={12} weight="bold" />}
                label="frames per second"
                value={stats.fps === null ? "—" : `${stats.fps} fps`}
              />
            </div>
            <div className="flex gap-1.5">
              {open ? (
                <Button
                  className="flex-auto whitespace-nowrap text-xs"
                  onClick={another}
                  type="button"
                >
                  <ShuffleIcon aria-hidden="true" size={13} weight="bold" />
                  Another stone
                </Button>
              ) : (
                <Button
                  className="flex-auto whitespace-nowrap text-xs"
                  disabled={!whole}
                  onClick={cut}
                  type="button"
                >
                  <KnifeIcon aria-hidden="true" size={13} weight="bold" />
                  {whole ? "Cut it" : "Cutting…"}
                </Button>
              )}
              <Button
                aria-label="Spray with water"
                className="w-7 shrink-0 px-0"
                onClick={spray}
                title="Spray with water (W)"
                type="button"
                variant="secondary"
              >
                <DropIcon aria-hidden="true" size={14} weight="bold" />
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
            <p className="text-grayscale-10 text-xs leading-4">
              {whole
                ? "Drag the stone to turn it under the saw's laser, or drag the red line to move the cut."
                : "Drag to turn the halves to the light; tilt a polished face until it catches the window."}
            </p>
          </div>

          <Section title="Stone">
            <Choice
              columns={2}
              label="Stone"
              onChange={set("specimen")}
              options={SPECIMEN_OPTIONS}
              value={settings.specimen}
            />
            <p className="text-grayscale-10 text-xs leading-4">{spec.note}</p>
          </Section>

          <Section title="Saw">
            <Range
              disabled={!whole}
              format={(v) =>
                Math.abs(v) < 5
                  ? "Through the middle"
                  : `${Math.abs(v)}% to the ${v < 0 ? "left" : "right"}`
              }
              label="Cut"
              max={100}
              min={-100}
              onChange={(v) => geodeRef.current?.setCut(v / 100)}
              step={1}
              value={Math.round(stats.cut * 100)}
            />
            <p className="text-grayscale-10 text-xs leading-4">
              A 20 cm diamond blade, 2.6 mm thick, cooled with water. Through
              the widest part shows the most.
            </p>
          </Section>

          <Section title="Faces">
            <div className="flex gap-1.5">
              <Button
                className="flex-1 text-xs"
                disabled={!open || stats.polish !== "sawn"}
                onClick={() => geodeRef.current?.polish()}
                type="button"
                variant="secondary"
              >
                <SparkleIcon aria-hidden="true" size={13} weight="bold" />
                {stats.polish === "polished"
                  ? "Polished"
                  : stats.polish === "polishing"
                    ? "Polishing…"
                    : "Polish"}
              </Button>
              <Button
                className="flex-1 text-xs"
                onClick={spray}
                type="button"
                variant="secondary"
              >
                <DropIcon aria-hidden="true" size={13} weight="bold" />
                Spray
              </Button>
            </div>
            <div className="grid gap-1.5">
              <span className="text-grayscale-11 text-xs">Dye bath</span>
              <Choice
                columns={4}
                label="Dye"
                onChange={set("dye")}
                options={DYE_OPTIONS}
                value={settings.dye}
              />
            </div>
          </Section>

          <Section title="View">
            <Choice
              columns={2}
              disabled={!open}
              label="View"
              onChange={set("view")}
              options={[
                { value: "halves", label: "The halves" },
                { value: "slab", label: "Slab on a light box" },
              ]}
              value={settings.view}
            />
            {settings.view === "slab" && (
              <Toggle
                checked={settings.light}
                label="Light box on"
                onChange={set("light")}
              />
            )}
            <Toggle
              checked={settings.sound}
              label="Sound"
              onChange={set("sound")}
            />
          </Section>
        </aside>
      </div>
    </div>
  );
}
