import * as THREE from "three";
import { mulberry32 } from "./random.js";

function clipPoly(poly, nx, ny, h) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i],
      b = poly[(i + 1) % poly.length];
    const da = nx * a[0] + ny * a[1] - h,
      db = nx * b[0] + ny * b[1] - h;
    if (da <= 0) out.push(a);
    if (da <= 0 !== db <= 0) {
      const t = da / (da - db);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return out;
}
// Each tile's cell is described by its extent in 8 directions of its own frame; the stone is
// that octagon, shrunk by half the grout, with the odd corner knocked off and a hand-cut wobble.
export function buildPolys(L, { grout, unit, tp }) {
  const n = L.count,
    R2 = Math.SQRT1_2;
  const rng = mulberry32(1234);
  const start = new Uint32Array(n + 1),
    xy = new Float32Array(n * 2 * 12);
  const h = new Float64Array(8);
  let v = 0,
    kept = 0;
  const halfW = L.W / 2,
    halfH = L.H / 2;
  for (let t = 0; t < n; t++) {
    start[t] = v;
    const s = L.size[t];
    const gHalf = 0.5 * grout * (0.4 * tp + 0.6 * s);
    for (let k = 0; k < 8; k++) h[k] = L.sup[t * 8 + k] + 0.25 - gHalf;
    for (let k = 0; k < 4; k++) h[k] -= rng() * 0.035 * s;
    for (let k = 4; k < 8; k++) if (rng() < 0.2) h[k] -= rng() * 0.1 * s;
    if (h[0] + h[1] < 0.3 * s || h[2] + h[3] < 0.3 * s) continue;
    let poly = [
      [-h[1], -h[3]],
      [h[0], -h[3]],
      [h[0], h[2]],
      [-h[1], h[2]],
    ];
    poly = clipPoly(poly, R2, R2, h[4]);
    poly = clipPoly(poly, -R2, -R2, h[5]);
    poly = clipPoly(poly, R2, -R2, h[6]);
    poly = clipPoly(poly, -R2, R2, h[7]);
    const clean = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i],
        b = clean.length ? clean[clean.length - 1] : null;
      if (!b || Math.hypot(a[0] - b[0], a[1] - b[1]) > 0.04 * s) clean.push(a);
    }
    if (
      clean.length > 2 &&
      Math.hypot(
        clean[0][0] - clean[clean.length - 1][0],
        clean[0][1] - clean[clean.length - 1][1],
      ) <=
        0.04 * s
    )
      clean.pop();
    if (clean.length < 3 || clean.length > 12) continue;
    const c = L.ca[t],
      sn = L.sa[t];
    let area = 0;
    const base = v;
    for (let i = 0; i < clean.length; i++) {
      const u = clean[i][0] + (rng() - 0.5) * 0.05 * s,
        w = clean[i][1] + (rng() - 0.5) * 0.05 * s;
      const x = L.cx[t] + u * c - w * sn,
        y = L.cy[t] + u * sn + w * c;
      xy[v * 2] = (x - halfW) * unit;
      xy[v * 2 + 1] = (halfH - y) * unit;
      v++;
    }
    for (let i = base; i < v; i++) {
      const j = i + 1 < v ? i + 1 : base;
      area += xy[i * 2] * xy[j * 2 + 1] - xy[j * 2] * xy[i * 2 + 1];
    }
    const su = s * unit;
    if (Math.abs(area) * 0.5 < 0.05 * su * su) {
      v = base;
      continue;
    }
    if (area < 0) {
      // counter-clockwise, seen from the front
      for (let i = base, j = v - 1; i < j; i++, j--) {
        const ax = xy[i * 2],
          ay = xy[i * 2 + 1];
        xy[i * 2] = xy[j * 2];
        xy[i * 2 + 1] = xy[j * 2 + 1];
        xy[j * 2] = ax;
        xy[j * 2 + 1] = ay;
      }
    }
    kept++;
  }
  start[n] = v;
  return { start, xy, kept };
}

