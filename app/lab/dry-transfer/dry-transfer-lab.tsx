"use client";

import { Slider } from "@base-ui/react/slider";
import {
  ArrowsInSimpleIcon,
  ArrowsOutSimpleIcon,
  DownloadSimpleIcon,
  PenNibIcon,
  TextAaIcon,
} from "@phosphor-icons/react";
import {
  type FormEvent,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
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
  createDryTransfer,
  type DryTransfer,
  type DryTransferStats,
} from "@/lib/dry-transfer/engine";
import {
  AGES,
  DARK,
  DEFAULTS,
  FACES,
  INKS,
  PAPERS,
  type Settings,
  TIPS,
  TOOLS,
} from "./presets";

type Point = { x: number; y: number };

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

function isEditable(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      /^(input|textarea|select)$/i.test(target.tagName))
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

function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T | null;
  options: { value: T; label: string; swatch?: string }[];
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
          className="flex items-center justify-center gap-1.5 whitespace-nowrap py-1 text-center"
          key={option.value}
          value={option.value}
        >
          {option.swatch && (
            <span
              aria-hidden="true"
              className="size-2.5 shrink-0 rounded-full shadow-[0_0_0_1px_var(--gray-6)]"
              style={{ background: option.swatch }}
            />
          )}
          {option.label}
        </Radio.Root>
      ))}
    </Radio.Group>
  );
}

