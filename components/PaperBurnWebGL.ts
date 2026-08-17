type PaperBurnRendererOptions = {
  canvas: HTMLCanvasElement;
  contentHeight: number;
  contentWidth: number;
  duration: number;
  onComplete: () => void;
  pixelRatio: number;
  textureSource: HTMLCanvasElement;
  viewportHeight: number;
  viewportWidth: number;
};

type BufferResource = {
  buffer: WebGLBuffer;
  count: number;
};

type PaperGeometry = BufferResource & {
  indexBuffer: WebGLBuffer;
};

type ParticleKind = "ash" | "ember";

const EMBER_COUNT = 520;
const ASH_COUNT = 180;
const PARTICLE_TAIL_SECONDS = 1.4;

const BURN_NOISE_SHADER = `
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
    float diagonal = warpedUv.x * 0.69 + warpedUv.y * 0.31;
    float coarse = fbm(uv * 7.2 + vec2(4.6, 9.1)) - 0.5;
    float fine = valueNoise(uv * 31.0 + vec2(1.7, 6.2)) - 0.5;

    return clamp(diagonal + coarse * 0.14 + fine * 0.04, 0.015, 0.985);
  }
`;

const PAPER_VERTEX_SHADER = `#version 300 es
  precision highp float;

  in vec2 aPosition;
  in vec2 aUv;

  uniform float uBurnProgress;
  uniform vec2 uContentScale;
  uniform float uTime;

  out vec2 vUv;

  ${BURN_NOISE_SHADER}

  void main() {
    vUv = aUv;
    float arrival = burnArrival(aUv);
    float frontDistance = abs(arrival - uBurnProgress);
    float frontInfluence =
      (1.0 - smoothstep(0.0, 0.13, frontDistance)) *
      step(0.001, uBurnProgress) *
      (1.0 - smoothstep(0.94, 1.0, uBurnProgress));
    float curlWave =
      sin(aUv.y * 22.0 + aUv.x * 9.0 + uTime * 5.0) * 0.5 + 0.5;
    float curlDepth = frontInfluence * (0.026 + curlWave * 0.082);
    float perspective = 1.0 / max(0.88, 1.0 - curlDepth * 0.7);
    vec2 transformed = aPosition * uContentScale;

    transformed.y +=
      frontInfluence * (curlWave - 0.5) * 0.024 * uContentScale.y;
    transformed *= perspective;
    gl_Position = vec4(transformed, 0.0, 1.0);
  }
`;

const PAPER_FRAGMENT_SHADER = `#version 300 es
  precision highp float;

  uniform sampler2D uPaper;
  uniform float uBurnProgress;
  uniform vec3 uBurnCore;
  uniform vec3 uBurnInner;
  uniform vec3 uBurnOuter;
  uniform float uTime;

  in vec2 vUv;
  out vec4 outputColor;

  ${BURN_NOISE_SHADER}

  void main() {
    vec4 design = texture(uPaper, vec2(vUv.x, 1.0 - vUv.y));

    if (design.a < 0.025) {
      discard;
    }

    float burnIsActive = step(0.001, uBurnProgress);
    float distanceToFront = burnArrival(vUv) - uBurnProgress;
    float edgeAlpha = burnIsActive > 0.5
      ? smoothstep(-0.0025, 0.0025, distanceToFront)
      : 1.0;

    if (edgeAlpha <= 0.001) {
      discard;
    }

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
    vec3 color = design.rgb;

    color = mix(color, charColor, charBand * 0.985);
    color += rimColor * emberBand * 1.08;
    color += uBurnCore * heatBand * 0.55;

    outputColor = vec4(color, design.a * edgeAlpha);
  }
`;

