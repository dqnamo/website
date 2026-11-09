// The shaders for the zip. Everything is drawn in millimetres, y down, and lit by one light up
// to the left: daylight, or with the site dark, a warm lamp whose pool of light falls off
// towards the edges. Surfaces are height fields: the weave of the fabric, the cord along the
// tape, the dome of each tooth, the bevel and bridge of the slider and the engraving on the pull
// are all heights, and the light falls on the slope of each.

const HEADER = /* glsl */ `#version 300 es
precision highp float;
precision highp int;
uniform vec4 uView;
uniform float uPx;
uniform vec3 uLight;
uniform vec3 uLightColour;
uniform vec3 uAmbient;
uniform float uNight;
uniform vec2 uLamp;
`;

const COMMON = /* glsl */ `
const float PI = 3.14159265;

vec3 toLinear(vec3 c) { return pow(c, vec3(2.2)); }
vec3 toSrgb(vec3 c) {
  c = c / (1.0 + 0.12 * c);
  return pow(max(c, 0.0), vec3(1.0 / 2.2));
}
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
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float a = 0.5;
  float s = 0.0;
  for (int i = 0; i < 4; i++) {
    s += a * noise(p);
    p = p * 2.03 + 17.1;
    a *= 0.5;
  }
  return s;
}
float sdRoundBox(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}
float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

// Daylight is nearly even; a lamp makes a pool.
float pool(vec2 p) {
  float day = 1.0 - 0.14 * smoothstep(40.0, 150.0, length(p - vec2(-70.0, -80.0)));
  float lamp = mix(1.08, 0.3, smoothstep(20.0, 115.0, length(p - uLamp)));
  return mix(day, lamp, uNight);
}

vec3 lit(vec3 albedo, vec3 n, float wrap, float light, float ao, vec2 p) {
  float d = max(0.0, (dot(n, uLight) + wrap) / (1.0 + wrap));
  return albedo * (uAmbient * (0.6 + 0.4 * n.z) * ao + uLightColour * d * light * pool(p));
}
float glint(vec3 n, float shine) {
  vec3 h = normalize(uLight + vec3(0.0, 0.0, 1.0));
  return pow(max(dot(n, h), 0.0), shine);
}
// A studio seen in polished metal: a soft box towards the light, a dim room, a darker floor.
vec3 studio(vec3 r, vec2 p) {
  vec3 box = normalize(uLight + vec3(0.0, 0.0, 0.35));
  float s = max(dot(r, box), 0.0);
  float room = 0.14 + 0.2 * clamp(0.5 - r.y * 0.6, 0.0, 1.0);
  room *= 1.0 - 0.6 * smoothstep(0.15, 0.75, r.y);
  // By lamplight the room behind you is lit by the same lamp.
  vec3 walls = uAmbient * 2.4 + uLightColour * 0.3 * uNight;
  return walls * room + uLightColour * pool(p) * (2.6 * pow(s, 30.0) + 0.5 * pow(s, 5.0));
}
vec3 metal(vec3 base, vec3 n, vec2 p) {
  vec3 r = reflect(vec3(0.0, 0.0, -1.0), n);
  vec3 f = mix(base, vec3(1.0), pow(1.0 - clamp(n.z, 0.0, 1.0), 4.0) * 0.6);
  return f * studio(r, p);
}
`;

const VIEW = /* glsl */ `
vec4 toClip(vec2 world) {
  return vec4((world - uView.zw) * uView.xy, 0.0, 1.0);
}
`;

// A triangle over the whole canvas, for the inside and the blur.
export const SCREEN_VERTEX = `${HEADER}${VIEW}
out vec2 vScreen;
out vec2 vWorld;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)) * 2.0 - 1.0;
  vScreen = p * 0.5 + 0.5;
  vWorld = p / uView.xy + uView.zw;
  gl_Position = vec4(p, 0.0, 1.0);
}
`;

export const BLUR_FRAGMENT = `${HEADER}
uniform sampler2D uSource;
uniform vec2 uStep;
in vec2 vScreen;
out vec4 fragColor;
void main() {
  float w[5] = float[](0.227, 0.194, 0.121, 0.054, 0.016);
  float s = texture(uSource, vScreen).r * w[0];
  for (int i = 1; i < 5; i++) {
    vec2 o = uStep * float(i);
    s += (texture(uSource, vScreen + o).r + texture(uSource, vScreen - o).r) * w[i];
  }
  fragColor = vec4(s, s, s, 1.0);
}
`;

