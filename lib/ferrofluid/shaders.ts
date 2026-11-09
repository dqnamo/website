// The ferrofluid's shaders. The simulation runs in three grids over the same 96 mm square, the
// dish's floor:
//
// - The fluid (64 × 64): how deep it is, how fast it's moving, and the film it leaves on the
//   glass. It flows as a thin layer does, downhill in a pressure made of its own weight, its
//   surface tension, and the pull of the field, which draws it to where the field is strongest.
//   A film hardly moves and a deep layer flows freely, and a thin layer is pushed back into the
//   thicker fluid, as oil that doesn't quite wet glass is.
// - The spikes (96 × 96): the Rosensweig instability. Above a critical field normal to the
//   surface, the flat surface gives way to a lattice of peaks whose spacing is set by surface
//   tension and weight, not by the magnet. This grid holds a Swift–Hohenberg field, the
//   textbook model of that kind of pattern: it grows a hexagonal lattice where the field is
//   past critical, and its quadratic term makes the transition sudden, with hysteresis, as the
//   real one is. A sideways field smooths the pattern along itself, drawing peaks into ridges
//   that lie along the field lines. The pattern rides on the fluid's flow.
// - The surface (384 × 384): depth plus spikes, sharpened into points, ready to draw. Spikes
//   lean along the field, and are only as tall as there's fluid to make them.
//
// Then the table, the fluid as a mesh over that surface (a black mirror where it's deep, brown
// glass where it's a film), and the dish's glass wall.

import { MAX_CHARGES } from "./magnets";

