// What's in the chamber, and what comes in from outside. Four everyday radioactive things you
// can put on the floor, each with its real decay chain:
//
// A gas-lantern mantle, woven from fabric soaked in thorium nitrate. Thorium-232's chain has six
// alpha emitters at six energies, so the mantle bristles with tracks of six lengths (made a
// little shorter and more varied by the fibres they leave), up to the 8.6 cm of polonium-212.
// One link in the chain is a gas, radon-220 (thoron), which seeps out of the fabric into the
// chamber's air and drifts about for a minute or so before decaying. Its daughter, polonium-216,
// lives only 0.15 s on average, so it decays where the thoron did: two alphas from one point a
// moment apart, a V. Thoron builds up in the chamber over a minute or two, and lingers after the
// mantle is taken out.
//
// The source from an ionisation smoke alarm: a speck of americium-241 under a thin gold foil in a
// steel holder. One isotope, one energy, so its alphas all stop at the same distance, a ring of
// equal spines. Its rim stops the ones that leave too low.
//
// The minute hand of an old watch with radium paint, radium-226 and its daughters mixed into
// zinc sulphide that still glows faintly green, flickering with single flashes where alphas
// hit the crystals (what Crookes's spinthariscope showed).
//
// Low-sodium salt, which is two-thirds potassium chloride. One potassium atom in 8,500 is
// potassium-40, a beta emitter, so it gives off electrons and nothing else: thin, wandering tracks.
//
// From outside: cosmic-ray muons, a few each second, now and then several at once from one air
// shower, or one that stops and decays; electrons knocked loose by gamma rays from the walls and
// the ground; and alphas from radon in the room's own air.

import { EYE, exponential, HALF, LAYER_TOP, poisson, WALL } from "./chamber";
import type { Flow } from "./droplets";
import { alphaRange, type Particles, type Track } from "./particles";

export type SourceId = "mantle" | "americium" | "radium" | "potash";

export type Placed = { id: SourceId; x: number; y: number; angle: number };

export const SOURCES: {
  id: SourceId;
  label: string;
  // What it is, for the panel.
  note: string;
  // Its footprint for picking it up, and the cylinder that shadows the torch.
  radius: number;
  height: number;
  start: { x: number; y: number; angle: number };
}[] = [
  {
    id: "mantle",
    label: "Gas mantle",
    note: "Thorium",
    radius: 1.45,
    height: 1.15,
    start: { x: -3.6, y: 2.4, angle: -0.5 },
  },
  {
    id: "americium",
    label: "Smoke alarm source",
    note: "Americium-241",
    radius: 0.95,
    height: 0.45,
    start: { x: 4.2, y: -3.2, angle: 0 },
  },
  {
    id: "radium",
    label: "Radium watch hand",
    note: "Radium-226",
    radius: 1.5,
    height: 0.12,
    start: { x: 3.4, y: 4.6, angle: -2.6 },
  },
  {
    id: "potash",
    label: "Low-sodium salt",
    note: "Potassium-40",
    radius: 1.9,
    height: 0.7,
    start: { x: -4.4, y: -4.6, angle: 0 },
  },
];

export function source(id: SourceId) {
  const found = SOURCES.find((s) => s.id === id);
  if (!found) throw new Error(`No source ${id}`);
  return found;
}

type Line = { iso: string; energy: number; weight: number };

const pick = (lines: Line[]) => {
  let total = 0;
  for (const line of lines) total += line.weight;
  let r = Math.random() * total;
  for (const line of lines) {
    r -= line.weight;
    if (r <= 0) return line;
  }
  return lines[lines.length - 1];
};

