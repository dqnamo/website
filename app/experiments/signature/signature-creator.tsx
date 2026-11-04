"use client";

import {
  ArrowClockwiseIcon,
  ArrowCounterClockwiseIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Button from "@/components/public/Button";
import { Signature } from "@/components/Signature";

type Point = {
  x: number;
  y: number;
};

type Stroke = Point[];

const viewBoxWidth = 1000;
const viewBoxHeight = 320;
const viewBox = `0 0 ${viewBoxWidth} ${viewBoxHeight}`;
const minPointDistance = 3;
const defaultSmoothing = 42;

function round(value: number) {
  return Math.round(value * 10) / 10;
}

function distance(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function midpoint(a: Point, b: Point): Point {
  return {
    x: round((a.x + b.x) / 2),
    y: round((a.y + b.y) / 2),
  };
}

function pointToString(point: Point) {
  return `${round(point.x)} ${round(point.y)}`;
}

function interpolate(a: Point, b: Point, ratio: number): Point {
  return {
    x: round(a.x + (b.x - a.x) * ratio),
    y: round(a.y + (b.y - a.y) * ratio),
  };
}

function smoothStroke(stroke: Stroke, amount: number): Stroke {
  if (amount <= 0 || stroke.length < 3) {
    return stroke;
  }

  const ratio = 0.1 + (amount / 100) * 0.22;
  const iterations = Math.max(1, Math.ceil((amount / 100) * 3));
  let smoothedStroke = stroke;

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const nextStroke: Stroke = [smoothedStroke[0]];

    for (let index = 0; index < smoothedStroke.length - 1; index += 1) {
      const currentPoint = smoothedStroke[index];
      const nextPoint = smoothedStroke[index + 1];

      nextStroke.push(interpolate(currentPoint, nextPoint, ratio));
      nextStroke.push(interpolate(currentPoint, nextPoint, 1 - ratio));
    }

    nextStroke.push(smoothedStroke[smoothedStroke.length - 1]);
    smoothedStroke = nextStroke;
  }

  return smoothedStroke;
}

function smoothStrokes(strokes: Stroke[], amount: number) {
  return strokes.map((stroke) => smoothStroke(stroke, amount));
}

function strokeToPath(stroke: Stroke) {
  if (stroke.length === 0) {
    return "";
  }

  if (stroke.length === 1) {
    const point = stroke[0];
    return `M${pointToString(point)} l0.1 0`;
  }

  if (stroke.length === 2) {
    return `M${pointToString(stroke[0])} L${pointToString(stroke[1])}`;
  }

  const segments = [`M${pointToString(stroke[0])}`];

  for (let index = 1; index < stroke.length - 1; index += 1) {
    const control = stroke[index];
    const end = midpoint(stroke[index], stroke[index + 1]);
    segments.push(`Q${pointToString(control)} ${pointToString(end)}`);
  }

  segments.push(`L${pointToString(stroke[stroke.length - 1])}`);
  return segments.join(" ");
}

function strokesToPath(strokes: Stroke[]) {
  return strokes.map(strokeToPath).filter(Boolean).join(" ");
}

function getSvgPoint(svg: SVGSVGElement, event: React.PointerEvent) {
  const rect = svg.getBoundingClientRect();

  return {
    x: round(((event.clientX - rect.left) / rect.width) * viewBoxWidth),
    y: round(((event.clientY - rect.top) / rect.height) * viewBoxHeight),
  };
}

type SignatureCreatorProps = {
  onPathChange?: (path: string) => void;
};

export function SignatureCreator({ onPathChange }: SignatureCreatorProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [activeStroke, setActiveStroke] = useState<Stroke | null>(null);
  const [runKey, setRunKey] = useState(0);
  const [isDrawing, setIsDrawing] = useState(false);
  const [smoothing, setSmoothing] = useState(defaultSmoothing);

  const drawStrokes = useMemo(
    () => (activeStroke ? [...strokes, activeStroke] : strokes),
    [activeStroke, strokes],
  );
  const smoothedDrawStrokes = useMemo(
    () => smoothStrokes(drawStrokes, smoothing),
    [drawStrokes, smoothing],
  );
  const smoothedStrokes = useMemo(
    () => smoothStrokes(strokes, smoothing),
    [strokes, smoothing],
  );
  const drawPath = useMemo(
    () => strokesToPath(smoothedDrawStrokes),
    [smoothedDrawStrokes],
  );
  const committedPath = useMemo(
    () => strokesToPath(smoothedStrokes),
    [smoothedStrokes],
  );

  useEffect(() => {
    onPathChange?.(committedPath);
  }, [committedPath, onPathChange]);

  const commitActiveStroke = useCallback(() => {
    setActiveStroke((currentStroke) => {
      if (!currentStroke) {
        return null;
      }

      setStrokes((currentStrokes) => [...currentStrokes, currentStroke]);
      setRunKey((currentRunKey) => currentRunKey + 1);
      return null;
    });
  }, []);

  function beginStroke(event: React.PointerEvent<SVGSVGElement>) {
    if (event.pointerType === "mouse" && event.button !== 0) {
      return;
    }

    const svg = svgRef.current;

    if (!svg) {
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    setIsDrawing(true);
    setActiveStroke([getSvgPoint(svg, event)]);
  }

  function continueStroke(event: React.PointerEvent<SVGSVGElement>) {
    const shouldDraw =
      isDrawing || event.currentTarget.hasPointerCapture(event.pointerId);

    if (!shouldDraw) {
      return;
    }

    const svg = svgRef.current;

    if (!svg) {
      return;
    }

    const nextPoint = getSvgPoint(svg, event);

    setActiveStroke((currentStroke) => {
      if (!currentStroke) {
        return [nextPoint];
      }

      const previousPoint = currentStroke[currentStroke.length - 1];

      if (distance(previousPoint, nextPoint) < minPointDistance) {
        return currentStroke;
      }

      return [...currentStroke, nextPoint];
    });
  }

  function endStroke(event: React.PointerEvent<SVGSVGElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    setIsDrawing(false);
    commitActiveStroke();
  }

  function cancelStroke(event: React.PointerEvent<SVGSVGElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    setIsDrawing(false);
    setActiveStroke(null);
  }

  function clear() {
    setStrokes([]);
    setActiveStroke(null);
    setIsDrawing(false);
  }

  function undo() {
    setStrokes((currentStrokes) => currentStrokes.slice(0, -1));
    setRunKey((currentRunKey) => currentRunKey + 1);
  }

  function replay() {
    setRunKey((currentRunKey) => currentRunKey + 1);
  }

  function updateSmoothing(event: React.ChangeEvent<HTMLInputElement>) {
    setSmoothing(Number(event.currentTarget.value));
    setRunKey((currentRunKey) => currentRunKey + 1);
  }

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target;
      const isTypingTarget =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target instanceof HTMLElement && target.isContentEditable);

      if (isTypingTarget) {
        return;
      }

      if (event.code === "Space") {
        event.preventDefault();

        if (activeStroke) {
          commitActiveStroke();
        }

        setIsDrawing((currentIsDrawing) => !currentIsDrawing);
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [activeStroke, commitActiveStroke]);

  return (
    <div className="w-full overflow-hidden rounded-[13px] border border-grayscale-3 bg-grayscale-1 small-shadow dark:border-grayscale-4 dark:bg-grayscale-3 dark:shadow-none">
      <div className="flex items-center justify-between gap-3 border-grayscale-3 border-b p-2 dark:border-grayscale-4">
        <span className="pl-1 font-mono font-semibold text-[10px] text-grayscale-10 uppercase leading-none">
          Draw
        </span>
        <div className="flex gap-1.5">
          <Button
            aria-label="Undo last stroke"
            className="text-xs"
            disabled={strokes.length === 0}
            onClick={undo}
            type="button"
            variant="secondary"
          >
            <ArrowCounterClockwiseIcon
              aria-hidden="true"
              size={15}
              weight="bold"
            />
            Undo
          </Button>
          <Button
            aria-label="Clear signature"
            className="text-xs"
            disabled={strokes.length === 0 && !activeStroke}
            onClick={clear}
            type="button"
            variant="secondary"
          >
            <TrashIcon aria-hidden="true" size={15} weight="bold" />
            Clear
          </Button>
        </div>
      </div>

      <div className="relative aspect-[1000/320] w-full">
        <svg
          aria-label="Signature drawing pad"
          className="absolute inset-0 block h-full w-full touch-none text-grayscale-12"
          onPointerCancel={cancelStroke}
          onPointerDown={beginStroke}
          onPointerMove={continueStroke}
          onPointerUp={endStroke}
          ref={svgRef}
          role="img"
          viewBox={viewBox}
        >
          <defs>
            <pattern
              height="24"
              id="signature-creator-grid"
              patternUnits="userSpaceOnUse"
              width="24"
            >
              <circle
                className="fill-grayscale-4 dark:fill-grayscale-5"
                cx="2"
                cy="2"
                r="1.5"
              />
            </pattern>
          </defs>
          <rect
            fill="url(#signature-creator-grid)"
            height="100%"
            width="100%"
          />
          {drawPath ? (
            <path
              d={drawPath}
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={7}
            />
          ) : null}
        </svg>

        <div className="pointer-events-none absolute right-2 bottom-2 flex items-center gap-1.5 rounded-full border border-grayscale-3 bg-grayscale-1/80 px-2 py-1 backdrop-blur-sm dark:border-grayscale-4 dark:bg-grayscale-3/80">
          <span
            className={`size-1.5 rounded-full transition-colors ${
              isDrawing ? "bg-red-9" : "bg-grayscale-8"
            }`}
          />
          <span className="relative inline-grid overflow-hidden text-[11px] text-grayscale-10">
            <AnimatePresence initial={false} mode="popLayout">
              <motion.span
                animate={{ opacity: 1, transform: "translateY(0px)" }}
                className="col-start-1 row-start-1 block whitespace-nowrap"
                exit={{ opacity: 0, transform: "translateY(-8px)" }}
                initial={{ opacity: 0, transform: "translateY(8px)" }}
                key={isDrawing ? "stop" : "start"}
                transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              >
                {isDrawing ? "Drawing" : "Draw in this area"}
              </motion.span>
            </AnimatePresence>
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-2 border-grayscale-3 border-t px-3 py-2 dark:border-grayscale-4 sm:flex-row sm:items-center sm:justify-between">
        <label
          className="font-mono font-semibold text-[10px] text-grayscale-10 uppercase leading-none"
          htmlFor="signature-smoothing"
        >
          Smoothing
        </label>
        <div className="flex min-w-0 flex-1 items-center gap-2 sm:max-w-72">
          <input
            aria-label="Signature smoothing"
            className="h-5 min-w-0 flex-1 accent-grayscale-12"
            id="signature-smoothing"
            max="100"
            min="0"
            onChange={updateSmoothing}
            type="range"
            value={smoothing}
          />
          <span className="w-8 text-right font-mono text-[11px] text-grayscale-10 tabular-nums">
            {smoothing}
          </span>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 border-grayscale-3 border-t border-b p-2 dark:border-grayscale-4">
        <span className="pl-1 font-mono font-semibold text-[10px] text-grayscale-10 uppercase leading-none">
          Animated
        </span>
        <Button
          aria-label="Replay signature animation"
          className="text-xs"
          disabled={!committedPath}
          onClick={replay}
          type="button"
          variant="secondary"
        >
          <ArrowClockwiseIcon aria-hidden="true" size={15} weight="bold" />
          Replay
        </Button>
      </div>

      <div className="flex aspect-[1000/320] w-full items-center justify-center p-6 text-grayscale-12">
        {committedPath ? (
          <Signature
            key={runKey}
            duration={1.4}
            path={committedPath}
            strokeWidth={7}
            viewBox={viewBox}
          />
        ) : null}
      </div>
    </div>
  );
}
