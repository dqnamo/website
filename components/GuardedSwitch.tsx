"use client";

import {
  animate,
  type MotionValue,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from "motion/react";
import {
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { cn } from "@/helpers/classname-helper";

type GuardedSwitchProps = {
  /** Engraved on the placard, and used as the switch's accessible name. */
  label?: string;
  /** Legend lit while the switch is off. */
  offLabel?: string;
  /** Legend lit while the switch is on. */
  onLabel?: string;
  checked?: boolean;
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  onGuardChange?: (open: boolean) => void;
  /** Play small synthesised clicks for the guard and the lever. */
  sound?: boolean;
  className?: string;
};

// Geometry, in px. The plate is drawn at a fixed size so every part lines up.
const PLATE_WIDTH = 184;
const PLATE_HEIGHT = 288;
const HINGE_Y = 70;
const WELL_WIDTH = 92;
const WELL_HEIGHT = 116;
const COVER_WIDTH = 104;
const COVER_HEIGHT = 124;
const COVER_DEPTH = 16;
const PIVOT_Y = HINGE_Y + 8 + WELL_HEIGHT / 2;
const LEVER_LENGTH = 48;
const LEVER_PERSPECTIVE = 250;

// Angles, in degrees.
const COVER_OPEN = 114;
const COVER_DRAG_RATIO = 1.35;
const LEVER_ON = 38;
const LEVER_OFF = -38;
const LEVER_LEAN = 11;

const coverSpring = { type: "spring", stiffness: 260, damping: 22 } as const;
const coverDropSpring = {
  type: "spring",
  stiffness: 420,
  damping: 18,
} as const;
const leverSnap = { type: "spring", stiffness: 900, damping: 26 } as const;

// Light comes from the top left, so faces are lit as they turn toward it.
const plateStyle: CSSProperties = {
  width: PLATE_WIDTH,
  height: PLATE_HEIGHT,
  backgroundImage:
    "repeating-linear-gradient(90deg, rgb(255 255 255 / 3.5%) 0 1px, transparent 1px 3px), linear-gradient(170deg, var(--color-grayscale-3), var(--color-grayscale-5))",
};

const wellStyle: CSSProperties = {
  width: WELL_WIDTH,
  height: WELL_HEIGHT,
  left: (PLATE_WIDTH - WELL_WIDTH) / 2,
  top: HINGE_Y + 8,
};

const screwAngles = [18, -34, 62, -8] as const;

let audioContext: AudioContext | null = null;

function getAudioContext() {
  if (typeof window === "undefined" || !("AudioContext" in window)) {
    return null;
  }

  audioContext ??= new AudioContext();

  if (audioContext.state === "suspended") {
    void audioContext.resume();
  }

  return audioContext;
}

/** A short filtered noise burst, with an optional low thump under it. */
function playClick({
  duration,
  frequency,
  gain,
  q,
  thump,
}: {
  duration: number;
  frequency: number;
  gain: number;
  q: number;
  thump?: number;
}) {
  const context = getAudioContext();

  if (!context) {
    return;
  }

  const now = context.currentTime;
  const length = Math.ceil(context.sampleRate * duration);
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);

  for (let index = 0; index < length; index += 1) {
    data[index] = (Math.random() * 2 - 1) * (1 - index / length) ** 4;
  }

  const source = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const volume = context.createGain();

  source.buffer = buffer;
  filter.type = "bandpass";
  filter.frequency.value = frequency;
  filter.Q.value = q;
  volume.gain.value = gain;
  source.connect(filter).connect(volume).connect(context.destination);
  source.start(now);

  if (thump) {
    const oscillator = context.createOscillator();
    const thumpVolume = context.createGain();

    oscillator.frequency.setValueAtTime(thump, now);
    oscillator.frequency.exponentialRampToValueAtTime(thump * 0.5, now + 0.08);
    thumpVolume.gain.setValueAtTime(gain * 0.9, now);
    thumpVolume.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);
    oscillator.connect(thumpVolume).connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.1);
  }
}