const GLOW_FRAGMENT_SHADER = `#version 300 es
  precision highp float;

  uniform sampler2D uPaper;
  uniform float uBurnProgress;
  uniform vec3 uBurnCore;
  uniform vec3 uBurnInner;
  uniform vec3 uBurnOuter;
  uniform float uTime;

  in vec2 vUv;
  out vec4 outputColor;

  ${BURN_NOISE_SHADER}

  void main() {
    vec4 design = texture(uPaper, vec2(vUv.x, 1.0 - vUv.y));

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

    outputColor = vec4(color, alpha * design.a);
  }
`;

const PARTICLE_VERTEX_SHADER = `#version 300 es
  precision highp float;

  in vec2 aPosition;
  in vec3 aVelocity;
  in float aEmission;
  in float aLife;
  in float aSeed;
  in float aSize;

  uniform float uElapsed;
  uniform float uKind;
  uniform float uMotionScale;
  uniform float uPixelRatio;

  out float vAlpha;
  out float vKind;
  out float vLife;
  out float vSeed;
  out float vSparkAngle;

  void main() {
    float ageSeconds = max(0.0, uElapsed - aEmission);
    float life = clamp(ageSeconds / aLife, 0.0, 1.0);
    float isVisible =
      step(aEmission, uElapsed) *
      (1.0 - step(aEmission + aLife, uElapsed));
    float swayRate = mix(3.5, 10.0, fract(aSeed * 0.173));
    float swayAmount =
      mix(0.008, 0.055, fract(aSeed * 0.417)) * uMotionScale;
    float lift =
      mix(-0.17, 0.24, fract(aSeed * 0.291)) * uMotionScale;
    vec3 emberPosition = vec3(aPosition, 0.0);

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

    vec3 ashPosition = vec3(aPosition, 0.0);
    ashPosition.x +=
      aVelocity.x * ageSeconds +
      sin(ageSeconds * 6.0 + aSeed * 19.0) *
        0.09 *
        uMotionScale *
        ageSeconds;
    ashPosition.y +=
      aVelocity.y * ageSeconds -
      0.72 * uMotionScale * ageSeconds * ageSeconds;
    ashPosition.z +=
      aVelocity.z * ageSeconds +
      cos(ageSeconds * 7.0 + aSeed * 13.0) * 0.055;

    vec3 animatedPosition = mix(emberPosition, ashPosition, uKind);
    gl_Position = vec4(animatedPosition.xy, 0.0, 1.0);
    gl_PointSize =
      aSize *
      mix(1.0 - life * 0.72, 1.0 - life * 0.28, uKind) *
      uPixelRatio;
    vAlpha =
      isVisible *
      smoothstep(0.0, 0.045, life) *
      (1.0 - smoothstep(0.58, 1.0, life));
    vKind = uKind;
    vLife = life;
    vSeed = aSeed;
    vSparkAngle =
      atan(aVelocity.x, max(0.12, aVelocity.y)) * 0.72 +
      sin(
        ageSeconds * mix(2.0, 7.0, fract(aSeed * 0.853)) + aSeed
      ) * 0.09;
  }
`;

const PARTICLE_FRAGMENT_SHADER = `#version 300 es
  precision highp float;

  uniform vec3 uBurnCore;
  uniform vec3 uBurnInner;
  uniform vec3 uBurnOuter;

  in float vAlpha;
  in float vKind;
  in float vLife;
  in float vSeed;
  in float vSparkAngle;
  out vec4 outputColor;

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
      float sparkHeat = smoothstep(0.34, 0.66, fract(vSeed * 0.1031));
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

    outputColor = vec4(color, alpha);
  }
`;

function clamp(value: number, minimum = 0, maximum = 1) {
  return Math.min(maximum, Math.max(minimum, value));
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

function createShader(
  gl: WebGL2RenderingContext,
  type: number,
  source: string,
) {
  const shader = gl.createShader(type);

  if (!shader) {
    throw new Error("Unable to create the paper burn shader.");
  }

  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(message || "Unable to compile the paper burn shader.");
  }

  return shader;
}