// Thorium-232's chain, in equilibrium in an old mantle. Bismuth-212 splits: a third of the time
// it gives an alpha itself, otherwise a beta to polonium-212, whose alpha is the longest of all.
const THORIUM_ALPHAS: Line[] = [
  { iso: "Th-232", energy: 4.01, weight: 1 },
  { iso: "Th-228", energy: 5.42, weight: 1 },
  { iso: "Ra-224", energy: 5.69, weight: 1 },
  { iso: "Rn-220", energy: 6.29, weight: 1 },
  { iso: "Po-216", energy: 6.78, weight: 1 },
  { iso: "Bi-212", energy: 6.05, weight: 0.36 },
  { iso: "Po-212", energy: 8.78, weight: 0.64 },
];
const THORIUM_BETAS: Line[] = [
  { iso: "Ac-228", energy: 2.08, weight: 1 },
  { iso: "Pb-212", energy: 0.57, weight: 1 },
  { iso: "Bi-212", energy: 2.25, weight: 0.64 },
  { iso: "Tl-208", energy: 1.8, weight: 0.36 },
];
const RADIUM_ALPHAS: Line[] = [
  { iso: "Ra-226", energy: 4.78, weight: 1 },
  { iso: "Rn-222", energy: 5.49, weight: 0.6 },
  { iso: "Po-218", energy: 6.0, weight: 0.8 },
  { iso: "Po-214", energy: 7.69, weight: 0.8 },
];
const RADIUM_BETAS: Line[] = [
  { iso: "Pb-214", energy: 1.02, weight: 1 },
  { iso: "Bi-214", energy: 3.27, weight: 1 },
];
const RADON_ALPHAS: Line[] = [
  { iso: "Rn-222", energy: 5.49, weight: 1 },
  { iso: "Po-218", energy: 6.0, weight: 1 },
  { iso: "Po-214", energy: 7.69, weight: 1 },
];

// Beta energies share the decay energy with an unseen neutrino, so they spread from nothing to
// the endpoint. The allowed shape, p·E·(E₀ − T)², without the nucleus's pull on the electron.
const peaks = new Map<number, number>();
function betaEnergy(endpoint: number) {
  const shape = (t: number) =>
    Math.sqrt(t * t + 1.022 * t) * (t + 0.511) * (endpoint - t) ** 2;
  let peak = peaks.get(endpoint);
  if (peak === undefined) {
    peak = 0;
    for (let i = 1; i < 200; i++)
      peak = Math.max(peak, shape((i / 200) * endpoint));
    peaks.set(endpoint, peak * 1.05);
  }
  for (let tries = 0; tries < 200; tries++) {
    const t = Math.random() * endpoint;
    if (Math.random() * (peak ?? 1) < shape(t)) return t;
  }
  return endpoint / 3;
}

const mev = (e: number) =>
  e >= 1 ? `${e.toFixed(1)} MeV` : `${Math.round(e * 1000)} keV`;

// Particles a second, and the thoron that seeps out of the mantle.
const RATES = {
  mantle: { alpha: 4.5, beta: 3.5, thoron: 3.2, pair: 1 / 22 },
  americium: { alpha: 6 },
  radium: { alpha: 4.5, beta: 2.6 },
  potash: { beta: 7 },
  muon: 7,
  shower: 1 / 40,
  stopping: 1 / 45,
  compton: 1.1,
  radon: 0.16,
  pair: 1 / 200,
};

const THORON_LIFE = 55.6 / Math.LN2;
const PO216_LIFE = 0.145 / Math.LN2;
const MAX_THORON = 500;

export type Note =
  | "thoron"
  | "shower"
  | "pair"
  | "decay"
  | "kink"
  | "americium"
  | "lingering";

