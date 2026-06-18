import { ArrowRightIcon, MoonStarsIcon } from "@phosphor-icons/react/dist/ssr";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Arvo } from "next/font/google";
import { IridescentFoil } from "@/components/IridescentFoil";
import { ThemeToggle } from "@/components/ThemeToggle";
import MobileHeader from "@/components/MobileHeader";
import { tokenize } from "@/helpers/syntax";
import Link from "next/link";
import { buildAgentPrompt, buildMarkdown } from "./copy-content";
import { CopyActions } from "./copy-actions";
import { SourcePanel } from "./source-panel";
import { WorkWithMeCta } from "@/components/WorkWithMeCta";

const arvo = Arvo({
  subsets: ["latin"],
  weight: ["400", "700"],
});

export default async function IridescentFoilPage() {
  const [tsxSource, cssSource] = await Promise.all([
    readFile(join(process.cwd(), "components/IridescentFoil.tsx"), "utf-8"),
    readFile(
      join(process.cwd(), "components/IridescentFoil.module.css"),
      "utf-8",
    ),
  ]);
  const [tsxLines, cssLines] = await Promise.all([
    tokenize(tsxSource, "tsx"),
    tokenize(cssSource, "css"),
  ]);
  const agentPrompt = buildAgentPrompt(tsxSource, cssSource);
  const markdown = buildMarkdown(tsxSource, cssSource);

  return (
    <main className=" w-full bg-grayscale-1">
      <MobileHeader />
      <div className="mx-auto flex w-full max-w-4xl flex-col border-grayscale-3 border-x px-4 dark:border-grayscale-2 md:px-8 lg:px-16">
        <div className="flex flex-row justify-between items-center px-2">
          <div className="flex flex-col  gap-1.5 py-10">
            <Link href="/" className="font-pirata w-max font-bold text-2xl text-grayscale-11 hover:text-grayscale-12 transition-colors duration-200">
              dqnamo
            </Link>
            <span className="font-mono font-semibold text-[10px] text-grayscale-10 uppercase leading-none">
            experiments / iridescent-foil
            </span>
          </div>
          <div className="flex items-center gap-1.5 p-1 text-grayscale-10 bg-grayscale-3 rounded-full">
            <MoonStarsIcon
              aria-hidden="true"
              className="text-grayscale-10"
              size={16}
              weight="fill"
            />
            {/* <p className="text-grayscale-10 text-[11px] leading-none font-mono font-semibold uppercase">Dark Mode</p> */}
            <ThemeToggle size={16} />
          </div>
        </div>

        <div className="py-8 px-2 flex flex-col gap-px">
          <h1 className="font-medium text-grayscale-12 text-md">
            Iridescent Foil
          </h1>
          <p className="text-grayscale-11 text-sm leading-6 text-balance">
            Holographic foil built from layered CSS gradients. Scroll the page and move your pointer to shift the
            iridescent colour and specular glare across the sticker.
          </p>
          <CopyActions agentPrompt={agentPrompt} markdown={markdown} />
        </div>

        <section className="flex flex-col gap-1.5 items-center justify-center bg-grayscale-2 rounded-[20px] p-1.5 border border-grayscale-3">
          <div className="w-full p-28 flex items-center justify-center bg-grayscale-1 dark:bg-grayscale-2 dark:border-transparent dark:shadow-none rounded-[17px] small-shadow border border-grayscale-3">
            <IridescentFoil
              aria-label="Interactive iridescent foil sticker"
              className="group h-40 w-72 cursor-pointer rounded-xl shadow-sm"
              role="img"
              scrollProgressMode="document"
            >
              <div className="flex h-full flex-col">
                <div className="flex items-center justify-start p-3">
                  <p className="font-mono font-semibold text-[10px] text-grayscale-8 uppercase leading-none">
                    A product by
                  </p>
                </div>
                <div
                  className={`${arvo.className} flex h-full w-full flex-col items-center justify-center gap-px text-center text-grayscale-12 uppercase leading-none`}
                >
                  <span className="mb-px font-medium text-grayscale-9 text-xs leading-none transition-colors duration-200 group-hover:text-grayscale-11">
                    THE
                  </span>
                  <span className="font-medium text-grayscale-11 text-xl leading-none transition-colors duration-200 group-hover:text-grayscale-12">
                    INTERFACE
                  </span>
                  <span className="font-medium text-grayscale-11 text-xl leading-none transition-colors duration-200 group-hover:text-grayscale-12">
                    COMPANY
                  </span>
                  <span className="mt-px font-medium text-grayscale-9 text-xs leading-none transition-colors duration-200 group-hover:text-grayscale-11">
                    OF LONDON
                  </span>
                </div>
                <div className="flex items-center justify-end p-3">
                  <div className="flex size-5 items-center justify-center rounded-full bg-grayscale-7/30 transition-colors duration-200 group-hover:bg-blue-9">
                    <ArrowRightIcon
                      className="size-3 text-grayscale-11 transition-colors duration-200 dark:group-hover:text-grayscale-12 group-hover:text-grayscale-1"
                      weight="bold"
                    />
                  </div>
                </div>
              </div>
            </IridescentFoil>
          </div>
          <div className="w-full overflow-hidden bg-grayscale-1 dark:bg-grayscale-3 dark:border-grayscale-4 rounded-[17px] small-shadow border border-grayscale-3">
            <SourcePanel
              cssLines={cssLines}
              cssSource={cssSource}
              tsxLines={tsxLines}
              tsxSource={tsxSource}
            />
          </div>
        </section>


        <WorkWithMeCta className="my-16" />
      </div>
    </main>
  );
}
