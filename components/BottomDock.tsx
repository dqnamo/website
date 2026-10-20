"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import posthog from "posthog-js";
import { useEffect, useState } from "react";
import {
  PikaCalendarIcon,
  PikaEnvelopeIcon,
  PikaGithubIcon,
  PikaHomeIcon,
  PikaMoonIcon,
  PikaXIcon,
} from "@/components/PikaDockIcons";
import { Tooltip } from "@/components/public/Tooltip";
import { cn } from "@/helpers/classname-helper";

const dockItemClassName =
  "flex h-8 cursor-pointer items-center justify-center gap-2 rounded-md px-3 font-medium text-[var(--dock-text)] text-xs outline-none transition-[background-color,color,transform] duration-150 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)] hover:text-[var(--dock-text-strong)] hover:[--item-bg:var(--dock-active)] focus-visible:ring-2 focus-visible:ring-[var(--dock-ring)] active:scale-[0.97] motion-reduce:transition-none max-[399px]:w-8 max-[399px]:px-0";

const iconItemClassName = cn(dockItemClassName, "w-8 px-0");

// The dock is a tab rising from a black line along the bottom edge, with the nav card inside it as
// a smaller tab of the same shape. Both tabs' sides lean out as they fall and round over at the
// top; the dock's flare into the line, and the card's run straight on through it to the edge. The
// sides are fixed "wings" drawn here, and a plain body stretches between them, so both tabs follow
// the nav's width without measuring.
const BUTTON_SIZE = 32;
const BUTTON_RADIUS = 6;
// Inside the card's border, around the buttons.
const CARD_PADDING = 5;
const NAV_HEIGHT = BUTTON_SIZE + CARD_PADDING * 2;
const DOCK_TOP = 6;
// The line is as tall as the dock's padding around the card.
const DOCK_BOTTOM = DOCK_TOP;
const DOCK_HEIGHT = DOCK_TOP + NAV_HEIGHT + DOCK_BOTTOM;
// The gap between the card's sides and the dock's, matching the gap above the card.
const DOCK_SIDE = 6;
const LEAN = (22 * Math.PI) / 180;
const leanX = Math.sin(LEAN);
const leanY = Math.cos(LEAN);

const n = (value: number) => Number(value.toFixed(2));

type Tab = {
  // Where the tab's left side would meet its top edge without rounding, from the nav's left.
  cornerX: number;
  top: number;
  // From the top edge down to where the side meets the line or the edge, then on below that.
  rise: number;
  depth: number;
  radius: number;
  flare: number;
};

// Lays out a tab's left wing, whose own origin is where the flare meets the line. The edge can be
// traced `inset` inside the shape, to draw a border that stays within it: the corners keep their
// centres and the radii shrink or grow to suit.
function tabWing({ cornerX, top, rise, depth, radius, flare }: Tab) {
  const corner = (flare + leanX * (rise - flare)) / leanY;
  const centreX = corner + (radius * (1 - leanX)) / leanY;
  // One extra pixel runs under the body so no seam shows where they meet.
  const width = centreX + 1;

  const edge = (inset: number) => {
    const f = flare + inset;
    const r = radius - inset;
    return [
      `M 0 ${n(rise + inset)}`,
      `A ${n(f)} ${n(f)} 0 0 0 ${n(f * leanY)} ${n(rise - flare + f * leanX)}`,
      `L ${n(centreX - r * leanY)} ${n(radius - r * leanX)}`,
      `A ${n(r)} ${n(r)} 0 0 1 ${n(centreX)} ${n(inset)}`,
      `H ${n(width)}`,
    ].join(" ");
  };

  return {
    border: edge(0.5),
    bodyInset: n(cornerX - corner + centreX),
    fill: `${edge(0)} V ${rise + depth} H 0 Z`,
    height: rise + depth,
    left: n(cornerX - corner),
    top,
    width: n(width),
  };
}

const CARD_RADIUS = 18;

// No flare: the card's sides carry on through the line to the bottom edge.
const CARD = tabWing({
  cornerX: 0,
  top: DOCK_TOP,
  rise: NAV_HEIGHT + DOCK_BOTTOM,
  depth: 0,
  radius: CARD_RADIUS,
  flare: 0,
});

// Offsetting the card's side outward by the side gap, and its top up by the top gap, puts the
// dock's corner here; growing the radius by the same gap keeps the two top corners concentric.
const DOCK = tabWing({
  cornerX: -DOCK_SIDE / leanY + (DOCK_TOP * leanX) / leanY,
  top: 0,
  rise: DOCK_TOP + NAV_HEIGHT,
  depth: DOCK_BOTTOM,
  radius: CARD_RADIUS + DOCK_SIDE,
  flare: 14,
});