function createProgram(
  gl: WebGL2RenderingContext,
  vertexSource: string,
  fragmentSource: string,
) {
  const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();

  if (!program) {
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);
    throw new Error("Unable to create the paper burn program.");
  }

  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(message || "Unable to link the paper burn program.");
  }

  return program;
}

function getUniform(
  gl: WebGL2RenderingContext,
  program: WebGLProgram,
  name: string,
) {
  const location = gl.getUniformLocation(program, name);

  if (location === null) {
    throw new Error(`Unable to find the ${name} paper burn uniform.`);
  }

  return location;
}

function createPaperGeometry(gl: WebGL2RenderingContext): PaperGeometry {
  const horizontalSegments = 96;
  const verticalSegments = 44;
  const vertices: number[] = [];
  const indices: number[] = [];

  for (let row = 0; row <= verticalSegments; row += 1) {
    const uvY = row / verticalSegments;

    for (let column = 0; column <= horizontalSegments; column += 1) {
      const uvX = column / horizontalSegments;
      vertices.push(uvX * 2 - 1, uvY * 2 - 1, uvX, uvY);
    }
  }

  for (let row = 0; row < verticalSegments; row += 1) {
    for (let column = 0; column < horizontalSegments; column += 1) {
      const topLeft = row * (horizontalSegments + 1) + column;
      const topRight = topLeft + 1;
      const bottomLeft = topLeft + horizontalSegments + 1;
      const bottomRight = bottomLeft + 1;
      indices.push(
        topLeft,
        topRight,
        bottomLeft,
        topRight,
        bottomRight,
        bottomLeft,
      );
    }
  }

  const buffer = gl.createBuffer();
  const indexBuffer = gl.createBuffer();

  if (!buffer || !indexBuffer) {
    throw new Error("Unable to create the paper burn geometry.");
  }

  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
  gl.bufferData(
    gl.ELEMENT_ARRAY_BUFFER,
    new Uint16Array(indices),
    gl.STATIC_DRAW,
  );

  return { buffer, count: indices.length, indexBuffer };
}

function getParticleArrival(uvX: number, uvY: number, variation: number) {
  const diagonal = uvX * 0.69 + uvY * 0.31;
  const broadNoise =
    Math.sin(uvX * 33.7 + uvY * 17.1) * 0.036 +
    Math.sin(uvX * 11.3 - uvY * 29.9) * 0.025;

  return clamp(diagonal + broadNoise + variation * 0.06, 0.015, 0.985);
}

function createParticleBuffer(
  gl: WebGL2RenderingContext,
  kind: ParticleKind,
  count: number,
  seed: number,
  durationSeconds: number,
  contentScaleX: number,
  contentScaleY: number,
): BufferResource {
  const random = seededRandom(seed);
  const values = new Float32Array(count * 9);
  const motionScale = contentScaleY;

  for (let index = 0; index < count; index += 1) {
    const uvX = random();
    const uvY = random();
    const arrival = getParticleArrival(uvX, uvY, random() - 0.5);
    const offset = index * 9;
    values[offset] = (uvX * 2 - 1) * contentScaleX;
    values[offset + 1] = (uvY * 2 - 1) * contentScaleY;

    if (kind === "ember") {
      const speedRoll = random();
      const lateralRange = random() > 0.84 ? 1.7 : 0.82;
      values[offset + 2] =
        (random() - 0.54) * lateralRange * 0.32 * motionScale;
      values[offset + 3] =
        (speedRoll < 0.14
          ? 1.65 + random() * 0.95
          : speedRoll < 0.4
            ? 0.24 + random() * 0.48
            : 0.7 + random() * 1.05) *
        0.32 *
        motionScale;
      values[offset + 4] = (random() - 0.5) * 0.62;
      values[offset + 6] = 0.3 + random() * 1.08;
      values[offset + 8] = 4 + random() ** 2 * 14;
    } else {
      values[offset + 2] = (random() - 0.5) * 0.2 * motionScale;
      values[offset + 3] = (0.08 + random() * 0.42) * 0.32 * motionScale;
      values[offset + 4] = (random() - 0.5) * 0.34;
      values[offset + 6] = 0.72 + random() * 1.02;
      values[offset + 8] = 3.5 + random() * 5.5;
    }

    values[offset + 5] = arrival * durationSeconds;
    values[offset + 7] = random() * 100;
  }

  const buffer = gl.createBuffer();

  if (!buffer) {
    throw new Error("Unable to create the paper burn particles.");
  }

  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, values, gl.STATIC_DRAW);
  return { buffer, count };
}