export function createSources(
  particles: Particles,
  flow: Flow,
  onNote: (note: Note, text: string) => void,
) {
  // Thoron atoms adrift in the chamber.
  const tx = new Float32Array(MAX_THORON);
  const ty = new Float32Array(MAX_THORON);
  const tz = new Float32Array(MAX_THORON);
  let thoron = 0;
  // Polonium-216 atoms waiting to decay where their thoron did.
  const polonium: {
    at: number;
    x: number;
    y: number;
    z: number;
    group: number;
    first: Track;
  }[] = [];
  // Pairs and V's to look at again once their droplets have formed.
  const watching: { at: number; group: number; note: Note }[] = [];
  const air = new Float32Array(2);

  const upward = (minZ: number): [number, number, number] => {
    for (let i = 0; i < 20; i++) {
      const d = particles.isotropic();
      if (d[2] >= minZ) return d;
    }
    return [1, 0, minZ];
  };

  function fromMantle(p: Placed, dt: number) {
    const rate = RATES.mantle;
    const point = (): [number, number, number] => {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random());
      const lx = Math.cos(a) * r * 1.3;
      const ly = Math.sin(a) * r * 0.9;
      const c = Math.cos(p.angle);
      const s = Math.sin(p.angle);
      return [
        p.x + lx * c - ly * s,
        p.y + lx * s + ly * c,
        0.1 + Math.random() * (1 - r * 0.6),
      ];
    };
    // Mostly outwards: the ones aimed into the mantle stop in it.
    const outwards = (x: number, y: number): [number, number, number] => {
      const d = particles.isotropic();
      if (
        (d[0] * (x - p.x) + d[1] * (y - p.y) < 0 && Math.random() < 0.75) ||
        d[2] < -0.3
      ) {
        d[0] = -d[0];
        d[1] = -d[1];
        d[2] = Math.abs(d[2]) * 0.6;
      }
      return d;
    };
    for (let n = poisson(rate.alpha * dt); n > 0; n--) {
      const line = pick(THORIUM_ALPHAS);
      // The fibres take some of its energy first, by how deep in them it started.
      const energy = Math.max(1.2, line.energy - Math.random() * 1.4);
      const [x, y, z] = point();
      particles.alpha(
        x,
        y,
        z,
        outwards(x, y),
        energy,
        `α ${line.iso}`,
        `From ${line.iso} in the mantle's thorium chain, leaving the fibres at ${mev(energy)}: it stops in ${alphaRange(energy).toFixed(1)} cm of air`,
      );
    }
    for (let n = poisson(rate.beta * dt); n > 0; n--) {
      const line = pick(THORIUM_BETAS);
      const energy = betaEnergy(line.energy);
      const [x, y, z] = point();
      particles.electron(
        x,
        y,
        z,
        outwards(x, y),
        energy,
        -1,
        `β ${line.iso}`,
        `A beta particle from ${line.iso} in the mantle, ${mev(energy)}`,
        { name: "Electron (beta particle)" },
      );
    }
    // Thoron seeps out of the fabric.
    for (let n = poisson(rate.thoron * dt); n > 0 && thoron < MAX_THORON; n--) {
      const [x, y, z] = point();
      tx[thoron] = x;
      ty[thoron] = y;
      tz[thoron] = z;
      thoron++;
    }
    // Thallium-208's 2.6 MeV gamma ray sometimes turns into an electron and a positron in the
    // plate nearby.
    if (Math.random() < rate.pair * dt) {
      const a = Math.random() * Math.PI * 2;
      const r = 1.5 + Math.random() * 5;
      pair(
        p.x + Math.cos(a) * r,
        p.y + Math.sin(a) * r,
        2.614,
        "thallium-208 in the mantle",
      );
    }
  }

  function pair(x: number, y: number, gamma: number, from: string) {
    if (Math.abs(x) > HALF - 0.5 || Math.abs(y) > HALF - 0.5) return;
    const group = particles.group();
    const kinetic = gamma - 1.022;
    const share = 0.2 + Math.random() * 0.6;
    const [ux, uy] = particles.isotropic();
    const base = Math.hypot(ux, uy) || 1;
    const open = 0.2 + Math.random() * 0.25;
    const make = (side: number): [number, number, number] => {
      const a = Math.atan2(uy, ux) + side * open;
      return [
        Math.cos(a) * base,
        Math.sin(a) * base,
        0.12 + Math.random() * 0.1,
      ];
    };
    const z = 0.15 + Math.random() * 0.2;
    particles.electron(
      x,
      y,
      z,
      make(1),
      kinetic * share,
      -1,
      "e⁻ pair",
      `The electron of a pair made by a ${gamma.toFixed(1)} MeV gamma ray from ${from}`,
      { group },
    );
    particles.electron(
      x,
      y,
      z,
      make(-1),
      kinetic * (1 - share),
      1,
      "e⁺ pair",
      `The positron, the electron's antiparticle, from the same ${gamma.toFixed(1)} MeV gamma ray. It turns the other way in a magnetic field`,
      { group },
    );
    watching.push({ at: particles.clock + 0.25, group, note: "pair" });
  }

  function fromAmericium(p: Placed, dt: number) {
    for (let n = poisson(RATES.americium.alpha * dt); n > 0; n--) {
      // 85% at 5.49 MeV and 13% at 5.44, less what the gold foil over it takes.
      const line = Math.random() < 0.86 ? 5.486 : 5.443;
      const energy = line - 0.45 - Math.random() * 0.15;
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * 0.25;
      particles.alpha(
        p.x + Math.cos(a) * r,
        p.y + Math.sin(a) * r,
        0.42,
        // The holder's rim stops any that leave lower than about 6°.
        upward(0.1),
        energy,
        "α Am-241",
        `From americium-241, which gives one energy, so every track is the same length: ${mev(energy)}, ${alphaRange(energy).toFixed(1)} cm`,
      );
    }
  }

  function fromRadium(p: Placed, dt: number) {
    const c = Math.cos(p.angle);
    const s = Math.sin(p.angle);
    const point = (): [number, number, number] => {
      const along = 0.55 + Math.random() * 2.05;
      const across = (Math.random() - 0.5) * 0.18 * (1 - (along - 0.55) / 2.4);
      return [p.x + along * c - across * s, p.y + along * s + across * c, 0.12];
    };
    for (let n = poisson(RATES.radium.alpha * dt); n > 0; n--) {
      const line = pick(RADIUM_ALPHAS);
      const energy = Math.max(1.2, line.energy - Math.random() * 1.6);
      const [x, y, z] = point();
      particles.alpha(
        x,
        y,
        z,
        upward(0.02),
        energy,
        `α ${line.iso}`,
        `From ${line.iso} in the luminous paint, ${mev(energy)} after the paint's binder: ${alphaRange(energy).toFixed(1)} cm`,
      );
    }
    for (let n = poisson(RATES.radium.beta * dt); n > 0; n--) {
      const line = pick(RADIUM_BETAS);
      const energy = betaEnergy(line.energy);
      const [x, y, z] = point();
      particles.electron(
        x,
        y,
        z,
        upward(0.02),
        energy,
        -1,
        `β ${line.iso}`,
        `A beta particle from ${line.iso} in the radium paint, ${mev(energy)}`,
        { name: "Electron (beta particle)" },
      );
    }
  }

  function fromPotash(p: Placed, dt: number) {
    for (let n = poisson(RATES.potash.beta * dt); n > 0; n--) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * 1.3;
      const energy = betaEnergy(1.311);
      particles.electron(
        p.x + Math.cos(a) * r,
        p.y + Math.sin(a) * r,
        0.12 + 0.5 * (1 - (r / 1.3) ** 2),
        upward(-0.15),
        energy,
        -1,
        "β K-40",
        `A beta particle from potassium-40, one atom in 8,500 of the salt's potassium, ${mev(energy)}`,
        { name: "Electron (beta particle)" },
      );
    }
  }

  // Cosmic rays and the background, which never stop.
  function background(dt: number) {
    const anywhere = (): [number, number, number] => [
      (Math.random() * 2 - 1) * (HALF - 0.2),
      (Math.random() * 2 - 1) * (HALF - 0.2),
      0.15 + Math.random() * (LAYER_TOP - 0.4),
    ];
    for (let n = poisson(RATES.muon * dt); n > 0; n--) {
      const d = particles.sky();
      const angle = Math.round((Math.acos(-d[2]) * 180) / Math.PI);
      particles.muon(
        ...anywhere(),
        d,
        "μ",
        `A cosmic-ray muon, made 15 km up when a cosmic ray hit the atmosphere. It came in ${angle}° from straight down, at a few GeV, so it barely notices the air or the field`,
      );
    }
    if (Math.random() < RATES.shower * dt) {
      const group = particles.group();
      const count = 3 + Math.floor(Math.random() * 6);
      const tilt = (0.3 + Math.random() * 0.75) * 1;
      const a = Math.random() * Math.PI * 2;
      for (let i = 0; i < count; i++) {
        const jitter = 0.03;
        const t = tilt + (Math.random() - 0.5) * jitter;
        const b = a + (Math.random() - 0.5) * jitter;
        particles.muon(
          ...anywhere(),
          [Math.sin(t) * Math.cos(b), Math.sin(t) * Math.sin(b), -Math.cos(t)],
          "μ shower",
          `One of ${count} muons that arrived together, all at the same angle: an air shower, the debris of one high-energy cosmic ray`,
          { group, name: "Muon (air shower)" },
        );
      }
      onNote(
        "shower",
        `An air shower: ${count} muons at once, side by side, from a single cosmic ray high above.`,
      );
    }
    if (Math.random() < RATES.stopping * dt) {
      const [x, y] = anywhere();
      particles.stoppingMuon(x * 0.8, y * 0.8, 0.5 + Math.random() * 0.5);
      watching.push({
        at: particles.clock + 0.25,
        group: particles.tracks[particles.tracks.length - 1].group,
        note: "decay",
      });
    }
    for (let n = poisson(RATES.compton * dt); n > 0; n--) {
      const energy = 0.015 + 0.55 * Math.random() ** 2;
      particles.electron(
        ...anywhere(),
        particles.isotropic(),
        energy,
        -1,
        "e⁻",
        `An electron knocked out of an atom by a gamma ray from the walls or the ground (Compton scattering), ${mev(energy)}`,
      );
    }
    for (let n = poisson(RATES.radon * dt); n > 0; n--) {
      const line = pick(RADON_ALPHAS);
      particles.alpha(
        ...anywhere(),
        particles.isotropic(),
        line.energy,
        `α ${line.iso}`,
        `From ${line.iso}: radon seeps out of the ground and the bricks into every room's air`,
      );
    }
    if (Math.random() < RATES.pair * dt) {
      pair(
        (Math.random() * 2 - 1) * (HALF - 2),
        (Math.random() * 2 - 1) * (HALF - 2),
        1.5 + Math.random() * 1.5,
        "the ground",
      );
    }
  }

  // Thoron drifts on the air and spreads up through the chamber; only those that decay in the
  // layer show.
  function stepThoron(dt: number) {
    const reach = Math.sqrt(2 * 0.25 * dt) * 3.46;
    const decay = dt / THORON_LIFE;
    for (let i = thoron - 1; i >= 0; i--) {
      flow.sample(tx[i], ty[i], air);
      const shear = Math.min(1, tz[i] * 1.1);
      tx[i] += air[0] * shear * dt + (Math.random() - 0.5) * reach;
      ty[i] += air[1] * shear * dt + (Math.random() - 0.5) * reach;
      tz[i] += (Math.random() - 0.5) * reach;
      if (Math.abs(tx[i]) > HALF - 0.05)
        tx[i] = Math.sign(tx[i]) * (HALF - 0.05);
      if (Math.abs(ty[i]) > HALF - 0.05)
        ty[i] = Math.sign(ty[i]) * (HALF - 0.05);
      tz[i] = Math.min(WALL - 0.5, Math.abs(tz[i]));
      if (Math.random() < decay) {
        const x = tx[i];
        const y = ty[i];
        const z = tz[i];
        thoron--;
        tx[i] = tx[thoron];
        ty[i] = ty[thoron];
        tz[i] = tz[thoron];
        const group = particles.group();
        const first = particles.alpha(
          x,
          y,
          z,
          particles.isotropic(),
          6.29,
          "α Rn-220",
          "Thoron (radon-220), a gas that seeped out of the mantle and drifted here before decaying: 6.3 MeV, 5.0 cm",
          { group },
        );
        polonium.push({
          at: particles.clock + exponential(PO216_LIFE),
          x,
          y,
          z,
          group,
          first,
        });
      }
    }
    for (let i = polonium.length - 1; i >= 0; i--) {
      const p = polonium[i];
      if (p.at > particles.clock) continue;
      polonium.splice(i, 1);
      const wait = particles.clock - p.first.born;
      particles.alpha(
        p.x,
        p.y,
        p.z,
        particles.isotropic(),
        6.78,
        "α Po-216",
        `Polonium-216, what the thoron became. It lives 0.2 s on average and this one lasted ${wait.toFixed(2)} s, so it decayed where the thoron did: 6.8 MeV, 5.6 cm`,
        { group: p.group },
      );
      watching.push({
        at: particles.clock + 0.2,
        group: p.group,
        note: "thoron",
      });
    }
  }

  // A note about something you can see, once its droplets have had time to form.
  function review() {
    for (let i = watching.length - 1; i >= 0; i--) {
      const w = watching[i];
      if (w.at > particles.clock) continue;
      watching.splice(i, 1);
      const members = particles.tracks.filter((t) => t.group === w.group);
      if (members.length < 2 || members.some((t) => t.drops < 12)) continue;
      if (w.note === "thoron") {
        const gap = members[1].born - members[0].born;
        onNote(
          "thoron",
          `A V: thoron from the mantle decayed, and its daughter polonium-216 went off from the same spot ${gap.toFixed(2)} s later.`,
        );
      } else if (w.note === "pair") {
        onNote(
          "pair",
          "A gamma ray turned into an electron and a positron, which leave one point together. In a magnetic field they curl opposite ways.",
        );
      } else {
        onNote(
          "decay",
          "A muon slowed to a stop (its track thickens at the end) and decayed into a fast electron.",
        );
      }
    }
  }

  return {
    step(dt: number, placed: Placed[]) {
      for (const p of placed) {
        if (p.id === "mantle") fromMantle(p, dt);
        else if (p.id === "americium") fromAmericium(p, dt);
        else if (p.id === "radium") fromRadium(p, dt);
        else fromPotash(p, dt);
      }
      background(dt);
      stepThoron(dt);
      review();
    },
    get thoron() {
      return thoron;
    },
    clear() {
      thoron = 0;
      polonium.length = 0;
      watching.length = 0;
    },
  };
}

