// The coin and the table are ray traced in one pass. The coin is a disc with rounded corners
// (and a hole, for the washer): each ray meets its bounding cylinder exactly and then steps the
// last fraction of a millimetre on to the rounded shape, which gives the true edge without
// marching the whole scene. The table is a plane.
//
// A spinning coin is a blur to the eye, and what the blur shows is the interesting part: spun
// upright it's a ghostly ball, and at the end the wobble smears into a halo while the picture
// on the face stays sharp, because the face itself is hardly turning. So each pixel looks at
// the coin at several moments spread over the frame, each one jittered in time and within the
// pixel, and averages what it saw. The engine passes the coin's pose at evenly spaced moments
// across the last twenty-fourth of a second, about as long as an eye blends, and each sample
// blends between the two either side. Shadows, the contact
// shadow and the reflection in the mirror are worked out per moment too, so they blur with it.

export const POSES = 25;

export const VS = `#version 300 es
layout(location = 0) in vec2 aPos;
void main() {
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

// Copies the frame, which is built up in a texture, to the screen.
export const PRESENT_FS = `#version 300 es
precision highp float;
uniform sampler2D uImage;
out vec4 outColor;
void main() {
  outColor = texelFetch(uImage, ivec2(gl_FragCoord.xy), 0);
}
`;

export const FS = `#version 300 es
precision highp float;
out vec4 outColor;

uniform vec2 uRes;
uniform vec3 uEye;
uniform vec3 uRight;
uniform vec3 uUp;
uniform vec3 uFwd;
uniform vec2 uTan;

// Poses across the frame: orientation (w, x, y, z) and the coin's middle, in millimetres.
uniform vec4 uQ[${POSES}];
uniform vec3 uC[${POSES}];
uniform int uPoseCount;
uniform int uSamples;
// A sphere holding every pose this frame, and how far past it a shadow can reach.
uniform vec4 uBound;
uniform float uReach;

uniform float uA;
uniform float uHH;
uniform float uRho;
uniform float uHole;
uniform int uMetal;
uniform float uReeds;
uniform int uFaces;
uniform sampler2D uSlopes;
uniform sampler2D uHeights;

uniform int uSurface;
uniform sampler2D uTrace;
uniform vec4 uTraceRect;
uniform float uNight;
uniform vec3 uSun;
uniform vec3 uLamp;
uniform vec3 uLampDir;
uniform float uLampFall;
uniform float uLampSize;
uniform float uFrame;

const float PI = 3.14159265;

uint pcg(uint v) {
  uint state = v * 747796405u + 2891336453u;
  uint word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
  return (word >> 22u) ^ word;
}
float rnd(inout uint s) {
  s = pcg(s);
  return float(s) / 4294967296.0;
}

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash12(i), hash12(i + vec2(1, 0)), u.x),
    mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), u.x),
    u.y
  );
}
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * noise(p);
    p = p * 2.03 + vec2(17.1, 3.7);
    a *= 0.5;
  }
  return v;
}

mat3 qmat(vec4 q) {
  float w = q.x, x = q.y, y = q.z, z = q.w;
  return mat3(
    1.0 - 2.0 * (y * y + z * z), 2.0 * (x * y + w * z), 2.0 * (x * z - w * y),
    2.0 * (x * y - w * z), 1.0 - 2.0 * (x * x + z * z), 2.0 * (y * z + w * x),
    2.0 * (x * z + w * y), 2.0 * (y * z - w * x), 1.0 - 2.0 * (x * x + y * y)
  );
}

// The pose a fraction f of the way through the frame.
void poseAt(float f, out mat3 R, out vec3 c) {
  float x = clamp(f, 0.0, 1.0) * float(uPoseCount - 1);
  int i = min(int(floor(x)), uPoseCount - 2);
  float u = x - float(i);
  vec4 q0 = uQ[i];
  vec4 q1 = uQ[i + 1];
  if (dot(q0, q1) < 0.0) q1 = -q1;
  R = qmat(normalize(mix(q0, q1, u)));
  c = mix(uC[i], uC[i + 1], u);
}

// ---- The coin, in its own frame: z out of the heads face ----------------------------------

float sdCoin(vec3 p) {
  float r = length(p.xy);
  vec2 d = vec2(max(r - (uA - uRho), (uHole + uRho) - r), abs(p.z) - (uHH - uRho));
  return min(max(d.x, d.y), 0.0) + length(max(d, 0.0)) - uRho;
}

