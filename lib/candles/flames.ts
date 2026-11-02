// Candle flames, each modelled as an oscillator. A small flame is steady: knocked, it bobs a
// few times and settles. A bigger one, like the merged flame of three candles tied together,
// can't settle: hot gas rising round it rolls up into a ring that squeezes the flame's waist
// until the tip pinches off and floats away, and the flame shrinks and grows again, about ten
// times a second. Both are the same equation, a Stuart–Landau oscillator: below the threshold
// any wobble dies away, above it the wobble grows to a fixed size and keeps going.
//
// Flames feel each other through the air they pull in, which takes time to cross from one to
// the next. So each oscillator is pulled towards where its neighbour was a moment ago, by an
// amount that fades with distance, after a delay that grows with it. That delay is what makes
// candle flames behave as they do in experiments (Manoj, Pawar and Sujith, 2018): close
// together the pull is near enough immediate and they pulse together; a little further, it
// arrives a quarter of a beat late and the two cancel out until both flames burn still; further
// again it arrives half a beat late and they take turns; far apart they each keep their own time.
//
// Air moving past a flame bends it over, and too fast blows it off its wick: it lifts first,
// thins and turns blue at the base, then goes out. A wick just blown out stays hot for a few
// seconds, glowing and smoking, and the smoke rising from it is wax vapour that will still burn.

import { CUP_BUNDLE, CUP_SINGLE, type HolderSpec } from "./arrangements";

export const CANDLE_R = 0.62;
export const CANDLE_TOP = 15;
export const CUP_H = 1.4;
export const WICK_LEN = 0.85;
// The flame's base sits a little below the wick's tip, where its blue cup wraps round it.
export const FLAME_FOOT = 0.3;
// The three candles of a bundle stand touching, round its middle.
const BUNDLE_SPREAD = 0.74;

type Kind = {
  // Height and half-width of the flame, in centimetres.
  h: number;
  r: number;
  // Its own flicker rate, in hertz: bigger flames are slower.
  hz: number;
  // Above zero it flickers by itself; below, it settles.
  rho: number;
  // Air speed, in metres a second, that blows it off its wick.
  blow: number;
  // How brightly it lights the room.
  light: number;
};

// By how many wicks are alight in the holder.
const KINDS: Kind[] = [
  { h: 0, r: 0, hz: 0, rho: -1, blow: 0, light: 0 },
  { h: 3.3, r: 0.55, hz: 12.6, rho: -1, blow: 1.6, light: 1 },
  { h: 4.6, r: 0.82, hz: 11.4, rho: -0.12, blow: 2.1, light: 1.8 },
  { h: 5.8, r: 1.3, hz: 10.4, rho: 1, blow: 2.7, light: 2.6 },
];

// How fast a wobble grows or dies (per second), and the oscillators' time step.
const LAMBDA = 6.5;
export const SUB = 1 / 1200;
// Coupling: full strength (per second) up to D_NEAR centimetres apart, fading over D_FADE.
const K0 = 30;
const D_NEAR = 3.2;
const D_FADE = 3.8;
// The delay: a few milliseconds, plus the time the pull takes to cross the extra distance.
const DELAY0 = 0.004;
const CROSSING = 120;
const HISTORY = 256;
// How long a wick stays hot after going out, in seconds.
const COOLING = 2;

export type Wick = {
  // Offset from the holder's middle, in cm.
  dx: number;
  dz: number;
  lit: boolean;
  // How hot it still is after going out, 1 to 0.
  heat: number;
  // Seconds the match has been held to it.
  kindling: number;
  // Seconds until the flame beside it in a bundle catches it, once it's begun to.
  catching: number;
  // Which way its tip curls over, and how far (cm).
  curl: number;
};

export type Flame = {
  re: number;
  im: number;
  history: Float32Array;
  head: number;
  detune: number;
  // Smoothed size of the flicker and its measured rate.
  amp: number;
  hz: number;
  phase: number;
  // Air past the flame, in metres a second: what it's leaning in now, and what's arriving.
  wind: [number, number, number];
  target: [number, number, number];
  // Seconds spent in air fast enough to blow it out, and how far it has lifted (cm).
  strain: number;
  lift: number;
  // Grows from small to full size in the second after it's lit.
  grow: number;
  seed: number;
  outAt: number;
};

export type Holder = {
  id: number;
  x: number;
  z: number;
  // Velocity while being dragged, in cm a second.
  vx: number;
  vz: number;
  cup: number;
  bundle: boolean;
  wicks: Wick[];
  flame: Flame;
};

