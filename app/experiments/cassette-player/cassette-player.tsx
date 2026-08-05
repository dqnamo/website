"use client";

import { Slider } from "@base-ui/react/slider";
import {
  ArrowCounterClockwiseIcon,
  PauseIcon,
  PlayIcon,
  SpeakerHighIcon,
  SpeakerSlashIcon,
} from "@phosphor-icons/react";
import { type CSSProperties, useEffect, useRef, useState } from "react";
import { cn } from "@/helpers/classname-helper";

// Audio courtesy of NASA: https://www.nasa.gov/historical-sounds/
const AUDIO_SOURCE = "/experiments/cassette-player/one-small-step.mp3";
const REEL_SPOKES = [0, 60, 120, 180, 240, 300] as const;
const TAPE_WINDOW_DIVIDERS = [0, 1, 2, 3, 4] as const;
const TRACK_TITLE = "One Small Step";
const MIN_REWIND_DURATION = 220;
const MAX_REWIND_DURATION = 1000;
const CASSETTE_TEXTURE =
  "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 180 180' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.92' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.18'/%3E%3C/svg%3E\")";
const BUTTON_CLASSES =
  "grid aspect-square cursor-pointer place-items-center rounded-full border text-[#fdfdfc] transition-[background-color,transform] duration-150 ease-out active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-[#21201c] motion-reduce:duration-[0.01ms]";

function easeInOutCubic(progress: number) {
  return progress < 0.5 ? 4 * progress ** 3 : 1 - (-2 * progress + 2) ** 3 / 2;
}

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds)) {
    return "0:00";
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
}

type ReelProps = {
  className: string;
  rotation: number;
};

function Reel({ className, rotation }: ReelProps) {
  return (
    <div
      className={cn(
        "absolute top-1/2 z-3 aspect-square w-[78cqh] -translate-x-1/2 -translate-y-1/2",
        className,
      )}
    >
      <svg
        aria-hidden="true"
        className="absolute inset-0 origin-center rotate-[var(--reel-rotation)] rounded-full will-change-transform motion-reduce:!rotate-0"
        style={{ "--reel-rotation": `${rotation}deg` } as CSSProperties}
        viewBox="0 0 100 100"
      >
        <circle className="fill-grayscale-1" cx="50" cy="50" r="48" />
        {REEL_SPOKES.map((spokeRotation) => (
          <path
            className="fill-[var(--reel-teeth)] stroke-[var(--reel-tooth-stroke)] [filter:drop-shadow(0_1px_1px_rgba(0,0,0,0.32))] [stroke-linejoin:round] [stroke-width:1.25]"
            d="M46 3h8v9a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2z"
            key={spokeRotation}
            transform={`rotate(${spokeRotation} 50 50)`}
          />
        ))}
        <circle
          className="fill-none stroke-[var(--reel-window-color)] [stroke-width:3]"
          cx="50"
          cy="50"
          r="48"
        />
      </svg>
    </div>
  );
}

type ScrewProps = {
  className: string;
};

function Screw({ className }: ScrewProps) {
  const slotClasses =
    "absolute top-1/2 right-[18%] left-[18%] h-[14%] -translate-y-1/2 rounded-full bg-[#1d1d1b] shadow-[inset_0_1px_1px_rgba(0,0,0,0.82),0_1px_rgba(255,255,255,0.1)]";

  return (
    <div
      aria-hidden="true"
      className={cn(
        "absolute z-3 aspect-square w-[3.3%] rounded-full border border-[#060606] bg-[radial-gradient(circle_at_36%_30%,#5f5f5c,#30302e_48%,#171716_78%)] shadow-[inset_0_1px_1px_rgba(255,255,255,0.26),0_1px_1px_rgba(0,0,0,0.38)]",
        className,
      )}
    >
      <span className={cn(slotClasses, "rotate-45")} />
      <span className={cn(slotClasses, "-rotate-45")} />
    </div>
  );
}

