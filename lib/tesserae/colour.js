import { mulberry32 } from "./random.js";

const toLin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
function oklab(r, g, b, out, o) {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  out[o] = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  out[o + 1] = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  out[o + 2] = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
}
function oklabToLin(L, a, b, out, o) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  out[o] = Math.min(
    1,
    Math.max(0, 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
  );
  out[o + 1] = Math.min(
    1,
    Math.max(0, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
  );
  out[o + 2] = Math.min(
    1,
    Math.max(0, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  );
}

// k-means in OKLab: the mosaicist's limited box of stones
function kmeans(lab, n, k) {
  const rng = mulberry32(4242);
  k = Math.min(k, n);
  const C = new Float32Array(k * 3),
    asg = new Uint8Array(n),
    dmin = new Float32Array(n);
  const d2 = (i, c) => {
    const a = lab[i * 3] - C[c * 3],
      b = lab[i * 3 + 1] - C[c * 3 + 1],
      e = lab[i * 3 + 2] - C[c * 3 + 2];
    return a * a + 2.5 * (b * b + e * e); // hue matters: a navy robe must not become grey
  };
  const first = Math.floor(rng() * n);
  C[0] = lab[first * 3];
  C[1] = lab[first * 3 + 1];
  C[2] = lab[first * 3 + 2];
  for (let i = 0; i < n; i++) dmin[i] = d2(i, 0);
  for (let c = 1; c < k; c++) {
    let sum = 0;
    for (let i = 0; i < n; i++) sum += dmin[i];
    let r = rng() * sum,
      pick = n - 1;
    for (let i = 0; i < n; i++) {
      r -= dmin[i];
      if (r <= 0) {
        pick = i;
        break;
      }
    }
    C[c * 3] = lab[pick * 3];
    C[c * 3 + 1] = lab[pick * 3 + 1];
    C[c * 3 + 2] = lab[pick * 3 + 2];
    for (let i = 0; i < n; i++) {
      const d = d2(i, c);
      if (d < dmin[i]) dmin[i] = d;
    }
  }
  const S = new Float64Array(k * 4);
  for (let it = 0; it < 14; it++) {
    S.fill(0);
    for (let i = 0; i < n; i++) {
      let best = 0,
        bd = 1e9;
      for (let c = 0; c < k; c++) {
        const d = d2(i, c);
        if (d < bd) {
          bd = d;
          best = c;
        }
      }
      asg[i] = best;
      S[best * 4] += lab[i * 3];
      S[best * 4 + 1] += lab[i * 3 + 1];
      S[best * 4 + 2] += lab[i * 3 + 2];
      S[best * 4 + 3]++;
    }
    for (let c = 0; c < k; c++) {
      const w = S[c * 4 + 3];
      if (w > 0) {
        C[c * 3] = S[c * 4] / w;
        C[c * 3 + 1] = S[c * 4 + 1] / w;
        C[c * 3 + 2] = S[c * 4 + 2] / w;
      }
    }
  }
  return { C, asg, k };
}

// Neighbourhood vote over tile centres. Keep: a flagged tile survives if minRatio of its neighbours
// are flagged too. Grow: any tile joins if minRatio of its neighbours are flagged.
function coherent(L, flag, radius, minRatio, grow) {
  const n = L.count,
    gw = Math.ceil(L.W / radius) + 1,
    gh = Math.ceil(L.H / radius) + 1;
  const head = new Int32Array(gw * gh).fill(-1),
    next = new Int32Array(n);
  for (let t = 0; t < n; t++) {
    const c = Math.floor(L.cy[t] / radius) * gw + Math.floor(L.cx[t] / radius);
    next[t] = head[c];
    head[c] = t;
  }
  const out = new Uint8Array(n),
    r2 = radius * radius;
  for (let t = 0; t < n; t++) {
    if (!flag[t] && !grow) continue;
    if (flag[t] && grow) {
      out[t] = 1;
      continue;
    }
    const gx = Math.floor(L.cx[t] / radius),
      gy = Math.floor(L.cy[t] / radius);
    let tot = 0,
      hit = 0;
    for (let y = gy - 1; y <= gy + 1; y++) {
      for (let x = gx - 1; x <= gx + 1; x++) {
        if (x < 0 || y < 0 || x >= gw || y >= gh) continue;
        for (let s = head[y * gw + x]; s >= 0; s = next[s]) {
          const dx = L.cx[s] - L.cx[t],
            dy = L.cy[s] - L.cy[t];
          if (dx * dx + dy * dy > r2) continue;
          tot++;
          hit += flag[s];
        }
      }
    }
    out[t] = hit >= minRatio * tot ? 1 : 0;
  }
  return out;
}

const GOLD_F0 = [1.0, 0.766, 0.336];
/**
 * Chooses each tile's stone: the palette is a k-means box of colours (cached on the layout per
 * size), glass where stone cannot give the colour (or everywhere for smalti), gold leaf on golden fields.
 */
export function shadeTiles(L, { palette, style, gold, tp }) {
  const n = L.count;
  if (!L.lab) {
    L.lab = new Float32Array(n * 3);
    for (let t = 0; t < n; t++)
      oklab(
        toLin(L.col[t * 3]),
        toLin(L.col[t * 3 + 1]),
        toLin(L.col[t * 3 + 2]),
        L.lab,
        t * 3,
      );
  }
  L.palettes ??= new Map();
  if (!L.palettes.has(palette))
    L.palettes.set(palette, kmeans(L.lab, n, palette));
  const { C, asg, k } = L.palettes.get(palette);
  const isVivid = new Uint8Array(k);
  for (let c = 0; c < k; c++) {
    const a = C[c * 3 + 1],
      b = C[c * 3 + 2];
    const chroma = Math.hypot(a, b),
      hue = ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360;
    isVivid[c] = chroma > 0.12 && hue > 140 && hue < 300 ? 1 : 0; // colours stone cannot give
  }
  // Gold leaf: tiles whose own colour is a saturated gold, kept only where they form a field
  // (a halo, a gold ground) rather than catching every warm highlight on skin.
  const cand = new Uint8Array(n);
  for (let t = 0; t < n; t++) {
    if (!L.pic[t]) continue;
    const l = L.lab[t * 3],
      a = L.lab[t * 3 + 1],
      b = L.lab[t * 3 + 2];
    const chroma = Math.hypot(a, b),
      hue = ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360;
    cand[t] = hue > 77 && hue < 106 && chroma > 0.105 && l > 0.6 ? 1 : 0;
  }
  const goldField = coherent(
    L,
    coherent(L, cand, 2.4 * tp, 0.6, false),
    2.4 * tp,
    0.7,
    true,
  );
  const rng = mulberry32(77);
  const FID = 0.3;
  const lin = new Float32Array(n * 3),
    type = new Uint8Array(n);
  let golds = 0;
  for (let t = 0; t < n; t++) {
    const c = asg[t],
      o = t * 3;
    const l = C[c * 3] + FID * (L.lab[o] - C[c * 3]) + (rng() - 0.5) * 0.04;
    const a =
      C[c * 3 + 1] + FID * (L.lab[o + 1] - C[c * 3 + 1]) + (rng() - 0.5) * 0.01;
    const b =
      C[c * 3 + 2] + FID * (L.lab[o + 2] - C[c * 3 + 2]) + (rng() - 0.5) * 0.01;
    oklabToLin(l, a, b, lin, o);
    let ty = 0;
    if (L.pic[t]) {
      if (gold && goldField[t]) ty = 2;
      else if (style === "smalti" || isVivid[c]) ty = 1;
    }
    if (ty === 2) {
      const lum = 0.2126 * lin[o] + 0.7152 * lin[o + 1] + 0.0722 * lin[o + 2];
      const s = 0.55 + 0.9 * lum;
      for (let j = 0; j < 3; j++)
        lin[o + j] = Math.min(1, GOLD_F0[j] * s * 0.72 + lin[o + j] * 0.4);
      golds++;
    }
    type[t] = ty;
  }
  return { lin, type, golds, colours: k };
}
