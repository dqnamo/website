// One full-screen pass. The stone (or its two halves) is ray marched as a distance field: the
// nodule's lumpy outside, cut by the saw's plane, with the hollow taken out of the middle. What
// a cut face shows is worked out from the point's place in the stone, so every cut through the
// same nodule agrees with every other, and the two faces of one cut are mirror images.

export const VS = `#version 300 es
layout(location = 0) in vec2 aPos;
void main() {
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

export const FS = `#version 300 es
precision highp float;
precision highp int;

out vec4 outColor;

uniform vec2 uRes;
uniform vec3 uEye;
uniform vec3 uCamF;
uniform vec3 uCamR;
uniform vec3 uCamU;
uniform float uFocal;
uniform int uMode;

// Up to two pieces: world to object rotation, where the object's centre is, and the cut plane
// in the object's own frame (solid where dot(p, n) <= d).
uniform int uPieces;
uniform mat3 uInv[2];
uniform vec3 uPos[2];
uniform vec4 uClip[2];
uniform float uBound;

// The blade: the x of the cut, its centre's height and depth, and its radius.
uniform vec4 uBlade;
uniform float uKerfOn;
uniform float uBladeOn;
uniform float uSpin;
uniform float uSpinBlur;
uniform float uLaser;
uniform float uBench;
uniform float uSlot;

uniform vec3 uRadii;
uniform vec3 uSeedV;
uniform float uSeed;
uniform vec3 uRough;
uniform vec4 uBlobs[8];
uniform int uBlobN;
uniform float uBlobK;
uniform vec4 uArms[6];
uniform int uArmN;
uniform float uBotry;
uniform vec4 uZones;
uniform float uCrystals;
uniform vec3 uBandCol[5];
uniform vec3 uBandProp[5];
uniform vec3 uBandMean;
uniform vec2 uBandMeanTP;
uniform vec3 uBandFreq;
uniform vec3 uSkin0;
uniform vec3 uSkin1;
uniform vec3 uHost;
uniform vec3 uWallSkin;
uniform float uRind;
uniform vec3 uQuartzCol;
uniform vec3 uTipCol;
uniform float uStain;

uniform float uTime;
uniform float uWetAt;
uniform float uWetAll;
uniform float uFinish;
uniform vec3 uMarkV;
uniform vec3 uMarkU;
uniform float uMarkR;
uniform vec3 uDye;
uniform float uDyeOn;

uniform vec3 uLightDir;
uniform vec3 uLightCol;
uniform vec3 uSky;
uniform vec3 uGround;
uniform vec3 uBenchCol;
uniform vec3 uBackdrop;
uniform float uNight;
uniform float uShadowK;

uniform vec3 uSlabN;
uniform float uSlabD;
uniform vec3 uSlabU;
uniform vec3 uSlabV;
uniform vec2 uSlabC;
uniform float uSlabScale;
uniform float uSlabRot;
uniform float uLightOn;
uniform float uThick;
uniform vec4 uBox;

const float PI = 3.14159265;
// Half the kerf and half the blade's steel, in units of 4 cm: a 2.6 mm cut.
const float KERF = 0.033;
const float BLADE = 0.022;

float hash11(float p) {
  p = fract(p * 0.1031);
  p *= p + 33.33;
  p *= p + p;
  return fract(p);
}

float hash13(vec3 p3) {
  p3 = fract(p3 * 0.1031);
  p3 += dot(p3, p3.zyx + 31.32);
  return fract((p3.x + p3.y) * p3.z);
}

vec3 hash33(vec3 p3) {
  p3 = fract(p3 * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yxz + 33.33);
  return fract((p3.xxy + p3.yxx) * p3.zyx);
}

float vnoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = p - i;
  vec3 u = f * f * (3.0 - 2.0 * f);
  float a = hash13(i);
  float b = hash13(i + vec3(1.0, 0.0, 0.0));
  float c = hash13(i + vec3(0.0, 1.0, 0.0));
  float d = hash13(i + vec3(1.0, 1.0, 0.0));
  float e = hash13(i + vec3(0.0, 0.0, 1.0));
  float g = hash13(i + vec3(1.0, 0.0, 1.0));
  float h = hash13(i + vec3(0.0, 1.0, 1.0));
  float k = hash13(i + vec3(1.0, 1.0, 1.0));
  return mix(
    mix(mix(a, b, u.x), mix(c, d, u.x), u.y),
    mix(mix(e, g, u.x), mix(h, k, u.x), u.y),
    u.z
  );
}

float fbm3(vec3 p) {
  return (0.5 * vnoise(p) + 0.25 * vnoise(p * 2.03 + 11.0) + 0.125 * vnoise(p * 4.01 + 23.0)) / 0.875;
}

float noise1(float x) {
  float i = floor(x);
  float f = x - i;
  return mix(hash11(i), hash11(i + 1.0), f * f * (3.0 - 2.0 * f));
}

