"use client";

import {
  type CSSProperties,
  type ReactNode,
  useSyncExternalStore,
} from "react";
import type { ReactParallaxTiltProps } from "react-parallax-tilt";
import Tilt from "react-parallax-tilt";
import { cn } from "@/helpers/classname-helper";

const hoverTiltMedia =
  "(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)";

const ticketClipPath = `polygon(
  0 var(--ticket-corner-size),
  var(--ticket-corner-size) 0,
  calc(100% - var(--ticket-corner-size)) 0,
  100% var(--ticket-corner-size),
  100% calc(100% - var(--ticket-stub-height) - var(--ticket-notch-size)),
  calc(100% - var(--ticket-notch-size)) calc(100% - var(--ticket-stub-height)),
  100% calc(100% - var(--ticket-stub-height) + var(--ticket-notch-size)),
  100% calc(100% - var(--ticket-corner-size)),
  calc(100% - var(--ticket-corner-size)) 100%,
  var(--ticket-corner-size) 100%,
  0 calc(100% - var(--ticket-corner-size)),
  0 calc(100% - var(--ticket-stub-height) + var(--ticket-notch-size)),
  var(--ticket-notch-size) calc(100% - var(--ticket-stub-height)),
  0 calc(100% - var(--ticket-stub-height) - var(--ticket-notch-size))
)`;

const ticketBackground =
  "linear-gradient(145deg, rgb(255 255 255 / 10%), transparent 42%), var(--ticket-paper)";

const ticketShadow =
  "drop-shadow(0 1px 1px rgb(15 15 15 / 10%)) drop-shadow(0 18px 26px rgb(15 15 15 / 13%))";

type TicketCustomProperty =
  | "--ticket-corner-size"
  | "--ticket-ink"
  | "--ticket-notch-size"
  | "--ticket-paper"
  | "--ticket-stub-height";

type TicketRootStyle = CSSProperties &
  Partial<Record<TicketCustomProperty, string>>;

export type TicketTiltProps = Omit<
  ReactParallaxTiltProps,
  "children" | "className" | "style"
>;

type CssLength = number | string;

export type TicketProps = {
  body: ReactNode;
  stub: ReactNode;
  "aria-hidden"?: boolean;
  "aria-label"?: string;
  bodyClassName?: string;
  className?: string;
  cornerSize?: CssLength;
  ink?: string;
  notchSize?: CssLength;
  paper?: string;
  stubClassName?: string;
  stubHeight?: CssLength;
  style?: CSSProperties;
  ticketClassName?: string;
  tilt?: boolean;
  tiltProps?: TicketTiltProps;
};

function subscribeToHoverTilt(listener: () => void) {
  const media = window.matchMedia(hoverTiltMedia);

  media.addEventListener("change", listener);
  return () => media.removeEventListener("change", listener);
}

function getHoverTiltSnapshot() {
  return window.matchMedia(hoverTiltMedia).matches;
}

function getServerHoverTiltSnapshot() {
  return false;
}

function toCssLength(value: CssLength) {
  return typeof value === "number" ? `${value}px` : value;
}

export function Ticket({
  "aria-hidden": ariaHidden,
  "aria-label": ariaLabel,
  body,
  bodyClassName,
  className,
  cornerSize = 0,
  ink = "#171714",
  notchSize = 13,
  paper = "#ff633f",
  stub,
  stubClassName,
  stubHeight = "24%",
  style,
  ticketClassName,
  tilt = true,
  tiltProps,
}: TicketProps) {
  const hoverTiltEnabled = useSyncExternalStore(
    subscribeToHoverTilt,
    getHoverTiltSnapshot,
    getServerHoverTiltSnapshot,
  );
  const {
    glareEnable = false,
    scale = 1.018,
    tiltEnable: tiltEnabledByProp = true,
    ...resolvedTiltProps
  } = tiltProps ?? {};
  const tiltEnabled = tilt && tiltEnabledByProp && hoverTiltEnabled;
  const glareEnabled = tiltEnabled && glareEnable;
  const rootStyle: TicketRootStyle = {
    "--ticket-corner-size": toCssLength(cornerSize),
    "--ticket-ink": ink,
    "--ticket-notch-size": toCssLength(notchSize),
    "--ticket-paper": paper,
    "--ticket-stub-height": toCssLength(stubHeight),
    filter: ticketShadow,
    ...style,
  };

  return (
    <div
      className={cn("relative aspect-[5/12] w-[min(100%,17rem)]", className)}
      style={rootStyle}
    >
      <Tilt
        glareEnable={glareEnabled}
        gyroscope={false}
        key={glareEnabled ? "ticket-with-glare" : "ticket-without-glare"}
        perspective={1100}
        tiltMaxAngleX={6}
        tiltMaxAngleY={6}
        transitionEasing="cubic-bezier(0.23, 1, 0.32, 1)"
        transitionSpeed={220}
        {...resolvedTiltProps}
        className="relative h-full w-full touch-pan-y [transform-style:preserve-3d]"
        scale={tiltEnabled ? scale : 1}
        style={{
          clipPath: ticketClipPath,
        }}
        tiltEnable={tiltEnabled}
      >
        <article
          aria-hidden={ariaHidden}
          aria-label={ariaHidden ? undefined : ariaLabel}
          className={cn(
            "relative grid h-full w-full grid-rows-[minmax(0,1fr)_var(--ticket-stub-height)] overflow-hidden text-[var(--ticket-ink)] transition-[color,background-color] duration-[180ms] ease-[ease]",
            ticketClassName,
          )}
          style={{ background: ticketBackground }}
        >
          <div
            className={cn(
              "relative min-h-0 min-w-0 overflow-hidden",
              bodyClassName,
            )}
          >
            {body}
            <span
              aria-hidden="true"
              className="pointer-events-none absolute right-[calc(var(--ticket-notch-size)+6px)] bottom-px left-[calc(var(--ticket-notch-size)+6px)] z-[2] border-current border-b border-dashed opacity-30"
            />
          </div>
          <div
            className={cn(
              "relative min-h-0 min-w-0 overflow-hidden",
              stubClassName,
            )}
          >
            {stub}
          </div>
        </article>
      </Tilt>
    </div>
  );
}
