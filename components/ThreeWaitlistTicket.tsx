"use client";

import type { ComponentPropsWithoutRef } from "react";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { cn } from "@/helpers/classname-helper";
import Button from "./public/Button";
import styles from "./ThreeWaitlistTicket.module.css";

const TICKET_ASPECT = 2.08;
const TICKET_WIDTH = 4.8;
const TICKET_HEIGHT = TICKET_WIDTH / TICKET_ASPECT;
const BURN_DURATION = 900;
const PARTICLE_TAIL_SECONDS = 1.8;
const EMBER_COUNT = 520;
const ASH_COUNT = 180;
const TICKET_DESIGN_WIDTH = 1400;
const TICKET_DESIGN_HEIGHT = Math.round(TICKET_DESIGN_WIDTH / TICKET_ASPECT);
const TICKET_TEXTURE_SCALE = 1.5;
const MAX_PIXEL_RATIO = 3;
const MAX_RENDER_PIXELS = 3_000_000;
const IDLE_FRAME_INTERVAL = 1000 / 30;

type BurnPalette = {
  core: readonly [number, number, number];
  inner: readonly [number, number, number];
  outer: readonly [number, number, number];
};

const burnPalettes = {
  blue: {
    core: [0.08, 0.32, 1],
    inner: [0.02, 0.18, 1],
    outer: [0.015, 0.035, 0.55],
  },
  green: {
    core: [0.24, 1, 0.12],
    inner: [0.06, 1, 0.16],
    outer: [0.012, 0.4, 0.025],
  },
  orange: {
    core: [0.95, 0.16, 0.006],
    inner: [1, 0.18, 0.004],
    outer: [0.72, 0.012, 0.001],
  },
  purple: {
    core: [1, 0.08, 0.62],
    inner: [0.72, 0.04, 1],
    outer: [0.22, 0.01, 0.55],
  },
} as const satisfies Record<string, BurnPalette>;

export type BurnColor = keyof typeof burnPalettes;

type BurnColorUniforms = {
  uBurnCore: { value: THREE.Vector3 };
  uBurnInner: { value: THREE.Vector3 };
  uBurnOuter: { value: THREE.Vector3 };
};

function createBurnColorUniforms(burnColor: BurnColor): BurnColorUniforms {
  const palette = burnPalettes[burnColor];

  return {
    uBurnCore: {
      value: new THREE.Vector3(
        palette.core[0],
        palette.core[1],
        palette.core[2],
      ),
    },
    uBurnInner: {
      value: new THREE.Vector3(
        palette.inner[0],
        palette.inner[1],
        palette.inner[2],
      ),
    },
    uBurnOuter: {
      value: new THREE.Vector3(
        palette.outer[0],
        palette.outer[1],
        palette.outer[2],
      ),
    },
  };
}

function applyBurnPalette(uniforms: BurnColorUniforms, burnColor: BurnColor) {
  const palette = burnPalettes[burnColor];
  uniforms.uBurnCore.value.set(
    palette.core[0],
    palette.core[1],
    palette.core[2],
  );
  uniforms.uBurnInner.value.set(
    palette.inner[0],
    palette.inner[1],
    palette.inner[2],
  );
  uniforms.uBurnOuter.value.set(
    palette.outer[0],
    palette.outer[1],
    palette.outer[2],
  );
}

const burnNoiseShader = `
  float hash21(vec2 point) {
    return fract(sin(dot(point, vec2(127.1, 311.7))) * 43758.5453123);
  }

  float valueNoise(vec2 point) {
    vec2 cell = floor(point);
    vec2 local = fract(point);
    local = local * local * (3.0 - 2.0 * local);

    return mix(
      mix(hash21(cell), hash21(cell + vec2(1.0, 0.0)), local.x),
      mix(
        hash21(cell + vec2(0.0, 1.0)),
        hash21(cell + vec2(1.0, 1.0)),
        local.x
      ),
      local.y
    );
  }

  float fbm(vec2 point) {
    float value = 0.0;
    float amplitude = 0.5;

    for (int octave = 0; octave < 4; octave++) {
      value += valueNoise(point) * amplitude;
      point = point * 2.03 + vec2(13.1, 7.7);
      amplitude *= 0.5;
    }

    return value;
  }

  float burnArrival(vec2 uv) {
    vec2 warp = vec2(
      fbm(uv * 4.1 + vec2(7.3, 1.9)),
      fbm(uv * 4.1 + vec2(2.7, 8.6))
    ) - 0.5;
    vec2 warpedUv = uv + warp * 0.075;
    float diagonal =
      warpedUv.x * 0.69 + warpedUv.y * 0.31;
    float coarse = fbm(uv * 7.2 + vec2(4.6, 9.1)) - 0.5;
    float fine = valueNoise(uv * 31.0 + vec2(1.7, 6.2)) - 0.5;

    return clamp(diagonal + coarse * 0.14 + fine * 0.04, 0.015, 0.985);
  }
`;

const ticketVertexShader = `
  uniform float uBurnProgress;
  uniform float uTime;

  varying vec2 vUv;
  varying vec3 vNormalView;
  varying vec3 vViewPosition;

  ${burnNoiseShader}

  void main() {
    vUv = uv;
    vec3 transformed = position;
    float arrival = burnArrival(uv);
    float frontDistance = abs(arrival - uBurnProgress);
    float frontInfluence =
      (1.0 - smoothstep(0.0, 0.13, frontDistance)) *
      step(0.001, uBurnProgress) *
      (1.0 - smoothstep(0.94, 1.0, uBurnProgress));
    float curlWave =
      sin(uv.y * 22.0 + uv.x * 9.0 + uTime * 5.0) * 0.5 + 0.5;

    transformed.z += frontInfluence * (0.026 + curlWave * 0.082);
    transformed.y += frontInfluence * (curlWave - 0.5) * 0.024;

    vec4 viewPosition = modelViewMatrix * vec4(transformed, 1.0);
    vViewPosition = -viewPosition.xyz;
    vNormalView = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * viewPosition;
  }
`;