float smin(float a, float b, float k) {
  float h = max(k - abs(a - b), 0.0) / k;
  return min(a, b) - h * h * k * 0.25;
}

// ---- The stone's shape ----------------------------------------------------------------------

float ellipsoid(vec3 p, vec3 r) {
  float k0 = length(p / r);
  float k1 = length(p / (r * r));
  return k0 * (k0 - 1.0) / k1;
}

// The outside: an egg with soft lumps, warts and (on a thunderegg) ridges.
float outerSd(vec3 p) {
  float d = ellipsoid(p, uRadii);
  float reach = uRough.x + uRough.y + uRough.z;
  if (d > reach + 0.1) return d - reach;
  float lumps = fbm3(p * 2.3 + uSeedV) - 0.5;
  float warts = vnoise(p * 8.0 + uSeedV.yzx) - 0.5;
  float ridge = 1.0 - abs(2.0 * vnoise(p * 3.4 + uSeedV.zxy) - 1.0);
  return d - uRough.x * lumps * 2.0 - uRough.y * warts * 2.0 - uRough.z * (ridge - 0.5);
}

// A thunderegg's star: cracks that opened through the middle of the nodule as it dried, each a
// plate through the centre that thins to nothing at its edge. Any cut near the middle crosses
// every plate, so a section shows a star of their arms.
float plate(vec3 p, vec4 a) {
  float reach = length(a.xyz);
  vec3 m = a.xyz / reach;
  float h = dot(p, m);
  float r = length(p - m * h);
  float half_ = a.w * max(1.0 - r / reach, 0.0) * (0.75 + 0.5 * vnoise(p * 3.0 + a.xyz * 7.0));
  return max(abs(h) - half_, r - reach);
}

float cavRaw(vec3 p, float k) {
  float d = 1e3;
  for (int i = 0; i < 8; i++) {
    if (i >= uBlobN) break;
    d = smin(d, length(p - uBlobs[i].xyz) - uBlobs[i].w, k);
  }
  for (int i = 0; i < 6; i++) {
    if (i >= uArmN) break;
    d = smin(d, plate(p, uArms[i]), k);
  }
  return d;
}

// Distance to the cavity wall, negative inside it. A layer of even thickness laid over a ridge
// rounds it off, so deeper in the blend between the cavity's lobes is softer.
float cavSd(vec3 p) {
  float d = cavRaw(p, uBlobK);
  if (d < -0.02) d = cavRaw(p, uBlobK + 0.7 * (-d));
  return d + uBotry * (vnoise(p * 11.0 + uSeedV) - 0.5) * 2.0;
}

// How far the filling had got when it reached p, as a thickness laid on the walls: the first
// bands round the walls, then (over a floor of flat layers) a thickness laid on walls and floor
// alike. Points in the flat layers themselves give −1.
float fillDepth(vec3 p, float dep) {
  if (uZones.y < -5.0 || dep < uZones.x) return dep;
  float above = p.y - uZones.y;
  if (above < 0.0) return -1.0;
  return uZones.x + min(dep - uZones.x, above);
}

// The crystals lining a hollow are Voronoi cells, one to a crystal. This gives how far in from
// its cell's border p is (so every cell rises to a point with flat faces) and the cell's own
// random number.
vec2 crystal(vec3 p) {
  vec3 q = p * uCrystals + uSeedV;
  vec3 i = floor(q);
  vec3 f = q - i;
  float f1 = 9.0;
  float f2 = 9.0;
  vec3 r1 = vec3(0.0);
  vec3 r2 = vec3(1.0);
  float id = 0.0;
  for (int z = -1; z <= 1; z++) {
    for (int y = -1; y <= 1; y++) {
      for (int x = -1; x <= 1; x++) {
        vec3 o = vec3(float(x), float(y), float(z));
        vec3 h = hash33(i + o);
        vec3 r = o + 0.1 + h * 0.8 - f;
        float d = dot(r, r);
        if (d < f1) {
          f2 = f1;
          r2 = r1;
          f1 = d;
          r1 = r;
          id = h.x;
        } else if (d < f2) {
          f2 = d;
          r2 = r;
        }
      }
    }
  }
  float edge = dot(0.5 * (r1 + r2), normalize(r2 - r1));
  return vec2(edge / uCrystals, id);
}

float crystalHeight(vec2 cr) {
  return cr.x * 2.6 * (0.5 + 0.9 * cr.y);
}

// Positive in the hollow. Away from it, a bound is enough.
float hollowTerm(vec3 p) {
  if (uZones.w > 5.0) return -1.0;
  float s = fillDepth(p, -cavSd(p));
  if (s < 0.0) return -1.0;
  float gap = s - uZones.w;
  if (gap < -0.02) return gap;
  return (gap - crystalHeight(crystal(p))) * 0.25;
}

