// The polariscope's one shader. Every pixel works out where it is on the light box and what
// lies on it, then follows the light up from the lamp.
//
// Light leaves the lamp unpolarised, and the polarising film over it keeps one direction of
// vibration. Clear tape and stressed plastic are birefringent: light vibrating along one axis
// travels a touch slower than light vibrating across it, so after passing through, the two
// parts are out of step by the retardance, a few hundred nanometres. That turns the light's
// polarisation in a way that depends on wavelength. The eye can't see polarisation, so outside
// the filter the tape is all but invisible. Through the filter (a second polariser) only the
// part of each wavelength that lines up with it gets through, and the light that remains is
// coloured: the interference colours of the Michel-Lévy chart.
//
// The field is followed as two complex amplitudes (Jones vectors), one wavelength at a time,
// through each layer in the order it was laid, since tape crossing tape doesn't commute. The
// disc has a single layer whose retardance and axis vary smoothly with the stress inside it,
// so its intensity is worked out in closed form instead; that lets the fringes be averaged over
// each pixel and each band of wavelengths, so where they crowd together near the jaws they fade
// to the pale high-order white that real plastic shows rather than shimmering.

import { SAMPLES } from "./spectrum";

export const MAX_STRIPS = 64;
export const MAX_LOADS = 4;

export const VERTEX = `#version 300 es
in vec2 aPosition;
void main() {
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

export const FRAGMENT = `#version 300 es
precision highp float;

#define SAMPLES ${SAMPLES}
#define MAX_STRIPS ${MAX_STRIPS}
#define MAX_LOADS ${MAX_LOADS}
#define MAX_LAYERS 16
#define TAU 6.28318530718

uniform vec2 uSize;
uniform float uRatio;
uniform vec4 uWeights[SAMPLES];
uniform float uFirst;
uniform float uStep;
uniform float uExposure;
uniform float uSeed;

uniform vec3 uSurround;
// The light box's outer edge, the lamp's diffuser inside its bezel, and the polarising film.
uniform vec4 uBox;
uniform vec4 uLamp;
uniform vec4 uFilm;

uniform float uPolariser;
uniform float uAnalyser;
// 0 for none, 1 for a pair of quarter-wave plates (circular light), 2 for a first-order red plate.
uniform int uPlate;
// The filter: centre, the radius of its glass, then the width of its ring.
uniform vec4 uFilter;

uniform int uSpecimen;
uniform int uStripCount;
uniform vec4 uStripEnds[MAX_STRIPS];
// Half width, retardance in nanometres, a seed, and haze (0 for office tape, 1 for packing tape).
uniform vec4 uStripInfo[MAX_STRIPS];

// The disc: centre and radius, then how far the crack has opened.
uniform vec4 uDisc;
uniform int uLoadCount;
// Where each force meets the rim, its strength, and the half width of the contact.
uniform vec4 uLoads[MAX_LOADS];
// How far the crack has run (0–1), the knob's turn in radians, the fingertips' reach (0–1), and
// the pinch's angle.
uniform vec4 uRig;

out vec4 outColor;

float hash(float n) {
  return fract(sin(n) * 43758.5453123);
}

