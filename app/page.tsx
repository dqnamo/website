import {
  HexagonIcon,
  MusicNotesSimpleIcon,
} from "@phosphor-icons/react/dist/ssr";
import Image from "next/image";
import Link from "next/link";
import { DqnamoPanel } from "@/components/DqnamoPanel";
import MobileHeader from "@/components/MobileHeader";
import Card from "@/components/public/Card";
import { NewExperimentCta } from "@/components/NewExperimentCta";
import { WorkWithMeCta } from "@/components/WorkWithMeCta";

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

        <div className="mt-16 flex flex-col gap-10 p-2">
          <WorkWithMeCta />

          <NewExperimentCta />
        </div>

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
              <div className="flex flex-col items-center justify-center size-8 overflow-hidden rounded-lg bg-white dark:bg-grayscale-5 border border-grayscale-3 dark:border-grayscale-6 small-shadow">
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
              <div className="flex flex-col items-center justify-center size-8 rounded-lg bg-white dark:bg-grayscale-5 border border-grayscale-3 dark:border-grayscale-6 small-shadow">
                <Image
                  src="/logos/hyperaide.svg"
                  alt=""
                  width={24}
                  height={24}
                  className="size-5 object-contain dark:invert"
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