// The slot the blade has cut so far: the disc where it is now, and everything above it that it
// came down through.
float kerfSd(vec3 p) {
  float dx = abs(p.x - uBlade.x) - KERF;
  vec2 q = p.yz - uBlade.yz;
  float disc = length(q) - uBlade.w;
  float above = max(-q.x, abs(q.y) - uBlade.w);
  return max(dx, min(disc, above));
}

float bladeSd(vec3 p) {
  vec2 q = p.yz - uBlade.yz;
  float r = length(q);
  // The diamond rim is a little wider than the steel.
  float rim = smoothstep(uBlade.w - 0.06, uBlade.w - 0.05, r);
  float hw = mix(BLADE, KERF, rim);
  float hub = 1.0 - step(0.42, r);
  hw = max(hw, hub * 0.06);
  return max(r - uBlade.w, abs(p.x - uBlade.x) - hw);
}

vec3 toObj(int i, vec3 p) {
  return uInv[i] * (p - uPos[i]);
}

float pieceSd(int i, vec3 p) {
  vec3 po = toObj(i, p);
  float r = length(po);
  if (r > uBound) return r - uBound + 0.02;
  float d = max(outerSd(po), dot(po, uClip[i].xyz) - uClip[i].w);
  if (i == 0 && uKerfOn > 0.5) d = max(d, -kerfSd(p));
  if (d < 0.02) d = max(d, hollowTerm(po));
  return d;
}

float map(vec3 p) {
  float d = pieceSd(0, p);
  if (uPieces > 1) d = min(d, pieceSd(1, p));
  if (uBladeOn > 0.5) d = min(d, bladeSd(p));
  return d;
}

// Just the egg and the cut, for shadows on the bench.
float cheapPiece(int i, vec3 p) {
  vec3 po = toObj(i, p);
  return max(ellipsoid(po, uRadii) + 0.01, dot(po, uClip[i].xyz) - uClip[i].w);
}

float cheapMap(vec3 p) {
  float d = cheapPiece(0, p);
  if (uPieces > 1) d = min(d, cheapPiece(1, p));
  return d;
}

float march(vec3 ro, vec3 rd, float t0, float t1) {
  float t = t0;
  for (int i = 0; i < 180; i++) {
    float d = map(ro + rd * t);
    if (abs(d) < 0.00035 * t) return t;
    t += d * 0.8;
    if (t > t1) return -1.0;
  }
  return -1.0;
}

vec3 normalAt(vec3 p) {
  const float e = 0.0015;
  vec2 k = vec2(1.0, -1.0);
  return normalize(
    k.xyy * map(p + k.xyy * e) +
    k.yyx * map(p + k.yyx * e) +
    k.yxy * map(p + k.yxy * e) +
    k.xxx * map(p + k.xxx * e)
  );
}

vec2 sphereHit(vec3 ro, vec3 rd, vec3 c, float r) {
  vec3 oc = ro - c;
  float b = dot(oc, rd);
  float h = b * b - dot(oc, oc) + r * r;
  if (h < 0.0) return vec2(1e4, -1.0);
  h = sqrt(h);
  return vec2(-b - h, -b + h);
}

// ---- What the stone is made of ----------------------------------------------------------------

struct Mat {
  vec3 col;
  float trans;
  float por;
  // 0 rock, 1 agate, 2 quartz, 3 hollow, 4 outside the stone.
  float kind;
};

// Agate is laid down in a rhythm: zones a few bands wide share a colour from the palette, and
// the bands within a zone alternate a little lighter and darker.
vec3 bandColour(float id, out vec2 tp) {
  float zone = floor(id / 3.0);
  float h = hash11(zone * 1.618 + uSeed * 13.0);
  int k = 4;
  for (int i = 0; i < 5; i++) {
    if (h <= uBandProp[i].z) {
      k = i;
      break;
    }
  }
  tp = uBandProp[k].xy;
  float b = hash11(id * 0.77 + 5.1);
  return uBandCol[k] * (0.8 + 0.34 * b);
}

