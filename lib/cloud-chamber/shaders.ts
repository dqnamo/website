// The chamber is drawn in three passes. The droplets go first, each a soft point added into a
// float buffer, lit by the torch where it sits and blurred by how far it is from the plane the
// camera is focused on (rain falling from high up is a big faint disc). A copy of that is blurred
// small for a glow. Then one pass draws everything else by casting each pixel's ray from the
// camera into the box: the black floor and whatever stands on it, the haze of fine mist the beam
// shows up, the glass walls (which, seen this steeply, mirror the floor and its tracks as much
// as they show the frost outside), the felt, the frosted plate, the polystyrene and the bench.

import {
  BENCH,
  EYE,
  FELT_BOTTOM,
  FELT_TOP,
  FOAM_IN,
  FOAM_OUT,
  FOAM_TOP,
  GLASS,
  HALF,
  PLATE,
  WALL,
} from "./chamber";

const f = (n: number) => n.toFixed(3);

// The torch's light at a point in the chamber, shadowed by the things on the floor: each is a
// cylinder (x, y, radius, height), and the light is blocked where the line to the lens passes
// through one below its top.
const COMMON = `
uniform vec3 uTorchPos;
uniform vec3 uTorchDir;
uniform float uTorchOn;
uniform vec4 uObj[4];
uniform int uObjCount;

const float EYE = ${f(EYE)};

float beam(vec3 p) {
  vec3 d = p - uTorchPos;
  float dist = length(d);
  float a = acos(clamp(dot(d, uTorchDir) / max(dist, 1e-3), -1.0, 1.0));
  float cone = exp(-a * a * 7.4) + 0.05 * exp(-a * a * 1.2);
  float fall = 1.0 / (1.0 + dist * dist * 0.004);
  float shade = 1.0;
  vec2 lens = uTorchPos.xy;
  vec2 ray = p.xy - lens;
  float len2 = max(dot(ray, ray), 1e-4);
  for (int i = 0; i < 4; i++) {
    if (i >= uObjCount) break;
    vec4 o = uObj[i];
    if (distance(p.xy, o.xy) < o.z) continue;
    float t = clamp(dot(o.xy - lens, ray) / len2, 0.0, 1.0);
    float miss = distance(lens + ray * t, o.xy);
    float h = mix(uTorchPos.z, p.z, t);
    float block = (1.0 - smoothstep(o.z * 0.7, o.z * 1.05, miss)) *
      (1.0 - smoothstep(o.w * 0.8, o.w * 1.3, h));
    shade *= 1.0 - 0.94 * block;
  }
  return uTorchOn * cone * fall * shade;
}
`;

export const DROP_VERTEX = `#version 300 es
precision highp float;
layout(location = 0) in vec4 aDrop;
layout(location = 1) in float aTrack;
uniform vec2 uRes;
uniform vec2 uCenter;
uniform float uScale;
uniform float uPx;
uniform float uHover;
uniform float uAmbient;
uniform float uGain;
${COMMON}
out vec3 vColour;
out float vSigma;
out float vSize;
void main() {
  vec3 p = aDrop.xyz;
  vec2 s = uCenter + p.xy * uScale * EYE / (EYE - p.z);
  gl_Position = vec4(s.x / uRes.x * 2.0 - 1.0, 1.0 - s.y / uRes.y * 2.0, 0.0, 1.0);
  bool hovered = abs(aTrack - uHover) < 0.5;
  float light = beam(p) + uAmbient;
  if (hovered) light = max(light, 0.5);
  // The camera is focused 7 mm above the floor, in the middle of the layer.
  float sharp = 0.75 * uPx;
  float sigma = max(sharp, abs(p.z - 0.7) * uScale * 0.06);
  vSigma = sigma;
  vSize = ceil(sigma * 3.0) * 2.0 + 1.0;
  float energy = aDrop.w * light;
  gl_PointSize = energy > 1e-4 ? vSize : 0.0;
  vec3 tint = hovered ? vec3(1.0, 0.6, 0.22) * 1.8 : vec3(1.0, 0.985, 0.95);
  // The same light spread over a bigger disc when out of focus.
  vColour = tint * energy * uGain * (sharp * sharp) / (sigma * sigma);
}
`;

export const DROP_FRAGMENT = `#version 300 es
precision highp float;
in vec3 vColour;
in float vSigma;
in float vSize;
out vec4 outColour;
void main() {
  vec2 d = (gl_PointCoord - 0.5) * vSize;
  float g = exp(-dot(d, d) / (2.0 * vSigma * vSigma));
  outColour = vec4(vColour * g, 1.0);
}
`;

export const QUAD = `#version 300 es
precision highp float;
out vec2 vUv;
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`;

