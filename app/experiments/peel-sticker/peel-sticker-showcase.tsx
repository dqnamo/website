"use client";

import {
  ArrowCounterClockwiseIcon,
  CheckIcon,
  CopyIcon,
  SpeakerHighIcon,
  SpeakerSlashIcon,
} from "@phosphor-icons/react/dist/ssr";
import { useRef, useState } from "react";
import { PeelSticker } from "@/components/PeelSticker";
import { cn } from "@/helpers/classname-helper";

const stageGridStyle = {
  backgroundImage:
    "linear-gradient(var(--color-grayscale-4) 1px, transparent 1px), linear-gradient(90deg, var(--color-grayscale-4) 1px, transparent 1px)",
  backgroundSize: "24px 24px",
  maskImage: "radial-gradient(circle at center, black, transparent 76%)",
};

const INVITE_CODE = "DQN-7K2Q-M4X";

const halftoneStyle = {
  backgroundColor: "#ff5b24",
  backgroundImage:
    "radial-gradient(circle at 1.5px 1.5px, rgba(120, 20, 0, 0.18) 1.2px, transparent 1.6px), linear-gradient(135deg, #ff7a2f 0%, #ff5b24 45%, #f2385a 100%)",
  backgroundSize: "7px 7px, 100% 100%",
};

/** The printed seal: a white die-cut border around a halftone panel. */
export function InviteSealArt() {
  return (
    <div className="absolute inset-0 rounded-[18px] bg-white p-[4px]">
      <div
        className="relative flex h-full items-center gap-3.5 overflow-hidden rounded-[14px] px-4 text-white"
        style={halftoneStyle}
      >
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(112deg,rgba(255,255,255,0.32)_0%,rgba(255,255,255,0)_38%,rgba(255,255,255,0)_70%,rgba(255,255,255,0.14)_100%)]" />

        <svg
          aria-hidden="true"
          className="relative size-11 shrink-0 drop-shadow-[0_1px_0_rgba(120,20,0,0.35)]"
          viewBox="0 0 48 48"
        >
          <path
            d="M24 3l4.6 6.2 7.6-1.6.9 7.7 7 3.3-3.6 6.9 3.6 6.9-7 3.3-.9 7.7-7.6-1.6L24 48l-4.6-6.2-7.6 1.6-.9-7.7-7-3.3 3.6-6.9-3.6-6.9 7-3.3.9-7.7 7.6 1.6z"
            fill="#fff"
            transform="translate(0 -1.5)"
          />
          <path
            d="M24 15.5l2.6 5.4 5.9.8-4.3 4.1 1.1 5.8L24 28.8l-5.3 2.8 1.1-5.8-4.3-4.1 5.9-.8z"
            fill="#ff5b24"
          />
        </svg>

        <div className="relative min-w-0">
          <p className="font-mono text-[9px] uppercase leading-none tracking-[0.14em] opacity-85">
            No. 0142 · Early access
          </p>
          <p className="mt-1.5 font-semibold text-[21px] leading-none tracking-[-0.02em] drop-shadow-[0_1px_0_rgba(120,20,0,0.3)]">
            Invite inside
          </p>
          <p className="mt-1.5 text-[11px] leading-none opacity-90">
            Peel from any corner
          </p>
        </div>

        <svg
          aria-hidden="true"
          className="absolute right-[22px] bottom-[14px] h-6 w-8 opacity-90"
          fill="none"
          viewBox="0 0 32 24"
        >
          <path
            d="M3 4c9 0 17 4 22 13"
            stroke="#fff"
            strokeDasharray="2.5 3"
            strokeLinecap="round"
            strokeWidth="1.6"
          />
          <path
            d="M20 16.5l5.4 1.6 1.2-5.6"
            stroke="#fff"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.6"
          />
        </svg>
      </div>
    </div>
  );
}

