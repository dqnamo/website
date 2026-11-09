"use client";

import { Slider } from "@base-ui/react/slider";
import {
  ArrowsInSimpleIcon,
  ArrowsOutSimpleIcon,
  CircleHalfIcon,
  DownloadSimpleIcon,
  DropIcon,
  FileImageIcon,
  NewspaperIcon,
} from "@phosphor-icons/react";
import {
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
  createMarbling,
  type Marbling,
  type MarblingState,
  type Tool,
} from "@/lib/marbling/engine";
import {
  DEFAULTS,
  inksFor,
  PALETTES,
  PATTERNS,
  type Settings,
  TOOLS,
} from "./presets";

const HINTS: Record<Tool, string> = {
  drop: "Tap to float a drop of ink · Hold for rings",
  spatter: "Tap or drag to spatter ink",
  stylus: "Drag to draw the stylus through the ink",
  comb: "Drag to pull the comb across",
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

// The swatch for an ink: its colour as a bead, or for gall water a clear one with a ring.
function InkBead({ color, clear }: { color: string; clear?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "block size-4 rounded-full",
        clear
          ? "border border-grayscale-8 border-dashed bg-[#e1e2db]"
          : "shadow-[inset_0_-2px_3px_rgb(0_0_0/0.25),inset_0_1px_1px_rgb(255_255_255/0.25)]",
      )}
      style={clear ? undefined : { background: color }}
    />
  );
}