// Four bilinear taps: a 4×4 box, to go down to a quarter of the size.
export const DOWN = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uSource;
uniform vec2 uTexel;
out vec4 outColour;
void main() {
  vec3 c = texture(uSource, vUv + uTexel * vec2(-1.0, -1.0)).rgb;
  c += texture(uSource, vUv + uTexel * vec2(1.0, -1.0)).rgb;
  c += texture(uSource, vUv + uTexel * vec2(-1.0, 1.0)).rgb;
  c += texture(uSource, vUv + uTexel * vec2(1.0, 1.0)).rgb;
  outColour = vec4(c * 0.25, 1.0);
}
`;

export const BLUR = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uSource;
uniform vec2 uStep;
out vec4 outColour;
void main() {
  vec3 c = texture(uSource, vUv).rgb * 0.227;
  c += (texture(uSource, vUv + uStep * 1.385).rgb + texture(uSource, vUv - uStep * 1.385).rgb) * 0.316;
  c += (texture(uSource, vUv + uStep * 3.231).rgb + texture(uSource, vUv - uStep * 3.231).rgb) * 0.07;
  outColour = vec4(c, 1.0);
}
`;

// Adds this frame's droplets into the long exposure.
export const ACCUMULATE = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uSource;
uniform float uWeight;
out vec4 outColour;
void main() {
  outColour = vec4(texture(uSource, vUv).rgb * uWeight, 1.0);
}
`;

export const COMPOSITE = `#version 300 es
precision highp float;
uniform sampler2D uDrops;
uniform sampler2D uBloom;
uniform sampler2D uObjects;
uniform sampler2D uGlow;
uniform vec2 uRes;
uniform vec2 uCenter;
uniform float uScale;
uniform float uDay;
uniform float uTime;
uniform float uHaze;
uniform float uLid;
uniform float uDropGain;
uniform vec2 uDrift;
${COMMON}
out vec4 outColour;

const float HALF = ${f(HALF)};
const float WALL = ${f(WALL)};
const float GLASS = ${f(GLASS)};
const float FELT_TOP = ${f(FELT_TOP)};
const float FELT_BOTTOM = ${f(FELT_BOTTOM)};
const float PLATE = ${f(PLATE)};
const float FOAM_IN = ${f(FOAM_IN)};
const float FOAM_OUT = ${f(FOAM_OUT)};
const float FOAM_TOP = ${f(FOAM_TOP)};
const float BENCH = ${f(BENCH)};
const float LID = HALF + 1.2;
const float LID_Z = WALL + 0.3;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + 1.0), u.x), u.y);
}

float fbm(vec2 p) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    s += a * noise(p);
    p = p * 2.03 + 17.1;
    a *= 0.5;
  }
  return s;
}

vec2 screenOf(vec3 p) {
  return uCenter + p.xy * uScale * EYE / (EYE - p.z);
}

vec3 dropsAt(vec2 s) {
  vec2 uv = vec2(s.x / uRes.x, 1.0 - s.y / uRes.y);
  vec3 d = texture(uDrops, uv).rgb * uDropGain + texture(uBloom, uv).rgb * 0.4 * uDropGain;
  return 1.0 - exp(-d);
}

// Light on things outside the glass from the torch, which lies on the frosted plate.
float spill(vec3 p) {
  vec3 d = p - uTorchPos;
  float dist = length(d);
  float c = dot(d / max(dist, 1e-3), uTorchDir);
  return uTorchOn * (smoothstep(0.3, 0.95, c) * 1.4 + 0.05) / (1.0 + dist * dist * 0.08);
}

vec3 bench(vec2 u) {
  vec2 b = u * (EYE - BENCH) / EYE;
  float d = max(abs(b.x), abs(b.y)) - FOAM_OUT;
  float shadow = mix(0.62, 1.0, smoothstep(-0.6, 4.5, d));
  float speck = noise(b * 9.0) * 0.03 + fbm(b * 0.3) * 0.04;
  vec3 day = vec3(0.79, 0.78, 0.76) * (0.95 + speck) * shadow;
  vec3 night = vec3(0.0075, 0.0075, 0.008) * shadow + vec3(0.5) * spill(vec3(b, BENCH)) * 0.02;
  return mix(night, day, uDay);
}

// Expanded polystyrene: beads fused together, each a few millimetres across.
vec3 foam(vec2 p) {
  vec2 g = p * 3.4;
  vec2 i = floor(g);
  vec2 fr = fract(g);
  float d1 = 9.0;
  float d2 = 9.0;
  float shade = 0.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 o = vec2(float(x), float(y));
      vec2 c = o + vec2(hash(i + o), hash(i + o + 31.7)) * 0.8 + 0.1;
      float d = length(fr - c);
      if (d < d1) {
        d2 = d1;
        d1 = d;
        shade = hash(i + o + 7.3);
      } else if (d < d2) {
        d2 = d;
      }
    }
  }
  float seam = smoothstep(0.0, 0.1, d2 - d1);
  float tone = 0.88 + 0.05 * seam + 0.04 * shade + 0.03 * noise(p * 20.0);
  float light = mix(0.02, 0.92, uDay) + spill(vec3(p, FOAM_TOP)) * 0.8;
  return vec3(0.94, 0.94, 0.91) * tone * light;
}

