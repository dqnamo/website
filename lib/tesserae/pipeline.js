// Tessellation: turns an RGBA picture (TP working pixels per base tessera) into tesserae: each
// one's site, orientation, size, an 8-direction support polygon in its own frame, and an average
// colour. Rows of tiles follow the picture's contours (andamento) and settle into straight courses
// away from them; an optional banded Roman border frames the picture, and an optional cut-out mask
// becomes a contour no tile straddles. Runs in a Worker (pipeline.worker.js); post() receives
// progress messages and, at the end, the result.

export function tessPipeline(msg, post) {
  const t0 = Date.now();
  const P = msg.params,
    TP = msg.tp,
    job = msg.job;
  const iw = msg.width,
    ih = msg.height,
    src = msg.rgba;
  const mask = msg.mask || null; // optional figure cut-out: one alpha byte per picture pixel
  const marks = [];
  let tMark = Date.now();
  const lap = (name) => {
    const now = Date.now();
    marks.push(`${name} ${now - tMark}`);
    tMark = now;
  };
  const say = (stage, f) => post({ type: "progress", job, stage, f });

  // Roman banded border, outside to inside: [width in rows of tesserae, sRGB colour]
  const BANDS = P.border
    ? [
        [2, [0.17, 0.15, 0.13]], // basalt
        [1, [0.88, 0.85, 0.78]], // white limestone
        [1, [0.6, 0.29, 0.19]], // terracotta
        [1, [0.88, 0.85, 0.78]], // white limestone
      ]
    : [];
  const ringAt = [];
  let M = 0;
  for (const b of BANDS) {
    M += b[0] * TP;
    ringAt.push(M);
  }
  const W = iw + 2 * M,
    H = ih + 2 * M,
    N = W * H;

  // ---------------------------------------------------------------- helpers
  function blurH(s, d, r) {
    const norm = 1 / (2 * r + 1);
    for (let y = 0; y < H; y++) {
      const o = y * W;
      let acc = s[o] * (r + 1);
      for (let k = 1; k <= r; k++) acc += s[o + (k < W ? k : W - 1)];
      for (let x = 0; x < W; x++) {
        d[o + x] = acc * norm;
        const a = x + r + 1,
          b = x - r;
        acc += s[o + (a < W ? a : W - 1)] - s[o + (b > 0 ? b : 0)];
      }
    }
  }
  function blurV(s, d, r) {
    const norm = 1 / (2 * r + 1);
    for (let x = 0; x < W; x++) {
      let acc = s[x] * (r + 1);
      for (let k = 1; k <= r; k++) acc += s[(k < H ? k : H - 1) * W + x];
      for (let y = 0; y < H; y++) {
        d[y * W + x] = acc * norm;
        const a = y + r + 1,
          b = y - r;
        acc += s[(a < H ? a : H - 1) * W + x] - s[(b > 0 ? b : 0) * W + x];
      }
    }
  }
  const scratch = new Float32Array(N);
  function gauss(a, sigma) {
    if (sigma < 0.6) return a;
    const n = 3,
      wIdeal = Math.sqrt((12 * sigma * sigma) / n + 1);
    let wl = Math.floor(wIdeal);
    if (wl % 2 === 0) wl--;
    const m = Math.round(
      (12 * sigma * sigma - n * wl * wl - 4 * n * wl - 3 * n) / (-4 * wl - 4),
    );
    for (let i = 0; i < n; i++) {
      const r = ((i < m ? wl : wl + 2) - 1) >> 1;
      if (r < 1) continue;
      blurH(a, scratch, r);
      blurV(scratch, a, r);
    }
    return a;
  }
  function percentile(arr, mask, q) {
    let cnt = 0;
    for (let i = 0; i < N; i += 3) if (!mask || mask[i]) cnt++;
    const s = new Float32Array(cnt);
    let k = 0;
    for (let i = 0; i < N; i += 3) if (!mask || mask[i]) s[k++] = arr[i];
    s.sort();
    return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * q))] : 0;
  }

  // ---------------------------------------------------------------- 1. compose picture + border
  say("Sorting the stones", 0.02);
  const R = new Float32Array(N),
    G = new Float32Array(N),
    B = new Float32Array(N);
  const pic = new Uint8Array(N),
    fig = new Uint8Array(N);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x,
        ix = x - M,
        iy = y - M;
      if (ix >= 0 && iy >= 0 && ix < iw && iy < ih) {
        const j = (iy * iw + ix) * 4;
        R[i] = src[j] / 255;
        G[i] = src[j + 1] / 255;
        B[i] = src[j + 2] / 255;
        pic[i] = 1;
        if (mask && mask[iy * iw + ix] > 127) fig[i] = 1;
      } else {
        const d = Math.min(x, y, W - 1 - x, H - 1 - y);
        let k = 0;
        while (k < BANDS.length - 1 && d >= ringAt[k]) k++;
        const c = BANDS[k][1];
        R[i] = c[0];
        G[i] = c[1];
        B[i] = c[2];
      }
    }
  }
  lap("compose");

  // ---------------------------------------------------------------- 2. Kuwahara (colour source)
  // Flattens painted texture and thin lines while keeping real edges.
  let KR = R,
    KG = G,
    KB = B;
  const kr = P.smooth | 0;
  if (kr > 0) {
    const W1 = W + 1,
      S = W1 * (H + 1);
    const sR = new Float64Array(S),
      sG = new Float64Array(S),
      sB = new Float64Array(S),
      sQ = new Float64Array(S);
    for (let y = 0; y < H; y++) {
      let aR = 0,
        aG = 0,
        aB = 0,
        aQ = 0;
      for (let x = 0; x < W; x++) {
        const i = y * W + x,
          r = R[i],
          g = G[i],
          b = B[i];
        aR += r;
        aG += g;
        aB += b;
        aQ += r * r + g * g + b * b;
        const o = (y + 1) * W1 + x + 1,
          u = y * W1 + x + 1;
        sR[o] = sR[u] + aR;
        sG[o] = sG[u] + aG;
        sB[o] = sB[u] + aB;
        sQ[o] = sQ[u] + aQ;
      }
    }
    KR = new Float32Array(N);
    KG = new Float32Array(N);
    KB = new Float32Array(N);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        let best = 1e9,
          mr = 0,
          mg = 0,
          mb = 0;
        for (let q = 0; q < 4; q++) {
          let x0 = q & 1 ? x : x - kr,
            x1 = q & 1 ? x + kr : x;
          let y0 = q & 2 ? y : y - kr,
            y1 = q & 2 ? y + kr : y;
          if (x0 < 0) x0 = 0;
          if (y0 < 0) y0 = 0;
          if (x1 > W - 1) x1 = W - 1;
          if (y1 > H - 1) y1 = H - 1;
          const a = y0 * W1 + x0,
            b = y0 * W1 + x1 + 1,
            c = (y1 + 1) * W1 + x0,
            d = (y1 + 1) * W1 + x1 + 1;
          const n = (x1 - x0 + 1) * (y1 - y0 + 1);
          const er = sR[d] - sR[b] - sR[c] + sR[a],
            eg = sG[d] - sG[b] - sG[c] + sG[a],
            eb = sB[d] - sB[b] - sB[c] + sB[a];
          const v =
            (sQ[d] - sQ[b] - sQ[c] + sQ[a]) / n -
            (er * er + eg * eg + eb * eb) / (n * n);
          if (v < best) {
            best = v;
            mr = er / n;
            mg = eg / n;
            mb = eb / n;
          }
        }
        const i = y * W + x;
        KR[i] = mr;
        KG[i] = mg;
        KB[i] = mb;
      }
    }
  }
  lap("kuwahara");

  // ---------------------------------------------------------------- 3. structure tensor
  say("Tracing contours", 0.1);
  const sigE = P.edgeSigma * TP;
  const chans = [
    gauss(Float32Array.from(KR), sigE),
    gauss(Float32Array.from(KG), sigE),
    gauss(Float32Array.from(KB), sigE),
  ];
  const TE = new Float32Array(N),
    TF = new Float32Array(N),
    TG = new Float32Array(N);
  for (let c = 0; c < 3; c++) {
    const C = chans[c];
    for (let y = 0; y < H; y++) {
      const ym = (y > 0 ? y - 1 : 0) * W,
        y0 = y * W,
        yp = (y < H - 1 ? y + 1 : H - 1) * W;
      for (let x = 0; x < W; x++) {
        const xm = x > 0 ? x - 1 : 0,
          xp = x < W - 1 ? x + 1 : W - 1;
        const a = C[ym + xm],
          b = C[ym + x],
          cc = C[ym + xp],
          d = C[y0 + xm],
          f = C[y0 + xp],
          g = C[yp + xm],
          h = C[yp + x],
          k = C[yp + xp];
        const gx = (cc + 2 * f + k - a - 2 * d - g) * 0.125;
        const gy = (g + 2 * h + k - a - 2 * b - cc) * 0.125;
        const i = y0 + x;
        TE[i] += gx * gx;
        TF[i] += gx * gy;
        TG[i] += gy * gy;
      }
    }
  }
  const mag = new Float32Array(N),
    ang = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const e = TE[i],
      f = TF[i],
      g = TG[i];
    const dd = Math.sqrt((e - g) * (e - g) + 4 * f * f);
    mag[i] = Math.sqrt(Math.max(0, 0.5 * (e + g + dd)));
    ang[i] = 0.5 * Math.atan2(2 * f, e - g);
  }
  gauss(TE, 0.6 * TP);
  gauss(TF, 0.6 * TP);
  gauss(TG, 0.6 * TP);
  const angS = new Float32Array(N);
  for (let i = 0; i < N; i++)
    angS[i] = 0.5 * Math.atan2(2 * TF[i], TE[i] - TG[i]);
  lap("tensor");

  // ---------------------------------------------------------------- 4. Canny on the picture
  const p99 = percentile(mag, pic, 0.99) || 1e-6;
  const hi = P.contour * p99,
    lo = 0.45 * hi;
  const nms = new Float32Array(N);
  for (let y = M + 2; y < M + ih - 2; y++) {
    for (let x = M + 2; x < M + iw - 2; x++) {
      const i = y * W + x,
        m = mag[i];
      if (m < lo) continue;
      let a = ang[i];
      if (a < 0) a += Math.PI;
      let n1, n2;
      if (a < 0.3927 || a >= 2.7489) {
        n1 = i - 1;
        n2 = i + 1;
      } else if (a < 1.1781) {
        n1 = i - W - 1;
        n2 = i + W + 1;
      } else if (a < 1.9635) {
        n1 = i - W;
        n2 = i + W;
      } else {
        n1 = i - W + 1;
        n2 = i + W - 1;
      }
      if (m >= mag[n1] && m > mag[n2]) nms[i] = m;
    }
  }
  const edge = new Uint8Array(N);
  const stack = new Int32Array(N);
  const NB = [-W - 1, -W, -W + 1, -1, 1, W - 1, W, W + 1];
  for (let i = 0; i < N; i++) {
    if (nms[i] < hi || edge[i]) continue;
    let sp = 0;
    stack[sp++] = i;
    edge[i] = 1;
    while (sp) {
      const j = stack[--sp];
      for (let k = 0; k < 8; k++) {
        const q = j + NB[k];
        if (!edge[q] && nms[q] >= lo) {
          edge[q] = 1;
          stack[sp++] = q;
        }
      }
    }
  }
  {
    // drop short fragments (painted texture, noise)
    const seen = new Uint8Array(N),
      list = new Int32Array(N);
    const minLen = Math.round(P.minContour * TP);
    for (let i = 0; i < N; i++) {
      if (!edge[i] || seen[i]) continue;
      let sp = 0,
        cnt = 0;
      stack[sp++] = i;
      seen[i] = 1;
      while (sp) {
        const j = stack[--sp];
        list[cnt++] = j;
        for (let k = 0; k < 8; k++) {
          const q = j + NB[k];
          if (edge[q] && !seen[q]) {
            seen[q] = 1;
            stack[sp++] = q;
          }
        }
      }
      if (cnt < minLen) for (let k = 0; k < cnt; k++) edge[list[k]] = 0;
    }
  }
  // A figure cut-out is the strongest contour of all: no tessera straddles the silhouette, and the
  // painted edges hugging it are dropped in its favour, so rows of tiles outline the figure.
  if (mask) {
    const sil = new Uint8Array(N),
      near = new Float32Array(N),
      FM = new Float32Array(N);
    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        const i = y * W + x;
        if (
          fig[i] &&
          (!fig[i - 1] || !fig[i + 1] || !fig[i - W] || !fig[i + W])
        ) {
          sil[i] = 1;
          near[i] = 1;
        }
      }
    }
    gauss(near, 0.5 * TP);
    for (let i = 0; i < N; i++) {
      if (near[i] > 0.002) edge[i] = 0;
      FM[i] = fig[i];
    }
    gauss(FM, 1.5);
    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        const i = y * W + x;
        if (!sil[i]) continue;
        edge[i] = 1;
        angS[i] = Math.atan2(FM[i + W] - FM[i - W], FM[i + 1] - FM[i - 1]);
      }
    }
  }
  // 4-connected contours, so no tile can see through a diagonal step
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      if (edge[i] !== 1) continue;
      if (edge[i + W + 1] === 1 && !edge[i + 1] && !edge[i + W])
        edge[i + 1] = 2;
      if (edge[i + W - 1] === 1 && !edge[i - 1] && !edge[i + W])
        edge[i - 1] = 2;
    }
  }
  // the picture's own frame is a contour too
  if (M > 0) {
    for (let x = M; x < W - M; x++) {
      edge[M * W + x] = 1;
      edge[(H - 1 - M) * W + x] = 1;
      angS[M * W + x] = Math.PI / 2;
      angS[(H - 1 - M) * W + x] = Math.PI / 2;
    }
    for (let y = M; y < H - M; y++) {
      edge[y * W + M] = 1;
      edge[y * W + W - 1 - M] = 1;
      angS[y * W + M] = 0;
      angS[y * W + W - 1 - M] = 0;
    }
  }
  let edgeCount = 0;
  for (let i = 0; i < N; i++)
    if (edge[i]) {
      edge[i] = 1;
      edgeCount++;
    }
  lap("canny");

  // ---------------------------------------------------------------- 5. distance to, and nearest point on, a contour
  say("Planning the rows", 0.2);
  const INF = 1e20,
    L = Math.max(W, H);
  const f1 = new Float64Array(L),
    d1 = new Float64Array(L),
    a1 = new Int32Array(L),
    v1 = new Int32Array(L),
    z1 = new Float64Array(L + 1);
  function edt1d(n) {
    let k = -1;
    for (let q = 0; q < n; q++) {
      const fq = f1[q];
      if (fq > 1e19) continue;
      if (k < 0) {
        k = 0;
        v1[0] = q;
        z1[0] = -Infinity;
        z1[1] = Infinity;
        continue;
      }
      let s;
      for (;;) {
        const vk = v1[k];
        s = (fq + q * q - (f1[vk] + vk * vk)) / (2 * (q - vk));
        if (s <= z1[k]) {
          k--;
          continue;
        }
        break;
      }
      k++;
      v1[k] = q;
      z1[k] = s;
      z1[k + 1] = Infinity;
    }
    if (k < 0) {
      for (let q = 0; q < n; q++) {
        d1[q] = INF;
        a1[q] = -1;
      }
      return;
    }
    let j = 0;
    for (let q = 0; q < n; q++) {
      while (z1[j + 1] < q) j++;
      const vj = v1[j];
      d1[q] = (q - vj) * (q - vj) + f1[vj];
      a1[q] = vj;
    }
  }
  const colD = new Float32Array(N),
    colY = new Int32Array(N);
  for (let x = 0; x < W; x++) {
    for (let y = 0; y < H; y++) f1[y] = edge[y * W + x] ? 0 : INF;
    edt1d(H);
    for (let y = 0; y < H; y++) {
      colD[y * W + x] = d1[y];
      colY[y * W + x] = a1[y];
    }
  }
  const dist = new Float32Array(N),
    near = new Int32Array(N);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) f1[x] = colD[y * W + x];
    edt1d(W);
    for (let x = 0; x < W; x++) {
      const i = y * W + x,
        ax = a1[x];
      dist[i] = ax < 0 ? 1e6 : Math.sqrt(d1[x]);
      near[i] = ax < 0 ? -1 : colY[y * W + ax] * W + ax;
    }
  }
  lap("edt");

  // ---------------------------------------------------------------- 6. tile size: finer where the picture is busy
  const LD = new Float32Array(N);
  for (let i = 0; i < N; i++) LD[i] = 0.3 * KR[i] + 0.59 * KG[i] + 0.11 * KB[i];
  gauss(LD, 0.35 * TP);
  const DM = new Float32Array(N);
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      const gx = LD[i + 1] - LD[i - 1],
        gy = LD[i + W] - LD[i - W];
      DM[i] = pic[i] ? Math.sqrt(gx * gx + gy * gy) : 0;
    }
  }
  gauss(DM, 1.6 * TP);
  const p97 = percentile(DM, pic, 0.97) || 1e-6;
  const SZ = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    if (!pic[i]) {
      SZ[i] = TP;
      continue;
    }
    let v = DM[i] / p97;
    if (v > 1) v = 1;
    SZ[i] = TP * (1 - P.detail * v ** 0.8);
  }
  gauss(SZ, 0.5 * TP);
  // Background courses are rowH tall, chosen to divide the picture exactly; rows along the frame use
  // the same height so they continue straight into the courses without a seam.
  const rowH = ih / Math.max(1, Math.round(ih / TP));
  if (M > 0) {
    for (let x = M; x < W - M; x++) {
      SZ[M * W + x] = rowH;
      SZ[(H - 1 - M) * W + x] = rowH;
    }
    for (let y = M; y < H - M; y++) {
      SZ[y * W + M] = rowH;
      SZ[y * W + W - 1 - M] = rowH;
    }
  }
  lap("size");

  // ---------------------------------------------------------------- 7. rows (andamento) and tile orientation
  // Near a contour, rows run parallel to it, each as wide as the tesserae chosen for that contour,
  // counted outward from the line; further out they settle into straight horizontal courses of
  // full-size tiles. The border has its own rows, parallel to the frame and mitred at the corners.
  // A tile may only claim pixels of its own row.
  const echoRows = Math.max(1, Math.round(P.echo));
  const VX = new Float32Array(N),
    VY = new Float32Array(N),
    band = new Int32Array(N);
  const SE = new Float32Array(N),
    zone = new Uint8Array(N); // effective tile size; 1 = follows a contour
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      SE[i] = TP;
      if (!pic[i]) {
        band[i] =
          2000000 + Math.floor(Math.min(x, y, W - 1 - x, H - 1 - y) / TP);
        continue;
      }
      SE[i] = rowH;
      const D = dist[i],
        q = near[i];
      const w = q >= 0 ? SZ[q] : TP;
      if (q >= 0 && D < echoRows * w) {
        SE[i] = w;
        zone[i] = 1;
        band[i] = Math.floor(D / w);
        let a;
        if (D < 2) a = angS[q];
        else {
          const qy = (q / W) | 0,
            qx = q - qy * W;
          a = Math.atan2(y - qy, x - qx);
        }
        VX[i] = Math.cos(4 * a);
        VY[i] = Math.sin(4 * a);
      } else {
        band[i] = 1000000 + Math.floor((y - M) / rowH);
      }
    }
  }
  gauss(VX, 0.25 * TP);
  gauss(VY, 0.25 * TP);
  const CO = new Float32Array(N),
    SI = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    if (!zone[i]) {
      CO[i] = 1;
      SI[i] = 0;
      continue;
    }
    const a = 0.25 * Math.atan2(VY[i], VX[i]);
    CO[i] = Math.cos(a);
    SI[i] = Math.sin(a);
  }
  lap("rows");

  // ---------------------------------------------------------------- 8. seed tiles by error diffusion
  say("Scattering tesserae", 0.26);
  const DEN = new Float32Array(N);
  let expected = 0;
  for (let i = 0; i < N; i++) {
    const v = edge[i] ? 0 : 1 / (SE[i] * SE[i]);
    DEN[i] = v;
    expected += v;
  }
  const cap = Math.ceil(expected * 1.6) + 256;
  const sx = new Float32Array(cap),
    sy = new Float32Array(cap),
    sc = new Float32Array(cap),
    ss = new Float32Array(cap),
    isz = new Float32Array(cap);
  const sb = new Int32Array(cap);
  let n = 0;
  function orient(s) {
    const k = Math.min(H - 1, sy[s] | 0) * W + Math.min(W - 1, sx[s] | 0);
    sc[s] = CO[k];
    ss[s] = SI[k];
    isz[s] = 1 / SE[k];
  }
  for (let y = 0; y < H; y++) {
    const ltr = (y & 1) === 0,
      dx = ltr ? 1 : -1;
    for (let k = 0; k < W; k++) {
      const x = ltr ? k : W - 1 - k,
        i = y * W + x;
      const v = DEN[i];
      let e = v;
      if (v >= 0.5) {
        e = v - 1;
        if (!edge[i] && n < cap) {
          sx[n] = x + 0.5;
          sy[n] = y + 0.5;
          sb[n] = band[i];
          orient(n);
          n++;
        }
      }
      const xr = x + dx,
        xl = x - dx;
      if (xr >= 0 && xr < W) DEN[i + dx] += e * 0.4375;
      if (y + 1 < H) {
        if (xl >= 0 && xl < W) DEN[i + W - dx] += e * 0.1875;
        DEN[i + W] += e * 0.3125;
        if (xr >= 0 && xr < W) DEN[i + W + dx] += e * 0.0625;
      }
    }
  }
  lap("seed");

  // ---------------------------------------------------------------- 9. Lloyd relaxation, oriented L∞ metric
  // Each tile owns the pixels of its row that are closest in its own rotated square metric, so
  // cells become squares aligned to the rows. Contour pixels are grout, and a tile may not claim a
  // pixel it cannot "see" across a contour, so no tessera straddles an outline.
  const CELL = TP,
    gw = Math.ceil(W / CELL),
    gh = Math.ceil(H / CELL);
  const head = new Int32Array(gw * gh),
    nxt = new Int32Array(cap);
  function buildGrid() {
    head.fill(-1);
    for (let s = 0; s < n; s++) {
      const gx = Math.min(gw - 1, (sx[s] / CELL) | 0),
        gy = Math.min(gh - 1, (sy[s] / CELL) | 0);
      const c = gy * gw + gx;
      nxt[s] = head[c];
      head[c] = s;
    }
  }
  const nearEdge = new Uint8Array(N);
  for (let i = 0; i < N; i++) nearEdge[i] = dist[i] < 1.6 * TP ? 1 : 0;
  function visible(px, py, qx, qy) {
    const dx = qx - px,
      dy = qy - py;
    const len = Math.max(Math.abs(dx), Math.abs(dy));
    const steps = Math.ceil(len / 0.6);
    const i0 = (py | 0) * W + (px | 0);
    for (let k = 1; k < steps; k++) {
      const t = k / steps;
      const j = ((py + dy * t) | 0) * W + ((px + dx * t) | 0);
      if (j !== i0 && edge[j]) return false;
    }
    return true;
  }
  function clear(px, py, s, de2) {
    const dx = sx[s] - px,
      dy = sy[s] - py;
    if (dx * dx + dy * dy <= de2) return true; // nearest contour is farther than the tile
    return visible(px, py, sx[s], sy[s]);
  }
  const CUT = 0.95;
  const bestD = new Float32Array(1);
  function owner(px, py, i) {
    const bi = band[i];
    const gx = (px / CELL) | 0,
      gy = (py / CELL) | 0;
    const cx0 = gx > 0 ? gx - 1 : 0,
      cx1 = gx < gw - 1 ? gx + 1 : gw - 1;
    const cy0 = gy > 0 ? gy - 1 : 0,
      cy1 = gy < gh - 1 ? gy + 1 : gh - 1;
    let b1 = -1,
      e1 = 1e9,
      b2 = -1,
      e2 = 1e9,
      b3 = -1,
      e3 = 1e9;
    for (let cy = cy0; cy <= cy1; cy++) {
      const row = cy * gw;
      for (let cx = cx0; cx <= cx1; cx++) {
        for (let s = head[row + cx]; s >= 0; s = nxt[s]) {
          if (sb[s] !== bi) continue;
          const dx = px - sx[s],
            dy = py - sy[s];
          let u = dx * sc[s] + dy * ss[s],
            v = dy * sc[s] - dx * ss[s];
          if (u < 0) u = -u;
          if (v < 0) v = -v;
          const d = (u > v ? u : v) * isz[s];
          if (d < e3) {
            if (d < e2) {
              b3 = b2;
              e3 = e2;
              if (d < e1) {
                b2 = b1;
                e2 = e1;
                b1 = s;
                e1 = d;
              } else {
                b2 = s;
                e2 = d;
              }
            } else {
              b3 = s;
              e3 = d;
            }
          }
        }
      }
    }
    if (b1 < 0 || e1 > CUT) return -1;
    if (nearEdge[i]) {
      const de = dist[i] - 1.0,
        de2 = de > 0 ? de * de : -1;
      if (clear(px, py, b1, de2)) {
        bestD[0] = e1;
        return b1;
      }
      if (b2 >= 0 && e2 <= CUT && clear(px, py, b2, de2)) {
        bestD[0] = e2;
        return b2;
      }
      if (b3 >= 0 && e3 <= CUT && clear(px, py, b3, de2)) {
        bestD[0] = e3;
        return b3;
      }
      return -1;
    }
    bestD[0] = e1;
    return b1;
  }
  // Seeds land unevenly; open patches of a row get a new tile, squeezed-out tiles are dropped.
  const Wc = (W + 1) >> 1,
    Hc = (H + 1) >> 1;
  const unc = new Uint8Array(Wc * Hc),
    occ = new Uint8Array(Wc * Hc);
  function fillHoles() {
    occ.fill(0);
    for (let cy = 1; cy < Hc - 1; cy++) {
      for (let cx = 1; cx < Wc - 1; cx++) {
        const c = cy * Wc + cx;
        if (!unc[c] || occ[c]) continue;
        let cnt = 0;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) cnt += unc[c + dy * Wc + dx];
        if (cnt < 5) continue;
        const x = cx * 2,
          y = cy * 2,
          i = y * W + x;
        if (edge[i] || n >= cap) continue;
        sx[n] = x + 0.5;
        sy[n] = y + 0.5;
        sb[n] = band[i];
        orient(n);
        n++;
        const r = Math.max(1, Math.round(SE[i] * 0.45));
        for (let yy = Math.max(0, cy - r); yy <= Math.min(Hc - 1, cy + r); yy++)
          for (
            let xx = Math.max(0, cx - r);
            xx <= Math.min(Wc - 1, cx + r);
            xx++
          )
            occ[yy * Wc + xx] = 1;
      }
    }
  }
  const iters = P.iters | 0,
    coarse = Math.max(0, Math.min(iters - 3, P.coarse | 0));
  const accX = new Float64Array(cap),
    accY = new Float64Array(cap),
    accN = new Float32Array(cap);
  for (let it = 0; it < iters; it++) {
    const step = it < coarse ? 2 : 1;
    buildGrid();
    accX.fill(0, 0, n);
    accY.fill(0, 0, n);
    accN.fill(0, 0, n);
    unc.fill(0);
    for (let y = 0; y < H; y += step) {
      const py = y + 0.5;
      for (let x = 0; x < W; x += step) {
        const i = y * W + x;
        if (edge[i]) continue;
        const px = x + 0.5;
        const s = owner(px, py, i);
        if (s < 0) {
          if (((x | y) & 1) === 0) unc[(y >> 1) * Wc + (x >> 1)] = 1;
          continue;
        }
        accX[s] += px;
        accY[s] += py;
        accN[s] += 1;
      }
    }
    const area = step * step;
    let m = 0;
    for (let s = 0; s < n; s++) {
      const sz = 1 / isz[s];
      if (accN[s] * area < 0.08 * sz * sz) continue;
      let nx = accX[s] / accN[s],
        ny = accY[s] / accN[s];
      let k = (ny | 0) * W + (nx | 0);
      if (edge[k] || band[k] !== sb[s]) {
        nx = (nx + sx[s]) * 0.5;
        ny = (ny + sy[s]) * 0.5;
        k = (ny | 0) * W + (nx | 0);
        if (edge[k] || band[k] !== sb[s]) {
          nx = sx[s];
          ny = sy[s];
        }
      }
      sx[m] = nx;
      sy[m] = ny;
      sb[m] = sb[s];
      orient(m);
      m++;
    }
    n = m;
    if (it < iters - 2) fillHoles();
    say("Laying tesserae", 0.3 + (0.52 * (it + 1)) / iters);
  }
  lap("lloyd");

  // ---------------------------------------------------------------- 10. final pass at 2× for shapes & colour
  say("Cutting each stone", 0.86);
  buildGrid();
  const R2 = Math.SQRT1_2;
  const sup = new Float32Array(n * 8).fill(-1e9);
  const cR = new Float64Array(n),
    cG = new Float64Array(n),
    cB = new Float64Array(n),
    cW = new Float64Array(n);
  const cnt = new Int32Array(n);
  for (let y2 = 0; y2 < H * 2; y2++) {
    const py = (y2 + 0.5) * 0.5,
      iy = (py | 0) * W;
    for (let x2 = 0; x2 < W * 2; x2++) {
      const px = (x2 + 0.5) * 0.5,
        i = iy + (px | 0);
      const s = owner(px, py, i);
      if (s < 0) continue;
      const dx = px - sx[s],
        dy = py - sy[s];
      const u = dx * sc[s] + dy * ss[s],
        v = dy * sc[s] - dx * ss[s];
      const o = s * 8,
        p = (u + v) * R2,
        q = (u - v) * R2;
      if (u > sup[o]) sup[o] = u;
      if (-u > sup[o + 1]) sup[o + 1] = -u;
      if (v > sup[o + 2]) sup[o + 2] = v;
      if (-v > sup[o + 3]) sup[o + 3] = -v;
      if (p > sup[o + 4]) sup[o + 4] = p;
      if (-p > sup[o + 5]) sup[o + 5] = -p;
      if (q > sup[o + 6]) sup[o + 6] = q;
      if (-q > sup[o + 7]) sup[o + 7] = -q;
      let w = 1 - bestD[0] * 1.7;
      w = w > 0 ? 0.04 + w * w : 0.04;
      if (edge[i]) w *= 0.25;
      cR[s] += KR[i] * w;
      cG[s] += KG[i] * w;
      cB[s] += KB[i] * w;
      cW[s] += w;
      cnt[s]++;
    }
  }
  lap("final");

  // ---------------------------------------------------------------- 11. pack
  const keep = new Uint8Array(n);
  let m = 0;
  for (let s = 0; s < n; s++) {
    const z = 1 / isz[s];
    if (cnt[s] >= Math.max(6, 0.36 * z * z)) {
      keep[s] = 1;
      m++;
    }
  }
  const out = {
    type: "done",
    job,
    W,
    H,
    M,
    TP,
    iw,
    ih,
    count: m,
    cx: new Float32Array(m),
    cy: new Float32Array(m),
    ca: new Float32Array(m),
    sa: new Float32Array(m),
    size: new Float32Array(m),
    pic: new Uint8Array(m),
    fig: new Uint8Array(m),
    sup: new Float32Array(m * 8),
    col: new Float32Array(m * 3),
    edges: edgeCount,
    ms: 0,
    marks,
  };
  for (let s = 0, t = 0; s < n; s++) {
    if (!keep[s]) continue;
    const k = Math.min(H - 1, sy[s] | 0) * W + Math.min(W - 1, sx[s] | 0);
    out.cx[t] = sx[s];
    out.cy[t] = sy[s];
    out.ca[t] = sc[s];
    out.sa[t] = ss[s];
    out.size[t] = 1 / isz[s];
    out.pic[t] = pic[k];
    out.fig[t] = fig[k];
    for (let j = 0; j < 8; j++) out.sup[t * 8 + j] = sup[s * 8 + j];
    out.col[t * 3] = cR[s] / cW[s];
    out.col[t * 3 + 1] = cG[s] / cW[s];
    out.col[t * 3 + 2] = cB[s] / cW[s];
    t++;
  }
  const transfer = [
    out.cx.buffer,
    out.cy.buffer,
    out.ca.buffer,
    out.sa.buffer,
    out.size.buffer,
    out.pic.buffer,
    out.fig.buffer,
    out.sup.buffer,
    out.col.buffer,
  ];
  if (P.debug) {
    out.debug = { edge, size: SE, co: CO, si: SI, band };
    transfer.push(edge.buffer, SE.buffer, CO.buffer, SI.buffer, band.buffer);
  }
  out.ms = Date.now() - t0;
  post(out, transfer);
}
