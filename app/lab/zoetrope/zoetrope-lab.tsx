"use client";

import { Slider } from "@base-ui/react/slider";
import {
  ArrowClockwiseIcon,
  ArrowsInSimpleIcon,
  ArrowsOutSimpleIcon,
  FilmStripIcon,
  GaugeIcon,
  HandIcon,
  PencilSimpleIcon,
  SpinnerGapIcon,
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
import { DRUM } from "@/lib/zoetrope/drum";
import {
  createZoetrope,
  DEFAULT_SETTINGS,
  type Paint,
  type StripId,
  type Zoetrope,
  type ZoetropeSettings,
  type ZoetropeStats,
} from "@/lib/zoetrope/engine";
import { STRIPS } from "@/lib/zoetrope/strips";
import { makeFrames, StripEditor } from "./strip-editor";

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
}: {
  label: string;
  value: T | null;
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

const SPACING = (Math.PI * 2 * DRUM.radius) / DRUM.slits;

const describeEye = (v: number) =>
  v <= 8
    ? "Up close to the slits"
    : v < 36
      ? "Leaning in"
      : v <= 44
        ? "Standing back"
        : v >= 92
          ? "Over the rim"
          : "Looking down";

const PICTURE_NOTES: Record<number, string> = {
  11: "Eleven pictures to twelve slits: each glimpse lands a little short of the last, so the figures drift backwards round the drum.",
  12: "One picture to each slit: every glimpse lands where the last one did, so the figures stay put and move on the spot.",
  13: "Thirteen pictures to twelve slits: each glimpse lands a little further on, so the figures travel round the drum.",
};

const PAINT_NOTES: Record<Paint, string> = {
  black:
    "Black inside and out, as they were made: nothing but the glimpses reaches the eye.",
  red: "Red tin reflects some light of its own, and the eye blends it in with the glimpses, so the picture greys over.",
  cream:
    "A pale drum fogs its own picture: the light off the outside is blended in with every glimpse. That's why zoetropes were painted black.",
};

export default function ZoetropeLab() {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drumRef = useRef<Zoetrope | null>(null);
  const framesRef = useRef<HTMLCanvasElement[] | null>(null);
  const [settings, setSettings] = useState<ZoetropeSettings>(DEFAULT_SETTINGS);
  const [stats, setStats] = useState<ZoetropeStats>({
    rpm: 0,
    rate: 0,
    fps: null,
  });
  const [note, setNote] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const [holding, setHolding] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set =
    <K extends keyof ZoetropeSettings>(key: K) =>
    (value: ZoetropeSettings[K]) =>
      setSettings((current) => ({ ...current, [key]: value }));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let drum: Zoetrope;
    try {
      drum = createZoetrope(canvas, { onStats: setStats, onNote: setNote });
    } catch (err) {
      console.error(err);
      setError("This browser couldn't start WebGL2 for the zoetrope.");
      return;
    }
    drumRef.current = drum;
    // A first spin to say hello, unless motion is unwelcome.
    const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const hello = reduceMotion ? undefined : setTimeout(() => drum.spin(), 600);
    return () => {
      clearTimeout(hello);
      drumRef.current = null;
      drum.dispose();
    };
  }, []);

  useEffect(() => {
    drumRef.current?.setSettings(settings);
  }, [settings]);

  // The light follows the site's theme: sun through a window by day, a lamp in the evening.
  useEffect(() => {
    const root = document.documentElement;
    const follow = () =>
      drumRef.current?.setNight(root.classList.contains("dark"));
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

  const frames = () => {
    if (!framesRef.current) framesRef.current = makeFrames();
    return framesRef.current;
  };

  const pickStrip = (id: StripId) => {
    set("strip")(id);
    setTouched(true);
    if (id === "own") {
      drumRef.current?.setFrames(frames());
      setDrawing(true);
    }
  };

  const pickPictures = (value: string) => {
    const n = Number(value);
    set("pictures")(n);
    setNote(PICTURE_NOTES[n]);
    setTouched(true);
  };

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
    if (drawing) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const drum = drumRef.current;
    if (!drum || pressed.current.size) return;
    if (!drum.pointerDown(event.pointerId, local(event))) return;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // A pointer the browser no longer tracks; moves still arrive while it's over the stage.
    }
    pressed.current.add(event.pointerId);
    setHolding(true);
    setCursor("grabbing");
    setTouched(true);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drum = drumRef.current;
    if (!drum || drawing) return;
    if (pressed.current.has(event.pointerId)) {
      drum.pointerMove(event.pointerId, local(event));
      return;
    }
    if (event.pointerType === "mouse") setCursor(drum.hover(local(event)));
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!pressed.current.has(event.pointerId)) return;
    pressed.current.delete(event.pointerId);
    drumRef.current?.pointerUp(event.pointerId);
    setHolding(false);
    setCursor("grab");
  };

  // From the keyboard: Space spins, S catches the drum, the arrows flick it either way and Up and
  // Down move the eye.
  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const drum = drumRef.current;
    if (!drum || drawing || event.metaKey || event.ctrlKey || event.altKey)
      return;
    if (event.key === " ") {
      event.preventDefault();
      if (!event.repeat) drum.spin();
      setTouched(true);
    } else if (event.key === "s" || event.key === "S") {
      drum.stop();
    } else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      drum.nudge(event.key === "ArrowLeft" ? -1 : 1);
      setTouched(true);
    } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      const step = event.key === "ArrowUp" ? 0.1 : -0.1;
      setSettings((current) => ({
        ...current,
        eye: Math.min(
          1,
          Math.max(0, Math.round((current.eye + step) * 10) / 10),
        ),
      }));
    }
  };

  // Full screen is the same drum in a bigger frame. The page under it collapses meanwhile, so
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

  const duty = Math.round((settings.slit / SPACING) * 100);

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
            aria-label="Zoetrope. Drag the drum sideways and let go to spin it, or press Space; look through the slits to see the pictures move."
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
            // biome-ignore lint/a11y/noNoninteractiveTabindex: the stage is played with a pointer, or with Space and the arrow keys.
            tabIndex={0}
          >
            <canvas className="absolute inset-0 size-full" ref={canvasRef} />

            <p
              aria-live="polite"
              className={cn(
                "pointer-events-none absolute right-3 bottom-3 left-3 mx-auto w-fit max-w-sm rounded-2xl bg-black/55 px-3 py-1.5 text-center text-white/90 text-xs backdrop-blur-sm transition-opacity duration-500",
                ((touched && !note) || error || holding || drawing) &&
                  "opacity-0",
              )}
            >
              {note ??
                "Drag the drum sideways and let go to spin it, then watch through the slits"}
            </p>

            {drawing && (
              <StripEditor
                frames={frames()}
                onChange={() => drumRef.current?.setFrames(frames())}
                onDone={() => {
                  setDrawing(false);
                  drumRef.current?.spin();
                }}
                pictures={settings.pictures}
              />
            )}

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
          aria-label="Zoetrope controls"
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
                icon={<SpinnerGapIcon size={12} weight="bold" />}
                label="turns a minute"
                value={`${Math.round(stats.rpm)} rpm`}
              />
              <Metric
                icon={<FilmStripIcon size={12} weight="bold" />}
                label="pictures seen a second"
                value={`${stats.rate.toFixed(stats.rate < 10 ? 1 : 0)} a second`}
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
                  drumRef.current?.spin();
                  setTouched(true);
                }}
                type="button"
              >
                <ArrowClockwiseIcon
                  aria-hidden="true"
                  size={13}
                  weight="bold"
                />
                Spin
              </Button>
              <Button
                aria-label="Catch the drum"
                className="w-7 shrink-0 px-0"
                onClick={() => drumRef.current?.stop()}
                title="Catch the drum (S)"
                type="button"
                variant="secondary"
              >
                <HandIcon aria-hidden="true" size={14} weight="bold" />
              </Button>
              <Button
                aria-label="Draw your own strip"
                className="w-7 shrink-0 px-0"
                onClick={() => pickStrip("own")}
                title="Draw your own strip"
                type="button"
                variant="secondary"
              >
                <PencilSimpleIcon aria-hidden="true" size={14} weight="bold" />
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

          <Section title="Strip">
            <Choice
              columns={3}
              label="Strip"
              onChange={pickStrip}
              options={STRIPS.map((s) => ({ value: s.value, label: s.label }))}
              value={settings.strip}
            />
            {settings.strip === "own" && !drawing && (
              <Button
                className="text-xs"
                onClick={() => setDrawing(true)}
                type="button"
                variant="secondary"
              >
                <PencilSimpleIcon aria-hidden="true" size={13} weight="bold" />
                Take the strip out and draw
              </Button>
            )}
            <Choice
              columns={3}
              label="Pictures round the strip"
              onChange={pickPictures}
              options={[11, 12, 13].map((n) => ({
                value: String(n),
                label: `${n} pictures`,
              }))}
              value={String(settings.pictures)}
            />
            <p className="text-grayscale-10 text-xs leading-4">
              {PICTURE_NOTES[settings.pictures]}
            </p>
          </Section>

          <Section title="Drum">
            <Range
              format={(v) =>
                `${v} mm · open ${Math.round((v / SPACING) * 100)}%`
              }
              label="Slit width"
              max={12}
              min={1.5}
              onChange={set("slit")}
              step={0.5}
              value={settings.slit}
            />
            <p className="text-grayscale-10 text-xs leading-4">
              {duty <= 4
                ? "Narrow slits give the sharpest glimpses, but let very little light through."
                : duty >= 11
                  ? "Wide slits let in more light but hold each glimpse longer, so the pictures smear."
                  : "Twelve slits, each in line with your eye for a moment as the drum turns."}
            </p>
            <Choice
              columns={3}
              label="Paint"
              onChange={(value) => {
                set("paint")(value);
                setNote(PAINT_NOTES[value]);
              }}
              options={[
                { value: "black", label: "Black" },
                { value: "red", label: "Red" },
                { value: "cream", label: "Cream" },
              ]}
              value={settings.paint}
            />
          </Section>

          <Section title="Turning">
            <Toggle
              checked={settings.motor}
              label="Clockwork motor"
              onChange={set("motor")}
            />
            <Range
              disabled={!settings.motor}
              format={(v) => `${v} pictures a second`}
              label="Motor speed"
              max={30}
              min={2}
              onChange={set("rate")}
              value={settings.rate}
            />
            <p className="text-grayscale-10 text-xs leading-4">
              Spun by hand it runs down over half a minute; the motor holds it
              steady. Below about three pictures a second they stop running
              together.
            </p>
          </Section>

          <Section title="Eye">
            <Range
              format={describeEye}
              label="Where you look from"
              max={100}
              min={0}
              onChange={(v) => {
                set("eye")(v / 100);
                if (v >= 90 && stats.rate > 4)
                  setNote(
                    "Over the rim nothing interrupts the strip, so it's only a blur.",
                  );
              }}
              value={Math.round(settings.eye * 100)}
            />
          </Section>
        </aside>
      </div>
    </div>
  );
}
