"use client";

import {
  ArrowCounterClockwiseIcon,
  PauseIcon,
  PlayIcon,
  SpeakerHighIcon,
  SpeakerSlashIcon,
} from "@phosphor-icons/react";
import {
  type PointerEvent as ReactPointerEvent,
  useRef,
  useState,
} from "react";
import styles from "./cassette-player.module.css";

const AUDIO_SOURCE = "/videos/home/world-cup-2026.mp4";
const REEL_SPOKES = [0, 60, 120, 180, 240, 300] as const;
const TAPE_WINDOW_DIVIDERS = [0, 1, 2, 3, 4] as const;

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
        style={{ transform: `rotate(${rotation}deg)` }}
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
  const resumeAfterScrubRef = useRef(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [volume, setVolume] = useState(0.78);
  const [previousVolume, setPreviousVolume] = useState(0.78);

  const progress = duration > 0 ? currentTime / duration : 0;
  const reelRotation = currentTime * 240;
  const leftTapeScale = 1 - progress * 0.4;
  const rightTapeScale = 0.6 + progress * 0.4;

  async function togglePlayback() {
    const audio = audioRef.current;

    if (!audio) {
      return;
    }

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

    audio.currentTime = 0;
    setCurrentTime(0);
  }

  function seek(nextTime: number) {
    const audio = audioRef.current;

    if (!audio) {
      return;
    }

    audio.currentTime = nextTime;
    setCurrentTime(nextTime);
  }

  function startScrubbing(event: ReactPointerEvent<HTMLInputElement>) {
    const audio = audioRef.current;

    if (!audio) {
      return;
    }

    resumeAfterScrubRef.current = !audio.paused;

    if (!audio.paused) {
      audio.pause();
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    setIsScrubbing(true);
  }

  async function finishScrubbing() {
    const audio = audioRef.current;

    setIsScrubbing(false);

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
          label="Audio description"
          src="/experiments/cassette-player/extra-time.vtt"
          srcLang="en"
        />
      </audio>

      <div className={styles.player}>
        <div
          className={`${styles.cassette} dark`}
          data-playing={isPlaying}
          data-scrubbing={isScrubbing}
        >
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
            <div className={styles.labelHeader}>
              <span>FIELD NOTES</span>
              <span className={styles.sideMark}>SIDE A</span>
            </div>

            <div className={styles.trackTitle}>
              <span>Extra Time</span>
              <span className={styles.catalogue}>DN—05</span>
            </div>

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

            <input
              aria-label="Seek through Extra Time"
              className={styles.progress}
              max={duration || 0}
              min="0"
              onChange={(event) => seek(Number(event.currentTarget.value))}
              onPointerCancel={finishScrubbing}
              onPointerDown={startScrubbing}
              onPointerUp={finishScrubbing}
              step="0.01"
              style={{
                background: `linear-gradient(to right, var(--label-ink) 0 ${progress * 100}%, color-mix(in srgb, var(--label-ink) 28%, transparent) ${progress * 100}% 100%)`,
              }}
              type="range"
              value={currentTime}
            />

            <div className={styles.labelFooter}>
              <span>STEREO</span>
              <span>
                {formatTime(currentTime)} / {formatTime(duration)}
              </span>
            </div>
          </div>

          <div className={styles.controlDeck}>
            <button
              aria-label="Restart track"
              className={styles.secondaryButton}
              onClick={restart}
              type="button"
            >
              <ArrowCounterClockwiseIcon size={16} weight="bold" />
            </button>

            <button
              aria-label={isPlaying ? "Pause Extra Time" : "Play Extra Time"}
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
              className={styles.secondaryButton}
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