// Hoar frost on the plate where it's open to the room's damp air: from above, a white fur of
// needles, thicker in drifts.
vec3 frost(vec2 p) {
  float drift = fbm(p * 0.9);
  float fur = noise(p * 22.0) * 0.55 + noise(p * 47.0 + 3.1) * 0.45;
  vec3 ice = vec3(0.88, 0.9, 0.93) * (0.7 + 0.2 * drift + 0.12 * fur);
  float light = mix(0.022, 0.9, uDay) + spill(vec3(p, 0.2)) * 1.6;
  // Single crystals glint.
  float glint = step(0.988, hash(floor(p * 36.0))) * (spill(vec3(p, 0.2)) * 3.0 + uDay * 0.12);
  return ice * light + glint;
}

// Seen through the walls, or past them: the frosted plate, the gap down to the dry ice where
// fog seeps up, the polystyrene box, the bench.
vec3 exterior(vec2 u) {
  float r = max(abs(u.x), abs(u.y));
  if (r < PLATE) return frost(u);
  vec2 f = u * (EYE - FOAM_TOP) / EYE;
  float rf = max(abs(f.x), abs(f.y));
  if (rf < FOAM_IN) {
    // A dark slot down to the dry ice, with fog welling up out of it.
    float fog = fbm(f * 0.6 + vec2(uTime * 0.05, -uTime * 0.04));
    return mix(vec3(0.01) * mix(0.4, 1.0, uDay), vec3(0.85) * mix(0.02, 0.7, uDay), 0.12 + fog * 0.22);
  }
  if (rf < FOAM_OUT) {
    vec3 c = foam(f);
    // Carbon dioxide fog creeping over the rim from the gap.
    float near = 1.0 - smoothstep(0.0, 1.6, rf - FOAM_IN);
    float fog = smoothstep(0.45, 0.8, fbm(f * 0.9 + vec2(uTime * 0.07, uTime * 0.05)));
    return mix(c, vec3(0.9) * mix(0.03, 0.9, uDay), fog * near * 0.5);
  }
  return bench(u);
}

// Which side of a thing faces the torch, for the light on it.
float facing(vec2 p) {
  for (int i = 0; i < 4; i++) {
    if (i >= uObjCount) break;
    vec4 o = uObj[i];
    if (distance(p, o.xy) < o.z) {
      if (o.w < 0.2) return 0.85;
      vec2 n = normalize(p - o.xy + 1e-4);
      vec2 l = normalize(uTorchPos.xy - o.xy);
      return 0.35 + 0.65 * smoothstep(-0.7, 0.9, dot(n, l));
    }
  }
  return 1.0;
}

vec3 floorAt(vec2 p, float room) {
  float lit = beam(vec3(p, 0.05));
  // Black paint under a film of alcohol, reflecting 3%: a little light where the beam grazes it.
  vec3 c = vec3(0.03) * (lit * 0.5 + room) + 0.0012;
  // A line of frost along the foot of the walls, wider in places.
  float edge = HALF - max(abs(p.x), abs(p.y));
  float reach = 0.12 + 0.4 * fbm(p * 0.9);
  float rime = 1.0 - smoothstep(reach * 0.4, reach, edge);
  float crystals = 0.55 + 0.45 * noise(p * 30.0);
  c = mix(c, vec3(0.82, 0.85, 0.88) * crystals * (0.25 * lit + room), rime * 0.85);
  vec2 uv = p / (2.0 * HALF) + 0.5;
  vec4 o = texture(uObjects, uv);
  if (o.a > 0.002) {
    float light = beam(vec3(p, 0.5)) * facing(p) + room;
    c = mix(c, o.rgb * light, o.a);
  }
  // Radium paint glows faintly, with single flashes where alphas strike the phosphor.
  float g = texture(uGlow, uv).r;
  if (g > 0.0) {
    float flash = step(0.994, hash(floor(uv * 700.0) + floor(uTime * 20.0) * 0.137));
    c += vec3(0.2, 0.85, 0.32) * g * (0.028 + 0.5 * flash);
  }
  return c;
}

