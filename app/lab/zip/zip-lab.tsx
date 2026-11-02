"use client";

import { Slider } from "@base-ui/react/slider";
import {
  ArrowLineDownIcon,
  ArrowLineUpIcon,
  ArrowsInSimpleIcon,
  ArrowsOutSimpleIcon,
  GaugeIcon,
  LockSimpleIcon,
  LockSimpleOpenIcon,
  MusicNotesIcon,
  SpeakerHighIcon,
  SpeakerSlashIcon,
  WrenchIcon,
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
import Button from "@/components/public/Button";
import { Radio } from "@/components/public/Radio";
import { cn } from "@/helpers/classname-helper";
import {
  createZip,
  DEFAULT_SETTINGS,
  type Zip,
  type ZipSettings,
  type ZipStats,
} from "@/lib/zip/engine";
import {
  FABRICS,
  type Fabric,
  INSIDES,
  type Inside,
  type SliderKind,
  SLIDERS,
  TEETH,
  type Teeth,
} from "@/lib/zip/parts";

const NOTES = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];

// The nearest note to a frequency, as a musician would write it.
function noteName(hertz: number) {
  const n = Math.round(12 * Math.log2(hertz / 440) + 69);
  return `${NOTES[((n % 12) + 12) % 12]}${Math.floor(n / 12) - 1}`;
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
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  columns: 3 | 4;
  onChange: (value: T) => void;
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
          value={option.value}
        >
          {option.label}
        </Radio.Root>
      ))}
    </Radio.Group>
  );
}

function Description({ children }: { children: ReactNode }) {
  return (
    <p className="text-grayscale-10 text-xs leading-relaxed">{children}</p>
  );
}

