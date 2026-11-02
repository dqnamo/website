// The harmonograph's three GPU programs. Ink lives in two textures over the sheet, wet and dry,
// each holding the optical density of its ink in red, green and blue. The wet one keeps how much
// liquid there is in alpha; the dry one keeps iron gall's unoxidised salt there.
//
// - splat lays down what the pen leaves in one short stretch of its path: a round dab for a
//   fibre or ball tip, a short edge for a broad nib, each holding a known amount of ink.
// - step moves wet ink through the paper, sinks some of it into the fibres for good and lets
//   iron gall blacken.
// - scene draws the table, board, card, linkage and pen from above, through a camera close
//   enough that tall things lean outwards, and shades the card with the ink on it.

export const FULL_VS = `#version 300 es
in vec2 aPos;
void main() {
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

export const SPLAT_VS = `#version 300 es
precision highp float;
layout(location = 0) in vec2 aCorner;
// Centre (texels) and the direction of the tip's long axis.
layout(location = 1) in vec4 iPlace;
// Half-length along the axis and width across it (texels), round (0) or edge (1), dryness.
layout(location = 2) in vec4 iShape;
layout(location = 3) in vec4 iWet;
layout(location = 4) in vec4 iDry;
uniform float uSize;
out vec2 vLocal;
out vec2 vTex;
flat out vec4 vShape;
flat out vec4 vWet;
flat out vec4 vDry;
void main() {
  vec2 axis = iPlace.zw;
  vec2 across = vec2(-axis.y, axis.x);
  vec2 extent = iShape.z > 0.5
    ? vec2(iShape.x + 1.5, 3.0 * iShape.y + 1.0)
    : vec2(iShape.y + 1.5);
  vec2 local = aCorner * extent;
  vec2 pos = iPlace.xy + axis * local.x + across * local.y;
  vLocal = local;
  vTex = pos / uSize;
  vShape = iShape;
  vWet = iWet;
  vDry = iDry;
  gl_Position = vec4(pos / uSize * 2.0 - 1.0, 0.0, 1.0);
}`;

// Each footprint integrates to one, so a splat adds exactly the ink it carries. A nearly dry
// pen only touches the tops of the paper's tooth.
export const SPLAT_FS = `#version 300 es
precision highp float;
in vec2 vLocal;
in vec2 vTex;
flat in vec4 vShape;
flat in vec4 vWet;
flat in vec4 vDry;
uniform sampler2D uPaper;
layout(location = 0) out vec4 oWet;
layout(location = 1) out vec4 oDry;
void main() {
  float w;
  if (vShape.z > 0.5) {
    float a = max(vShape.x, 0.5);
    float s = max(vShape.y, 0.45);
    float along = clamp(a + 0.5 - abs(vLocal.x), 0.0, 1.0) / (2.0 * a);
    float across = exp(-vLocal.y * vLocal.y / (2.0 * s * s)) / (s * 2.5066);
    w = along * across;
  } else {
    float r = max(vShape.y, 0.6);
    w = clamp(r + 0.5 - length(vLocal), 0.0, 1.0) / (3.14159 * r * r + 0.26);
  }
  if (vShape.w > 0.0) {
    float tooth = texture(uPaper, vTex).r;
    w *= smoothstep(vShape.w - 0.12, vShape.w + 0.12, tooth);
  }
  oWet = vWet * w;
  oDry = vDry * w;
}`;

// Wet ink flows down the gradient of wetness, faster the wetter the paper between two texels
// (so a thin film barely moves and a puddle runs), and faster still along a fibre. The dye goes
// where the liquid goes, taken from whichever side it flows out of, so none is made or lost.
export const STEP_FS = `#version 300 es
precision highp float;
uniform sampler2D uWet;
uniform sampler2D uDry;
uniform sampler2D uPaper;
uniform float uFlow;
uniform float uFeather;
uniform float uPower;
uniform float uFix;
uniform float uOx;
uniform vec3 uBlack;
layout(location = 0) out vec4 oWet;
layout(location = 1) out vec4 oDry;
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  ivec2 last = textureSize(uWet, 0) - 1;
  vec4 c = texelFetch(uWet, p, 0);
  vec4 d = texelFetch(uDry, p, 0);
  vec4 acc = vec4(0.0);
  float fc = texelFetch(uPaper, p, 0).g;
  for (int i = 0; i < 4; i++) {
    ivec2 o = i == 0 ? ivec2(1, 0) : i == 1 ? ivec2(-1, 0) : i == 2 ? ivec2(0, 1) : ivec2(0, -1);
    ivec2 q = clamp(p + o, ivec2(0), last);
    vec4 b = texelFetch(uWet, q, 0);
    float fb = texelFetch(uPaper, q, 0).g;
    float wm = 0.5 * (c.a + b.a);
    float fibre = 1.0 - uFeather + uFeather * 2.2 * (fc + fb);
    float k = min(uFlow * pow(wm, uPower) * fibre, 0.12);
    float flux = k * (b.a - c.a);
    vec3 conc = flux > 0.0 ? b.rgb / max(b.a, 1e-4) : c.rgb / max(c.a, 1e-4);
    acc += vec4(min(conc, vec3(4.0)) * flux, flux);
  }
  vec4 wet = max(c + acc, 0.0);
  // Some of the liquid sinks in or dries each step, fixing its dye where it is. A thin line
  // goes in the time the paper is known for; a puddle takes longer.
  float f = clamp(uFix * 0.65 / (0.35 + wet.a), 0.0, 1.0);
  vec3 sunk = wet.rgb * f;
  wet.rgb -= sunk;
  wet.a *= 1.0 - f;
  d.rgb += sunk;
  if (wet.a < 2e-4) {
    d.rgb += wet.rgb;
    wet = vec4(0.0);
  }
  float ox = d.a * uOx;
  d.a -= ox;
  d.rgb += uBlack * ox;
  oWet = wet;
  oDry = d;
}`;

export const SCENE_FS = `#version 300 es
precision highp float;
precision highp sampler2D;
out vec4 outColor;

