import Link from "next/link";
import { PikaArrowRightIcon } from "@/components/PikaDockIcons";
import { type Essay, formatEssayDate } from "../_lib/essays";

export function EssayList({ essays }: { essays: readonly Essay[] }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-[16px] border border-grayscale-3 bg-grayscale-2 p-1.5">
      {essays.map((essay) => (
        <Link
          className="group flex items-center gap-4 rounded-[13px] border border-grayscale-4 border-b-2 bg-white p-4 transition-colors hover:border-grayscale-5 hover:bg-grayscale-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-grayscale-7 dark:bg-grayscale-3 dark:hover:bg-grayscale-4"
          href={`/essays/${essay.slug}`}
          key={essay.slug}
        >
          <div className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-6">
            <time
              className="shrink-0 font-mono text-grayscale-9 text-xs tabular-nums sm:w-24"
              dateTime={essay.publishedAt}
            >
              {formatEssayDate(essay.publishedAt)}
            </time>
            <div className="min-w-0">
              <h3 className="text-balance font-medium text-grayscale-12 text-sm">
                {essay.title}
              </h3>
              <p className="mt-1 text-pretty text-grayscale-10 text-xs leading-5">
                {essay.description}
              </p>
            </div>
          </div>
          <PikaArrowRightIcon
            aria-hidden="true"
            className="hidden shrink-0 text-grayscale-9 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-grayscale-11 sm:block"
            size={16}
          />
        </Link>
      ))}
    </div>
  );
}