// The bands at fill depth s, averaged over the pixel's footprint fw, so bands finer than a
// pixel blend into their mean rather than shimmering.
vec3 bands(float s, float fw, float freq, float seed, out float trans, out float por) {
  float ph = s * freq + uBandFreq.y * 6.0 * noise1(s * 5.0 + seed);
  float w = fw * freq * 1.4 + 1e-4;
  float id = floor(ph);
  float f = ph - id;
  vec2 tp0;
  vec2 tpN;
  vec2 tpP;
  vec3 c0 = bandColour(id + seed, tp0);
  vec3 cN = bandColour(id + 1.0 + seed, tpN);
  vec3 cP = bandColour(id - 1.0 + seed, tpP);
  float aN = clamp((f + 0.5 * w - 1.0) / w, 0.0, 1.0);
  float aP = clamp((0.5 * w - f) / w, 0.0, 1.0);
  float a0 = max(1.0 - aN - aP, 0.0);
  float sum = a0 + aN + aP;
  vec3 col = (c0 * a0 + cN * aN + cP * aP) / sum;
  trans = (tp0.x * a0 + tpN.x * aN + tpP.x * aP) / sum;
  por = (tp0.y * a0 + tpN.y * aN + tpP.y * aP) / sum;
  // Each band starts a little darker than it ends, and fine growth lines run through them all.
  col *= mix(0.9 + 0.16 * f, 1.0, smoothstep(0.25, 0.8, w));
  float lines = sin(ph * 6.2832 * 4.0 + 2.0 * noise1(ph * 0.7));
  col *= 1.0 + 0.07 * lines * (1.0 - smoothstep(0.15, 0.45, w * 4.0));
  float avg = smoothstep(0.5, 1.6, w);
  col = mix(col, uBandMean, avg);
  trans = mix(trans, uBandMeanTP.x, avg);
  por = mix(por, uBandMeanTP.y, avg);
  return col;
}

Mat material(vec3 p, float fw) {
  Mat m;
  m.trans = 0.0;
  m.por = 0.55;
  m.kind = 0.0;
  float o = outerSd(p);
  if (o > 0.0) {
    m.col = vec3(0.0);
    m.trans = 1.0;
    m.por = 0.0;
    m.kind = 4.0;
    return m;
  }
  float c = cavSd(p);
  float grain = vnoise(p * 4.0 + uSeedV);
  if (c > 0.0) {
    // The host rock, mottled and specked with its own grains; a crust towards the outside where
    // weathering has stained it darker; and a thin skin on the cavity wall.
    float n = fbm3(p * 7.0 + uSeedV);
    float big = fbm3(p * 2.2 + uSeedV.zxy);
    vec3 host = uHost * (0.72 + 0.32 * n + 0.22 * big);
    float speck = smoothstep(0.66, 0.74, vnoise(p * 60.0 + uSeedV.zxy));
    float dark = smoothstep(0.7, 0.8, vnoise(p * 38.0 + uSeedV.yxz));
    host = mix(host, uSkin0 * 1.15, speck * 0.35);
    host *= 1.0 - 0.35 * dark;
    float crust = 1.0 - smoothstep(0.0, uRind, -o + 0.05 * (n - 0.5));
    vec3 col = mix(host, uSkin1 * (0.8 + 0.3 * n), crust * 0.8);
    col = mix(col, uWallSkin, 1.0 - smoothstep(0.0, 0.014, c));
    m.col = col * mix(vec3(1.0), uDye, uDyeOn * 0.5);
    m.por = 0.5 + 0.25 * crust;
    return m;
  }
  float dep = -c;
  float s = fillDepth(p, dep);
  vec3 col;
  if (s < 0.0) {
    // The flat layers across the floor: level when they formed.
    col = bands(p.y, fw, uBandFreq.z, 61.0, m.trans, m.por);
    m.kind = 1.0;
  } else if (s > uZones.z) {
    vec2 cr = crystal(p);
    if (uZones.w < 5.0 && s > uZones.w + crystalHeight(cr)) {
      m.col = vec3(0.0);
      m.trans = 1.0;
      m.por = 0.0;
      m.kind = 3.0;
      return m;
    }
    float span = uZones.w < 5.0 ? (uZones.w + 0.07 - uZones.z) : 0.2;
    float q = clamp((s - uZones.z) / span, 0.0, 1.0);
    col = mix(uQuartzCol, uTipCol, smoothstep(0.05, 0.75, q) * (0.75 + 0.4 * cr.y));
    col *= 0.86 + 0.22 * cr.y;
    // Growth lines across each crystal, where it paused.
    col *= 1.0 - 0.06 * smoothstep(0.6, 1.0, sin(s * 260.0 + cr.y * 6.0)) * (1.0 - smoothstep(0.004, 0.012, fw));
    // Where one crystal met the next.
    col *= 1.0 - 0.16 * (1.0 - smoothstep(0.0, 0.004 + fw, cr.x));
    m.trans = mix(0.6, 0.9, q);
    m.por = 0.03;
    m.kind = 2.0;
  } else {
    col = bands(s, fw, uBandFreq.x, 0.0, m.trans, m.por);
    m.kind = 1.0;
  }
  // Iron that came in with the water stains the outer bands.
  float stain = uStain * smoothstep(0.42, 0.75, fbm3(p * 2.2 + uSeedV.yzx)) * (1.0 - smoothstep(0.0, 0.3, dep));
  col = mix(col, col * vec3(1.12, 0.62, 0.4), stain);
  col *= 0.93 + 0.14 * grain;
  // Dye goes where water can: into the porous bands, hardly at all into quartz.
  col = mix(col, col * uDye, uDyeOn * clamp(m.por * 1.3, 0.0, 1.0));
  m.col = col;
  return m;
}