const sounds = {
  guardOpen: () =>
    playClick({ duration: 0.05, frequency: 1400, gain: 0.32, q: 1.4 }),
  guardClose: () =>
    playClick({
      duration: 0.06,
      frequency: 700,
      gain: 0.5,
      q: 1.1,
      thump: 150,
    }),
  lever: () =>
    playClick({
      duration: 0.03,
      frequency: 3600,
      gain: 0.55,
      q: 2.4,
      thump: 420,
    }),
  rattle: () =>
    playClick({ duration: 0.025, frequency: 1100, gain: 0.22, q: 2 }),
};

/** Project the lever tip, leaning `angle` degrees from the plate's normal. */
function projectLever(angle: number) {
  const radians = (angle * Math.PI) / 180;
  const depth = LEVER_LENGTH * Math.cos(radians);
  const scale = LEVER_PERSPECTIVE / (LEVER_PERSPECTIVE - depth);

  return { scale, y: -LEVER_LENGTH * Math.sin(radians) * scale };
}

function Screw({ angle, className }: { angle: number; className: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "absolute grid size-[11px] place-items-center rounded-full bg-[radial-gradient(circle_at_35%_30%,var(--color-grayscale-1),var(--color-grayscale-7)_70%,var(--color-grayscale-9))] shadow-[0_1px_0_rgb(255_255_255_/_35%),inset_0_-1px_1px_rgb(0_0_0_/_25%)] dark:shadow-[0_1px_0_rgb(255_255_255_/_6%),inset_0_-1px_1px_rgb(0_0_0_/_45%)]",
        className,
      )}
    >
      <span
        className="h-px w-[7px] bg-grayscale-10 shadow-[0_1px_0_rgb(255_255_255_/_30%)]"
        style={{ transform: `rotate(${angle}deg)` }}
      />
    </span>
  );
}

function Lever({ angle }: { angle: MotionValue<number> }) {
  const tipY = useTransform(angle, (value) => projectLever(value).y);
  const tipScale = useTransform(angle, (value) => projectLever(value).scale);
  const shaftTop = useTransform(tipY, (value) => Math.min(0, value));
  const shaftHeight = useTransform(tipY, (value) => Math.abs(value));
  const shadowY = useTransform(tipY, (value) => value * 0.35 + 10);
  const shadowScale = useTransform(
    angle,
    [LEVER_OFF, 0, LEVER_ON],
    [1, 0.7, 1],
  );

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute left-1/2"
      style={{ top: PIVOT_Y }}
    >
      {/* Washer and hex nut the bat handle comes through. */}
      <span className="-translate-x-1/2 -translate-y-1/2 absolute size-[42px] rounded-full bg-[radial-gradient(circle,var(--color-grayscale-6)_55%,var(--color-grayscale-8))] shadow-[inset_0_1px_0_rgb(255_255_255_/_35%),0_2px_3px_rgb(0_0_0_/_25%)] dark:shadow-[inset_0_1px_0_rgb(255_255_255_/_8%),0_2px_3px_rgb(0_0_0_/_45%)]" />
      <span className="-translate-x-1/2 -translate-y-1/2 absolute size-[30px] bg-[linear-gradient(150deg,#f1f2f4,#a9adb4_45%,#6c7179)] [clip-path:polygon(25%_4%,75%_4%,100%_50%,75%_96%,25%_96%,0_50%)]" />
      <span className="-translate-x-1/2 -translate-y-1/2 absolute size-[16px] rounded-full bg-[radial-gradient(circle_at_40%_35%,#d9dce0,#5d6168)] shadow-[inset_0_-1px_2px_rgb(0_0_0_/_45%)]" />

      <motion.span
        className="absolute h-[14px] w-[22px] rounded-full bg-black/35 blur-[5px] dark:bg-black/60"
        style={{ left: -2, scale: shadowScale, y: shadowY }}
      />
      <motion.span
        className="absolute w-[9px] rounded-full bg-[linear-gradient(90deg,#4d5157,#f3f4f6_38%,#a3a8b0_62%,#3f4248)]"
        style={{ height: shaftHeight, left: -4.5, top: shaftTop }}
      />
      <motion.span
        className="-ml-[10px] -mt-[10px] absolute left-0 size-[20px] rounded-full bg-[radial-gradient(circle_at_34%_30%,#ffffff,#d4d7dc_26%,#7b8089_70%,#3c3f45)] shadow-[0_2px_3px_rgb(0_0_0_/_35%)]"
        style={{ scale: tipScale, top: tipY }}
      />
    </div>
  );
}