const HEADER = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
#define MAX_CHARGES ${MAX_CHARGES}
// The normal field at which spikes appear, in mT.
#define CRITICAL 22.0
`;

export const QUAD = `#version 300 es
in vec2 aPosition;
void main() {
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

// Texel lookups by hand, since float textures can't be relied on to filter. Positions are in
// texels, with texel i's centre at i.
const SAMPLING = `
vec4 texel(sampler2D t, ivec2 c, int size) {
  return texelFetch(t, clamp(c, ivec2(0), ivec2(size - 1)), 0);
}

vec4 bilinear(sampler2D t, vec2 at, int size) {
  vec2 f = floor(at);
  vec2 w = at - f;
  ivec2 i = ivec2(f);
  vec4 a = texel(t, i, size);
  vec4 b = texel(t, i + ivec2(1, 0), size);
  vec4 c = texel(t, i + ivec2(0, 1), size);
  vec4 d = texel(t, i + ivec2(1, 1), size);
  return mix(mix(a, b, w.x), mix(c, d, w.x), w.y);
}

// Catmull–Rom, for a smooth surface between the grid's points.
vec4 catmull(float t) {
  float t2 = t * t;
  float t3 = t2 * t;
  return vec4(
    -0.5 * t3 + t2 - 0.5 * t,
    1.5 * t3 - 2.5 * t2 + 1.0,
    -1.5 * t3 + 2.0 * t2 + 0.5 * t,
    0.5 * t3 - 0.5 * t2
  );
}

// A cubic B-spline: smoother than Catmull–Rom, at the cost of not passing through the points,
// for the fluid's depth, whose sharp edge would otherwise show the grid.
vec4 bspline(float t) {
  float s = 1.0 - t;
  return vec4(s * s * s, 3.0 * t * t * t - 6.0 * t * t + 4.0, -3.0 * t * t * t + 3.0 * t * t + 3.0 * t + 1.0, t * t * t) / 6.0;
}

vec4 bicubic(sampler2D t, vec2 at, int size, bool smoothed) {
  vec2 f = floor(at);
  vec2 w = at - f;
  ivec2 i = ivec2(f);
  vec4 wx = smoothed ? bspline(w.x) : catmull(w.x);
  vec4 wy = smoothed ? bspline(w.y) : catmull(w.y);
  vec4 sum = vec4(0.0);
  for (int y = 0; y < 4; y++) {
    vec4 row = vec4(0.0);
    for (int x = 0; x < 4; x++) {
      row += texel(t, i + ivec2(x - 1, y - 1), size) * wx[x];
    }
    sum += row * wy[y];
  }
  return sum;
}

// A grid position in millimetres to texel coordinates, for a grid of the given cell size.
vec2 toTexel(vec2 p, float cell, float extent) {
  return (p + extent) / cell - 0.5;
}
`;

// The field from the magnet's pole faces, and the pull it puts on the fluid, as a height of
// fluid: a saturating magnetisation pulls in proportion to the field's square when it's weak
// and its strength when it's strong.
export const FIELD = `${HEADER}
uniform vec4 uCharges[MAX_CHARGES];
uniform int uCount;
uniform float uCell;
uniform float uHalf;
uniform float uPlane;
uniform float uSoft;
out vec4 outValue;

void main() {
  vec3 p = vec3(gl_FragCoord.xy * uCell - uHalf, uPlane);
  vec3 b = vec3(0.0);
  for (int i = 0; i < MAX_CHARGES; i++) {
    if (i >= uCount) break;
    vec4 c = uCharges[i];
    vec3 d = p - c.xyz;
    float r2 = dot(d, d) + uSoft * uSoft;
    b += c.w * d / (r2 * sqrt(r2));
  }
  float strength = length(b);
  float head = strength * strength / (strength + 15.0) / 14.0;
  outValue = vec4(b, head);
}
`;

const FLUID_GRID = `
uniform sampler2D uFluid;
uniform float uCell;
uniform float uHalf;
uniform float uRadius;
uniform int uSize;

bool inside(ivec2 c) {
  if (any(lessThan(c, ivec2(0))) || any(greaterThanEqual(c, ivec2(uSize)))) {
    return false;
  }
  vec2 p = (vec2(c) + 0.5) * uCell - uHalf;
  return dot(p, p) < uRadius * uRadius;
}
`;

// The pressure the fluid flows down, in millimetres of fluid: its depth, less the field's pull,
// less surface tension's tug towards a flatter surface. Oil on glass doesn't wet it completely,
// so a thin layer is under a little extra pressure that drives it back into the thicker fluid,
// and the fluid gathers into a body with an edge rather than coating the whole floor. The wall
// is a mirror, so no flow crosses it.
export const PRESSURE = `${HEADER}
${FLUID_GRID}
uniform sampler2D uField;
uniform float uTension;
out vec4 outValue;

float depthAt(ivec2 c, float fallback) {
  return inside(c) ? texelFetch(uFluid, c, 0).r : fallback;
}

void main() {
  ivec2 c = ivec2(gl_FragCoord.xy);
  float h = texelFetch(uFluid, c, 0).r;
  float lap = depthAt(c + ivec2(1, 0), h) + depthAt(c - ivec2(1, 0), h)
    + depthAt(c + ivec2(0, 1), h) + depthAt(c - ivec2(0, 1), h) - 4.0 * h;
  float head = texelFetch(uField, c, 0).a;
  float dewet = 0.9 * exp(-h);
  outValue = vec4(h - head + dewet - uTension * lap / (uCell * uCell), 0.0, 0.0, 1.0);
}
`;

// One step of flow. What leaves a cell across a face is what its neighbour gains, worked out
// the same way on both sides, so the fluid's volume never changes. Each face draws on the cell
// upstream of it, and can't take more than a fifth of that cell, so no cell goes below empty.
export const FLOW = `${HEADER}
${FLUID_GRID}
uniform sampler2D uPressure;
uniform float uDt;
uniform float uMobility;
uniform float uFilmKeep;
out vec4 outValue;

// How readily the layer flows: hardly at all as a film, freely once it's a millimetre deep.
float mobility(float h) {
  float h2 = h * h;
  return uMobility * (h2 + 0.01) / (0.25 + h2);
}

float outflow(ivec2 c, float h, float p, ivec2 n) {
  if (!inside(n)) return 0.0;
  float hn = texelFetch(uFluid, n, 0).r;
  float pn = texelFetch(uPressure, n, 0).r;
  float up = p > pn ? h : hn;
  float f = mobility(up) * (p - pn) / (uCell * uCell) * uDt;
  return clamp(f, -0.2 * up, 0.2 * up);
}

void main() {
  ivec2 c = ivec2(gl_FragCoord.xy);
  if (!inside(c)) {
    // Beyond the wall nothing flows, but these cells copy the fluid beside them, so that
    // drawing, which samples across the wall, sees a smooth edge rather than the grid's steps.
    vec4 sum = vec4(0.0);
    float weight = 0.0;
    for (int j = -1; j <= 1; j++) {
      for (int i = -1; i <= 1; i++) {
        ivec2 n = c + ivec2(i, j);
        if ((i == 0 && j == 0) || any(lessThan(n, ivec2(0))) || any(greaterThanEqual(n, ivec2(uSize)))) continue;
        float w = inside(n) ? 1.0 : 0.25;
        sum += texelFetch(uFluid, n, 0) * w;
        weight += w;
      }
    }
    outValue = weight > 0.0 ? sum / weight : vec4(0.0);
    return;
  }
  vec4 fluid = texelFetch(uFluid, c, 0);
  float h = fluid.r;
  float p = texelFetch(uPressure, c, 0).r;
  float east = outflow(c, h, p, c + ivec2(1, 0));
  float west = outflow(c, h, p, c - ivec2(1, 0));
  float north = outflow(c, h, p, c + ivec2(0, 1));
  float south = outflow(c, h, p, c - ivec2(0, 1));
  float next = max(h - east - west - north - south, 0.0);
  // The flow through the cell as a speed, in mm/s, to carry the spikes along.
  vec2 speed = vec2(east - west, north - south) * 0.5 * uCell / uDt / max(next, 0.08);
  // Where fluid has been, a film stays on the glass, creeps out a little at its edge and
  // slowly drains away.
  float around = 0.0;
  float count = 0.0;
  for (int k = 0; k < 4; k++) {
    ivec2 n = c + ivec2(k == 0 ? 1 : k == 1 ? -1 : 0, k == 2 ? 1 : k == 3 ? -1 : 0);
    if (inside(n)) {
      around += texelFetch(uFluid, n, 0).a;
      count += 1.0;
    }
  }
  float spread = mix(fluid.a, around / max(count, 1.0), min(uDt * 4.0, 1.0));
  float film = max(spread * uFilmKeep, min(next, 0.004));
  outValue = vec4(next, speed, film);
}
`;

// Scales the fluid's depth, when some is added or taken away.
export const RESCALE = `${HEADER}
uniform sampler2D uFluid;
uniform float uScale;
out vec4 outValue;

void main() {
  vec4 fluid = texelFetch(uFluid, ivec2(gl_FragCoord.xy), 0);
  outValue = vec4(fluid.r * uScale, fluid.gb, fluid.a);
}
`;

// Moves the spike pattern along with the fluid that carries it, looking back along the flow.
export const ADVECT = `${HEADER}
${SAMPLING}
uniform sampler2D uSpikes;
uniform sampler2D uFluid;
uniform float uCell;
uniform float uFluidCell;
uniform float uHalf;
uniform float uDt;
uniform int uSize;
uniform int uFluidSize;
out vec4 outValue;

void main() {
  vec2 p = gl_FragCoord.xy * uCell - uHalf;
  vec2 speed = bilinear(uFluid, toTexel(p, uFluidCell, uHalf), uFluidSize).gb;
  vec2 from = p - speed * uDt;
  outValue = vec4(bilinear(uSpikes, toTexel(from, uCell, uHalf), uSize).r, 0.0, 0.0, 1.0);
}
`;

// The Swift–Hohenberg model, ∂u/∂t = εu − (1 + ∇²/q²)²u + gu² − u³, written in grid units
// (times q⁴). It's split in two passes: this one works out w = (q² + ∇²)u, and the next applies
// (q² + ∇²) to w. The Laplacian is the nine-point isotropic one, so the lattice has no
// favourite direction.
const SWIFT = `
uniform sampler2D uSpikes;
uniform sampler2D uField;
uniform sampler2D uFluid;
uniform float uCell;
uniform float uFluidCell;
uniform float uHalf;
uniform float uRadius;
uniform int uSize;
uniform int uFluidSize;
// The wavenumber at the critical field: a peak every 7 cells, 7 mm apart.
const float Q = 0.8976;
const float Q4 = Q * Q * Q * Q;

float laplacian(sampler2D t, ivec2 c) {
  float edges = texel(t, c + ivec2(1, 0), uSize).r + texel(t, c - ivec2(1, 0), uSize).r
    + texel(t, c + ivec2(0, 1), uSize).r + texel(t, c - ivec2(0, 1), uSize).r;
  float corners = texel(t, c + ivec2(1, 1), uSize).r + texel(t, c + ivec2(-1, 1), uSize).r
    + texel(t, c + ivec2(1, -1), uSize).r + texel(t, c + ivec2(-1, -1), uSize).r;
  return (4.0 * edges + corners - 20.0 * texel(t, c, uSize).r) / 6.0;
}

// How far past critical the field is here.
float drive(vec4 field) {
  return abs(field.z) / CRITICAL;
}

// A stronger field packs the peaks a little closer.
float wavenumber2(float d) {
  float q = Q * (1.0 + 0.12 * clamp(d - 1.0, 0.0, 2.0));
  return q * q;
}
`;

export const SWIFT_W = `${HEADER}
${SAMPLING}
${SWIFT}
out vec4 outValue;

void main() {
  ivec2 c = ivec2(gl_FragCoord.xy);
  vec2 p = gl_FragCoord.xy * uCell - uHalf;
  vec4 field = bilinear(uField, toTexel(p, uFluidCell, uHalf), uFluidSize);
  float u = texelFetch(uSpikes, c, 0).r;
  outValue = vec4(wavenumber2(drive(field)) * u + laplacian(uSpikes, c), 0.0, 0.0, 1.0);
}
`;

export const SWIFT_U = `${HEADER}
${SAMPLING}
${SWIFT}
uniform sampler2D uW;
uniform float uDt;
uniform float uSeed;
uniform float uNoise;
out vec4 outValue;

float hash(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * 0.1031 + uSeed);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}

void main() {
  ivec2 c = ivec2(gl_FragCoord.xy);
  vec2 p = gl_FragCoord.xy * uCell - uHalf;
  if (length(p) > uRadius) {
    outValue = vec4(0.0);
    return;
  }
  vec4 field = bilinear(uField, toTexel(p, uFluidCell, uHalf), uFluidSize);
  float depth = bilinear(uFluid, toTexel(p, uFluidCell, uHalf), uFluidSize).r;
  float u = texelFetch(uSpikes, c, 0).r;
  float w = texelFetch(uW, c, 0).r;
  float d = drive(field);

  // Past critical the flat surface is unstable; short of it, it's stable. A film too thin to
  // stand up in points can't make spikes at all.
  float epsilon = 0.45 * (d - 1.0) - 1.6 * (1.0 - smoothstep(0.12, 0.55, depth));
  epsilon = clamp(epsilon, -1.5, 0.45);
  float change = Q4 * (epsilon * u + 1.1 * u * u - u * u * u) - (wavenumber2(d) * w + laplacian(uW, c));

  // A field along the surface smooths the pattern in its own direction, so peaks merge into
  // ridges running along the field lines.
  vec2 along = field.xy;
  float sideways = dot(along, along);
  if (sideways > 1.0) {
    float beta = 0.6 * sideways / (sideways + field.z * field.z + 40.0);
    vec2 t = along * inversesqrt(sideways);
    float uxx = texel(uSpikes, c + ivec2(1, 0), uSize).r + texel(uSpikes, c - ivec2(1, 0), uSize).r - 2.0 * u;
    float uyy = texel(uSpikes, c + ivec2(0, 1), uSize).r + texel(uSpikes, c - ivec2(0, 1), uSize).r - 2.0 * u;
    float uxy = 0.25 * (texel(uSpikes, c + ivec2(1, 1), uSize).r - texel(uSpikes, c + ivec2(1, -1), uSize).r
      - texel(uSpikes, c + ivec2(-1, 1), uSize).r + texel(uSpikes, c + ivec2(-1, -1), uSize).r);
    change += beta * (t.x * t.x * uxx + 2.0 * t.x * t.y * uxy + t.y * t.y * uyy);
  }

  // A whisper of noise, as the real surface always has, for the pattern to grow from.
  float noise = epsilon > -0.3 ? uNoise * (hash(gl_FragCoord.xy) - 0.5) : 0.0;
  outValue = vec4(clamp(u + uDt * change + noise, -3.0, 3.0), 0.0, 0.0, 1.0);
}
`;

// The tallest peak nearby, along one axis at a time, so each spike can be shaped to a point
// against its own height.
export const PEAK = `${HEADER}
uniform sampler2D uSource;
uniform ivec2 uAxis;
uniform int uSize;
out vec4 outValue;

void main() {
  ivec2 c = ivec2(gl_FragCoord.xy);
  float most = -3.0;
  for (int i = -4; i <= 4; i++) {
    most = max(most, texelFetch(uSource, clamp(c + uAxis * i, ivec2(0), ivec2(uSize - 1)), 0).r);
  }
  outValue = vec4(most, 0.0, 0.0, 1.0);
}
`;

// The surface to draw: the fluid's depth, with spikes on it. The pattern is smooth, so each
// peak is reshaped into a cone with a fine point and slightly hollow flanks, as real spikes
// are. Spikes stand along the field, so they lean outwards round the edge of a magnet.
export const SURFACE = `${HEADER}
${SAMPLING}
uniform sampler2D uFluid;
uniform sampler2D uSpikes;
uniform sampler2D uPeak;
uniform sampler2D uField;
uniform float uCell;
uniform float uFluidCell;
uniform float uSpikeCell;
uniform float uHalf;
uniform float uRadius;
uniform int uFluidSize;
uniform int uSpikeSize;
out vec4 outValue;

float hash(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * 0.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = p - i;
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}

void main() {
  vec2 p = gl_FragCoord.xy * uCell - uHalf;
  if (length(p) > uRadius + 1.0) {
    outValue = vec4(0.0);
    return;
  }
  vec2 atFluid = toTexel(p, uFluidCell, uHalf);
  vec2 atSpike = toTexel(p, uSpikeCell, uHalf);
  vec4 fluid = bicubic(uFluid, atFluid, uFluidSize, true);
  float depth = max(fluid.r, 0.0);
  // A film never drains evenly: it's left in blotches and tide marks.
  float blotch = 0.6 * noise(p * 0.07) + 0.4 * noise(p * 0.23 + 7.0);
  float film = max(fluid.a, 0.0) * (0.45 + 0.9 * blotch);
  float u = bicubic(uSpikes, atSpike, uSpikeSize, false).r;
  float peak = bilinear(uPeak, atSpike, uSpikeSize).r;
  vec4 field = bilinear(uField, atFluid, uFluidSize);
  float d = abs(field.z) / CRITICAL;

  // A hexagonal pattern runs from half its height below zero to its peaks, so this spans each
  // spike's whole cell, from the hollows between to a point at the top.
  float x = clamp((u / max(peak, 0.05) + 0.5) / 1.5, 0.0, 1.0);
  float shape = pow(1.0 - sqrt(1.0 - x), 1.7);
  float grown = smoothstep(0.1, 0.55, peak);
  float tall = grown * min(3.4 * clamp(0.6 + 0.4 * d, 0.0, 2.2), 1.8 * depth + 0.05);
  float z = max(depth + tall * (shape - 0.18), 0.0);

  vec2 lean = field.xy / max(abs(field.z), 6.0);
  lean *= min(1.0, 0.7 / max(length(lean), 1e-4));
  vec2 offset = lean * tall * shape * 0.5;

  // What's left on the glass after the fluid has gone isn't really a layer the flow can model,
  // so the thinnest fluid is drawn as the film it would be.
  float optical = z * mix(0.3, 1.0, smoothstep(0.04, 0.12, z));
  outValue = vec4(z, offset, max(optical, film));
}
`;

// The room the dish sits in, as the black mirror of the fluid sees it, and the table.
const SCENE = `
uniform int uLight;
uniform vec3 uTable;
uniform vec3 uRoom;
uniform vec4 uMagnet;   // x, y, angle, kind (−1 when it's been taken away)
uniform float uOutline;
uniform float uDishOuter;

// A soft-edged rectangle of light in the direction 'axis', 'size' wide in tangent units.
float panel(vec3 d, vec3 axis, vec3 right, vec2 size, float soft) {
  float along = dot(d, axis);
  if (along <= 0.0) return 0.0;
  vec3 up = cross(right, axis);
  vec2 q = vec2(dot(d, right), dot(d, up)) / along;
  vec2 edge = smoothstep(size + soft, size - soft, abs(q));
  return edge.x * edge.y;
}

vec3 environment(vec3 d) {
  // The walls catch some light; the ceiling is dim.
  vec3 colour = uRoom * (1.0 - 0.6 * smoothstep(0.05, 0.8, d.z));
  if (d.z < 0.0) {
    // Looking down: the table, fading into the room towards its far edge.
    return mix(colour, uTable * 0.85, smoothstep(0.0, -0.3, d.z));
  }
  if (uLight == 0) {
    // A big softbox overhead, a little in front of the dish, and a strip light to the right.
    colour += vec3(18.0) * panel(d, normalize(vec3(0.0, -0.35, 1.0)), vec3(1.0, 0.0, 0.0), vec2(0.42, 0.3), 0.03);
    colour += vec3(11.0, 10.6, 10.0) * panel(d, normalize(vec3(1.0, 0.1, 0.4)), normalize(vec3(0.1, -1.0, 0.0)), vec2(0.06, 0.7), 0.02);
  } else if (uLight == 1) {
    // A tall window on the left with glazing bars, and a warm lamp across the room.
    vec3 axis = normalize(vec3(-1.0, 0.35, 0.5));
    vec3 right = normalize(vec3(0.35, 1.0, 0.0));
    float along = dot(d, axis);
    if (along > 0.0) {
      vec3 up = cross(right, axis);
      vec2 q = vec2(dot(d, right), dot(d, up)) / along;
      vec2 edge = smoothstep(vec2(0.62, 0.7), vec2(0.58, 0.66), abs(q));
      vec2 bars = smoothstep(0.025, 0.045, abs(fract(q * vec2(2.4, 2.1) + 0.5) - 0.5));
      float sky = 0.55 + 0.45 * smoothstep(-0.7, 0.7, q.y);
      colour += vec3(12.0, 13.0, 15.5) * sky * edge.x * edge.y * bars.x * bars.y;
    }
    colour += vec3(9.0, 6.2, 3.4) * panel(d, normalize(vec3(1.0, 0.9, 0.45)), normalize(vec3(0.9, -1.0, 0.0)), vec2(0.07, 0.07), 0.03);
  } else {
    // A ring light round the camera: a bright ring in every spike.
    vec3 axis = normalize(vec3(0.0, -0.78, 0.63));
    float a = acos(clamp(dot(d, axis), -1.0, 1.0));
    colour += vec3(16.0) * smoothstep(0.04, 0.015, abs(a - 0.3));
    colour += vec3(0.12) * panel(d, normalize(vec3(0.0, 0.35, 1.0)), vec3(1.0, 0.0, 0.0), vec2(0.6, 0.4), 0.3);
  }
  return colour;
}

float boxDistance(vec2 p, vec2 size) {
  vec2 q = abs(p) - size;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
}

// The magnet's outline, from above, as a distance in millimetres.
float magnetDistance(vec2 p) {
  vec2 q = p - uMagnet.xy;
  float c = cos(uMagnet.z);
  float s = sin(uMagnet.z);
  q = vec2(c * q.x + s * q.y, -s * q.x + c * q.y);
  int kind = int(uMagnet.w + 0.5);
  if (kind == 0) return abs(length(q) - 10.0);
  if (kind == 1) return min(abs(length(q) - 15.0), abs(length(q) - 7.0));
  if (kind == 2) return abs(boxDistance(q, vec2(25.0, 6.0)));
  if (kind == 3) return min(abs(length(q - vec2(19.0, 0.0)) - 10.0), abs(length(q + vec2(19.0, 0.0)) - 10.0));
  return min(abs(length(q) - 11.0), abs(length(q) - 19.0));
}

float outline(vec2 p) {
  if (uMagnet.w < -0.5) return 0.0;
  float d = magnetDistance(p);
  float w = fwidth(d) + 0.001;
  return smoothstep(0.32 + w, 0.32, d);
}

// The table: a pool of light under the lamp, the glass dish's soft shadow, and the bright line
// its curved wall focuses beside it.
vec3 table(vec2 p) {
  float pool = 0.86 + 0.2 * exp(-dot(p - vec2(0.0, 25.0), p - vec2(0.0, 25.0)) / 22000.0);
  float r = length(p - vec2(0.0, -5.0));
  float shade = 1.0 - 0.16 * smoothstep(uDishOuter + 11.0, uDishOuter - 2.0, r) * smoothstep(uDishOuter - 6.0, uDishOuter, r);
  shade += 0.12 * smoothstep(1.6, 0.0, abs(r - uDishOuter - 3.0)) * smoothstep(-20.0, 30.0, -p.y);
  vec3 colour = uTable * pool * shade;
  vec3 ink = mix(uTable * 0.55, vec3(0.5), 0.3);
  return mix(colour, ink, outline(p) * uOutline);
}

// Linear to sRGB, rolling off highlights so the lights' reflections don't clip hard.
vec3 encode(vec3 c) {
  vec3 over = max(c - 0.8, 0.0);
  c = min(c, 0.8) + 0.2 * (1.0 - exp(-over / 0.2));
  return mix(12.92 * c, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}
`;

export const BACKGROUND = `${HEADER}
${SCENE}
uniform mat4 uInverse;
uniform vec2 uResolution;
uniform vec3 uCamera;
uniform int uOverlay;
out vec4 outColor;

void main() {
  vec2 ndc = gl_FragCoord.xy / uResolution * 2.0 - 1.0;
  vec4 far = uInverse * vec4(ndc, 1.0, 1.0);
  vec3 dir = normalize(far.xyz / far.w - uCamera);
  float t = -uCamera.z / min(dir.z, -1e-4);
  vec2 p = (uCamera + dir * t).xy;
  if (uOverlay == 1) {
    // While the magnet's being dragged, its outline shows through everything.
    float a = outline(p) * 0.55;
    outColor = vec4(vec3(0.5) * a, a);
    return;
  }
  outColor = vec4(encode(table(p)), 1.0);
}
`;

export const FLUID_VERTEX = `${HEADER}
uniform sampler2D uSurface;
uniform mat4 uViewProjection;
uniform float uCell;
uniform float uHalf;
uniform int uSize;
out vec3 vWorld;
out vec3 vNormal;
out vec2 vBase;
out float vThickness;
out float vCavity;

vec4 sampleAt(ivec2 c) {
  return texelFetch(uSurface, clamp(c, ivec2(0), ivec2(uSize - 1)), 0);
}

vec3 pointAt(ivec2 c) {
  vec4 s = sampleAt(c);
  vec2 p = (vec2(clamp(c, ivec2(0), ivec2(uSize - 1))) + 0.5) * uCell - uHalf;
  return vec3(p + s.yz, s.x);
}

void main() {
  ivec2 c = ivec2(gl_VertexID % uSize, gl_VertexID / uSize);
  vec4 s = sampleAt(c);
  vec3 p = pointAt(c);
  vec3 dx = pointAt(c + ivec2(1, 0)) - pointAt(c - ivec2(1, 0));
  vec3 dy = pointAt(c + ivec2(0, 1)) - pointAt(c - ivec2(0, 1));
  vNormal = normalize(cross(dx, dy));
  // How far below its surroundings this point sits: hollows between spikes see less of the room.
  float around = sampleAt(c + ivec2(4, 0)).x + sampleAt(c - ivec2(4, 0)).x
    + sampleAt(c + ivec2(0, 4)).x + sampleAt(c - ivec2(0, 4)).x;
  vCavity = max(around * 0.25 - s.x, 0.0);
  vWorld = p;
  vBase = (vec2(c) + 0.5) * uCell - uHalf;
  vThickness = s.w;
  gl_Position = uViewProjection * vec4(p, 1.0);
}
`;

export const FLUID_FRAGMENT = `${HEADER}
${SCENE}
uniform vec3 uCamera;
uniform float uRadius;
uniform sampler2D uSurface;
uniform float uCell;
uniform float uHalf;
uniform int uSize;
in vec3 vWorld;
in vec3 vNormal;
in vec2 vBase;
in float vThickness;
in float vCavity;
out vec4 outColor;

// The fluid's height at a point, for the shadow it throws on the glass.
float heightAt(vec2 p) {
  vec2 at = (p + uHalf) / uCell - 0.5;
  vec2 f = floor(at);
  vec2 w = at - f;
  ivec2 i = ivec2(f);
  ivec2 top = ivec2(uSize - 1);
  float a = texelFetch(uSurface, clamp(i, ivec2(0), top), 0).x;
  float b = texelFetch(uSurface, clamp(i + ivec2(1, 0), ivec2(0), top), 0).x;
  float c = texelFetch(uSurface, clamp(i + ivec2(0, 1), ivec2(0), top), 0).x;
  float d = texelFetch(uSurface, clamp(i + ivec2(1, 1), ivec2(0), top), 0).x;
  return mix(mix(a, b, w.x), mix(c, d, w.x), w.y);
}

void main() {
  if (length(vBase) > uRadius) discard;
  vec3 n = normalize(vNormal);
  vec3 v = normalize(uCamera - vWorld);
  float facing = max(dot(n, v), 0.0);
  // Oil reflects about 4% face on, and almost everything at a glancing angle.
  float fresnel = 0.045 + 0.955 * pow(1.0 - facing, 5.0);
  vec3 reflected = environment(reflect(-v, n));
  float hollow = 1.0 - clamp(vCavity * 0.35, 0.0, 0.75);

  // Ferrofluid is magnetite in oil: black once it's a twentieth of a millimetre deep, and a
  // brown glass as a film, since it holds back blue more than red.
  float t = vThickness;
  vec3 through = exp(-t * vec3(60.0, 100.0, 170.0));
  float wet = 1.0 - exp(-t * 120.0);

  // The lamp is overhead, so a mound throws a soft shadow just round its foot.
  float shadow = 1.0;
  if (t < 0.4) {
    for (int i = 1; i <= 10; i++) {
      float s = float(i) * 0.9;
      float rise = heightAt(vWorld.xy + vec2(0.0, -0.35) * s) - (vWorld.z + s);
      shadow = min(shadow, 1.0 - 0.4 * smoothstep(-1.0, 2.0, rise));
    }
  }
  vec3 floorColour = table(vWorld.xy) * shadow * through;
  vec3 colour = floorColour + reflected * fresnel * mix(0.3, 1.0, wet) * hollow;
  outColor = vec4(encode(colour), 1.0);
}
`;

export const GLASS_VERTEX = `${HEADER}
in vec3 aPosition;
in vec3 aNormal;
uniform mat4 uViewProjection;
out vec3 vWorld;
out vec3 vNormal;

void main() {
  vWorld = aPosition;
  vNormal = aNormal;
  gl_Position = uViewProjection * vec4(aPosition, 1.0);
}
`;

// The dish's wall: clear glass that reflects the room at a glancing angle, and looks greener
// and darker where you see through more of it, along its edge.
export const GLASS_FRAGMENT = `${HEADER}
${SCENE}
uniform vec3 uCamera;
in vec3 vWorld;
in vec3 vNormal;
out vec4 outColor;

void main() {
  vec3 n = normalize(vNormal);
  vec3 v = normalize(uCamera - vWorld);
  if (dot(n, v) < 0.0) n = -n;
  float facing = max(dot(n, v), 0.02);
  float fresnel = 0.04 + 0.96 * pow(1.0 - facing, 5.0);
  vec3 reflected = environment(reflect(-v, n));
  float path = 1.0 - exp(-0.05 / facing);
  vec3 tint = uTable * vec3(0.55, 0.72, 0.66) * 0.5;
  vec3 colour = reflected * fresnel + tint * path;
  float alpha = clamp(fresnel + path * 0.6, 0.0, 1.0);
  outColor = vec4(encode(colour / max(alpha, 1e-3)) * alpha, alpha);
}
`;