export const createHolder = (spec: HolderSpec, id: number): Holder => {
  const offsets: [number, number][] = spec.bundle
    ? [
        [0, BUNDLE_SPREAD],
        [-BUNDLE_SPREAD * 0.866, -BUNDLE_SPREAD * 0.5],
        [BUNDLE_SPREAD * 0.866, -BUNDLE_SPREAD * 0.5],
      ]
    : [[0, 0]];
  return {
    id,
    x: spec.x,
    z: spec.z,
    vx: 0,
    vz: 0,
    cup: spec.bundle ? CUP_BUNDLE : CUP_SINGLE,
    bundle: spec.bundle,
    wicks: offsets.map(([dx, dz]) => ({
      dx,
      dz,
      lit: true,
      heat: 0,
      kindling: 0,
      catching: -1,
      curl: (Math.random() < 0.5 ? -1 : 1) * (0.18 + Math.random() * 0.14),
    })),
    flame: {
      re: (Math.random() - 0.5) * 0.4,
      im: (Math.random() - 0.5) * 0.4,
      history: new Float32Array(HISTORY * 2),
      head: 0,
      // Real flames differ by a few per cent.
      detune: (Math.random() - 0.5) * 0.06,
      amp: 0,
      hz: 0,
      phase: 0,
      wind: [0, 0, 0],
      target: [0, 0, 0],
      strain: 0,
      lift: 0,
      grow: 1,
      seed: Math.random(),
      outAt: -1e9,
    },
  };
};

export const litCount = (h: Holder) => h.wicks.filter((w) => w.lit).length;

export const kindOf = (h: Holder) => KINDS[litCount(h)];

// The flame sits over whichever wicks are alight.
export const flameBase = (h: Holder): [number, number, number] => {
  let x = 0;
  let z = 0;
  let n = 0;
  for (const w of h.wicks) {
    if (!w.lit) continue;
    x += w.dx;
    z += w.dz;
    n++;
  }
  if (n === 0) return [h.x, CANDLE_TOP + FLAME_FOOT, h.z];
  return [h.x + x / n, CANDLE_TOP + FLAME_FOOT, h.z + z / n];
};

// Height and half-width of the flame now, before any flicker.
export const flameSize = (h: Holder) => {
  const kind = kindOf(h);
  const g = h.flame.grow;
  return { h: kind.h * (0.4 + 0.6 * g), r: kind.r * (0.6 + 0.4 * g) };
};

export const flameLight = (h: Holder) => kindOf(h).light * h.flame.grow;

// The shape of one flicker: the flame stretches over most of the beat, then its tip pinches
// off and it drops back short. g runs 0 to 1 through the beat. Shared with the shader.
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
export const stretch = (g: number) => 0.62 + 0.83 * smooth(0, 0.85, g);

// Height now as a fraction of the flame's steady height.
export const heightNow = (f: Flame) => {
  const a = Math.min(f.amp, 1);
  const g = (((f.phase / (Math.PI * 2)) % 1) + 1) % 1;
  return 1 + (stretch(g) - 1) * a;
};

const distance = (a: Holder, b: Holder) => {
  const pa = flameBase(a);
  const pb = flameBase(b);
  return Math.hypot(pa[0] - pb[0], pa[2] - pb[2]);
};

// How strongly flame b pulls on flame a, per second.
export const pullOn = (a: Holder, b: Holder) =>
  coupling(distance(a, b)) * (kindOf(b).h / KINDS[3].h) ** 2;

const coupling = (d: number) =>
  K0 * Math.exp(-((Math.max(0, d - D_NEAR) / D_FADE) ** 2));
const delay = (d: number) => DELAY0 + Math.max(0, d - D_NEAR) / CROSSING;

const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) * 2;

