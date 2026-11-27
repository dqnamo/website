// The ways a thin metal plate can ring, bolted through its middle to a stand. Each mode is a
// shape the plate bends into and a frequency it rings at, found the way Walther Ritz found them
// for Chladni's figures in 1909: write the plate's bending as a sum of smooth shapes, here
// products of Legendre polynomials, and look for the sums whose bending energy is smallest for
// how much they move. The plate's edges are free, which needs no rule at all in this method; it
// falls out of minimising the energy. The bolt is a stiff spring over the washer's disc, which
// holds that patch still and with it the slope of the plate around it.
//
// Lengths are in units of the half-width of the square, or the radius of the round plate, and
// a frequency comes out as Ω = ω a² √(ρh/D), which a plate's metal, thickness and size turn
// into hertz. A square plate and a round one are both symmetric about their two axes, so modes
// split into four families by whether they're odd or even across each, and each family is
// found on its own, which is sixteen times less work than all of them at once.

export type PlateShape = "square" | "round";

export type Modes = {
  shape: PlateShape;
  count: number;
  // Ω for each mode, lowest first.
  omega: Float64Array;
  // How strongly a driver shaking the bolt up and down excites each mode: the plate's mass
  // that moves with the mode, with a slight unevenness in the metal, so modes that a perfectly
  // even plate would keep perfectly still still answer it a little.
  drive: Float64Array;
  // The mode's height at a point on the plate.
  at(mode: number, x: number, y: number): number;
  // The mode's height over a size × size grid across the square from −1 to 1, row by row. Made
  // afresh each time, so keep it.
  field(mode: number, size: number): Float32Array;
  inside(x: number, y: number): boolean;
};

// Polynomials up to this total degree. Enough for about the first hundred modes, which is
// further than sand can follow on a plate this size.
const DEGREE = 24;
// The washer's radius, and how stiffly the bolt holds the plate under it.
const WASHER = 0.11;
const CLAMP = 1e9;
// Modes above this Ω are left out; the basis is too coarse to draw them truthfully.
const MAX_OMEGA = 230;

type Point = { x: number; y: number; w: number };

// Legendre polynomials scaled to unit square integral on [−1, 1], with their first and second
// derivatives, all from the three-term recurrences.
function legendre(
  x: number,
  n: number,
  p: number[],
  dp: number[],
  ddp: number[],
) {
  p[0] = 1;
  dp[0] = 0;
  ddp[0] = 0;
  if (n > 0) {
    p[1] = x;
    dp[1] = 1;
    ddp[1] = 0;
  }
  for (let k = 1; k < n; k++) {
    p[k + 1] = ((2 * k + 1) * x * p[k] - k * p[k - 1]) / (k + 1);
    dp[k + 1] = dp[k - 1] + (2 * k + 1) * p[k];
    ddp[k + 1] = ddp[k - 1] + (2 * k + 1) * dp[k];
  }
  for (let k = 0; k <= n; k++) {
    const scale = Math.sqrt((2 * k + 1) / 2);
    p[k] *= scale;
    dp[k] *= scale;
    ddp[k] *= scale;
  }
}

// Gauss–Legendre nodes and weights on [−1, 1], by Newton's method from the usual first guess.
function gauss(n: number) {
  const nodes: number[] = [];
  const weights: number[] = [];
  for (let i = 0; i < n; i++) {
    let x = Math.cos((Math.PI * (i + 0.75)) / (n + 0.5));
    let derivative = 1;
    for (let iteration = 0; iteration < 100; iteration++) {
      let p0 = 1;
      let p1 = x;
      for (let k = 1; k < n; k++) {
        const p2 = ((2 * k + 1) * x * p1 - k * p0) / (k + 1);
        p0 = p1;
        p1 = p2;
      }
      derivative = (n * (x * p1 - p0)) / (x * x - 1);
      const dx = p1 / derivative;
      x -= dx;
      if (Math.abs(dx) < 1e-15) break;
    }
    nodes.push(x);
    weights.push(2 / ((1 - x * x) * derivative * derivative));
  }
  return { nodes, weights };
}

