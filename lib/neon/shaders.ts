// The sign is drawn in four steps. TUBE lays every length of tube into two buffers: where each
// pixel sits across its tube, how far along, and which tube it is. EMIT turns that into the
// light the gas gives off. BLOOM_DOWN and BLOOM_UP spread that light out, both as the glow in
// the air around a tube and as the pool it throws on the wall a few centimetres behind. And
// COMPOSITE puts the wall, the glass, the paint, the electrode caps and the light together.

const HEADER = `#version 300 es
precision highp float;
precision highp int;
`;

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

// One instance per straight piece of tube, from p0 to p1 in millimetres (y down), drawn as a
// capsule. aAlong holds the distance along the tube at each end, the tube's index and what
// this is: 0 glass, 1 an electrode cap, 2 the pencil line being drawn. aExtra holds the paint
// at each end, the radius, and the length of the whole tube.
export const TUBE_VERTEX = `${HEADER}
layout(location = 0) in vec4 aEnds;
layout(location = 1) in vec4 aAlong;
layout(location = 2) in vec4 aExtra;
uniform vec2 uView;
uniform float uScale;
uniform float uAa;
out vec2 vPos;
flat out vec4 vEnds;
flat out vec4 vAlong;
flat out vec4 vExtra;
void main() {
  vec2 p0 = aEnds.xy;
  vec2 p1 = aEnds.zw;
  vec2 d = p1 - p0;
  float len = length(d);
  vec2 dir = len > 1e-4 ? d / len : vec2(1.0, 0.0);
  vec2 across = vec2(-dir.y, dir.x);
  float r = aExtra.z + uAa * 2.0;
  float u = (gl_VertexID & 1) == 0 ? -1.0 : 1.0;
  float v = (gl_VertexID & 2) == 0 ? -1.0 : 1.0;
  vec2 q = (u < 0.0 ? p0 - dir * r : p1 + dir * r) + across * v * r;
  vPos = q;
  vEnds = aEnds;
  vAlong = aAlong;
  vExtra = aExtra;
  vec2 px = q * uScale + uView * 0.5;
  gl_Position = vec4(px.x / uView.x * 2.0 - 1.0, 1.0 - px.y / uView.y * 2.0, 0.0, 1.0);
}
`;

// Within a tube the nearest piece wins, so its joints are seamless; between lengths of tube
// that cross, the one bent later lies on top, as the bender would have laid it.
export const TUBE_FRAGMENT = `${HEADER}
in vec2 vPos;
flat in vec4 vEnds;
flat in vec4 vAlong;
flat in vec4 vExtra;
uniform float uAa;
uniform float uTubes;
uniform float uRadius;
layout(location = 0) out vec4 outShape;
layout(location = 1) out vec4 outTag;
void main() {
  vec2 p0 = vEnds.xy;
  vec2 d = vEnds.zw - p0;
  float len2 = dot(d, d);
  float t = len2 > 1e-8 ? clamp(dot(vPos - p0, d) / len2, 0.0, 1.0) : 0.0;
  vec2 off = vPos - (p0 + d * t);
  float dist = length(off);
  float r = vExtra.z;
  float cover = clamp((r - dist) / uAa + 0.5, 0.0, 1.0);
  if (cover <= 0.0) discard;
  float kind = vAlong.w;
  float s = mix(vAlong.x, vAlong.y, t);
  float painted = step(0.5, mix(vExtra.x, vExtra.y, t));
  if (kind < 0.5) {
    // Each tube has its own slice of depth, later tubes nearer. Within one, a piece only
    // beats the piece before it by being nearer to the pixel, unless they are far apart along
    // the tube, as where a loop crosses itself. Painted glass goes behind any bare glass it
    // crosses: that's what the paint is for.
    float slope = 0.1 / uRadius;
    float within = (min(dist / r, 1.0) + slope * (vExtra.w - s)) / (slope * vExtra.w + 1.0);
    float order = (uTubes - 1.0 - vAlong.z + within) / uTubes;
    gl_FragDepth = 0.05 + 0.45 * order + 0.45 * painted;
  } else if (kind < 1.5) {
    // Caps sit behind everything: they're where the tube turns back into the wall.
    gl_FragDepth = 0.96 + 0.03 * min(dist / r, 1.0);
  } else {
    gl_FragDepth = 0.01;
  }
  outShape = vec4(off / r, s, vAlong.z);
  outTag = vec4(kind + 1.0, painted, cover, 0.0);
}
`;

