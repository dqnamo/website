"use client";

import {
  ArrowLineUpIcon,
  ArrowsInSimpleIcon,
  ArrowsOutSimpleIcon,
  CameraIcon,
  GaugeIcon,
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
  type ChamberSettings,
  type ChamberStats,
  type CloudChamber,
  createCloudChamber,
  DEFAULT_SETTINGS,
  type Hover,
  type Magnet,
  SOURCES,
  type SourceId,
  TORCH_STEP,
} from "@/lib/cloud-chamber/engine";

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

function Choice<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
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
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-3">
      <label
        className="flex min-w-0 cursor-pointer items-baseline gap-1.5 text-grayscale-11 text-xs"
        htmlFor={id}
      >
        <span className="truncate">{label}</span>
        {hint && (
          <span className="truncate text-grayscale-9 text-[11px]">{hint}</span>
        )}
      </label>
      <Switch.Composed
        checked={checked}
        id={id}
        onCheckedChange={(next) => onChange(next)}
      />
    </div>
  );
}

const MAGNET_OPTIONS: { value: Magnet; label: string }[] = [
  { value: "off", label: "None" },
  { value: "north", label: "North up" },
  { value: "south", label: "South up" },
];

const SPEED_OPTIONS = [
  { value: 1, label: "1×" },
  { value: 0.5, label: "½×" },
  { value: 0.25, label: "¼×" },
];

// What to look for, from the thickest tracks to the faintest.
const GUIDE: { mark: string; title: string; text: string }[] = [
  {
    mark: "α",
    title: "Thick, straight, a few centimetres",
    text: "Alpha particles. One isotope gives one length; they thicken at the end.",
  },
  {
    mark: "V",
    title: "Two alphas from one point",
    text: "Thoron from the mantle, then its daughter a fifth of a second later.",
  },
  {
    mark: "μ",
    title: "Thin and dead straight",
    text: "Muons from cosmic rays, often clean across the chamber.",
  },
  {
    mark: "β",
    title: "Faint and wandering",
    text: "Electrons, knocked about by every atom. A magnet coils them up.",
  },
];