// Fine mist the beam shows up, summed down the line of sight through the lowest few centimetres.
float haze(vec2 u) {
  float sum = 0.0;
  for (int i = 0; i < 5; i++) {
    float z = 0.25 + float(i) * 0.65;
    vec2 q = u * (EYE - z) / EYE;
    if (max(abs(q.x), abs(q.y)) > HALF) continue;
    float wisp = fbm(q * 0.42 + uDrift * (1.0 + float(i) * 0.15) + float(i) * 3.1);
    float mist = 0.2 + 1.2 * wisp * wisp;
    sum += beam(vec3(q, z)) * mist * exp(-z * 0.45);
  }
  return sum * uHaze;
}

void main() {
  vec2 s = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  vec2 u = (s - uCenter) / uScale;
  float rim = EYE / (EYE - WALL);
  float r = max(abs(u.x), abs(u.y));
  // The room's light, reaching down through the lid.
  float room = mix(0.004, 0.09, uDay);
  vec3 mist = vec3(0.92, 0.95, 1.0) * 0.04;
  vec3 c;
  if (r < HALF * rim) {
    if (r < HALF) {
      c = floorAt(u, room) + mist * haze(u);
    } else {
      // The ray meets an inside face of the glass.
      float zx = abs(u.x) > HALF ? EYE * (1.0 - HALF / abs(u.x)) : -1.0;
      float zy = abs(u.y) > HALF ? EYE * (1.0 - HALF / abs(u.y)) : -1.0;
      float zw = max(zx, zy);
      bool onX = zx >= zy;
      vec2 q = u * (EYE - zw) / EYE;
      float along = onX ? q.y : q.x;
      if (zw > FELT_BOTTOM && zw < FELT_TOP) {
        // Felt, dark with alcohol, a long way out of focus.
        float fibre = fbm(vec2(along * 1.5, zw * 3.0)) * 0.5 + 0.5;
        float edge = smoothstep(FELT_BOTTOM, FELT_BOTTOM + 0.6, zw) * (1.0 - smoothstep(FELT_TOP - 0.4, FELT_TOP, zw));
        c = vec3(0.06, 0.065, 0.075) * fibre * (room * 1.5 + 0.004) * mix(0.6, 1.0, edge);
      } else {
        // Glass this steep reflects about a quarter of the light: the floor and its tracks in
        // mirror image, over the frost outside, dimmed and tinted by the glass.
        vec2 m = u;
        if (onX) m.x = sign(u.x) * 2.0 * HALF - u.x;
        else m.y = sign(u.y) * 2.0 * HALF - u.y;
        vec3 reflected = floorAt(m, room) + mist * haze(m) + dropsAt(screenOf(vec3(m, 0.6)));
        vec3 through = exterior(u) * vec3(0.26, 0.3, 0.29) * (0.75 + 0.25 * smoothstep(0.0, WALL, zw));
        c = mix(through, reflected, 0.3);
        // Alcohol and frost mist the glass's foot, in patches.
        float patchy = noise(vec2(along * 1.7, 0.0));
        float foot = (1.0 - smoothstep(0.0, 0.6 + 0.9 * patchy, zw)) * (0.4 + 0.6 * patchy);
        c = mix(c, vec3(0.8, 0.83, 0.86) * (room * 0.6 + 0.12 * beam(vec3(q, 0.2))), foot * 0.5);
      }
      // A bead of silicone up each corner, where two panes meet.
      float seam = 1.0 - smoothstep(0.08, 0.22, abs(abs(u.x) - abs(u.y)) * (EYE - zw) / EYE);
      c = mix(c, vec3(0.5, 0.52, 0.5) * (room * 0.8 + 0.003), seam * 0.8);
    }
  } else if (r < (HALF + GLASS) * rim) {
    // The polished top edge of the glass.
    float t = (r / rim - HALF) / GLASS;
    float sheen = 0.5 + 0.5 * sin(t * 3.14159);
    c = vec3(0.62, 0.74, 0.7) * mix(0.012, 0.6, uDay) * sheen + exterior(u) * 0.2;
  } else {
    c = exterior(u);
  }
  // The glass lid, which reflects the room a little.
  float lidR = r * (EYE - LID_Z) / EYE;
  if (uLid > 0.5 && lidR < LID) {
    vec2 q = u * (EYE - LID_Z) / EYE;
    float window = smoothstep(-14.0, 6.0, -q.x - q.y * 0.6) * 0.005 + 0.0015;
    c = c * 0.94 + vec3(0.9, 0.95, 1.0) * window * uDay;
    float edge = smoothstep(LID - 0.35, LID - 0.05, lidR) * (1.0 - smoothstep(LID - 0.05, LID, lidR));
    c += vec3(0.55, 0.7, 0.66) * edge * mix(0.01, 0.35, uDay);
  }
  c += dropsAt(s);
  c = pow(clamp(c, 0.0, 1.0), vec3(1.0 / 2.2));
  c += (hash(s + fract(uTime) * 61.0) - 0.5) / 255.0;
  outColour = vec4(c, 1.0);
}
`;
