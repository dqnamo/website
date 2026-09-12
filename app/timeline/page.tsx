import type { Metadata } from "next";
import Link from "next/link";
import Logo from "@/components/Logo";
import { Lifeline } from "@/components/lifeline";
import {
  LifelineFooter,
  LifelineNav,
  LifelineShell,
  LifelineStage,
} from "@/components/lifeline-shell";
import { ThemeToggle } from "@/components/ThemeToggle";
import { dqnamoLifeline } from "@/lib/dqnamo-lifeline";

export const metadata: Metadata = {
  title: "Timeline | dqnamo",
  description:
    "A timeline of the projects, experiments, and random things dqnamo has done since childhood.",
};

export default function TimelinePage() {
  return (
    <LifelineShell>
      <LifelineNav logo={<Logo />} logoLabel="Back to dqnamo.com">
        <div className="flex items-center gap-4">
          <Link
            className="font-mono text-xs text-zinc-500 transition-colors hover:text-black dark:hover:text-white"
            href="/"
          >
            Home
          </Link>
          <ThemeToggle />
        </div>
      </LifelineNav>

      <LifelineStage>
        <Lifeline
          birthYear={dqnamoLifeline.birthYear}
          className="h-full"
          markers={dqnamoLifeline.markers}
          mode="page"
          title="dqnamo's timeline"
        />
      </LifelineStage>

      <LifelineFooter>
        <p className="max-w-xl truncate text-xs text-zinc-500 sm:text-sm">
          random stuff i&apos;ve done since i was a kid. most of it is trash or
          a failure.
        </p>
        <p className="hidden shrink-0 font-mono text-[11px] uppercase tracking-wider text-zinc-400 sm:block">
          Scroll to explore
        </p>
      </LifelineFooter>
    </LifelineShell>
  );
}
