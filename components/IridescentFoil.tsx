"use client";

import {
  type ComponentPropsWithoutRef,
  type CSSProperties,
  useEffect,
  useRef,
} from "react";
import { cn } from "@/helpers/classname-helper";
import styles from "./IridescentFoil.module.css";

type ScrollProgressMode = "element" | "document";

type IridescentFoilCustomProperty =
  | "--foil-shift"
  | "--foil-y-shift"
  | "--glare-x"
  | "--glare-y"
  | "--pointer-x"
  | "--pointer-y"
  | "--shine-angle"
  | "--shine-opacity";

type IridescentFoilStyle = CSSProperties &
  Record<IridescentFoilCustomProperty, string>;

type IridescentFoilProps = ComponentPropsWithoutRef<"div"> & {
  scrollProgressMode?: ScrollProgressMode;
};

const initialStyle: IridescentFoilStyle = {
  "--foil-shift": "0%",
  "--foil-y-shift": "0%",
  "--glare-x": "50%",
  "--glare-y": "50%",
  "--pointer-x": "50%",
  "--pointer-y": "50%",
  "--shine-angle": "135deg",
  "--shine-opacity": "0.62",
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function toPercent(value: number) {
  return `${Number((value * 100).toFixed(3))}%`;
}

function toDegrees(value: number) {
  return `${Number(value.toFixed(3))}deg`;
}

function toUnitless(value: number) {
  return `${Number(value.toFixed(3))}`;
}

function getElementScrollProgress(element: HTMLElement) {
  const rect = element.getBoundingClientRect();
  const visibleScrollRange = window.innerHeight + rect.height;

  return visibleScrollRange > 0
    ? clamp((window.innerHeight - rect.top) / visibleScrollRange, 0, 1)
    : 0;
}

function getDocumentScrollProgress() {
  const scrollingElement =
    document.scrollingElement ?? document.documentElement;
  const scrollRange = scrollingElement.scrollHeight - window.innerHeight;

  return scrollRange > 0
    ? clamp(scrollingElement.scrollTop / scrollRange, 0, 1)
    : 0;
}

function getElementPointer(event: PointerEvent, element: HTMLElement) {
  const rect = element.getBoundingClientRect();

  return {
    x:
      rect.width > 0
        ? clamp((event.clientX - rect.left) / rect.width, 0.08, 0.92)
        : 0.5,
    y:
      rect.height > 0
        ? clamp((event.clientY - rect.top) / rect.height, 0.08, 0.92)
        : 0.5,
  };
}

function setFoilProperty(
  style: CSSStyleDeclaration,
  property: IridescentFoilCustomProperty,
  value: string,
) {
  style.setProperty(property, value);
}

export function IridescentFoil({
  children,
  className,
  scrollProgressMode = "element",
  style,
  ...props
}: IridescentFoilProps) {
  const foilRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<number | null>(null);
  const pointerRef = useRef({ x: 0.5, y: 0.5 });

  useEffect(() => {
    const foil = foilRef.current;

    if (!foil) {
      return;
    }

    const applyEffect = () => {
      const { x, y } = pointerRef.current;
      const scrollProgress =
        scrollProgressMode === "document"
          ? getDocumentScrollProgress()
          : getElementScrollProgress(foil);
      const foilStyle = foil.style;

      setFoilProperty(
        foilStyle,
        "--foil-shift",
        toPercent(scrollProgress * 0.82 + (x - 0.5) * 0.18),
      );
      setFoilProperty(
        foilStyle,
        "--foil-y-shift",
        toPercent(scrollProgress * 0.28 + (y - 0.5) * 0.12),
      );
      setFoilProperty(foilStyle, "--glare-x", toPercent(x));
      setFoilProperty(foilStyle, "--glare-y", toPercent(y));
      setFoilProperty(foilStyle, "--pointer-x", toPercent(x));
      setFoilProperty(foilStyle, "--pointer-y", toPercent(y));
      setFoilProperty(
        foilStyle,
        "--shine-angle",
        toDegrees(105 + scrollProgress * 80 + (x - 0.5) * 28),
      );
      setFoilProperty(
        foilStyle,
        "--shine-opacity",
        toUnitless(0.56 + Math.abs(x - 0.5) * 0.24 + scrollProgress * 0.12),
      );

      frameRef.current = null;
    };

    const scheduleEffect = () => {
      if (frameRef.current !== null) {
        return;
      }

      frameRef.current = window.requestAnimationFrame(applyEffect);
    };

    const handlePointerMove = (event: PointerEvent) => {
      pointerRef.current = getElementPointer(event, foil);

      scheduleEffect();
    };

    const handleScroll = () => {
      scheduleEffect();
    };

    window.addEventListener("pointermove", handlePointerMove, {
      passive: true,
    });
    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", scheduleEffect, { passive: true });
    scheduleEffect();

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", scheduleEffect);

      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
      }
    };
  }, [scrollProgressMode]);

  return (
    <div
      {...props}
      ref={foilRef}
      className={cn(styles.surface, className)}
      style={{ ...initialStyle, ...style }}
    >
      <span aria-hidden className={styles.foil} />
      <span aria-hidden className={styles.film} />
      <span aria-hidden className={styles.pearl} />
      <div className={styles.content}>{children}</div>
      <span aria-hidden className={styles.shine} />
      <span aria-hidden className={styles.glare} />
    </div>
  );
}