// What's behind the zip. The blurred cover of the fabric says how deep in shadow each point
// is, and for the cushion, how far the pad bulges up through the gap.
export const INSIDE_FRAGMENT = `${HEADER}${COMMON}
uniform sampler2D uMask;
uniform sampler2D uAtlas;
uniform vec2 uMaskTexel;
uniform vec2 uShadowUV;
uniform int uInside;
uniform float uFull;
uniform vec4 uTicket;
uniform vec4 uLabel;
in vec2 vScreen;
in vec2 vWorld;
out vec4 fragColor;

vec3 sett(float x) {
  // A muted tartan, mirrored every 24 mm: a green ground, wide navy bands and a red and a
  // camel line.
  float s = abs(mod(x + 6.0, 48.0) - 24.0);
  vec3 c = vec3(0.16, 0.25, 0.18);
  if (s < 6.5) c = vec3(0.1, 0.12, 0.22);
  else if (s > 11.0 && s < 11.7) c = vec3(0.62, 0.14, 0.1);
  else if (s > 17.0 && s < 22.0) c = vec3(0.1, 0.12, 0.22);
  else if (s > 23.4) c = vec3(0.72, 0.58, 0.36);
  return c;
}

vec3 tartan(vec2 p, out float h) {
  float t = 0.26;
  vec2 c = p / t;
  vec2 id = floor(c);
  vec2 f = fract(c) - 0.5;
  // A 2/2 twill, as tartan is woven.
  float warp = mod(id.x + id.y, 4.0) < 2.0 ? 1.0 : 0.0;
  float detail = clamp((t / uPx - 2.2) / 2.5, 0.0, 1.0);
  h = mix(0.5, warp > 0.5 ? cos(f.x * PI) : cos(f.y * PI), detail);
  vec3 col = mix(sett(p.y), sett(p.x), mix(0.5, warp, detail));
  return toLinear(col);
}

vec3 ticking(vec2 p, out float h) {
  // Cream ticking with navy stripes along it, in a herringbone that turns every 3 mm.
  float s = mod(p.x + 30.0, 14.0);
  float navy = step(1.0, s) * step(s, 2.4) + step(3.4, s) * step(s, 4.1) + step(5.1, s) * step(s, 6.5);
  float t = 0.3;
  float turn = mod(floor(p.x / 3.0), 2.0) * 2.0 - 1.0;
  float diag = fract((p.x * turn + p.y) / (t * 2.0));
  float detail = clamp((t / uPx - 2.2) / 2.5, 0.0, 1.0);
  h = mix(0.5, 0.5 + 0.5 * cos(diag * 2.0 * PI), detail);
  vec3 col = mix(vec3(0.86, 0.83, 0.74), vec3(0.14, 0.2, 0.36), navy);
  col *= mix(1.0, 0.92 + 0.12 * h, detail);
  return toLinear(col);
}

// A hexagonal pencil lying on a flat, seen from above: the top face and two slanted ones, the
// sharpened cone where the scallops of paint meet bare cedar, and the graphite.
vec4 pencil(vec2 p, vec2 a, float angle, float len, vec3 paint, bool rubber, out vec3 n) {
  vec2 dir = vec2(sin(angle), cos(angle));
  vec2 side = vec2(dir.y, -dir.x);
  float t = dot(p - a, dir);
  float s = dot(p - a, side);
  float R = 3.9;
  float tanA = 0.2;
  n = vec3(0.0, 0.0, 1.0);
  float as = abs(s);
  if (t < -9.0 || t > len || as > R) return vec4(0.0);
  // The prism's radius at this point on its faces, from above.
  float face = as < R * 0.5 ? 0.0 : 1.0;
  float zFace = face < 0.5 ? 0.866 * R : 1.732 * (R - as);
  float rSurface = sqrt(as * as + zFace * zFace);
  float cone = len - t;
  float coneR = cone * tanA;
  vec3 col;
  vec3 nl;
  if (coneR < rSurface) {
    // On the cone: cedar, and graphite at the tip.
    if (as > coneR) return vec4(0.0);
    float z = sqrt(max(coneR * coneR - as * as, 0.0));
    nl = normalize(vec3(s / max(coneR, 0.01), tanA, z / max(coneR, 0.01)));
    float grain = 0.9 + 0.1 * sin(t * 5.0 + noise(vec2(s * 2.0, t)) * 4.0);
    col = coneR < 0.85 ? vec3(0.13, 0.13, 0.14) : vec3(0.78, 0.6, 0.42) * grain;
  } else if (t < 0.0) {
    if (!rubber || t < -9.0) return vec4(0.0);
    if (t > -5.5) {
      // The ferrule, crimped in rings.
      float ring = 0.8 + 0.2 * cos(t * 9.0);
      nl = normalize(vec3(s / R, 0.0, sqrt(max(1.0 - (s / R) * (s / R), 0.0)) + 0.01));
      col = vec3(0.72, 0.72, 0.7) * ring;
    } else {
      if (as > R * 0.92) return vec4(0.0);
      nl = normalize(vec3(s / R, 0.0, sqrt(max(1.0 - (s / R) * (s / R), 0.0)) + 0.01));
      col = vec3(0.86, 0.46, 0.48);
    }
  } else {
    float sgn = s < 0.0 ? -1.0 : 1.0;
    nl = face < 0.5 ? vec3(0.0, 0.0, 1.0) : vec3(0.866 * sgn, 0.0, 0.5);
    col = paint;
    // The arrises between faces catch a thin line of light.
    col *= 1.0 + 0.25 * exp(-pow((as - R * 0.5) / 0.15, 2.0));
  }
  // Back into the world.
  n = normalize(vec3(side * nl.x + dir * nl.y, nl.z));
  return vec4(toLinear(col), 1.0);
}

void main() {
  vec2 p = vWorld;
  float ao = texture(uMask, vScreen).r;
  float shadow = texture(uMask, vScreen + uShadowUV).r;
  vec3 n = vec3(0.0, 0.0, 1.0);
  vec3 albedo;
  float h = 0.0;
  float shine = 0.0;
  float depth = 1.0;

  if (uInside == 0) {
    albedo = tartan(p, h);
    // A ticket stub, and the care label sewn to the pocket bag.
    vec2 q = p - uTicket.xy;
    float ca = cos(uTicket.z);
    float sa = sin(uTicket.z);
    q = vec2(ca * q.x + sa * q.y, -sa * q.x + ca * q.y);
    vec2 uv = vec2(q.x / 24.0 + 0.5, q.y / 60.0 + 0.5);
    if (uv.x > 0.0 && uv.x < 1.0 && uv.y > 0.0 && uv.y < 1.0) {
      vec3 ink = texture(uAtlas, vec2(0.75 + uv.x * 0.25, uv.y)).rgb;
      if (ink.b > 0.5) {
        vec3 card = vec3(0.93, 0.89, 0.8) * (0.96 + 0.06 * noise(p * 3.0));
        card = mix(card, vec3(0.74, 0.16, 0.13), ink.r);
        card = mix(card, vec3(0.12, 0.11, 0.1), ink.g);
        albedo = toLinear(card);
        h = 0.5;
        shine = 0.1;
      }
    }
    q = p - uLabel.xy;
    uv = vec2(q.x / 22.0 + 0.5, q.y / 55.0 + 0.5);
    if (uv.x > 0.0 && uv.x < 1.0 && uv.y > 0.0 && uv.y < 1.0) {
      float ink = texture(uAtlas, vec2(0.5 + uv.x * 0.25, uv.y)).r;
      float weave = 0.92 + 0.08 * cos(q.y * 2.0 * PI / 0.3);
      vec3 satin = vec3(0.92, 0.9, 0.86) * weave;
      albedo = toLinear(mix(satin, vec3(0.16, 0.15, 0.2), ink));
      shine = 0.35;
    }
  } else if (uInside == 1) {
    albedo = ticking(p, h);
    // The pad bulges up through the gap, highest where it's furthest from the fabric.
    vec2 dx = vec2(uMaskTexel.x * 2.0, 0.0);
    vec2 dy = vec2(0.0, uMaskTexel.y * 2.0);
    float gx = texture(uMask, vScreen + dx).r - texture(uMask, vScreen - dx).r;
    float gy = texture(uMask, vScreen + dy).r - texture(uMask, vScreen - dy).r;
    float lift = 2.0 + 10.0 * uFull;
    n = normalize(vec3(gx * lift, -gy * lift, 1.0));
    depth = 0.6;
    shine = 0.12;
  } else {
    albedo = toLinear(vec3(0.07, 0.07, 0.08)) * (0.9 + 0.2 * noise(p * vec2(2.0, 0.3)));
    shine = 0.18;
    vec3 pn;
    vec4 c = pencil(p, vec2(-15.4, -62.0), 0.02, 100.0, vec3(0.16, 0.34, 0.24), false, pn);
    if (c.a > 0.0) { albedo = c.rgb; n = pn; shine = 0.5; }
    c = pencil(p, vec2(-7.6, -58.0), -0.015, 92.0, vec3(0.93, 0.72, 0.16), true, pn);
    if (c.a > 0.0) { albedo = c.rgb; n = pn; shine = 0.5; }
    c = pencil(p, vec2(0.4, 40.0), 3.13, 96.0, vec3(0.7, 0.13, 0.12), true, pn);
    if (c.a > 0.0) { albedo = c.rgb; n = pn; shine = 0.5; }
    c = pencil(p, vec2(8.3, -64.0), 0.012, 104.0, vec3(0.13, 0.2, 0.42), false, pn);
    if (c.a > 0.0) { albedo = c.rgb; n = pn; shine = 0.5; }
  }

  // Under the fabric it's dark; the light only gets in through the gap.
  float light = pow(1.0 - shadow, 1.6) * depth * 0.62;
  float occlusion = mix(0.8, 0.04, smoothstep(0.3, 0.97, ao));
  vec3 col = lit(albedo, n, 0.3, light, occlusion, p);
  col += uLightColour * glint(n, 30.0) * shine * light * pool(p);
  col *= 0.9 + 0.1 * h;
  fragColor = vec4(toSrgb(col), 1.0);
}
`;

