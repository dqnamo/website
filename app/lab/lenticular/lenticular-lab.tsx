"use client";

import { Slider } from "@base-ui/react/slider";
import {
  AngleIcon,
  ArrowsInSimpleIcon,
  ArrowsOutSimpleIcon,
  BroomIcon,
  DropIcon,
  GaugeIcon,
  ImagesIcon,
  MagnifyingGlassIcon,
  WavesIcon,
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
import { CARDS, type CardId, cardDef } from "@/lib/lenticular/cards";
import {
  createLenticular,
  DEFAULT_SETTINGS,
  type Lenticular,
  type LenticularSettings,
  type LenticularStats,
  type LensView,
  type Lpi,
} from "@/lib/lenticular/engine";
import { DESIGN_DISTANCE, LENSES } from "@/lib/lenticular/lens";
import { type DiagramState, drawDiagram } from "./lens-diagram";

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

const CARD_NOTES: Record<CardId, string> = {
  eye: "Eleven pictures. Turn it and the eye looks to whichever side you're on; turn it on past the end of the lenses' view and it winks.",
  postcard:
    "Two pictures, the same bay by day and by night. Square on you see the day; turn it either way and night falls.",
  depth:
    "Twelve pictures of a tunnel, each drawn from a little further along. Turned, the near things slide against the far ones, and with both eyes open each sees a different picture, so it has depth.",
  words:
    "Two pictures of your own words. Square on you see the first; turn it and the second takes over.",
};

const LPI_NOTES: Record<Lpi, string> = {
  40: "Coarse lenses, as on posters seen across a room: you can see the ridges, and each picture is only 233 lenses across.",
  75: "Postcard lenses, a third of a millimetre apart: too fine to see at arm's length, but feel for them with a fingernail.",
  100: "Fine lenses for small cards held close: sharper pictures, but a thinner sheet makes any error in the print show more.",
};

const tiltText = (yaw: number, pitch: number) => {
  const y = Math.round(yaw);
  const p = Math.round(pitch);
  if (!y && !p) return "Square on";
  const parts = [];
  if (y) parts.push(`${Math.abs(y)}° ${y > 0 ? "right" : "left"}`);
  if (p) parts.push(`${Math.abs(p)}° ${p > 0 ? "down" : "up"}`);
  return parts.join(", ");
};

type OrientationEventWithPermission = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<"granted" | "denied">;
};

