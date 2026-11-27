// A coin spun on a table, modelled as a rigid disc rolling on its rim without slipping. That one
// rule explains nearly everything a spun coin does. Spun fast and upright, it turns about the
// vertical through the point it stands on, and spin holds it up the way it holds up a top. As
// friction slows it, it starts to lean, and once it leans, rolling takes over: the point it
// touches runs round in a circle while the coin barely turns. Gravity and the rolling constraint
// fix how fast that point must run for a given lean (about 2√(g/aα) for a small lean α), so as
// the coin loses energy and settles lower, the point has to go round faster and faster. That is
// the rising whirr, and it would go on rising for ever if the cushion of air under the nearly
// flat coin didn't drain the last of the energy in a finite time, so it stops dead. That same
// air soon stops the coin turning on the spot, leaving it turning at only about Ωα²/2, so the
// picture on its face all but stops while the wobble races.
//
// The state is the coin's orientation, its angular velocity and where its centre of mass is on
// the table. The contact force is whatever keeps the touching point still, so it's eliminated:
// with r from the centre of mass to the contact, the centre moves at r × ω, and differentiating
// that and putting it into Euler's equations gives one 3×3 system for the angular acceleration.
// The rim is the coin's edge rounded off, a torus where it touches, so the contact moves smoothly
// round and across the edge. A real coin's heads side carries more metal in its relief, which
// puts the centre of mass a whisker off the middle; spun, that tips the slowing coin heads down.

export type Vec = [number, number, number];
// w, x, y, z: from the coin's own frame (z out of the heads face) to the table's (z up).
export type Quat = [number, number, number, number];

export type Disc = {
  // Metres and kilograms.
  radius: number;
  thickness: number;
  // The radius the rim's corners are rounded to.
  edge: number;
  // A washer's hole; zero for a coin.
  hole: number;
  mass: number;
  // How far the centre of mass sits towards the heads face.
  offset: number;
};

// Resistance as torque per unit of angular velocity, in units of m·a² a second: rolling, the
// air squeezed out from under a coin lying nearly flat (which grows as the gap closes), and
// pivoting on the spot.
export type Drag = { roll: number; air: number; pivot: number };

export type Motion = { q: Quat; w: Vec; x: number; y: number };

export const G = 9.81;
// How sharply the contact crosses the flat band of a thick edge as the coin passes upright.
const BAND = 0.08;
// Shearing the air film to turn a nearly flat coin costs far more than squeezing it to roll.
const SHEAR = 20;

const cross = (a: Vec, b: Vec): Vec => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

export function rotate(q: Quat, v: Vec): Vec {
  const [w, x, y, z] = q;
  // v + 2w(q × v) + 2q × (q × v)
  const tx = 2 * (y * v[2] - z * v[1]);
  const ty = 2 * (z * v[0] - x * v[2]);
  const tz = 2 * (x * v[1] - y * v[0]);
  return [
    v[0] + w * tx + (y * tz - z * ty),
    v[1] + w * ty + (z * tx - x * tz),
    v[2] + w * tz + (x * ty - y * tx),
  ];
}

export const axisOf = (q: Quat): Vec => rotate(q, [0, 0, 1]);

// The orientation whose columns are the given frame (right, up the design, out of heads).
export function fromFrame(e1: Vec, e2: Vec, e3: Vec): Quat {
  const [m00, m10, m20] = e1;
  const [m01, m11, m21] = e2;
  const [m02, m12, m22] = e3;
  const trace = m00 + m11 + m22;
  let q: Quat;
  if (trace > 0) {
    const s = Math.sqrt(trace + 1) * 2;
    q = [s / 4, (m21 - m12) / s, (m02 - m20) / s, (m10 - m01) / s];
  } else if (m00 > m11 && m00 > m22) {
    const s = Math.sqrt(1 + m00 - m11 - m22) * 2;
    q = [(m21 - m12) / s, s / 4, (m01 + m10) / s, (m02 + m20) / s];
  } else if (m11 > m22) {
    const s = Math.sqrt(1 + m11 - m00 - m22) * 2;
    q = [(m02 - m20) / s, (m01 + m10) / s, s / 4, (m12 + m21) / s];
  } else {
    const s = Math.sqrt(1 + m22 - m00 - m11) * 2;
    q = [(m10 - m01) / s, (m02 + m20) / s, (m12 + m21) / s, s / 4];
  }
  return normalise(q);
}

export function normalise(q: Quat): Quat {
  const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  return [q[0] / l, q[1] / l, q[2] / l, q[3] / l];
}

