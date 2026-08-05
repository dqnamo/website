"use client";

import {
  ArrowCounterClockwiseIcon,
  PauseIcon,
  PlayIcon,
  SpeakerHighIcon,
  SpeakerSlashIcon,
} from "@phosphor-icons/react";
import { type CSSProperties, useEffect, useRef, useState } from "react";
import styles from "./cassette-player.module.css";

// Audio courtesy of NASA: https://www.nasa.gov/historical-sounds/
const AUDIO_SOURCE = "/experiments/cassette-player/one-small-step.mp3";
const REEL_SPOKES = [0, 60, 120, 180, 240, 300] as const;
const TAPE_WINDOW_DIVIDERS = [0, 1, 2, 3, 4] as const;
const TRACK_TITLE = "One Small Step";
const MIN_REWIND_DURATION = 220;
const MAX_REWIND_DURATION = 1000;

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
    <div className={`${styles.reelAssembly} ${className}`}>
      <svg
        aria-hidden="true"
        className={styles.reel}
        style={{ "--reel-rotation": `${rotation}deg` } as CSSProperties}
        viewBox="0 0 100 100"
      >
        <circle className={styles.reelHole} cx="50" cy="50" r="48" />
        {REEL_SPOKES.map((spokeRotation) => (
          <path
            className={styles.reelSpoke}
            d="M46 3h8v9a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2z"
            key={spokeRotation}
            transform={`rotate(${spokeRotation} 50 50)`}
          />
        ))}
        <circle className={styles.reelOutline} cx="50" cy="50" r="48" />
      </svg>
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
    <div className={styles.showcase}>
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

      <div className={styles.player}>
        <div className={`${styles.cassette} dark`}>
          <div
            aria-hidden="true"
            className={`${styles.screw} ${styles.screwTopLeft}`}
          />
          <div
            aria-hidden="true"
            className={`${styles.screw} ${styles.screwTopRight}`}
          />
          <div
            aria-hidden="true"
            className={`${styles.screw} ${styles.screwBottomLeft}`}
          />
          <div
            aria-hidden="true"
            className={`${styles.screw} ${styles.screwBottomRight}`}
          />

          <div className={styles.label}>
            <div className={styles.labelContent}>
              <div className={styles.labelColumn}>
                <span className={styles.labelHeader}>ARCHIVE 11</span>
                <span className={`${styles.trackTitle} font-medium text-xl`}>
                  {TRACK_TITLE}
                </span>
              </div>

              <div className={`${styles.labelColumn} ${styles.labelMetadata}`}>
                <span className={styles.sideMark}>SIDE A</span>
                <span className={styles.catalogue}>200769</span>
              </div>
            </div>

            <div className={styles.windowRow}>
              <div className={styles.window}>
                <div aria-hidden="true" className={styles.tapeWindow}>
                  <span
                    className={`${styles.tapePack} ${styles.leftTapePack}`}
                    style={{
                      transform: `translate(-50%, -50%) scale(${leftTapeScale})`,
                    }}
                  />
                  <span
                    className={`${styles.tapePack} ${styles.rightTapePack}`}
                    style={{
                      transform: `translate(-50%, -50%) scale(${rightTapeScale})`,
                    }}
                  />
                  {TAPE_WINDOW_DIVIDERS.map((divider) => (
                    <span className={styles.tapeWindowDivider} key={divider} />
                  ))}
                </div>
                <Reel className={styles.leftReel} rotation={reelRotation} />
                <Reel className={styles.rightReel} rotation={reelRotation} />
              </div>
            </div>

            <div className={styles.labelPlayback}>
              <input
                aria-label={`Seek through ${TRACK_TITLE}`}
                className={styles.progress}
                max={duration || 0}
                min="0"
                onChange={(event) => seek(Number(event.currentTarget.value))}
                onPointerCancel={finishScrubbing}
                onPointerDown={startScrubbing}
                onPointerUp={finishScrubbing}
                step="0.01"
                style={
                  {
                    "--progress-position": `${progress * 100}%`,
                  } as CSSProperties
                }
                type="range"
                value={currentTime}
              />

              <div className={styles.labelFooter}>
                <span>{formatTime(currentTime)}</span>
                <span>{formatTime(duration)}</span>
              </div>
            </div>
          </div>

          <div className={styles.controlDeck}>
            <button
              aria-label="Restart track"
              className={`${styles.secondaryButton} hover:bg-grayscale-12/75`}
              onClick={restart}
              type="button"
            >
              <ArrowCounterClockwiseIcon size={16} weight="bold" />
            </button>

            <button
              aria-label={
                isPlaying ? `Pause ${TRACK_TITLE}` : `Play ${TRACK_TITLE}`
              }
              className={styles.playButton}
              onClick={togglePlayback}
              type="button"
            >
              {isPlaying ? (
                <PauseIcon size={18} weight="fill" />
              ) : (
                <PlayIcon className={styles.playIcon} size={18} weight="fill" />
              )}
            </button>

            <button
              aria-label={volume === 0 ? "Unmute" : "Mute"}
              className={`${styles.secondaryButton} hover:bg-grayscale-12/75`}
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
