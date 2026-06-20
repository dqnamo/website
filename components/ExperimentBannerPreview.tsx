"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/helpers/classname-helper";

type ExperimentBannerPreviewProps = {
  className?: string;
};

const WORLD_CUP_2026_IMAGE_SRC = "/images/home/world-cup-2026.jpg";
const WORLD_CUP_2026_VIDEO_SRC = "/videos/home/world-cup-2026.mp4";

export function ExperimentBannerPreview({
  className,
}: ExperimentBannerPreviewProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    const video = videoRef.current;
    const card = root?.closest("[data-experiment-card]");

    if (!root || !video || !card) {
      return;
    }

    root.dataset.active = "false";

    let hasPointer = false;
    let hasFocus = false;

    const syncVideoState = () => {
      const shouldPlay = hasPointer || hasFocus;
      root.dataset.active = String(shouldPlay);

      if (shouldPlay) {
        video.play().catch(() => {
          // Keep the hover treatment even if a browser blocks playback.
        });
        return;
      }

      video.pause();
      video.currentTime = 0;
    };

    const handlePointerEnter = () => {
      hasPointer = true;
      syncVideoState();
    };

    const handlePointerLeave = () => {
      hasPointer = false;
      syncVideoState();
    };

    const handlePointerMove = (event: MouseEvent | PointerEvent) => {
      const rect = card.getBoundingClientRect();
      const nextHasPointer =
        event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom;

      if (hasPointer !== nextHasPointer) {
        hasPointer = nextHasPointer;
        syncVideoState();
      }
    };

    const handleFocusIn = () => {
      hasFocus = true;
      syncVideoState();
    };

    const handleFocusOut = () => {
      window.requestAnimationFrame(() => {
        hasFocus = card.contains(document.activeElement);
        syncVideoState();
      });
    };

    card.addEventListener("pointerenter", handlePointerEnter);
    card.addEventListener("pointerleave", handlePointerLeave);
    card.addEventListener("mouseenter", handlePointerEnter);
    card.addEventListener("mouseleave", handlePointerLeave);
    card.addEventListener("focusin", handleFocusIn);
    card.addEventListener("focusout", handleFocusOut);
    window.addEventListener("pointermove", handlePointerMove, {
      passive: true,
    });
    window.addEventListener("mousemove", handlePointerMove, { passive: true });

    return () => {
      card.removeEventListener("pointerenter", handlePointerEnter);
      card.removeEventListener("pointerleave", handlePointerLeave);
      card.removeEventListener("mouseenter", handlePointerEnter);
      card.removeEventListener("mouseleave", handlePointerLeave);
      card.removeEventListener("focusin", handleFocusIn);
      card.removeEventListener("focusout", handleFocusOut);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("mousemove", handlePointerMove);
    };
  }, []);

  return (
    <div
      aria-label="Animated World Cup banner preview"
      className={cn("group/banner", className)}
      ref={rootRef}
      role="img"
    >
      <video
        className="absolute inset-0 h-full w-full object-cover"
        loop
        muted
        playsInline
        poster={WORLD_CUP_2026_IMAGE_SRC}
        preload="metadata"
        ref={videoRef}
        src={WORLD_CUP_2026_VIDEO_SRC}
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 opacity-100 transition-opacity duration-300 group-data-[active=true]/banner:opacity-50 dark:group-data-[active=true]/banner:opacity-60"
        style={{
          background:
            "linear-gradient(to bottom right, var(--worldcup-overlay) 0%, color-mix(in srgb, var(--worldcup-overlay) 88%, transparent) 48%, transparent 100%)",
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-data-[active=true]/banner:opacity-100"
        style={{
          background:
            "linear-gradient(to bottom right, color-mix(in srgb, var(--worldcup-overlay) 88%, transparent) 0%, color-mix(in srgb, var(--worldcup-overlay) 64%, transparent) 34%, transparent 58%)",
        }}
      />
    </div>
  );
}
