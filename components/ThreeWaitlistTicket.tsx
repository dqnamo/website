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
const BURN_DURATION = 850;
const PARTICLE_COUNT = 108;
const TEXTURE_WIDTH = 1400;
const TEXTURE_HEIGHT = Math.round(TEXTURE_WIDTH / TICKET_ASPECT);

const burnFronts = [
  { center: [0.08, 0.1] as const, delay: 0, radius: 2.18 },
  { center: [0.52, 0.52] as const, delay: 0.08, radius: 1.18 },
  { center: [0.94, 0.86] as const, delay: 0.16, radius: 2.18 },
] as const;

const ticketVertexShader = `
  varying vec2 vUv;
  varying vec3 vNormalView;
  varying vec3 vViewPosition;

  void main() {
    vUv = uv;
    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
    vViewPosition = -viewPosition.xyz;
    vNormalView = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * viewPosition;
  }
`;

const ticketFragmentShader = `
  uniform sampler2D uTicket;
  uniform float uBurnProgress;
  uniform float uTime;

  varying vec2 vUv;
  varying vec3 vNormalView;
  varying vec3 vViewPosition;

  float random(vec2 point) {
    return fract(sin(dot(point, vec2(127.1, 311.7))) * 43758.5453123);
  }

  float noise(vec2 point) {
    vec2 cell = floor(point);
    vec2 local = fract(point);
    local = local * local * (3.0 - 2.0 * local);

    return mix(
      mix(random(cell), random(cell + vec2(1.0, 0.0)), local.x),
      mix(
        random(cell + vec2(0.0, 1.0)),
        random(cell + vec2(1.0, 1.0)),
        local.x
      ),
      local.y
    );
  }

  float fbm(vec2 point) {
    float value = 0.0;
    float amplitude = 0.5;

    for (int octave = 0; octave < 4; octave++) {
      value += noise(point) * amplitude;
      point = point * 2.03 + vec2(13.1, 7.7);
      amplitude *= 0.5;
    }

    return value;
  }

  float localProgress(float delay, float end) {
    return smoothstep(delay, end, uBurnProgress);
  }

  float burnFront(vec2 center, float progress, float radius, float phase) {
    if (progress <= 0.0) {
      return -1.0;
    }

    vec2 delta = (vUv - center) * vec2(${TICKET_ASPECT.toFixed(2)}, 1.0);
    float angle = atan(delta.y, delta.x);
    float distortion =
      (fbm(vUv * 11.0 + phase) - 0.5) * 0.105 +
      sin(angle * 7.0 + phase * 3.0) * 0.026 +
      sin(angle * 17.0 - phase) * 0.012;

    return progress * radius - length(delta) + distortion;
  }

  void main() {
    vec4 design = texture2D(uTicket, vUv);

    if (design.a < 0.025 || uBurnProgress >= 0.999) {
      discard;
    }

    float frontA = burnFront(
      vec2(0.08, 0.10),
      localProgress(0.0, 0.78),
      2.18,
      0.7
    );
    float frontB = burnFront(
      vec2(0.52, 0.52),
      localProgress(0.08, 0.86),
      1.18,
      2.1
    );
    float frontC = burnFront(
      vec2(0.94, 0.86),
      localProgress(0.16, 0.94),
      2.18,
      4.3
    );
    float burnEdge = max(frontA, max(frontB, frontC));

    if (burnEdge > 0.0) {
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
    float sweep = exp(
      -pow((sweepCoordinate - sweepPosition) / 0.18, 2.0)
    );
    float grain = (fbm(vUv * 320.0 + uTime * 0.018) - 0.5) * 0.075;

    vec3 color = design.rgb;
    color *= mix(1.0, 0.56 + diffuse * 0.62 + grain, metalMask);
    color *= mix(
      vec3(1.0),
      vec3(1.02, 0.92, 0.72),
      horizontalEdge * metalMask
    );
    color +=
      vec3(1.0, 0.72, 0.22) *
      (specular * 0.88 + sweep * 0.22) *
      metalMask;
    color += vec3(1.0, 0.9, 0.68) * clearcoat * 0.16;

    float charBand = smoothstep(-0.075, -0.034, burnEdge);
    float emberBand = smoothstep(-0.036, -0.014, burnEdge);
    float heatBand = smoothstep(-0.015, -0.004, burnEdge);
    color = mix(color, vec3(0.105, 0.035, 0.012), charBand * 0.96);
    color += vec3(0.94, 0.16, 0.018) * emberBand * 0.86;
    color += vec3(1.0, 0.7, 0.18) * heatBand * 0.95;

    gl_FragColor = vec4(color, design.a);
  }
`;

