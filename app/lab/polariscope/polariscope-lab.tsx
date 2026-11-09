"use client";

import { Slider } from "@base-ui/react/slider";
import {
  AngleIcon,
  ArrowsClockwiseIcon,
  ArrowsInSimpleIcon,
  ArrowsOutSimpleIcon,
  ArrowUUpLeftIcon,
  BroomIcon,
  RainbowIcon,
  StackIcon,
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
import { Radio } from "@/components/public/Radio";
import { Switch } from "@/components/public/Switch";
import { cn } from "@/helpers/classname-helper";
import {
  createPolariscope,
  type Hit,
  type Polariscope,
  type PolariscopeStats,
} from "@/lib/polariscope/engine";
import { createSounds } from "@/lib/polariscope/sound";
import { ARTWORKS, type ArtworkId, DEFAULTS, type Settings } from "./presets";

const CURSORS: Record<Hit, string> = {
  tab: "grab",
  ring: "move",
  plate: "crosshair",
  disc: "pointer",
  none: "default",
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

function Choice<T extends string>({
  label,
  value,
  options,
  columns,
  onChange,
  onReselect,
}: {
  label: string;
  value: T | null;
  options: { value: T; label: string }[];
  columns: 2 | 3;
  onChange: (value: T) => void;
  // Picking the option that's already chosen doesn't change anything, so it's told apart.
  onReselect?: (value: T) => void;
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
          onClick={
            onReselect && option.value === value
              ? () => onReselect(option.value)
              : undefined
          }
          value={option.value}
        >
          {option.label}
        </Radio.Root>
      ))}
    </Radio.Group>
  );
}

// How the two filters sit to each other, from the angle between them.
function relation(degrees: number) {
  const offset = ((degrees % 180) + 180) % 180;
  if (Math.abs(offset - 90) < 0.5) return "crossed";
  if (offset < 0.5 || offset > 179.5) return "parallel";
  return `${Math.round(Math.min(offset, 180 - offset))}° apart`;
}

