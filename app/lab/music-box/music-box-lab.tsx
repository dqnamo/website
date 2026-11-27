"use client";

import { Slider } from "@base-ui/react/slider";
import {
  ArrowsInSimpleIcon,
  ArrowsOutSimpleIcon,
  ArrowUUpLeftIcon,
  BroomIcon,
  GaugeIcon,
  MetronomeIcon,
  MusicNotesIcon,
  PauseIcon,
  PlayIcon,
  RecordIcon,
  SpeakerHighIcon,
  SpeakerSlashIcon,
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
  createMusicBox,
  DEFAULT_SETTINGS,
  type MusicBox,
  type MusicBoxSettings,
  type MusicBoxStats,
  type Surface,
} from "@/lib/music-box/engine";
import { TUNES, type TuneId } from "@/lib/music-box/tunes";

const SURFACES: { value: Surface; label: string; description: string }[] = [
  {
    value: "hand",
    label: "Hand",
    description:
      "Held up in your fingers. A tine a couple of millimetres wide barely moves the air: what it pushes on one side slips round to the other, so it sounds tiny and thin, and the low notes nearly vanish.",
  },
  {
    value: "table",
    label: "Table",
    description:
      "Set down on the table, the tines shake the whole top, which is wide enough to push the air rather than stir it. It’s suddenly loud and warm, with a little woody knock on every note.",
  },
  {
    value: "box",
    label: "Box",
    description:
      "On an empty cardboard box, the panels and the air inside boom along with the low tines. Cardboard soaks it up quickly, so it’s big but never rings.",
  },
  {
    value: "tin",
    label: "Tin",
    description:
      "On a biscuit tin lid, thin steel rings on after every note, a bright metallic halo the tines alone don’t have.",
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
  columns: 2 | 4;
  onChange: (value: T) => void;
}) {
  return (
    <Radio.Group
      aria-label={label}
      className={cn(
        "grid gap-1",
        columns === 2 ? "grid-cols-2" : "grid-cols-4",
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

function Description({ children }: { children: ReactNode }) {
  return (
    <p className="text-grayscale-10 text-xs leading-relaxed">{children}</p>
  );
}

export default function MusicBoxLab() {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boxRef = useRef<MusicBox | null>(null);
  const [settings, setSettings] = useState<MusicBoxSettings>(DEFAULT_SETTINGS);
  const [tune, setTune] = useState<TuneId>("twinkle");
  const [stats, setStats] = useState<MusicBoxStats>({
    bpm: null,
    bar: 1,
    bars: 12,
    holes: 0,
    ended: false,
    fps: null,
  });
  const [note, setNote] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const [cranking, setCranking] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loopId = useId();

  const set =
    <K extends keyof MusicBoxSettings>(key: K) =>
    (value: MusicBoxSettings[K]) =>
      setSettings((current) => ({ ...current, [key]: value }));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let box: MusicBox;
    try {
      box = createMusicBox(canvas, { onStats: setStats, onNote: setNote });
    } catch (err) {
      console.error(err);
      setError("This browser couldn't start a canvas for the music box.");
      return;
    }
    boxRef.current = box;
    return () => {
      boxRef.current = null;
      box.dispose();
    };
  }, []);

  useEffect(() => {
    boxRef.current?.setSettings(settings);
  }, [settings]);

  // A new strip comes in at the start, joined into a loop if it was made to be one.
  const chooseTune = (value: TuneId) => {
    setTune(value);
    boxRef.current?.loadTune(value);
    const loop = TUNES.find((entry) => entry.value === value)?.loop ?? false;
    setSettings((current) => ({ ...current, loop }));
  };

  // The light follows the site's theme: daylight, or a lamp in the evening.
  useEffect(() => {
    const root = document.documentElement;
    const follow = () =>
      boxRef.current?.setNight(root.classList.contains("dark"));
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

  const local = (event: { clientX: number; clientY: number }) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    return rect
      ? { x: event.clientX - rect.left, y: event.clientY - rect.top }
      : { x: 0, y: 0 };
  };

  const pressed = useRef(new Map<number, "crank" | "punch">());

  const setCursor = (cursor: string) => {
    if (stageRef.current) stageRef.current.style.cursor = cursor;
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const box = boxRef.current;
    if (!box || pressed.current.has(event.pointerId)) return;
    const took = box.pointerDown(event.pointerId, local(event));
    if (!took) return;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // A pointer the browser no longer tracks; moves still arrive while it's over the stage.
    }
    pressed.current.set(event.pointerId, took);
    if (took === "crank") {
      setCranking(true);
      setCursor("grabbing");
    }
    setTouched(true);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const box = boxRef.current;
    if (!box) return;
    if (pressed.current.has(event.pointerId)) {
      box.pointerMove(event.pointerId, local(event));
      return;
    }
    if (event.pointerType === "mouse") setCursor(box.hover(local(event)));
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const kind = pressed.current.get(event.pointerId);
    if (!kind) return;
    pressed.current.delete(event.pointerId);
    boxRef.current?.pointerUp(event.pointerId);
    if (kind === "crank") {
      setCranking([...pressed.current.values()].includes("crank"));
      setCursor("grab");
    }
  };

  // From the keyboard, hold the right arrow or Space to turn the handle, the left arrow to
  // turn it back.
  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const box = boxRef.current;
    if (!box) return;
    const direction =
      event.key === "ArrowRight" ||
      event.key === "ArrowDown" ||
      event.key === " "
        ? 1
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? -1
          : 0;
    if (!direction) return;
    event.preventDefault();
    box.wake();
    box.turn(direction);
    setTouched(true);
  };
  const onKeyUp = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (
      ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp", " "].includes(
        event.key,
      )
    ) {
      boxRef.current?.turn(0);
    }
  };

  // Full screen is the same box in a bigger frame. The page under it collapses meanwhile, so
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

  const surface =
    SURFACES.find((entry) => entry.value === settings.surface) ?? SURFACES[1];
  const tuneInfo = TUNES.find((entry) => entry.value === tune) ?? TUNES[0];

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
            aria-label="Music box. Drag the handle round clockwise, or hold the right arrow key, to play the strip; click the strip to punch a hole."
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
              if (!pressed.current.size) boxRef.current?.hover(null);
            }}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            ref={stageRef}
            role="application"
            // biome-ignore lint/a11y/noNoninteractiveTabindex: the stage is played with a pointer, or with the arrow keys turning the handle.
            tabIndex={0}
          >
            <canvas className="absolute inset-0 size-full" ref={canvasRef} />

            <p
              aria-live="polite"
              className={cn(
                "pointer-events-none absolute right-3 bottom-3 left-3 mx-auto w-fit max-w-sm rounded-2xl bg-black/55 px-3 py-1.5 text-center text-white/90 text-xs backdrop-blur-sm transition-opacity duration-500",
                ((touched && !note) || error || cranking) && "opacity-0",
              )}
            >
              {note ??
                "Turn the handle clockwise to play, or click the strip to punch a note"}
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
          aria-label="Music box controls"
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
                icon={<MetronomeIcon size={12} weight="bold" />}
                label="beats a minute, from how fast the handle's turning"
                value={stats.bpm === null ? "— bpm" : `${stats.bpm} bpm`}
              />
              <Metric
                icon={<MusicNotesIcon size={12} weight="bold" />}
                label={
                  stats.ended
                    ? "the strip has run out"
                    : "bar at the star wheels"
                }
                value={
                  stats.ended ? "Run out" : `Bar ${stats.bar} of ${stats.bars}`
                }
              />
              <Metric
                icon={<RecordIcon size={12} weight="bold" />}
                label="holes punched and not taped over"
                value={`${stats.holes} holes`}
              />
              <Metric
                icon={<GaugeIcon size={12} weight="bold" />}
                label="frames per second"
                value={stats.fps === null ? "—" : `${stats.fps} fps`}
              />
            </div>
            <div className="flex gap-1.5">
              <Button
                aria-pressed={settings.turning}
                className="flex-auto whitespace-nowrap text-xs"
                onClick={() => {
                  boxRef.current?.wake();
                  if (stats.ended && !settings.turning && !settings.loop) {
                    boxRef.current?.refeed();
                  }
                  set("turning")(!settings.turning);
                  setTouched(true);
                }}
                type="button"
              >
                {settings.turning ? (
                  <PauseIcon aria-hidden="true" size={13} weight="bold" />
                ) : (
                  <PlayIcon aria-hidden="true" size={13} weight="bold" />
                )}
                {settings.turning ? "Stop turning" : "Turn the handle"}
              </Button>
              <Button
                aria-label="Feed the strip in again"
                className="w-7 shrink-0 px-0"
                onClick={() => {
                  boxRef.current?.wake();
                  boxRef.current?.refeed();
                }}
                title="Feed the strip in again"
                type="button"
                variant="secondary"
              >
                <ArrowUUpLeftIcon aria-hidden="true" size={14} weight="bold" />
              </Button>
              <Button
                aria-label={settings.sound ? "Mute" : "Sound on"}
                aria-pressed={settings.sound}
                className="w-7 shrink-0 px-0"
                onClick={() => {
                  set("sound")(!settings.sound);
                  boxRef.current?.wake();
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

          <Section title="Strip">
            <Choice
              columns={2}
              label="Strip"
              onChange={chooseTune}
              options={TUNES}
              value={tune}
            />
            <Description>{tuneInfo.description}</Description>
            <div className="flex items-center justify-between gap-3 text-grayscale-11 text-xs">
              <label className="cursor-pointer" htmlFor={loopId}>
                Tape the ends into a loop
              </label>
              <Switch.Composed
                checked={settings.loop}
                id={loopId}
                onCheckedChange={(checked) => set("loop")(checked)}
                size={16}
              />
            </div>
            <Button
              className="text-xs"
              onClick={() => boxRef.current?.sweep()}
              type="button"
              variant="secondary"
            >
              <BroomIcon aria-hidden="true" size={13} weight="bold" />
              Sweep up the chads
            </Button>
          </Section>

          <Section title="Handle">
            <Range
              format={(v) =>
                `${v.toFixed(2)} turns/s · ${Math.round(v * 120)} bpm`
              }
              label="Speed"
              max={2.5}
              min={0.2}
              onChange={set("speed")}
              step={0.05}
              value={settings.speed}
            />
            <Description>
              Each turn pulls the strip four columns, two beats. Turning faster
              only plays faster: the tines ring at their own pitch however hard
              they’re plucked.
            </Description>
          </Section>

          <Section title="Sounding on">
            <Choice
              columns={4}
              label="Sounding on"
              onChange={(value: Surface) => {
                boxRef.current?.wake();
                set("surface")(value);
              }}
              options={SURFACES}
              value={settings.surface}
            />
            <Description>{surface.description}</Description>
          </Section>

          <Section title="Try">
            <ul className="grid gap-2 text-grayscale-11 text-xs leading-relaxed">
              <li>
                Turn the handle really slowly and watch a tine: the star wheel
                bends it up, then lets it go.
              </li>
              <li>
                Pick it up in your hand, then set it back down on the table.
              </li>
              <li>
                Punch two holes side by side on one line, then play them. Then
                leave a column between them.
              </li>
              <li>
                Click a hole to tape over it, and again to peel the tape off.
              </li>
              <li>
                Turn the handle backwards, and turn Frère Jacques really fast.
              </li>
            </ul>
          </Section>
        </aside>
      </div>
    </div>
  );
}
