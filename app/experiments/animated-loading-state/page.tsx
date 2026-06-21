import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { MoonStarsIcon } from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { ThemeToggle } from "@/components/ThemeToggle";
import { WorkWithMeCta } from "@/components/WorkWithMeCta";
import { tokenize } from "@/helpers/syntax";
import { AnimatedLoadingState } from "./animated-loading-state";
import {
  buildMarkdown,
  installCommand,
  PACKAGE_NAME,
  usageSource,
} from "./copy-content";
import { PackageActions } from "./package-actions";
import { SourcePanel } from "./source-panel";

export const metadata: Metadata = {
  title: "Animated loading state | dqnamo",
  description:
    "A Game of Life loading state that resolves into an animated graph.",
};

export default async function AnimatedLoadingStatePage() {
  const [packageSource, readmeSource, packageJsonSource] = await Promise.all([
    readFile(
      join(process.cwd(), "packages/game-of-life-animation/src/index.tsx"),
      "utf-8",
    ),
    readFile(
      join(process.cwd(), "packages/game-of-life-animation/README.md"),
      "utf-8",
    ),
    readFile(
      join(process.cwd(), "packages/game-of-life-animation/package.json"),
      "utf-8",
    ),
  ]);
  const [usageLines, packageSourceLines, readmeLines, packageJsonLines] =
    await Promise.all([
      tokenize(usageSource, "tsx"),
      tokenize(packageSource, "tsx"),
      tokenize(readmeSource, "markdown"),
      tokenize(packageJsonSource, "json"),
    ]);
  const markdown = buildMarkdown(packageSource);

  return (
    <main className="w-full bg-grayscale-1">
      <div className="mx-auto flex w-full max-w-4xl flex-col border-grayscale-3 border-x px-4 pb-16 dark:border-grayscale-2 md:px-8 lg:px-16">
        <div className="flex flex-row items-center justify-between px-2">
          <div className="flex flex-col gap-1.5 py-10">
            <Link
              className="w-max font-pirata font-bold text-2xl text-grayscale-11 transition-colors duration-200 hover:text-grayscale-12"
              href="/"
            >
              dqnamo
            </Link>
            <span className="font-mono font-semibold text-[10px] text-grayscale-10 uppercase leading-none">
              experiments / animated-loading-state
            </span>
          </div>
          <div className="flex items-center gap-1.5 rounded-full bg-grayscale-3 p-1 text-grayscale-10">
            <MoonStarsIcon
              aria-hidden="true"
              className="text-grayscale-10"
              size={16}
              weight="fill"
            />
            <ThemeToggle size={16} />
          </div>
        </div>

        <div className="flex flex-col gap-px px-2 py-8">
          <h1 className="font-medium text-grayscale-12 text-md">
            Animated Loading State
          </h1>
          <p className="text-balance text-grayscale-11 text-sm leading-6">
            A Conway-inspired loading state that keeps the empty wait active,
            then resolves into a compact graph when the data is ready.
          </p>
        </div>

        <section className="flex flex-col gap-1.5 rounded-[16px] border border-grayscale-3 bg-grayscale-2 p-1.5 dark:border-grayscale-4">
          <AnimatedLoadingState />
        </section>

        <section className="mt-8 flex flex-col gap-1.5 rounded-[16px] border border-grayscale-3 bg-grayscale-2 p-1.5 dark:border-grayscale-4">
          <div className="rounded-[13px] border border-grayscale-3 bg-grayscale-1 p-5 small-shadow dark:border-grayscale-4 dark:bg-grayscale-3 dark:shadow-none">
            <div className="flex flex-col gap-px">
              <p className="font-mono font-semibold text-[10px] text-grayscale-10 uppercase leading-none">
                npm package
              </p>
              <h2 className="mt-2 font-medium text-grayscale-12 text-sm">
                {PACKAGE_NAME}
              </h2>
              <p className="mt-1 max-w-xl text-grayscale-10 text-sm leading-6">
                The loading animation now lives as a package-ready React canvas
                component with typed props, deterministic seeding, reduced
                motion support, and a buildable npm manifest.
              </p>
            </div>

            <div className="mt-4 flex min-w-0 items-center rounded-lg border border-grayscale-3 bg-white px-3 py-2 dark:border-grayscale-5 dark:bg-grayscale-2">
              <code className="min-w-0 truncate font-mono text-grayscale-11 text-xs">
                {installCommand}
              </code>
            </div>

            <PackageActions
              installCommand={installCommand}
              markdown={markdown}
              usageSource={usageSource}
            />
          </div>

          <div className="w-full overflow-hidden rounded-[13px] border border-grayscale-3 bg-grayscale-1 small-shadow dark:border-grayscale-4 dark:bg-grayscale-3 dark:shadow-none">
            <SourcePanel
              packageJsonLines={packageJsonLines}
              packageJsonSource={packageJsonSource}
              packageSource={packageSource}
              packageSourceLines={packageSourceLines}
              readmeLines={readmeLines}
              readmeSource={readmeSource}
              usageLines={usageLines}
              usageSource={usageSource}
            />
          </div>
        </section>

        <WorkWithMeCta className="my-16" />
      </div>
    </main>
  );
}
