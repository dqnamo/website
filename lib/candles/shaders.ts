// The room is drawn in four steps. SCENE ray traces it in one pass: the wall, the table, the
// brass cups, the candles and their wicks, and the match, each lit by every flame with soft
// shadows, then adds the flames themselves as glowing gas in front of whatever is behind them.
// SMOKE lays the smoke and sparks over that, BLOOM_DOWN and BLOOM_UP spread the brightest light
// into the glow an eye or a lens sees round a flame, and COMPOSITE exposes and tone maps it.
//
// Lengths are centimetres: x to the right, y up from the table top, z away from you.

const HEADER = `#version 300 es
precision highp float;
precision highp int;
`;

export const MAX_HOLDERS = 6;
export const MAX_CANDLES = 16;
export const MAX_FLAMES = 8;

// A triangle that covers the screen, with no vertex data.
export const QUAD = `${HEADER}
const vec2 CORNERS[3] = vec2[3](vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0));
out vec2 vUv;
void main() {
  vec2 p = CORNERS[gl_VertexID];
  vUv = p * 0.5 + 0.5;
  gl_Position = vec4(p, 0.0, 1.0);
}
`;

const NOISE = `
float hash(vec2 p) {
  p = fract(p * vec2(443.897, 441.423));
  p += dot(p, p.yx + 19.19);
  return fract((p.x + p.y) * p.x);
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}
float fbm(vec2 p) {
  float sum = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 4; i++) {
    sum += noise(p) * amp;
    p = p * 2.03 + vec2(17.1, 9.7);
    amp *= 0.5;
  }
  return sum;
}
`;

