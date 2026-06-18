"use client";

import {
  ArrowCounterClockwiseIcon,
  CheckIcon,
  CopyIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react/dist/ssr";
import { type CSSProperties, useMemo, useState } from "react";
import Button from "@/components/public/Button";
import { cn } from "@/helpers/classname-helper";

type PolygonPoint = {
  id: string;
  x: string;
  y: string;
};

type SvgPoint = {
  id: string;
  x: number;
  y: number;
};

type ParsedCoordinate = Omit<PolygonPoint, "id">;

type ValidParseResult = {
  valid: true;
  clipPath: string;
  css: string;
  points: PolygonPoint[];
  svgPoints: SvgPoint[] | null;
};

type InvalidParseResult = {
  valid: false;
  message: string;
};

type ParseResult = ValidParseResult | InvalidParseResult;

const DEFAULT_INPUT = `clip-path: polygon(
  0 0,
  100% 0,
  100% 90%,
  90% 100%,
  0 100%
);`;

const COORDINATE_PATTERN =
  /^-?(?:\d+|\d*\.\d+)(?:%|px|rem|em|vh|vw|vmin|vmax)?$/i;
const CALC_FUNCTION_PATTERN = /^(?:calc|min|max|clamp)\(([\s\S]+)\)$/i;
const CALC_ALLOWED_CHARACTERS_PATTERN = /^[\d.%+\-*/(),\sA-Za-z]+$/;
const CALC_ALLOWED_IDENTIFIERS = new Set([
  "calc",
  "clamp",
  "em",
  "max",
  "min",
  "px",
  "rem",
  "vh",
  "vmax",
  "vmin",
  "vw",
]);

function isZeroCoordinate(value: string) {
  return /^-?0(?:\.0+)?(?:%|px|rem|em|vh|vw|vmin|vmax)?$/i.test(value);
}

function isSupportedCoordinate(value: string) {
  if (!COORDINATE_PATTERN.test(value)) {
    return isSupportedCalculation(value);
  }

  const hasUnit = /(?:%|px|rem|em|vh|vw|vmin|vmax)$/i.test(value);

  return hasUnit || isZeroCoordinate(value);
}

function hasBalancedParentheses(value: string) {
  let depth = 0;

  for (const character of value) {
    if (character === "(") {
      depth += 1;
    }

    if (character === ")") {
      depth -= 1;
    }

    if (depth < 0) {
      return false;
    }
  }

  return depth === 0;
}

function isSupportedCalculation(value: string) {
  const calculationMatch = value.match(CALC_FUNCTION_PATTERN);

  if (!calculationMatch?.[1] || !hasBalancedParentheses(value)) {
    return false;
  }

  const expression = calculationMatch[1];

  if (!CALC_ALLOWED_CHARACTERS_PATTERN.test(expression)) {
    return false;
  }

  const identifiers = expression.match(/[A-Za-z]+/g) ?? [];

  return identifiers.every((identifier) =>
    CALC_ALLOWED_IDENTIFIERS.has(identifier.toLowerCase()),
  );
}

function extractPolygonContent(value: string) {
  const polygonMatch = value.match(/polygon\s*\(/i);

  if (polygonMatch?.index !== undefined) {
    const openParenthesisIndex = value.indexOf("(", polygonMatch.index);
    let depth = 0;

    for (let index = openParenthesisIndex; index < value.length; index += 1) {
      const character = value[index];

      if (character === "(") {
        depth += 1;
      }

      if (character === ")") {
        depth -= 1;
      }

      if (depth === 0) {
        return value.slice(openParenthesisIndex + 1, index).trim();
      }
    }

    return "";
  }

  return value
    .replace(/^\s*clip-path\s*:\s*/i, "")
    .replace(/[;}]\s*$/g, "")
    .trim();
}

function splitTopLevelCommas(value: string) {
  const parts: string[] = [];
  let currentPart = "";
  let depth = 0;

  for (const character of value) {
    if (character === "(") {
      depth += 1;
    }

    if (character === ")") {
      depth -= 1;
    }

    if (depth < 0) {
      return null;
    }

    if (character === "," && depth === 0) {
      parts.push(currentPart.trim());
      currentPart = "";
      continue;
    }

    currentPart += character;
  }

  if (depth !== 0) {
    return null;
  }

  parts.push(currentPart.trim());

  return parts.filter(Boolean);
}

function splitCoordinatePair(value: string) {
  const coordinates: string[] = [];
  let currentCoordinate = "";
  let depth = 0;

  for (const character of value) {
    if (character === "(") {
      depth += 1;
      currentCoordinate += character;
      continue;
    }

    if (character === ")") {
      depth -= 1;

      if (depth < 0) {
        return null;
      }

      currentCoordinate += character;
      continue;
    }

    if (/\s/.test(character) && depth === 0) {
      if (currentCoordinate) {
        coordinates.push(currentCoordinate);
        currentCoordinate = "";
      }

      continue;
    }

    currentCoordinate += character;
  }

  if (depth !== 0) {
    return null;
  }

  if (currentCoordinate) {
    coordinates.push(currentCoordinate);
  }

  return coordinates.length === 2 ? coordinates : null;
}

function formatCss(points: PolygonPoint[]) {
  const pointLines = points
    .map((point, index) => {
      const suffix = index === points.length - 1 ? "" : ",";

      return `  ${point.x} ${point.y}${suffix}`;
    })
    .join("\n");

  return `clip-path: polygon(\n${pointLines}\n);`;
}

function toSvgCoordinate(value: string) {
  if (value.endsWith("%")) {
    return Number.parseFloat(value);
  }

  if (isZeroCoordinate(value)) {
    return 0;
  }

  return null;
}

function addPointIds(points: ParsedCoordinate[]) {
  const occurrences = new Map<string, number>();

  return points.map((point) => {
    const baseId = `${point.x}:${point.y}`;
    const occurrence = occurrences.get(baseId) ?? 0;

    occurrences.set(baseId, occurrence + 1);

    return {
      ...point,
      id: `${baseId}:${occurrence}`,
    };
  });
}

function parsePolygonInput(value: string): ParseResult {
  const content = extractPolygonContent(value);

  if (!content) {
    return {
      valid: false,
      message: "Add at least three coordinate pairs.",
    };
  }

  const pointParts = splitTopLevelCommas(content);

  if (!pointParts) {
    return {
      valid: false,
      message: "Check the parentheses in your polygon.",
    };
  }

  const points = pointParts
    .map((point) => point.trim())
    .map((point): ParsedCoordinate | null => {
      const coordinates = splitCoordinatePair(point);

      if (!coordinates) {
        return null;
      }

      const [x, y] = coordinates;

      if (!x || !y || !isSupportedCoordinate(x) || !isSupportedCoordinate(y)) {
        return null;
      }

      return { x, y };
    });

  if (points.some((point) => point === null)) {
    return {
      valid: false,
      message: "Use length, percentage, or calc() pairs separated by commas.",
    };
  }

  const validPoints = addPointIds(
    points.filter((point): point is ParsedCoordinate => Boolean(point)),
  );

  if (validPoints.length < 3) {
    return {
      valid: false,
      message: "A polygon needs at least three points.",
    };
  }

  const svgPoints = validPoints.map((point) => {
    const x = toSvgCoordinate(point.x);
    const y = toSvgCoordinate(point.y);

    if (x === null || y === null) {
      return null;
    }

    return { id: point.id, x, y };
  });

  return {
    valid: true,
    clipPath: `polygon(${validPoints
      .map((point) => `${point.x} ${point.y}`)
      .join(", ")})`,
    css: formatCss(validPoints),
    points: validPoints,
    svgPoints: svgPoints.some((point) => point === null)
      ? null
      : svgPoints.filter((point): point is SvgPoint => Boolean(point)),
  };
}

const parsedDefault = parsePolygonInput(DEFAULT_INPUT);
const DEFAULT_RESULT: ValidParseResult = parsedDefault.valid
  ? parsedDefault
  : {
      valid: true,
      clipPath: "polygon(0 0, 100% 0, 100% 90%, 90% 100%, 0 100%)",
      css: DEFAULT_INPUT,
      points: [
        { id: "0:0:0", x: "0", y: "0" },
        { id: "100%:0:0", x: "100%", y: "0" },
        { id: "100%:90%:0", x: "100%", y: "90%" },
        { id: "90%:100%:0", x: "90%", y: "100%" },
        { id: "0:100%:0", x: "0", y: "100%" },
      ],
      svgPoints: [
        { id: "0:0:0", x: 0, y: 0 },
        { id: "100%:0:0", x: 100, y: 0 },
        { id: "100%:90%:0", x: 100, y: 90 },
        { id: "90%:100%:0", x: 90, y: 100 },
        { id: "0:100%:0", x: 0, y: 100 },
      ],
    };

function PreviewOverlay({ points }: { points: SvgPoint[] | null }) {
  if (!points) {
    return null;
  }

  const polygonPoints = points
    .map((point) => `${point.x},${point.y}`)
    .join(" ");

  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-visible text-grayscale-12"
      preserveAspectRatio="none"
      viewBox="0 0 100 100"
    >
      <polygon
        fill="none"
        points={polygonPoints}
        stroke="currentColor"
        strokeDasharray="3 3"
        strokeWidth="1.25"
        vectorEffect="non-scaling-stroke"
      />
      {points.map((point) => (
        <circle
          cx={point.x}
          cy={point.y}
          fill="currentColor"
          key={point.id}
          r="1.5"
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </svg>
  );
}

export function ClipPathDemo() {
  const [input, setInput] = useState(DEFAULT_INPUT);
  const [copied, setCopied] = useState(false);
  const parsed = useMemo(() => parsePolygonInput(input), [input]);
  const preview = parsed.valid ? parsed : DEFAULT_RESULT;
  const previewStyle: CSSProperties = {
    clipPath: preview.clipPath,
    WebkitClipPath: preview.clipPath,
  };

  async function handleCopy() {
    if (!parsed.valid) {
      return;
    }

    await navigator.clipboard.writeText(parsed.css);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }

  return (
    <section className="grid min-h-[34rem] overflow-hidden rounded-xl border border-grayscale-3 bg-grayscale-2 p-1.5 dark:border-grayscale-4 dark:bg-grayscale-2 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <div className="flex min-w-0 flex-col gap-4 rounded-lg border border-grayscale-3 bg-grayscale-1 p-4 dark:border-grayscale-5 dark:bg-grayscale-3">
        <div className="flex items-center justify-between gap-3">
          <label
            className="font-medium text-grayscale-11 text-sm"
            htmlFor="clip-path-input"
          >
            Polygon
          </label>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              aria-label="Reset polygon"
              className="items-center"
              onClick={() => {
                setInput(DEFAULT_INPUT);
                setCopied(false);
              }}
              title="Reset polygon"
              type="button"
              variant="secondary"
            >
              <ArrowCounterClockwiseIcon size={15} weight="bold" />
              Reset
            </Button>
            <Button
              aria-label="Copy CSS"
              className="items-center"
              disabled={!parsed.valid}
              onClick={handleCopy}
              title="Copy CSS"
              type="button"
              variant="primary"
            >
              {copied ? (
                <CheckIcon size={15} weight="bold" />
              ) : (
                <CopyIcon size={15} weight="bold" />
              )}
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
        </div>

        <textarea
          className="min-h-72 w-full resize-y rounded-lg border border-grayscale-3 bg-white p-3 font-mono text-grayscale-12 text-sm leading-6 outline-none transition-colors focus:border-grayscale-6 dark:border-grayscale-5 dark:bg-grayscale-2 dark:focus:border-grayscale-7"
          id="clip-path-input"
          onChange={(event) => setInput(event.target.value)}
          spellCheck={false}
          value={input}
        />

        <div
          className={cn(
            "flex items-start gap-2 rounded-lg border px-3 py-2 text-sm",
            parsed.valid
              ? "border-grass-5 bg-grass-2 text-grass-11"
              : "border-tomato-5 bg-tomato-2 text-tomato-11",
          )}
        >
          {parsed.valid ? (
            <CheckIcon className="mt-0.5 shrink-0" size={16} weight="bold" />
          ) : (
            <WarningCircleIcon
              className="mt-0.5 shrink-0"
              size={16}
              weight="bold"
            />
          )}
          <p>
            {parsed.valid
              ? `${parsed.points.length} points ready`
              : parsed.message}
          </p>
        </div>

        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {preview.points.map((point, index) => (
            <div
              className="flex min-w-0 items-center gap-2 rounded-md border border-grayscale-3 bg-white px-2.5 py-2 dark:border-grayscale-5 dark:bg-grayscale-2"
              key={point.id}
            >
              <span className="flex size-5 shrink-0 items-center justify-center rounded-sm bg-grayscale-3 font-mono text-grayscale-10 text-tiny dark:bg-grayscale-5">
                {index + 1}
              </span>
              <code className="truncate font-mono text-grayscale-11 text-xs">
                {point.x} {point.y}
              </code>
            </div>
          ))}
        </div>
      </div>

      <div className="flex min-h-[28rem] min-w-0 flex-col gap-4 p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-medium text-grayscale-11 text-sm">Preview</h2>
          <code className="max-w-[70%] truncate rounded-md border border-grayscale-3 bg-white px-2 py-1 font-mono text-grayscale-10 text-xs dark:border-grayscale-5 dark:bg-grayscale-3">
            {preview.clipPath}
          </code>
        </div>

        <div className="flex flex-1 items-center justify-center">
          <div className="relative aspect-square w-full max-w-[32rem] rounded-lg border border-grayscale-3 bg-[linear-gradient(to_right,var(--color-grayscale-3)_1px,transparent_1px),linear-gradient(to_bottom,var(--color-grayscale-3)_1px,transparent_1px)] [background-size:24px_24px] dark:border-grayscale-5 dark:bg-[linear-gradient(to_right,var(--color-grayscale-5)_1px,transparent_1px),linear-gradient(to_bottom,var(--color-grayscale-5)_1px,transparent_1px)]">
            <div className="absolute inset-[10%] border border-grayscale-8 border-dashed" />
            <div
              aria-label="clip-path preview"
              className={cn(
                "absolute inset-[10%] bg-teal-9 shadow-xl transition-opacity dark:bg-teal-10",
                parsed.valid ? "opacity-100" : "opacity-40",
              )}
              role="img"
              style={previewStyle}
            />
            <div className="absolute inset-[10%]">
              <PreviewOverlay points={preview.svgPoints} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
