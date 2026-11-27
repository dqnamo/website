// The particles, and the trails of ions they leave. Each kind is stepped through the air the way
// it really goes, and drops ions in proportion to the energy it loses there:
//
// Alpha particles are helium nuclei, heavy and doubly charged. They plough straight through,
// losing energy so fast that a 5 MeV alpha stops in under 4 cm of air (Geiger's rule: range
// ∝ E^1.5), so every alpha from one isotope has the same length. They ionise more the slower
// they go, so a track thickens towards its end (the Bragg peak) and wavers in its last few
// millimetres. Very rarely one passes close enough to a nucleus to bounce off it: a sharp kink,
// with a stub where the nucleus recoiled.
//
// Electrons (beta particles) weigh 7,000 times less. They ionise little, so their tracks are
// thin and faint, and they're knocked about by every atom they pass (multiple scattering, by
// the Highland formula), so slow ones wander and curl. They ionise more as they slow, so a track
// gets denser as it twists to a stop.
//
// Muons come from cosmic rays hitting the top of the atmosphere, a few a second through the
// chamber's floor. At several GeV they go straight through everything, ionising like the
// fastest electrons, and now and then knock an electron free that curls off on its own (a delta
// ray).
//
// In a magnetic field, a charge going sideways to it is turned in a circle of radius
// r = p/(qB): a 100 keV electron in 0.3 T circles in under 4 mm, an alpha's circle is a metre
// across, a muon's tens of metres. Electrons and positrons turn opposite ways.
//
// Each track only shows where it passes through the sensitive layer, so one that climbs out
// of it stops short, and one that dips in and out leaves dashes.

import {
  clamp,
  gaussian,
  HALF,
  LAYER_TOP,
  sensitivity,
  smoothstep,
  spread,
} from "./chamber";

export type Kind = "alpha" | "electron" | "positron" | "muon";

export type Track = {
  id: number;
  kind: Kind;
  // A short tag for the label on the stage, and a fuller name and account for hovering.
  tag: string;
  name: string;
  detail: string;
  born: number;
  drops: number;
  // Where its last droplet condensed, carried along with the air afterwards, for its label.
  ax: number;
  ay: number;
  az: number;
  // Tracks with one cause share a group: a thoron V, a shower, a pair, a muon and its decay.
  group: number;
  // An alpha that bounced off a nucleus.
  kinked: boolean;
};

export type ParticleOptions = {
  // A droplet seed: position, when it starts to grow, how much light it scatters, and its track.
  emit: (
    x: number,
    y: number,
    z: number,
    start: number,
    weight: number,
    id: number,
  ) => void;
  // The vertical magnetic field at (x, y), in tesla, positive pointing up.
  field: (x: number, y: number) => number;
  // How ready the layer is, 0 to 1: it falls to nothing when the lid comes off.
  readiness: () => number;
};

// Droplets per centimetre at the layer's most sensitive height. The real numbers are thousands
// for an alpha and tens for a muon; these keep the same proportions, roughly.
const ALPHA_PER_CM = 115;
const MIP_PER_CM = 17;
const ELECTRON_MAX_PER_CM = 150;

// Radiation length of air, in cm, and the electron's rest mass, in MeV.
const X0 = 30390;
const ME = 0.511;
const MALPHA = 3727.4;

// Geiger's rule for an alpha's range in air, in cm, from its energy in MeV.
export function alphaRange(energy: number) {
  return 0.318 * energy ** 1.5;
}

