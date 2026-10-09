// A picture re-laid as a Roman mosaic of 3D tesserae and drawn into a canvas with three.js. Ported
// from Tesserae: the other modules here are its source files, unchanged, and this one is its app
// turned into an engine a page can mount and dispose. The page brings the controls.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { shadeTiles } from "./colour.js";
import { makeEnvironment } from "./environment.js";
import { buildPolys, buildTileGeometry, paintGeometry } from "./geometry.js";
import { createTileMaterials } from "./materials.js";
import { buildGroutTexture } from "./mortar.js";

const TP = 8; // working pixels per base tessera (matches the pipeline)
const BORDER_ROWS = 5; // rows in the banded border (matches the pipeline's bands)
// The tesserae press in at this fraction of the shader's own pace: about 2.8 s, centre to edge.
const LAYING_PACE = 0.65;

/**
 * @typedef {object} MosaicParams
 * @property {number} tiles base tesserae across the picture; finer ones are added where it is detailed
 * @property {number} detail 0–0.6: how much smaller the tiles get where the picture is detailed
 * @property {number} echo rows that echo each contour
 * @property {number} contours 1–10: how faint a contour can be and still be traced
 * @property {boolean} border a banded Roman border around the picture
 * @property {number} palette how many stone or glass colours
 * @property {number} grout grout width, as a fraction of a tile
 * @property {number} tilt how far, in degrees, a tessera can be set askew
 * @property {"stone" | "smalti"} style marble and stone, or glass smalti
 * @property {boolean} gold gold leaf on golden tones
 * @property {"lamp" | "day"} light an oil lamp that follows the pointer, or daylight
 */

/** @type {MosaicParams} */
export const DEFAULT_PARAMS = {
  tiles: 12000,
  detail: 0.42,
  echo: 5,
  contours: 6,
  border: true,
  palette: 28,
  grout: 0.14,
  tilt: 3.5,
  style: "stone",
  gold: true,
  light: "lamp",
};

/**
 * @typedef {object} MosaicStats
 * @property {number} tesserae
 * @property {number} colours
 * @property {number} gold tesserae in gold leaf
 * @property {"stone" | "smalti"} style
 * @property {number} seconds how long the pipeline took to lay them
 */

/**
 * @typedef {object} MosaicOptions
 * @property {() => { top?: number, bottom?: number }} [insets] CSS pixels along the canvas's top
 *   and bottom edges that the page covers; the mosaic is framed in the space between
 * @property {(stats: MosaicStats | null) => void} [onStats] when the tesserae are set, and
 *   with null when a new picture starts being laid
 * @property {(busy: { label: string, progress: number } | null) => void} [onBusy] while they are laid
 * @property {(message: string) => void} [onError]
 */

// Changing these lays the tesserae again; the colours are only re-sorted, the grout only recut.
const LAYOUT_PARAMS = ["tiles", "detail", "echo", "contours", "border"];
const COLOUR_PARAMS = ["palette", "style", "gold"];

/**
 * Starts a mosaic in `canvas`, which it fills. Throws if WebGL is unavailable.
 * @param {HTMLCanvasElement} canvas
 * @param {MosaicOptions} [options]
 */
