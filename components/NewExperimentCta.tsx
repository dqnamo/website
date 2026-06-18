import { ArrowRightIcon, SparkleIcon } from "@phosphor-icons/react/dist/ssr";
import { IridescentFoil } from "@/components/IridescentFoil";
import Button from "@/components/public/Button";
import { cn } from "@/helpers/classname-helper";

type NewExperimentCtaProps = {
  className?: string;
};

export function NewExperimentCta({ className }: NewExperimentCtaProps) {
  return (
    <section
      className={cn(
        "grid min-h-0 grid-cols-2 gap-1.5 rounded-[20px] border border-grayscale-3 bg-grayscale-2 p-1.5",
        className,
      )}
    >
      <div className="flex w-full flex-col items-center justify-center gap-1.5 rounded-[17px] border border-grayscale-3 bg-grayscale-1 small-shadow dark:border-grayscale-4 dark:bg-grayscale-3 dark:shadow-none">
        <div className="flex flex-col gap-1.5 p-8">
          <div className="flex flex-row items-center gap-2">
            <p className="text-balance text-grayscale-12 text-sm">
              New experiment
            </p>
            <SparkleIcon className="text-teal-9" size={16} weight="fill" />
          </div>
          <p className="text-pretty text-grayscale-10 text-sm">
            Dynamic holographic foil built from layered CSS gradients that reacts
            to scroll and pointer movement.
          </p>
          <Button
            href="/experiments/iridescent-foil"
            variant="secondary"
            className="mt-4 w-max"
          >
            View code
            <ArrowRightIcon
              className="text-grayscale-11"
              size={16}
              weight="bold"
            />
          </Button>
        </div>
      </div>
      <div className="flex min-h-[12rem] w-full items-center justify-center overflow-hidden rounded-[17px] border border-grayscale-3 bg-grayscale-1 dark:bg-grayscale-2 p-8 small-shadow dark:border-transparent dark:shadow-none">
        <IridescentFoil
          aria-label="Interactive iridescent foil sticker"
          className="group h-28 w-full max-w-48 cursor-pointer rounded-xl shadow-sm"
          role="img"
          scrollProgressMode="document"
        >
          <div className="flex h-full flex-col items-center justify-center text-center text-grayscale-12 leading-none">
            <span className="font-medium text-grayscale-9 text-xs leading-none">
              The Iridescent Foil
            </span>
          </div>
        </IridescentFoil>
      </div>
    </section>
  );
}