// ---- Light --------------------------------------------------------------------------------------

vec3 hemi(vec3 n) {
  return mix(uGround, uSky, 0.5 + 0.5 * n.y);
}

// What a glossy surface reflects: the room, and the window (by day) or the lamp (at night).
vec3 env(vec3 r, float blur) {
  vec3 col = mix(uGround, uSky, smoothstep(-0.3, 0.5, r.y)) * 0.8;
  // The ceiling, a broad soft light overhead.
  col += uSky * 2.5 * smoothstep(0.55, 1.0, r.y);
  float c = dot(r, uLightDir);
  vec3 across = normalize(cross(uLightDir, vec3(0.0, 1.0, 0.0)));
  vec3 up = cross(across, uLightDir);
  vec2 q = vec2(dot(r, across), dot(r, up)) / max(c, 0.05);
  float soft = 0.015 + blur * 0.3;
  float win;
  if (uNight < 0.5) {
    win = (1.0 - smoothstep(0.32 - soft, 0.32 + soft, abs(q.x))) *
      (1.0 - smoothstep(0.44 - soft, 0.44 + soft, abs(q.y)));
    float bars = smoothstep(0.012, 0.02, abs(q.x)) * smoothstep(0.012, 0.02, abs(q.y));
    win *= mix(bars, 1.0, blur);
  } else {
    win = 1.0 - smoothstep(0.15 - soft, 0.19 + soft, length(q));
  }
  win *= step(0.0, c);
  return col + uLightCol * win * mix(2.6, 0.45, blur);
}

float wetness(float por, float n) {
  float t = uTime - uWetAt;
  float dry = 3.0 + 17.0 * por + 5.0 * (n - 0.5);
  return 1.0 - smoothstep(dry * 0.55, dry, t);
}

// A cut face, from what it's made of. Dry and straight off the saw it scatters white light from
// its scratches and looks pale and chalky; wet, or polished, the scatter goes and the colours
// come through, deeper, with a gloss on top.
vec3 shadeCut(Mat m, vec3 po, vec3 n, vec3 rd, float fw, float shadow) {
  float nz = vnoise(po * 7.0 + uSeedV.zyx);
  float wet = wetness(m.por, nz);
  float polish = smoothstep(0.6, 1.0, uFinish);
  float optic = max(wet, polish);
  vec3 base = m.col * (1.0 - 0.5 * m.trans * (0.4 + 0.6 * optic));
  // Saw marks: the rim leaves an arc of its own curve at every turn as it feeds down, so they
  // run in parallel arcs, all of the blade's radius. The first grit takes them out.
  float mu = dot(po, uMarkU);
  float sag = uMarkR - sqrt(max(uMarkR * uMarkR - mu * mu, 0.0));
  float marks = sin((dot(po, uMarkV) - sag) * 170.0 + nz * 4.0);
  float markFade = (1.0 - smoothstep(0.0, 0.3, uFinish)) * (1.0 - smoothstep(0.3, 0.8, fw * 170.0 / 6.2832));
  base *= 1.0 + 0.035 * marks * markFade * (1.0 - 0.6 * optic) * (0.5 + nz);
  // Dry, the scratches scatter white light over everything, paling and greying it; water or a
  // polish fills them, and what's left is the stone's own colour, deeper and richer.
  float lum = dot(base, vec3(0.3, 0.59, 0.11));
  vec3 dry = mix(base, vec3(lum), 0.5) * 0.92 + 0.075;
  vec3 deep = max(mix(vec3(lum), base, 1.25), 0.0) * 0.82;
  base = mix(dry, deep, optic);
  float diff = max(dot(n, uLightDir), 0.0) * shadow;
  vec3 col = base * (uLightCol * diff + hemi(n));
  vec3 r = reflect(rd, n);
  float fres = 0.045 + 0.955 * pow(1.0 - max(dot(-rd, n), 0.0), 5.0);
  float gloss = max(polish, wet * 0.85);
  float sheen = smoothstep(0.2, 0.6, uFinish) * (1.0 - polish);
  col += fres * env(r, 0.0) * gloss;
  col += fres * env(r, 1.0) * sheen * 0.6;
  return col;
}

