"use client";

import { useReducedMotion } from "motion/react";
import {
  type KeyboardEvent,
  type PointerEvent,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { cn } from "@/helpers/classname-helper";

/* -------------------------------------------------------------------------- */
/* Geometry                                                                    */
/* -------------------------------------------------------------------------- */

// The globe is drawn in a 240 × 290 box and scaled to fit. Inside the glass,
// scenes and snow use their own space: the centre of the sphere is (0, 0) and
// its radius is 100, with y pointing down.
const VIEW_W = 240;
const VIEW_H = 290;
const SPHERE_X = 120;
const SPHERE_Y = 112;
const R = 100;
/** Where the globe pivots when it tips: the middle of the base's foot. */
const PIVOT_Y = 276;

/** Snow at rest that a current this fast (units/s) will pick back up. */
const LIFT_MIN = 22;
const LIFT_MAX = 58;
/** Fixed physics step, so a slow frame never throws the snow through a roof. */
const STEP = 1 / 120;

/* -------------------------------------------------------------------------- */
/* Scenes                                                                      */
/* -------------------------------------------------------------------------- */

export type SnowGlobeScene = "cabin" | "lighthouse" | "snowman";

type Ledge = { x0: number; y0: number; x1: number; y1: number };

type SceneConfig = {
  inscription: string;
  ground: (x: number) => number;
  /** Surfaces snow can settle on in front of the scenery. */
  ledges: Ledge[];
  /** A lamp that tints the snow falling past it. */
  light?: { x: number; y: number; radius: number; color: string };
  glitter: string;
  /** Give each flake a faint shadow so it reads against a pale sky. */
  flakeShadow: boolean;
  base: { body: string; dark: string; light: string; top: string };
};

const cabinGround = (x: number) =>
  36 + 0.0012 * x * x - 3 * Math.exp(-(((x + 58) / 20) ** 2));
const lighthouseGround = (x: number) =>
  40 + 0.0016 * x * x - 10 * Math.exp(-(((x - 10) / 34) ** 2));
const snowmanGround = (x: number) => 38 + 0.0013 * x * x;

/** The snow-catching shoulders at the ends of a pine's branches. */
function pineLedges(cx: number, baseY: number, height: number, width: number) {
  return pineTiers(cx, baseY, height, width).flatMap(({ yb, hw }) => [
    { x0: cx - hw - 0.5, y0: yb - 0.6, x1: cx - hw * 0.5, y1: yb - 2.4 },
    { x0: cx + hw * 0.5, y0: yb - 2.4, x1: cx + hw + 0.5, y1: yb - 0.6 },
  ]);
}

function pineTiers(cx: number, baseY: number, height: number, width: number) {
  return [
    { yb: baseY - height * 0.1, yt: baseY - height * 0.62, hw: width / 2 },
    { yb: baseY - height * 0.38, yt: baseY - height * 0.84, hw: width * 0.38 },
    { yb: baseY - height * 0.62, yt: baseY - height, hw: width * 0.26 },
  ].map((tier) => ({ ...tier, cx }));
}

const SNOWMAN_X = -14;

const scenes: Record<SnowGlobeScene, SceneConfig> = {
  cabin: {
    inscription: "Pine Hollow",
    ground: cabinGround,
    ledges: [
      // Roof
      { x0: -31, y0: 8.6, x1: -2, y1: -10.4 },
      { x0: -2, y0: -10.4, x1: 27, y1: 8.6 },
      // Chimney
      { x0: 9.5, y0: -13, x1: 16.5, y1: -13 },
      // Window sill
      { x0: -18, y0: 26, x1: -4, y1: 26 },
      ...pineLedges(-62, cabinGround(-62), 64, 34),
      ...pineLedges(62, cabinGround(62), 50, 28),
    ],
    light: { x: -11, y: 21, radius: 30, color: "#ffd796" },
    glitter: "#ffd98a",
    flakeShadow: false,
    base: {
      body: "#6b4027",
      dark: "#2e190d",
      light: "#a26c45",
      top: "#83523a",
    },
  },
  lighthouse: {
    inscription: "North Light",
    ground: lighthouseGround,
    ledges: [
      // Gallery
      { x0: -2.5, y0: -37, x1: 22.5, y1: -37 },
      // Keeper's hut roof
      { x0: -58, y0: 27.5, x1: -42, y1: 16.5 },
      { x0: -42, y0: 16.5, x1: -26, y1: 27.5 },
    ],
    light: { x: 10, y: -43, radius: 34, color: "#fff0b3" },
    glitter: "#ffe1ec",
    flakeShadow: true,
    base: {
      body: "#2b3e68",
      dark: "#121a31",
      light: "#5a74ab",
      top: "#38507f",
    },
  },
  snowman: {
    inscription: "First Snow",
    ground: snowmanGround,
    ledges: [
      // Hat
      { x0: SNOWMAN_X - 7, y0: -36.5, x1: SNOWMAN_X + 7, y1: -36.5 },
      { x0: SNOWMAN_X - 11.5, y0: -22, x1: SNOWMAN_X - 7, y1: -22 },
      { x0: SNOWMAN_X + 7, y0: -22, x1: SNOWMAN_X + 11.5, y1: -22 },
      // Stick arms
      { x0: SNOWMAN_X - 31, y0: -13, x1: SNOWMAN_X - 10, y1: -0.5 },
      { x0: SNOWMAN_X + 10, y0: -0.5, x1: SNOWMAN_X + 29, y1: -11 },
      ...pineLedges(52, snowmanGround(52), 58, 30),
      ...pineLedges(74, snowmanGround(74), 38, 20),
      ...pineLedges(-66, snowmanGround(-66), 44, 24),
    ],
    glitter: "#dbeeff",
    flakeShadow: true,
    base: {
      body: "#a3302b",
      dark: "#4f1310",
      light: "#dc6a5c",
      top: "#b94a40",
    },
  },
};

export const snowGlobeScenes = Object.keys(scenes) as SnowGlobeScene[];

/* -------------------------------------------------------------------------- */
/* Artwork                                                                     */
/* -------------------------------------------------------------------------- */

function groundPath(ground: (x: number) => number) {
  let path = "M -100 100";

  for (let x = -100; x <= 100; x += 5) {
    path += ` L ${x} ${ground(x).toFixed(2)}`;
  }

  return `${path} L 100 100 Z`;
}

function Pine({
  baseY,
  cx,
  dark,
  height,
  light,
  width,
}: {
  baseY: number;
  cx: number;
  dark: string;
  height: number;
  light: string;
  width: number;
}) {
  const tiers = pineTiers(cx, baseY, height, width);

  return (
    <g>
      <rect
        fill="#4a3020"
        height={height * 0.14}
        width={width * 0.12}
        x={cx - width * 0.06}
        y={baseY - height * 0.16}
      />
      {tiers.map(({ hw, yb, yt }) => {
        const capY = yt + (yb - yt) * 0.28;
        const capW = hw * 0.28;

        return (
          <g key={yb}>
            <path
              d={`M ${cx} ${yt} L ${cx - hw} ${yb} L ${cx} ${yb} Z`}
              fill={light}
            />
            <path
              d={`M ${cx} ${yt} L ${cx + hw} ${yb} L ${cx} ${yb} Z`}
              fill={dark}
            />
            <path
              d={`M ${cx - hw - 0.6} ${yb + 0.4} Q ${cx - hw * 0.8} ${yb - 2.6} ${cx - hw * 0.5} ${yb - 1.4} Q ${cx - hw * 0.25} ${yb - 3} ${cx} ${yb - 1.2} Q ${cx + hw * 0.3} ${yb - 2.8} ${cx + hw * 0.55} ${yb - 1.2} Q ${cx + hw * 0.85} ${yb - 2.4} ${cx + hw + 0.6} ${yb + 0.4} Z`}
              fill="#f6f9fc"
            />
            <path
              d={`M ${cx} ${yt - 0.6} L ${cx - capW} ${capY} Q ${cx} ${capY - 2} ${cx + capW} ${capY} Z`}
              fill="#f6f9fc"
            />
          </g>
        );
      })}
    </g>
  );
}

function SceneBack({
  animated,
  scene,
  uid,
}: {
  animated: boolean;
  scene: SnowGlobeScene;
  uid: string;
}) {
  const config = scenes[scene];

  if (scene === "cabin") {
    return (
      <g>
        <defs>
          <linearGradient
            id={`${uid}-sky`}
            x1="0"
            x2="0"
            y1="-100"
            y2="40"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0" stopColor="#0f1d38" />
            <stop offset="0.55" stopColor="#21406c" />
            <stop offset="1" stopColor="#56789f" />
          </linearGradient>
          <radialGradient
            id={`${uid}-window-glow`}
            cx="-11"
            cy="30"
            r="34"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0" stopColor="#ffc970" stopOpacity="0.55" />
            <stop offset="1" stopColor="#ffc970" stopOpacity="0" />
          </radialGradient>
          <linearGradient
            id={`${uid}-snow`}
            x1="0"
            x2="0"
            y1="30"
            y2="100"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0" stopColor="#e9f0f8" />
            <stop offset="1" stopColor="#9fb3cc" />
          </linearGradient>
        </defs>
        <rect
          fill={`url(#${uid}-sky)`}
          height="200"
          width="200"
          x="-100"
          y="-100"
        />
        {[
          [-58, -62, 0.9],
          [-30, -76, 0.6],
          [-6, -58, 0.7],
          [22, -80, 0.5],
          [-74, -34, 0.6],
          [74, -22, 0.5],
          [36, -44, 0.8],
        ].map(([x, y, r]) => (
          <circle
            cx={x}
            cy={y}
            fill="#f3f1dc"
            key={`${x}${y}`}
            opacity="0.85"
            r={r}
          />
        ))}
        <mask id={`${uid}-moon`}>
          <circle cx="50" cy="-54" fill="#fff" r="10" />
          <circle cx="55.5" cy="-58" fill="#000" r="9" />
        </mask>
        <circle cx="50" cy="-54" fill="#f5edcf" opacity="0.12" r="16" />
        <circle
          cx="50"
          cy="-54"
          fill="#f5edcf"
          mask={`url(#${uid}-moon)`}
          r="10"
        />
        <path
          d="M -100 22 Q -70 -2 -42 12 Q -18 -6 10 10 Q 40 -8 66 8 Q 86 0 100 10 L 100 40 L -100 40 Z"
          fill="#2f4c74"
        />
        <path
          d="M -100 28 Q -60 12 -24 24 Q 20 10 56 22 Q 80 16 100 24 L 100 40 L -100 40 Z"
          fill="#3d5f8b"
        />
        <path d={groundPath(config.ground)} fill={`url(#${uid}-snow)`} />
        <ellipse
          cx="-11"
          cy="40"
          fill={`url(#${uid}-window-glow)`}
          rx="40"
          ry="14"
        />
      </g>
    );
  }

  if (scene === "lighthouse") {
    return (
      <g>
        <defs>
          <linearGradient
            id={`${uid}-sky`}
            x1="0"
            x2="0"
            y1="-100"
            y2="14"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0" stopColor="#5d5c9b" />
            <stop offset="0.55" stopColor="#c98aa8" />
            <stop offset="1" stopColor="#f6c39f" />
          </linearGradient>
          <linearGradient
            id={`${uid}-sea`}
            x1="0"
            x2="0"
            y1="12"
            y2="40"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0" stopColor="#6d76a6" />
            <stop offset="1" stopColor="#3e4a7a" />
          </linearGradient>
          <linearGradient
            id={`${uid}-snow`}
            x1="0"
            x2="0"
            y1="24"
            y2="100"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0" stopColor="#fbf3f3" />
            <stop offset="1" stopColor="#b7b2cc" />
          </linearGradient>
        </defs>
        <rect
          fill={`url(#${uid}-sky)`}
          height="200"
          width="200"
          x="-100"
          y="-100"
        />
        <circle cx="-48" cy="12" fill="#ffe4bf" opacity="0.9" r="13" />
        <rect
          fill={`url(#${uid}-sea)`}
          height="88"
          width="200"
          x="-100"
          y="12"
        />
        {[
          [-80, 17, 18],
          [-40, 21, 12],
          [-58, 15, 10],
          [30, 18, 16],
          [64, 23, 22],
        ].map(([x, y, w]) => (
          <rect
            fill="#f4c3a6"
            height="0.8"
            key={`${x}${y}`}
            opacity="0.5"
            rx="0.4"
            width={w}
            x={x}
            y={y}
          />
        ))}
        <path d={groundPath(config.ground)} fill={`url(#${uid}-snow)`} />
        <BeamOrNothing animated={animated} uid={uid} />
      </g>
    );
  }

  return (
    <g>
      <defs>
        <linearGradient
          id={`${uid}-sky`}
          x1="0"
          x2="0"
          y1="-100"
          y2="40"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#4f8fca" />
          <stop offset="0.6" stopColor="#8fc0e8" />
          <stop offset="1" stopColor="#cfe5f5" />
        </linearGradient>
        <linearGradient
          id={`${uid}-snow`}
          x1="0"
          x2="0"
          y1="30"
          y2="100"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#b6c9dd" />
        </linearGradient>
      </defs>
      <rect
        fill={`url(#${uid}-sky)`}
        height="200"
        width="200"
        x="-100"
        y="-100"
      />
      <ellipse cx="-50" cy="-52" fill="#ffffff" opacity="0.55" rx="18" ry="5" />
      <ellipse cx="-40" cy="-56" fill="#ffffff" opacity="0.55" rx="10" ry="5" />
      <ellipse cx="44" cy="-66" fill="#ffffff" opacity="0.45" rx="14" ry="4" />
      <path
        d="M -100 30 L -64 -4 L -44 12 L -16 -18 L 14 14 L 42 -6 L 72 18 L 100 4 L 100 40 L -100 40 Z"
        fill="#9db9d6"
      />
      <path
        d="M -64 -4 L -56 4 L -60 3 L -66 7 L -71 3 Z M -16 -18 L -6 -7 L -12 -9 L -17 -4 L -24 -9 Z M 42 -6 L 50 2 L 45 1 L 40 4 L 36 0 Z"
        fill="#f2f7fc"
      />
      <path d={groundPath(config.ground)} fill={`url(#${uid}-snow)`} />
    </g>
  );
}

/** The lighthouse's beam sweeps round, unless motion is reduced. */
function BeamOrNothing({ animated, uid }: { animated: boolean; uid: string }) {
  return (
    <g transform="translate(10 -43)">
      <defs>
        <linearGradient id={`${uid}-beam`} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#fff4c2" stopOpacity="0.75" />
          <stop offset="1" stopColor="#fff4c2" stopOpacity="0" />
        </linearGradient>
      </defs>
      <g opacity="0.75">
        <path d="M 0 -3 L 110 -18 L 110 18 L 0 3 Z" fill={`url(#${uid}-beam)`}>
          {animated ? (
            <animateTransform
              attributeName="transform"
              dur="7s"
              keyTimes="0;0.5;1"
              repeatCount="indefinite"
              type="scale"
              values="1 1;-1 1;1 1"
            />
          ) : null}
        </path>
      </g>
    </g>
  );
}

function SceneFront({ scene, uid }: { scene: SnowGlobeScene; uid: string }) {
  const config = scenes[scene];

  if (scene === "cabin") {
    return (
      <g>
        <defs>
          <linearGradient
            id={`${uid}-window`}
            x1="0"
            x2="0"
            y1="15"
            y2="27"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0" stopColor="#ffe3a0" />
            <stop offset="1" stopColor="#ffab47" />
          </linearGradient>
        </defs>
        <Pine
          baseY={config.ground(-62)}
          cx={-62}
          dark="#1f4338"
          height={64}
          light="#2d5c4c"
          width={34}
        />
        <Pine
          baseY={config.ground(62)}
          cx={62}
          dark="#1f4338"
          height={50}
          light="#2d5c4c"
          width={28}
        />
        {/* Chimney */}
        <rect fill="#6b3a2c" height="16" width="6" x="10" y="-12" />
        <rect fill="#f6f9fc" height="2" rx="1" width="8" x="9" y="-14" />
        {/* Walls */}
        <rect fill="#8a5634" height="34" width="44" x="-24" y="6" />
        {[11, 16, 21, 26, 31, 36].map((y) => (
          <rect
            fill="#5e3720"
            height="0.7"
            key={y}
            opacity="0.55"
            width="44"
            x="-24"
            y={y}
          />
        ))}
        <rect fill="#000" height="34" opacity="0.18" width="10" x="10" y="6" />
        {/* Window */}
        <rect
          fill="#4a2b18"
          height="13"
          rx="0.5"
          width="13"
          x="-17.5"
          y="14.5"
        />
        <rect
          fill={`url(#${uid}-window)`}
          height="11"
          width="11"
          x="-16.5"
          y="15.5"
        />
        <rect fill="#4a2b18" height="11" width="1" x="-11.5" y="15.5" />
        <rect fill="#4a2b18" height="1" width="11" x="-16.5" y="20.5" />
        <rect
          fill="#f6f9fc"
          height="1.8"
          rx="0.9"
          width="15"
          x="-18.5"
          y="26.3"
        />
        {/* Door */}
        <path d="M 3 40 L 3 22 Q 8.5 17 14 22 L 14 40 Z" fill="#4d2c19" />
        <circle cx="12" cy="31" fill="#e2b35a" r="0.7" />
        {/* Roof */}
        <path
          d="M -31 9 L -2 -11 L 27 9 L 27 11 L -2 -9 L -31 11 Z"
          fill="#33242a"
        />
        <path
          d="M -31 9 L -2 -11 L 27 9 L 20 9 L -2 -6 L -24 9 Z"
          fill="#3d2b31"
        />
        <path
          d="M -32 9.4 L -2 -11.6 L 28 9.4 Q 26 10.2 24.4 8.4 Q 22 9.6 20 7.2 Q 15 8 12 4.6 L -2 -5.6 L -16 4 Q -19 7.4 -22 6.6 Q -25 9.4 -28 8.2 Q -30 10.4 -32 9.4 Z"
          fill="#f6f9fc"
        />
        {/* Drift against the walls */}
        <path
          d="M -30 42 Q -26 34 -20 37 Q -14 33 -8 36 Q 0 32 6 37 Q 14 33 20 36 Q 26 35 28 42 Z"
          fill="#eef3f9"
        />
      </g>
    );
  }

  if (scene === "lighthouse") {
    const baseY = config.ground(10);

    return (
      <g>
        <defs>
          <clipPath id={`${uid}-tower`}>
            <path
              d={`M -3 ${baseY + 2} L 2 -34 L 18 -34 L 23 ${baseY + 2} Z`}
            />
          </clipPath>
          <radialGradient
            id={`${uid}-lamp`}
            cx="10"
            cy="-43"
            r="12"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0" stopColor="#fffbe0" />
            <stop offset="0.5" stopColor="#ffe48a" stopOpacity="0.85" />
            <stop offset="1" stopColor="#ffe48a" stopOpacity="0" />
          </radialGradient>
        </defs>
        {/* Rocks */}
        <path
          d="M 38 50 Q 44 38 54 41 Q 60 36 68 42 Q 72 48 70 54 Z"
          fill="#4b4c63"
        />
        <path d="M 46 45 Q 52 40 58 42 Q 52 43 48 47 Z" fill="#f8f2f4" />
        <path d="M -78 54 Q -74 44 -66 46 Q -60 44 -58 52 Z" fill="#4b4c63" />
        {/* Keeper's hut */}
        <rect fill="#e9dfd6" height="16" width="24" x="-54" y="26" />
        <rect fill="#000" height="16" opacity="0.12" width="7" x="-37" y="26" />
        <rect fill="#ffd27a" height="6" width="5" x="-49" y="31" />
        <rect fill="#5a4a5c" height="9" width="5" x="-40" y="33" />
        <path
          d="M -58 28 L -42 16 L -26 28 L -26 30 L -42 18 L -58 30 Z"
          fill="#7b2f36"
        />
        <path
          d="M -59 28.4 L -42 15.4 L -25 28.4 Q -27 29.4 -29 27.4 Q -33 28 -35 25 L -42 19.6 L -50 25.6 Q -53 28.4 -55 27.6 Q -57 29.6 -59 28.4 Z"
          fill="#fbf6f6"
        />
        {/* Tower */}
        <g clipPath={`url(#${uid}-tower)`}>
          <rect fill="#f4eeea" height="90" width="40" x="-10" y="-40" />
          {[-24, -6, 12].map((y) => (
            <rect fill="#c23b3b" height="9" key={y} width="40" x="-10" y={y} />
          ))}
          <rect
            fill="#000"
            height="90"
            opacity="0.14"
            width="12"
            x="14"
            y="-40"
          />
        </g>
        <rect fill="#2e2a3d" height="3" rx="0.6" width="26" x="-3" y="-37" />
        <rect
          fill="#fbf6f6"
          height="1.6"
          rx="0.8"
          width="27"
          x="-3.5"
          y="-38.2"
        />
        <rect fill="#2e2a3d" height="14" width="12" x="4" y="-50" />
        <rect fill={`url(#${uid}-lamp)`} height="12" width="10" x="5" y="-49" />
        <circle cx="10" cy="-43" fill={`url(#${uid}-lamp)`} r="12" />
        <path d="M 2 -50 Q 10 -63 18 -50 Z" fill="#8c2f2f" />
        <circle cx="10" cy="-58" fill="#2e2a3d" r="1.4" />
        <path
          d={`M -8 ${baseY + 4} Q 0 ${baseY - 3} 10 ${baseY} Q 20 ${baseY - 4} 28 ${baseY + 4} Z`}
          fill="#fbf4f4"
        />
      </g>
    );
  }

  const cx = SNOWMAN_X;

  return (
    <g>
      <defs>
        <radialGradient id={`${uid}-ball`} cx="0.38" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.7" stopColor="#eef4fa" />
          <stop offset="1" stopColor="#bccde0" />
        </radialGradient>
      </defs>
      <Pine
        baseY={config.ground(-66)}
        cx={-66}
        dark="#2c5a44"
        height={44}
        light="#3b7458"
        width={24}
      />
      <Pine
        baseY={config.ground(52)}
        cx={52}
        dark="#2c5a44"
        height={58}
        light="#3b7458"
        width={30}
      />
      <Pine
        baseY={config.ground(74)}
        cx={74}
        dark="#2c5a44"
        height={38}
        light="#3b7458"
        width={20}
      />
      {/* Arms */}
      <path
        d={`M ${cx - 10} 0 L ${cx - 31} -13 M ${cx - 24} -8.6 L ${cx - 28} -16`}
        stroke="#5b3a24"
        strokeLinecap="round"
        strokeWidth="1.6"
      />
      <path
        d={`M ${cx + 10} 0 L ${cx + 29} -11 M ${cx + 23} -7.6 L ${cx + 25} -15`}
        stroke="#5b3a24"
        strokeLinecap="round"
        strokeWidth="1.6"
      />
      <ellipse cx={cx} cy="40" fill="#9fb4cc" opacity="0.5" rx="20" ry="3.5" />
      <circle cx={cx} cy="26" fill={`url(#${uid}-ball)`} r="16" />
      <circle cx={cx} cy="3" fill={`url(#${uid}-ball)`} r="11.5" />
      <circle cx={cx} cy="-14" fill={`url(#${uid}-ball)`} r="8.5" />
      {[-1, 4, 9].map((y) => (
        <circle cx={cx} cy={y} fill="#2b2b33" key={y} r="1.1" />
      ))}
      <circle cx={cx - 3} cy="-16" fill="#2b2b33" r="1" />
      <circle cx={cx + 3} cy="-16" fill="#2b2b33" r="1" />
      <path
        d={`M ${cx} -13.6 L ${cx + 9} -12 L ${cx} -11.4 Z`}
        fill="#f08a2b"
      />
      {/* Scarf */}
      <path
        d={`M ${cx - 8.5} -7.8 Q ${cx} -4.4 ${cx + 8.5} -7.8 L ${cx + 8.6} -5 Q ${cx} -1.6 ${cx - 8.6} -5 Z`}
        fill="#d23f3a"
      />
      <path
        d={`M ${cx + 3} -4.6 L ${cx + 8} 8 L ${cx + 4} 8.6 L ${cx + 0.6} -4 Z`}
        fill="#b8322e"
      />
      {/* Hat */}
      <rect fill="#24232b" height="2" rx="0.6" width="22" x={cx - 11} y="-22" />
      <rect
        fill="#24232b"
        height="14.5"
        rx="0.6"
        width="14"
        x={cx - 7}
        y="-36"
      />
      <rect fill="#d23f3a" height="2.4" width="14" x={cx - 7} y="-24.4" />
    </g>
  );
}

function Glass({ uid }: { uid: string }) {
  return (
    <g>
      <defs>
        <radialGradient
          id={`${uid}-edge`}
          cx="0"
          cy="0"
          r="100"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0.72" stopColor="#0b1628" stopOpacity="0" />
          <stop offset="0.93" stopColor="#0b1628" stopOpacity="0.16" />
          <stop offset="1" stopColor="#0b1628" stopOpacity="0.42" />
        </radialGradient>
      </defs>
      <circle fill={`url(#${uid}-edge)`} r={R} />
      <path
        d="M -70 66 A 96 96 0 0 0 70 66 A 104 104 0 0 1 -70 66 Z"
        fill="#ffffff"
        opacity="0.2"
      />
      <circle
        fill="none"
        r={R - 0.6}
        stroke="#ffffff"
        strokeOpacity="0.4"
        strokeWidth="1.2"
      />
      <circle
        fill="none"
        r={R}
        stroke="#0b1628"
        strokeOpacity="0.35"
        strokeWidth="0.8"
      />
    </g>
  );
}

/** Highlights that stay put in the room while the glass tips under them. */
function GlassShine({ uid }: { uid: string }) {
  return (
    <g>
      <defs>
        <linearGradient id={`${uid}-shine`} x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.75" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path
        d="M -84 -18 A 86 86 0 0 1 -22 -84 A 92 92 0 0 0 -76 -16 Z"
        fill={`url(#${uid}-shine)`}
      />
      <ellipse
        cx="-44"
        cy="-62"
        fill="#ffffff"
        opacity="0.85"
        rx="9"
        ry="3.6"
        transform="rotate(-38 -44 -62)"
      />
      <path
        d="M 88 22 A 90 90 0 0 1 58 70"
        fill="none"
        stroke="#ffffff"
        strokeLinecap="round"
        strokeOpacity="0.22"
        strokeWidth="2.4"
      />
    </g>
  );
}

function Base({
  inscription,
  scene,
  uid,
}: {
  inscription: string;
  scene: SnowGlobeScene;
  uid: string;
}) {
  const { base } = scenes[scene];

  return (
    <g>
      <defs>
        <linearGradient id={`${uid}-turned`} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor={base.dark} />
          <stop offset="0.18" stopColor={base.body} />
          <stop offset="0.34" stopColor={base.light} />
          <stop offset="0.52" stopColor={base.body} />
          <stop offset="0.86" stopColor={base.dark} stopOpacity="0.9" />
          <stop offset="1" stopColor={base.dark} />
        </linearGradient>
        <linearGradient id={`${uid}-brass`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#f7e6ad" />
          <stop offset="0.45" stopColor="#d9b660" />
          <stop offset="1" stopColor="#9c7630" />
        </linearGradient>
        <linearGradient id={`${uid}-occlusion`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#000" stopOpacity="0.35" />
          <stop offset="1" stopColor="#000" stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* Foot */}
      <path
        d="M 26 268 L 26 274 A 94 10 0 0 0 214 274 L 214 268 Z"
        fill={`url(#${uid}-turned)`}
      />
      <path
        d="M 26 274 A 94 10 0 0 0 214 274"
        fill="none"
        stroke="#000"
        strokeOpacity="0.3"
        strokeWidth="1"
      />
      {/* Plinth */}
      <path
        d="M 58 214 C 57 236 46 256 30 268 A 90 9 0 0 0 210 268 C 194 256 183 236 182 214 Z"
        fill={`url(#${uid}-turned)`}
      />
      <path
        d="M 58 214 C 57.6 222 56 230 53 236 L 187 236 C 184 230 182.4 222 182 214 Z"
        fill={`url(#${uid}-occlusion)`}
      />
      {/* Bead */}
      <path
        d="M 58 210 L 58 216 A 62 6 0 0 0 182 216 L 182 210 Z"
        fill={`url(#${uid}-turned)`}
      />
      <path
        d="M 58 210 A 62 6 0 0 0 182 210"
        fill="none"
        stroke="#ffffff"
        strokeOpacity="0.25"
        strokeWidth="0.8"
      />
      {/* Collar */}
      <path
        d="M 64 194 L 64 210 A 56 6 0 0 0 176 210 L 176 194 A 56 6 0 0 1 64 194 Z"
        fill={`url(#${uid}-turned)`}
      />
      <path
        d="M 64 194 A 56 6 0 0 0 176 194"
        fill="none"
        stroke="#ffffff"
        strokeOpacity="0.35"
        strokeWidth="1"
      />
      <path
        d="M 64 196.5 A 56 6 0 0 0 176 196.5"
        fill="none"
        stroke="#000"
        strokeOpacity="0.25"
        strokeWidth="1"
      />
      {/* Plaque */}
      <rect
        fill="#000"
        height="19"
        opacity="0.25"
        rx="2.5"
        width="78"
        x="81"
        y="237.5"
      />
      <rect
        fill={`url(#${uid}-brass)`}
        height="18"
        rx="2.5"
        width="76"
        x="82"
        y="236"
      />
      <rect
        fill="none"
        height="16"
        rx="1.8"
        stroke="#fff6d4"
        strokeOpacity="0.55"
        strokeWidth="0.6"
        width="74"
        x="83"
        y="237"
      />
      <circle cx="87.5" cy="245" fill="#8c6a2a" r="1.1" />
      <circle cx="152.5" cy="245" fill="#8c6a2a" r="1.1" />
      <text
        fill="#fff3c9"
        fontFamily="ui-serif, Georgia, serif"
        fontSize="7"
        letterSpacing="0.9"
        textAnchor="middle"
        x="120"
        y="248.4"
      >
        {inscription.toUpperCase()}
      </text>
      <text
        fill="#5b4316"
        fontFamily="ui-serif, Georgia, serif"
        fontSize="7"
        letterSpacing="0.9"
        textAnchor="middle"
        x="120"
        y="247.8"
      >
        {inscription.toUpperCase()}
      </text>
    </g>
  );
}

/* -------------------------------------------------------------------------- */
/* Static face, for thumbnails                                                 */
/* -------------------------------------------------------------------------- */

const faceFlakes = Array.from({ length: 46 }, (_, index) => {
  const angle = index * 2.399963;
  const radius = 86 * Math.sqrt((index + 0.5) / 46);
  return {
    r: 0.9 + ((index * 7) % 5) * 0.32,
    x: Math.cos(angle) * radius,
    y: Math.sin(angle) * radius * 0.82 - 16,
  };
}).filter(({ x, y }) => y < cabinGround(x) - 6);

/** A still snow globe, mid-flurry. Handy for previews and thumbnails. */
export function SnowGlobeFace({
  className,
  scene = "cabin",
}: {
  className?: string;
  scene?: SnowGlobeScene;
}) {
  const uid = `sgf${useId().replace(/[^a-zA-Z0-9]/g, "")}`;

  return (
    <svg
      aria-hidden="true"
      className={cn("block h-auto", className)}
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
    >
      <defs>
        <clipPath id={`${uid}-sphere`}>
          <circle r={R - 0.5} />
        </clipPath>
      </defs>
      <ellipse cx="120" cy="279" fill="#000" opacity="0.14" rx="98" ry="8" />
      <g transform={`translate(${SPHERE_X} ${SPHERE_Y})`}>
        <g clipPath={`url(#${uid}-sphere)`}>
          <SceneBack animated={false} scene={scene} uid={uid} />
          <SceneFront scene={scene} uid={uid} />
          {/* Marked so a parent can animate the flakes. */}
          <g data-flakes="" fill="#ffffff">
            {faceFlakes.map(({ r, x, y }) => (
              <circle cx={x} cy={y} key={`${x}${y}`} r={r * 1.5} />
            ))}
          </g>
        </g>
        <Glass uid={uid} />
        <GlassShine uid={uid} />
      </g>
      <Base inscription={scenes[scene].inscription} scene={scene} uid={uid} />
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/* Sound                                                                       */
/* -------------------------------------------------------------------------- */

let sharedAudioContext: AudioContext | null = null;
let noiseBuffer: AudioBuffer | null = null;

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

function getNoise(context: AudioContext) {
  if (!noiseBuffer) {
    const length = context.sampleRate * 2;
    noiseBuffer = context.createBuffer(1, length, context.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    let brown = 0;

    // Brown noise: a rumble rather than a hiss, like water moving in glass.
    for (let index = 0; index < length; index += 1) {
      brown = (brown + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      data[index] = brown * 3.5;
    }
  }

  return noiseBuffer;
}

type Slosh = { gain: GainNode; filter: BiquadFilterNode };

function createSlosh(context: AudioContext): Slosh {
  const source = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const gain = context.createGain();

  source.buffer = getNoise(context);
  source.loop = true;
  filter.type = "bandpass";
  filter.frequency.value = 420;
  filter.Q.value = 0.9;
  gain.gain.value = 0;
  source.connect(filter).connect(gain).connect(context.destination);
  source.start();

  return { filter, gain };
}

/** The base meeting the table: a dull knock with a little glass ring. */
function playThunk(strength: number) {
  const context = getAudioContext();

  if (!context) {
    return;
  }

  const now = context.currentTime;
  const level = Math.min(1, strength);
  const knock = context.createBufferSource();
  const knockFilter = context.createBiquadFilter();
  const knockGain = context.createGain();

  knock.buffer = getNoise(context);
  knockFilter.type = "lowpass";
  knockFilter.frequency.value = 260;
  knockGain.gain.setValueAtTime(0.9 * level, now);
  knockGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);
  knock.connect(knockFilter).connect(knockGain).connect(context.destination);
  knock.start(now, Math.random());
  knock.stop(now + 0.16);

  const ring = context.createOscillator();
  const ringGain = context.createGain();
  ring.type = "sine";
  ring.frequency.value = 2380 + Math.random() * 140;
  ringGain.gain.setValueAtTime(0.035 * level, now);
  ringGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);
  ring.connect(ringGain).connect(context.destination);
  ring.start(now);
  ring.stop(now + 0.52);
}

/* -------------------------------------------------------------------------- */
/* Simulation                                                                  */
/* -------------------------------------------------------------------------- */

type Flake = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Radius in scene units. */
  size: number;
  /** 0 is the back of the globe and 1 the front. */
  z: number;
  front: boolean;
  sink: number;
  flutter: number;
  freq: number;
  phase: number;
  /** How quickly the flake gives in to the water around it, in seconds. */
  lag: number;
  lift: number;
  resting: boolean;
  glitter: boolean;
  angle: number;
  spin: number;
};

type Fluid = {
  /** The body of water sloshing as one, in scene units per second. */
  ux: number;
  uy: number;
  /** A vortex round the middle, in radians per second. */
  swirl: number;
  /** How stirred up the water is, in scene units per second. */
  turbulence: number;
};

type Globe = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  tx: number;
  ty: number;
  tilt: number;
  tiltV: number;
  held: boolean;
};

function random(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function smoothstep(edge0: number, edge1: number, value: number) {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/** The lowest point a flake can be on its layer, at a given x. */
function floorAt(flake: Flake, ground: (x: number) => number) {
  const wall = Math.sqrt(Math.max(0, (R - 3) ** 2 - flake.x * flake.x));
  // Nearer flakes settle lower down the bank, further ones higher up it.
  const depth = flake.front ? (flake.z - 0.45) * 16 : (flake.z - 0.45) * 18;
  return Math.min(ground(flake.x) + depth - flake.size * 0.4, wall);
}

function createFlakes(count: number, scene: SceneConfig) {
  const flakes: Flake[] = [];

  for (let index = 0; index < count; index += 1) {
    const z = Math.random();
    const front = z >= 0.45;
    const glitter = Math.random() < 0.16;
    const size = glitter
      ? random(1.1, 1.9)
      : front
        ? random(0.9, 2.3)
        : random(0.55, 1.2);
    const flake: Flake = {
      angle: random(0, Math.PI * 2),
      flutter: random(3, 9),
      freq: random(1.2, 2.6),
      front,
      glitter,
      lag: 0.05 + size * 0.05,
      lift: random(LIFT_MIN, LIFT_MAX),
      phase: random(0, Math.PI * 2),
      resting: false,
      sink: glitter ? random(15, 24) : 6 + size * 4 + random(0, 4),
      size,
      spin: random(-3, 3),
      vx: 0,
      vy: 0,
      x: random(-82, 82),
      y: 0,
      z,
    };

    scatter(flake, scene, Math.random() < 0.55);
    flakes.push(flake);
  }

  return flakes;
}

/** Put a flake somewhere random, either in the water or settled on the bank. */
function scatter(flake: Flake, scene: SceneConfig, settled: boolean) {
  flake.x = random(-84, 84);
  flake.vx = 0;
  flake.vy = 0;

  const floor = floorAt(flake, scene.ground);

  if (settled) {
    flake.y = floor;
    flake.resting = true;
    return;
  }

  const ceiling = -Math.sqrt(Math.max(0, (R - 6) ** 2 - flake.x * flake.x));
  flake.y = random(ceiling, floor - 4);
  flake.resting = false;
}

/** The water's velocity at a point. Writes into `out` to avoid allocating. */
function fluidAt(
  fluid: Fluid,
  x: number,
  y: number,
  time: number,
  out: { x: number; y: number },
) {
  const r2 = (x * x + y * y) / (R * R);
  const r = Math.sqrt(r2);
  let ux = fluid.ux;
  let uy = fluid.uy;

  // The glass turns the slosh: near the wall it runs along it, not into it.
  if (r > 0.55) {
    const nx = x / (r * R);
    const ny = y / (r * R);
    const into = ux * nx + uy * ny;

    if (into > 0) {
      const give = smoothstep(0.55, 1, r) * 1.6;
      ux -= nx * into * give;
      uy -= ny * into * give;
    }
  }

  const swirl = fluid.swirl * (1 - 0.6 * r2);
  ux += -y * swirl;
  uy += x * swirl;

  if (fluid.turbulence > 0.4) {
    // Curl of a few drifting waves: eddies that never pile the snow up.
    const t = time;
    const a = 0.045 * x + 0.031 * y + 0.9 * t;
    const b = -0.028 * x + 0.052 * y - 1.3 * t;
    const c = 0.07 * x - 0.061 * y + 0.5 * t;
    const ca = Math.cos(a);
    const cb = Math.cos(b);
    const cc = Math.cos(c) * 0.6;
    // ψ = sin(a)/k + sin(b)/k + 0.6·sin(c)/k, then u = ∂ψ/∂y, v = −∂ψ/∂x.
    const dpdx =
      (ca * 0.045) / 0.055 + (cb * -0.028) / 0.059 + (cc * 0.07) / 0.093;
    const dpdy =
      (ca * 0.031) / 0.055 + (cb * 0.052) / 0.059 + (cc * -0.061) / 0.093;
    const scale = fluid.turbulence * 0.55;
    ux += dpdy * scale;
    uy -= dpdx * scale;
  }

  out.x = ux;
  out.y = uy;
}

function crossesLedge(
  ledge: Ledge,
  px: number,
  py: number,
  x: number,
  y: number,
) {
  const minX = Math.min(ledge.x0, ledge.x1);
  const maxX = Math.max(ledge.x0, ledge.x1);

  if (x < minX || x > maxX) {
    return null;
  }

  const t = (x - ledge.x0) / (ledge.x1 - ledge.x0 || 1);
  const ledgeY = ledge.y0 + (ledge.y1 - ledge.y0) * t;
  const pt = (clamp(px, minX, maxX) - ledge.x0) / (ledge.x1 - ledge.x0 || 1);
  const prevLedgeY = ledge.y0 + (ledge.y1 - ledge.y0) * pt;

  return py <= prevLedgeY + 0.3 && y >= ledgeY ? ledgeY : null;
}

/* -------------------------------------------------------------------------- */
/* Component                                                                   */
/* -------------------------------------------------------------------------- */

export type SnowGlobeProps = {
  /** What's inside the glass. */
  scene?: SnowGlobeScene;
  /** Engraved on the brass plaque. Defaults to the scene's own name. */
  inscription?: string;
  /** Width of the globe in pixels. It shrinks to fit narrower containers. */
  size?: number;
  /** How many flakes and glitter pieces to fill it with. */
  flakes?: number;
  /** Play the water sloshing and the base knocking on the table. */
  sound?: boolean;
  /** Accessible name for the globe. */
  label?: string;
  className?: string;
};

type Shake = { x: number; y: number; at: number }[];

/** A two-handed shake, as offsets in globe widths and times in seconds. */
const SHAKE: Shake = [
  { at: 0, x: 0, y: -0.05 },
  { at: 0.09, x: -0.11, y: -0.09 },
  { at: 0.2, x: 0.1, y: -0.04 },
  { at: 0.3, x: -0.1, y: -0.11 },
  { at: 0.41, x: 0.09, y: -0.05 },
  { at: 0.51, x: -0.07, y: -0.1 },
  { at: 0.61, x: 0.05, y: -0.06 },
  { at: 0.72, x: 0, y: -0.07 },
  { at: 0.82, x: 0, y: -0.02 },
];

function nudge(direction: -1 | 1, vertical: boolean): Shake {
  return vertical
    ? [
        { at: 0, x: 0, y: direction < 0 ? -0.14 : -0.02 },
        { at: 0.13, x: 0, y: direction < 0 ? -0.02 : -0.1 },
        { at: 0.24, x: 0, y: -0.03 },
      ]
    : [
        { at: 0, x: direction * 0.1, y: -0.04 },
        { at: 0.13, x: -direction * 0.04, y: -0.03 },
        { at: 0.24, x: 0, y: -0.02 },
      ];
}

export function SnowGlobe({
  scene = "cabin",
  inscription,
  size = 300,
  flakes: flakeCount = 260,
  sound = false,
  label = "Snow globe",
  className,
}: SnowGlobeProps) {
  const shouldReduceMotion = useReducedMotion() ?? false;
  const uid = `sg${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const config = scenes[scene];

  const rootRef = useRef<HTMLButtonElement>(null);
  const bodyRef = useRef<HTMLSpanElement>(null);
  const shadowRef = useRef<HTMLSpanElement>(null);
  const shineRef = useRef<SVGSVGElement>(null);
  const backCanvasRef = useRef<HTMLCanvasElement>(null);
  const frontCanvasRef = useRef<HTMLCanvasElement>(null);

  const [snowing, setSnowing] = useState(false);

  // Everything the animation loop touches lives in one mutable bag, so a frame
  // never waits on React.
  const sim = useRef({
    flakes: [] as Flake[],
    fluid: { swirl: 0, turbulence: 0, ux: 0, uy: 0 } as Fluid,
    globe: {
      held: false,
      tilt: 0,
      tiltV: 0,
      tx: 0,
      ty: 0,
      vx: 0,
      vy: 0,
      x: 0,
      y: 0,
    } as Globe,
    shake: null as null | { plan: Shake; start: number },
    pointer: null as null | {
      id: number;
      startX: number;
      startY: number;
      moved: boolean;
    },
    suppressClick: false,
    time: 0,
    width: size,
    frame: 0,
    last: 0,
    running: false,
    visible: true,
    snowing: false,
    slosh: null as Slosh | null,
    sloshLevel: 0,
    sound,
    reduce: shouldReduceMotion,
    config,
    wake: () => {},
  });

  sim.current.sound = sound;
  sim.current.reduce = shouldReduceMotion;
  sim.current.config = config;

  const draw = useCallback(() => {
    const state = sim.current;
    const width = state.width * ((2 * R) / VIEW_W);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const scale = (width / (2 * R)) * dpr;
    const { light, glitter, flakeShadow } = state.config;

    for (const front of [false, true]) {
      const canvas = front ? frontCanvasRef.current : backCanvasRef.current;
      const context = canvas?.getContext("2d");

      if (!canvas || !context) {
        continue;
      }

      const pixels = Math.round(width * dpr);

      if (canvas.width !== pixels) {
        canvas.width = pixels;
        canvas.height = pixels;
      }

      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, pixels, pixels);
      context.setTransform(scale, 0, 0, scale, pixels / 2, pixels / 2);

      for (const flake of state.flakes) {
        if (flake.front !== front) {
          continue;
        }

        const lit =
          light &&
          (flake.x - light.x) ** 2 + (flake.y - light.y) ** 2 <
            light.radius ** 2;

        if (flake.glitter) {
          // A spinning sliver only flashes when it turns its face to you.
          const facing = Math.abs(Math.sin(flake.angle));
          const w = flake.size * 1.5;
          const h = flake.size * (0.25 + facing * 0.65);
          const cos = Math.cos(flake.angle * 0.5);
          const sin = Math.sin(flake.angle * 0.5);
          context.globalAlpha = (front ? 0.35 : 0.2) + facing * 0.65;
          context.fillStyle = lit ? "#fffbe8" : glitter;
          context.beginPath();
          context.moveTo(
            flake.x + cos * w - sin * h,
            flake.y + sin * w + cos * h,
          );
          context.lineTo(
            flake.x - cos * w - sin * h,
            flake.y - sin * w + cos * h,
          );
          context.lineTo(
            flake.x - cos * w + sin * h,
            flake.y - sin * w - cos * h,
          );
          context.lineTo(
            flake.x + cos * w + sin * h,
            flake.y + sin * w - cos * h,
          );
          context.fill();
          continue;
        }

        if (flakeShadow && !flake.resting) {
          context.globalAlpha = front ? 0.2 : 0.12;
          context.fillStyle = "#28456b";
          context.beginPath();
          context.arc(
            flake.x + 0.25,
            flake.y + 0.45,
            flake.size * 1.25,
            0,
            Math.PI * 2,
          );
          context.fill();
        }

        context.globalAlpha = front
          ? 0.82 + flake.z * 0.18
          : 0.42 + flake.z * 0.6;
        context.fillStyle = lit && light ? light.color : "#ffffff";
        context.beginPath();
        context.arc(flake.x, flake.y, flake.size, 0, Math.PI * 2);
        context.fill();
      }
    }
  }, []);

  /** Advance the water, the globe and every flake by one fixed step. */
  const step = useCallback((dt: number) => {
    const state = sim.current;
    const { globe, fluid } = state;
    const width = state.width;
    const unit = (width * ((2 * R) / VIEW_W)) / (2 * R);
    state.time += dt;

    // Follow the scripted shake, if there is one.
    if (state.shake) {
      const elapsed = state.time - state.shake.start;
      const plan = state.shake.plan;
      const next = plan.find((key) => key.at >= elapsed);

      if (next) {
        globe.tx = next.x * width;
        globe.ty = next.y * width;
        globe.held = true;
      } else {
        state.shake = null;
        globe.held = state.pointer !== null;
      }
    }

    // The globe: stiff in the hand, loose once it's let go.
    const startVx = globe.vx;
    const startVy = globe.vy;

    if (globe.held) {
      const k = 1700;
      const c = 62;
      globe.vx += (k * (globe.tx - globe.x) - c * globe.vx) * dt;
      globe.vy += (k * (globe.ty - globe.y) - c * globe.vy) * dt;
    } else {
      // Slides home along the table, and falls onto it.
      globe.vx += (220 * -globe.x - 18 * globe.vx) * dt;
      globe.vy += 3200 * dt;
    }

    globe.x += globe.vx * dt;
    globe.y += globe.vy * dt;

    // The table.
    if (globe.y > 0) {
      if (globe.vy > 140 && !globe.held) {
        if (state.sound) {
          playThunk(globe.vy / 900);
        }

        if ("vibrate" in navigator && globe.vy > 400) {
          navigator.vibrate?.(8);
        }

        // The jolt of landing throws the snow up off the floor.
        fluid.turbulence = Math.min(
          150,
          fluid.turbulence + Math.min(globe.vy, 900) * 0.05,
        );
      }

      globe.y = 0;
      globe.vy = globe.vy > 60 ? -globe.vy * 0.18 : 0;
    }

    // What the glass actually did this step, table and all.
    const ax = (globe.vx - startVx) / dt;
    const ay = (globe.vy - startVy) / dt;

    // Tip with the hand's motion; rock back onto the base once let go.
    const tiltTarget = clamp(
      globe.x * (globe.held ? 0.09 : 0.06) + globe.vx * 0.012,
      -14,
      14,
    );
    const tiltA =
      260 * (tiltTarget - globe.tilt) - (globe.held ? 26 : 9) * globe.tiltV;
    globe.tiltV += tiltA * dt;
    globe.tilt += globe.tiltV * dt;

    // The water lags behind the glass, so it feels the opposite of the push.
    const radians = (globe.tilt * Math.PI) / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    const lax = (ax * cos + ay * sin) / unit;
    const lay = (-ax * sin + ay * cos) / unit;
    const push = Math.hypot(lax, lay);

    fluid.ux += (-lax * 0.11 - fluid.ux / 0.55) * dt;
    fluid.uy += (-lay * 0.11 - fluid.uy / 0.55) * dt;
    fluid.swirl +=
      ((fluid.ux * lay - fluid.uy * lax) * 2.2e-6 -
        ((tiltA * Math.PI) / 180) * 0.004 -
        fluid.swirl / 2.4) *
      dt;
    fluid.turbulence += (push * 0.0075 - fluid.turbulence / 1.5) * dt;
    fluid.ux = clamp(fluid.ux, -220, 220);
    fluid.uy = clamp(fluid.uy, -220, 220);
    fluid.swirl = clamp(fluid.swirl, -3.2, 3.2);
    fluid.turbulence = clamp(fluid.turbulence, 0, 150);

    // Gravity points down the room, not down the glass.
    const gx = sin;
    const gy = cos;
    const { ground, ledges } = state.config;
    const velocity = { x: 0, y: 0 };

    for (const flake of state.flakes) {
      fluidAt(fluid, flake.x, flake.y, state.time, velocity);
      const current = Math.hypot(velocity.x, velocity.y);

      if (flake.resting) {
        if (current < flake.lift) {
          continue;
        }

        flake.resting = false;
        flake.vx = velocity.x;
        flake.vy = velocity.y - current * 0.4;
        flake.y -= 0.6;
      }

      const flutter =
        Math.sin(state.time * flake.freq + flake.phase) * flake.flutter;
      const wantX = velocity.x + gx * flake.sink + gy * flutter;
      const wantY = velocity.y + gy * flake.sink - gx * flutter;
      const give = 1 - Math.exp(-dt / flake.lag);
      flake.vx += (wantX - flake.vx) * give;
      flake.vy += (wantY - flake.vy) * give;

      const px = flake.x;
      const py = flake.y;
      flake.x += flake.vx * dt;
      flake.y += flake.vy * dt;
      flake.angle +=
        (flake.spin +
          Math.hypot(flake.vx, flake.vy) * 0.08 * Math.sign(flake.spin || 1)) *
        dt;

      // The glass.
      const distance = Math.hypot(flake.x, flake.y);
      const limit = R - 2.5 - flake.size;

      if (distance > limit) {
        const nx = flake.x / distance;
        const ny = flake.y / distance;
        const into = flake.vx * nx + flake.vy * ny;
        flake.x = nx * limit;
        flake.y = ny * limit;

        if (into > 0) {
          flake.vx -= nx * into * 1.3;
          flake.vy -= ny * into * 1.3;
        }
      }

      // Roofs, branches and hats, for the flakes in front of them.
      let landed = false;

      if (flake.front && flake.vy > 0) {
        for (const ledge of ledges) {
          const ledgeY = crossesLedge(ledge, px, py, flake.x, flake.y);

          if (ledgeY !== null) {
            flake.y = ledgeY - flake.size * 0.6;
            landed = true;
            break;
          }
        }
      }

      const floor = floorAt(flake, ground);

      if (!landed && flake.y >= floor) {
        flake.y = floor;
        landed = true;
      }

      if (landed) {
        if (current < flake.lift * 0.7) {
          flake.resting = true;
          flake.vx = 0;
          flake.vy = 0;
        } else {
          flake.vy = -Math.abs(flake.vy) * 0.35;
        }
      }
    }
  }, []);

  const isBusy = useCallback(() => {
    const { globe, fluid, flakes, shake, pointer } = sim.current;

    return (
      shake !== null ||
      pointer !== null ||
      Math.abs(globe.x) > 0.2 ||
      Math.abs(globe.y) > 0.2 ||
      Math.abs(globe.vx) > 2 ||
      Math.abs(globe.vy) > 2 ||
      Math.abs(globe.tilt) > 0.05 ||
      Math.abs(globe.tiltV) > 0.5 ||
      Math.abs(fluid.ux) + Math.abs(fluid.uy) > 0.5 ||
      fluid.turbulence > 0.5 ||
      flakes.some((flake) => !flake.resting)
    );
  }, []);

  const applyTransforms = useCallback(() => {
    const { globe, reduce, width } = sim.current;
    const body = bodyRef.current;
    const shadow = shadowRef.current;
    const shine = shineRef.current;

    if (!body || !shadow || !shine) {
      return;
    }

    if (reduce) {
      body.style.transform = "";
      shadow.style.transform = "";
      shadow.style.opacity = "";
      shine.style.transform = "";
      return;
    }

    body.style.transform = `translate3d(${globe.x.toFixed(2)}px, ${globe.y.toFixed(2)}px, 0) rotate(${globe.tilt.toFixed(3)}deg)`;
    const lift = clamp(-globe.y / (width * 0.25), 0, 1);
    shadow.style.transform = `translateX(${(globe.x * 0.8).toFixed(2)}px) scale(${(1 - lift * 0.25).toFixed(3)})`;
    shadow.style.opacity = (1 - lift * 0.6).toFixed(3);
    shine.style.transform = `rotate(${(-globe.tilt).toFixed(3)}deg)`;
  }, []);

  const updateSound = useCallback(() => {
    const state = sim.current;
    const { fluid } = state;
    const energy =
      Math.hypot(fluid.ux, fluid.uy) +
      fluid.turbulence * 0.7 +
      Math.abs(fluid.swirl) * 25;
    const level =
      state.sound && !state.reduce ? clamp(energy / 240, 0, 1) ** 1.4 * 0.5 : 0;

    if (Math.abs(level - state.sloshLevel) < 0.004) {
      return;
    }

    state.sloshLevel = level;

    if (!state.slosh) {
      return;
    }

    const context = state.slosh.gain.context;
    state.slosh.gain.gain.setTargetAtTime(level, context.currentTime, 0.06);
    state.slosh.filter.frequency.setTargetAtTime(
      300 + level * 900,
      context.currentTime,
      0.08,
    );
  }, []);

  // The animation loop. It stops itself once the snow has settled.
  useEffect(() => {
    const state = sim.current;

    const tick = (now: number) => {
      const elapsed = Math.min(0.05, (now - state.last) / 1000);
      state.last = now;
      let remaining = elapsed;

      while (remaining > 1e-6) {
        const dt = Math.min(STEP, remaining);
        step(dt);
        remaining -= dt;
      }

      applyTransforms();
      updateSound();
      draw();

      const busy = isBusy();

      if (busy !== state.snowing) {
        state.snowing = busy;
        setSnowing(busy);
      }

      if (busy && state.visible) {
        state.frame = requestAnimationFrame(tick);
      } else {
        state.running = false;
        updateSound();
      }
    };

    state.wake = () => {
      if (state.running || !state.visible) {
        return;
      }

      state.running = true;
      state.last = performance.now();
      state.frame = requestAnimationFrame(tick);
    };

    return () => {
      cancelAnimationFrame(state.frame);
      state.running = false;
      state.wake = () => {};
    };
  }, [applyTransforms, draw, isBusy, step, updateSound]);

  // Refill the globe whenever its scene or flake count changes.
  useEffect(() => {
    const state = sim.current;
    state.flakes = createFlakes(flakeCount, scenes[scene]);
    draw();
    state.wake();
  }, [draw, flakeCount, scene]);

  // Keep the canvases sharp at whatever size the globe ends up.
  useEffect(() => {
    const root = rootRef.current;

    if (!root) {
      return;
    }

    const state = sim.current;
    const resize = new ResizeObserver(([entry]) => {
      state.width = entry.contentRect.width || size;
      draw();
    });
    const visibility = new IntersectionObserver(([entry]) => {
      state.visible = entry.isIntersecting;

      if (state.visible) {
        state.wake();
      }
    });

    resize.observe(root);
    visibility.observe(root);

    return () => {
      resize.disconnect();
      visibility.disconnect();
    };
  }, [draw, size]);

  useEffect(() => {
    if (!sound) {
      updateSound();
    }
  }, [sound, updateSound]);

  useEffect(() => {
    applyTransforms();
  }, [applyTransforms]);

  const startSound = useCallback(() => {
    const state = sim.current;

    if (!state.sound || state.slosh) {
      return;
    }

    const context = getAudioContext();

    if (context) {
      state.slosh = createSlosh(context);
    }
  }, []);

  const shake = useCallback(
    (plan: Shake) => {
      const state = sim.current;
      startSound();

      if (state.reduce) {
        // No flying glass: just let the snow fall again, gently.
        for (const flake of state.flakes) {
          scatter(flake, state.config, Math.random() < 0.15);
        }

        state.fluid.turbulence = 0;
        state.fluid.swirl = 0;
        state.wake();
        return;
      }

      state.shake = { plan, start: state.time };
      state.wake();
    },
    [startSound],
  );

  const handlePointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) {
      return;
    }

    const state = sim.current;
    startSound();
    state.pointer = {
      id: event.pointerId,
      moved: false,
      startX: event.clientX,
      startY: event.clientY,
    };
    state.suppressClick = false;

    if (!state.reduce) {
      event.currentTarget.setPointerCapture(event.pointerId);
      state.shake = null;
      state.globe.held = true;
      state.globe.tx = state.globe.x;
      // Picking it up: it leaves the table a little.
      state.globe.ty = Math.min(state.globe.y, -state.width * 0.025);
      state.pointer.startX -= state.globe.x;
      state.pointer.startY -= state.globe.ty;
    }

    state.wake();
  };

  const handlePointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    const state = sim.current;
    const pointer = state.pointer;

    if (!pointer || pointer.id !== event.pointerId || state.reduce) {
      return;
    }

    const dx = event.clientX - pointer.startX;
    const dy = event.clientY - pointer.startY;

    if (
      !pointer.moved &&
      Math.hypot(dx - state.globe.tx, dy - state.globe.ty) > 5
    ) {
      pointer.moved = true;
    }

    // It gives freely at first, then less, the further you take it.
    const reachX = state.width * 0.26;
    const reachUp = state.width * 0.32;
    state.globe.tx = reachX * Math.tanh(dx / reachX);
    state.globe.ty =
      dy < 0 ? -reachUp * Math.tanh(-dy / reachUp) : Math.min(dy * 0.08, 2);
    state.wake();
  };

  const handlePointerEnd = (event: PointerEvent<HTMLButtonElement>) => {
    const state = sim.current;
    const pointer = state.pointer;

    if (!pointer || pointer.id !== event.pointerId) {
      return;
    }

    state.pointer = null;
    state.suppressClick = pointer.moved;

    if (!state.shake) {
      state.globe.held = false;
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    state.wake();
  };

  const handleClick = () => {
    const state = sim.current;

    if (state.suppressClick) {
      state.suppressClick = false;
      return;
    }

    shake(SHAKE);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const keys: Record<string, Shake> = {
      ArrowDown: nudge(1, true),
      ArrowLeft: nudge(-1, false),
      ArrowRight: nudge(1, false),
      ArrowUp: nudge(-1, true),
    };
    const plan = keys[event.key];

    if (plan) {
      event.preventDefault();
      shake(plan);
    }
  };

  const sphereBox = {
    height: `${((2 * R) / VIEW_H) * 100}%`,
    left: `${((SPHERE_X - R) / VIEW_W) * 100}%`,
    top: `${((SPHERE_Y - R) / VIEW_H) * 100}%`,
    width: `${((2 * R) / VIEW_W) * 100}%`,
  };
  const layerClassName = "pointer-events-none absolute inset-0 block size-full [transform:translateZ(0)]";
  const sphereTransform = `translate(${SPHERE_X} ${SPHERE_Y})`;

  return (
    <button
      aria-describedby={`${uid}-hint`}
      aria-label={label}
      className={cn(
        "group relative block aspect-[240/290] max-w-full cursor-grab touch-none select-none rounded-[28px] outline-none [-webkit-tap-highlight-color:transparent] active:cursor-grabbing",
        className,
      )}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      onLostPointerCapture={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      ref={rootRef}
      style={{ width: size }}
      type="button"
    >
      <span className="sr-only" id={`${uid}-hint`}>
        Press Enter to shake it, or an arrow key to knock it that way. Drag it
        to shake it by hand.
      </span>
      <span aria-live="polite" className="sr-only">
        {snowing ? "Snowing" : "The snow has settled"}
      </span>

      {/* The table's shadow stays on the table. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute right-[3%] bottom-[0.5%] left-[3%] block h-[6%] rounded-[50%] bg-[radial-gradient(closest-side,rgb(0_0_0/0.28),rgb(0_0_0/0.12)_60%,transparent)] dark:bg-[radial-gradient(closest-side,rgb(0_0_0/0.6),rgb(0_0_0/0.25)_60%,transparent)]"
        ref={shadowRef}
      />

      <span
        aria-hidden="true"
        className="absolute inset-0 block will-change-transform"
        ref={bodyRef}
        style={{ transformOrigin: `50% ${(PIVOT_Y / VIEW_H) * 100}%` }}
      >
        <svg
          aria-hidden="true"
          className={layerClassName}
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        >
          <defs>
            <clipPath id={`${uid}-sphere`}>
              <circle r={R - 0.5} />
            </clipPath>
          </defs>
          <g clipPath={`url(#${uid}-sphere)`} transform={sphereTransform}>
            <SceneBack animated={!shouldReduceMotion} scene={scene} uid={uid} />
          </g>
        </svg>

        <canvas
          className="pointer-events-none absolute block rounded-full [transform:translateZ(0)]"
          ref={backCanvasRef}
          style={sphereBox}
        />

        <svg
          aria-hidden="true"
          className={layerClassName}
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        >
          <defs>
            <clipPath id={`${uid}-sphere-front`}>
              <circle r={R - 0.5} />
            </clipPath>
          </defs>
          <g clipPath={`url(#${uid}-sphere-front)`} transform={sphereTransform}>
            <SceneFront scene={scene} uid={`${uid}f`} />
          </g>
        </svg>

        <canvas
          className="pointer-events-none absolute block rounded-full [transform:translateZ(0)]"
          ref={frontCanvasRef}
          style={sphereBox}
        />

        <svg
          aria-hidden="true"
          className={layerClassName}
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        >
          <g transform={sphereTransform}>
            <Glass uid={`${uid}g`} />
          </g>
          <Base
            inscription={inscription ?? config.inscription}
            scene={scene}
            uid={`${uid}b`}
          />
        </svg>

        <svg
          aria-hidden="true"
          className="pointer-events-none absolute block overflow-visible will-change-transform"
          ref={shineRef}
          style={sphereBox}
          viewBox={`${-R} ${-R} ${2 * R} ${2 * R}`}
        >
          <GlassShine uid={`${uid}s`} />
        </svg>

        <span
          className="pointer-events-none absolute block rounded-full ring-2 ring-transparent ring-offset-0 transition-[box-shadow] group-focus-visible:ring-grayscale-8"
          style={sphereBox}
        />
      </span>
    </button>
  );
}