uniform vec2 uRes;
uniform vec2 uCam;
uniform float uScale;
uniform float uCamH;
uniform vec2 uTable;
uniform vec2 uPen;
uniform float uLift;
uniform vec2 uTopA;
uniform vec2 uBaseA;
uniform vec2 uSlotA;
uniform vec2 uTopB;
uniform vec2 uBaseB;
uniform vec2 uSlotB;
uniform float uNight;
uniform vec3 uPaperCol;
uniform float uTooth;
uniform vec3 uCap;
uniform int uPenKind;
uniform float uExport;
uniform float uInkN;
uniform sampler2D uWet;
uniform sampler2D uDry;
uniform sampler2D uPaper;

const float BOARD = 122.0;
const float PAPER = 100.0;
const float Z_BOARD = 16.0;
const float Z_PAPER = 16.3;
const float Z_ARM = 66.0;
const float PEN_LEN = 132.0;
const float PEN_R = 4.6;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x),
             mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    s += a * vnoise(p);
    p = p * 2.03 + 17.1;
    a *= 0.5;
  }
  return s;
}
float sdBox(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}
float sdSeg(vec2 p, vec2 a, vec2 b, out float h) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
  return length(pa - ba * h);
}
vec3 lin(vec3 c) { return pow(c, vec3(2.2)); }

// Where something at height z over the point q appears, as a point on the table's plane, and
// the other way round: what lies at height z under a point seen on the table's plane.
vec2 proj(vec2 q, float z) { return uCam + (q - uCam) * uCamH / (uCamH - z); }
vec2 at(vec2 w, float z) { return uCam + (w - uCam) * (uCamH - z) / uCamH; }
float grow(float z) { return uCamH / (uCamH - z); }

