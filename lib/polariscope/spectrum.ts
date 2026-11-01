// The light box's white, split into a handful of wavelengths. Interference colours come from
// some wavelengths getting through and others not, so the shader works one wavelength at a time
// and adds them up with these weights: how much each sample adds to red, green and blue, from
// the CIE 1931 observer and a 6000 K lamp, scaled so that letting every wavelength through in
// full makes plain white. Each sample also carries how much a crossed pair of polarising
// filters still leaks there; real sheet polarisers give up at the ends of the spectrum, which
// is why a crossed pair looks deep violet rather than black.

export const SAMPLES = 18;
export const FIRST_WAVELENGTH = 395;
export const LAST_WAVELENGTH = 700;
export const STEP = (LAST_WAVELENGTH - FIRST_WAVELENGTH) / (SAMPLES - 1);

export function wavelength(i: number) {
  return FIRST_WAVELENGTH + i * STEP;
}

// A piecewise Gaussian, wider on one side than the other.
function lobe(x: number, mean: number, below: number, above: number) {
  const t = (x - mean) / (x < mean ? below : above);
  return Math.exp(-0.5 * t * t);
}

// The CIE 1931 colour matching functions, as fitted by Wyman, Sloan and Shirley (2013).
function observer(nm: number): [number, number, number] {
  const x =
    1.056 * lobe(nm, 599.8, 37.9, 31.0) +
    0.362 * lobe(nm, 442.0, 16.0, 26.7) -
    0.065 * lobe(nm, 501.1, 20.4, 26.2);
  const y =
    0.821 * lobe(nm, 568.8, 46.9, 40.5) + 0.286 * lobe(nm, 530.9, 16.3, 31.1);
  const z =
    1.217 * lobe(nm, 437.0, 11.8, 36.0) + 0.681 * lobe(nm, 459.0, 26.0, 13.8);
  return [x, y, z];
}

// Planck's law, near enough for relative brightness across the visible range.
function lamp(nm: number, kelvin: number) {
  const metres = nm * 1e-9;
  return 1 / (metres ** 5 * (Math.exp(0.014388 / (metres * kelvin)) - 1));
}

// How much of the blocked direction a polarising sheet lets through at each wavelength.
function leak(nm: number) {
  return (
    0.0016 +
    0.05 * Math.exp(-(((nm - 395) / 22) ** 2)) +
    0.03 * Math.exp(-(((nm - 705) / 26) ** 2))
  );
}

// Four numbers per sample: red, green and blue in linear sRGB, then the leak.
export function spectralWeights() {
  const weights = new Float32Array(SAMPLES * 4);
  const total = [0, 0, 0];
  for (let i = 0; i < SAMPLES; i++) {
    const nm = wavelength(i);
    const [x, y, z] = observer(nm);
    const power = lamp(nm, 6000);
    const r = 3.2406 * x - 1.5372 * y - 0.4986 * z;
    const g = -0.9689 * x + 1.8758 * y + 0.0415 * z;
    const b = 0.0557 * x - 0.204 * y + 1.057 * z;
    weights[i * 4] = r * power;
    weights[i * 4 + 1] = g * power;
    weights[i * 4 + 2] = b * power;
    weights[i * 4 + 3] = leak(nm);
    total[0] += r * power;
    total[1] += g * power;
    total[2] += b * power;
  }
  for (let i = 0; i < SAMPLES; i++) {
    for (let c = 0; c < 3; c++) weights[i * 4 + c] /= total[c];
  }
  return weights;
}
