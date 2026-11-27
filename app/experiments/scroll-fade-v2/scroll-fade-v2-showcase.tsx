"use client";

import { CheckIcon } from "@phosphor-icons/react";
import { type RefObject, useEffect, useRef, useState } from "react";
import { Tabs } from "@/components/public/Tabs";
import { ScrollFade } from "@/components/ScrollFade";
import { cn } from "@/helpers/classname-helper";

const teams = [
  { flag: "🇿🇦", name: "South Africa" },
  { flag: "🇨🇦", name: "Canada" },
  { flag: "🇧🇷", name: "Brazil" },
  { flag: "🇯🇵", name: "Japan" },
  { flag: "🇩🇪", name: "Germany" },
  { flag: "🇵🇾", name: "Paraguay" },
  { flag: "🇳🇱", name: "Netherlands" },
  { flag: "🇲🇦", name: "Morocco" },
  { flag: "🇨🇮", name: "Ivory Coast" },
  { flag: "🇳🇴", name: "Norway" },
  { flag: "🇫🇷", name: "France" },
  { flag: "🇸🇪", name: "Sweden" },
  { flag: "🇲🇽", name: "Mexico" },
  { flag: "🇪🇨", name: "Ecuador" },
  // The black flag plus tag characters spelling "gbeng".
  {
    flag: "\u{1F3F4}\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}",
    name: "England",
  },
  { flag: "🇨🇩", name: "DR Congo" },
  { flag: "🇧🇪", name: "Belgium" },
  { flag: "🇸🇳", name: "Senegal" },
  { flag: "🇺🇸", name: "United States" },
  { flag: "🇧🇦", name: "Bosnia and Herzegovina" },
  { flag: "🇪🇸", name: "Spain" },
  { flag: "🇦🇹", name: "Austria" },
  { flag: "🇵🇹", name: "Portugal" },
  { flag: "🇭🇷", name: "Croatia" },
  { flag: "🇨🇭", name: "Switzerland" },
  { flag: "🇩🇿", name: "Algeria" },
  { flag: "🇦🇺", name: "Australia" },
  { flag: "🇪🇬", name: "Egypt" },
  { flag: "🇦🇷", name: "Argentina" },
  { flag: "🇨🇻", name: "Cabo Verde" },
  { flag: "🇨🇴", name: "Colombia" },
  { flag: "🇬🇭", name: "Ghana" },
] as const;

const axes = ["y", "x"] as const;
const surfaces = ["solid", "glass"] as const;
const fadeSize = 64;

type Axis = (typeof axes)[number];
type Surface = (typeof surfaces)[number];

const axisLabels: Record<Axis, string> = { x: "Horizontal", y: "Vertical" };
const surfaceLabels: Record<Surface, string> = {
  glass: "Glass",
  solid: "Solid",
};

const cardClassNames: Record<Surface, string> = {
  glass:
    "border-white/60 bg-white/40 backdrop-blur-xl dark:border-white/10 dark:bg-grayscale-3/40",
  solid:
    "border-grayscale-3 bg-grayscale-1 dark:border-grayscale-4 dark:bg-grayscale-3",
};

const segmentedListClassName =
  "rounded-[10px] border border-grayscale-3 bg-grayscale-2 dark:border-grayscale-4 dark:bg-grayscale-3";

const segmentedTabClassName =
  "flex h-7 items-center gap-1.5 rounded-[9px] px-2.5 font-medium text-grayscale-10 text-xs transition-colors hover:text-grayscale-11 data-active:text-grayscale-12";

const segmentedIndicatorClassName =
  "rounded-[9px] border border-grayscale-3 bg-white dark:border-grayscale-6 dark:bg-grayscale-5";

const focusClassName =
  "focus-visible:outline-2 focus-visible:outline-grayscale-8";