// The end buttons' highlights take the card's shape at their outer sides: the side leans with the
// card's, a padding's width in from it, and the top corner shares the card corner's centre. As the
// side leans out it reaches past the button, so the highlight is a ::before clipped to this path,
// laid out from the button's top-left and shifted right by its reach.
function edgeHighlight() {
  const radius = CARD_RADIUS - CARD_PADDING;
  // Where the side would meet the top without rounding, from the nav's left.
  const sideX = (CARD_PADDING * (1 - leanX)) / leanY;
  // The button moves out until the side crosses its outer edge halfway down. Its icon then sits
  // in the middle of the highlight, which is as wide there as a square one, so every icon keeps
  // the same spacing.
  const shift = Math.round(
    CARD_PADDING - sideX + ((BUTTON_SIZE / 2) * leanX) / leanY,
  );
  const buttonX = CARD_PADDING - shift;
  const centreX = (CARD_RADIUS * (1 - leanX)) / leanY - buttonX;
  const cornerX = sideX - buttonX;
  const footX = cornerX - (BUTTON_SIZE * leanX) / leanY;
  // The side meets the bottom at 90° less the lean.
  const footTangent = BUTTON_RADIUS / Math.tan((Math.PI / 2 - LEAN) / 2);
  const reach = Math.ceil(-footX);
  const x = (value: number) => n(value + reach);
  const end = BUTTON_SIZE - BUTTON_RADIUS;

  const path = [
    `M ${x(centreX)} 0`,
    `H ${x(end)}`,
    `A ${BUTTON_RADIUS} ${BUTTON_RADIUS} 0 0 1 ${x(BUTTON_SIZE)} ${BUTTON_RADIUS}`,
    `V ${end}`,
    `A ${BUTTON_RADIUS} ${BUTTON_RADIUS} 0 0 1 ${x(end)} ${BUTTON_SIZE}`,
    `H ${x(footX + footTangent)}`,
    `A ${BUTTON_RADIUS} ${BUTTON_RADIUS} 0 0 1 ${x(footX + footTangent * leanX)} ${n(BUTTON_SIZE - footTangent * leanY)}`,
    `L ${x(centreX - radius * leanY)} ${n(radius - radius * leanX)}`,
    `A ${radius} ${radius} 0 0 1 ${x(centreX)} 0 Z`,
  ].join(" ");

  return {
    "--edge-reach": `${reach}px`,
    "--edge-shape": `path("${path}")`,
    "--edge-shift": `${shift}px`,
  } as React.CSSProperties;
}

const EDGE_STYLE = edgeHighlight();

const edgeItemClassName =
  "relative isolate before:absolute before:inset-y-0 before:-z-10 before:w-[calc(100%+var(--edge-reach))] before:bg-[var(--item-bg,transparent)] before:transition-[background-color] before:duration-150 before:[clip-path:var(--edge-shape)] before:[transition-timing-function:cubic-bezier(0.23,1,0.32,1)] motion-reduce:before:transition-none";

const edgeItemClassNames = {
  start: cn(
    edgeItemClassName,
    "ml-[calc(var(--edge-shift)*-1)] before:left-[calc(var(--edge-reach)*-1)]",
  ),
  end: cn(
    edgeItemClassName,
    "mr-[calc(var(--edge-shift)*-1)] before:right-[calc(var(--edge-reach)*-1)] before:-scale-x-100",
  ),
};

function TabWing({
  bordered,
  className,
  style,
  wing,
}: {
  bordered?: boolean;
  className?: string;
  style: React.CSSProperties;
  wing: ReturnType<typeof tabWing>;
}) {
  return (
    <svg
      aria-hidden="true"
      className={cn("absolute top-0", className)}
      height={wing.height}
      style={style}
      viewBox={`0 0 ${wing.width} ${wing.height}`}
      width={wing.width}
    >
      <path className="pointer-events-auto" d={wing.fill} fill="currentColor" />
      {bordered && (
        <path
          className="stroke-[var(--dock-inner-border)]"
          d={wing.border}
          fill="none"
        />
      )}
    </svg>
  );
}

function TabShape({
  bordered,
  className,
  wing,
}: {
  bordered?: boolean;
  className: string;
  wing: ReturnType<typeof tabWing>;
}) {
  return (
    <div
      className={cn("absolute inset-x-0", className)}
      style={{ height: wing.height, top: wing.top }}
    >
      <TabWing bordered={bordered} style={{ left: wing.left }} wing={wing} />
      <div
        className={cn(
          "pointer-events-auto absolute inset-y-0 bg-current",
          bordered && "border-[var(--dock-inner-border)] border-t",
        )}
        style={{ left: wing.bodyInset, right: wing.bodyInset }}
      />
      <TabWing
        bordered={bordered}
        className="-scale-x-100"
        style={{ right: wing.left }}
        wing={wing}
      />
    </div>
  );
}