vec3 shadeRind(vec3 p, vec3 po, vec3 n, vec3 rd, float near) {
  float n1 = fbm3(po * 4.0 + uSeedV);
  float n2 = vnoise(po * 21.0 + uSeedV.zxy);
  vec3 col = mix(uSkin1, uSkin0, smoothstep(0.25, 0.75, n1));
  col *= 0.78 + 0.4 * n2;
  // Pits where softer grains weathered out.
  col *= 1.0 - 0.35 * smoothstep(0.72, 0.86, vnoise(po * 46.0 + 7.0));
  float ao = clamp(map(p + n * 0.05) / 0.05, 0.0, 1.0);
  ao = 0.35 + 0.65 * ao;
  // Coolant from the saw darkens it near the cut, and spray all over.
  float wet = wetness(0.6, n1) * max(uWetAll, exp(-near * 5.0));
  col *= mix(1.0, 0.5, wet);
  float diff = max(dot(n, uLightDir), 0.0);
  vec3 lit = col * (uLightCol * diff + hemi(n)) * ao;
  vec3 r = reflect(rd, n);
  float fres = 0.03 + 0.97 * pow(1.0 - max(dot(-rd, n), 0.0), 5.0);
  lit += fres * env(r, 0.6) * wet * 0.7 * ao;
  return lit;
}

// The crystals in a hollow. Light reaches them only through the opening, so a crystal is lit
// if the way to the light from it leaves through the hole in the face.
vec3 shadeHollow(vec3 p, vec3 po, vec3 n, vec3 rd, int piece) {
  vec2 cr = crystal(po);
  float s = fillDepth(po, -cavSd(po));
  float tip = clamp((s - uZones.w) / 0.07, 0.0, 1.0);
  vec3 col = mix(uQuartzCol, uTipCol, smoothstep(0.0, 0.85, 0.3 + 0.7 * tip) * (0.75 + 0.35 * cr.y));
  col *= 0.85 + 0.3 * cr.y;
  vec3 nObj = uClip[piece].xyz;
  vec3 lObj = uInv[piece] * uLightDir;
  float behind = uClip[piece].w - dot(po, nObj);
  float lit = 0.0;
  float toward = dot(lObj, nObj);
  if (toward > 0.02) {
    vec3 q = po + lObj * (behind / toward);
    float sq = fillDepth(q, -cavSd(q));
    lit = smoothstep(uZones.w + 0.02, uZones.w + 0.08, sq);
  }
  float open = exp(-behind * 2.2);
  float diff = max(dot(n, uLightDir), 0.0) * lit;
  vec3 c = col * (uLightCol * diff + hemi(n) * open * 0.8);
  // Light that gets into a crystal comes back out coloured by it.
  c += col * col * uLightCol * 0.1 * lit;
  vec3 r = reflect(rd, n);
  float fres = 0.05 + 0.95 * pow(1.0 - max(dot(-rd, n), 0.0), 5.0);
  c += fres * env(r, 0.0) * (0.25 + 0.75 * lit) * open;
  float glint = pow(max(dot(r, uLightDir), 0.0), 220.0) * lit;
  c += uLightCol * glint * 4.0;
  return c;
}

vec3 shadeBlade(vec3 p, vec3 rd) {
  vec2 q = p.yz - uBlade.yz;
  float r = length(q);
  float side = abs(p.x - uBlade.x);
  vec3 n = side > BLADE * 0.8 && r < uBlade.w - 0.004 ? vec3(sign(p.x - uBlade.x), 0.0, 0.0) : vec3(0.0, q / max(r, 1e-4));
  float a = atan(q.y, q.x) + uSpin;
  vec3 steel = vec3(0.42, 0.43, 0.45);
  // Brushed rings, and the cooling slots that blur to a ring once it spins.
  steel *= 0.9 + 0.1 * sin(r * 300.0);
  float slots = smoothstep(0.92, 0.97, cos(a * 8.0)) * step(uBlade.w - 0.3, r) * step(r, uBlade.w - 0.08);
  steel *= 1.0 - 0.6 * mix(slots, 0.12, uSpinBlur);
  float rim = smoothstep(uBlade.w - 0.06, uBlade.w - 0.05, r);
  vec3 col = mix(steel, vec3(0.16, 0.16, 0.17), rim);
  col = mix(col, vec3(0.2, 0.2, 0.22), 1.0 - step(0.42, r));
  float diff = max(dot(n, uLightDir), 0.0);
  vec3 lit = col * (uLightCol * diff + hemi(n));
  vec3 rr = reflect(rd, n);
  float fres = 0.5 + 0.5 * pow(1.0 - max(dot(-rd, n), 0.0), 5.0);
  lit += fres * env(rr, 0.35) * col * 0.7;
  return lit;
}

float softShadow(vec3 ro, vec3 rd) {
  float res = 1.0;
  float t = 0.02;
  for (int i = 0; i < 40; i++) {
    float h = cheapMap(ro + rd * t);
    res = min(res, uShadowK * h / t);
    t += clamp(h, 0.02, 0.35);
    if (res < 0.002 || t > 6.0) break;
  }
  return clamp(res, 0.0, 1.0);
}

