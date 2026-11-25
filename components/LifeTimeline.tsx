"use client";

import { AnimatePresence, MotionConfig, motion } from "motion/react";
import Image from "next/image";
import { type ReactNode, useState } from "react";
import { cn } from "@/helpers/classname-helper";
import type {
  TimelineAvatar,
  TimelineEntry,
  TimelineImage,
  TimelineYear,
} from "@/lib/life-timeline";

// Quick out, gentle settle: the timeline closes up without drawing attention to itself.
const transition = { duration: 0.4, ease: [0.23, 1, 0.32, 1] } as const;

// The two directions mirror each other. Condensing: what's going leaves quickly, then the rest
// closes up. Expanding: the rest opens up first, then what's arriving fades into the gap.
const fade = {
  initial: { opacity: 0, scale: 0.98 },
  animate: {
    opacity: 1,
    scale: 1,
    transition: { ...transition, delay: 0.15, duration: 0.3 },
  },
  exit: { opacity: 0, scale: 0.98, transition: { duration: 0.15 } },
};

// Rich entries stay mounted while hidden (they can be heavy to rebuild), fading with the same
// timing.
const persistentVisibility = {
  shown: fade.animate,
  hidden: fade.exit,
};

/**
 * A vertical timeline with the rail down the middle and entries
 * alternating left and right of it. On small screens the rail moves
 * to the left edge and every entry sits to its right.
 *
 * `isVisible` narrows what's shown. When it changes, entries that leave
 * fade out and the ones that stay glide into their new places, so the
 * timeline condenses and expands smoothly. Entries with rich `content`
 * are hidden rather than removed, so they never have to be rebuilt.
 */
