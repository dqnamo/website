import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { MoonStarsIcon } from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { ThemeToggle } from "@/components/ThemeToggle";
import { WorkWithMeCta } from "@/components/WorkWithMeCta";
import { tokenize } from "@/helpers/syntax";
import { AnimatedSparkChartShowcase } from "./animated-spark-chart-showcase";
import { usageSource } from "./copy-content";
import { SourcePanel } from "./source-panel";

export const metadata: Metadata = {
  title: "Animated spark chart | dqnamo",
  description:
    "A compact SVG sparkline that animates between trend states and adapts its color to the data.",
};

export default async function AnimatedSparkChartPage() {
  const componentSource = await readFile(
    join(process.cwd(), "components/Sparkline.tsx"),
    "utf-8",
  );
  const [componentLines, usageLines] = await Promise.all([
    tokenize(componentSource, "tsx"),
    tokenize(usageSource, "tsx"),
  ]);

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
              experiments / animated-spark-chart
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
            Animated Spark Chart
          </h1>
          <p className="max-w-2xl text-balance text-grayscale-11 text-sm leading-6">
            A compact SVG sparkline that draws itself, morphs between trend
            states, and shifts color for positive or negative movement.
          </p>
        </div>

        <section className="flex flex-col items-center justify-center gap-1.5 rounded-[16px] border border-grayscale-3 bg-grayscale-2 p-1.5 dark:border-grayscale-4">
          <AnimatedSparkChartShowcase />
          <div className="w-full overflow-hidden rounded-[13px] border border-grayscale-3 bg-grayscale-1 small-shadow dark:border-grayscale-4 dark:bg-grayscale-3 dark:shadow-none">
            <SourcePanel
              componentLines={componentLines}
              componentSource={componentSource}
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
