"use client";

import { Slider } from "@base-ui/react/slider";
import {
  ArrowCounterClockwiseIcon,
  PauseIcon,
  PlayIcon,
  SpeakerHighIcon,
  SpeakerSlashIcon,
} from "@phosphor-icons/react";
import {
  type ComponentPropsWithRef,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { cn } from "@/helpers/classname-helper";

// Audio courtesy of NASA: https://www.nasa.gov/historical-sounds/
const DEFAULT_AUDIO_SOURCE = "/experiments/cassette-player/one-small-step.mp3";
const DEFAULT_CAPTION_TRACKS = [
  {
    default: true,
    label: "English",
    src: "/experiments/cassette-player/one-small-step.vtt",
    srcLang: "en",
  },
] as const;
const DEFAULT_TRACK_TITLE = "One Small Step";
const DEFAULT_VOLUME = 0.78;
const REEL_SPOKES = [0, 60, 120, 180, 240, 300] as const;
const TAPE_WINDOW_DIVIDERS = [0, 1, 2, 3, 4] as const;
const MIN_REWIND_DURATION = 220;
const MAX_REWIND_DURATION = 1000;
const CASSETTE_TEXTURE =
  "url(\"data:image/svg+xml,%3Csvg width='180' height='180' viewBox='0 0 180 180' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.92' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";
const BUTTON_CLASSES =
  "grid aspect-square cursor-pointer place-items-center rounded-full border text-[#fdfdfc] transition-[background-color,opacity,transform] duration-150 ease-out active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-white disabled:cursor-not-allowed disabled:opacity-45 disabled:active:scale-100 motion-reduce:duration-[0.01ms]";

export type CassetteCaptionTrack = {
  default?: boolean;
  label: string;
  src: string;
  srcLang: string;
};

export type CassettePlayerProps = Omit<
  ComponentPropsWithRef<"section">,
  "children"
> & {
  archiveLabel?: string;
  audioSrc?: string;
  captionTracks?: readonly CassetteCaptionTrack[];
  catalogueNumber?: string;
  initialVolume?: number;
  loop?: boolean;
  onPlaybackChange?: (isPlaying: boolean) => void;
  onPlaybackError?: (error: unknown) => void;
  preload?: "auto" | "metadata" | "none";
  sideLabel?: string;
  trackTitle?: string;
};

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

function formatDuration(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return "PT0S";
  }

  return `PT${Math.floor(seconds)}S`;
}

function normalizeVolume(volume: number) {
  return Number.isFinite(volume)
    ? Math.min(Math.max(volume, 0), 1)
    : DEFAULT_VOLUME;
}

type ReelProps = {
  className: string;
};