export default function PolariscopeLab() {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scopeRef = useRef<Polariscope | null>(null);
  const soundRef = useRef<ReturnType<typeof createSounds> | null>(null);
  const [settings, setSettings] = useState(DEFAULTS);
  const [artwork, setArtwork] = useState<ArtworkId | null>("sunburst");
  const [stats, setStats] = useState<PolariscopeStats>({
    strips: 0,
    full: false,
    analyser: 90,
    polariser: 0,
    load: 0,
    fringes: 0,
    cracked: false,
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
    const sound = createSounds();
    let scope: Polariscope;
    try {
      scope = createPolariscope(canvas, {
        onStats: setStats,
        sounds: sound.sounds,
      });
    } catch (err) {
      console.error(err);
      setError("This browser couldn't start WebGL for the light box.");
      return;
    }
    scopeRef.current = scope;
    soundRef.current = sound;
    const { halfWidth, halfHeight } = scope.plate();
    scope.lay(ARTWORKS[0].layout(halfWidth, halfHeight), false);
    return () => {
      scopeRef.current = null;
      soundRef.current = null;
      scope.dispose();
      sound.dispose();
    };
  }, []);

  useEffect(() => {
    const { sound, ...rest } = settings;
    scopeRef.current?.setSettings(rest);
    soundRef.current?.setEnabled(sound);
  }, [settings]);

  const layArtwork = (id: ArtworkId) => {
    const scope = scopeRef.current;
    const next = ARTWORKS.find((entry) => entry.value === id);
    if (!scope || !next) return;
    const { halfWidth, halfHeight } = scope.plate();
    scope.lay(next.layout(halfWidth, halfHeight), true);
    setArtwork(id);
  };

  const local = (event: { clientX: number; clientY: number }) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    return rect
      ? { x: event.clientX - rect.left, y: event.clientY - rect.top }
      : { x: 0, y: 0 };
  };

  const pressed = useRef(new Set<number>());

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const scope = scopeRef.current;
    if (!scope) return;
    const hit = scope.pointerDown(
      event.pointerId,
      local(event),
      event.pointerType !== "mouse",
    );
    if (hit === "none") return;
    event.currentTarget.setPointerCapture(event.pointerId);
    pressed.current.add(event.pointerId);
    if (hit === "plate") setArtwork(null);
    if (hit === "tab") event.currentTarget.style.cursor = "grabbing";
    setTouched(true);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const scope = scopeRef.current;
    if (!scope) return;
    if (pressed.current.has(event.pointerId)) {
      scope.pointerMove(event.pointerId, local(event));
    } else if (event.pointerType === "mouse") {
      event.currentTarget.style.cursor = CURSORS[scope.hitTest(local(event))];
    }
  };

  const onPointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!pressed.current.delete(event.pointerId)) return;
    scopeRef.current?.pointerUp(event.pointerId, local(event));
    if (event.pointerType === "mouse" && scopeRef.current) {
      event.currentTarget.style.cursor =
        CURSORS[scopeRef.current.hitTest(local(event))];
    }
  };

  // Full screen is the same light box in a bigger frame. The page under it collapses meanwhile,
  // so its scroll position is put back on the way out. Where the browser can, the stage and its
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

  const tape = settings.specimen === "tape";
  const between = stats.analyser - stats.polariser;

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
        {/* Beside the panel, the light box fills the window and stays in view while the panel
            scrolls. Its cell takes the panel's height without counting the stage towards it,
            so on a very tall window the stage stops at the panel's height. */}
        <div
          className={
            fullscreen ? "contents" : "w-full min-w-0 lg:[contain:size]"
          }
        >
          {/* biome-ignore lint/a11y/noStaticElementInteractions: the light box is worked with a pointer; the panel's controls do the same things by keyboard. */}
          <div
            className={cn(
              "relative touch-none select-none overflow-hidden bg-grayscale-2 [view-transition-name:lab-pane]",
              fullscreen
                ? "h-[55dvh] shrink-0 lg:h-auto lg:min-w-0 lg:flex-1"
                : "h-[34rem] w-full min-w-0 rounded-[13px] border border-grayscale-3 small-shadow lg:sticky lg:top-6 lg:h-[calc(100dvh-3rem)] lg:max-h-full dark:border-grayscale-4",
            )}
            onContextMenu={(event) => event.preventDefault()}
            onLostPointerCapture={onPointerEnd}
            onPointerCancel={onPointerEnd}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerEnd}
            ref={stageRef}
          >
            <canvas
              aria-label="A light box under a polarising film, with clear tape on a glass plate or a plastic disc in a clamp, seen through a round polarising filter. Drag on the plate to lay tape, drag the filter's ring to move it and its tab to turn it."
              className="absolute inset-0 size-full"
              ref={canvasRef}
              role="img"
            />

            <p
              aria-hidden="true"
              className={cn(
                "pointer-events-none absolute right-3 bottom-3 left-3 mx-auto w-fit rounded-full bg-black/55 px-3 py-1 text-center text-white/90 text-xs backdrop-blur-sm transition-opacity duration-500",
                (touched || error) && "opacity-0",
              )}
            >
              {tape
                ? "Drag to lay tape · Turn the filter by its tab"
                : "Hold the disc to squeeze it · Turn the filter by its tab"}
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
          aria-label="Polariscope controls"
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
                label="between the two filters"
                value={relation(between)}
              />
              {tape ? (
                <Metric
                  icon={<StackIcon size={12} weight="bold" />}
                  label="strips of tape on the plate"
                  value={`${stats.strips} ${stats.strips === 1 ? "strip" : "strips"}`}
                />
              ) : (
                <Metric
                  icon={<RainbowIcon size={12} weight="bold" />}
                  label="fringe order at the centre of the disc"
                  value={
                    stats.cracked
                      ? "Split"
                      : `${stats.fringes.toFixed(1)} fringes`
                  }
                />
              )}
            </div>
            <div className="flex gap-1.5">
              <Button
                className="flex-auto whitespace-nowrap text-xs"
                onClick={() => {
                  setTouched(true);
                  scopeRef.current?.flip();
                }}
                title="Turn the filter a quarter turn, from crossed to parallel or back"
                type="button"
              >
                <ArrowsClockwiseIcon
                  aria-hidden="true"
                  size={14}
                  weight="bold"
                />
                Quarter turn
              </Button>
              {tape ? (
                <>
                  <Button
                    aria-label="Peel off the last strip"
                    className="w-7 shrink-0 px-0"
                    disabled={!stats.strips}
                    onClick={() => {
                      setArtwork(null);
                      scopeRef.current?.undo();
                    }}
                    title="Peel off the last strip"
                    type="button"
                    variant="secondary"
                  >
                    <ArrowUUpLeftIcon
                      aria-hidden="true"
                      size={14}
                      weight="bold"
                    />
                  </Button>
                  <Button
                    aria-label="Peel off every strip"
                    className="w-7 shrink-0 px-0"
                    disabled={!stats.strips}
                    onClick={() => {
                      setArtwork(null);
                      scopeRef.current?.peelAll();
                    }}
                    title="Peel off every strip"
                    type="button"
                    variant="secondary"
                  >
                    <BroomIcon aria-hidden="true" size={14} weight="bold" />
                  </Button>
                </>
              ) : (
                <Button
                  className="flex-auto whitespace-nowrap text-xs"
                  disabled={!stats.cracked}
                  onClick={() => scopeRef.current?.newDisc()}
                  title="Fit a new disc in the clamp"
                  type="button"
                  variant="secondary"
                >
                  New disc
                </Button>
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
              Outside the filter the light is polarised but looks plain grey.
              Through it, anything that twists the light shows its colours. Move
              the filter by its ring and turn it by its tab.
            </p>
          </div>

          <Section title="On the light box">
            <Choice
              columns={2}
              label="Specimen"
              onChange={set("specimen")}
              options={[
                { value: "tape", label: "Tape on glass" },
                { value: "disc", label: "Plastic disc" },
              ]}
              value={settings.specimen}
            />
          </Section>

          {tape ? (
            <Section title="Tape">
              <Choice
                columns={2}
                label="Tape"
                onChange={set("tape")}
                options={[
                  { value: "office", label: "Office tape" },
                  { value: "packing", label: "Packing tape" },
                ]}
                value={settings.tape}
              />
              <Choice
                columns={3}
                label="Layout"
                onChange={layArtwork}
                onReselect={layArtwork}
                options={ARTWORKS}
                value={artwork}
              />
              <p className="text-pretty text-grayscale-10 text-xs leading-5">
                {stats.full
                  ? "The plate is full. Tap a strip to peel it off."
                  : "Drag on the plate to lay a strip; tap one to peel it off. Layers laid the same way add up, and strips crossed square on cancel out."}
              </p>
            </Section>
          ) : (
            <Section title="Clamp">
              <Range
                disabled={stats.cracked}
                format={(v) => {
                  if (stats.cracked) return "Split";
                  if (v >= 82) return `${v}% · creaking`;
                  return v ? `${v}%` : "Loose";
                }}
                label="Tighten"
                max={100}
                min={0}
                onChange={(v) => scopeRef.current?.setLoad(v / 100)}
                value={Math.round(stats.load * 100)}
              />
              <p className="text-pretty text-grayscale-10 text-xs leading-5">
                {stats.cracked
                  ? "Squeezed across a diameter, the disc split down the middle, pulled apart by the stress across it."
                  : "Press and hold on the disc to squeeze it between finger and thumb. Each fringe is another wavelength of delay."}
              </p>
            </Section>
          )}

          <Section title="Filters">
            <Range
              format={(v) => `${v}°`}
              label="Filter"
              max={180}
              min={0}
              onChange={(v) => scopeRef.current?.setAnalyser(v)}
              value={stats.analyser}
            />
            <Range
              format={(v) => `${v}°`}
              label="Light box film"
              max={180}
              min={0}
              onChange={(v) => scopeRef.current?.setPolariser(v)}
              value={stats.polariser}
            />
            <Toggle
              checked={settings.locked}
              label="Turn together"
              onChange={set("locked")}
            />
            <Choice
              columns={3}
              label="Wave plate"
              onChange={set("plate")}
              options={[
                { value: "none", label: "No plate" },
                { value: "circular", label: "Quarter-wave" },
                { value: "tint", label: "Red tint" },
              ]}
              value={settings.plate}
            />
            <p className="text-pretty text-grayscale-10 text-xs leading-5">
              {settings.plate === "circular"
                ? "Quarter-wave plates make the light circular, so tape shows its colour at any angle and the disc's dark brushes vanish."
                : settings.plate === "tint"
                  ? "A first-order red plate adds its own delay: strips one way turn blue, strips the other way yellow."
                  : "Turned together, the filters sweep dark bands across anything lined up with them."}
            </p>
          </Section>

          <Section title="Sound">
            <Toggle
              checked={settings.sound}
              label="Tape, clicks and creaks"
              onChange={set("sound")}
            />
          </Section>
        </aside>
      </div>
    </div>
  );
}