export function ScrollFadeV2Showcase() {
  const [axis, setAxis] = useState<Axis>("y");
  const [surface, setSurface] = useState<Surface>("solid");
  const [selected, setSelected] = useState<ReadonlySet<string>>(
    () => new Set(["Japan", "Morocco"]),
  );
  const scrollRef = useRef<HTMLDivElement>(null);

  function toggle(name: string) {
    setSelected((current) => {
      const next = new Set(current);

      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }

      return next;
    });
  }

  return (
    <div className="relative flex min-h-[34rem] w-full flex-col overflow-hidden rounded-[13px] border border-grayscale-3 bg-white small-shadow dark:border-grayscale-4 dark:bg-grayscale-2 dark:shadow-none">
      <div
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-0 bg-[radial-gradient(circle,var(--color-grayscale-5)_1px,transparent_1.5px)] bg-size-[14px_14px] [mask-image:radial-gradient(ellipse_at_center,black_10%,transparent_65%)] transition-opacity duration-500",
          surface === "solid" ? "opacity-60 dark:opacity-40" : "opacity-0",
        )}
      />
      <div
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-0 transition-opacity duration-500",
          surface === "glass" ? "opacity-100" : "opacity-0",
        )}
      >
        <div className="absolute top-[18%] left-[22%] size-64 rounded-full bg-orange-9 opacity-70 blur-3xl dark:opacity-40" />
        <div className="absolute top-[38%] right-[20%] size-72 rounded-full bg-pink-9 opacity-60 blur-3xl dark:opacity-35" />
        <div className="absolute bottom-[8%] left-[38%] size-64 rounded-full bg-blue-9 opacity-60 blur-3xl dark:opacity-35" />
      </div>

      <div className="relative flex flex-wrap items-center justify-between gap-2 p-3">
        <Tabs.Root onValueChange={(value: Axis) => setAxis(value)} value={axis}>
          <Tabs.List aria-label="Axis" className={segmentedListClassName}>
            {axes.map((option) => (
              <Tabs.Tab
                className={segmentedTabClassName}
                key={option}
                value={option}
              >
                {axisLabels[option]}
              </Tabs.Tab>
            ))}
            <Tabs.Indicator className={segmentedIndicatorClassName} />
          </Tabs.List>
        </Tabs.Root>

        <Tabs.Root
          onValueChange={(value: Surface) => setSurface(value)}
          value={surface}
        >
          <Tabs.List aria-label="Surface" className={segmentedListClassName}>
            {surfaces.map((option) => (
              <Tabs.Tab
                className={segmentedTabClassName}
                key={option}
                value={option}
              >
                {surfaceLabels[option]}
              </Tabs.Tab>
            ))}
            <Tabs.Indicator className={segmentedIndicatorClassName} />
          </Tabs.List>
        </Tabs.Root>
      </div>

      <div className="relative flex flex-1 items-center justify-center px-4 py-8">
        <div
          className={cn(
            "w-full overflow-hidden rounded-[13px] border transition-colors duration-500",
            axis === "y" ? "max-w-xs" : "max-w-md",
            cardClassNames[surface],
          )}
        >
          <div className="flex items-center justify-between px-4 pt-3.5 pb-1">
            <p className="font-medium text-grayscale-12 text-sm">
              Follow teams
            </p>
            <p className="text-grayscale-10 text-xs tabular-nums">
              {selected.size} selected
            </p>
          </div>

          {axis === "y" ? (
            <ScrollFade
              className="h-[340px] p-2 [scrollbar-color:var(--color-grayscale-7)_transparent] [scrollbar-gutter:stable] [scrollbar-width:thin]"
              key="y"
              ref={scrollRef}
              size={fadeSize}
            >
              <ul className="flex flex-col">
                {teams.map(({ flag, name }) => {
                  const isSelected = selected.has(name);

                  return (
                    <li key={name}>
                      <button
                        aria-pressed={isSelected}
                        className={cn(
                          "flex min-h-10 w-full cursor-pointer items-center gap-2.5 rounded-control px-2.5 text-left transition-colors hover:bg-grayscale-12/5 focus-visible:-outline-offset-2",
                          focusClassName,
                        )}
                        onClick={() => toggle(name)}
                        type="button"
                      >
                        <span
                          aria-hidden="true"
                          className="flex size-5 shrink-0 items-center justify-center text-base leading-none"
                        >
                          {flag}
                        </span>
                        <span className="min-w-0 flex-1 truncate font-medium text-grayscale-12 text-sm">
                          {name}
                        </span>
                        <CheckIcon
                          aria-hidden="true"
                          className={cn(
                            "shrink-0 text-grayscale-12 transition-[opacity,scale] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)]",
                            isSelected
                              ? "scale-100 opacity-100"
                              : "scale-50 opacity-0",
                          )}
                          size={14}
                          weight="bold"
                        />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </ScrollFade>
          ) : (
            <ScrollFade
              axis="x"
              className="px-2 pt-1.5 pb-3 [scrollbar-width:none]"
              key="x"
              ref={scrollRef}
              size={fadeSize}
            >
              <ul className="flex w-max gap-1.5">
                {teams.map(({ flag, name }) => {
                  const isSelected = selected.has(name);

                  return (
                    <li key={name}>
                      <button
                        aria-pressed={isSelected}
                        className={cn(
                          "flex h-8 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full border px-3 font-medium text-sm transition-colors",
                          isSelected
                            ? "border-grayscale-12 bg-grayscale-12 text-grayscale-1"
                            : "border-grayscale-12/10 text-grayscale-12 hover:bg-grayscale-12/5",
                          "focus-visible:outline-offset-2",
                          focusClassName,
                        )}
                        onClick={() => toggle(name)}
                        type="button"
                      >
                        <span aria-hidden="true" className="leading-none">
                          {flag}
                        </span>
                        {name}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </ScrollFade>
          )}
        </div>
      </div>

      <FadeReadout axis={axis} key={axis} target={scrollRef} />
    </div>
  );
}

type FadeDepths = { end: number; start: number };

// Mirrors the values ScrollFade feeds its mask, so you can watch each edge
// fade in as you scroll away from it.
function FadeReadout({
  axis,
  target,
}: {
  axis: Axis;
  target: RefObject<HTMLDivElement | null>;
}) {
  const [depths, setDepths] = useState<FadeDepths>({ end: 0, start: 0 });

  useEffect(() => {
    const element = target.current;

    if (!element) {
      return;
    }

    const update = () => {
      const offset = axis === "x" ? element.scrollLeft : element.scrollTop;
      const range =
        axis === "x"
          ? element.scrollWidth - element.clientWidth
          : element.scrollHeight - element.clientHeight;

      setDepths({
        end: Math.min(fadeSize, Math.max(0, range - offset)),
        start: Math.min(fadeSize, offset),
      });
    };

    update();
    element.addEventListener("scroll", update, { passive: true });

    return () => element.removeEventListener("scroll", update);
  }, [axis, target]);

  return (
    <div
      aria-hidden="true"
      className="relative flex items-center justify-center gap-5 p-3 font-mono font-semibold text-[10px] text-grayscale-9 uppercase leading-none"
    >
      <FadeMeter label={axis === "y" ? "Top" : "Left"} value={depths.start} />
      <FadeMeter label={axis === "y" ? "Bottom" : "Right"} value={depths.end} />
    </div>
  );
}

function FadeMeter({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center gap-2">
      <span>{label}</span>
      <span className="flex items-center gap-2">
        <span className="relative h-1 w-12 overflow-hidden rounded-full bg-grayscale-4 dark:bg-grayscale-5">
          <span
            className="absolute inset-y-0 left-0 rounded-full bg-grayscale-11"
            style={{ width: `${(value / fadeSize) * 100}%` }}
          />
        </span>
        <span className="w-8 text-grayscale-11 tabular-nums">
          {Math.round(value)}px
        </span>
      </span>
    </div>
  );
}
