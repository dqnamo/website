"use client";

import {
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { cn } from "@/helpers/classname-helper";
import type {
  JevColorCandidate,
  JevColorComparison,
} from "@/helpers/jev-color-types";
import { findClosestCssColorName } from "./color-name-matcher";
import styles from "./EnhancedColorPicker.module.css";

type HsvaColor = {
  alpha: number;
  hue: number;
  saturation: number;
  value: number;
};

type RgbaColor = {
  alpha: number;
  blue: number;
  green: number;
  red: number;
};

type EnhancedColorPickerProps = {
  className?: string;
  defaultValue?: string;
  label?: string;
  onValueChange?: (value: string) => void;
};

type ParsedColor = {
  color: HsvaColor;
  format: string;
};

type InputState = "empty" | "parsed" | "semantic";
type PickerView = "details" | "picker";

const DEFAULT_COLOR: HsvaColor = {
  alpha: 1,
  hue: 258,
  saturation: 63,
  value: 96,
};

const HEX_COLOR_PATTERN = /^[\da-f]{3,4}([\da-f]{2}){0,2}$/i;
const UNSUPPORTED_COLOR_KEYWORDS = new Set([
  "currentcolor",
  "inherit",
  "initial",
  "revert",
  "revert-layer",
  "unset",
]);

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function sliderThumbPosition(value: number, maximum: number) {
  const progress = clamp(value / maximum, 0, 1);
  return `calc(${progress * 100}% + ${9 - progress * 18}px)`;
}

function normalizeHue(hue: number) {
  return ((hue % 360) + 360) % 360;
}

function hsvToRgb({ hue, saturation, value, alpha }: HsvaColor): RgbaColor {
  const normalizedHue = normalizeHue(hue);
  const normalizedSaturation = clamp(saturation, 0, 100) / 100;
  const normalizedValue = clamp(value, 0, 100) / 100;
  const chroma = normalizedValue * normalizedSaturation;
  const intermediate = chroma * (1 - Math.abs(((normalizedHue / 60) % 2) - 1));
  const offset = normalizedValue - chroma;
  let red = 0;
  let green = 0;
  let blue = 0;

  if (normalizedHue < 60) {
    red = chroma;
    green = intermediate;
  } else if (normalizedHue < 120) {
    red = intermediate;
    green = chroma;
  } else if (normalizedHue < 180) {
    green = chroma;
    blue = intermediate;
  } else if (normalizedHue < 240) {
    green = intermediate;
    blue = chroma;
  } else if (normalizedHue < 300) {
    red = intermediate;
    blue = chroma;
  } else {
    red = chroma;
    blue = intermediate;
  }

  return {
    alpha: clamp(alpha, 0, 1),
    blue: Math.round((blue + offset) * 255),
    green: Math.round((green + offset) * 255),
    red: Math.round((red + offset) * 255),
  };
}

function rgbToHsv({ red, green, blue, alpha }: RgbaColor): HsvaColor {
  const normalizedRed = red / 255;
  const normalizedGreen = green / 255;
  const normalizedBlue = blue / 255;
  const maximum = Math.max(normalizedRed, normalizedGreen, normalizedBlue);
  const minimum = Math.min(normalizedRed, normalizedGreen, normalizedBlue);
  const delta = maximum - minimum;
  let hue = 0;

  if (delta !== 0) {
    if (maximum === normalizedRed) {
      hue = 60 * (((normalizedGreen - normalizedBlue) / delta) % 6);
    } else if (maximum === normalizedGreen) {
      hue = 60 * ((normalizedBlue - normalizedRed) / delta + 2);
    } else {
      hue = 60 * ((normalizedRed - normalizedGreen) / delta + 4);
    }
  }

  return {
    alpha: clamp(alpha, 0, 1),
    hue: normalizeHue(hue),
    saturation: maximum === 0 ? 0 : (delta / maximum) * 100,
    value: maximum * 100,
  };
}

function parseAngle(value: string) {
  const match = value.match(
    /^([+-]?(?:\d+(?:\.\d+)?|\.\d+))(deg|grad|rad|turn)?$/i,
  );

  if (!match) {
    return null;
  }

  const number = Number(match[1]);
  const unit = match[2]?.toLowerCase() ?? "deg";

  if (unit === "turn") {
    return number * 360;
  }

  if (unit === "rad") {
    return number * (180 / Math.PI);
  }

  if (unit === "grad") {
    return number * 0.9;
  }

  return number;
}

function parsePercentage(value: string) {
  const match = value.match(/^([+-]?(?:\d+(?:\.\d+)?|\.\d+))%?$/);
  return match ? clamp(Number(match[1]), 0, 100) : null;
}

function parseAlpha(value: string | undefined) {
  if (value === undefined) {
    return 1;
  }

  const match = value.match(/^([+-]?(?:\d+(?:\.\d+)?|\.\d+))(%?)$/);

  if (!match) {
    return null;
  }

  const alpha = Number(match[1]);
  return clamp(match[2] === "%" ? alpha / 100 : alpha, 0, 1);
}

function parseHsvColor(value: string): ParsedColor | null {
  const match = value.match(/^hsva?\((.*)\)$/i);

  if (!match) {
    return null;
  }

  const hsvParts = match[1].split("/").map((part) => part.trim());

  if (hsvParts.length > 2) {
    return null;
  }

  const [channels, slashAlpha] = hsvParts;
  const values = channels.replaceAll(",", " ").split(/\s+/).filter(Boolean);
  const inlineAlpha = values.length === 4 ? values.pop() : undefined;

  if (values.length !== 3 || (slashAlpha && inlineAlpha)) {
    return null;
  }

  const hue = parseAngle(values[0]);
  const saturation = parsePercentage(values[1]);
  const brightness = parsePercentage(values[2]);
  const alpha = parseAlpha(slashAlpha || inlineAlpha);

  if (
    hue === null ||
    saturation === null ||
    brightness === null ||
    alpha === null
  ) {
    return null;
  }

  return {
    color: {
      alpha,
      hue: normalizeHue(hue),
      saturation,
      value: brightness,
    },
    format: "HSV",
  };
}

function detectFormat(value: string) {
  const normalized = value.trim().toLowerCase();

  if (normalized.startsWith("#") || HEX_COLOR_PATTERN.test(normalized)) {
    return "HEX";
  }

  const functionName = normalized.match(/^([a-z-]+)\(/)?.[1];

  if (functionName) {
    if (functionName === "rgba") {
      return "RGB";
    }

    if (functionName === "hsla") {
      return "HSL";
    }

    return functionName.toUpperCase();
  }

  return "CSS";
}

function parseCssColor(value: string): ParsedColor | null {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return null;
  }

  const hsvColor = parseHsvColor(trimmedValue);

  if (hsvColor) {
    return hsvColor;
  }

  const candidate = HEX_COLOR_PATTERN.test(trimmedValue)
    ? `#${trimmedValue}`
    : trimmedValue;

  if (
    UNSUPPORTED_COLOR_KEYWORDS.has(candidate.toLowerCase()) ||
    typeof CSS === "undefined" ||
    !CSS.supports("color", candidate)
  ) {
    return null;
  }

  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const context = canvas.getContext("2d", { willReadFrequently: true });

  if (!context) {
    return null;
  }

  context.clearRect(0, 0, 1, 1);
  context.fillStyle = candidate;
  context.fillRect(0, 0, 1, 1);
  const [red, green, blue, alpha] = context.getImageData(0, 0, 1, 1).data;

  return {
    color: rgbToHsv({ alpha: alpha / 255, blue, green, red }),
    format: detectFormat(candidate),
  };
}

function componentToHex(value: number) {
  return Math.round(value).toString(16).padStart(2, "0").toUpperCase();
}

function serializeColor(color: HsvaColor) {
  const { red, green, blue, alpha } = hsvToRgb(color);
  const opaqueHex = `#${componentToHex(red)}${componentToHex(green)}${componentToHex(blue)}`;

  if (alpha >= 0.999) {
    return opaqueHex;
  }

  return `${opaqueHex}${componentToHex(alpha * 255)}`;
}

function getInitialColor(defaultValue: string) {
  let hex = defaultValue.trim().replace(/^#/, "");

  if (hex.length === 3 || hex.length === 4) {
    hex = [...hex].map((character) => character.repeat(2)).join("");
  }

  if (!/^([\da-f]{6}|[\da-f]{8})$/i.test(hex)) {
    return DEFAULT_COLOR;
  }

  return rgbToHsv({
    alpha: hex.length === 8 ? Number.parseInt(hex.slice(6, 8), 16) / 255 : 1,
    blue: Number.parseInt(hex.slice(4, 6), 16),
    green: Number.parseInt(hex.slice(2, 4), 16),
    red: Number.parseInt(hex.slice(0, 2), 16),
  });
}

function JevCandidateCard({
  candidate,
  method,
  onApply,
}: {
  candidate: JevColorCandidate;
  method: string;
  onApply: () => void;
}) {
  return (
    <button
      className="group h-full w-full overflow-hidden rounded-xl border border-grayscale-4 bg-grayscale-1 text-left transition hover:border-grayscale-7 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-grayscale-8 focus-visible:ring-offset-2 focus-visible:ring-offset-grayscale-1 dark:border-grayscale-6 dark:bg-grayscale-3"
      onClick={onApply}
      type="button"
    >
      <span
        aria-hidden="true"
        className="block h-20 border-b border-black/10 transition-transform duration-300 group-hover:scale-[1.02]"
        style={{ backgroundColor: candidate.hex }}
      />
      <span className="block p-3">
        <span className="flex items-start justify-between gap-3">
          <span>
            <span className="block font-mono font-semibold text-[9px] text-grayscale-9 uppercase tracking-[0.12em]">
              {method}
            </span>
            <span className="mt-0.5 block font-medium text-[13px] text-grayscale-12 capitalize">
              {candidate.label}
            </span>
          </span>
          <span className="rounded-md bg-grayscale-3 px-1.5 py-1 font-mono font-semibold text-[10px] text-grayscale-11 dark:bg-grayscale-4">
            {candidate.hex}
          </span>
        </span>
        <span className="mt-2 block text-[11px] text-grayscale-9 leading-relaxed">
          {candidate.details.filter(Boolean).join(" · ")}
        </span>
        <span className="mt-2 flex items-center justify-between font-mono text-[9px] text-grayscale-8 uppercase tracking-[0.08em]">
          <span>{Math.round(candidate.confidence * 100)}% signal</span>
          <span className="text-grayscale-10">Apply color →</span>
        </span>
      </span>
    </button>
  );
}

export function EnhancedColorPicker({
  className,
  defaultValue = "#8B5CF6",
  label = "Color",
  onValueChange,
}: EnhancedColorPickerProps) {
  const inputId = useId();
  const colorFieldRef = useRef<HTMLDivElement>(null);
  const aiAbortControllerRef = useRef<AbortController>(null);
  const initialColor = getInitialColor(defaultValue);
  const [color, setColor] = useState(initialColor);
  const [inputValue, setInputValue] = useState(defaultValue);
  const [inputFormat, setInputFormat] = useState("HEX");
  const [inputState, setInputState] = useState<InputState>("parsed");
  const [aiResult, setAiResult] = useState<JevColorComparison | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [activeView, setActiveView] = useState<PickerView>("picker");
  const rgb = hsvToRgb(color);
  const opaqueRgb = `rgb(${rgb.red} ${rgb.green} ${rgb.blue})`;
  const displayColor = `rgb(${rgb.red} ${rgb.green} ${rgb.blue} / ${rgb.alpha})`;

  const applyAiColor = useCallback(
    (candidate: JevColorCandidate) => {
      const parsedColor = parseCssColor(candidate.hex);

      if (!parsedColor) {
        return;
      }

      setColor(parsedColor.color);
      setInputFormat(`JEV ${Math.round(candidate.confidence * 100)}%`);
      setInputState("semantic");
      onValueChange?.(candidate.hex);
    },
    [onValueChange],
  );

  useEffect(
    () => () => {
      aiAbortControllerRef.current?.abort();
    },
    [],
  );

  useEffect(() => {
    const description = inputValue.trim();

    if (inputState !== "semantic" || !description) {
      return;
    }

    let requestController: AbortController | null = null;
    setIsAiLoading(true);
    setAiError(null);

    const debounceTimer = window.setTimeout(async () => {
      requestController = new AbortController();
      aiAbortControllerRef.current = requestController;

      try {
        const response = await fetch(
          "/api/experiments/enchanced-color-picker",
          {
            body: JSON.stringify({ description }),
            headers: { "Content-Type": "application/json" },
            method: "POST",
            signal: requestController.signal,
          },
        );
        const body = (await response.json()) as
          | JevColorComparison
          | { error?: string };

        if (!response.ok || !("candidates" in body)) {
          throw new Error(
            "error" in body && body.error
              ? body.error
              : "Jev could not evaluate that description.",
          );
        }

        if (!requestController.signal.aborted) {
          setAiResult(body);
          applyAiColor(body.candidates.judge);
        }
      } catch (error) {
        if (!requestController.signal.aborted) {
          setAiError(
            error instanceof Error
              ? error.message
              : "Jev could not evaluate that description.",
          );
        }
      } finally {
        if (aiAbortControllerRef.current === requestController) {
          aiAbortControllerRef.current = null;
          setIsAiLoading(false);
        }
      }
    }, 600);

    return () => {
      window.clearTimeout(debounceTimer);
      requestController?.abort();
    };
  }, [applyAiColor, inputState, inputValue]);

  function commitPickerColor(nextColor: HsvaColor) {
    const nextValue = serializeColor(nextColor);
    setColor(nextColor);
    setInputValue(nextValue);
    setInputFormat("HEX");
    setInputState("parsed");
    onValueChange?.(nextValue);
  }

  function updateColorField(clientX: number, clientY: number) {
    const bounds = colorFieldRef.current?.getBoundingClientRect();

    if (!bounds) {
      return;
    }

    commitPickerColor({
      ...color,
      saturation: clamp((clientX - bounds.left) / bounds.width, 0, 1) * 100,
      value: (1 - clamp((clientY - bounds.top) / bounds.height, 0, 1)) * 100,
    });
  }

  function handleColorFieldPointerDown(event: PointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    updateColorField(event.clientX, event.clientY);
  }

  function handleColorFieldPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      updateColorField(event.clientX, event.clientY);
    }
  }

  function handleColorFieldKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const step = event.shiftKey ? 10 : 1;
    let nextColor: HsvaColor | null = null;

    if (event.key === "ArrowLeft") {
      nextColor = {
        ...color,
        saturation: clamp(color.saturation - step, 0, 100),
      };
    } else if (event.key === "ArrowRight") {
      nextColor = {
        ...color,
        saturation: clamp(color.saturation + step, 0, 100),
      };
    } else if (event.key === "ArrowUp") {
      nextColor = { ...color, value: clamp(color.value + step, 0, 100) };
    } else if (event.key === "ArrowDown") {
      nextColor = { ...color, value: clamp(color.value - step, 0, 100) };
    }

    if (nextColor) {
      event.preventDefault();
      commitPickerColor(nextColor);
    }
  }

  function handleInputChange(value: string) {
    aiAbortControllerRef.current?.abort();
    setInputValue(value);
    setAiResult(null);
    setAiError(null);
    setIsAiLoading(false);
    const directlyParsedColor = parseCssColor(value);
    const colorNameMatch = directlyParsedColor
      ? null
      : findClosestCssColorName(value);
    const parsedColor =
      directlyParsedColor ??
      (colorNameMatch ? parseCssColor(colorNameMatch.cssName) : null);

    if (parsedColor) {
      setColor(parsedColor.color);
      setInputState("parsed");
      setInputFormat(
        colorNameMatch
          ? `≈ ${colorNameMatch.label}`
          : (directlyParsedColor?.format ?? parsedColor.format),
      );
      onValueChange?.(colorNameMatch?.cssName ?? value.trim());
    } else {
      setInputState(value.trim() ? "semantic" : "empty");
      setInputFormat(value.trim() ? "Jev?" : "Empty");
    }
  }

  return (
    <div className={cn("w-full max-w-[780px]", className)}>
      <div
        aria-label="Color picker views"
        className="mx-auto mb-4 flex w-fit rounded-xl border border-grayscale-4 bg-grayscale-2 p-1 dark:border-grayscale-6"
        role="tablist"
      >
        <button
          aria-controls={`${inputId}-picker-panel`}
          aria-selected={activeView === "picker"}
          className={cn(
            "rounded-lg px-3 py-1.5 font-medium text-[11px] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-grayscale-8",
            activeView === "picker"
              ? "bg-grayscale-12 text-grayscale-1"
              : "text-grayscale-9 hover:text-grayscale-12",
          )}
          id={`${inputId}-picker-tab`}
          onClick={() => setActiveView("picker")}
          role="tab"
          type="button"
        >
          Picker
        </button>
        <button
          aria-controls={`${inputId}-details-panel`}
          aria-selected={activeView === "details"}
          className={cn(
            "flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-medium text-[11px] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-grayscale-8",
            activeView === "details"
              ? "bg-grayscale-12 text-grayscale-1"
              : "text-grayscale-9 hover:text-grayscale-12",
          )}
          id={`${inputId}-details-tab`}
          onClick={() => setActiveView("details")}
          role="tab"
          type="button"
        >
          Jev details
          {aiResult ? (
            <span
              className={cn(
                "rounded px-1 py-0.5 font-mono text-[8px]",
                activeView === "details"
                  ? "bg-grayscale-10 text-grayscale-2"
                  : "bg-grayscale-4 text-grayscale-10",
              )}
            >
              {Math.round(aiResult.candidates.judge.confidence * 100)}%
            </span>
          ) : null}
        </button>
      </div>

      <div
        aria-labelledby={`${inputId}-picker-tab`}
        className={cn(
          "mx-auto w-full max-w-[280px]",
          activeView !== "picker" && "hidden",
        )}
        id={`${inputId}-picker-panel`}
        role="tabpanel"
      >
        <div
          aria-label="Saturation and brightness"
          aria-valuemax={100}
          aria-valuemin={0}
          aria-valuenow={Math.round(color.value)}
          aria-valuetext={`${Math.round(color.saturation)}% saturation, ${Math.round(color.value)}% brightness`}
          className={cn(
            styles.colorField,
            "relative aspect-square w-full cursor-crosshair overflow-hidden rounded-xl border border-grayscale-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-grayscale-8 focus-visible:ring-offset-2 focus-visible:ring-offset-grayscale-1 dark:border-grayscale-6",
          )}
          onKeyDown={handleColorFieldKeyDown}
          onPointerDown={handleColorFieldPointerDown}
          onPointerMove={handleColorFieldPointerMove}
          ref={colorFieldRef}
          role="slider"
          style={{
            backgroundColor: `hsl(${color.hue} 100% 50%)`,
          }}
          tabIndex={0}
        >
          <div className="absolute inset-0 bg-linear-to-r from-white to-transparent" />
          <div className="absolute inset-0 bg-linear-to-t from-black to-transparent" />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute size-[18px] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white"
            style={{
              backgroundColor: displayColor,
              left: `${color.saturation}%`,
              outline: "1px solid rgb(0 0 0 / 35%)",
              top: `${100 - color.value}%`,
            }}
          />
        </div>

        <div className="mt-3 flex flex-col gap-2.5">
          <div
            className={cn(
              styles.slider,
              "relative h-4 rounded-md border border-grayscale-5 dark:border-grayscale-6",
            )}
            style={{
              background:
                "linear-gradient(to right, #f00 0%, #ff0 16.666%, #0f0 33.333%, #0ff 50%, #00f 66.666%, #f0f 83.333%, #f00 100%)",
            }}
          >
            <input
              aria-label="Hue"
              className={styles.range}
              max="360"
              min="0"
              onChange={(event) =>
                commitPickerColor({ ...color, hue: Number(event.target.value) })
              }
              step="1"
              type="range"
              value={color.hue}
            />
            <span
              aria-hidden="true"
              className={styles.sliderThumb}
              style={{ left: sliderThumbPosition(color.hue, 360) }}
            />
          </div>

          <div
            className={cn(
              styles.slider,
              "relative h-4 rounded-md border border-grayscale-5 dark:border-grayscale-6",
            )}
            style={{
              backgroundColor: "white",
              backgroundClip: "padding-box",
              backgroundImage: `linear-gradient(to right, rgb(${rgb.red} ${rgb.green} ${rgb.blue} / 0), ${opaqueRgb}), linear-gradient(45deg, #d7d7d7 25%, transparent 25%), linear-gradient(-45deg, #d7d7d7 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #d7d7d7 75%), linear-gradient(-45deg, transparent 75%, #d7d7d7 75%)`,
              backgroundPosition: "0 0, 0 0, 0 6px, 6px -6px, -6px 0",
              backgroundSize:
                "auto, 12px 12px, 12px 12px, 12px 12px, 12px 12px",
            }}
          >
            <input
              aria-label="Opacity"
              className={styles.range}
              max="1"
              min="0"
              onChange={(event) =>
                commitPickerColor({
                  ...color,
                  alpha: Number(event.target.value),
                })
              }
              step="0.01"
              type="range"
              value={color.alpha}
            />
            <span
              aria-hidden="true"
              className={styles.sliderThumb}
              style={{ left: sliderThumbPosition(color.alpha, 1) }}
            />
          </div>
        </div>

        <div className="mt-3">
          <label className="sr-only" htmlFor={inputId}>
            {label}
          </label>
          <div
            className={cn(
              "flex h-10 items-center gap-2 rounded-xl border bg-grayscale-1 px-2.5 transition-colors focus-within:ring-2 dark:bg-grayscale-3",
              inputState === "empty"
                ? "border-red-7 focus-within:border-red-8 focus-within:ring-red-4"
                : "border-grayscale-4 focus-within:border-grayscale-7 focus-within:ring-grayscale-4 dark:border-grayscale-6 dark:focus-within:border-grayscale-8 dark:focus-within:ring-grayscale-5",
            )}
          >
            <span
              aria-hidden="true"
              className="size-5 shrink-0 rounded-md border border-black/10"
              style={
                {
                  backgroundColor: displayColor,
                } as CSSProperties
              }
            />
            <input
              aria-describedby={`${inputId}-format`}
              aria-invalid={inputState === "empty"}
              autoCapitalize="off"
              autoComplete="off"
              className="min-w-0 flex-1 bg-transparent font-mono text-[13px] text-grayscale-12 outline-none placeholder:text-grayscale-8"
              id={inputId}
              onChange={(event) => handleInputChange(event.target.value)}
              placeholder="#8B5CF6 or SpongeBob yellow…"
              spellCheck={false}
              value={inputValue}
            />
            {isAiLoading && inputState === "semantic" ? (
              <span
                className="flex size-6 shrink-0 items-center justify-center"
                id={`${inputId}-format`}
                role="status"
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    styles.spinner,
                    "size-3.5 rounded-full text-grayscale-9",
                  )}
                />
                <span className="sr-only">Jev is processing</span>
              </span>
            ) : (
              <span
                className={cn(
                  "max-w-24 shrink-0 truncate rounded-md px-1.5 py-1 font-mono font-semibold text-[9px] uppercase leading-none",
                  inputState === "empty"
                    ? "bg-red-3 text-red-10 dark:bg-red-4"
                    : "bg-grayscale-3 text-grayscale-10 dark:bg-grayscale-4",
                )}
                id={`${inputId}-format`}
              >
                {inputFormat}
              </span>
            )}
          </div>
        </div>
      </div>

      <section
        aria-live="polite"
        aria-labelledby={`${inputId}-details-tab`}
        className={cn(
          "min-h-[280px] rounded-xl border border-grayscale-4 bg-grayscale-2 p-3 dark:border-grayscale-6 dark:bg-grayscale-2",
          activeView !== "details" && "hidden",
        )}
        id={`${inputId}-details-panel`}
        role="tabpanel"
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <p className="font-mono font-semibold text-[9px] text-grayscale-9 uppercase tracking-[0.14em]">
              Jev comparison
            </p>
            <p className="mt-0.5 text-[12px] text-grayscale-11">
              Four candidates + a second-pass judge
            </p>
          </div>
          {aiResult ? (
            <span className="shrink-0 font-mono text-[9px] text-grayscale-8">
              {aiResult.elapsedMs}ms · {aiResult.usage.inputTokens ?? "—"}t
            </span>
          ) : null}
        </div>

        {isAiLoading ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className={cn(styles.shimmer, "h-[166px] rounded-xl")} />
            <div className={cn(styles.shimmer, "h-[166px] rounded-xl")} />
            <div className={cn(styles.shimmer, "h-[166px] rounded-xl")} />
            <div className={cn(styles.shimmer, "h-[166px] rounded-xl")} />
            <div
              className={cn(
                styles.shimmer,
                "h-[166px] rounded-xl sm:col-span-2",
              )}
            />
          </div>
        ) : aiResult ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <JevCandidateCard
              candidate={aiResult.candidates.components}
              method="HSL components"
              onApply={() => applyAiColor(aiResult.candidates.components)}
            />
            <JevCandidateCard
              candidate={aiResult.candidates.semantic}
              method="Semantic OKLCH"
              onApply={() => applyAiColor(aiResult.candidates.semantic)}
            />
            <JevCandidateCard
              candidate={aiResult.candidates.directRgb}
              method="Direct channel scores"
              onApply={() => applyAiColor(aiResult.candidates.directRgb)}
            />
            <JevCandidateCard
              candidate={aiResult.candidates.directOklab}
              method="Direct opponent axes"
              onApply={() => applyAiColor(aiResult.candidates.directOklab)}
            />
            <div className="sm:col-span-2">
              <JevCandidateCard
                candidate={aiResult.candidates.judge}
                method="Second-pass Jev judge"
                onApply={() => applyAiColor(aiResult.candidates.judge)}
              />
            </div>
            <p className="px-1 font-mono text-[9px] text-grayscale-8 leading-relaxed sm:col-span-2">
              {Math.round(aiResult.colorIntent * 100)}% color intent ·{" "}
              {Math.round(aiResult.transparency * 100)}% transparency signal
            </p>
          </div>
        ) : aiError ? (
          <div className="flex min-h-[220px] items-center justify-center rounded-xl border border-red-6 bg-red-2 p-5 text-center dark:bg-red-3">
            <p className="max-w-[240px] text-[12px] text-red-11 leading-relaxed">
              {aiError}
            </p>
          </div>
        ) : (
          <div className="flex min-h-[220px] flex-col items-center justify-center rounded-xl border border-dashed border-grayscale-5 p-6 text-center dark:border-grayscale-6">
            <span
              aria-hidden="true"
              className="mb-3 block size-8 rounded-full border border-black/10 bg-[conic-gradient(from_45deg,#ff6b6b,#ffd43b,#51cf66,#22b8cf,#5c7cfa,#cc5de8,#ff6b6b)]"
            />
            <p className="text-[13px] text-grayscale-11">
              Describe a color in your own words.
            </p>
            <p className="mt-1 max-w-[230px] text-[11px] text-grayscale-8 leading-relaxed">
              Try “SpongeBob yellow”, “old newspaper beige”, or “ghostly mint”.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
