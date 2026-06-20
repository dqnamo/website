import { ArrowRightIcon } from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";
import { Arvo } from "next/font/google";
import Link from "next/link";
import { DqnamoPanel } from "@/components/DqnamoPanel";
import { IridescentFoil } from "@/components/IridescentFoil";

const arvo = Arvo({
  subsets: ["latin"],
  weight: ["400", "700"],
});

export const metadata: Metadata = {
  title: "Sticker demo | dqnamo",
  description: "A scroll and pointer reactive iridescent sticker demo.",
};

export default function StickerDemoPage() {
  return (
    <main className="min-h-[180dvh] w-full bg-grayscale-1">
      <DqnamoPanel />

      <Link
        href="/"
        className="fixed top-4 left-4 z-20 font-pirata font-bold text-2xl text-grayscale-12 transition-colors hover:text-grayscale-10 md:left-8 lg:left-16"
      >
        dqnamo
      </Link>

      <section className="sticky top-0 flex h-dvh w-full items-center justify-center px-6">
        <IridescentFoil
          aria-label="Interactive iridescent foil sticker"
          className="w-72 h-40 rounded-xl shadow-sm group cursor-pointer"
          role="img"
          scrollProgressMode="document"
        >
          <div className="flex flex-col h-full">
            <div className="flex p-3 items-center justify-start">
              <p className="font-semibold text-[10px]  leading-none text-grayscale-8 uppercase font-mono">
                A product by
              </p>
            </div>
            <div
              className={`${arvo.className} flex h-full w-full gap-px flex-col items-center justify-center text-center text-grayscale-12 uppercase leading-none`}
            >
              <span className="font-medium text-xs leading-none text-grayscale-9 group-hover:text-grayscale-11 transition-colors duration-200 mb-px">
                THE
              </span>
              <span className="font-medium text-xl leading-none text-grayscale-11 group-hover:text-grayscale-12 transition-colors duration-200">
                INTERFACE
              </span>
              <span className="font-medium text-xl leading-none text-grayscale-11 group-hover:text-grayscale-12 transition-colors duration-200">
                COMPANY
              </span>
              <span className="font-medium text-xs leading-none text-grayscale-9 group-hover:text-grayscale-11 transition-colors duration-200 mt-px">
                OF LONDON
              </span>
            </div>
            {/* <p className="font-semibold text-[10px] text-end leading-none text-grayscale-7 uppercase mb-px font-mono p-4">Certified</p> */}
            <div className="flex p-3 items-center justify-end">
              <div className="size-5 rounded-full bg-grayscale-7/30 flex items-center group-hover:bg-blue-9 justify-center transition-colors duration-200">
                <ArrowRightIcon
                  className="size-3 text-grayscale-11 group-hover:text-grayscale-1 transition-colors duration-200"
                  weight="bold"
                />
              </div>
            </div>
          </div>
        </IridescentFoil>
      </section>
    </main>
  );
}