function bindPaperGeometry(
  gl: WebGL2RenderingContext,
  program: WebGLProgram,
  geometry: PaperGeometry,
) {
  const position = gl.getAttribLocation(program, "aPosition");
  const uv = gl.getAttribLocation(program, "aUv");
  const stride = 4 * Float32Array.BYTES_PER_ELEMENT;

  gl.bindBuffer(gl.ARRAY_BUFFER, geometry.buffer);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, geometry.indexBuffer);
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, stride, 0);
  gl.enableVertexAttribArray(uv);
  gl.vertexAttribPointer(
    uv,
    2,
    gl.FLOAT,
    false,
    stride,
    2 * Float32Array.BYTES_PER_ELEMENT,
  );
}

function bindParticleBuffer(
  gl: WebGL2RenderingContext,
  program: WebGLProgram,
  resource: BufferResource,
) {
  const stride = 9 * Float32Array.BYTES_PER_ELEMENT;
  const attributes = [
    { name: "aPosition", size: 2, offset: 0 },
    { name: "aVelocity", size: 3, offset: 2 },
    { name: "aEmission", size: 1, offset: 5 },
    { name: "aLife", size: 1, offset: 6 },
    { name: "aSeed", size: 1, offset: 7 },
    { name: "aSize", size: 1, offset: 8 },
  ] as const;

  gl.bindBuffer(gl.ARRAY_BUFFER, resource.buffer);

  for (const attribute of attributes) {
    const location = gl.getAttribLocation(program, attribute.name);
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(
      location,
      attribute.size,
      gl.FLOAT,
      false,
      stride,
      attribute.offset * Float32Array.BYTES_PER_ELEMENT,
    );
  }
}

