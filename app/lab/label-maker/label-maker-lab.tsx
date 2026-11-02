"use client";

import {
  ArrowsInSimpleIcon,
  ArrowsOutSimpleIcon,
  BroomIcon,
  GaugeIcon,
  ScissorsIcon,
  SpeakerHighIcon,
  SpeakerSlashIcon,
  StackIcon,
  TagIcon,
  TextAaIcon,
} from "@phosphor-icons/react";
import {
  type FormEvent,
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
  createLabelMaker,
  DEFAULT_SETTINGS,
  type LabelMaker,
  type LabelMakerSettings,
  type LabelMakerStats,
  type Pick,
  type Surface,
  SWATCHES,
  type TapeKind,
} from "@/lib/label-maker/engine";

const TAPES: { value: TapeKind; label: string; description: string }[] = [
  {
    value: "red",
    label: "Red",
    description:
      "Glossy red vinyl. The letters come out white because the plastic itself goes white where it’s stretched: there’s no ink in the machine.",
  },
  {
    value: "black",
    label: "Black",
    description:
      "Black vinyl gives the starkest white, and shows every patch where a light squeeze didn’t stretch the film far enough.",
  },
  {
    value: "blue",
    label: "Blue",
    description:
      "Blue vinyl. Look closely at a letter: the crazed white still carries a little of the blue in it.",
  },
  {
    value: "green",
    label: "Green",
    description:
      "Green vinyl, a little softer than the others, so it craze-whitens slightly more readily.",
  },
  {
    value: "clear",
    label: "Clear",
    description:
      "Clear vinyl on a white backing. The letters frost where they’re stretched, and once it’s peeled and stuck down you read them against whatever’s underneath.",
  },
  {
    value: "aluminium",
    label: "Aluminium",
    description:
      "Soft aluminium foil. Metal can’t craze, so nothing goes white: the letters read only by how their edges catch the light, and heat does nothing to them.",
  },
];

