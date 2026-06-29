"use client";

import type { ReactNode } from "react";
import { useEffect, useRef } from "react";

type ScrollFadeListProps<TItem> = {
  getKey: (item: TItem) => string;
  items: readonly TItem[];
  renderItem: (item: TItem) => ReactNode;
  className?: string;
  maxFadeHeight?: number;
  scrollClassName?: string;
};

const defaultMaxFadeHeight = 76;

const teamItems = [
  {
    name: "South Africa",
    flag: "🇿🇦",
  },
  {
    name: "Canada",
    flag: "🇨🇦",
  },
  {
    name: "Brazil",
    flag: "🇧🇷",
  },
  {
    name: "Japan",
    flag: "🇯🇵",
  },
  {
    name: "Germany",
    flag: "🇩🇪",
  },
  {
    name: "Paraguay",
    flag: "🇵🇾",
  },
  {
    name: "Netherlands",
    flag: "🇳🇱",
  },
  {
    name: "Morocco",
    flag: "🇲🇦",
  },
  {
    name: "Ivory Coast",
    flag: "🇨🇮",
  },
  {
    name: "Norway",
    flag: "🇳🇴",
  },
  {
    name: "France",
    flag: "🇫🇷",
  },
  {
    name: "Sweden",
    flag: "🇸🇪",
  },
  {
    name: "Mexico",
    flag: "🇲🇽",
  },
  {
    name: "Ecuador",
    flag: "🇪🇨",
  },
  {
    name: "England",
    flag: "🏴",
  },
  {
    name: "DR Congo",
    flag: "🇨🇩",
  },
  {
    name: "Belgium",
    flag: "🇧🇪",
  },
  {
    name: "Senegal",
    flag: "🇸🇳",
  },
  {
    name: "United States",
    flag: "🇺🇸",
  },
  {
    name: "Bosnia and Herzegovina",
    flag: "🇧🇦",
  },
  {
    name: "Spain",
    flag: "🇪🇸",
  },
  {
    name: "Austria",
    flag: "🇦🇹",
  },
  {
    name: "Portugal",
    flag: "🇵🇹",
  },
  {
    name: "Croatia",
    flag: "🇭🇷",
  },
  {
    name: "Switzerland",
    flag: "🇨🇭",
  },
  {
    name: "Algeria",
    flag: "🇩🇿",
  },
  {
    name: "Australia",
    flag: "🇦🇺",
  },
  {
    name: "Egypt",
    flag: "🇪🇬",
  },
  {
    name: "Argentina",
    flag: "🇦🇷",
  },
  {
    name: "Cabo Verde",
    flag: "🇨🇻",
  },
  {
    name: "Colombia",
    flag: "🇨🇴",
  },
  {
    name: "Ghana",
    flag: "🇬🇭",
  },
] as const;

export function ScrollFadeList<TItem>({
  className = "relative w-full max-w-xs overflow-hidden rounded-[13px] border border-grayscale-3 bg-grayscale-1 [--scroll-fade-list-bg:var(--color-grayscale-1)] [--scrollbar-gutter-width:10px] dark:border-grayscale-4 dark:bg-grayscale-3 dark:[--scroll-fade-list-bg:var(--color-grayscale-3)]",
  getKey,
  items,
  maxFadeHeight = defaultMaxFadeHeight,
  renderItem,
  scrollClassName = "h-[390px] overflow-y-auto overscroll-contain [scrollbar-color:var(--color-grayscale-7)_transparent] [scrollbar-gutter:stable] [scrollbar-width:thin]",
}: ScrollFadeListProps<TItem>) {
  const frameRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const frameElement = frameRef.current;
    const scrollElement = scrollRef.current;
    let animationFrame = 0;

    if (!frameElement || !scrollElement) {
      return;
    }

    const updateFadeHeights = () => {
      const maxScrollTop = Math.max(
        0,
        scrollElement.scrollHeight - scrollElement.clientHeight,
      );
      const distanceFromTop = scrollElement.scrollTop;
      const distanceFromBottom = maxScrollTop - scrollElement.scrollTop;

      const topFadeHeight = Math.min(
        maxFadeHeight,
        Math.max(0, distanceFromTop),
      );
      const bottomFadeHeight = Math.min(
        maxFadeHeight,
        Math.max(0, distanceFromBottom),
      );

      frameElement.style.setProperty("--top-fade-height", `${topFadeHeight}px`);
      frameElement.style.setProperty(
        "--bottom-fade-height",
        `${bottomFadeHeight}px`,
      );
    };

    const scheduleFadeUpdate = () => {
      cancelAnimationFrame(animationFrame);
      animationFrame = requestAnimationFrame(updateFadeHeights);
    };

    updateFadeHeights();
    scrollElement.addEventListener("scroll", scheduleFadeUpdate, {
      passive: true,
    });

    const resizeObserver = new ResizeObserver(scheduleFadeUpdate);
    resizeObserver.observe(scrollElement);

    if (scrollElement.firstElementChild) {
      resizeObserver.observe(scrollElement.firstElementChild);
    }

    return () => {
      cancelAnimationFrame(animationFrame);
      scrollElement.removeEventListener("scroll", scheduleFadeUpdate);
      resizeObserver.disconnect();
    };
  }, [maxFadeHeight]);

  return (
    <div
      className={`${className} [--bottom-fade-height:0px] [--top-fade-height:0px] before:pointer-events-none before:absolute before:top-0 before:right-[var(--scrollbar-gutter-width)] before:left-0 before:h-[var(--top-fade-height)] before:bg-linear-to-b before:from-[var(--scroll-fade-list-bg)] before:to-transparent before:content-[''] before:transition-[height] before:duration-75 before:ease-linear after:pointer-events-none after:absolute after:right-[var(--scrollbar-gutter-width)] after:bottom-0 after:left-0 after:h-[var(--bottom-fade-height)] after:bg-linear-to-b after:from-transparent after:to-[var(--scroll-fade-list-bg)] after:content-[''] after:transition-[height] after:duration-75 after:ease-linear`}
      ref={frameRef}
    >
      <div className={scrollClassName} ref={scrollRef}>
        <ol className="flex flex-col p-2">
          {items.map((item) => (
            <li
              className="flex min-h-10 min-w-0 items-center gap-2.5 rounded-control px-2.5 transition-colors hover:bg-grayscale-2 dark:hover:bg-grayscale-4"
              key={getKey(item)}
            >
              {renderItem(item)}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

export function ScrollFadeListShowcase() {
  return (
    <ScrollFadeList
      getKey={(item) => item.name}
      items={teamItems}
      renderItem={({ flag, name }) => (
        <>
          <span
            aria-hidden="true"
            className="flex size-5 shrink-0 items-center justify-center text-base leading-none"
          >
            {flag}
          </span>
          <span className="min-w-0 truncate font-medium text-grayscale-12 text-sm">
            {name}
          </span>
        </>
      )}
    />
  );
}
