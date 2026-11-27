"use client";

import {
  ArrowsInSimpleIcon,
  ArrowsOutSimpleIcon,
  BroomIcon,
  CircleDashedIcon,
  MusicNoteIcon,
  MusicNotesIcon,
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
import Button, { getButtonClassName } from "@/components/public/Button";
import { Radio } from "@/components/public/Radio";
import { Switch } from "@/components/public/Switch";
import { cn } from "@/helpers/classname-helper";
import {
  type BandSize,
  type BoardId,
  type Material,
  PALETTES,
  type Palette,
} from "@/lib/geoboard/boards";
import {
  createGeoboard,
  DEFAULT_SETTINGS,
  type Geoboard,
  type GeoboardSettings,
  type GeoboardStats,
} from "@/lib/geoboard/engine";
import { PATTERNS } from "@/lib/geoboard/shapes";
import { createVoice, type Voice } from "@/lib/geoboard/sound";

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
  options: { value: T; label: ReactNode }[];
  columns: 2 | 3 | 4;
  onChange: (value: T) => void;
}) {
  return (
    <Radio.Group
      aria-label={label}
      className={cn(
        "grid gap-1",
        columns === 2
          ? "grid-cols-2"
          : columns === 3
            ? "grid-cols-3"
            : "grid-cols-4",
      )}
      onValueChange={(next) => onChange(next as T)}
      value={value}
    >
      {options.map((option) => (
        <Radio.Root
          className="flex items-center justify-center gap-1.5 py-1 text-center"
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

function Note({ children }: { children: ReactNode }) {
  return <p className="text-grayscale-10 text-xs leading-4">{children}</p>;
}

const BOARD_NOTES: Record<BoardId, string> = {
  grid5:
    "The classic: 25 pegs 4 cm apart. Count the pegs inside a shape and on its band, and Pick's theorem gives its area without a ruler.",
  grid9: "81 pegs 2.4 cm apart, room for bigger figures and finer slopes.",
  triangles:
    "Pegs on a triangular lattice, for the hexagons and equilateral triangles a square board can't make. Areas are counted in small triangles.",
  circle:
    "The back of the board: twelve pegs round a circle like a clock, and one in the middle.",
};

const SIZE_NOTES: Record<BandSize, string> = {
  small: "7.5 cm round, unstretched.",
  medium: "12 cm round, unstretched.",
  large: "19 cm round, unstretched.",
};

const DEFAULT_STATS: GeoboardStats = {
  bands: 0,
  note: null,
  hertz: null,
  shape: null,
  runs: [],
};

export default function GeoboardLab() {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boardRef = useRef<Geoboard | null>(null);
  const voiceRef = useRef<Voice | null>(null);
  const [settings, setSettings] = useState<GeoboardSettings>(DEFAULT_SETTINGS);
  const [stats, setStats] = useState<GeoboardStats>(DEFAULT_STATS);
  const [sound, setSound] = useState(true);
  const [pattern, setPattern] = useState<string | null>("house");
  const [touched, setTouched] = useState(false);
  const [holding, setHolding] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set =
    <K extends keyof GeoboardSettings>(key: K) =>
    (value: GeoboardSettings[K]) =>
      setSettings((current) => ({ ...current, [key]: value }));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const voice = createVoice();
    voiceRef.current = voice;
    let board: Geoboard;
    try {
      board = createGeoboard(canvas, { voice, onStats: setStats });
    } catch (err) {
      console.error(err);
      setError("This browser couldn't start a canvas for the board.");
      return;
    }
    boardRef.current = board;
    // A shape to start from, so there's something to pluck.
    board.pattern("house");
    return () => {
      boardRef.current = null;
      voiceRef.current = null;
      board.dispose();
      voice.dispose();
    };
  }, []);

  useEffect(() => {
    boardRef.current?.setSettings(settings);
  }, [settings]);

  useEffect(() => {
    voiceRef.current?.setEnabled(sound);
  }, [sound]);

  const local = (event: ReactPointerEvent<HTMLElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    return {
      x: event.clientX - (rect?.left ?? 0),
      y: event.clientY - (rect?.top ?? 0),
    };
  };

  const pressed = useRef<number | null>(null);

  const setCursor = (cursor: string) => {
    if (stageRef.current) stageRef.current.style.cursor = cursor;
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const board = boardRef.current;
    if (!board || pressed.current !== null) return;
    voiceRef.current?.unlock();
    const coarse = event.pointerType !== "mouse";
    if (!board.pointerDown(event.pointerId, local(event), coarse)) return;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // A pointer the browser no longer tracks; moves still arrive while it's over the stage.
    }
    pressed.current = event.pointerId;
    setHolding(true);
    setTouched(true);
    setCursor("grabbing");
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const board = boardRef.current;
    if (!board) return;
    if (pressed.current === event.pointerId) {
      board.pointerMove(event.pointerId, local(event));
    } else if (event.pointerType === "mouse" && pressed.current === null) {
      const over = board.hover(local(event));
      setCursor(over === "band" ? "grab" : over === "peg" ? "copy" : "default");
    }
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (pressed.current !== event.pointerId) return;
    pressed.current = null;
    boardRef.current?.pointerUp(event.pointerId);
    setHolding(false);
    setCursor("default");
  };

  // From the keyboard: Space strums, Backspace takes the last band off.
  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const board = boardRef.current;
    if (!board || event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.key === " ") {
      event.preventDefault();
      voiceRef.current?.unlock();
      board.strum();
      setTouched(true);
    } else if (event.key === "Backspace" || event.key === "Delete") {
      event.preventDefault();
      board.undo();
    }
  };

  // Full screen is the same stage in a bigger frame. The page under it collapses meanwhile, so
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
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") showFullscreen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showFullscreen]);

  const strum = () => {
    voiceRef.current?.unlock();
    boardRef.current?.strum();
  };

  const patterns = PATTERNS[settings.board];
  const patternNote = patterns.find((entry) => entry.value === pattern)?.note;
  const shape = stats.shape;

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
            aria-label="Geoboard. Press a peg and drag to stretch a new band to other pegs; drag a band to move it, tap one to pluck it, or drag it off the board to take it away. Space strums every band; Backspace takes the last one off."
            className={cn(
              "relative touch-none select-none overflow-hidden bg-[#e9e4dc] outline-none [view-transition-name:lab-pane] focus-visible:ring-2 focus-visible:ring-grayscale-7 dark:bg-[#17181b]",
              fullscreen
                ? "h-[55dvh] shrink-0 lg:h-auto lg:min-w-0 lg:flex-1"
                : "h-[26rem] w-full min-w-0 rounded-[13px] border border-grayscale-3 small-shadow sm:h-[34rem] lg:sticky lg:top-6 lg:h-[calc(100dvh-3rem)] lg:max-h-full dark:border-grayscale-4",
            )}
            onContextMenu={(event) => event.preventDefault()}
            onKeyDown={onKeyDown}
            onLostPointerCapture={onPointerUp}
            onPointerCancel={onPointerUp}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            ref={stageRef}
            role="application"
            // biome-ignore lint/a11y/noNoninteractiveTabindex: the stage is played with a pointer, or with Space and Backspace.
            tabIndex={0}
          >
            <canvas className="absolute inset-0 size-full" ref={canvasRef} />

            <p
              aria-live="polite"
              className={cn(
                "pointer-events-none absolute right-3 bottom-3 left-3 mx-auto w-fit max-w-sm rounded-2xl bg-black/55 px-3 py-1.5 text-center text-white/90 text-xs backdrop-blur-sm transition-opacity duration-500",
                (touched || error || holding) && "opacity-0",
              )}
            >
              Drag from a peg to stretch a band, tap a band to pluck it
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
          aria-label="Geoboard controls"
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
                icon={<CircleDashedIcon size={12} weight="bold" />}
                label="bands on the board"
                value={`${stats.bands} ${stats.bands === 1 ? "band" : "bands"}`}
              />
              <Metric
                icon={<MusicNoteIcon size={12} weight="bold" />}
                label="last note plucked"
                value={
                  stats.note && stats.hertz
                    ? `${stats.note} · ${stats.hertz} Hz`
                    : "—"
                }
              />
            </div>
            <div className="flex gap-1.5">
              <Button
                className="flex-auto gap-1.5 whitespace-nowrap text-xs"
                onClick={strum}
                type="button"
              >
                <MusicNotesIcon aria-hidden="true" size={13} weight="bold" />
                Strum
              </Button>
              <button
                aria-label={sound ? "Mute" : "Sound on"}
                aria-pressed={!sound}
                className={getButtonClassName({
                  variant: "secondary",
                  className: "w-7 shrink-0 px-0",
                })}
                onClick={() => setSound((on) => !on)}
                title={sound ? "Mute" : "Sound on"}
                type="button"
              >
                {sound ? (
                  <SpeakerHighIcon aria-hidden="true" size={14} weight="bold" />
                ) : (
                  <SpeakerSlashIcon
                    aria-hidden="true"
                    size={14}
                    weight="bold"
                  />
                )}
              </button>
              <Button
                aria-label="Take every band off"
                className="w-7 shrink-0 px-0"
                onClick={() => {
                  setPattern(null);
                  boardRef.current?.clear();
                }}
                title="Take every band off"
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

          <Section title="Shape">
            {/* Kept to four lines whatever it says, so the stage beside it doesn't jump. */}
            <div className="grid min-h-16 content-start gap-0.5 text-xs leading-4">
              {shape ? (
                <>
                  <p className="font-medium text-grayscale-12">{shape.name}</p>
                  {shape.area && (
                    <p className="text-grayscale-11 tabular-nums">
                      {shape.area}
                    </p>
                  )}
                  {shape.pick && (
                    <p className="text-grayscale-10 tabular-nums">
                      = {shape.pick}
                    </p>
                  )}
                  {stats.runs.length > 0 && (
                    <p className="text-grayscale-11">
                      Plays {stats.runs.join(" · ")}
                    </p>
                  )}
                </>
              ) : (
                <p className="text-grayscale-10">
                  Stretch a band round three pegs or more and it's measured
                  here.
                </p>
              )}
            </div>
            <Toggle
              checked={settings.areas}
              label="Areas on the board"
              onChange={set("areas")}
            />
          </Section>

          <Section title="Board">
            <Choice
              columns={4}
              label="Board"
              onChange={(value) => {
                // A new board starts bare, so the last pattern's note goes with it.
                setPattern(null);
                set("board")(value);
              }}
              options={[
                { value: "grid5", label: "5 × 5" },
                { value: "grid9", label: "9 × 9" },
                { value: "triangles", label: "Triangles" },
                { value: "circle", label: "Circle" },
              ]}
              value={settings.board}
            />
            <Choice<Material>
              columns={3}
              label="Material"
              onChange={set("material")}
              options={[
                { value: "birch", label: "Birch" },
                { value: "walnut", label: "Walnut" },
                { value: "plastic", label: "Plastic" },
              ]}
              value={settings.material}
            />
            <Note>{BOARD_NOTES[settings.board]}</Note>
          </Section>

          <Section title="Bands">
            <Choice<BandSize>
              columns={3}
              label="Band size"
              onChange={set("size")}
              options={[
                { value: "small", label: "Small" },
                { value: "medium", label: "Medium" },
                { value: "large", label: "Large" },
              ]}
              value={settings.size}
            />
            <Choice<Palette>
              columns={3}
              label="Colours"
              onChange={set("palette")}
              options={(["assorted", "natural", "neon"] as const).map(
                (palette) => ({
                  value: palette,
                  label: (
                    <>
                      <span aria-hidden="true" className="flex -space-x-1">
                        {PALETTES[palette].slice(0, 3).map((color) => (
                          <span
                            className="size-2.5 rounded-full shadow-[0_0_0_1px_var(--gray-1)] dark:shadow-[0_0_0_1px_var(--gray-4)]"
                            key={color}
                            style={{ background: color }}
                          />
                        ))}
                      </span>
                      {palette.charAt(0).toUpperCase() + palette.slice(1)}
                    </>
                  ),
                }),
              )}
              value={settings.palette}
            />
            <Toggle
              checked={settings.perished}
              label="Old bands from the back of a drawer"
              onChange={set("perished")}
            />
            <Note>
              {SIZE_NOTES[settings.size]}{" "}
              {settings.perished
                ? "Old rubber goes hard and crazed: the cracks open as it stretches, and it tears at under three times its length."
                : "Fresh rubber stretches to about six times its length before it tears."}{" "}
              A run's note is set by its length and the band's size, hardly by
              how far it's stretched: tighter, but longer and lighter too.
            </Note>
          </Section>

          <Section title="Patterns">
            <div className="grid grid-cols-2 gap-1.5">
              {patterns.map((entry) => (
                <Button
                  className="text-xs"
                  key={entry.value}
                  onClick={() => {
                    setPattern(entry.value);
                    setTouched(true);
                    boardRef.current?.pattern(entry.value);
                  }}
                  type="button"
                  variant="secondary"
                >
                  {entry.label}
                </Button>
              ))}
            </div>
            {patternNote && <Note>{patternNote}</Note>}
          </Section>
        </aside>
      </div>
    </div>
  );
}
