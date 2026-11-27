"use client";

import { Slider } from "@base-ui/react/slider";
import { Toggle as BaseToggle } from "@base-ui/react/toggle";
import { ToggleGroup } from "@base-ui/react/toggle-group";
import {
  ApertureIcon,
  ArrowRightIcon,
  ArrowsInSimpleIcon,
  ArrowsOutSimpleIcon,
  BroomIcon,
  DropIcon,
  FilePlusIcon,
  GaugeIcon,
  HandIcon,
  ImagesIcon,
  LightbulbFilamentIcon,
  LightbulbIcon,
  ShuffleIcon,
  StopIcon,
  TimerIcon,
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
import { getRadioBadgeClassName, Radio } from "@/components/public/Radio";
import { Switch } from "@/components/public/Switch";
import { cn } from "@/helpers/classname-helper";
import {
  createPhotogram,
  DEFAULT_SETTINGS,
  type Photogram,
  type PhotogramSettings,
  type PhotogramStats,
  type Print,
  STATIONS,
  type Station,
} from "@/lib/photogram/engine";
import { PAPERS, type PaperKind } from "@/lib/photogram/paper";
import { PROPS, type PropKind } from "@/lib/photogram/props";

const APERTURES = [4, 5.6, 8, 11, 16];

const STATION_LABELS: Record<Station, string> = {
  easel: "Easel",
  developer: "Developer",
  stop: "Stop",
  fixer: "Fixer",
};

const STATION_NOTES: Record<Station, string> = {
  easel:
    "Lay things on the paper and expose. Nothing will show until it's in the developer.",
  developer:
    "Fifteen seconds here is a minute in the tray. The blacks come up first; the pale greys need the full time.",
  stop: "A weak acid that kills the developer at once, so development stops where you chose.",
  fixer:
    "Dissolves the halide that never saw light. Until it has, white light can still print.",
};

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

function Choice<T extends string | number>({
  label,
  value,
  options,
  columns,
  disabled,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  columns: number;
  disabled?: (value: T) => boolean;
  onChange: (value: T) => void;
}) {
  return (
    <Radio.Group
      aria-label={label}
      className="grid gap-1"
      onValueChange={(next) => onChange(next as T)}
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      value={value}
    >
      {options.map((option) => (
        <Radio.Root
          className="px-0.5 py-1 text-center"
          disabled={disabled?.(option.value)}
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

function Description({ children }: { children: ReactNode }) {
  return (
    <p className="text-grayscale-10 text-xs leading-relaxed">{children}</p>
  );
}

function seconds(value: number) {
  return `${Number.isInteger(value) ? value : value.toFixed(1)} s`;
}

function clockFace(value: number) {
  const whole = Math.floor(value);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

export default function PhotogramLab() {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Photogram | null>(null);
  const [settings, setSettings] = useState<PhotogramSettings>(DEFAULT_SETTINGS);
  const [stats, setStats] = useState<PhotogramStats>({
    station: "easel",
    moving: false,
    lamp: "off",
    remaining: 0,
    clock: 0,
    developed: 0,
    fixed: false,
    fogged: false,
    empty: false,
    exposed: false,
    fps: null,
  });
  const [prints, setPrints] = useState<Print[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const [holding, setHolding] = useState<"grab" | "dodge" | "rock" | null>(
    null,
  );
  const [fullscreen, setFullscreen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set =
    <K extends keyof PhotogramSettings>(key: K) =>
    (value: PhotogramSettings[K]) =>
      setSettings((current) => ({ ...current, [key]: value }));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let engine: Photogram;
    try {
      engine = createPhotogram(canvas, {
        onStats: setStats,
        onNote: setNote,
        onPrint: (print) =>
          setPrints((current) => [print, ...current].slice(0, 9)),
      });
    } catch (err) {
      console.error(err);
      setError("This browser couldn't start a canvas for the darkroom.");
      return;
    }
    engineRef.current = engine;
    return () => {
      engineRef.current = null;
      engine.dispose();
    };
  }, []);

  useEffect(() => {
    engineRef.current?.setSettings(settings);
  }, [settings]);

  // A note on the stage for a few seconds, about what just happened.
  useEffect(() => {
    if (!note) return;
    const timer = setTimeout(() => setNote(null), 8000);
    return () => clearTimeout(timer);
  }, [note]);

  // The wheel turns whatever's under the pointer, so it can't be a passive listener.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const onWheel = (event: WheelEvent) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const turned = engineRef.current?.wheel(
        { x: event.clientX - rect.left, y: event.clientY - rect.top },
        event.deltaY || event.deltaX,
      );
      if (turned) event.preventDefault();
    };
    stage.addEventListener("wheel", onWheel, { passive: false });
    return () => stage.removeEventListener("wheel", onWheel);
  }, []);

  const local = (event: { clientX: number; clientY: number }) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    return rect
      ? { x: event.clientX - rect.left, y: event.clientY - rect.top }
      : { x: 0, y: 0 };
  };

  const pressed = useRef(new Set<number>());

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const engine = engineRef.current;
    if (!engine || pressed.current.has(event.pointerId)) return;
    const took = engine.pointerDown(event.pointerId, local(event));
    if (!took) return;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // A pointer the browser no longer tracks; moves still arrive while it's over the stage.
    }
    pressed.current.add(event.pointerId);
    setHolding(took);
    setTouched(true);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!pressed.current.has(event.pointerId)) return;
    engineRef.current?.pointerMove(event.pointerId, local(event));
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!pressed.current.delete(event.pointerId)) return;
    engineRef.current?.pointerUp(event.pointerId);
    if (!pressed.current.size) setHolding(null);
  };

  // From the keyboard: Space is the foot switch, Enter runs the timer, the arrows and R move
  // and turn the last thing touched.
  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const engine = engineRef.current;
    if (!engine) return;
    const step = event.shiftKey ? 10 : 2;
    const keys: Record<string, () => void> = {
      " ": () => {
        if (!event.repeat) engine.hold(true);
      },
      Enter: () => engine.expose(),
      ArrowUp: () => engine.nudge(0, -step),
      ArrowDown: () => engine.nudge(0, step),
      ArrowLeft: () => engine.nudge(-step, 0),
      ArrowRight: () => engine.nudge(step, 0),
      r: () => engine.rotate(event.shiftKey ? -0.26 : 0.26),
      R: () => engine.rotate(-0.26),
    };
    const run = keys[event.key];
    if (!run) return;
    event.preventDefault();
    run();
    setTouched(true);
  };

  const onKeyUp = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === " ") {
      event.preventDefault();
      engineRef.current?.hold(false);
    }
  };

  // Full screen is the same darkroom in a bigger frame. The page under it collapses meanwhile,
  // so its scroll position is put back on the way out. Where the browser can, the stage and its
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

  const { station, lamp, moving } = stats;
  const lit = lamp !== "off";
  const atEasel = station === "easel" && !moving;
  const next = STATIONS[STATIONS.indexOf(station) + 1] as Station | undefined;

  const primary = (() => {
    if (station === "easel")
      return lit
        ? {
            label: "Lamp off",
            icon: <StopIcon aria-hidden="true" size={13} weight="bold" />,
            run: () => engineRef.current?.expose(),
          }
        : {
            label: `Expose ${seconds(settings.seconds)}`,
            icon: <ApertureIcon aria-hidden="true" size={13} weight="bold" />,
            run: () => engineRef.current?.expose(),
          };
    if (station === "fixer")
      return {
        label: "Hang it up",
        icon: <ImagesIcon aria-hidden="true" size={13} weight="bold" />,
        run: () => engineRef.current?.hang(),
      };
    return {
      label: next === "stop" ? "Into the stop" : "Into the fixer",
      icon: <ArrowRightIcon aria-hidden="true" size={13} weight="bold" />,
      run: () => next && engineRef.current?.moveTo(next),
    };
  })();

  // The darkroom timer on the wall: the exposure on the easel, the bath's clock in a tray.
  const readout =
    station !== "easel"
      ? clockFace(stats.clock)
      : lamp === "timer"
        ? stats.remaining.toFixed(1)
        : lamp === "strip"
          ? "STRIP"
          : lamp === "hold"
            ? "ON"
            : settings.seconds.toFixed(1);

  const bathLabel =
    station === "easel" ? (lit ? "Lamp" : "Timer") : STATION_LABELS[station];

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
            aria-label="Darkroom. Drag things on the paper to arrange them; hold the paper while the lamp is on to dodge; drag a tray to rock it. Space is the enlarger's foot switch, Enter runs the timer."
            className={cn(
              "relative touch-none select-none overflow-hidden bg-black outline-none [view-transition-name:lab-pane] focus-visible:ring-2 focus-visible:ring-grayscale-7",
              holding === "grab"
                ? "cursor-grabbing"
                : station === "easel"
                  ? "cursor-grab"
                  : "cursor-ns-resize",
              fullscreen
                ? "h-[55dvh] shrink-0 lg:h-auto lg:min-w-0 lg:flex-1"
                : "h-[34rem] w-full min-w-0 rounded-[13px] border border-grayscale-3 small-shadow lg:sticky lg:top-6 lg:h-[calc(100dvh-3rem)] lg:max-h-full dark:border-grayscale-4",
            )}
            onContextMenu={(event) => event.preventDefault()}
            onKeyDown={onKeyDown}
            onKeyUp={onKeyUp}
            onLostPointerCapture={onPointerUp}
            onPointerCancel={onPointerUp}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            ref={stageRef}
            role="application"
            // biome-ignore lint/a11y/noNoninteractiveTabindex: the stage is worked with a pointer, and Space is the enlarger's foot switch.
            tabIndex={0}
          >
            <canvas className="absolute inset-0 size-full" ref={canvasRef} />

            <div
              aria-hidden="true"
              className="pointer-events-none absolute top-3 left-3 rounded-lg border border-white/5 bg-black/70 px-2 py-1 font-mono backdrop-blur-sm"
            >
              <div className="text-[0.6rem] text-red-400/50 uppercase tracking-wider">
                {bathLabel}
              </div>
              <div
                className={cn(
                  "text-lg text-red-500 tabular-nums leading-tight [text-shadow:0_0_8px_rgb(239_68_68/0.7)]",
                  station === "easel" && !lit && "text-red-500/45",
                )}
              >
                {readout}
              </div>
            </div>

            <p
              aria-live="polite"
              className={cn(
                "pointer-events-none absolute right-3 bottom-3 left-3 mx-auto w-fit max-w-sm rounded-2xl bg-black/65 px-3 py-1.5 text-center text-white/90 text-xs backdrop-blur-sm transition-opacity duration-500",
                ((touched && !note) || error) && "opacity-0",
              )}
            >
              {note ??
                "Arrange things on the paper, then expose. Only the red safelight is on."}
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
          aria-label="Darkroom controls"
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
                  station === "easel" ? (
                    <TimerIcon size={12} weight="bold" />
                  ) : (
                    <DropIcon size={12} weight="bold" />
                  )
                }
                label={
                  station === "easel"
                    ? "where the sheet is"
                    : "where the sheet is, and how long it's been in"
                }
                value={
                  station === "easel"
                    ? moving
                      ? "On the move"
                      : stats.empty
                        ? "Easel empty"
                        : "On the easel"
                    : `${STATION_LABELS[station]} ${clockFace(stats.clock)}${
                        station === "fixer" && stats.fixed ? " · fixed" : ""
                      }`
                }
              />
              <Metric
                icon={<ApertureIcon size={12} weight="bold" />}
                label="the exposure the timer will give"
                value={`${seconds(settings.seconds)} · f/${settings.aperture} · grade ${settings.grade}`}
              />
              <Metric
                icon={<GaugeIcon size={12} weight="bold" />}
                label="frames per second"
                value={stats.fps === null ? "—" : `${stats.fps} fps`}
              />
            </div>
            <div className="flex gap-1.5">
              <Button
                className="flex-auto whitespace-nowrap text-xs transition-opacity disabled:opacity-45"
                disabled={moving}
                onClick={() => {
                  primary.run();
                  setTouched(true);
                }}
                type="button"
              >
                {primary.icon}
                {primary.label}
              </Button>
              <Button
                aria-label={
                  settings.roomLight ? "Room light off" : "Room light on"
                }
                aria-pressed={settings.roomLight}
                className="w-7 shrink-0 px-0"
                onClick={() => {
                  set("roomLight")(!settings.roomLight);
                  setTouched(true);
                }}
                title={settings.roomLight ? "Room light off" : "Room light on"}
                type="button"
                variant="secondary"
              >
                {settings.roomLight ? (
                  <LightbulbFilamentIcon
                    aria-hidden="true"
                    size={14}
                    weight="fill"
                  />
                ) : (
                  <LightbulbIcon aria-hidden="true" size={14} weight="bold" />
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

          <Section title="Enlarger">
            <Choice
              columns={5}
              label="Aperture"
              onChange={(value: number) => set("aperture")(value)}
              options={APERTURES.map((n) => ({ value: n, label: `f/${n}` }))}
              value={settings.aperture}
            />
            <Range
              format={seconds}
              label="Timer"
              max={30}
              min={1}
              onChange={set("seconds")}
              step={0.5}
              value={settings.seconds}
            />
            <div className="grid gap-1.5">
              <span className="text-grayscale-11 text-xs">Filter grade</span>
              <Choice
                columns={6}
                label="Filter grade"
                onChange={(value: number) => set("grade")(value)}
                options={[0, 1, 2, 3, 4, 5].map((g) => ({
                  value: g,
                  label: String(g),
                }))}
                value={settings.grade}
              />
            </div>
            <Toggle
              checked={settings.redFilter}
              label="Red swing filter"
              onChange={set("redFilter")}
            />
            <div className="flex gap-1.5">
              <Button
                className="flex-auto whitespace-nowrap text-xs transition-opacity disabled:opacity-45"
                disabled={!atEasel || (lit && lamp !== "hold")}
                onLostPointerCapture={() => engineRef.current?.hold(false)}
                onPointerCancel={() => engineRef.current?.hold(false)}
                onPointerDown={(
                  event: ReactPointerEvent<HTMLButtonElement>,
                ) => {
                  event.currentTarget.setPointerCapture(event.pointerId);
                  engineRef.current?.hold(true);
                  setTouched(true);
                }}
                onPointerUp={() => engineRef.current?.hold(false)}
                type="button"
                variant="secondary"
              >
                <HandIcon aria-hidden="true" size={13} weight="bold" />
                Hold lamp
              </Button>
              <Button
                className="flex-auto whitespace-nowrap text-xs transition-opacity disabled:opacity-45"
                disabled={!atEasel || lit}
                onClick={() => {
                  engineRef.current?.testStrip();
                  setTouched(true);
                }}
                type="button"
                variant="secondary"
              >
                Test strip
              </Button>
            </div>
            <Description>
              Stopping down dims the light and sharpens shadows. The filter sets
              the contrast; on the stage, Space is the foot switch.
            </Description>
          </Section>

          <Section title="Process">
            <Choice
              columns={4}
              disabled={(value: Station) =>
                moving ||
                lit ||
                STATIONS.indexOf(value) < STATIONS.indexOf(station)
              }
              label="Where the sheet is"
              onChange={(value: Station) => {
                engineRef.current?.moveTo(value);
                setTouched(true);
              }}
              options={STATIONS.map((value) => ({
                value,
                label: STATION_LABELS[value],
              }))}
              value={station}
            />
            <Description>{STATION_NOTES[station]}</Description>
            <Toggle
              checked={settings.rock}
              label="Rock the tray"
              onChange={set("rock")}
            />
            <div className="flex gap-1.5">
              <Button
                className="flex-auto whitespace-nowrap text-xs transition-opacity disabled:opacity-45"
                disabled={moving}
                onClick={() => {
                  engineRef.current?.newSheet();
                  setTouched(true);
                }}
                type="button"
                variant="secondary"
              >
                <FilePlusIcon aria-hidden="true" size={13} weight="bold" />
                New sheet
              </Button>
              <Button
                className="flex-auto whitespace-nowrap text-xs transition-opacity disabled:opacity-45"
                disabled={station === "easel" || moving}
                onClick={() => engineRef.current?.hang()}
                type="button"
                variant="secondary"
              >
                <ImagesIcon aria-hidden="true" size={13} weight="bold" />
                Hang it up
              </Button>
            </div>
          </Section>

          <Section title="On the paper">
            <ToggleGroup
              aria-label="Things on the paper"
              className="grid grid-cols-3 gap-1"
              multiple
              onValueChange={(value) => set("props")(value as PropKind[])}
              value={settings.props}
            >
              {PROPS.map((prop) => (
                <BaseToggle
                  className={getRadioBadgeClassName(
                    "py-1 text-center data-[pressed]:border-grayscale-5 data-[pressed]:bg-grayscale-3 data-[pressed]:text-grayscale-12 dark:data-[pressed]:border-grayscale-6 dark:data-[pressed]:bg-grayscale-5",
                  )}
                  key={prop.value}
                  value={prop.value}
                >
                  {prop.label}
                </BaseToggle>
              ))}
            </ToggleGroup>
            <div className="flex gap-1.5">
              <Button
                className="flex-auto whitespace-nowrap text-xs transition-opacity disabled:opacity-45"
                onClick={() => engineRef.current?.shuffle()}
                type="button"
                variant="secondary"
              >
                <ShuffleIcon aria-hidden="true" size={13} weight="bold" />
                Shuffle
              </Button>
              <Button
                className="flex-auto whitespace-nowrap text-xs transition-opacity disabled:opacity-45"
                onClick={() => set("props")([])}
                type="button"
                variant="secondary"
              >
                <BroomIcon aria-hidden="true" size={13} weight="bold" />
                Clear
              </Button>
            </div>
            <Description>
              Things turn to trail behind as you pull them; the wheel or R turns
              them too. Hold the paper while the lamp is on to dodge.
            </Description>
          </Section>

          <Section title="Paper">
            <Choice
              columns={2}
              label="Paper"
              onChange={(value: PaperKind) => set("paper")(value)}
              options={Object.values(PAPERS)}
              value={settings.paper}
            />
            <Description>{PAPERS[settings.paper].description}</Description>
          </Section>

          <Section title="Prints">
            {prints.length ? (
              <ul className="grid grid-cols-3 gap-2">
                {prints.map((print, i) => (
                  <li key={print.url}>
                    <a
                      className="block overflow-hidden rounded-[3px] shadow-[0_0_0_1px_var(--gray-4)] transition-transform hover:-translate-y-0.5 dark:shadow-[0_0_0_1px_var(--gray-6)]"
                      download={`photogram-${prints.length - i}.png`}
                      href={print.url}
                      title={`${print.caption}. Click to save.`}
                    >
                      {/* biome-ignore lint/performance/noImgElement: a print made in the browser, as a data URL. */}
                      <img
                        alt={`Photogram ${prints.length - i}: ${print.caption}`}
                        className="block aspect-[203/254] w-full"
                        src={print.url}
                      />
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <Description>
                Prints you hang up dry here. Click one to save it.
              </Description>
            )}
          </Section>

          <Section title="Try">
            <ul className="grid gap-2 text-grayscale-11 text-xs leading-relaxed">
              <li>
                Swing the red filter in and hold the lamp: arrange things by its
                light, then swing it out and expose.
              </li>
              <li>
                Make a test strip, develop it, and pick the band you like.
              </li>
              <li>Expose, nudge the fern, expose again. It leaves a ghost.</li>
              <li>
                Look for the marble on the print: a black hot spot in a white
                ring, where it gathered the light like a lens.
              </li>
              <li>
                Expose once at grade 0 and once at grade 5 for a split-grade
                print, and watch the light change colour.
              </li>
              <li>
                Turn off rocking and pull the print at 20 seconds. Then switch
                the room light on while one is developing.
              </li>
            </ul>
          </Section>
        </aside>
      </div>
    </div>
  );
}