// The two halves of the fabric, each a mesh that follows its tape: the zip tape next to the
// teeth, then the cloth folded under at the edge of the opening, topstitched round, with a bar
// tack at each end.
export const PANEL_VERTEX = `${HEADER}${VIEW}
layout(location = 0) in vec2 aPos;
layout(location = 1) in vec2 aRest;
layout(location = 2) in float aU;
layout(location = 3) in vec2 aSlope;
layout(location = 4) in float aSide;
out vec2 vRest;
out float vU;
out vec2 vSlope;
out float vSide;
out vec2 vWorld;
void main() {
  vRest = aRest;
  vU = aU;
  vSlope = aSlope;
  vSide = aSide;
  vWorld = aPos;
  gl_Position = toClip(aPos);
}
`;

export const MASK_FRAGMENT = `${HEADER}
out vec4 fragColor;
void main() {
  fragColor = vec4(1.0);
}
`;

export const PANEL_FRAGMENT = `${HEADER}${COMMON}
uniform int uFabric;
uniform int uTeeth;
uniform vec3 uColour;
uniform vec3 uTape;
uniform vec3 uStitch;
uniform vec4 uWindow;
uniform vec4 uGrab;
uniform float uGrabSide;
uniform float uChainHalf;
in vec2 vRest;
in float vU;
in vec2 vSlope;
in float vSide;
in vec2 vWorld;
out vec4 fragColor;

float pitchOf(int kind) {
  if (kind == 1) return 0.24;
  if (kind == 2) return 0.42;
  if (kind == 3) return 0.16;
  return 0.3;
}

// The weave's height at p, 0–1, and which thread is on top there: 1 the warp, 0 the weft.
float weave(vec2 p, int kind, float detail, out float warp, out vec2 id) {
  float t = pitchOf(kind);
  vec2 c = p / t;
  id = floor(c);
  vec2 f = fract(c) - 0.5;
  // Each warp thread rises and dips along its length as it passes over and under the weft,
  // and the weft the same across; what you see is whichever is higher.
  float under;
  if (kind == 1) {
    // Denim: a 3/1 twill, the indigo warp floating over three wefts and under one, a step
    // further along in each column, which draws the diagonal.
    float phase = fract((c.y + id.x) / 4.0);
    under = smoothstep(0.66, 0.76, phase) * smoothstep(1.0, 0.9, phase);
  } else {
    under = 0.5 + 0.5 * sin(PI * c.y + PI * id.x);
  }
  // Linen's yarn is uneven: thick and thin along each thread.
  float slub = 1.0;
  float slubWeft = 1.0;
  if (kind == 2) {
    slub = 0.8 + 0.4 * noise(vec2(id.x * 3.1, p.y * 0.9));
    slubWeft = 0.8 + 0.4 * noise(vec2(p.x * 0.9, id.y * 3.1 + 40.0));
  }
  float zw = cos(PI * f.x) * (1.0 - 0.75 * under) * slub;
  float zf = cos(PI * f.y) * (0.25 + 0.75 * under) * slubWeft;
  warp = zw > zf ? 1.0 : 0.0;
  float h = max(zw, zf);
  if (kind == 3) {
    // Ripstop: a fine plain weave with a doubled, thicker thread every 5 mm both ways.
    vec2 g = mod(p, 5.0);
    float rib = max(
      max(smoothstep(0.1, 0.18, g.x) * smoothstep(0.38, 0.3, g.x), smoothstep(0.48, 0.56, g.x) * smoothstep(0.76, 0.68, g.x)),
      max(smoothstep(0.1, 0.18, g.y) * smoothstep(0.38, 0.3, g.y), smoothstep(0.48, 0.56, g.y) * smoothstep(0.76, 0.68, g.y)));
    return h * 0.25 * detail + rib * 0.6;
  }
  return mix(0.5, h, detail);
}

vec3 fabricColour(vec2 p, int kind, float warp, vec2 id, float h, float detail) {
  vec3 base = uColour;
  if (kind == 0) {
    // Waxed cotton: mottled where the wax lies thick, and paler along old creases where it
    // has cracked, in broken lines.
    base *= 0.8 + 0.34 * fbm(p * 0.09);
    float r1 = 1.0 - abs(noise(p * vec2(0.035, 0.085) + 3.0) * 2.0 - 1.0);
    float r2 = 1.0 - abs(noise(p * vec2(0.09, 0.03) + 9.0) * 2.0 - 1.0);
    float broken = smoothstep(0.4, 0.75, noise(p * 0.06 + 21.0));
    float crease = max(smoothstep(0.978, 0.997, r1), smoothstep(0.982, 0.998, r2)) * broken;
    base = mix(base, base * 1.45 + 0.03, crease * 0.5);
    base *= mix(1.0, 0.94 + 0.09 * warp, detail);
  } else if (kind == 1) {
    // Denim: ring-dyed indigo warp, uneven along each yarn, over an undyed weft. The twill's
    // diagonal ribs, four threads apart, stay visible after the threads themselves fade.
    float slub = 0.72 + 0.56 * noise(vec2(floor(p.x / 0.24) * 0.61, p.y * 0.35));
    vec3 indigo = base * slub;
    vec3 weft = vec3(0.7, 0.7, 0.66);
    float ribDetail = clamp((0.96 / uPx - 2.5) / 2.5, 0.0, 1.0);
    float rib = 0.5 + 0.5 * sin(2.0 * PI * (p.x + p.y * 0.55) / 0.96);
    base = mix(mix(indigo, weft, 0.2 + 0.12 * (rib - 0.5) * ribDetail), mix(weft, indigo, warp), detail);
    base = mix(base, base * 1.3 + 0.03, smoothstep(0.55, 0.9, fbm(p * 0.05)) * 0.35);
  } else if (kind == 2) {
    // Thick places in the yarn take the light differently: short, faint streaks.
    float streak = noise(vec2(p.x * 2.4, p.y * 0.25)) * noise(vec2(p.x * 0.25, p.y * 2.4) + 7.0);
    base *= 0.95 + 0.07 * noise(p * 0.08);
    base *= mix(1.0, 0.95 + 0.1 * streak, detail);
  } else {
    base *= 0.96 + 0.08 * noise(p * 0.2);
    base *= 1.0 + 0.06 * h;
  }
  return base;
}

// Arc length round the stitch line, near enough: along the sides it's y, along the ends x.
float along(vec2 q, vec2 b) {
  return abs(q.y) - b.y < abs(q.x) - b.x ? q.y : q.x + sign(q.y) * 40.0;
}

void main() {
  vec2 q = vec2(vRest.x, vRest.y - uWindow.x);
  vec2 wb = uWindow.yz;
  float d = sdRoundBox(q, wb, uWindow.w);
  float e = 0.03;
  vec2 gd = normalize(vec2(
    sdRoundBox(q + vec2(e, 0.0), wb, uWindow.w) - sdRoundBox(q - vec2(e, 0.0), wb, uWindow.w),
    sdRoundBox(q + vec2(0.0, e), wb, uWindow.w) - sdRoundBox(q - vec2(0.0, e), wb, uWindow.w)) + 1e-5);

  float aaU = max(fwidth(vU), 1e-4);
  float aaD = max(fwidth(d), 1e-4);
  float alpha = max(smoothstep(-aaD, aaD, d), smoothstep(-aaU, aaU, vU));
  if (alpha <= 0.0) discard;

  vec2 slope = vSlope;
  vec3 albedo;
  float shine = 0.0;
  float shineSize = 20.0;
  float ao = 1.0;
  float onFabric = smoothstep(-aaD, aaD, d);

  // The tape: fine ribs along its length, and the cord its teeth grip.
  vec3 tape = toLinear(uTape);
  float u = vU;
  float tDetail = clamp((0.34 / uPx - 2.2) / 2.5, 0.0, 1.0);
  vec2 tapeSlope = vec2(0.0);
  float rib = sin(u * 2.0 * PI / 0.34);
  tapeSlope += -vSide * vec2(1.0, 0.0) * rib * 0.35 * tDetail;
  float cord = exp(-pow((u - 0.15) / 0.5, 2.0));
  tapeSlope += vSide * vec2(1.0, 0.0) * (-2.0 * (u - 0.15) / 0.25) * cord * 0.6;
  vec3 tapeCol = tape * (0.92 + 0.08 * rib * tDetail) * (1.0 - 0.25 * cord);
  if (uTeeth == 2) {
    // The coil is sewn down with a chain stitch along each tape.
    float st = fract(vRest.y / 1.3);
    float sew = exp(-pow((u - 1.5) / 0.28, 2.0)) * smoothstep(0.0, 0.15, st) * smoothstep(1.0, 0.75, st);
    tapeCol = mix(tapeCol, tape * 1.5 + 0.02, sew * 0.8);
    tapeSlope += vSide * vec2(1.0, 0.0) * (-(u - 1.5) / 0.08) * sew * 0.25;
  }
  // The folded edge of the fabric shades the tape beside it.
  float edgeShade = smoothstep(-1.4, 0.0, d) * (0.45 + 0.35 * clamp(dot(-gd, -uLight.xy) * 2.0, 0.0, 1.0));
  tapeCol *= 1.0 - edgeShade * 0.7;

  // The fabric.
  // Threads finer than a few pixels would shimmer, so they fade to their average.
  float fDetail = clamp((pitchOf(uFabric) / uPx - 2.2) / 2.5, 0.0, 1.0);
  float warp;
  vec2 id;
  float hc = weave(vRest, uFabric, fDetail, warp, id);
  float w2;
  vec2 id2;
  float hx = weave(vRest + vec2(0.04, 0.0), uFabric, fDetail, w2, id2);
  float hy = weave(vRest + vec2(0.0, 0.04), uFabric, fDetail, w2, id2);
  vec2 weaveSlope = vec2(hx - hc, hy - hc) / 0.04 * 0.035;
  vec3 cloth = toLinear(fabricColour(vRest, uFabric, warp, id, hc, fDetail));
  vec2 fabricSlope = weaveSlope;
  if (uFabric == 0) { shine = 0.14; shineSize = 22.0; }
  else if (uFabric == 1) { shine = 0.05; shineSize = 10.0; }
  else if (uFabric == 2) { shine = 0.03; shineSize = 8.0; }
  else { shine = 0.4; shineSize = 30.0; }

  // Rolled under at the edge of the opening.
  float roll = clamp(d / 1.3, 0.0, 1.0);
  fabricSlope += gd * (0.55 / (1.3 * sqrt(max(roll, 0.04)))) * step(d, 1.3);

  // Topstitching round the opening.
  vec3 stitch = toLinear(uStitch);
  float s = along(q, wb);
  float st = fract(s / 3.0);
  float on = smoothstep(0.0, 0.07, st) * smoothstep(1.0, 0.86, st);
  float across = (d - 2.7) / 0.27;
  float thread = sqrt(max(1.0 - across * across, 0.0)) * on;
  if (thread > 0.0) {
    float twist = 0.85 + 0.15 * sin((s * 7.0 + d * 12.0));
    cloth = mix(cloth, stitch * twist, smoothstep(0.0, 0.35, thread));
    fabricSlope += gd * (-across / max(sqrt(max(1.0 - across * across, 0.02)), 0.15)) * 0.25 * on;
    shine = mix(shine, 0.25, thread);
  }
  // A bar tack across each end: dense satin stitches.
  float endDist = abs(q.y) - (wb.y + 1.6);
  if (abs(endDist) < 0.85 && abs(q.x) < wb.x + 1.0) {
    float sat = 0.5 + 0.5 * cos(2.0 * PI * (q.x + 0.3 * q.y) / 0.42);
    float band = smoothstep(0.85, 0.6, abs(endDist)) * smoothstep(wb.x + 1.0, wb.x + 0.6, abs(q.x));
    cloth = mix(cloth, stitch * (0.82 + 0.25 * sat), band);
    fabricSlope += vec2(0.0, -sign(endDist) * sign(q.y) * 0.4) * band + vec2(sat - 0.5, 0.0) * 0.3 * band;
  }

  // Where the fabric is tugged, it gathers into folds running along the pull.
  if (uGrabSide == vSide) {
    vec2 g = uGrab.xy;
    vec2 pull = uGrab.zw;
    float amount = min(length(pull), 22.0);
    if (amount > 0.3) {
      vec2 anchor = vec2(vSide * uChainHalf, g.y);
      vec2 axis = anchor - g;
      float reach = max(length(axis), 6.0);
      axis /= reach;
      vec2 perp = vec2(-axis.y, axis.x);
      vec2 r = vRest - g;
      float t = dot(r, axis) / reach;
      float a = dot(r, perp);
      float spreadW = 4.0 + 7.0 * clamp(t, 0.0, 1.0);
      float env = smoothstep(-0.25, 0.1, t) * smoothstep(1.15, 0.6, t) * exp(-a * a / (2.0 * spreadW * spreadW));
      float wave = 2.0 * PI / (3.0 + 2.2 * clamp(t, 0.0, 1.0));
      float fold = cos(a * wave) * env * amount * 0.02;
      fabricSlope += perp * (-sin(a * wave) * wave) * env * amount * 0.02;
      ao *= 1.0 - 0.2 * clamp(-fold, 0.0, 1.0);
    }
  }

  albedo = mix(tapeCol, cloth, onFabric);
  slope += mix(tapeSlope, fabricSlope, onFabric);
  float tapeShine = 0.12;
  shine = mix(tapeShine, shine, onFabric);
  shineSize = mix(18.0, shineSize, onFabric);

  vec3 n = normalize(vec3(-slope, 1.0));
  vec3 col = lit(albedo, n, 0.35, 1.0, ao, vWorld);
  col += uLightColour * glint(n, shineSize) * shine * pool(vWorld);
  fragColor = vec4(toSrgb(col) * alpha, alpha);
}
`;

