"use client";

import type { MouseEvent, PointerEvent } from "react";
import { cn } from "@/helpers/classname-helper";
import styles from "./TubeMapRenderer.module.css";

const DEFAULT_CANVAS_WIDTH = 1200;
const DEFAULT_CANVAS_HEIGHT = 760;
const STATION_CIRCLE_DIAMETER = 30;
const STATION_OUTER_RADIUS = STATION_CIRCLE_DIAMETER / 2;
const STATION_INNER_RADIUS = 10;
const LINE_LANE_WIDTH = STATION_CIRCLE_DIAMETER / 3;
const LINE_RENDER_WIDTH = LINE_LANE_WIDTH + 0.75;
const DIRECTION_LEAD_LENGTH = 80;
const CORRIDOR_CORNER_RADIUS = 20;
const LABEL_DEFAULT_DIRECTION: TubeDirectionId = "se";
const LABEL_DEFAULT_MAX_WIDTH = 160;
const LABEL_MIN_WIDTH = 70;
const LABEL_MAX_WIDTH = 280;
const LABEL_APPROX_CHARACTER_WIDTH = 9;
const LABEL_LINE_HEIGHT = 20;
const LABEL_GAP = 8;

const DIRECTION_OPTIONS = [
  { id: "nw", label: "NW", vector: { x: -1, y: -1 } },
  { id: "n", label: "N", vector: { x: 0, y: -1 } },
  { id: "ne", label: "NE", vector: { x: 1, y: -1 } },
  { id: "w", label: "W", vector: { x: -1, y: 0 } },
  { id: "e", label: "E", vector: { x: 1, y: 0 } },
  { id: "sw", label: "SW", vector: { x: -1, y: 1 } },
  { id: "s", label: "S", vector: { x: 0, y: 1 } },
  { id: "se", label: "SE", vector: { x: 1, y: 1 } },
] as const;

const DIRECTION_BY_ID = new Map<TubeDirectionId, TubeDirection>(
  DIRECTION_OPTIONS.map((direction) => [direction.id, direction]),
);
const ROUTE_VECTORS = DIRECTION_OPTIONS.map((direction) => direction.vector);

export type TubeDirectionId = (typeof DIRECTION_OPTIONS)[number]["id"];

export type TubeDirection = {
  id: TubeDirectionId;
  label: string;
  vector: Point;
};

export type TubeStationConfig = {
  id: string;
  x: number;
  y: number;
  label: string;
  interchange?: boolean;
  labelDirection?: TubeDirectionId;
  labelMaxWidth?: number;
  lineColor?: string;
};

export type TubeSegmentConfig = {
  id: string;
  fromStationId: string;
  toStationId: string;
  fromDirection: TubeDirectionId;
  toDirection: TubeDirectionId;
  lineColor: string;
  lineId: string;
  lineName?: string;
};

export type TubeMapConfig = {
  height?: number;
  segments: TubeSegmentConfig[];
  stations: TubeStationConfig[];
  width?: number;
};

export type TubeMapRendererProps = {
  ariaLabel?: string;
  background?: "none" | string;
  className?: string;
  config: TubeMapConfig;
  fit?: boolean;
  onCanvasPress?: (event: PointerEvent<SVGSVGElement>) => void;
  onLinePress?: (
    segment: TubeSegmentConfig,
    event: MouseEvent<HTMLAnchorElement>,
  ) => void;
  onStationPress?: (
    station: TubeStationConfig,
    event: MouseEvent<HTMLAnchorElement>,
  ) => void;
  selectedSegmentId?: string | null;
  selectedStationId?: string | null;
  showGrid?: boolean;
};

type Point = {
  x: number;
  y: number;
};

type RenderSegment = TubeSegmentConfig & {
  fromContinuityOffset: Point | null;
  laneCount: number;
  laneIndex: number;
  laneSign: 1 | -1;
  toContinuityOffset: Point | null;
};

type WrappedLabelLine = {
  id: string;
  text: string;
};

