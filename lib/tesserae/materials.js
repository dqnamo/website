import * as THREE from "three";

// Tile shaders: each tessera is tilted about its own centre by a small random angle (in the
// vertex shader, so shadows agree) and pressed into the mortar on reveal; its face gets a
// procedural surface: stone with veins and pits, glass with facets and bubbles, or gold leaf.
const VERT_HEAD = /* glsl */ `
attribute vec4 aTile;      // centre.xy (world), size (world), seed
attribute float aType;     // 0 stone, 1 glass, 2 gold
uniform float uTilt;
uniform float uRelief;
uniform float uReveal;
uniform float uTileWorld;
varying vec3 vTess;
varying float vType;
float tessHash(float n) { return fract(sin(n) * 43758.5453123); }
mat3 tessRot() {
  float s = aTile.w;
  float k = aType > 1.5 ? 1.8 : (aType > 0.5 ? 1.3 : 1.0);
  float ang = uTilt * k * (0.15 + 0.85 * tessHash(s * 91.7 + 1.3));
  float phi = 6.2831853 * tessHash(s * 47.3 + 7.1);
  vec3 ax = vec3(cos(phi), sin(phi), 0.0);
  float c = cos(ang), sn = sin(ang), t = 1.0 - c;
  return mat3(
    t * ax.x * ax.x + c,        t * ax.x * ax.y + sn * ax.z, t * ax.x * ax.z - sn * ax.y,
    t * ax.x * ax.y - sn * ax.z, t * ax.y * ax.y + c,        t * ax.y * ax.z + sn * ax.x,
    t * ax.x * ax.z + sn * ax.y, t * ax.y * ax.z - sn * ax.x, t * ax.z * ax.z + c);
}
vec3 tessPlace(vec3 p) {
  vec3 pivot = vec3(aTile.xy, 0.0);
  vec3 q = tessRot() * (p - pivot);
  q.z += (tessHash(aTile.w * 13.37 + 3.1) - 0.5) * uRelief;
  // pressed into the mortar, radiating from the centre
  float delay = length(aTile.xy) * 0.011 + tessHash(aTile.w * 5.1) * 0.35;
  float r = clamp((uReveal - delay) / 0.5, 0.0, 1.0);
  float e = 1.0 - (1.0 - r) * (1.0 - r) * (1.0 - r);
  q *= e;
  q.z += (1.0 - e) * 9.0;
  return q + pivot;
}
`;
const BEGIN_NORMAL = /* glsl */ `
vec3 objectNormal = tessRot() * vec3(normal);
#ifdef USE_TANGENT
  vec3 objectTangent = vec3(tangent.xyz);
#endif
`;
const BEGIN_TILE = /* glsl */ `
vec3 transformed = tessPlace(vec3(position));
vTess = vec3(position.xy / uTileWorld, aTile.w);
vType = aType;
`;
const FRAG_HEAD = /* glsl */ `
varying vec3 vTess;
varying float vType;
float tHash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float tNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
  return mix(mix(tHash(i), tHash(i + vec2(1.0, 0.0)), u.x), mix(tHash(i + vec2(0.0, 1.0)), tHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float tFbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int k = 0; k < 4; k++) { s += a * tNoise(p); p = p * 2.07 + vec2(13.1, 7.7); a *= 0.5; }
  return s;
}
vec2 tCell(vec2 p) {   // id of the nearest jittered cell point
  vec2 i = floor(p), f = fract(p), id = i; float best = 9.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 g = vec2(float(x), float(y));
    vec2 o = vec2(tHash(i + g), tHash(i + g + 41.7));
    vec2 r = g + o - f; float d = dot(r, r);
    if (d < best) { best = d; id = i + g; }
  }
  return id;
}
`;
const FRAG_COLOR = /* glsl */ `
vec2 tp = vTess.xy + vec2(vTess.z * 113.0, vTess.z * 71.0);
float tn = tFbm(tp * 2.1);
float tf = tNoise(tp * 12.0);
float tessRough = 0.55;
float tessCoat = 0.0;
vec2 tessGrad = vec2(0.0);
if (vType < 0.5) {
  // natural stone: mottled, the odd vein, fine pitting
  diffuseColor.rgb *= 0.9 + 0.18 * tn + 0.07 * (tf - 0.5);
  float va = vTess.z * 6.2831853;
  float vein = abs(sin(dot(tp, vec2(cos(va), sin(va))) * 3.6 + tn * 7.0));
  float veinOn = step(0.64, fract(vTess.z * 7.31));
  diffuseColor.rgb = mix(diffuseColor.rgb, min(diffuseColor.rgb * 1.2 + 0.03, vec3(1.0)), veinOn * (1.0 - smoothstep(0.0, 0.18, vein)) * 0.5);
  float pit = smoothstep(0.86, 0.97, tNoise(tp * 21.0));
  diffuseColor.rgb *= 1.0 - 0.28 * pit;
  tessRough = mix(0.38, 0.72, tn) + 0.2 * pit;
  float e = 0.035, h0 = tFbm(tp * 3.2);
  tessGrad = vec2(tFbm((tp + vec2(e, 0.0)) * 3.2) - h0, tFbm((tp + vec2(0.0, e)) * 3.2) - h0) * (0.016 / e);
} else if (vType < 1.5) {
  // glass smalti: split faces with conchoidal facets, the odd seed bubble
  diffuseColor.rgb *= 0.9 + 0.16 * tn;
  vec2 fid = tCell(tp * 2.4);
  tessGrad = (vec2(tHash(fid + 3.1), tHash(fid + 9.7)) - 0.5) * 0.22;
  vec2 bp = tp * 9.0, bi = floor(bp), bf = fract(bp) - 0.5;
  float bubble = step(0.84, tHash(bi + 7.0)) * (1.0 - smoothstep(0.05, 0.13, length(bf - (vec2(tHash(bi), tHash(bi + 3.0)) - 0.5) * 0.5)));
  diffuseColor.rgb *= 1.0 - 0.35 * bubble;
  tessRough = 0.12 + 0.14 * tf + 0.3 * bubble;
} else {
  // gold leaf sealed under a skin of glass
  diffuseColor.rgb *= 0.84 + 0.3 * tn;
  float e = 0.03, h0 = tFbm(tp * 6.0);
  tessGrad = vec2(tFbm((tp + vec2(e, 0.0)) * 6.0) - h0, tFbm((tp + vec2(0.0, e)) * 6.0) - h0) * (0.03 / e);
  tessRough = 0.13 + 0.2 * tn;
  tessCoat = 0.85;
}
`;
const FRAG_NORMAL = /* glsl */ `
{
  vec3 wn = (vec4(normal, 0.0) * viewMatrix).xyz;
  float facing = smoothstep(0.75, 0.97, wn.z);
  normal = normalize(normal + (viewMatrix * vec4(-tessGrad * facing, 0.0, 0.0)).xyz);
}
`;