export const SCENE = `${HEADER}
#define MAX_HOLDERS ${MAX_HOLDERS}
#define MAX_CANDLES ${MAX_CANDLES}
#define MAX_FLAMES ${MAX_FLAMES}
#define PI 3.14159265
#define TAU 6.28318531
#define WALL_Z 24.0
#define TABLE_FRONT -40.0

in vec2 vUv;
out vec4 outColour;

uniform vec3 uEye;
uniform vec3 uFwd;
uniform vec3 uUp;
uniform vec3 uRight;
uniform vec2 uTan;
uniform float uTime;
// The window's light, colour times strength: dusk by day, a little moonlight at night.
uniform vec3 uSky;
// Candlelight that has bounced round the room once: warm, soft, from everywhere.
uniform vec3 uFill;
// How bright the flames are drawn: by day the eye is adjusted to the window, not to them.
uniform float uFlameGain;
uniform float uCandleTop;
uniform float uCupH;
uniform float uWickLen;

uniform int uHolders;
// x, z, cup radius, how far its candles reach from its middle.
uniform vec4 uHolder[MAX_HOLDERS];
uniform int uCandles;
// x, z, radius, glow from the flame above it.
uniform vec4 uCandle[MAX_CANDLES];
// Tied in a bundle, wick heat (-1 while it burns), wick curl, holder.
uniform vec4 uCandleInfo[MAX_CANDLES];
uniform int uFlames;
// Base, height.
uniform vec4 uF0[MAX_FLAMES];
// Half-width, lean, squash, flicker size.
uniform vec4 uF1[MAX_FLAMES];
// Flicker phase, brightness, lift off the wick, blueness.
uniform vec4 uF2[MAX_FLAMES];
// Seed, flare, buffeting, kind (0 a candle, 1 a match).
uniform vec4 uF3[MAX_FLAMES];
// Position and strength of each flame's light; colour and size.
uniform vec4 uLight[MAX_FLAMES];
uniform vec4 uLightCol[MAX_FLAMES];
// The match: its burning point and whether there is one; the way along the stick to the
// fingers and how much wood is left; how long the burnt end is and how bright the burning edge.
uniform vec4 uMatch;
uniform vec4 uMatchDir;
uniform vec4 uMatchAsh;

${NOISE}

struct Hit {
  float t;
  vec3 n;
  float mat;
  int id;
};

// A standing cylinder: side and top.
void cylinder(vec3 ro, vec3 rd, vec2 c, float r, float y0, float y1, float side, float top, int id, inout Hit h) {
  vec2 o = ro.xz - c;
  vec2 d = rd.xz;
  float a = dot(d, d);
  float b = dot(o, d);
  float k = dot(o, o) - r * r;
  float disc = b * b - a * k;
  if (disc < 0.0 || a < 1e-8) return;
  float t = (-b - sqrt(disc)) / a;
  if (t > 0.0 && t < h.t) {
    float y = ro.y + rd.y * t;
    if (y > y0 && y < y1) {
      vec2 q = o + d * t;
      h.t = t;
      h.n = vec3(q.x, 0.0, q.y) / r;
      h.mat = side;
      h.id = id;
      return;
    }
  }
  if (rd.y < 0.0) {
    float tt = (y1 - ro.y) / rd.y;
    vec2 q = o + d * tt;
    if (tt > 0.0 && tt < h.t && dot(q, q) < r * r) {
      h.t = tt;
      h.n = vec3(0.0, 1.0, 0.0);
      h.mat = top;
      h.id = id;
    }
  }
}

// A rod with rounded ends (Inigo Quilez's capsule).
float capsule(vec3 ro, vec3 rd, vec3 pa, vec3 pb, float r) {
  vec3 ba = pb - pa;
  vec3 oa = ro - pa;
  float baba = dot(ba, ba);
  float bard = dot(ba, rd);
  float baoa = dot(ba, oa);
  float rdoa = dot(rd, oa);
  float oaoa = dot(oa, oa);
  float a = baba - bard * bard;
  float b = baba * rdoa - baoa * bard;
  float c = baba * oaoa - baoa * baoa - r * r * baba;
  float h = b * b - a * c;
  if (h >= 0.0) {
    float t = (-b - sqrt(h)) / a;
    float y = baoa + t * bard;
    if (y > 0.0 && y < baba) return t;
    vec3 oc = y <= 0.0 ? oa : ro - pb;
    b = dot(rd, oc);
    c = dot(oc, oc) - r * r;
    h = b * b - c;
    if (h > 0.0) return -b - sqrt(h);
  }
  return -1.0;
}

vec3 capsuleNormal(vec3 p, vec3 a, vec3 b, float r) {
  vec3 ba = b - a;
  vec3 pa = p - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return (pa - h * ba) / r;
}

// The wick of candle i in its own upright plane: a short braid that curls over at the tip.
// Returns the distance along it (0 to 1), or -1 if the point isn't on it.
float wickAt(int i, vec2 q) {
  float v = q.y / uWickLen;
  if (v < 0.0 || v > 1.0) return -1.0;
  float curl = uCandleInfo[i].z;
  float centre = curl * pow(v, 2.2);
  float halfWidth = 0.05 * (1.0 - 0.3 * v);
  return abs(q.x - centre) < halfWidth ? v : -1.0;
}

Hit trace(vec3 ro, vec3 rd) {
  Hit h;
  h.t = 1e5;
  h.n = vec3(0.0, 0.0, -1.0);
  h.mat = 0.0;
  h.id = -1;
  if (rd.z > 0.0) {
    float t = (WALL_Z - ro.z) / rd.z;
    if (t < h.t) {
      h.t = t;
      h.n = vec3(0.0, 0.0, -1.0);
      h.mat = 1.0;
    }
  }
  if (rd.y < 0.0) {
    float t = -ro.y / rd.y;
    vec3 p = ro + rd * t;
    if (t < h.t && p.z < WALL_Z && p.z > TABLE_FRONT) {
      h.t = t;
      h.n = vec3(0.0, 1.0, 0.0);
      h.mat = 2.0;
    }
  }
  for (int i = 0; i < MAX_HOLDERS; i++) {
    if (i >= uHolders) break;
    vec4 c = uHolder[i];
    cylinder(ro, rd, c.xy, c.z, 0.0, uCupH, 3.0, 4.0, i, h);
  }
  for (int i = 0; i < MAX_CANDLES; i++) {
    if (i >= uCandles) break;
    vec4 c = uCandle[i];
    cylinder(ro, rd, c.xy, c.z, uCupH - 0.2, uCandleTop, 5.0, 6.0, i, h);
  }
  for (int i = 0; i < MAX_CANDLES; i++) {
    if (i >= uCandles) break;
    vec4 c = uCandle[i];
    float t = (c.y - ro.z) / rd.z;
    if (t <= 0.0 || t >= h.t) continue;
    vec3 p = ro + rd * t;
    if (wickAt(i, vec2(p.x - c.x, p.y - uCandleTop)) >= 0.0) {
      h.t = t;
      h.n = vec3(0.0, 0.0, -1.0);
      h.mat = 9.0;
      h.id = i;
    }
  }
  if (uMatch.w > 0.5) {
    vec3 front = uMatch.xyz;
    vec3 dir = uMatchDir.xyz;
    float t = capsule(ro, rd, front + dir * 0.06, front + dir * uMatchDir.w, 0.1);
    if (t > 0.0 && t < h.t) {
      h.t = t;
      h.n = capsuleNormal(ro + rd * t, front + dir * 0.06, front + dir * uMatchDir.w, 0.1);
      h.mat = 7.0;
    }
    if (uMatchAsh.x > 0.01) {
      // The burnt end droops a little as it chars.
      vec3 tip = front - dir * uMatchAsh.x + vec3(0.0, -0.18 * uMatchAsh.x, 0.0);
      t = capsule(ro, rd, front, tip, 0.085);
      if (t > 0.0 && t < h.t) {
        h.t = t;
        h.n = capsuleNormal(ro + rd * t, front, tip, 0.085);
        h.mat = 8.0;
      }
    }
  }
  return h;
}

// How much of a light at q reaches p past the cups and candles. Each holder's candles are
// taken together as one standing cylinder, and a light the size of a flame casts soft edges:
// the further the occluder from p, the wider the blur.
float shadow(vec3 p, vec3 q, float size, int skip) {
  float vis = 1.0;
  vec3 dq = q - p;
  vec2 d = dq.xz;
  float dd = dot(d, d);
  if (dd < 1e-6) return 1.0;
  for (int i = 0; i < MAX_HOLDERS; i++) {
    if (i >= uHolders) break;
    if (i == skip) continue;
    vec4 hd = uHolder[i];
    vec2 a = p.xz - hd.xy;
    float tc = clamp(-dot(a, d) / dd, 0.0, 1.0);
    float closest = length(a + d * tc);
    float w = 0.03 + 0.5 * size * tc;
    if (closest > hd.z + w) continue;
    // Where the ray first comes within reach of the candles: it's lowest there.
    float b = dot(a, d);
    float r = hd.w;
    float disc = b * b - dd * (dot(a, a) - r * r);
    float te = disc > 0.0 ? clamp((-b - sqrt(disc)) / dd, 0.0, 1.0) : tc;
    float ye = p.y + dq.y * te;
    float body = (1.0 - smoothstep(r - w, r + w, closest)) * (1.0 - smoothstep(uCandleTop - w, uCandleTop + w, ye));
    disc = b * b - dd * (dot(a, a) - hd.z * hd.z);
    te = disc > 0.0 ? clamp((-b - sqrt(disc)) / dd, 0.0, 1.0) : tc;
    ye = p.y + dq.y * te;
    float cup = (1.0 - smoothstep(hd.z - w, hd.z + w, closest)) * (1.0 - smoothstep(uCupH - w, uCupH + w, ye));
    vis *= 1.0 - max(body, cup);
  }
  return vis;
}

// Light from every flame: diffuse, with wrap for light that wax lets in past its edge, and a
// highlight that widens with the flame's size as seen from p.
vec3 candlelight(vec3 p, vec3 n, vec3 v, vec3 albedo, vec3 f0, float rough, float wrap, int skip) {
  vec3 sum = vec3(0.0);
  float ndv = max(dot(n, v), 0.15);
  for (int k = 0; k < MAX_FLAMES; k++) {
    if (k >= uFlames) break;
    vec4 L = uLight[k];
    if (L.w <= 0.0) continue;
    vec3 dl = L.xyz - p;
    float d2 = max(dot(dl, dl), 0.3);
    vec3 l = dl * inversesqrt(d2);
    float ndl = dot(n, l);
    float diffuse = max((ndl + wrap) / (1.0 + wrap), 0.0);
    if (diffuse <= 0.0) continue;
    float vis = shadow(p + n * 0.02, L.xyz, uLightCol[k].w, skip);
    if (vis <= 0.001) continue;
    vec3 e = uLightCol[k].rgb * (L.w / d2) * vis;
    vec3 hv = normalize(l + v);
    float a = rough * rough;
    a = clamp(a + uLightCol[k].w * 0.5 * inversesqrt(d2), 0.002, 1.0);
    float a2 = a * a;
    float ndh = max(dot(n, hv), 0.0);
    float dn = ndh * ndh * (a2 - 1.0) + 1.0;
    float D = a2 / (PI * dn * dn);
    vec3 F = f0 + (1.0 - f0) * pow(1.0 - max(dot(hv, v), 0.0), 5.0);
    vec3 spec = D * F / (4.0 * ndv);
    sum += e * (albedo / PI * diffuse + spec * max(ndl, 0.0));
  }
  return sum;
}

// The window's light, from up and to the left, brighter on that side of the room.
vec3 windowLight(vec3 p, vec3 n, vec3 albedo) {
  vec3 toWindow = normalize(vec3(-0.8, 0.5, -0.3));
  float facing = 0.45 + 0.55 * max(dot(n, toWindow), 0.0);
  float side = 0.6 + 0.4 * smoothstep(45.0, -45.0, p.x);
  return albedo * (uSky * facing * side + uFill);
}

vec3 shade(Hit h, vec3 ro, vec3 rd) {
  vec3 p = ro + rd * h.t;
  vec3 n = h.n;
  vec3 v = -rd;
  if (h.mat == 0.0) return vec3(0.0);
  if (h.mat == 1.0) {
    // Limewashed plaster, a little uneven.
    float tex = 0.6 * fbm(p.xy * 0.11) + 0.4 * fbm(p.xy * 1.3);
    vec3 albedo = vec3(0.58, 0.52, 0.45) * (0.88 + 0.24 * tex);
    return candlelight(p, n, v, albedo, vec3(0.02), 0.95, 0.0, -1) + windowLight(p, n, albedo);
  }
  if (h.mat == 2.0) {
    // Oiled oak boards running across, the grain along them.
    float row = (p.z + 60.0) / 12.5;
    float board = floor(row);
    float seam = smoothstep(0.0, 0.012, fract(row)) * smoothstep(1.0, 0.988, fract(row));
    float grain = fbm(vec2(p.x * 0.035 + board * 13.7, p.z * 1.8 + board));
    float figure = 0.5 + 0.5 * sin(p.z * 2.6 + grain * 7.0 + board * 2.1);
    vec3 albedo = mix(vec3(0.17, 0.095, 0.05), vec3(0.34, 0.2, 0.1), 0.65 * grain + 0.35 * figure);
    albedo *= 0.55 + 0.45 * seam;
    float rough = 0.34 + 0.1 * grain;
    return candlelight(p, n, v, albedo, vec3(0.04), rough, 0.0, -1) + windowLight(p, n, albedo);
  }
  if (h.mat == 3.0 || h.mat == 4.0) {
    // A brass cup, rubbed bright in places and dull in others.
    vec2 around = p.xz - uHolder[h.id].xy;
    float worn = fbm(vec2(atan(around.y, around.x + 1e-5) * 3.0, p.y * 4.0) + p.xz);
    vec3 brass = vec3(0.86, 0.64, 0.34) * (0.7 + 0.3 * worn);
    float rough = 0.22 + 0.25 * worn;
    vec3 c = candlelight(p, n, v, vec3(0.0), brass, rough, 0.0, -1);
    // What the metal reflects of the dim room, brighter where it faces up and away.
    vec3 r = reflect(-v, n);
    float up = 0.5 + 0.5 * r.y;
    // Facing you, it reflects the dark room behind you; turned up, the lit ceiling.
    float facing = max(dot(n, v), 0.0);
    c += brass * (uFill * (0.3 + 0.9 * up) + uSky * (0.04 + 0.22 * up)) * (1.0 - 0.6 * facing);
    return c;
  }
  if (h.mat == 5.0 || h.mat == 6.0) {
    vec4 cd = uCandle[h.id];
    vec4 info = uCandleInfo[h.id];
    vec3 wax = vec3(0.93, 0.88, 0.78);
    vec3 warm = vec3(1.0, 0.55, 0.22);
    if (h.mat == 6.0) {
      // The top: a pool of molten wax round the wick, clear and glossy, lit from inside.
      float rr = length(p.xz - cd.xy) / cd.z;
      float pool = (1.0 - smoothstep(0.62, 0.8, rr)) * step(0.01, cd.w);
      vec3 c = candlelight(p, n, v, wax, vec3(0.03), mix(0.5, 0.06, pool), 0.3, int(info.w));
      c += windowLight(p, n, wax);
      c += warm * cd.w * (0.8 + 1.4 * pool) * uFlameGain;
      return c;
    }
    // Twine round a bundle, and wax runs from the rim.
    vec2 around = p.xz - cd.xy;
    float ang = atan(around.y, around.x + 1e-5);
    float band = info.x * step(6.0, p.y) * step(p.y, 6.7);
    vec3 twine = vec3(0.42, 0.3, 0.17) * (0.7 + 0.3 * sin(ang * 14.0 + p.y * 40.0));
    float run = smoothstep(0.55, 0.85, noise(vec2(ang * 3.0 + float(h.id) * 5.3, 0.5)));
    float runLength = 0.6 + 2.2 * noise(vec2(ang * 3.0, float(h.id)));
    float drip = run * smoothstep(uCandleTop - runLength - 0.3, uCandleTop - runLength, p.y);
    vec3 albedo = mix(wax * (1.0 + 0.04 * drip), twine, band);
    vec3 c = candlelight(p, n, v, albedo, vec3(0.03), 0.5 - 0.2 * drip, 0.6 * (1.0 - band), -1);
    c += windowLight(p, n, albedo);
    // Light from the flame scatters down through the wax and out of its sides near the top.
    float depth = uCandleTop - p.y;
    c += warm * cd.w * exp(-depth / (0.8 + 0.4 * drip)) * 0.7 * uFlameGain * (1.0 - band);
    return c;
  }
  if (h.mat == 7.0) {
    // The match's pale wood, scorched towards the flame.
    float along = dot(p - uMatch.xyz, uMatchDir.xyz);
    float scorch = smoothstep(0.9, 0.0, along);
    vec3 albedo = mix(vec3(0.82, 0.66, 0.43), vec3(0.08, 0.04, 0.02), scorch);
    vec3 c = candlelight(p, n, v, albedo, vec3(0.03), 0.6, 0.0, -1) + windowLight(p, n, albedo);
    c += vec3(1.0, 0.35, 0.08) * uMatchAsh.y * smoothstep(0.25, 0.0, along) * 3.0;
    return c;
  }
  if (h.mat == 8.0) {
    // The burnt end: charcoal, still glowing where it's burning.
    float along = length(p - uMatch.xyz);
    vec3 c = candlelight(p, n, v, vec3(0.05, 0.045, 0.04), vec3(0.03), 0.7, 0.0, -1);
    c += vec3(1.0, 0.3, 0.06) * uMatchAsh.y * smoothstep(0.5, 0.0, along) * 2.0;
    return c;
  }
  if (h.mat == 9.0) {
    vec4 cd = uCandle[h.id];
    vec4 info = uCandleInfo[h.id];
    float along = (p.y - uCandleTop) / uWickLen;
    vec3 c = candlelight(p, n, v, vec3(0.03), vec3(0.02), 0.8, 0.5, -1);
    if (info.y < 0.0) {
      // Alight, the tip pokes out into the hottest part of the flame and glows.
      c += vec3(1.0, 0.42, 0.12) * smoothstep(0.72, 1.0, along) * 5.0 * uFlameGain;
      c += vec3(0.25, 0.08, 0.02) * along;
    } else {
      // Out, it smoulders from the tip down as it cools.
      float heat = info.y;
      float flick = 0.75 + 0.25 * noise(vec2(uTime * 9.0, float(h.id) * 7.0));
      c += vec3(1.0, 0.24, 0.04) * heat * heat * smoothstep(0.35 * (1.0 - heat), 1.0, along) * 7.0 * flick;
    }
    return c;
  }
  return vec3(0.0);
}

// One flame, seen in the upright plane through its base: q is the point in that plane (cm)
// from the base. The flame is a teardrop, widest a third of the way up: a blue cup at the
// bottom, a dark core of wax vapour round the wick that hasn't burnt yet, and the yellow of
// soot glowing hot, oranger towards the edges and tip. A flickering flame stretches through
// each beat, its waist pinching until the tip breaks off and floats up, burning out.
vec3 flame(int k, vec2 q) {
  vec4 f0 = uF0[k];
  vec4 f1 = uF1[k];
  vec4 f2 = uF2[k];
  vec4 f3 = uF3[k];
  float bright = f2.y;
  if (bright <= 0.0) return vec3(0.0);
  float H = f0.w;
  float R = f1.x;
  float lean = f1.y;
  float squash = f1.z;
  float a = clamp(f1.w, 0.0, 1.0);
  float g = fract(f2.x / TAU);
  float lift = f2.z;
  float blue = f2.w;
  float seed = f3.x;
  float flare = f3.y;
  float buffet = f3.z;
  bool match = f3.w > 0.5;

  float stretch = 0.62 + 0.83 * smoothstep(0.0, 0.85, g);
  float Hk = H * mix(1.0, stretch, a) * squash;
  float v = q.y - lift;
  float s = v / Hk;
  if (s < -0.2 || s > 3.2) return vec3(0.0);
  float wob = (noise(vec2(s * 2.2 - uTime * 6.5, seed * 31.0)) - 0.5) * R * (0.3 + 2.4 * buffet + 0.5 * a) * s * s;
  float centre = lean * Hk * s * s + wob;
  float x = q.x - centre;

  vec3 core = match ? vec3(1.0, 0.76, 0.42) : vec3(1.0, 0.8, 0.46);
  vec3 edge = match ? vec3(1.0, 0.4, 0.08) : vec3(1.0, 0.44, 0.1);
  core = mix(core, vec3(1.0, 0.95, 0.85), flare);
  vec3 e = vec3(0.0);

  if (s > 0.0 && s < 1.0) {
    float prof = sqrt(s) * pow(1.0 - s, 1.1) / 0.37;
    float pinch = a * a * smoothstep(0.7, 1.0, g);
    float neck = (s - 0.56) / 0.1;
    prof *= 1.0 - min(pinch, 0.97) * exp(-neck * neck);
    float r = R * prof;
    float qd = abs(x) / max(r, 1e-4);
    float inside = smoothstep(1.0, 0.7, qd);
    float through = sqrt(max(1.0 - qd * qd, 0.0));
    float lum = smoothstep(0.04, 0.2, s) * (1.0 - 0.4 * smoothstep(0.7, 1.0, s));
    float dark = (1.0 - smoothstep(0.08, 0.36, s)) * (1.0 - smoothstep(0.25, 0.6, qd));
    lum *= (1.0 - 0.93 * dark) * (1.0 - 0.75 * blue);
    vec3 col = mix(edge, core, (1.0 - qd) * (1.0 - smoothstep(0.5, 1.0, s)));
    e += col * lum * inside * mix(0.45, 1.0, through) * (match ? 9.0 : 10.0);
    // A faint blue sheath up the sides.
    float sheath = smoothstep(0.8, 1.0, qd) * smoothstep(1.3, 1.0, qd) * (1.0 - smoothstep(0.6, 0.95, s));
    e += vec3(0.12, 0.2, 0.9) * sheath * 0.3;
  }
  // The blue cup round the base.
  {
    float sb = max(s, 0.0);
    float rb = R * (0.55 + 0.5 * sqrt(sb / 0.25)) * (1.0 + 0.5 * blue);
    float yb = v - (-0.04 * Hk);
    float cup = smoothstep(0.3, 0.0, s) * smoothstep(-0.12, 0.0, s);
    float qd = abs(x) / max(rb, 1e-4);
    float rim = smoothstep(0.35, 0.9, qd) * smoothstep(1.15, 0.9, qd);
    e += vec3(0.16, 0.3, 1.0) * cup * rim * (2.4 + 3.6 * blue) * step(-0.1 * Hk, yb);
  }
  // The tip that broke off at the end of the last beat, rising and burning away.
  if (a > 0.3 && g < 0.45) {
    float k2 = a * a * (1.0 - g / 0.45);
    float yc = H * (1.13 + 1.6 * g) * squash;
    float up = yc / Hk;
    vec2 c = vec2(lean * Hk * up * up, yc + lift);
    float br = R * 0.55 * (1.0 - 0.7 * g / 0.45);
    vec2 d = (q - c) / vec2(br, br * 2.4);
    float m = smoothstep(1.0, 0.3, length(d));
    e += mix(edge, core, 0.35) * m * k2 * 9.0;
  }
  return e * bright * (1.0 + 1.5 * flare) * uFlameGain;
}

void main() {
  vec2 ndc = vUv * 2.0 - 1.0;
  vec3 rd = normalize(uFwd + uRight * ndc.x * uTan.x + uUp * ndc.y * uTan.y);
  vec3 ro = uEye;
  Hit h = trace(ro, rd);
  vec3 c = shade(h, ro, rd);
  for (int k = 0; k < MAX_FLAMES; k++) {
    if (k >= uFlames) break;
    vec3 base = uF0[k].xyz;
    float t = (base.z - ro.z) / rd.z;
    if (t <= 0.0 || t > h.t + 0.05) continue;
    vec3 p = ro + rd * t;
    c += flame(k, p.xy - base.xy);
  }
  // Nothing that isn't a number may reach the blur, which would spread it across the frame.
  if (any(isnan(c)) || any(isinf(c))) c = vec3(0.0);
  outColour = vec4(c, 1.0);
}
`;