export default function LenticularLab() {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const diagramRef = useRef<HTMLCanvasElement>(null);
  const loupeRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<Lenticular | null>(null);
  const [settings, setSettings] =
    useState<LenticularSettings>(DEFAULT_SETTINGS);
  const [stats, setStats] = useState<LenticularStats>({
    yaw: 0,
    pitch: 0,
    frame: 0,
    frames: cardDef(DEFAULT_SETTINGS.card).frames,
    drops: 0,
    fps: null,
  });
  const [note, setNote] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const [holding, setHolding] = useState(false);
  const [loupeOn, setLoupeOn] = useState(false);
  const [waterOn, setWaterOn] = useState(false);
  const [phoneTilt, setPhoneTilt] = useState(false);
  const [canPhoneTilt, setCanPhoneTilt] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set =
    <K extends keyof LenticularSettings>(key: K) =>
    (value: LenticularSettings[K]) =>
      setSettings((current) => ({ ...current, [key]: value }));

  // The cross-section is drawn straight from the engine's view, without going through React.
  const diagramState = useRef<DiagramState | null>(null);
  const lastView = useRef<LensView>({ angle: 0, slice: Number.NaN });
  const redrawDiagram = useCallback(() => {
    const canvas = diagramRef.current;
    const state = diagramState.current;
    if (!canvas || !state) return;
    drawDiagram(canvas, state, lastView.current.angle, lastView.current.slice);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let card: Lenticular;
    try {
      card = createLenticular(canvas, {
        onStats: setStats,
        onNote: setNote,
        onView: (view) => {
          lastView.current = view;
          redrawDiagram();
        },
      });
    } catch (err) {
      console.error(err);
      setError("This browser couldn't start WebGL2 for the card.");
      return;
    }
    cardRef.current = card;
    // A rock to and fro to say hello, unless motion is unwelcome.
    const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const hello = reduceMotion
      ? undefined
      : setTimeout(() => card.wiggle(), 700);
    return () => {
      clearTimeout(hello);
      cardRef.current = null;
      card.dispose();
    };
  }, [redrawDiagram]);

  useEffect(() => {
    cardRef.current?.setSettings(settings);
    const def = cardDef(settings.card);
    diagramState.current = {
      lens: LENSES[settings.lpi],
      frames: def.frames,
      phase: def.phase,
      swatches: def.swatches,
      bare: settings.bare,
    };
    redrawDiagram();
  }, [settings, redrawDiagram]);

  // The light follows the site's theme: a softbox by day, a lamp in the evening.
  useEffect(() => {
    const root = document.documentElement;
    const follow = () => {
      cardRef.current?.setNight(root.classList.contains("dark"));
      redrawDiagram();
    };
    follow();
    const theme = new MutationObserver(follow);
    theme.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => theme.disconnect();
  }, [redrawDiagram]);

  // A note on the stage for a few seconds, about what just happened.
  useEffect(() => {
    if (!note) return;
    const timer = setTimeout(() => setNote(null), 9000);
    return () => clearTimeout(timer);
  }, [note]);

  useEffect(() => {
    setCanPhoneTilt(
      typeof DeviceOrientationEvent !== "undefined" &&
        matchMedia("(pointer: coarse)").matches,
    );
  }, []);

  // The phone's own tilt, from where it was when this was switched on.
  useEffect(() => {
    if (!phoneTilt) return;
    let zero: { beta: number; gamma: number } | null = null;
    const onTilt = (event: DeviceOrientationEvent) => {
      if (event.beta === null || event.gamma === null) return;
      if (!zero) zero = { beta: event.beta, gamma: event.gamma };
      cardRef.current?.tilt(event.gamma - zero.gamma, event.beta - zero.beta);
    };
    window.addEventListener("deviceorientation", onTilt);
    return () => window.removeEventListener("deviceorientation", onTilt);
  }, [phoneTilt]);

  const togglePhoneTilt = async (on: boolean) => {
    if (!on) {
      setPhoneTilt(false);
      return;
    }
    const Orientation =
      DeviceOrientationEvent as OrientationEventWithPermission;
    try {
      if (Orientation.requestPermission) {
        const answer = await Orientation.requestPermission();
        if (answer !== "granted") {
          setNote(
            "Without access to the phone's motion, drag the card instead.",
          );
          return;
        }
      }
      setPhoneTilt(true);
      setTouched(true);
    } catch {
      setNote(
        "This browser won't share the phone's motion; drag the card instead.",
      );
    }
  };

  const local = (event: { clientX: number; clientY: number }) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    return rect
      ? { x: event.clientX - rect.left, y: event.clientY - rect.top }
      : { x: 0, y: 0 };
  };

  // The loupe sits over the pointer; on a touch screen, above the finger so it isn't hidden.
  const placeLoupe = useCallback(
    (p: { x: number; y: number } | null, touch = false) => {
      const at = p && touch ? { x: p.x, y: p.y - 110 } : p;
      cardRef.current?.setLoupe(at);
      const ring = loupeRef.current;
      if (!ring) return;
      if (at) {
        ring.style.transform = `translate(${at.x}px, ${at.y}px)`;
        ring.style.opacity = "1";
      } else {
        ring.style.opacity = "0";
      }
    },
    [],
  );

  useEffect(() => {
    if (!loupeOn) {
      placeLoupe(null);
      return;
    }
    const canvas = canvasRef.current;
    if (canvas)
      placeLoupe({ x: canvas.clientWidth / 2, y: canvas.clientHeight / 2 });
  }, [loupeOn, placeLoupe]);

  const pressed = useRef(new Map<number, string>());

  const setCursor = (cursor: string) => {
    if (stageRef.current) stageRef.current.style.cursor = cursor;
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const card = cardRef.current;
    if (!card || pressed.current.size) return;
    const p = local(event);
    // On a touch screen with the loupe out, a finger moves the loupe rather than the card.
    const loupeOnly = loupeOn && event.pointerType !== "mouse";
    if (!loupeOnly && !card.pointerDown(event.pointerId, p)) return;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // A pointer the browser no longer tracks; moves still arrive while it's over the stage.
    }
    pressed.current.set(event.pointerId, loupeOnly ? "loupe" : "card");
    if (loupeOn) placeLoupe(p, event.pointerType !== "mouse");
    if (!loupeOnly) {
      setHolding(true);
      setCursor("grabbing");
    }
    setTouched(true);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const card = cardRef.current;
    if (!card) return;
    const p = local(event);
    if (
      loupeOn &&
      (event.pointerType === "mouse" || pressed.current.has(event.pointerId))
    ) {
      placeLoupe(p, event.pointerType !== "mouse");
    }
    if (pressed.current.get(event.pointerId) === "card") {
      card.pointerMove(event.pointerId, p);
    }
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const what = pressed.current.get(event.pointerId);
    if (!what) return;
    pressed.current.delete(event.pointerId);
    if (what === "card") {
      const tap = cardRef.current?.pointerUp(event.pointerId);
      if (tap && waterOn) cardRef.current?.dropAt(tap);
    }
    setHolding(false);
    setCursor(waterOn ? "crosshair" : "grab");
  };

  // From the keyboard: the arrows turn and tip the card, Space rocks it, 0 squares it up and W
  // wipes it.
  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const card = cardRef.current;
    if (!card || event.metaKey || event.ctrlKey || event.altKey) return;
    const arrows: Record<string, [number, number]> = {
      ArrowLeft: [-4, 0],
      ArrowRight: [4, 0],
      ArrowUp: [0, -4],
      ArrowDown: [0, 4],
    };
    if (arrows[event.key]) {
      event.preventDefault();
      card.nudge(...arrows[event.key]);
      setTouched(true);
    } else if (event.key === " ") {
      event.preventDefault();
      if (!event.repeat) card.wiggle();
      setTouched(true);
    } else if (event.key === "0") {
      card.level();
    } else if (event.key === "w" || event.key === "W") {
      card.wipe();
    }
  };

  // Full screen is the same card in a bigger frame. The page under it collapses meanwhile, so
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

  const def = cardDef(settings.card);
  const cm = Math.round(settings.distance / 10);
  const designCm = DESIGN_DISTANCE / 10;

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
            aria-label="Lenticular card. Drag to tilt it and watch the picture change; arrow keys tilt it too, and Space rocks it."
            className={cn(
              "relative cursor-grab touch-none select-none overflow-hidden bg-grayscale-4 outline-none [view-transition-name:lab-pane] focus-visible:ring-2 focus-visible:ring-grayscale-7 dark:bg-black",
              waterOn && "cursor-crosshair",
              fullscreen
                ? "h-[55dvh] shrink-0 lg:h-auto lg:min-w-0 lg:flex-1"
                : "h-[34rem] w-full min-w-0 rounded-[13px] border border-grayscale-3 small-shadow lg:sticky lg:top-6 lg:h-[calc(100dvh-3rem)] lg:max-h-full dark:border-grayscale-4",
            )}
            onContextMenu={(event) => event.preventDefault()}
            onKeyDown={onKeyDown}
            onLostPointerCapture={onPointerUp}
            onPointerCancel={onPointerUp}
            onPointerDown={onPointerDown}
            onPointerLeave={(event) => {
              if (
                loupeOn &&
                event.pointerType === "mouse" &&
                !pressed.current.size
              )
                placeLoupe(null);
            }}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            ref={stageRef}
            role="application"
            // biome-ignore lint/a11y/noNoninteractiveTabindex: the stage is played with a pointer, or with the arrow keys and Space.
            tabIndex={0}
          >
            <canvas className="absolute inset-0 size-full" ref={canvasRef} />

            {/* The loupe's rim; what's inside it is drawn magnified by the engine. */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute top-0 left-0 opacity-0 transition-opacity duration-150"
              ref={loupeRef}
            >
              <div className="absolute -top-[98px] -left-[98px] size-[196px] rounded-full border-[6px] border-[#1d1f24] shadow-[0_10px_30px_rgba(0,0,0,0.35),inset_0_0_0_1px_rgba(255,255,255,0.18)]" />
            </div>

            <p
              aria-live="polite"
              className={cn(
                "pointer-events-none absolute right-3 bottom-3 left-3 mx-auto w-fit max-w-sm rounded-2xl bg-black/55 px-3 py-1.5 text-center text-white/90 text-xs backdrop-blur-sm transition-opacity duration-500",
                ((touched && !note) || error || holding) && "opacity-0",
              )}
            >
              {note ?? "Drag to tilt the card and watch the picture change"}
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
          aria-label="Lenticular controls"
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
                icon={<AngleIcon size={12} weight="bold" />}
                label="how far the card is tilted"
                value={tiltText(stats.yaw, stats.pitch)}
              />
              <Metric
                icon={<ImagesIcon size={12} weight="bold" />}
                label="picture seen at the middle of the card"
                value={
                  settings.bare || stats.frame < 0
                    ? "All at once"
                    : `${stats.frame + 1} of ${stats.frames}`
                }
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
                  cardRef.current?.wiggle();
                  setTouched(true);
                }}
                type="button"
              >
                <WavesIcon aria-hidden="true" size={13} weight="bold" />
                Rock it
              </Button>
              <button
                aria-label="Loupe"
                aria-pressed={loupeOn}
                className={getButtonClassName({
                  variant: "secondary",
                  className:
                    "w-7 shrink-0 px-0 aria-pressed:border-grayscale-6 aria-pressed:bg-grayscale-3 aria-pressed:text-grayscale-12 dark:aria-pressed:bg-grayscale-5",
                })}
                onClick={() => {
                  setLoupeOn((on) => !on);
                  setTouched(true);
                }}
                title="Loupe: look at the lenses close up"
                type="button"
              >
                <MagnifyingGlassIcon
                  aria-hidden="true"
                  size={14}
                  weight="bold"
                />
              </button>
              <button
                aria-label="Water"
                aria-pressed={waterOn}
                className={getButtonClassName({
                  variant: "secondary",
                  className:
                    "w-7 shrink-0 px-0 aria-pressed:border-grayscale-6 aria-pressed:bg-grayscale-3 aria-pressed:text-grayscale-12 dark:aria-pressed:bg-grayscale-5",
                })}
                onClick={() => {
                  const next = !waterOn;
                  setWaterOn(next);
                  if (next)
                    setNote("Tap the card to put a drop of water on it.");
                  setCursor(next ? "crosshair" : "grab");
                  setTouched(true);
                }}
                title="Water: tap the card to put a drop on it"
                type="button"
              >
                <DropIcon aria-hidden="true" size={14} weight="bold" />
              </button>
              <Button
                aria-label="Wipe the card"
                className="w-7 shrink-0 px-0"
                onClick={() => cardRef.current?.wipe()}
                title="Wipe the card (W)"
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
            {canPhoneTilt && (
              <Toggle
                checked={phoneTilt}
                label="Tilt with the phone"
                onChange={togglePhoneTilt}
              />
            )}
          </div>

          <Section title="Card">
            <Choice
              columns={4}
              label="Card"
              onChange={(value) => {
                set("card")(value);
                setTouched(true);
              }}
              options={CARDS.map((card) => ({
                value: card.value,
                label: card.label,
              }))}
              value={settings.card}
            />
            {settings.card === "words" && (
              <div className="grid grid-cols-2 gap-1.5">
                {(["Square on", "Turned"] as const).map((label, i) => (
                  <input
                    aria-label={`${label} word`}
                    className="h-7 min-w-0 rounded-md border border-grayscale-4 bg-grayscale-1 px-2 text-grayscale-12 text-xs outline-none placeholder:text-grayscale-9 focus:border-grayscale-7 dark:border-grayscale-5 dark:bg-grayscale-2"
                    key={label}
                    maxLength={14}
                    onChange={(event) => {
                      const next: [string, string] = [...settings.words];
                      next[i] = event.target.value;
                      set("words")(next);
                    }}
                    placeholder={label}
                    value={settings.words[i]}
                  />
                ))}
              </div>
            )}
            <p className="text-grayscale-10 text-xs leading-4">
              {CARD_NOTES[settings.card]}
            </p>
          </Section>

          <Section title="Lenses">
            <canvas
              aria-label={
                settings.bare || stats.frame < 0
                  ? "Cross-section of the print with the lenses lifted off: lines of sight fall on every picture's slices at once"
                  : `Cross-section of the lenses: lines of sight bent by a lens on to picture ${stats.frame + 1} of ${def.frames}`
              }
              className="h-[150px] w-full rounded-md bg-grayscale-2 dark:bg-grayscale-3"
              ref={diagramRef}
              role="img"
            />
            <Choice
              columns={3}
              label="Lens pitch"
              onChange={(value) => set("lpi")(Number(value) as Lpi)}
              options={[
                { value: "40", label: "40 an inch" },
                { value: "75", label: "75 an inch" },
                { value: "100", label: "100 an inch" },
              ]}
              value={String(settings.lpi)}
            />
            <p className="text-grayscale-10 text-xs leading-4">
              {LPI_NOTES[settings.lpi]}
            </p>
            <Choice
              columns={2}
              label="Which way the lenses run"
              onChange={(value) => set("across")(value === "across")}
              options={[
                { value: "upright", label: "Up and down" },
                { value: "across", label: "Across" },
              ]}
              value={settings.across ? "across" : "upright"}
            />
            <Toggle
              checked={settings.bare}
              label="Peel the lenses off"
              onChange={set("bare")}
            />
            <p className="text-grayscale-10 text-xs leading-4">
              {settings.bare
                ? "Without the lenses every picture is there at once, sliced into strips finer than you can see, so they blur together. Look with the loupe."
                : settings.across
                  ? "Running across, both eyes see the same picture, so flips are clean; tip the card towards you to change it."
                  : "Running up and down, each eye looks through the lenses from a slightly different angle, which is what lets a card show depth."}
            </p>
          </Section>

          <Section title="Print">
            <Range
              format={(v) =>
                v === designCm ? `${v} cm, as made for` : `${v} cm`
              }
              label="Held at"
              max={100}
              min={20}
              onChange={(v) => set("distance")(v * 10)}
              value={cm}
            />
            <Range
              format={(v) => (v ? `${v.toFixed(2)}°` : "Square")}
              label="Print laid off square by"
              max={0.3}
              min={0}
              onChange={set("skew")}
              step={0.01}
              value={settings.skew}
            />
            <p className="text-grayscale-10 text-xs leading-4">
              {settings.skew > 0
                ? "A fraction of a degree is enough: the strips drift off their lenses up the card, so it changes in diagonal bands."
                : cm < 30 || cm > 64
                  ? "The strips are spaced for a card held at 40 cm. Much nearer or further, the edges and the middle no longer see the same picture, and it changes in bands."
                  : "The strips are spaced a hair wider than the lenses, about 0.07%, so that from 40 cm every lens lands on the same picture at once."}
            </p>
          </Section>

          <Section title="Water">
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="text-grayscale-11">
                {stats.drops
                  ? `${stats.drops} ${stats.drops === 1 ? "drop" : "drops"} on the card`
                  : "The card is dry"}
              </span>
              <Button
                className="text-xs"
                onClick={() => {
                  setWaterOn(true);
                  setCursor("crosshair");
                  setNote("Tap the card to put a drop of water on it.");
                }}
                type="button"
                variant="secondary"
              >
                <DropIcon aria-hidden="true" size={13} weight="bold" />
                Add water
              </Button>
            </div>
            <p className="text-grayscale-10 text-xs leading-4">
              Water fills the grooves and bends light nearly as much as the
              plastic, so under a drop the lenses stop working. Drops spread
              along the grooves, and dry slowly.
            </p>
          </Section>
        </aside>
      </div>
    </div>
  );
}
