"use client";

import { Slider } from "@base-ui/react/slider";
import {
  ArrowCounterClockwiseIcon,
  ArrowsInSimpleIcon,
  ArrowsOutSimpleIcon,
  BroomIcon,
  GaugeIcon,
  LightbulbFilamentIcon,
  LightningIcon,
  PathIcon,
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
  CAPACITY,
  createNeon,
  DEFAULT_SETTINGS,
  type Light,
  type Neon,
  type NeonSettings,
  type NeonStats,
  type Tool,
  type Wall,
} from "@/lib/neon/engine";
import { COLOUR_BY_VALUE, COLOURS, type Colour } from "@/lib/neon/glass";
import { SIGNS } from "@/lib/neon/signs";

const TOOLS: { value: Tool; label: string }[] = [
  { value: "bend", label: "Bend" },
  { value: "recolour", label: "Refill" },
  { value: "blockout", label: "Paint" },
  { value: "remove", label: "Remove" },
];

const LIGHTS: { value: Light; label: string }[] = [
  { value: "day", label: "Day" },
  { value: "dusk", label: "Dusk" },
  { value: "night", label: "Night" },
];

const WALLS: { value: Wall; label: string }[] = [
  { value: "brick", label: "Brick" },
  { value: "whitewash", label: "Limewash" },
  { value: "board", label: "Board" },
];