vec3 coinNormal(vec3 p, out float side) {
  float r = max(length(p.xy), 1e-5);
  vec2 radial = p.xy / r;
  float outer = r - (uA - uRho);
  float inner = (uHole + uRho) - r;
  float dx = max(outer, inner);
  vec2 rdir = outer >= inner ? radial : -radial;
  float dy = abs(p.z) - (uHH - uRho);
  float sz = p.z >= 0.0 ? 1.0 : -1.0;
  vec2 n2;
  if (dx > 0.0 && dy > 0.0) n2 = normalize(vec2(dx, dy));
  else if (dx > dy) n2 = vec2(1.0, 0.0);
  else n2 = vec2(0.0, 1.0);
  // 1 on a face, 0 on the edge, between on the rounded corner.
  side = n2.y;
  return normalize(vec3(rdir * n2.x, sz * n2.y));
}

bool coinHit(vec3 o, vec3 d, float tMax, out float tHit) {
  tHit = 0.0;
  float t0 = -1e9;
  float t1 = 1e9;
  if (abs(d.z) > 1e-7) {
    float ta = (-uHH - o.z) / d.z;
    float tb = (uHH - o.z) / d.z;
    t0 = min(ta, tb);
    t1 = max(ta, tb);
  } else if (abs(o.z) > uHH) {
    return false;
  }
  float A = dot(d.xy, d.xy);
  float B = dot(o.xy, d.xy);
  float C = dot(o.xy, o.xy) - uA * uA;
  if (A > 1e-9) {
    float disc = B * B - A * C;
    if (disc < 0.0) return false;
    float s = sqrt(disc);
    t0 = max(t0, (-B - s) / A);
    t1 = min(t1, (-B + s) / A);
  } else if (C > 0.0) {
    return false;
  }
  t0 = max(t0, 0.0);
  t1 = min(t1, tMax);
  if (t0 > t1) return false;
  float t = t0;
  float eps = 0.0015 * uA;
  for (int i = 0; i < 20; i++) {
    float h = sdCoin(o + d * t);
    if (h < eps) {
      tHit = t;
      return true;
    }
    t += h;
    if (t > t1) return false;
  }
  return false;
}

// Light that gets past the coin to a point, softened by how near the ray passes.
float coinShadow(vec3 o, vec3 d, float k) {
  float b = dot(o, d);
  float c = dot(o, o) - uA * uA * 1.05;
  float disc = b * b - c;
  if (disc < 0.0) return 1.0;
  float s = sqrt(disc);
  float t = max(0.0, -b - s);
  float tEnd = -b + s;
  if (tEnd < 0.0) return 1.0;
  float res = 1.0;
  for (int i = 0; i < 14; i++) {
    float h = sdCoin(o + d * t);
    res = min(res, k * h / max(t, 0.02 * uA));
    if (res < 0.0) break;
    t += clamp(h, 0.02 * uA, 0.3 * uA);
    if (t > tEnd) break;
  }
  return smoothstep(0.0, 1.0, clamp(res, 0.0, 1.0));
}

// ---- The room ---------------------------------------------------------------------------

vec3 sunColour() {
  return vec3(1.0, 0.96, 0.9);
}
vec3 lampColour() {
  return vec3(1.0, 0.68, 0.38);
}

