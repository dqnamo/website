// The card is ray traced in one pass, lens by lens. A pixel covers a lens or two at arm's
// length, so each takes a couple of dozen rays spread over it; every ray finds the lens it lands on (an
// exact hit on that lens's cylinder), bends into the plastic by Snell's law, carries on to the
// print and reads the slice it lands in. Nothing decides which picture a pixel shows; it falls
// out of where the rays land, and so do the soft change between pictures (the sheet focuses a
// touch short of the print), the pictures coming round again past the end of a lens's view, and
// the bands when the card is held closer or further than its print was made for.
//
// Water on the card is a cap of an ellipsoid, longer along the lenses because it wicks along the
// grooves. Under it the lenses are bent from water rather than air, and water bends light almost
// as much as the plastic, so they nearly stop working and the striped print shows through.

import { CARD, PLASTIC, WATER } from "./lens";

export const MAX_DROPS = 12;
export const MAX_RINGS = 12;
// How much longer a drop is along the grooves than across them.
export const WICK = 1.35;

const f = (n: number) => n.toFixed(4);

export const VS = `#version 300 es
layout(location = 0) in vec2 aPos;
void main() {
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

export const FS = `#version 300 es
precision highp float;
precision highp sampler2DArray;
out vec4 outColor;

uniform vec2 uRes;
uniform vec3 uEye;
uniform vec3 uRight;
uniform vec3 uUp;
uniform vec3 uFwd;
uniform vec2 uTan;
// The card's axes in the world: across, up and out of its face. Its centre is the origin, and
// its print is the plane w = 0.
uniform mat3 uCard;
// Pitch, radius of curvature and thickness of the lenses, in millimetres.
uniform vec3 uLens;
// 1 when the lenses run across the card rather than up and down it.
uniform int uAcross;
// The print: its strips' spacing over the lenses', its turn off square (radians), pictures, and
// the phase of the slices.
uniform vec4 uPrint;
// 1 with the lens sheet peeled off.
uniform int uBare;
uniform int uSamples;
// A loupe: its centre and radius in pixels, and its magnification. Radius 0 is no loupe.
uniform vec4 uLoupe;
uniform vec4 uDrops[${MAX_DROPS}];
uniform int uDropCount;
uniform vec4 uRings[${MAX_RINGS}];
uniform int uRingCount;
uniform float uNight;
uniform float uLod;
uniform sampler2DArray uFrames;

const float PI = 3.14159265;
const vec2 HALF = vec2(${f(CARD.width / 2)}, ${f(CARD.height / 2)});
const float CORNER = ${f(CARD.corner)};
const float NL = ${f(PLASTIC)};
const float NW = ${f(WATER)};
const float WICK = ${f(WICK)};
// The wall behind, and the key light: a tall softbox by day, a lamp by night, to the left and
// in front of the card. Upright lenses face every way across, so each one catches the softbox
// somewhere along its curve, and that thin line of reflection is the sheen of a ridged card.
const float WALL = -90.0;
const vec3 KEY = vec3(-0.4755, 0.3090, 0.8236);

float P;
float RL;
float T;

uint pcg(uint v) {
  uint state = v * 747796405u + 2891336453u;
  uint word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
  return (word >> 22u) ^ word;
}

