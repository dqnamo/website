"use client";

import { Slider } from "@base-ui/react/slider";
import {
  ArrowsInSimpleIcon,
  ArrowsOutSimpleIcon,
  HandTapIcon,
  HashIcon,
  PhoneDisconnectIcon,
  PhoneIcon,
  PulseIcon,
} from "@phosphor-icons/react";
import {
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
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
import { BODIES, createDial, type Dial } from "@/lib/rotary-dial/dial";
import {
  createExchange,
  type Exchange,
  type LineState,
  THIS_NUMBER,
} from "@/lib/rotary-dial/exchange";
import { createSound, type Sound } from "@/lib/rotary-dial/sound";
import { COLOURS, DEFAULTS, FINISHES, type Settings } from "./presets";

type Point = { x: number; y: number };

const IDLE: LineState = {
  status: "idle",
  lifted: false,
  number: "",
  counting: 0,
  pulses: 0,
  rings: 0,
  announcement: null,
};

// The trace shows this many milliseconds of the line.
const TRACE_SPAN = 3000;

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

function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T | null;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <Radio.Group
      aria-label={label}
      className="grid grid-cols-2 gap-1"
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

// The current in the line over the last few seconds, as the exchange sees it: high while the
// loop is made, low while it's broken. Ticks mark tenths of a second, taller ones whole seconds.
function LineTrace({ exchange }: { exchange: RefObject<Exchange | null> }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const c = canvas?.getContext("2d");
    if (!canvas || !c) return;
    let frame = 0;
    let settled = "";
    const draw = () => {
      frame = requestAnimationFrame(draw);
      const history = exchange.current?.history() ?? [];
      const now = performance.now();
      const rect = canvas.getBoundingClientRect();
      const color = getComputedStyle(canvas).color;
      // Once the line has been quiet for the whole window, the picture stops changing.
      const lastChange = history.length ? history[history.length - 1].t : 0;
      const quiet = now - lastChange > TRACE_SPAN + 100;
      const key = `${rect.width}x${rect.height} ${color} ${history.at(-1)?.made}`;
      if (quiet && key === settled) return;
      settled = quiet ? key : "";

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(1, Math.round(rect.width * dpr));
      const h = Math.max(1, Math.round(rect.height * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.clearRect(0, 0, rect.width, rect.height);
      const x = (t: number) => rect.width * (1 - (now - t) / TRACE_SPAN);
      const high = 7;
      const low = rect.height - 9;
      const y = (made: boolean) => (made ? high : low);

      c.fillStyle = color;
      c.globalAlpha = 0.16;
      c.fillRect(0, low + 4, rect.width, 1);
      for (
        let t = Math.ceil((now - TRACE_SPAN) / 100) * 100;
        t <= now;
        t += 100
      ) {
        const second = Math.round(t) % 1000 === 0;
        c.fillRect(
          Math.round(x(t)),
          second ? low - 2 : low + 1,
          1,
          second ? 8 : 4,
        );
      }
      c.globalAlpha = 1;

      const start = now - TRACE_SPAN;
      let i = 0;
      let made = history[0]?.made ?? false;
      while (i < history.length && history[i].t <= start) {
        made = history[i].made;
        i++;
      }
      c.beginPath();
      c.moveTo(0, y(made));
      for (; i < history.length && history[i].t <= now; i++) {
        const px = x(history[i].t);
        c.lineTo(px, y(made));
        made = history[i].made;
        c.lineTo(px, y(made));
      }
      c.lineTo(rect.width, y(made));
      c.strokeStyle = color;
      c.lineWidth = 1.5;
      c.lineJoin = "round";
      c.stroke();
    };
    draw();
    return () => cancelAnimationFrame(frame);
  }, [exchange]);

  return (
    <div aria-hidden="true">
      <canvas className="block h-14 w-full text-grayscale-12" ref={canvasRef} />
    </div>
  );
}

// Numbers are grouped as they'd be written: the code, then the rest.
function grouped(number: string) {
  return number[0] === "0" && number.length > 5
    ? `${number.slice(0, 5)} ${number.slice(5)}`
    : number;
}

function describe(line: LineState, touched: boolean, holding: boolean) {
  switch (line.status) {
    case "idle":
      if (!touched) return "Drag a figure round to the finger stop";
      if (!line.lifted) return "Receiver on its rest";
      return holding ? "Cradle held down" : "Waiting for dial tone";
    case "dial-tone":
      return "Dial tone";
    case "dialling":
      return "Dialling";
    case "connecting":
      return "Connecting";
    case "ringing":
      return line.rings > 1 ? `Ringing · ${line.rings}` : "Ringing";
    case "engaged":
      return "Engaged";
    case "unobtainable":
      return "Number unobtainable";
    case "clock":
      return line.announcement ?? "Speaking clock";
  }
}

export default function RotaryDialLab() {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dialRef = useRef<Dial | null>(null);
  const soundRef = useRef<Sound | null>(null);
  const exchangeRef = useRef<Exchange | null>(null);
  const [settings, setSettings] = useState(DEFAULTS);
  const [line, setLine] = useState<LineState>(IDLE);
  const [touched, setTouched] = useState(false);
  const [holding, setHolding] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set =
    <K extends keyof Settings>(key: K) =>
    (value: Settings[K]) =>
      setSettings((current) => ({ ...current, [key]: value }));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const sound = createSound();
    const exchange = createExchange({ sound, onState: setLine });
    let dial: Dial;
    try {
      dial = createDial(canvas, {
        // Reaching for the dial picks the receiver up, if it isn't already.
        onGrab: () => {
          sound.ensure();
          if (!exchange.lifted()) {
            sound.receiver(true);
            exchange.setReceiver(true);
          }
        },
        onRelease: (train) => {
          sound.train(train);
          exchange.pulses(train.events);
        },
        onRatchet: () => sound.ratchet(),
        onStop: () => sound.stop(),
      });
    } catch (err) {
      console.error(err);
      setError("This browser couldn't start a canvas for the dial.");
      exchange.dispose();
      sound.dispose();
      return;
    }
    dialRef.current = dial;
    soundRef.current = sound;
    exchangeRef.current = exchange;
    return () => {
      dialRef.current = null;
      soundRef.current = null;
      exchangeRef.current = null;
      dial.dispose();
      exchange.dispose();
      sound.dispose();
    };
  }, []);

  useEffect(() => {
    const { body, finish, speed, ratio } = settings;
    dialRef.current?.setSettings({ body, finish, speed, ratio: ratio / 100 });
    soundRef.current?.setEnabled(settings.sound);
    soundRef.current?.setVolume(settings.volume / 100);
  }, [settings]);

  const pickUp = useCallback(() => {
    const sound = soundRef.current;
    const exchange = exchangeRef.current;
    if (!sound || !exchange) return;
    sound.ensure();
    if (!exchange.lifted()) {
      sound.receiver(true);
      exchange.setReceiver(true);
    }
  }, []);

  const toggleReceiver = () => {
    const sound = soundRef.current;
    const exchange = exchangeRef.current;
    if (!sound || !exchange) return;
    sound.ensure();
    const lift = !exchange.lifted();
    sound.receiver(lift);
    exchange.setReceiver(lift);
    setTouched(true);
  };

  // The cradle is the hook switch: pressing it breaks the line just as a pulse does, so quick
  // taps dial, and holding it down for a moment hangs up.
  const pressCradle = (down: boolean) => {
    const sound = soundRef.current;
    const exchange = exchangeRef.current;
    if (!sound || !exchange?.lifted()) return;
    if (down === holding) return;
    sound.ensure();
    sound.hook(down);
    exchange.setCradle(down);
    setHolding(down);
  };

  const grabbing = useRef<number | null>(null);

  const local = (event: { clientX: number; clientY: number }): Point => {
    const rect = canvasRef.current?.getBoundingClientRect();
    return rect
      ? { x: event.clientX - rect.left, y: event.clientY - rect.top }
      : { x: 0, y: 0 };
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (grabbing.current !== null) return;
    if (!dialRef.current?.grab(local(event))) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    event.currentTarget.style.cursor = "grabbing";
    grabbing.current = event.pointerId;
    setTouched(true);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const dial = dialRef.current;
    if (!dial) return;
    if (grabbing.current !== event.pointerId) {
      if (event.pointerType === "mouse" && grabbing.current === null) {
        event.currentTarget.style.cursor = dial.canGrab(local(event))
          ? "grab"
          : "";
      }
      return;
    }
    // Every point the pointer passed since the last event, so a quick pull keeps its angle.
    const points = event.nativeEvent.getCoalescedEvents?.() ?? [];
    for (const point of points.length ? points : [event])
      dial.drag(local(point));
  };

  const onPointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (grabbing.current !== event.pointerId) return;
    grabbing.current = null;
    event.currentTarget.style.cursor = "";
    dialRef.current?.release();
  };

  // Typing a digit dials it, the wheel and all.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!/^[0-9]$/.test(event.key) || event.repeat) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isEditable(event.target)) return;
      pickUp();
      setTouched(true);
      dialRef.current?.dial(Number(event.key));
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [pickUp]);

  // Full screen is the same dial in a bigger frame. The page under it collapses meanwhile, so
  // its scroll position is put back on the way out. Where the browser can, the dial and its
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

  const counting = line.counting > 0;
  const showNumber = Boolean(line.number) || counting;
  const status = describe(line, touched, holding);
  const breakMs = Math.round((1000 / settings.speed) * (settings.ratio / 100));
  const makeMs = Math.round(1000 / settings.speed) - breakMs;

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
        {/* Beside the panel, the dial fills the window and stays in view while the panel
            scrolls. Its cell takes the panel's height without counting the dial towards it,
            so on a very tall window the dial stops at the panel's height. On a phone the dial
            is as wide as the screen allows, so the stage is shorter to keep the panel near. */}
        <div
          className={
            fullscreen ? "contents" : "w-full min-w-0 lg:[contain:size]"
          }
        >
          {/* biome-ignore lint/a11y/noStaticElementInteractions: the dial is turned with a pointer; typing digits does the same by keyboard. */}
          <div
            className={cn(
              "relative touch-none select-none overflow-hidden [view-transition-name:lab-pane]",
              fullscreen
                ? "h-[55dvh] shrink-0 lg:h-auto lg:min-w-0 lg:flex-1"
                : "h-[26rem] w-full min-w-0 rounded-[13px] border border-grayscale-3 small-shadow sm:h-[34rem] lg:sticky lg:top-6 lg:h-[calc(100dvh-3rem)] lg:max-h-full dark:border-grayscale-4",
            )}
            onContextMenu={(event) => event.preventDefault()}
            onLostPointerCapture={onPointerEnd}
            onPointerCancel={onPointerEnd}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerEnd}
            ref={stageRef}
            // The telephone's colour, until the dial draws its first frame.
            style={{ background: BODIES[settings.body].case }}
          >
            <canvas
              aria-label="A telephone dial. Drag a figure round to the finger stop and let go to dial it, or type digits."
              className="absolute inset-0 size-full"
              ref={canvasRef}
              role="img"
            />

            <div
              aria-hidden="true"
              className="pointer-events-none absolute top-3 right-3 left-3 flex justify-center"
            >
              <div className="flex min-w-0 max-w-full flex-col items-center rounded-2xl bg-black/50 px-3.5 py-1.5 text-center text-white backdrop-blur-sm">
                {showNumber && (
                  <span className="font-medium text-base tabular-nums tracking-[0.08em]">
                    {grouped(line.number)}
                    {counting && (
                      <span className="text-white/45">{line.counting}</span>
                    )}
                  </span>
                )}
                <span className="truncate text-white/80 text-xs">{status}</span>
              </div>
            </div>

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
          aria-label="Rotary dial controls"
          className={cn(
            "relative flex flex-col bg-grayscale-1 [view-transition-name:lab-panel]",
            fullscreen
              ? "min-h-0 flex-1 overflow-y-auto border-grayscale-3 border-t [scrollbar-color:var(--gray-6)_transparent] [scrollbar-width:thin] lg:w-80 lg:flex-none lg:border-t-0 lg:border-l dark:border-grayscale-4"
              : "w-full min-w-0 rounded-[13px] border border-grayscale-3 small-shadow dark:border-grayscale-4",
          )}
        >
          <p aria-live="polite" className="sr-only">
            {[
              status,
              line.number && `Number ${line.number.split("").join(" ")}`,
            ]
              .filter(Boolean)
              .join(". ")}
          </p>
          <div className="grid gap-3 p-4">
            <div className="flex flex-wrap gap-1.5">
              <Metric
                icon={<PhoneIcon size={12} weight="bold" />}
                label={
                  line.lifted
                    ? "the receiver is lifted"
                    : "the receiver is on its rest"
                }
                value={line.lifted ? "Off the hook" : "On the hook"}
              />
              <Metric
                icon={<HashIcon size={12} weight="bold" />}
                label="digits dialled"
                value={line.number.length.toLocaleString("en-GB")}
              />
              <Metric
                icon={<PulseIcon size={12} weight="bold" />}
                label="pulses counted"
                value={line.pulses.toLocaleString("en-GB")}
              />
            </div>
            <div className="flex gap-1.5">
              <Button
                className="flex-auto whitespace-nowrap text-xs"
                onClick={toggleReceiver}
                type="button"
              >
                {line.lifted ? (
                  <PhoneDisconnectIcon
                    aria-hidden="true"
                    size={14}
                    weight="bold"
                  />
                ) : (
                  <PhoneIcon aria-hidden="true" size={14} weight="bold" />
                )}
                {line.lifted ? "Hang up" : "Lift receiver"}
              </Button>
              <button
                aria-pressed={holding}
                className={getButtonClassName({
                  variant: "secondary",
                  className:
                    "flex-auto touch-none select-none whitespace-nowrap text-xs aria-pressed:border-grayscale-6 aria-pressed:bg-grayscale-3 aria-pressed:text-grayscale-12 disabled:opacity-45 dark:aria-pressed:bg-grayscale-5",
                })}
                disabled={!line.lifted}
                onBlur={() => pressCradle(false)}
                onContextMenu={(event) => event.preventDefault()}
                onKeyDown={(event) => {
                  if (
                    (event.key === " " || event.key === "Enter") &&
                    !event.repeat
                  ) {
                    event.preventDefault();
                    pressCradle(true);
                  }
                }}
                onKeyUp={(event) => {
                  if (event.key === " " || event.key === "Enter")
                    pressCradle(false);
                }}
                onPointerCancel={() => pressCradle(false)}
                onPointerDown={() => pressCradle(true)}
                onPointerLeave={() => pressCradle(false)}
                onPointerUp={() => pressCradle(false)}
                title="Tap quickly to dial; hold to hang up"
                type="button"
              >
                <HandTapIcon aria-hidden="true" size={14} weight="bold" />
                Tap the cradle
              </button>
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
              Pull a figure round to the stop and let go, or type digits. Let go
              early and it sends fewer pulses: the exchange only counts what
              comes back. There's no taking a digit back, so hang up and start
              again.
            </p>
          </div>

          <Section title="Line">
            <div className="grid gap-1.5">
              <LineTrace exchange={exchangeRef} />
              <p className="text-grayscale-10 text-xs tabular-nums">
                {settings.speed} pulses a second · {breakMs} ms broken, {makeMs}{" "}
                ms made
              </p>
            </div>
            <p className="text-pretty text-grayscale-10 text-xs leading-5">
              Tap the cradle quickly and each tap is a pulse too, which is how
              people dialled on telephones with a locked dial.
            </p>
          </Section>

          <Section title="Dial">
            <Range
              format={(v) => `${v} a second`}
              label="Governor"
              max={13}
              min={7}
              onChange={set("speed")}
              value={settings.speed}
            />
            <Range
              format={(v) => `${v}% broken`}
              label="Break"
              max={80}
              min={50}
              onChange={set("ratio")}
              value={settings.ratio}
            />
            <Toggle
              checked={settings.sound}
              label="Sound"
              onChange={set("sound")}
            />
            <Range
              disabled={!settings.sound}
              format={(v) => `${v}%`}
              label="Volume"
              max={100}
              min={0}
              onChange={set("volume")}
              step={5}
              value={settings.volume}
            />
          </Section>

          <Section title="Telephone">
            <Radio.Group
              aria-label="Colour"
              className="grid grid-cols-2 gap-1"
              onValueChange={(next) => set("body")(next as Settings["body"])}
              value={settings.body}
            >
              {COLOURS.map((colour) => (
                <Radio.Root
                  className="flex items-center justify-center gap-1.5 py-1"
                  key={colour.value}
                  value={colour.value}
                >
                  <span
                    aria-hidden="true"
                    className="size-2.5 rounded-full shadow-[0_0_0_1px_var(--gray-6)]"
                    style={{ background: colour.swatch }}
                  />
                  {colour.label}
                </Radio.Root>
              ))}
            </Radio.Group>
            <Choice
              label="Finger wheel"
              onChange={set("finish")}
              options={FINISHES}
              value={settings.finish}
            />
          </Section>

          <Section title="Directory">
            <dl className="grid gap-1.5 text-xs">
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-grayscale-11">Speaking clock</dt>
                <dd className="text-grayscale-12 tabular-nums">123</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-grayscale-11">This telephone</dt>
                <dd className="text-grayscale-12 tabular-nums">
                  {THIS_NUMBER}
                </dd>
              </div>
            </dl>
            <p className="text-pretty text-grayscale-10 text-xs leading-5">
              Numbers beginning 01632 960 are kept for films and plays, so this
              one rings nowhere. Anything else rings, or is engaged.
            </p>
          </Section>
        </aside>
      </div>
    </div>
  );
}
