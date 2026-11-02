// The zoetrope is ray traced in one pass. The drum, its stand, the table and the wall are simple
// shapes (cylinders and planes), so each pixel finds what it sees exactly, and the only thing that
// moves is the drum's angle. That makes it cheap to show what an eye sees rather than what a
// camera would: for each pixel, the drum's angle is swept over the last moment of time the eye
// blends together, and what's seen through a slit is added up over just the instants the slit is
// in line, worked out exactly rather than sampled. So the picture through the slits is dim, sharp
// and moving; over the rim the same strip is a smear; and the slits themselves blur to a veil.

import { DRUM } from "./drum";

const f = (n: number) => n.toFixed(3);

export const VS = `#version 300 es
layout(location = 0) in vec2 aPos;
void main() {
  gl_Position = vec4(aPos, 0.0, 1.0);
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
// The drum's angle at the start and the end of the moment the eye is blending, weighted as a
// triangle in time across it.
uniform float uTheta0;
uniform float uTheta1;
// Samples across that moment for what's seen without a slit in the way.
uniform int uSamples;
uniform float uRamp;
// Half a slit's width, in millimetres.
uniform float uSlitHalf;
uniform int uPaint;
uniform float uNight;
uniform float uExposure;
uniform float uFrame;
uniform sampler2D uStrip;
uniform vec2 uStripSize;
uniform vec3 uSunDir;
uniform vec3 uLampPos;

const float PI = 3.14159265;
const float TAU = 6.28318531;
const float R = ${f(DRUM.radius)};
const float RI = ${f(DRUM.inner)};
const float H = ${f(DRUM.height)};
const float SLIT_LO = ${f(DRUM.slitLow)};
const float SLIT_HI = ${f(DRUM.slitHigh)};
const float SLITS = ${f(DRUM.slits)};
const float STRIP_LO = ${f(DRUM.stripLow)};
const float STRIP_HI = ${f(DRUM.stripHigh)};
const float COLLAR = ${f(DRUM.collar)};
const float COLLAR_LO = ${f(DRUM.collarLow)};
const float COLUMN = ${f(DRUM.column)};
const float FOOT = ${f(DRUM.foot)};
const float FOOT_TOP = ${f(DRUM.footTop)};
const float TABLE = ${f(DRUM.table)};
const float WALL = ${f(DRUM.wall)};
const float HUB = 19.0;
const float RIM = 2.6;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

// An integer hash, for each pixel's own offset into the samples it takes across a moment;
// the float hashes above make visible patterns at screen coordinates.
uint pcg(uint v) {
  uint state = v * 747796405u + 2891336453u;
  uint word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
  return (word >> 22u) ^ word;
}

float jitter(vec2 p, float frame) {
  uvec2 q = uvec2(p);
  return float(pcg(q.x + pcg(q.y + pcg(uint(frame))))) / 4294967296.0;
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
    mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

// A ray against the side of an upright cylinder round the y axis.
bool cylinder(vec3 ro, vec3 rd, float r, out float t0, out float t1) {
  float a = dot(rd.xz, rd.xz);
  float b = dot(ro.xz, rd.xz);
  float c = dot(ro.xz, ro.xz) - r * r;
  float h = b * b - a * c;
  t0 = -1.0;
  t1 = -1.0;
  if (a < 1e-9 || h < 0.0) return false;
  h = sqrt(h);
  t0 = (-b - h) / a;
  t1 = (-b + h) / a;
  return true;
}

// How open a slit is at angle a round the drum (in the drum's own frame, slits centred on whole
// multiples of the spacing), for something hw either side of centre seen over a footprint fp.
float slitOpen(float a, float hw, float fp) {
  float s = TAU / SLITS;
  float d = abs(a - s * floor(a / s + 0.5));
  fp = max(fp, 1e-5);
  return clamp((hw + 0.5 * fp - d) / fp, 0.0, 1.0);
}

// The eye's weighting across the moment it blends: level, with ramps of uRamp at either end.
// Slits passing at the spacing of its level part plus one ramp always add up to the same total,
// so nothing flickers, and only the ramps blend one glimpse into the next.
float tri(float u) {
  return clamp(min(u, 1.0 - u) / uRamp, 0.0, 1.0) / (1.0 - uRamp);
}

// ---- Light -------------------------------------------------------------------------------------

struct Light {
  vec3 L;
  vec3 E;
  // Penumbra growth per millimetre from the edge that casts it.
  float soft;
};

// The sash window the sun comes through, in the plane square to the sun: a tall opening with the
// glazing bars' shadows across it.
float windowAt(vec2 q, float soft) {
  float m = smoothstep(-340.0 - soft, -340.0 + soft, q.x) *
    (1.0 - smoothstep(380.0 - soft, 380.0 + soft, q.x)) *
    smoothstep(-440.0 - soft, -440.0 + soft, q.y) *
    (1.0 - smoothstep(480.0 - soft, 480.0 + soft, q.y));
  float bar =
    (smoothstep(-214.0 - soft, -214.0 + soft, q.x) - smoothstep(-194.0 - soft, -194.0 + soft, q.x)) +
    (smoothstep(-262.0 - soft, -262.0 + soft, q.y) - smoothstep(-232.0 - soft, -232.0 + soft, q.y)) +
    (smoothstep(292.0 - soft, 292.0 + soft, q.y) - smoothstep(310.0 - soft, 310.0 + soft, q.y));
  return m * (1.0 - clamp(bar, 0.0, 1.0));
}

vec3 sunU() {
  return normalize(cross(vec3(0.0, 1.0, 0.0), uSunDir));
}

Light lightAt(vec3 P) {
  Light l;
  if (uNight < 0.5) {
    vec3 U = sunU();
    vec3 V = cross(uSunDir, U);
    l.L = uSunDir;
    l.E = vec3(1.0, 0.9, 0.76) * 2.7 * windowAt(vec2(dot(P, U), dot(P, V)), 14.0);
    l.soft = 0.012;
  } else {
    vec3 d = uLampPos - P;
    float d2 = dot(d, d);
    l.L = d * inversesqrt(d2);
    // A shade over the bulb throws a pool of light below it.
    float cone = smoothstep(0.42, 0.78, l.L.y);
    l.E = vec3(1.0, 0.76, 0.5) * cone * (1.8e6 / d2);
    l.soft = 0.06;
  }
  return l;
}

vec3 ambient() {
  return uNight < 0.5 ? vec3(0.5, 0.55, 0.62) * 0.34 : vec3(0.36, 0.28, 0.22) * 0.08;
}

// What a glossy surface reflects: the room, the table below, the window or the lamp.
vec3 env(vec3 d) {
  if (uNight < 0.5) {
    vec3 below = vec3(0.62, 0.42, 0.26) * 0.45;
    vec3 room = mix(vec3(0.48, 0.45, 0.4), vec3(0.66, 0.68, 0.7), smoothstep(0.0, 0.7, d.y)) * 0.45;
    vec3 c = mix(below, room, smoothstep(-0.12, 0.04, d.y));
    vec3 U = sunU();
    vec3 V = cross(uSunDir, U);
    float z = dot(d, uSunDir);
    if (z > 0.2 && d.y > 0.0) {
      vec2 q = vec2(dot(d, U), dot(d, V)) / z;
      c += vec3(2.4, 2.35, 2.2) * windowAt(q * 1500.0, 30.0) * smoothstep(0.0, 0.08, d.y);
    }
    return c;
  }
  vec3 below = vec3(0.24, 0.14, 0.08) * 0.35;
  vec3 room = vec3(0.04, 0.035, 0.03);
  vec3 c = mix(below, room, smoothstep(-0.12, 0.04, d.y));
  vec3 toLamp = normalize(uLampPos - vec3(0.0, 100.0, 0.0));
  c += vec3(9.0, 6.4, 3.8) * smoothstep(0.992, 0.997, dot(d, toLamp));
  return c;
}

float fresnel(vec3 N, vec3 V, float f0) {
  return f0 + (1.0 - f0) * pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 5.0);
}

// How much of a light the solid drum or a part of its stand keeps from P: the ray towards the
// light comes nearest the axis somewhere in the part's height; how near decides the shadow, and
// its edge softens the further the light travels past it.
float occlude(vec3 P, Light l, float r, float y0, float y1) {
  vec3 L = l.L;
  if (L.y <= 1e-4) return 1.0;
  float s0 = max((y0 - P.y) / L.y, 0.0);
  float s1 = (y1 - P.y) / L.y;
  if (s1 <= s0) return 1.0;
  float ll = dot(L.xz, L.xz);
  float s = ll > 1e-8 ? clamp(-dot(P.xz, L.xz) / ll, s0, s1) : s0;
  float d = length(P.xz + s * L.xz);
  float pen = 1.5 + l.soft * s;
  return smoothstep(r - pen, r + pen, d);
}

// ---- The room ----------------------------------------------------------------------------------

void turned(vec3 ro, vec3 rd, float r, float y0, float y1, int which,
            inout float best, inout vec3 N, inout int id) {
  float t0;
  float t1;
  if (cylinder(ro, rd, r, t0, t1) && t0 > 0.0 && t0 < best) {
    float y = ro.y + t0 * rd.y;
    if (y >= y0 && y <= y1) {
      best = t0;
      vec3 P = ro + rd * t0;
      N = vec3(P.x / r, 0.0, P.z / r);
      id = which;
    }
  }
  if (rd.y < 0.0) {
    float t = (y1 - ro.y) / rd.y;
    vec3 P = ro + rd * t;
    if (t > 0.0 && t < best && dot(P.xz, P.xz) <= r * r) {
      best = t;
      N = vec3(0.0, 1.0, 0.0);
      id = which;
    }
  }
}

vec3 woodStand(vec3 P, bool top) {
  float a = atan(P.x, P.z);
  float g;
  if (top) {
    float r = length(P.xz);
    g = 0.5 + 0.3 * sin(r * 0.35 + 7.0 * vnoise(vec2(r * 0.03, a * 2.0)));
  } else {
    g = 0.5 + 0.5 * sin(P.y * 0.42 + 6.0 * vnoise(vec2(P.y * 0.02, a * 3.0)));
  }
  g = mix(g, vnoise(vec2(a * 40.0, P.y * 0.3)), 0.25);
  vec3 dark = uNight > 0.5 ? vec3(0.11, 0.045, 0.025) : vec3(0.2, 0.08, 0.04);
  return mix(dark, dark * 1.9, g);
}

vec3 tableWood(vec3 P) {
  float z = P.z + 4000.0;
  float plank = floor(z / 156.0);
  float e = fract(z / 156.0);
  float h = hash21(vec2(plank, 3.1));
  float warp = vnoise(vec2(P.x * 0.0035 + h * 50.0, plank)) * 9.0;
  float g = 0.5 + 0.5 * sin(z * 0.21 + warp * 1.6 + h * 20.0);
  g = mix(g * g, vnoise(vec2(P.x * 0.01, z * 0.5)), 0.45);
  vec3 light = uNight > 0.5 ? vec3(0.3, 0.18, 0.1) : vec3(0.6, 0.42, 0.25);
  vec3 dark = uNight > 0.5 ? vec3(0.15, 0.08, 0.045) : vec3(0.42, 0.27, 0.15);
  vec3 c = mix(dark, light, g) * (0.88 + 0.24 * h);
  float seam = smoothstep(0.0, 0.012, e) * smoothstep(1.0, 0.988, e);
  return c * mix(0.35, 1.0, seam);
}

// Everything that isn't the drum: the stand, the table and the wall behind.
vec3 room(vec3 ro, vec3 rd) {
  float best = 1e9;
  vec3 N = vec3(0.0);
  int id = 0;
  turned(ro, rd, COLLAR, COLLAR_LO, -0.5, 1, best, N, id);
  turned(ro, rd, COLUMN, FOOT_TOP, COLLAR_LO, 2, best, N, id);
  turned(ro, rd, FOOT, TABLE, FOOT_TOP, 3, best, N, id);
  if (rd.y < 0.0) {
    float t = (TABLE - ro.y) / rd.y;
    if (t > 0.0 && t < best) {
      best = t;
      N = vec3(0.0, 1.0, 0.0);
      id = 4;
    }
  }
  if (rd.z < 0.0) {
    float t = (WALL - ro.z) / rd.z;
    if (t > 0.0 && t < best) {
      best = t;
      N = vec3(0.0, 0.0, 1.0);
      id = 5;
    }
  }
  vec3 P = ro + rd * best;
  vec3 V = -rd;
  Light l = lightAt(P);
  vec3 amb = ambient();
  if (id >= 1 && id <= 3) {
    // Turned wood under a varnish, with the foot's top edge rounded over.
    float r = length(P.xz);
    bool top = N.y > 0.5;
    if (id == 3) {
      if (top) {
        N = normalize(mix(N, vec3(P.x / r, 0.0, P.z / r), smoothstep(FOOT - 7.0, FOOT, r) * 0.8));
      } else {
        N = normalize(mix(N, vec3(0.0, 1.0, 0.0), smoothstep(FOOT_TOP - 7.0, FOOT_TOP, P.y) * 0.8));
      }
    }
    vec3 alb = woodStand(P, top);
    float sh = occlude(P, l, R, 0.0, H);
    if (id >= 2) sh *= occlude(P, l, COLLAR, COLLAR_LO, 0.0);
    if (id == 3) sh *= occlude(P, l, COLUMN, FOOT_TOP, COLLAR_LO);
    float ao = id == 3 && top ? 1.0 - 0.5 * exp(-max(r - COLUMN, 0.0) / 10.0) : 1.0;
    ao *= id == 1 ? 0.55 : 1.0;
    vec3 c = alb * (l.E * max(dot(N, l.L), 0.0) * sh + amb * ao * (0.6 + 0.4 * N.y));
    c += env(reflect(rd, N)) * fresnel(N, V, 0.04) * (0.5 + 0.5 * sh) * ao;
    return c;
  }
  if (id == 4) {
    vec3 alb = tableWood(P);
    float r = length(P.xz);
    float sh = occlude(P, l, R, 0.0, H) *
      occlude(P, l, COLLAR, COLLAR_LO, 0.0) *
      occlude(P, l, COLUMN, FOOT_TOP, COLLAR_LO) *
      occlude(P, l, FOOT, TABLE, FOOT_TOP);
    float ao = (1.0 - 0.55 * exp(-max(r - FOOT, 0.0) / 14.0)) *
      (1.0 - 0.3 * (1.0 - smoothstep(R * 0.5, R * 2.2, r)));
    vec3 c = alb * (l.E * max(l.L.y, 0.0) * sh + amb * ao);
    c += env(reflect(rd, N)) * fresnel(N, V, 0.04) * 0.7 * ao * (0.4 + 0.6 * sh);
    return c;
  }
  // The wall: plaster, a little uneven, lit by the room and, at night, the lamp's spill.
  vec3 alb = uNight > 0.5 ? vec3(0.3, 0.33, 0.3) : vec3(0.8, 0.76, 0.68);
  alb *= 0.94 + 0.06 * vnoise(P.xy * 0.01);
  float lit = uNight > 0.5 ? 0.0 : 1.0;
  vec3 c = alb * (l.E * max(dot(N, l.L), 0.0) * lit + amb * 1.1);
  if (uNight > 0.5) {
    vec3 d = uLampPos - P;
    c += alb * vec3(1.0, 0.7, 0.42) * 0.9e5 / dot(d, d) * smoothstep(-200.0, 600.0, P.y) * 0.35;
  }
  return c;
}

// ---- The drum -----------------------------------------------------------------------------------

vec3 paint() {
  if (uPaint == 1) return vec3(0.4, 0.034, 0.028);
  if (uPaint == 2) return vec3(0.56, 0.48, 0.34);
  return vec3(0.009, 0.008, 0.008);
}

const vec3 GOLD = vec3(1.0, 0.74, 0.34);

float band(float y, float a, float b, float fp) {
  return smoothstep(a - fp, a + fp, y) - smoothstep(b - fp, b + fp, y);
}

// A five-pointed star of radius r.
float star(vec2 p, float r) {
  const vec2 k1 = vec2(0.809016994, -0.587785252);
  const vec2 k2 = vec2(-k1.x, k1.y);
  p.x = abs(p.x);
  p -= 2.0 * max(dot(k1, p), 0.0) * k1;
  p -= 2.0 * max(dot(k2, p), 0.0) * k2;
  p.x = abs(p.x);
  p.y -= r;
  vec2 ba = 0.42 * vec2(-k1.y, k1.x) - vec2(0.0, 1.0);
  float h = clamp(dot(p, ba) / dot(ba, ba), 0.0, r);
  return length(p - ba * h) * sign(p.y * ba.x - p.x * ba.y);
}

// Gilding on the outside: pinstripes all the way round, and stencilled stars and dots in the band
// below the slits, which turn with the drum. a is the angle in the drum's own frame.
float gilt(float a, float y, float fp) {
  float g = band(y, 3.5, 5.6, fp) + band(y, SLIT_LO - 8.0, SLIT_LO - 6.2, fp) +
    band(y, SLIT_HI + 3.2, SLIT_HI + 4.6, fp);
  float cell = TAU / (SLITS * 2.0);
  float k = floor(a / cell + 0.5);
  vec2 q = vec2((a - k * cell) * R, y - 48.0);
  float isStar = mod(k, 2.0);
  float d = isStar > 0.5 ? star(q * vec2(1.0, -1.0), 11.0) : length(q) - 3.2;
  g += smoothstep(fp, -fp, d);
  return clamp(g, 0.0, 1.0);
}

// The outside of the wall at P, given how much of it is gilt.
vec3 shadeOuter(vec3 P, vec3 N, vec3 rd, float g) {
  vec3 V = -rd;
  Light l = lightAt(P);
  float ndl = max(dot(N, l.L), 0.0);
  vec3 amb = ambient() * (0.55 + 0.45 * N.y);
  vec3 rf = env(reflect(rd, N));
  // Japanned or enamelled tin: the paint under a hard clear coat.
  vec3 painted = paint() * (l.E * ndl + amb) + rf * fresnel(N, V, 0.05);
  vec3 gold = GOLD * (0.3 * (l.E * ndl + amb) + 0.75 * rf);
  return mix(painted, gold, g);
}

// What the eye meets inside the drum along one ray, worked out once; only the drum's angle is
// left to vary.
struct Inside {
  int kind; // 0 the wall, 1 the floor, 2 nothing: out past the far rim
  vec3 P;
  vec3 N;
  float phi;
  float lod;
  float fp;
  vec3 bg;
  vec3 amb;
  vec3 E;
  float ndl;
  float over;
  float exitPhi;
  float inBand;
  float pen;
};

Inside inside(vec3 ro, vec3 rd, float tFar, float pixAng) {
  Inside g;
  g.kind = 0;
  g.bg = vec3(0.0);
  vec3 P = ro + rd * tFar;
  float t = tFar;
  if (P.y < 0.0) {
    t = -ro.y / rd.y;
    P = ro + rd * t;
    g.kind = 1;
    g.N = vec3(0.0, 1.0, 0.0);
  } else if (P.y > H) {
    g.kind = 2;
    g.bg = room(P, rd);
    return g;
  } else {
    g.N = vec3(-P.x, 0.0, -P.z) / RI;
  }
  g.P = P;
  g.phi = atan(P.x, P.z);
  float cosI = max(abs(dot(rd, g.N)), 0.12);
  float fp = t * pixAng / cosI;
  g.fp = fp / RI;
  g.lod = log2(max(fp * uStripSize.x / (TAU * RI), 1.0));
  Light l = lightAt(P);
  g.E = l.E;
  g.ndl = max(dot(g.N, l.L), 0.0);
  // Follow the light back out: over the rim, through a slit on the far side, or not at all.
  float e0;
  float e1;
  cylinder(P + g.N * 0.5, l.L, RI, e0, e1);
  float ye = P.y + e1 * l.L.y;
  float pen = 1.0 + l.soft * e1;
  g.over = smoothstep(H - pen, H + pen, ye);
  vec3 Pe = P + l.L * e1;
  g.exitPhi = atan(Pe.x, Pe.z);
  g.inBand = ye > SLIT_LO && ye < SLIT_HI ? 1.0 : 0.0;
  g.pen = pen / RI;
  // Sky light falls in through the open top: less of it the deeper down.
  float depth = H - P.y;
  float F = g.kind == 1
    ? 0.42
    : 0.5 * (1.0 - depth / sqrt(depth * depth + 4.0 * RI * RI)) * 2.0;
  g.amb = ambient() * F;
  if (g.kind == 0 && P.y > SLIT_LO && P.y < SLIT_HI) g.bg = room(P + rd * 2.0, rd);
  return g;
}

const vec3 BLACK_IN = vec3(0.018, 0.016, 0.015);

// What that ray sees inside the drum when the drum is at angle th.
vec3 seen(Inside g, float th) {
  if (g.kind == 2) return g.bg;
  float vis = g.over + g.inBand * slitOpen(g.exitPhi - th, uSlitHalf / RI, g.pen);
  vec3 light = g.amb + g.E * g.ndl * vis;
  if (g.kind == 1) {
    float r = length(g.P.xz);
    vec3 alb = r < HUB ? vec3(0.5, 0.36, 0.15) * (r < 5.0 ? 0.4 : 1.0) : BLACK_IN * 1.4;
    return alb * light;
  }
  float y = g.P.y;
  if (y >= STRIP_LO && y <= STRIP_HI) {
    vec2 uv = vec2((th - g.phi) / TAU, (STRIP_HI - y) / (STRIP_HI - STRIP_LO));
    return textureLod(uStrip, uv, g.lod).rgb * light;
  }
  vec3 c = BLACK_IN * light;
  if (y > H - RIM) {
    // The rolled rim, catching the light along its top.
    float b = (y - (H - RIM)) / RIM;
    c += env(normalize(vec3(-g.N.x, 2.0 * b, -g.N.z))) * 0.06 * b;
  }
  if (y > SLIT_LO && y < SLIT_HI) {
    c = mix(c, g.bg, slitOpen(g.phi - th, uSlitHalf / RI, g.fp));
  }
  return c;
}

// Looking into the drum with nothing in the way: the strip goes by during the moment.
vec3 openView(Inside g, float jit) {
  if (g.kind == 2) return g.bg;
  float d = uTheta1 - uTheta0;
  if (uSamples <= 1 || abs(d) < 1e-6) return seen(g, uTheta1);
  vec3 sum = vec3(0.0);
  float wsum = 0.0;
  for (int i = 0; i < 64; i++) {
    if (i >= uSamples) break;
    float u = (float(i) + jit) / float(uSamples);
    float w = tri(u) + 1e-3;
    sum += w * seen(g, uTheta0 + d * u);
    wsum += w;
  }
  return sum / wsum;
}

// Looking through the slit band from outside. The outer and inner edges of the cut must both be
// in line, which closes the slits down towards the sides. Across the moment, each slit that
// passes is open for an exact stretch of the drum's angle; those stretches are found directly and
// sampled, and the paint fills the rest.
vec3 throughSlits(Inside g, float phiO, float phiI, float fpO, vec3 wall, float jit) {
  float S = TAU / SLITS;
  float hwO = uSlitHalf / R;
  float hwI = uSlitHalf / RI;
  float d = uTheta1 - uTheta0;
  if (abs(d) < 1e-6) {
    float o = slitOpen(phiO - uTheta1, hwO, fpO) * slitOpen(phiI - uTheta1, hwI, fpO);
    if (o <= 0.0) return wall;
    return mix(wall, seen(g, uTheta1), o);
  }
  float lo = min(uTheta0, uTheta1);
  float hi = max(uTheta0, uTheta1);
  float reach = hwO + fpO;
  float k0 = ceil((phiO - hi - reach) / S);
  float k1 = floor((phiO - lo + reach) / S);
  vec3 sum = vec3(0.0);
  float wsum = 0.0;
  for (int i = 0; i < 8; i++) {
    float k = k0 + float(i);
    if (k > k1) break;
    float c = phiO - k * S;
    float a = max(lo, c - reach);
    float b = min(hi, c + reach);
    if (b <= a) continue;
    float step = (b - a) / 8.0;
    for (int j = 0; j < 8; j++) {
      float th = a + (float(j) + jit) * step;
      float w = tri((th - uTheta0) / d) * step / abs(d) *
        slitOpen(phiO - th, hwO, fpO) * slitOpen(phiI - th, hwI, fpO);
      if (w <= 0.0) continue;
      sum += w * seen(g, th);
      wsum += w;
    }
  }
  return sum + max(1.0 - wsum, 0.0) * wall;
}

vec3 render(vec3 ro, vec3 rd, float jit, float pixAng) {
  float t0;
  float t1;
  if (cylinder(ro, rd, R, t0, t1) && t0 > 0.0) {
    vec3 P = ro + rd * t0;
    if (P.y >= 0.0 && P.y <= H) {
      vec3 N = vec3(P.x, 0.0, P.z) / R;
      float phiO = atan(P.x, P.z);
      float side = max(abs(dot(normalize(rd.xz), N.xz)), 0.06);
      float fpMM = t0 * pixAng / side;
      float fpV = t0 * pixAng / max(length(rd.xz), 0.2);
      vec3 Ns = N;
      if (P.y > H - RIM) {
        // The rolled rim: its normal turns from outwards to upwards over the roll.
        float b = (P.y - (H - RIM)) / RIM;
        Ns = normalize(N * cos(b * 1.4) + vec3(0.0, sin(b * 1.4), 0.0));
      }
      // Gilt that turns with the drum is averaged over the moment, like everything else.
      float g;
      if (P.y < SLIT_LO - 10.0 && P.y > 10.0 && abs(uTheta1 - uTheta0) > 1e-6) {
        g = 0.0;
        float wsum = 0.0;
        int n = min(uSamples * 2, 96);
        for (int i = 0; i < 96; i++) {
          if (i >= n) break;
          float u = (float(i) + jit) / float(n);
          float w = tri(u) + 1e-3;
          g += w * gilt(phiO - mix(uTheta0, uTheta1, u), P.y, fpMM);
          wsum += w;
        }
        g /= wsum;
      } else {
        g = gilt(phiO - uTheta1, P.y, max(fpMM, fpV));
      }
      vec3 wall = shadeOuter(P, Ns, rd, g);
      if (P.y > SLIT_LO && P.y < SLIT_HI) {
        float a0;
        float a1;
        cylinder(ro, rd, RI, a0, a1);
        vec3 Pi = ro + rd * a0;
        Inside ins = inside(ro, rd, a1, pixAng);
        return throughSlits(ins, phiO, atan(Pi.x, Pi.z), fpMM / R, wall, jit);
      }
      return wall;
    }
    if (P.y > H) {
      // Over the near rim: into the drum, unless the ray clears the far rim too.
      float a0;
      float a1;
      cylinder(ro, rd, RI, a0, a1);
      if (a1 > 0.0 && ro.y + rd.y * a1 <= H) {
        Inside ins = inside(ro, rd, a1, pixAng);
        return openView(ins, jit);
      }
    }
  }
  return room(ro, rd);
}

vec3 aces(vec3 x) {
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}

void main() {
  vec2 ndc = gl_FragCoord.xy / uRes * 2.0 - 1.0;
  vec3 rd = normalize(uFwd + ndc.x * uTan.x * uRight + ndc.y * uTan.y * uUp);
  float pixAng = 2.0 * uTan.y / uRes.y;
  float jit = jitter(gl_FragCoord.xy, uFrame);
  vec3 c = render(uEye, rd, jit, pixAng);
  c = aces(c * uExposure);
  c = pow(c, vec3(1.0 / 2.2));
  float v = length(ndc * vec2(0.8, 0.9));
  c *= 1.0 - 0.22 * smoothstep(0.7, 1.5, v);
  c += (jitter(gl_FragCoord.xy, uFrame + 500.0) - 0.5) / 255.0;
  outColor = vec4(c, 1.0);
}
`;