// Smoke and sparks as soft round points. Colour arrives premultiplied by opacity.
export const SMOKE_VERTEX = `${HEADER}
layout(location = 0) in vec4 aPos;
layout(location = 1) in vec4 aColour;
uniform vec3 uEye;
uniform vec3 uFwd;
uniform vec3 uUp;
uniform vec3 uRight;
uniform vec2 uTan;
uniform vec2 uRes;
out vec4 vColour;
void main() {
  vec3 rel = aPos.xyz - uEye;
  float depth = dot(rel, uFwd);
  if (depth < 1.0) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    gl_PointSize = 1.0;
    vColour = vec4(0.0);
    return;
  }
  vec2 ndc = vec2(dot(rel, uRight) / (depth * uTan.x), dot(rel, uUp) / (depth * uTan.y));
  gl_Position = vec4(ndc, 0.0, 1.0);
  float px = aPos.w / (depth * uTan.y) * 0.5 * uRes.y;
  // A point can't be drawn smaller than a pixel and a half, so a finer one fades instead.
  float drawn = clamp(px, 1.5, 200.0);
  gl_PointSize = drawn;
  vColour = aColour * min(1.0, (px * px) / (drawn * drawn));
}
`;

export const SMOKE_FRAGMENT = `${HEADER}
in vec4 vColour;
out vec4 outColour;
void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(c, c);
  if (r2 > 1.0) discard;
  float a = (exp(-r2 * 3.0) - 0.05) / 0.95;
  outColour = vColour * max(a, 0.0) * 1.6;
}
`;

