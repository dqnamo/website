"use client";

import {
  SpeakerHighIcon,
  SpeakerSlashIcon,
} from "@phosphor-icons/react/dist/ssr";
import { useId, useState } from "react";
import { ClickPen } from "@/components/ClickPen";
import { cn } from "@/helpers/classname-helper";

const stageGridStyle = {
  backgroundImage:
    "linear-gradient(var(--color-grayscale-4) 1px, transparent 1px), linear-gradient(90deg, var(--color-grayscale-4) 1px, transparent 1px)",
  backgroundSize: "24px 24px",
  maskImage: "radial-gradient(circle at center, black, transparent 76%)",
};

/** Ruled lines for the note, 24px apart to match the text's line height. */
const ruledStyle = {
  backgroundImage:
    "linear-gradient(transparent 23px, var(--color-grayscale-5) 23px, var(--color-grayscale-5) 24px)",
  backgroundSize: "100% 24px",
};

const INKS = [
  { color: "#2f5bea", name: "Blue" },
  { color: "#2b2b31", name: "Black" },
  { color: "#e5484d", name: "Red" },
  { color: "#2f9e62", name: "Green" },
] as const;

export function ClickPenShowcase() {
  const [sound, setSound] = useState(true);
  const [isOut, setIsOut] = useState(false);
  const [ink, setInk] = useState<(typeof INKS)[number]>(INKS[0]);
  const noteId = useId();

  return (
    <div className="w-full overflow-hidden rounded-[13px] border border-grayscale-3 bg-grayscale-1 small-shadow dark:border-grayscale-4 dark:bg-grayscale-3 dark:shadow-none">
      <div className="relative flex min-h-[460px] flex-col items-center justify-center gap-8 overflow-hidden bg-grayscale-1 px-6 py-12 dark:bg-grayscale-2 max-[520px]:px-4">
        <div
          aria-hidden="true"
          className="absolute inset-0 opacity-[0.38]"
          style={stageGridStyle}
        />

        <button
          aria-label={sound ? "Mute pen clicks" : "Play pen clicks"}
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

        <ClickPen
          checked={isOut}
          className="relative z-[1]"
          ink={ink.color}
          label={`${ink.name} pen`}
          onCheckedChange={setIsOut}
          sound={sound}
        />

        <div className="relative z-[1] flex w-full max-w-[360px] flex-col gap-3">
          <div className="flex items-center justify-between">
            <label
              className="font-mono text-[10px] text-grayscale-10 uppercase tracking-[0.12em]"
              htmlFor={noteId}
            >
              {isOut ? `Writing in ${ink.name.toLowerCase()}` : "Pen is in"}
            </label>
            <fieldset className="flex items-center gap-1.5">
              <legend className="sr-only">Ink</legend>
              {INKS.map((option) => (
                <label
                  className="relative flex size-5 cursor-pointer items-center justify-center rounded-full"
                  key={option.name}
                >
                  <input
                    aria-label={`${option.name} ink`}
                    checked={option.name === ink.name}
                    className="peer absolute inset-0 cursor-pointer appearance-none rounded-full outline-none"
                    name="ink"
                    onChange={() => setInk(option)}
                    type="radio"
                  />
                  <span
                    aria-hidden="true"
                    className="pointer-events-none size-3 rounded-full shadow-[inset_0_-1px_1px_rgb(0_0_0/0.3),inset_0_1px_1px_rgb(255_255_255/0.35)] ring-grayscale-8 ring-offset-1 ring-offset-grayscale-1 transition-[box-shadow,scale] peer-checked:ring-[1.5px] peer-focus-visible:ring-2 peer-focus-visible:ring-grayscale-10 peer-active:scale-90 dark:ring-offset-grayscale-2"
                    style={{ backgroundColor: option.color }}
                  />
                </label>
              ))}
            </fieldset>
          </div>

          <textarea
            className={cn(
              "h-[122px] w-full resize-none rounded-lg border border-grayscale-4 bg-grayscale-1 px-3 pt-[3px] text-[15px] text-grayscale-12 leading-6 outline-none transition-[opacity,border-color] placeholder:text-grayscale-8 focus-visible:border-grayscale-7 dark:bg-grayscale-3",
              !isOut && "cursor-not-allowed opacity-60",
            )}
            defaultValue=""
            id={noteId}
            placeholder={isOut ? "Write something…" : "Click the pen to write."}
            readOnly={!isOut}
            spellCheck={false}
            style={{
              ...ruledStyle,
              caretColor: ink.color,
              color: ink.name === "Black" ? undefined : ink.color,
            }}
          />
        </div>

        <p className="relative z-[1] text-center text-grayscale-9 text-xs">
          Click the plunger, or hold Space to keep it pressed.
        </p>
      </div>
    </div>
  );
}