// What a tube gives off at each pixel. The tube data has one column per tube: row 0 is the
// light it's giving now and which kind of glass it is, row 1 the glass's own colour, and row 2
// how far the bending has got, how quickly the glass cools behind the burner, how hot it still
// is, and its length.
export const EMIT = `${HEADER}
uniform sampler2D uShape;
uniform sampler2D uTag;
uniform sampler2D uTubes;
out vec4 outColour;

// Glass at working heat glows a dull orange that reddens and fades as it cools.
vec3 heatGlow(float h) {
  return vec3(1.0, 0.18, 0.02) * pow(h, 1.7) * 1.3 + vec3(1.0, 0.42, 0.08) * pow(h, 6.0) * 1.1;
}

void main() {
  ivec2 at = ivec2(gl_FragCoord.xy);
  vec4 tag = texelFetch(uTag, at, 0);
  float kind = tag.x - 1.0;
  if (kind < -0.5 || kind > 0.5) {
    // Caps and the pencil line give no light, but caps still cast a shadow.
    outColour = vec4(0.0, 0.0, 0.0, kind > -0.5 && kind < 1.5 ? tag.z : 0.0);
    return;
  }
  vec4 shape = texelFetch(uShape, at, 0);
  int tube = int(shape.w + 0.5);
  vec4 glow = texelFetch(uTubes, ivec2(tube, 0), 0);
  vec4 form = texelFetch(uTubes, ivec2(tube, 2), 0);
  float s = shape.z;
  if (s > form.x) {
    outColour = vec4(0.0);
    return;
  }
  float r2 = min(dot(shape.xy, shape.xy), 1.0);
  float profile;
  if (glow.w > 0.5 && glow.w < 1.5) {
    // A coating glows where it is, on the wall of the tube, so the tube looks evenly lit and a
    // touch brighter at its edges, where we look through more of it.
    profile = 0.78 + 0.12 * min(inversesqrt(max(1.0 - r2, 1e-3)), 3.0);
  } else {
    // In clear and tinted glass it's the column of gas that glows, brightest down the middle,
    // with a faint line where the glass wall catches it at the edges.
    float r = sqrt(r2);
    profile = pow(1.0 - r2, 0.8) * 1.2 + 0.04;
    profile += smoothstep(0.82, 0.95, r) * (1.0 - smoothstep(0.95, 1.0, r)) * 0.22;
  }
  // The light stops a few millimetres short of each end, where the electrode is.
  float ends = smoothstep(2.0, 9.0, s) * smoothstep(2.0, 9.0, form.w - s);
  float painted = step(0.5, tag.y);
  vec3 light = glow.rgb * profile * ends * (1.0 - painted);
  float heat = form.z * exp(-max(form.x - s, 0.0) / max(form.y, 1.0));
  light += heatGlow(heat) * (1.0 - painted * 0.6) * (0.6 + 0.4 * (1.0 - r2));
  outColour = vec4(light * tag.z, tag.z);
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
  for (int i = 0; i < 5; i++) {
    sum += noise(p) * amp;
    p = p * 2.03 + vec2(17.1, 9.7);
    amp *= 0.5;
  }
  return sum;
}
`;