// A dual-filter blur: each step down halves the size and softens; each step up doubles it
// back and adds in the level it lands on, so the top level holds every width of glow at once.
export const BLOOM_DOWN = `${HEADER}
in vec2 vUv;
uniform sampler2D uSource;
uniform vec2 uTexel;
out vec4 outColour;
void main() {
  vec4 sum = texture(uSource, vUv) * 4.0;
  sum += texture(uSource, vUv - uTexel);
  sum += texture(uSource, vUv + uTexel);
  sum += texture(uSource, vUv + vec2(uTexel.x, -uTexel.y));
  sum += texture(uSource, vUv - vec2(uTexel.x, -uTexel.y));
  outColour = sum / 8.0;
}
`;

export const BLOOM_UP = `${HEADER}
in vec2 vUv;
uniform sampler2D uSource;
uniform sampler2D uSame;
uniform vec2 uTexel;
out vec4 outColour;
void main() {
  vec2 t = uTexel;
  vec4 sum = texture(uSource, vUv + vec2(-t.x * 2.0, 0.0));
  sum += texture(uSource, vUv + vec2(-t.x, t.y)) * 2.0;
  sum += texture(uSource, vUv + vec2(0.0, t.y * 2.0));
  sum += texture(uSource, vUv + vec2(t.x, t.y)) * 2.0;
  sum += texture(uSource, vUv + vec2(t.x * 2.0, 0.0));
  sum += texture(uSource, vUv + vec2(t.x, -t.y)) * 2.0;
  sum += texture(uSource, vUv + vec2(0.0, -t.y * 2.0));
  sum += texture(uSource, vUv + vec2(-t.x, -t.y)) * 2.0;
  outColour = sum / 12.0 + texture(uSame, vUv);
}
`;

export const COMPOSITE = `${HEADER}
in vec2 vUv;
uniform sampler2D uScene;
uniform sampler2D uBloom;
uniform float uExposure;
uniform float uBloomGain;
uniform float uTime;
out vec4 outColour;

float hash(vec2 p) {
  p = fract(p * vec2(443.897, 441.423));
  p += dot(p, p.yx + 19.19);
  return fract((p.x + p.y) * p.x);
}

// Narkowicz's fit of the ACES film curve: highlights roll off instead of clipping.
vec3 film(vec3 x) {
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}

void main() {
  vec3 c = texture(uScene, vUv).rgb + texture(uBloom, vUv).rgb * uBloomGain;
  c *= uExposure;
  vec2 q = vUv - 0.5;
  c *= 1.0 - 0.9 * dot(q, q);
  c = film(c);
  c = pow(c, vec3(1.0 / 2.2));
  c += (hash(gl_FragCoord.xy + fract(uTime) * 91.0) - 0.5) / 255.0;
  outColour = vec4(c, 1.0);
}
`;