// Every tessera: a flat face, a rounded bevel, and sides sunk into the mortar.
export function buildTileGeometry(L, polys, { unit, tw }) {
  const n = L.count,
    { start, xy } = polys;
  let NV = 0,
    NI = 0;
  for (let t = 0; t < n; t++) {
    const k = start[t + 1] - start[t];
    if (k >= 3) {
      NV += 9 * k;
      NI += 3 * (k - 2) + 12 * k;
    }
  }
  const pos = new Float32Array(NV * 3),
    nor = new Float32Array(NV * 3),
    col = new Float32Array(NV * 3);
  const til = new Float32Array(NV * 4),
    typ = new Float32Array(NV),
    idx = new Uint32Array(NI);
  const vStart = new Uint32Array(n + 1);
  const px = new Float64Array(16),
    py = new Float64Array(16),
    qx = new Float64Array(16),
    qy = new Float64Array(16),
    ex = new Float64Array(16),
    ey = new Float64Array(16);
  const ZT = 0.3 * tw,
    Z0 = -0.3 * tw;
  let v = 0,
    ii = 0;
  const halfW = L.W / 2,
    halfH = L.H / 2;
  let tcx = 0,
    tcy = 0,
    tsz = 0,
    tsd = 0;
  const put = (x, y, z, nx, ny, nz) => {
    pos[v * 3] = x;
    pos[v * 3 + 1] = y;
    pos[v * 3 + 2] = z;
    nor[v * 3] = nx;
    nor[v * 3 + 1] = ny;
    nor[v * 3 + 2] = nz;
    til[v * 4] = tcx;
    til[v * 4 + 1] = tcy;
    til[v * 4 + 2] = tsz;
    til[v * 4 + 3] = tsd;
    return v++;
  };
  for (let t = 0; t < n; t++) {
    vStart[t] = v;
    const a = start[t],
      k = start[t + 1] - a;
    if (k < 3) continue;
    tcx = (L.cx[t] - halfW) * unit;
    tcy = (halfH - L.cy[t]) * unit;
    tsz = L.size[t] * unit;
    tsd = (t * 0.6180339887) % 1;
    let cx = 0,
      cy = 0;
    for (let i = 0; i < k; i++) {
      px[i] = xy[(a + i) * 2];
      py[i] = xy[(a + i) * 2 + 1];
      cx += px[i];
      cy += py[i];
    }
    cx /= k;
    cy /= k;
    let inr = 1e9;
    for (let i = 0; i < k; i++) {
      const j = (i + 1) % k,
        dx = px[j] - px[i],
        dy = py[j] - py[i],
        len = Math.hypot(dx, dy) || 1;
      ex[i] = dy / len;
      ey[i] = -dx / len;
      const d = (px[i] - cx) * ex[i] + (py[i] - cy) * ey[i];
      if (d < inr) inr = d;
    }
    const b = Math.max(0.012 * tw, Math.min(0.065 * tw, inr * 0.28));
    for (let i = 0; i < k; i++) {
      const p = (i + k - 1) % k,
        nx = ex[p] + ex[i],
        ny = ey[p] + ey[i];
      let f = b / (1 + ex[p] * ex[i] + ey[p] * ey[i]);
      if (f > 2.5 * b) f = 2.5 * b;
      qx[i] = px[i] - nx * f;
      qy[i] = py[i] - ny * f;
    }
    const zb = ZT - 0.8 * b;
    const top = v;
    for (let i = 0; i < k; i++) put(qx[i], qy[i], ZT, 0, 0, 1);
    for (let i = 1; i < k - 1; i++) {
      idx[ii++] = top;
      idx[ii++] = top + i;
      idx[ii++] = top + i + 1;
    }
    for (let i = 0; i < k; i++) {
      const j = (i + 1) % k;
      let bx = ex[i] * 0.85,
        by = ey[i] * 0.85,
        bz = 0.55;
      const bl = Math.hypot(bx, by, bz);
      bx /= bl;
      by /= bl;
      bz /= bl;
      const A = put(qx[i], qy[i], ZT, 0, 0, 1),
        B = put(qx[j], qy[j], ZT, 0, 0, 1);
      const C = put(px[j], py[j], zb, bx, by, bz),
        D = put(px[i], py[i], zb, bx, by, bz);
      idx[ii++] = A;
      idx[ii++] = D;
      idx[ii++] = C;
      idx[ii++] = A;
      idx[ii++] = C;
      idx[ii++] = B;
    }
    for (let i = 0; i < k; i++) {
      const j = (i + 1) % k;
      const D = put(px[i], py[i], zb, ex[i], ey[i], 0),
        C = put(px[j], py[j], zb, ex[i], ey[i], 0);
      const E = put(px[j], py[j], Z0, ex[i], ey[i], 0),
        F = put(px[i], py[i], Z0, ex[i], ey[i], 0);
      idx[ii++] = D;
      idx[ii++] = F;
      idx[ii++] = E;
      idx[ii++] = D;
      idx[ii++] = E;
      idx[ii++] = C;
    }
  }
  vStart[n] = v;
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  g.setAttribute("aTile", new THREE.BufferAttribute(til, 4));
  g.setAttribute("aType", new THREE.BufferAttribute(typ, 1));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.boundingSphere = new THREE.Sphere(
    new THREE.Vector3(),
    Math.hypot(L.W, L.H) * unit,
  );
  g.userData.vStart = vStart;
  return g;
}
export function paintGeometry(g, n, lin, type) {
  const vStart = g.userData.vStart;
  const col = g.attributes.color.array,
    typ = g.attributes.aType.array;
  for (let t = 0; t < n; t++) {
    const r = lin[t * 3],
      gg = lin[t * 3 + 1],
      b = lin[t * 3 + 2],
      ty = type[t];
    for (let v = vStart[t]; v < vStart[t + 1]; v++) {
      col[v * 3] = r;
      col[v * 3 + 1] = gg;
      col[v * 3 + 2] = b;
      typ[v] = ty;
    }
  }
  g.attributes.color.needsUpdate = true;
  g.attributes.aType.needsUpdate = true;
}
