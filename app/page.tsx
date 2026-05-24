import {
  HexagonIcon,
  MusicNotesSimpleIcon,
} from "@phosphor-icons/react/dist/ssr";
import Image from "next/image";
import Link from "next/link";
import { DqnamoPanel } from "@/components/DqnamoPanel";
import MobileHeader from "@/components/MobileHeader";
import Button from "@/components/public/Button";
import Card from "@/components/public/Card";
import { GameOfLife } from "@/components/random/GameOfLife";
import { cn } from "@/helpers/classname-helper";

function SlotCard({
  available = false,
  className,
}: {
  available?: boolean;
  className?: string;
}) {
  return (
    <Card
      layer={1}
      className={cn(
        "small-shadow relative flex aspect-square min-w-0 flex-col items-center justify-center overflow-hidden rounded-lg border border-grayscale-3 bg-grayscale-1 p-5",
        className,
      )}
    >
      <GameOfLife
        aria-hidden
        cellSize={14}
        density={0.24}
        fadeDuration={520}
        maxOpacity={1}
        stepInterval={520}
        className="absolute inset-0 [--game-of-life-color:var(--color-grayscale-3)] dark:[--game-of-life-color:var(--color-grayscale-4)]"
      />
      <div className="relative z-10 flex flex-col items-center justify-center gap-4">
        {/*<div className="flex size-8 flex-col items-center justify-center rounded-lg border border-grayscale-3 bg-white dark:bg-grayscale-2 small-shadow backdrop-blur-sm">
          <DiamondsFourIcon className="text-grayscale-10" weight="fill" />
        </div>*/}
        {available ? (
          <div className="flex items-center gap-3 rounded-full border border-grayscale-4 bg-white p-1 pl-3 small-shadow backdrop-blur-sm dark:bg-grayscale-4 dark:border-grayscale-5">
            <p className="text-xs font-medium text-grayscale-11">
              <span className="text-green-9 mr-0.5">$</span>10,000
            </p>
            <Button
              href="https://buy.stripe.com/dRm14o7Sxg31cqj8BY4ow08"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full px-2.5 border-b-1 py-1 text-xs"
              variant="primary"
            >
              Book
            </Button>
          </div>
        ) : (
          <p className="rounded-full border border-grayscale-4 bg-white px-2.5 py-1 text-xs font-medium text-grayscale-10 small-shadow backdrop-blur-sm dark:bg-grayscale-4 dark:border-grayscale-5">
            Slot Taken
          </p>
        )}
      </div>
    </Card>
  );
}