export function inertia(d: Disc) {
  const a2 = d.radius * d.radius + d.hole * d.hole;
  return {
    // About a diameter, and about the axis.
    across: d.mass * (a2 / 4 + (d.thickness * d.thickness) / 12),
    axial: (d.mass * a2) / 2,
  };
}

// Where the coin touches the table, from its centre of mass, for an axis n. The rim's corners
// are a torus: the tube's centre circle has radius a − ρ and sits back from the mid-plane by
// half the thickness less ρ, on whichever side is lower, and the contact is the lowest point of
// that circle, dropped by ρ.
function contact(d: Disc, n: Vec, nDot?: Vec) {
  const nz = n[2];
  const lean = Math.sqrt(Math.max(1e-12, 1 - nz * nz));
  // Down the coin's face: the direction in its plane that points most steeply down.
  const u: Vec = [
    (nz * n[0]) / lean,
    (nz * n[1]) / lean,
    (-1 + nz * nz) / lean,
  ];
  const ring = d.radius - d.edge;
  const band = d.thickness / 2 - d.edge;
  const side = Math.tanh(nz / BAND);
  const back = side * band + d.offset;
  const r: Vec = [
    ring * u[0] - back * n[0],
    ring * u[1] - back * n[1],
    ring * u[2] - d.edge - back * n[2],
  ];
  if (!nDot) return { r, u, lean, rDot: null };
  const nzDot = nDot[2];
  const wDot: Vec = [
    nzDot * n[0] + nz * nDot[0],
    nzDot * n[1] + nz * nDot[1],
    nzDot * n[2] + nz * nDot[2],
  ];
  const along = dot(u, wDot);
  const backDot = ((1 - side * side) / BAND) * nzDot * band;
  const rDot: Vec = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    const uDot = (wDot[i] - u[i] * along) / lean;
    rDot[i] = ring * uDot - backDot * n[i] - back * nDot[i];
  }
  return { r, u, lean, rDot };
}

// The centre of mass's height when the coin rests on its rim with axis n.
export function centreHeight(d: Disc, n: Vec) {
  return -contact(d, n).r[2];
}

export type Rates = {
  dq: Quat;
  dw: Vec;
  v: Vec;
  // The normal force as a fraction of the coin's weight; below zero it would leave the table.
  normal: number;
};

export function rates(d: Disc, drag: Drag, s: Motion): Rates {
  const { across, axial } = inertia(d);
  const m = d.mass;
  const ma2 = m * d.radius * d.radius;
  const w = s.w;
  const n = axisOf(s.q);
  const nDot = cross(w, n);
  const { r, lean, rDot } = contact(d, n, nDot);
  const rd = rDot as Vec;

  // I·ω in the table's frame.
  const wn = dot(w, n);
  const Iw: Vec = [
    across * w[0] + (axial - across) * wn * n[0],
    across * w[1] + (axial - across) * wn * n[1],
    across * w[2] + (axial - across) * wn * n[2],
  ];

  // Resistance: rolling acts on the horizontal part of the spin and pivoting on the vertical
  // part. The air film under a coin that's nearly flat resists both, rolling because the air
  // has to be squeezed out ahead of the low edge and turning because it has to be sheared, and
  // more so the thinner the gap; a coin standing up has no film under it.
  const film = drag.air * (1 / Math.max(lean, 0.004) - 1);
  const torque: Vec = [
    -ma2 * (drag.roll + film) * w[0],
    -ma2 * (drag.roll + film) * w[1],
    -ma2 * (drag.pivot + film * SHEAR) * w[2],
  ];

  const rxrdw = cross(r, cross(rd, w));
  const rxz = cross(r, [0, 0, 1]);
  const gyro = cross(w, Iw);
  const rhs: Vec = [
    m * rxrdw[0] + m * G * rxz[0] - gyro[0] + torque[0],
    m * rxrdw[1] + m * G * rxz[1] - gyro[1] + torque[1],
    m * rxrdw[2] + m * G * rxz[2] - gyro[2] + torque[2],
  ];

  // A = I + m(|r|² − r rᵀ), symmetric.
  const rr = dot(r, r);
  const a = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      a[i][j] =
        (i === j ? across + m * rr : 0) +
        (axial - across) * n[i] * n[j] -
        m * r[i] * r[j];
    }
  }
  const dw = solve(a, rhs);

  const v = cross(r, w);
  // The contact force from the centre's acceleration, for the normal part only.
  const acc = cross(rd, w);
  const rxa = cross(r, dw);
  const normal = (acc[2] + rxa[2]) / G + 1;

  // q̇ = ½ (0, ω) q
  const [qw, qx, qy, qz] = s.q;
  const dq: Quat = [
    0.5 * (-w[0] * qx - w[1] * qy - w[2] * qz),
    0.5 * (w[0] * qw + w[1] * qz - w[2] * qy),
    0.5 * (w[1] * qw + w[2] * qx - w[0] * qz),
    0.5 * (w[2] * qw + w[0] * qy - w[1] * qx),
  ];
  return { dq, dw, v, normal };
}