// The wall behind the sign, made once per size: linear albedo in rgb, already darkened in the
// mortar joints, and in alpha how much of the room's light from above left each spot faces.
// Bricks are British: 215 by 65 mm with 10 mm joints, laid in stretcher bond.
export const WALL = `${HEADER}
uniform vec2 uView;
uniform float uScale;
uniform float uRatio;
uniform int uKind;
out vec4 outColour;
${NOISE}

// How far inside its brick a point is (negative in the joint), the brick it belongs to, and
// that brick's face height.
vec3 brick(vec2 mm, out vec2 id) {
  float row = floor(mm.y / 75.0);
  float x = mm.x + mod(row, 2.0) * 112.5;
  float col = floor(x / 225.0);
  id = vec2(col, row);
  vec2 local = vec2(x - col * 225.0, mm.y - row * 75.0);
  float edge = min(min(local.x - 5.0, 220.0 - local.x), min(local.y - 5.0, 70.0 - local.y));
  // Bricks aren't true: their arrises are knocked and the joints wander.
  edge += (noise(mm * 0.18 + id * 7.0) - 0.5) * 2.4 + (noise(mm * 0.9) - 0.5) * 0.8;
  float face = smoothstep(-0.5, 3.5, edge);
  return vec3(edge, face, 0.0);
}

float heightAt(vec2 mm) {
  if (uKind == 2) return fbm(mm * vec2(0.05, 0.004)) * 0.15 + noise(mm * 0.6) * 0.03;
  vec2 id;
  vec3 b = brick(mm, id);
  float pits = smoothstep(0.72, 0.9, noise(mm * 0.35 + id * 3.1)) * 0.25;
  float brickHeight = 1.0 + (fbm(mm * 0.08 + id * 5.0) - 0.5) * 0.3 - pits;
  float mortar = 0.25 + noise(mm * 1.3) * 0.12;
  return mix(mortar, brickHeight, b.y);
}

void main() {
  vec2 css = vec2(gl_FragCoord.x, uView.y * uRatio - gl_FragCoord.y) / uRatio;
  vec2 mm = (css - uView * 0.5) / uScale;
  vec2 id;
  vec3 b = brick(mm, id);
  float h1 = hash(id + 0.37);
  float h2 = hash(id * 1.71 + 4.2);
  vec3 albedo;
  if (uKind == 0) {
    vec3 red = mix(vec3(0.24, 0.055, 0.03), vec3(0.4, 0.12, 0.06), h1);
    vec3 burnt = vec3(0.13, 0.045, 0.035);
    vec3 face = mix(red, burnt, smoothstep(0.82, 0.95, h2));
    face *= 0.78 + 0.45 * fbm(mm * 0.05 + id * 3.0);
    face = mix(face, face * 0.6, smoothstep(0.74, 0.9, noise(mm * 0.22 + id)) * 0.7);
    vec3 mortar = vec3(0.36, 0.33, 0.29) * (0.8 + 0.35 * noise(mm * 0.7));
    // Joints are struck back from the face, so the brick shades them at its edges.
    mortar *= mix(0.6, 1.0, smoothstep(0.0, 4.0, -b.x));
    albedo = mix(mortar, face, b.y);
  } else if (uKind == 1) {
    // Limewash over brick: thick on the faces, thinner on the knocked edges, with the brick
    // showing through where it has worn.
    vec3 paint = vec3(0.74, 0.72, 0.68) * (0.92 + 0.12 * noise(mm * 0.4));
    // What shows through is old brick with paint still in its pores, so it's pale and dusty.
    vec3 red = mix(mix(vec3(0.3, 0.09, 0.05), vec3(0.4, 0.14, 0.08), h1), paint, 0.4);
    float wear = smoothstep(0.6, 0.85, fbm(mm * 0.012 + id * 2.0)) * 0.6
      + smoothstep(2.5, 0.0, b.x) * b.y * 0.3;
    vec3 face = mix(paint, red, clamp(wear, 0.0, 0.7));
    vec3 mortar = vec3(0.62, 0.6, 0.56) * (0.85 + 0.2 * noise(mm * 0.9));
    albedo = mix(mortar, face, b.y);
    albedo *= mix(0.7, 1.0, b.y);
  } else {
    // A board painted matt black, as most neon is mounted on, with faint brush marks.
    float strokes = fbm(mm * vec2(0.03, 0.0025) + 3.0);
    albedo = vec3(0.022, 0.021, 0.02) * (0.85 + 0.35 * strokes + 0.1 * noise(mm * 0.8));
  }
  // The room's light comes from above left; faces tilted towards it are lit a little more.
  float e = 1.2;
  float dx = heightAt(mm + vec2(e, 0.0)) - heightAt(mm - vec2(e, 0.0));
  float dy = heightAt(mm + vec2(0.0, e)) - heightAt(mm - vec2(0.0, e));
  vec3 n = normalize(vec3(-dx, -dy, 2.0 * e * 0.35));
  vec3 l = normalize(vec3(-0.5, -0.7, 0.9));
  float shade = clamp(0.35 + 0.8 * dot(n, l), 0.0, 1.4);
  outColour = vec4(albedo, shade);
}
`;

