import { type CSSProperties, memo, useId, useMemo } from "react";
import { cn } from "@/helpers/classname-helper";

export type SparklineCurve = "sharp" | "smooth";

export type SparklinePoint = {
  label?: string;
  value: number;
};

type SparkCoordinate = {
  x: number;
  y: number;
};

type SparklineProps = {
  ariaLabel?: string;
  className?: string;
  color?: string;
  curve?: SparklineCurve;
  data: readonly SparklinePoint[];
  duration?: number;
  glow?: boolean;
  height?: number;
  replayKey?: number | string;
  showEndpoint?: boolean;
  strokeWidth?: number;
  width?: number;
};

function getSparkCoordinates({
  data,
  height,
  width,
}: {
  data: readonly SparklinePoint[];
  height: number;
  width: number;
}) {
  const values = data.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const horizontalPadding = 6;
  const verticalPadding = 4;
  const innerWidth = width - horizontalPadding * 2;
  const innerHeight = height - verticalPadding * 2;

  return data.map((point, index) => {
    const x =
      horizontalPadding + (index / Math.max(data.length - 1, 1)) * innerWidth;
    const y =
      verticalPadding +
      innerHeight -
      ((point.value - min) / range) * innerHeight;

    return { x, y };
  });
}

function buildSharpSparkPath(points: readonly SparkCoordinate[]) {
  if (points.length === 0) {
    return "";
  }

  return points.reduce(
    (path, point, index) =>
      `${path} ${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`,
    "",
  );
}

function buildSmoothSparkPath(points: readonly SparkCoordinate[]) {
  if (points.length <= 2) {
    return buildSharpSparkPath(points);
  }

  return points.slice(1).reduce(
    (path, point, index) => {
      const previousPoint = points[index];
      const beforePreviousPoint = points[index - 1] ?? previousPoint;
      const nextPoint = points[index + 2] ?? point;
      const controlPointOne = {
        x: previousPoint.x + (point.x - beforePreviousPoint.x) / 6,
        y: previousPoint.y + (point.y - beforePreviousPoint.y) / 6,
      };
      const controlPointTwo = {
        x: point.x - (nextPoint.x - previousPoint.x) / 6,
        y: point.y - (nextPoint.y - previousPoint.y) / 6,
      };

      return `${path} C ${controlPointOne.x.toFixed(2)} ${controlPointOne.y.toFixed(2)}, ${controlPointTwo.x.toFixed(2)} ${controlPointTwo.y.toFixed(2)}, ${point.x.toFixed(2)} ${point.y.toFixed(2)}`;
    },
    `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`,
  );
}

function buildSparkPath(
  points: readonly SparkCoordinate[],
  curve: SparklineCurve,
) {
  return curve === "smooth"
    ? buildSmoothSparkPath(points)
    : buildSharpSparkPath(points);
}

function getVisibleSparkPoints(
  points: readonly SparkCoordinate[],
  curve: SparklineCurve,
) {
  if (curve === "smooth" || points.length <= 18) {
    return points;
  }

  const step = Math.ceil(points.length / 18);
  const sharpPoints = points.filter((_, index) => index % step === 0);
  const lastPoint = points.at(-1);

  if (lastPoint && sharpPoints.at(-1) !== lastPoint) {
    sharpPoints.push(lastPoint);
  }

  return sharpPoints;
}

