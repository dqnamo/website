import { ArrowRightIcon } from "@phosphor-icons/react/dist/ssr";
import Image from "next/image";
import Link from "next/link";
import Button from "@/components/public/Button";

export default function V2Page() {
  return (
    <main className="mx-auto max-w-4xl">
      <div className="p-8">
        <h1 className="font-pirata font-bold text-4xl">
          <Link
            className="text-grayscale-11 transition-colors hover:text-grayscale-12"
            href="/"
          >
            dqnamo
          </Link>
        </h1>
        <p className="font-medium text-grayscale-10 text-xs">JP</p>
        <p className="mt-8 max-w-md font-sans text-sm text-grayscale-11">
          I run a digital studio in London. I like building aesthteically
          pleasing software. Interested in prosumer productivity and developer
          tools.
        </p>

        <div className="mt-8 grid grid-cols-3 gap-1.5 rounded-[16px] border border-grayscale-3 bg-grayscale-2 p-1.5">
          <div className="flex min-h-64 flex-col rounded-[13px] border border-grayscale-3 bg-grayscale-1 p-1 small-shadow dark:border-grayscale-4 dark:bg-grayscale-3 dark:shadow-none">
            <div className="flex items-center justify-center rounded-lg bg-grayscale-2 p-16">
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
                The interface Company of London
              </h2>
              <p className="mt-px text-grayscale-10 text-sm leading-5">
                Digital product design and engineering.
              </p>
            </div>
            <div className="p-1">
              <Button
                className="w-full justify-start border-b-2 bg-white text-left dark:bg-white dark:text-black"
                href="https://cal.com/interface.london/20min"
                rel="noopener noreferrer"
                target="_blank"
                variant="secondary"
              >
                Book a call
                <ArrowRightIcon
                  aria-hidden="true"
                  className="ml-auto"
                  size={14}
                  weight="bold"
                />
              </Button>
            </div>
          </div>
          <div className="flex min-h-64 flex-col rounded-[13px] border border-grayscale-3 bg-grayscale-1 p-1 small-shadow dark:border-grayscale-4 dark:bg-grayscale-3 dark:shadow-none">
            <div className="flex items-center justify-center rounded-lg bg-grayscale-2 p-16">
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
              <p className="mt-px text-grayscale-10 text-sm leading-5">
                The place where I cook up cool niche components.
              </p>
            </div>
            <div className="p-1">
              <Button
                className="w-full justify-start border-b-2 bg-white text-left dark:bg-white dark:text-black"
                href="/#experiments"
                variant="secondary"
              >
                View components
                <ArrowRightIcon
                  aria-hidden="true"
                  className="ml-auto"
                  size={14}
                  weight="bold"
                />
              </Button>
            </div>
          </div>
          <div className="flex min-h-64 flex-col rounded-[13px] border border-grayscale-3 bg-grayscale-1 p-1 small-shadow dark:border-grayscale-4 dark:bg-grayscale-3 dark:shadow-none">
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
                <ArrowRightIcon
                  aria-hidden="true"
                  className="ml-auto"
                  size={14}
                  weight="bold"
                />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
