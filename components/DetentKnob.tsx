"use client";

import {
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
} from "motion/react";
import {
  type ComponentProps,
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

/** Degrees either side of twelve o'clock that the knob can travel. */
const HALF_SWEEP = 135;
/** How far past an end stop the knob gives before it refuses to turn. */
const END_STOP_GIVE = 7;
/** How far the hand can keep turning past an end stop before it is ignored. */
const END_STOP_SLACK = 36;
const SETTLE_SPRING = { damping: 26, stiffness: 520, type: "spring" } as const;

type KnobCustomProperty =
  | "--knob-face"
  | "--knob-face-edge"
  | "--knob-indicator"
  | "--knob-ridge-dark"
  | "--knob-ridge-light"
  | "--knob-size"
  | "--knob-lit";

type KnobStyle = CSSProperties & Partial<Record<KnobCustomProperty, string>>;

export type DetentKnobProps = {
  /** Visible name, also used as the slider's accessible label. */
  label: string;
  min?: number;
  max?: number;
  /** Distance between detents. Each detent is one click. */
  step?: number;
  value?: number;
  defaultValue?: number;
  onValueChange?: (value: number) => void;
  /**
   * Light the scale from the centre instead of from the minimum. Useful for
   * bipolar controls such as tone or balance, which also get a centre notch.
   */
  bipolar?: boolean;
  /** Knob diameter in pixels. The scale is drawn around it. */
  size?: number;
  /** Label every nth detent with its value. Set to 0 to hide numerals. */
  numeralEvery?: number;
  /** Play a short synthesised click on every detent. */
  sound?: boolean;
  formatValue?: (value: number) => string;
  /** Format the numerals printed on the scale. Defaults to `formatValue`. */
  formatNumeral?: (value: number) => string;
  className?: string;
};

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

function wrapDegrees(degrees: number) {
  return ((((degrees + 180) % 360) + 360) % 360) - 180;
}

/* -------------------------------------------------------------------------- */
/* Sound                                                                       */
/* -------------------------------------------------------------------------- */

let sharedAudioContext: AudioContext | null = null;
let clickBuffer: AudioBuffer | null = null;
let stopBuffer: AudioBuffer | null = null;
let lastClickAt = 0;

function getAudioContext() {
  if (typeof window === "undefined" || !("AudioContext" in window)) {
    return null;
  }

  sharedAudioContext ??= new AudioContext();

  if (sharedAudioContext.state === "suspended") {
    void sharedAudioContext.resume();
  }

  return sharedAudioContext;
}

/** A few milliseconds of decaying noise sounds like a spring-loaded ball. */
function createClickBuffer(
  context: AudioContext,
  duration: number,
  decay: number,
) {
  const length = Math.floor(context.sampleRate * duration);
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);

  for (let index = 0; index < length; index += 1) {
    const t = index / context.sampleRate;
    data[index] = (Math.random() * 2 - 1) * Math.exp(-t / decay);
  }

  return buffer;
}

function playClick(kind: "detent" | "stop", pitch = 1) {
  const context = getAudioContext();

  if (!context) {
    return;
  }

  const now = context.currentTime;

  // Spinning fast through many detents should purr, not clip.
  if (kind === "detent" && now - lastClickAt < 0.016) {
    return;
  }

  lastClickAt = now;
  clickBuffer ??= createClickBuffer(context, 0.018, 0.0016);
  stopBuffer ??= createClickBuffer(context, 0.05, 0.006);

  const source = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const gain = context.createGain();

  source.buffer = kind === "detent" ? clickBuffer : stopBuffer;
  source.playbackRate.value = kind === "detent" ? 0.9 + pitch * 0.2 : 1;
  filter.type = "bandpass";
  filter.frequency.value = kind === "detent" ? 3400 : 900;
  filter.Q.value = kind === "detent" ? 1.4 : 0.9;
  gain.gain.value = kind === "detent" ? 0.55 : 0.8;

  source.connect(filter).connect(gain).connect(context.destination);
  source.start(now);
}

function buzz(duration: number) {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    navigator.vibrate?.(duration);
  }
}

/* -------------------------------------------------------------------------- */
/* Visual pieces                                                               */
/* -------------------------------------------------------------------------- */