function DockTooltip({
  children,
  edge,
  label,
}: {
  children: React.ReactElement;
  edge?: "start" | "end";
  label: string;
}) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger
        aria-label={label}
        className={cn(
          iconItemClassName,
          edge ? edgeItemClassNames[edge] : "bg-[var(--item-bg,transparent)]",
        )}
        render={children}
        style={edge && EDGE_STYLE}
      />
      <Tooltip.Portal>
        <Tooltip.Positioner sideOffset={8}>
          <Tooltip.Popup data-recording-hide="">{label}</Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

function ThemeButton() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isDark = mounted && resolvedTheme === "dark";
  const label = "Toggle dark mode";

  return (
    <Tooltip.Root>
      <Tooltip.Trigger
        aria-label={label}
        className={cn(
          iconItemClassName,
          edgeItemClassNames.end,
          isDark &&
            "text-[var(--dock-text-strong)] [--item-bg:var(--dock-selected)]",
        )}
        disabled={!mounted}
        onClick={() => setTheme(isDark ? "light" : "dark")}
        style={EDGE_STYLE}
      >
        <PikaMoonIcon filled={isDark} />
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Positioner sideOffset={8}>
          <Tooltip.Popup data-recording-hide="">{label}</Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

export function BottomDock() {
  const { resolvedTheme } = useTheme();
  const pathname = usePathname();
  const isHome = pathname === "/";
  const isSiteDark = resolvedTheme === "dark";

  return (
    <div
      className={cn(
        "dark pointer-events-none fixed inset-x-0 bottom-0 z-100 flex justify-center drop-shadow-[0_-2px_12px_rgba(0,0,0,0.14)] [--dock-active:#2a2a2a] [--dock-inner:#222222] [--dock-inner-border:#2a2a2a] [--dock-outer:#111111] [--dock-ring:#606060] [--dock-selected:#313131] [--dock-text:#b4b4b4] [--dock-text-strong:#eeeeee]",
        isSiteDark &&
          "[--dock-active:#3a3a3a] [--dock-inner:#313131] [--dock-inner-border:#3a3a3a] [--dock-outer:#222222] [--dock-ring:#7b7b7b] [--dock-selected:#484848] [--dock-text:#eeeeee]",
      )}
      data-bottom-dock=""
      data-recording-hide=""
      style={{ height: DOCK_HEIGHT }}
    >
      <div
        className="pointer-events-auto absolute inset-x-0 bottom-0 bg-[var(--dock-outer)]"
        style={{ height: DOCK_BOTTOM }}
      />
      <Tooltip.Provider>
        <div className="relative" style={{ paddingTop: DOCK_TOP }}>
          <TabShape className="text-[var(--dock-outer)]" wing={DOCK} />
          <TabShape bordered className="text-[var(--dock-inner)]" wing={CARD} />
          <nav
            aria-label="Primary navigation"
            className="pointer-events-auto relative flex items-center gap-1"
            style={{ padding: CARD_PADDING }}
          >
            <DockTooltip edge="start" label="Home">
              <Link
                aria-current={isHome ? "page" : undefined}
                className={cn(
                  isHome &&
                    "text-[var(--dock-text-strong)] [--item-bg:var(--dock-selected)]",
                )}
                href="/"
              >
                <PikaHomeIcon filled={isHome} />
              </Link>
            </DockTooltip>
            <DockTooltip label="Twitter">
              <a
                href="https://x.com/dqnamo"
                rel="noopener noreferrer"
                target="_blank"
              >
                <PikaXIcon />
              </a>
            </DockTooltip>
            <DockTooltip label="GitHub">
              <a
                href="https://github.com/dqnamo"
                rel="noopener noreferrer"
                target="_blank"
              >
                <PikaGithubIcon />
              </a>
            </DockTooltip>
            <DockTooltip label="Book a project call">
              <a
                href="https://cal.com/interface.london/20min"
                onClick={() =>
                  posthog.capture("work_with_me_cta_clicked", {
                    location: "dock",
                  })
                }
                rel="noopener noreferrer"
                target="_blank"
              >
                <PikaCalendarIcon />
              </a>
            </DockTooltip>
            <DockTooltip label="Email JP">
              <a href="mailto:jp@interface.london">
                <PikaEnvelopeIcon />
              </a>
            </DockTooltip>
            <ThemeButton />
          </nav>
        </div>
      </Tooltip.Provider>
    </div>
  );
}
