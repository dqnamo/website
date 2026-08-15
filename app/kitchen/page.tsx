import type { Metadata } from "next";
import Link from "next/link";
import { NewExperimentCta } from "@/components/NewExperimentCta";

export const metadata: Metadata = {
  title: "The Kitchen | dqnamo",
  description: "Component experiments and interface studies by dqnamo.",
};

export default function KitchenPage() {
  return (
    <main className="mx-auto max-w-4xl">
      <div className="p-8">
        <header className="px-3">
          <p className="font-pirata font-bold text-4xl">
            <Link
              className="text-grayscale-11 transition-colors hover:text-grayscale-12"
              href="/"
            >
              dqnamo
            </Link>
          </p>
          <p className="font-medium text-grayscale-10 text-xs">JP</p>
          <h1 className="mt-8 font-medium text-grayscale-12 text-sm">
            The Kitchen
          </h1>
          <p className="mt-px max-w-md text-grayscale-10 text-sm leading-5">
            Components, interface studies, and small experiments cooked up in
            the kitchen.
          </p>
        </header>

        <NewExperimentCta className="mt-12 [&>div:first-child]:hidden" />

        <footer className="mt-8 flex justify-end p-3">
          <p className="font-medium text-[11px] text-grayscale-8">
            Per gratiam Dei
          </p>
        </footer>
      </div>
    </main>
  );
}
