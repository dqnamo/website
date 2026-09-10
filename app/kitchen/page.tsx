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
          <h1 className="font-pirata font-bold text-4xl" data-recording-hide="">
            <Link className="text-grayscale-12" href="/">
              dqnamo&apos;s
            </Link>
          </h1>
          <p
            className="font-medium font-sans text-sm text-grayscale-10"
            data-recording-hide=""
          >
            Kitchen
          </p>
          <p className="mt-8 max-w-md text-pretty text-grayscale-10 text-sm leading-5">
            Components, interface studies, and small experiments cooked up in
            the kitchen.
          </p>
        </header>

        <NewExperimentCta className="mt-12 [&>div:first-child]:hidden" />
      </div>
    </main>
  );
}