export default function DryTransferLab() {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<DryTransfer | null>(null);
  const [settings, setSettings] = useState(DEFAULTS);
  const [stats, setStats] = useState<DryTransferStats>({
    left: 0,
    total: 0,
    set: 0,
    busy: false,
    ready: false,
    aside: false,
  });
  const [message, setMessage] = useState<string | null>(null);
  const [words, setWords] = useState("");
  const [fullscreen, setFullscreen] = useState(false);
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Until anything is set or chosen, the paper and ink follow the site's theme.
  const followTheme = useRef(true);

  const set =
    <K extends keyof Settings>(key: K) =>
    (value: Settings[K]) =>
      setSettings((current) => ({ ...current, [key]: value }));

  const choose =
    <K extends "paper" | "ink">(key: K) =>
    (value: Settings[K]) => {
      followTheme.current = false;
      set(key)(value);
    };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let engine: DryTransfer;
    let hello = 0;
    let greeted = false;
    try {
      engine = createDryTransfer(canvas, {
        onStats: (next) => {
          if (next.set > 0) followTheme.current = false;
          setStats(next);
        },
        onMessage: setMessage,
        onReady: () => {
          // A first word to say hello, unless motion is unwelcome.
          if (greeted) return;
          greeted = true;
          if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
          hello = window.setTimeout(() => engine.type("dqnamo", true), 600);
        },
      });
    } catch (err) {
      console.error(err);
      setError("This browser couldn't start a canvas for the sheet.");
      return;
    }
    engineRef.current = engine;
    return () => {
      clearTimeout(hello);
      engineRef.current = null;
      engine.dispose();
    };
  }, []);

  useEffect(() => {
    engineRef.current?.setSettings(settings);
  }, [settings]);

  // The site marks dark mode with a class on the root element.
  useEffect(() => {
    const root = document.documentElement;
    const follow = () => {
      if (!followTheme.current) return;
      const dark = root.classList.contains("dark");
      setSettings((current) => ({
        ...current,
        ...(dark ? DARK : { paper: DEFAULTS.paper, ink: DEFAULTS.ink }),
      }));
    };
    follow();
    const observer = new MutationObserver(follow);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  // Typing goes to the sheet while the pointer is over it, or after it was last clicked.
  const hover = useRef(false);
  const active = useRef(false);
  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      active.current = Boolean(
        stageRef.current?.contains(event.target as Node),
      );
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditable(event.target) || event.metaKey || event.ctrlKey) return;
      if (event.altKey || !(hover.current || active.current)) return;
      if (event.target instanceof HTMLElement && event.target.closest("button"))
        return;
      const engine = engineRef.current;
      if (!engine) return;
      let text: string | null = null;
      if (event.key === "Enter") text = "\n";
      else if (event.key === "Backspace") text = "\b";
      else if (event.key.length === 1) text = event.key;
      if (text === null) return;
      event.preventDefault();
      setTouched(true);
      engine.type(text);
    };
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  const local = (event: { clientX: number; clientY: number }): Point => {
    const rect = canvasRef.current?.getBoundingClientRect();
    return rect
      ? { x: event.clientX - rect.left, y: event.clientY - rect.top }
      : { x: 0, y: 0 };
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setTouched(true);
    engineRef.current?.pointerDown(event.pointerId, local(event));
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    hover.current = true;
    // Every point the pointer passed since the last event, so fast strokes stay smooth.
    const points = event.nativeEvent.getCoalescedEvents?.() ?? [];
    engineRef.current?.pointerMove(
      event.pointerId,
      points.length ? points.map(local) : [local(event)],
    );
  };

  const onPointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    engineRef.current?.pointerUp(event.pointerId);
    if (event.pointerType !== "mouse") engineRef.current?.pointerLeave();
  };

  const setWord = (event: FormEvent) => {
    event.preventDefault();
    const text = words.trim();
    if (!text) return;
    setTouched(true);
    engineRef.current?.type(text, true);
    setWords("");
  };

  const save = async () => {
    const blob = await engineRef.current?.exportStat();
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "dry-transfer.png";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  // Full screen is the same paper in a bigger frame. The page under it collapses meanwhile, so
  // its scroll position is put back on the way out. Where the browser can, the paper and its
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

  const paper = PAPERS.find((entry) => entry.value === settings.paper);
  const hint =
    message ??
    (touched || error || !stats.ready || stats.busy
      ? null
      : "Type to set a word · Drag the sheet by its edge");

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
        {/* Beside the panel, the paper fills the window and stays in view while the panel
            scrolls. Its cell takes the panel's height without counting the paper towards it,
            so on a very tall window the paper stops at the panel's height. */}
        <div
          className={
            fullscreen ? "contents" : "w-full min-w-0 lg:[contain:size]"
          }
        >
          {/* biome-ignore lint/a11y/noStaticElementInteractions: the sheet is rubbed and slid with a pointer; the panel sets words and lifts the sheet by keyboard. */}
          <div
            className={cn(
              "relative touch-none select-none overflow-hidden [view-transition-name:lab-pane]",
              fullscreen
                ? "h-[55dvh] shrink-0 lg:h-auto lg:min-w-0 lg:flex-1"
                : "h-[34rem] w-full min-w-0 rounded-[13px] border border-grayscale-3 small-shadow lg:sticky lg:top-6 lg:h-[calc(100dvh-3rem)] lg:max-h-full dark:border-grayscale-4",
            )}
            onContextMenu={(event) => event.preventDefault()}
            onLostPointerCapture={onPointerEnd}
            onPointerCancel={onPointerEnd}
            onPointerDown={onPointerDown}
            onPointerLeave={() => {
              hover.current = false;
              engineRef.current?.pointerLeave();
            }}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerEnd}
            ref={stageRef}
            style={{ background: paper?.colour }}
          >
            <canvas
              aria-label="A sheet of rub-down letters lying on a piece of paper ruled with pale blue pencil guides. Rub over a letter to transfer it, drag the sheet by its edge to move it, or type to bring a letter into place."
              className="absolute inset-0 size-full"
              ref={canvasRef}
              role="img"
            />

            {settings.camera && (
              <p className="pointer-events-none absolute bottom-3 left-3 rounded-full bg-black/70 px-2.5 py-1 font-medium text-[11px] text-white/90 uppercase tracking-wider">
                Camera · lith film
              </p>
            )}

            <p
              aria-live="polite"
              className={cn(
                "pointer-events-none absolute top-3 right-3 left-3 mx-auto w-fit max-w-[calc(100%-1.5rem)] text-balance rounded-2xl bg-black/65 px-3 py-1.5 text-center text-white/90 text-xs leading-5 backdrop-blur-sm transition-opacity duration-500",
                !hint && "opacity-0",
              )}
            >
              {hint}
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
          aria-label="Dry transfer controls"
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
                icon={<TextAaIcon size={12} weight="bold" />}
                label="letters left on the sheet"
                value={
                  stats.ready ? `${stats.left} of ${stats.total} left` : "—"
                }
              />
              <Metric
                icon={<PenNibIcon size={12} weight="bold" />}
                label="letters set on the paper"
                value={`${stats.set} set`}
              />
            </div>
            <form className="flex gap-1.5" onSubmit={setWord}>
              <input
                aria-label="Words to set"
                autoCapitalize="off"
                autoComplete="off"
                className="h-7 min-w-0 flex-1 rounded-lg border border-grayscale-4 bg-white px-2 text-grayscale-12 text-xs outline-none placeholder:text-grayscale-9 focus-visible:ring-2 focus-visible:ring-grayscale-6 dark:border-grayscale-5 dark:bg-grayscale-3"
                disabled={settings.camera}
                maxLength={40}
                onChange={(event) => setWords(event.target.value)}
                placeholder="Words to set"
                spellCheck={false}
                value={words}
              />
              <Button
                className="shrink-0 whitespace-nowrap text-xs"
                disabled={settings.camera || !stats.ready}
                type="submit"
              >
                Set
              </Button>
            </form>
            <div className="flex gap-1.5">
              <Button
                className="flex-auto whitespace-nowrap text-xs"
                disabled={settings.camera || stats.aside}
                onClick={() => engineRef.current?.lift()}
                title="Lift the sheet and lay it back, leaving behind whatever has been rubbed down"
                type="button"
                variant="secondary"
              >
                Lift sheet
              </Button>
              <Button
                className="flex-auto whitespace-nowrap text-xs"
                disabled={settings.camera || stats.aside}
                onClick={() => engineRef.current?.rubDown()}
                title="Scribble the burnisher over the letter just brought into place"
                type="button"
                variant="secondary"
              >
                Rub down
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
            <p className="text-pretty text-grayscale-10 text-xs leading-5">
              Rub over a letter until it turns grey, then lift the sheet to see
              what took. Hold the sheet by its frosted edge to slide it about.
              Typing with the pointer over the paper finds the next letter and
              lines it up; Backspace tapes the last one off.
            </p>
          </div>

          <Section title="Sheet">
            <Choice
              label="Typeface"
              onChange={set("face")}
              options={FACES}
              value={settings.face}
            />
            <Choice
              label="Ink"
              onChange={choose("ink")}
              options={INKS}
              value={settings.ink}
            />
            <Choice
              label="Age"
              onChange={set("age")}
              options={AGES}
              value={settings.age}
            />
            <Button
              className="w-full whitespace-nowrap text-xs"
              disabled={settings.camera}
              onClick={() => engineRef.current?.newSheet()}
              title="Take a new sheet of the same lettering from the drawer"
              type="button"
              variant="secondary"
            >
              New sheet
            </Button>
          </Section>

          <Section title="Rubbing">
            <Choice
              label="Tool"
              onChange={set("tool")}
              options={TOOLS}
              value={settings.tool}
            />
            <Choice
              label="Burnisher tip"
              onChange={set("tip")}
              options={TIPS}
              value={settings.tip}
            />
            <Toggle
              checked={settings.autoRub}
              label="Rub down as I type"
              onChange={set("autoRub")}
            />
            <Range
              format={(v) => (v ? `${v > 0 ? "+" : ""}${v} px` : "Touching")}
              label="Letter spacing"
              max={16}
              min={-6}
              onChange={set("spacing")}
              value={settings.spacing}
            />
            <p className="text-pretty text-grayscale-10 text-xs leading-5">
              A fine point presses hardest. Old stock grips less and breaks
              along its cracks, so it wants more rubbing. Tape lifts letters
              back off the paper.
            </p>
          </Section>

          <Section title="Paper">
            <Choice
              label="Paper"
              onChange={choose("paper")}
              options={PAPERS}
              value={settings.paper}
            />
            <Toggle
              checked={stats.aside}
              label="Sheet put aside"
              onChange={(on) => engineRef.current?.putAside(on)}
            />
            <Button
              className="w-full whitespace-nowrap text-xs"
              disabled={settings.camera}
              onClick={() => engineRef.current?.newPaper()}
              type="button"
              variant="secondary"
            >
              Fresh paper
            </Button>
          </Section>

          <Section title="Camera">
            <Toggle
              checked={settings.camera}
              label="Photograph for print"
              onChange={set("camera")}
            />
            <Button
              className="w-full whitespace-nowrap text-xs"
              onClick={save}
              type="button"
              variant="secondary"
            >
              <DownloadSimpleIcon aria-hidden="true" size={14} weight="bold" />
              Save the photograph
            </Button>
            <p className="text-pretty text-grayscale-10 text-xs leading-5">
              Lith film is blind to red and dazzled by pale blue, so red ink
              prints black and the pencil guides vanish.
            </p>
          </Section>
        </aside>
      </div>
    </div>
  );
}