export default function Home() {
  return (
    <main className="flex w-full flex-col divide-y divide-grayscale-3 dark:divide-grayscale-2">
      <MobileHeader />
      <DqnamoPanel />

      <div className="relative mx-auto max-w-4xl flex w-full flex-col border-x border-grayscale-3 p-4 pt-[4.5rem] dark:border-grayscale-2 md:p-8 lg:p-16">
        <div className="flex flex-col gap-px p-2">
          {/*<div className="flex aspect-square w-8 shrink-0 flex-col items-center justify-center overflow-hidden rounded-md border border-grayscale-3 bg-grayscale-1 dark:border-grayscale-4 dark:bg-grayscale-3">
            <HexagonIcon size={20} weight="fill" className="text-accent-9" />
          </div>*/}
          <div className="mt-3 flex flex-row items-center gap-1">
            <h1 className="font-pirata text-4xl font-bold  text-grayscale-12">
              dqnamo
            </h1>
          </div>
          <p className="max-w-md text-balance text-sm leading-6 text-grayscale-11">
            Design Engineer. London. Exploring user interfaces, prosumer
            productivity apps and developer tools.
          </p>
        </div>

        <div className="mt-16 flex flex-col gap-px p-2">
          <h2 className="font-medium text-grayscale-11 text-sm">
            Fractional Design Engineering
          </h2>
          <p className="max-w-xl text-balance text-sm text-grayscale-10">
            I take on a small number of design engineering projects each month.
          </p>
        </div>

        <Card
          layer={0}
          className="mt-4 grid w-full grid-cols-2 gap-1.5 rounded-xl border border-grayscale-3 bg-grayscale-2 p-1.5 sm:grid-cols-3"
        >
          <SlotCard />
          <SlotCard />
          <SlotCard
            available
            className="col-span-2 aspect-[2/1] sm:col-span-1 sm:aspect-square"
          />
        </Card>

        <div className="mt-16 flex flex-col gap-px p-2">
          <h2 className="font-medium text-grayscale-11 text-sm">Projects</h2>
          <p className="max-w-xl text-balance text-sm text-grayscale-10">
            Selected tools and products I am building, maintaining, or
            exploring.
          </p>
        </div>

        <Card
          layer={0}
          className="mt-4 grid w-full grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3"
        >
          <Link href="https://chord.so" target="_blank">
            <Card layer={1} hoverable className="h-full">
              <div className="flex flex-col items-center justify-center size-8 rounded-lg bg-white dark:bg-grayscale-5 border border-grayscale-3 dark:border-grayscale-6 small-shadow">
                <MusicNotesSimpleIcon weight="bold" className="text-teal-9" />
                {/* <ChordLogo /> */}
              </div>

              <p className="text-grayscale-11 text-sm font-medium mt-3">
                Chord
              </p>
              <p className="text-grayscale-10 text-xs font-medium text-pretty">
                An opinionated design language and UI Library for building
                beautiful web applications.
              </p>
            </Card>
          </Link>
          <Link href="https://base.dqnamo.com" target="_blank">
            <Card layer={1} hoverable>
              <div className="flex flex-col items-center justify-center size-8 rounded-lg bg-white dark:bg-grayscale-5 border border-grayscale-3 dark:border-grayscale-6 small-shadow">
                <HexagonIcon weight="fill" className="text-blue-9" />
              </div>
              <p className="text-grayscale-11 text-sm font-medium mt-3">Base</p>
              <p className="text-grayscale-10 text-xs font-medium text-pretty">
                Fullstack react template for building beautiful, super fast,
                local first web applications
              </p>
            </Card>
          </Link>
          <Link href="https://factoryplane.com" target="_blank">
            <Card layer={1} hoverable className="h-full">
              <div className="flex flex-col items-center justify-center size-8 overflow-hidden rounded-lg bg-white border border-grayscale-3 dark:border-grayscale-6 small-shadow">
                <Image
                  src="/logos/factoryplane.svg"
                  alt=""
                  width={24}
                  height={24}
                  className="size-6"
                />
              </div>
              <p className="text-grayscale-11 text-sm font-medium mt-3">
                FactoryPlane
              </p>
              <p className="text-grayscale-10 text-xs font-medium text-pretty">
                Open source, collaborative software factory running in the cloud
                using your existing coding agents.
              </p>
            </Card>
          </Link>
          <Link href="https://hyperaide.com" target="_blank">
            <Card layer={1} hoverable className="h-full">
              <div className="flex flex-col items-center justify-center size-8 rounded-lg bg-white border border-grayscale-3 dark:border-grayscale-6 small-shadow">
                <Image
                  src="/logos/hyperaide.svg"
                  alt=""
                  width={24}
                  height={24}
                  className="size-5 object-contain"
                />
              </div>
              <p className="text-grayscale-11 text-sm font-medium mt-3">
                Hyperaide
              </p>
              <p className="text-grayscale-10 text-xs font-medium text-pretty">
                Single threaded personal assistant with infinite memory.
              </p>
            </Card>
          </Link>
          <Link href="https://growdoro.com" target="_blank">
            <Card layer={1} hoverable className="h-full">
              <div className="flex flex-col items-center overflow-hidden justify-center size-8 rounded-lg bg-white dark:bg-grayscale-5 border border-grayscale-3 dark:border-grayscale-6 small-shadow">
                <p className="text-grass-9 text-sm font-semibold">G</p>
              </div>
              <div className="flex flex-col mt-auto">
                <p className="text-grayscale-11 text-sm font-medium mt-3">
                  Growdoro
                </p>
                <p className="text-grayscale-10 text-xs font-medium text-pretty">
                  gamified focus timer where you can grow an infinite garden.
                </p>
              </div>
            </Card>
          </Link>
        </Card>
      </div>
    </main>
  );
}
