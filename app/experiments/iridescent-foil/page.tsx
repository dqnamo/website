import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ArrowRightIcon } from "@phosphor-icons/react/dist/ssr";
import { Arvo } from "next/font/google";
import { ExperimentPage } from "@/app/experiments/_components/ExperimentPage";
import { IridescentFoil } from "@/components/IridescentFoil";
import { tokenize } from "@/helpers/syntax";
import { CopyActions } from "./copy-actions";
import { buildAgentPrompt, buildMarkdown } from "./copy-content";
import { SourcePanel } from "./source-panel";

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
    <ExperimentPage
      description="Holographic foil built from layered CSS gradients. Scroll the page and move your pointer to shift the iridescent colour and specular glare across the sticker."
      headerExtra={
        <div className="mt-4">
          <CopyActions agentPrompt={agentPrompt} markdown={markdown} />
        </div>
      }
      slug="iridescent-foil"
      title="Iridescent Foil"
    >
          <div className="w-full p-28 flex items-center justify-center bg-grayscale-1 dark:bg-grayscale-2 dark:border-transparent dark:shadow-none rounded-[13px] small-shadow border border-grayscale-3">
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
          <div className="w-full overflow-hidden bg-grayscale-1 dark:bg-grayscale-3 dark:border-grayscale-4 rounded-[13px] small-shadow border border-grayscale-3">
            <SourcePanel
              cssLines={cssLines}
              cssSource={cssSource}
              tsxLines={tsxLines}
              tsxSource={tsxSource}
            />
          </div>
    </ExperimentPage>
  );
}