vec3 shadeBench(vec3 p, vec3 rd, float t) {
  float grain = vnoise(vec3(p.xz * 2.5, 0.5)) * 0.6 + vnoise(vec3(p.xz * 18.0, 2.5)) * 0.4;
  vec3 col = uBenchCol * (0.92 + 0.12 * grain);
  // The saw table's slot.
  float slot = (1.0 - smoothstep(0.03, 0.045, abs(p.x - uBlade.x))) * (1.0 - smoothstep(2.4, 2.6, abs(p.z)));
  col *= 1.0 - 0.7 * slot * uSlot;
  float shadow = 1.0;
  if (uMode == 0) shadow = softShadow(p, uLightDir);
  float near = cheapMap(p + vec3(0.0, 0.12, 0.0));
  float ao = 0.45 + 0.55 * smoothstep(-0.05, 0.6, near);
  vec3 lit = col * (uLightCol * max(uLightDir.y, 0.0) * shadow + uSky) * ao;
  // The saw's laser line, where the stone doesn't shade it from the laser above.
  if (uLaser > 0.0 && abs(p.x - uBlade.x) < 0.06) {
    vec3 src = vec3(uBlade.x, uBench + 4.5, 0.6);
    vec3 dir = normalize(src - p);
    float hit = 1.0;
    float tt = 0.03;
    for (int i = 0; i < 24; i++) {
      float h = cheapMap(p + dir * tt);
      if (h < 0.002) {
        hit = 0.0;
        break;
      }
      tt += h;
      if (tt > 4.0) break;
    }
    float line = exp(-pow((p.x - uBlade.x) / 0.008, 2.0)) + 0.18 * exp(-pow((p.x - uBlade.x) / 0.03, 2.0));
    float speckle = 0.6 + 0.8 * hash13(floor(p * 260.0));
    lit += vec3(1.0, 0.05, 0.03) * line * speckle * hit * uLaser * 1.6;
  }
  float fog = smoothstep(9.0, 28.0, t);
  return mix(lit, uBackdrop, fog);
}

// ---- A slab on a light box ------------------------------------------------------------------------

vec3 transmit(Mat m) {
  if (m.kind > 2.5) return vec3(1.0);
  if (m.kind < 0.5) return vec3(0.0);
  // Light that comes through takes on the band's colour, more deeply than reflected light does.
  vec3 tint = m.col / max(max(m.col.r, max(m.col.g, m.col.b)), 0.05);
  return m.trans * pow(tint, vec3(1.6));
}

vec3 slabView(vec2 frag, float fw) {
  vec2 c = frag - uSlabC;
  vec2 b = abs(c) - uBox.xy + uBox.z;
  float box = length(max(b, 0.0)) + min(max(b.x, b.y), 0.0) - uBox.z;
  float grain = vnoise(vec3(frag * 0.05, 0.5));
  vec3 room = uLightCol * 0.55 + uSky;
  vec3 col = uBenchCol * (0.92 + 0.1 * grain) * room;
  vec3 glow = vec3(1.0, 0.985, 0.95) * 1.35 * (1.0 - 0.1 * smoothstep(0.5, 1.1, length(c / uBox.xy)));
  vec3 panel = uLightOn > 0.5 ? glow : vec3(0.8, 0.8, 0.78) * room;
  vec3 frame = vec3(0.32, 0.32, 0.33) * room;
  float inPanel = 1.0 - smoothstep(-uBox.w - 1.0, -uBox.w, box);
  float inBox = 1.0 - smoothstep(-1.0, 0.0, box);
  // The box sits on the bench and throws a shadow.
  col *= 1.0 - 0.35 * (1.0 - smoothstep(0.0, 26.0, box + 6.0)) * (1.0 - inBox);
  col = mix(col, mix(frame, panel, inPanel), inBox);
  float cs = cos(uSlabRot);
  float sn = sin(uSlabRot);
  vec2 q = vec2(cs * c.x - sn * c.y, sn * c.x + cs * c.y) * uSlabScale;
  vec3 po = uSlabN * uSlabD + uSlabU * q.x + uSlabV * q.y;
  float o = outerSd(po);
  float a = 1.0 - smoothstep(-fw, fw, o);
  if (a > 0.0) {
    Mat m = material(po, fw);
    vec3 slab;
    if (uLightOn > 0.5) {
      // Light through the slab: what it meets on the way through, at six depths. Bands that
      // cross the slab at a slant blur together, as they do in a real one.
      vec3 t = vec3(0.0);
      for (int i = 0; i < 6; i++) {
        Mat mi = material(po + uSlabN * uThick * (float(i) + 0.5) / 6.0, fw);
        t += log(max(transmit(mi), vec3(0.002)));
      }
      slab = glow * exp(t / 6.0 * 1.6);
      slab += m.col * room * 0.06;
    } else {
      slab = shadeCut(m, po, vec3(0.0, 0.0, 1.0), vec3(0.0, 0.0, -1.0), fw, 1.0);
    }
    if (m.kind > 2.5 && uLightOn < 0.5) slab = panel * 0.85;
    col = mix(col, slab, a);
  } else if (uLightOn < 0.5) {
    col *= 1.0 - 0.3 * (1.0 - smoothstep(0.0, 0.1, o)) * inBox;
  } else {
    // A little of the box's light spills round the slab's edge.
    col *= 1.0 - 0.12 * (1.0 - smoothstep(0.0, 0.05, o));
  }
  return col;
}