export const Sparkline = memo(function Sparkline({
  ariaLabel = "Sparkline",
  className,
  color = "currentColor",
  curve = "smooth",
  data,
  duration = 980,
  glow = false,
  height = 72,
  replayKey = 0,
  showEndpoint = false,
  strokeWidth = 2,
  width = 220,
}: SparklineProps) {
  const sparklineId = useId().replace(/:/g, "");
  const points = useMemo(
    () => getSparkCoordinates({ data, height, width }),
    [data, height, width],
  );
  const visiblePoints = useMemo(
    () => getVisibleSparkPoints(points, curve),
    [points, curve],
  );
  const path = useMemo(
    () => buildSparkPath(visiblePoints, curve),
    [visiblePoints, curve],
  );
  const lastPoint = visiblePoints.at(-1);
  const animationKey = `${replayKey}-${duration}`;
  const clipBleed = glow ? 18 : Math.ceil(strokeWidth / 2);
  const clipSize = {
    height: height + clipBleed * 2,
    width: width + clipBleed * 2,
    x: -clipBleed,
    y: -clipBleed,
  };
  const strokeLinecap = curve === "sharp" ? "butt" : "round";
  const strokeLinejoin = curve === "sharp" ? "miter" : "round";

  return (
    <svg
      aria-label={ariaLabel}
      className={cn("block h-auto w-full overflow-visible", className)}
      key={animationKey}
      preserveAspectRatio="none"
      role="img"
      style={{ color } as CSSProperties}
      viewBox={`0 0 ${width} ${height}`}
    >
      <defs>
        <linearGradient
          id={`${sparklineId}-fade`}
          gradientUnits="userSpaceOnUse"
          x1="0"
          x2={width}
          y1="0"
          y2="0"
        >
          <stop offset="0%" stopColor="white" stopOpacity="0" />
          <stop offset="40%" stopColor="white" stopOpacity="1" />
          <stop offset="100%" stopColor="white" stopOpacity="1" />
        </linearGradient>
        <mask
          height={clipSize.height}
          id={`${sparklineId}-fade-mask`}
          maskUnits="userSpaceOnUse"
          width={clipSize.width}
          x={clipSize.x}
          y={clipSize.y}
        >
          <rect
            fill={`url(#${sparklineId}-fade)`}
            height={clipSize.height}
            width={clipSize.width}
            x={clipSize.x}
            y={clipSize.y}
          />
        </mask>
        <clipPath id={`${sparklineId}-clip`}>
          <rect
            height={clipSize.height}
            key={animationKey}
            width={duration > 0 ? 0 : clipSize.width}
            x={clipSize.x}
            y={clipSize.y}
          >
            {duration > 0 ? (
              <animate
                attributeName="width"
                calcMode="spline"
                dur={`${duration}ms`}
                fill="freeze"
                from="0"
                keySplines="0.25 1 0.5 1"
                keyTimes="0;1"
                to={clipSize.width}
              />
            ) : null}
          </rect>
        </clipPath>
      </defs>

      <g
        clipPath={`url(#${sparklineId}-clip)`}
        mask={`url(#${sparklineId}-fade-mask)`}
      >
        {glow ? (
          <>
            <path
              className="fill-none stroke-current opacity-10 blur-[6px]"
              d={path}
              strokeLinecap={strokeLinecap}
              strokeLinejoin={strokeLinejoin}
              strokeWidth={strokeWidth + 8}
              vectorEffect="non-scaling-stroke"
            />
            <path
              className="fill-none stroke-current opacity-20 blur-[2px]"
              d={path}
              strokeLinecap={strokeLinecap}
              strokeLinejoin={strokeLinejoin}
              strokeWidth={strokeWidth + 3}
              vectorEffect="non-scaling-stroke"
            />
          </>
        ) : null}
        <path
          className="fill-none stroke-current"
          d={path}
          strokeLinecap={strokeLinecap}
          strokeLinejoin={strokeLinejoin}
          strokeWidth={strokeWidth}
          vectorEffect="non-scaling-stroke"
        />
      </g>

      {showEndpoint && lastPoint ? (
        <circle
          className="fill-current [filter:drop-shadow(0_0_5px_currentColor)]"
          cx={lastPoint.x}
          cy={lastPoint.y}
          key={`${animationKey}-endpoint`}
          opacity={duration > 0 ? "0" : "1"}
          r={strokeWidth + 1}
        >
          {duration > 0 ? (
            <animate
              attributeName="opacity"
              dur={`${duration}ms`}
              fill="freeze"
              keyTimes="0;0.78;1"
              values="0;0;1"
            />
          ) : null}
        </circle>
      ) : null}
    </svg>
  );
});
