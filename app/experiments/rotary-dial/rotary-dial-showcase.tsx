"use client";

import NumberFlow from "@number-flow/react";
import {
  ArrowClockwiseIcon,
  ChatCircleDotsIcon,
  CheckIcon,
  SpeakerHighIcon,
  SpeakerSlashIcon,
} from "@phosphor-icons/react/dist/ssr";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { RotaryDial } from "@/components/RotaryDial";
import { cn } from "@/helpers/classname-helper";

const CODE_LENGTH = 6;
const FIRST_CODE = [3, 0, 5, 1, 8, 2];
const SLOTS = ["a", "b", "c", "d", "e", "f"] as const;

const stageGridStyle = {
  backgroundImage:
    "linear-gradient(var(--color-grayscale-4) 1px, transparent 1px), linear-gradient(90deg, var(--color-grayscale-4) 1px, transparent 1px)",
  backgroundSize: "24px 24px",
  maskImage: "radial-gradient(circle at center, black, transparent 76%)",
};

type Status = "entering" | "verified" | "wrong";

function randomCode() {
  return Array.from({ length: CODE_LENGTH }, () =>
    Math.floor(Math.random() * 10),
  );
}

function formatCode(code: number[]) {
  return `${code.slice(0, 3).join("")} ${code.slice(3).join("")}`;
}

