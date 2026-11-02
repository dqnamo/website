"use client";

import {
  ArrowsInSimpleIcon,
  ArrowsOutSimpleIcon,
  DownloadSimpleIcon,
  DropIcon,
  KeyboardIcon,
  TextAaIcon,
} from "@phosphor-icons/react";
import {
  type ClipboardEvent,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
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
  type Condition,
  createTypewriter,
  DEFAULT_SETTINGS,
  type Paper,
  type Pick,
  type Ribbon,
  type RibbonMode,
  type SheetView,
  type Touch,
  type Typewriter,
  type TypewriterSettings,
  type TypewriterStats,
} from "@/lib/typewriter/engine";

const CONDITIONS: { value: Condition; label: string; description: string }[] = [
  {
    value: "new",
    label: "New",
    description:
      "Just out of its case: every typebar true to within a hair, the type clean and the ribbon lifting exactly where it should.",
  },
  {
    value: "used",
    label: "Used",
    description:
      "Forty years in an office. A few bars print a little high or tilted, capitals sit slightly above the line, the t has a nick out of it, and the e and a are filling in.",
  },
  {
    value: "battered",
    label: "Battered",
    description:
      "Dropped at least once. Letters wander off the line and lean, some land harder on one side, three slugs are chipped, the type is clogged, and the ribbon doesn’t lift high enough.",
  },
];

const RIBBONS: { value: Ribbon; label: string }[] = [
  { value: "fresh", label: "Fresh" },
  { value: "worn", label: "Worn" },
  { value: "dry", label: "Dry" },
];

const MODES: { value: RibbonMode; label: string; description: string }[] = [
  {
    value: "black",
    label: "Black",
    description:
      "The ribbon lever on black: the vibrator lifts the top half of the ribbon in front of the type.",
  },
  {
    value: "red",
    label: "Red",
    description:
      "On red the vibrator lifts the ribbon further, so the red lower half takes the blow. On a worn machine it falls short and tall letters catch the black.",
  },
  {
    value: "stencil",
    label: "Stencil",
    description:
      "Stencil leaves the ribbon down, for cutting wax stencils. On paper the type lands bare: invisible, except under raking light, and on a carbon copy.",
  },
];

const TOUCHES: { value: Touch; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "even", label: "Even" },
  { value: "heavy", label: "Heavy" },
];

const SPACINGS: { value: string; label: string }[] = [
  { value: "1", label: "Single" },
  { value: "1.5", label: "1½" },
  { value: "2", label: "Double" },
];

const PAPERS: { value: Paper; label: string }[] = [
  { value: "bond", label: "Bond" },
  { value: "onionskin", label: "Onionskin" },
];