export function TubeMapRenderer({
  ariaLabel = "Tube map",
  background = "none",
  className,
  config,
  fit = false,
  onCanvasPress,
  onLinePress,
  onStationPress,
  selectedSegmentId,
  selectedStationId,
  showGrid = false,
}: TubeMapRendererProps) {
  const width = config.width ?? DEFAULT_CANVAS_WIDTH;
  const height = config.height ?? DEFAULT_CANVAS_HEIGHT;
  const renderSegments = getRenderSegments(config.segments, config.stations);
  const gridId = `tube-map-grid-${width}-${height}`;

  return (
    <div className={cn(styles.viewport, className)}>
      <svg
        aria-label={ariaLabel}
        className={cn(styles.canvas, fit && styles.fitCanvas)}
        height={height}
        onPointerDown={onCanvasPress}
        role="img"
        viewBox={`0 0 ${width} ${height}`}
        width={width}
      >
        {showGrid ? (
          <defs>
            <pattern
              height="40"
              id={gridId}
              patternUnits="userSpaceOnUse"
              width="40"
            >
              <circle
                cx="1"
                cy="1"
                fill="var(--color-grayscale-6, #d9d9d9)"
                r="1.4"
              />
            </pattern>
          </defs>
        ) : null}
        {background !== "none" ? (
          <rect fill={background} height="100%" width="100%" />
        ) : null}
        {showGrid ? (
          <rect fill={`url(#${gridId})`} height="100%" width="100%" />
        ) : null}

        <g>
          {renderSegments.map((segment) => {
            const from = getStation(config.stations, segment.fromStationId);
            const to = getStation(config.stations, segment.toStationId);

            if (!from || !to) {
              return null;
            }

            const path = getSegmentPath(segment, from, to);
            const segmentContent = (
              <>
                <path className={styles.segmentHitPath} d={path} />
                <path
                  className={styles.segmentPath}
                  d={path}
                  stroke={segment.lineColor}
                  strokeWidth={LINE_RENDER_WIDTH}
                />
              </>
            );

            if (!onLinePress) {
              return (
                <g
                  className={cn(
                    styles.segment,
                    selectedSegmentId === segment.id && styles.selectedSegment,
                  )}
                  key={segment.id}
                >
                  {segmentContent}
                </g>
              );
            }

            return (
              // biome-ignore lint/a11y/useValidAnchor: SVG has no button element; this anchor provides focus and click semantics for map paths.
              <a
                aria-label={segment.lineName ?? segment.lineId}
                className={cn(
                  styles.segment,
                  styles.interactive,
                  selectedSegmentId === segment.id && styles.selectedSegment,
                )}
                href="#"
                key={segment.id}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onLinePress(segment, event);
                }}
              >
                {segmentContent}
              </a>
            );
          })}
        </g>

        <g>
          {config.stations.map((station) => (
            <StationNode
              key={station.id}
              onStationPress={onStationPress}
              selected={selectedStationId === station.id}
              station={station}
            />
          ))}
        </g>
      </svg>
    </div>
  );
}

function getStation(stations: TubeStationConfig[], stationId: string) {
  return stations.find((station) => station.id === stationId) ?? null;
}

function getDirection(directionId: TubeDirectionId) {
  return DIRECTION_BY_ID.get(directionId) ?? DIRECTION_OPTIONS[4];
}

function getStationLabelDirection(station: TubeStationConfig) {
  return isDirectionId(station.labelDirection)
    ? station.labelDirection
    : LABEL_DEFAULT_DIRECTION;
}

function getStationLabelMaxWidth(station: TubeStationConfig) {
  return typeof station.labelMaxWidth === "number"
    ? clamp(station.labelMaxWidth, LABEL_MIN_WIDTH, LABEL_MAX_WIDTH)
    : LABEL_DEFAULT_MAX_WIDTH;
}