function solve(a: number[][], b: Vec): Vec {
  const [[a00, a01, a02], [a10, a11, a12], [a20, a21, a22]] = a;
  const c00 = a11 * a22 - a12 * a21;
  const c01 = a12 * a20 - a10 * a22;
  const c02 = a10 * a21 - a11 * a20;
  const det = a00 * c00 + a01 * c01 + a02 * c02;
  const inv = 1 / det;
  return [
    (b[0] * c00 +
      b[1] * (a02 * a21 - a01 * a22) +
      b[2] * (a01 * a12 - a02 * a11)) *
      inv,
    (b[0] * c01 +
      b[1] * (a00 * a22 - a02 * a20) +
      b[2] * (a02 * a10 - a00 * a12)) *
      inv,
    (b[0] * c02 +
      b[1] * (a01 * a20 - a00 * a21) +
      b[2] * (a00 * a11 - a01 * a10)) *
      inv,
  ];
}

const add = (s: Motion, k: Rates, h: number): Motion => ({
  q: [
    s.q[0] + k.dq[0] * h,
    s.q[1] + k.dq[1] * h,
    s.q[2] + k.dq[2] * h,
    s.q[3] + k.dq[3] * h,
  ],
  w: [s.w[0] + k.dw[0] * h, s.w[1] + k.dw[1] * h, s.w[2] + k.dw[2] * h],
  x: s.x + k.v[0] * h,
  y: s.y + k.v[1] * h,
});

// One fourth-order Runge–Kutta step.
export function step(d: Disc, drag: Drag, s: Motion, h: number) {
  const k1 = rates(d, drag, s);
  const k2 = rates(d, drag, add(s, k1, h / 2));
  const k3 = rates(d, drag, add(s, k2, h / 2));
  const k4 = rates(d, drag, add(s, k3, h));
  const mix = (f: (k: Rates) => number) =>
    (f(k1) + 2 * f(k2) + 2 * f(k3) + f(k4)) / 6;
  const next: Motion = {
    q: normalise([
      s.q[0] + h * mix((k) => k.dq[0]),
      s.q[1] + h * mix((k) => k.dq[1]),
      s.q[2] + h * mix((k) => k.dq[2]),
      s.q[3] + h * mix((k) => k.dq[3]),
    ]),
    w: [
      s.w[0] + h * mix((k) => k.dw[0]),
      s.w[1] + h * mix((k) => k.dw[1]),
      s.w[2] + h * mix((k) => k.dw[2]),
    ],
    x: s.x + h * mix((k) => k.v[0]),
    y: s.y + h * mix((k) => k.v[1]),
  };
  return { next, normal: k1.normal };
}

// How the coin is lying: its lean from flat (radians), how fast the point it stands on runs
// round (rad/s, signed), and how fast the coin itself turns about the vertical.
export function measure(d: Disc, s: Motion) {
  const n = axisOf(s.q);
  const nDot = cross(s.w, n);
  const h = Math.hypot(n[0], n[1]);
  const lean = Math.acos(Math.min(1, Math.abs(n[2])));
  const wobble = h > 1e-9 ? (n[0] * nDot[1] - n[1] * nDot[0]) / (h * h) : 0;
  const { r } = contact(d, n);
  return { lean, wobble, turn: s.w[2], n, height: -r[2] };
}

// Kinetic plus potential energy, for checking the model holds together.
export function energy(d: Disc, s: Motion) {
  const { across, axial } = inertia(d);
  const n = axisOf(s.q);
  const { r } = contact(d, n);
  const v = cross(r, s.w);
  const wn = dot(s.w, n);
  const rot =
    0.5 * (across * dot(s.w, s.w) + (axial - across) * wn * wn) +
    0.5 * d.mass * dot(v, v);
  return rot + d.mass * G * -r[2];
}

// The point on the table the coin stands on, in table coordinates.
export function contactPoint(d: Disc, s: Motion): Vec {
  const n = axisOf(s.q);
  const { r } = contact(d, n);
  return [s.x + r[0], s.y + r[1], 0];
}
