// The desk seen from straight above, in one pass over the screen. Everything is in millimetres,
// with x to the right, y down the screen and z up off the desk towards the eye. Layers are laid
// down back to front, each with its own coverage so edges stay smooth: the desk, the notepad and
// its pencil marks, the shavings lying about, the bore of the sharpener, a pencil in the
// sharpener, the sharpener's top, a pencil in the hand, and last the shaving coming out of the
// blade and any that are falling. Each is lit by the window by day or a lamp at night, with
// shadows from whatever is above it.
//
// The pencil is ray cast as what it is: the lacquered prism (flats with their corners turned
// down to a circle), cut by the sharpener's cone or cones and the end of the lead, with a ferrule
// and eraser or a dipped end at the back. A shaving is drawn from the record of what the blade
// took at each few degrees of turn: unrolled, a strip off a cone is a flat fan, so a point on the
// desk is turned into how far out the cut was and which way the pencil was facing at the time.

export const VS = `#version 300 es
layout(location = 0) in vec2 aPos;
void main() {
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

export const FS = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;

out vec4 outColor;

uniform vec2 uRes;
uniform vec2 uOrigin;
uniform float uMm;
uniform float uNight;
uniform vec3 uLamp;
uniform vec3 uLampAim;

uniform vec2 uPaperC;
uniform vec2 uPaperH;
uniform float uPaperRot;
uniform sampler2D uMarks;

uniform vec2 uShC;
uniform vec3 uShDim;
uniform vec3 uShBore;
uniform float uShBrass;

uniform float uPencilOn;
uniform float uDocked;
uniform vec3 uPO;
uniform vec3 uPD;
uniform float uRoll;
uniform vec4 uProf;
uniform float uRounding;
uniform vec4 uCone0;
uniform vec4 uCone1;
uniform vec4 uCone2;
uniform vec4 uEnds;
uniform vec4 uBack;
uniform int uPal;
uniform sampler2D uStamp;
uniform vec4 uStampAt;
uniform vec3 uWoodFx;
uniform float uPitch;
uniform float uRough;

uniform vec3 uPaintA[5];
uniform vec3 uPaintB[5];
uniform vec3 uPrimer[5];
uniform vec3 uEndCol[5];
uniform vec3 uFoil[5];
uniform vec3 uCore[5];
uniform vec2 uCoreFx[5];

uniform sampler2D uHead;
uniform sampler2D uSlices;
uniform int uHigh;
uniform int uCount;

const float TAU = 6.2831853;
const float PAINT = 0.13;
const float PRIMER = 0.026;

vec3 lin(vec3 c) { return pow(c, vec3(2.2)); }

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x),
    mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

float fbm(vec2 p) {
  float a = 0.5;
  float s = 0.0;
  for (int i = 0; i < 4; i++) {
    s += a * vnoise(p);
    p = p * 2.03 + 17.1;
    a *= 0.5;
  }
  return s;
}

// ---- Light ---------------------------------------------------------------------------------------

vec3 toLight(vec3 p) {
  if (uNight > 0.5) return normalize(uLamp - p);
  return normalize(vec3(-0.42, -0.55, 0.72));
}

vec3 lightColour(vec3 p) {
  if (uNight > 0.5) {
    // Under the shade: a pool of light, falling away to dark at its rim.
    vec3 toP = p - uLamp;
    float d = length(toP);
    float spot = smoothstep(0.6, 0.93, dot(toP / d, normalize(uLampAim - uLamp)));
    return vec3(1.0, 0.74, 0.47) * (0.02 + 2.3 * spot) / (1.0 + pow(d / 140.0, 2.0));
  }
  return vec3(1.0, 0.96, 0.9) * 1.45;
}

vec3 ambient(vec3 n) {
  vec3 sky = uNight > 0.5 ? vec3(0.035, 0.04, 0.06) : vec3(0.36, 0.4, 0.47);
  vec3 ground = uNight > 0.5 ? vec3(0.02, 0.016, 0.014) : vec3(0.22, 0.2, 0.18);
  return mix(ground, sky, n.z * 0.5 + 0.5);
}

// What a glossy surface sees: the room, and the window or the lamp, blurred on a rough one.
vec3 environment(vec3 r, vec3 p, float rough) {
  vec3 l = toLight(p);
  float glow = max(dot(r, l), 0.0);
  if (uNight > 0.5) {
    vec3 room = mix(vec3(0.02, 0.02, 0.024), vec3(0.11, 0.09, 0.075), r.z * 0.5 + 0.5);
    float lamp = smoothstep(0.965 - 0.12 * rough, 0.995 - 0.05 * rough, glow) * (14.0 * pow(1.0 - rough, 3.0) + 0.3);
    return room + lightColour(p) * (lamp + pow(glow, 8.0) * 0.12);
  }
  vec3 room = mix(vec3(0.2, 0.19, 0.18), vec3(0.62, 0.66, 0.72), smoothstep(-0.1, 0.9, r.z));
  float window = smoothstep(0.86 - 0.25 * rough, 0.97 - 0.1 * rough, glow) * (9.0 * pow(1.0 - rough, 3.0) + 0.4);
  return room + vec3(1.0, 0.98, 0.94) * (window + pow(glow, 6.0) * 0.25);
}

vec3 shade(vec3 p, vec3 n, vec3 albedo, float gloss, float rough, float metal, float lit, float ao) {
  vec3 l = toLight(p);
  vec3 lc = lightColour(p);
  vec3 v = vec3(0.0, 0.0, 1.0);
  vec3 h = normalize(l + v);
  float ndl = max(dot(n, l), 0.0);
  float nv = max(dot(n, v), 0.0);
  float power = mix(600.0, 10.0, rough);
  float spec = pow(max(dot(n, h), 0.0), power) * (power + 8.0) / 60.0;
  vec3 f0 = mix(vec3(0.04), albedo, metal);
  vec3 fres = f0 + (1.0 - f0) * pow(1.0 - nv, 5.0);
  vec3 diffuse = albedo * (1.0 - metal) * (lc * ndl * lit + ambient(n) * ao);
  vec3 specular = lc * spec * lit * fres * gloss;
  vec3 refl = environment(reflect(-v, n), p, rough) * fres * gloss * ao;
  return diffuse + specular + refl;
}

// ---- Pencil sections and wood ----------------------------------------------------------------

// Out to the flat, or round its rounded corner.
float reach(float g, float sides, float flats, float rounding) {
  if (sides < 0.5) return flats;
  float hs = 3.14159265 / sides;
  float d = abs(mod(g + hs, 2.0 * hs) - hs);
  float inner = flats - rounding;
  if (flats * tan(d) <= inner * tan(hs)) return flats / cos(d);
  float centre = inner / cos(hs);
  float across = centre * sin(hs - d);
  return centre * cos(hs - d) + sqrt(max(0.0, rounding * rounding - across * across));
}

int faceOf(float g, float sides) {
  if (sides < 0.5) return 0;
  float sector = TAU / sides;
  return int(floor(mod(g + 0.5 * sector, TAU) / sector));
}

vec3 paintOf(int pal, float g, float sides) {
  int f = faceOf(g, sides);
  return (f - 2 * (f / 2)) == 1 ? lin(uPaintB[pal]) : lin(uPaintA[pal]);
}

// Wood at radius rho and angle g in the pencil's section, a distance along it. The annual rings
// run across the slat as gently bowed bands, the fibres run along the pencil, and the slats meet
// in a glue line through the lead.
vec3 woodAt(int pal, float rho, float g, float along, vec3 fx) {
  bool lime = uCoreFx[pal].y > 0.5;
  vec3 early = lin(lime ? vec3(0.89, 0.81, 0.66) : vec3(0.85, 0.65, 0.5));
  vec3 late = lin(lime ? vec3(0.83, 0.73, 0.57) : vec3(0.73, 0.5, 0.37));
  vec2 q = rho * vec2(cos(g - fx.y), sin(g - fx.y));
  // The rings wander a little along the slat, so each turn crosses them somewhere new.
  float w = q.x + 0.045 * q.y * q.y + fx.z + along * 0.28 + 0.3 * vnoise(vec2(q.y * 0.9 + fx.z, along * 0.15));
  float f = fract(w / (lime ? 1.7 : 0.82));
  float band = smoothstep(0.55, 0.74, f) * (1.0 - smoothstep(0.86, 1.0, f));
  // Fibres run along the pencil: fine streaks round the section.
  float arc = g * rho;
  float fib = vnoise(vec2(arc * 11.0, rho * 1.2 + along * 0.6));
  float fib2 = vnoise(vec2(arc * 31.0, rho * 3.0 + along));
  vec3 c = mix(early, late, band * (lime ? 0.25 : 0.34));
  c *= 0.93 + 0.08 * fib + 0.05 * fib2;
  float glue = 1.0 - smoothstep(0.018, 0.05, abs(rho * sin(g - fx.x)));
  c = mix(c, lin(vec3(0.55, 0.4, 0.26)), glue * 0.55);
  return c;
}

// ---- Shavings -------------------------------------------------------------------------------------

vec4 head(int i, int k) {
  return texelFetch(uHead, ivec2(k, i), 0);
}

// How much of shaving i covers p, and when full, the colour and lie of its top layer. A shaving
// is a fan: polar about where the cone's tip unrolls to, its angle says when the bit was cut and
// so which way the pencil faced, and its distance out says how far from the axis the bit came.
float shaving(int i, vec2 p, float pix, bool full, out vec3 albedo, out vec3 nrm, out float z, out float gloss) {
  albedo = vec3(0.0);
  nrm = vec3(0.0, 0.0, 1.0);
  z = 0.0;
  gloss = 0.0;
  vec4 t0 = head(i, 0);
  vec2 d = p - t0.xy;
  float rr = dot(d, d);
  float bound = t0.z + 2.0 * pix;
  if (rr > bound * bound) return 0.0;
  vec4 t1 = head(i, 1);
  vec4 t2 = head(i, 2);
  vec4 t3 = head(i, 3);
  vec4 t4 = head(i, 4);
  vec4 t5 = head(i, 5);
  int row = int(t5.x + 0.5);
  float cr = cos(t1.x);
  float sr = sin(t1.x);
  vec2 q = vec2(cr * d.x + sr * d.y, -sr * d.x + cr * d.y);
  q.y *= t1.y;
  float L = max(sqrt(rr), 1e-3);
  float ang = atan(q.y, q.x);
  if (ang < 0.0) ang += TAU;
  float sinA = t1.z;
  float count = t1.w;
  float per = t2.y * sinA;
  float total = max(count - 1.0, 0.0) * per;
  float seed = t2.z;
  float tear = t2.w;
  int pal = int(t4.x + 0.5);
  int last = int(count) - 1;
  float acc = 0.0;
  vec3 col = vec3(0.0);
  bool first = true;
  for (int k = -1; k < 3; k++) {
    float psi = ang + TAU * float(k);
    if (psi < -2.0 * pix / L) continue;
    if (psi > total + 2.0 * pix / L) break;
    float jf = clamp(psi / per, 0.0, float(last));
    int j0 = int(floor(jf));
    int j1 = min(j0 + 1, last);
    float fj = jf - float(j0);
    vec2 lohi = mix(texelFetch(uSlices, ivec2(j0, row), 0).xy, texelFetch(uSlices, ivec2(j1, row), 0).xy, fj);
    float g = t2.x - jf * t2.y;
    float outer = reach(g, t3.x, t3.y, t3.z);
    float rin = max(lohi.x, t3.w);
    float rout = min(lohi.y, outer);
    // The strip cups as it's cut: past a point its outer part curls up, more in some places than
    // others, so from above it looks narrower than it unrolls to and its corners shallower.
    float lin0 = rin / sinA;
    float curlFrom = lin0 + 0.3 * (t3.y / sinA - lin0);
    float curl = 0.8 + 0.35 * sin(psi * 2.1 + seed * 11.0);
    float kap = curl / max(t3.y / sinA - curlFrom, 0.5);
    float Lt = L;
    float lift = 0.0;
    float stretch = 1.0;
    if (L > curlFrom) {
      float x = kap * (L - curlFrom);
      if (x >= 0.999) continue;
      lift = asin(x);
      Lt = curlFrom + lift / kap;
      stretch = 1.0 / cos(lift);
    }
    float rho = Lt * sinA;
    float aa = pix * sinA * 0.7 * stretch;
    // A dull blade tears the fibres, and every break leaves a ragged end.
    float rag = vnoise(vec2(psi * L * 2.2, seed * 17.0)) - 0.5;
    float rag2 = vnoise(vec2(rho * 9.0, seed * 31.0 + float(k) * 7.0)) - 0.5;
    rout -= tear * (0.12 + 0.25 * rag) + 0.012 * rag;
    rin += tear * 0.1 * (rag + 0.5);
    float e0 = psi * L + (0.35 + tear * 1.2) * rag2;
    float e1 = (total - psi) * L + (0.35 + tear * 1.2) * rag2;
    float cv = smoothstep(rin - aa, rin + aa, rho) * (1.0 - smoothstep(rout - aa, rout + aa, rho));
    cv *= clamp(e0 / pix + 0.5, 0.0, 1.0) * clamp(e1 / pix + 0.5, 0.0, 1.0);
    if (cv <= 0.002) continue;
    if (full) {
      float turn = jf * t2.y / TAU;
      vec3 c = woodAt(pal, rho, g, -turn * 0.7 + seed * 9.0, vec3(t4.y, t4.z, t5.y));
      // The pencil's skin along the outer edge: lacquer over a thin primer, where the edge is
      // the outside of the pencil and not a cut.
      if (lohi.y >= outer - 0.002) {
        float band = smoothstep(outer - PAINT - aa, outer - PAINT + aa, rho);
        float prim = band * (1.0 - smoothstep(outer - PAINT + PRIMER - aa, outer - PAINT + PRIMER + aa, rho));
        c = mix(c, paintOf(pal, g, t3.x), band);
        c = mix(c, lin(uPrimer[pal]), prim);
      }
      // Where the cut reached the lead, its inner edge is smeared with it.
      if (lohi.x < t3.w + 0.003) {
        float smear = 1.0 - smoothstep(rin + 0.02, rin + 0.07 + 0.07 * vnoise(vec2(psi * L * 3.0, seed)), rho);
        c = mix(c, lin(uCore[pal]) * 0.9, smear * 0.9);
      }
      // Wood that's been crushed rather than cut is duller and darker.
      c *= 1.0 - tear * 0.12 * vnoise(vec2(psi * L * 4.0, rho * 20.0));
      // A cupped, rippled strip: the outer edge, which had further to go, stands up and waves,
      // and the whole fan wobbles a little.
      float w = clamp((rho - rin) / max(rout - rin, 0.05), 0.0, 1.0);
      float wid = max(rout - rin, 0.05) / sinA;
      float ph = psi * 15.0 + seed * 40.0;
      float wob = psi * 1.7 + seed * 6.0;
      float dhdw = 1.8 * w + 0.9 * w * sin(ph) + 0.5 * sin(wob);
      float dhdp = 0.45 * w * w * cos(ph) * 15.0 + 0.85 * w * cos(wob);
      float slopeR = dhdw / max(wid, 0.5) * 0.5 + tan(lift);
      float slopeT = dhdp / L;
      vec2 radial = vec2(cos(ang), sin(ang));
      vec2 tang = vec2(-radial.y, radial.x);
      vec2 tilt = -(radial * slopeR + tang * slopeT);
      tilt.y *= t1.y;
      tilt = vec2(cr * tilt.x - sr * tilt.y, sr * tilt.x + cr * tilt.y);
      vec3 nn = normalize(vec3(tilt, 1.0));
      float paintGloss = lohi.y >= outer - 0.002 ? smoothstep(outer - PAINT, outer - PAINT + 0.01, rho) : 0.0;
      if (first) {
        nrm = nn;
        z = t0.w + (1.0 - cos(lift)) / kap;
        gloss = paintGloss;
        first = false;
      }
      col += (1.0 - acc) * cv * c;
    }
    acc += (1.0 - acc) * cv;
    if (acc > 0.995) break;
  }
  if (full && acc > 0.0) albedo = col / acc;
  return acc * t4.w;
}

// ---- The sharpener ----------------------------------------------------------------------------

float sdBlock(vec2 q) {
  float hl = uShDim.x;
  float hw = uShDim.y;
  // Knurled grip along the long sides, plain at the ends.
  float kn = 0.22 * (0.5 + 0.5 * cos(q.x * TAU / 1.05)) * (1.0 - smoothstep(hl - 2.6, hl - 1.6, abs(q.x)));
  vec2 dd = abs(q) - vec2(hl, hw - kn) + 1.5;
  return length(max(dd, 0.0)) + min(max(dd.x, dd.y), 0.0) - 1.5;
}

float slotWidth(float x) {
  float apex = uShBore.x;
  float len = uShBore.y;
  return 0.45 + 1.35 * clamp((apex - x) / len, 0.0, 1.0);
}

// How far inside the slot p is (positive inside), in millimetres.
float slotDist(vec2 q) {
  float apex = uShBore.x;
  float len = uShBore.y;
  float inX = min(q.x - (apex - len), apex - q.x);
  float inY = min(q.y, slotWidth(q.x) - q.y);
  return min(inX, inY);
}

vec2 bladeHalf() {
  return vec2(0.5 * uShBore.y + 1.2, 0.5 * (uShDim.y - 1.7));
}

vec2 bladeCentre() {
  return vec2(uShBore.x - 0.5 * uShBore.y + 0.6, -0.5 * (uShDim.y - 1.7));
}

float sdBox(vec2 q, vec2 h, float r) {
  vec2 dd = abs(q) - h + r;
  return length(max(dd, 0.0)) + min(max(dd.x, dd.y), 0.0) - r;
}

// The block's top. Returns its coverage, with the surface it shows: the bevelled body, the
// blade on its sloping seat, the screw, and nothing in the slot.
float sharpTop(vec2 p, float pix, out vec3 alb, out vec3 n, out float z, out float gloss, out float rough, out float metal) {
  vec2 q = p - uShC;
  float sd = sdBlock(q);
  alb = vec3(0.0);
  n = vec3(0.0, 0.0, 1.0);
  z = uShDim.z;
  gloss = 0.0;
  rough = 0.5;
  metal = 0.0;
  if (sd > pix) return 0.0;
  float cov = clamp(-sd / pix + 0.5, 0.0, 1.0);
  float H = uShDim.z;
  float hw = uShDim.y;
  bool brass = uShBrass > 0.5;
  vec3 body = brass ? lin(vec3(0.78, 0.62, 0.34)) : lin(vec3(0.6, 0.61, 0.63));
  float grain = vnoise(q * 9.0) * 0.5 + vnoise(q * 23.0) * 0.5;
  alb = body * (0.92 + 0.12 * grain);
  rough = brass ? 0.32 : 0.62;
  metal = brass ? 0.95 : 0.6;
  gloss = 1.0;
  // A rounded edge all round the top.
  float e = -sd;
  float bev = 1.1;
  if (e < bev) {
    vec2 gr = vec2(sdBlock(q + vec2(0.05, 0.0)) - sdBlock(q - vec2(0.05, 0.0)), sdBlock(q + vec2(0.0, 0.05)) - sdBlock(q - vec2(0.0, 0.05)));
    gr = normalize(gr + 1e-6);
    float k = 1.0 - e / bev;
    n = normalize(vec3(gr * k * 1.6, 1.0));
    z = H - bev * k * k;
  }
  // The blade side slopes down to the bore, and the blade lies on the slope.
  float seat = smoothstep(-hw + 1.2, -0.2, q.y) * step(q.y, 0.0);
  if (q.y < 0.0 && e > 0.6) {
    z = H - 1.5 * seat;
    n = normalize(vec3(0.0, 1.5 / (hw - 1.0), 1.0));
    alb *= 0.9;
  }
  vec2 bc = bladeCentre();
  vec2 bh = bladeHalf();
  float sb = sdBox(q - bc, bh, 0.6);
  if (sb < 0.0) {
    float bk = clamp(-sb / pix, 0.0, 1.0);
    vec3 steel = lin(vec3(0.6, 0.62, 0.64)) * (0.86 + 0.2 * vnoise(vec2(q.x * 26.0, q.y * 0.6)));
    alb = mix(alb, steel, bk);
    rough = mix(rough, 0.28, bk);
    metal = mix(metal, 1.0, bk);
    z = H - 1.5 * seat + 0.4;
    vec3 bn = normalize(vec3(0.0, 0.35, 1.0));
    // The ground bevel along the cutting edge.
    float edge = smoothstep(-0.75, -0.6, q.y);
    bn = normalize(mix(bn, vec3(0.0, 0.95, 0.6), edge));
    alb = mix(alb, lin(vec3(0.78, 0.79, 0.8)), edge * bk);
    n = normalize(mix(n, bn, bk));
    // The screw holding it down.
    vec2 sc = q - bc - vec2(0.0, 0.25);
    float sr = length(sc);
    if (sr < 1.9) {
      float sk = clamp((1.9 - sr) / pix, 0.0, 1.0);
      vec3 sn = normalize(vec3(sc / 1.9 * 0.9, 1.0));
      vec2 slot = vec2(0.82 * sc.x + 0.57 * sc.y, -0.57 * sc.x + 0.82 * sc.y);
      float groove = 1.0 - smoothstep(0.22, 0.22 + pix, abs(slot.y));
      groove *= 1.0 - smoothstep(1.55, 1.75, sr);
      vec3 sa = lin(vec3(0.66, 0.66, 0.64)) * (1.0 - 0.75 * groove);
      alb = mix(alb, sa, sk);
      n = normalize(mix(n, sn, sk));
      z += 0.5 * sk;
      rough = mix(rough, 0.35, sk);
      // A dark ring where the head meets the blade.
      alb *= 1.0 - 0.5 * smoothstep(1.3, 1.9, sr) * sk;
    }
    // The blade's outline casts a hairline onto the seat.
    alb *= 1.0 - 0.35 * (1.0 - smoothstep(0.0, 0.25, -sb)) * bk;
  }
  // The slot: no top here.
  float sl = slotDist(q);
  cov *= 1.0 - clamp(sl / pix + 0.5, 0.0, 1.0);
  // The slot's lip is the blade's edge on one side and a shadowed wall on the other.
  float lip = 1.0 - smoothstep(0.0, 0.6, -sl);
  alb *= 1.0 - 0.35 * lip * step(0.0, q.y);
  return cov;
}

// ---- The pencil -------------------------------------------------------------------------------------

struct Hit {
  float t;
  vec3 lp;
  vec3 n;
  int part;
};

void clipPlane(vec3 nrm, float off, int id, vec3 o, vec3 r, inout float tin, inout float tout, inout int part, inout vec3 nl) {
  float c = dot(nrm, o) - off;
  float v = dot(nrm, r);
  if (abs(v) < 1e-7) {
    if (c > 0.0) tin = 1e9;
    return;
  }
  float t = -c / v;
  if (v < 0.0) {
    if (t > tin) {
      tin = t;
      part = id;
      nl = nrm;
    }
  } else {
    tout = min(tout, t);
  }
}

void clipCone(vec4 cn, vec3 o, vec3 r, inout float tin, inout float tout, inout int part, inout vec3 nl) {
  if (cn.z < 0.5) return;
  float k2 = cn.y * cn.y;
  float q0 = cn.x - o.z;
  float a = dot(r.xy, r.xy) - k2 * r.z * r.z;
  float b = dot(o.xy, r.xy) + k2 * q0 * r.z;
  float c = dot(o.xy, o.xy) - k2 * q0 * q0;
  float disc = b * b - a * c;
  if (disc < 0.0 || a <= 1e-9) {
    tin = 1e9;
    return;
  }
  float sq = sqrt(disc);
  float t1 = (-b - sq) / a;
  float t2 = (-b + sq) / a;
  if (o.z + 0.5 * (t1 + t2) * r.z > cn.x) {
    tin = 1e9;
    return;
  }
  if (t1 > tin) {
    tin = t1;
    part = 2;
    vec3 h = o + t1 * r;
    nl = normalize(vec3(h.xy, k2 * (cn.x - h.z)));
  }
  tout = min(tout, t2);
}

// A capped cylinder along the axis, radius rad from s0 to s1.
void capped(float rad, float s0, float s1, int id, vec3 o, vec3 r, inout Hit best) {
  float a = dot(r.xy, r.xy);
  float b = dot(o.xy, r.xy);
  float c = dot(o.xy, o.xy) - rad * rad;
  float disc = b * b - a * c;
  if (disc < 0.0 || a < 1e-9) return;
  float sq = sqrt(disc);
  float tin = (-b - sq) / a;
  float tout = (-b + sq) / a;
  int part = id;
  vec3 h0 = o + tin * r;
  vec3 nl = vec3(normalize(h0.xy), 0.0);
  clipPlane(vec3(0.0, 0.0, 1.0), s1, id + 10, o, r, tin, tout, part, nl);
  clipPlane(vec3(0.0, 0.0, -1.0), -s0, id + 20, o, r, tin, tout, part, nl);
  if (tin < tout && tin > 0.0 && tin < best.t) {
    best.t = tin;
    best.lp = o + tin * r;
    best.n = nl;
    best.part = part;
  }
}

Hit castPencil(vec2 xy) {
  Hit best;
  best.t = 1e9;
  best.part = 0;
  best.lp = vec3(0.0);
  best.n = vec3(0.0, 0.0, 1.0);
  vec3 d = uPD;
  vec3 eS = normalize(vec3(d.y, -d.x, 0.0) + vec3(1e-6, 0.0, 0.0));
  vec3 eU = normalize(vec3(0.0, 0.0, 1.0) - d.z * d);
  vec3 w = vec3(xy, 80.0) - uPO;
  vec3 o = vec3(dot(w, eS), dot(w, eU), dot(w, d));
  vec3 r = vec3(-eS.z, -eU.z, -d.z);
  float c = cos(uRoll);
  float s = sin(uRoll);
  o.xy = vec2(c * o.x + s * o.y, -s * o.x + c * o.y);
  r.xy = vec2(c * r.x + s * r.y, -s * r.x + c * r.y);
  // Quick reject: nowhere near the widest part.
  {
    float a = dot(r.xy, r.xy);
    float b = dot(o.xy, r.xy);
    float cc = dot(o.xy, o.xy) - 4.6 * 4.6;
    if (b * b - a * cc < 0.0) return best;
  }
  // The wooden body: flats, corners, cones, the end of the lead and the back.
  float tin = -1e9;
  float tout = 1e9;
  int part = 0;
  vec3 nl = vec3(0.0);
  float sides = uProf.x;
  if (sides > 0.5) {
    float sector = TAU / sides;
    for (int k = 0; k < 6; k++) {
      if (float(k) >= sides) break;
      float a = float(k) * sector;
      clipPlane(vec3(cos(a), sin(a), 0.0), uProf.y, 1, o, r, tin, tout, part, nl);
    }
  }
  {
    float a = dot(r.xy, r.xy);
    float b = dot(o.xy, r.xy);
    float cc = dot(o.xy, o.xy) - uProf.z * uProf.z;
    float disc = b * b - a * cc;
    if (disc < 0.0) {
      tin = 1e9;
    } else {
      float sq = sqrt(disc);
      float t1 = (-b - sq) / a;
      if (t1 > tin) {
        tin = t1;
        part = 1;
        nl = vec3(normalize((o + t1 * r).xy), 0.0);
      }
      tout = min(tout, (-b + sq) / a);
    }
  }
  clipCone(uCone0, o, r, tin, tout, part, nl);
  clipCone(uCone1, o, r, tin, tout, part, nl);
  clipCone(uCone2, o, r, tin, tout, part, nl);
  clipPlane(vec3(0.0, 0.0, 1.0), uEnds.x, 3, o, r, tin, tout, part, nl);
  clipPlane(vec3(0.0, 0.0, -1.0), -uEnds.y, 6, o, r, tin, tout, part, nl);
  if (tin < tout && tin > 0.0) {
    best.t = tin;
    best.lp = o + tin * r;
    best.n = nl;
    best.part = part;
  }
  // A ferrule and eraser, or nothing: a dipped end is part of the body.
  if (uBack.x < 0.5) {
    capped(uProf.z + 0.12, uBack.y, uBack.z, 4, o, r, best);
    capped(uProf.y - 0.25, uBack.w, uBack.y + 0.4, 5, o, r, best);
  }
  if (best.part != 0) {
    // Back to the world.
    vec3 nn = best.n;
    nn.xy = vec2(c * nn.x - s * nn.y, s * nn.x + c * nn.y);
    best.n = normalize(nn.x * eS + nn.y * eU + nn.z * d);
  }
  return best;
}

float radiusAt(float sp) {
  float r = 0.5 * (uProf.y + uProf.z);
  if (uCone0.z > 0.5) r = min(r, (uCone0.x - sp) * uCone0.y);
  if (uCone1.z > 0.5) r = min(r, (uCone1.x - sp) * uCone1.y);
  if (uCone2.z > 0.5) r = min(r, (uCone2.x - sp) * uCone2.y);
  if (sp > uEnds.x) r = -1.0;
  if (uBack.x < 0.5 && sp < uBack.z) r = sp < uBack.y + 0.4 ? uProf.y - 0.25 : uProf.z + 0.12;
  return r;
}

// The pencil's shadow at x: how close the ray to the light passes the axis, against how thick
// the pencil is there, softened the further the shadow has to fall.
float pencilShadow(vec3 x, vec3 l) {
  if (uPencilOn < 0.5) return 1.0;
  vec3 d = uPD;
  vec3 w0 = x - uPO;
  float b = dot(l, d);
  float dd = dot(l, w0);
  float e = dot(d, w0);
  float den = max(1.0 - b * b, 1e-4);
  float sp = (e - b * dd) / den;
  sp = clamp(sp, uEnds.z, uEnds.w);
  vec3 a = uPO + sp * d;
  float t = dot(a - x, l);
  if (t <= 0.2) return 1.0;
  float dist = length(x + t * l - a);
  float r = radiusAt(sp);
  if (r <= 0.0) return 1.0;
  float pen = 0.1 + t * (uNight > 0.5 ? 0.045 : 0.03);
  return mix(0.08, 1.0, smoothstep(r - pen, r + pen, dist));
}

float sharpenerShadow(vec3 x, vec3 l) {
  float H = uShDim.z;
  if (x.z >= H - 0.01) return 1.0;
  vec2 q = x.xy - uShC;
  vec2 stp = l.xy / max(l.z, 0.08);
  float reachLen = length(stp) * (H - x.z);
  if (length(q) > length(uShDim.xy) + reachLen + 4.0) return 1.0;
  float best = 1e9;
  for (int k = 0; k < 7; k++) {
    float h = mix(x.z, H, (float(k) + 0.5) / 7.0);
    best = min(best, sdBlock(q + stp * (h - x.z)));
  }
  float soft = 0.35 + 0.09 * reachLen;
  return mix(0.1, 1.0, smoothstep(-soft, soft, best));
}

float shavingShadow(vec3 x, vec3 l, int from, int to, float pix) {
  float lit = 1.0;
  vec3 a;
  vec3 b;
  float c;
  float g;
  for (int i = from; i < to; i++) {
    vec4 t0 = head(i, 0);
    float dz = t0.w - x.z;
    if (dz < 0.08) continue;
    vec2 at = x.xy + l.xy / max(l.z, 0.08) * dz;
    float cv = shaving(i, at, pix + 0.16 * dz, false, a, b, c, g);
    lit *= 1.0 - mix(0.82, 0.62, clamp(dz / 14.0, 0.0, 1.0)) * cv;
  }
  return lit;
}

// The pencil, with 2x2 samples so its edges are smooth.
vec4 drawPencil(vec2 p, float pix) {
  if (uPencilOn < 0.5) return vec4(0.0);
  vec3 sum = vec3(0.0);
  float cov = 0.0;
  for (int k = 0; k < 4; k++) {
    vec2 off = (vec2(float(k - 2 * (k / 2)), float(k / 2)) - 0.5) * 0.5 * pix;
    Hit h = castPencil(p + off);
    if (h.part == 0) continue;
    vec3 pos = vec3(p + off, 80.0 - h.t);
    vec3 lp = h.lp;
    vec3 n = h.n;
    float rho = length(lp.xy);
    float g = atan(lp.y, lp.x);
    vec3 alb;
    float gloss = 0.0;
    float rough = 0.5;
    float metal = 0.0;
    int part = h.part;
    float outer = reach(g, uProf.x, uProf.y, uRounding);
    if (part == 1 || ((part == 2 || part == 3) && rho > outer - PAINT)) {
      // Lacquer, or the dipped end, with the stamp in foil along the first flat.
      alb = paintOf(uPal, g, uProf.x);
      gloss = 0.9;
      rough = 0.12;
      if (part != 1) {
        float prim = 1.0 - smoothstep(outer - PAINT + PRIMER, outer - PAINT + PRIMER + 0.01, rho);
        alb = mix(alb, lin(uPrimer[uPal]), prim);
        gloss = 0.4;
      }
      if (uBack.x > 0.5) {
        float dip = uBack.y + 0.6 * sin(g * 3.0 + 1.0) + 0.3 * sin(g * 7.0);
        float k2 = 1.0 - smoothstep(dip - 0.08, dip + 0.08, lp.z);
        alb = mix(alb, lin(uEndCol[uPal]), k2);
      }
      if (part == 1 && faceOf(g, uProf.x) == 0) {
        float lateral = uProf.x > 0.5 ? lp.y : g * uProf.y;
        vec2 uv = vec2((lp.z - uStampAt.x) / (uStampAt.y - uStampAt.x), 0.5 + lateral / (2.0 * uStampAt.z));
        if (uv.x > 0.0 && uv.x < 1.0 && uv.y > 0.0 && uv.y < 1.0) {
          float m = texture(uStamp, uv).a;
          alb = mix(alb, lin(uFoil[uPal]), m);
          metal = m * 0.9;
          rough = mix(rough, 0.25, m);
        }
      }
      // Softened corners on a faceted pencil.
      if (part == 1 && uProf.x > 0.5) {
        vec2 rn = normalize(lp.xy);
        float soft = 1.0 - smoothstep(0.0, 0.12, uProf.z - rho);
        vec3 nl2 = vec3(rn, 0.0);
        nl2.xy = vec2(cos(uRoll) * nl2.x - sin(uRoll) * nl2.y, sin(uRoll) * nl2.x + cos(uRoll) * nl2.y);
        vec3 dd = uPD;
        vec3 eS = normalize(vec3(dd.y, -dd.x, 0.0) + vec3(1e-6, 0.0, 0.0));
        vec3 eU = normalize(vec3(0.0, 0.0, 1.0) - dd.z * dd);
        vec3 nw = normalize(nl2.x * eS + nl2.y * eU);
        n = normalize(mix(n, nw, soft * 0.6));
      }
    } else if (part == 2 || part == 3) {
      if (rho < uProf.w) {
        alb = lin(uCore[uPal]);
        gloss = uCoreFx[uPal].x;
        rough = 0.42;
        metal = uCoreFx[uPal].x * 0.5;
      } else {
        alb = woodAt(uPal, rho, g, lp.z, uWoodFx);
        rough = 0.75;
        gloss = 0.15;
      }
      if (part == 2) {
        // The cut leaves a fine spiral, one turn of it for each turn of the pencil, and a dull
        // blade leaves the fibres torn.
        float ph = (lp.z + g / TAU * uPitch) / max(uPitch, 0.1);
        float ridge = sin(ph * TAU);
        alb *= 0.96 + 0.05 * ridge;
        float torn = uRough * (vnoise(vec2(g * 40.0, lp.z * 6.0)) - 0.5);
        alb *= 1.0 - 0.25 * abs(torn) * (rho > uProf.w ? 1.0 : 0.3);
        n = normalize(n + 0.25 * torn * vec3(0.0, 0.0, 1.0));
      }
    } else if (part == 4 || part == 14 || part == 24) {
      // The ferrule: crimped rings and a band of fine ribs.
      float u = (lp.z - uBack.y) / (uBack.z - uBack.y);
      float ribs = sin(lp.z * TAU / 0.9);
      float crimp = smoothstep(0.62, 0.66, u) * (1.0 - smoothstep(0.72, 0.76, u));
      alb = lin(vec3(0.82, 0.7, 0.42)) * (0.9 + 0.1 * ribs * crimp);
      metal = 1.0;
      gloss = 1.0;
      rough = 0.22;
      n = normalize(n + uPD * 0.35 * ribs * (crimp + 0.2));
    } else if (part == 5 || part == 15 || part == 25) {
      alb = lin(uEndCol[uPal]) * (0.94 + 0.08 * vnoise(lp.xy * 8.0 + lp.z));
      rough = 0.8;
      gloss = 0.12;
      if (part == 25) {
        // The worn, rounded end of the eraser.
        float edge = smoothstep(uProf.y - 1.4, uProf.y - 0.25, rho);
        alb *= 1.0 - 0.18 * edge;
      }
    } else {
      // The back of a dipped end.
      alb = lin(uEndCol[uPal]);
      gloss = 0.7;
      rough = 0.2;
    }
    vec3 l = toLight(pos);
    float lit = sharpenerShadow(pos, l) * shavingShadow(pos, l, 0, uHigh, pix);
    float ao = 1.0;
    if (uDocked < 0.5 && uPD.z > -0.05) {
      // Lying on the desk: the underside sits in the dark.
      ao = 0.75 + 0.25 * clamp(n.z * 0.5 + 0.5, 0.0, 1.0);
    }
    sum += shade(pos, n, alb, gloss, rough, metal, lit, ao);
    cov += 1.0;
  }
  if (cov == 0.0) return vec4(0.0);
  return vec4(sum / cov, cov / 4.0);
}

// ---- The desk and the notepad ---------------------------------------------------------------------

vec3 deskAt(vec2 p) {
  if (uNight > 0.5) {
    // Walnut, oiled, its grain running across the desk.
    float g = fbm(vec2(p.x * 0.015, p.y * 0.32 + fbm(p * 0.02) * 2.0));
    float pores = vnoise(vec2(p.x * 1.4, p.y * 9.0));
    vec3 dark = lin(vec3(0.24, 0.15, 0.1));
    vec3 light = lin(vec3(0.42, 0.28, 0.18));
    return mix(dark, light, smoothstep(0.25, 0.75, g)) * (0.9 + 0.12 * pores);
  }
  // Grey-green linoleum, with its jute backing just showing as a speckle.
  float m = fbm(p * 0.03);
  float sp = vnoise(p * 2.6);
  vec3 base = lin(vec3(0.6, 0.65, 0.61));
  return base * (0.9 + 0.14 * m) * (0.95 + 0.07 * sp);
}

void main() {
  vec2 frag = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  vec2 p = uOrigin + frag * uMm;
  float pix = uMm;
  vec3 ground = vec3(p, 0.0);
  vec3 l0 = toLight(ground);

  // Shadows reaching the desk.
  float lit = pencilShadow(ground, l0) * sharpenerShadow(ground, l0) * shavingShadow(ground, l0, 0, uCount, pix);
  // A soft dark line where the block stands on the desk.
  float sdb = sdBlock(p - uShC);
  float ao = 1.0 - 0.45 * (1.0 - smoothstep(0.0, 2.2, sdb)) * step(0.0, sdb);
  vec3 col = shade(ground, vec3(0.0, 0.0, 1.0), deskAt(p), 0.25, 0.6, 0.0, lit, ao);

  // The notepad page.
  {
    vec2 d = p - uPaperC;
    float c = cos(uPaperRot);
    float s = sin(uPaperRot);
    vec2 lp = vec2(c * d.x + s * d.y, -s * d.x + c * d.y);
    float sd = sdBox(lp, uPaperH, 0.4);
    // Its own faint shadow on the desk: the page lifts a little at the edges.
    float under = 1.0 - 0.25 * (1.0 - smoothstep(-0.2, 1.4, sd - 0.4));
    col *= mix(1.0, under, step(0.0, sd));
    float cov = clamp(-sd / pix + 0.5, 0.0, 1.0);
    if (cov > 0.0) {
      vec2 uv = (lp + uPaperH) / (2.0 * uPaperH);
      float fib = fbm(lp * 1.4) * 0.6 + vnoise(lp * 7.0) * 0.4;
      vec3 paper = lin(vec3(0.965, 0.95, 0.91)) * (0.965 + 0.05 * fib);
      // Feint rules and a margin.
      float ry = mod(lp.y + uPaperH.y - 12.0, 7.0);
      float rule = (1.0 - smoothstep(0.05, 0.05 + pix, abs(ry - 3.5))) * step(-uPaperH.y + 10.0, lp.y);
      paper = mix(paper, lin(vec3(0.62, 0.74, 0.86)), rule * 0.55);
      float margin = 1.0 - smoothstep(0.06, 0.06 + pix, abs(lp.x + uPaperH.x - 14.0));
      paper = mix(paper, lin(vec3(0.88, 0.5, 0.5)), margin * 0.5);
      // Pencil sits on the tops of the paper's tooth first.
      vec4 mk = texture(uMarks, uv);
      float tooth = vnoise(lp * 9.0) * 0.6 + vnoise(lp * 21.0) * 0.4;
      float amount = clamp(mk.a * (0.5 + 0.9 * tooth) * 1.15, 0.0, 1.0);
      vec3 markCol = lin(mk.rgb);
      paper = mix(paper, markCol, amount * 0.92);
      vec3 pos = vec3(p, 0.1);
      // Heavy graphite shines like metal.
      float shine = smoothstep(0.55, 1.0, amount) * (mk.r < 0.4 ? 1.0 : 0.0);
      vec3 pc = shade(pos, vec3(0.0, 0.0, 1.0), paper, 0.15 + shine * 0.9, mix(0.7, 0.35, shine), shine * 0.4, lit, 1.0);
      col = mix(col, pc, cov);
    }
  }

  // Shavings lying about, oldest first.
  for (int i = uHigh; i < uCount; i++) {
    vec3 alb;
    vec3 n;
    float z;
    float gloss;
    float cv = shaving(i, p, pix, true, alb, n, z, gloss);
    if (cv <= 0.0) continue;
    vec3 pos = vec3(p, z);
    vec3 l = toLight(pos);
    float sl = pencilShadow(pos, l) * sharpenerShadow(pos, l) * shavingShadow(pos, l, 0, uHigh, pix);
    // Thin wood lets a little light through at its edges.
    vec3 c = shade(pos, n, alb, 0.25 + gloss * 0.6, mix(0.7, 0.15, gloss), 0.0, sl, 1.0);
    c += alb * lightColour(pos) * 0.06 * sl;
    col = mix(col, c, cv);
  }

  // Into the sharpener: the dark bore under the slot, then a pencil in it.
  vec2 q = p - uShC;
  float inSlot = slotDist(q);
  if (inSlot > -pix && sdBlock(q) < 0.0) {
    float depth = clamp(q.y / max(slotWidth(q.x), 0.1), 0.0, 1.0);
    vec3 bore = (uShBrass > 0.5 ? lin(vec3(0.3, 0.22, 0.1)) : lin(vec3(0.16, 0.16, 0.17))) * (0.35 + 0.65 * depth);
    col = mix(col, bore, clamp(inSlot / pix + 0.5, 0.0, 1.0));
  }
  if (uDocked > 0.5) {
    vec4 pc = drawPencil(p, pix);
    col = mix(col, pc.rgb, pc.a);
  }

  // The sharpener's top.
  {
    vec3 alb;
    vec3 n;
    float z;
    float gloss;
    float rough;
    float metal;
    float cv = sharpTop(p, pix, alb, n, z, gloss, rough, metal);
    if (cv > 0.0) {
      vec3 pos = vec3(p, z);
      vec3 l = toLight(pos);
      float sl = pencilShadow(pos, l) * shavingShadow(pos, l, 0, uHigh, pix);
      col = mix(col, shade(pos, n, alb, gloss, rough, metal, sl, 1.0), cv);
    }
  }

  if (uDocked < 0.5) {
    vec4 pc = drawPencil(p, pix);
    col = mix(col, pc.rgb, pc.a);
  }

  // The shaving coming out of the blade, and any on their way down.
  for (int i = 0; i < uHigh; i++) {
    vec3 alb;
    vec3 n;
    float z;
    float gloss;
    float cv = shaving(i, p, pix, true, alb, n, z, gloss);
    if (cv <= 0.0) continue;
    vec3 pos = vec3(p, z);
    vec3 l = toLight(pos);
    float sl = pencilShadow(pos, l) * shavingShadow(pos, l, 0, i, pix);
    vec3 c = shade(pos, n, alb, 0.25 + gloss * 0.6, mix(0.7, 0.15, gloss), 0.0, sl, 1.0);
    c += alb * lightColour(pos) * 0.06 * sl;
    col = mix(col, c, cv);
  }

  // Filmic curve, then sRGB.
  vec3 x = col;
  vec3 mapped = clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
  outColor = vec4(pow(mapped, vec3(1.0 / 2.2)), 1.0);
}
`;
