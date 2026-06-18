import type { Metadata } from "next";
import Link from "next/link";
import { ClipPathDemo } from "@/components/clip-demo/ClipPathDemo";
import { DqnamoPanel } from "@/components/DqnamoPanel";
import MobileHeader from "@/components/MobileHeader";

export const metadata: Metadata = {
  title: "Clip path demo | dqnamo",
  description: "A small polygon clip-path preview tool.",
};

export default function ClipDemoPage() {
  return (
    <main className="min-h-dvh w-full">
      <MobileHeader />
      <DqnamoPanel />

      <div className="mx-auto flex w-full max-w-6xl flex-col border-grayscale-3 border-x px-4 pt-[4.5rem] pb-8 dark:border-grayscale-2 md:px-8 lg:px-16">
        <div className="flex flex-col gap-3 py-8">
          <Link
            href="/"
            className="w-fit font-pirata text-2xl font-bold text-grayscale-12 transition-colors hover:text-grayscale-10"
          >
            dqnamo
          </Link>
          <div className="flex flex-col gap-1">
            <h1 className="font-medium text-grayscale-12 text-xl">
              Clip path demo
            </h1>
            <p className="max-w-xl text-grayscale-10 text-sm leading-6">
              Paste a CSS polygon and inspect the clipped box it creates.
            </p>
          </div>
        </div>

        <ClipPathDemo />
      </div>
    </main>
  );
}
