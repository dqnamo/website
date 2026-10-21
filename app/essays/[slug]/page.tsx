import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Wordmark } from "@/components/Wordmark";
import { WorkWithMeCta } from "@/components/WorkWithMeCta";
import { EssayList } from "../_components/EssayList";
import { formatEssayDate } from "../_lib/essays";
import { essays, getEssay } from "../_posts";

export const dynamicParams = false;

export function generateStaticParams() {
  return essays.map((essay) => ({ slug: essay.slug }));
}

export async function generateMetadata({
  params,
}: PageProps<"/essays/[slug]">): Promise<Metadata> {
  const essay = getEssay((await params).slug);

  if (!essay) {
    return {};
  }

  return {
    title: `${essay.title} | dqnamo`,
    description: essay.description,
  };
}

export default async function EssayPage({
  params,
}: PageProps<"/essays/[slug]">) {
  const essay = getEssay((await params).slug);

  if (!essay) {
    notFound();
  }

  const { Body } = essay;
  const otherEssays = essays.filter(({ slug }) => slug !== essay.slug);

  return (
    <main className="mx-auto max-w-4xl">
      <div className="p-4 pb-16 sm:p-8">
        {/* A narrow, centred column, so lines stay easy to read. */}
        <div className="mx-auto max-w-xl">
          <header className="px-3">
            <p data-recording-hide="">
              <Wordmark />
            </p>
            <p
              className="font-medium font-sans text-sm text-grayscale-10"
              data-recording-hide=""
            >
              <Link
                className="transition-colors hover:text-grayscale-11"
                href="/essays"
              >
                Essays
              </Link>
            </p>
          </header>

          <article className="mt-12 px-3">
            <header>
              <h1 className="text-balance font-medium text-grayscale-12 text-xl tracking-tight">
                {essay.title}
              </h1>
              <time
                className="mt-1 block text-grayscale-9 text-xs tabular-nums"
                dateTime={essay.publishedAt}
              >
                {formatEssayDate(essay.publishedAt)}
              </time>
            </header>

            <div className="mt-10 text-grayscale-11 text-sm leading-6 [&>:first-child]:mt-0">
              <Body />
            </div>
          </article>

          {otherEssays.length > 0 && (
            <section className="mt-20">
              <h2 className="p-3 font-medium text-grayscale-12 text-sm">
                More essays
              </h2>
              <div className="mt-3">
                <EssayList essays={otherEssays} />
              </div>
            </section>
          )}

          <WorkWithMeCta className="mt-16" location="essay" />
        </div>
      </div>
    </main>
  );
}