// What a mirror-like surface sees in a direction: by day a pale room with a tall window in the
// direction of the light, by night a dark room with the lamp's bright mouth. Rough metal sees a
// blurred version, so the window's edges soften and its brightness spreads out.
vec3 env(vec3 dir, float rough) {
  float soft = 0.02 + rough * 1.1;
  if (dir.z < 0.0) {
    // The table, seen in a reflection: its average colour, lit.
    vec3 table = uSurface == 0 ? vec3(0.42, 0.27, 0.15)
      : uSurface == 1 ? vec3(0.06)
      : uSurface == 2 ? vec3(0.03, 0.14, 0.07)
      : vec3(0.05, 0.055, 0.06);
    vec3 lit = mix(vec3(0.9), vec3(0.35, 0.24, 0.14), uNight);
    return table * lit * smoothstep(-1.0, -0.02, dir.z) + 0.02;
  }
  vec3 col;
  if (uNight < 0.5) {
    col = mix(vec3(0.17, 0.17, 0.18), vec3(0.56, 0.57, 0.6), smoothstep(0.12, 0.85, dir.z));
    // Low on the walls, the furniture round the room is darker still.
    col *= mix(0.45, 1.0, smoothstep(0.02, 0.2, dir.z));
    vec3 wx = normalize(cross(uSun, vec3(0.0, 0.0, 1.0)));
    vec3 wy = cross(wx, uSun);
    float facing = dot(dir, uSun);
    if (facing > 0.0) {
      vec2 w = vec2(dot(dir, wx), dot(dir, wy)) / facing;
      vec2 edge = smoothstep(vec2(0.42, 0.62) + soft, vec2(0.42, 0.62) - soft, abs(w));
      float pane = edge.x * edge.y;
      // Glazing bars, which only a polished surface shows.
      float bars = 1.0 - (1.0 - smoothstep(0.012, 0.03, abs(w.x))) * (1.0 - rough * 3.0);
      bars *= 1.0 - (1.0 - smoothstep(0.012, 0.03, abs(w.y - 0.08))) * (1.0 - rough * 3.0);
      float glow = pane * clamp(bars, 0.0, 1.0) * 7.0 / (1.0 + 10.0 * rough * rough);
      col += sunColour() * glow;
      col += sunColour() * 0.6 * exp(-dot(w, w) * 1.5) * rough;
    }
  } else {
    col = vec3(0.022, 0.019, 0.017) + vec3(0.05, 0.035, 0.022) * smoothstep(0.2, 1.0, dir.z);
    float cosA = dot(dir, uLampDir);
    float r = uLampSize;
    float mouth = smoothstep(cos(r + soft * 0.6), cos(r * 0.7), cosA);
    col += lampColour() * mouth * 22.0 / (1.0 + 30.0 * rough * rough);
    col += lampColour() * 0.25 * pow(max(cosA, 0.0), 12.0);
  }
  return col;
}

vec3 schlick(vec3 f0, float c) {
  return f0 + (1.0 - f0) * pow(1.0 - clamp(c, 0.0, 1.0), 5.0);
}

// The key light at a point: its direction and how much arrives.
vec3 keyDir(vec3 p) {
  return uNight < 0.5 ? uSun : normalize(uLamp - p);
}
vec3 keyLight(vec3 p) {
  if (uNight < 0.5) return sunColour() * 1.5;
  // A lamp in a shade over the table: inverse-square from the bulb, and a pool where the
  // shade lets the light out that fades to the dark of the room.
  vec3 d = uLamp - p;
  float fall = uLampFall / dot(d, d);
  float pool = smoothstep(0.7, 0.93, dot(normalize(-d), -uLampDir));
  return lampColour() * 2.1 * fall * (0.05 + 0.95 * pool);
}
float keySoftness() {
  return uNight < 0.5 ? 5.0 : 14.0;
}

// ---- The coin's metal -------------------------------------------------------------------

