// A zoetrope: a slotted drum on a spindle with a strip of pictures round the inside of it. Spun
// and looked at through the slits, the pictures move. Nothing in the drum moves but the drum.
//
// The trick is in the slits. The strip goes past far too fast to see, smeared into a blur, as it
// is over the rim. But each slit is only in line with the eye for an instant, and in that instant
// the picture behind it hardly moves, so the eye gets a sharp glimpse of one picture; the next
// slit arrives just as the next picture reaches the same spot, and the glimpses run together.
// The cost is light: the slits are open for a twentieth of the time, so the picture is dim, and
// a wider slit is brighter but holds each glimpse longer, so it smears.
//
// So this doesn't render a moment, as a camera would. The eye blends the last little while
// together, and for each pixel the shader sweeps the drum's angle over that while, adds up
// exactly the stretches when a slit is in line, and lets the painted tin fill the rest. How long
// the eye blends is set by how fast the pictures come: from about three a second up it covers
// a slit and a half, fading in and out over its first and last thirds, so the glimpses always
// add up to the same brightness and there's no flicker on the screen, and each picture hands
// over to the next with only a short crossfade; slower than that, pictures arrive as separate
// flashes, few enough a second to be comfortable to watch.
//
// Other true things follow without being written in: through the slits the figures look
// narrower than they're drawn, because the slit and the picture move opposite ways past the eye;
// with one picture more than there are slits, each lands a little further on and the figures
// walk round the drum; spun backwards, it plays backwards; and a pale drum fogs its own picture,
// because the light off its outside is blended in too, which is why they were painted black.

import { DRUM, STRIP_ROWS, STRIP_TEXELS } from "./drum";
import { FS, VS } from "./shaders";
import { drawStrip, type StripId } from "./strips";

export type { StripId } from "./strips";
export type Paint = "black" | "red" | "cream";

export type ZoetropeSettings = {
  strip: StripId;
  // Pictures round the strip: as many as there are slits, or one either side of that.
  pictures: number;
  // The slits' width in millimetres.
  slit: number;
  paint: Paint;
  // Where the eye is: 0 up close to the slits, 0.4 standing back level with them, 1 looking
  // down over the rim.
  eye: number;
  // A clockwork motor that keeps the drum turning at a steady rate.
  motor: boolean;
  // Pictures a second the motor holds it at.
  rate: number;
};

export const DEFAULT_SETTINGS: ZoetropeSettings = {
  strip: "juggler",
  pictures: 12,
  slit: 4,
  paint: "black",
  eye: 0.4,
  motor: false,
  rate: 14,
};

export type ZoetropeStats = {
  rpm: number;
  // Slits passing the eye a second, which is pictures seen a second.
  rate: number;
  fps: number | null;
};

type Point = { x: number; y: number };
type Vec = [number, number, number];

// Which way round the drum turns for the pictures to play forwards.
const FORWARD = 1;
// A hand on the drum: the slowest it lets the pictures blend, a firm push, and the fastest.
const SPIN_RATE = 14;
const MAX_TURN = 5 * Math.PI * 2;
// The bearing's dry friction and the air's drag, so a spin dies away over half a minute.
const BEARING = 0.1;
const AIR = 0.05;

const sub = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec, b: Vec): Vec => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const norm = (a: Vec): Vec => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const smooth = (t: number) => t * t * (3 - 2 * t);
const wrap = (a: number) => a - Math.PI * 2 * Math.round(a / (Math.PI * 2));

function compile(gl: WebGL2RenderingContext, vs: string, fs: string) {
  const shader = (type: number, source: string) => {
    const s = gl.createShader(type);
    if (!s) throw new Error("Couldn't create a shader");
    gl.shaderSource(s, source);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(s) ?? "Shader didn't compile");
    }
    return s;
  };
  const program = gl.createProgram();
  if (!program) throw new Error("Couldn't create a program");
  gl.attachShader(program, shader(gl.VERTEX_SHADER, vs));
  gl.attachShader(program, shader(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program) ?? "Program didn't link");
  }
  const cache = new Map<string, WebGLUniformLocation | null>();
  const u = (name: string) => {
    if (!cache.has(name)) cache.set(name, gl.getUniformLocation(program, name));
    return cache.get(name) ?? null;
  };
  return { program, u };
}

export type Zoetrope = ReturnType<typeof createZoetrope>;

