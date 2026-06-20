import type { Metadata } from "next";
import Link from "next/link";
import { DqnamoPanel } from "@/components/DqnamoPanel";
import { TubeMapEditor } from "./tube-map-editor";

export const metadata: Metadata = {
  title: "Tube map demo | dqnamo",
  description: "A manual London tube map editor built with React Flow.",
};

export default function TubeDemoPage() {
  return (
    <main className="min-h-dvh w-full bg-grayscale-1">
      <DqnamoPanel />

      <div className="mx-auto flex w-full max-w-7xl flex-col border-grayscale-3 border-x px-4 pb-6 dark:border-grayscale-2 md:px-8 lg:px-10">
        <div className="flex flex-col gap-3 py-8">
          <Link
            href="/"
            className="w-fit font-pirata text-2xl font-bold text-grayscale-12 transition-colors hover:text-grayscale-10"
          >
            dqnamo
          </Link>
          <div className="flex flex-col gap-1">
            <h1 className="font-medium text-grayscale-12 text-xl">
              Tube map demo
            </h1>
            <p className="max-w-xl text-grayscale-10 text-sm leading-6">
              A small canvas for sketching station nodes and coloured line
              connections.
            </p>
          </div>
        </div>

        <TubeMapEditor />
      </div>
    </main>
  );
}