const knobThemeClassName =
  "[--knob-face:#dcdcdf] [--knob-face-edge:#b9b9be] [--knob-indicator:#2b2b2e] [--knob-lit:#ff8a1f] [--knob-ridge-dark:#9d9da3] [--knob-ridge-light:#f4f4f6] dark:[--knob-face:#2c2c30] dark:[--knob-face-edge:#1b1b1e] dark:[--knob-indicator:#f1f1f3] dark:[--knob-ridge-dark:#141416] dark:[--knob-ridge-light:#47474d]";

/** The knurled rim, the spun-metal cap and the engraved line. */
function KnobBody({
  pressed = false,
  rotation,
  size,
  turnClassName,
}: {
  pressed?: boolean;
  rotation?: ComponentProps<typeof motion.div>["style"];
  size: number;
  turnClassName?: string;
}) {
  const ridgeCount = Math.max(24, Math.round(size * 0.42));
  const ridgeDegrees = 360 / ridgeCount;

  return (
    <div
      className={cn(
        "relative rounded-full transition-[transform,box-shadow] duration-150 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none",
        pressed
          ? "scale-[0.985] shadow-[0_1px_1px_rgb(0_0_0_/_22%),0_3px_6px_rgb(0_0_0_/_14%)]"
          : "shadow-[0_1px_1px_rgb(0_0_0_/_18%),0_6px_10px_rgb(0_0_0_/_14%),0_16px_28px_rgb(0_0_0_/_12%)] dark:shadow-[0_1px_1px_rgb(0_0_0_/_50%),0_6px_10px_rgb(0_0_0_/_40%),0_16px_28px_rgb(0_0_0_/_36%)]",
      )}
      style={{ height: size, width: size }}
    >
      {/* Everything that is cut into the metal turns with the knob. */}
      <motion.div
        className={cn("absolute inset-0 rounded-full", turnClassName)}
        style={rotation}
      >
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background: `repeating-conic-gradient(from 0deg, var(--knob-ridge-light) 0deg ${ridgeDegrees * 0.45}deg, var(--knob-ridge-dark) ${ridgeDegrees * 0.55}deg ${ridgeDegrees}deg)`,
          }}
        />
        <div
          className="absolute rounded-full"
          style={{
            background:
              "repeating-radial-gradient(circle at 50% 50%, rgb(255 255 255 / 7%) 0 0.5px, rgb(0 0 0 / 5%) 1px 1.5px), radial-gradient(circle at 50% 50%, var(--knob-face) 0 62%, var(--knob-face-edge) 100%)",
            boxShadow:
              "0 0 0 1px rgb(0 0 0 / 14%), 0 1px 2px rgb(0 0 0 / 22%), inset 0 1px 0 rgb(255 255 255 / 28%)",
            inset: size * 0.085,
          }}
        />
        <div
          className="absolute left-1/2 rounded-full bg-[var(--knob-indicator)]"
          style={{
            boxShadow:
              "inset 0 1px 1px rgb(0 0 0 / 35%), 0 1px 0 rgb(255 255 255 / 30%)",
            height: size * 0.2,
            top: size * 0.13,
            transform: "translateX(-50%)",
            width: Math.max(2.5, size * 0.03),
          }}
        />
      </motion.div>

      {/* The light does not turn, so the sheen stays put while ridges pass under it. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 rounded-full mix-blend-soft-light"
        style={{
          background:
            "conic-gradient(from 200deg, rgb(255 255 255 / 0%), rgb(255 255 255 / 85%) 40deg, rgb(255 255 255 / 0%) 80deg, rgb(0 0 0 / 30%) 140deg, rgb(255 255 255 / 0%) 200deg, rgb(255 255 255 / 70%) 230deg, rgb(255 255 255 / 0%) 270deg, rgb(0 0 0 / 30%) 320deg, rgb(255 255 255 / 0%) 360deg)",
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 rounded-full"
        style={{
          background:
            "linear-gradient(180deg, rgb(255 255 255 / 26%), transparent 38%, transparent 62%, rgb(0 0 0 / 18%))",
          boxShadow:
            "inset 0 1px 0 rgb(255 255 255 / 40%), inset 0 -1px 1px rgb(0 0 0 / 25%)",
        }}
      />
    </div>
  );
}

function detentAngle(index: number, count: number) {
  return count === 0 ? 0 : -HALF_SWEEP + (index / count) * HALF_SWEEP * 2;
}

/** Ticks and numerals printed on the panel around the knob. */
function KnobScale({
  bipolar,
  count,
  formatNumeral,
  litIndex,
  numeralEvery,
  size,
}: {
  bipolar: boolean;
  count: number;
  formatNumeral: (index: number) => string;
  litIndex: number;
  numeralEvery: number;
  size: number;
}) {
  const radius = size / 2;
  const tickInner = radius + 7;
  const numeralRadius = radius + (size > 90 ? 27 : 21);
  const box = (numeralEvery > 0 ? numeralRadius + 9 : tickInner + 10) * 2;
  const centre = box / 2;
  const centreIndex = count / 2;
  const ticks = Array.from({ length: count + 1 }, (_, index) => index);

  const isLit = (index: number) =>
    bipolar
      ? (index >= centreIndex && index <= litIndex) ||
        (index <= centreIndex && index >= litIndex)
      : index <= litIndex;

  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 overflow-visible"
      height={box}
      viewBox={`0 0 ${box} ${box}`}
      width={box}
    >
      {ticks.map((index) => {
        const angle = (detentAngle(index, count) * Math.PI) / 180;
        const major =
          numeralEvery > 0
            ? index % numeralEvery === 0
            : index === 0 || index === count;
        const centreMark = bipolar && index === centreIndex;
        const length = centreMark ? 9 : major ? 7 : 4;
        const sin = Math.sin(angle);
        const cos = -Math.cos(angle);
        const lit = isLit(index);

        return (
          <g key={index}>
            <line
              className={cn(
                "transition-[stroke,filter] duration-150 motion-reduce:transition-none",
                lit
                  ? "stroke-[var(--knob-lit)] [filter:drop-shadow(0_0_3px_var(--knob-lit))]"
                  : "stroke-grayscale-6 dark:stroke-grayscale-7",
              )}
              strokeLinecap="round"
              strokeWidth={major || centreMark ? 2 : 1.5}
              x1={centre + sin * tickInner}
              x2={centre + sin * (tickInner + length)}
              y1={centre + cos * tickInner}
              y2={centre + cos * (tickInner + length)}
            />
            {numeralEvery > 0 && index % numeralEvery === 0 ? (
              <text
                className={cn(
                  "font-medium font-mono transition-colors duration-150 motion-reduce:transition-none",
                  lit ? "fill-grayscale-12" : "fill-grayscale-9",
                )}
                dominantBaseline="central"
                fontSize={size > 90 ? 10 : 8}
                textAnchor="middle"
                x={centre + sin * numeralRadius}
                y={centre + cos * numeralRadius}
              >
                {formatNumeral(index)}
              </text>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}

/** A decorative, non-interactive knob for thumbnails and previews. */
export function DetentKnobFace({
  angle,
  className,
  count = 10,
  litIndex = 5,
  size = 56,
  style,
  turnClassName,
}: {
  /** Fixed angle in degrees. Leave unset to rotate with `turnClassName`. */
  angle?: number;
  className?: string;
  count?: number;
  litIndex?: number;
  size?: number;
  style?: KnobStyle;
  /** Classes for the turning layer, e.g. to rotate it on hover. */
  turnClassName?: string;
}) {
  return (
    <div
      aria-hidden="true"
      className={cn("relative", knobThemeClassName, className)}
      style={style}
    >
      <KnobScale
        bipolar={false}
        count={count}
        formatNumeral={String}
        litIndex={litIndex}
        numeralEvery={0}
        size={size}
      />
      <KnobBody
        rotation={angle === undefined ? undefined : { rotate: angle }}
        size={size}
        turnClassName={turnClassName}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* The knob                                                                    */
/* -------------------------------------------------------------------------- */

export function DetentKnob({
  bipolar = false,
  className,
  defaultValue,
  formatNumeral: formatScaleNumeral,
  formatValue = String,
  label,
  max = 10,
  min = 0,
  numeralEvery = 1,
  onValueChange,
  size = 120,
  sound = true,
  step = 1,
  value: controlledValue,
}: DetentKnobProps) {
  const shouldReduceMotion = useReducedMotion();
  const labelId = useId();
  const count = Math.max(1, Math.round((max - min) / step));
  const stepAngle = (HALF_SWEEP * 2) / count;
  const indexOf = useCallback(
    (value: number) => clamp(Math.round((value - min) / step), 0, count),
    [count, min, step],
  );

  const [uncontrolledValue, setUncontrolledValue] = useState(
    () => defaultValue ?? (bipolar ? (min + max) / 2 : min),
  );
  const value = controlledValue ?? uncontrolledValue;
  const index = indexOf(value);
  const [pressed, setPressed] = useState(false);

  const angle = useMotionValue(detentAngle(index, count));
  const indexRef = useRef(index);
  const dragRef = useRef<{
    centreX: number;
    centreY: number;
    lastPointerAngle: number;
    pointerId: number;
    raw: number;
  } | null>(null);

  const settleTo = useCallback(
    (nextIndex: number) => {
      const target = detentAngle(nextIndex, count);

      if (shouldReduceMotion) {
        angle.set(target);
        return;
      }

      animate(angle, target, SETTLE_SPRING);
    },
    [angle, count, shouldReduceMotion],
  );

  // Follow controlled changes that did not come from the hand on the knob.
  useEffect(() => {
    if (dragRef.current || index === indexRef.current) {
      return;
    }

    indexRef.current = index;
    settleTo(index);
  }, [index, settleTo]);

  const commit = useCallback(
    (nextIndex: number, feedback: "detent" | "stop" | null) => {
      if (feedback && sound) {
        playClick(feedback, nextIndex / count);
      }

      if (feedback) {
        buzz(feedback === "detent" ? 4 : 12);
      }

      if (nextIndex === indexRef.current) {
        return;
      }

      indexRef.current = nextIndex;
      const nextValue = Number((min + nextIndex * step).toFixed(6));

      if (controlledValue === undefined) {
        setUncontrolledValue(nextValue);
      }

      onValueChange?.(nextValue);
    },
    [controlledValue, count, min, onValueChange, sound, step],
  );

  const stepBy = useCallback(
    (delta: number) => {
      const nextIndex = clamp(indexRef.current + delta, 0, count);

      if (nextIndex === indexRef.current) {
        if (sound) {
          playClick("stop");
        }

        if (!shouldReduceMotion) {
          // Nudge into the end stop and bounce back off it.
          const stop = detentAngle(nextIndex, count);
          animate(angle, [stop, stop + Math.sign(delta) * 4, stop], {
            duration: 0.22,
            ease: "easeOut",
          });
        }

        return;
      }

      commit(nextIndex, "detent");
      settleTo(nextIndex);
    },
    [angle, commit, count, settleTo, shouldReduceMotion, sound],
  );

  /**
   * Turn the hand's continuous angle into what a sprung ball in a notched ring
   * would do: hang on to the current notch, then fall into the next one.
   */
  const applyRaw = useCallback(
    (raw: number) => {
      const lowest = -HALF_SWEEP;
      const highest = HALF_SWEEP;

      if (raw < lowest || raw > highest) {
        const stop = raw < lowest ? lowest : highest;
        const over = raw - stop;
        const give =
          Math.sign(over) *
          END_STOP_GIVE *
          (1 - Math.exp(-Math.abs(over) / END_STOP_GIVE));
        const stopIndex = raw < lowest ? 0 : count;

        angle.set(stop + give);

        if (stopIndex !== indexRef.current) {
          commit(stopIndex, "detent");
        }

        return;
      }

      const nearestIndex = Math.round((raw - lowest) / stepAngle);
      const nearest = detentAngle(nearestIndex, count);
      const offset = (raw - nearest) / (stepAngle / 2);
      const held =
        nearest + Math.sign(offset) * Math.abs(offset) ** 2.2 * (stepAngle / 2);

      angle.set(held);

      if (nearestIndex !== indexRef.current) {
        commit(nearestIndex, "detent");
      }
    },
    [angle, commit, count, stepAngle],
  );

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) {
      return;
    }

    const bounds = event.currentTarget.getBoundingClientRect();
    const centreX = bounds.left + bounds.width / 2;
    const centreY = bounds.top + bounds.height / 2;

    event.currentTarget.setPointerCapture(event.pointerId);
    event.currentTarget.focus({ preventScroll: true });
    angle.stop();
    dragRef.current = {
      centreX,
      centreY,
      lastPointerAngle:
        (Math.atan2(event.clientY - centreY, event.clientX - centreX) * 180) /
        Math.PI,
      pointerId: event.pointerId,
      raw: detentAngle(indexRef.current, count),
    };
    setPressed(true);
    getAudioContext();
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;

    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    const dx = event.clientX - drag.centreX;
    const dy = event.clientY - drag.centreY;

    // Too close to the axle and the angle swings wildly; wait for a lever.
    if (Math.hypot(dx, dy) < size * 0.12) {
      return;
    }

    const pointerAngle = (Math.atan2(dy, dx) * 180) / Math.PI;
    const delta = wrapDegrees(pointerAngle - drag.lastPointerAngle);
    const wasPastStop = Math.abs(drag.raw) > HALF_SWEEP;

    drag.lastPointerAngle = pointerAngle;
    drag.raw = clamp(
      drag.raw + delta,
      -HALF_SWEEP - END_STOP_SLACK,
      HALF_SWEEP + END_STOP_SLACK,
    );

    if (!wasPastStop && Math.abs(drag.raw) > HALF_SWEEP && sound) {
      playClick("stop");
    }

    applyRaw(drag.raw);
  }

  function endDrag(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;

    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    dragRef.current = null;
    setPressed(false);
    settleTo(indexRef.current);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const big = Math.max(1, Math.round(count / 5));
    const deltas: Record<string, number> = {
      ArrowDown: -1,
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: 1,
      End: count,
      Home: -count,
      PageDown: -big,
      PageUp: big,
    };
    const delta = deltas[event.key];

    if (delta === undefined) {
      return;
    }

    event.preventDefault();

    if (event.key === "Home" || event.key === "End") {
      const target = event.key === "Home" ? 0 : count;

      if (target !== indexRef.current) {
        commit(target, "detent");
        settleTo(target);
      }

      return;
    }

    stepBy(delta);
  }

  // React's onWheel is passive, so attach a listener that may cancel scrolling.
  const surfaceRef = useRef<HTMLDivElement>(null);
  const wheelRef = useRef({ accumulated: 0, stepBy });
  wheelRef.current.stepBy = stepBy;

  useEffect(() => {
    const surface = surfaceRef.current;

    if (!surface) {
      return;
    }

    function handleWheel(event: WheelEvent) {
      event.preventDefault();
      const state = wheelRef.current;
      const delta =
        Math.abs(event.deltaY) >= Math.abs(event.deltaX)
          ? -event.deltaY
          : event.deltaX;

      state.accumulated += event.deltaMode === 1 ? delta * 40 : delta;

      // Trackpads send many tiny deltas; spend them one detent at a time.
      while (Math.abs(state.accumulated) >= 40) {
        const direction = Math.sign(state.accumulated);
        state.accumulated -= direction * 40;
        state.stepBy(direction);
      }
    }

    surface.addEventListener("wheel", handleWheel, { passive: false });
    return () => surface.removeEventListener("wheel", handleWheel);
  }, []);

  const formatNumeral = useCallback(
    (tickIndex: number) =>
      (formatScaleNumeral ?? formatValue)(min + tickIndex * step),
    [formatScaleNumeral, formatValue, min, step],
  );
  const valueText = formatValue(value);
  const boxSize = size + (numeralEvery > 0 ? (size > 90 ? 72 : 60) : 34);

  return (
    <div
      className={cn(
        "flex flex-col items-center gap-3",
        knobThemeClassName,
        className,
      )}
    >
      <div
        className="relative grid place-items-center"
        style={{ height: boxSize, width: boxSize }}
      >
        <KnobScale
          bipolar={bipolar}
          count={count}
          formatNumeral={formatNumeral}
          litIndex={index}
          numeralEvery={numeralEvery}
          size={size}
        />
        <div
          aria-labelledby={labelId}
          aria-orientation="vertical"
          aria-valuemax={max}
          aria-valuemin={min}
          aria-valuenow={value}
          aria-valuetext={valueText}
          className="relative cursor-grab touch-none select-none rounded-full outline-none focus-visible:ring-2 focus-visible:ring-[var(--knob-lit)] focus-visible:ring-offset-4 focus-visible:ring-offset-grayscale-1 active:cursor-grabbing dark:focus-visible:ring-offset-grayscale-2"
          onKeyDown={handleKeyDown}
          onLostPointerCapture={endDrag}
          onPointerCancel={endDrag}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={endDrag}
          ref={surfaceRef}
          role="slider"
          tabIndex={0}
        >
          <KnobBody
            pressed={pressed}
            rotation={{ rotate: angle }}
            size={size}
          />
        </div>
      </div>

      {/* The scale is open at the bottom, so tuck the caption up into the gap. */}
      <div
        className="flex flex-col items-center gap-0.5"
        style={{ marginTop: -Math.round(boxSize * 0.1) }}
      >
        <span
          className="font-medium font-mono text-[10px] text-grayscale-10 uppercase tracking-[0.14em]"
          id={labelId}
        >
          {label}
        </span>
        <output
          aria-hidden="true"
          className="font-medium font-mono text-grayscale-12 text-xs tabular-nums"
        >
          {valueText}
        </output>
      </div>
    </div>
  );
}