export default function MarblingLab() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bathRef = useRef<Marbling | null>(null);
  const [settings, setSettings] = useState(DEFAULTS);
  const [state, setState] = useState<MarblingState>({
    phase: "bath",
    drops: 0,
    covered: 0,
    prints: 0,
    bubbles: 0,
    playing: null,
  });
  const [fullscreen, setFullscreen] = useState(false);
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set =
    <K extends keyof Settings>(key: K) =>
    (value: Settings[K]) =>
      setSettings((current) => ({ ...current, [key]: value }));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let bath: Marbling;
    try {
      bath = createMarbling(canvas, {
        onState: setState,
        onInk: (ink) => setSettings((current) => ({ ...current, ink })),
      });
    } catch (err) {
      console.error(err);
      setError("This browser couldn't start a canvas for the bath.");
      return;
    }
    bathRef.current = bath;
    return () => {
      bathRef.current = null;
      bath.dispose();
    };
  }, []);

  useEffect(() => {
    const { palette, ...rest } = settings;
    bathRef.current?.setSettings({ ...rest, inks: inksFor(palette) });
  }, [settings]);

  // A few drops to start with, once the bath has its inks.
  useEffect(() => {
    const timer = setTimeout(() => bathRef.current?.welcome(), 250);
    return () => clearTimeout(timer);
  }, []);

  const local = (event: { clientX: number; clientY: number }) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    return rect
      ? { x: event.clientX - rect.left, y: event.clientY - rect.top }
      : { x: 0, y: 0 };
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if ((event.target as Element).closest("button")) return;
    const at = local(event);
    if (bathRef.current?.press(event.pointerId, at.x, at.y)) {
      event.currentTarget.setPointerCapture(event.pointerId);
      setTouched(true);
    }
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    // Every point the pointer passed since the last event, so fast strokes stay smooth.
    const points = event.nativeEvent.getCoalescedEvents?.() ?? [];
    for (const point of points.length ? points : [event]) {
      const at = local(point);
      bathRef.current?.move(event.pointerId, at.x, at.y);
    }
  };

  const onPointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    bathRef.current?.release(event.pointerId);
  };

  const savePrint = async () => {
    const blob = await bathRef.current?.printBlob();
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `marbled-paper-${state.prints}.png`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  // Full screen is the same bath in a bigger frame. The page under it collapses meanwhile, so
  // its scroll position is put back on the way out. Where the browser can, the bath and its
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

  const inks = inksFor(settings.palette);
  const ink = inks[settings.ink] ?? inks[0];
  const { phase } = state;
  const papered = phase === "laying" || phase === "laid" || phase === "lifting";
  const hint =
    phase === "laid"
      ? state.bubbles
        ? `Air is caught under the paper. Tap ${state.bubbles > 1 ? "the bubbles" : "it"} out, then lift.`
        : "Lift the print when you're ready"
      : phase === "print"
        ? "A print is the bath's mirror image"
        : phase === "bath"
          ? HINTS[settings.tool]
          : null;
  const showHint = Boolean(hint) && (phase !== "bath" || !touched) && !error;
  const dragTool = settings.tool === "stylus" || settings.tool === "comb";

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
        {/* Beside the panel, the bath fills the window and stays in view while the panel
            scrolls. Its cell takes the panel's height without counting the bath towards it,
            so on a very tall window the bath stops at the panel's height. */}
        <div
          className={
            fullscreen ? "contents" : "w-full min-w-0 lg:[contain:size]"
          }
        >
          {/* biome-ignore lint/a11y/noStaticElementInteractions: the bath is worked with a pointer; the panel's patterns and buttons do the same things by keyboard. */}
          <div
            className={cn(
              "relative touch-none select-none overflow-hidden bg-[#e9e4da] [view-transition-name:lab-pane] dark:bg-[#1d1b18]",
              phase === "bath" &&
                (dragTool && !state.playing
                  ? "cursor-none"
                  : "cursor-crosshair"),
              phase === "laid" && "cursor-pointer",
              fullscreen
                ? "h-[55dvh] shrink-0 lg:h-auto lg:min-w-0 lg:flex-1"
                : "h-[34rem] w-full min-w-0 rounded-[13px] border border-grayscale-3 small-shadow lg:sticky lg:top-6 lg:h-[calc(100dvh-3rem)] lg:max-h-full dark:border-grayscale-4",
            )}
            onContextMenu={(event) => event.preventDefault()}
            onLostPointerCapture={onPointerEnd}
            onPointerCancel={onPointerEnd}
            onPointerDown={onPointerDown}
            onPointerLeave={() => bathRef.current?.leave()}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerEnd}
          >
            <canvas
              aria-label="A wooden tray of marbling size with inks floating on it. Tap to drop ink, or drag a stylus or comb through it."
              className="absolute inset-0 size-full"
              ref={canvasRef}
              role="img"
            />

            <p
              aria-live="polite"
              className={cn(
                "pointer-events-none absolute top-3 right-3 left-3 mx-auto w-fit rounded-full bg-black/55 px-3 py-1 text-center text-white/90 text-xs backdrop-blur-sm transition-opacity duration-500",
                !showHint && "opacity-0",
              )}
            >
              {hint}
            </p>

            {(phase === "laid" || phase === "print") && (
              <div className="absolute right-3 bottom-3 left-3 flex justify-center gap-1.5">
                {phase === "laid" ? (
                  <Button
                    className="h-9 rounded-[10px] px-4"
                    onClick={() => bathRef.current?.liftPaper()}
                    type="button"
                  >
                    Lift the print
                  </Button>
                ) : (
                  <>
                    <Button
                      className="h-9 gap-2 rounded-[10px] px-4"
                      onClick={savePrint}
                      type="button"
                    >
                      <DownloadSimpleIcon
                        aria-hidden="true"
                        size={15}
                        weight="bold"
                      />
                      Save print
                    </Button>
                    <Button
                      className="h-9 rounded-[10px] px-4"
                      onClick={() => bathRef.current?.backToBath()}
                      type="button"
                      variant="secondary"
                    >
                      Back to the bath
                    </Button>
                  </>
                )}
              </div>
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
          aria-label="Marbling controls"
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
                icon={<DropIcon size={12} weight="bold" />}
                label="drops floated"
                value={state.drops.toLocaleString("en-GB")}
              />
              <Metric
                icon={<CircleHalfIcon size={12} weight="bold" />}
                label="of the surface taken up"
                value={`${state.covered}%`}
              />
              <Metric
                icon={<FileImageIcon size={12} weight="bold" />}
                label={state.prints === 1 ? "print pulled" : "prints pulled"}
                value={state.prints.toLocaleString("en-GB")}
              />
            </div>
            <div className="flex gap-1.5">
              {phase === "print" ? (
                <>
                  <Button
                    className="flex-auto whitespace-nowrap text-xs"
                    onClick={savePrint}
                    type="button"
                  >
                    <DownloadSimpleIcon
                      aria-hidden="true"
                      size={14}
                      weight="bold"
                    />
                    Save print
                  </Button>
                  <Button
                    className="flex-auto whitespace-nowrap text-xs"
                    onClick={() => bathRef.current?.backToBath()}
                    type="button"
                    variant="secondary"
                  >
                    Back to the bath
                  </Button>
                </>
              ) : papered ? (
                <Button
                  className="flex-auto whitespace-nowrap text-xs disabled:cursor-default disabled:opacity-60"
                  disabled={phase !== "laid"}
                  onClick={() => bathRef.current?.liftPaper()}
                  type="button"
                >
                  Lift the print
                </Button>
              ) : (
                <>
                  <Button
                    className="flex-auto whitespace-nowrap text-xs disabled:cursor-default disabled:opacity-60"
                    disabled={phase !== "bath" || state.drops === 0}
                    onClick={() => bathRef.current?.layPaper()}
                    type="button"
                  >
                    <FileImageIcon aria-hidden="true" size={14} weight="bold" />
                    Lay paper
                  </Button>
                  <Button
                    className="flex-auto whitespace-nowrap text-xs disabled:cursor-default disabled:opacity-60"
                    disabled={phase !== "bath" || state.drops === 0}
                    onClick={() => bathRef.current?.skim()}
                    title="Skim the bath clean with a strip of newspaper"
                    type="button"
                    variant="secondary"
                  >
                    <NewspaperIcon aria-hidden="true" size={14} weight="bold" />
                    Skim
                  </Button>
                </>
              )}
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
            <p className="text-pretty text-grayscale-10 text-xs leading-5">
              Lay a sheet on the bath to lift the colour off. The print comes
              out a mirror image, and a faint ghost stays behind for a second,
              paler one.
            </p>
          </div>

          <Section title="Tool">
            <Radio.Group
              aria-label="Tool"
              className="grid grid-cols-4 gap-1"
              onValueChange={(next) => set("tool")(next as Tool)}
              value={settings.tool}
            >
              {TOOLS.map((tool) => (
                <Radio.Root
                  className="py-1 text-center"
                  key={tool.value}
                  value={tool.value}
                >
                  {tool.label}
                </Radio.Root>
              ))}
            </Radio.Group>
            <Range
              disabled={dragTool}
              format={(v) => {
                if (v < 25) return "A touch";
                if (v < 70) return "Some";
                return "Plenty";
              }}
              label="Gall"
              max={100}
              min={0}
              onChange={set("gall")}
              value={settings.gall}
            />
            <Range
              disabled={settings.tool !== "comb"}
              format={(v) => `${v} mm`}
              label="Tine spacing"
              max={60}
              min={6}
              onChange={set("tines")}
              value={settings.tines}
            />
            <Range
              disabled={!dragTool}
              format={(v) => {
                if (v < 30) return "Thin";
                if (v < 70) return "Medium";
                return "Thick";
              }}
              label="Bath"
              max={100}
              min={0}
              onChange={set("bath")}
              value={settings.bath}
            />
            <p className="text-pretty text-grayscale-10 text-xs leading-5">
              Each drop spreads less than the last as the surface fills; gall
              helps it push through. A thick bath holds a crisp line, a thin one
              lets the drag spread.
            </p>
          </Section>

          <Section title="Inks">
            <Radio.Group
              aria-label="Palette"
              className="grid grid-cols-3 gap-1"
              onValueChange={(next) =>
                setSettings((current) => ({
                  ...current,
                  palette: next as Settings["palette"],
                  ink: 0,
                }))
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
                    {palette.inks
                      .filter((entry) => !entry.clear)
                      .slice(0, 3)
                      .map((entry) => (
                        <span
                          className="size-2.5 rounded-full shadow-[0_0_0_1px_var(--gray-1)] dark:shadow-[0_0_0_1px_var(--gray-4)]"
                          key={entry.name}
                          style={{ background: entry.color }}
                        />
                      ))}
                  </span>
                  {palette.label}
                </Radio.Root>
              ))}
            </Radio.Group>
            <div className="grid gap-1.5">
              <div className="flex items-baseline justify-between gap-3 text-xs">
                <span className="text-grayscale-11">On the brush</span>
                <span className="text-grayscale-10">{ink.name}</span>
              </div>
              <Radio.Group
                aria-label="Ink"
                className="grid grid-cols-6 gap-1"
                onValueChange={(next) => set("ink")(Number(next))}
                value={String(settings.ink)}
              >
                {inks.map((entry, i) => (
                  <Radio.Root
                    aria-label={entry.name}
                    className="flex items-center justify-center py-1.5"
                    key={entry.name}
                    title={entry.name}
                    value={String(i)}
                  >
                    <InkBead clear={entry.clear} color={entry.color} />
                  </Radio.Root>
                ))}
              </Radio.Group>
            </div>
            <Toggle
              checked={settings.cycle}
              label="Next ink after each drop"
              onChange={set("cycle")}
            />
          </Section>

          <Section title="Patterns">
            <div className="grid grid-cols-3 gap-1">
              {PATTERNS.map((pattern) => {
                const playing = state.playing === pattern.value;
                return (
                  <button
                    aria-pressed={playing}
                    className={getRadioBadgeClassName(
                      "whitespace-nowrap px-1 py-1 text-center aria-pressed:border-grayscale-5 aria-pressed:bg-grayscale-3 aria-pressed:text-grayscale-12 disabled:cursor-default disabled:opacity-45 dark:aria-pressed:border-grayscale-6 dark:aria-pressed:bg-grayscale-5",
                    )}
                    disabled={phase !== "bath" && phase !== "print"}
                    key={pattern.value}
                    onClick={() => {
                      setTouched(true);
                      if (playing) bathRef.current?.stop();
                      else bathRef.current?.play(pattern.value);
                    }}
                    type="button"
                  >
                    {pattern.label}
                  </button>
                );
              })}
            </div>
            <p className="text-pretty text-grayscale-10 text-xs leading-5">
              Traditional papers, made on a clean bath drop by drop and pass by
              pass with your inks. Press again to stop one partway.
            </p>
          </Section>
        </aside>
      </div>
    </div>
  );
}
