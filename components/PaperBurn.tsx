"use client";

import {
  type ComponentPropsWithoutRef,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import { cn } from "@/helpers/classname-helper";
import styles from "./PaperBurn.module.css";
import { startPaperBurnRenderer } from "./PaperBurnWebGL";

type BurnState = "burning" | "burnt" | "fading" | "idle" | "preparing";

export type PaperBurnProps = Omit<
  ComponentPropsWithoutRef<"div">,
  "children"
> & {
  active: boolean;
  children: ReactNode;
  duration?: number;
  onBurnComplete?: () => void;
};

const FALLBACK_DURATION = 180;
const MAX_CAPTURE_SIZE = 4096;

export function PaperBurn({
  active,
  children,
  className,
  duration = 900,
  onBurnComplete,
  ...props
}: PaperBurnProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const paperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const callbackRef = useRef(onBurnComplete);
  const [burnState, setBurnState] = useState<BurnState>("idle");
  const burnDuration = Math.max(360, duration);

  useEffect(() => {
    callbackRef.current = onBurnComplete;
  }, [onBurnComplete]);

  useEffect(() => {
    const root = rootRef.current;
    const paper = paperRef.current;
    const canvas = canvasRef.current;

    if (!root || !paper || !canvas) {
      return;
    }

    const paperElement = paper;
    const canvasElement = canvas;
    let cancelled = false;
    let disposeRenderer: (() => void) | undefined;
    let fallbackTimeout = 0;

    function completeAfterFallback() {
      setBurnState("fading");
      fallbackTimeout = window.setTimeout(() => {
        if (cancelled) {
          return;
        }

        setBurnState("burnt");
        callbackRef.current?.();
      }, FALLBACK_DURATION);
    }

    if (!active) {
      setBurnState("idle");
      canvasElement.width = 1;
      canvasElement.height = 1;
      canvasElement.removeAttribute("style");
      return;
    }

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      completeAfterFallback();

      return () => {
        cancelled = true;
        window.clearTimeout(fallbackTimeout);
      };
    }

    setBurnState("preparing");

    async function beginBurn() {
      try {
        await document.fonts.ready;

        if (cancelled) {
          return;
        }

        const bounds = paperElement.getBoundingClientRect();
        const contentWidth = Math.max(1, bounds.width);
        const contentHeight = Math.max(1, bounds.height);
        const padding = Math.max(
          48,
          Math.min(96, Math.min(contentWidth, contentHeight) * 0.3),
        );
        const viewportWidth = contentWidth + padding * 2;
        const viewportHeight = contentHeight + padding * 2;
        const pixelRatio = Math.max(
          1,
          Math.min(
            window.devicePixelRatio,
            2,
            MAX_CAPTURE_SIZE / contentWidth,
            MAX_CAPTURE_SIZE / contentHeight,
            MAX_CAPTURE_SIZE / viewportWidth,
            MAX_CAPTURE_SIZE / viewportHeight,
          ),
        );
        const { toCanvas } = await import("html-to-image");
        const textureSource = await toCanvas(paperElement, {
          cacheBust: true,
          pixelRatio,
          skipAutoScale: false,
        });

        if (cancelled) {
          return;
        }

        canvasElement.style.left = `${-padding}px`;
        canvasElement.style.top = `${-padding}px`;
        canvasElement.style.width = `${viewportWidth}px`;
        canvasElement.style.height = `${viewportHeight}px`;
        canvasElement.width = Math.ceil(viewportWidth * pixelRatio);
        canvasElement.height = Math.ceil(viewportHeight * pixelRatio);
        disposeRenderer = startPaperBurnRenderer({
          canvas: canvasElement,
          contentHeight,
          contentWidth,
          duration: burnDuration,
          onComplete: () => {
            if (cancelled) {
              return;
            }

            setBurnState("burnt");
            callbackRef.current?.();
          },
          pixelRatio,
          textureSource,
          viewportHeight,
          viewportWidth,
        });
        setBurnState("burning");
      } catch {
        if (!cancelled) {
          completeAfterFallback();
        }
      }
    }

    void beginBurn();

    return () => {
      cancelled = true;
      window.clearTimeout(fallbackTimeout);
      disposeRenderer?.();
    };
  }, [active, burnDuration]);

  return (
    <div
      {...props}
      className={cn(styles.root, className)}
      data-burn-state={burnState}
      ref={rootRef}
    >
      <div className={styles.paper} ref={paperRef}>
        {children}
      </div>
      <div aria-hidden="true" className={styles.canvasLayer}>
        <canvas className={styles.canvas} ref={canvasRef} />
      </div>
    </div>
  );
}
