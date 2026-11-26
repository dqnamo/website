"use client";

import { GlobeSimpleIcon, PlayIcon } from "@phosphor-icons/react";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import Image from "next/image";
import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import { MentionText } from "@/components/PersonMention";
import { PikaArrowRightIcon, PikaGithubIcon } from "@/components/PikaDockIcons";
import { SaleBadge } from "@/components/SaleBadge";
import { cn } from "@/helpers/classname-helper";
import type {
  TimelineAvatar,
  TimelineEntry,
  TimelineGallery,
  TimelineGalleryRow,
  TimelineImage,
  TimelineLinkIcon,
  TimelineVideo,
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
  // Things I sold show as a "Sold" badge in place of their title.
  const sold = entry.kinds.includes("acquisition");

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
          entry.avatar ? "top-4" : sold ? "top-3.5" : "top-2.5",
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
        {sold ? (
          <h3 className="max-sm:pr-12">
            <SaleBadge
              className={cn(side === "left" && "sm:ml-auto")}
              label={entry.title}
            />
          </h3>
        ) : (
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
        )}
        {entry.meta ? (
          <p className="mt-0.5 text-grayscale-9 text-xs max-sm:pr-12">
            {entry.meta}
          </p>
        ) : null}
        {entry.description ? (
          <p className="mt-1 text-pretty text-grayscale-11 text-sm leading-5 max-sm:pr-12">
            <MentionText text={entry.description} />
          </p>
        ) : null}
        {entry.gallery ? (
          <Gallery
            images={entry.gallery}
            link={
              entry.href ? (
                <VisitLink
                  href={entry.href}
                  icon={entry.linkIcon}
                  label={entry.linkLabel}
                  title={entry.title}
                />
              ) : null
            }
            side={side}
          />
        ) : null}
        {entry.video ? <Video side={side} video={entry.video} /> : null}
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
 * pictures of different shapes pack together without cropping. Given rows
 * instead, each row's pictures share one height and split its width by shape.
 */
function Gallery({
  images,
  link,
  side,
}: {
  images: TimelineGallery;
  /** A button at the foot of the tray, under the pictures. */
  link?: ReactNode;
  side: "left" | "right";
}) {
  // The same nested cards as the lab's months: a grey tray holding white cards. Columns drop
  // a card's bottom margin at the end of a column, so the tray pads its own bottom.
  const tray = cn(
    "mt-3 max-w-sm rounded-[16px] border border-grayscale-3 bg-grayscale-2 p-1.5 text-left",
    side === "left" && "sm:ml-auto",
  );

  if (isRows(images)) {
    return (
      <div className={cn(tray, "flex flex-col gap-1.5")}>
        {images.map((row) => {
          const rowAspect = row.reduce((sum, item) => sum + aspect(item), 0);
          const sizes = (item: TimelineImage | TimelineImage[]) => {
            const share = aspect(item) / rowAspect;
            return `(min-width: 640px) ${Math.round(372 * share)}px, ${Math.round(84 * share)}vw`;
          };
          return (
            <div className="flex gap-1.5" key={rowKey(row)}>
              {row.map((item) =>
                Array.isArray(item) ? (
                  // Out of the flow, so the pictures beside it set the row's height and the stack
                  // splits it. Its basis takes off the room its extra cards and gaps need, so at
                  // that width each picture fits its share uncropped.
                  <div
                    className="relative min-w-0"
                    key={item.map((i) => i.src).join()}
                    style={{
                      flex: `${aspect(item)} 1 ${10 - (item.length - 1) * 17 * aspect(item)}px`,
                    }}
                  >
                    <div className="absolute inset-0 flex flex-col gap-1.5">
                      {item.map((image) => (
                        <GalleryCard
                          className="min-h-0"
                          fill
                          image={image}
                          key={image.src}
                          sizes={sizes(item)}
                          // Tall by shape from a base of the card's padding and borders (11px).
                          style={{ flex: `${1 / aspect(image)} 1 11px` }}
                        />
                      ))}
                    </div>
                  </div>
                ) : (
                  <GalleryCard
                    image={item}
                    key={item.src}
                    sizes={sizes(item)}
                    // Grow by shape from a base of the card's own padding and border (10px), so
                    // every picture in the row ends up the same height.
                    style={{ flex: `${aspect(item)} 1 10px` }}
                  />
                ),
              )}
            </div>
          );
        })}
        {link}
      </div>
    );
  }

  return (
    <div className={tray}>
      <div className="columns-2 gap-1.5">
        {images.map((image) => (
          <GalleryCard
            className="mb-1.5 break-inside-avoid"
            image={image}
            key={image.src}
            sizes="(min-width: 640px) 180px, 42vw"
          />
        ))}
      </div>
      {link}
    </div>
  );
}

/**
 * The same button as the lab's "View all components", pointing at the
 * entry's site: its address for the web, "View on GitHub" for repos.
 */
function VisitLink({
  href,
  icon,
  label,
  title,
}: {
  href: string;
  /** A bare logo, shown without the badge. */
  icon?: TimelineLinkIcon;
  label?: string;
  title: string;
}) {
  const internal = href.startsWith("/");
  const host = internal ? null : new URL(href).hostname.replace(/^www\./, "");
  const github = host === "github.com";
  const text =
    label ??
    (host === null
      ? `Open ${title}`
      : github
        ? "View on GitHub"
        : `Visit ${host}`);

  return (
    <a
      className="group flex items-center gap-2 rounded-[13px] border border-grayscale-4 border-b-2 bg-white p-2 transition-colors hover:border-grayscale-5 hover:bg-grayscale-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-grayscale-7 dark:bg-grayscale-3 dark:hover:bg-grayscale-4"
      href={href}
      {...(internal ? {} : { rel: "noopener noreferrer", target: "_blank" })}
    >
      {icon ? (
        <span className="flex size-5 shrink-0 items-center justify-center">
          <Image
            alt=""
            className={cn(
              "size-4 object-contain",
              icon.invertInDark && "dark:invert",
            )}
            height={16}
            src={icon.src}
            width={16}
          />
        </span>
      ) : (
        <span className="flex size-5 shrink-0 items-center justify-center rounded-md bg-grayscale-12 text-grayscale-1 dark:bg-grayscale-5 dark:text-grayscale-12">
          {github ? (
            <PikaGithubIcon aria-hidden="true" size={12} />
          ) : (
            <GlobeSimpleIcon aria-hidden="true" size={12} weight="bold" />
          )}
        </span>
      )}
      <span className="truncate font-medium text-grayscale-12 text-xs">
        {text}
      </span>
      <PikaArrowRightIcon
        aria-hidden="true"
        className="ml-auto shrink-0 text-grayscale-9 transition-transform duration-200 group-hover:translate-x-0.5"
        size={14}
      />
    </a>
  );
}

/** `fill` stretches the picture to whatever height the card is given, cropping to cover it. */
function GalleryCard({
  image,
  sizes,
  className,
  style,
  fill = false,
}: {
  image: TimelineImage;
  sizes: string;
  className?: string;
  style?: CSSProperties;
  fill?: boolean;
}) {
  return (
    <div
      className={cn(
        "min-w-0 rounded-[13px] border border-grayscale-4 border-b-2 bg-white p-1 dark:bg-grayscale-3",
        fill && "flex flex-col",
        className,
      )}
      style={style}
    >
      <div
        className={cn(
          "relative overflow-hidden rounded-[9px]",
          fill && "min-h-0 flex-1",
        )}
      >
        <Image
          alt={image.alt}
          className={cn(
            "block w-full",
            fill ? "h-full object-cover" : "h-auto",
          )}
          height={image.height}
          sizes={sizes}
          src={image.src}
          width={image.width}
        />
        {image.loop ? <GalleryLoop src={image.loop} /> : null}
      </div>
    </div>
  );
}

function isRows(images: TimelineGallery): images is TimelineGalleryRow[] {
  return Array.isArray(images[0]);
}

function rowKey(row: TimelineGalleryRow) {
  return row
    .flat()
    .map((i) => i.src)
    .join();
}

/** A stack's pictures share one width, so their heights add up. */
function aspect(item: TimelineImage | TimelineImage[]): number {
  if (Array.isArray(item)) {
    return 1 / item.reduce((sum, image) => sum + 1 / aspect(image), 0);
  }
  return item.width / item.height;
}

/**
 * A silent clip looping over a gallery picture. The picture shows until the
 * clip's first frame, then the clip fades in over it; people who turn off
 * motion keep the still. Playback starts after hydration rather than through
 * autoPlay, so the fade can't miss a "playing" event fired before React listened.
 */
function GalleryLoop({ src }: { src: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || window.matchMedia("(prefers-reduced-motion: reduce)").matches)
      return;
    // Browsers that block autoplay reject this, and the still simply stays.
    video.play().catch(() => {});
  }, []);

  return (
    <div
      aria-hidden="true"
      className={cn(
        "absolute inset-0 transition-opacity duration-700",
        playing ? "opacity-100" : "opacity-0",
      )}
    >
      <video
        className="size-full object-cover"
        loop
        muted
        onPlaying={() => setPlaying(true)}
        playsInline
        preload="metadata"
        ref={videoRef}
        src={src}
      />
    </div>
  );
}

