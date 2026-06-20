"use client";

import {
  Check,
  CirclePlus,
  Clipboard,
  MapIcon,
  RefreshCcw,
  Trash2,
} from "lucide-react";
import {
  type CSSProperties,
  type FormEvent,
  type PointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Button from "@/components/public/Button";
import { cn } from "@/helpers/classname-helper";
import styles from "./tube-demo.module.css";

type TubeLine = {
  id: string;
  name: string;
  color: string;
};

type DirectionId = (typeof DIRECTION_OPTIONS)[number]["id"];

type Direction = {
  id: DirectionId;
  label: string;
  vector: {
    x: number;
    y: number;
  };
  handle: {
    x: number;
    y: number;
  };
};

type Station = {
  id: string;
  x: number;
  y: number;
  label: string;
  labelDirection?: DirectionId;
  labelMaxWidth?: number;
  lineColor: string;
  interchange: boolean;
};

type Segment = {
  id: string;
  fromStationId: string;
  toStationId: string;
  fromDirection: DirectionId;
  toDirection: DirectionId;
  lineId: string;
  lineName: string;
  lineColor: string;
};

type TubeMapSnapshot = {
  stations: Station[];
  segments: Segment[];
};

type DraftSegment = {
  fromStationId: string;
  fromDirection: DirectionId;
  pointer: Point;
};

type DragState = {
  stationId: string;
  offsetX: number;
  offsetY: number;
};

type Point = {
  x: number;
  y: number;
};

type RenderSegment = Segment & {
  fromContinuityOffset: Point | null;
  laneCount: number;
  laneIndex: number;
  laneSign: 1 | -1;
  toContinuityOffset: Point | null;
};

const TUBE_STORAGE_KEY = "dqnamo:tube-demo:svg:v1";
const CANVAS_WIDTH = 1200;
const CANVAS_HEIGHT = 760;
const GRID_SIZE = 40;
const STATION_CIRCLE_DIAMETER = 30;
const STATION_OUTER_RADIUS = STATION_CIRCLE_DIAMETER / 2;
const STATION_INNER_RADIUS = 10;
const LINE_LANE_WIDTH = STATION_CIRCLE_DIAMETER / 3;
const LINE_RENDER_WIDTH = LINE_LANE_WIDTH + 0.75;
const DIRECTION_LEAD_LENGTH = GRID_SIZE * 2;
const CORRIDOR_CORNER_RADIUS = GRID_SIZE / 2;
const LABEL_DEFAULT_DIRECTION: DirectionId = "se";
const LABEL_DEFAULT_MAX_WIDTH = 160;
const LABEL_MIN_WIDTH = 70;
const LABEL_MAX_WIDTH = 280;
const LABEL_WIDTH_STEP = 10;
const LABEL_APPROX_CHARACTER_WIDTH = 9;
const LABEL_LINE_HEIGHT = 20;
const LABEL_GAP = 8;

const DIRECTION_OPTIONS = [
  {
    id: "nw",
    label: "NW",
    vector: { x: -1, y: -1 },
    handle: { x: -30, y: -30 },
  },
  {
    id: "n",
    label: "N",
    vector: { x: 0, y: -1 },
    handle: { x: 0, y: -42 },
  },
  {
    id: "ne",
    label: "NE",
    vector: { x: 1, y: -1 },
    handle: { x: 30, y: -30 },
  },
  {
    id: "w",
    label: "W",
    vector: { x: -1, y: 0 },
    handle: { x: -42, y: 0 },
  },
  {
    id: "e",
    label: "E",
    vector: { x: 1, y: 0 },
    handle: { x: 42, y: 0 },
  },
  {
    id: "sw",
    label: "SW",
    vector: { x: -1, y: 1 },
    handle: { x: -30, y: 30 },
  },
  {
    id: "s",
    label: "S",
    vector: { x: 0, y: 1 },
    handle: { x: 0, y: 42 },
  },
  {
    id: "se",
    label: "SE",
    vector: { x: 1, y: 1 },
    handle: { x: 30, y: 30 },
  },
] as const;

const DIRECTION_BY_ID = new Map<DirectionId, Direction>(
  DIRECTION_OPTIONS.map((direction) => [direction.id, direction]),
);
const ROUTE_VECTORS = DIRECTION_OPTIONS.map((direction) => direction.vector);

const TUBE_LINES: TubeLine[] = [
  { id: "central", name: "Central", color: "#E32017" },
  { id: "circle", name: "Circle", color: "#FFD300" },
  { id: "district", name: "District", color: "#00782A" },
  { id: "northern", name: "Northern", color: "#000000" },
  { id: "piccadilly", name: "Piccadilly", color: "#003688" },
  { id: "victoria", name: "Victoria", color: "#0098D4" },
  { id: "jubilee", name: "Jubilee", color: "#A0A5A9" },
  { id: "bakerloo", name: "Bakerloo", color: "#B36305" },
  { id: "metropolitan", name: "Metropolitan", color: "#9B0056" },
  { id: "elizabeth", name: "Elizabeth", color: "#7156A5" },
  { id: "overground", name: "Overground", color: "#EE7C0E" },
  { id: "waterloo-city", name: "Waterloo & City", color: "#95CDBA" },
];

const INITIAL_STATIONS: Station[] = [
  {
    id: "oxford-circus",
    x: 160,
    y: 160,
    label: "Oxford Circus",
    lineColor: "#E32017",
    interchange: true,
  },
  {
    id: "tottenham-court-road",
    x: 400,
    y: 160,
    label: "Tottenham Court Road",
    lineColor: "#E32017",
    interchange: true,
  },
  {
    id: "holborn",
    x: 640,
    y: 160,
    label: "Holborn",
    lineColor: "#E32017",
    interchange: true,
  },
  {
    id: "bank",
    x: 880,
    y: 280,
    label: "Bank",
    lineColor: "#E32017",
    interchange: true,
  },
  {
    id: "green-park",
    x: 200,
    y: 400,
    label: "Green Park",
    lineColor: "#0098D4",
    interchange: true,
  },
  {
    id: "westminster",
    x: 520,
    y: 520,
    label: "Westminster",
    lineColor: "#0098D4",
    interchange: true,
  },
  {
    id: "waterloo",
    x: 760,
    y: 520,
    label: "Waterloo",
    lineColor: "#95CDBA",
    interchange: true,
  },
  {
    id: "liverpool-street",
    x: 1040,
    y: 160,
    label: "Liverpool Street",
    lineColor: "#E32017",
    interchange: true,
  },
];

const INITIAL_SEGMENTS: Segment[] = [
  createSegment(
    "oxford-circus",
    "tottenham-court-road",
    TUBE_LINES[0],
    "e",
    "w",
  ),
  createSegment("tottenham-court-road", "holborn", TUBE_LINES[0], "e", "w"),
  createSegment("holborn", "bank", TUBE_LINES[0], "se", "nw"),
  createSegment("bank", "liverpool-street", TUBE_LINES[0], "ne", "w"),
  createSegment("green-park", "westminster", TUBE_LINES[5], "se", "nw"),
  createSegment("westminster", "waterloo", TUBE_LINES[11], "e", "w"),
  createSegment("oxford-circus", "green-park", TUBE_LINES[5], "s", "n"),
  createSegment(
    "oxford-circus",
    "tottenham-court-road",
    TUBE_LINES[1],
    "e",
    "w",
  ),
  createSegment(
    "oxford-circus",
    "tottenham-court-road",
    TUBE_LINES[8],
    "e",
    "w",
  ),
];

function createSegment(
  fromStationId: string,
  toStationId: string,
  line: TubeLine,
  fromDirection: DirectionId,
  toDirection: DirectionId,
): Segment {
  return {
    id: `${fromStationId}-${toStationId}-${line.id}`,
    fromDirection,
    fromStationId,
    lineColor: line.color,
    lineId: line.id,
    lineName: line.name,
    toDirection,
    toStationId,
  };
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function isDirectionId(value: unknown): value is DirectionId {
  return typeof value === "string" && DIRECTION_BY_ID.has(value as DirectionId);
}

function getDirection(directionId: DirectionId) {
  return DIRECTION_BY_ID.get(directionId) ?? DIRECTION_OPTIONS[4];
}

function getStationLabelDirection(station: Station) {
  return isDirectionId(station.labelDirection)
    ? station.labelDirection
    : LABEL_DEFAULT_DIRECTION;
}

function getStationLabelMaxWidth(station: Station) {
  return typeof station.labelMaxWidth === "number"
    ? clamp(station.labelMaxWidth, LABEL_MIN_WIDTH, LABEL_MAX_WIDTH)
    : LABEL_DEFAULT_MAX_WIDTH;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

function snapToGrid(value: number) {
  return Math.round(value / GRID_SIZE) * GRID_SIZE;
}

function snapPointToGrid(point: Point): Point {
  return {
    x: clamp(snapToGrid(point.x), GRID_SIZE, CANVAS_WIDTH - GRID_SIZE),
    y: clamp(snapToGrid(point.y), GRID_SIZE, CANVAS_HEIGHT - GRID_SIZE),
  };
}

function isTubeMapSnapshot(value: unknown): value is TubeMapSnapshot {
  if (!value || typeof value !== "object") {
    return false;
  }

  const snapshot = value as { segments?: unknown; stations?: unknown };

  return Array.isArray(snapshot.stations) && Array.isArray(snapshot.segments);
}

function normalizeSnapshot(snapshot: TubeMapSnapshot): TubeMapSnapshot {
  return {
    stations: snapshot.stations
      .filter(
        (station) =>
          typeof station.id === "string" &&
          typeof station.x === "number" &&
          typeof station.y === "number",
      )
      .map((station) => ({
        ...station,
        labelDirection: isDirectionId(station.labelDirection)
          ? station.labelDirection
          : LABEL_DEFAULT_DIRECTION,
        labelMaxWidth: getStationLabelMaxWidth(station),
        ...snapPointToGrid(station),
      })),
    segments: snapshot.segments
      .filter(
        (segment) =>
          typeof segment.id === "string" &&
          typeof segment.fromStationId === "string" &&
          typeof segment.toStationId === "string" &&
          isDirectionId(segment.fromDirection) &&
          isDirectionId(segment.toDirection),
      )
      .map((segment) => ({
        ...segment,
        lineColor: segment.lineColor ?? "#E32017",
        lineId: segment.lineId ?? "central",
        lineName: segment.lineName ?? "Central",
      })),
  };
}

function getSvgPoint(
  event: PointerEvent<SVGElement | SVGCircleElement | SVGGElement>,
  svg: SVGSVGElement | null,
): Point {
  if (!svg) {
    return { x: 0, y: 0 };
  }

  const point = svg.createSVGPoint();
  point.x = event.clientX;
  point.y = event.clientY;

  const matrix = svg.getScreenCTM();

  if (!matrix) {
    return { x: 0, y: 0 };
  }

  const transformedPoint = point.matrixTransform(matrix.inverse());

  return {
    x: transformedPoint.x,
    y: transformedPoint.y,
  };
}

function getStation(stations: Station[], stationId: string) {
  return stations.find((station) => station.id === stationId) ?? null;
}

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return (
    target.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  );
}

function getStationPairKey(segment: Segment) {
  return [segment.fromStationId, segment.toStationId].sort().join("|");
}

function getStationPairSign(segment: Segment): 1 | -1 {
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

function getEndpointLaneOffset(
  segment: RenderSegment,
  stations: Station[],
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

  const firstPoint = basePoints[0];
  const secondPoint = basePoints[1];
  const penultimatePoint = basePoints[basePoints.length - 2];
  const lastPoint = basePoints[basePoints.length - 1];

  if (endpoint === "from") {
    const offsetLeg = getOffsetLeg(firstPoint, secondPoint, laneOffset);

    return {
      x: offsetLeg.from.x - firstPoint.x,
      y: offsetLeg.from.y - firstPoint.y,
    };
  }

  const offsetLeg = getOffsetLeg(penultimatePoint, lastPoint, laneOffset);

  return {
    x: offsetLeg.to.x - lastPoint.x,
    y: offsetLeg.to.y - lastPoint.y,
  };
}

function getRenderSegments(
  segments: Segment[],
  stations: Station[],
): RenderSegment[] {
  const groups = new Map<string, Segment[]>();

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
      return false;
    }

    endpointOffsets.set(key, [...existingOffsets, { offset, segmentId }]);

    return true;
  }

  for (const segment of renderSegments) {
    const fromOffset = getEndpointLaneOffset(segment, stations, "from");
    const toOffset = getEndpointLaneOffset(segment, stations, "to");

    if (fromOffset) {
      const key = getPointKey(segment.fromStationId, segment.lineId);
      addEndpointOffset(key, segment.id, fromOffset);
    }

    if (toOffset) {
      const key = getPointKey(segment.toStationId, segment.lineId);
      addEndpointOffset(key, segment.id, toOffset);
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
    (point, index) => index === 0 || !samePoint(point, points[index - 1]),
  );

  return withoutDuplicates.filter((point, index) => {
    const previous = withoutDuplicates[index - 1];
    const next = withoutDuplicates[index + 1];

    if (!previous || !next) {
      return true;
    }

    return !isCollinear(previous, point, next);
  });
}

function vectorMatches(
  left: { x: number; y: number },
  right: { x: number; y: number },
) {
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
  return points.reduce((count, point, index) => {
    const previous = points[index - 1];
    const next = points[index + 1];

    if (!previous || !next || isCollinear(previous, point, next)) {
      return count;
    }

    return count + 1;
  }, 0);
}

function getRouteLength(points: Point[]) {
  return points.reduce((length, point, index) => {
    const previous = points[index - 1];

    if (!previous) {
      return length;
    }

    return length + Math.hypot(point.x - previous.x, point.y - previous.y);
  }, 0);
}

function scoreRouteCandidate({
  points,
  sourceVector,
  targetVector,
  fromDirection,
  toDirection,
}: {
  points: Point[];
  sourceVector: Point | null;
  targetVector: Point | null;
  fromDirection: Direction;
  toDirection: Direction;
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

function getSegmentPathPoints(segment: Segment, from: Station, to: Station) {
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
  const candidates: Array<{
    points: Point[];
    score: number;
  }> = [];
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

  const midX = snapToGrid((fromLead.x + toLead.x) / 2);

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
    .map((point, index) => getOffsetLeg(point, points[index + 1], offset));

  return points.map((point, index) => {
    const previousLeg = offsetLegs[index - 1];
    const nextLeg = offsetLegs[index];

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

  for (let index = 1; index < points.length - 1; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const next = points[index + 1];

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

function getSegmentPath(segment: RenderSegment, from: Station, to: Station) {
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

export function TubeMapEditor() {
  const svgRef = useRef<SVGSVGElement>(null);
  const hasHydrated = useRef(false);
  const [stations, setStations] = useState<Station[]>(INITIAL_STATIONS);
  const [segments, setSegments] = useState<Segment[]>(INITIAL_SEGMENTS);
  const [stationName, setStationName] = useState("New station");
  const [interchange, setInterchange] = useState(true);
  const [selectedLineId, setSelectedLineId] = useState(TUBE_LINES[0].id);
  const [selectedStationId, setSelectedStationId] = useState<string | null>(
    null,
  );
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(
    null,
  );
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [draftSegment, setDraftSegment] = useState<DraftSegment | null>(null);
  const [copied, setCopied] = useState(false);

  const selectedLine =
    TUBE_LINES.find((line) => line.id === selectedLineId) ?? TUBE_LINES[0];
  const selectedStation = selectedStationId
    ? getStation(stations, selectedStationId)
    : null;
  const selectedSegment =
    segments.find((segment) => segment.id === selectedSegmentId) ?? null;
  const renderSegments = useMemo(
    () => getRenderSegments(segments, stations),
    [segments, stations],
  );
  const selectedCount =
    Number(Boolean(selectedStationId)) + Number(Boolean(selectedSegmentId));
  const snapshot = useMemo(
    () => ({
      segments,
      stations,
    }),
    [segments, stations],
  );

  useEffect(() => {
    const savedSnapshot = window.localStorage.getItem(TUBE_STORAGE_KEY);

    if (savedSnapshot) {
      try {
        const parsedSnapshot = JSON.parse(savedSnapshot) as unknown;

        if (isTubeMapSnapshot(parsedSnapshot)) {
          const normalizedSnapshot = normalizeSnapshot(parsedSnapshot);
          setStations(normalizedSnapshot.stations);
          setSegments(normalizedSnapshot.segments);
        }
      } catch {
        window.localStorage.removeItem(TUBE_STORAGE_KEY);
      }
    }

    hasHydrated.current = true;
  }, []);

  useEffect(() => {
    if (!hasHydrated.current) {
      return;
    }

    window.localStorage.setItem(TUBE_STORAGE_KEY, JSON.stringify(snapshot));
  }, [snapshot]);

  const addStation = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      const trimmedName = stationName.trim() || "New station";
      const baseId = slugify(trimmedName) || "station";
      const existingIds = new Set(stations.map((station) => station.id));
      let nextId = baseId;
      let suffix = 2;

      while (existingIds.has(nextId)) {
        nextId = `${baseId}-${suffix}`;
        suffix += 1;
      }

      const nextIndex = stations.length;
      const nextPoint = snapPointToGrid({
        x: 160 + (nextIndex % 4) * 240,
        y: 160 + Math.floor(nextIndex / 4) * 160,
      });
      const nextStation = {
        id: nextId,
        interchange,
        label: trimmedName,
        labelDirection: LABEL_DEFAULT_DIRECTION,
        labelMaxWidth: LABEL_DEFAULT_MAX_WIDTH,
        lineColor: selectedLine.color,
        x: nextPoint.x,
        y: nextPoint.y,
      };

      setStations((currentStations) => [...currentStations, nextStation]);
      setSelectedStationId(nextId);
      setSelectedSegmentId(null);
      setStationName("");
    },
    [interchange, selectedLine.color, stationName, stations],
  );

  const applyLineToSelection = useCallback(
    (line: TubeLine) => {
      setSelectedLineId(line.id);

      if (selectedStationId) {
        setStations((currentStations) =>
          currentStations.map((station) =>
            station.id === selectedStationId
              ? {
                  ...station,
                  lineColor: line.color,
                }
              : station,
          ),
        );
      }

      if (selectedSegmentId) {
        setSegments((currentSegments) =>
          currentSegments.map((segment) =>
            segment.id === selectedSegmentId
              ? {
                  ...segment,
                  lineColor: line.color,
                  lineId: line.id,
                  lineName: line.name,
                }
              : segment,
          ),
        );
      }
    },
    [selectedSegmentId, selectedStationId],
  );

  const applyDirectionToSelectedSegment = useCallback(
    (endpoint: "from" | "to", direction: DirectionId) => {
      if (!selectedSegmentId) {
        return;
      }

      setSegments((currentSegments) =>
        currentSegments.map((segment) =>
          segment.id === selectedSegmentId
            ? {
                ...segment,
                [endpoint === "from" ? "fromDirection" : "toDirection"]:
                  direction,
              }
            : segment,
        ),
      );
    },
    [selectedSegmentId],
  );

  const applyLabelDirectionToSelectedStation = useCallback(
    (direction: DirectionId) => {
      if (!selectedStationId) {
        return;
      }

      setStations((currentStations) =>
        currentStations.map((station) =>
          station.id === selectedStationId
            ? {
                ...station,
                labelDirection: direction,
              }
            : station,
        ),
      );
    },
    [selectedStationId],
  );

  const applyLabelMaxWidthToSelectedStation = useCallback(
    (labelMaxWidth: number) => {
      if (!selectedStationId) {
        return;
      }

      setStations((currentStations) =>
        currentStations.map((station) =>
          station.id === selectedStationId
            ? {
                ...station,
                labelMaxWidth,
              }
            : station,
        ),
      );
    },
    [selectedStationId],
  );

  const deleteSelection = useCallback(() => {
    if (selectedSegmentId) {
      setSegments((currentSegments) =>
        currentSegments.filter((segment) => segment.id !== selectedSegmentId),
      );
      setSelectedSegmentId(null);
      return;
    }

    if (selectedStationId) {
      setStations((currentStations) =>
        currentStations.filter((station) => station.id !== selectedStationId),
      );
      setSegments((currentSegments) =>
        currentSegments.filter(
          (segment) =>
            segment.fromStationId !== selectedStationId &&
            segment.toStationId !== selectedStationId,
        ),
      );
      setSelectedStationId(null);
    }
  }, [selectedSegmentId, selectedStationId]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (
        (event.key !== "Backspace" && event.key !== "Delete") ||
        isEditableTarget(event.target) ||
        (!selectedSegmentId && !selectedStationId)
      ) {
        return;
      }

      event.preventDefault();
      deleteSelection();
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [deleteSelection, selectedSegmentId, selectedStationId]);

  const resetMap = useCallback(() => {
    setStations(INITIAL_STATIONS);
    setSegments(INITIAL_SEGMENTS);
    setSelectedStationId(null);
    setSelectedSegmentId(null);
    setDraftSegment(null);
    window.localStorage.removeItem(TUBE_STORAGE_KEY);
  }, []);

  const clearMap = useCallback(() => {
    setStations([]);
    setSegments([]);
    setSelectedStationId(null);
    setSelectedSegmentId(null);
    setDraftSegment(null);
    window.localStorage.setItem(
      TUBE_STORAGE_KEY,
      JSON.stringify({ segments: [], stations: [] }),
    );
  }, []);

  const copyJson = useCallback(async () => {
    await window.navigator.clipboard.writeText(
      JSON.stringify(snapshot, null, 2),
    );
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }, [snapshot]);

  function handleSvgPointerMove(event: PointerEvent<SVGSVGElement>) {
    const point = getSvgPoint(event, svgRef.current);

    if (dragState) {
      const nextPoint = snapPointToGrid({
        x: point.x - dragState.offsetX,
        y: point.y - dragState.offsetY,
      });

      setStations((currentStations) =>
        currentStations.map((station) =>
          station.id === dragState.stationId
            ? {
                ...station,
                x: nextPoint.x,
                y: nextPoint.y,
              }
            : station,
        ),
      );
    }

    if (draftSegment) {
      setDraftSegment({
        ...draftSegment,
        pointer: point,
      });
    }
  }

  function handleSvgPointerUp() {
    setDragState(null);
    setDraftSegment(null);
  }

  function handleStationPointerDown(
    event: PointerEvent<SVGGElement>,
    station: Station,
  ) {
    const point = getSvgPoint(event, svgRef.current);

    event.stopPropagation();
    setSelectedStationId(station.id);
    setSelectedSegmentId(null);
    setDragState({
      offsetX: point.x - station.x,
      offsetY: point.y - station.y,
      stationId: station.id,
    });
  }

  function handlePortPointerDown(
    event: PointerEvent<SVGCircleElement>,
    station: Station,
    direction: Direction,
  ) {
    const point = getSvgPoint(event, svgRef.current);

    event.stopPropagation();
    setDragState(null);
    setDraftSegment({
      fromDirection: direction.id,
      fromStationId: station.id,
      pointer: point,
    });
    setSelectedStationId(station.id);
    setSelectedSegmentId(null);
  }

  function handlePortPointerUp(
    event: PointerEvent<SVGCircleElement>,
    station: Station,
    direction: Direction,
  ) {
    event.stopPropagation();

    if (!draftSegment || draftSegment.fromStationId === station.id) {
      setDraftSegment(null);
      return;
    }

    const segmentId = `${draftSegment.fromStationId}-${station.id}-${selectedLine.id}-${Date.now()}`;

    setSegments((currentSegments) => [
      ...currentSegments,
      {
        fromDirection: draftSegment.fromDirection,
        fromStationId: draftSegment.fromStationId,
        id: segmentId,
        lineColor: selectedLine.color,
        lineId: selectedLine.id,
        lineName: selectedLine.name,
        toDirection: direction.id,
        toStationId: station.id,
      },
    ]);
    setSelectedSegmentId(segmentId);
    setSelectedStationId(null);
    setDraftSegment(null);
  }

  function handleCanvasPointerDown() {
    setSelectedStationId(null);
    setSelectedSegmentId(null);
  }

  return (
    <section className={styles.editorShell}>
      <aside className={styles.toolbar} aria-label="Tube map controls">
        <form className={styles.panelSection} onSubmit={addStation}>
          <div className={styles.sectionHeader}>
            <CirclePlus className="size-4" aria-hidden="true" />
            <h2>Station</h2>
          </div>
          <label className={styles.field}>
            <span>Name</span>
            <input
              className={styles.input}
              onChange={(event) => setStationName(event.target.value)}
              placeholder="Station name"
              type="text"
              value={stationName}
            />
          </label>
          <label className={styles.checkboxField}>
            <input
              checked={interchange}
              onChange={(event) => setInterchange(event.target.checked)}
              type="checkbox"
            />
            <span>Interchange</span>
          </label>
          <Button className="w-full" type="submit">
            <CirclePlus className="size-4" aria-hidden="true" />
            Add station
          </Button>
        </form>

        <div className={styles.panelSection}>
          <div className={styles.sectionHeader}>
            <MapIcon className="size-4" aria-hidden="true" />
            <h2>Line</h2>
          </div>
          <div className={styles.lineGrid}>
            {TUBE_LINES.map((line) => {
              const selected = selectedLineId === line.id;

              return (
                <button
                  className={cn(
                    styles.lineButton,
                    selected && styles.activeLine,
                  )}
                  key={line.id}
                  onClick={() => applyLineToSelection(line)}
                  style={{ "--line-color": line.color } as CSSProperties}
                  title={line.name}
                  type="button"
                >
                  <span className={styles.lineSwatch} />
                  <span>{line.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        {selectedSegment ? (
          <div className={styles.panelSection}>
            <div className={styles.sectionHeader}>
              <MapIcon className="size-4" aria-hidden="true" />
              <h2>Selected link</h2>
            </div>
            <DirectionPad
              label="Exit"
              onChange={(direction) =>
                applyDirectionToSelectedSegment("from", direction)
              }
              value={selectedSegment.fromDirection}
            />
            <DirectionPad
              label="Entry"
              onChange={(direction) =>
                applyDirectionToSelectedSegment("to", direction)
              }
              value={selectedSegment.toDirection}
            />
          </div>
        ) : null}

        {selectedStation ? (
          <div className={styles.panelSection}>
            <div className={styles.sectionHeader}>
              <MapIcon className="size-4" aria-hidden="true" />
              <h2>Selected station</h2>
            </div>
            <DirectionPad
              label="Label"
              onChange={applyLabelDirectionToSelectedStation}
              value={getStationLabelDirection(selectedStation)}
            />
            <label className={styles.rangeField}>
              <span>
                <span>Max width</span>
                <output>{getStationLabelMaxWidth(selectedStation)}</output>
              </span>
              <input
                max={LABEL_MAX_WIDTH}
                min={LABEL_MIN_WIDTH}
                onChange={(event) =>
                  applyLabelMaxWidthToSelectedStation(
                    Number(event.target.value),
                  )
                }
                onInput={(event) =>
                  applyLabelMaxWidthToSelectedStation(
                    Number(event.currentTarget.value),
                  )
                }
                step={LABEL_WIDTH_STEP}
                type="range"
                value={getStationLabelMaxWidth(selectedStation)}
              />
            </label>
          </div>
        ) : null}

        <div className={styles.actionRow}>
          <button
            className={styles.iconButton}
            disabled={selectedCount === 0}
            onClick={deleteSelection}
            title="Delete selected"
            type="button"
          >
            <Trash2 className="size-4" aria-hidden="true" />
          </button>
          <button
            className={styles.iconButton}
            onClick={resetMap}
            title="Reset map"
            type="button"
          >
            <RefreshCcw className="size-4" aria-hidden="true" />
          </button>
          <button
            className={styles.iconButton}
            disabled={stations.length === 0 && segments.length === 0}
            onClick={clearMap}
            title="Clear all"
            type="button"
          >
            <Trash2 className="size-4" aria-hidden="true" />
          </button>
          <button
            className={styles.iconButton}
            onClick={copyJson}
            title="Copy JSON"
            type="button"
          >
            {copied ? (
              <Check className="size-4" aria-hidden="true" />
            ) : (
              <Clipboard className="size-4" aria-hidden="true" />
            )}
          </button>
        </div>

        <dl className={styles.statsGrid}>
          <div>
            <dt>Stations</dt>
            <dd>{stations.length}</dd>
          </div>
          <div>
            <dt>Links</dt>
            <dd>{segments.length}</dd>
          </div>
          <div>
            <dt>Selected</dt>
            <dd>{selectedCount}</dd>
          </div>
        </dl>
      </aside>

      <div className={styles.canvasWrap}>
        <svg
          aria-label="Tube map editor canvas"
          className={styles.mapCanvas}
          onPointerDown={handleCanvasPointerDown}
          onPointerMove={handleSvgPointerMove}
          onPointerUp={handleSvgPointerUp}
          ref={svgRef}
          role="img"
          viewBox={`0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}`}
        >
          <defs>
            <pattern
              height={GRID_SIZE}
              id="tube-grid"
              patternUnits="userSpaceOnUse"
              width={GRID_SIZE}
            >
              <circle cx="1" cy="1" fill="var(--color-grayscale-6)" r="1.4" />
            </pattern>
          </defs>
          <rect fill="var(--color-grayscale-1)" height="100%" width="100%" />
          <rect fill="url(#tube-grid)" height="100%" width="100%" />

          <g className={styles.segmentLayer}>
            {renderSegments.map((segment) => {
              const from = getStation(stations, segment.fromStationId);
              const to = getStation(stations, segment.toStationId);

              if (!from || !to) {
                return null;
              }

              return (
                <g
                  className={cn(
                    styles.segment,
                    selectedSegmentId === segment.id && styles.selectedSegment,
                  )}
                  key={segment.id}
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    setSelectedSegmentId(segment.id);
                    setSelectedStationId(null);
                  }}
                >
                  <path
                    className={styles.segmentHitPath}
                    d={getSegmentPath(segment, from, to)}
                  />
                  <path
                    className={styles.segmentPath}
                    d={getSegmentPath(segment, from, to)}
                    stroke={segment.lineColor}
                    strokeWidth={LINE_RENDER_WIDTH}
                  />
                </g>
              );
            })}
            {draftSegment ? (
              <DraftLine
                draftSegment={draftSegment}
                stations={stations}
                stroke={selectedLine.color}
              />
            ) : null}
          </g>

          <g className={styles.stationLayer}>
            {stations.map((station) => (
              <StationNode
                key={station.id}
                onPointerDown={handleStationPointerDown}
                onPortPointerDown={handlePortPointerDown}
                onPortPointerUp={handlePortPointerUp}
                selected={selectedStationId === station.id}
                station={station}
              />
            ))}
          </g>
        </svg>
      </div>
    </section>
  );
}

function DraftLine({
  draftSegment,
  stations,
  stroke,
}: {
  draftSegment: DraftSegment;
  stations: Station[];
  stroke: string;
}) {
  const from = getStation(stations, draftSegment.fromStationId);

  if (!from) {
    return null;
  }

  return (
    <path
      className={styles.draftSegment}
      d={`M ${from.x} ${from.y} L ${draftSegment.pointer.x} ${draftSegment.pointer.y}`}
      stroke={stroke}
      strokeWidth={LINE_LANE_WIDTH}
    />
  );
}

function getWrappedLabelLines(label: string, maxWidth: number) {
  const maxCharacters = Math.max(
    4,
    Math.floor(maxWidth / LABEL_APPROX_CHARACTER_WIDTH),
  );
  const words = label.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    if (word.length > maxCharacters) {
      if (currentLine) {
        lines.push(currentLine);
        currentLine = "";
      }

      for (let index = 0; index < word.length; index += maxCharacters) {
        lines.push(word.slice(index, index + maxCharacters));
      }

      continue;
    }

    const nextLine = currentLine ? `${currentLine} ${word}` : word;

    if (nextLine.length > maxCharacters && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = nextLine;
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines.length > 0 ? lines : [label];
}

function getLabelLayout(station: Station, lineCount: number) {
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

function StationLabel({ station }: { station: Station }) {
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
      {lines.map((line, index) => (
        <tspan
          key={`${station.id}-label-${line}`}
          x={layout.x}
          y={layout.y + index * LABEL_LINE_HEIGHT}
        >
          {line}
        </tspan>
      ))}
    </text>
  );
}

function StationNode({
  onPointerDown,
  onPortPointerDown,
  onPortPointerUp,
  selected,
  station,
}: {
  onPointerDown: (event: PointerEvent<SVGGElement>, station: Station) => void;
  onPortPointerDown: (
    event: PointerEvent<SVGCircleElement>,
    station: Station,
    direction: Direction,
  ) => void;
  onPortPointerUp: (
    event: PointerEvent<SVGCircleElement>,
    station: Station,
    direction: Direction,
  ) => void;
  selected: boolean;
  station: Station;
}) {
  return (
    <g
      className={cn(
        styles.stationNode,
        selected && styles.selectedStation,
        station.interchange && styles.interchangeStation,
      )}
      onPointerDown={(event) => onPointerDown(event, station)}
      transform={`translate(${station.x} ${station.y})`}
    >
      <circle
        className={styles.stationOuterCircle}
        fill={station.interchange ? "#111111" : station.lineColor}
        r={STATION_OUTER_RADIUS}
      />
      <circle className={styles.stationInnerCircle} r={STATION_INNER_RADIUS} />
      <StationLabel station={station} />
      {DIRECTION_OPTIONS.map((direction) => (
        <circle
          className={styles.stationPort}
          cx={direction.handle.x}
          cy={direction.handle.y}
          key={direction.id}
          onPointerDown={(event) =>
            onPortPointerDown(event, station, direction)
          }
          onPointerUp={(event) => onPortPointerUp(event, station, direction)}
          r="10"
        >
          <title>{direction.label}</title>
        </circle>
      ))}
    </g>
  );
}

function DirectionPad({
  label,
  onChange,
  value,
}: {
  label: string;
  onChange: (direction: DirectionId) => void;
  value: DirectionId;
}) {
  return (
    <div className={styles.directionField}>
      <span>{label}</span>
      <div className={styles.directionGrid}>
        {DIRECTION_OPTIONS.map((direction) => (
          <button
            className={cn(
              styles.directionButton,
              value === direction.id && styles.activeDirection,
            )}
            key={direction.id}
            onClick={() => onChange(direction.id)}
            title={direction.label}
            type="button"
          >
            {direction.label}
          </button>
        ))}
      </div>
    </div>
  );
}