function Reel({ className }: ReelProps) {
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

export function CassettePlayer({
  archiveLabel = "Archive 11",
  audioSrc = DEFAULT_AUDIO_SOURCE,
  captionTracks,
  catalogueNumber = "200769",
  className,
  initialVolume = DEFAULT_VOLUME,
  loop = true,
  onPlaybackChange,
  onPlaybackError,
  preload = "metadata",
  ref,
  sideLabel = "Side A",
  trackTitle,
  ...sectionProps
}: CassettePlayerProps) {
  const resolvedCaptionTracks =
    captionTracks ??
    (audioSrc === DEFAULT_AUDIO_SOURCE ? DEFAULT_CAPTION_TRACKS : []);
  const resolvedTrackTitle =
    trackTitle ??
    (audioSrc === DEFAULT_AUDIO_SOURCE
      ? DEFAULT_TRACK_TITLE
      : "Untitled track");
  const audioRef = useRef<HTMLAudioElement>(null);
  const cassetteRef = useRef<HTMLDivElement>(null);
  const durationRef = useRef(0);
  const isPlayingRef = useRef(false);
  const previousSourceRef = useRef(audioSrc);
  const rewindAnimationRef = useRef<number | null>(null);
  const resumeAfterRewindRef = useRef(false);
  const resumeAfterScrubRef = useRef(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [volume, setVolume] = useState(() => normalizeVolume(initialVolume));
  const [previousVolume, setPreviousVolume] = useState(() =>
    normalizeVolume(initialVolume),
  );

  const updatePlaybackVisuals = useCallback((time: number) => {
    const cassette = cassetteRef.current;

    if (!cassette) {
      return;
    }

    const mediaDuration = durationRef.current;
    const progress =
      mediaDuration > 0 ? Math.min(Math.max(time / mediaDuration, 0), 1) : 0;

    cassette.style.setProperty("--reel-rotation", `${(time * 300) % 360}deg`);
    cassette.style.setProperty("--left-tape-scale", `${1 - progress * 0.4}`);
    cassette.style.setProperty("--right-tape-scale", `${0.6 + progress * 0.4}`);
  }, []);

  const reportPlaybackError = useCallback(
    (error: unknown, message: string) => {
      setPlaybackError(message);
      onPlaybackError?.(error);
    },
    [onPlaybackError],
  );

  const updatePlaybackState = useCallback(
    (nextIsPlaying: boolean) => {
      if (isPlayingRef.current === nextIsPlaying) {
        return;
      }

      isPlayingRef.current = nextIsPlaying;
      setIsPlaying(nextIsPlaying);
      onPlaybackChange?.(nextIsPlaying);
    },
    [onPlaybackChange],
  );

  const updateMediaDuration = useCallback(
    (audio: HTMLAudioElement) => {
      const nextDuration = Number.isFinite(audio.duration) ? audio.duration : 0;
      durationRef.current = nextDuration;
      setDuration(nextDuration);
      updatePlaybackVisuals(audio.currentTime);
    },
    [updatePlaybackVisuals],
  );

  useEffect(() => {
    const audio = audioRef.current;

    if (audio) {
      audio.volume = volume;
    }
  }, [volume]);

  useEffect(() => {
    const audio = audioRef.current;

    if (audio && audio.readyState >= 1) {
      updateMediaDuration(audio);
    }
  }, [updateMediaDuration]);

  useEffect(() => {
    if (previousSourceRef.current === audioSrc) {
      return;
    }

    previousSourceRef.current = audioSrc;

    if (rewindAnimationRef.current !== null) {
      window.cancelAnimationFrame(rewindAnimationRef.current);
      rewindAnimationRef.current = null;
    }

    const audio = audioRef.current;
    audio?.pause();
    audio?.load();
    durationRef.current = 0;
    resumeAfterRewindRef.current = false;
    resumeAfterScrubRef.current = false;
    setCurrentTime(0);
    setDuration(0);
    updatePlaybackState(false);
    setPlaybackError(null);
    updatePlaybackVisuals(0);
  }, [audioSrc, updatePlaybackState, updatePlaybackVisuals]);

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

      updatePlaybackVisuals(audio.currentTime);
      setCurrentTime(audio.currentTime);

      animationFrameId = window.requestAnimationFrame(syncPlaybackFrame);
    }

    animationFrameId = window.requestAnimationFrame(syncPlaybackFrame);

    return () => window.cancelAnimationFrame(animationFrameId);
  }, [isPlaying, updatePlaybackVisuals]);

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
      updatePlaybackVisuals(currentTime);
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
      } catch (error) {
        updatePlaybackState(false);
        reportPlaybackError(
          error,
          "Playback could not start. Check the audio source and try again.",
        );
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
      updatePlaybackVisuals(0);

      const shouldResume = resumeAfterRewindRef.current;
      resumeAfterRewindRef.current = false;

      if (shouldResume) {
        audioElement.play().catch((error) => {
          updatePlaybackState(false);
          reportPlaybackError(
            error,
            "Playback could not resume after restarting the track.",
          );
        });
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
      const nextTime = rewindFrom * (1 - easedProgress);

      updatePlaybackVisuals(nextTime);
      setCurrentTime(nextTime);

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
    const maximumTime = durationRef.current;
    const clampedTime = Math.min(Math.max(nextTime, 0), maximumTime);
    audio.currentTime = clampedTime;
    setCurrentTime(clampedTime);
    updatePlaybackVisuals(clampedTime);
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
    const shouldResume = resumeAfterScrubRef.current;
    resumeAfterScrubRef.current = false;

    if (!audio || !shouldResume) {
      return;
    }

    try {
      await audio.play();
    } catch (error) {
      updatePlaybackState(false);
      reportPlaybackError(
        error,
        "Playback could not resume after seeking the track.",
      );
    }
  }

  function changeVolume(nextVolume: number) {
    const audio = audioRef.current;

    if (!audio) {
      return;
    }

    const normalizedVolume = normalizeVolume(nextVolume);
    audio.volume = normalizedVolume;
    setVolume(normalizedVolume);

    if (normalizedVolume > 0) {
      setPreviousVolume(normalizedVolume);
    }
  }

  function toggleMute() {
    changeVolume(volume === 0 ? previousVolume || DEFAULT_VOLUME : 0);
  }

  return (
    <section
      aria-label={`${resolvedTrackTitle} audio player`}
      {...sectionProps}
      className={cn(
        "grid min-h-[500px] w-full place-items-center overflow-hidden rounded-[13px] bg-grayscale-1 px-8 py-16 text-[#25211d] [--label-bg:var(--color-grayscale-1)] [--label-border:color-mix(in_srgb,var(--color-grayscale-1)_50%,transparent)] [--label-catalogue:color-mix(in_srgb,var(--color-grayscale-12)_70%,transparent)] [--label-ink:var(--color-grayscale-12)] [--label-kicker:color-mix(in_srgb,var(--color-grayscale-12)_85%,transparent)] [--label-stripe-one:var(--color-green-500)] [--label-stripe-three:var(--color-blue-500)] [--label-stripe-two:var(--color-teal-500)] [--progress-thumb-border:var(--color-grayscale-1)] [--reel-teeth-stroke:#11100f] [--reel-teeth:#1b1a18] [container-type:inline-size] dark:[--label-bg:#dc2626] dark:[--label-border:color-mix(in_srgb,var(--color-grayscale-12)_15%,transparent)] dark:[--label-stripe-one:#fff] dark:[--label-stripe-three:#fff] dark:[--label-stripe-two:#fff] dark:[--progress-thumb-border:var(--color-grayscale-12)] dark:[--reel-teeth-stroke:var(--color-grayscale-5)] dark:[--reel-teeth:var(--color-grayscale-3)] max-[560px]:min-h-[480px] max-[560px]:px-3.5 max-[560px]:py-12",
        className,
      )}
      ref={ref}
    >
      {/* Caption tracks are supplied through the public captionTracks prop. */}
      {/* biome-ignore lint/a11y/useMediaCaption: Dynamic tracks support reusable media sources and languages. */}
      <audio
        loop={loop}
        onDurationChange={(event) => updateMediaDuration(event.currentTarget)}
        onEnded={() => {
          updatePlaybackState(false);
        }}
        onError={(event) => {
          reportPlaybackError(
            event.currentTarget.error,
            "This audio track could not be loaded.",
          );
        }}
        onLoadedMetadata={(event) => {
          updateMediaDuration(event.currentTarget);
          setPlaybackError(null);
        }}
        onPause={() => {
          updatePlaybackState(false);
        }}
        onPlay={() => {
          updatePlaybackState(true);
          setPlaybackError(null);
        }}
        onTimeUpdate={(event) => {
          setCurrentTime(event.currentTarget.currentTime);
          updatePlaybackVisuals(event.currentTarget.currentTime);
        }}
        preload={preload}
        ref={audioRef}
        src={audioSrc}
      >
        {resolvedCaptionTracks.map((captionTrack) => (
          <track
            default={captionTrack.default}
            key={`${captionTrack.srcLang}-${captionTrack.src}`}
            kind="captions"
            label={captionTrack.label}
            src={captionTrack.src}
            srcLang={captionTrack.srcLang}
          />
        ))}
      </audio>

      <div className="w-full max-w-[530px]">
        <div
          className="dark relative aspect-[1.58] w-full overflow-hidden rounded-[18px] border border-[#050505] bg-[linear-gradient(165deg,#373735_0%,#20201f_52%,#0e0e0d_100%)] shadow-[0_28px_48px_rgba(0,0,0,0.24),0_8px_16px_rgba(0,0,0,0.18),inset_0_2px_1px_rgba(255,255,255,0.2),inset_0_-3px_3px_rgba(0,0,0,0.74)] [--left-tape-scale:1] [--reel-rotation:0deg] [--right-tape-scale:0.6] max-[560px]:rounded-xl"
          ref={cassetteRef}
        >
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-1.5 rounded-[13px] border border-white/[0.12] shadow-[inset_0_0_0_1px_rgba(0,0,0,0.62)]"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 opacity-100 mix-blend-multiply"
            style={{ backgroundImage: CASSETTE_TEXTURE }}
          />
          <Screw className="top-[4%] left-[2.53%]" />
          <Screw className="top-[4%] right-[2.53%]" />
          <Screw className="bottom-[4%] left-[2.53%]" />
          <Screw className="right-[2.53%] bottom-[4%]" />

          <div className="absolute top-[9.5%] right-[8.5%] bottom-[24%] left-[8.5%] z-1 overflow-clip rounded-[9px] border-4 border-transparent bg-[var(--label-bg)] text-[var(--label-ink)] shadow-[inset_0_0_12px_rgba(92,74,49,0.12)] [container-type:inline-size] [overflow-clip-margin:border-box] max-[560px]:rounded-md">
            <div className="relative z-2 mx-4 mt-4 flex items-stretch justify-between">
              <div className="grid min-w-0 content-between gap-y-2">
                <span className="relative z-2 flex items-baseline justify-between font-bold font-mono text-[clamp(8px,2.5cqw,11px)] text-[var(--label-kicker)] uppercase leading-none tracking-[0.12em]">
                  {archiveLabel}
                </span>
                <span className="relative z-2 block truncate font-sans font-semibold text-[clamp(12px,4.6cqw,20px)] leading-none tracking-[-0.04em]">
                  {resolvedTrackTitle}
                </span>
              </div>

              <div className="ml-2 grid shrink-0 content-between justify-items-end gap-y-2 font-bold font-mono uppercase leading-none">
                <span className="rounded-full border border-[var(--label-ink)] bg-[var(--label-ink)] px-[7px] py-1 text-[clamp(8px,2.5cqw,11px)] text-[var(--label-bg)] tracking-[0.08em]">
                  {sideLabel}
                </span>
                <span className="font-mono text-[clamp(7px,2.2cqw,10px)] text-[var(--label-catalogue)] tracking-[0.08em]">
                  {catalogueNumber}
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
                  className="pointer-events-none absolute inset-0 opacity-25 mix-blend-multiply"
                  style={{ backgroundImage: CASSETTE_TEXTURE }}
                />
                <div
                  aria-hidden="true"
                  className="absolute top-[12%] right-[28%] bottom-[12%] left-[28%] z-2 flex items-center justify-evenly overflow-hidden rounded-[3px] border-2 border-[#11100f] bg-[#393631] bg-[linear-gradient(to_bottom,rgba(255,255,255,0.1),transparent_42%)] shadow-[inset_0_3px_6px_rgba(0,0,0,0.72),0_0_0_2px_rgba(255,255,255,0.08)]"
                >
                  <span className="absolute top-1/2 left-[calc(50cqh-28cqw)] aspect-square h-[360%] -translate-x-1/2 -translate-y-1/2 scale-[var(--left-tape-scale)] rounded-full border border-[#0d0a08] bg-[repeating-radial-gradient(circle,#050505_0_2px,#171717_2px_4px)] shadow-[inset_0_0_5px_rgba(0,0,0,0.7),0_1px_2px_rgba(0,0,0,0.5)] will-change-transform" />
                  <span className="absolute top-1/2 left-[calc(72cqw-50cqh)] aspect-square h-[360%] -translate-x-1/2 -translate-y-1/2 scale-[var(--right-tape-scale)] rounded-full border border-[#0d0a08] bg-[repeating-radial-gradient(circle,#050505_0_2px,#171717_2px_4px)] shadow-[inset_0_0_5px_rgba(0,0,0,0.7),0_1px_2px_rgba(0,0,0,0.5)] will-change-transform" />
                  {TAPE_WINDOW_DIVIDERS.map((divider) => (
                    <span
                      className="relative z-1 h-[42%] w-0.5 bg-[rgba(224,215,195,0.28)]"
                      key={divider}
                    />
                  ))}
                </div>
                <Reel className="left-[50cqh]" />
                <Reel className="left-[calc(100%-50cqh)]" />
              </div>
            </div>

            <div className="absolute right-4 bottom-4 left-4 z-5 grid gap-y-1.5">
              <Slider.Root
                disabled={duration <= 0}
                largeStep={Math.min(Math.max(duration / 10, 1), 10)}
                max={Math.max(duration, 0.01)}
                min={0}
                onValueCommitted={finishScrubbing}
                onValueChange={seek}
                step={0.01}
                thumbAlignment="edge"
                value={Math.min(currentTime, Math.max(duration, 0.01))}
              >
                <Slider.Control
                  className="flex h-6 w-full cursor-pointer touch-none items-center data-disabled:cursor-default"
                  onPointerCancel={finishScrubbing}
                  onPointerDown={startScrubbing}
                >
                  <Slider.Track className="relative h-[3px] w-full translate-y-0.5 rounded-full bg-[color-mix(in_srgb,var(--label-ink)_28%,transparent)]">
                    <Slider.Indicator className="h-full rounded-full bg-[var(--label-ink)]" />
                    <Slider.Thumb
                      getAriaLabel={() => `Seek through ${resolvedTrackTitle}`}
                      getAriaValueText={(_formattedValue, value) =>
                        `${formatTime(value)} of ${formatTime(duration)}`
                      }
                      className="size-[13px] rounded-full border-2 border-[var(--progress-thumb-border)] bg-white shadow-[0_1px_4px_rgba(37,33,29,0.38)] outline-none has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-[3px] has-[:focus-visible]:outline-grayscale-12"
                    />
                  </Slider.Track>
                </Slider.Control>
              </Slider.Root>

              <div className="relative z-2 flex items-baseline justify-between font-normal font-sans text-xs leading-4 tabular-nums">
                <span>
                  <span className="sr-only">Elapsed time </span>
                  <time dateTime={formatDuration(currentTime)}>
                    {formatTime(currentTime)}
                  </time>
                </span>
                <span>
                  <span className="sr-only">Total time </span>
                  <time dateTime={formatDuration(duration)}>
                    {formatTime(duration)}
                  </time>
                </span>
              </div>
            </div>

            <div
              aria-hidden="true"
              className="pointer-events-none absolute -inset-1 z-10 rounded-[inherit] border-4 border-[var(--label-border)]"
            />
          </div>

          <div className="absolute right-[27%] bottom-[3.5%] left-[27%] z-4 grid h-[16%] grid-cols-[1fr_auto_1fr] place-items-center gap-x-[clamp(6px,1.5cqw,10px)] bg-[color-mix(in_srgb,#63635e_20%,transparent)] px-[12%] shadow-[inset_0_3px_8px_rgba(0,0,0,0.5)] [clip-path:polygon(13%_0,87%_0,100%_100%,0_100%)]">
            <button
              aria-label="Restart track"
              className={cn(
                BUTTON_CLASSES,
                "w-[clamp(24px,6.5cqw,32px)] border-[#82827c] bg-[#63635e] shadow-[0_2px_5px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.2)] hover:bg-[#7c7b74]",
              )}
              disabled={currentTime <= 0}
              onClick={restart}
              type="button"
            >
              <ArrowCounterClockwiseIcon aria-hidden size={16} weight="bold" />
            </button>

            <button
              aria-label={
                isPlaying
                  ? `Pause ${resolvedTrackTitle}`
                  : `Play ${resolvedTrackTitle}`
              }
              className={cn(
                BUTTON_CLASSES,
                "w-[clamp(30px,8.2cqw,43px)] border-[#bcbbb5]/50 bg-[#8d8d86] shadow-[0_3px_8px_rgba(0,0,0,0.32),inset_0_1px_0_rgba(255,255,255,0.25)] hover:bg-[#82827c]",
              )}
              onClick={togglePlayback}
              type="button"
            >
              {isPlaying ? (
                <PauseIcon aria-hidden size={18} weight="fill" />
              ) : (
                <PlayIcon aria-hidden size={18} weight="fill" />
              )}
            </button>

            <button
              aria-label={volume === 0 ? "Unmute" : "Mute"}
              className={cn(
                BUTTON_CLASSES,
                "w-[clamp(24px,6.5cqw,32px)] border-[#82827c] bg-[#63635e] shadow-[0_2px_5px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.2)] hover:bg-[#7c7b74]",
              )}
              onClick={toggleMute}
              type="button"
            >
              {volume === 0 ? (
                <SpeakerSlashIcon aria-hidden size={16} weight="bold" />
              ) : (
                <SpeakerHighIcon aria-hidden size={16} weight="bold" />
              )}
            </button>
          </div>
        </div>

        {playbackError ? (
          <p
            className="mt-3 text-center text-red-700 text-sm dark:text-red-400"
            role="alert"
          >
            {playbackError}
          </p>
        ) : null}
      </div>
    </section>
  );
}
