import * as THREE from "three";

// A small chapel for reflections. The mosaic faces +Z, so whatever sits behind the viewer is what
// the gold mirrors: a warm nave wall, with windows and candle stands scattered close to the axis
// so that each tilted tessera catches a different one.
export function makeEnvironment(renderer) {
  const env = new THREE.Scene();
  env.add(
    new THREE.Mesh(
      new THREE.SphereGeometry(60, 32, 16),
      new THREE.MeshBasicMaterial({ color: 0x1a1816, side: THREE.BackSide }),
    ),
  );
  const glow = (w, h, hex, k, x, y, z) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color: hex, side: THREE.DoubleSide }),
    );
    m.material.color.multiplyScalar(k);
    m.position.set(x, y, z);
    m.lookAt(0, 0, 0);
    env.add(m);
  };
  glow(80, 46, 0xc2b8aa, 0.5, 0, 4, 42); // limewashed nave wall behind the viewer
  glow(4, 8, 0xfff1d8, 7, -9, 7, 38); // windows
  glow(4, 7, 0xffe9c8, 6, 10, 5, 38);
  glow(5, 3, 0xfff6ea, 5, 2, 13, 37);
  glow(3, 3, 0xffc88c, 7, -3, -10, 38); // candle stands
  glow(3, 3, 0xffd09c, 6, 7, -8, 39);
  glow(3, 3, 0xffc080, 6, -13, -5, 37);
  glow(14, 22, 0xfff0dc, 4, -22, 14, 30); // tall window, upper left
  glow(36, 7, 0xbdd0ff, 1.2, 0, 34, -4); // skylight
  const pm = new THREE.PMREMGenerator(renderer);
  const tex = pm.fromScene(env, 0.025).texture;
  pm.dispose();
  return tex;
}