export function PeelStickerShowcase() {
  const [sound, setSound] = useState(true);
  const [peeled, setPeeled] = useState(false);
  const [copied, setCopied] = useState(false);
  const copyRef = useRef<HTMLButtonElement>(null);

  function handlePeeledChange(next: boolean) {
    // Keyboard users keep their place: move on to the code they uncovered.
    const hadFocus = document.activeElement?.closest("[data-peel-sticker]");
    setPeeled(next);

    if (next && hadFocus) {
      requestAnimationFrame(() => copyRef.current?.focus());
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(INVITE_CODE);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="w-full overflow-hidden rounded-[13px] border border-grayscale-3 bg-grayscale-1 small-shadow dark:border-grayscale-4 dark:bg-grayscale-3 dark:shadow-none">
      <div className="relative flex min-h-[460px] flex-col items-center justify-center overflow-hidden bg-grayscale-1 px-6 py-12 dark:bg-grayscale-2 max-[520px]:px-3">
        <div
          aria-hidden="true"
          className="absolute inset-0 opacity-[0.38]"
          style={stageGridStyle}
        />

        <button
          aria-label={sound ? "Mute peel sounds" : "Play peel sounds"}
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

        <div className="relative z-[1] w-[332px] max-w-full rounded-[22px] border border-grayscale-4 bg-grayscale-1 p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_-12px_rgba(0,0,0,0.12)] dark:border-grayscale-5 dark:bg-grayscale-3 dark:shadow-none">
          <div className="flex items-baseline justify-between px-1">
            <p className="font-mono text-[10px] text-grayscale-9 uppercase tracking-[0.12em]">
              Early access
            </p>
            <p className="font-mono text-[10px] text-grayscale-9 tabular-nums">
              1 of 1
            </p>
          </div>
          <h2 className="mt-2 px-1 font-medium text-grayscale-12 text-lg leading-6">
            You&rsquo;re on the list
          </h2>
          <p className="mt-0.5 px-1 text-grayscale-10 text-sm leading-5">
            Your invite code is sealed below. It works once.
          </p>

          <div className="relative mt-4 h-24 w-full">
            {/* Under the seal. */}
            <div
              aria-hidden={!peeled || undefined}
              className="absolute inset-0 flex items-center justify-between gap-3 rounded-[18px] border border-grayscale-6 border-dashed bg-grayscale-2 pr-3 pl-5 dark:bg-grayscale-2"
            >
              <div className="min-w-0">
                <p className="font-mono text-[9px] text-grayscale-9 uppercase tracking-[0.14em]">
                  Invite code
                </p>
                <p className="mt-1 truncate font-medium font-mono text-[19px] text-grayscale-12 tracking-[0.04em]">
                  {INVITE_CODE}
                </p>
              </div>
              <button
                aria-label={copied ? "Copied" : "Copy invite code"}
                className="flex size-9 shrink-0 items-center justify-center rounded-[10px] border border-grayscale-4 bg-grayscale-1 text-grayscale-11 transition-colors hover:bg-grayscale-3 hover:text-grayscale-12 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-grayscale-7 dark:bg-grayscale-3 dark:hover:bg-grayscale-4"
                onClick={copy}
                ref={copyRef}
                tabIndex={peeled ? 0 : -1}
                type="button"
              >
                {copied ? (
                  <CheckIcon size={15} weight="bold" />
                ) : (
                  <CopyIcon size={15} weight="bold" />
                )}
              </button>
            </div>

            <PeelSticker
              className="absolute inset-0"
              label="Peel the seal to reveal your invite code"
              onPeeledChange={handlePeeledChange}
              peeled={peeled}
              radius={18}
              sound={sound}
            >
              <InviteSealArt />
            </PeelSticker>
          </div>

          <div className="mt-3 flex h-7 items-center justify-between px-1">
            <p aria-live="polite" className="text-grayscale-9 text-xs">
              {peeled ? "Seal broken. Code revealed." : "Sealed"}
            </p>
            <button
              className={cn(
                "flex h-7 items-center gap-1.5 rounded-lg px-2 text-grayscale-10 text-xs transition-[color,background-color,opacity] hover:bg-grayscale-3 hover:text-grayscale-12 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-grayscale-7 dark:hover:bg-grayscale-4",
                !peeled && "pointer-events-none opacity-0",
              )}
              onClick={() => setPeeled(false)}
              tabIndex={peeled ? 0 : -1}
              type="button"
            >
              <ArrowCounterClockwiseIcon size={13} weight="bold" />
              Stick it back
            </button>
          </div>
        </div>

        <p className="relative z-[1] mt-8 text-center text-grayscale-9 text-xs">
          Peel a corner with a drag, or focus the seal and press Enter.
        </p>
      </div>
    </div>
  );
}