export function LifeTimeline({
  className,
  years,
  isVisible = () => true,
}: {
  className?: string;
  years: TimelineYear[];
  isVisible?: (entry: TimelineEntry) => boolean;
}) {
  const rows = flattenRows(years, isVisible);

  return (
    <MotionConfig reducedMotion="user" transition={transition}>
      <div className={cn("relative", className)}>
        <div
          aria-hidden="true"
          className="absolute inset-y-0 left-[7px] w-px bg-grayscale-4 sm:left-1/2 sm:-translate-x-1/2"
        />

        {/* One flat list, so every row moves in the same frame of reference and
            nothing slides over anything else while the timeline condenses. */}
        <ol className="relative">
          <AnimatePresence initial={false} mode="popLayout">
            {rows.map((row) => {
              if (row.type === "year") {
                return (
                  <motion.li
                    // Sticks while its year scrolls by; the next year's badge slides over it.
                    // Only the badge takes clicks, so entries underneath stay usable.
                    className="pointer-events-none sticky -top-6 z-10 flex pt-10 pb-6 sm:justify-center"
                    key={row.key}
                    layout="position"
                    {...fade}
                  >
                    <span className="pointer-events-auto rounded-full border border-grayscale-4 border-b-2 bg-white px-2.5 py-0.5 font-medium text-grayscale-12 text-xs tabular-nums dark:bg-grayscale-3">
                      {row.year}
                    </span>
                  </motion.li>
                );
              }

              if (row.entry.terminal) {
                return (
                  <motion.li
                    className="relative flex flex-col items-start sm:items-center"
                    key={row.key}
                    layout="position"
                    {...fade}
                  >
                    <span
                      aria-hidden="true"
                      className="relative ml-[4.5px] size-1.5 rounded-full bg-grayscale-4 sm:ml-0"
                    />
                    {/* Just the dot on screen; the row ends with it, so the line does too. */}
                    <h3 className="sr-only">{row.entry.title}</h3>
                  </motion.li>
                );
              }

              const className = cn(
                "relative pl-8 sm:grid sm:grid-cols-2 sm:gap-x-16 sm:pl-0",
                row.followsEntry && "mt-8",
                // On wide screens, entries tuck up beside the one before, unless that
                // one is only a title and there's nothing to tuck beside.
                row.tucks && "sm:-mt-4",
              );

              if (row.entry.content) {
                return (
                  <PersistentRow
                    className={className}
                    hidden={row.hidden}
                    key={row.key}
                  >
                    <TimelineItem entry={row.entry} side={row.side} />
                  </PersistentRow>
                );
              }

              return (
                <motion.li
                  className={className}
                  key={row.key}
                  layout="position"
                  {...fade}
                >
                  <TimelineItem entry={row.entry} side={row.side} />
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ol>
      </div>
    </MotionConfig>
  );
}

/**
 * A row that is hidden rather than removed. It leaves the flow the moment it's hidden (like an
 * exiting row), so the rows around it glide straight away, then drops out of the page once it
 * has faded. Showing it puts it back in the flow in the same render, so the rows make room for
 * it before it fades in.
 */
function PersistentRow({
  children,
  className,
  hidden,
}: {
  children: ReactNode;
  className: string;
  hidden: boolean;
}) {
  const [faded, setFaded] = useState(hidden);
  if (!hidden && faded) setFaded(false);

  return (
    <motion.li
      animate={hidden ? "hidden" : "shown"}
      aria-hidden={hidden || undefined}
      className={cn(
        className,
        hidden && "pointer-events-none absolute inset-x-0",
        // Important, so it wins over the row's own display (like sm:grid).
        hidden && faded && "hidden!",
      )}
      inert={hidden || undefined}
      initial={false}
      layout="position"
      onAnimationComplete={() => {
        if (hidden) setFaded(true);
      }}
      variants={persistentVisibility}
    >
      {children}
    </motion.li>
  );
}

type Row =
  | { type: "year"; key: string; year: number }
  | {
      type: "entry";
      key: string;
      entry: TimelineEntry;
      hidden: boolean;
      side: "left" | "right";
      followsEntry: boolean;
      tucks: boolean;
    };

function flattenRows(
  years: TimelineYear[],
  isVisible: (entry: TimelineEntry) => boolean,
): Row[] {
  const rows: Row[] = [];
  let entryIndex = 0;

  for (const year of years) {
    if (year.entries.some(isVisible)) {
      rows.push({ type: "year", key: `year-${year.year}`, year: year.year });
    }

    // Sides and spacing follow only what's visible, so the zig-zag holds up under any filter.
    let previous: TimelineEntry | undefined;
    for (const entry of year.entries) {
      const key = entry.id ?? `${year.year}-${entry.title}`;

      if (isVisible(entry)) {
        rows.push({
          type: "entry",
          key,
          entry,
          hidden: false,
          // The start of the line sits on the rail, so it doesn't take a side.
          side: entry.terminal
            ? "left"
            : entryIndex++ % 2 === 0
              ? "left"
              : "right",
          followsEntry: previous !== undefined,
          tucks: Boolean(previous?.description || previous?.content),
        });
        previous = entry;
      } else if (entry.content) {
        rows.push({
          type: "entry",
          key,
          entry,
          hidden: true,
          side: "left",
          followsEntry: false,
          tucks: false,
        });
      }
    }
  }

  return rows;
}

function TimelineItem({
  entry,
  side,
}: {
  entry: TimelineEntry;
  side: "left" | "right";
}) {
  return (
    <>
      <span
        aria-hidden="true"
        className={cn(
          // A short tick off the rail, pointing at the entry.
          "absolute left-2 h-px w-4 bg-grayscale-7",
          side === "left"
            ? "sm:right-1/2 sm:left-auto sm:w-5"
            : "sm:left-1/2 sm:w-5",
          // Level with the middle of the avatar when there is one, else with the title.
          entry.avatar ? "top-4" : "top-2.5",
        )}
      />

      <div
        className={
          side === "left" ? "sm:col-start-1 sm:text-right" : "sm:col-start-2"
        }
      >
        {entry.avatar ? (
          <Avatar
            avatar={entry.avatar}
            className={cn("mb-2", side === "left" && "sm:ml-auto")}
          />
        ) : null}
        <h3 className="font-medium text-grayscale-12 text-sm max-sm:pr-12">
          {entry.href ? (
            <a
              className="underline decoration-grayscale-6 underline-offset-2 transition-colors hover:decoration-grayscale-10"
              href={entry.href}
              // Pages on this site open in place; everything else in a new tab.
              {...(entry.href.startsWith("/")
                ? {}
                : { rel: "noopener noreferrer", target: "_blank" })}
            >
              {entry.title}
            </a>
          ) : (
            entry.title
          )}
        </h3>
        {entry.meta ? (
          <p className="mt-0.5 text-grayscale-9 text-xs max-sm:pr-12">
            {entry.meta}
          </p>
        ) : null}
        {entry.description ? (
          <p className="mt-1 text-pretty text-grayscale-11 text-sm leading-5 max-sm:pr-12">
            {entry.description}
          </p>
        ) : null}
        {entry.gallery ? <Gallery images={entry.gallery} side={side} /> : null}
        {entry.content ? (
          <div
            className={cn(
              "mt-3 flex text-left",
              side === "left" && "sm:justify-end",
            )}
          >
            {entry.content}
          </div>
        ) : null}
      </div>
    </>
  );
}

function Avatar({
  avatar,
  className,
}: {
  avatar: TimelineAvatar;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex size-8 items-center justify-center overflow-hidden rounded-lg border",
        avatar.unknown
          ? "border-grayscale-12 bg-grayscale-12 dark:border-black dark:bg-black"
          : "border-grayscale-4 bg-white dark:bg-grayscale-3",
        className,
      )}
    >
      {avatar.src ? (
        <Image
          alt=""
          className={cn(
            avatar.padded
              ? "size-4 object-contain dark:invert"
              : "size-full object-cover",
            avatar.invertInDark && "dark:invert",
          )}
          height={32}
          src={avatar.src}
          width={32}
        />
      ) : avatar.unknown ? (
        <span className="font-medium text-sm text-white">?</span>
      ) : (
        <span className="font-medium text-[11px] text-grayscale-11">
          {avatar.initials}
        </span>
      )}
    </span>
  );
}

/**
 * A small masonry grid: two columns that each fill top to bottom, so
 * pictures of different shapes pack together without cropping.
 */
function Gallery({
  images,
  side,
}: {
  images: TimelineImage[];
  side: "left" | "right";
}) {
  // The same nested cards as the kitchen's months: a grey tray holding white cards. Columns drop
  // a card's bottom margin at the end of a column, so the tray pads its own bottom.
  return (
    <div
      className={cn(
        "mt-3 max-w-sm columns-2 gap-1.5 rounded-[16px] border border-grayscale-3 bg-grayscale-2 p-1.5 text-left",
        side === "left" && "sm:ml-auto",
      )}
    >
      {images.map((image) => (
        <div
          className="mb-1.5 break-inside-avoid rounded-[13px] border border-grayscale-4 border-b-2 bg-white p-1 dark:bg-grayscale-3"
          key={image.src}
        >
          <Image
            alt={image.alt}
            className="block h-auto w-full rounded-[9px]"
            height={image.height}
            sizes="(min-width: 640px) 180px, 42vw"
            src={image.src}
            width={image.width}
          />
        </div>
      ))}
    </div>
  );
}