vec3 tonemap(vec3 x) {
  x *= 0.95;
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}

void main() {
  vec2 frag = gl_FragCoord.xy;
  vec3 ro = uEye;
  vec3 rd = vec3(0.0, 0.0, -1.0);
  vec3 hit = vec3(frag * uSlabScale, 0.0);
  float t = -1.0;
  float tb = 1e4;
  if (uMode == 0) {
    vec2 uv = (2.0 * frag - uRes) / uRes.y;
    rd = normalize(uCamF * uFocal + uCamR * uv.x + uCamU * uv.y);
    tb = rd.y < 0.0 ? (uBench - ro.y) / rd.y : 1e4;
    float t0 = 1e4;
    float t1 = -1.0;
    vec2 s0 = sphereHit(ro, rd, uPos[0], uBound);
    t0 = min(t0, s0.x);
    t1 = max(t1, s0.y);
    if (uPieces > 1) {
      vec2 s1 = sphereHit(ro, rd, uPos[1], uBound);
      t0 = min(t0, s1.x);
      t1 = max(t1, s1.y);
    }
    if (uBladeOn > 0.5) {
      vec2 sb = sphereHit(ro, rd, vec3(uBlade.x, uBlade.yz), uBlade.w + 0.05);
      float ta = (uBlade.x - 0.07 - ro.x) / rd.x;
      float tc = (uBlade.x + 0.07 - ro.x) / rd.x;
      float lo = max(sb.x, min(ta, tc));
      float hi = min(sb.y, max(ta, tc));
      if (hi > lo) {
        t0 = min(t0, lo);
        t1 = max(t1, hi);
      }
    }
    if (t1 > 0.0) t = march(ro, rd, max(t0, 0.0), min(t1, tb));
    hit = ro + rd * (t > 0.0 ? t : min(tb, 60.0));
  }
  float fw = uMode == 0 ? length(fwidth(hit)) : uSlabScale;

  vec3 col;
  if (uMode == 1) {
    col = slabView(frag, fw);
  } else if (t > 0.0) {
    float d0 = pieceSd(0, hit);
    float d1 = uPieces > 1 ? pieceSd(1, hit) : 1e3;
    float db = uBladeOn > 0.5 ? bladeSd(hit) : 1e3;
    if (db < d0 && db < d1) {
      col = shadeBlade(hit, rd);
    } else {
      int piece = d1 < d0 ? 1 : 0;
      vec3 po = toObj(piece, hit);
      float o = outerSd(po);
      float cl = dot(po, uClip[piece].xyz) - uClip[piece].w;
      float kf = piece == 0 && uKerfOn > 0.5 ? -kerfSd(hit) : -1e3;
      float h = hollowTerm(po);
      float near = uKerfOn > 0.5 ? abs(hit.x - uBlade.x) : abs(cl);
      if (h > o && h > cl && h > kf && h > -0.01) {
        col = shadeHollow(hit, po, normalAt(hit), rd, piece);
      } else if (cl > o && cl > kf) {
        vec3 n = normalize(transpose(uInv[piece]) * uClip[piece].xyz);
        float shadow = softShadow(hit + n * 0.01, uLightDir);
        col = shadeCut(material(po, fw), po, n, rd, fw, shadow);
      } else if (kf > o) {
        vec3 n = vec3(-sign(hit.x - uBlade.x), 0.0, 0.0);
        col = shadeCut(material(po, fw), po, n, rd, fw, 0.3);
      } else {
        vec3 n = normalAt(hit);
        col = shadeRind(hit, po, n, rd, near);
        // The laser line from above, with the speckle a laser always has.
        if (uLaser > 0.0) {
          float dx = hit.x - uBlade.x;
          float line = exp(-pow(dx / 0.008, 2.0)) + 0.18 * exp(-pow(dx / 0.03, 2.0));
          float speckle = 0.6 + 0.8 * hash13(floor(hit * 260.0));
          col += vec3(1.0, 0.05, 0.03) * line * speckle * uLaser * 1.6 * smoothstep(-0.2, 0.4, n.y);
        }
      }
    }
    float fog = smoothstep(9.0, 28.0, t);
    col = mix(col, uBackdrop, fog);
  } else if (tb < 1e3) {
    col = shadeBench(hit, rd, tb);
  } else {
    col = uBackdrop;
  }

  col = tonemap(col);
  col = pow(col, vec3(1.0 / 2.2));
  col += (hash13(vec3(frag, uTime * 0.0)) - 0.5) / 255.0;
  outColor = vec4(col, 1.0);
}
`;
