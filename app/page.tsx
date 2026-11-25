import type { ReactNode } from "react";
import { FilterableTimeline } from "@/components/FilterableTimeline";
import { kitchenTimelineEntries } from "@/components/KitchenTimelineMonths";
import { Wordmark } from "@/components/Wordmark";
import { lifeTimeline, withExtraEntries } from "@/lib/life-timeline";

// The kitchen's components sit among everything else, by the month they were made.
const timelineYears = withExtraEntries(lifeTimeline, kitchenTimelineEntries());

export default function HomePage() {
  return (
    <main className="mx-auto max-w-4xl">
      <div className="p-4 sm:p-8">
        <header className="flex flex-col items-start px-3 sm:items-center sm:text-center">
          <h1>
            <Wordmark />
          </h1>
        </header>

        <section className="mt-8">
          <p className="max-w-xl px-3 text-balance text-grayscale-11 text-sm leading-6 sm:mx-auto sm:text-center">
            People call me{" "}
            <span className="font-medium text-grayscale-12">JP</span>. They say
            I&apos;m a design engineer. I just like making things. I freelance
            via{" "}
            <BrandLink
              href="https://interface.london"
              mark={<InterfaceMark className={brandMarkClassName} />}
              name="The Interface Company of London"
            />
            . I&apos;m building my agentic development environment at{" "}
            <BrandLink
              href="https://sheepdog.build"
              mark={<SheepdogMark className={brandMarkClassName} />}
              name="Sheepdog"
            />
            .
          </p>
          <FilterableTimeline years={timelineYears} />
        </section>

        {/* <div className="flex min-h-64 flex-col rounded-[13px] border border-grayscale-3 bg-grayscale-1 p-1 small-shadow dark:border-grayscale-4 dark:bg-grayscale-3 dark:shadow-none">
          <div className="flex items-center justify-center rounded-lg bg-grayscale-2 p-16">
            <Image
              alt=""
              className="size-10 object-contain dark:invert"
              height={40}
              src="/logos/hyperaide.svg"
              width={40}
            />
          </div>
          <div className="flex flex-1 flex-col p-3">
            <h2 className="font-medium text-grayscale-12 text-sm">
              Hyperaide
            </h2>
            <p className="mt-px text-grayscale-10 text-sm leading-5">
              Single threaded personal assistant with infinite memory.
            </p>
          </div>
          <div className="p-1">
            <Button
              className="w-full justify-start border-b-2 bg-white text-left dark:bg-white dark:text-black"
              href="https://hyperaide.com"
              rel="noopener noreferrer"
              target="_blank"
              variant="secondary"
            >
              Learn more
              <PikaArrowRightIcon
                aria-hidden="true"
                className="ml-auto"
                size={14}
              />
            </Button>
          </div>
        </div> */}

        {/* <section className="mt-16">
          <div className="p-3">
            <h2 className="font-medium text-grayscale-12 text-sm">
              Pro bono publico
            </h2>
            <p className="mt-px text-grayscale-10 text-sm leading-5">
              Design and engineering work for projects that serve the public
              good.
            </p>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-1.5 rounded-[16px] border border-grayscale-3 bg-grayscale-2 p-1.5">
            <a
              className="grid min-h-64 grid-cols-2 rounded-[13px] border border-grayscale-3 bg-grayscale-1 p-1 small-shadow transition-colors hover:border-grayscale-4 dark:border-grayscale-4 dark:bg-grayscale-3 dark:shadow-none dark:hover:border-grayscale-5"
              href="https://saintdex.vercel.app"
              rel="noopener noreferrer"
              target="_blank"
            >
              <div className="relative min-h-0 overflow-hidden rounded-lg bg-grayscale-2">
                <Image
                  alt="Saintdex app preview"
                  className="object-cover"
                  fill
                  sizes="(min-width: 896px) 200px, 25vw"
                  src="https://saintdex.vercel.app/hero.jpeg"
                />
              </div>
              <div className="flex flex-col justify-end p-3">
                <h3 className="font-medium text-grayscale-12 text-sm">
                  Saintdex
                </h3>
                <p className="mt-px text-grayscale-10 text-sm leading-5">
                  A Catholic saint index for discovering saints and their
                  stories.
                </p>
              </div>
            </a>

            <div className="grid min-h-64 grid-cols-2 rounded-[13px] border border-grayscale-3 bg-grayscale-1 p-1 small-shadow dark:border-grayscale-4 dark:bg-grayscale-3 dark:shadow-none">
              <div className="rounded-lg bg-grayscale-2" />
              <div className="flex flex-col justify-end p-3">
                <h3 className="font-medium text-grayscale-12 text-sm">
                  Polaris
                </h3>
                <p className="mt-px text-grayscale-10 text-sm leading-5">
                  A recovery companion for overcoming pornography addiction.
                </p>
              </div>
            </div>
          </div>
        </section> */}

        {/* <section className="mt-16">
          <div className="p-3">
            <h2 className="font-medium text-grayscale-12 text-sm">
              Other projects
            </h2>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-1.5 rounded-[16px] border border-grayscale-3 bg-grayscale-2 p-1.5">
            <a
              className="flex min-h-40 flex-col rounded-[13px] border border-grayscale-3 bg-grayscale-1 p-4 small-shadow transition-colors hover:border-grayscale-4 hover:bg-grayscale-2 dark:border-grayscale-4 dark:bg-grayscale-3 dark:shadow-none dark:hover:border-grayscale-6 dark:hover:bg-grayscale-4"
              href="https://chord.so"
              rel="noopener noreferrer"
              target="_blank"
            >
              <div className="flex size-8 items-center justify-center rounded-lg border border-grayscale-3 bg-white small-shadow dark:border-grayscale-6 dark:bg-grayscale-5">
                <MusicNotesSimpleIcon
                  aria-hidden="true"
                  className="text-teal-9"
                  weight="bold"
                />
              </div>
              <h3 className="mt-3 font-medium text-grayscale-12 text-sm">
                Chord
              </h3>
              <p className="mt-px max-w-sm text-pretty text-grayscale-10 text-xs leading-5">
                An opinionated design language and UI library for building
                beautiful web applications.
              </p>
            </a>

            <a
              className="flex min-h-40 flex-col rounded-[13px] border border-grayscale-3 bg-grayscale-1 p-4 small-shadow transition-colors hover:border-grayscale-4 hover:bg-grayscale-2 dark:border-grayscale-4 dark:bg-grayscale-3 dark:shadow-none dark:hover:border-grayscale-6 dark:hover:bg-grayscale-4"
              href="https://growdoro.com"
              rel="noopener noreferrer"
              target="_blank"
            >
              <div className="flex size-8 items-center justify-center rounded-lg border border-grayscale-3 bg-white small-shadow dark:border-grayscale-6 dark:bg-grayscale-5">
                <span className="font-semibold text-grass-9 text-sm">G</span>
              </div>
              <h3 className="mt-3 font-medium text-grayscale-12 text-sm">
                Growdoro
              </h3>
              <p className="mt-px max-w-sm text-pretty text-grayscale-10 text-xs leading-5">
                A gamified focus timer where you can grow an infinite garden.
              </p>
            </a>
          </div>
        </section> */}
      </div>
    </main>
  );
}