const HINTS: Record<Tool, string> = {
  bend: "Draw on the wall to bend a tube",
  recolour: "Tap a tube to fill it with the chosen glass and gas",
  blockout: "Drag along a tube to paint it out",
  remove: "Tap a tube to take it down",
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

// How much of the transformer the sign asks for, as a bar that warms past its limit.
function LoadBar({ load, metres }: { load: number; metres: number }) {
  const over = load > 1;
  const failing = load > 1.3;
  return (
    <div className="grid gap-1.5">
      <div className="flex items-baseline justify-between gap-3 text-xs">
        <span className="text-grayscale-11">Tube on this transformer</span>
        <span
          className={cn(
            "shrink-0 whitespace-nowrap tabular-nums",
            over ? "text-orange-11" : "text-grayscale-10",
            failing && "text-red-11",
          )}
        >
          {metres.toFixed(1)} of {(CAPACITY / 1000).toFixed(0)} m
        </span>
      </div>
      <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-grayscale-3 dark:bg-grayscale-5">
        <div
          className={cn(
            "absolute inset-y-0 left-0 rounded-full transition-[width,background-color] duration-300",
            over ? "bg-orange-9" : "bg-grayscale-6 dark:bg-grayscale-8",
            failing && "bg-red-9",
          )}
          style={{ width: `${Math.min(load / 1.3, 1) * 100}%` }}
        />
        <div
          aria-hidden="true"
          className="absolute inset-y-0 w-px bg-grayscale-9"
          style={{ left: `${(1 / 1.3) * 100}%` }}
        />
      </div>
    </div>
  );
}

export default function NeonLab() {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const neonRef = useRef<Neon | null>(null);
  const [settings, setSettings] = useState<NeonSettings>(DEFAULT_SETTINGS);
  const [stats, setStats] = useState<NeonStats>({
    tubes: 0,
    metres: 0,
    load: 0,
    canUndo: false,
    fps: null,
  });
  const [on, setOn] = useState(true);
  const [note, setNote] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The room follows the site's theme until a light is picked.
  const lightPicked = useRef(false);

  const set =
    <K extends keyof NeonSettings>(key: K) =>
    (value: NeonSettings[K]) =>
      setSettings((current) => ({ ...current, [key]: value }));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let neon: Neon;
    try {
      neon = createNeon(canvas, { onStats: setStats, onNote: setNote });
    } catch (err) {
      console.error(err);
      setError("This browser couldn't start WebGL for the sign.");
      return;
    }
    neonRef.current = neon;
    return () => {
      neonRef.current = null;
      neon.dispose();
    };
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    const follow = () => {
      if (lightPicked.current) return;
      const light = root.classList.contains("dark") ? "night" : "dusk";
      setSettings((current) =>
        current.light === light ? current : { ...current, light },
      );
    };
    follow();
    const theme = new MutationObserver(follow);
    theme.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => theme.disconnect();
  }, []);

  useEffect(() => {
    neonRef.current?.setSettings(settings);
  }, [settings]);

  useEffect(() => {
    neonRef.current?.setPower(on);
  }, [on]);

  // A note on the stage for a few seconds, about what just happened.
  useEffect(() => {
    if (!note) return;
    const timer = setTimeout(() => setNote(null), 7000);
    return () => clearTimeout(timer);
  }, [note]);

  const local = (event: { clientX: number; clientY: number }) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    return rect
      ? { x: event.clientX - rect.left, y: event.clientY - rect.top }
      : { x: 0, y: 0 };
  };

  const pressed = useRef<number | null>(null);

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (pressed.current !== null) return;
    const neon = neonRef.current;
    if (!neon) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    pressed.current = event.pointerId;
    neon.pointerDown(event.pointerId, local(event));
    setTouched(true);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (pressed.current !== event.pointerId) return;
    neonRef.current?.pointerMove(event.pointerId, local(event));
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (pressed.current !== event.pointerId) return;
    pressed.current = null;
    neonRef.current?.pointerUp(event.pointerId);
  };

  const onPointerCancel = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (pressed.current !== event.pointerId) return;
    pressed.current = null;
    neonRef.current?.pointerCancel(event.pointerId);
  };

  // From the keyboard: Space switches the sign on and off, and Ctrl or ⌘ Z takes back the last
  // change.
  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === " ") {
      event.preventDefault();
      setOn((current) => !current);
    } else if (
      (event.metaKey || event.ctrlKey) &&
      event.key.toLowerCase() === "z"
    ) {
      event.preventDefault();
      neonRef.current?.undo();
    }
  };

  // Full screen is the same wall in a bigger frame. The page under it collapses meanwhile, so
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

  const colour = COLOUR_BY_VALUE[settings.colour];
  const hint = HINTS[settings.tool];

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
            aria-label="A wall with a neon sign on it. Draw on the wall to bend a new tube in the chosen glass; Space switches the sign on and off, and Ctrl or Command Z undoes."
            className={cn(
              "relative touch-none select-none overflow-hidden bg-grayscale-12 outline-none [view-transition-name:lab-pane] focus-visible:ring-2 focus-visible:ring-grayscale-7 dark:bg-black",
              settings.tool === "bend" ? "cursor-crosshair" : "cursor-pointer",
              fullscreen
                ? "h-[55dvh] shrink-0 lg:h-auto lg:min-w-0 lg:flex-1"
                : "h-[34rem] w-full min-w-0 rounded-[13px] border border-grayscale-3 small-shadow lg:sticky lg:top-6 lg:h-[calc(100dvh-3rem)] lg:max-h-full dark:border-grayscale-4",
            )}
            onContextMenu={(event) => event.preventDefault()}
            onKeyDown={onKeyDown}
            onLostPointerCapture={onPointerUp}
            onPointerCancel={onPointerCancel}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            ref={stageRef}
            role="application"
            // biome-ignore lint/a11y/noNoninteractiveTabindex: the stage is drawn on with a pointer and switched with the keyboard.
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
          aria-label="Neon controls"
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
                icon={<PathIcon size={12} weight="bold" />}
                label="tubes on the wall"
                value={`${stats.tubes} ${stats.tubes === 1 ? "tube" : "tubes"}`}
              />
              <Metric
                icon={<LightningIcon size={12} weight="bold" />}
                label="of what one transformer can light"
                value={`${Math.round(stats.load * 100)}%`}
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
                onClick={() => setOn((current) => !current)}
                type="button"
              >
                <LightbulbFilamentIcon
                  aria-hidden="true"
                  size={13}
                  weight={on ? "bold" : "fill"}
                />
                {on ? "Switch off" : "Switch on"}
              </Button>
              <Button
                aria-label="Undo"
                className="w-7 shrink-0 px-0"
                disabled={!stats.canUndo}
                onClick={() => neonRef.current?.undo()}
                title="Undo (Ctrl or ⌘ Z)"
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
                aria-label="Take the sign down"
                className="w-7 shrink-0 px-0"
                disabled={!stats.tubes}
                onClick={() => neonRef.current?.clear()}
                title="Take the sign down"
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

          <Section title="Tool">
            <Choice
              columns={4}
              label="Tool"
              onChange={set("tool")}
              options={TOOLS}
              value={settings.tool}
            />
          </Section>

          <Section title="Glass and gas">
            <Radio.Group
              aria-label="Glass and gas"
              className="grid grid-cols-4 gap-1"
              onValueChange={(next) => set("colour")(next as Colour)}
              value={settings.colour}
            >
              {COLOURS.map((option) => (
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
            <p className="text-grayscale-10 text-xs leading-relaxed">
              {colour.description}
            </p>
          </Section>

          <Section title="Signs">
            <div className="grid grid-cols-4 gap-1">
              {SIGNS.map((sign) => (
                <Button
                  className="px-0 text-xs"
                  key={sign.value}
                  onClick={() => {
                    neonRef.current?.loadSign(sign.value);
                    setTouched(true);
                  }}
                  type="button"
                  variant="secondary"
                >
                  {sign.label}
                </Button>
              ))}
            </div>
          </Section>

          <Section title="Setting">
            <Choice
              columns={3}
              label="Light"
              onChange={(value) => {
                lightPicked.current = true;
                set("light")(value);
              }}
              options={LIGHTS}
              value={settings.light}
            />
            <Choice
              columns={3}
              label="Wall"
              onChange={set("wall")}
              options={WALLS}
              value={settings.wall}
            />
            <Range
              format={(v) => `${v < 0 ? "−" : ""}${Math.abs(v)} °C`}
              label="Outside"
              max={35}
              min={-15}
              onChange={set("temperature")}
              value={settings.temperature}
            />
            <Toggle
              checked={settings.hum}
              label="Transformer hum"
              onChange={set("hum")}
            />
          </Section>

          <Section title="Transformer">
            <LoadBar load={stats.load} metres={stats.metres} />
          </Section>

          <Section title="Try">
            <ul className="grid gap-2 text-grayscale-11 text-xs leading-relaxed">
              <li>
                Draw a sharp zigzag. Hot glass only bends so tight, so every
                corner comes out round.
              </li>
              <li>
                Turn the temperature below freezing, then switch the sign off
                and on. Watch the blue tubes, then the red ones.
              </li>
              <li>
                Switch off and look at the glass: clear, coated white, or
                tinted.
              </li>
              <li>
                Paint a tube where it crosses another, so it seems to pass
                behind.
              </li>
              <li>Keep bending well past the transformer&rsquo;s limit.</li>
            </ul>
          </Section>
        </aside>
      </div>
    </div>
  );
}
