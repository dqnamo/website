import Link from "next/link";
import { Wordmark } from "@/components/Wordmark";

// Same badge as the timeline's years.
const badgeClassName =
  "rounded-full border border-grayscale-4 border-b-2 bg-white px-2.5 py-0.5 font-medium text-grayscale-12 text-xs dark:bg-grayscale-3";

/**
 * The wordmark with a badge under it naming the section, like
 * "Essays" or "Lab". Pass `href` to make the badge link to the section.
 */
export function PageHeader({ badge, href }: { badge: string; href?: string }) {
  return (
    <header
      className="flex flex-col items-start gap-1 px-3"
      data-recording-hide=""
    >
      <p>
        <Wordmark />
      </p>
      {href ? (
        <Link
          className={`${badgeClassName} transition-colors hover:border-grayscale-5 hover:bg-grayscale-2 dark:hover:bg-grayscale-4`}
          href={href}
        >
          {badge}
        </Link>
      ) : (
        <span className={badgeClassName}>{badge}</span>
      )}
    </header>
  );
}