function InterfaceMark({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="currentColor"
      viewBox="0 0 390 390"
    >
      <path d="M390 260H263V390H0V0H390V260ZM390 390H268.646C274.065 362.814 284.682 331.358 305.5 312.5C338.96 282.189 375.829 267.065 390 262.002V390ZM263 78C263 78 263 169 220.5 207.5C178 246 130 260 130 260H263V78Z" />
    </svg>
  );
}

const brandMarkClassName = "mr-1 inline-block size-3 align-[-1px]";

// Same underline as the timeline's links.
const brandHighlightClassName =
  "underline decoration-grayscale-6 underline-offset-2 transition-colors group-hover:decoration-grayscale-10";

/**
 * A company name with its mark in front. The mark sits outside the
 * underline and is held to the first word, so it never wraps away from
 * the name.
 */
function BrandLink({
  href,
  mark,
  name,
}: {
  href: string;
  mark: ReactNode;
  name: string;
}) {
  const [first, ...rest] = name.split(" ");

  return (
    <a
      className="group text-grayscale-12"
      href={href}
      rel="noopener noreferrer"
      target="_blank"
    >
      <span className="whitespace-nowrap">
        {mark}
        <span className={brandHighlightClassName}>{first}</span>
      </span>
      {rest.length > 0 ? (
        <span className={brandHighlightClassName}>{` ${rest.join(" ")}`}</span>
      ) : null}
    </a>
  );
}

function SheepdogMark({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="currentColor"
      viewBox="-65.5 0 1629 1629"
    >
      <path d="M584 44.2139C686.102 -14.7351 811.898 -14.7357 914 44.2129L1333 286.125C1435.11 345.074 1498 454.016 1498 571.913V1056.36C1498 1174.26 1435.11 1283.2 1333 1342.15L914 1584.06C811.898 1643.01 686.102 1643.01 584 1584.06L309.407 1425.53L324.918 1383.01C363.358 1277.63 457.374 1202.5 568.635 1188.25L974.944 1136.2C1105.95 1119.42 1210.57 1018.94 1232.62 888.713L1255.12 755.797C1260.29 725.282 1236.77 697.45 1205.82 697.45H897L787.881 593.886C750.718 558.615 701.436 538.95 650.2 538.95H264.023C232.817 538.95 203.399 553.519 184.484 578.341L0 820.442V571.913C0 454.016 62.8972 345.074 164.999 286.125L584 44.2139ZM248.932 709.12C260.41 693.632 285 701.75 285 721.028V1121.95C285 1166.13 249.183 1201.95 205 1201.95H84.5C40.3172 1201.95 4.5 1166.13 4.5 1121.95V1045.554C4.5 1041.266 5.8785 1037.091 8.43164 1033.646L248.932 709.12Z" />
    </svg>
  );
}