// Teeth: one quad each, along the tape's edge, pointing across.
export const TOOTH_VERTEX = `${HEADER}${VIEW}
uniform vec2 uHalf;
uniform vec2 uReach;
uniform vec2 uOffset;
in vec2 aRoot;
in vec2 aDir;
in vec2 aInfo;
out vec2 vLocal;
out vec2 vDir;
out float vSeed;
out vec2 vWorld;
void main() {
  vec2 corner = vec2(float(gl_VertexID & 1), float(gl_VertexID >> 1));
  vec2 local = vec2(mix(-uHalf.x, uHalf.x, corner.x), mix(uReach.x, uReach.y, corner.y));
  vec2 perp = vec2(-aDir.y, aDir.x);
  vec2 world = aRoot + uOffset + perp * local.x + aDir * local.y;
  vLocal = local;
  vDir = aDir;
  vSeed = aInfo.x;
  vWorld = world;
  gl_Position = toClip(world);
}
`;

export const TOOTH_FRAGMENT = `${HEADER}${COMMON}
uniform int uTeeth;
uniform float uShadow;
uniform float uWidth;
uniform float uLength;
uniform vec3 uMetal;
uniform vec3 uPlastic;
in vec2 vLocal;
in vec2 vDir;
in float vSeed;
in vec2 vWorld;
out vec4 fragColor;

// Each tooth as a height over its outline: q.x across the tooth (along the chain), q.y from
// the root inward. sd is the distance to the outline.
float tooth(vec2 q, out float sd) {
  float hw = uWidth * 0.5;
  float L = uLength;
  float h;
  if (uTeeth == 0) {
    // Pressed metal, half a pitch wide so the teeth opposite fit between: legs crimped round
    // the tape's cord, a flat-topped body, and the nib that nests in the socket of the tooth
    // beside it.
    float base = 0.35;
    float neck = smoothstep(base - 0.2, base + 0.6, q.y);
    float w = hw * mix(0.86, 1.0, neck);
    vec2 s = vec2(q.x * hw / w, q.y);
    sd = sdRoundBox(s - vec2(0.0, (L - 1.0) * 0.5), vec2(hw, (L + 1.0) * 0.5), hw * 0.9);
    float edge = clamp((abs(q.x) / w - 0.68) / 0.32, 0.0, 1.0);
    h = sqrt(max(1.0 - edge * edge, 0.0)) * 0.55;
    h -= 0.14 * (1.0 - neck);
    vec2 nib = q - vec2(0.0, L - hw * 1.2);
    h += 0.22 * exp(-dot(nib, nib) / (hw * hw * 0.28));
    h -= 0.1 * exp(-pow(q.y - (base + 0.15), 2.0) / 0.02);
  } else if (uTeeth == 1) {
    // Moulded: a flat-topped block with a chamfer, the head wider than the neck.
    float head = smoothstep(L - 2.4, L - 1.6, q.y);
    float w = hw * mix(0.84, 1.02, head);
    vec2 s = vec2(q.x * hw / w, q.y);
    sd = sdRoundBox(s - vec2(0.0, (L - 1.3) * 0.5), vec2(hw, (L + 1.3) * 0.5), 0.42);
    h = 0.75 * smoothstep(0.0, 0.32, -sd);
    h += 0.1 * head * smoothstep(0.0, 0.5, -sd);
  } else {
    // A turn of the nylon coil: a thin rounded band with a flattened bulge at the head.
    float bulge = exp(-pow((q.y - (L - 0.7)) / 0.65, 2.0));
    float w = hw * (0.62 + 0.45 * bulge);
    sd = sdRoundBox(q - vec2(0.0, (L - 1.6) * 0.5), vec2(w, (L + 1.6) * 0.5), w * 0.95);
    float a = clamp(q.x / w, -1.0, 1.0);
    h = sqrt(max(1.0 - a * a, 0.0)) * 0.5;
  }
  return h;
}

void main() {
  float sd;
  float h = tooth(vLocal, sd);
  float aa = uPx * 0.9;
  if (uShadow > 0.5) {
    float soft = 0.45;
    float a = 0.42 * smoothstep(soft, -soft, sd);
    fragColor = vec4(0.0, 0.0, 0.0, a);
    return;
  }
  float alpha = smoothstep(aa, -aa, sd);
  if (alpha <= 0.0) discard;
  float e = 0.05;
  float s2;
  float hx = tooth(vLocal + vec2(e, 0.0), s2) - tooth(vLocal - vec2(e, 0.0), s2);
  float hy = tooth(vLocal + vec2(0.0, e), s2) - tooth(vLocal - vec2(0.0, e), s2);
  vec2 g = vec2(hx, hy) / (2.0 * e);
  // Steep at the very edge, so the outline rolls off.
  g *= 1.0 + 2.0 * smoothstep(-0.25, 0.0, sd);
  vec2 perp = vec2(-vDir.y, vDir.x);
  vec2 slope = perp * g.x + vDir * g.y;
  vec3 n = normalize(vec3(-slope, 1.0));
  float jitter = 0.94 + 0.12 * fract(vSeed * 7.31);
  vec3 col;
  if (uTeeth == 0) {
    col = metal(toLinear(uMetal) * jitter, n, vWorld);
    col *= mix(0.55, 1.0, smoothstep(-0.05, 0.25, h));
  } else {
    vec3 base = toLinear(uPlastic) * jitter;
    float shine = uTeeth == 2 ? 0.55 : 0.35;
    col = lit(base, n, 0.2, 1.0, 1.0, vWorld) + uLightColour * glint(n, uTeeth == 2 ? 40.0 : 24.0) * shine * pool(vWorld);
  }
  fragColor = vec4(toSrgb(col) * alpha, alpha);
}
`;