vec3 lightDir() {
  return normalize(mix(vec3(-0.52, -0.66, 1.0), vec3(-0.6, -0.46, 0.8), uNight));
}
// Daylight from a window, or a lamp off to the upper left that leaves the far corner dim.
vec3 lightAt(vec2 p) {
  vec3 day = vec3(1.0, 0.985, 0.955);
  vec2 lamp = vec2(-180.0, -220.0);
  float pool = 1.0 / (1.0 + dot(p - lamp, p - lamp) / (260.0 * 260.0));
  vec3 night = vec3(1.0, 0.8, 0.58) * (0.3 + 1.5 * pool);
  return mix(day, night, uNight);
}
float ambient() { return mix(0.46, 0.13, uNight); }

float occ(float d, float pen) { return 1.0 - smoothstep(-pen, pen, d); }

// How much of the light the machine keeps off a point at height zr.
float shadowAt(vec2 p, float zr, vec3 L) {
  vec2 sh = L.xy / L.z;
  float soft = mix(0.026, 0.017, uNight);
  float o = 0.0;
  float h;
  if (zr < 1.0) {
    float d1 = sdBox(p + sh * Z_BOARD - uTable, vec2(BOARD), 6.0);
    float d2 = sdBox(p + sh * 6.0 - uTable, vec2(BOARD), 6.0);
    o = max(o, occ(min(d1, d2), 0.8 + Z_BOARD * soft * 1.6) * 0.85);
    float r1 = sdSeg(p, uBaseA, uTopA - sh * Z_ARM, h) - 3.0;
    float r2 = sdSeg(p, uBaseB, uTopB - sh * Z_ARM, h) - 3.0;
    o = max(o, occ(min(r1, r2), 0.5 + Z_ARM * soft * h) * 0.8);
  } else {
    // The drawing pins' heads stand just proud of the card.
    vec2 q = abs(p + sh * 1.6 - uTable) - vec2(PAPER - 7.0);
    o = max(o, occ(length(q) - 4.2, 0.5) * 0.45);
  }
  {
    float dz = Z_ARM - zr;
    vec2 q = p + sh * dz;
    float d = min(sdSeg(q, uTopA, uPen, h), sdSeg(q, uTopB, uPen, h)) - 3.3;
    d = min(d, length(q - uPen) - 8.6);
    d = min(d, min(length(q - uTopA), length(q - uTopB)) - 7.5);
    o = max(o, occ(d, 0.5 + dz * soft) * 0.88);
  }
  {
    float zt = Z_PAPER + uLift;
    vec2 e0 = uPen - sh * (zt - zr);
    vec2 e1 = uPen - sh * (zt + PEN_LEN - zr);
    float d = sdSeg(p, e0, e1, h) - mix(0.5, PEN_R, smoothstep(0.0, 0.1, h));
    float dz = zt + PEN_LEN * h - zr;
    o = max(o, occ(d, 0.35 + dz * soft) * 0.9);
  }
  return o;
}

vec3 woodTable(vec2 p) {
  float row = floor((p.y + 2000.0) / 150.0);
  vec2 q = p + vec2(hash12(vec2(row, 3.0)) * 700.0, 0.0);
  float n = fbm(vec2(q.x * 0.004, q.y * 0.03 + row * 7.0));
  float ring = 0.5 + 0.5 * sin((q.y * 0.07 + n * 7.0) * 6.2831);
  ring = pow(ring, 2.5);
  float streak = vnoise(vec2(q.x * 0.012, q.y * 0.8));
  vec3 a = mix(vec3(0.76, 0.6, 0.42), vec3(0.4, 0.26, 0.16), uNight);
  vec3 b = mix(vec3(0.61, 0.45, 0.29), vec3(0.25, 0.15, 0.09), uNight);
  vec3 c = mix(a, b, clamp(ring * 0.55 + streak * 0.3 + (n - 0.5) * 0.4, 0.0, 1.0));
  float fy = fract((p.y + 2000.0) / 150.0) * 150.0;
  float seam = min(fy, 150.0 - fy);
  c *= 1.0 - 0.45 * (1.0 - smoothstep(0.0, 0.8, seam));
  return lin(c);
}