export function createMosaic(canvas, options = {}) {
  const { insets, onStats, onBusy, onError } = options;
  const P = { ...DEFAULT_PARAMS };
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const coarse = matchMedia("(pointer: coarse)").matches;
  const state = {
    bitmap: null,
    layoutBitmap: null,
    job: 0,
    layout: null,
    polys: null,
    lin: null,
    type: null,
    golds: 0,
    colours: 0,
    unit: 1,
    tw: 1,
    ww: 100,
    hh: 130, // world units per working pixel and per base tessera; panel size
    revealStart: -1e9,
    intro: null,
    firstBuild: true,
    compare: 0,
    compareTarget: 0,
    compareHeld: false,
    reframe: false, // a new picture is being laid, so frame the view once it is
  };
  let disposed = false;

  // ----------------------------------------------------------------------------------- renderer
  // Transparent, so the page's own surface is the wall behind the panel.
  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.2;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.5, 6000);
  camera.position.set(0, 0, 420);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.zoomToCursor = true;
  controls.screenSpacePanning = true;
  controls.minPolarAngle = THREE.MathUtils.degToRad(50);
  controls.maxPolarAngle = THREE.MathUtils.degToRad(130);
  controls.minAzimuthAngle = -0.8;
  controls.maxAzimuthAngle = 0.8;

  scene.environment = makeEnvironment(renderer);

  const sun = new THREE.DirectionalLight(0xfff8f0, 2.4);
  sun.castShadow = true;
  sun.shadow.mapSize.setScalar(coarse ? 2048 : 4096);
  sun.shadow.bias = -0.0004;
  sun.shadow.radius = 2;
  scene.add(sun, sun.target);

  const lamp = new THREE.PointLight(0xfff4ea, 1000, 0, 1.2);
  lamp.castShadow = true;
  lamp.shadow.mapSize.set(1024, 1024);
  lamp.shadow.bias = -0.003;
  lamp.shadow.radius = 2;
  lamp.shadow.camera.near = 2;
  lamp.shadow.camera.far = 2000;
  scene.add(lamp);

  // ----------------------------------------------------------------------------------- shaders
  const U = {
    uTilt: { value: THREE.MathUtils.degToRad(P.tilt) },
    uRelief: { value: 0.05 },
    uReveal: { value: 100 },
    uTileWorld: { value: 1 },
  };

  const {
    tile: tileMat,
    depth: depthMat,
    distance: distMat,
  } = createTileMaterials(U);

  const groutMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.97,
    metalness: 0,
  });
  const pictureMat = new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0,
    toneMapped: false,
    depthWrite: false,
  });
  const pictureMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), pictureMat);
  pictureMesh.renderOrder = 2;
  pictureMesh.visible = false;
  scene.add(pictureMesh);

  let tileMesh = null,
    groutMesh = null;

  // ----------------------------------------------------------------------------------- tiles
  function shade() {
    Object.assign(
      state,
      shadeTiles(state.layout, {
        palette: P.palette,
        style: P.style,
        gold: P.gold,
        tp: TP,
      }),
    );
  }
  function cut() {
    state.polys = buildPolys(state.layout, {
      grout: P.grout,
      unit: state.unit,
      tp: TP,
    });
  }

  // ----------------------------------------------------------------------------------- scene assembly
  function assemble() {
    const L = state.layout,
      tw = state.tw;
    const ww = L.W * state.unit,
      hh = L.H * state.unit;

    const g = buildTileGeometry(state.layout, state.polys, {
      unit: state.unit,
      tw: state.tw,
    });
    paintGeometry(g, state.layout.count, state.lin, state.type);
    if (tileMesh) {
      tileMesh.geometry.dispose();
      tileMesh.geometry = g;
    } else {
      tileMesh = new THREE.Mesh(g, tileMat);
      tileMesh.customDepthMaterial = depthMat;
      tileMesh.customDistanceMaterial = distMat;
      tileMesh.castShadow = true;
      tileMesh.receiveShadow = true;
      tileMesh.frustumCulled = false;
      scene.add(tileMesh);
    }

    const gt = buildGroutTexture(state.layout, state.polys, {
      unit: state.unit,
      tw: state.tw,
      tp: TP,
      anisotropy: renderer.capabilities.getMaxAnisotropy(),
    });
    const m = 0.8 * tw;
    if (groutMesh) {
      groutMesh.geometry.dispose();
      if (groutMat.map) groutMat.map.dispose();
    } else {
      groutMesh = new THREE.Mesh(new THREE.BufferGeometry(), groutMat);
      groutMesh.receiveShadow = true;
      scene.add(groutMesh);
    }
    groutMesh.geometry = new THREE.PlaneGeometry(ww + 2 * m, hh + 2 * m);
    gt.repeat.set((ww + 2 * m) / ww, (hh + 2 * m) / hh);
    gt.offset.set(-m / ww, -m / hh);
    groutMat.map = gt;
    groutMat.needsUpdate = true;
    tileMesh.visible = groutMesh.visible = true;

    pictureMesh.scale.set(L.iw * state.unit, L.ih * state.unit, 1);
    pictureMesh.position.z = 0.75 * tw;

    U.uTileWorld.value = tw;
    U.uRelief.value = (0.02 + 0.009 * P.tilt) * tw;
    sun.shadow.normalBias = 0.04 * tw;
    lamp.shadow.normalBias = 0.04 * tw;
    const rad = Math.hypot(ww, hh) * 0.56,
      sc = sun.shadow.camera;
    sc.left = -rad;
    sc.right = rad;
    sc.top = rad;
    sc.bottom = -rad;
    sc.near = 1;
    sc.far = Math.max(ww, hh) * 6;
    sc.updateProjectionMatrix();
  }

  function reportStats() {
    onStats?.({
      tesserae: state.polys.kept,
      colours: state.colours,
      gold: state.golds,
      style: P.style,
      seconds: state.layout.ms / 1000,
    });
  }

  // ----------------------------------------------------------------------------------- view
  // The panel is framed in the part of the canvas the page leaves uncovered.
  function viewport() {
    const w = canvas.clientWidth || 1,
      h = canvas.clientHeight || 1;
    const edges = insets?.() ?? {};
    const top = Math.max(0, edges.top ?? 0),
      bottom = Math.max(0, edges.bottom ?? 0);
    return { w, h, top, bottom };
  }
  function homeDistance() {
    const { w, h, top, bottom } = viewport();
    const t = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    const availH = Math.max(120, h - top - bottom);
    const pad = w > 680 ? 1.1 : 1.05;
    const dH = (state.hh / 2 / t) * (h / availH);
    const dW = state.ww / 2 / (t * (w / h));
    return Math.max(dH, dW) * pad;
  }
  function resize() {
    const { w, h, top, bottom } = viewport();
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const shift = (bottom - top) / 2;
    if (shift) camera.setViewOffset(w, h, 0, shift, w, h);
    else camera.clearViewOffset();
    camera.updateProjectionMatrix();
  }
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(canvas);

  function frameView(intro) {
    const dist = homeDistance();
    controls.target.set(0, 0, 0);
    controls.maxDistance = dist * 1.9;
    controls.minDistance = 3 * state.tw;
    camera.near = Math.max(0.05, state.tw * 0.5);
    camera.far = dist * 8;
    camera.updateProjectionMatrix();
    const home = new THREE.Vector3(dist * 0.06, -dist * 0.05, dist);
    if (intro && !reduceMotion) {
      state.intro = {
        from: new THREE.Vector3(dist * 0.42, -dist * 0.3, dist * 1.15),
        to: home,
        t0: performance.now(),
        dur: 2600,
      };
      camera.position.copy(state.intro.from);
    } else {
      state.intro = null;
      camera.position.copy(home);
    }
    camera.lookAt(0, 0, 0);
    controls.update();
  }

  // ----------------------------------------------------------------------------------- lighting
  const ndc = new THREE.Vector2(),
    ray = new THREE.Raycaster(),
    wall = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0),
    hit = new THREE.Vector3();
  const lampNow = new THREE.Vector2(-0.35, 0.4),
    lampGoal = new THREE.Vector2(-0.35, 0.4);
  let lastPointer = -1e9;
  function onPointerMove(e) {
    if (e.pointerType === "mouse" && e.buttons) return;
    const r = canvas.getBoundingClientRect();
    ndc.set(
      ((e.clientX - r.left) / r.width) * 2 - 1,
      -((e.clientY - r.top) / r.height) * 2 + 1,
    );
    ray.setFromCamera(ndc, camera);
    if (!ray.ray.intersectPlane(wall, hit)) return;
    lampGoal.set(
      THREE.MathUtils.clamp(hit.x / (state.ww / 2), -1.25, 1.25),
      THREE.MathUtils.clamp(hit.y / (state.hh / 2), -1.25, 1.25),
    );
    lastPointer = performance.now();
  }
  function onPointerLeave() {
    lastPointer = performance.now() - 4000;
  }
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerleave", onPointerLeave);

  const tmpV = new THREE.Vector3();
  function updateLights(now) {
    if (now - lastPointer > 6000 && !reduceMotion) {
      const t = now * 0.00016;
      lampGoal.set(Math.sin(t) * 0.72, 0.15 + Math.sin(t * 1.618 + 1.1) * 0.55);
    }
    lampNow.lerp(lampGoal, 0.07);
    const big = Math.max(state.ww, state.hh);
    const day = P.light === "day";
    sun.visible = day;
    lamp.visible = !day;
    scene.environmentIntensity = day ? 0.85 : 0.62;
    if (day) {
      tmpV.set(lampNow.x * 1.1, lampNow.y * 1.1, 0.62).normalize();
      sun.position.copy(tmpV).multiplyScalar(big * 2.5);
    } else {
      const h = big * 0.5;
      lamp.position.set(
        lampNow.x * state.ww * 0.5,
        lampNow.y * state.hh * 0.5,
        h,
      );
      lamp.intensity =
        3.8 *
        h ** 1.2 *
        (1 + 0.025 * Math.sin(now * 0.011) * Math.sin(now * 0.0071));
    }
  }

  // ----------------------------------------------------------------------------------- worker
  let worker = null,
    workerBusy = false,
    useMainThread = false;
  function makeWorker() {
    try {
      const w = new Worker(new URL("./pipeline.worker.js", import.meta.url), {
        type: "module",
      });
      w.onmessage = (e) => onPipeline(e.data);
      w.onerror = (e) => {
        e.preventDefault();
        useMainThread = true;
        worker = null;
        if (workerBusy) requestBuild();
      };
      return w;
    } catch {
      useMainThread = true;
      return null;
    }
  }
  function runOnMain(msg) {
    setTimeout(async () => {
      if (disposed) return;
      try {
        const { tessPipeline } = await import("./pipeline.js");
        tessPipeline(msg, (m) => onPipeline(m));
      } catch (err) {
        onPipeline({ type: "error", job: msg.job, message: String(err) });
      }
    }, 30);
  }

  // Working resolution: TP pixels per base tessera. The picture's short side is 100 world units
  // whatever the tile count, so more tesserae means smaller stones, not a bigger panel.
  function plan() {
    const bw = state.bitmap.width,
      bh = state.bitmap.height;
    const area = P.tiles * TP * TP;
    const iw = Math.max(64, Math.round(Math.sqrt((area * bw) / bh))),
      ih = Math.max(64, Math.round(area / iw));
    const M = P.border ? BORDER_ROWS * TP : 0;
    const unit = 100 / Math.min(iw, ih);
    return {
      iw,
      ih,
      M,
      unit,
      ww: (iw + 2 * M) * unit,
      hh: (ih + 2 * M) * unit,
    };
  }

  function requestBuild() {
    if (!state.bitmap || disposed) return;
    const job = ++state.job;
    const pl = plan();
    const cv = document.createElement("canvas");
    cv.width = pl.iw;
    cv.height = pl.ih;
    const ctx = cv.getContext("2d", { willReadFrequently: true });
    ctx.fillStyle = "#cdc4b4";
    ctx.fillRect(0, 0, pl.iw, pl.ih);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(state.bitmap, 0, 0, pl.iw, pl.ih);
    const rgba = ctx.getImageData(0, 0, pl.iw, pl.ih).data;
    const msg = {
      job,
      tp: TP,
      width: pl.iw,
      height: pl.ih,
      rgba,
      params: {
        border: P.border,
        detail: P.detail,
        echo: P.echo,
        contour: 0.7 - 0.05 * P.contours,
        smooth: 2,
        edgeSigma: 0.6,
        minContour: 3.5,
        iters: 12,
        coarse: 7,
        seed: 7,
        debug: false,
      },
    };
    // A new picture clears the wall; nothing shows until its tesserae are laid.
    if (state.layoutBitmap !== state.bitmap) {
      state.unit = pl.unit;
      state.tw = TP * pl.unit;
      state.ww = pl.ww;
      state.hh = pl.hh;
      if (tileMesh) tileMesh.visible = false;
      if (groutMesh) groutMesh.visible = false;
      pictureMesh.scale.set(pl.iw * pl.unit, pl.ih * pl.unit, 1);
      pictureMesh.position.z = 0.75 * state.tw;
      state.reframe = true;
      onStats?.(null);
    }
    onBusy?.({ label: "Sorting the stones", progress: 0.01 });
    if (!useMainThread && workerBusy && worker) {
      worker.terminate();
      worker = null;
    }
    if (!useMainThread && !worker) worker = makeWorker();
    workerBusy = true;
    if (useMainThread || !worker) runOnMain(msg);
    else worker.postMessage(msg, [rgba.buffer]);
  }

  function onPipeline(m) {
    if (disposed || m.job !== state.job) return;
    if (m.type === "progress") {
      onBusy?.({ label: m.stage, progress: Math.min(1, Math.max(0, m.f)) });
      return;
    }
    workerBusy = false;
    if (m.type === "error") {
      onBusy?.(null);
      onError?.(`The stones would not set: ${m.message.split("\n")[0]}`);
      console.error(m.message);
      return;
    }
    state.layout = m;
    state.layoutBitmap = state.bitmap;
    state.unit = 100 / Math.min(m.iw, m.ih);
    state.tw = TP * state.unit;
    const ww = m.W * state.unit,
      hh = m.H * state.unit;
    const resized =
      Math.abs(ww - state.ww) > 0.01 * state.ww ||
      Math.abs(hh - state.hh) > 0.01 * state.hh;
    state.ww = ww;
    state.hh = hh;
    try {
      shade();
      cut();
      assemble();
    } catch (err) {
      console.error(err);
      onBusy?.(null);
      onError?.(`Something went wrong while setting the tiles: ${err.message}`);
      return;
    }
    // The view flies in as the first mosaic's tesserae press into the wall.
    if (state.reframe || resized) {
      frameView(state.firstBuild);
      state.firstBuild = false;
      state.reframe = false;
    }
    state.revealStart = reduceMotion ? -1e9 : performance.now();
    reportStats();
    onBusy?.(null);
  }

  // ----------------------------------------------------------------------------------- images
  function fallbackImage() {
    const cv = document.createElement("canvas");
    cv.width = 600;
    cv.height = 800;
    const c = cv.getContext("2d");
    const g = c.createLinearGradient(0, 0, 0, 800);
    g.addColorStop(0, "#3d6fb0");
    g.addColorStop(1, "#a9c3e0");
    c.fillStyle = g;
    c.fillRect(0, 0, 600, 800);
    c.fillStyle = "#e2b84a";
    c.beginPath();
    c.arc(300, 300, 190, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#8f3b26";
    c.beginPath();
    c.arc(300, 300, 110, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#2b2a3a";
    c.fillRect(150, 470, 300, 330);
    return cv;
  }
  function setBitmap(bitmap) {
    if (disposed) return;
    state.bitmap = bitmap;
    const cv = document.createElement("canvas");
    const k = Math.min(1, 2048 / Math.max(bitmap.width, bitmap.height));
    cv.width = Math.round(bitmap.width * k);
    cv.height = Math.round(bitmap.height * k);
    cv.getContext("2d").drawImage(bitmap, 0, 0, cv.width, cv.height);
    if (pictureMat.map) pictureMat.map.dispose();
    pictureMat.map = new THREE.CanvasTexture(cv);
    pictureMat.map.colorSpace = THREE.SRGBColorSpace;
    pictureMat.needsUpdate = true;
    requestBuild();
  }

  // ----------------------------------------------------------------------------------- params
  // Sliders report every step of a drag, so the work waits for a pause: long enough to lay the
  // tesserae once a drag settles, short enough that colours and grout follow it.
  const pending = { layout: false, colour: false, grout: false };
  let pendingTimer = 0;
  function schedule(kind) {
    pending[kind] = true;
    clearTimeout(pendingTimer);
    pendingTimer = setTimeout(flush, pending.layout ? 350 : 60);
  }
  function flush() {
    pendingTimer = 0;
    const { layout, colour, grout } = pending;
    pending.layout = pending.colour = pending.grout = false;
    if (disposed) return;
    if (layout) {
      requestBuild();
      return;
    }
    if (!state.layout || !tileMesh) return;
    if (colour) shade();
    if (grout) {
      cut();
      assemble();
    } else if (colour) {
      paintGeometry(
        tileMesh.geometry,
        state.layout.count,
        state.lin,
        state.type,
      );
    }
    reportStats();
  }

  // ----------------------------------------------------------------------------------- loop
  const ease = (t) => 1 - (1 - t) ** 3;
  let raf = 0,
    visible = true;
  function frame(now) {
    raf = 0;
    if (disposed || !visible) return;
    raf = requestAnimationFrame(frame);
    if (state.intro) {
      const k = Math.min(1, (now - state.intro.t0) / state.intro.dur);
      camera.position.lerpVectors(state.intro.from, state.intro.to, ease(k));
      if (k >= 1) state.intro = null;
    }
    controls.update();
    U.uReveal.value = ((now - state.revealStart) / 1000) * LAYING_PACE;
    state.compare += (state.compareTarget - state.compare) * 0.16;
    pictureMat.opacity = state.compare;
    pictureMesh.visible = state.compare > 0.002 && !!pictureMat.map;
    updateLights(now);
    renderer.render(scene, camera);
  }
  // Nothing is drawn while the canvas is scrolled out of view.
  const visibility = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible && !raf && !disposed) raf = requestAnimationFrame(frame);
  });
  visibility.observe(canvas);
  resize();
  raf = requestAnimationFrame(frame);

  return {
    /** @param {Partial<MosaicParams>} next */
    setParams(next) {
      for (const key of Object.keys(next)) {
        const value = next[key];
        if (value === undefined || P[key] === value) continue;
        P[key] = value;
        if (LAYOUT_PARAMS.includes(key)) schedule("layout");
        else if (COLOUR_PARAMS.includes(key)) schedule("colour");
        else if (key === "grout") schedule("grout");
        else if (key === "tilt") {
          U.uTilt.value = THREE.MathUtils.degToRad(value);
          U.uRelief.value = (0.02 + 0.009 * value) * state.tw;
        }
      }
    },
    /** Lays the picture at `url`, or a stand-in if it can't be loaded. */
    async loadImage(url) {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(String(res.status));
        const bitmap = await createImageBitmap(await res.blob());
        setBitmap(bitmap);
      } catch (err) {
        console.warn("Picture unavailable, using a generated one", err);
        setBitmap(await createImageBitmap(fallbackImage()));
      }
    },
    /** @param {Blob | null | undefined} file */
    async setFile(file) {
      if (!file || !/^image\//.test(file.type)) {
        onError?.("That file is not an image. Try a JPEG, PNG or WebP.");
        return;
      }
      try {
        setBitmap(await createImageBitmap(file));
      } catch {
        onError?.("This image could not be read. Try a JPEG, PNG or WebP.");
      }
    },
    /** Shows the original picture over the tesserae while `on`. */
    setCompare(on) {
      state.compareHeld = on;
      state.compareTarget = on ? 1 : 0;
    },
    /** Fits the mosaic to the canvas again, at whatever size the canvas now is. */
    resetView() {
      resize();
      frameView(false);
      // Draw at once, so a canvas that has just been resized never shows a blank frame.
      renderer.render(scene, camera);
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      clearTimeout(pendingTimer);
      resizeObserver.disconnect();
      visibility.disconnect();
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerleave", onPointerLeave);
      worker?.terminate();
      controls.dispose();
      tileMesh?.geometry.dispose();
      groutMesh?.geometry.dispose();
      groutMat.map?.dispose();
      pictureMat.map?.dispose();
      pictureMesh.geometry.dispose();
      for (const material of [tileMat, depthMat, distMat, groutMat, pictureMat])
        material.dispose();
      scene.environment?.dispose();
      renderer.dispose();
    },
  };
}