// Advances every flame's oscillator through dt seconds in small fixed steps. onStep is told
// each step's height of each holder's flame, for the trace.
export function stepOscillators(
  holders: Holder[],
  dt: number,
  carry: { t: number },
  onStep?: () => void,
) {
  const lit = holders.filter((h) => litCount(h) > 0);
  const pairs: { a: Holder; b: Holder; k: number; lag: number }[] = [];
  for (const a of lit) {
    for (const b of lit) {
      if (a === b) continue;
      // A bigger flame stirs more air: a single candle feels a bundle much more than the
      // bundle feels it.
      const d = distance(a, b);
      const k = coupling(d) * (kindOf(b).h / KINDS[3].h) ** 2;
      if (k < 0.05) continue;
      const lag = Math.min(HISTORY - 1, Math.round(delay(d) / SUB));
      pairs.push({ a, b, k, lag });
    }
  }
  carry.t += dt;
  const turned = holders.map(() => 0);
  while (carry.t >= SUB) {
    carry.t -= SUB;
    const next = lit.map((h) => {
      const f = h.flame;
      const kind = kindOf(h);
      const w = Math.PI * 2 * kind.hz * (1 + f.detune);
      const r2 = f.re * f.re + f.im * f.im;
      // Moving air buffets a flame, small or large.
      const speed = Math.hypot(...f.wind);
      const noise = (0.25 + 5 * speed) * Math.sqrt(SUB);
      let fx = LAMBDA * (kind.rho - r2) * f.re - w * f.im;
      let fy = LAMBDA * (kind.rho - r2) * f.im + w * f.re;
      for (const p of pairs) {
        if (p.a !== h) continue;
        const other = p.b.flame;
        const at = ((other.head - p.lag + HISTORY) % HISTORY) * 2;
        fx += p.k * (other.history[at] - f.re);
        fy += p.k * (other.history[at + 1] - f.im);
      }
      return [
        f.re + fx * SUB + noise * gauss(),
        f.im + fy * SUB + noise * gauss(),
      ];
    });
    lit.forEach((h, i) => {
      const f = h.flame;
      const p0 = Math.atan2(f.im, f.re);
      f.re = next[i][0];
      f.im = next[i][1];
      let dp = Math.atan2(f.im, f.re) - p0;
      if (dp > Math.PI) dp -= Math.PI * 2;
      if (dp < -Math.PI) dp += Math.PI * 2;
      turned[holders.indexOf(h)] += dp;
      f.head = (f.head + 1) % HISTORY;
      f.history[f.head * 2] = f.re;
      f.history[f.head * 2 + 1] = f.im;
    });
    onStep?.();
  }
  holders.forEach((h, i) => {
    const f = h.flame;
    if (litCount(h) === 0) {
      f.re = 0;
      f.im = 0;
      f.amp = 0;
      f.hz = 0;
      f.history.fill(0);
      return;
    }
    f.phase = Math.atan2(f.im, f.re);
    const a = Math.hypot(f.re, f.im);
    const k = 1 - Math.exp(-dt / 0.05);
    f.amp += (a - f.amp) * k;
    if (dt > 0) {
      const hz = turned[i] / (Math.PI * 2 * dt);
      f.hz += (hz - f.hz) * (1 - Math.exp(-dt / 0.3));
    }
  });
}

export type FlameEvent =
  | { type: "out"; holder: Holder; wind: [number, number, number] }
  | { type: "lit"; holder: Holder };

// Everything slower than the flicker: the flame leaning into the air, lifting and blowing out,
// growing after it's lit, a bundle's flame catching its other wicks, and hot wicks cooling.
export function stepFlames(holders: Holder[], dt: number, now: number) {
  const events: FlameEvent[] = [];
  for (const h of holders) {
    const f = h.flame;
    const lit = litCount(h);
    // Flames answer the air in a few hundredths of a second.
    const k = 1 - Math.exp(-dt / 0.035);
    for (let i = 0; i < 3; i++) f.wind[i] += (f.target[i] - f.wind[i]) * k;
    for (const w of h.wicks) {
      if (!w.lit) w.heat *= Math.exp(-dt / COOLING);
    }
    if (lit === 0) {
      f.strain = 0;
      f.lift = 0;
      continue;
    }
    const kind = KINDS[lit];
    const speed = Math.hypot(...f.wind);
    const over = speed / kind.blow;
    f.lift += (Math.max(0, over - 0.55) * 0.9 - f.lift) * k;
    f.strain = over > 1 ? f.strain + dt : Math.max(0, f.strain - dt * 2);
    if (f.strain > (h.bundle ? 0.11 : 0.07)) {
      for (const w of h.wicks) {
        if (!w.lit) continue;
        w.lit = false;
        w.heat = 1;
        w.catching = -1;
      }
      f.outAt = now;
      f.strain = 0;
      f.lift = 0;
      events.push({ type: "out", holder: h, wind: [...f.wind] });
      continue;
    }
    f.grow = Math.min(1, f.grow + dt / 0.8);
    // In a bundle, a lit wick's flame spreads to the wicks beside it once it's grown.
    if (h.bundle && f.grow > 0.5) {
      for (const w of h.wicks) {
        if (w.lit) continue;
        if (w.catching < 0) w.catching = 0.35 + Math.random() * 0.4;
        w.catching -= dt;
        if (w.catching <= 0) {
          w.lit = true;
          w.catching = -1;
          f.grow = Math.max(0.55, f.grow * 0.8);
        }
      }
    }
  }
  return events;
}

export function ignite(h: Holder, wick: Wick) {
  const wasLit = litCount(h) > 0;
  wick.lit = true;
  wick.kindling = 0;
  wick.catching = -1;
  if (!wasLit) {
    h.flame.grow = 0.2;
    h.flame.re = (Math.random() - 0.5) * 0.2;
    h.flame.im = (Math.random() - 0.5) * 0.2;
  }
}

export function lightAll(holders: Holder[]) {
  for (const h of holders) {
    for (const w of h.wicks) {
      if (!w.lit) ignite(h, w);
    }
  }
}