/** The tessera material plus matching depth materials for directional and point-light shadows. */
export function createTileMaterials(U) {
  const tile = new THREE.MeshPhysicalMaterial({
    vertexColors: true,
    roughness: 0.5,
    metalness: 0,
    clearcoat: 1,
    clearcoatRoughness: 0.05,
    envMapIntensity: 1,
  });
  tile.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", `#include <common>\n${VERT_HEAD}`)
      .replace("#include <beginnormal_vertex>", BEGIN_NORMAL)
      .replace("#include <begin_vertex>", BEGIN_TILE);
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", `#include <common>\n${FRAG_HEAD}`)
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>\n${FRAG_COLOR}`,
      )
      .replace(
        "#include <roughnessmap_fragment>",
        "#include <roughnessmap_fragment>\nroughnessFactor = tessRough;",
      )
      .replace(
        "#include <metalnessmap_fragment>",
        "#include <metalnessmap_fragment>\nmetalnessFactor = vType > 1.5 ? 1.0 : 0.0;",
      )
      .replace(
        "#include <normal_fragment_maps>",
        `#include <normal_fragment_maps>\n${FRAG_NORMAL}`,
      )
      .replace(
        "#include <lights_physical_fragment>",
        "#include <lights_physical_fragment>\n#ifdef USE_CLEARCOAT\nmaterial.clearcoat *= tessCoat;\n#endif",
      );
  };
  tile.customProgramCacheKey = () => "tess-tile-2";

  function shadowVariant(mat, key) {
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, U);
      sh.vertexShader = sh.vertexShader
        .replace("#include <common>", `#include <common>\n${VERT_HEAD}`)
        .replace(
          "#include <begin_vertex>",
          "vec3 transformed = tessPlace(vec3(position));",
        );
    };
    mat.customProgramCacheKey = () => key;
    return mat;
  }
  const depth = shadowVariant(
    new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }),
    "tess-depth-2",
  );
  const distance = shadowVariant(
    new THREE.MeshDistanceMaterial(),
    "tess-dist-2",
  );
  return { tile, depth, distance };
}
