import * as THREE from "three";
import { mulberry32 } from "./random.js";

// Lime mortar: warm grey with sandy grain, darker where the gap between stones is tight.
export function buildGroutTexture(L, polys, { unit, tw, tp, anisotropy }) {
  const { start, xy } = polys;
  const ww = L.W * unit,
    hh = L.H * unit;
  const texW = Math.min(3072, Math.round((L.W / tp) * 18)),
    texH = Math.round((texW * hh) / ww);
  const cv = document.createElement("canvas");
  cv.width = texW;
  cv.height = texH;
  const ctx = cv.getContext("2d", { willReadFrequently: true });
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, texW, texH);
  ctx.fillStyle = "#fff";
  const sx = texW / ww,
    sy = texH / hh;
  ctx.beginPath();
  for (let t = 0; t < L.count; t++) {
    const a = start[t],
      b = start[t + 1];
    if (b - a < 3) continue;
    for (let i = a; i < b; i++) {
      const X = (xy[i * 2] + ww / 2) * sx,
        Y = (hh / 2 - xy[i * 2 + 1]) * sy;
      if (i === a) ctx.moveTo(X, Y);
      else ctx.lineTo(X, Y);
    }
    ctx.closePath();
  }
  ctx.fill();
  const img = ctx.getImageData(0, 0, texW, texH),
    d = img.data,
    N = texW * texH;
  const cov = new Float32Array(N),
    tmp = new Float32Array(N);
  for (let i = 0; i < N; i++) cov[i] = d[i * 4] / 255;
  const r = Math.max(1, Math.round(sx * tw * 0.16));
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 0; y < texH; y++) {
      let acc = 0;
      const o = y * texW;
      for (let x = -r; x <= r; x++)
        acc += cov[o + Math.min(texW - 1, Math.max(0, x))];
      for (let x = 0; x < texW; x++) {
        tmp[o + x] = acc / (2 * r + 1);
        acc +=
          cov[o + Math.min(texW - 1, x + r + 1)] - cov[o + Math.max(0, x - r)];
      }
    }
    for (let x = 0; x < texW; x++) {
      let acc = 0;
      for (let y = -r; y <= r; y++)
        acc += tmp[Math.min(texH - 1, Math.max(0, y)) * texW + x];
      for (let y = 0; y < texH; y++) {
        cov[y * texW + x] = acc / (2 * r + 1);
        acc +=
          tmp[Math.min(texH - 1, y + r + 1) * texW + x] -
          tmp[Math.max(0, y - r) * texW + x];
      }
    }
  }
  const rng = mulberry32(99),
    G = 48,
    lat = new Float32Array((G + 1) * (G + 1));
  for (let i = 0; i < lat.length; i++) lat[i] = rng();
  const base = [164, 157, 145];
  for (let y = 0; y < texH; y++) {
    const fy = (y / texH) * G,
      iy = fy | 0,
      ty = fy - iy;
    for (let x = 0; x < texW; x++) {
      const fx = (x / texW) * G,
        ix = fx | 0,
        tx = fx - ix;
      const a = lat[iy * (G + 1) + ix],
        b = lat[iy * (G + 1) + ix + 1],
        c = lat[(iy + 1) * (G + 1) + ix],
        e = lat[(iy + 1) * (G + 1) + ix + 1];
      const top = a + (b - a) * tx,
        mott = top + (c + (e - c) * tx - top) * ty;
      const i = y * texW + x;
      const ao = 1 - 0.62 * cov[i] ** 1.2;
      const k = ao * (0.84 + 0.2 * rng()) * (0.9 + 0.18 * mott);
      d[i * 4] = base[0] * k;
      d[i * 4 + 1] = base[1] * k;
      d[i * 4 + 2] = base[2] * k;
      d[i * 4 + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = anisotropy;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}
