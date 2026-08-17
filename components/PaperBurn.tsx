"use client";

import {
  type ComponentPropsWithoutRef,
  type CSSProperties,
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { cn } from "@/helpers/classname-helper";
import styles from "./PaperBurn.module.css";

type BurnState = "burning" | "burnt" | "idle";

type AshParticle = {
  delay: number;
  driftX: number;
  driftY: number;
  driftMidX: number;
  driftMidY: number;
  duration: number;
  id: number;
  kind: "ash" | "ember";
  left: number;
  rotate: number;
  size: number;
  top: number;
};

type ParticleStyle = CSSProperties & {
  "--ash-drift-x": string;
  "--ash-drift-y": string;
  "--ash-drift-mid-x": string;
  "--ash-drift-mid-y": string;
  "--ash-rotate": string;
  "--ash-rotate-mid": string;
};

export type PaperBurnProps = Omit<
  ComponentPropsWithoutRef<"div">,
  "children"
> & {
  active: boolean;
  children: ReactNode;
  duration?: number;
  onBurnComplete?: () => void;
};

const BURN_FRONTS = [
  {
    charWidth: 0.028,
    yellowWidth: 0.0085,
    cx: 0.08,
    cy: 0.9,
    delay: 0,
    emberWidth: 0.022,
    seed: 17,
  },
] as const;
const BURN_EDGE_POINTS = 84;
const PARTICLE_COUNT = 34;

type BurnFront = (typeof BURN_FRONTS)[number];

function clamp(value: number, minimum = 0, maximum = 1) {
  return Math.min(maximum, Math.max(minimum, value));
}

function getCoverageRadius(front: BurnFront, aspectRatio: number) {
  const horizontalDistance = Math.max(front.cx, 1 - front.cx) * aspectRatio;
  const verticalDistance = Math.max(front.cy, 1 - front.cy);

  return Math.hypot(horizontalDistance, verticalDistance) * 1.32;
}

function getBurnPoint(
  front: BurnFront,
  angle: number,
  progress: number,
  aspectRatio: number,
  edgeOffset = 0,
) {
  const phase = front.seed * 0.137;
  const progressEnvelope = 4 * progress * (1 - progress);
  const localLead =
    (Math.sin(angle * 2 + phase) * 0.034 +
      Math.sin(angle * 5 - phase * 0.81) * 0.018 +
      Math.sin(angle * 11 - progress * 7 + phase * 1.7) * 0.006) *
    progressEnvelope;
  const localProgress = clamp(progress + localLead);
  const edgeProfile =
    1 +
    Math.sin(angle * 3 + phase) * 0.13 +
    Math.sin(angle * 7 - phase * 0.67) * 0.065 +
    Math.sin(angle * 17 + phase * 1.31) * 0.026 +
    Math.sin(angle * 31 - phase * 2.1) * 0.011;
  const widthProfile = Math.max(
    0.46,
    0.78 +
      Math.sin(angle * 5 - progress * 3 + phase) * 0.18 +
      Math.sin(angle * 13 + progress * 5 - phase * 0.7) * 0.12 +
      Math.sin(angle * 29 + phase * 1.3) * 0.06,
  );
  const physicalRadius = Math.max(
    0.001,
    getCoverageRadius(front, aspectRatio) * localProgress * edgeProfile +
      edgeOffset * widthProfile,
  );

  return {
    x: front.cx + (Math.cos(angle) * physicalRadius) / aspectRatio,
    y: front.cy + Math.sin(angle) * physicalRadius,
  };
}

function buildBurnPath(
  front: BurnFront,
  progress: number,
  aspectRatio: number,
  edgeOffset = 0,
) {
  const points = Array.from({ length: BURN_EDGE_POINTS }, (_, index) => {
    const angle = (index / BURN_EDGE_POINTS) * Math.PI * 2;
    const point = getBurnPoint(front, angle, progress, aspectRatio, edgeOffset);

    return `${point.x.toFixed(4)} ${point.y.toFixed(4)}`;
  });

  return `M ${points.join(" L ")} Z`;
}

function seededRandom(seed: number) {
  let value = seed >>> 0;

  return () => {
    value += 0x6d2b79f5;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function createAshParticles(
  duration: number,
  seed: number,
  aspectRatio: number,
): AshParticle[] {
  const random = seededRandom(seed);

  return Array.from({ length: PARTICLE_COUNT }, (_, id) => {
    const front = BURN_FRONTS[Math.floor(random() * BURN_FRONTS.length)];
    const kind = random() > 0.66 ? "ember" : "ash";
    const particleDuration = Math.min(
      kind === "ember" ? 260 + random() * 170 : 320 + random() * 190,
      duration * 0.36,
    );
    const latestProgress = Math.max(
      0.28,
      1 - (particleDuration + 80) / duration,
    );
    const cluster = Math.floor(random() * 6) / 6;
    const emissionProgress = clamp(
      0.08 + cluster * (latestProgress - 0.08) + (random() - 0.5) * 0.07,
      0.06,
      latestProgress,
    );
    let particleAngle = random() * Math.PI * 2;
    let origin = getBurnPoint(
      front,
      particleAngle,
      emissionProgress,
      aspectRatio,
    );

    for (let attempt = 0; attempt < 8; attempt += 1) {
      if (
        origin.x > 0.015 &&
        origin.x < 0.985 &&
        origin.y > 0.015 &&
        origin.y < 0.985
      ) {
        break;
      }

      particleAngle = random() * Math.PI * 2;
      origin = getBurnPoint(
        front,
        particleAngle,
        emissionProgress,
        aspectRatio,
      );
    }

    const travelDistance = 15 + random() * 24;
    const driftX =
      Math.cos(particleAngle) * travelDistance * 0.48 - 4 + random() * 11;
    const driftY =
      -18 - random() * 24 + Math.sin(particleAngle) * travelDistance * 0.18;

    return {
      delay: emissionProgress * duration,
      driftX,
      driftY,
      driftMidX: driftX * (0.28 + random() * 0.18),
      driftMidY: driftY * 0.42 - 3 - random() * 5,
      duration: particleDuration,
      id,
      kind,
      left: origin.x * 100,
      rotate: -80 + random() * 160,
      size: kind === "ember" ? 1 + random() * 1.5 : 1.7 + random() * 3,
      top: origin.y * 100,
    };
  });
}

export function PaperBurn({
  active,
  children,
  className,
  duration = 1000,
  onBurnComplete,
  ...props
}: PaperBurnProps) {
  const rawId = useId();
  const id = rawId.replaceAll(":", "");
  const paperMaskId = `paper-burn-paper-${id}`;
  const charMaskId = `paper-burn-char-${id}`;
  const emberMaskId = `paper-burn-ember-${id}`;
  const yellowHeatMaskId = `paper-burn-yellow-heat-${id}`;
  const rootRef = useRef<HTMLDivElement>(null);
  const aspectRatioRef = useRef(1);
  const paperHoleRefs = useRef<(SVGPathElement | null)[]>([]);
  const charOuterRefs = useRef<(SVGPathElement | null)[]>([]);
  const charInnerRefs = useRef<(SVGPathElement | null)[]>([]);
  const emberOuterRefs = useRef<(SVGPathElement | null)[]>([]);
  const emberInnerRefs = useRef<(SVGPathElement | null)[]>([]);
  const yellowHeatOuterRefs = useRef<(SVGPathElement | null)[]>([]);
  const yellowHeatInnerRefs = useRef<(SVGPathElement | null)[]>([]);
  const callbackRef = useRef(onBurnComplete);
  const runRef = useRef(0);
  const [burnState, setBurnState] = useState<BurnState>("idle");
  const [particles, setParticles] = useState<AshParticle[]>([]);
  const burnDuration = Math.max(360, duration);

  useEffect(() => {
    const root = rootRef.current;

    if (!root) {
      return;
    }

    const updateAspectRatio = () => {
      const bounds = root.getBoundingClientRect();

      if (bounds.width > 0 && bounds.height > 0) {
        aspectRatioRef.current = bounds.width / bounds.height;
      }
    };

    updateAspectRatio();
    const resizeObserver = new ResizeObserver(updateAspectRatio);
    resizeObserver.observe(root);

    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    callbackRef.current = onBurnComplete;
  }, [onBurnComplete]);

  useEffect(() => {
    const refGroups = [
      paperHoleRefs,
      charOuterRefs,
      charInnerRefs,
      emberOuterRefs,
      emberInnerRefs,
      yellowHeatOuterRefs,
      yellowHeatInnerRefs,
    ];
    const hasAllPaths = refGroups.every((refs) =>
      BURN_FRONTS.every((_, index) => refs.current[index]),
    );

    if (!hasAllPaths) {
      return;
    }

    const aspectRatio = aspectRatioRef.current;

    const setProgress = (progress: number) => {
      BURN_FRONTS.forEach((front, index) => {
        const localProgress = clamp(
          (progress - front.delay) / (1 - front.delay),
        );
        const ignited = localProgress > 0;

        paperHoleRefs.current[index]?.setAttribute(
          "d",
          buildBurnPath(front, localProgress, aspectRatio),
        );
        charOuterRefs.current[index]?.setAttribute(
          "d",
          buildBurnPath(
            front,
            localProgress,
            aspectRatio,
            ignited ? front.charWidth * 0.75 : 0,
          ),
        );
        charInnerRefs.current[index]?.setAttribute(
          "d",
          buildBurnPath(
            front,
            localProgress,
            aspectRatio,
            ignited ? -front.charWidth * 0.08 : 0,
          ),
        );
        emberOuterRefs.current[index]?.setAttribute(
          "d",
          buildBurnPath(
            front,
            localProgress,
            aspectRatio,
            ignited ? front.emberWidth * 0.95 : 0,
          ),
        );
        emberInnerRefs.current[index]?.setAttribute(
          "d",
          buildBurnPath(
            front,
            localProgress,
            aspectRatio,
            ignited ? -front.emberWidth * 0.42 : 0,
          ),
        );
        yellowHeatOuterRefs.current[index]?.setAttribute(
          "d",
          buildBurnPath(
            front,
            localProgress,
            aspectRatio,
            ignited ? front.yellowWidth * 0.75 : 0,
          ),
        );
        yellowHeatInnerRefs.current[index]?.setAttribute(
          "d",
          buildBurnPath(
            front,
            localProgress,
            aspectRatio,
            ignited ? -front.yellowWidth * 0.55 : 0,
          ),
        );
      });
    };

    if (!active) {
      setProgress(0);
      setBurnState("idle");
      setParticles([]);
      return;
    }

    runRef.current += 1;
    setBurnState("burning");
    setParticles(
      createAshParticles(
        burnDuration,
        runRef.current * 7919,
        aspectRatioRef.current,
      ),
    );

    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    if (reducedMotion) {
      const timeout = window.setTimeout(() => {
        setProgress(1);
        setBurnState("burnt");
        callbackRef.current?.();
      }, 180);

      return () => window.clearTimeout(timeout);
    }

    let animationFrame = 0;
    let startTime: number | null = null;

    const animate = (time: number) => {
      startTime ??= time;
      const progress = Math.min(1, (time - startTime) / burnDuration);
      setProgress(progress);

      if (progress < 1) {
        animationFrame = window.requestAnimationFrame(animate);
        return;
      }

      setBurnState("burnt");
      callbackRef.current?.();
    };

    animationFrame = window.requestAnimationFrame(animate);

    return () => window.cancelAnimationFrame(animationFrame);
  }, [active, burnDuration]);

  const maskStyle = {
    maskImage: `url(#${paperMaskId})`,
    WebkitMaskImage: `url(#${paperMaskId})`,
  };
  const charMaskStyle = {
    maskImage: `url(#${charMaskId})`,
    WebkitMaskImage: `url(#${charMaskId})`,
  };
  const emberMaskStyle = {
    maskImage: `url(#${emberMaskId})`,
    WebkitMaskImage: `url(#${emberMaskId})`,
  };
  const yellowHeatMaskStyle = {
    maskImage: `url(#${yellowHeatMaskId})`,
    WebkitMaskImage: `url(#${yellowHeatMaskId})`,
  };

  return (
    <div
      {...props}
      className={cn(styles.root, className)}
      data-burn-state={burnState}
      ref={rootRef}
    >
      <svg aria-hidden="true" className={styles.definitions} focusable="false">
        <defs>
          <mask
            height="2"
            id={paperMaskId}
            maskContentUnits="objectBoundingBox"
            maskUnits="objectBoundingBox"
            width="2"
            x="-0.5"
            y="-0.5"
          >
            <rect fill="white" height="2" width="2" x="-0.5" y="-0.5" />
            {BURN_FRONTS.map((front, index) => (
              <path
                d={buildBurnPath(front, 0, 1)}
                fill="black"
                key={front.seed}
                ref={(path) => {
                  paperHoleRefs.current[index] = path;
                }}
              />
            ))}
          </mask>

          <mask
            height="2"
            id={charMaskId}
            maskContentUnits="objectBoundingBox"
            maskUnits="objectBoundingBox"
            width="2"
            x="-0.5"
            y="-0.5"
          >
            <rect fill="black" height="2" width="2" x="-0.5" y="-0.5" />
            {BURN_FRONTS.map((front, index) => (
              <path
                d={buildBurnPath(front, 0, 1)}
                fill="white"
                key={`outer-${front.seed}`}
                ref={(path) => {
                  charOuterRefs.current[index] = path;
                }}
              />
            ))}
            {BURN_FRONTS.map((front, index) => (
              <path
                d={buildBurnPath(front, 0, 1)}
                fill="black"
                key={`inner-${front.seed}`}
                ref={(path) => {
                  charInnerRefs.current[index] = path;
                }}
              />
            ))}
          </mask>

          <mask
            height="2"
            id={emberMaskId}
            maskContentUnits="objectBoundingBox"
            maskUnits="objectBoundingBox"
            width="2"
            x="-0.5"
            y="-0.5"
          >
            <rect fill="black" height="2" width="2" x="-0.5" y="-0.5" />
            {BURN_FRONTS.map((front, index) => (
              <path
                d={buildBurnPath(front, 0, 1)}
                fill="white"
                key={`outer-${front.seed}`}
                ref={(path) => {
                  emberOuterRefs.current[index] = path;
                }}
              />
            ))}
            {BURN_FRONTS.map((front, index) => (
              <path
                d={buildBurnPath(front, 0, 1)}
                fill="black"
                key={`inner-${front.seed}`}
                ref={(path) => {
                  emberInnerRefs.current[index] = path;
                }}
              />
            ))}
          </mask>

          <mask
            height="2"
            id={yellowHeatMaskId}
            maskContentUnits="objectBoundingBox"
            maskUnits="objectBoundingBox"
            width="2"
            x="-0.5"
            y="-0.5"
          >
            <rect fill="black" height="2" width="2" x="-0.5" y="-0.5" />
            {BURN_FRONTS.map((front, index) => (
              <path
                d={buildBurnPath(front, 0, 1)}
                fill="white"
                key={`outer-${front.seed}`}
                ref={(path) => {
                  yellowHeatOuterRefs.current[index] = path;
                }}
              />
            ))}
            {BURN_FRONTS.map((front, index) => (
              <path
                d={buildBurnPath(front, 0, 1)}
                fill="black"
                key={`inner-${front.seed}`}
                ref={(path) => {
                  yellowHeatInnerRefs.current[index] = path;
                }}
              />
            ))}
          </mask>
        </defs>
      </svg>

      <div className={styles.paper} style={maskStyle}>
        {children}
      </div>
      <div aria-hidden="true" className={styles.char} style={charMaskStyle} />
      <div aria-hidden="true" className={styles.ember} style={emberMaskStyle} />
      <div
        aria-hidden="true"
        className={styles.yellowHeat}
        style={yellowHeatMaskStyle}
      />

      {burnState === "burning" &&
        particles.map((particle) => {
          const particleStyle: ParticleStyle = {
            "--ash-drift-x": `${particle.driftX}px`,
            "--ash-drift-y": `${particle.driftY}px`,
            "--ash-drift-mid-x": `${particle.driftMidX}px`,
            "--ash-drift-mid-y": `${particle.driftMidY}px`,
            "--ash-rotate": `${particle.rotate}deg`,
            "--ash-rotate-mid": `${particle.rotate * 0.35}deg`,
            animationDelay: `${particle.delay}ms`,
            animationDuration: `${particle.duration}ms`,
            height: particle.size,
            left: `${particle.left}%`,
            top: `${particle.top}%`,
            width: particle.size * 0.65,
          };

          return (
            <span
              aria-hidden="true"
              className={cn(
                styles.ash,
                particle.kind === "ember" && styles.spark,
              )}
              key={particle.id}
              style={particleStyle}
            />
          );
        })}
    </div>
  );
}
