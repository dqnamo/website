"use client";

import {
  ArrowClockwiseIcon,
  ArrowLineLeftIcon,
  ArrowLineRightIcon,
  ArrowsInSimpleIcon,
  ArrowsOutSimpleIcon,
  BroomIcon,
  EraserIcon,
  GaugeIcon,
  PencilSimpleLineIcon,
  RulerIcon,
  ScribbleLoopIcon,
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
  createSharpener,
  DEFAULT_SETTINGS,
  type PencilId,
  type Sharpener,
  type SharpenerSettings,
  type SharpenerStats,
} from "@/lib/sharpener/engine";
import { PENCILS } from "@/lib/sharpener/pencils";

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

function Choice<T extends string>({
  label,
  value,
  options,
  columns,
  onChange,
}: {
  label: string;
  value: T | null;
  options: { value: T; label: string }[];
  columns: 2 | 3;
  onChange: (value: T) => void;
}) {
  return (
    <Radio.Group
      aria-label={label}
      className={cn(
        "grid gap-1",
        columns === 2 ? "grid-cols-2" : "grid-cols-3",
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

const PENCIL_OPTIONS: { value: PencilId; label: string }[] = [
  { value: "yellow", label: "HB" },
  { value: "striped", label: "Striped" },
  { value: "round", label: "Round 6B" },
  { value: "triangle", label: "Three-sided" },
  { value: "colour", label: "Vermilion" },
];

export default function SharpenerLab() {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const deskRef = useRef<Sharpener | null>(null);
  const [settings, setSettings] = useState<SharpenerSettings>(DEFAULT_SETTINGS);
  const [stats, setStats] = useState<SharpenerStats>({
    point: 0,
    length: 0,
    turns: 0,
    docked: true,
    fps: null,
  });
  const [note, setNote] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const [holding, setHolding] = useState(false);
  const [turning, setTurning] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set =
    <K extends keyof SharpenerSettings>(key: K) =>
    (value: SharpenerSettings[K]) =>
      setSettings((current) => ({ ...current, [key]: value }));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let desk: Sharpener;
    try {
      desk = createSharpener(canvas, { onStats: setStats, onNote: setNote });
    } catch (err) {
      console.error(err);
      setError("This browser couldn't start WebGL2 for the sharpener.");
      return;
    }
    deskRef.current = desk;
    return () => {
      deskRef.current = null;
      desk.dispose();
    };
  }, []);

  useEffect(() => {
    deskRef.current?.setSettings(settings);
  }, [settings]);

  // The light follows the site's theme: a window by day, a desk lamp in the evening.
  useEffect(() => {
    const root = document.documentElement;
    const follow = () =>
      deskRef.current?.setNight(root.classList.contains("dark"));
    follow();
    const theme = new MutationObserver(follow);
    theme.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => theme.disconnect();
  }, []);

  // A note on the stage for a while, about what just happened.
  useEffect(() => {
    if (!note) return;
    const timer = setTimeout(() => setNote(null), 9000);
    return () => clearTimeout(timer);
  }, [note]);

  const local = (event: { clientX: number; clientY: number }) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    return rect
      ? { x: event.clientX - rect.left, y: event.clientY - rect.top }
      : { x: 0, y: 0 };
  };

  const pressed = useRef(new Set<number>());
  const lastMove = useRef(0);

  const setCursor = (cursor: string) => {
    if (stageRef.current) stageRef.current.style.cursor = cursor;
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const desk = deskRef.current;
    if (!desk || pressed.current.size) return;
    const cursor = desk.pointerDown(event.pointerId, local(event));
    if (!cursor) return;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // A pointer the browser no longer tracks; moves still arrive while it's over the stage.
    }
    pressed.current.add(event.pointerId);
    lastMove.current = performance.now();
    setHolding(true);
    setCursor(cursor);
    setTouched(true);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const desk = deskRef.current;
    if (!desk) return;
    if (pressed.current.has(event.pointerId)) {
      const now = performance.now();
      const dt = Math.min(
        0.05,
        Math.max(0.001, (now - lastMove.current) / 1000),
      );
      lastMove.current = now;
      desk.pointerMove(event.pointerId, local(event), dt);
      return;
    }
    if (event.pointerType === "mouse") setCursor(desk.hover(local(event)));
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!pressed.current.has(event.pointerId)) return;
    pressed.current.delete(event.pointerId);
    deskRef.current?.pointerUp(event.pointerId);
    setHolding(false);
    setCursor("default");
  };

  const hold = (on: boolean) => {
    deskRef.current?.turn(on);
    setTurning(on);
    if (on) setTouched(true);
  };

  // From the keyboard: hold Space to turn, Down and Up to turn a little either way, Enter to
  // take the pencil out or put it back, W to write a test line.
  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const desk = deskRef.current;
    if (!desk || event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.key === " ") {
      event.preventDefault();
      if (!event.repeat) hold(true);
    } else if (event.key === "ArrowDown" || event.key === "ArrowRight") {
      event.preventDefault();
      desk.nudge(1);
      setTouched(true);
    } else if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
      event.preventDefault();
      desk.nudge(-1);
    } else if (event.key === "Enter") {
      event.preventDefault();
      desk.toggleDock();
    } else if (event.key === "w" || event.key === "W") {
      desk.scribble();
      setTouched(true);
    }
  };

  const onKeyUp = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === " ") hold(false);
  };

  // Full screen is the same desk in a bigger frame. The page under it collapses meanwhile, so
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

  const spec = PENCILS.find((p) => p.id === settings.pencil) ?? PENCILS[0];

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
            aria-label="Pencil sharpener. Drag down across the pencil to turn it in the sharpener, or hold Space. Pull it out to the left, write on the notepad, and drag it back to the hole."
            className={cn(
              "relative touch-none select-none overflow-hidden bg-grayscale-3 outline-none [view-transition-name:lab-pane] focus-visible:ring-2 focus-visible:ring-grayscale-7 dark:bg-black",
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
            onPointerLeave={() => {
              if (!pressed.current.size) setCursor("default");
            }}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            ref={stageRef}
            role="application"
            // biome-ignore lint/a11y/noNoninteractiveTabindex: the stage is played with a pointer, or with Space, the arrows and Enter.
            tabIndex={0}
          >
            <canvas className="absolute inset-0 size-full" ref={canvasRef} />

            <p
              aria-live="polite"
              className={cn(
                "pointer-events-none absolute right-3 bottom-3 left-3 mx-auto w-fit max-w-sm rounded-2xl bg-black/55 px-3 py-1.5 text-center text-white/90 text-xs backdrop-blur-sm transition-opacity duration-500",
                ((touched && !note) || error || (holding && !note)) &&
                  "opacity-0",
              )}
            >
              {note ??
                "Drag down across the pencil to turn it in the sharpener"}
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
          aria-label="Sharpener controls"
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
                icon={<PencilSimpleLineIcon size={12} weight="bold" />}
                label="width of the point"
                value={
                  stats.point < 0.05
                    ? "sharp"
                    : `${stats.point.toFixed(2)} mm point`
                }
              />
              <Metric
                icon={<RulerIcon size={12} weight="bold" />}
                label="length of the pencil"
                value={`${Math.round(stats.length)} mm`}
              />
              <Metric
                icon={<ArrowClockwiseIcon size={12} weight="bold" />}
                label="turns that cut, this time in the sharpener"
                value={`${stats.turns.toFixed(1)} turns`}
              />
              <Metric
                icon={<GaugeIcon size={12} weight="bold" />}
                label="frames per second"
                value={stats.fps === null ? "—" : `${stats.fps} fps`}
              />
            </div>
            <div className="flex gap-1.5">
              <Button
                aria-pressed={turning}
                className="flex-auto touch-none select-none whitespace-nowrap text-xs"
                onKeyDown={(event: ReactKeyboardEvent<HTMLButtonElement>) => {
                  if (
                    (event.key === " " || event.key === "Enter") &&
                    !event.repeat
                  ) {
                    event.preventDefault();
                    hold(true);
                  }
                }}
                onKeyUp={(event: ReactKeyboardEvent<HTMLButtonElement>) => {
                  if (event.key === " " || event.key === "Enter") hold(false);
                }}
                onPointerCancel={() => hold(false)}
                onPointerDown={(
                  event: ReactPointerEvent<HTMLButtonElement>,
                ) => {
                  event.currentTarget.setPointerCapture(event.pointerId);
                  hold(true);
                }}
                onPointerUp={() => hold(false)}
                type="button"
              >
                <ArrowClockwiseIcon
                  aria-hidden="true"
                  size={13}
                  weight="bold"
                />
                Hold to turn
              </Button>
              <Button
                aria-label={
                  stats.docked
                    ? "Take the pencil out"
                    : "Put it in the sharpener"
                }
                className="w-7 shrink-0 px-0"
                onClick={() => {
                  deskRef.current?.toggleDock();
                  setTouched(true);
                }}
                title={
                  stats.docked
                    ? "Take the pencil out (Enter)"
                    : "Put it in the sharpener (Enter)"
                }
                type="button"
                variant="secondary"
              >
                {stats.docked ? (
                  <ArrowLineLeftIcon
                    aria-hidden="true"
                    size={14}
                    weight="bold"
                  />
                ) : (
                  <ArrowLineRightIcon
                    aria-hidden="true"
                    size={14}
                    weight="bold"
                  />
                )}
              </Button>
              <Button
                aria-label="Try the point on the notepad"
                className="w-7 shrink-0 px-0"
                onClick={() => {
                  deskRef.current?.scribble();
                  setTouched(true);
                }}
                title="Try the point on the notepad (W)"
                type="button"
                variant="secondary"
              >
                <ScribbleLoopIcon aria-hidden="true" size={14} weight="bold" />
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
              Drag down across the pencil to turn it; up only rubs. Pull it out
              to the left to write on the notepad, and drag it back to the hole.
            </p>
          </div>

          <Section title="Pencil">
            <Choice
              columns={3}
              label="Pencil"
              onChange={(value) => {
                set("pencil")(value);
                setTouched(true);
              }}
              options={PENCIL_OPTIONS}
              value={settings.pencil}
            />
            <p className="text-grayscale-10 text-xs leading-4">{spec.note}</p>
            <div className="flex gap-1.5">
              <Button
                className="flex-1 text-xs"
                onClick={() => {
                  deskRef.current?.fresh();
                  setNote(
                    "A new one, flat-ended from the box. It takes nearly thirty turns to bring to a point.",
                  );
                }}
                type="button"
                variant="secondary"
              >
                New from the box
              </Button>
              <Button
                className="flex-1 text-xs"
                onClick={() => deskRef.current?.dropIt()}
                type="button"
                variant="secondary"
              >
                Drop it
              </Button>
            </div>
          </Section>

          <Section title="Sharpener">
            <Choice
              columns={2}
              label="Point"
              onChange={set("point")}
              options={[
                { value: "standard", label: "Ordinary point" },
                { value: "long", label: "Long point" },
              ]}
              value={settings.point}
            />
            <Choice
              columns={2}
              label="Blade"
              onChange={set("blade")}
              options={[
                { value: "sharp", label: "Sharp blade" },
                { value: "dull", label: "Dull blade" },
              ]}
              value={settings.blade}
            />
            <Choice
              columns={2}
              label="Body"
              onChange={set("body")}
              options={[
                { value: "magnesium", label: "Magnesium" },
                { value: "brass", label: "Brass" },
              ]}
              value={settings.body}
            />
            <p className="text-grayscale-10 text-xs leading-4">
              {settings.point === "long"
                ? "A narrower cone: a longer point, and a wider shaving that takes about seven turns to close its ring."
                : "A 23° cone: unrolled, each turn of shaving is a fan of about 72°, so five turns close a ring."}
            </p>
          </Section>

          <Section title="Desk">
            <div className="flex gap-1.5">
              <Button
                className="flex-1 text-xs"
                onClick={() => deskRef.current?.sweep()}
                type="button"
                variant="secondary"
              >
                <BroomIcon aria-hidden="true" size={13} weight="bold" />
                Sweep up
              </Button>
              <Button
                className="flex-1 text-xs"
                onClick={() => deskRef.current?.clearPage()}
                type="button"
                variant="secondary"
              >
                <EraserIcon aria-hidden="true" size={13} weight="bold" />
                New page
              </Button>
            </div>
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