vec3 shadeCoin(vec3 pl, mat3 R, vec3 c, vec3 rd) {
  float side;
  vec3 nl = coinNormal(pl, side);
  float r = length(pl.xy);
  float high = 0.5;
  float onFace = smoothstep(0.85, 0.99, side);
  if (uFaces == 1 && onFace > 0.0) {
    bool heads = pl.z > 0.0;
    vec2 xy = heads ? pl.xy : vec2(-pl.x, pl.y);
    vec2 uv = vec2(0.5 + 0.5 * xy.x / uA, 0.5 - 0.5 * xy.y / uA);
    vec4 sl = texture(uSlopes, uv);
    vec2 s = (heads ? sl.xy : sl.zw) * 2.0 - 1.0;
    // Stored per unit of radius, ±12 across the byte.
    s *= 12.0 * 128.0 / 127.5 / uA;
    vec4 hh = texture(uHeights, uv);
    high = heads ? hh.x : hh.y;
    vec3 bumped = heads ? vec3(-s.x, -s.y, 1.0) : vec3(s.x, -s.y, -1.0);
    nl = normalize(mix(nl, normalize(bumped), onFace));
  } else if (uFaces == 0 && onFace > 0.0) {
    // Turned faces: fine concentric tool marks, too fine to see except as a soft ring of light.
    float ring = sin(r * 38.0) * 0.012 + sin(r * 7.3 + 1.0) * 0.008;
    nl = normalize(nl + vec3(pl.xy / max(r, 1e-4) * ring * onFace, 0.0));
  }
  if (uReeds > 0.0 && side < 0.05 && r > uA * 0.9) {
    float phi = atan(pl.y, pl.x);
    vec3 tangent = vec3(-pl.y, pl.x, 0.0) / max(r, 1e-4);
    float band = smoothstep(uHH - uRho, uHH - uRho * 2.0, abs(pl.z));
    nl = normalize(nl + tangent * 0.55 * sin(uReeds * phi) * band);
    high = 0.7 + 0.3 * cos(uReeds * phi);
  }

  vec3 n = R * nl;
  vec3 v = -rd;
  vec3 f0;
  float rough;
  vec3 dirt;
  if (uMetal == 0) {
    f0 = vec3(0.8, 0.79, 0.76);
    rough = 0.2;
    dirt = vec3(0.16, 0.15, 0.13);
  } else if (uMetal == 1) {
    f0 = vec3(0.86, 0.55, 0.4);
    rough = 0.3;
    dirt = vec3(0.12, 0.06, 0.035);
  } else if (uMetal == 2) {
    f0 = vec3(0.7, 0.72, 0.73);
    rough = 0.36;
    dirt = vec3(0.3, 0.3, 0.3);
    // Zinc plate: a faint mottle, and the yellow-blue cast of its passivation.
    float mottle = noise(pl.xy * 1.4) * 0.7 + noise(pl.xy * 5.0) * 0.3;
    f0 *= mix(vec3(0.96, 0.95, 0.9), vec3(0.95, 0.98, 1.04), mottle);
    rough += (mottle - 0.5) * 0.12;
  } else {
    f0 = vec3(0.62, 0.64, 0.66);
    rough = 0.035;
    dirt = vec3(0.5);
  }
  // Grime in the low parts of the relief, and polish worn on to the high points.
  float low = 1.0 - smoothstep(0.05, 0.45, high);
  f0 = mix(f0, f0 * dirt * 2.2, low * 0.75 * onFace * float(uFaces));
  rough = clamp(mix(rough, rough * 0.65, smoothstep(0.6, 1.0, high)) + low * 0.25 * float(uFaces), 0.02, 0.9);

  float nv = max(dot(n, v), 0.0);
  vec3 refl = reflect(rd, n);
  vec3 F = schlick(f0, nv);
  vec3 col = F * env(refl, rough);
  // The key light's highlight, as a broad lobe for rough metal.
  vec3 wp = R * pl + c;
  vec3 L = keyDir(wp);
  vec3 h = normalize(L + v);
  float nh = max(dot(n, h), 0.0);
  float a2 = max(rough * rough, 0.002);
  float D = a2 / (PI * pow(nh * nh * (a2 - 1.0) + 1.0, 2.0));
  float nl2 = max(dot(n, L), 0.0);
  col += F * keyLight(wp) * D * nl2 * 0.12 * smoothstep(0.08, 0.3, rough);
  // A little diffuse from tarnish, so a coin in shadow isn't black.
  col += f0 * dirt * 0.25 * (nl2 * keyLight(wp) * 0.3 + 0.15);
  return col;
}

// ---- The table --------------------------------------------------------------------------

struct Table {
  vec3 albedo;
  vec3 f0;
  float rough;
  float mirror;
};

