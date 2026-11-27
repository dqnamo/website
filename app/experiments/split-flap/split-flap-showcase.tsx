"use client";

import {
  ArrowUpIcon,
  SpeakerHighIcon,
  SpeakerSlashIcon,
  TrainIcon,
} from "@phosphor-icons/react/dist/ssr";
import { useReducedMotion } from "motion/react";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import {
  normalizeSplitFlapText,
  SplitFlap,
  unlockSplitFlapSound,
} from "@/components/SplitFlap";
import { cn } from "@/helpers/classname-helper";

const ROWS = 5;
const DESTINATION_LENGTH = 10;
const ADVANCE_EVERY = 9000;

const destinations = [
  "BRIGHTON",
  "CAMBRIDGE",
  "PARIS NORD",
  "EDINBURGH",
  "MARGATE",
  "BRUSSELS",
  "OXFORD",
  "BATH SPA",
  "CANTERBURY",
  "AMSTERDAM",
  "YORK",
  "CARDIFF",
] as const;

const ink = {
  boarding: "#8fdc97",
  delayed: "#f6b54a",
  normal: "#f2eee3",
} as const;

type Departure = {
  id: number;
  destination: string;
  minutes: number;
  platform: number;
  delayed: boolean;
};

function wobble(seed: number) {
  // Integer hash, so server and browser agree to the last bit.
  let hash = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b);
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0xc2b2ae35);
  hash ^= hash >>> 16;
  return (hash >>> 0) / 4294967296;
}

function createDeparture(
  id: number,
  afterMinutes: number,
  destination?: string,
): Departure {
  return {
    delayed: wobble(id + 3) > 0.78,
    destination: destination ?? destinations[id % destinations.length],
    id,
    minutes: afterMinutes + 4 + Math.round(wobble(id) * 9),
    platform: 1 + Math.floor(wobble(id + 11) * 14),
  };
}