function isDirectionId(value: unknown): value is TubeDirectionId {
  return (
    typeof value === "string" && DIRECTION_BY_ID.has(value as TubeDirectionId)
  );
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

function getStationPairKey(segment: TubeSegmentConfig) {
  return [segment.fromStationId, segment.toStationId].sort().join("|");
}

function getStationPairSign(segment: TubeSegmentConfig): 1 | -1 {
  const [firstStationId] = [segment.fromStationId, segment.toStationId].sort();

  return segment.fromStationId === firstStationId ? 1 : -1;
}

function getPointKey(stationId: string, lineId: string) {
  return `${stationId}|${lineId}`;
}

function addPoints(left: Point, right: Point) {
  return {
    x: left.x + right.x,
    y: left.y + right.y,
  };
}

function getOffsetMagnitude(point: Point) {
  return Math.hypot(point.x, point.y);
}

function sameOffset(left: Point, right: Point) {
  return (
    Math.abs(left.x - right.x) < 0.001 && Math.abs(left.y - right.y) < 0.001
  );
}

function chooseContinuityOffset(
  offsets: Array<{ offset: Point; segmentId: string }> | undefined,
  segmentId: string,
) {
  if (!offsets) {
    return null;
  }

  return (
    offsets
      .filter((entry) => entry.segmentId !== segmentId)
      .sort(
        (left, right) =>
          getOffsetMagnitude(right.offset) - getOffsetMagnitude(left.offset),
      )[0]?.offset ?? null
  );
}

function getRenderSegments(
  segments: TubeSegmentConfig[],
  stations: TubeStationConfig[],
): RenderSegment[] {
  const groups = new Map<string, TubeSegmentConfig[]>();

  for (const segment of segments) {
    const key = getStationPairKey(segment);
    const group = groups.get(key);

    if (group) {
      group.push(segment);
    } else {
      groups.set(key, [segment]);
    }
  }

  const laneLookup = new Map<
    string,
    { laneCount: number; laneIndex: number; laneSign: 1 | -1 }
  >();

  for (const group of groups.values()) {
    const sortedSegments = [...group].sort((left, right) => {
      const leftKey = `${left.lineId}:${left.id}`;
      const rightKey = `${right.lineId}:${right.id}`;

      return leftKey.localeCompare(rightKey);
    });

    sortedSegments.forEach((segment, laneIndex) => {
      laneLookup.set(segment.id, {
        laneCount: sortedSegments.length,
        laneIndex,
        laneSign: getStationPairSign(segment),
      });
    });
  }

  const renderSegments = segments.map((segment) => {
    const lane = laneLookup.get(segment.id) ?? {
      laneCount: 1,
      laneIndex: 0,
      laneSign: 1,
    };

    return {
      ...segment,
      fromContinuityOffset: null,
      ...lane,
      toContinuityOffset: null,
    };
  });
  const endpointOffsets = new Map<
    string,
    Array<{ offset: Point; segmentId: string }>
  >();

  function addEndpointOffset(key: string, segmentId: string, offset: Point) {
    const existingOffsets = endpointOffsets.get(key) ?? [];
    const alreadyExists = existingOffsets.some(
      (entry) =>
        entry.segmentId === segmentId && sameOffset(entry.offset, offset),
    );

    if (alreadyExists) {
      return;
    }

    endpointOffsets.set(key, [...existingOffsets, { offset, segmentId }]);
  }

  for (const segment of renderSegments) {
    const fromOffset = getEndpointLaneOffset(segment, stations, "from");
    const toOffset = getEndpointLaneOffset(segment, stations, "to");

    if (fromOffset) {
      addEndpointOffset(
        getPointKey(segment.fromStationId, segment.lineId),
        segment.id,
        fromOffset,
      );
    }

    if (toOffset) {
      addEndpointOffset(
        getPointKey(segment.toStationId, segment.lineId),
        segment.id,
        toOffset,
      );
    }
  }

  return renderSegments.map((segment) => {
    if (getLaneOffsetDistance(segment) !== 0) {
      return segment;
    }

    return {
      ...segment,
      fromContinuityOffset: chooseContinuityOffset(
        endpointOffsets.get(getPointKey(segment.fromStationId, segment.lineId)),
        segment.id,
      ),
      toContinuityOffset: chooseContinuityOffset(
        endpointOffsets.get(getPointKey(segment.toStationId, segment.lineId)),
        segment.id,
      ),
    };
  });
}

function getLaneOffsetDistance(segment: RenderSegment) {
  if (segment.laneCount <= 1) {
    return 0;
  }

  return (
    (segment.laneIndex - (segment.laneCount - 1) / 2) *
    LINE_LANE_WIDTH *
    segment.laneSign
  );
}

function getEndpointLaneOffset(
  segment: RenderSegment,
  stations: TubeStationConfig[],
  endpoint: "from" | "to",
) {
  const laneOffset = getLaneOffsetDistance(segment);

  if (laneOffset === 0) {
    return null;
  }

  const from = getStation(stations, segment.fromStationId);
  const to = getStation(stations, segment.toStationId);

  if (!from || !to) {
    return null;
  }

  const basePoints = getSegmentPathPoints(segment, from, to);

  if (basePoints.length < 2) {
    return null;
  }

  if (endpoint === "from") {
    const offsetLeg = getOffsetLeg(basePoints[0], basePoints[1], laneOffset);

    return {
      x: offsetLeg.from.x - basePoints[0].x,
      y: offsetLeg.from.y - basePoints[0].y,
    };
  }

  const lastIndex = basePoints.length - 1;
  const offsetLeg = getOffsetLeg(
    basePoints[lastIndex - 1],
    basePoints[lastIndex],
    laneOffset,
  );

  return {
    x: offsetLeg.to.x - basePoints[lastIndex].x,
    y: offsetLeg.to.y - basePoints[lastIndex].y,
  };
}

function samePoint(left: Point, right: Point) {
  return left.x === right.x && left.y === right.y;
}

function isCollinear(previous: Point, current: Point, next: Point) {
  const leftX = current.x - previous.x;
  const leftY = current.y - previous.y;
  const rightX = next.x - current.x;
  const rightY = next.y - current.y;

  return leftX * rightY - leftY * rightX === 0;
}

function simplifyPathPoints(points: Point[]) {
  const withoutDuplicates = points.filter(
    (point, pointIndex) =>
      pointIndex === 0 || !samePoint(point, points[pointIndex - 1]),
  );

  return withoutDuplicates.filter((point, pointIndex) => {
    const previous = withoutDuplicates[pointIndex - 1];
    const next = withoutDuplicates[pointIndex + 1];

    if (!previous || !next) {
      return true;
    }

    return !isCollinear(previous, point, next);
  });
}

function vectorMatches(left: Point, right: Point) {
  return left.x === right.x && left.y === right.y;
}

function getDirectionBetween(from: Point, to: Point) {
  const deltaX = to.x - from.x;
  const deltaY = to.y - from.y;

  if (deltaX === 0 && deltaY === 0) {
    return null;
  }

  if (deltaX !== 0 && deltaY !== 0 && Math.abs(deltaX) !== Math.abs(deltaY)) {
    return null;
  }

  return {
    x: Math.sign(deltaX),
    y: Math.sign(deltaY),
  };
}

function getRayIntersection(
  firstOrigin: Point,
  firstVector: Point,
  secondOrigin: Point,
  secondVector: Point,
) {
  const denominator =
    firstVector.x * secondVector.y - firstVector.y * secondVector.x;

  if (Math.abs(denominator) < 0.001) {
    return null;
  }

  const originDeltaX = secondOrigin.x - firstOrigin.x;
  const originDeltaY = secondOrigin.y - firstOrigin.y;
  const firstDistance =
    (originDeltaX * secondVector.y - originDeltaY * secondVector.x) /
    denominator;
  const secondDistance =
    (originDeltaX * firstVector.y - originDeltaY * firstVector.x) / denominator;

  if (firstDistance < -0.001 || secondDistance < -0.001) {
    return null;
  }

  return {
    x: firstOrigin.x + firstVector.x * firstDistance,
    y: firstOrigin.y + firstVector.y * firstDistance,
  };
}

function countRouteCorners(points: Point[]) {
  return points.reduce((count, point, pointIndex) => {
    const previous = points[pointIndex - 1];
    const next = points[pointIndex + 1];

    if (!previous || !next || isCollinear(previous, point, next)) {
      return count;
    }

    return count + 1;
  }, 0);
}

function getRouteLength(points: Point[]) {
  return points.reduce((length, point, pointIndex) => {
    const previous = points[pointIndex - 1];

    if (!previous) {
      return length;
    }

    return length + Math.hypot(point.x - previous.x, point.y - previous.y);
  }, 0);
}

function scoreRouteCandidate({
  fromDirection,
  points,
  sourceVector,
  targetVector,
  toDirection,
}: {
  fromDirection: TubeDirection;
  points: Point[];
  sourceVector: Point | null;
  targetVector: Point | null;
  toDirection: TubeDirection;
}) {
  const directionPenalty =
    (sourceVector && vectorMatches(sourceVector, fromDirection.vector)
      ? 0
      : 1200) +
    (targetVector && vectorMatches(targetVector, toDirection.vector)
      ? 0
      : 1200);

  return (
    countRouteCorners(points) * 10_000 +
    directionPenalty +
    getRouteLength(points)
  );
}

function getSegmentPathPoints(
  segment: TubeSegmentConfig,
  from: TubeStationConfig,
  to: TubeStationConfig,
) {
  const fromDirection = getDirection(segment.fromDirection);
  const toDirection = getDirection(segment.toDirection);
  const fromLead = {
    x: from.x + fromDirection.vector.x * DIRECTION_LEAD_LENGTH,
    y: from.y + fromDirection.vector.y * DIRECTION_LEAD_LENGTH,
  };
  const toLead = {
    x: to.x + toDirection.vector.x * DIRECTION_LEAD_LENGTH,
    y: to.y + toDirection.vector.y * DIRECTION_LEAD_LENGTH,
  };
  const candidates: Array<{ points: Point[]; score: number }> = [];
  const directVector = getDirectionBetween(fromLead, toLead);

  if (directVector) {
    const targetVector = {
      x: -directVector.x,
      y: -directVector.y,
    };
    const points = simplifyPathPoints([from, fromLead, toLead, to]);

    candidates.push({
      points,
      score: scoreRouteCandidate({
        fromDirection,
        points,
        sourceVector: directVector,
        targetVector,
        toDirection,
      }),
    });
  }

  for (const sourceVector of ROUTE_VECTORS) {
    for (const targetVector of ROUTE_VECTORS) {
      const bend = getRayIntersection(
        fromLead,
        sourceVector,
        toLead,
        targetVector,
      );

      if (!bend) {
        continue;
      }

      const points = simplifyPathPoints([from, fromLead, bend, toLead, to]);

      candidates.push({
        points,
        score: scoreRouteCandidate({
          fromDirection,
          points,
          sourceVector,
          targetVector,
          toDirection,
        }),
      });
    }
  }

  if (candidates.length > 0) {
    return candidates.sort((left, right) => left.score - right.score)[0].points;
  }

  const midX = Math.round((fromLead.x + toLead.x) / 80) * 40;

  return simplifyPathPoints([
    from,
    fromLead,
    { x: midX, y: fromLead.y },
    { x: midX, y: toLead.y },
    toLead,
    to,
  ]);
}

function getOffsetLeg(from: Point, to: Point, offset: number) {
  const deltaX = to.x - from.x;
  const deltaY = to.y - from.y;
  const length = Math.hypot(deltaX, deltaY) || 1;
  const normal = {
    x: (-deltaY / length) * offset,
    y: (deltaX / length) * offset,
  };

  return {
    from: {
      x: from.x + normal.x,
      y: from.y + normal.y,
    },
    to: {
      x: to.x + normal.x,
      y: to.y + normal.y,
    },
  };
}

function getLineIntersection(
  firstStart: Point,
  firstEnd: Point,
  secondStart: Point,
  secondEnd: Point,
) {
  const firstDeltaX = firstEnd.x - firstStart.x;
  const firstDeltaY = firstEnd.y - firstStart.y;
  const secondDeltaX = secondEnd.x - secondStart.x;
  const secondDeltaY = secondEnd.y - secondStart.y;
  const denominator = firstDeltaX * secondDeltaY - firstDeltaY * secondDeltaX;

  if (Math.abs(denominator) < 0.001) {
    return null;
  }

  const startDeltaX = secondStart.x - firstStart.x;
  const startDeltaY = secondStart.y - firstStart.y;
  const distance =
    (startDeltaX * secondDeltaY - startDeltaY * secondDeltaX) / denominator;

  return {
    x: firstStart.x + distance * firstDeltaX,
    y: firstStart.y + distance * firstDeltaY,
  };
}

function getOffsetPathPoints(points: Point[], offset: number) {
  if (offset === 0 || points.length <= 1) {
    return points;
  }

  const offsetLegs = points
    .slice(0, -1)
    .map((point, pointIndex) =>
      getOffsetLeg(point, points[pointIndex + 1], offset),
    );

  return points.map((point, pointIndex) => {
    const previousLeg = offsetLegs[pointIndex - 1];
    const nextLeg = offsetLegs[pointIndex];

    if (!previousLeg) {
      return nextLeg?.from ?? point;
    }

    if (!nextLeg) {
      return previousLeg.to;
    }

    const intersection = getLineIntersection(
      previousLeg.from,
      previousLeg.to,
      nextLeg.from,
      nextLeg.to,
    );

    return (
      intersection ?? {
        x: (previousLeg.to.x + nextLeg.from.x) / 2,
        y: (previousLeg.to.y + nextLeg.from.y) / 2,
      }
    );
  });
}

function formatPathCoordinate(value: number) {
  return Number(value.toFixed(2));
}

function getDistance(from: Point, to: Point) {
  return Math.hypot(to.x - from.x, to.y - from.y);
}

function getPointToward(from: Point, to: Point, distance: number) {
  const length = getDistance(from, to) || 1;

  return {
    x: from.x + ((to.x - from.x) / length) * distance,
    y: from.y + ((to.y - from.y) / length) * distance,
  };
}

function getTurnSign(previous: Point, current: Point, next: Point) {
  const incomingX = current.x - previous.x;
  const incomingY = current.y - previous.y;
  const outgoingX = next.x - current.x;
  const outgoingY = next.y - current.y;
  const crossProduct = incomingX * outgoingY - incomingY * outgoingX;

  return Math.sign(crossProduct);
}

function getCornerRadius(
  previous: Point,
  current: Point,
  next: Point,
  offset: number,
) {
  const turnSign = getTurnSign(previous, current, next);
  const adjustedRadius = CORRIDOR_CORNER_RADIUS - offset * turnSign;

  return Math.min(
    Math.max(adjustedRadius, LINE_LANE_WIDTH / 2),
    getDistance(previous, current) / 2,
    getDistance(current, next) / 2,
  );
}

function pointsToPath(points: Point[], offset = 0) {
  if (points.length === 0) {
    return "";
  }

  const pathCommands = [
    `M ${formatPathCoordinate(points[0].x)} ${formatPathCoordinate(points[0].y)}`,
  ];

  for (let pointIndex = 1; pointIndex < points.length - 1; pointIndex += 1) {
    const previous = points[pointIndex - 1];
    const current = points[pointIndex];
    const next = points[pointIndex + 1];

    if (isCollinear(previous, current, next)) {
      pathCommands.push(
        `L ${formatPathCoordinate(current.x)} ${formatPathCoordinate(current.y)}`,
      );
      continue;
    }

    const cornerRadius = getCornerRadius(previous, current, next, offset);
    const cornerStart = getPointToward(current, previous, cornerRadius);
    const cornerEnd = getPointToward(current, next, cornerRadius);

    pathCommands.push(
      `L ${formatPathCoordinate(cornerStart.x)} ${formatPathCoordinate(cornerStart.y)}`,
      [
        "Q",
        formatPathCoordinate(current.x),
        formatPathCoordinate(current.y),
        formatPathCoordinate(cornerEnd.x),
        formatPathCoordinate(cornerEnd.y),
      ].join(" "),
    );
  }

  const lastPoint = points[points.length - 1];
  pathCommands.push(
    `L ${formatPathCoordinate(lastPoint.x)} ${formatPathCoordinate(lastPoint.y)}`,
  );

  return pathCommands.join(" ");
}

function getSegmentPath(
  segment: RenderSegment,
  from: TubeStationConfig,
  to: TubeStationConfig,
) {
  const basePoints = getSegmentPathPoints(segment, from, to);
  const laneOffset = getLaneOffsetDistance(segment);
  let offsetPoints = getOffsetPathPoints(basePoints, laneOffset);
  const fromOffset = segment.fromContinuityOffset;
  const toOffset = segment.toContinuityOffset;

  if (
    laneOffset === 0 &&
    fromOffset &&
    toOffset &&
    sameOffset(fromOffset, toOffset)
  ) {
    offsetPoints = basePoints.map((point) => addPoints(point, fromOffset));
  } else {
    if (fromOffset && offsetPoints.length >= 2) {
      offsetPoints[0] = addPoints(basePoints[0], fromOffset);

      if (offsetPoints.length > 2) {
        offsetPoints[1] = addPoints(basePoints[1], fromOffset);
      }
    }

    if (toOffset && offsetPoints.length >= 2) {
      const lastIndex = offsetPoints.length - 1;
      const penultimateIndex = offsetPoints.length - 2;

      offsetPoints[lastIndex] = addPoints(basePoints[lastIndex], toOffset);

      if (offsetPoints.length > 2) {
        offsetPoints[penultimateIndex] = addPoints(
          basePoints[penultimateIndex],
          toOffset,
        );
      }
    }
  }

  return pointsToPath(offsetPoints, laneOffset);
}

function getWrappedLabelLines(label: string, maxWidth: number) {
  const maxCharacters = Math.max(
    4,
    Math.floor(maxWidth / LABEL_APPROX_CHARACTER_WIDTH),
  );
  const words = label.trim().split(/\s+/).filter(Boolean);
  const lines: WrappedLabelLine[] = [];
  let currentLine = "";
  let currentStart = 0;
  let cursor = 0;

  function pushLine(text: string, start: number) {
    lines.push({
      id: `${start}-${text}`,
      text,
    });
  }

  for (const word of words) {
    if (word.length > maxCharacters) {
      if (currentLine) {
        pushLine(currentLine, currentStart);
        currentLine = "";
      }

      for (
        let wordIndex = 0;
        wordIndex < word.length;
        wordIndex += maxCharacters
      ) {
        pushLine(
          word.slice(wordIndex, wordIndex + maxCharacters),
          cursor + wordIndex,
        );
      }

      cursor += word.length + 1;
      continue;
    }

    const nextLine = currentLine ? `${currentLine} ${word}` : word;

    if (nextLine.length > maxCharacters && currentLine) {
      pushLine(currentLine, currentStart);
      currentLine = word;
      currentStart = cursor;
    } else {
      if (!currentLine) {
        currentStart = cursor;
      }

      currentLine = nextLine;
    }

    cursor += word.length + 1;
  }

  if (currentLine) {
    pushLine(currentLine, currentStart);
  }

  return lines.length > 0 ? lines : [{ id: "empty", text: label }];
}

function getLabelLayout(station: TubeStationConfig, lineCount: number) {
  const direction = getDirection(getStationLabelDirection(station));
  const sideOffset = STATION_OUTER_RADIUS + LABEL_GAP;
  const x = direction.vector.x * sideOffset;
  const y =
    direction.vector.y < 0
      ? -(
          STATION_OUTER_RADIUS +
          LABEL_GAP +
          lineCount * LABEL_LINE_HEIGHT -
          LABEL_LINE_HEIGHT / 2
        )
      : direction.vector.y > 0
        ? STATION_OUTER_RADIUS + LABEL_GAP + LABEL_LINE_HEIGHT / 2
        : -((lineCount - 1) * LABEL_LINE_HEIGHT) / 2;
  let textAnchor: "end" | "start" | "middle" = "middle";

  if (direction.vector.x < 0) {
    textAnchor = "end";
  } else if (direction.vector.x > 0) {
    textAnchor = "start";
  }

  return {
    textAnchor,
    x,
    y,
  };
}

function StationLabel({ station }: { station: TubeStationConfig }) {
  const lines = getWrappedLabelLines(
    station.label,
    getStationLabelMaxWidth(station),
  );
  const layout = getLabelLayout(station, lines.length);

  return (
    <text
      className={styles.stationLabel}
      dominantBaseline="middle"
      textAnchor={layout.textAnchor}
      x={layout.x}
      y={layout.y}
    >
      {lines.map((line, lineIndex) => (
        <tspan
          key={line.id}
          x={layout.x}
          y={layout.y + lineIndex * LABEL_LINE_HEIGHT}
        >
          {line.text}
        </tspan>
      ))}
    </text>
  );
}

function StationNode({
  onStationPress,
  selected,
  station,
}: {
  onStationPress: TubeMapRendererProps["onStationPress"];
  selected: boolean;
  station: TubeStationConfig;
}) {
  const stationLabel = station.label || station.id;
  const stationContent = (
    <>
      <circle
        className={styles.stationOuterCircle}
        fill={station.interchange === false ? station.lineColor : "#111111"}
        r={STATION_OUTER_RADIUS}
      />
      <circle className={styles.stationInnerCircle} r={STATION_INNER_RADIUS} />
      <StationLabel station={station} />
    </>
  );

  if (!onStationPress) {
    return (
      <g
        className={cn(styles.station, selected && styles.selectedStation)}
        transform={`translate(${station.x} ${station.y})`}
      >
        {stationContent}
      </g>
    );
  }

  return (
    <g transform={`translate(${station.x} ${station.y})`}>
      {/* biome-ignore lint/a11y/useValidAnchor: SVG has no button element; this anchor provides focus and click semantics for map stations. */}
      <a
        aria-label={stationLabel}
        className={cn(
          styles.station,
          styles.interactive,
          selected && styles.selectedStation,
        )}
        href="#"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onStationPress(station, event);
        }}
      >
        {stationContent}
      </a>
    </g>
  );
}
