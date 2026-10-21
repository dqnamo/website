import type { Metadata } from "next";
import { Wordmark } from "@/components/Wordmark";
import { EssayList } from "./_components/EssayList";
import { essays } from "./_posts";

export const metadata: Metadata = {
  title: "Essays | dqnamo",
  description: "Notes on interface design, motion and craft by dqnamo.",
};

export default function EssaysPage() {
  return (
    <main className="mx-auto max-w-4xl">
      <div className="p-4 sm:p-8">
        <header className="px-3">
          <h1>
            <Wordmark />
          </h1>
          <p className="font-medium font-sans text-sm text-grayscale-10">
            Essays
          </p>
          <p className="mt-8 max-w-md text-pretty text-grayscale-10 text-sm leading-5">
            Notes on interface design, motion, and the small details that make
            software feel good to use.
          </p>
        </header>

        <div className="mt-12">
          <EssayList essays={essays} />
        </div>
      </div>
    </main>
  );
}