export default function CloudChamberLab() {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const chamberRef = useRef<CloudChamber | null>(null);
  const [settings, setSettings] = useState<ChamberSettings>(DEFAULT_SETTINGS);
  const [stats, setStats] = useState<ChamberStats>({
    alpha: 0,
    beta: 0,
    muon: 0,
    vees: 0,
    droplets: 0,
    exposure: 0,
    fps: null,
  });
  const [hover, setHover] = useState<Hover>(null);
  const [note, setNote] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set =
    <K extends keyof ChamberSettings>(key: K) =>
    (value: ChamberSettings[K]) =>
      setSettings((current) => ({ ...current, [key]: value }));

  useEffect(() => {
    const canvas = canvasRef.current;
    const overlay = overlayRef.current;
    if (!canvas || !overlay) return;
    let chamber: CloudChamber;
    try {
      chamber = createCloudChamber(canvas, overlay, {
        onStats: setStats,
        onNote: setNote,
        onHover: setHover,
      });
    } catch (err) {
      console.error(err);
      setError("This browser couldn't start WebGL2 for the cloud chamber.");
      return;
    }
    chamberRef.current = chamber;
    // Tracks flash up and drift; slower is gentler when motion is unwelcome.
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setSettings((current) => ({ ...current, speed: 0.5 }));
    }
    return () => {
      chamberRef.current = null;
      chamber.dispose();
    };
  }, []);

  useEffect(() => {
    chamberRef.current?.setSettings(settings);
  }, [settings]);

  // The bench follows the site's theme: a lit room by day, a dark one at night, where the tracks
  // show best.
  useEffect(() => {
    const root = document.documentElement;
    const follow = () =>
      chamberRef.current?.setDay(!root.classList.contains("dark"));
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
    const chamber = chamberRef.current;
    if (!chamber || pressed.current !== null) return;
    const cursor = chamber.pointerDown(event.pointerId, local(event));
    if (cursor === "default") {
      // Nothing to pick up: a touch here asks what the track under it is.
      chamber.hover(local(event));
      return;
    }
    setTouched(true);
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // A pointer the browser no longer tracks; moves still arrive while it's over the stage.
    }
    pressed.current = event.pointerId;
    setCursor(cursor);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const chamber = chamberRef.current;
    if (!chamber) return;
    if (pressed.current === event.pointerId) {
      chamber.pointerMove(event.pointerId, local(event));
      return;
    }
    const cursor = chamber.hover(local(event));
    if (event.pointerType === "mouse") setCursor(cursor);
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (pressed.current !== event.pointerId) return;
    pressed.current = null;
    const chamber = chamberRef.current;
    chamber?.pointerUp(event.pointerId);
    setCursor(chamber?.hover(local(event)) ?? "default");
  };

  const liftLid = () => {
    chamberRef.current?.liftLid();
    setTouched(true);
  };

  // From the keyboard: the arrows walk the torch round the chamber, L lifts the lid.
  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const chamber = chamberRef.current;
    if (!chamber) return;
    if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      chamber.turnTorch(-TORCH_STEP);
    } else if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      chamber.turnTorch(TORCH_STEP);
    } else if (event.key === "l" || event.key === "L") {
      liftLid();
    } else {
      return;
    }
    event.preventDefault();
  };

  const savePhoto = () => {
    const url = chamberRef.current?.snapshot();
    if (!url) return;
    const link = document.createElement("a");
    link.href = url;
    link.download = settings.exposure
      ? `cloud-chamber-${Math.round(stats.exposure)}s.png`
      : "cloud-chamber.png";
    link.click();
  };

  const toggleSource = (id: SourceId, on: boolean) =>
    setSettings((current) => ({
      ...current,
      sources: on
        ? [...current.sources.filter((s) => s !== id), id]
        : current.sources.filter((s) => s !== id),
    }));

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
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") showFullscreen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showFullscreen]);

  // The hover card sits beside the pointer, on whichever side has room.
  const stageWidth = stageRef.current?.clientWidth ?? 0;
  const flip = hover ? hover.x > stageWidth - 270 : false;

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
            aria-label="A cloud chamber seen from above. Drag the torch round the glass to light it from another side, drag the things on the floor to move them, and drag the magnet's centre when there is one. Point at a track to see what made it. The arrow keys turn the torch and L lifts the lid."
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
              if (pressed.current === null) {
                setCursor("default");
                chamberRef.current?.leave();
              }
            }}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            ref={stageRef}
            role="application"
            // biome-ignore lint/a11y/noNoninteractiveTabindex: the stage is played with a pointer, or with the arrow keys and L.
            tabIndex={0}
          >
            <canvas className="absolute inset-0 size-full" ref={canvasRef} />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0"
            >
              <canvas className="size-full" ref={overlayRef} />
            </div>

            {hover && (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute w-64 rounded-lg bg-black/70 px-2.5 py-1.5 text-white backdrop-blur-sm"
                style={{
                  left: flip ? hover.x - 270 : hover.x + 16,
                  top: Math.max(8, hover.y - 18),
                }}
              >
                <p className="font-medium text-xs">{hover.name}</p>
                <p className="mt-0.5 text-[11px] text-white/75 leading-4">
                  {hover.detail}
                </p>
              </div>
            )}

            <p
              aria-live="polite"
              className={cn(
                "pointer-events-none absolute right-3 bottom-3 left-3 mx-auto w-fit max-w-sm rounded-2xl bg-black/55 px-3 py-1.5 text-center text-white/90 text-xs backdrop-blur-sm transition-opacity duration-500",
                ((touched && !note) || error) && "opacity-0",
              )}
            >
              {note ?? "Point at a track to see what made it"}
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
          aria-label="Cloud chamber controls"
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
                icon="α"
                label="alpha tracks seen"
                value={stats.alpha.toLocaleString("en-GB")}
              />
              <Metric
                icon="β"
                label="electron tracks seen"
                value={stats.beta.toLocaleString("en-GB")}
              />
              <Metric
                icon="μ"
                label="muon tracks seen"
                value={stats.muon.toLocaleString("en-GB")}
              />
              <Metric
                icon="V"
                label="thoron V's seen"
                value={stats.vees.toLocaleString("en-GB")}
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
                onClick={liftLid}
                title="Lift the lid (L)"
                type="button"
              >
                <ArrowLineUpIcon aria-hidden="true" size={13} weight="bold" />
                Lift the lid
              </Button>
              <Button
                className="flex-auto whitespace-nowrap text-xs"
                onClick={savePhoto}
                type="button"
                variant="secondary"
              >
                <CameraIcon aria-hidden="true" size={13} weight="bold" />
                Save photo
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

          <Section title="On the floor">
            {SOURCES.map((s) => (
              <Toggle
                checked={settings.sources.includes(s.id)}
                hint={s.note}
                key={s.id}
                label={s.label}
                onChange={(on) => toggleSource(s.id, on)}
              />
            ))}
          </Section>

          <Section title="Magnet under the plate">
            <Choice
              label="Magnet"
              onChange={set("magnet")}
              options={MAGNET_OPTIONS}
              value={settings.magnet}
            />
            <p className="text-grayscale-10 text-xs leading-5">
              {settings.magnet === "off"
                ? "Without a field every track is as straight or as wandering as the air makes it."
                : "Over the magnet, electrons coil into spirals: turning one way with north up and the other with south up. Alphas and muons barely bend. Drag its centre to move it."}
            </p>
          </Section>

          <Section title="Light and camera">
            <Toggle
              checked={settings.torch}
              label="Torch"
              onChange={set("torch")}
            />
            <Toggle
              checked={settings.labels}
              label="Name the tracks"
              onChange={set("labels")}
            />
            <Toggle
              checked={settings.exposure}
              hint={
                settings.exposure
                  ? `${Math.round(stats.exposure)} s`
                  : undefined
              }
              label="Long exposure"
              onChange={set("exposure")}
            />
            {settings.exposure && (
              <button
                className="w-fit text-grayscale-10 text-xs underline decoration-grayscale-6 underline-offset-2 transition-colors hover:text-grayscale-12"
                onClick={() => chamberRef.current?.restartExposure()}
                type="button"
              >
                Open the shutter again
              </button>
            )}
            <Choice
              label="Speed"
              onChange={set("speed")}
              options={SPEED_OPTIONS}
              value={settings.speed}
            />
          </Section>

          <Section title="What you're seeing">
            <ul className="grid gap-2.5">
              {GUIDE.map((entry) => (
                <li className="flex gap-2.5" key={entry.mark}>
                  <span
                    aria-hidden="true"
                    className="mt-px flex size-5 shrink-0 items-center justify-center rounded-md bg-grayscale-2 font-medium text-grayscale-11 text-xs dark:bg-grayscale-3"
                  >
                    {entry.mark}
                  </span>
                  <span className="text-xs leading-5">
                    <span className="text-grayscale-12">{entry.title}.</span>{" "}
                    <span className="text-grayscale-10">{entry.text}</span>
                  </span>
                </li>
              ))}
            </ul>
          </Section>
        </aside>
      </div>
    </div>
  );
}