const SURFACES: { value: Surface; label: string; description: string }[] = [
  {
    value: "desk",
    label: "Desk",
    description: "An oak desk top, with the grain running along it.",
  },
  {
    value: "fridge",
    label: "Fridge",
    description:
      "A cream enamel fridge door. Clear labels almost disappear on it, leaving the frosted letters.",
  },
  {
    value: "toolbox",
    label: "Toolbox",
    description: "A steel toolbox lid in hammered green paint.",
  },
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

export default function LabelMakerLab() {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const makerRef = useRef<LabelMaker | null>(null);
  const [settings, setSettings] =
    useState<LabelMakerSettings>(DEFAULT_SETTINGS);
  const [stats, setStats] = useState<LabelMakerStats>({
    letters: 0,
    reel: 3,
    labels: 0,
    queued: 0,
    fps: null,
  });
  const [note, setNote] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const [text, setText] = useState("");
  const [fullscreen, setFullscreen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hotAirId = useId();
  const inputId = useId();

  const set =
    <K extends keyof LabelMakerSettings>(key: K) =>
    (value: LabelMakerSettings[K]) =>
      setSettings((current) => ({ ...current, [key]: value }));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let maker: LabelMaker;
    try {
      maker = createLabelMaker(canvas, { onStats: setStats, onNote: setNote });
    } catch (err) {
      console.error(err);
      setError("This browser couldn't start a canvas for the label maker.");
      return;
    }
    makerRef.current = maker;
    return () => {
      makerRef.current = null;
      maker.dispose();
    };
  }, []);

  useEffect(() => {
    makerRef.current?.setSettings(settings);
  }, [settings]);

  // The light follows the site's theme: daylight, or a lamp in the evening.
  useEffect(() => {
    const root = document.documentElement;
    const follow = () =>
      makerRef.current?.setNight(root.classList.contains("dark"));
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

  const pressed = useRef(new Map<number, Exclude<Pick, null>>());

  const setCursor = (cursor: string) => {
    if (stageRef.current) stageRef.current.style.cursor = cursor;
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const maker = makerRef.current;
    if (!maker || pressed.current.has(event.pointerId)) return;
    const took = maker.pointerDown(event.pointerId, local(event));
    setTouched(true);
    if (!took || took === "lever") return;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // A pointer the browser no longer tracks; moves still arrive while it's over the stage.
    }
    pressed.current.set(event.pointerId, took);
    if (took === "dial" || took === "label") setCursor("grabbing");
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const maker = makerRef.current;
    if (!maker) return;
    if (pressed.current.has(event.pointerId)) {
      maker.pointerMove(event.pointerId, local(event));
      return;
    }
    if (event.pointerType === "mouse") setCursor(maker.hover(local(event)));
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!pressed.current.has(event.pointerId)) return;
    pressed.current.delete(event.pointerId);
    const maker = makerRef.current;
    if (!maker) return;
    maker.pointerUp(event.pointerId);
    if (event.pointerType === "mouse") setCursor(maker.hover(local(event)));
  };

  // On the stage, typing embosses; Enter feeds and cuts; the arrows turn the dial a notch at a
  // time, and holding the down arrow squeezes the handle by hand.
  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const maker = makerRef.current;
    if (!maker || event.metaKey || event.ctrlKey || event.altKey) return;
    maker.wake();
    if (event.key === "Enter") {
      maker.feedAndCut();
    } else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      maker.nudge(event.key === "ArrowLeft" ? -1 : 1);
    } else if (event.key === "ArrowDown") {
      if (!event.repeat) maker.squeeze(true);
    } else if (event.key === "Backspace" || event.key === "Delete") {
      maker.backspace();
    } else if (event.key.length === 1) {
      maker.type(event.key);
    } else {
      return;
    }
    event.preventDefault();
    setTouched(true);
  };
  const onKeyUp = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowDown") makerRef.current?.squeeze(false);
  };

  const emboss = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const maker = makerRef.current;
    if (!maker || !text.trim()) return;
    maker.wake();
    maker.type(text.trim());
    maker.feedAndCut();
    setText("");
    setTouched(true);
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

  const tape = TAPES.find((entry) => entry.value === settings.tape) ?? TAPES[0];
  const surface =
    SURFACES.find((entry) => entry.value === settings.surface) ?? SURFACES[0];

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
            aria-label="Label maker. Click here and type to emboss letters, Enter to feed and cut; or drag the dial round and press the handle to squeeze. Drag labels about the desk and double-click one to peel its backing."
            className={cn(
              "relative touch-none select-none overflow-hidden bg-grayscale-3 outline-none [view-transition-name:lab-pane] focus-visible:ring-2 focus-visible:ring-grayscale-7 dark:bg-black",
              fullscreen
                ? "h-[55dvh] shrink-0 lg:h-auto lg:min-w-0 lg:flex-1"
                : "h-[34rem] w-full min-w-0 rounded-[13px] border border-grayscale-3 small-shadow lg:sticky lg:top-6 lg:h-[calc(100dvh-3rem)] lg:max-h-full dark:border-grayscale-4",
            )}
            onContextMenu={(event) => event.preventDefault()}
            onKeyDown={onKeyDown}
            onBlur={() => makerRef.current?.squeeze(false)}
            onKeyUp={onKeyUp}
            onLostPointerCapture={onPointerUp}
            onPointerCancel={onPointerUp}
            onPointerDown={onPointerDown}
            onPointerLeave={() => {
              if (!pressed.current.size) makerRef.current?.hover(null);
            }}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            ref={stageRef}
            role="application"
            // biome-ignore lint/a11y/noNoninteractiveTabindex: the stage is typed into, and played with a pointer.
            tabIndex={0}
          >
            <canvas className="absolute inset-0 size-full" ref={canvasRef} />

            <p
              aria-live="polite"
              className={cn(
                "pointer-events-none absolute top-3 right-3 left-3 mx-auto w-fit max-w-sm rounded-2xl bg-black/55 px-3 py-1.5 text-center text-white/90 text-xs backdrop-blur-sm transition-opacity duration-500",
                ((touched && !note) || error) && "opacity-0",
              )}
            >
              {note ??
                "Click here and type, then Enter to feed and cut. Or turn the dial and squeeze the handle."}
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
          aria-label="Label maker controls"
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
                label={
                  stats.queued
                    ? "letters on the strip, and still to emboss"
                    : "letters on the strip since the last cut"
                }
                value={
                  stats.queued
                    ? `${stats.letters} + ${stats.queued}`
                    : `${stats.letters} letters`
                }
              />
              <Metric
                icon={<StackIcon size={12} weight="bold" />}
                label="tape left on the reel"
                value={`${stats.reel.toFixed(2)} m`}
              />
              <Metric
                icon={<TagIcon size={12} weight="bold" />}
                label="labels and offcuts on the desk"
                value={`${stats.labels}`}
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
                  makerRef.current?.wake();
                  makerRef.current?.feedAndCut();
                  setTouched(true);
                }}
                type="button"
              >
                <ScissorsIcon aria-hidden="true" size={13} weight="bold" />
                Feed &amp; cut
              </Button>
              <Button
                className="flex-auto whitespace-nowrap text-xs"
                onClick={() => {
                  makerRef.current?.wake();
                  makerRef.current?.cut();
                  setTouched(true);
                }}
                type="button"
                variant="secondary"
              >
                Cut now
              </Button>
              <Button
                aria-label={settings.sound ? "Mute" : "Sound on"}
                aria-pressed={settings.sound}
                className="w-7 shrink-0 px-0"
                onClick={() => {
                  set("sound")(!settings.sound);
                  makerRef.current?.wake();
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

          <Section title="Emboss">
            <form className="flex gap-1.5" onSubmit={emboss}>
              <label className="sr-only" htmlFor={inputId}>
                Label text
              </label>
              <input
                autoCapitalize="characters"
                autoComplete="off"
                className="h-7 min-w-0 flex-1 rounded-md border border-grayscale-4 bg-grayscale-1 px-2 text-grayscale-12 text-xs uppercase outline-none placeholder:text-grayscale-9 placeholder:normal-case focus:border-grayscale-7 dark:border-grayscale-5 dark:bg-grayscale-2"
                id={inputId}
                maxLength={40}
                onChange={(event) => setText(event.target.value)}
                placeholder="Type a label"
                spellCheck={false}
                value={text}
              />
              <Button className="shrink-0 text-xs" type="submit">
                Emboss
              </Button>
            </form>
            <Description>
              Or click the desk and type straight on to the dial. Holding ↓
              squeezes the handle by hand, and ← → turn the dial a notch.
            </Description>
          </Section>

          <Section title="Tape">
            <Radio.Group
              aria-label="Tape"
              className="grid grid-cols-3 gap-1"
              onValueChange={(next) => {
                makerRef.current?.wake();
                set("tape")(next as TapeKind);
              }}
              value={settings.tape}
            >
              {TAPES.map((entry) => (
                <Radio.Root
                  className="flex items-center justify-center gap-1.5 py-1"
                  key={entry.value}
                  onClick={
                    entry.value === settings.tape
                      ? () => makerRef.current?.reload()
                      : undefined
                  }
                  value={entry.value}
                >
                  <span
                    aria-hidden="true"
                    className="h-2 w-3.5 rounded-[2px] shadow-[0_0_0_1px_rgb(0_0_0/0.15)] dark:shadow-[0_0_0_1px_rgb(255_255_255/0.15)]"
                    style={{ background: SWATCHES[entry.value] }}
                  />
                  {entry.label}
                </Radio.Root>
              ))}
            </Radio.Group>
            <Description>{tape.description}</Description>
          </Section>

          <Section title="Underneath">
            <Radio.Group
              aria-label="Surface"
              className="grid grid-cols-3 gap-1"
              onValueChange={(next) => set("surface")(next as Surface)}
              value={settings.surface}
            >
              {SURFACES.map((entry) => (
                <Radio.Root
                  className="py-1 text-center"
                  key={entry.value}
                  value={entry.value}
                >
                  {entry.label}
                </Radio.Root>
              ))}
            </Radio.Group>
            <Description>{surface.description}</Description>
          </Section>

          <Section title="Hot air">
            <div className="flex items-center justify-between gap-3 text-grayscale-11 text-xs">
              <label className="cursor-pointer" htmlFor={hotAirId}>
                Hairdryer
              </label>
              <Switch.Composed
                checked={settings.hotAir}
                id={hotAirId}
                onCheckedChange={(checked) => {
                  makerRef.current?.wake();
                  set("hotAir")(checked);
                }}
                size={16}
              />
            </div>
            <Description>
              Hold it down over a label. The white goes first, then the letters
              sink, and anything not stuck down blows away.
            </Description>
            <Button
              className="text-xs"
              onClick={() => makerRef.current?.clearDesk()}
              type="button"
              variant="secondary"
            >
              <BroomIcon aria-hidden="true" size={13} weight="bold" />
              Clear the desk
            </Button>
          </Section>

          <Section title="Try">
            <ul className="grid gap-2 text-grayscale-11 text-xs leading-relaxed">
              <li>
                Type a word and press Cut now. Then type another one and watch
                how it starts.
              </li>
              <li>
                Tap the handle lightly instead of squeezing it home, on the
                black tape.
              </li>
              <li>
                Squeeze the handle twice quickly, then drag the dial halfway
                between two letters while holding ↓.
              </li>
              <li>
                Trim a label tight with the scissors, peel it, and leave it a
                while.
              </li>
              <li>Warm a white label slowly with the hairdryer.</li>
            </ul>
          </Section>
        </aside>
      </div>
    </div>
  );
}
