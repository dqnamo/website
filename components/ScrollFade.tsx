"use client";

import {
  type ComponentProps,
  type CSSProperties,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";
import { cn } from "@/helpers/classname-helper";
import styles from "./ScrollFade.module.css";

type ScrollFadeAxis = "x" | "y";

export type ScrollFadeProps = ComponentProps<"div"> & {
  axis?: ScrollFadeAxis;
  // How deep each edge fade gets once you've scrolled at least this far, in px.
  size?: number;
};

export function ScrollFade({
  axis = "y",
  className,
  ref,
  size = 64,
  style,
  ...props
}: ScrollFadeProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useImperativeHandle(ref, () => scrollRef.current as HTMLDivElement);

  useEffect(() => {
    const element = scrollRef.current;

    if (!element) {
      return;
    }

    const isHorizontal = axis === "x";
    // Browsers with scroll-driven animations fade the edges entirely in CSS.
    // Everywhere else, write the same custom properties on scroll.
    const tracksScroll = !CSS.supports("animation-timeline: scroll()");

    const getRange = () =>
      isHorizontal
        ? element.scrollWidth - element.clientWidth
        : element.scrollHeight - element.clientHeight;

    const syncFade = () => {
      // scrollLeft runs negative in right-to-left layouts.
      const offset = Math.abs(
        isHorizontal ? element.scrollLeft : element.scrollTop,
      );

      element.style.setProperty(
        "--scroll-fade-start",
        `${Math.min(size, offset)}px`,
      );
      element.style.setProperty(
        "--scroll-fade-end",
        `${Math.min(size, Math.max(0, getRange() - offset))}px`,
      );
    };

    const syncLayout = () => {
      // Chrome holds the last fade when content shrinks to fit mid-scroll,
      // so switch the fade off whenever there's nothing to scroll.
      element.toggleAttribute("data-fits", getRange() <= 0);
      // Zero for overlay scrollbars, which fade along with the content.
      element.style.setProperty(
        "--scroll-fade-scrollbar",
        `${
          isHorizontal
            ? element.offsetHeight - element.clientHeight
            : element.offsetWidth - element.clientWidth
        }px`,
      );

      if (tracksScroll) {
        syncFade();
      }
    };

    // The scroll range changes when the scroller or anything inside it resizes.
    const resizeObserver = new ResizeObserver(syncLayout);
    const observeChildren = () => {
      for (const child of element.children) {
        resizeObserver.observe(child);
      }
    };
    const mutationObserver = new MutationObserver(observeChildren);

    syncLayout();
    resizeObserver.observe(element);
    observeChildren();
    mutationObserver.observe(element, { childList: true });

    if (tracksScroll) {
      element.addEventListener("scroll", syncFade, { passive: true });
    }

    return () => {
      element.removeEventListener("scroll", syncFade);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      element.removeAttribute("data-fits");
      element.style.removeProperty("--scroll-fade-scrollbar");
      element.style.removeProperty("--scroll-fade-start");
      element.style.removeProperty("--scroll-fade-end");
    };
  }, [axis, size]);

  return (
    <div
      {...props}
      className={cn(styles.root, className)}
      data-axis={axis}
      ref={scrollRef}
      style={{ "--scroll-fade-size": `${size}px`, ...style } as CSSProperties}
    />
  );
}