// The slider and the stops: small metal parts drawn as height fields in their own frame.
export const PART_VERTEX = `${HEADER}${VIEW}
uniform vec2 uCentre;
uniform vec2 uHalf;
uniform vec2 uAxis;
uniform vec2 uOffset;
out vec2 vLocal;
out vec2 vWorld;
void main() {
  vec2 corner = vec2(float(gl_VertexID & 1), float(gl_VertexID >> 1)) * 2.0 - 1.0;
  vec2 local = corner * uHalf;
  vec2 world = uCentre + uOffset + vec2(uAxis.x * local.x - uAxis.y * local.y, uAxis.y * local.x + uAxis.x * local.y);
  vLocal = local;
  vWorld = world;
  gl_Position = toClip(world);
}
`;

export const PART_FRAGMENT = `${HEADER}${COMMON}
uniform int uKind;
uniform vec4 uSlider;
uniform vec3 uMetal;
uniform vec4 uPaint;
uniform float uLock;
uniform float uWorn;
uniform float uShadow;
uniform float uSoft;
uniform vec2 uAxis;
in vec2 vLocal;
in vec2 vWorld;
out vec4 fragColor;

float sdTrapezoid(vec2 p, float r1, float r2, float he) {
  vec2 k1 = vec2(r2, he);
  vec2 k2 = vec2(r2 - r1, 2.0 * he);
  p.x = abs(p.x);
  vec2 ca = vec2(p.x - min(p.x, (p.y < 0.0) ? r1 : r2), abs(p.y) - he);
  vec2 cb = p - k1 + k2 * clamp(dot(k1 - p, k2) / dot(k2, k2), 0.0, 1.0);
  float s = (cb.x < 0.0 && ca.y < 0.0) ? -1.0 : 1.0;
  return s * sqrt(min(dot(ca, ca), dot(cb, cb)));
}

float part(vec2 q, out float sd) {
  float h;
  if (uKind == 0) {
    // The slider from the front: wide at the shoulder where the two rows go in, either side
    // of the diamond, narrow at the throat where they come out locked. The pull hangs from
    // the bridge down its middle.
    float he = uSlider.x * 0.5;
    float r = 1.5;
    sd = sdTrapezoid(q, uSlider.y * 0.5 - r, uSlider.z * 0.5 - r, he - r) - r;
    float notch = length(q - vec2(0.0, -he - 0.5)) - 1.6;
    sd = max(sd, -notch);
    h = 1.0 * smoothstep(0.0, 1.2, -sd);
    float wx = q.x / (uSlider.y * 0.5);
    h += 0.4 * (1.0 - wx * wx) * smoothstep(0.0, 1.5, -sd);
    float bridge = sdRoundBox(q - vec2(0.0, he * 0.16), vec2(1.6, he * 0.64), 1.5);
    h += 1.25 * smoothstep(0.35, -0.9, bridge);
    if (uLock > 0.5) {
      float cam = sdRoundBox(q - vec2(0.0, -he * 0.22), vec2(2.5, he * 0.3), 1.8);
      h += 0.5 * smoothstep(0.35, -0.9, cam);
    }
  } else if (uKind == 1) {
    // A top stop, clamped over the tape's cord.
    sd = sdRoundBox(q, vec2(1.25, 1.1), 0.7);
    h = 0.85 * smoothstep(0.0, 0.7, -sd);
  } else {
    // The bottom stop, holding both rows together for good.
    sd = sdRoundBox(q, vec2(uSlider.w + 1.4, 1.5), 0.9);
    h = 0.9 * smoothstep(0.0, 0.8, -sd) - 0.25 * exp(-q.y * q.y / 0.1);
  }
  return h;
}

void main() {
  float sd;
  float h = part(vLocal, sd);
  if (uShadow > 0.5) {
    float a = 0.5 * smoothstep(uSoft, -uSoft, sd);
    fragColor = vec4(0.0, 0.0, 0.0, a);
    return;
  }
  float aa = uPx * 0.9;
  float alpha = smoothstep(aa, -aa, sd);
  if (alpha <= 0.0) discard;
  float e = 0.06;
  float s2;
  vec2 g = vec2(part(vLocal + vec2(e, 0.0), s2) - part(vLocal - vec2(e, 0.0), s2),
                part(vLocal + vec2(0.0, e), s2) - part(vLocal - vec2(0.0, e), s2)) / (2.0 * e);
  g *= 1.0 + 1.5 * smoothstep(-0.3, 0.0, sd);
  vec2 slope = vec2(uAxis.x * g.x - uAxis.y * g.y, uAxis.y * g.x + uAxis.x * g.y);
  vec3 n = normalize(vec3(-slope, 1.0));
  vec3 bare = metal(toLinear(uMetal), n, vWorld);
  vec3 col = bare;
  if (uPaint.a > 0.0) {
    vec3 paint = lit(toLinear(uPaint.rgb), n, 0.2, 1.0, 1.0, vWorld) + uLightColour * glint(n, 60.0) * 0.6 * pool(vWorld);
    col = mix(bare, paint, uPaint.a);
  }
  if (uWorn > 0.0) {
    // Scuffed dull where it's been handled.
    float scuff = fbm(vLocal * vec2(3.0, 0.6) + 2.0);
    col *= mix(1.0, 0.7 + 0.3 * scuff, uWorn);
  }
  col *= mix(0.6, 1.0, smoothstep(-0.1, 0.4, h));
  fragColor = vec4(toSrgb(col) * alpha, alpha);
}
`;