// Points and weights that integrate polynomials of the basis's degree exactly over the plate:
// a Gauss grid on the square, and Gauss in radius by even steps round the disc.
function quadrature(shape: PlateShape, degree: number): Point[] {
  const points: Point[] = [];
  if (shape === "square") {
    const { nodes, weights } = gauss(degree + 2);
    for (let i = 0; i < nodes.length; i++)
      for (let j = 0; j < nodes.length; j++)
        points.push({ x: nodes[i], y: nodes[j], w: weights[i] * weights[j] });
    return points;
  }
  return disc(1, degree + 2, 2 * degree + 4);
}

function disc(radius: number, rings: number, spokes: number): Point[] {
  const points: Point[] = [];
  const { nodes, weights } = gauss(rings);
  for (let i = 0; i < rings; i++) {
    const r = ((nodes[i] + 1) / 2) * radius;
    const w = (weights[i] / 2) * radius * r * ((2 * Math.PI) / spokes);
    for (let j = 0; j < spokes; j++) {
      const angle = ((j + 0.5) / spokes) * 2 * Math.PI;
      points.push({ x: r * Math.cos(angle), y: r * Math.sin(angle), w });
    }
  }
  return points;
}

// A gentle unevenness in thickness, a few per cent, the same on every plate of a shape.
function unevenness(x: number, y: number) {
  return (
    0.05 *
    (0.5 * x +
      0.35 * y +
      0.6 * (x * x - y * y) +
      0.7 * x * y +
      0.4 * x * y * (x * x - y * y) -
      0.3 * x * x * y)
  );
}

// Cyclic Jacobi rotations for a symmetric matrix: slow for big ones, but these are small, and
// it's sure to converge. Eigenvectors come back as the columns of v.
function jacobi(a: Float64Array, n: number) {
  const v = new Float64Array(n * n);
  for (let i = 0; i < n; i++) v[i * n + i] = 1;
  for (let sweep = 0; sweep < 60; sweep++) {
    let off = 0;
    let diagonal = 0;
    for (let p = 0; p < n; p++) {
      diagonal += a[p * n + p] * a[p * n + p];
      for (let q = p + 1; q < n; q++) off += a[p * n + q] * a[p * n + q];
    }
    if (off <= 1e-26 * diagonal) break;
    for (let p = 0; p < n - 1; p++) {
      for (let q = p + 1; q < n; q++) {
        const apq = a[p * n + q];
        if (Math.abs(apq) < 1e-300) continue;
        const theta = (a[q * n + q] - a[p * n + p]) / (2 * apq);
        const t =
          Math.sign(theta || 1) /
          (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;
        for (let k = 0; k < n; k++) {
          const akp = a[k * n + p];
          const akq = a[k * n + q];
          a[k * n + p] = c * akp - s * akq;
          a[k * n + q] = s * akp + c * akq;
        }
        for (let k = 0; k < n; k++) {
          const apk = a[p * n + k];
          const aqk = a[q * n + k];
          a[p * n + k] = c * apk - s * aqk;
          a[q * n + k] = s * apk + c * aqk;
        }
        for (let k = 0; k < n; k++) {
          const vkp = v[k * n + p];
          const vkq = v[k * n + q];
          v[k * n + p] = c * vkp - s * vkq;
          v[k * n + q] = s * vkp + c * vkq;
        }
      }
    }
  }
  const values = new Float64Array(n);
  for (let i = 0; i < n; i++) values[i] = a[i * n + i];
  return { values, vectors: v };
}

// K x = λ M x, by turning it into an ordinary problem through M's Cholesky factor.
function generalised(k: Float64Array, m: Float64Array, n: number) {
  const l = new Float64Array(n * n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = m[i * n + j];
      for (let p = 0; p < j; p++) sum -= l[i * n + p] * l[j * n + p];
      l[i * n + j] =
        i === j ? Math.sqrt(Math.max(sum, 1e-300)) : sum / l[j * n + j];
    }
  }
  // Y = L⁻¹ K, then C = L⁻¹ Yᵀ, which is L⁻¹ K L⁻ᵀ.
  const solve = (b: Float64Array) => {
    const out = new Float64Array(n * n);
    for (let col = 0; col < n; col++) {
      for (let i = 0; i < n; i++) {
        let sum = b[i * n + col];
        for (let p = 0; p < i; p++) sum -= l[i * n + p] * out[p * n + col];
        out[i * n + col] = sum / l[i * n + i];
      }
    }
    return out;
  };
  const y = solve(k);
  const yt = new Float64Array(n * n);
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) yt[i * n + j] = y[j * n + i];
  const c = solve(yt);
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++) {
      const mean = (c[i * n + j] + c[j * n + i]) / 2;
      c[i * n + j] = c[j * n + i] = mean;
    }
  const { values, vectors } = jacobi(c, n);
  // Back from the ordinary problem's vectors to the plate's: x = L⁻ᵀ y.
  const x = new Float64Array(n * n);
  for (let col = 0; col < n; col++) {
    for (let i = n - 1; i >= 0; i--) {
      let sum = vectors[i * n + col];
      for (let p = i + 1; p < n; p++) sum -= l[p * n + i] * x[p * n + col];
      x[i * n + col] = sum / l[i * n + i];
    }
  }
  return { values, vectors: x };
}

