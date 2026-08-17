import type { Metadata } from "next";
import Link from "next/link";
import { ListGrid } from "@/components/ListCard";
import { listItems } from "@/components/list-catalog";

export const metadata: Metadata = {
  title: "List | dqnamo",
  description: "Products and tools recommended by dqnamo.",
};

export default function ListPage() {
  return (
    <main className="mx-auto max-w-4xl">
      <div className="p-8">
        <header className="px-3">
          <p className="font-pirata text-base text-grayscale-11">
            <Link
              className="transition-colors hover:text-grayscale-12"
              href="/"
            >
              dqnamo&apos;s
            </Link>
          </p>
          <h1 className="font-bold font-mono text-3xl text-grayscale-12 uppercase">
            List
          </h1>
          <p className="mt-8 max-w-md text-pretty text-grayscale-10 text-sm leading-5">
            Products and tools I use constantly and trust enough to pass on.
          </p>
        </header>

        <div className="mt-12">
          <ListGrid items={listItems} />
        </div>
      </div>
    </main>
  );
}
