"use client";

import {
  ArrowCounterClockwiseIcon,
  CopyIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState } from "react";
import Button from "@/components/public/Button";

type Point = {
  x: number;
  y: number;
};

type Stroke = Point[];

const viewBoxWidth = 1000;
const viewBoxHeight = 420;
const viewBox = `0 0 ${viewBoxWidth} ${viewBoxHeight}`;
const minPointDistance = 3;

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

export function SignatureDoodler() {
  const svgRef = useRef<SVGSVGElement>(null);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [activeStroke, setActiveStroke] = useState<Stroke | null>(null);
  const [copied, setCopied] = useState<"path" | "component" | null>(null);
  const [isTrackpadMode, setIsTrackpadMode] = useState(false);

  const exportStrokes = useMemo(
    () => (activeStroke ? [...strokes, activeStroke] : strokes),
    [activeStroke, strokes],
  );
  const path = useMemo(() => strokesToPath(exportStrokes), [exportStrokes]);
  const previewPath = path;
  const componentSnippet = `<Signature\n  path="${path}"\n  viewBox="${viewBox}"\n  duration={2}\n  strokeWidth={10}\n/>`;

  function beginStroke(event: React.PointerEvent<SVGSVGElement>) {
    if (isTrackpadMode) {
      return;
    }

    if (event.button !== 0 && event.pointerType === "mouse") {
      return;
    }

    const svg = svgRef.current;

    if (!svg) {
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    setCopied(null);
    setActiveStroke([getSvgPoint(svg, event)]);
  }

  function continueStroke(event: React.PointerEvent<SVGSVGElement>) {
    const svg = svgRef.current;

    if (!svg) {
      return;
    }

    const nextPoint = getSvgPoint(svg, event);

    if (isTrackpadMode && !activeStroke) {
      setCopied(null);
      setActiveStroke([nextPoint]);
      return;
    }

    if (!activeStroke) {
      return;
    }

    const previousPoint = activeStroke[activeStroke.length - 1];

    if (distance(previousPoint, nextPoint) < minPointDistance) {
      return;
    }

    setActiveStroke([...activeStroke, nextPoint]);
  }

  function endStroke(event: React.PointerEvent<SVGSVGElement>) {
    if (!activeStroke) {
      return;
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    setStrokes([...strokes, activeStroke]);
    setActiveStroke(null);
  }

  async function copyText(value: string, type: "path" | "component") {
    if (!value) {
      return;
    }

    await navigator.clipboard.writeText(value);
    setCopied(type);
  }

  function clear() {
    setStrokes([]);
    setActiveStroke(null);
    setCopied(null);
  }

  function undo() {
    setStrokes((currentStrokes) => currentStrokes.slice(0, -1));
    setCopied(null);
  }

  function toggleTrackpadMode() {
    if (activeStroke) {
      setStrokes([...strokes, activeStroke]);
      setActiveStroke(null);
    }

    setIsTrackpadMode((currentMode) => !currentMode);
    setCopied(null);
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
          setStrokes((currentStrokes) => [...currentStrokes, activeStroke]);
          setActiveStroke(null);
        }

        setIsTrackpadMode((currentMode) => !currentMode);
        setCopied(null);
      }

      if (event.key === "Escape" && activeStroke) {
        event.preventDefault();
        setActiveStroke(null);
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [activeStroke]);

  return (
    <section className="grid gap-1.5 rounded-[16px] border border-grayscale-3 bg-grayscale-2 p-1.5 dark:border-grayscale-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="overflow-hidden rounded-[13px] border border-grayscale-3 bg-grayscale-1 small-shadow dark:border-grayscale-4 dark:bg-grayscale-3 dark:shadow-none">
        <svg
          aria-label="Signature drawing pad"
          className="block aspect-[1000/420] w-full touch-none bg-white text-grayscale-12 dark:bg-grayscale-1"
          onPointerCancel={endStroke}
          onPointerDown={beginStroke}
          onPointerLeave={endStroke}
          onPointerMove={continueStroke}
          onPointerUp={endStroke}
          ref={svgRef}
          role="img"
          viewBox={viewBox}
        >
          <defs>
            <pattern
              height="24"
              id="signature-grid"
              patternUnits="userSpaceOnUse"
              width="24"
            >
              <path
                d="M24 0H0V24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1"
              />
            </pattern>
          </defs>
          <rect
            className="text-grayscale-3"
            fill="url(#signature-grid)"
            height="100%"
            width="100%"
          />
          {previewPath ? (
            <path
              d={previewPath}
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={10}
            />
          ) : (
            <text
              className="fill-grayscale-9 font-mono text-[13px] uppercase tracking-[0.08em]"
              dominantBaseline="middle"
              textAnchor="middle"
              x={viewBoxWidth / 2}
              y={viewBoxHeight / 2}
            >
              Draw here
            </text>
          )}
        </svg>

        <div className="flex flex-col gap-3 border-grayscale-3 border-t p-4 dark:border-grayscale-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-1.5">
            <Button
              aria-pressed={isTrackpadMode}
              onClick={toggleTrackpadMode}
              type="button"
              variant={isTrackpadMode ? "primary" : "secondary"}
            >
              Trackpad mode
            </Button>
            <Button
              aria-label="Undo last stroke"
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
              disabled={strokes.length === 0 && !activeStroke}
              onClick={clear}
              type="button"
              variant="secondary"
            >
              <TrashIcon aria-hidden="true" size={15} weight="bold" />
              Clear
            </Button>
          </div>

          <p className="font-mono text-[11px] text-grayscale-10 uppercase">
            {isTrackpadMode ? "Hover to draw" : "Click and drag"} · Space
            toggles · {strokes.length} stroke
            {strokes.length === 1 ? "" : "s"}
          </p>
        </div>
      </div>

      <div className="flex min-w-0 flex-col gap-1.5">
        <div className="overflow-hidden rounded-[13px] border border-grayscale-3 bg-grayscale-1 small-shadow dark:border-grayscale-4 dark:bg-grayscale-3 dark:shadow-none">
          <div className="flex items-center justify-between gap-3 border-grayscale-3 border-b p-3 dark:border-grayscale-4">
            <p className="font-medium text-grayscale-12 text-sm">SVG Path</p>
            <Button
              aria-label="Copy SVG path"
              className="text-xs"
              disabled={!path}
              onClick={() => copyText(path, "path")}
              type="button"
              variant="secondary"
            >
              <CopyIcon aria-hidden="true" size={15} weight="bold" />
              {copied === "path" ? "Copied" : "Copy"}
            </Button>
          </div>
          <textarea
            className="h-44 w-full resize-none border-0 bg-transparent p-3 font-mono text-grayscale-11 text-xs outline-none placeholder:text-grayscale-9"
            placeholder="Path data appears here"
            readOnly
            value={path}
          />
        </div>

        <div className="overflow-hidden rounded-[13px] border border-grayscale-3 bg-grayscale-1 small-shadow dark:border-grayscale-4 dark:bg-grayscale-3 dark:shadow-none">
          <div className="flex items-center justify-between gap-3 border-grayscale-3 border-b p-3 dark:border-grayscale-4">
            <p className="font-medium text-grayscale-12 text-sm">
              Signature Props
            </p>
            <Button
              aria-label="Copy signature component props"
              className="text-xs"
              disabled={!path}
              onClick={() => copyText(componentSnippet, "component")}
              type="button"
              variant="secondary"
            >
              <CopyIcon aria-hidden="true" size={15} weight="bold" />
              {copied === "component" ? "Copied" : "Copy"}
            </Button>
          </div>
          <textarea
            className="h-40 w-full resize-none border-0 bg-transparent p-3 font-mono text-grayscale-11 text-xs outline-none placeholder:text-grayscale-9"
            placeholder={`viewBox="${viewBox}"`}
            readOnly
            value={path ? componentSnippet : ""}
          />
        </div>
      </div>
    </section>
  );
}
