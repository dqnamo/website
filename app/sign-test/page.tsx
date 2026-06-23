import { MoonStarsIcon } from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { ThemeToggle } from "@/components/ThemeToggle";
import { SignatureDoodler } from "./signature-doodler";

export const metadata: Metadata = {
  title: "Signature test | dqnamo",
  description: "Draw a signature and export the SVG path data.",
};

export default function SignTestPage() {
  return (
    <main className="w-full bg-grayscale-1">
      <div className="mx-auto flex w-full max-w-5xl flex-col border-grayscale-3 border-x px-4 pb-16 dark:border-grayscale-2 md:px-8 lg:px-16">
        <div className="flex flex-row items-center justify-between px-2">
          <div className="flex flex-col gap-1.5 py-10">
            <Link
              className="w-max font-pirata font-bold text-2xl text-grayscale-11 transition-colors duration-200 hover:text-grayscale-12"
              href="/"
            >
              dqnamo
            </Link>
            <span className="font-mono font-semibold text-[10px] text-grayscale-10 uppercase leading-none">
              tools / sign-test
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
          <h1 className="font-medium text-grayscale-12 text-md">Sign Test</h1>
          <p className="text-balance text-grayscale-11 text-sm leading-6">
            Draw a signature, then copy the SVG path into the signature
            component.
          </p>
        </div>

        <SignatureDoodler />
      </div>
    </main>
  );
}