function formatClock(totalMinutes: number) {
  const minutes = ((Math.round(totalMinutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(
    minutes % 60,
  ).padStart(2, "0")}`;
}

function minutesNow() {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

function remarkFor(departure: Departure, row: number) {
  if (row === 0) {
    return { ink: ink.boarding, text: "BOARDING" };
  }
  if (departure.delayed) {
    return {
      ink: ink.delayed,
      text: `EXP ${formatClock(departure.minutes + 6).slice(0, 5)}`,
    };
  }
  return { ink: ink.normal, text: "ON TIME" };
}

// Sized so five columns of drums fill the board on desktop, two on phones.
const rowTextClassName =
  "text-[clamp(13px,6.8cqw,40px)] @[520px]:text-[clamp(12px,3.95cqw,30px)]";

/** Matches the width of `cells` drums: 0.78em each plus a 0.07em gap. */
function ColumnLabel({
  cells,
  children,
  className,
}: {
  cells: number;
  children: string;
  className?: string;
}) {
  return (
    <span
      className={cn("shrink-0", className)}
      style={{ width: `${cells * 0.78 + (cells - 1) * 0.07}em` }}
    >
      <span className="block text-[clamp(7px,1.4cqw,10px)] tracking-[0.18em]">
        {children}
      </span>
    </span>
  );
}

function Screw({ className }: { className: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "absolute size-2 rounded-full bg-[radial-gradient(circle_at_35%_35%,#77756f,#2a2927_70%)] shadow-[0_1px_0_rgb(255_255_255_/_6%),inset_0_0_0_0.5px_rgb(0_0_0_/_60%)] before:absolute before:inset-x-[1.5px] before:top-1/2 before:h-px before:-translate-y-1/2 before:rotate-[35deg] before:bg-black/60",
        className,
      )}
    />
  );
}

export function SplitFlapShowcase() {
  const reduceMotion = useReducedMotion() ?? false;
  const [departures, setDepartures] = useState<Departure[]>([]);
  const [clock, setClock] = useState("--:--");
  const [draft, setDraft] = useState("");
  const [sound, setSound] = useState(false);
  const [cycle, setCycle] = useState(0);

  // Times depend on the visitor's clock, so the board boots blank on the
  // server and flips in once it knows what time it is.
  useEffect(() => {
    const start = minutesNow();
    const initial: Departure[] = [];
    let previous = start - 2;
    for (let id = 0; id < ROWS; id += 1) {
      const departure = createDeparture(id, previous);
      initial.push(departure);
      previous = departure.minutes;
    }
    setDepartures(initial);

    const tick = () => setClock(formatClock(minutesNow()));
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, []);

  const advance = useCallback((destination?: string) => {
    setDepartures((current) => {
      if (current.length === 0) {
        return current;
      }
      const last = current[current.length - 1];
      return [
        ...current.slice(1),
        createDeparture(last.id + 1, last.minutes, destination),
      ];
    });
    setCycle((value) => value + 1);
  }, []);

  // `cycle` restarts the countdown after every manual change.
  // biome-ignore lint/correctness/useExhaustiveDependencies: cycle is a reset signal
  useEffect(() => {
    if (reduceMotion || departures.length === 0) {
      return;
    }
    const timer = window.setTimeout(() => {
      if (document.visibilityState === "visible") {
        advance();
      } else {
        setCycle((value) => value + 1);
      }
    }, ADVANCE_EVERY);
    return () => window.clearTimeout(timer);
  }, [advance, cycle, departures.length, reduceMotion]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const destination = draft.trim();
    if (!destination) {
      return;
    }
    advance(destination);
    setDraft("");
  }

  function toggleSound() {
    unlockSplitFlapSound();
    setSound((value) => !value);
  }

  const boarding = departures[0];

  return (
    <div className="w-full overflow-hidden rounded-[13px] border border-grayscale-3 bg-grayscale-1 small-shadow dark:border-grayscale-4 dark:bg-grayscale-2 dark:shadow-none">
      <div className="flex flex-col items-center gap-6 px-4 py-10 sm:px-8 sm:py-14">
        <div className="@container w-full max-w-[720px]">
          <div className="relative rounded-[14px] bg-[linear-gradient(to_bottom,#232321,#151514)] p-[4.5cqw] pt-[3.4cqw] shadow-[0_1px_0_rgb(255_255_255_/_8%)_inset,0_0_0_1px_rgb(0_0_0_/_75%),0_2px_3px_rgb(0_0_0_/_12%),0_24px_48px_-16px_rgb(0_0_0_/_38%)] sm:p-[2.4cqw] sm:pt-[1.8cqw] dark:shadow-[0_1px_0_rgb(255_255_255_/_8%)_inset,0_0_0_1px_rgb(255_255_255_/_6%),0_24px_48px_-16px_rgb(0_0_0_/_70%)]">
            <Screw className="top-[5px] left-[5px] sm:top-2 sm:left-2" />
            <Screw className="top-[5px] right-[5px] sm:top-2 sm:right-2" />
            <Screw className="bottom-[5px] left-[5px] sm:bottom-2 sm:left-2" />
            <Screw className="right-[5px] bottom-[5px] sm:right-2 sm:bottom-2" />

            <div className="flex items-center justify-between gap-4 px-[1cqw] pb-[2cqw]">
              <div className="flex items-center gap-2 text-[#f2eee3]">
                <span className="grid size-[clamp(18px,3.6cqw,26px)] place-items-center rounded-[5px] bg-[#f6b54a] text-[#151514]">
                  <TrainIcon
                    aria-hidden="true"
                    className="size-[65%]"
                    weight="fill"
                  />
                </span>
                <span className="font-mono font-semibold text-[clamp(9px,1.8cqw,12px)] uppercase tracking-[0.22em]">
                  Departures
                </span>
              </div>
              <SplitFlap
                aria-hidden
                className="text-[clamp(14px,3.6cqw,22px)]"
                flipDuration={60}
                sound={sound}
                value={clock}
              />
              <span className="sr-only">Board clock {clock}</span>
            </div>

            <div
              aria-hidden="true"
              className={cn(
                "flex gap-[1.6cqw] px-[1cqw] pb-[1cqw] font-mono font-semibold text-[#8c8a82] uppercase",
                rowTextClassName,
              )}
            >
              <ColumnLabel cells={5}>Time</ColumnLabel>
              <ColumnLabel cells={DESTINATION_LENGTH}>Destination</ColumnLabel>
              <ColumnLabel cells={2} className="hidden @[520px]:block">
                Plat
              </ColumnLabel>
              <ColumnLabel cells={9} className="hidden @[520px]:block">
                Remarks
              </ColumnLabel>
            </div>

            <ol
              aria-label="Departures"
              className="flex flex-col gap-[0.9cqw] rounded-[8px] bg-black/45 p-[1cqw] shadow-[inset_0_1px_3px_rgb(0_0_0_/_70%),0_1px_0_rgb(255_255_255_/_6%)]"
            >
              {Array.from({ length: ROWS }, (_, row) => {
                const departure = departures[row];
                const remark = departure
                  ? remarkFor(departure, row)
                  : { ink: ink.normal, text: "" };
                const delay = row * 90;
                const rowSound = sound && row === 0;

                return (
                  <li
                    className={cn(
                      "flex items-center gap-[1.6cqw]",
                      rowTextClassName,
                    )}
                    // Rows are fixed slots on the board; trains move through them.
                    // biome-ignore lint/suspicious/noArrayIndexKey: positional rows
                    key={row}
                  >
                    <SplitFlap
                      delay={delay}
                      length={5}
                      sound={rowSound}
                      value={departure ? formatClock(departure.minutes) : ""}
                    />
                    <SplitFlap
                      delay={delay + 60}
                      length={DESTINATION_LENGTH}
                      sound={rowSound}
                      value={departure?.destination ?? ""}
                    />
                    <SplitFlap
                      align="right"
                      className="hidden @[520px]:inline-flex"
                      delay={delay + 120}
                      length={2}
                      sound={rowSound}
                      value={departure ? String(departure.platform) : ""}
                    />
                    <SplitFlap
                      className="hidden @[520px]:inline-flex"
                      delay={delay + 160}
                      ink={remark.ink}
                      length={9}
                      sound={rowSound}
                      value={remark.text}
                    />
                  </li>
                );
              })}
            </ol>
          </div>
        </div>

        <p aria-live="polite" className="sr-only">
          {boarding
            ? `Now boarding: the ${formatClock(boarding.minutes)} to ${boarding.destination.trim()}, platform ${boarding.platform}.`
            : ""}
        </p>

        <div className="flex w-full max-w-[720px] flex-col items-stretch gap-2 sm:flex-row sm:items-center">
          <form
            className="flex min-w-0 flex-1 items-center gap-1 rounded-[11px] border border-grayscale-4 border-b-2 bg-white p-1 focus-within:border-grayscale-6 dark:border-grayscale-5 dark:bg-grayscale-3"
            onSubmit={submit}
          >
            <label className="sr-only" htmlFor="split-flap-destination">
              Add a destination to the board
            </label>
            <input
              autoComplete="off"
              className="h-8 min-w-0 flex-1 bg-transparent px-2 font-medium text-grayscale-12 text-sm uppercase tracking-[0.06em] outline-none placeholder:normal-case placeholder:tracking-normal placeholder:text-grayscale-9"
              id="split-flap-destination"
              maxLength={DESTINATION_LENGTH}
              onChange={(event) =>
                setDraft(
                  normalizeSplitFlapText(event.target.value).replace(/^ +/, ""),
                )
              }
              placeholder="Where to?"
              spellCheck={false}
              value={draft}
            />
            <span
              aria-hidden="true"
              className="px-1 font-mono text-[11px] text-grayscale-9 tabular-nums"
            >
              {draft.length}/{DESTINATION_LENGTH}
            </span>
            <button
              className="flex h-8 cursor-pointer items-center gap-1.5 rounded-lg bg-grayscale-12 px-3 font-medium text-grayscale-1 text-xs transition-[transform,opacity] duration-150 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)] active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40 dark:bg-grayscale-11 motion-reduce:transition-none"
              disabled={!draft.trim()}
              type="submit"
            >
              <ArrowUpIcon aria-hidden="true" size={13} weight="bold" />
              Post
            </button>
          </form>

          <div className="flex gap-2">
            <button
              className="flex h-[42px] flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-[11px] border border-grayscale-4 border-b-2 bg-white px-3 font-medium text-grayscale-11 text-xs transition-[background-color,border-color,transform] duration-150 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)] hover:border-grayscale-5 hover:bg-grayscale-2 active:scale-[0.97] dark:border-grayscale-5 dark:bg-grayscale-3 dark:hover:bg-grayscale-4 motion-reduce:transition-none"
              onClick={() => advance()}
              type="button"
            >
              Next train
            </button>
            <button
              aria-label={sound ? "Mute flap sound" : "Play flap sound"}
              aria-pressed={sound}
              className="grid h-[42px] w-[42px] shrink-0 cursor-pointer place-items-center rounded-[11px] border border-grayscale-4 border-b-2 bg-white text-grayscale-11 transition-[background-color,border-color,transform] duration-150 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)] hover:border-grayscale-5 hover:bg-grayscale-2 active:scale-[0.97] aria-pressed:text-grayscale-12 dark:border-grayscale-5 dark:bg-grayscale-3 dark:hover:bg-grayscale-4 motion-reduce:transition-none"
              onClick={toggleSound}
              type="button"
            >
              {sound ? (
                <SpeakerHighIcon aria-hidden="true" size={16} weight="fill" />
              ) : (
                <SpeakerSlashIcon aria-hidden="true" size={16} weight="fill" />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
