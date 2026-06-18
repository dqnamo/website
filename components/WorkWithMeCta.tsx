import { Arvo } from "next/font/google";
import Button from "@/components/public/Button";
import { GameOfLife } from "@/components/random/GameOfLife";
import { cn } from "@/helpers/classname-helper";

const arvo = Arvo({
  subsets: ["latin"],
  weight: ["400", "700"],
});

type WorkWithMeCtaProps = {
  className?: string;
};

export function WorkWithMeCta({ className }: WorkWithMeCtaProps) {
  return (
    <section
      className={cn(
        "grid min-h-0 grid-cols-2 gap-1.5 rounded-[20px] border border-grayscale-3 bg-grayscale-2 p-1.5",
        className,
      )}
    >
      <div className="flex w-full flex-col items-center justify-center gap-1.5 rounded-[17px] border border-grayscale-3 bg-grayscale-1 small-shadow dark:border-transparent dark:bg-grayscale-2 dark:shadow-none">
        <div className="flex flex-col gap-1.5 p-8">
          <p className="text-balance text-grayscale-12 text-sm">
            Want to work with me?
          </p>
          <p className="text-pretty text-grayscale-10 text-sm">
            I run a lil design engineering studio in London where we do
            fractional design engineering for startups.
          </p>
          <Button
            href="https://cal.com/interface.london/15min"
            target="_blank"
            rel="noopener noreferrer"
            variant="primary"
            className="mt-4 w-max"
          >
            Jump on a call
          </Button>
        </div>
      </div>
      <div className="relative flex min-h-[12rem] w-full overflow-hidden rounded-[17px] border border-grayscale-3 bg-grayscale-1 small-shadow dark:border-grayscale-4 dark:bg-grayscale-3">
        <GameOfLife
          aria-hidden
          cellSize={14}
          density={0.24}
          fadeDuration={520}
          maxOpacity={1}
          stepInterval={520}
          className="absolute inset-0 [--game-of-life-color:var(--color-grayscale-3)] dark:[--game-of-life-color:var(--color-grayscale-4)]"
        />
        <div
          className={`${arvo.className} relative z-10 flex min-h-full w-full flex-col items-center justify-center gap-px p-8 text-center uppercase leading-none text-grayscale-12`}
        >
          <span className="mb-px font-medium text-grayscale-9 text-xs leading-none">
            THE
          </span>
          <span className="font-medium text-grayscale-11 text-xl leading-none">
            INTERFACE
          </span>
          <span className="font-medium text-grayscale-11 text-xl leading-none">
            COMPANY
          </span>
          <span className="mt-px font-medium text-grayscale-9 text-xs leading-none">
            OF LONDON
          </span>
        </div>
      </div>
    </section>
  );
}