export type Sources = ReturnType<typeof createSources>;

// A small seeded generator, so each thing is drawn the same way every time.
function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Draws the things on the floor into two textures the size of the floor: their colours, and the
// radium paint's glow. Coordinates are centimetres from the middle of the floor.
export function drawFloor(
  albedo: CanvasRenderingContext2D,
  glow: CanvasRenderingContext2D,
  placed: Placed[],
) {
  for (const ctx of [albedo, glow]) {
    const size = ctx.canvas.width;
    const scale = size / (HALF * 2);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, size, size);
    ctx.setTransform(scale, 0, 0, scale, size / 2, size / 2);
  }
  for (const p of placed) {
    if (p.id === "mantle") drawMantle(albedo, p);
    else if (p.id === "americium") drawAmericium(albedo, p);
    else if (p.id === "radium") drawHand(albedo, glow, p);
    else drawPotash(albedo, p);
  }
}

function drawMantle(ctx: CanvasRenderingContext2D, p: Placed) {
  const rand = seeded(7);
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(p.angle);
  // A crumpled sock of fabric: an ellipse with a ragged edge.
  const outline = new Path2D();
  const points = 48;
  const wobble = Array.from({ length: 7 }, () => rand() * Math.PI * 2);
  for (let i = 0; i <= points; i++) {
    const a = (i / points) * Math.PI * 2;
    let r = 1;
    for (let k = 0; k < 4; k++) r += 0.06 * Math.sin(a * (k + 2) + wobble[k]);
    const x = Math.cos(a) * 1.35 * r;
    const y = Math.sin(a) * 0.95 * r;
    if (i) outline.lineTo(x, y);
    else outline.moveTo(x, y);
  }
  outline.closePath();
  ctx.fillStyle = "rgba(226, 218, 196, 0.8)";
  ctx.fill(outline);
  ctx.save();
  ctx.clip(outline);
  // The knit: two sets of fine threads.
  ctx.lineWidth = 0.03;
  for (const [angle, colour] of [
    [0.9, "rgba(250, 246, 232, 0.85)"],
    [-0.75, "rgba(242, 236, 218, 0.7)"],
  ] as const) {
    ctx.save();
    ctx.rotate(angle);
    ctx.strokeStyle = colour;
    ctx.beginPath();
    for (let v = -2; v <= 2; v += 0.1) {
      ctx.moveTo(-2, v + Math.sin(v * 9) * 0.01);
      for (let u = -2; u <= 2; u += 0.25)
        ctx.lineTo(u, v + Math.sin(u * 6 + v * 4) * 0.025);
    }
    ctx.stroke();
    ctx.restore();
  }
  // Folds, where the fabric creases.
  for (let i = 0; i < 9; i++) {
    const x0 = (rand() - 0.5) * 2.2;
    const y0 = (rand() - 0.5) * 1.5;
    const a = rand() * Math.PI;
    const l = 0.4 + rand() * 0.8;
    ctx.strokeStyle = `rgba(120, 104, 80, ${0.18 + rand() * 0.2})`;
    ctx.lineWidth = 0.05 + rand() * 0.07;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.quadraticCurveTo(
      x0 + Math.cos(a) * l * 0.5 + (rand() - 0.5) * 0.3,
      y0 + Math.sin(a) * l * 0.5 + (rand() - 0.5) * 0.3,
      x0 + Math.cos(a) * l,
      y0 + Math.sin(a) * l,
    );
    ctx.stroke();
  }
  ctx.restore();
  // The tie at its neck, and a loose end of thread.
  ctx.strokeStyle = "rgba(200, 186, 150, 0.95)";
  ctx.lineWidth = 0.05;
  ctx.beginPath();
  ctx.ellipse(-1.3, 0.05, 0.12, 0.32, 0, 0, Math.PI * 2);
  ctx.moveTo(-1.32, 0.2);
  ctx.bezierCurveTo(-1.7, 0.4, -1.8, 0.1, -2.1, 0.32);
  ctx.stroke();
  ctx.restore();
}

