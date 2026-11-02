"use client";

import {
  ArrowsInSimpleIcon,
  ArrowsOutSimpleIcon,
  FireIcon,
  FireSimpleIcon,
  GaugeIcon,
  WaveformIcon,
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
  ARRANGEMENTS,
  type ArrangementId,
  arrangement,
} from "@/lib/candles/arrangements";
import {
  type CandleSettings,
  type Candles,
  type CandleStats,
  createCandles,
  DEFAULT_SETTINGS,
  LABELS,
  type Relation,
  TRACE_COLOURS,
} from "@/lib/candles/engine";

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

const ARRANGEMENT_OPTIONS = ARRANGEMENTS.map((a) => ({
  value: a.id,
  label: a.label,
}));

const SPEEDS = [
  { value: "1", label: "Real time" },
  { value: "0.25", label: "¼ speed" },
  { value: "0.0625", label: "1/16 speed" },
];

const RELATION: Record<Relation, string> = {
  together: "in step",
  still: "both still",
  turns: "taking turns",
  round: "a third of a beat apart",
  drifting: "each in its own time",
  settling: "settling",
  out: "not both alight",
};

const EXPLAIN: Record<Relation, string> = {
  together:
    "Close together, each flame's pull reaches the other almost at once, so they stretch and pinch off together.",
  still:
    "At this spacing each flame's pull arrives a quarter of a beat late, just as the other is easing off, and the flickers cancel: both burn still.",
  turns:
    "Further apart, the pull arrives half a beat late, so as one stretches the other shrinks.",
  round:
    "Three can't all take turns with each other, so they settle a third of a beat apart and the flicker goes round.",
  drifting:
    "Too far apart to feel each other much: each flickers at its own rate, slipping in and out of step.",
  settling: "Give them a moment to find each other.",
  out: "Light them both to see how they get on.",
};

// Which explanation to show when there are several pairs.
const PRIORITY: Relation[] = [
  "round",
  "still",
  "together",
  "turns",
  "drifting",
  "settling",
  "out",
];