export default function ZipLab() {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const zipRef = useRef<Zip | null>(null);
  const [settings, setSettings] = useState<ZipSettings>(DEFAULT_SETTINGS);
  const [stats, setStats] = useState<ZipStats>({
    closed: 1,
    open: 0,
    hertz: 0,
    locked: true,
    fps: null,
  });
  const [note, setNote] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const [holding, setHolding] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set =
    <K extends keyof ZipSettings>(key: K) =>
    (value: ZipSettings[K]) =>
      setSettings((current) => ({ ...current, [key]: value }));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let zip: Zip;
    try {
      zip = createZip(canvas, { onStats: setStats, onNote: setNote });
    } catch (err) {
      console.error(err);
      setError("This browser couldn't start WebGL for the zip.");
      return;
    }
    zipRef.current = zip;
    return () => {
      zipRef.current = null;
      zip.dispose();
    };
  }, []);

  useEffect(() => {
    zipRef.current?.setSettings(settings);
  }, [settings]);

  // The light follows the site's theme: daylight, or a lamp in the evening.
  useEffect(() => {
    const root = document.documentElement;
    const follow = () =>
      zipRef.current?.setNight(root.classList.contains("dark"));
    follow();
    const theme = new MutationObserver(follow);
    theme.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => theme.disconnect();
  }, []);

  // A note on the stage for a few seconds, about what just happened.
  useEffect(() => {
    if (!note) return;
    const timer = setTimeout(() => setNote(null), 8000);
    return () => clearTimeout(timer);
  }, [note]);

  const local = (event: { clientX: number; clientY: number }) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    return rect
      ? { x: event.clientX - rect.left, y: event.clientY - rect.top }
      : { x: 0, y: 0 };
  };

  // One hand can hold the pull while the other tugs the fabric, so each pointer is its own.
  const pressed = useRef(new Set<number>());

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const zip = zipRef.current;
    if (!zip || pressed.current.has(event.pointerId)) return;
    const took = zip.pointerDown(event.pointerId, local(event));
    if (!took) return;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // A pointer the browser no longer tracks; moves still arrive while it's over the stage.
    }
    pressed.current.add(event.pointerId);
    setHolding(true);
    setTouched(true);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!pressed.current.has(event.pointerId)) return;
    zipRef.current?.pointerMove(event.pointerId, local(event));
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!pressed.current.delete(event.pointerId)) return;
    zipRef.current?.pointerUp(event.pointerId);
    setHolding(pressed.current.size > 0);
  };

  // From the keyboard the stage is a slider, closed at the top: up closes a few teeth at a
  // time, down opens, Home and End go all the way.
  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const zip = zipRef.current;
    if (!zip) return;
    const moves: Record<string, () => void> = {
      ArrowUp: () => zip.nudge(-4),
      ArrowRight: () => zip.nudge(-4),
      ArrowDown: () => zip.nudge(4),
      ArrowLeft: () => zip.nudge(4),
      PageUp: () => zip.nudge(-12),
      PageDown: () => zip.nudge(12),
      Home: () => zip.run(false),
      End: () => zip.run(true),
    };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    move();
    setTouched(true);
  };

  // Full screen is the same zip in a bigger frame. The page under it collapses meanwhile, so
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

  const closedPercent = Math.round(stats.closed * 100);
  const openPercent = Math.round(stats.open * 100);
  const isClosed = stats.open < 0.02;
  const worn = settings.slider === "worn";

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
            aria-label="Zip. Drag the pull, or tug the fabric either side of the teeth. Up closes, down opens."
            aria-orientation="vertical"
            aria-valuemax={100}
            aria-valuemin={0}
            aria-valuenow={100 - openPercent}
            aria-valuetext={`${openPercent}% open, ${closedPercent}% of the teeth locked`}
            className={cn(
              "relative touch-none select-none overflow-hidden bg-grayscale-3 outline-none [view-transition-name:lab-pane] focus-visible:ring-2 focus-visible:ring-grayscale-7 dark:bg-black",
              holding ? "cursor-grabbing" : "cursor-grab",
              fullscreen
                ? "h-[55dvh] shrink-0 lg:h-auto lg:min-w-0 lg:flex-1"
                : "h-[34rem] w-full min-w-0 rounded-[13px] border border-grayscale-3 small-shadow lg:sticky lg:top-6 lg:h-[calc(100dvh-3rem)] lg:max-h-full dark:border-grayscale-4",
            )}
            onContextMenu={(event) => event.preventDefault()}
            onKeyDown={onKeyDown}
            onLostPointerCapture={onPointerUp}
            onPointerCancel={onPointerUp}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            ref={stageRef}
            role="slider"
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
              {note ??
                "Drag the pull to open it, or tug the fabric either side of the teeth"}
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
          aria-label="Zip controls"
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
                icon={
                  stats.locked ? (
                    <LockSimpleIcon size={12} weight="bold" />
                  ) : (
                    <LockSimpleOpenIcon size={12} weight="bold" />
                  )
                }
                label={
                  stats.locked
                    ? "the slider is locked"
                    : "of the teeth locked together"
                }
                value={stats.locked ? "Locked" : `${closedPercent}% shut`}
              />
              <Metric
                icon={<MusicNotesIcon size={12} weight="bold" />}
                label="teeth past the slider each second, which is the note it buzzes at"
                value={
                  stats.hertz
                    ? `${stats.hertz} Hz · ${noteName(stats.hertz)}`
                    : "— Hz"
                }
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
                onClick={() => {
                  zipRef.current?.run(isClosed);
                  setTouched(true);
                }}
                type="button"
              >
                {isClosed ? (
                  <ArrowLineDownIcon
                    aria-hidden="true"
                    size={13}
                    weight="bold"
                  />
                ) : (
                  <ArrowLineUpIcon aria-hidden="true" size={13} weight="bold" />
                )}
                {isClosed ? "Unzip" : "Zip up"}
              </Button>
              <Button
                aria-label={settings.sound ? "Mute" : "Sound on"}
                aria-pressed={settings.sound}
                className="w-7 shrink-0 px-0"
                onClick={() => {
                  set("sound")(!settings.sound);
                  zipRef.current?.wake();
                }}
                title={settings.sound ? "Mute" : "Sound on"}
                type="button"
                variant="secondary"
              >
                {settings.sound ? (
                  <SpeakerHighIcon aria-hidden="true" size={14} weight="bold" />
                ) : (
                  <SpeakerSlashIcon
                    aria-hidden="true"
                    size={14}
                    weight="bold"
                  />
                )}
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

          <Section title="What it closes">
            <Choice
              columns={3}
              label="What it closes"
              onChange={(value: Inside) =>
                setSettings((current) => ({
                  ...current,
                  inside: value,
                  fullness: INSIDES[value].fullness,
                }))
              }
              options={Object.values(INSIDES)}
              value={settings.inside}
            />
            <Description>{INSIDES[settings.inside].description}</Description>
            <Range
              format={(v) => (v ? `${v}%` : "Empty")}
              label="How full"
              max={100}
              min={0}
              onChange={set("fullness")}
              value={settings.fullness}
            />
          </Section>

          <Section title="Teeth">
            <Choice
              columns={3}
              label="Teeth"
              onChange={(value: Teeth) => set("teeth")(value)}
              options={Object.values(TEETH)}
              value={settings.teeth}
            />
            <Description>{TEETH[settings.teeth].description}</Description>
          </Section>

          <Section title="Slider">
            <Choice
              columns={3}
              label="Slider"
              onChange={(value: SliderKind) => set("slider")(value)}
              options={Object.values(SLIDERS)}
              value={settings.slider}
            />
            <Description>{SLIDERS[settings.slider].description}</Description>
            {worn && (
              <Button
                className="text-xs"
                onClick={() => {
                  zipRef.current?.squeeze();
                  set("slider")("nonlock");
                  setNote(
                    "Squeezed back into shape. The teeth it closed badly are still loose: run it down and up again.",
                  );
                }}
                type="button"
                variant="secondary"
              >
                <WrenchIcon aria-hidden="true" size={13} weight="bold" />
                Squeeze it with pliers
              </Button>
            )}
          </Section>

          <Section title="Fabric">
            <Radio.Group
              aria-label="Fabric"
              className="grid grid-cols-2 gap-1"
              onValueChange={(next) => set("fabric")(next as Fabric)}
              value={settings.fabric}
            >
              {Object.values(FABRICS).map((option) => (
                <Radio.Root
                  className="flex items-center justify-center gap-1.5 py-1"
                  key={option.value}
                  value={option.value}
                >
                  <span
                    aria-hidden="true"
                    className="size-2.5 shrink-0 rounded-full shadow-[0_0_0_1px_var(--gray-5)] dark:shadow-[0_0_0_1px_var(--gray-7)]"
                    style={{ background: option.swatch }}
                  />
                  {option.label}
                </Radio.Root>
              ))}
            </Radio.Group>
          </Section>

          <Section title="Try">
            <ul className="grid gap-2 text-grayscale-11 text-xs leading-relaxed">
              <li>
                Pull slowly, then fast. Each tooth clicks; quick enough and the
                clicks run into a note. Try the same pull on the coil.
              </li>
              <li>
                Zip up and let go. The pull flips over to show its back, then
                drops and clinks.
              </li>
              <li>
                Fill the cushion and switch to a non-lock slider. Then try
                auto-lock, and tug the fabric beside it.
              </li>
              <li>
                With coil teeth, tug hard on the fabric halfway down, then run
                the slider over the split.
              </li>
              <li>Fit a worn slider and zip up the cushion.</li>
            </ul>
          </Section>
        </aside>
      </div>
    </div>
  );
}
