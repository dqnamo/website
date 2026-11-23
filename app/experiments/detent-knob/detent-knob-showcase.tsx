"use client";

import {
  SpeakerHighIcon,
  SpeakerSlashIcon,
} from "@phosphor-icons/react/dist/ssr";
import { useState } from "react";
import { DetentKnob } from "@/components/DetentKnob";

const stageGridStyle = {
  backgroundImage:
    "linear-gradient(var(--color-grayscale-4) 1px, transparent 1px), linear-gradient(90deg, var(--color-grayscale-4) 1px, transparent 1px)",
  backgroundSize: "24px 24px",
  maskImage: "radial-gradient(circle at center, black, transparent 76%)",
};

function formatDecibels(value: number) {
  if (value === 0) {
    return "0 dB";
  }

  return `${value > 0 ? "+" : "−"}${Math.abs(value)} dB`;
}

function formatToneNumeral(value: number) {
  if (value === 0) {
    return "0";
  }

  return value > 0 ? `+${value}` : `−${Math.abs(value)}`;
}

export function DetentKnobShowcase() {
  const [sound, setSound] = useState(true);
  const [volume, setVolume] = useState(4);

  return (
    <div className="w-full overflow-hidden rounded-[13px] border border-grayscale-3 bg-grayscale-1 small-shadow dark:border-grayscale-4 dark:bg-grayscale-3 dark:shadow-none">
      <div className="relative flex min-h-[460px] flex-col items-center justify-center overflow-hidden bg-grayscale-1 px-6 py-12 dark:bg-grayscale-2 max-[520px]:px-4">
        <div
          aria-hidden="true"
          className="absolute inset-0 opacity-[0.38]"
          style={stageGridStyle}
        />

        <button
          aria-label={sound ? "Mute detent clicks" : "Play detent clicks"}
          aria-pressed={sound}
          className="absolute top-3 right-3 z-[1] flex size-8 items-center justify-center rounded-lg border border-grayscale-4 bg-grayscale-1 text-grayscale-11 transition-colors hover:bg-grayscale-3 hover:text-grayscale-12 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-grayscale-7 dark:bg-grayscale-3 dark:hover:bg-grayscale-4"
          onClick={() => setSound((current) => !current)}
          type="button"
        >
          {sound ? (
            <SpeakerHighIcon size={15} weight="bold" />
          ) : (
            <SpeakerSlashIcon size={15} weight="bold" />
          )}
        </button>

        <div className="relative z-[1] grid grid-cols-[auto_auto_auto] items-end justify-items-center gap-x-10 max-[520px]:grid-cols-2 max-[520px]:gap-x-2 max-[520px]:gap-y-4">
          <DetentKnob
            bipolar
            defaultValue={0}
            formatNumeral={formatToneNumeral}
            formatValue={formatDecibels}
            label="Bass"
            max={6}
            min={-6}
            numeralEvery={6}
            size={60}
            sound={sound}
          />
          <DetentKnob
            className="max-[520px]:order-first max-[520px]:col-span-2"
            label="Volume"
            max={10}
            min={0}
            onValueChange={setVolume}
            size={128}
            sound={sound}
            value={volume}
          />
          <DetentKnob
            bipolar
            defaultValue={2}
            formatNumeral={formatToneNumeral}
            formatValue={formatDecibels}
            label="Treble"
            max={6}
            min={-6}
            numeralEvery={6}
            size={60}
            sound={sound}
          />
        </div>

        <p className="relative z-[1] mt-8 text-center text-grayscale-9 text-xs">
          Turn with a drag, a scroll or the arrow keys.
        </p>
      </div>
    </div>
  );
}