export function CassettePlayer() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const rewindAnimationRef = useRef<number | null>(null);
  const resumeAfterRewindRef = useRef(false);
  const resumeAfterScrubRef = useRef(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(0.78);
  const [previousVolume, setPreviousVolume] = useState(0.78);

  const progress = duration > 0 ? currentTime / duration : 0;
  const reelRotation = currentTime * 300;
  const leftTapeScale = 1 - progress * 0.4;
  const rightTapeScale = 0.6 + progress * 0.4;

  useEffect(() => {
    const audio = audioRef.current;

    if (audio && Number.isFinite(audio.duration)) {
      setDuration(audio.duration);
    }
  }, []);

  useEffect(() => {
    if (!isPlaying) {
      return;
    }

    let animationFrameId = 0;

    function syncPlaybackFrame() {
      const audio = audioRef.current;

      if (!audio || audio.paused) {
        return;
      }

      setCurrentTime(audio.currentTime);
      animationFrameId = window.requestAnimationFrame(syncPlaybackFrame);
    }

    animationFrameId = window.requestAnimationFrame(syncPlaybackFrame);

    return () => window.cancelAnimationFrame(animationFrameId);
  }, [isPlaying]);

  useEffect(
    () => () => {
      if (rewindAnimationRef.current !== null) {
        window.cancelAnimationFrame(rewindAnimationRef.current);
      }
    },
    [],
  );

  function cancelRewind() {
    if (rewindAnimationRef.current === null) {
      return;
    }

    window.cancelAnimationFrame(rewindAnimationRef.current);
    rewindAnimationRef.current = null;
    resumeAfterRewindRef.current = false;

    const audio = audioRef.current;

    if (audio) {
      audio.currentTime = currentTime;
    }
  }

  async function togglePlayback() {
    const audio = audioRef.current;

    if (!audio) {
      return;
    }

    cancelRewind();

    if (audio.paused) {
      try {
        await audio.play();
      } catch {
        setIsPlaying(false);
      }
    } else {
      audio.pause();
    }
  }

  function restart() {
    const audio = audioRef.current;

    if (!audio) {
      return;
    }

    const audioElement = audio;

    if (rewindAnimationRef.current !== null) {
      window.cancelAnimationFrame(rewindAnimationRef.current);
    }

    resumeAfterRewindRef.current =
      resumeAfterRewindRef.current || !audioElement.paused;

    if (!audioElement.paused) {
      audioElement.pause();
    }

    const rewindFrom = currentTime;
    const shouldReduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    function finishRewind() {
      rewindAnimationRef.current = null;
      audioElement.currentTime = 0;
      setCurrentTime(0);

      const shouldResume = resumeAfterRewindRef.current;
      resumeAfterRewindRef.current = false;

      if (shouldResume) {
        audioElement.play().catch(() => setIsPlaying(false));
      }
    }

    if (rewindFrom <= 0 || shouldReduceMotion) {
      finishRewind();
      return;
    }

    const rewindDistance =
      duration > 0 ? Math.min(Math.max(rewindFrom / duration, 0), 1) : 1;
    const rewindDuration =
      MIN_REWIND_DURATION +
      (MAX_REWIND_DURATION - MIN_REWIND_DURATION) * rewindDistance;
    const startedAt = performance.now();

    function animateRewind(now: number) {
      const linearProgress = Math.min((now - startedAt) / rewindDuration, 1);
      const easedProgress = easeInOutCubic(linearProgress);

      setCurrentTime(rewindFrom * (1 - easedProgress));

      if (linearProgress < 1) {
        rewindAnimationRef.current =
          window.requestAnimationFrame(animateRewind);
        return;
      }

      finishRewind();
    }

    rewindAnimationRef.current = window.requestAnimationFrame(animateRewind);
  }

  function seek(nextTime: number) {
    const audio = audioRef.current;

    if (!audio) {
      return;
    }

    cancelRewind();
    audio.currentTime = nextTime;
    setCurrentTime(nextTime);
  }

  function startScrubbing() {
    const audio = audioRef.current;

    if (!audio) {
      return;
    }

    cancelRewind();
    resumeAfterScrubRef.current = !audio.paused;

    if (!audio.paused) {
      audio.pause();
    }
  }

  async function finishScrubbing() {
    const audio = audioRef.current;

    if (!audio || !resumeAfterScrubRef.current) {
      return;
    }

    resumeAfterScrubRef.current = false;

    try {
      await audio.play();
    } catch {
      setIsPlaying(false);
    }
  }

  function changeVolume(nextVolume: number) {
    const audio = audioRef.current;

    if (!audio) {
      return;
    }

    audio.volume = nextVolume;
    setVolume(nextVolume);

    if (nextVolume > 0) {
      setPreviousVolume(nextVolume);
    }
  }

  function toggleMute() {
    changeVolume(volume === 0 ? previousVolume || 0.78 : 0);
  }

  return (
    <div className="grid min-h-[500px] w-full place-items-center overflow-hidden rounded-[13px] bg-grayscale-1 px-8 py-16 text-[#25211d] [--label-bg:var(--color-grayscale-1)] [--label-border:color-mix(in_srgb,var(--color-grayscale-1)_50%,transparent)] [--label-catalogue:color-mix(in_srgb,var(--color-grayscale-12)_70%,transparent)] [--label-ink:var(--color-grayscale-12)] [--label-kicker:color-mix(in_srgb,var(--color-grayscale-12)_85%,transparent)] [--label-stripe-one:var(--color-green-500)] [--label-stripe-three:var(--color-blue-500)] [--label-stripe-two:var(--color-teal-500)] [--progress-thumb-border:var(--color-grayscale-1)] [--reel-teeth-stroke:#11100f] [--reel-teeth:#1b1a18] dark:[--label-bg:#dc2626] dark:[--label-border:color-mix(in_srgb,var(--color-grayscale-12)_15%,transparent)] dark:[--label-stripe-one:#fff] dark:[--label-stripe-three:#fff] dark:[--label-stripe-two:#fff] dark:[--progress-thumb-border:var(--color-grayscale-12)] dark:[--reel-teeth-stroke:var(--color-grayscale-5)] dark:[--reel-teeth:var(--color-grayscale-3)] max-[560px]:min-h-[480px] max-[560px]:px-3.5 max-[560px]:py-12">
      <audio
        loop
        onDurationChange={(event) => setDuration(event.currentTarget.duration)}
        onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)}
        onPause={() => setIsPlaying(false)}
        onPlay={() => setIsPlaying(true)}
        onTimeUpdate={(event) =>
          setCurrentTime(event.currentTarget.currentTime)
        }
        preload="metadata"
        ref={audioRef}
        src={AUDIO_SOURCE}
      >
        <track
          default
          kind="captions"
          label="English"
          src="/experiments/cassette-player/one-small-step.vtt"
          srcLang="en"
        />
      </audio>

      <div className="w-full max-w-[530px]">
        <div className="dark relative aspect-[1.58] w-full overflow-hidden rounded-[18px] border border-[#050505] bg-[linear-gradient(165deg,#373735_0%,#20201f_52%,#0e0e0d_100%)] shadow-[0_28px_48px_rgba(0,0,0,0.24),0_8px_16px_rgba(0,0,0,0.18),inset_0_2px_1px_rgba(255,255,255,0.2),inset_0_-3px_3px_rgba(0,0,0,0.74)] max-[560px]:rounded-xl">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-1.5 rounded-[13px] border border-white/[0.12] shadow-[inset_0_0_0_1px_rgba(0,0,0,0.62)]"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 opacity-[0.13] mix-blend-multiply"
            style={{ backgroundImage: CASSETTE_TEXTURE }}
          />
          <Screw className="top-[4%] left-[2.53%]" />
          <Screw className="top-[4%] right-[2.53%]" />
          <Screw className="bottom-[4%] left-[2.53%]" />
          <Screw className="right-[2.53%] bottom-[4%]" />

          <div className="absolute top-[9.5%] right-[8.5%] bottom-[24%] left-[8.5%] z-1 overflow-clip rounded-[9px] border-4 border-transparent bg-[var(--label-bg)] text-[var(--label-ink)] shadow-[inset_0_0_12px_rgba(92,74,49,0.12)] [overflow-clip-margin:border-box] max-[560px]:rounded-md">
            <div className="relative z-2 mx-4 mt-4 flex items-stretch justify-between">
              <div className="grid content-between gap-y-2">
                <span className="relative z-2 flex items-baseline justify-between font-bold font-mono text-[clamp(8px,1.7vw,11px)] text-[var(--label-kicker)] uppercase leading-none tracking-[0.12em]">
                  ARCHIVE 11
                </span>
                <span className="relative z-2 flex items-baseline justify-between font-sans font-semibold text-xl leading-none tracking-[-0.04em]">
                  {TRACK_TITLE}
                </span>
              </div>

              <div className="grid content-between justify-items-end gap-y-2 font-bold font-mono uppercase leading-none">
                <span className="rounded-full border border-[var(--label-ink)] bg-[var(--label-ink)] px-[7px] py-1 text-[clamp(8px,1.7vw,11px)] text-[var(--label-bg)] tracking-[0.08em]">
                  SIDE A
                </span>
                <span className="font-mono text-[clamp(7px,1.6vw,10px)] text-[var(--label-catalogue)] tracking-[0.08em]">
                  200769
                </span>
              </div>
            </div>

            <div className="relative mt-4 h-[34%] max-[560px]:h-[31%]">
              <div
                aria-hidden="true"
                className="absolute -inset-x-1 top-1/2 grid h-[58%] -translate-y-1/2 grid-rows-3 gap-y-1"
              >
                <span className="bg-[var(--label-stripe-one)]" />
                <span className="bg-[var(--label-stripe-two)]" />
                <span className="bg-[var(--label-stripe-three)]" />
              </div>

              <div className="absolute inset-y-0 inset-x-[17.5%] z-3 overflow-hidden rounded-full bg-[#1b1a18] bg-[linear-gradient(rgba(255,255,255,0.13),transparent_45%)] shadow-[0_0_0_4px_var(--label-border),inset_0_3px_8px_rgba(0,0,0,0.58)] [--reel-window-color:#1b1a18] [container-type:size]">
                <div
                  aria-hidden="true"
                  className="absolute top-[12%] right-[28%] bottom-[12%] left-[28%] z-2 flex items-center justify-evenly overflow-hidden rounded-[3px] border-2 border-[#11100f] bg-[#393631] bg-[linear-gradient(to_bottom,rgba(255,255,255,0.1),transparent_42%)] shadow-[inset_0_3px_6px_rgba(0,0,0,0.72),0_0_0_2px_rgba(255,255,255,0.08)]"
                >
                  <span
                    className="absolute top-1/2 left-[calc(50cqh-28cqw)] aspect-square h-[360%] rounded-full border border-[#0d0a08] bg-[repeating-radial-gradient(circle,#050505_0_2px,#171717_2px_4px)] shadow-[inset_0_0_5px_rgba(0,0,0,0.7),0_1px_2px_rgba(0,0,0,0.5)] will-change-transform"
                    style={{
                      transform: `translate(-50%, -50%) scale(${leftTapeScale})`,
                    }}
                  />
                  <span
                    className="absolute top-1/2 left-[calc(72cqw-50cqh)] aspect-square h-[360%] rounded-full border border-[#0d0a08] bg-[repeating-radial-gradient(circle,#050505_0_2px,#171717_2px_4px)] shadow-[inset_0_0_5px_rgba(0,0,0,0.7),0_1px_2px_rgba(0,0,0,0.5)] will-change-transform"
                    style={{
                      transform: `translate(-50%, -50%) scale(${rightTapeScale})`,
                    }}
                  />
                  {TAPE_WINDOW_DIVIDERS.map((divider) => (
                    <span
                      className="relative z-1 h-[42%] w-0.5 bg-[rgba(224,215,195,0.28)]"
                      key={divider}
                    />
                  ))}
                </div>
                <Reel className="left-[50cqh]" rotation={reelRotation} />
                <Reel
                  className="left-[calc(100%-50cqh)]"
                  rotation={reelRotation}
                />
              </div>
            </div>

            <div className="absolute right-4 bottom-4 left-4 z-5 grid gap-y-1.5">
              <Slider.Root
                disabled={duration <= 0}
                max={Math.max(duration, 0.01)}
                min={0}
                onValueChange={seek}
                step={0.01}
                thumbAlignment="edge"
                value={currentTime}
              >
                <Slider.Control
                  className="flex h-4 w-full cursor-pointer touch-none items-center data-disabled:cursor-default"
                  onPointerCancel={finishScrubbing}
                  onPointerDown={startScrubbing}
                  onPointerUp={finishScrubbing}
                >
                  <Slider.Track className="relative h-[3px] w-full translate-y-0.5 rounded-full bg-[color-mix(in_srgb,var(--label-ink)_28%,transparent)]">
                    <Slider.Indicator className="h-full rounded-full bg-[var(--label-ink)]" />
                    <Slider.Thumb
                      aria-label={`Seek through ${TRACK_TITLE}`}
                      className="size-[13px] rounded-full border-2 border-[var(--progress-thumb-border)] bg-white shadow-[0_1px_4px_rgba(37,33,29,0.38)] outline-none has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-[3px] has-[:focus-visible]:outline-grayscale-12"
                    />
                  </Slider.Track>
                </Slider.Control>
              </Slider.Root>

              <div className="relative z-2 flex items-baseline justify-between font-normal font-sans text-xs leading-4 tabular-nums">
                <span>{formatTime(currentTime)}</span>
                <span>{formatTime(duration)}</span>
              </div>
            </div>

            <div
              aria-hidden="true"
              className="pointer-events-none absolute -inset-1 z-10 rounded-[inherit] border-4 border-[var(--label-border)]"
            />
          </div>

          <div className="absolute right-[27%] bottom-[3.5%] left-[27%] z-4 grid h-[16%] grid-cols-[1fr_auto_1fr] place-items-center gap-x-[clamp(6px,1.5vw,10px)] bg-[color-mix(in_srgb,#63635e_20%,transparent)] px-[12%] shadow-[inset_0_3px_8px_rgba(0,0,0,0.5)] [clip-path:polygon(13%_0,87%_0,100%_100%,0_100%)]">
            <button
              aria-label="Restart track"
              className={cn(
                BUTTON_CLASSES,
                "w-[clamp(24px,6.5vw,32px)] border-[#82827c] bg-[#63635e] shadow-[0_2px_5px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.2)] hover:bg-grayscale-12/75",
              )}
              onClick={restart}
              type="button"
            >
              <ArrowCounterClockwiseIcon size={16} weight="bold" />
            </button>

            <button
              aria-label={
                isPlaying ? `Pause ${TRACK_TITLE}` : `Play ${TRACK_TITLE}`
              }
              className={cn(
                BUTTON_CLASSES,
                "w-[clamp(30px,8.2vw,43px)] border-[#bcbbb5]/50 bg-[#8d8d86] shadow-[0_3px_8px_rgba(0,0,0,0.32),inset_0_1px_0_rgba(255,255,255,0.25)] hover:bg-[#82827c]",
              )}
              onClick={togglePlayback}
              type="button"
            >
              {isPlaying ? (
                <PauseIcon size={18} weight="fill" />
              ) : (
                <PlayIcon className="translate-x-px" size={18} weight="fill" />
              )}
            </button>

            <button
              aria-label={volume === 0 ? "Unmute" : "Mute"}
              className={cn(
                BUTTON_CLASSES,
                "w-[clamp(24px,6.5vw,32px)] border-[#82827c] bg-[#63635e] shadow-[0_2px_5px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.2)] hover:bg-grayscale-12/75",
              )}
              onClick={toggleMute}
              type="button"
            >
              {volume === 0 ? (
                <SpeakerSlashIcon size={16} weight="bold" />
              ) : (
                <SpeakerHighIcon size={16} weight="bold" />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