function drawAmericium(ctx: CanvasRenderingContext2D, p: Placed) {
  ctx.save();
  ctx.translate(p.x, p.y);
  // A steel holder, turned on a lathe.
  const body = ctx.createRadialGradient(-0.2, -0.25, 0.1, 0, 0, 0.95);
  body.addColorStop(0, "rgb(206, 208, 210)");
  body.addColorStop(0.7, "rgb(160, 162, 166)");
  body.addColorStop(1, "rgb(110, 112, 116)");
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.arc(0, 0, 0.95, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 0.02;
  for (let r = 0.5; r < 0.92; r += 0.07) {
    ctx.strokeStyle = `rgba(255, 255, 255, ${0.08 + 0.1 * Math.sin(r * 40) ** 2})`;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  // The recess, and the gold-faced foil at its bottom.
  ctx.fillStyle = "rgb(70, 72, 76)";
  ctx.beginPath();
  ctx.arc(0, 0, 0.42, 0, Math.PI * 2);
  ctx.fill();
  const foil = ctx.createRadialGradient(-0.06, -0.08, 0.02, 0, 0, 0.3);
  foil.addColorStop(0, "rgb(214, 184, 112)");
  foil.addColorStop(1, "rgb(150, 118, 58)");
  ctx.fillStyle = foil;
  ctx.beginPath();
  ctx.arc(0, 0, 0.27, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function handPath(width: number, from: number, to: number) {
  // A sword-shaped hand along +x.
  const path = new Path2D();
  path.moveTo(from, -width * 0.35);
  path.lineTo(from + (to - from) * 0.55, -width * 0.5);
  path.lineTo(to, 0);
  path.lineTo(from + (to - from) * 0.55, width * 0.5);
  path.lineTo(from, width * 0.35);
  path.closePath();
  return path;
}

function drawHand(
  ctx: CanvasRenderingContext2D,
  glow: CanvasRenderingContext2D,
  p: Placed,
) {
  const rand = seeded(23);
  for (const c of [ctx, glow]) {
    c.save();
    c.translate(p.x, p.y);
    c.rotate(p.angle);
  }
  // Blued steel, with a boss round the pivot hole and a short tail.
  ctx.fillStyle = "rgb(36, 44, 78)";
  ctx.fill(handPath(0.36, -0.6, 3.05));
  ctx.beginPath();
  ctx.arc(0, 0, 0.24, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgb(16, 16, 18)";
  ctx.beginPath();
  ctx.arc(0, 0, 0.08, 0, Math.PI * 2);
  ctx.fill();
  // The paint, gone the colour of old cream.
  const paint = handPath(0.22, 0.5, 2.7);
  ctx.fillStyle = "rgb(206, 196, 150)";
  ctx.fill(paint);
  // It still glows, unevenly: decades of alphas have burnt out much of the phosphor.
  glow.fillStyle = "rgb(255, 255, 255)";
  glow.fill(paint);
  glow.save();
  glow.clip(paint);
  glow.globalCompositeOperation = "destination-out";
  for (let i = 0; i < 26; i++) {
    glow.fillStyle = `rgba(0, 0, 0, ${0.2 + rand() * 0.5})`;
    glow.beginPath();
    glow.arc(
      0.5 + rand() * 2.2,
      (rand() - 0.5) * 0.2,
      0.05 + rand() * 0.12,
      0,
      Math.PI * 2,
    );
    glow.fill();
  }
  glow.restore();
  for (const c of [ctx, glow]) c.restore();
}

function drawPotash(ctx: CanvasRenderingContext2D, p: Placed) {
  const rand = seeded(41);
  ctx.save();
  ctx.translate(p.x, p.y);
  // A watch glass: just its rim and a faint sheen show.
  ctx.strokeStyle = "rgba(200, 214, 210, 0.35)";
  ctx.lineWidth = 0.06;
  ctx.beginPath();
  ctx.arc(0, 0, 1.85, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = "rgba(180, 196, 192, 0.06)";
  ctx.fill();
  // A heap of little cubes of potassium chloride.
  for (let i = 0; i < 1100; i++) {
    const a = rand() * Math.PI * 2;
    const r = 1.35 * Math.sqrt(rand()) * (0.85 + 0.15 * Math.sin(a * 3));
    const s = 0.035 + rand() * 0.06;
    const shade = 200 + rand() * 55 - (r / 1.35) * 30;
    ctx.save();
    ctx.translate(Math.cos(a) * r, Math.sin(a) * r);
    ctx.rotate(rand() * Math.PI);
    ctx.fillStyle = `rgb(${shade}, ${shade}, ${shade - 4})`;
    ctx.fillRect(-s / 2, -s / 2, s, s);
    ctx.restore();
  }
  ctx.restore();
}

// How far the thing at p reaches, in floor centimetres, for picking it up: its footprint with
// the camera's perspective on its top.
export function footprint(p: Placed) {
  const s = source(p.id);
  return s.radius * (EYE / (EYE - s.height));
}

// Where along its length a watch hand's paint is, for testing whether a press is on it.
export function onHand(p: Placed, x: number, y: number) {
  const c = Math.cos(p.angle);
  const s = Math.sin(p.angle);
  const along = (x - p.x) * c + (y - p.y) * s;
  const across = -(x - p.x) * s + (y - p.y) * c;
  return along > -0.8 && along < 3.3 && Math.abs(across) < 0.45;
}