export function createParticles({ emit, field, readiness }: ParticleOptions) {
  const tracks: Track[] = [];
  let nextId = 1;
  let nextGroup = 1;
  let clock = 0;

  // The track being laid down, and the droplets it owes.
  let current: Track | null = null;
  let owed = 0;
  let gain = 1;
  let start = 0;

  // Direction of travel, kept unit length.
  let dx = 0;
  let dy = 0;
  let dz = 0;

  const begin = (
    kind: Kind,
    tag: string,
    name: string,
    detail: string,
    delay: number,
    group: number,
  ) => {
    const track: Track = {
      id: nextId++,
      kind,
      tag,
      name,
      detail,
      born: clock + delay,
      drops: 0,
      ax: 0,
      ay: 0,
      az: 0,
      group,
      kinked: false,
    };
    tracks.push(track);
    current = track;
    owed = Math.random();
    gain = readiness();
    start = clock + delay;
    return track;
  };

  // Seeds droplets along a step from a to b, as many as the ionisation and the layer allow.
  const deposit = (
    ax: number,
    ay: number,
    az: number,
    bx: number,
    by: number,
    bz: number,
    perCm: number,
    width: number,
    weight: number,
  ) => {
    const track = current;
    if (!track || gain <= 0) return;
    const sx = bx - ax;
    const sy = by - ay;
    const sz = bz - az;
    const length = Math.sqrt(sx * sx + sy * sy + sz * sz);
    const s = sensitivity((az + bz) * 0.5);
    if (s <= 0) return;
    owed += perCm * length * s * gain;
    while (owed >= 1) {
      owed -= 1;
      const f = Math.random();
      const px = ax + sx * f + spread() * width;
      const py = ay + sy * f + spread() * width;
      const pz = az + sz * f + spread() * width;
      if (Math.abs(px) >= HALF || Math.abs(py) >= HALF || pz <= 0.02) continue;
      // Droplets grow a little after the particle has gone, the ions spreading meanwhile.
      emit(
        px,
        py,
        pz,
        start + 0.015 + Math.random() * 0.07,
        weight * (0.5 + 0.5 * sensitivity(pz)),
        track.id,
      );
      // The label goes where it ends: the tip of an alpha, away from its source.
      track.ax = px;
      track.ay = py;
      track.az = pz;
      track.drops++;
    }
  };

  // Turns the direction of travel by a small random angle with spread theta in each of two
  // directions across it.
  const scatter = (theta: number) => {
    // Any vector not along d, crossed with d, gives one direction across it; d × that, the other.
    const ux = Math.abs(dx) < 0.9 ? 1 : 0;
    const uy = ux ? 0 : 1;
    let e1x = dy * 0 - dz * uy;
    let e1y = dz * ux - dx * 0;
    let e1z = dx * uy - dy * ux;
    const l1 = Math.hypot(e1x, e1y, e1z) || 1;
    e1x /= l1;
    e1y /= l1;
    e1z /= l1;
    const e2x = dy * e1z - dz * e1y;
    const e2y = dz * e1x - dx * e1z;
    const e2z = dx * e1y - dy * e1x;
    const a = gaussian() * theta;
    const b = gaussian() * theta;
    // Exact rotation by the combined angle, so even a wide scatter keeps d unit length.
    const angle = Math.hypot(a, b);
    if (angle < 1e-6) return;
    const ca = Math.cos(angle);
    const sa = Math.sin(angle) / angle;
    dx = dx * ca + (e1x * a + e2x * b) * sa;
    dy = dy * ca + (e1y * a + e2y * b) * sa;
    dz = dz * ca + (e1z * a + e2z * b) * sa;
    const l = Math.hypot(dx, dy, dz) || 1;
    dx /= l;
    dy /= l;
    dz /= l;
  };

  // Turns the part of the motion across the (vertical) field: by `angle` anticlockwise as seen
  // from above. y points down the screen, so anticlockwise there is this way round.
  const turn = (angle: number) => {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const nx = dx * c + dy * s;
    const ny = -dx * s + dy * c;
    dx = nx;
    dy = ny;
  };

  const outside = (x: number, y: number) =>
    x <= -HALF || x >= HALF || y <= -HALF || y >= HALF;

  const setDirection = (x: number, y: number, z: number) => {
    const l = Math.hypot(x, y, z) || 1;
    dx = x / l;
    dy = y / l;
    dz = z / l;
  };

  function alpha(
    x0: number,
    y0: number,
    z0: number,
    direction: [number, number, number],
    energy: number,
    tag: string,
    detail: string,
    { delay = 0, group = 0 } = {},
  ) {
    const track = begin("alpha", tag, "Alpha particle", detail, delay, group);
    setDirection(...direction);
    const range = alphaRange(energy);
    const momentum = Math.sqrt(2 * MALPHA * energy) / 1000;
    // About one in a hundred visibly bounces off a nucleus somewhere along its way.
    let kink =
      Math.random() < 0.012 ? range * (0.35 + 0.5 * Math.random()) : -1;
    let x = x0;
    let y = y0;
    let z = z0;
    let s = 0;
    while (s < range) {
      const step = Math.min(0.04, range - s);
      const left = range - s;
      // dE/dx grows as (range left)^(−1/3) under Geiger's rule, falling away in the last 0.5 mm.
      const bragg =
        Math.min(3, ((left + 0.03) / range) ** (-1 / 3)) *
        smoothstep(0, 0.06, left);
      const nx = x + dx * step;
      const ny = y + dy * step;
      const nz = z + dz * step;
      deposit(x, y, z, nx, ny, nz, ALPHA_PER_CM * bragg, 0.028, 1.15);
      x = nx;
      y = ny;
      z = nz;
      s += step;
      if (z <= 0 || outside(x, y) || (z > LAYER_TOP && dz > 0)) break;
      const b = field(x, y);
      if (b) turn(-2 * 0.003 * (b / momentum) * step);
      if (left < 0.7) scatter(0.03);
      if (kink > 0 && s >= kink) {
        kink = -1;
        // The recoiling nucleus: a short, very dense stub off the other way.
        const keep: [number, number, number] = [dx, dy, dz];
        scatter(0.9);
        const recoil = [keep[0] - dx * 0.6, keep[1] - dy * 0.6, keep[2] * 0.2];
        const rl = Math.hypot(recoil[0], recoil[1], recoil[2]) || 1;
        const length = 0.12 + Math.random() * 0.2;
        deposit(
          x,
          y,
          z,
          x + (recoil[0] / rl) * length,
          y + (recoil[1] / rl) * length,
          z + (recoil[2] / rl) * length,
          ALPHA_PER_CM * 2.6,
          0.03,
          1.15,
        );
        track.detail +=
          ". It bounced off a nucleus: that's the kink, and the stub is the nucleus recoiling";
        track.kinked = true;
      }
    }
    return track;
  }

  function electron(
    x0: number,
    y0: number,
    z0: number,
    direction: [number, number, number],
    energy: number,
    charge: -1 | 1,
    tag: string,
    detail: string,
    { delay = 0, group = 0, name = charge < 0 ? "Electron" : "Positron" } = {},
  ) {
    const track = begin(
      charge < 0 ? "electron" : "positron",
      tag,
      name,
      detail,
      delay,
      group,
    );
    setDirection(...direction);
    let x = x0;
    let y = y0;
    let z = z0;
    let e = energy;
    let path = 0;
    while (e > 0.0012 && path < 45) {
      const gamma = 1 + e / ME;
      const beta2 = 1 - 1 / (gamma * gamma);
      const p = Math.sqrt(e * e + 2 * e * ME);
      const bcp = Math.sqrt(beta2) * p;
      // Steps short enough that each scatters by about 0.12 rad.
      const loss = 0.0026 / beta2;
      let step = clamp(X0 * ((0.12 * bcp) / 13.6) ** 2, 0.005, 0.15);
      step = Math.min(step, e / loss + 0.002);
      const nx = x + dx * step;
      const ny = y + dy * step;
      const nz = z + dz * step;
      deposit(
        x,
        y,
        z,
        nx,
        ny,
        nz,
        Math.min(ELECTRON_MAX_PER_CM, MIP_PER_CM / beta2),
        0.01,
        1,
      );
      x = nx;
      y = ny;
      z = nz;
      path += step;
      e -= loss * step;
      if (z <= 0 || z > 6 || outside(x, y)) break;
      scatter((13.6 / bcp) * Math.sqrt(step / X0));
      const b = field(x, y);
      if (b) turn(-charge * 0.003 * (b / (p / 1000)) * step);
    }
    return track;
  }

  // The energy of a delta ray: knock-on electrons follow 1/E², so most are slow.
  const deltaEnergy = () => {
    const lo = 0.004;
    const hi = 0.07;
    return lo / (1 - Math.random() * (1 - lo / hi));
  };

  // A straight track through (x0, y0, z0), drawn across the whole layer.
  function muon(
    x0: number,
    y0: number,
    z0: number,
    direction: [number, number, number],
    tag: string,
    detail: string,
    { delay = 0, group = 0, name = "Muon" } = {},
  ) {
    const track = begin("muon", tag, name, detail, delay, group);
    setDirection(...direction);
    const ux = dx;
    const uy = dy;
    const uz = dz;
    let s0 = -1e9;
    let s1 = 1e9;
    const clip = (p: number, d: number, lo: number, hi: number) => {
      if (Math.abs(d) < 1e-9) {
        if (p < lo || p > hi) s1 = -1e9;
        return;
      }
      const a = (lo - p) / d;
      const b = (hi - p) / d;
      s0 = Math.max(s0, Math.min(a, b));
      s1 = Math.min(s1, Math.max(a, b));
    };
    clip(z0, uz, 0, LAYER_TOP);
    clip(x0, ux, -HALF, HALF);
    clip(y0, uy, -HALF, HALF);
    if (s1 <= s0) return track;
    const step = 0.05;
    for (let s = s0; s < s1; s += step) {
      const t = Math.min(s + step, s1);
      const ax = x0 + ux * s;
      const ay = y0 + uy * s;
      const az = z0 + uz * s;
      const bx = x0 + ux * t;
      const by = y0 + uy * t;
      const bz = z0 + uz * t;
      current = track;
      deposit(ax, ay, az, bx, by, bz, MIP_PER_CM, 0.006, 1);
      // A knock-on electron now and then, about one every 8 cm.
      if (Math.random() < 0.12 * (t - s) && sensitivity(az) > 0.3) {
        const e = deltaEnergy();
        // Slow ones leave nearly square to the track, fast ones further forwards.
        const forward = Math.sqrt(e / 0.08);
        const side = isotropic();
        const sx = side[0] - ux * (side[0] * ux + side[1] * uy + side[2] * uz);
        const sy = side[1] - uy * (side[0] * ux + side[1] * uy + side[2] * uz);
        const sz = side[2] - uz * (side[0] * ux + side[1] * uy + side[2] * uz);
        const keep = { owed, gain, start };
        electron(
          ax,
          ay,
          az,
          [ux * forward + sx, uy * forward + sy, uz * forward + sz],
          e,
          -1,
          "δ",
          `A delta ray: an electron the muon knocked out of an atom, ${Math.round(e * 1000)} keV`,
          { delay: track.born - clock, group: track.group, name: "Delta ray" },
        );
        owed = keep.owed;
        gain = keep.gain;
        start = keep.start;
      }
    }
    current = track;
    return track;
  }

  // A muon that runs out of energy in the layer: it ionises more and more as it slows, stops,
  // and 2.2 µs later (on average) decays to an electron of up to 53 MeV that shoots off.
  function stoppingMuon(x: number, y: number, z: number) {
    const group = nextGroup++;
    const track = begin(
      "muon",
      "μ stop",
      "Muon, stopping",
      "A slow muon running out of energy: it ionises more as it slows, so the track thickens to its end",
      0,
      group,
    );
    // It comes in steeply from above and stops at (x, y, z).
    const [ix, iy, iz] = isotropic();
    const dir: [number, number, number] = [
      ix * 0.8,
      iy * 0.8,
      -Math.abs(iz) - 0.35,
    ];
    const l = Math.hypot(...dir);
    const length = 3.2;
    const sx = x - (dir[0] / l) * length;
    const sy = y - (dir[1] / l) * length;
    const sz = z - (dir[2] / l) * length;
    const steps = 64;
    for (let i = 0; i < steps; i++) {
      const a = i / steps;
      const b = (i + 1) / steps;
      const left = (1 - b) * length;
      const dens = MIP_PER_CM * Math.min(9, ((left + 0.15) / 2.5) ** -0.75);
      deposit(
        sx + (x - sx) * a,
        sy + (y - sy) * a,
        sz + (z - sz) * a,
        sx + (x - sx) * b,
        sy + (y - sy) * b,
        sz + (z - sz) * b,
        dens,
        0.012,
        1,
      );
    }
    const energy = 10 + Math.random() * 42;
    const [ex, ey, ez] = isotropic();
    electron(
      x,
      y,
      z,
      [ex, ey, ez * 0.25],
      energy,
      -1,
      "e⁻ decay",
      `The electron from the muon's decay, ${Math.round(energy)} MeV: fast, so thin and nearly straight`,
      { group },
    );
    return track;
  }

  function isotropic(): [number, number, number] {
    const z = 2 * Math.random() - 1;
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(1 - z * z);
    return [r * Math.cos(a), r * Math.sin(a), z];
  }

  // A cosmic-ray muon's direction: most come from nearly overhead, fewer from low in the sky,
  // so most leave a short dash as they cross the layer and some leave a long line.
  function sky(): [number, number, number] {
    const cosTheta = Math.random() ** (1 / 3);
    const sinTheta = Math.sqrt(1 - cosTheta * cosTheta);
    const a = Math.random() * Math.PI * 2;
    return [sinTheta * Math.cos(a), sinTheta * Math.sin(a), -cosTheta];
  }

  return {
    tracks,
    alpha,
    electron,
    muon,
    stoppingMuon,
    isotropic,
    sky,
    group() {
      return nextGroup++;
    },
    get clock() {
      return clock;
    },
    set clock(t: number) {
      clock = t;
    },
    // Drops tracks whose droplets have all gone.
    prune(age: number) {
      let keep = 0;
      for (const track of tracks) {
        if (clock - track.born < age) tracks[keep++] = track;
      }
      tracks.length = keep;
    },
  };
}

export type Particles = ReturnType<typeof createParticles>;
