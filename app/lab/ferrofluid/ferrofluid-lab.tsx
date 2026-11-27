"use client";

import { Slider } from "@base-ui/react/slider";
import {
  ArrowsDownUpIcon,
  ArrowsInSimpleIcon,
  ArrowsOutSimpleIcon,
  BroomIcon,
  GaugeIcon,
  MagnetIcon,
  TriangleIcon,
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
  createFerrofluid,
  type Ferrofluid,
  type FerrofluidSettings,
  type FerrofluidStats,
  type Light,
} from "@/lib/ferrofluid/engine";
import type { MagnetKind } from "@/lib/ferrofluid/magnets";

const DEFAULTS: FerrofluidSettings = {
  magnet: "disc",
  gap: 12,
  angle: 0,
  frequency: 0,
  amount: 3,
  light: "softbox",
};

const MAGNETS: { value: MagnetKind; label: string }[] = [
  { value: "disc", label: "Disc" },
  { value: "ring", label: "Ring" },
  { value: "bar", label: "Bar" },
  { value: "pair", label: "Pair" },
  { value: "coil", label: "Coil" },
];

const LIGHTS: { value: Light; label: string }[] = [
  { value: "softbox", label: "Softbox" },
  { value: "window", label: "Window" },
  { value: "ring", label: "Ring light" },
];

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
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <Radio.Group
      aria-label={label}
      className="grid grid-cols-3 gap-1"
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

// What turning the magnet over shows: nothing at all, unless it's one of a pair.
function flipNote(kind: MagnetKind, flipped: boolean) {
  if (kind === "pair") {
    return flipped
      ? "Opposite poles: the field now runs across from one to the other, and the fluid lies down along it between them."
      : "Like poles again: the field between them points up, and the spikes stand up there too.";
  }
  if (!flipped) return "Back the other way. Still nothing changes.";
  const turned =
    kind === "bar"
      ? "Turned end to end."
      : kind === "coil"
        ? "Current reversed."
        : "South pole up.";
  return `${turned} Nothing changes: the fluid is drawn by how strong the field is, not which way it points.`;
}