const particleVertexShader = `
  uniform float uProgress;
  uniform float uPixelRatio;

  attribute vec3 aDrift;
  attribute float aEmission;
  attribute float aKind;
  attribute float aLife;

  varying float vAlpha;
  varying float vKind;

  void main() {
    float age = clamp((uProgress - aEmission) / aLife, 0.0, 1.0);
    float active =
      step(aEmission, uProgress) *
      (1.0 - step(aEmission + aLife, uProgress));
    vec3 animatedPosition = position;
    animatedPosition.xy += aDrift.xy * age;
    animatedPosition.z +=
      aDrift.z * age + sin(age * 3.14159265) * 0.06;

    vec4 viewPosition = modelViewMatrix * vec4(animatedPosition, 1.0);
    gl_Position = projectionMatrix * viewPosition;
    gl_PointSize =
      mix(4.2, 1.2, age) *
      mix(0.72, 1.0, aKind) *
      uPixelRatio;
    vAlpha =
      active *
      smoothstep(0.0, 0.12, age) *
      (1.0 - smoothstep(0.55, 1.0, age));
    vKind = aKind;
  }
`;

const particleFragmentShader = `
  varying float vAlpha;
  varying float vKind;

  void main() {
    float distanceToCenter = length(gl_PointCoord - vec2(0.5));

    if (distanceToCenter > 0.5) {
      discard;
    }

    float edge = 1.0 - smoothstep(0.22, 0.5, distanceToCenter);
    vec3 ash = vec3(0.12, 0.085, 0.055);
    vec3 ember = vec3(1.0, 0.24, 0.025);
    vec3 color = mix(ash, ember, vKind);
    gl_FragColor = vec4(color, edge * vAlpha);
  }
`;

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function smoothstep(edge0: number, edge1: number, value: number) {
  const progress = clamp((value - edge0) / (edge1 - edge0));
  return progress * progress * (3 - 2 * progress);
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

async function createTicketTexture() {
  await document.fonts.ready;
  const canvas = document.createElement("canvas");
  canvas.width = TEXTURE_WIDTH;
  canvas.height = TEXTURE_HEIGHT;
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Unable to create the waitlist ticket texture.");
  }

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
  const ticketPath = getTicketPath(TEXTURE_WIDTH, TEXTURE_HEIGHT);
  const stubX = TEXTURE_WIDTH * 0.75;
  const invitationCenter = stubX * 0.5;
  const stubCenter = stubX + (TEXTURE_WIDTH - stubX) * 0.5;

  context.save();
  context.clip(ticketPath);

  const baseGradient = context.createLinearGradient(
    0,
    0,
    TEXTURE_WIDTH,
    TEXTURE_HEIGHT,
  );
  baseGradient.addColorStop(0, "#8f6510");
  baseGradient.addColorStop(0.24, "#b18416");
  baseGradient.addColorStop(0.48, "#cc981f");
  baseGradient.addColorStop(0.74, "#9b7211");
  baseGradient.addColorStop(1, "#7d570b");
  context.fillStyle = baseGradient;
  context.fillRect(0, 0, TEXTURE_WIDTH, TEXTURE_HEIGHT);

  const glow = context.createRadialGradient(
    invitationCenter,
    TEXTURE_HEIGHT * 0.42,
    0,
    invitationCenter,
    TEXTURE_HEIGHT * 0.42,
    TEXTURE_WIDTH * 0.46,
  );
  glow.addColorStop(0, "rgba(246, 207, 91, 0.58)");
  glow.addColorStop(1, "rgba(246, 207, 91, 0)");
  context.globalCompositeOperation = "screen";
  context.fillStyle = glow;
  context.fillRect(0, 0, TEXTURE_WIDTH, TEXTURE_HEIGHT);
  context.globalCompositeOperation = "source-over";

  const random = seededRandom(31);
  context.globalCompositeOperation = "multiply";

  for (let index = 0; index < 5200; index += 1) {
    const opacity = 0.018 + random() * 0.032;
    context.fillStyle = `rgba(61, 40, 5, ${opacity})`;
    context.fillRect(
      random() * TEXTURE_WIDTH,
      random() * TEXTURE_HEIGHT,
      0.6 + random() * 1.2,
      0.6 + random() * 1.2,
    );
  }

  context.globalCompositeOperation = "source-over";
  context.strokeStyle = "rgba(55, 34, 2, 0.42)";
  context.lineWidth = 2;
  context.setLineDash([7, 8]);
  context.beginPath();
  context.moveTo(stubX, TEXTURE_HEIGHT * 0.045);
  context.lineTo(stubX, TEXTURE_HEIGHT * 0.955);
  context.stroke();
  context.setLineDash([]);

  context.fillStyle = "#2c1d07";

  if (logo) {
    const logoWidth = 82;
    const logoHeight = (logoWidth * 294) / 313;
    context.drawImage(
      logo,
      invitationCenter - logoWidth / 2,
      62,
      logoWidth,
      logoHeight,
    );
  }

  context.font = `400 174px ${displayFont}`;
  const titleWidth = context.measureText("INVITE").width;
  const titleLeft = invitationCenter - titleWidth / 2;
  const titleRight = invitationCenter + titleWidth / 2;

  context.textAlign = "left";
  context.font = `400 27px ${sansFont}`;
  context.fillText("Your", titleLeft, 252);

  context.save();
  context.translate(invitationCenter, 390);
  context.rotate((-2 * Math.PI) / 180);
  context.textAlign = "center";
  context.font = `400 174px ${displayFont}`;
  context.fillText("INVITE", 0, 0);
  context.restore();

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
  context.fillText("HA · 001 · 2026", stubCenter, TEXTURE_HEIGHT - 64);

  context.restore();

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

function createParticleGeometry() {
  const random = seededRandom(91);
  const positions = new Float32Array(PARTICLE_COUNT * 3);
  const drifts = new Float32Array(PARTICLE_COUNT * 3);
  const emissions = new Float32Array(PARTICLE_COUNT);
  const kinds = new Float32Array(PARTICLE_COUNT);
  const lives = new Float32Array(PARTICLE_COUNT);

  for (let index = 0; index < PARTICLE_COUNT; index += 1) {
    const front = burnFronts[index % burnFronts.length];
    let emission = front.delay + 0.04 + random() * 0.48;
    let uvX = front.center[0];
    let uvY = front.center[1];

    for (let attempt = 0; attempt < 8; attempt += 1) {
      const local = smoothstep(front.delay, 0.88, emission);
      const angle = random() * Math.PI * 2;
      const radius = local * front.radius * (0.84 + random() * 0.18);
      uvX = front.center[0] + (Math.cos(angle) * radius) / TICKET_ASPECT;
      uvY = front.center[1] + Math.sin(angle) * radius;

      if (uvX > 0.03 && uvX < 0.97 && uvY > 0.03 && uvY < 0.97) {
        break;
      }

      emission = front.delay + 0.03 + random() * 0.42;
    }

    const offset = index * 3;
    positions[offset] = (uvX - 0.5) * TICKET_WIDTH;
    positions[offset + 1] = (uvY - 0.5) * TICKET_HEIGHT;
    positions[offset + 2] = 0.045;
    drifts[offset] = (random() - 0.5) * 0.42;
    drifts[offset + 1] = 0.22 + random() * 0.48;
    drifts[offset + 2] = 0.04 + random() * 0.1;
    emissions[index] = Math.min(emission, 0.68);
    kinds[index] = random() > 0.72 ? 1 : 0;
    lives[index] = 0.16 + random() * 0.24;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("aDrift", new THREE.BufferAttribute(drifts, 3));
  geometry.setAttribute("aEmission", new THREE.BufferAttribute(emissions, 1));
  geometry.setAttribute("aKind", new THREE.BufferAttribute(kinds, 1));
  geometry.setAttribute("aLife", new THREE.BufferAttribute(lives, 1));
  return geometry;
}

type ThreeTicketCanvasProps = {
  burning: boolean;
  onBurnComplete: () => void;
};

function ThreeTicketCanvas({
  burning,
  onBurnComplete,
}: ThreeTicketCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const burningRef = useRef(burning);
  const completionCallbackRef = useRef(onBurnComplete);

  useEffect(() => {
    burningRef.current = burning;
  }, [burning]);

  useEffect(() => {
    completionCallbackRef.current = onBurnComplete;
  }, [onBurnComplete]);

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

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, TICKET_ASPECT, 0.1, 100);
    camera.position.set(0, 0, 4.55);

    const transparentPixel = new Uint8Array([0, 0, 0, 0]);
    const placeholderTexture = new THREE.DataTexture(
      transparentPixel,
      1,
      1,
      THREE.RGBAFormat,
    );
    placeholderTexture.needsUpdate = true;

    const ticketMaterial = new THREE.ShaderMaterial({
      fragmentShader: ticketFragmentShader,
      side: THREE.DoubleSide,
      transparent: true,
      uniforms: {
        uBurnProgress: { value: 0 },
        uTicket: { value: placeholderTexture },
        uTime: { value: 0 },
      },
      vertexShader: ticketVertexShader,
    });
    const ticketGeometry = new THREE.PlaneGeometry(
      TICKET_WIDTH,
      TICKET_HEIGHT,
      24,
      12,
    );
    const ticketMesh = new THREE.Mesh(ticketGeometry, ticketMaterial);

    const particleGeometry = createParticleGeometry();
    const particleMaterial = new THREE.ShaderMaterial({
      depthWrite: false,
      fragmentShader: particleFragmentShader,
      transparent: true,
      uniforms: {
        uPixelRatio: { value: 1 },
        uProgress: { value: 0 },
      },
      vertexShader: particleVertexShader,
    });
    const particles = new THREE.Points(particleGeometry, particleMaterial);

    const ticketGroup = new THREE.Group();
    ticketGroup.add(ticketMesh, particles);
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
        ticketMaterial.uniforms.uTicket.value = texture;
        placeholderTexture.dispose();
      })
      .catch(() => {
        // Leave the transparent placeholder in place if texture creation fails.
      });

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
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
      const pixelRatio = Math.min(window.devicePixelRatio, 2);
      renderer.setPixelRatio(pixelRatio);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      particleMaterial.uniforms.uPixelRatio.value = pixelRatio;
    }

    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(containerElement);

    let animationFrame = 0;
    let previousTime = performance.now();
    let burnStart: number | null = null;
    let completionSent = false;

    function animate(time: number) {
      const delta = Math.min((time - previousTime) / 1000, 0.05);
      previousTime = time;
      const isBurning = burningRef.current;

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

      if (burnStart !== null) {
        const duration = reducedMotion.matches ? 180 : BURN_DURATION;
        burnProgress = Math.min(1, (time - burnStart) / duration);
      }

      ticketMaterial.uniforms.uBurnProgress.value = burnProgress;
      ticketMaterial.uniforms.uTime.value = time / 1000;
      particleMaterial.uniforms.uProgress.value = burnProgress;

      if (burnProgress >= 1 && !completionSent) {
        completionSent = true;
        completionCallbackRef.current();
      }

      renderer.render(scene, camera);
      animationFrame = window.requestAnimationFrame(animate);
    }

    animationFrame = window.requestAnimationFrame(animate);

    return () => {
      disposed = true;
      window.cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      containerElement.removeEventListener("pointermove", handlePointerMove);
      containerElement.removeEventListener("pointerleave", resetTilt);
      ticketGeometry.dispose();
      ticketMaterial.dispose();
      particleGeometry.dispose();
      particleMaterial.dispose();
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
  buttonLabel?: string;
  onBurnComplete?: () => void;
  onJoin?: () => void;
};

export function ThreeWaitlistTicket({
  buttonLabel = "Join the waitlist",
  className,
  onBurnComplete,
  onJoin,
  ...props
}: ThreeWaitlistTicketProps) {
  const [burning, setBurning] = useState(false);
  const [burnt, setBurnt] = useState(false);

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
        burning={burning}
        onBurnComplete={handleBurnComplete}
      />

      <div aria-hidden={burning} className={styles.actions}>
        <div className={styles.copy}>
          <h2>Your invitation is waiting.</h2>
          <p>Join the waitlist for early access to Hyperaide.</p>
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
        {burnt ? "The invitation has burned away." : ""}
      </span>
    </section>
  );
}