export default function CandlesLab() {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const traceRef = useRef<HTMLCanvasElement>(null);
  const labelRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const candlesRef = useRef<Candles | null>(null);
  const meterRef = useRef<HTMLSpanElement>(null);
  const [settings, setSettings] = useState<CandleSettings>(DEFAULT_SETTINGS);
  const [stats, setStats] = useState<CandleStats>({
    lit: 0,
    wicks: 0,
    flames: [],
    pairs: [],
    match: "none",
    fps: null,
  });
  const [note, setNote] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [night, setNight] = useState(true);
  const [listening, setListening] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);

  const set =
    <K extends keyof CandleSettings>(key: K) =>
    (value: CandleSettings[K]) =>
      setSettings((current) => ({ ...current, [key]: value }));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let candles: Candles;
    try {
      candles = createCandles(canvas, { onStats: setStats, onNote: setNote });
    } catch (err) {
      console.error(err);
      setError("This browser couldn't start WebGL2 for the candles.");
      return;
    }
    candlesRef.current = candles;
    candles.setTrace(traceRef.current);
    candles.setLabels(labelRefs.current);
    // A flicker ten times a second is a lot to watch if motion is unwelcome: start slowed.
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setSettings((current) => ({ ...current, speed: 0.25 }));
    }
    return () => {
      candlesRef.current = null;
      candles.dispose();
    };
  }, []);

  useEffect(() => {
    candlesRef.current?.setSettings(settings);
  }, [settings]);

  // The trace is only there while some flames are being traced.
  const tracing = stats.flames.length > 0;
  useEffect(() => {
    candlesRef.current?.setTrace(tracing ? traceRef.current : null);
  }, [tracing]);

  // The room follows the site's theme: dusk light from a window by day, dark at night.
  useEffect(() => {
    const root = document.documentElement;
    const follow = () => {
      const dark = root.classList.contains("dark");
      setNight(dark);
      candlesRef.current?.setNight(dark);
    };
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

  const setCursor = (cursor: string) => {
    if (stageRef.current) stageRef.current.style.cursor = cursor;
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const candles = candlesRef.current;
    if (!candles || pressed.current !== null) return;
    setTouched(true);
    const cursor = candles.pointerDown(event.pointerId, local(event));
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // A pointer the browser no longer tracks; moves still arrive while it's over the stage.
    }
    pressed.current = event.pointerId;
    setCursor(cursor);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const candles = candlesRef.current;
    if (!candles) return;
    if (pressed.current === event.pointerId) {
      candles.pointerMove(event.pointerId, local(event));
      return;
    }
    if (event.pointerType === "mouse") setCursor(candles.hover(local(event)));
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (pressed.current !== event.pointerId) return;
    pressed.current = null;
    const candles = candlesRef.current;
    candles?.pointerUp(event.pointerId);
    setCursor(candles?.hover(local(event)) ?? "default");
  };

  const strike = () => {
    candlesRef.current?.strike();
    setTouched(true);
  };

  // From the keyboard: hold Space to blow, M strikes a match, Escape puts it out.
  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const candles = candlesRef.current;
    if (!candles || event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.key === " ") {
      event.preventDefault();
      candles.blow(true);
      setTouched(true);
    } else if (event.key === "m" || event.key === "M") {
      if (!event.repeat) strike();
    } else if (event.key === "Escape") {
      candles.dropMatch();
    }
  };

  const onKeyUp = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === " ") candlesRef.current?.blow(false);
  };

  // Blowing into the microphone: breath is a rush of low noise, so the level below 400 Hz
  // above the room's own quiet is how hard you're blowing, aimed wherever the pointer last was.
  const mic = useRef<{
    stream: MediaStream;
    audio: AudioContext;
    frame: number;
  } | null>(null);
  const micStarting = useRef(false);

  const stopListening = useCallback(() => {
    const current = mic.current;
    if (!current) return;
    cancelAnimationFrame(current.frame);
    for (const track of current.stream.getTracks()) track.stop();
    current.audio.close();
    mic.current = null;
    candlesRef.current?.breathe(0);
    setListening(false);
  }, []);

  const startListening = async () => {
    if (mic.current || micStarting.current) return;
    micStarting.current = true;
    setMicError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          autoGainControl: false,
          echoCancellation: false,
          noiseSuppression: false,
        },
      });
      const audio = new AudioContext();
      // Made after the permission prompt, it may start suspended.
      void audio.resume();
      const analyser = audio.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.5;
      audio.createMediaStreamSource(stream).connect(analyser);
      const bins = new Uint8Array(analyser.frequencyBinCount);
      const top = Math.max(
        2,
        Math.round(400 / (audio.sampleRate / analyser.fftSize)),
      );
      let quiet = -1;
      let level = 0;
      const current = { stream, audio, frame: 0 };
      const listen = () => {
        analyser.getByteFrequencyData(bins);
        let sum = 0;
        for (let k = 1; k <= top; k++) sum += bins[k];
        const low = sum / top / 255;
        // The room's own quiet follows the softest sound, creeping up slowly.
        quiet = quiet < 0 ? low : Math.min(low, quiet + 0.0015);
        const blowing = Math.min(1, Math.max(0, (low - quiet - 0.08) / 0.3));
        level += (blowing - level) * 0.3;
        candlesRef.current?.breathe(level > 0.04 ? level : 0);
        if (meterRef.current) {
          meterRef.current.style.transform = `scaleX(${level})`;
        }
        current.frame = requestAnimationFrame(listen);
      };
      mic.current = current;
      listen();
      setListening(true);
      setTouched(true);
    } catch (err) {
      console.error(err);
      setMicError("The microphone isn't available here.");
    } finally {
      micStarting.current = false;
    }
  };

  useEffect(() => stopListening, [stopListening]);

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

  const colours = night ? TRACE_COLOURS.night : TRACE_COLOURS.day;
  const flickering = stats.flames.filter((f) => f.hz !== null);
  const hz =
    flickering.length > 0
      ? flickering.reduce((sum, f) => sum + (f.hz ?? 0), 0) / flickering.length
      : null;
  const shown = PRIORITY.find((r) =>
    r === "round"
      ? stats.pairs.length === 3 &&
        stats.pairs.filter((p) => p.relation === "round").length >= 2
      : stats.pairs.some((p) => p.relation === r),
  );
  const matchLabel =
    stats.match === "burning" ? "Strike another" : "Strike a match";

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
            aria-label="Candles on a table. Press and hold beside a flame to blow on it, or hold Space to blow where the pointer is. Drag a candle by its stem to move it. Press M to strike a match, then hold it to a wick or in the smoke of one just blown out."
            className={cn(
              "relative touch-none select-none overflow-hidden bg-grayscale-3 outline-none [view-transition-name:lab-pane] focus-visible:ring-2 focus-visible:ring-grayscale-7 dark:bg-black",
              fullscreen
                ? "h-[55dvh] shrink-0 lg:h-auto lg:min-w-0 lg:flex-1"
                : "h-[34rem] w-full min-w-0 rounded-[13px] border border-grayscale-3 small-shadow lg:sticky lg:top-6 lg:h-[calc(100dvh-3rem)] lg:max-h-full dark:border-grayscale-4",
            )}
            onBlur={() => candlesRef.current?.blow(false)}
            onContextMenu={(event) => event.preventDefault()}
            onKeyDown={onKeyDown}
            onKeyUp={onKeyUp}
            onLostPointerCapture={onPointerUp}
            onPointerCancel={onPointerUp}
            onPointerDown={onPointerDown}
            onPointerLeave={() => {
              if (pressed.current === null) {
                setCursor("default");
                candlesRef.current?.leave();
              }
            }}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            ref={stageRef}
            role="application"
            // biome-ignore lint/a11y/noNoninteractiveTabindex: the stage is played with a pointer, or with Space, M and Escape.
            tabIndex={0}
          >
            <canvas className="absolute inset-0 size-full" ref={canvasRef} />

            {LABELS.map((label, i) => (
              <span
                aria-hidden="true"
                className="pointer-events-none absolute top-0 left-0 mt-1 rounded px-1 font-semibold text-[10px] text-white leading-4 dark:text-black"
                key={label}
                ref={(el) => {
                  labelRefs.current[i] = el;
                }}
                style={{ backgroundColor: colours[i], display: "none" }}
              >
                {label}
              </span>
            ))}

            <p
              aria-live="polite"
              className={cn(
                "pointer-events-none absolute right-3 bottom-3 left-3 mx-auto w-fit max-w-sm rounded-2xl bg-black/55 px-3 py-1.5 text-center text-white/90 text-xs backdrop-blur-sm transition-opacity duration-500",
                ((touched && !note) || error) && "opacity-0",
              )}
            >
              {note ?? "Press and hold beside a flame to blow on it"}
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
          aria-label="Candle controls"
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
                icon={<FireSimpleIcon size={12} weight="bold" />}
                label="wicks alight"
                value={`${stats.lit} of ${stats.wicks} lit`}
              />
              <Metric
                icon={<WaveformIcon size={12} weight="bold" />}
                label="how many times a second the flames flicker"
                value={hz === null ? "Steady" : `${hz.toFixed(1)} Hz`}
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
                onClick={strike}
                title="Strike a match (M)"
                type="button"
              >
                <FireIcon aria-hidden="true" size={13} weight="bold" />
                {matchLabel}
              </Button>
              <Button
                className="flex-auto whitespace-nowrap text-xs"
                disabled={stats.lit === stats.wicks}
                onClick={() => candlesRef.current?.lightAll()}
                title="Light every wick"
                type="button"
                variant="secondary"
              >
                Light them all
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
              Press and hold beside a flame to blow on it, or hold Space. Drag a
              candle by its stem to move it. A struck match lights a wick held
              in it, or the smoke of one just blown out.
            </p>
          </div>

          <Section title="Candles">
            <Choice
              columns={2}
              label="Candles"
              onChange={(value: ArrangementId) => set("arrangement")(value)}
              options={ARRANGEMENT_OPTIONS}
              value={settings.arrangement}
            />
            <p className="text-grayscale-10 text-xs leading-4">
              {arrangement(settings.arrangement).note}
            </p>
          </Section>

          {stats.flames.length > 0 && (
            <Section title="Flame heights">
              <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                {stats.flames.map((flame, i) => (
                  <span
                    className="font-semibold text-xs tabular-nums"
                    key={flame.label}
                    style={{ color: colours[i] }}
                  >
                    {flame.label}{" "}
                    <span className="font-normal text-grayscale-10">
                      {!flame.lit
                        ? "out"
                        : flame.hz === null
                          ? "steady"
                          : `${flame.hz.toFixed(1)} Hz`}
                    </span>
                  </span>
                ))}
              </div>
              <div className="relative -mt-1.5 h-20 overflow-hidden rounded-md bg-grayscale-2 dark:bg-grayscale-3">
                <canvas
                  aria-label="Each flame's height over the last half second"
                  className="absolute inset-0 size-full"
                  ref={traceRef}
                  role="img"
                />
              </div>
              {stats.pairs.length > 0 && (
                <ul className="grid gap-1 text-grayscale-11 text-xs tabular-nums">
                  {stats.pairs.map((pair) => (
                    <li
                      className="flex items-baseline justify-between gap-2"
                      key={`${pair.a}${pair.b}`}
                    >
                      <span>
                        {pair.a} and {pair.b}, {pair.cm.toFixed(1)} cm apart
                      </span>
                      <span className="font-medium text-grayscale-12">
                        {RELATION[pair.relation]}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-grayscale-10 text-xs leading-4">
                {shown
                  ? EXPLAIN[shown]
                  : "Each line is a flame's height over the last half second. A steady flame draws a flat line."}
              </p>
            </Section>
          )}

          <Section title="Air">
            <Toggle
              checked={listening}
              label="Blow into the microphone"
              onChange={(on) => (on ? startListening() : stopListening())}
            />
            {listening && (
              <span
                aria-hidden="true"
                className="block h-1 overflow-hidden rounded-full bg-grayscale-3 dark:bg-grayscale-5"
              >
                <span
                  className="block h-full origin-left scale-x-0 bg-grayscale-9"
                  ref={meterRef}
                />
              </span>
            )}
            {micError && (
              <p className="text-grayscale-10 text-xs leading-4" role="alert">
                {micError}
              </p>
            )}
            <Toggle
              checked={settings.draught}
              label="A draught from the window"
              onChange={set("draught")}
            />
            <p className="text-grayscale-10 text-xs leading-4">
              Your breath goes where the pointer is. A flame square in it ducks
              away from you; one at its edge is pushed aside. Blow gently and
              they lean; hard, and they lift off the wick and go out.
            </p>
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
                ? "Slowed down, you can see each beat of a flicker: the flame stretches, its waist pinches in, the tip breaks off and burns away above it."
                : "At full speed a bundle's flame flickers about ten times a second, quicker than an eye can follow."}
            </p>
          </Section>
        </aside>
      </div>
    </div>
  );
}