function Cover({ angle }: { angle: MotionValue<number> }) {
  const sheen = useTransform(angle, [0, 55, COVER_OPEN], [0, 0.22, 0.05]);
  const closedShadow = useTransform(angle, [0, 40], [1, 0]);
  const openShadow = useTransform(angle, [70, COVER_OPEN], [0, 1]);

  const coverBox: CSSProperties = {
    width: COVER_WIDTH,
    height: COVER_HEIGHT,
    left: (PLATE_WIDTH - COVER_WIDTH) / 2,
    top: HINGE_Y,
  };

  return (
    <>
      {/* Shadows the guard casts on the plate, closed and standing open. */}
      <motion.span
        aria-hidden="true"
        className="pointer-events-none absolute rounded-[12px] bg-black/30 blur-[6px] dark:bg-black/55"
        style={{
          ...coverBox,
          opacity: closedShadow,
          x: 4,
          y: 6,
        }}
      />
      <motion.span
        aria-hidden="true"
        className="pointer-events-none absolute rounded-full bg-black/25 blur-[8px] dark:bg-black/50"
        style={{
          height: 26,
          left: coverBox.left,
          opacity: openShadow,
          top: HINGE_Y - 30,
          width: COVER_WIDTH,
        }}
      />

      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute [transform-style:preserve-3d]"
        style={{
          ...coverBox,
          originY: 0,
          rotateX: angle,
          transformPerspective: 560,
        }}
      >
        {/* Side walls fall back toward the plate, so the guard reads as a box. */}
        <span
          className="absolute inset-y-0 left-0 origin-left rounded-l-[4px] bg-[linear-gradient(90deg,#8f1c14,#b8281d)]"
          style={{ transform: "rotateY(90deg)", width: COVER_DEPTH }}
        />
        <span
          className="absolute inset-y-0 right-0 origin-right rounded-r-[4px] bg-[linear-gradient(270deg,#7a160f,#a8241a)]"
          style={{ transform: "rotateY(-90deg)", width: COVER_DEPTH }}
        />
        <span
          className="absolute inset-x-0 bottom-0 origin-bottom rounded-b-[4px] bg-[linear-gradient(0deg,#6e130c,#a52218)]"
          style={{ height: COVER_DEPTH, transform: "rotateX(90deg)" }}
        />

        {/* Underside: only seen once the guard is lifted past upright. */}
        <span
          className="absolute inset-0 overflow-hidden rounded-[11px] bg-[linear-gradient(180deg,#5e0f0a,#7e1910)] shadow-[inset_0_0_0_3px_#9d2117,inset_0_0_12px_rgb(0_0_0_/_45%)] [backface-visibility:hidden]"
          style={{ transform: "rotateX(180deg)" }}
        >
          <span className="absolute inset-x-[22%] inset-y-[14%] bg-[repeating-linear-gradient(0deg,rgb(0_0_0_/_22%)_0_2px,transparent_2px_9px)]" />
        </span>

        {/* Top face, moulded with a raised rim and a finger lip. */}
        <span className="absolute inset-0 overflow-hidden rounded-[11px] bg-[linear-gradient(165deg,#f0533f,#d4321f_45%,#a9231a)] shadow-[inset_0_1px_0_rgb(255_255_255_/_45%),inset_0_0_0_2px_rgb(120_20_12_/_35%),inset_0_-3px_0_rgb(0_0_0_/_18%)] [backface-visibility:hidden]">
          <span className="absolute inset-[9px] rounded-[7px] bg-[linear-gradient(165deg,#e4402d,#c22a1c)] shadow-[inset_0_1px_2px_rgb(0_0_0_/_25%),0_1px_0_rgb(255_255_255_/_25%)]" />
          <span className="absolute inset-x-[30px] bottom-[16px] h-[5px] rounded-full bg-[#8c1c14] shadow-[inset_0_1px_1px_rgb(0_0_0_/_40%),0_1px_0_rgb(255_255_255_/_25%)]" />
          <span className="absolute inset-x-0 top-[34px] text-center font-bold font-mono text-[9px] text-[#ffd7cf]/80 tracking-[0.3em] [text-shadow:0_-1px_0_rgb(0_0_0_/_25%)]">
            LIFT
          </span>
          <motion.span
            className="absolute inset-0 bg-[linear-gradient(180deg,white,transparent_70%)]"
            style={{ opacity: sheen }}
          />
        </span>
      </motion.div>

      {/* Hinge barrel, with alternating knuckles on the plate and the guard. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute flex h-[12px] overflow-hidden rounded-full shadow-[0_2px_3px_rgb(0_0_0_/_30%)]"
        style={{
          left: (PLATE_WIDTH - COVER_WIDTH - 8) / 2,
          top: HINGE_Y - 6,
          width: COVER_WIDTH + 8,
        }}
      >
        {[0, 1, 2, 3, 4].map((knuckle) => (
          <span
            className={cn(
              "h-full flex-1 border-black/20 border-r last:border-r-0",
              knuckle % 2 === 0
                ? "bg-[linear-gradient(180deg,#eceef1,#9ea3ab_55%,#5b6067)]"
                : "bg-[linear-gradient(180deg,#f2604b,#b52a1d_55%,#781710)]",
            )}
            key={knuckle}
          />
        ))}
      </span>
    </>
  );
}

export function GuardedSwitch({
  label = "Deploy",
  offLabel = "Safe",
  onLabel = "Armed",
  checked: checkedProp,
  defaultChecked = false,
  onCheckedChange,
  onGuardChange,
  sound = true,
  className,
}: GuardedSwitchProps) {
  const id = useId();
  const switchId = `${id}-switch`;
  const hintId = `${id}-hint`;
  const shouldReduceMotion = useReducedMotion();
  const [uncontrolledChecked, setUncontrolledChecked] =
    useState(defaultChecked);
  const checked = checkedProp ?? uncontrolledChecked;
  const [open, setOpen] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const coverAngle = useMotionValue(0);
  const leverAngle = useMotionValue(defaultChecked ? LEVER_ON : LEVER_OFF);
  const dragRef = useRef<{
    moved: boolean;
    pointerId: number;
    startAngle: number;
    startY: number;
  } | null>(null);
  const pushOffTimerRef = useRef<number | null>(null);
  const suppressClickRef = useRef(false);

  const setChecked = useCallback(
    (next: boolean) => {
      if (checkedProp === undefined) {
        setUncontrolledChecked(next);
      }
      onCheckedChange?.(next);
    },
    [checkedProp, onCheckedChange],
  );

  const play = useCallback(
    (name: keyof typeof sounds) => {
      if (sound) {
        sounds[name]();
      }
    },
    [sound],
  );

  // The lever always snaps to wherever `checked` says it should be.
  useEffect(() => {
    const target = checked ? LEVER_ON : LEVER_OFF;

    if (shouldReduceMotion) {
      leverAngle.set(target);
      return;
    }

    const controls = animate(leverAngle, target, leverSnap);
    return () => controls.stop();
  }, [checked, leverAngle, shouldReduceMotion]);

  useEffect(
    () => () => {
      if (pushOffTimerRef.current !== null) {
        window.clearTimeout(pushOffTimerRef.current);
      }
    },
    [],
  );

  const settleCover = useCallback(
    (nextOpen: boolean) => {
      const target = nextOpen ? COVER_OPEN : 0;

      if (shouldReduceMotion) {
        coverAngle.set(target);
      } else {
        animate(coverAngle, target, nextOpen ? coverSpring : coverDropSpring);
      }

      if (nextOpen === open) {
        return;
      }

      setOpen(nextOpen);
      onGuardChange?.(nextOpen);
      play(nextOpen ? "guardOpen" : "guardClose");

      // Closing the guard over a thrown switch knocks it back to off,
      // just as the guard's lip meets the bat handle.
      if (!nextOpen && checked) {
        if (pushOffTimerRef.current !== null) {
          window.clearTimeout(pushOffTimerRef.current);
        }
        pushOffTimerRef.current = window.setTimeout(
          () => {
            pushOffTimerRef.current = null;
            setChecked(false);
            setAnnouncement(`Guard closed. ${label} returned to ${offLabel}.`);
          },
          shouldReduceMotion ? 0 : 70,
        );
      }
    },
    [
      checked,
      coverAngle,
      label,
      offLabel,
      onGuardChange,
      open,
      play,
      setChecked,
      shouldReduceMotion,
    ],
  );

  const rattleCover = useCallback(() => {
    play("rattle");

    if (shouldReduceMotion) {
      return;
    }

    animate(coverAngle, [0, 8, 0, 3, 0], {
      duration: 0.32,
      ease: "easeOut",
    });
  }, [coverAngle, play, shouldReduceMotion]);

  const handleCoverPointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) {
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      moved: false,
      pointerId: event.pointerId,
      startAngle: coverAngle.get(),
      startY: event.clientY,
    };
  };

  const handleCoverPointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;

    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    const distance = drag.startY - event.clientY;

    if (!drag.moved && Math.abs(distance) < 4) {
      return;
    }

    drag.moved = true;
    const raw = drag.startAngle + distance * COVER_DRAG_RATIO;
    // Rubber band past either stop rather than hitting a wall.
    const angle =
      raw < 0
        ? raw * 0.15
        : raw > COVER_OPEN
          ? COVER_OPEN + (raw - COVER_OPEN) * 0.15
          : raw;
    coverAngle.set(angle);
  };

  const handleCoverPointerUp = (event: PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;

    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    dragRef.current = null;

    if (drag.moved) {
      suppressClickRef.current = event.type === "pointerup";
      const velocity = coverAngle.getVelocity();
      const projected = coverAngle.get() + velocity * 0.12;
      settleCover(projected > COVER_OPEN / 2);
    }
  };

  const handleCoverClick = () => {
    // A drag already settled the guard on pointer up; only a plain click or
    // key press toggles it here.
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }

    settleCover(!open);
  };

  const handleSwitchPointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (!open || event.button !== 0 || shouldReduceMotion) {
      return;
    }

    // Snap-action toggles resist before they go over centre.
    animate(
      leverAngle,
      checked ? LEVER_ON - LEVER_LEAN : LEVER_OFF + LEVER_LEAN,
      { type: "spring", stiffness: 500, damping: 30 },
    );
  };

  const handleSwitchPointerLeave = () => {
    if (!open || shouldReduceMotion) {
      return;
    }

    animate(leverAngle, checked ? LEVER_ON : LEVER_OFF, leverSnap);
  };

  const handleSwitchClick = () => {
    if (!open) {
      rattleCover();
      setAnnouncement(`Lift the guard before switching ${label}.`);
      return;
    }

    const next = !checked;
    play("lever");
    setChecked(next);
    setAnnouncement("");
  };

  const handleSwitchKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "Escape" && open) {
      event.preventDefault();
      settleCover(false);
    }
  };

  return (
    <div
      className={cn(
        "relative shrink-0 select-none rounded-[22px] border border-grayscale-6 shadow-[inset_0_1px_0_rgb(255_255_255_/_55%),0_2px_0_var(--color-grayscale-7),0_18px_40px_-18px_rgb(0_0_0_/_45%)] dark:border-grayscale-5 dark:shadow-[inset_0_1px_0_rgb(255_255_255_/_7%),0_2px_0_var(--color-grayscale-1),0_18px_40px_-14px_rgb(0_0_0_/_80%)]",
        className,
      )}
      style={plateStyle}
    >
      <Screw angle={screwAngles[0]} className="top-3 left-3" />
      <Screw angle={screwAngles[1]} className="top-3 right-3" />
      <Screw angle={screwAngles[2]} className="bottom-3 left-3" />
      <Screw angle={screwAngles[3]} className="right-3 bottom-3" />

      {/* Recessed well the switch sits in. */}
      <div
        aria-hidden="true"
        className="absolute rounded-[10px] bg-grayscale-4 shadow-[inset_0_3px_8px_rgb(0_0_0_/_28%),inset_0_0_0_1px_rgb(0_0_0_/_10%),0_1px_0_rgb(255_255_255_/_50%)] dark:bg-grayscale-2 dark:shadow-[inset_0_3px_8px_rgb(0_0_0_/_60%),inset_0_0_0_1px_rgb(0_0_0_/_30%),0_1px_0_rgb(255_255_255_/_6%)]"
        style={wellStyle}
      >
        <span className="absolute top-2.5 left-2.5 font-bold font-mono text-[7px] text-grayscale-10 tracking-[0.2em]">
          ON
        </span>
        <span className="absolute bottom-2.5 left-2.5 font-bold font-mono text-[7px] text-grayscale-10 tracking-[0.2em]">
          OFF
        </span>
      </div>

      {/* Grab target follows the guard: over the well when shut, above the hinge when up. */}
      <button
        aria-controls={switchId}
        aria-expanded={open}
        aria-label="Safety guard"
        className="absolute z-10 cursor-grab touch-none rounded-[12px] outline-none focus-visible:outline-2 focus-visible:outline-grayscale-12 focus-visible:outline-offset-2 active:cursor-grabbing"
        onClick={handleCoverClick}
        onPointerCancel={handleCoverPointerUp}
        onPointerDown={handleCoverPointerDown}
        onPointerMove={handleCoverPointerMove}
        onPointerUp={handleCoverPointerUp}
        style={{
          height: open ? 78 : COVER_HEIGHT,
          left: (PLATE_WIDTH - COVER_WIDTH) / 2,
          top: open ? HINGE_Y - 84 : HINGE_Y,
          width: COVER_WIDTH,
        }}
        type="button"
      />

      <Lever angle={leverAngle} />

      <button
        aria-checked={checked}
        aria-describedby={hintId}
        aria-disabled={!open}
        aria-label={label}
        className="absolute cursor-pointer rounded-[10px] outline-none focus-visible:outline-2 focus-visible:outline-grayscale-12 focus-visible:outline-offset-2 aria-disabled:cursor-not-allowed"
        id={switchId}
        onClick={handleSwitchClick}
        onKeyDown={handleSwitchKeyDown}
        onPointerDown={handleSwitchPointerDown}
        onPointerLeave={handleSwitchPointerLeave}
        role="switch"
        style={wellStyle}
        type="button"
      />

      <Cover angle={coverAngle} />

      {/* Placard, warning lamp and legends. */}
      <div
        className="absolute inset-x-0 flex flex-col items-center gap-2.5"
        style={{ top: HINGE_Y + 8 + WELL_HEIGHT + 22 }}
      >
        <span className="rounded-[4px] bg-grayscale-12 px-2 py-[3px] font-bold font-mono text-[10px] text-grayscale-1 uppercase tracking-[0.28em] shadow-[inset_0_1px_0_rgb(255_255_255_/_18%),0_1px_0_rgb(255_255_255_/_40%)] dark:bg-grayscale-1 dark:text-grayscale-11 dark:shadow-[inset_0_1px_0_rgb(255_255_255_/_6%),0_1px_0_rgb(255_255_255_/_6%)]">
          {label}
        </span>
        <div className="flex items-center gap-2.5 font-bold font-mono text-[8px] uppercase tracking-[0.18em]">
          <span
            className={cn(
              "w-12 text-right transition-colors duration-200",
              checked ? "text-grayscale-9" : "text-grayscale-12",
            )}
          >
            {offLabel}
          </span>
          <span
            aria-hidden="true"
            className={cn(
              "relative size-3 rounded-full border border-black/25 transition-[background-color,box-shadow] duration-150 motion-reduce:transition-none",
              checked
                ? "bg-[radial-gradient(circle_at_40%_35%,#fff6d6,#ffc23a_45%,#e48a00)] shadow-[0_0_6px_1px_rgb(255_184_40_/_85%),0_0_22px_6px_rgb(255_170_20_/_45%)]"
                : "bg-[radial-gradient(circle_at_40%_35%,#9a7a3c,#5c4413_60%,#3d2c0a)] shadow-[inset_0_1px_2px_rgb(0_0_0_/_50%)]",
            )}
          >
            <span className="absolute top-[2px] left-[3px] size-[3px] rounded-full bg-white/70" />
          </span>
          <span
            className={cn(
              "w-12 transition-colors duration-200",
              checked ? "text-grayscale-12" : "text-grayscale-9",
            )}
          >
            {onLabel}
          </span>
        </div>
      </div>

      <p className="sr-only" id={hintId}>
        {open
          ? "Guard lifted. Press Escape to close it."
          : "Covered by the safety guard. Lift the guard first."}
      </p>
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