const VIEWS: { value: SheetView; label: string }[] = [
  { value: "top", label: "Top copy" },
  { value: "copy", label: "Copy" },
  { value: "carbon", label: "Carbon" },
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

function Description({ children }: { children: ReactNode }) {
  return (
    <p className="text-grayscale-10 text-xs leading-relaxed">{children}</p>
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
  columns: 2 | 3;
  disabled?: boolean;
  onChange: (value: T) => void;
}) {
  return (
    <Radio.Group
      aria-label={label}
      className={cn(
        "grid gap-1",
        columns === 2 ? "grid-cols-2" : "grid-cols-3",
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
  disabled = false,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  const id = useId();
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 transition-opacity",
        disabled && "opacity-45",
      )}
    >
      <label className="cursor-pointer text-grayscale-11 text-xs" htmlFor={id}>
        {label}
      </label>
      <Switch.Composed
        checked={checked}
        disabled={disabled}
        id={id}
        onCheckedChange={(next) => onChange(next)}
      />
    </div>
  );
}

const CURSORS: Record<NonNullable<Pick>, string> = {
  paper: "grab",
  jam: "pointer",
  lever: "pointer",
  sheet: "none",
};

export default function TypewriterLab({
  fontClassName,
}: {
  fontClassName: string;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const engineRef = useRef<Typewriter | null>(null);
  const [settings, setSettings] =
    useState<TypewriterSettings>(DEFAULT_SETTINGS);
  const [stats, setStats] = useState<TypewriterStats>({
    column: 10,
    line: 1,
    letters: 0,
    out: false,
    copy: false,
    jammed: false,
    typing: false,
    clogged: 0,
    ink: 1,
  });
  const [note, setNote] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const [focused, setFocused] = useState(false);
  const [cursor, setCursor] = useState("text");
  const [fullscreen, setFullscreen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pressed = useRef(new Map<number, { x: number; y: number }>());

  const set =
    <K extends keyof TypewriterSettings>(key: K) =>
    (value: TypewriterSettings[K]) =>
      setSettings((current) => ({ ...current, [key]: value }));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let engine: Typewriter;
    try {
      engine = createTypewriter(canvas, { onStats: setStats, onNote: setNote });
    } catch (err) {
      console.error(err);
      setError("This browser couldn't start a canvas for the typewriter.");
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

  // Day or night follows the site's theme.
  useEffect(() => {
    const root = document.documentElement;
    const follow = () =>
      engineRef.current?.setNight(root.classList.contains("dark"));
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

  const local = (event: ReactPointerEvent<HTMLElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    return {
      x: event.clientX - (rect?.left ?? 0),
      y: event.clientY - (rect?.top ?? 0),
    };
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const engine = engineRef.current;
    if (!engine || event.button !== 0) return;
    const point = local(event);
    pressed.current.set(event.pointerId, point);
    const pick = engine.pointerDown(event.pointerId, point);
    if (pick === "paper") {
      event.currentTarget.setPointerCapture(event.pointerId);
      setCursor("grabbing");
    }
    if (pick) setTouched(true);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const engine = engineRef.current;
    if (!engine) return;
    if (pressed.current.has(event.pointerId)) {
      engine.pointerMove(event.pointerId, local(event));
      return;
    }
    if (event.pointerType === "mouse") {
      const pick = engine.hover(local(event));
      setCursor(pick ? CURSORS[pick] : "default");
    }
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!pressed.current.has(event.pointerId)) return;
    pressed.current.delete(event.pointerId);
    engineRef.current?.pointerUp(
      event.pointerId,
      event.pointerType !== "mouse",
    );
    setCursor(stats.out ? "none" : "grab");
    // Whatever was clicked, the keyboard goes to the machine (and a phone shows its keyboard).
    inputRef.current?.focus({ preventScroll: true });
  };

  // Keys go to a hidden text box over the stage, so phones bring up their keyboard for it.
  const onKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    const engine = engineRef.current;
    if (!engine || event.metaKey || event.ctrlKey || event.altKey) return;
    // A held key doesn't repeat on a manual machine: each letter is a separate blow.
    if (event.repeat && event.key.length === 1) {
      event.preventDefault();
      return;
    }
    if (event.nativeEvent.isComposing || event.key.length !== 1) {
      if (
        ![
          "Enter",
          "Backspace",
          "ArrowUp",
          "ArrowDown",
          "ArrowLeft",
          "ArrowRight",
        ].includes(event.key)
      ) {
        return;
      }
    }
    event.preventDefault();
    engine.press(event.key);
    setTouched(true);
  };

  // Keyboards that don't say which key was pressed (most phone keyboards) still put text in the
  // box: take it from there.
  const onInput = (event: FormEvent<HTMLTextAreaElement>) => {
    const engine = engineRef.current;
    const box = event.currentTarget;
    if (!engine || !box.value) return;
    for (const char of box.value) engine.press(char === "\n" ? "Enter" : char);
    box.value = "";
    setTouched(true);
  };

  const onPaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    event.preventDefault();
    const text = event.clipboardData.getData("text");
    if (text) engineRef.current?.type(text);
    setTouched(true);
  };

  const save = async () => {
    const blob = await engineRef.current?.save();
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `typescript-${settings.view}${settings.flipped ? "-back" : ""}.png`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  // Full screen is the same machine in a bigger frame. The page under it collapses meanwhile, so
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

  const condition =
    CONDITIONS.find((entry) => entry.value === settings.condition) ??
    CONDITIONS[0];
  const mode = MODES.find((entry) => entry.value === settings.mode) ?? MODES[0];
  const engine = () => {
    engineRef.current?.wake();
    return engineRef.current;
  };

  return (
    <div
      className={cn(
        fontClassName,
        fullscreen
          ? "fixed inset-0 z-50 flex flex-col bg-grayscale-1"
          : "contents",
      )}
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
          {/* biome-ignore lint/a11y/noStaticElementInteractions: the stage is played with a pointer; its keyboard is the text box inside it. */}
          <div
            className={cn(
              "relative touch-none select-none overflow-hidden bg-grayscale-3 outline-none [view-transition-name:lab-pane] dark:bg-black",
              focused && "ring-2 ring-grayscale-7 ring-inset",
              fullscreen
                ? "h-[55dvh] shrink-0 lg:h-auto lg:min-w-0 lg:flex-1"
                : "h-[34rem] w-full min-w-0 rounded-[13px] border border-grayscale-3 small-shadow lg:sticky lg:top-6 lg:h-[calc(100dvh-3rem)] lg:max-h-full dark:border-grayscale-4",
            )}
            onContextMenu={(event) => event.preventDefault()}
            onLostPointerCapture={onPointerUp}
            onPointerCancel={onPointerUp}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerLeave={() => {
              if (!pressed.current.size) engineRef.current?.hover(null);
            }}
            onPointerUp={onPointerUp}
            ref={stageRef}
            style={{ cursor }}
          >
            <canvas className="absolute inset-0 size-full" ref={canvasRef} />

            <textarea
              aria-label="Typewriter keyboard. Type to strike letters, Enter to return the carriage, Backspace to step back, and the up and down arrows to turn the platen half a line."
              autoCapitalize="off"
              autoComplete="off"
              autoCorrect="off"
              className="absolute top-1/2 left-1/2 h-px w-px resize-none overflow-hidden border-0 p-0 text-base opacity-0 outline-none"
              onBlur={() => setFocused(false)}
              onFocus={() => setFocused(true)}
              onInput={onInput}
              onKeyDown={onKeyDown}
              onPaste={onPaste}
              ref={inputRef}
              spellCheck={false}
            />

            <p
              aria-live="polite"
              className={cn(
                "pointer-events-none absolute top-3 right-3 left-3 mx-auto w-fit max-w-sm rounded-2xl bg-black/55 px-3 py-1.5 text-center text-white/90 text-xs backdrop-blur-sm transition-opacity duration-500",
                ((touched && focused && !note) || error) && "opacity-0",
              )}
            >
              {note ??
                (stats.out
                  ? "The sheet’s out. Feed a new one to type again."
                  : focused
                    ? "Type away. Enter returns the carriage; drag the paper to move it freely."
                    : "Click the paper and type, or have the machine type a letter.")}
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
          aria-label="Typewriter controls"
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
                icon={<KeyboardIcon size={12} weight="bold" />}
                label="where the carriage is: letters from the left edge of the paper, and the line"
                value={`Col ${stats.column} · Line ${stats.line}`}
              />
              <Metric
                icon={<TextAaIcon size={12} weight="bold" />}
                label="strokes on this sheet"
                value={`${stats.letters.toLocaleString("en-GB")} strokes`}
              />
              <Metric
                icon={<DropIcon size={12} weight="bold" />}
                label="ink left in the ribbon"
                value={`${Math.round(stats.ink * 100)}% ink`}
              />
            </div>
            <div className="flex gap-1.5">
              <Button
                className="flex-auto whitespace-nowrap text-xs"
                onClick={() => {
                  const machine = engine();
                  if (!machine) return;
                  if (stats.typing) machine.stopDemo();
                  else machine.demo();
                  setTouched(true);
                }}
                type="button"
              >
                {stats.typing ? "Stop typing" : "Type a letter"}
              </Button>
              <Button
                className="flex-auto whitespace-nowrap text-xs"
                onClick={() => {
                  const machine = engine();
                  if (!machine) return;
                  if (stats.out) machine.feed();
                  else machine.pullOut();
                  if (stats.out)
                    inputRef.current?.focus({ preventScroll: true });
                }}
                type="button"
                variant="secondary"
              >
                {stats.out ? "Feed a sheet" : "Pull out"}
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
            {stats.jammed && (
              <Button
                className="text-xs"
                onClick={() => engine()?.unjam()}
                type="button"
                variant="secondary"
              >
                Part the jammed typebars
              </Button>
            )}
          </div>

          <Section title="Machine">
            <Choice
              columns={3}
              label="Condition"
              onChange={set("condition")}
              options={CONDITIONS}
              value={settings.condition}
            />
            <Description>{condition.description}</Description>
            <div className="flex items-center justify-between gap-3">
              <span className="text-grayscale-11 text-xs">
                {stats.clogged > 0.5
                  ? "Type clogged"
                  : stats.clogged > 0.2
                    ? "Type filling in"
                    : "Type clean"}
              </span>
              <Button
                className="text-xs"
                onClick={() => engine()?.cleanType()}
                type="button"
                variant="secondary"
              >
                Clean the type
              </Button>
            </div>
          </Section>

          <Section title="Ribbon">
            <Choice
              columns={3}
              label="Ribbon"
              onChange={set("ribbon")}
              options={RIBBONS}
              value={settings.ribbon}
            />
            <Choice
              columns={3}
              label="Ribbon lever"
              onChange={set("mode")}
              options={MODES}
              value={settings.mode}
            />
            <Description>{mode.description}</Description>
          </Section>

          <Section title="Typing">
            <Choice
              columns={3}
              label="Touch"
              onChange={set("touch")}
              options={TOUCHES}
              value={settings.touch}
            />
            <Choice
              columns={3}
              label="Line spacing"
              onChange={(value) =>
                set("spacing")(Number(value) as TypewriterSettings["spacing"])
              }
              options={SPACINGS}
              value={String(settings.spacing)}
            />
            <Description>
              Enter returns the carriage, ↑ and ↓ turn the platen half a line,
              and ← and → step back and space. There’s no 1 and no ! on the
              keyboard. Strike two keys at once and they jam.
            </Description>
          </Section>

          <Section title="Paper">
            <Choice
              columns={2}
              label="Paper"
              onChange={set("paper")}
              options={PAPERS}
              value={settings.paper}
            />
            <Toggle
              checked={settings.carbon}
              label="Carbon and a second sheet"
              onChange={set("carbon")}
            />
            <Description>
              Changes here go in with the next sheet, or straight away if this
              one is still blank. Onionskin is thin enough for carbon copies,
              and for full stops to go through.
            </Description>
          </Section>

          <Section title="Sheet">
            <Choice
              columns={3}
              disabled={!stats.out || !stats.copy}
              label="Which sheet"
              onChange={set("view")}
              options={VIEWS}
              value={stats.copy ? settings.view : "top"}
            />
            <Toggle
              checked={settings.raking}
              disabled={!stats.out}
              label="Raking light"
              onChange={set("raking")}
            />
            <Toggle
              checked={settings.flipped}
              disabled={!stats.out}
              label="Turn it over"
              onChange={set("flipped")}
            />
            <Button
              className="text-xs"
              disabled={!stats.out}
              onClick={save}
              type="button"
              variant="secondary"
            >
              <DownloadSimpleIcon aria-hidden="true" size={13} weight="bold" />
              Save as PNG
            </Button>
            <Description>
              Pull the sheet out to look at it on the desk, front or back, in
              flat or raking light.
            </Description>
          </Section>

          <Section title="Sound">
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