export const COMPOSITE = `${HEADER}
uniform sampler2D uWall;
uniform sampler2D uShape;
uniform sampler2D uTag;
uniform sampler2D uEmit;
uniform sampler2D uBloom;
uniform sampler2D uNear;
uniform sampler2D uFar;
uniform sampler2D uShadow;
uniform sampler2D uTubes;
uniform vec2 uResolution;
uniform vec3 uAmbient;
uniform vec2 uShadowOffset;
uniform float uShadowStrength;
uniform vec3 uSun;
uniform float uSunStrength;
uniform float uRefract;
uniform float uRadius;
uniform float uExposure;
uniform float uBloomGain;
uniform float uNearGain;
uniform float uFarGain;
uniform float uSketchGlow;
uniform float uVignette;
uniform float uTime;
out vec4 outColour;
${NOISE}

vec3 glowAt(vec2 uv) {
  return texture(uNear, uv).rgb * uNearGain + texture(uFar, uv).rgb * uFarGain;
}

// The wall: the room's light, less the soft shadow of the sign standing a few centimetres
// off it, plus the light the tubes throw on it.
vec3 wallAt(vec2 uv) {
  vec4 wall = texture(uWall, uv);
  float shadow = clamp(texture(uShadow, uv - uShadowOffset).a * 1.5, 0.0, 1.0);
  vec3 room = uAmbient * wall.a * (1.0 - uShadowStrength * shadow);
  return wall.rgb * (room + glowAt(uv));
}

// The line on the pattern: chalk on a dark wall, graphite on a pale one.
vec3 pencil(vec3 wall, vec3 here) {
  vec3 chalk = vec3(0.86, 0.85, 0.8) * (uAmbient * 0.8 + here + uSketchGlow);
  float pale = smoothstep(0.1, 0.25, dot(wall, vec3(0.2126, 0.7152, 0.0722)) * uExposure);
  return mix(chalk, wall * 0.25, pale);
}

vec3 aces(vec3 x) {
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}

vec3 toSrgb(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;
  ivec2 at = ivec2(gl_FragCoord.xy);
  vec3 colour = wallAt(uv);
  vec4 tag = texelFetch(uTag, at, 0);
  float kind = tag.x - 1.0;
  if (kind > -0.5) {
    vec4 shape = texelFetch(uShape, at, 0);
    int tube = int(shape.w + 0.5);
    vec2 p = shape.xy;
    float r2 = min(dot(p, p), 1.0);
    float r = sqrt(r2);
    vec3 n = vec3(p, sqrt(1.0 - r2));
    vec3 here = glowAt(uv);
    // What a curved surface here would reflect: the room, brighter from above.
    vec3 env = uAmbient * (0.7 + 0.4 * clamp(-n.y, -1.0, 1.0)) + here * 0.35;
    float fresnel = 0.04 + 0.96 * pow(1.0 - n.z, 5.0);
    vec3 halfway = normalize(uSun + vec3(0.0, 0.0, 1.0));
    float spec = pow(max(dot(n, halfway), 0.0), 120.0);
    vec4 form = texelFetch(uTubes, ivec2(tube, 2), 0);
    vec3 surface = colour;
    float cover = tag.z;
    if (kind < 0.5) {
      vec4 glow = texelFetch(uTubes, ivec2(tube, 0), 0);
      vec4 glass = texelFetch(uTubes, ivec2(tube, 1), 0);
      if (shape.z > form.x) {
        // Not bent yet: only the line on the pattern.
        float line = 1.0 - smoothstep(0.9, 1.5, r * uRadius);
        surface = pencil(colour, here);
        cover *= line * 0.85;
      } else {
        // Through a hollow tube the wall shifts a little, more towards the edges.
        vec3 behind = wallAt(uv - p * uRefract * (0.4 + r2));
        float edge = smoothstep(0.55, 1.0, r);
        int type = int(glow.w + 0.5);
        vec3 body;
        if (type == 1) {
          // A phosphor coating is a thin white powder: it scatters the room's light and the
          // tube's own, and lets a little of the wall through.
          float lambert = 0.55 + 0.45 * max(dot(n, uSun), 0.0);
          vec3 diffuse = glass.rgb * (uAmbient * lambert + here * 0.8);
          body = mix(behind * glass.rgb, diffuse, 0.85);
        } else if (type == 2) {
          body = behind * pow(glass.rgb, vec3(1.0 + 2.0 * edge));
        } else {
          body = behind * mix(vec3(0.93), glass.rgb * 0.62, edge);
        }
        body *= 1.0 - 0.3 * edge * edge;
        // Two highlights, from the front of the glass and, fainter, from the inside of the back.
        vec3 back = vec3(-p, n.z);
        float spec2 = pow(max(dot(back, halfway), 0.0), 40.0) * 0.3;
        vec3 shine = env * fresnel + uSunStrength * (spec + spec2) * vec3(1.0, 0.98, 0.95);
        if (tag.y > 0.5) {
          // Blockout paint: a satin black skin over the glass.
          surface = vec3(0.012) * (uAmbient * 0.8 + here) + shine * 0.5;
        } else {
          surface = body * (1.0 - fresnel) + shine;
        }
      }
    } else if (kind < 1.5) {
      // An electrode cap: a black rubber boot where the tube turns back through the wall.
      bool atStart = shape.z < 0.5;
      bool shown = atStart ? form.x > 0.0 : form.x >= form.w - 0.01;
      vec3 shine = env * fresnel * 0.6 + uSunStrength * pow(max(dot(n, halfway), 0.0), 30.0) * 0.35;
      surface = vec3(0.016) * (uAmbient * (0.6 + 0.4 * n.z) + here * 1.5) + shine;
      cover *= shown ? 1.0 : 0.0;
    } else {
      // The line being drawn now.
      surface = pencil(colour, here);
      cover *= 0.85;
    }
    colour = mix(colour, surface, cover);
  }
  colour += texelFetch(uEmit, at, 0).rgb;
  colour += texture(uBloom, uv).rgb * uBloomGain;
  vec2 q = uv - 0.5;
  colour *= 1.0 - uVignette * dot(q, q) * 1.6;
  colour = aces(colour * uExposure);
  colour = toSrgb(colour);
  colour += (hash(gl_FragCoord.xy + fract(uTime) * 61.0) - 0.5) / 255.0;
  outColour = vec4(colour, 1.0);
}
`;