const ticketFragmentShader = `
  uniform sampler2D uTicket;
  uniform float uBurnProgress;
  uniform float uTime;
  uniform vec3 uBurnCore;
  uniform vec3 uBurnInner;
  uniform vec3 uBurnOuter;

  varying vec2 vUv;
  varying vec3 vNormalView;
  varying vec3 vViewPosition;

  ${burnNoiseShader}

  void main() {
    vec4 design = texture2D(uTicket, vUv);

    if (design.a < 0.025) {
      discard;
    }

    float burnIsActive = step(0.001, uBurnProgress);
    float distanceToFront = burnArrival(vUv) - uBurnProgress;

    if (burnIsActive > 0.5 && distanceToFront < 0.0) {
      discard;
    }

    vec3 normal = normalize(vNormalView);
    vec3 viewDirection = normalize(vViewPosition);
    vec3 lightDirection = normalize(vec3(-0.42, 0.58, 0.72));
    vec3 halfDirection = normalize(lightDirection + viewDirection);
    float diffuse = max(dot(normal, lightDirection), 0.0);
    float specular = pow(max(dot(normal, halfDirection), 0.0), 54.0);
    float clearcoat = pow(max(dot(normal, halfDirection), 0.0), 120.0);
    float luminance = dot(design.rgb, vec3(0.299, 0.587, 0.114));
    float metalMask = smoothstep(0.2, 0.42, luminance);
    float horizontalEdge = smoothstep(
      0.48,
      1.0,
      abs(vUv.x - 0.5) * 2.0
    );

    float sweepPosition =
      0.5 + normal.x * 0.74 - normal.y * 0.28;
    float sweepCoordinate = vUv.x * 0.82 + vUv.y * 0.18;
    float sweepDelta = sweepCoordinate - sweepPosition;
    float sweep = exp(-pow(sweepDelta / 0.19, 2.0));
    float streakTexture =
      0.78 + fbm(vec2(vUv.x * 14.0, vUv.y * 58.0)) * 0.22;
    float foilStreaks =
      exp(-pow(sweepDelta / 0.064, 2.0)) * 0.62 +
      exp(-pow((sweepDelta - 0.105) / 0.043, 2.0)) * 0.3 +
      exp(-pow((sweepDelta + 0.135) / 0.056, 2.0)) * 0.22;
    foilStreaks *= streakTexture;
    float grain = (fbm(vUv * 320.0 + uTime * 0.018) - 0.5) * 0.075;
    float foilSparkle = pow(
      valueNoise(vUv * 460.0 + floor(uTime * 7.0) * 0.07),
      18.0
    );

    vec3 color = design.rgb;
    color *= mix(1.0, 0.62 + diffuse * 0.64 + grain, metalMask);
    color *= mix(
      vec3(1.0),
      vec3(1.1, 0.95, 0.72),
      horizontalEdge * metalMask
    );
    color +=
      vec3(1.0, 0.82, 0.1) *
      (specular * 0.76 + sweep * 0.09 + foilStreaks * 0.38) *
      metalMask;
    color += vec3(1.0, 0.9, 0.52) * clearcoat * 0.065 * metalMask;
    color += vec3(1.0, 0.72, 0.13) * foilSparkle * 0.2 * metalMask;

    float charBand =
      burnIsActive * (1.0 - smoothstep(0.022, 0.13, distanceToFront));
    float emberBand =
      burnIsActive * (1.0 - smoothstep(0.007, 0.041, distanceToFront));
    float heatBand =
      burnIsActive * (1.0 - smoothstep(0.0015, 0.014, distanceToFront));
    float charVariation = fbm(vUv * 38.0 + vec2(3.4, 8.2));
    float heatVariation = valueNoise(vUv * 24.0 + uTime * 0.7);
    vec3 charColor = mix(
      vec3(0.012, 0.006, 0.002),
      vec3(0.008) + uBurnOuter * 0.14,
      charVariation
    );
    vec3 rimColor =
      mix(uBurnOuter, uBurnInner, 0.35 + heatVariation * 0.55);

    color = mix(color, charColor, charBand * 0.985);
    color += rimColor * emberBand * 1.08;
    color += uBurnCore * heatBand * 0.55;

    gl_FragColor = vec4(color, design.a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const glowFragmentShader = `
  uniform sampler2D uTicket;
  uniform float uBurnProgress;
  uniform float uTime;
  uniform vec3 uBurnCore;
  uniform vec3 uBurnInner;
  uniform vec3 uBurnOuter;

  varying vec2 vUv;

  ${burnNoiseShader}

  void main() {
    vec4 design = texture2D(uTicket, vUv);

    if (
      design.a < 0.025 ||
      uBurnProgress <= 0.001 ||
      uBurnProgress >= 0.995
    ) {
      discard;
    }

    float signedDistance = burnArrival(vUv) - uBurnProgress;
    float flicker =
      0.78 +
      0.22 * sin(uTime * 34.0 + vUv.y * 47.0) +
      (valueNoise(vUv * 53.0 + uTime * 2.1) - 0.5) * 0.24;
    float hotCore = 1.0 - smoothstep(0.0, 0.012, abs(signedDistance));
    float aura = 1.0 - smoothstep(0.004, 0.062, abs(signedDistance));
    float alpha = (hotCore * 0.18 + aura * 0.08) * flicker;
    float heatPulse =
      0.5 +
      0.35 * sin(uTime * 19.0 + vUv.x * 31.0 - vUv.y * 17.0);
    vec3 auraColor = mix(uBurnOuter * 0.82, uBurnInner, heatPulse);
    vec3 color = mix(auraColor, uBurnCore, hotCore);

    gl_FragColor = vec4(color, alpha * design.a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const particleVertexShader = `
  uniform float uElapsed;
  uniform float uKind;
  uniform float uPixelRatio;

  attribute vec3 aVelocity;
  attribute float aEmission;
  attribute float aLife;
  attribute float aSeed;
  attribute float aSize;

  varying float vAlpha;
  varying float vKind;
  varying float vLife;
  varying float vSeed;
  varying float vSparkAngle;

  void main() {
    float ageSeconds = max(0.0, uElapsed - aEmission);
    float life = clamp(ageSeconds / aLife, 0.0, 1.0);
    float isVisible =
      step(aEmission, uElapsed) *
      (1.0 - step(aEmission + aLife, uElapsed));
    float swayRate = mix(3.5, 10.0, fract(aSeed * 0.173));
    float swayAmount = mix(0.008, 0.055, fract(aSeed * 0.417));
    float lift = mix(-0.17, 0.24, fract(aSeed * 0.291));
    vec3 emberPosition = position;
    emberPosition.x +=
      aVelocity.x * ageSeconds +
      sin(ageSeconds * swayRate + aSeed * 17.0) *
        swayAmount *
        (0.2 + ageSeconds * 0.55);
    emberPosition.y +=
      aVelocity.y * ageSeconds + lift * ageSeconds * ageSeconds;
    emberPosition.z +=
      aVelocity.z * ageSeconds +
      sin(
        ageSeconds * mix(4.0, 13.0, fract(aSeed * 0.619)) +
          aSeed * 11.0
      ) * mix(0.008, 0.028, fract(aSeed * 0.731));

    vec3 ashPosition = position;
    ashPosition.x +=
      aVelocity.x * ageSeconds +
      sin(ageSeconds * 6.0 + aSeed * 19.0) * 0.09 * ageSeconds;
    ashPosition.y +=
      aVelocity.y * ageSeconds - 0.72 * ageSeconds * ageSeconds;
    ashPosition.z +=
      aVelocity.z * ageSeconds +
      cos(ageSeconds * 7.0 + aSeed * 13.0) * 0.055;

    vec3 animatedPosition = mix(emberPosition, ashPosition, uKind);
    vec4 viewPosition = modelViewMatrix * vec4(animatedPosition, 1.0);
    gl_Position = projectionMatrix * viewPosition;
    gl_PointSize =
      aSize *
      mix(1.0 - life * 0.72, 1.0 - life * 0.28, uKind) *
      uPixelRatio *
      (4.8 / max(3.8, -viewPosition.z));
    vAlpha =
      isVisible *
      smoothstep(0.0, 0.045, life) *
      (1.0 - smoothstep(0.58, 1.0, life));
    vKind = uKind;
    vLife = life;
    vSeed = aSeed;
    vSparkAngle =
      atan(aVelocity.x, max(0.12, aVelocity.y)) * 0.72 +
      sin(ageSeconds * mix(2.0, 7.0, fract(aSeed * 0.853)) + aSeed) *
        0.09;
  }
`;

const particleFragmentShader = `
  uniform vec3 uBurnCore;
  uniform vec3 uBurnInner;
  uniform vec3 uBurnOuter;

  varying float vAlpha;
  varying float vKind;
  varying float vLife;
  varying float vSeed;
  varying float vSparkAngle;

  void main() {
    vec2 point = gl_PointCoord - vec2(0.5);
    float alpha = 0.0;
    vec3 color = vec3(0.0);

    if (vKind < 0.5) {
      mat2 sparkRotation = mat2(
        cos(vSparkAngle),
        -sin(vSparkAngle),
        sin(vSparkAngle),
        cos(vSparkAngle)
      );
      vec2 sparkPoint = sparkRotation * point;
      float core = 1.0 - smoothstep(
        0.035,
        0.25,
        length(vec2(sparkPoint.x * 3.1, sparkPoint.y * 1.15))
      );
      float tail =
        (1.0 - smoothstep(0.035, 0.15, abs(sparkPoint.x))) *
        (1.0 - smoothstep(-0.46, 0.42, sparkPoint.y));
      alpha = max(core, tail * 0.72) * vAlpha;
      float sparkHeat = smoothstep(
        0.34,
        0.66,
        fract(vSeed * 0.1031)
      );
      vec3 outerColor = mix(uBurnOuter, uBurnInner, sparkHeat);
      vec3 innerColor = mix(uBurnInner, uBurnCore, sparkHeat);
      color = mix(outerColor, innerColor, core * (1.0 - vLife * 0.5));
    } else {
      float angle = vSeed * 6.2831853 + vLife * 5.0;
      mat2 rotation = mat2(
        cos(angle),
        -sin(angle),
        sin(angle),
        cos(angle)
      );
      vec2 rotated = rotation * point;
      float flake = 1.0 - smoothstep(
        0.17,
        0.3,
        max(abs(rotated.x) * 0.78, abs(rotated.y) * 1.7)
      );
      alpha = flake * vAlpha * 0.72;
      color = mix(
        vec3(0.055, 0.035, 0.022),
        vec3(0.28, 0.12, 0.035),
        1.0 - vLife
      );
    }

    if (alpha < 0.01) {
      discard;
    }

    gl_FragColor = vec4(color, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
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

function getTicketPath(width: number, height: number) {
  const path = new Path2D();
  const stubX = width * 0.75;
  const notch = height * 0.045;
  const toothDepth = width * 0.0085;
  const toothSteps = 48;

  path.moveTo(toothDepth, 0);
  path.lineTo(stubX - notch, 0);
  path.lineTo(stubX, notch);
  path.lineTo(stubX + notch, 0);
  path.lineTo(width - toothDepth, 0);

  for (let step = 1; step <= toothSteps; step += 1) {
    path.lineTo(
      step % 2 === 0 ? width - toothDepth : width,
      (step / toothSteps) * height,
    );
  }

  path.lineTo(stubX + notch, height);
  path.lineTo(stubX, height - notch);
  path.lineTo(stubX - notch, height);
  path.lineTo(toothDepth, height);

  for (let step = 1; step <= toothSteps; step += 1) {
    path.lineTo(
      step % 2 === 0 ? toothDepth : 0,
      height - (step / toothSteps) * height,
    );
  }

  path.closePath();
  return path;
}

function loadImage(source: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = source;
  });
}

function createDebossedLayer({
  depth,
  drawMask,
  height,
  strokeWidth,
  width,
}: {
  depth: number;
  drawMask: (context: CanvasRenderingContext2D) => void;
  height: number;
  strokeWidth: number;
  width: number;
}) {
  const pixelWidth = Math.ceil(width * TICKET_TEXTURE_SCALE);
  const pixelHeight = Math.ceil(height * TICKET_TEXTURE_SCALE);
  const mask = document.createElement("canvas");
  mask.width = pixelWidth;
  mask.height = pixelHeight;
  const maskContext = mask.getContext("2d");

  if (!maskContext) {
    throw new Error("Unable to create the deboss mask.");
  }

  maskContext.scale(TICKET_TEXTURE_SCALE, TICKET_TEXTURE_SCALE);
  maskContext.fillStyle = "#fff";
  drawMask(maskContext);

  const layer = document.createElement("canvas");
  layer.width = pixelWidth;
  layer.height = pixelHeight;
  const layerContext = layer.getContext("2d");

  if (!layerContext) {
    throw new Error("Unable to create the deboss layer.");
  }

  layerContext.fillStyle = "#2a2a2a";
  layerContext.fillRect(0, 0, pixelWidth, pixelHeight);
  layerContext.globalCompositeOperation = "destination-in";
  layerContext.drawImage(mask, 0, 0);
  layerContext.globalCompositeOperation = "source-over";

  const stroke = document.createElement("canvas");
  stroke.width = pixelWidth;
  stroke.height = pixelHeight;
  const strokeContext = stroke.getContext("2d");

  if (!strokeContext) {
    throw new Error("Unable to create the deboss stroke.");
  }

  const strokeRadius = strokeWidth * TICKET_TEXTURE_SCALE;

  for (let index = 0; index < 16; index += 1) {
    const angle = (index / 16) * Math.PI * 2;
    strokeContext.drawImage(
      mask,
      Math.cos(angle) * strokeRadius,
      Math.sin(angle) * strokeRadius,
    );
  }

  strokeContext.globalCompositeOperation = "source-in";
  strokeContext.fillStyle = "rgba(255, 242, 92, 0.92)";
  strokeContext.fillRect(0, 0, pixelWidth, pixelHeight);
  strokeContext.globalCompositeOperation = "destination-out";
  strokeContext.drawImage(mask, 0, 0);
  layerContext.globalCompositeOperation = "destination-over";
  layerContext.drawImage(stroke, 0, 0);
  layerContext.globalCompositeOperation = "source-over";

  function addInnerEdge(offset: number, color: string) {
    const edge = document.createElement("canvas");
    edge.width = pixelWidth;
    edge.height = pixelHeight;
    const edgeContext = edge.getContext("2d");

    if (!edgeContext) {
      throw new Error("Unable to create the deboss edge.");
    }

    edgeContext.drawImage(mask, 0, 0);
    edgeContext.globalCompositeOperation = "destination-out";
    edgeContext.drawImage(
      mask,
      offset * TICKET_TEXTURE_SCALE,
      offset * TICKET_TEXTURE_SCALE,
    );
    edgeContext.globalCompositeOperation = "source-in";
    edgeContext.fillStyle = color;
    edgeContext.fillRect(0, 0, pixelWidth, pixelHeight);
    layerContext.drawImage(edge, 0, 0);
  }

  addInnerEdge(depth, "rgba(0, 0, 0, 0.95)");
  addInnerEdge(-depth, "rgba(255, 210, 82, 0.42)");

  return layer;
}

async function createTicketTexture() {
  await document.fonts.ready;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(TICKET_DESIGN_WIDTH * TICKET_TEXTURE_SCALE);
  canvas.height = Math.round(TICKET_DESIGN_HEIGHT * TICKET_TEXTURE_SCALE);
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Unable to create the waitlist ticket texture.");
  }

  context.scale(TICKET_TEXTURE_SCALE, TICKET_TEXTURE_SCALE);
  const rootStyles = getComputedStyle(document.documentElement);
  const displayFont =
    rootStyles.getPropertyValue("--font-alfa-slab-one").trim() || "serif";
  const monoFont =
    rootStyles.getPropertyValue("--font-jetbrains-mono").trim() || "monospace";
  const sansFont =
    rootStyles.getPropertyValue("--font-inter").trim() || "sans-serif";
  await Promise.all([
    document.fonts.load(`174px ${displayFont}`, "INVITE"),
    document.fonts.load(`27px ${sansFont}`, "Your"),
    document.fonts.load(`16px ${monoFont}`, "ADMIT ONE"),
  ]);
  const logo = await loadImage("/logos/hyperaide.svg").catch(() => null);
  const ticketPath = getTicketPath(TICKET_DESIGN_WIDTH, TICKET_DESIGN_HEIGHT);
  const stubX = TICKET_DESIGN_WIDTH * 0.75;
  const invitationCenter = stubX * 0.5;
  const stubCenter = stubX + (TICKET_DESIGN_WIDTH - stubX) * 0.5;

  context.save();
  context.clip(ticketPath);

  const baseGradient = context.createLinearGradient(
    0,
    0,
    TICKET_DESIGN_WIDTH,
    TICKET_DESIGN_HEIGHT,
  );
  baseGradient.addColorStop(0, "#ef9e0b");
  baseGradient.addColorStop(0.15, "#f8b313");
  baseGradient.addColorStop(0.4, "#f8bb19");
  baseGradient.addColorStop(0.55, "#ffca2d");
  baseGradient.addColorStop(0.73, "#f7b51b");
  baseGradient.addColorStop(0.9, "#e98b05");
  baseGradient.addColorStop(1, "#dc7902");
  context.fillStyle = baseGradient;
  context.fillRect(0, 0, TICKET_DESIGN_WIDTH, TICKET_DESIGN_HEIGHT);

  const glow = context.createRadialGradient(
    invitationCenter,
    TICKET_DESIGN_HEIGHT * 0.42,
    0,
    invitationCenter,
    TICKET_DESIGN_HEIGHT * 0.42,
    TICKET_DESIGN_WIDTH * 0.46,
  );
  glow.addColorStop(0, "rgba(255, 205, 52, 0.14)");
  glow.addColorStop(0.38, "rgba(255, 177, 24, 0.07)");
  glow.addColorStop(1, "rgba(255, 182, 28, 0)");
  context.globalCompositeOperation = "screen";
  context.fillStyle = glow;
  context.fillRect(0, 0, TICKET_DESIGN_WIDTH, TICKET_DESIGN_HEIGHT);
  context.globalCompositeOperation = "source-over";

  const random = seededRandom(31);
  context.globalCompositeOperation = "multiply";

  for (let index = 0; index < 5200; index += 1) {
    const opacity = 0.008 + random() * 0.016;
    context.fillStyle = `rgba(92, 47, 0, ${opacity})`;
    context.fillRect(
      random() * TICKET_DESIGN_WIDTH,
      random() * TICKET_DESIGN_HEIGHT,
      0.6 + random() * 1.2,
      0.6 + random() * 1.2,
    );
  }

  context.globalCompositeOperation = "source-over";
  context.strokeStyle = "rgba(55, 34, 2, 0.42)";
  context.lineWidth = 2;
  context.setLineDash([7, 8]);
  context.beginPath();
  context.moveTo(stubX, TICKET_DESIGN_HEIGHT * 0.045);
  context.lineTo(stubX, TICKET_DESIGN_HEIGHT * 0.955);
  context.stroke();
  context.setLineDash([]);

  context.fillStyle = "#2c1d07";

  if (logo) {
    const logoWidth = 72;
    const logoHeight = (logoWidth * 294) / 313;
    const logoLayerWidth = logoWidth + 12;
    const logoLayerHeight = logoHeight + 12;
    const logoLayer = createDebossedLayer({
      depth: 1.5,
      drawMask: (maskContext) => {
        maskContext.drawImage(logo, 6, 6, logoWidth, logoHeight);
      },
      height: logoLayerHeight,
      strokeWidth: 4,
      width: logoLayerWidth,
    });
    context.drawImage(
      logoLayer,
      invitationCenter - logoLayerWidth / 2,
      56,
      logoLayerWidth,
      logoLayerHeight,
    );
  }

  context.font = `400 174px ${displayFont}`;
  const titleWidth = context.measureText("INVITE").width;
  const titleLeft = invitationCenter - titleWidth / 2;
  const titleRight = invitationCenter + titleWidth / 2;

  context.textAlign = "left";
  context.font = `400 27px ${sansFont}`;
  context.fillText("Your", titleLeft, 232);

  const titleLayerWidth = titleWidth + 16;
  const titleLayerHeight = 200;
  const titleBaseline = 176;
  const titleLayer = createDebossedLayer({
    depth: 2.5,
    drawMask: (maskContext) => {
      maskContext.font = `400 174px ${displayFont}`;
      maskContext.textAlign = "center";
      maskContext.fillText("INVITE", titleLayerWidth / 2, titleBaseline);
    },
    height: titleLayerHeight,
    strokeWidth: 4,
    width: titleLayerWidth,
  });
  context.drawImage(
    titleLayer,
    invitationCenter - titleLayerWidth / 2,
    390 - titleBaseline,
    titleLayerWidth,
    titleLayerHeight,
  );

  context.textAlign = "right";
  context.font = `400 25px ${sansFont}`;
  context.fillText("To try out the next generation", titleRight, 442);
  context.fillText("personal assistant", titleRight, 474);

  context.textAlign = "center";
  context.font = `700 16px ${monoFont}`;
  context.fillText("ADMIT ONE", stubCenter, 78);
  context.font = `650 17px ${monoFont}`;
  context.fillText("EARLY", stubCenter, 320);
  context.font = `800 27px ${monoFont}`;
  context.fillText("ACCESS", stubCenter, 354);
  context.font = `700 15px ${monoFont}`;
  context.fillText("HA · 001 · 2026", stubCenter, TICKET_DESIGN_HEIGHT - 64);

  context.restore();

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

type ParticleKind = "ash" | "ember";

function getParticleArrival(uvX: number, uvY: number, variation: number) {
  const diagonal = uvX * 0.69 + uvY * 0.31;
  const broadNoise =
    Math.sin(uvX * 33.7 + uvY * 17.1) * 0.036 +
    Math.sin(uvX * 11.3 - uvY * 29.9) * 0.025;

  return clamp(diagonal + broadNoise + variation * 0.06, 0.015, 0.985);
}

function createParticleGeometry(
  kind: ParticleKind,
  count: number,
  seed: number,
) {
  const random = seededRandom(seed);
  const positions = new Float32Array(count * 3);
  const velocities = new Float32Array(count * 3);
  const emissions = new Float32Array(count);
  const lives = new Float32Array(count);
  const seeds = new Float32Array(count);
  const sizes = new Float32Array(count);

  for (let index = 0; index < count; index += 1) {
    const uvX = random();
    const uvY = random();
    const arrival = getParticleArrival(uvX, uvY, random() - 0.5);
    const offset = index * 3;
    positions[offset] = (uvX - 0.5) * TICKET_WIDTH;
    positions[offset + 1] = (uvY - 0.5) * TICKET_HEIGHT;
    positions[offset + 2] = 0.055 + random() * 0.025;
    emissions[index] = (arrival * BURN_DURATION) / 1000;
    seeds[index] = random() * 100;

    if (kind === "ember") {
      const speedRoll = random();
      const lateralRange = random() > 0.84 ? 1.7 : 0.82;
      velocities[offset] = (random() - 0.54) * lateralRange;
      velocities[offset + 1] =
        speedRoll < 0.14
          ? 1.65 + random() * 0.95
          : speedRoll < 0.4
            ? 0.24 + random() * 0.48
            : 0.7 + random() * 1.05;
      velocities[offset + 2] = (random() - 0.5) * 0.62;
      lives[index] = 0.3 + random() * 1.08;
      sizes[index] = 4 + random() ** 2 * 14;
    } else {
      velocities[offset] = (random() - 0.5) * 0.62;
      velocities[offset + 1] = 0.08 + random() * 0.42;
      velocities[offset + 2] = (random() - 0.5) * 0.34;
      lives[index] = 0.72 + random() * 1.02;
      sizes[index] = 3.5 + random() * 5.5;
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("aVelocity", new THREE.BufferAttribute(velocities, 3));
  geometry.setAttribute("aEmission", new THREE.BufferAttribute(emissions, 1));
  geometry.setAttribute("aLife", new THREE.BufferAttribute(lives, 1));
  geometry.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));
  geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
  return geometry;
}

type ThreeTicketCanvasProps = {
  burnColor: BurnColor;
  burning: boolean;
  onBurnComplete: () => void;
  resetVersion: number;
};

function ThreeTicketCanvas({
  burnColor,
  burning,
  onBurnComplete,
  resetVersion,
}: ThreeTicketCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const burnColorRef = useRef(burnColor);
  const burnColorUniformsRef = useRef<BurnColorUniforms | null>(null);
  const burningRef = useRef(burning);
  const completionCallbackRef = useRef(onBurnComplete);
  const resetVersionRef = useRef(resetVersion);
  const wakeAnimationRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    burnColorRef.current = burnColor;

    if (burnColorUniformsRef.current) {
      applyBurnPalette(burnColorUniformsRef.current, burnColor);
    }

    wakeAnimationRef.current?.();
  }, [burnColor]);

  useEffect(() => {
    burningRef.current = burning;
    wakeAnimationRef.current?.();
  }, [burning]);

  useEffect(() => {
    completionCallbackRef.current = onBurnComplete;
  }, [onBurnComplete]);

  useEffect(() => {
    resetVersionRef.current = resetVersion;
    wakeAnimationRef.current?.();
  }, [resetVersion]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;

    if (!canvas || !container) {
      return;
    }

    const containerElement = container;
    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      canvas,
      powerPreference: "high-performance",
    });
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, TICKET_ASPECT, 0.1, 100);
    camera.position.set(0, 0, 5.25);

    const transparentPixel = new Uint8Array([0, 0, 0, 0]);
    const placeholderTexture = new THREE.DataTexture(
      transparentPixel,
      1,
      1,
      THREE.RGBAFormat,
    );
    placeholderTexture.needsUpdate = true;

    const burnProgressUniform = { value: 0 };
    const elapsedUniform = { value: 0 };
    const pixelRatioUniform = { value: 1 };
    const textureUniform = { value: placeholderTexture as THREE.Texture };
    const timeUniform = { value: 0 };
    const burnColorUniforms = createBurnColorUniforms(burnColorRef.current);
    burnColorUniformsRef.current = burnColorUniforms;
    const ticketMaterial = new THREE.ShaderMaterial({
      depthWrite: false,
      fragmentShader: ticketFragmentShader,
      side: THREE.DoubleSide,
      transparent: true,
      uniforms: {
        ...burnColorUniforms,
        uBurnProgress: burnProgressUniform,
        uTicket: textureUniform,
        uTime: timeUniform,
      },
      vertexShader: ticketVertexShader,
    });
    const glowMaterial = new THREE.ShaderMaterial({
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false,
      fragmentShader: glowFragmentShader,
      side: THREE.DoubleSide,
      transparent: true,
      uniforms: {
        ...burnColorUniforms,
        uBurnProgress: burnProgressUniform,
        uTicket: textureUniform,
        uTime: timeUniform,
      },
      vertexShader: ticketVertexShader,
    });
    const ticketGeometry = new THREE.PlaneGeometry(
      TICKET_WIDTH,
      TICKET_HEIGHT,
      96,
      44,
    );
    const ticketMesh = new THREE.Mesh(ticketGeometry, ticketMaterial);
    ticketMesh.renderOrder = 0;
    const glowMesh = new THREE.Mesh(ticketGeometry, glowMaterial);
    glowMesh.position.z = 0.008;
    glowMesh.renderOrder = 1;

    const emberGeometry = createParticleGeometry("ember", EMBER_COUNT, 91);
    const emberMaterial = new THREE.ShaderMaterial({
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false,
      fragmentShader: particleFragmentShader,
      transparent: true,
      uniforms: {
        ...burnColorUniforms,
        uElapsed: elapsedUniform,
        uKind: { value: 0 },
        uPixelRatio: pixelRatioUniform,
      },
      vertexShader: particleVertexShader,
    });
    const embers = new THREE.Points(emberGeometry, emberMaterial);
    embers.renderOrder = 3;

    const ashGeometry = createParticleGeometry("ash", ASH_COUNT, 217);
    const ashMaterial = new THREE.ShaderMaterial({
      depthTest: false,
      depthWrite: false,
      fragmentShader: particleFragmentShader,
      transparent: true,
      uniforms: {
        ...burnColorUniforms,
        uElapsed: elapsedUniform,
        uKind: { value: 1 },
        uPixelRatio: pixelRatioUniform,
      },
      vertexShader: particleVertexShader,
    });
    const ash = new THREE.Points(ashGeometry, ashMaterial);
    ash.renderOrder = 2;

    const ticketGroup = new THREE.Group();
    ticketGroup.add(ticketMesh, glowMesh, ash, embers);
    scene.add(ticketGroup);

    let disposed = false;
    let ticketTexture: THREE.Texture | null = null;

    createTicketTexture()
      .then((texture) => {
        if (disposed) {
          texture.dispose();
          return;
        }

        ticketTexture = texture;
        texture.anisotropy = Math.min(
          8,
          renderer.capabilities.getMaxAnisotropy(),
        );
        textureUniform.value = texture;
        placeholderTexture.dispose();
        wakeAnimationRef.current?.();
      })
      .catch(() => {
        // Leave the transparent placeholder in place if texture creation fails.
      });

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    embers.visible = !reducedMotion.matches;
    ash.visible = !reducedMotion.matches;
    const targetRotation = { x: 0, y: 0 };

    function handlePointerMove(event: PointerEvent) {
      if (burningRef.current || reducedMotion.matches) {
        return;
      }

      const bounds = containerElement.getBoundingClientRect();
      const pointerX = (event.clientX - bounds.left) / bounds.width;
      const pointerY = (event.clientY - bounds.top) / bounds.height;
      targetRotation.x = (0.5 - pointerY) * 0.28;
      targetRotation.y = (pointerX - 0.5) * 0.38;
    }

    function resetTilt() {
      targetRotation.x = 0;
      targetRotation.y = 0;
    }

    containerElement.addEventListener("pointermove", handlePointerMove, {
      passive: true,
    });
    containerElement.addEventListener("pointerleave", resetTilt);

    function resize() {
      const width = Math.max(1, containerElement.clientWidth);
      const height = Math.max(1, containerElement.clientHeight);
      const pixelBudgetRatio = Math.sqrt(MAX_RENDER_PIXELS / (width * height));
      const pixelRatio = Math.min(
        Math.max(1, window.devicePixelRatio),
        MAX_PIXEL_RATIO,
        Math.max(1, pixelBudgetRatio),
      );
      renderer.setPixelRatio(pixelRatio);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      pixelRatioUniform.value = pixelRatio;
      wakeAnimationRef.current?.();
    }

    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(containerElement);
    window.addEventListener("resize", resize, { passive: true });

    let animationFrame = 0;
    let previousTime = performance.now();
    let previousRenderTime = 0;
    let burnStart: number | null = null;
    let completionSent = false;
    let effectsFinished = false;
    let isIntersecting = true;
    let pausedAt: number | null = null;
    let renderedResetVersion = resetVersionRef.current;

    function applyPendingReset() {
      if (renderedResetVersion === resetVersionRef.current) {
        return;
      }

      renderedResetVersion = resetVersionRef.current;
      burnStart = null;
      completionSent = false;
      effectsFinished = false;
      burnProgressUniform.value = 0;
      elapsedUniform.value = 0;
      targetRotation.x = 0;
      targetRotation.y = 0;
      ticketGroup.rotation.set(0, 0, 0);
    }

    function pauseAnimation() {
      if (animationFrame !== 0) {
        window.cancelAnimationFrame(animationFrame);
        animationFrame = 0;
      }

      if (pausedAt === null && !effectsFinished) {
        pausedAt = performance.now();
      }
    }

    function startAnimation() {
      const hasPendingReset = renderedResetVersion !== resetVersionRef.current;

      if (
        animationFrame !== 0 ||
        !isIntersecting ||
        document.hidden ||
        (effectsFinished && !hasPendingReset)
      ) {
        return;
      }

      const now = performance.now();

      if (pausedAt !== null && burnStart !== null && !hasPendingReset) {
        burnStart += now - pausedAt;
      }

      pausedAt = null;
      previousTime = now;
      previousRenderTime = 0;
      animationFrame = window.requestAnimationFrame(animate);
    }

    function animate(time: number) {
      animationFrame = 0;

      if (!isIntersecting || document.hidden) {
        pauseAnimation();
        return;
      }

      applyPendingReset();
      const isBurning = burningRef.current;
      const isTiltAnimating =
        Math.abs(ticketGroup.rotation.x - targetRotation.x) > 0.0005 ||
        Math.abs(ticketGroup.rotation.y - targetRotation.y) > 0.0005;

      if (
        !isBurning &&
        !isTiltAnimating &&
        !reducedMotion.matches &&
        previousRenderTime > 0 &&
        time - previousRenderTime < IDLE_FRAME_INTERVAL
      ) {
        animationFrame = window.requestAnimationFrame(animate);
        return;
      }

      const delta = Math.min((time - previousTime) / 1000, 0.05);
      previousTime = time;
      previousRenderTime = time;

      if (isBurning) {
        burnStart ??= time;
        targetRotation.x = 0;
        targetRotation.y = 0;
      }

      ticketGroup.rotation.x = THREE.MathUtils.damp(
        ticketGroup.rotation.x,
        targetRotation.x,
        8,
        delta,
      );
      ticketGroup.rotation.y = THREE.MathUtils.damp(
        ticketGroup.rotation.y,
        targetRotation.y,
        8,
        delta,
      );

      let burnProgress = 0;
      let effectElapsed = 0;

      if (burnStart !== null) {
        const duration = reducedMotion.matches ? 180 : BURN_DURATION;
        const elapsedMilliseconds = time - burnStart;
        burnProgress = Math.min(1, elapsedMilliseconds / duration);
        effectElapsed = elapsedMilliseconds / 1000;
        elapsedUniform.value = effectElapsed;
      }

      burnProgressUniform.value = burnProgress;
      timeUniform.value = time / 1000;

      if (burnProgress >= 1 && !completionSent) {
        completionSent = true;
        completionCallbackRef.current();
      }

      renderer.render(scene, camera);

      const effectDuration = reducedMotion.matches
        ? 0.18
        : BURN_DURATION / 1000 + PARTICLE_TAIL_SECONDS;

      if (burnStart !== null && effectElapsed >= effectDuration) {
        effectsFinished = true;
        return;
      }

      if (!reducedMotion.matches || isBurning) {
        animationFrame = window.requestAnimationFrame(animate);
      }
    }

    function handleVisibilityChange() {
      if (document.hidden) {
        pauseAnimation();
      } else {
        startAnimation();
      }
    }

    const intersectionObserver = new IntersectionObserver(
      ([entry]) => {
        isIntersecting = entry?.isIntersecting ?? true;

        if (isIntersecting) {
          startAnimation();
        } else {
          pauseAnimation();
        }
      },
      { rootMargin: "160px 0px" },
    );
    intersectionObserver.observe(containerElement);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    wakeAnimationRef.current = startAnimation;
    startAnimation();

    return () => {
      disposed = true;
      burnColorUniformsRef.current = null;
      wakeAnimationRef.current = null;
      pauseAnimation();
      intersectionObserver.disconnect();
      resizeObserver.disconnect();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("resize", resize);
      containerElement.removeEventListener("pointermove", handlePointerMove);
      containerElement.removeEventListener("pointerleave", resetTilt);
      ticketGeometry.dispose();
      ticketMaterial.dispose();
      glowMaterial.dispose();
      emberGeometry.dispose();
      emberMaterial.dispose();
      ashGeometry.dispose();
      ashMaterial.dispose();
      ticketTexture?.dispose();
      placeholderTexture.dispose();
      renderer.dispose();
    };
  }, []);

  return (
    <div className={styles.viewport} ref={containerRef}>
      <canvas
        aria-label="A three-dimensional gold Hyperaide invitation ticket."
        className={styles.canvas}
        ref={canvasRef}
        role="img"
      />
    </div>
  );
}

export type ThreeWaitlistTicketProps = Omit<
  ComponentPropsWithoutRef<"section">,
  "children"
> & {
  burnColor?: BurnColor;
  buttonLabel?: string;
  onBurnComplete?: () => void;
  onJoin?: () => void;
};

export function ThreeWaitlistTicket({
  burnColor = "blue",
  buttonLabel = "Accept invite",
  className,
  onBurnComplete,
  onJoin,
  ...props
}: ThreeWaitlistTicketProps) {
  const [burning, setBurning] = useState(false);
  const [burnt, setBurnt] = useState(false);
  const [resetVersion, setResetVersion] = useState(0);
  const previousBurnColorRef = useRef(burnColor);

  useEffect(() => {
    if (previousBurnColorRef.current === burnColor) {
      return;
    }

    previousBurnColorRef.current = burnColor;
    setBurning(false);
    setBurnt(false);
    setResetVersion((version) => version + 1);
  }, [burnColor]);

  function handleJoin() {
    if (burning) {
      return;
    }

    setBurning(true);
    onJoin?.();
  }

  function handleBurnComplete() {
    setBurnt(true);
    onBurnComplete?.();
  }

  return (
    <section
      {...props}
      className={cn(styles.root, className)}
      data-burning={burning}
    >
      <ThreeTicketCanvas
        burnColor={burnColor}
        burning={burning}
        onBurnComplete={handleBurnComplete}
        resetVersion={resetVersion}
      />

      <div aria-hidden={burning} className={styles.actions}>
        <div className={styles.copy}>
          <h2>You&apos;re In!</h2>
          <p>Accept your invitation for early access to Hyperaide.</p>
        </div>
        <Button
          className={styles.button}
          disabled={burning}
          onClick={handleJoin}
          type="button"
        >
          {buttonLabel}
        </Button>
      </div>

      <span aria-live="polite" className={styles.srOnly}>
        {burnt ? "Your invitation has been accepted." : ""}
      </span>
    </section>
  );
}