export function startPaperBurnRenderer({
  canvas,
  contentHeight,
  contentWidth,
  duration,
  onComplete,
  pixelRatio,
  textureSource,
  viewportHeight,
  viewportWidth,
}: PaperBurnRendererOptions) {
  const context = canvas.getContext("webgl2", {
    alpha: true,
    antialias: true,
    depth: false,
    powerPreference: "high-performance",
    premultipliedAlpha: false,
  });

  if (!context) {
    throw new Error("WebGL2 is unavailable.");
  }

  const gl: WebGL2RenderingContext = context;
  const durationSeconds = duration / 1000;
  const contentScaleX = contentWidth / viewportWidth;
  const contentScaleY = contentHeight / viewportHeight;
  const paperProgram = createProgram(
    gl,
    PAPER_VERTEX_SHADER,
    PAPER_FRAGMENT_SHADER,
  );
  const glowProgram = createProgram(
    gl,
    PAPER_VERTEX_SHADER,
    GLOW_FRAGMENT_SHADER,
  );
  const particleProgram = createProgram(
    gl,
    PARTICLE_VERTEX_SHADER,
    PARTICLE_FRAGMENT_SHADER,
  );
  const paperGeometry = createPaperGeometry(gl);
  const emberBuffer = createParticleBuffer(
    gl,
    "ember",
    EMBER_COUNT,
    91,
    durationSeconds,
    contentScaleX,
    contentScaleY,
  );
  const ashBuffer = createParticleBuffer(
    gl,
    "ash",
    ASH_COUNT,
    217,
    durationSeconds,
    contentScaleX,
    contentScaleY,
  );
  const texture = gl.createTexture();

  if (!texture) {
    throw new Error("Unable to create the paper texture.");
  }

  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    textureSource,
  );
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.clearColor(0, 0, 0, 0);

  const core = [0.95, 0.16, 0.006] as const;
  const inner = [1, 0.18, 0.004] as const;
  const outer = [0.72, 0.012, 0.001] as const;
  let animationFrame = 0;
  let startTime: number | null = null;
  let completionSent = false;
  let disposed = false;

  function setPalette(program: WebGLProgram) {
    gl.uniform3fv(getUniform(gl, program, "uBurnCore"), core);
    gl.uniform3fv(getUniform(gl, program, "uBurnInner"), inner);
    gl.uniform3fv(getUniform(gl, program, "uBurnOuter"), outer);
  }

  function drawPaper(program: WebGLProgram, progress: number, elapsed: number) {
    // biome-ignore lint/correctness/useHookAtTopLevel: WebGL API, not a React hook.
    gl.useProgram(program);
    bindPaperGeometry(gl, program, paperGeometry);
    gl.uniform1f(getUniform(gl, program, "uBurnProgress"), progress);
    gl.uniform2f(
      getUniform(gl, program, "uContentScale"),
      contentScaleX,
      contentScaleY,
    );
    gl.uniform1f(getUniform(gl, program, "uTime"), elapsed);
    gl.uniform1i(getUniform(gl, program, "uPaper"), 0);
    setPalette(program);
    gl.drawElements(gl.TRIANGLES, paperGeometry.count, gl.UNSIGNED_SHORT, 0);
  }

  function drawParticles(
    resource: BufferResource,
    kind: ParticleKind,
    elapsed: number,
  ) {
    // biome-ignore lint/correctness/useHookAtTopLevel: WebGL API, not a React hook.
    gl.useProgram(particleProgram);
    bindParticleBuffer(gl, particleProgram, resource);
    gl.uniform1f(getUniform(gl, particleProgram, "uElapsed"), elapsed);
    gl.uniform1f(
      getUniform(gl, particleProgram, "uKind"),
      kind === "ash" ? 1 : 0,
    );
    gl.uniform1f(
      getUniform(gl, particleProgram, "uMotionScale"),
      contentScaleY,
    );
    gl.uniform1f(getUniform(gl, particleProgram, "uPixelRatio"), pixelRatio);
    setPalette(particleProgram);
    gl.drawArrays(gl.POINTS, 0, resource.count);
  }

  function render(progress: number, elapsed: number) {
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    drawPaper(paperProgram, progress, elapsed);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    drawPaper(glowProgram, progress, elapsed);
    drawParticles(ashBuffer, "ash", elapsed);
    drawParticles(emberBuffer, "ember", elapsed);
  }

  function dispose() {
    if (disposed) {
      return;
    }

    disposed = true;
    window.cancelAnimationFrame(animationFrame);
    gl.deleteTexture(texture);
    gl.deleteBuffer(paperGeometry.buffer);
    gl.deleteBuffer(paperGeometry.indexBuffer);
    gl.deleteBuffer(emberBuffer.buffer);
    gl.deleteBuffer(ashBuffer.buffer);
    gl.deleteProgram(paperProgram);
    gl.deleteProgram(glowProgram);
    gl.deleteProgram(particleProgram);
  }

  function animate(time: number) {
    startTime ??= time;
    const elapsed = Math.max(0, (time - startTime) / 1000);
    const progress = Math.min(1, elapsed / durationSeconds);
    render(progress, elapsed);

    if (progress >= 1 && !completionSent) {
      completionSent = true;
      onComplete();
    }

    if (elapsed >= durationSeconds + PARTICLE_TAIL_SECONDS) {
      gl.clear(gl.COLOR_BUFFER_BIT);
      dispose();
      return;
    }

    animationFrame = window.requestAnimationFrame(animate);
  }

  render(0, 0);
  animationFrame = window.requestAnimationFrame(animate);
  return dispose;
}
