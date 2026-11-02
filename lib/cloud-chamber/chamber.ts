// The chamber's geometry, in centimetres, seen from a camera straight above the middle of its
// floor. A glass box with no bottom stands on a black metal plate, the plate lies on dry ice in
// a polystyrene box, and a strip of felt soaked in isopropyl alcohol runs round the inside of the
// glass near the top. The alcohol evaporates from the felt, sinks, and cools as it nears the
// plate at −78 °C, until just above the floor there's more vapour in the air than air that
// cold can hold. Only in that layer, a centimetre or two deep, does a passing particle leave a
// trail of droplets; above it the air is too warm, and right at the floor the vapour has
// already condensed out on to the metal.
//
// x runs to the right and y down the screen, as the pointer does, and z up towards the camera.

export const HALF = 11; // half the floor's width: the glass box is 22 cm square inside
export const WALL = 12; // the glass walls' height
export const GLASS = 0.6; // their thickness
export const FELT_TOP = WALL - 0.5;
export const FELT_BOTTOM = WALL - 2.8;
export const PLATE = 15.5; // half the plate's width, frosted where it's open to the room
export const FOAM_IN = 15.8; // the polystyrene box round it
export const FOAM_OUT = 19.5;
export const FOAM_TOP = 1;
export const BENCH = -9; // the bench the box stands on
export const EYE = 55; // the camera's height above the floor

// Above this nothing condenses.
export const LAYER_TOP = 2.4;

// How readily ions turn into droplets at height z: 0 below the floor film and above the layer,
// 1 where the vapour is most supersaturated, about 7 mm up.
export function sensitivity(z: number) {
  if (z <= 0.04 || z >= LAYER_TOP) return 0;
  return smoothstep(0.04, 0.4, z) * (1 - smoothstep(0.95, LAYER_TOP, z));
}

export function smoothstep(a: number, b: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

// How much larger something at height z looks than the floor beneath it.
export function perspective(z: number) {
  return EYE / (EYE - z);
}

// Roughly normal, mean 0 and spread 1, from three uniforms: cheap enough to call per droplet.
export function spread() {
  return (Math.random() + Math.random() + Math.random() - 1.5) * 2;
}

export function gaussian() {
  const u = 1 - Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * Math.random());
}

// Poisson-distributed count with mean lambda; the rates here make lambda small each frame.
export function poisson(lambda: number) {
  if (lambda <= 0) return 0;
  const limit = Math.exp(-lambda);
  let k = 0;
  let p = Math.random();
  while (p > limit && k < 50) {
    k++;
    p *= Math.random();
  }
  return k;
}

export function exponential(mean: number) {
  return -Math.log(1 - Math.random()) * mean;
}