export function createZoetrope(
  canvas: HTMLCanvasElement,
  {
    onStats,
    onNote,
  }: {
    onStats?: (stats: ZoetropeStats) => void;
    onNote?: (note: string) => void;
  } = {},
) {
  const gl = canvas.getContext("webgl2", {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    preserveDrawingBuffer: false,
  });
  if (!gl) throw new Error("WebGL2 isn't available");

  const scene = compile(gl, VS, FS);
  const triangle = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, triangle);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 3, -1, -1, 3]),
    gl.STATIC_DRAW,
  );
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  // The strip, drawn flat on a canvas and wrapped round the drum as a texture.
  const stripCanvas = document.createElement("canvas");
  stripCanvas.width = STRIP_TEXELS;
  stripCanvas.height = STRIP_ROWS;
  const stripCtx = stripCanvas.getContext("2d");
  if (!stripCtx) throw new Error("Couldn't draw the strip");
  const stripTex = gl.createTexture();
  const aniso = gl.getExtension("EXT_texture_filter_anisotropic");
  let ownFrames: (HTMLCanvasElement | OffscreenCanvas)[] = [];
  const uploadStrip = () => {
    drawStrip(stripCtx, settings.strip, settings.pictures, ownFrames);
    gl.bindTexture(gl.TEXTURE_2D, stripTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.SRGB8_ALPHA8,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      stripCanvas,
    );
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(
      gl.TEXTURE_2D,
      gl.TEXTURE_MIN_FILTER,
      gl.LINEAR_MIPMAP_LINEAR,
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    if (aniso) {
      gl.texParameterf(
        gl.TEXTURE_2D,
        aniso.TEXTURE_MAX_ANISOTROPY_EXT,
        Math.min(8, gl.getParameter(aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT)),
      );
    }
    dirty = true;
  };

  let settings: ZoetropeSettings = { ...DEFAULT_SETTINGS };
  let night = false;
  let dirty = true;

  // ---- Camera -----------------------------------------------------------------------------------

  let width = 1;
  let height = 1;
  let cssW = 1;
  let cssH = 1;
  const cam = {
    eye: [0, 0, 0] as Vec,
    right: [1, 0, 0] as Vec,
    up: [0, 1, 0] as Vec,
    fwd: [0, 0, -1] as Vec,
    tanX: 1,
    tanY: 1,
  };

  const { radius: R, height: H } = DRUM;
  // How high the eye sits at a distance D from the axis: level with the lower slits and looking
  // down through them at the strip on the far side, or high enough to see the far floor over the
  // near rim.
  const eyeHeight = (D: number, eye: number) => {
    const k = (D + R) / (D - R);
    const slits = (128 * k - 42) / (k - 1);
    const rim = (H * k) / (k - 1) + 70;
    const e = eye * eye * (3 - 2 * eye);
    return slits + (rim - slits) * e;
  };

  // Points that must stay in view: the rim, the drum's foot and the stand's foot.
  const outline: Vec[] = [];
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    outline.push([R * Math.sin(a), H, R * Math.cos(a)]);
    outline.push([R * Math.sin(a), 0, R * Math.cos(a)]);
    outline.push([
      DRUM.foot * Math.sin(a),
      DRUM.table,
      DRUM.foot * Math.cos(a),
    ]);
  }

  const look = (D: number, ty: number, over: number) => {
    const eye: Vec = [0, eyeHeight(D, over), D];
    const fwd = norm(sub([0, ty, 0], eye));
    const right = norm(cross(fwd, [0, 1, 0]));
    const up = cross(right, fwd);
    return { eye, fwd, right, up };
  };

  // Standing back, the view fits the drum and its stand to the stage: the nearest the eye can be
  // with every point of them inside the frame, and aimed so they sit in the middle of it. Leaning
  // in, it closes on the slits until the drum overflows the frame.
  const solveCamera = () => {
    const back = smooth(clamp(settings.eye / 0.4, 0, 1));
    const over = clamp((settings.eye - 0.4) / 0.6, 0, 1);
    const aspect = cssW / cssH;
    const tanY = Math.tan(((aspect < 1 ? 46 : 38) * Math.PI) / 360);
    const tanX = tanY * aspect;
    const extent = (D: number) => {
      let ty = 40;
      let span = { x: 0, lo: 0, hi: 0 };
      for (let pass = 0; pass < 4; pass++) {
        const v = look(D, ty, over);
        let x = 0;
        let lo = Number.POSITIVE_INFINITY;
        let hi = Number.NEGATIVE_INFINITY;
        for (const p of outline) {
          const d = sub(p, v.eye);
          const z = dot(d, v.fwd);
          x = Math.max(x, Math.abs(dot(d, v.right) / (z * tanX)));
          const y = dot(d, v.up) / (z * tanY);
          lo = Math.min(lo, y);
          hi = Math.max(hi, y);
        }
        span = { x, lo, hi };
        // Nudge the aim so the top and bottom margins match.
        ty += ((hi + lo) / 2) * 0.5 * D * tanY;
      }
      return { ty, ...span };
    };
    let near = 330;
    let far = 4000;
    for (let i = 0; i < 26; i++) {
      const mid = (near + far) / 2;
      const e = extent(mid);
      if (e.x <= 0.86 && e.hi - e.lo <= 1.66) far = mid;
      else near = mid;
    }
    const e = extent(far);
    // Close enough that the drum just overflows the frame's width, so a few slits are in view.
    const close = Math.min(far, Math.max(R + 175, (1.2 * R) / tanX));
    const D = close + (far - close) * back;
    const v = look(D, 112 + (e.ty - 112) * back, over);
    cam.eye = v.eye;
    cam.fwd = v.fwd;
    cam.right = v.right;
    cam.up = v.up;
    cam.tanX = tanX;
    cam.tanY = tanY;
    dirty = true;
  };

  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cw = Math.max(1, canvas.clientWidth);
    const ch = Math.max(1, canvas.clientHeight);
    // Supersample a little on ordinary screens, and keep huge full-screen views affordable.
    let scale = Math.max(dpr, 1.5);
    scale = Math.min(scale, Math.sqrt(3.4e6 / (cw * ch)));
    const w = Math.max(1, Math.round(cw * scale));
    const h = Math.max(1, Math.round(ch * scale));
    if (w === width && h === height && cw === cssW && ch === cssH) return;
    width = w;
    height = h;
    cssW = cw;
    cssH = ch;
    canvas.width = w;
    canvas.height = h;
    solveCamera();
  };

  // The point on the drum's face under a pointer, as an angle round it. Off the sides of the
  // drum, the nearest edge.
  const angleAt = (p: Point) => {
    const nx = (p.x / cssW) * 2 - 1;
    const ny = 1 - (p.y / cssH) * 2;
    const d = norm([
      cam.fwd[0] + nx * cam.tanX * cam.right[0] + ny * cam.tanY * cam.up[0],
      cam.fwd[1] + nx * cam.tanX * cam.right[1] + ny * cam.tanY * cam.up[1],
      cam.fwd[2] + nx * cam.tanX * cam.right[2] + ny * cam.tanY * cam.up[2],
    ]);
    const o = cam.eye;
    const a = d[0] * d[0] + d[2] * d[2];
    const b = o[0] * d[0] + o[2] * d[2];
    const c = o[0] * o[0] + o[2] * o[2] - R * R;
    const h = b * b - a * c;
    const edge = Math.acos(R / Math.hypot(o[0], o[2]));
    if (h < 0 || a < 1e-9) return { phi: Math.sign(nx || 1) * edge, y: 0 };
    const t = (-b - Math.sqrt(h)) / a;
    return {
      phi: Math.atan2(o[0] + t * d[0], o[2] + t * d[2]),
      y: o[1] + t * d[1],
    };
  };

  // ---- The drum -------------------------------------------------------------------------------

  let theta = 0;
  let omega = 0;
  let braking = false;
  const history: { t: number; th: number }[] = [];
  let grab: { id: number; phi: number } | null = null;
  // The adaptation of the eye, which opens up while it looks through a spinning drum.
  let adapt = 1;
  let wasFast = false;
  let lastSign = 0;

  const thetaAt = (t: number) => {
    if (!history.length) return theta;
    if (t <= history[0].t) return history[0].th;
    for (let i = history.length - 1; i > 0; i--) {
      const a = history[i - 1];
      const b = history[i];
      if (a.t <= t) {
        const k = b.t > a.t ? (t - a.t) / (b.t - a.t) : 1;
        return a.th + (b.th - a.th) * k;
      }
    }
    return history[history.length - 1].th;
  };

  const rateOf = (w: number) => (Math.abs(w) / (Math.PI * 2)) * DRUM.slits;

  // ---- Frame ----------------------------------------------------------------------------------

  let raf = 0;
  let last = performance.now();
  let frames = 0;
  let fpsStamp = last;
  let fps: number | null = null;
  let statStamp = 0;
  let disposed = false;
  let frameNo = 0;
  let lastWindow = { a: 0, b: 0 };

  const render = (th0: number, th1: number, samples: number, ramp: number) => {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, width, height);
    // biome-ignore lint/correctness/useHookAtTopLevel: WebGL's useProgram, not a React hook.
    gl.useProgram(scene.program);
    const u = scene.u;
    gl.uniform2f(u("uRes"), width, height);
    gl.uniform3f(u("uEye"), ...cam.eye);
    gl.uniform3f(u("uRight"), ...cam.right);
    gl.uniform3f(u("uUp"), ...cam.up);
    gl.uniform3f(u("uFwd"), ...cam.fwd);
    gl.uniform2f(u("uTan"), cam.tanX, cam.tanY);
    // Both ends of the window are brought near zero together, keeping the angles precise.
    const base = Math.PI * 2 * Math.round(th1 / (Math.PI * 2));
    gl.uniform1f(u("uTheta0"), th0 - base);
    gl.uniform1f(u("uTheta1"), th1 - base);
    gl.uniform1i(u("uSamples"), samples);
    gl.uniform1f(u("uRamp"), ramp);
    gl.uniform1f(u("uSlitHalf"), settings.slit / 2);
    gl.uniform1i(
      u("uPaint"),
      settings.paint === "black" ? 0 : settings.paint === "red" ? 1 : 2,
    );
    gl.uniform1f(u("uNight"), night ? 1 : 0);
    gl.uniform1f(u("uExposure"), (night ? 1.35 : 0.95) * adapt);
    gl.uniform1f(u("uFrame"), frameNo % 1000);
    gl.uniform2f(u("uStripSize"), STRIP_TEXELS, STRIP_ROWS);
    const sun = norm([-0.34, 0.72, 0.6]);
    gl.uniform3f(u("uSunDir"), ...sun);
    gl.uniform3f(u("uLampPos"), -120, 760, 330);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, stripTex);
    gl.uniform1i(u("uStrip"), 0);
    gl.bindVertexArray(vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  const frame = (stamp: number) => {
    if (disposed) return;
    raf = requestAnimationFrame(frame);
    const dt = Math.min(Math.max((stamp - last) / 1000, 0), 1 / 20);
    last = stamp;
    const now = stamp / 1000;
    frames++;
    frameNo++;
    if (stamp - fpsStamp > 1000) {
      fps = Math.round((frames * 1000) / (stamp - fpsStamp));
      frames = 0;
      fpsStamp = stamp;
    }
    resize();

    if (grab) {
      // The hand has the drum; how fast it's going is read from where the hand has taken it.
      const back = thetaAt(now - 0.06);
      const recent = history.length ? now - history[0].t : 0;
      omega = recent > 0.02 ? (theta - back) / Math.min(0.06, recent) : 0;
    } else if (braking) {
      const slow = 40 * dt;
      omega = Math.abs(omega) <= slow ? 0 : omega - Math.sign(omega) * slow;
      if (omega === 0) braking = false;
      theta += omega * dt;
    } else if (settings.motor) {
      const dir = omega !== 0 ? Math.sign(omega) : FORWARD;
      const target = (dir * settings.rate * Math.PI * 2) / DRUM.slits;
      omega += (target - omega) * (1 - Math.exp(-dt / 0.45));
      theta += omega * dt;
    } else if (omega !== 0) {
      const slow = (BEARING + AIR * Math.abs(omega)) * dt;
      omega = Math.abs(omega) <= slow ? 0 : omega - Math.sign(omega) * slow;
      theta += omega * dt;
    }
    history.push({ t: now, th: theta });
    while (history.length > 2 && history[1].t < now - 1.2) history.shift();

    const rate = rateOf(omega);
    // How long the eye blends: a slit and a half from three pictures a second up, a fifteenth
    // of a second below about two and a half, and in between a blend of the two.
    const blend = rate > 0 ? 1.5 / rate : 0;
    const k = clamp((rate - 2.4) / 0.6, 0, 1);
    let span = k * Math.min(blend, 0.5) + (1 - k) * (2 / 30);
    span = Math.max(span, dt);
    const th0 = thetaAt(now - span);
    const th1 = theta;
    const samples = clamp(
      Math.ceil((Math.abs(th1 - th0) * DRUM.inner) / 1.4),
      1,
      48,
    );

    // The eye opens up looking through a fast black drum, which is mostly dark slits; over the
    // rim, with the drum still, or with a pale drum glaring back at it, it has no need to.
    const duty = settings.slit / ((Math.PI * 2 * R) / DRUM.slits);
    const dark =
      settings.paint === "black" ? 1 : settings.paint === "red" ? 0.4 : 0;
    const want =
      1 +
      (clamp(0.26 / duty, 1, 2) - 1) *
        dark *
        (1 - settings.eye) *
        clamp((rate - 1.5) / 5, 0, 1);
    adapt += (want - adapt) * (1 - Math.exp(-dt / 0.8));

    // Notes on what just happened.
    if (rate > 8 && !grab) wasFast = true;
    if (braking || grab) wasFast = false;
    if (wasFast && rate < 2.5 && rate > 0.3 && !settings.motor) {
      wasFast = false;
      onNote?.(
        "Slowing down: under about three pictures a second the glimpses stop running together and come one at a time.",
      );
    }
    const sign = Math.sign(omega);
    if (!grab && rate > 6 && sign !== 0) {
      if (lastSign !== 0 && sign !== lastSign) {
        onNote?.(
          sign === FORWARD
            ? "Forwards again."
            : "Spun the other way, it plays backwards.",
        );
      }
      lastSign = sign;
    }

    const moving =
      Math.abs(th1 - th0) > 1e-7 ||
      Math.abs(lastWindow.a - th0) > 1e-7 ||
      Math.abs(lastWindow.b - th1) > 1e-7 ||
      Math.abs(adapt - want) > 1e-3;
    if (moving || dirty) {
      render(th0, th1, samples, (1 / 3) * k + 0.5 * (1 - k));
      dirty = false;
      lastWindow = { a: th0, b: th1 };
    }

    if (stamp - statStamp > 200) {
      statStamp = stamp;
      onStats?.({
        rpm: (Math.abs(omega) * 60) / (Math.PI * 2),
        rate,
        fps,
      });
    }
  };

  uploadStrip();
  raf = requestAnimationFrame(frame);

  return {
    setSettings(next: ZoetropeSettings) {
      const redraw =
        next.strip !== settings.strip || next.pictures !== settings.pictures;
      settings = { ...next };
      if (redraw) uploadStrip();
      solveCamera();
    },
    setNight(on: boolean) {
      night = on;
      dirty = true;
    },
    // Your own strip's pictures, one canvas each.
    setFrames(next: (HTMLCanvasElement | OffscreenCanvas)[]) {
      ownFrames = next;
      if (settings.strip === "own") uploadStrip();
    },
    // A firm push the way that plays the pictures forwards.
    spin() {
      braking = false;
      const push = (SPIN_RATE * Math.PI * 2) / DRUM.slits;
      omega =
        Math.sign(omega) === FORWARD
          ? clamp(omega + FORWARD * push * 0.4, -MAX_TURN, MAX_TURN)
          : FORWARD * push;
    },
    stop() {
      braking = true;
    },
    // A flick of the finger along the drum's edge.
    nudge(dir: number) {
      braking = false;
      omega = clamp(omega + dir * 1.4, -MAX_TURN, MAX_TURN);
    },
    pointerDown(id: number, p: Point) {
      if (grab) return false;
      braking = false;
      grab = { id, phi: angleAt(p).phi };
      history.length = 0;
      return true;
    },
    pointerMove(id: number, p: Point) {
      if (!grab || grab.id !== id) return;
      const phi = angleAt(p).phi;
      theta += wrap(phi - grab.phi);
      grab.phi = phi;
    },
    pointerUp(id: number) {
      if (!grab || grab.id !== id) return;
      grab = null;
      // Let go, the drum keeps the speed the hand last had it going at.
      omega = clamp(omega, -MAX_TURN, MAX_TURN);
      if (Math.abs(omega) < 0.05) omega = 0;
    },
    hover(p: Point) {
      const { y } = angleAt(p);
      const nx = Math.abs((p.x / cssW) * 2 - 1);
      return y > -20 && y < H + 20 && nx < 0.95 ? "grab" : "default";
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    },
  };
}
