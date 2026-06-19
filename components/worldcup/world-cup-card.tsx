"use client";

import NumberFlow from "@number-flow/react";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { Card } from "@/components/worldcup/card";

const WORLD_CUP_2026_IMAGE_SRC = "/images/home/world-cup-2026.jpg";
const WORLD_CUP_2026_VIDEO_SRC = "/videos/home/world-cup-2026.mp4";
const WORLD_CUP_2026_END_DATE = new Date("2026-07-20T00:00:00.000Z");
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MS_PER_HOUR = 60 * 60 * 1000;
const MS_PER_MINUTE = 60 * 1000;
const MS_PER_SECOND = 1000;

function getCountdownUntilWorldCupEnd(date = new Date()) {
  let remainingMs = Math.max(
    0,
    WORLD_CUP_2026_END_DATE.getTime() - date.getTime(),
  );
  const days = Math.floor(remainingMs / MS_PER_DAY);
  remainingMs -= days * MS_PER_DAY;
  const hours = Math.floor(remainingMs / MS_PER_HOUR);
  remainingMs -= hours * MS_PER_HOUR;
  const minutes = Math.floor(remainingMs / MS_PER_MINUTE);
  remainingMs -= minutes * MS_PER_MINUTE;
  const seconds = Math.floor(remainingMs / MS_PER_SECOND);

  return { days, hours, minutes, seconds };
}

export function WorldCupCard() {
  const [countdown, setCountdown] = useState(() =>
    getCountdownUntilWorldCupEnd(),
  );
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setCountdown(getCountdownUntilWorldCupEnd());
    }, 1000);

    return () => window.clearInterval(interval);
  }, []);

  const playVideo = () => {
    videoRef.current?.play().catch(() => {
      // Keep the poster visible if the browser blocks playback.
    });
  };

  const pauseVideo = () => {
    const video = videoRef.current;

    if (!video) {
      return;
    }

    video.pause();
    video.currentTime = 0;
  };

  return (
    <Card className="rounded-[16px] p-2 lg:col-span-3">
      <Link
        href="/worldcup"
        aria-label="Open World Cup 2026 prediction markets"
        className="group relative block overflow-hidden rounded-[13px] bg-grayscale-3 [--worldcup-overlay:var(--color-grass-8)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-grass-9 dark:bg-grayscale-3 dark:[--worldcup-overlay:var(--color-grayscale-3)]"
        onBlur={pauseVideo}
        onFocus={playVideo}
        onMouseEnter={playVideo}
        onMouseLeave={pauseVideo}
      >
        <video
          ref={videoRef}
          className="absolute inset-0 h-full w-full object-cover"
          loop
          muted
          playsInline
          poster={WORLD_CUP_2026_IMAGE_SRC}
          preload="metadata"
          src={WORLD_CUP_2026_VIDEO_SRC}
        />
        <div
          className="absolute inset-0 transition-opacity duration-300 group-hover:opacity-50 group-focus-within:opacity-50 dark:group-hover:opacity-60 dark:group-focus-within:opacity-60"
          style={{
            background:
              "linear-gradient(90deg, var(--worldcup-overlay) 0%, color-mix(in srgb, var(--worldcup-overlay) 88%, transparent) 48%, transparent 100%)",
          }}
        />
        <div
          className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-focus-within:opacity-100"
          style={{
            background:
              "linear-gradient(90deg, color-mix(in srgb, var(--worldcup-overlay) 88%, transparent) 0%, color-mix(in srgb, var(--worldcup-overlay) 64%, transparent) 34%, transparent 58%)",
          }}
        />
        <div className="relative z-10 flex min-h-10 items-end justify-between gap-3 p-2">
          <div className="min-w-0 max-w-md p-2">
            <h2 className="text-sm font-semibold text-grayscale-1 dark:text-foreground">
              World Cup 2026
            </h2>
            <p className="mt-1 max-w-xs text-balance text-xs text-grayscale-1 dark:text-muted-foreground">
              Live odds for the winner, golden boot, groups, and every match.
            </p>
            <span className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-control bg-grass-9/85 px-3 text-xs font-medium text-grayscale-1 backdrop-blur-sm transition-colors group-hover:bg-grass-10 dark:bg-grayscale-2/70 dark:text-foreground dark:group-hover:bg-grayscale-2/85">
              Explore odds
              <ArrowRight
                className="size-3.5 transition-transform duration-200 group-hover:translate-x-0.5"
                aria-hidden="true"
              />
            </span>
          </div>
          <div className="shrink-0 text-right">
            <div className="rounded-control bg-grass-4/50 px-2 py-1 font-number text-sm font-medium text-grayscale-1 backdrop-blur-sm dark:bg-grayscale-2/50 dark:text-white">
              <NumberFlow
                value={countdown.days}
                format={{ minimumIntegerDigits: 2 }}
              />
              <span>:</span>
              <NumberFlow
                value={countdown.hours}
                format={{ minimumIntegerDigits: 2 }}
              />
              <span>:</span>
              <NumberFlow
                value={countdown.minutes}
                format={{ minimumIntegerDigits: 2 }}
              />
              <span>:</span>
              <NumberFlow
                value={countdown.seconds}
                format={{ minimumIntegerDigits: 2 }}
              />
            </div>
          </div>
        </div>
      </Link>
    </Card>
  );
}