/**
 * A YouTube clip in the same tray as a gallery. Only the thumbnail loads at
 * first; the player (privacy-enhanced, no cookies until it's played) swaps in
 * when it's clicked.
 */
function Video({
  video,
  side,
}: {
  video: TimelineVideo;
  side: "left" | "right";
}) {
  const [playing, setPlaying] = useState(false);

  return (
    <div
      className={cn(
        "mt-3 max-w-sm rounded-[16px] border border-grayscale-3 bg-grayscale-2 p-1.5 text-left",
        side === "left" && "sm:ml-auto",
      )}
    >
      <div className="rounded-[13px] border border-grayscale-4 border-b-2 bg-white p-1 dark:bg-grayscale-3">
        <div className="relative aspect-video overflow-hidden rounded-[9px] bg-black">
          {playing ? (
            <iframe
              allow="autoplay; encrypted-media; picture-in-picture"
              allowFullScreen
              className="absolute inset-0 size-full"
              src={`https://www.youtube-nocookie.com/embed/${video.youtubeId}?autoplay=1&rel=0`}
              title={video.title}
            />
          ) : (
            <button
              aria-label={`Play ${video.title}`}
              className="group/play absolute inset-0 flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-grayscale-7"
              onClick={() => setPlaying(true)}
              type="button"
            >
              <Image
                alt=""
                className="object-cover"
                fill
                sizes="(min-width: 640px) 372px, 84vw"
                src={video.thumbnail}
              />
              <span className="relative flex size-11 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm transition-transform duration-200 group-hover/play:scale-110">
                <PlayIcon className="translate-x-px" size={18} weight="fill" />
              </span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