float sdRoundRect(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

float fresnel(float cosI, float n1, float n2) {
  float r0 = (n1 - n2) / (n1 + n2);
  r0 *= r0;
  return r0 + (1.0 - r0) * pow(1.0 - clamp(cosI, 0.0, 1.0), 5.0);
}

// The room as the card's face reflects it: the light, a ceiling and walls, a floor.
vec3 room(vec3 d) {
  vec3 bx = normalize(cross(vec3(0.0, 1.0, 0.0), KEY));
  vec3 by = cross(KEY, bx);
  float z = dot(d, KEY);
  vec3 c;
  if (uNight > 0.5) {
    c = mix(vec3(0.010, 0.009, 0.008), vec3(0.045, 0.038, 0.030), smoothstep(-0.4, 0.9, d.y));
    if (z > 0.0) {
      // The lamp's open shade, a little below the light's line.
      vec2 q = vec2(dot(d, bx), dot(d, by) + 0.12) / z;
      float r = length(q * vec2(1.0, 1.4));
      c += vec3(7.0, 5.0, 3.1) * (1.0 - smoothstep(0.08, 0.26, r));
      c += vec3(0.30, 0.20, 0.12) * exp(-r * r * 9.0);
    }
  } else {
    c = mix(vec3(0.16, 0.155, 0.15), vec3(0.62, 0.62, 0.62), smoothstep(-0.5, 0.8, d.y));
    if (z > 0.0) {
      vec2 q = vec2(dot(d, bx), dot(d, by)) / z;
      // A diffuser's light falls away towards its edges.
      vec2 e = abs(q) - vec2(0.2, 0.44);
      float box = 1.0 - smoothstep(-0.14, 0.12, max(e.x, e.y));
      c += vec3(3.6, 3.5, 3.3) * box;
    }
  }
  return c;
}

// The lamp by night is a bulb in a shade, close enough that its light falls away across the
// card and the wall.
const vec3 LAMP = KEY * 470.0;

// The way to the light from a point, and how much of it arrives there.
vec3 toLight(vec3 p, out float reach) {
  if (uNight > 0.5) {
    vec3 l = LAMP - p;
    float d2 = dot(l, l);
    reach = 470.0 * 470.0 / d2;
    return l * inversesqrt(d2);
  }
  reach = 1.0;
  return KEY;
}

// Light falling on a surface at p facing n, as a colour to multiply it by.
vec3 lightOn(vec3 p, vec3 n) {
  float reach;
  vec3 l = toLight(p, reach);
  float k = max(dot(n, l), 0.0) * reach;
  return uNight > 0.5
    ? vec3(0.045, 0.04, 0.036) + vec3(1.3, 0.96, 0.64) * k
    : vec3(0.42, 0.42, 0.43) + vec3(0.78, 0.76, 0.72) * k;
}

// Lens coordinates are card coordinates with x across the lenses; swapping is its own inverse.
vec3 lensSpace(vec3 p) {
  return uAcross == 1 ? vec3(p.y, p.x, p.z) : p;
}

// The print at a point on it, in lens coordinates: the slice of the picture it belongs to.
vec3 printAt(vec2 pl) {
  float halfA = uAcross == 1 ? HALF.y : HALF.x;
  float cs = cos(uPrint.y);
  float sn = sin(uPrint.y);
  vec2 q = vec2(cs * pl.x + sn * pl.y, -sn * pl.x + cs * pl.y);
  float pitch = P * uPrint.x;
  float x = (q.x + halfA * uPrint.x) / pitch;
  float column = floor(x);
  float n = uPrint.z;
  float f = (1.0 - (x - column) + uPrint.w) * n;
  f = mod(f, n);
  float k = floor(f);
  float fr = f - k;
  // The picture's column for this lens, the same all across its strip.
  float a = (column + 0.5) * P - halfA;
  vec2 uv = uAcross == 1 ? vec2(q.y, a) : vec2(a, q.y);
  vec2 tc = clamp(vec2(uv.x / (2.0 * HALF.x) + 0.5, 0.5 - uv.y / (2.0 * HALF.y)), 0.0, 1.0);
  vec3 c = textureLod(uFrames, vec3(tc, k), uLod).rgb;
  // Ink spreads a few thousandths of a millimetre either side of each slice's edge.
  float g = clamp(0.006 * n / P, 0.0, 0.5);
  if (fr < g) {
    vec3 o = textureLod(uFrames, vec3(tc, mod(k - 1.0 + n, n)), uLod).rgb;
    c = mix(o, c, 0.5 + 0.5 * fr / g);
  } else if (fr > 1.0 - g) {
    vec3 o = textureLod(uFrames, vec3(tc, mod(k + 1.0, n)), uLod).rgb;
    c = mix(o, c, 0.5 + 0.5 * (1.0 - fr) / g);
  }
  return c;
}

// The first lens the ray meets, from a start at or above the crests. Each lens is a cylinder
// along y; the ray can only go on into the lens it's over or the next one along.
bool hitLens(vec3 o, vec3 d, out float s, out vec3 n) {
  float halfA = uAcross == 1 ? HALF.y : HALF.x;
  float s0 = o.z > T ? (T - o.z) / d.z : 0.0;
  float a0 = o.x + d.x * s0;
  float i0 = floor((a0 + halfA) / P);
  float dir = d.x >= 0.0 ? 1.0 : -1.0;
  vec3 p0 = o + d * s0;
  for (int j = 0; j < 3; j++) {
    float ac = (i0 + float(j) * dir + 0.5) * P - halfA;
    vec2 oc = vec2(p0.x - ac, p0.z - (T - RL));
    float A = d.x * d.x + d.z * d.z;
    float B = oc.x * d.x + oc.y * d.z;
    float C = dot(oc, oc) - RL * RL;
    float disc = B * B - A * C;
    if (disc < 0.0) continue;
    float t1 = (-B - sqrt(disc)) / A;
    if (t1 < -1e-6) continue;
    float hx = oc.x + t1 * d.x;
    if (abs(hx) > 0.5 * P + 1e-6) continue;
    s = s0 + t1;
    n = vec3(hx, 0.0, oc.y + t1 * d.z) / RL;
    return true;
  }
  return false;
}

// The nearest water cap the ray meets, in lens coordinates.
bool hitDrop(vec3 o, vec3 d, out float s, out vec3 n) {
  s = 1e9;
  bool hit = false;
  for (int i = 0; i < ${MAX_DROPS}; i++) {
    if (i >= uDropCount) break;
    vec4 drop = uDrops[i];
    // Footprint radius across the grooves and contact angle give the cap's sphere.
    float r = drop.z;
    float th = drop.w;
    float rs = r / sin(th);
    float h = rs * (1.0 - cos(th));
    vec3 c = vec3(lensSpace(vec3(drop.xy, 0.0)).xy, T + h - rs);
    c.y /= WICK;
    vec3 os = vec3(o.x, o.y / WICK, o.z) - c;
    vec3 ds = vec3(d.x, d.y / WICK, d.z);
    float A = dot(ds, ds);
    float B = dot(os, ds);
    float C = dot(os, os) - rs * rs;
    float disc = B * B - A * C;
    if (disc < 0.0) continue;
    float t1 = (-B - sqrt(disc)) / A;
    if (t1 < 0.0 || t1 >= s) continue;
    vec3 p = os + ds * t1;
    if (p.z + c.z < T) continue;
    s = t1;
    n = normalize(vec3(p.x, p.y / WICK, p.z));
    hit = true;
  }
  return hit;
}

// A faint ring of what was in the water, where a drop's edge dried.
float stain(vec2 uv) {
  float a = 0.0;
  for (int i = 0; i < ${MAX_RINGS}; i++) {
    if (i >= uRingCount) break;
    vec4 ring = uRings[i];
    vec2 q = uv - ring.xy;
    if (uAcross == 1) q.x /= WICK;
    else q.y /= WICK;
    float e = (length(q) - ring.z) / 0.09;
    a += ring.w * exp(-e * e) + ring.w * 0.18 * smoothstep(0.0, -2.0, e);
  }
  return clamp(a, 0.0, 1.0);
}

vec3 wall(vec3 ro, vec3 rd) {
  float s = (WALL - ro.z) / rd.z;
  vec3 p = ro + rd * s;
  // The card's shadow: where the line to the light passes through it, softened by the light's
  // size over the distance to the card.
  float reach;
  vec3 l = toLight(p, reach);
  vec3 pl = transpose(uCard) * p;
  vec3 ll = transpose(uCard) * l;
  float t = -pl.z / ll.z;
  vec2 q = pl.xy + ll.xy * t;
  float pen = 2.0 + t * (uNight > 0.5 ? 0.12 : 0.32);
  float lit = smoothstep(-pen, pen, sdRoundRect(q, HALF, CORNER));
  vec3 base = uNight > 0.5 ? vec3(0.2, 0.19, 0.18) : vec3(0.60, 0.585, 0.56);
  float k = max(l.z, 0.0) * reach;
  if (uNight > 0.5) {
    // The shade throws a pool: light past its rim is cut off.
    float shade = smoothstep(0.93, 0.985, dot(-l, normalize(vec3(20.0, 10.0, -40.0) - LAMP)));
    return base * (vec3(0.03) + vec3(1.3, 0.96, 0.64) * k * shade * mix(0.04, 1.0, lit));
  }
  return base * (vec3(0.42) + vec3(0.78, 0.76, 0.72) * k * mix(0.25, 1.0, lit));
}

vec3 trace(vec3 ro, vec3 rd) {
  vec3 o = transpose(uCard) * ro;
  vec3 d = transpose(uCard) * rd;
  if (d.z >= -1e-4) return wall(ro, rd);
  // Bring the ray to just above the card first, so the lens maths works in small numbers.
  float lift = T + 6.0;
  o += d * ((lift - o.z) / d.z);
  vec3 top = o + d * ((T - o.z) / d.z);
  if (sdRoundRect(top.xy, HALF, CORNER) > 0.0) return wall(ro, rd);

  vec3 ol = lensSpace(o);
  vec3 dl = lensSpace(d);
  vec3 face = uCard[2];
  vec3 light = lightOn(uCard * top, face);

  if (uBare == 1) {
    // The print with nothing over it.
    vec3 p = ol + dl * (-ol.z / dl.z);
    vec3 c = printAt(p.xy) * light;
    float f = fresnel(-d.z, 1.0, 1.5);
    return mix(c, room(reflect(rd, face)), f * 0.6);
  }

  vec3 c = vec3(0.0);
  float through = 1.0;
  float outside = 1.0;
  float sd;
  vec3 nd;
  if (hitDrop(ol, dl, sd, nd)) {
    vec3 p = ol + dl * sd;
    float cosI = -dot(dl, nd);
    float fr = fresnel(cosI, 1.0, NW);
    vec3 nw = uCard * lensSpace(nd);
    // A drop's dome is smooth, so it shows the light as one small, sharp window. Water only
    // reflects a fiftieth of it, so the light is turned up to something like its true
    // brightness against the room for this.
    vec3 seen = room(reflect(rd, nw));
    c += fr * min(seen + max(seen - 0.7, 0.0) * 14.0, vec3(60.0));
    through = 1.0 - fr;
    vec3 inside = refract(dl, nd, 1.0 / NW);
    if (dot(inside, inside) < 0.5 || inside.z >= 0.0) return c;
    ol = p;
    dl = inside;
    outside = NW;
  }

  float sl;
  vec3 nl;
  if (!hitLens(ol, dl, sl, nl)) {
    // A ray that slips past every lens: the plane of the crests will do.
    sl = (T - ol.z) / dl.z;
    nl = vec3(0.0, 0.0, 1.0);
  }
  vec3 p = ol + dl * sl;
  float cosI = -dot(dl, nl);
  float fr = fresnel(cosI, outside, NL);
  if (outside < 1.01) {
    vec3 nw = uCard * lensSpace(nl);
    c += through * fr * min(room(reflect(rd, nw)), vec3(4.0));
  }
  vec3 inside = refract(dl, nl, outside / NL);
  if (dot(inside, inside) < 0.5 || inside.z >= -1e-5) return c;
  vec3 pp = p + inside * (-p.z / inside.z);
  // A touch of haze in the plastic, and the print as lit through it.
  vec3 printed = printAt(pp.xy) * light * 0.94 + light * 0.012;
  c += through * (1.0 - fr) * printed;
  float st = stain(lensSpace(p).xy);
  c = mix(c, light * 0.82, st * 0.55);
  return c;
}

vec3 tonemap(vec3 c) {
  c = c * (2.51 * c + 0.03) / (c * (2.43 * c + 0.59) + 0.14);
  return clamp(c, 0.0, 1.0);
}

void main() {
  P = uLens.x;
  RL = uLens.y;
  T = uLens.z;
  vec2 frag = gl_FragCoord.xy;
  // Inside the loupe, the pixels look at a smaller patch, a little barrelled towards its rim.
  float scale = 1.0;
  vec2 centre = frag;
  float rim = 0.0;
  if (uLoupe.z > 0.0) {
    vec2 q = frag - uLoupe.xy;
    float r = length(q) / uLoupe.z;
    if (r < 1.0) {
      scale = (1.0 + 0.1 * r * r) / uLoupe.w;
      centre = uLoupe.xy + q * scale;
      rim = smoothstep(0.78, 1.0, r);
    }
  }
  // Each pixel's own offset into the sample pattern, from a hash. Whatever error is left is
  // grain, like a print's; a patterned offset leaves a pattern.
  uint seed = pcg(uint(frag.x) * 1973u + uint(frag.y) * 9277u + 12345u);
  float jx = float(seed & 1023u) / 1024.0;
  float jy = float((seed >> 10) & 1023u) / 1024.0;
  vec3 sum = vec3(0.0);
  float n = float(uSamples);
  for (int i = 0; i < 64; i++) {
    if (i >= uSamples) break;
    // An R2 sequence bent into a tent two pixels either side. The lenses are about two pixels
    // apart at arm's length, too fine to see, so they're filtered out rather than left to beat
    // against the pixels.
    vec2 u = fract(vec2(jx, jy) + float(i) * vec2(0.7548777, 0.5698403));
    vec2 t = 2.0 * vec2(
      u.x < 0.5 ? sqrt(2.0 * u.x) - 1.0 : 1.0 - sqrt(2.0 - 2.0 * u.x),
      u.y < 0.5 ? sqrt(2.0 * u.y) - 1.0 : 1.0 - sqrt(2.0 - 2.0 * u.y)
    );
    vec2 px = centre + t * scale;
    vec2 ndc = px / uRes * 2.0 - 1.0;
    vec3 rd = normalize(uFwd + ndc.x * uTan.x * uRight + ndc.y * uTan.y * uUp);
    sum += trace(uEye, rd);
  }
  vec3 c = sum / n;
  c *= 1.0 - 0.45 * rim;
  c = tonemap(c * (uNight > 0.5 ? 1.25 : 1.0));
  outColor = vec4(pow(c, vec3(1.0 / 2.2)), 1.0);
}
`;
