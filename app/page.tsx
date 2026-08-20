import Image from "next/image";
import Link from "next/link";
import { experimentCount } from "@/components/experiment-catalog";
import { ListCard } from "@/components/ListCard";
import { featuredListItems, listCount } from "@/components/list-catalog";
import { ExperimentPreview } from "@/components/NewExperimentCta";
import { PikaArrowRightIcon } from "@/components/PikaDockIcons";
import Button, { getButtonClassName } from "@/components/public/Button";

const kitchenExperiments = [
  {
    description:
      "A composable playing card, plus a fanned hand you can thumb through and play.",
    href: "/experiments/playing-cards",
    preview: "playing-cards",
    title: "Playing Cards",
  },
  {
    description:
      "A SaaS checkout state that prints a physical receipt when payment clears.",
    href: "/experiments/receipt-printer",
    preview: "receipt-printer",
    title: "Receipt Printer",
  },
  {
    description: "A button that smoothly resizes as its label animates.",
    href: "/experiments/dynamic-button",
    preview: "dynamic-button",
    title: "Dynamic Button",
  },
] as const;

export default function HomePage() {
  return (
    <main className="mx-auto max-w-4xl">
      <div className="p-4 sm:p-8">
        <header className="px-3">
          <h1 className="font-pirata font-bold text-4xl">
            <Link
              className="text-grayscale-12"
              href="/"
            >
              dqnamo
            </Link>
          </h1>
          <p className="font-medium text-grayscale-10 text-xs">JP</p>
          <p className="mt-8 max-w-md text-pretty font-sans text-sm text-grayscale-11">
            I run a digital studio in London. I like building aesthetically
            pleasing software. I&apos;m interested in prosumer productivity and
            developer tools.
          </p>
        </header>

        <div className="mt-8 grid grid-cols-1 gap-1.5 rounded-[16px] border border-grayscale-3 bg-grayscale-2 p-1.5 sm:grid-cols-2">
          <div className="group relative flex min-h-64 flex-col rounded-[13px] border border-grayscale-3 bg-white p-1 small-shadow transition-colors hover:border-grayscale-4 hover:bg-grayscale-2 dark:border-grayscale-4 dark:bg-grayscale-3 dark:shadow-none dark:hover:border-grayscale-5 dark:hover:bg-grayscale-4">
            <a
              aria-label="Visit The Interface Company of London"
              className="absolute inset-0 z-10 rounded-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-grayscale-7"
              href="https://interface.london"
              rel="noopener noreferrer"
              target="_blank"
            >
              <span className="sr-only">
                Visit The Interface Company of London
              </span>
            </a>
            <div className="flex items-center justify-center rounded-lg bg-grayscale-2 p-16 transition-colors group-hover:bg-grayscale-3 dark:bg-grayscale-2 dark:group-hover:bg-grayscale-3">
              <Image
                alt=""
                className="size-10 dark:invert"
                height={40}
                src="/logos/interface-logo-black.svg"
                width={40}
              />
            </div>
            <div className="flex flex-1 flex-col p-3">
              <h2 className="font-medium text-grayscale-12 text-sm">
                The Interface Company of London
              </h2>
              <p className="mt-px text-pretty text-grayscale-10 text-sm leading-5">
                Digital product design and engineering.
              </p>
            </div>
            <div className="relative z-20 p-1">
              <Button
                className="w-full justify-start border-b-2 text-left dark:border-grayscale-5 dark:bg-grayscale-4 dark:hover:border-grayscale-6 dark:hover:bg-grayscale-5"
                href="https://cal.com/interface.london/20min"
                rel="noopener noreferrer"
                target="_blank"
                variant="secondary"
              >
                Book a call
                <PikaArrowRightIcon
                  aria-hidden="true"
                  className="ml-auto"
                  size={14}
                />
              </Button>
            </div>
          </div>
          <Link
            className="group flex min-h-64 flex-col rounded-[13px] border border-grayscale-3 bg-white p-1 small-shadow transition-colors hover:border-grayscale-4 hover:bg-grayscale-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-grayscale-7 dark:border-grayscale-4 dark:bg-grayscale-3 dark:shadow-none dark:hover:border-grayscale-5 dark:hover:bg-grayscale-4"
            href="/kitchen"
          >
            <div className="flex items-center justify-center rounded-lg bg-grayscale-2 p-16 transition-colors group-hover:bg-grayscale-3 dark:bg-grayscale-2 dark:group-hover:bg-grayscale-3">
              <Image
                alt=""
                className="size-10 object-contain dark:invert"
                height={40}
                src="/logos/union.svg"
                width={40}
              />
            </div>
            <div className="flex flex-1 flex-col p-3">
              <h2 className="font-medium text-grayscale-12 text-sm">
                The Kitchen
              </h2>
              <p className="mt-px text-pretty text-grayscale-10 text-sm leading-5">
                Playful components and focused interface experiments.
              </p>
            </div>
            <div className="p-1">
              <span
                className={getButtonClassName({
                  className:
                    "w-full justify-start border-b-2 text-left dark:border-grayscale-5 dark:bg-grayscale-4 dark:hover:border-grayscale-6 dark:hover:bg-grayscale-5",
                  variant: "secondary",
                })}
              >
                View components
                <PikaArrowRightIcon
                  aria-hidden="true"
                  className="ml-auto"
                  size={14}
                />
              </span>
            </div>
          </Link>
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
        </div>

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

        <section className="mt-16">
          <div className="p-3">
            <h2 className="font-medium text-grayscale-12 text-sm">
              What&apos;s cooking in the kitchen
            </h2>
            <p className="mt-px text-pretty text-grayscale-10 text-sm leading-5">
              Fresh interaction patterns, component ideas, and visual
              experiments.
            </p>
          </div>
          <div className="mt-3 grid grid-cols-1 gap-1.5 rounded-[16px] border border-grayscale-3 bg-grayscale-2 p-1.5 sm:grid-cols-2 lg:grid-cols-3">
            {kitchenExperiments.map((experiment) => (
              <Link
                className="group flex min-h-64 flex-col overflow-hidden rounded-[13px] border border-grayscale-3 bg-white p-1 small-shadow transition-colors hover:border-grayscale-4 hover:bg-grayscale-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-grayscale-7 dark:border-grayscale-4 dark:bg-grayscale-3 dark:shadow-none dark:hover:border-grayscale-5 dark:hover:bg-grayscale-4"
                href={experiment.href}
                key={experiment.href}
              >
                <ExperimentPreview type={experiment.preview} />
                <div className="mt-auto flex flex-col px-2 pt-4 pb-2">
                  <h3 className="font-medium text-grayscale-12 text-sm">
                    {experiment.title}
                  </h3>
                  <p className="mt-2 text-pretty text-grayscale-10 text-xs leading-5">
                    {experiment.description}
                  </p>
                </div>
              </Link>
            ))}
            <Link
              className="group flex items-center gap-3 rounded-[13px] border border-grayscale-3 bg-white p-2 small-shadow transition-colors hover:border-grayscale-4 hover:bg-grayscale-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-grayscale-7 sm:col-span-2 lg:col-span-3 dark:border-grayscale-4 dark:bg-grayscale-3 dark:shadow-none dark:hover:border-grayscale-5 dark:hover:bg-grayscale-4"
              href="/kitchen"
            >
              <div className="flex h-6 min-w-6 shrink-0 items-center justify-center rounded-md border border-transparent bg-grayscale-12 px-1 font-medium text-[11px] text-grayscale-1 leading-none transition-colors dark:border-grayscale-5 dark:bg-grayscale-4 dark:text-grayscale-12 dark:group-hover:border-grayscale-6 dark:group-hover:bg-grayscale-5">
                {experimentCount}
              </div>
              <h3 className="min-w-0 font-medium text-grayscale-12 text-sm">
                View all components
              </h3>
              <PikaArrowRightIcon
                aria-hidden="true"
                className="ml-auto shrink-0 text-grayscale-9 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-grayscale-11"
                size={16}
              />
            </Link>
          </div>
        </section>

        <section className="mt-16">
          <div className="p-3">
            <h2 className="font-medium text-grayscale-12 text-sm">
              Products and tools I recommend
            </h2>
            <p className="mt-px text-pretty text-grayscale-10 text-sm leading-5">
              Software I use constantly and trust enough to pass on.
            </p>
          </div>
          <div className="mt-3 grid grid-cols-1 gap-1.5 rounded-[16px] border border-grayscale-3 bg-grayscale-2 p-1.5 sm:grid-cols-2 lg:grid-cols-3">
            {featuredListItems.map((item) => (
              <ListCard homepage item={item} key={item.href} />
            ))}
            <Link
              className="group flex items-center gap-3 rounded-[13px] border border-grayscale-3 bg-white p-2 small-shadow transition-colors hover:border-grayscale-4 hover:bg-grayscale-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-grayscale-7 sm:col-span-2 lg:col-span-3 dark:border-grayscale-4 dark:bg-grayscale-3 dark:shadow-none dark:hover:border-grayscale-5 dark:hover:bg-grayscale-4"
              href="/list"
            >
              <div className="flex h-6 min-w-6 shrink-0 items-center justify-center rounded-md border border-transparent bg-grayscale-12 px-1 font-medium text-[11px] text-grayscale-1 leading-none transition-colors dark:border-grayscale-5 dark:bg-grayscale-4 dark:text-grayscale-12 dark:group-hover:border-grayscale-6 dark:group-hover:bg-grayscale-5">
                {listCount}
              </div>
              <h3 className="min-w-0 font-medium text-grayscale-12 text-sm">
                View the full list
              </h3>
              <PikaArrowRightIcon
                aria-hidden="true"
                className="ml-auto shrink-0 text-grayscale-9 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-grayscale-11"
                size={16}
              />
            </Link>
          </div>
        </section>

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