Table tableAt(vec2 p) {
  Table t;
  t.f0 = vec3(0.04);
  t.mirror = 0.0;
  // Work in a scale tied to real millimetres so grain is the right size under any coin.
  if (uSurface == 0) {
    // Plain-sawn oak boards, each 118 mm wide with a fine dark joint between them and its own
    // tone. Growth rings run along a board, drifting gently and unevenly spaced: each is a band
    // of open earlywood pores, darker, then pale dense latewood. Pores show as short dashes
    // along the grain, and the rays as silvery flecks across it.
    float board = floor(p.y / 118.0);
    float seed = hash12(vec2(board, 3.1));
    float across = p.y - board * 118.0;
    float drift = fbm(vec2(p.x * 0.005 + seed * 13.0, p.y * 0.008)) * 34.0
      + fbm(vec2(p.x * 0.018, p.y * 0.04 + seed * 5.0)) * 6.0;
    float y = p.y + drift + seed * 70.0;
    float ring = fract(y / 3.1 + 0.8 * fbm(vec2(y * 0.015, seed * 9.0)));
    float wide = noise(vec2(y * 0.05, seed * 4.0 + p.x * 0.002));
    float early = smoothstep(0.0, 0.07, ring) * (1.0 - smoothstep(0.1 + 0.12 * wide, 0.26 + 0.2 * wide, ring));
    float pores = smoothstep(0.55, 0.8, noise(vec2(p.x * 0.14, y * 5.0)));
    float flecks = smoothstep(0.8, 0.93, noise(vec2(p.x * 0.05, p.y * 0.9) + 7.0));
    vec3 light = vec3(0.5, 0.3, 0.125) * mix(0.86, 1.08, seed);
    vec3 dark = vec3(0.34, 0.185, 0.068) * mix(0.86, 1.08, seed);
    t.albedo = mix(light, dark, early * (0.3 + 0.45 * pores) * mix(0.6, 1.0, wide));
    t.albedo *= 0.84 + 0.3 * fbm(vec2(p.x * 0.006, y * 0.03));
    t.albedo = mix(t.albedo, light * 1.15, flecks * 0.22);
    t.albedo *= 0.94 + 0.06 * noise(p * vec2(0.25, 3.0));
    float joint = min(across, 118.0 - across);
    t.albedo *= mix(0.35, 1.0, smoothstep(0.12, 0.45, joint));
    t.rough = 0.38;
  } else if (uSurface == 1) {
    // Smoked glass: dark, and a fifth as bright as a mirror in what it reflects.
    t.albedo = vec3(0.004);
    t.f0 = vec3(0.18, 0.2, 0.19);
    float dust = smoothstep(0.68, 0.92, fbm(p * 0.05)) * 0.35 + smoothstep(0.996, 1.0, hash12(floor(p * 3.0))) * 0.3;
    t.rough = 0.02 + dust * 0.05;
    t.albedo += dust * 0.015;
    t.mirror = 1.0;
  } else if (uSurface == 2) {
    float nap = noise(p * 1.7) * 0.5 + noise(p * 6.0) * 0.3 + hash12(floor(p * 9.0)) * 0.2;
    t.albedo = vec3(0.03, 0.16, 0.075) * (0.82 + 0.3 * nap) * (0.92 + 0.16 * fbm(p * 0.03));
    t.f0 = vec3(0.0);
    t.rough = 1.0;
  } else {
    // Honed slate: blue-black, faintly banded where it was split, with a few pale specks.
    float grain = fbm(p * vec2(0.08, 0.05)) * 0.6 + noise(p * 2.0) * 0.25;
    float bands = smoothstep(0.55, 0.75, fbm(vec2(p.x * 0.004, p.y * 0.03) + 9.0));
    t.albedo = vec3(0.05, 0.056, 0.064) * (0.8 + 0.45 * grain) * (1.0 + 0.25 * bands);
    t.albedo += vec3(0.05) * smoothstep(0.985, 1.0, hash12(floor(p * 4.0)));
    t.rough = 0.5;
  }
  if (uTraceRect.w > 0.0) {
    vec2 uv = (p - uTraceRect.xy) / uTraceRect.z;
    if (all(greaterThan(uv, vec2(0.0))) && all(lessThan(uv, vec2(1.0)))) {
      float ink = texture(uTrace, uv).a;
      vec3 inkCol = uSurface == 0 || uSurface == 2 ? vec3(0.02, 0.025, 0.06) : vec3(0.92, 0.9, 0.86);
      t.albedo = mix(t.albedo, inkCol, ink * 0.85);
      t.mirror *= 1.0 - ink;
    }
  }
  return t;
}