// The pull: a tab hinged on the bridge. It can hang flat, stand out towards you or flip up
// and show its back, so its face is drawn through a 3D frame, foreshortened, with its edge and
// its shadow on the zip below.
export const PULL_VERTEX = `${HEADER}${VIEW}
uniform vec2 uPivot;
uniform vec2 uW;
uniform vec2 uL;
uniform vec2 uOffset;
uniform vec4 uRange;
out vec2 vLocal;
out vec2 vWorld;
void main() {
  vec2 corner = vec2(float(gl_VertexID & 1), float(gl_VertexID >> 1));
  vec2 local = mix(uRange.xy, uRange.zw, corner);
  vec2 world = uPivot + uOffset + uW * local.x + uL * local.y;
  vLocal = local;
  vWorld = world;
  gl_Position = toClip(world);
}
`;

export const PULL_FRAGMENT = `${HEADER}${COMMON}
uniform sampler2D uAtlas;
uniform vec2 uPull;
uniform vec3 uW3;
uniform vec3 uL3;
uniform vec3 uN3;
uniform vec3 uMetal;
uniform vec4 uPaint;
uniform int uLayer;
uniform float uSoft;
in vec2 vLocal;
in vec2 vWorld;
out vec4 fragColor;

float pullSd(vec2 q) {
  float L = uPull.x;
  float w = uPull.y * 0.5;
  float ring = sdRoundBox(q - vec2(0.0, 0.8), vec2(3.0, 3.3), 2.5);
  float t = clamp((q.y - 4.0) / (L - 4.0), 0.0, 1.0);
  float hw = mix(w * 0.82, w, smoothstep(0.0, 0.55, t));
  float body = sdRoundBox(q - vec2(0.0, (L + 4.0) * 0.5), vec2(hw, (L - 4.0) * 0.5), min(hw, 3.8));
  float sd = smin(ring, body, 1.4);
  float hole = sdRoundBox(q - vec2(0.0, 0.5), vec2(1.75, 1.55), 1.1);
  return max(sd, -hole);
}

float pullHeight(vec2 q, float back) {
  float sd = pullSd(q);
  float h = 0.9 * smoothstep(0.0, 0.9, -sd);
  float L = uPull.x;
  float centre = 4.0 + (L - 4.0) * 0.52;
  vec2 uv = vec2(q.x / 9.0 + 0.5, (q.y - centre) / 22.5 + 0.5);
  if (uv.x > 0.0 && uv.x < 1.0 && uv.y > 0.0 && uv.y < 1.0) {
    float ink = texture(uAtlas, vec2(uv.x * 0.25 + back * 0.25, uv.y)).r;
    h -= 0.3 * ink;
  }
  return h;
}

void main() {
  float sd = pullSd(vLocal);
  if (uLayer == 0) {
    float a = 0.5 * smoothstep(uSoft, -uSoft, sd);
    fragColor = vec4(0.0, 0.0, 0.0, a);
    return;
  }
  float aa = uPx * 0.9;
  float alpha = smoothstep(aa, -aa, sd);
  if (alpha <= 0.0) discard;
  // Which face we see: the front, or with it flipped over, the back, mirrored.
  float back = uN3.z < 0.0 ? 1.0 : 0.0;
  vec3 face = back > 0.5 ? -uN3 : uN3;
  vec3 ta = back > 0.5 ? -uW3 : uW3;
  vec2 q = vec2(back > 0.5 ? -vLocal.x : vLocal.x, vLocal.y);
  vec3 base = toLinear(uMetal);
  vec3 col;
  if (uLayer == 1) {
    // The edge, seen as the tab tilts.
    vec3 n = normalize(face * 0.3 + uL3 * 0.6 + vec3(0.0, 0.0, 0.4));
    col = mix(metal(base, n, vWorld), lit(toLinear(uPaint.rgb), n, 0.2, 1.0, 1.0, vWorld), uPaint.a) * 0.55;
  } else {
    float e = 0.06;
    float hx = (pullHeight(q + vec2(e, 0.0), back) - pullHeight(q - vec2(e, 0.0), back)) / (2.0 * e);
    float hy = (pullHeight(q + vec2(0.0, e), back) - pullHeight(q - vec2(0.0, e), back)) / (2.0 * e);
    float h = pullHeight(q, back);
    float edge = 1.0 + 1.5 * smoothstep(-0.3, 0.0, sd);
    vec3 n = normalize(face - (hx * ta + hy * uL3) * edge);
    col = metal(base, n, vWorld);
    if (uPaint.a > 0.0) {
      vec3 paint = lit(toLinear(uPaint.rgb), n, 0.2, 1.0, 1.0, vWorld) + uLightColour * glint(n, 60.0) * 0.6 * pool(vWorld);
      // The engraving cuts through the paint to the metal.
      float cut = smoothstep(0.55, 0.45, h) * smoothstep(-0.6, -0.3, sd);
      col = mix(col, paint, uPaint.a * (1.0 - cut));
    }
    col *= mix(0.65, 1.0, smoothstep(0.2, 0.7, h));
  }
  fragColor = vec4(toSrgb(col) * alpha, alpha);
}
`;