export default function FerrofluidLab() {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fluidRef = useRef<Ferrofluid | null>(null);
  const [settings, setSettings] = useState(DEFAULTS);
  const [stats, setStats] = useState<FerrofluidStats>({
    field: 0,
    spikes: 0,
    fps: null,
  });
  const [present, setPresent] = useState(true);
  const [note, setNote] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set =
    <K extends keyof FerrofluidSettings>(key: K) =>
    (value: FerrofluidSettings[K]) =>
      setSettings((current) => ({ ...current, [key]: value }));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let fluid: Ferrofluid;
    try {
      fluid = createFerrofluid(canvas, { onStats: setStats });
    } catch (err) {
      console.error(err);
      setError("This browser couldn't start WebGL for the ferrofluid.");
      return;
    }
    fluidRef.current = fluid;
    return () => {
      fluidRef.current = null;
      fluid.dispose();
    };
  }, []);

  useEffect(() => {
    fluidRef.current?.setSettings(settings);
  }, [settings]);

  useEffect(() => {
    fluidRef.current?.setPresent(present);
  }, [present]);

  // A note on the stage for a few seconds, about what just changed.
  useEffect(() => {
    if (!note) return;
    const timer = setTimeout(() => setNote(null), 6000);
    return () => clearTimeout(timer);
  }, [note]);

  const flip = () => {
    const flipped = fluidRef.current?.flip();
    if (flipped === undefined) return;
    setPresent(true);
    setNote(flipNote(settings.magnet, flipped));
  };

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
    const fluid = fluidRef.current;
    if (!fluid) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    pressed.current = event.pointerId;
    event.currentTarget.style.cursor = "grabbing";
    setPresent(true);
    fluid.pointerDown(event.pointerId, local(event));
    setTouched(true);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (pressed.current !== event.pointerId) return;
    fluidRef.current?.pointerMove(event.pointerId, local(event));
  };

  const onPointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (pressed.current !== event.pointerId) return;
    pressed.current = null;
    event.currentTarget.style.cursor = "";
    fluidRef.current?.pointerUp(event.pointerId);
  };

  // From the keyboard: arrows slide the magnet about, Page Up and Down bring it nearer or
  // further, and F turns it over.
  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const fluid = fluidRef.current;
    if (!fluid) return;
    const by = event.shiftKey ? 8 : 2;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-by, 0],
      ArrowRight: [by, 0],
      ArrowUp: [0, by],
      ArrowDown: [0, -by],
    };
    const move = moves[event.key];
    if (move) {
      event.preventDefault();
      setPresent(true);
      fluid.nudge(...move);
      setTouched(true);
    } else if (event.key === "PageUp" || event.key === "PageDown") {
      event.preventDefault();
      const nearer = event.key === "PageUp" ? -1 : 1;
      setSettings((current) => ({
        ...current,
        gap: Math.min(40, Math.max(3, current.gap + nearer)),
      }));
    } else if (event.key === "f" || event.key === "F") {
      flip();
    }
  };

  // Full screen is the same dish in a bigger frame. The page under it collapses meanwhile, so
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

  const turns = settings.magnet === "bar" || settings.magnet === "pair";
  const coil = settings.magnet === "coil";

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
            aria-label="A glass dish of ferrofluid with a magnet under it. Drag on the stage, or use the arrow keys, to move the magnet; Page Up and Page Down bring it nearer or further; F turns it over."
            className={cn(
              "relative cursor-grab touch-none select-none overflow-hidden bg-white outline-none [view-transition-name:lab-pane] focus-visible:ring-2 focus-visible:ring-grayscale-7 dark:bg-grayscale-3",
              fullscreen
                ? "h-[55dvh] shrink-0 lg:h-auto lg:min-w-0 lg:flex-1"
                : "h-[34rem] w-full min-w-0 rounded-[13px] border border-grayscale-3 small-shadow lg:sticky lg:top-6 lg:h-[calc(100dvh-3rem)] lg:max-h-full dark:border-grayscale-4",
            )}
            onContextMenu={(event) => event.preventDefault()}
            onKeyDown={onKeyDown}
            onLostPointerCapture={onPointerEnd}
            onPointerCancel={onPointerEnd}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerEnd}
            ref={stageRef}
            role="application"
            // biome-ignore lint/a11y/noNoninteractiveTabindex: the stage is a two-way control, worked with a pointer or the arrow keys.
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
              {note ?? "Drag to move the magnet under the dish"}
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
          aria-label="Ferrofluid controls"
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
                icon={<MagnetIcon size={12} weight="bold" />}
                label="strongest field across the dish's floor"
                value={`${stats.field} mT`}
              />
              <Metric
                icon={<TriangleIcon size={12} weight="bold" />}
                label="spikes standing"
                value={`${stats.spikes} ${stats.spikes === 1 ? "spike" : "spikes"}`}
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
                onClick={flip}
                type="button"
              >
                <ArrowsDownUpIcon aria-hidden="true" size={13} weight="bold" />
                Turn over
              </Button>
              <button
                aria-pressed={!present}
                className={getButtonClassName({
                  variant: "secondary",
                  className:
                    "flex-auto whitespace-nowrap text-xs aria-pressed:border-grayscale-6 aria-pressed:bg-grayscale-3 aria-pressed:text-grayscale-12 dark:aria-pressed:bg-grayscale-5",
                })}
                onClick={() => setPresent((on) => !on)}
                type="button"
              >
                <MagnetIcon aria-hidden="true" size={13} weight="bold" />
                Take away
              </button>
              <Button
                aria-label="Clean the dish"
                className="w-7 shrink-0 px-0"
                onClick={() => fluidRef.current?.reset()}
                title="Clean the dish"
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

          <Section title="Magnet">
            <Choice
              label="Magnet"
              onChange={(value) => {
                set("magnet")(value);
                setPresent(true);
              }}
              options={MAGNETS}
              value={settings.magnet}
            />
            <Range
              format={(v) => `${v} mm`}
              label="Gap below the dish"
              max={40}
              min={3}
              onChange={set("gap")}
              value={settings.gap}
            />
            <Range
              disabled={!turns}
              format={(v) => `${v}°`}
              label="Turned"
              max={180}
              min={0}
              onChange={set("angle")}
              step={5}
              value={settings.angle}
            />
            <Range
              disabled={!coil}
              format={(v) => (v ? `${v} Hz alternating` : "Direct")}
              label="Coil current"
              max={3}
              min={0}
              onChange={(value) => {
                set("frequency")(value);
                if (value > 0) {
                  setNote(
                    `The current reverses ${value * 2} times a second, and the field's strength peaks just as often, so the spikes rise ${value * 2} times a second, not ${value}.`,
                  );
                }
              }}
              step={0.25}
              value={settings.frequency}
            />
          </Section>

          <Section title="Dish">
            <Range
              format={(v) => `${v.toFixed(1)} ml`}
              label="Ferrofluid"
              max={6}
              min={1}
              onChange={set("amount")}
              step={0.5}
              value={settings.amount}
            />
            <Choice
              label="Light"
              onChange={set("light")}
              options={LIGHTS}
              value={settings.light}
            />
          </Section>

          <Section title="Try">
            <ul className="grid gap-2 text-grayscale-11 text-xs leading-relaxed">
              <li>
                Widen the gap slowly until the spikes fall, then close it again.
                They stand back up only once the field is well past where they
                fell.
              </li>
              <li>Turn the magnet over. Then try it with the pair.</li>
              <li>
                Drag the magnet out from under the fluid and look at the glass
                it leaves behind.
              </li>
            </ul>
          </Section>
        </aside>
      </div>
    </div>
  );
}