void main() {
  vec2 px = gl_FragCoord.xy;
  uint seed = uint(px.x) * 1973u + uint(px.y) * 9277u + uint(uFrame) * 26699u;
  seed = pcg(seed);

  vec3 ro = uEye;
  vec2 ndc0 = (px / uRes) * 2.0 - 1.0;
  vec3 rd0 = normalize(uFwd + ndc0.x * uTan.x * uRight + ndc0.y * uTan.y * uUp);
  float tTable0 = -ro.z / rd0.z;
  vec3 P0 = ro + rd0 * tTable0;

  // Is this pixel anywhere near the coin, or its shadow, this frame?
  vec3 oc = ro - uBound.xyz;
  float bb = dot(oc, rd0);
  float bc = dot(oc, oc) - uBound.w * uBound.w;
  bool seesBound = bb * bb - bc > 0.0;
  bool near = seesBound || length(P0.xy - uBound.xy) < uBound.w + uReach;

  Table tb = tableAt(P0.xy);
  vec3 L0 = keyDir(P0);
  vec3 key = keyLight(P0);
  float ndl = max(L0.z, 0.0);
  vec3 amb = uNight < 0.5 ? vec3(0.44, 0.45, 0.48) : vec3(0.045, 0.036, 0.028);
  vec3 refl0 = reflect(rd0, vec3(0.0, 0.0, 1.0));
  float fres = pow(1.0 - max(-rd0.z, 0.0), 5.0);
  vec3 spec = tb.mirror > 0.0 ? tb.f0 : tb.f0 + (1.0 - tb.f0) * fres;
  vec3 tableEnv = env(refl0, tb.rough) * spec;
  // The nap of baize catches grazing light.
  if (uSurface == 2) tableEnv = tb.albedo * 0.35 * fres * (key * ndl + amb);
  vec3 h0 = normalize(L0 - rd0);
  float gloss = pow(max(h0.z, 0.0), 2.0 / max(tb.rough * tb.rough, 0.002)) * (1.0 - tb.rough);

  if (!near) {
    vec3 col = tb.albedo * (amb + key * ndl) + tableEnv + key * spec * gloss * 0.06;
    col = 1.0 - exp(-col * 1.05);
    col = pow(col, vec3(1.0 / 2.2));
    col += (hash12(px + uFrame) - 0.5) / 255.0;
    outColor = vec4(col, 1.0);
    return;
  }

  vec3 sum = vec3(0.0);
  int n = max(uSamples, 1);
  for (int k = 0; k < 32; k++) {
    if (k >= n) break;
    float j = rnd(seed);
    vec2 sub = vec2(rnd(seed), rnd(seed)) - 0.5;
    vec2 ndc = ((px + sub) / uRes) * 2.0 - 1.0;
    vec3 rd = normalize(uFwd + ndc.x * uTan.x * uRight + ndc.y * uTan.y * uUp);
    float tTable = -ro.z / rd.z;
    mat3 R;
    vec3 c;
    poseAt((float(k) + j) / float(n), R, c);
    mat3 Rt = transpose(R);

    vec3 o = Rt * (ro - c);
    vec3 d = Rt * rd;
    float tHit;
    if (coinHit(o, d, tTable, tHit)) {
      sum += 1.0 - exp(-shadeCoin(o + d * tHit, R, c, rd) * 1.05);
      continue;
    }

    vec3 P = ro + rd * tTable;
    vec3 Pl = Rt * (P - c);
    vec3 L = keyDir(P);
    float shadow = coinShadow(Pl, Rt * L, keySoftness());
    // The coin hides the room from the table right under it.
    float gap = sdCoin(Pl + Rt * vec3(0.0, 0.0, uA * 0.12));
    float ao = mix(0.25, 1.0, smoothstep(0.0, uA * 0.55, gap));
    vec3 col = tb.albedo * (amb * ao + key * ndl * shadow);
    col += key * spec * gloss * 0.06 * shadow;
    if (tb.mirror > 0.0) {
      vec3 rr = reflect(rd, vec3(0.0, 0.0, 1.0));
      vec3 ro2 = Rt * (P - c);
      vec3 rd2 = Rt * rr;
      float t2;
      if (coinHit(ro2, rd2, 1e5, t2)) {
        col += tb.f0 * shadeCoin(ro2 + rd2 * t2, R, c, rr);
      } else {
        col += tableEnv * mix(1.0, ao, 0.5);
      }
    } else {
      col += tableEnv * mix(ao, 1.0, 0.4);
    }
    sum += 1.0 - exp(-col * 1.05);
  }
  // Each moment is tone mapped before they're averaged, so a glint caught in one of them
  // doesn't stand out of the blur as a speck.
  vec3 col = sum / float(n);
  col = pow(col, vec3(1.0 / 2.2));
  col += (hash12(px + uFrame) - 0.5) / 255.0;
  outColor = vec4(col, 1.0);
}
`;