export function RotaryDialShowcase() {
  const shouldReduceMotion = useReducedMotion();
  const [sound, setSound] = useState(true);
  const [code, setCode] = useState(FIRST_CODE);
  const [digits, setDigits] = useState<number[]>([]);
  const [pulses, setPulses] = useState<number | null>(null);
  const [status, setStatus] = useState<Status>("entering");
  const [announcement, setAnnouncement] = useState("");
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (resetTimer.current) {
        clearTimeout(resetTimer.current);
      }
    },
    [],
  );

  function handleDial(digit: number) {
    setPulses(null);

    if (status !== "entering" || digits.length >= CODE_LENGTH) {
      return;
    }

    const next = [...digits, digit];
    setDigits(next);

    if (next.length < CODE_LENGTH) {
      setAnnouncement(`${digit}. ${next.length} of ${CODE_LENGTH}.`);
      return;
    }

    if (next.join("") === code.join("")) {
      setStatus("verified");
      setAnnouncement(`${digit}. Code verified.`);
      return;
    }

    setStatus("wrong");
    setAnnouncement(`${digit}. That code doesn't match. Try again.`);
    resetTimer.current = setTimeout(() => {
      setDigits([]);
      setStatus("entering");
    }, 1200);
  }

  function handleErase() {
    if (status === "entering") {
      setDigits((current) => current.slice(0, -1));
    }
  }

  function startOver() {
    setCode(randomCode());
    setDigits([]);
    setPulses(null);
    setStatus("entering");
    setAnnouncement("New code sent.");
  }

  return (
    <div className="w-full overflow-hidden rounded-[13px] border border-grayscale-3 bg-grayscale-1 small-shadow dark:border-grayscale-4 dark:bg-grayscale-3 dark:shadow-none">
      <div className="relative flex min-h-[620px] flex-col items-center justify-center overflow-hidden bg-grayscale-1 px-6 py-12 dark:bg-grayscale-2 max-[520px]:px-4">
        <div
          aria-hidden="true"
          className="absolute inset-0 opacity-[0.38]"
          style={stageGridStyle}
        />

        <button
          aria-label={sound ? "Mute the dial" : "Play the dial's sounds"}
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

        <div className="relative z-[1] flex w-full flex-col items-center">
          {/* The text message with the code in it. */}
          <div className="flex w-full max-w-[300px] items-start gap-2.5 rounded-xl border border-grayscale-4 bg-grayscale-1/90 p-3 shadow-[0_1px_2px_rgb(0_0_0_/_5%),0_6px_16px_rgb(0_0_0_/_5%)] backdrop-blur-sm dark:bg-grayscale-3/90">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-grayscale-12 text-grayscale-1">
              <ChatCircleDotsIcon size={15} weight="fill" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-medium text-grayscale-12 text-xs">
                  Messages
                </span>
                <span className="text-[10px] text-grayscale-9">now</span>
              </div>
              <p className="mt-0.5 text-grayscale-11 text-xs leading-5">
                Your dqnamo code is{" "}
                <span className="font-medium font-mono text-grayscale-12 tabular-nums">
                  {formatCode(code)}
                </span>
                . Dial it in.
              </p>
            </div>
          </div>

          {/* The code, a slot per digit. */}
          <motion.div
            animate={
              status === "wrong" && !shouldReduceMotion
                ? { x: [0, -9, 8, -6, 4, -2, 0] }
                : { x: 0 }
            }
            aria-label="Verification code"
            className="mt-7 flex items-center gap-1.5"
            role="group"
            transition={{ duration: 0.45, ease: "easeOut" }}
          >
            {SLOTS.map((slot, index) => {
              const value = digits[index];
              const filled = value !== undefined;
              const receiving =
                index === digits.length && pulses !== null && !filled;
              const current =
                index === digits.length && status === "entering" && !receiving;

              return (
                <div
                  className={cn(
                    "relative flex h-12 w-10 items-center justify-center rounded-[10px] border bg-grayscale-1 font-medium font-mono text-grayscale-12 text-xl tabular-nums transition-[border-color,background-color,color,box-shadow] duration-200 dark:bg-grayscale-3",
                    index === 3 && "ml-3",
                    status === "verified"
                      ? "border-[#3fa26b] bg-[#eef8f1] text-[#1d6b41] dark:border-[#3fa26b] dark:bg-[#15291d] dark:text-[#7fd3a1]"
                      : status === "wrong"
                        ? "border-[#e0533d] bg-[#fdf0ed] text-[#b3321f] dark:border-[#e0533d] dark:bg-[#2e1714] dark:text-[#ff9b88]"
                        : receiving
                          ? "border-[#ff8a3d] text-[#d9601a] shadow-[0_0_0_3px_rgb(255_138_61_/_18%)] dark:text-[#ffa266]"
                          : current
                            ? "border-grayscale-8"
                            : "border-grayscale-5 dark:border-grayscale-5",
                  )}
                  key={slot}
                  style={{
                    transitionDelay:
                      status === "verified" ? `${index * 45}ms` : undefined,
                  }}
                >
                  {filled || receiving ? (
                    <NumberFlow
                      aria-hidden="true"
                      trend={1}
                      value={filled ? value : (pulses ?? 0) % 10}
                    />
                  ) : current ? (
                    <span
                      aria-hidden="true"
                      className="h-5 w-px animate-pulse bg-grayscale-11 motion-reduce:animate-none"
                    />
                  ) : null}
                </div>
              );
            })}
          </motion.div>

          <p className="mt-2 h-4 font-medium font-mono text-[10px] text-grayscale-9 uppercase tracking-[0.06em]">
            {status === "verified" ? (
              <span className="inline-flex items-center gap-1 text-[#2f8a57] dark:text-[#7fd3a1]">
                <CheckIcon size={11} weight="bold" /> Verified
              </span>
            ) : status === "wrong" ? (
              <span className="text-[#c23c27] dark:text-[#ff9b88]">
                Not quite, try again
              </span>
            ) : pulses !== null ? (
              <span className="text-[#d9601a] dark:text-[#ffa266]">
                {pulses} {pulses === 1 ? "pulse" : "pulses"}
              </span>
            ) : (
              `${digits.length} of ${CODE_LENGTH}`
            )}
          </p>

          <RotaryDial
            cardNumber={formatCode(code)}
            className="mt-6"
            disabled={status !== "entering"}
            label="Rotary dial for the verification code"
            onDial={handleDial}
            onErase={handleErase}
            onPulse={(pulse) => setPulses(pulse)}
            size={272}
            sound={sound}
          />

          <div className="mt-8 flex h-8 items-center justify-center">
            {status === "verified" ? (
              <button
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-grayscale-4 bg-grayscale-1 px-3 font-medium text-grayscale-12 text-xs transition-colors hover:bg-grayscale-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-grayscale-7 dark:bg-grayscale-3 dark:hover:bg-grayscale-4"
                onClick={startOver}
                type="button"
              >
                <ArrowClockwiseIcon size={13} weight="bold" />
                Send a new code
              </button>
            ) : (
              <p className="max-w-[300px] text-balance text-center text-grayscale-9 text-xs">
                Pull a hole round to the stop and let go. Or focus the dial and
                type.
              </p>
            )}
          </div>
        </div>

        <span aria-live="polite" className="sr-only">
          {announcement}
        </span>
      </div>
    </div>
  );
}