vec3 woodBoard(vec2 p) {
  float n = fbm(vec2(p.x * 0.03, p.y * 0.004));
  float g = 0.5 + 0.5 * sin((p.x * 0.05 + n * 6.0) * 6.2831);
  vec3 c = mix(vec3(0.88, 0.8, 0.66), vec3(0.79, 0.68, 0.52), g * 0.45 + n * 0.35);
  return lin(c);
}

vec4 inkTap(sampler2D t, vec2 q) {
  q -= 0.5;
  ivec2 i = ivec2(floor(q));
  vec2 f = fract(q);
  ivec2 n = ivec2(int(uInkN) - 1);
  vec4 a = texelFetch(t, clamp(i, ivec2(0), n), 0);
  vec4 b = texelFetch(t, clamp(i + ivec2(1, 0), ivec2(0), n), 0);
  vec4 c = texelFetch(t, clamp(i + ivec2(0, 1), ivec2(0), n), 0);
  vec4 d = texelFetch(t, clamp(i + ivec2(1, 1), ivec2(0), n), 0);
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

// The card at a point in its own millimetres: its colour with the ink on it, in linear light,
// before lighting, plus how wet it is there.
vec4 card(vec2 pp, float texelsPerPx, out vec3 wetNormal) {
  vec2 q = (pp + PAPER) / (2.0 * PAPER);
  vec3 tex = texture(uPaper, q).rgb;
  vec3 col = lin(uPaperCol) * (0.97 + 0.06 * tex.b);
  vec2 tq = q * uInkN;
  vec3 absorb = vec3(0.0);
  float water = 0.0;
  // Where the card is drawn smaller than the ink texture, four taps keep fine lines from
  // breaking up.
  if (texelsPerPx > 1.2) {
    float o = 0.25 * texelsPerPx;
    for (int i = 0; i < 4; i++) {
      vec2 off = vec2(i == 0 || i == 2 ? -o : o, i < 2 ? -o : o);
      vec4 dr = inkTap(uDry, tq + off);
      vec4 we = inkTap(uWet, tq + off);
      absorb += dr.rgb + we.rgb * 1.12;
      water += we.a;
    }
    absorb *= 0.25;
    water *= 0.25;
  } else {
    vec4 dr = inkTap(uDry, tq);
    vec4 we = inkTap(uWet, tq);
    absorb = dr.rgb + we.rgb * 1.12;
    water = we.a;
  }
  float wx = inkTap(uWet, tq + vec2(1.0, 0.0)).a - inkTap(uWet, tq - vec2(1.0, 0.0)).a;
  float wy = inkTap(uWet, tq + vec2(0.0, 1.0)).a - inkTap(uWet, tq - vec2(0.0, 1.0)).a;
  wetNormal = normalize(vec3(-wx * 2.5, -wy * 2.5, 1.0));
  col *= exp(-absorb);
  return vec4(col, water);
}

// A cylinder seen side on: how much its surface at a fraction u across faces the light.
float cylinder(float u, vec2 axis, vec3 L) {
  vec2 side = vec2(-axis.y, axis.x);
  vec3 n = normalize(vec3(side * u, sqrt(max(1.0 - u * u, 0.0))));
  return max(dot(n, L), 0.0);
}

vec3 metal(vec3 base, float lambert, vec3 n, vec3 L, vec3 light) {
  vec3 hv = normalize(L + vec3(0.0, 0.0, 1.0));
  float spec = pow(max(dot(n, hv), 0.0), 40.0);
  return base * light * (ambient() * 1.3 + lambert * 0.8) + light * spec * 0.9;
}

void main() {
  vec2 frag = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  float dither = (hash12(frag) - 0.5) / 255.0;

  if (uExport > 0.5) {
    vec2 pp = frag / uRes * (2.0 * PAPER) - PAPER;
    vec3 n;
    vec4 c = card(pp, uInkN / uRes.x, n);
    outColor = vec4(pow(c.rgb, vec3(1.0 / 2.2)) + dither, 1.0);
    return;
  }

  vec2 w0 = uCam + (frag - 0.5 * uRes) / uScale;
  float px = 1.0 / uScale;
  vec3 L = lightDir();
  float h;

  // The table, with the slots the pendulum rods come up through.
  vec3 light = lightAt(w0);
  vec3 col = woodTable(w0);
  float zr = 0.0;
  float slotA = sdBox(w0 - uSlotA, vec2(70.0, 6.0), 6.0);
  float slotB = sdBox(w0 - uSlotB, vec2(6.0, 70.0), 6.0);
  float slot = min(slotA, slotB);
  float shade = 1.0 - shadowAt(w0, 0.0, L);
  // A little occlusion where the board hangs over the table.
  float under = sdBox(w0 - uTable, vec2(BOARD), 6.0);
  shade *= 0.7 + 0.3 * smoothstep(-2.0, 30.0, under);
  col *= light * (ambient() + L.z * 0.72 * shade);
  col = mix(col, lin(vec3(0.03, 0.025, 0.02)) * light, smoothstep(px, -px, slot) * (0.75 + 0.25 * smoothstep(-6.0, 0.0, slot)));

  // The board on the gimballed pendulum, and the card pinned to it.
  vec2 pb = at(w0, Z_BOARD) - uTable;
  float dBoard = sdBox(pb, vec2(BOARD), 6.0);
  if (dBoard < px) {
    vec3 lb = lightAt(pb + uTable);
    vec2 pp = at(w0, Z_PAPER) - uTable;
    float dPaper = sdBox(pp, vec2(PAPER), 0.4);
    vec3 surf;
    float s = 1.0 - shadowAt(pb + uTable, Z_BOARD, L);
    if (dPaper < 0.0) {
      vec3 wn;
      float tpp = (uInkN / (2.0 * PAPER)) / uScale;
      vec4 c = card(pp, tpp, wn);
      // Raking light picks out the tooth.
      vec2 q = (pp + PAPER) / (2.0 * PAPER);
      float e = max(1.5, tpp) / uInkN;
      float tx = texture(uPaper, q + vec2(e, 0.0)).r - texture(uPaper, q - vec2(e, 0.0)).r;
      float ty = texture(uPaper, q + vec2(0.0, e)).r - texture(uPaper, q - vec2(0.0, e)).r;
      vec3 n = normalize(vec3(-tx * uTooth, -ty * uTooth, 1.0));
      float lam = max(dot(n, L), 0.0);
      surf = c.rgb * lb * (ambient() + 0.74 * lam * s);
      // Wet ink is glossy for as long as it stays wet.
      vec3 hv = normalize(L + vec3(0.0, 0.0, 1.0));
      float spec = pow(max(dot(wn, hv), 0.0), 70.0) * smoothstep(0.03, 0.5, c.a);
      surf += lb * spec * 0.55 * s;
      // The drawing pins.
      vec2 pin = abs(pp) - vec2(PAPER - 7.0);
      float dp = length(pin) - 4.2;
      if (dp < px) {
        vec2 u = pin / 4.2;
        vec3 pn = normalize(vec3(u * sign(pp), sqrt(max(1.0 - dot(u, u), 0.0)) * 1.2));
        vec3 brass = lin(vec3(0.8, 0.64, 0.34));
        vec3 pc = metal(brass, max(dot(pn, L), 0.0), pn, L, lb);
        surf = mix(surf, pc, smoothstep(px, -px, dp));
      }
    } else {
      surf = woodBoard(pb);
      // The card's edge throws a hairline shadow; the board's own edge catches the light.
      float edge = 1.0 - 0.35 * (1.0 - smoothstep(0.0, 1.4, dPaper)) * step(0.0, pp.x + pp.y);
      vec2 g = vec2(sdBox(pb + vec2(0.5, 0.0), vec2(BOARD), 6.0) - sdBox(pb - vec2(0.5, 0.0), vec2(BOARD), 6.0),
                    sdBox(pb + vec2(0.0, 0.5), vec2(BOARD), 6.0) - sdBox(pb - vec2(0.0, 0.5), vec2(BOARD), 6.0));
      float bevel = smoothstep(-3.0, 0.0, dBoard) * dot(normalize(g + 1e-5), -normalize(L.xy));
      surf *= lb * (ambient() + 0.74 * L.z * s * edge) * (1.0 + 0.4 * bevel);
    }
    col = mix(col, surf, smoothstep(px, -px, dBoard));
  }

  // The two pendulum rods, leaning as they swing, and the brass knuckles on top.
  {
    vec2 tA = proj(uTopA, Z_ARM);
    vec2 tB = proj(uTopB, Z_ARM);
    float dA = sdSeg(w0, uBaseA, tA, h) - 3.0 * mix(1.0, grow(Z_ARM), h);
    float hb;
    float dB = sdSeg(w0, uBaseB, tB, hb) - 3.0 * mix(1.0, grow(Z_ARM), hb);
    vec2 axis = dA < dB ? normalize(tA - uBaseA + 1e-4) : normalize(tB - uBaseB + 1e-4);
    float d = min(dA, dB);
    if (d < px) {
      vec2 base = dA < dB ? uBaseA : uBaseB;
      vec2 side = vec2(-axis.y, axis.x);
      vec2 tip = dA < dB ? tA : tB;
      float u = clamp(dot(w0 - mix(base, tip, dA < dB ? h : hb), side) / (3.0 * grow(Z_ARM * 0.5)), -1.0, 1.0);
      vec3 n = normalize(vec3(side * u, sqrt(max(1.0 - u * u, 0.0))));
      vec3 steel = lin(vec3(0.6, 0.62, 0.64));
      col = mix(col, metal(steel, max(dot(n, L), 0.0), n, L, lightAt(w0)), smoothstep(px, -px, d));
    }
  }

  // The arms, from each knuckle to the collar that holds the pen.
  {
    vec2 a = proj(uTopA, Z_ARM);
    vec2 b = proj(uTopB, Z_ARM);
    vec2 c = proj(uPen, Z_ARM);
    float r = 3.3 * grow(Z_ARM);
    float ha;
    float hb;
    float dA = sdSeg(w0, a, c, ha) - r;
    float dB = sdSeg(w0, b, c, hb) - r;
    float d = min(dA, dB);
    if (d < px) {
      vec2 axis = dA < dB ? normalize(c - a) : normalize(c - b);
      vec2 on = dA < dB ? mix(a, c, ha) : mix(b, c, hb);
      vec2 side = vec2(-axis.y, axis.x);
      float u = clamp(dot(w0 - on, side) / r, -1.0, 1.0);
      float lam = cylinder(u, axis, L);
      float along = dot(w0 - on, axis) + (dA < dB ? ha : hb) * 300.0;
      float grain = vnoise(vec2(along * 0.15, u * 3.0));
      vec3 wood = lin(mix(vec3(0.36, 0.22, 0.13), vec3(0.28, 0.17, 0.1), grain));
      vec3 lw = lightAt(w0);
      vec3 hv = normalize(L + vec3(0.0, 0.0, 1.0));
      vec2 side2 = vec2(-axis.y, axis.x);
      vec3 n = normalize(vec3(side2 * u, sqrt(max(1.0 - u * u, 0.0))));
      vec3 ac = wood * lw * (ambient() + 0.8 * lam) + lw * pow(max(dot(n, hv), 0.0), 30.0) * 0.25;
      col = mix(col, ac, smoothstep(px, -px, d));
    }
    // Knuckles over the rods.
    float dk = min(length(w0 - a), length(w0 - b)) - 7.0 * grow(Z_ARM + 3.0);
    if (dk < px) {
      vec2 k = length(w0 - a) < length(w0 - b) ? a : b;
      vec2 u = (w0 - k) / (7.0 * grow(Z_ARM + 3.0));
      vec3 n = normalize(vec3(u, sqrt(max(1.0 - dot(u, u), 0.0)) * 1.6));
      vec3 brass = lin(vec3(0.78, 0.6, 0.3));
      vec3 kc = metal(brass, max(dot(n, L), 0.0), n, L, lightAt(w0));
      kc *= 1.0 - 0.5 * smoothstep(0.18, 0.12, length(u));
      col = mix(col, kc, smoothstep(px, -px, dk));
    }
    // The collar.
    float dc = length(w0 - c) - 8.6 * grow(Z_ARM);
    if (dc < px) {
      vec2 u = (w0 - c) / (8.6 * grow(Z_ARM));
      vec3 n = normalize(vec3(u * 0.8, sqrt(max(1.0 - dot(u, u), 0.0)) + 0.35));
      vec3 brass = lin(vec3(0.8, 0.63, 0.33));
      vec3 cc = metal(brass, max(dot(n, L), 0.0), n, L, lightAt(w0));
      col = mix(col, cc, smoothstep(px, -px, dc));
    }
  }

  // The pen, standing in its collar: from straight above only its end shows, but away from the
  // middle of the view its barrel leans out.
  {
    float zt = Z_PAPER + uLift;
    vec2 s0 = proj(uPen, zt);
    vec2 s1 = proj(uPen, zt + PEN_LEN);
    float k1 = grow(zt + PEN_LEN);
    float d = sdSeg(w0, s0, s1, h);
    float r = mix(0.5, PEN_R, smoothstep(0.0, 0.09, h)) * mix(1.0, k1, h);
    vec3 lp = lightAt(w0);
    if (d - r < px) {
      vec2 axis = normalize(s1 - s0 + 1e-4);
      vec2 side = vec2(-axis.y, axis.x);
      float u = clamp(dot(w0 - mix(s0, s1, h), side) / r, -1.0, 1.0);
      vec3 n = normalize(vec3(side * u, sqrt(max(1.0 - u * u, 0.0))));
      float lam = max(dot(n, L), 0.0);
      vec3 body;
      if (uPenKind == 1) {
        body = h < 0.1 ? lin(vec3(0.62, 0.62, 0.64)) : h < 0.2 ? lin(vec3(0.78, 0.6, 0.3)) : lin(vec3(0.5, 0.28, 0.14));
      } else if (uPenKind == 2) {
        body = h > 0.94 ? lin(uCap) : lin(vec3(0.88, 0.88, 0.86));
      } else {
        body = h > 0.72 ? lin(uCap) : lin(vec3(0.16, 0.16, 0.17));
      }
      vec3 pc = metal(body, lam, n, L, lp) * 0.85;
      col = mix(col, pc, smoothstep(px, -px, d - r));
    }
    // Its top end.
    float dt = length(w0 - s1) - PEN_R * k1;
    if (dt < px) {
      vec2 u = (w0 - s1) / (PEN_R * k1);
      vec3 top = uPenKind == 1 ? lin(vec3(0.64, 0.42, 0.24)) : lin(uCap);
      vec3 n = normalize(vec3(u * 0.55, 1.0));
      float lam = max(dot(n, L), 0.0);
      vec3 tc = top * lp * (ambient() + 0.85 * lam);
      tc *= 0.82 + 0.18 * smoothstep(1.0, 0.75, length(u));
      if (uPenKind == 1) tc *= 0.9 + 0.1 * sin(length(u) * 22.0);
      col = mix(col, tc, smoothstep(px, -px, dt));
    }
  }

  outColor = vec4(pow(max(col, 0.0), vec3(1.0 / 2.2)) + dither, 1.0);
}`;