float hash2(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise1(float x) {
  float i = floor(x);
  float f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(hash(i), hash(i + 1.0), f);
}

float roundedBox(vec2 p, vec4 rect, float radius) {
  vec2 centre = 0.5 * (rect.xy + rect.zw);
  vec2 half_ = 0.5 * (rect.zw - rect.xy) - radius;
  vec2 q = abs(p - centre) - half_;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - radius;
}

// A rounded box's signed distance and the direction away from its edge.
vec3 boxSd(vec2 p, vec2 centre, vec2 size, float radius) {
  vec2 d = p - centre;
  vec2 w = abs(d) - (size - radius);
  vec2 s = vec2(d.x < 0.0 ? -1.0 : 1.0, d.y < 0.0 ? -1.0 : 1.0);
  float g = max(w.x, w.y);
  vec2 q = max(w, 0.0);
  float l = length(q);
  vec2 grad = s * ((g > 0.0) ? q / max(l, 1e-4) : ((w.x > w.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0)));
  return vec3(((g > 0.0) ? l : g) - radius, grad);
}

vec3 unite(vec3 a, vec3 b) {
  return a.x < b.x ? a : b;
}

// Plain dark metal lit by the room from above left: dull in the middle, bright where its
// rounded edges turn towards the light.
vec3 metal(vec3 sd, float bevel, float base) {
  float t = clamp(1.0 + sd.x / bevel, 0.0, 1.0);
  vec2 slope = sd.yz * t;
  vec3 normal = normalize(vec3(slope, 1.0 - 0.6 * t));
  vec3 light = normalize(vec3(-0.45, -0.75, 0.6));
  float lit = max(dot(normal, light), 0.0);
  float shine = pow(max(dot(normal, normalize(light + vec3(0.0, 0.0, 1.0))), 0.0), 18.0);
  return vec3(base) * (0.45 + 0.75 * lit) + vec3(0.5) * shine;
}

// The part of a Jones vector (x and y, each complex) along axis u gets left alone; the part
// across it is delayed by phase delta.
vec4 retard(vec4 e, vec2 u, float delta) {
  vec2 along = u.x * e.xy + u.y * e.zw;
  vec2 across = -u.y * e.xy + u.x * e.zw;
  float c = cos(delta);
  float s = sin(delta);
  across = vec2(across.x * c - across.y * s, across.x * s + across.y * c);
  return vec4(u.x * along - u.y * across, u.y * along + u.x * across);
}

vec2 project(vec2 axis, vec4 e) {
  return axis.x * e.xy + axis.y * e.zw;
}

vec2 dir(float angle) {
  return vec2(cos(angle), sin(angle));
}

// What the wave plates do at one wavelength, before the specimen and after it.
vec4 platesBefore(vec4 e, float nm) {
  if (uPlate == 1) return retard(e, dir(uPolariser + 0.7853982), TAU * 140.0 / nm);
  return e;
}

vec4 platesAfter(vec4 e, float nm) {
  if (uPlate == 1) return retard(e, dir(uAnalyser + 0.7853982), TAU * 140.0 / nm);
  if (uPlate == 2) return retard(e, dir(uAnalyser - 0.7853982), TAU * 530.0 / nm);
  return e;
}

// The stress in the disc at p as (xx, yy, xy). Each force on the rim pushes straight out from
// where it lands, falling off with distance (Flamant's solution); forces in balance add up to
// the disc's whole field, give or take an even pressure that photoelasticity can't see.
vec3 stressAt(vec2 p) {
  vec2 centre = uDisc.xy;
  float radius = uDisc.z;
  vec3 sigma = vec3(0.0);
  for (int i = 0; i < MAX_LOADS; i++) {
    if (i >= uLoadCount) break;
    vec4 load = uLoads[i];
    vec2 inward = normalize(centre - load.xy);
    vec2 v = p - load.xy;
    float r = sqrt(dot(v, v) + load.w * load.w);
    vec2 u = v / r;
    float along = max(dot(u, inward), 0.0);
    float push = -load.z * along / r;
    sigma += push * vec3(u.x * u.x, u.y * u.y, u.x * u.y);
  }
  // Moulding leaves the rim in a little tension of its own.
  vec2 fromCentre = p - centre;
  float r = length(fromCentre);
  vec2 around = vec2(-fromCentre.y, fromCentre.x) / max(r, 1e-3);
  float rim = 70.0 * exp(-(radius - r) / (0.06 * radius));
  sigma += rim * vec3(around.x * around.x, around.y * around.y, around.x * around.y);
  // Once split, the faces of the crack keep a trace of the strain they let go of.
  if (uDisc.w > 0.0) {
    float away = abs(p.x - centre.x);
    sigma += vec3(0.0, 140.0 * exp(-away / 5.0) * uRig.x, 0.0);
  }
  return sigma;
}

// The crack's path down the middle of the disc, wandering a pixel or two.
float crackLine(float y) {
  return uDisc.x + (noise1(y * 0.21 + 3.0) - 0.5) * 3.0 + (noise1(y * 0.9) - 0.5) * 1.2;
}

struct Clamp {
  vec3 sd;
  float base;
};

// The test rig: two posts, a crosshead with a screw down through it to the top jaw, and a
// T-handle that foreshortens as it turns.
Clamp rig(vec2 p) {
  vec2 c = uDisc.xy;
  float R = uDisc.z;
  float jawH = max(4.0, 0.05 * R);
  float barH = max(6.0, 0.075 * R);
  float post = max(5.0, 0.06 * R);
  float reach = R + 0.2 * R + post;
  float topBar = c.y - R - 2.0 * jawH - barH;
  float baseBar = c.y + R + 2.0 * jawH + barH;
  vec3 shape = boxSd(p, vec2(c.x, c.y - R - jawH), vec2(0.24 * R, jawH), 1.5);
  shape = unite(shape, boxSd(p, vec2(c.x, c.y + R + jawH), vec2(0.24 * R, jawH), 1.5));
  shape = unite(shape, boxSd(p, vec2(c.x, topBar), vec2(reach + post, barH), 2.5));
  shape = unite(shape, boxSd(p, vec2(c.x, baseBar), vec2(reach + post, barH), 2.5));
  float postMid = 0.5 * (topBar + baseBar);
  float postHalf = 0.5 * (baseBar - topBar);
  shape = unite(shape, boxSd(p, vec2(c.x - reach, postMid), vec2(post, postHalf), 2.0));
  shape = unite(shape, boxSd(p, vec2(c.x + reach, postMid), vec2(post, postHalf), 2.0));
  // The screw, threaded where it stands clear of the crosshead.
  float screwTop = topBar - barH - 0.32 * R;
  float screwW = max(3.0, 0.04 * R);
  vec3 screw = boxSd(p, vec2(c.x, 0.5 * (screwTop + topBar)), vec2(screwW, 0.5 * (topBar - screwTop)), 1.0);
  float base = 0.11;
  if (screw.x < 0.0 && p.y < topBar - barH) {
    float thread = fract((p.y + p.x * 0.35) / 2.2 + uRig.y * 0.5);
    base = mix(0.07, 0.2, smoothstep(0.3, 0.5, thread) - smoothstep(0.6, 0.9, thread));
  }
  shape = unite(shape, screw);
  // The T-handle, turning about the screw.
  float handle = 0.3 * R;
  float span = max(abs(cos(uRig.y)) * handle, screwW + 1.0);
  shape = unite(shape, boxSd(p, vec2(c.x, screwTop), vec2(span, max(3.0, 0.035 * R)), 2.5));
  vec3 knob = boxSd(p, vec2(c.x, screwTop), vec2(max(6.0, 0.08 * R)), max(6.0, 0.08 * R));
  shape = unite(shape, knob);
  if (shape.x == screw.x) return Clamp(shape, base);
  return Clamp(shape, 0.1);
}

// A fingertip pressing on the rim, seen from above: the back of the finger and its nail lit by
// the room, and the thin edge of the skin glowing red where the lamp shines through it.
vec4 finger(vec2 p, float angle, float lamp) {
  vec2 c = uDisc.xy;
  float R = uDisc.z;
  vec2 out_ = dir(angle);
  float reach = uRig.z;
  vec2 tip = c + out_ * (R + 0.42 * R * (1.0 - reach) - 3.0);
  vec2 d = p - (tip + out_ * 0.22 * R);
  vec2 local = vec2(dot(d, out_), dot(d, vec2(-out_.y, out_.x)));
  vec2 size = vec2(0.26 * R, 0.16 * R);
  float sd = (length(local / size) - 1.0) * size.y;
  if (local.x > 0.0) sd = abs(local.y) - size.y;
  float body = 1.0 - smoothstep(-0.5, 0.5, sd * uRatio);
  float across = clamp(local.y / size.y, -1.0, 1.0);
  vec3 skin = vec3(0.2, 0.11, 0.085) * (0.45 + 0.55 * (1.0 - across * across));
  vec2 nailAt = local + vec2(0.1 * R, 0.0);
  float nail = length(nailAt / vec2(0.13 * R, 0.1 * R));
  skin = mix(skin, vec3(0.3, 0.2, 0.19), (1.0 - smoothstep(0.92, 1.0, nail)) * 0.8);
  skin += vec3(0.06) * (1.0 - smoothstep(0.0, 0.25, abs(nail - 0.88))) * step(nailAt.x, 0.0);
  float glow = exp(-max(-sd, 0.0) / 1.4);
  vec3 colour = skin + vec3(0.32, 0.04, 0.018) * lamp * glow;
  return vec4(colour, body * smoothstep(0.0, 0.08, reach));
}

// |a + z b|², where z carries the specimen's phase, already damped by however much it varies
// over the pixel and the band of wavelengths: only the cross term feels that.
float interfere(vec2 a, vec2 b, vec2 z) {
  vec2 w = vec2(a.x * b.x + a.y * b.y, a.x * b.y - a.y * b.x);
  return dot(a, a) + dot(b, b) + 2.0 * (w.x * z.x - w.y * z.y);
}

// Through the polariser, the plates, one retarder and the filter, summed over the spectrum.
// spread is how much the retardance changes across this pixel.
vec3 singleLayer(vec2 axis, float retardance, float spread) {
  vec2 pol = dir(uPolariser);
  vec2 ana = dir(uAnalyser);
  vec2 block = vec2(-ana.y, ana.x);
  vec2 across = vec2(-axis.y, axis.x);
  vec3 rgb = vec3(0.0);
  for (int k = 0; k < SAMPLES; k++) {
    float nm = uFirst + float(k) * uStep;
    vec4 e = platesBefore(vec4(pol.x, 0.0, pol.y, 0.0), nm);
    vec2 a = project(axis, e);
    vec2 b = project(across, e);
    vec4 kept = platesAfter(vec4(axis * a.x, axis * a.y).xzyw, nm);
    vec4 delayed = platesAfter(vec4(across * b.x, across * b.y).xzyw, nm);
    float overPixel = 3.14159265 * spread / nm;
    float overBand = 3.14159265 * retardance * uStep / (nm * nm);
    float damping = exp(-(overPixel * overPixel + overBand * overBand) / 6.0);
    float delta = TAU * retardance / nm;
    vec2 z = vec2(cos(delta), sin(delta)) * damping;
    float through = interfere(project(ana, kept), project(ana, delayed), z);
    float stopped = interfere(project(block, kept), project(block, delayed), z);
    rgb += uWeights[k].rgb * (0.88 * through + 2.0 * uWeights[k].w * stopped);
  }
  return rgb;
}

vec3 sceneTape(vec2 p, bool analysed, float lamp) {
  vec4 layers[MAX_LAYERS];
  int count = 0;
  float clear = 1.0;
  float haze = 0.0;
  float edge = 0.0;
  for (int i = 0; i < MAX_STRIPS; i++) {
    if (i >= uStripCount) break;
    vec4 ends = uStripEnds[i];
    vec4 info = uStripInfo[i];
    vec2 d = ends.zw - ends.xy;
    float len = length(d);
    if (len < 0.5) continue;
    vec2 u = d / len;
    vec2 q = p - ends.xy;
    float along = dot(q, u);
    float across = dot(q, vec2(-u.y, u.x));
    if (abs(across) > info.x + 2.0 || along < -3.0 || along > len + 3.0) continue;
    // The dispenser's blade leaves both ends serrated.
    float tooth = 1.1 * abs(fract(across / 2.4 + info.z) * 2.0 - 1.0);
    float inside = min(info.x - abs(across), min(along - tooth, len - along - tooth));
    float cover = clamp(inside * uRatio + 0.5, 0.0, 1.0);
    if (cover <= 0.0) continue;
    // Film is stretched as it's made, so its slow axis runs along the roll, and its thickness
    // wavers a little in faint streaks the same way.
    float streak = noise1(across * 0.6 + info.z * 91.0) + 0.5 * noise1(across * 2.1 + info.z * 13.0) - 0.75;
    float retardance = info.y * (1.0 + 0.02 * streak) * cover;
    if (count < MAX_LAYERS) {
      layers[count] = vec4(u, retardance, 0.0);
      count++;
    }
    clear *= 1.0 - cover * (0.028 + 0.03 * info.w);
    haze = max(haze, cover * info.w);
    edge = max(edge, cover * exp(-max(inside, 0.0) / 0.8));
  }
  // The slit edges and cut ends bend a hairline of light away.
  float seen = lamp * clear * (1.0 - 0.3 * edge);
  vec3 tint = mix(vec3(1.0), vec3(1.0, 0.985, 0.94), haze);
  if (!analysed) return vec3(0.44 * seen) * tint;

  vec2 pol = dir(uPolariser);
  vec2 ana = dir(uAnalyser);
  vec2 block = vec2(-ana.y, ana.x);
  vec3 rgb = vec3(0.0);
  for (int k = 0; k < SAMPLES; k++) {
    float nm = uFirst + float(k) * uStep;
    vec4 e = platesBefore(vec4(pol.x, 0.0, pol.y, 0.0), nm);
    for (int j = 0; j < MAX_LAYERS; j++) {
      if (j >= count) break;
      e = retard(e, layers[j].xy, TAU * layers[j].z / nm);
    }
    e = platesAfter(e, nm);
    vec2 through = project(ana, e);
    vec2 stopped = project(block, e);
    rgb += uWeights[k].rgb * (0.88 * dot(through, through) + 2.0 * uWeights[k].w * dot(stopped, stopped));
  }
  return 0.44 * seen * rgb * tint;
}

vec3 sceneDisc(vec2 p, bool analysed, vec3 stress, float spread, float lamp) {
  vec2 c = uDisc.xy;
  float R = uDisc.z;
  // Once it has split, each half has sprung a little away from the crack.
  vec2 local = p;
  float face = 1e5;
  if (uRig.x > 0.0 && abs(p.y - c.y) < uRig.x * R + 1.0) {
    float line = crackLine(p.y);
    local.x -= sign(p.x - line) * 0.5 * uDisc.w;
    face = abs(p.x - line) - 0.5 * uDisc.w;
  }
  float r = length(local - c);
  float rimDist = R - r;
  float inDisc = clamp(rimDist * uRatio + 0.5, 0.0, 1.0) * clamp(face * uRatio + 0.5, 0.0, 1.0);

  vec3 seen;
  if (!analysed) {
    seen = vec3(0.44);
  } else if (inDisc <= 0.0) {
    seen = singleLayer(vec2(1.0, 0.0), 0.0, 0.0);
  } else {
    float diff = stress.x - stress.y;
    float retardance = sqrt(diff * diff + 4.0 * stress.z * stress.z);
    float angle = 0.5 * atan(2.0 * stress.z, diff);
    seen = singleLayer(dir(angle), retardance * inDisc, spread);
  }
  // The plastic loses a little at each face, and its rounded edge (and a crack's faces) bend
  // the light away, so they show dark with a bright line just inside.
  float band = max(2.5, 0.03 * R);
  float edge = min(rimDist, face);
  float rim = (1.0 - smoothstep(0.0, band, edge)) * 0.8 + 0.25 * exp(-pow((edge - band * 1.2) / 0.8, 2.0));
  float shade = mix(1.0, 0.93 * (1.0 - 0.8 * (1.0 - smoothstep(0.0, band, edge))), inDisc);
  shade += 0.3 * exp(-pow((edge - band * 1.15) / 0.7, 2.0)) * inDisc;
  return seen * lamp * max(shade, 0.0);
}

// What reaches the eye from point p on the light box, with or without the filter in the way.
vec3 scene(vec2 p, bool analysed, vec3 stress, float spread) {
  float px = 1.0 / uRatio;
  float pass = analysed ? 0.44 : 1.0;
  float outer = roundedBox(p, uBox, 16.0);
  // Outside the light box: the desk it stands on, a little shaded near its edge.
  if (outer > 0.0) {
    float shadow = roundedBox(p - vec2(0.0, 4.0), uBox, 16.0);
    float shade = 1.0 - 0.16 * exp(-max(shadow, 0.0) / 9.0);
    return uSurround * shade * pass;
  }
  float lampEdge = roundedBox(p, uLamp, 6.0);
  // The bezel: dark plastic, its outer edge and inner lip catching the room's light.
  if (lampEdge > 0.0) {
    float lip = exp(-lampEdge / 1.2);
    float rim = exp(outer / 1.5);
    float upper = p.y < 0.5 * (uBox.y + uBox.w) ? 1.0 : 0.4;
    return (vec3(0.045, 0.046, 0.05) + vec3(0.1) * rim * upper + vec3(0.05) * lip) * pass;
  }
  // The lamp, a touch dimmer towards its corners as diffusers are, and shaded by the lip.
  vec2 lampSize = uLamp.zw - uLamp.xy;
  vec2 q = (p - 0.5 * (uLamp.xy + uLamp.zw)) / lampSize;
  float lamp = uExposure * (1.0 - 0.36 * dot(q, q));
  lamp *= 1.0 - 0.4 * exp(lampEdge / 2.5);

  float film = roundedBox(p, uFilm, 3.0);
  if (film > 0.0) {
    // Bare diffuser: unpolarised light, which the filter simply dims.
    return vec3(lamp) * pass;
  }
  // The film's cut edge bends a hairline of light away.
  float filmEdge = 1.0 - 0.4 * exp(film / 0.7);

  if (uSpecimen == 1) {
    // Opaque things on the lamp are lit only by the room.
    Clamp held = rig(p);
    float cover = 1.0 - smoothstep(-0.5 * px, 0.5 * px, held.sd.x);
    vec3 steel = metal(held.sd, 3.0, held.base) * pass;
    if (cover >= 1.0) return steel;
    vec3 under = sceneDisc(p, analysed, stress, spread, lamp) * filmEdge;
    if (uRig.z > 0.0) {
      vec4 one = finger(p, uRig.w, lamp);
      vec4 two = finger(p, uRig.w + 3.14159265, lamp);
      vec4 tip = one.a > two.a ? one : two;
      under = mix(under, tip.rgb * pass, tip.a);
    }
    return mix(under, steel, cover);
  }
  return sceneTape(p, analysed, lamp) * filmEdge;
}

void main() {
  vec2 p = vec2(gl_FragCoord.x, uSize.y * uRatio - gl_FragCoord.y) / uRatio;
  float px = 1.0 / uRatio;

  // The disc's stress and how fast it changes, worked out for every pixel alike so the
  // derivative is sound.
  vec3 stress = vec3(0.0);
  float spread = 0.0;
  if (uSpecimen == 1) {
    stress = stressAt(p);
    float diff = stress.x - stress.y;
    float retardance = sqrt(diff * diff + 4.0 * stress.z * stress.z);
    spread = length(vec2(dFdx(retardance), dFdy(retardance)));
  }

  vec2 centre = uFilter.xy;
  float R = uFilter.z;
  float ring = uFilter.w;
  vec2 from = p - centre;
  float d = length(from);
  float glass = 1.0 - smoothstep(-0.5 * px, 0.5 * px, d - R);

  vec3 colour = vec3(0.0);
  if (glass < 1.0) colour = scene(p, false, stress, spread);
  if (glass > 0.0) {
    vec3 through = scene(p, true, stress, spread) * vec3(0.97, 1.0, 0.965);
    // The ring's inner wall shades the glass beside it, and the glass picks up a faint sheen.
    through *= 0.7 + 0.3 * smoothstep(0.0, 4.0, R - d);
    float diagonal = dot(from / R, normalize(vec2(1.0, 1.0)));
    through += vec3(0.012) * exp(-pow((diagonal + 0.45) / 0.16, 2.0)) * smoothstep(1.0, 0.7, d / R);
    colour = mix(colour, through, glass);
  }

  // The filter's ring and the tab that turns it, in black anodised aluminium.
  float tabAngle = uAnalyser + 3.14159265;
  vec2 tabOut = dir(tabAngle);
  vec2 tabSide = vec2(-tabOut.y, tabOut.x);
  vec2 local = vec2(dot(from, tabOut), dot(from, tabSide));
  vec3 tab = boxSd(local, vec2(R + ring * 1.15, 0.0), vec2(ring * 0.85, ring * 0.8), ring * 0.55);
  tab = vec3(tab.x, tabOut * tab.y + tabSide * tab.z);
  float middle = d - R - 0.5 * ring;
  vec3 band = vec3(abs(middle) - 0.5 * ring, sign(middle) * from / max(d, 1e-3));
  vec3 body = unite(band, tab);
  float cover = 1.0 - smoothstep(-0.5 * px, 0.5 * px, body.x);
  if (cover > 0.0) {
    vec3 anodised = metal(body, ring * 0.3, 0.022);
    float angle = atan(from.y, from.x) - tabAngle;
    float onRing = d - R;
    // Knurling round the outer edge, so it turns with the ring.
    if (onRing > ring * 0.68 && band.x <= tab.x) {
      float ridges = floor(TAU * (R + ring) / 2.2);
      float ridge = 0.5 + 0.5 * cos(angle * ridges);
      anodised *= 0.6 + 0.8 * ridge;
    }
    // Engraved marks every ten degrees, longer every thirty, filled with white paint.
    if (band.x <= tab.x && onRing > ring * 0.12 && onRing < ring * 0.6) {
      float step10 = TAU / 36.0;
      float k = floor(angle / step10 + 0.5);
      float gap = abs(angle - k * step10) * (R + ring * 0.4);
      bool long_ = mod(k, 3.0) == 0.0;
      float start = long_ ? 0.12 : 0.3;
      float mark = (1.0 - smoothstep(0.35, 0.35 + px, gap)) * step(ring * start, onRing);
      anodised = mix(anodised, vec3(0.55), mark * 0.85);
    }
    // A painted index dot on the tab.
    float dot_ = length(local - vec2(R + ring * 1.35, 0.0));
    anodised = mix(anodised, vec3(0.6), 1.0 - smoothstep(ring * 0.16, ring * 0.16 + px, dot_));
    colour = mix(colour, anodised, cover);
  }

  // Into sRGB, with a whisper of noise so the dark field doesn't band.
  colour = clamp(colour, 0.0, 1.0);
  vec3 encoded = mix(12.92 * colour, 1.055 * pow(colour, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, colour));
  encoded += (hash2(gl_FragCoord.xy + uSeed) - 0.5) / 255.0;
  outColor = vec4(encoded, 1.0);
}
`;