const yieldToPage = () => new Promise((resolve) => setTimeout(resolve, 0));

export async function solveModes(
  shape: PlateShape,
  poisson: number,
): Promise<Modes> {
  const n = DEGREE;
  const basis: [number, number][] = [];
  for (let i = 0; i <= n; i++)
    for (let j = 0; i + j <= n; j++) basis.push([i, j]);

  const points = quadrature(shape, n);
  // Spokes in fours, so the washer is as symmetric as the plate and paired modes stay paired.
  const washer = disc(WASHER, 6, 52);

  // Each point's polynomials and their derivatives, in x and in y.
  type Values = { p: number[]; dp: number[]; ddp: number[] };
  const table = (t: number): Values => {
    const values = {
      p: [] as number[],
      dp: [] as number[],
      ddp: [] as number[],
    };
    legendre(t, n, values.p, values.dp, values.ddp);
    return values;
  };
  const atPoints = points.map((point) => ({
    x: table(point.x),
    y: table(point.y),
  }));
  const atWasher = washer.map((point) => ({
    x: table(point.x),
    y: table(point.y),
  }));

  const omegas: number[] = [];
  const drives: number[] = [];
  const shapes: { block: number[]; coefficients: Float64Array }[] = [];

  for (let family = 0; family < 4; family++) {
    const block = basis
      .map((entry, index) => ({ entry, index }))
      .filter(
        ({ entry }) =>
          entry[0] % 2 === (family & 1) && entry[1] % 2 === family >> 1,
      )
      .map(({ index }) => index);
    const size = block.length;
    const k = new Float64Array(size * size);
    const m = new Float64Array(size * size);
    const g = new Float64Array(size);
    const f = new Float64Array(size);
    const fxx = new Float64Array(size);
    const fyy = new Float64Array(size);
    const fxy = new Float64Array(size);
    const twist = 2 * (1 - poisson);

    for (let q = 0; q < points.length; q++) {
      const { x, y } = atPoints[q];
      const { w } = points[q];
      for (let b = 0; b < size; b++) {
        const [i, j] = basis[block[b]];
        f[b] = x.p[i] * y.p[j];
        fxx[b] = x.ddp[i] * y.p[j];
        fyy[b] = x.p[i] * y.ddp[j];
        fxy[b] = x.dp[i] * y.dp[j];
        g[b] += w * (1 + unevenness(points[q].x, points[q].y)) * f[b];
      }
      for (let a = 0; a < size; a++) {
        const wa = w * f[a];
        const wxx = w * fxx[a];
        const wyy = w * fyy[a];
        const wxy = w * fxy[a] * twist;
        const row = a * size;
        for (let b = a; b < size; b++) {
          m[row + b] += wa * f[b];
          k[row + b] +=
            wxx * fxx[b] +
            wyy * fyy[b] +
            poisson * (wxx * fyy[b] + wyy * fxx[b]) +
            wxy * fxy[b];
        }
      }
    }
    for (let q = 0; q < washer.length; q++) {
      const { x, y } = atWasher[q];
      const w = washer[q].w * CLAMP;
      for (let b = 0; b < size; b++) {
        const [i, j] = basis[block[b]];
        f[b] = x.p[i] * y.p[j];
      }
      for (let a = 0; a < size; a++)
        for (let b = a; b < size; b++) k[a * size + b] += w * f[a] * f[b];
    }
    for (let a = 0; a < size; a++)
      for (let b = a + 1; b < size; b++) {
        k[b * size + a] = k[a * size + b];
        m[b * size + a] = m[a * size + b];
      }

    const { values, vectors } = generalised(k, m, size);
    for (let mode = 0; mode < size; mode++) {
      const lambda = values[mode];
      if (!(lambda > 0)) continue;
      const omega = Math.sqrt(lambda);
      if (omega > MAX_OMEGA) continue;
      const coefficients = new Float64Array(size);
      let drive = 0;
      for (let b = 0; b < size; b++) {
        coefficients[b] = vectors[b * size + mode];
        drive += g[b] * coefficients[b];
      }
      omegas.push(omega);
      drives.push(drive);
      shapes.push({ block, coefficients });
    }
    await yieldToPage();
  }

  const order = omegas.map((_, i) => i).sort((a, b) => omegas[a] - omegas[b]);
  const omega = Float64Array.from(order, (i) => omegas[i]);
  const drive = Float64Array.from(order, (i) => drives[i]);
  const sorted = order.map((i) => shapes[i]);

  // Every mode's coefficients spread over the whole basis, as a grid indexed [i][j], so a
  // point needs only one table of polynomials.
  const full = sorted.map(({ block, coefficients }) => {
    const grid = new Float64Array((n + 1) * (n + 1));
    block.forEach((index, b) => {
      const [i, j] = basis[index];
      grid[i * (n + 1) + j] = coefficients[b];
    });
    return grid;
  });

  const px: number[] = [];
  const py: number[] = [];
  const scratch: number[] = [];
  const scratch2: number[] = [];
  function at(mode: number, x: number, y: number) {
    legendre(x, n, px, scratch, scratch2);
    legendre(y, n, py, scratch, scratch2);
    const c = full[mode];
    let sum = 0;
    for (let i = 0; i <= n; i++) {
      let row = 0;
      for (let j = 0; i + j <= n; j++) row += c[i * (n + 1) + j] * py[j];
      sum += px[i] * row;
    }
    return sum;
  }

  const tables = new Map<number, Float64Array>();
  function polynomialsOver(size: number) {
    let known = tables.get(size);
    if (!known) {
      known = new Float64Array(size * (n + 1));
      const p: number[] = [];
      for (let s = 0; s < size; s++) {
        legendre(-1 + (2 * s) / (size - 1), n, p, scratch, scratch2);
        for (let i = 0; i <= n; i++) known[s * (n + 1) + i] = p[i];
      }
      tables.set(size, known);
    }
    return known;
  }

  function field(mode: number, size: number) {
    const p = polynomialsOver(size);
    const c = full[mode];
    const stride = n + 1;
    // Along y first, for each degree in x; then across x.
    const partial = new Float64Array(stride * size);
    for (let i = 0; i <= n; i++)
      for (let s = 0; s < size; s++) {
        let sum = 0;
        for (let j = 0; i + j <= n; j++)
          sum += c[i * stride + j] * p[s * stride + j];
        partial[i * size + s] = sum;
      }
    const out = new Float32Array(size * size);
    for (let row = 0; row < size; row++)
      for (let col = 0; col < size; col++) {
        let sum = 0;
        for (let i = 0; i <= n; i++)
          sum += p[col * stride + i] * partial[i * size + row];
        out[row * size + col] = sum;
      }
    return out;
  }

  return {
    shape,
    count: omega.length,
    omega,
    drive,
    at,
    field,
    inside: (x, y) =>
      shape === "square"
        ? Math.abs(x) <= 1 && Math.abs(y) <= 1
        : x * x + y * y <= 1,
  };
}
