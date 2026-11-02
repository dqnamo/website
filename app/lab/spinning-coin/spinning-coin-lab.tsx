"use client";

import {
  AngleIcon,
  ArrowsClockwiseIcon,
  ArrowsInSimpleIcon,
  ArrowsOutSimpleIcon,
  ArrowUpIcon,
  CircleHalfIcon,
  GaugeIcon,
  HandPalmIcon,
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
import { COINS, TABLES } from "@/lib/spinning-coin/coins";
import {
  type CoinId,
  type CoinSettings,
  type CoinStats,
  createSpinningCoin,
  DEFAULT_SETTINGS,
  type SpinningCoin,
  type TableId,
} from "@/lib/spinning-coin/engine";

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

const COIN_OPTIONS: { value: CoinId; label: string }[] = [
  { value: "silver", label: "Silver coin" },
  { value: "copper", label: "Copper coin" },
  { value: "washer", label: "Washer" },
  { value: "disc", label: "Heavy disc" },
];

const TABLE_OPTIONS: { value: TableId; label: string }[] = [
  { value: "oak", label: "Oak" },
  { value: "glass", label: "Glass" },
  { value: "baize", label: "Baize" },
  { value: "slate", label: "Slate" },
];

const SPEEDS = [
  { value: "1", label: "Real time" },
  { value: "0.25", label: "¼ speed" },
  { value: "0.0625", label: "1/16 speed" },
];

export default function SpinningCoinLab() {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const coinRef = useRef<SpinningCoin | null>(null);
  const [settings, setSettings] = useState<CoinSettings>(DEFAULT_SETTINGS);
  const [stats, setStats] = useState<CoinStats>({
    mode: "rest",
    lean: 0,
    laps: 0,
    spin: 0,
    face: 0,
    tally: { heads: 0, tails: 0 },
    showing: "heads",
    fps: null,
  });
  const [note, setNote] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set =
    <K extends keyof CoinSettings>(key: K) =>
    (value: CoinSettings[K]) =>
      setSettings((current) => ({ ...current, [key]: value }));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let coin: SpinningCoin;
    try {
      coin = createSpinningCoin(canvas, { onStats: setStats, onNote: setNote });
    } catch (err) {
      console.error(err);
      setError("This browser couldn't start WebGL2 for the coin.");
      return;
    }
    coinRef.current = coin;
    // A first spin to say hello, unless motion is unwelcome.
    const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const hello = reduceMotion ? undefined : setTimeout(() => coin.spin(), 700);
    return () => {
      clearTimeout(hello);
      coinRef.current = null;
      coin.dispose();
    };
  }, []);

  useEffect(() => {
    coinRef.current?.setSettings(settings);
  }, [settings]);

  // The light follows the site's theme: a window by day, a lamp in the evening.
  useEffect(() => {
    const root = document.documentElement;
    const follow = () =>
      coinRef.current?.setNight(root.classList.contains("dark"));
    follow();
    const theme = new MutationObserver(follow);
    theme.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => theme.disconnect();
  }, []);

  // A note on the stage for a while, about what just happened.
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
  const lastMove = useRef(0);

  const setCursor = (cursor: string) => {
    if (stageRef.current) stageRef.current.style.cursor = cursor;
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const coin = coinRef.current;
    if (!coin || pressed.current !== null) return;
    setTouched(true);
    const cursor = coin.pointerDown(event.pointerId, local(event));
    if (!cursor) return;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // A pointer the browser no longer tracks; moves still arrive while it's over the stage.
    }
    pressed.current = event.pointerId;
    lastMove.current = performance.now();
    setCursor(cursor);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const coin = coinRef.current;
    if (!coin) return;
    if (pressed.current === event.pointerId) {
      const now = performance.now();
      const dt = Math.min(
        0.05,
        Math.max(0.001, (now - lastMove.current) / 1000),
      );
      lastMove.current = now;
      coin.pointerMove(event.pointerId, local(event), dt);
      return;
    }
    if (event.pointerType === "mouse") setCursor(coin.hover(local(event)));
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (pressed.current !== event.pointerId) return;
    pressed.current = null;
    coinRef.current?.pointerUp(
      event.pointerId,
      (performance.now() - lastMove.current) / 1000,
    );
    setCursor("default");
  };

  // From the keyboard: Space spins it, R rolls it, Enter slaps it down.
  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const coin = coinRef.current;
    if (!coin || event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.key === " ") {
      event.preventDefault();
      if (!event.repeat) coin.spin();
      setTouched(true);
    } else if (event.key === "r" || event.key === "R") {
      coin.roll();
      setTouched(true);
    } else if (event.key === "Enter") {
      event.preventDefault();
      coin.slap();
    }
  };

  // Full screen is the same table in a bigger frame. The page under it collapses meanwhile, so
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

  const coinNote = COINS.find((c) => c.id === settings.coin)?.note ?? "";
  const tableNote = TABLES.find((t) => t.id === settings.table)?.note ?? "";
  const hasFaces = settings.coin === "silver" || settings.coin === "copper";
  const total = stats.tally.heads + stats.tally.tails;

  const motionValue =
    stats.mode === "upright"
      ? `${stats.spin.toFixed(1)} turns/s`
      : stats.mode === "wobbling"
        ? `${Math.round(stats.laps)} laps/s`
        : stats.mode === "held"
          ? "Standing"
          : stats.showing
            ? stats.showing === "heads"
              ? "Heads"
              : "Tails"
            : "Still";

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
            aria-label="A coin on a table. Flick sideways across it to spin it, drag away from you to roll it, or press Space to spin it and R to roll it. Press a moving coin, or Enter, to slap it down."
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
              if (pressed.current === null) setCursor("default");
            }}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            ref={stageRef}
            role="application"
            // biome-ignore lint/a11y/noNoninteractiveTabindex: the stage is played with a pointer, or with Space, R and Enter.
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
              {note ?? "Flick sideways across the coin to spin it"}
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
          aria-label="Spinning coin controls"
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
                icon={<ArrowsClockwiseIcon size={12} weight="bold" />}
                label={
                  stats.mode === "wobbling"
                    ? "laps a second the point it stands on makes round the table"
                    : stats.mode === "upright"
                      ? "turns a second, spinning upright"
                      : "what it's doing"
                }
                value={motionValue}
              />
              <Metric
                icon={<AngleIcon size={12} weight="bold" />}
                label="lean from lying flat"
                value={`${Math.round(stats.lean)}°`}
              />
              {stats.mode === "wobbling" && (
                <Metric
                  icon={<CircleHalfIcon size={12} weight="bold" />}
                  label="turns a second of the picture on its face, seen from above"
                  value={`face ${stats.face.toFixed(1)}/s`}
                />
              )}
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
                  coinRef.current?.spin();
                  setTouched(true);
                }}
                title="Spin it (Space)"
                type="button"
              >
                <ArrowsClockwiseIcon
                  aria-hidden="true"
                  size={13}
                  weight="bold"
                />
                Spin
              </Button>
              <Button
                className="flex-auto whitespace-nowrap text-xs"
                onClick={() => {
                  coinRef.current?.roll();
                  setTouched(true);
                }}
                title="Roll it across the table (R)"
                type="button"
                variant="secondary"
              >
                <ArrowUpIcon aria-hidden="true" size={13} weight="bold" />
                Roll
              </Button>
              <Button
                aria-label="Slap it down"
                className="w-7 shrink-0 px-0"
                onClick={() => coinRef.current?.slap()}
                title="Slap it down (Enter)"
                type="button"
                variant="secondary"
              >
                <HandPalmIcon aria-hidden="true" size={14} weight="bold" />
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
              Flick sideways across the coin to spin it: the faster your finger,
              the longer it stands. Drag away from you to roll it, and press a
              moving coin to slap it down.
            </p>
          </div>

          <Section title="Coin">
            <Choice
              columns={2}
              label="Coin"
              onChange={set("coin")}
              options={COIN_OPTIONS}
              value={settings.coin}
            />
            <p className="text-grayscale-10 text-xs leading-4">{coinNote}</p>
          </Section>

          <Section title="Table">
            <Choice
              columns={2}
              label="Table"
              onChange={set("table")}
              options={TABLE_OPTIONS}
              value={settings.table}
            />
            <p className="text-grayscale-10 text-xs leading-4">{tableNote}</p>
          </Section>

          <Section title="Heads or tails">
            {hasFaces ? (
              <>
                <div className="grid gap-1.5">
                  <div className="flex items-baseline justify-between text-grayscale-11 text-xs tabular-nums">
                    <span>Heads {stats.tally.heads}</span>
                    <span>Tails {stats.tally.tails}</span>
                  </div>
                  <div
                    aria-hidden="true"
                    className="flex h-1.5 overflow-hidden rounded-full bg-grayscale-3 dark:bg-grayscale-5"
                  >
                    {total > 0 && (
                      <>
                        <span
                          className="h-full bg-grayscale-9 transition-[width] duration-300"
                          style={{
                            width: `${(stats.tally.heads / total) * 100}%`,
                          }}
                        />
                        <span className="h-full flex-1 bg-grayscale-6 dark:bg-grayscale-7" />
                      </>
                    )}
                  </div>
                </div>
                <p className="text-grayscale-10 text-xs leading-4">
                  Counting only coins that fall by themselves. A spun coin
                  isn&apos;t a fair toss: as it slows it leans towards its
                  heavier side, and that side ends up face down.
                </p>
                <Button
                  className="text-xs"
                  disabled={total === 0}
                  onClick={() => coinRef.current?.clearTally()}
                  type="button"
                  variant="secondary"
                >
                  Start the count again
                </Button>
              </>
            ) : (
              <p className="text-grayscale-10 text-xs leading-4">
                Nothing to call: it&apos;s the same on both sides.
              </p>
            )}
          </Section>

          <Section title="Watch">
            <Choice
              columns={3}
              label="Speed"
              onChange={(value) => set("speed")(Number(value))}
              options={SPEEDS}
              value={String(settings.speed)}
            />
            <p className="text-grayscale-10 text-xs leading-4">
              {settings.speed < 1
                ? "Slowed down, the blur clears: upright it's a coin turning on one point, and at the end a coin barely turning while its low edge races round."
                : "At full speed you see what an eye sees: each moment blended with the last twenty-fourth of a second."}
            </p>
            <Toggle
              checked={settings.trace}
              label="Trace where it touches"
              onChange={set("trace")}
            />
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
