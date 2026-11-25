import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Wordmark } from "@/components/Wordmark";
import { getWriting, writings } from "@/lib/writings";

// Only the essays in lib/writings.ts exist; anything else is a 404.
export const dynamicParams = false;

export function generateStaticParams() {
  return writings.map((writing) => ({ slug: writing.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const writing = getWriting(slug);
  if (!writing) return {};
  return {
    title: `${writing.title} | dqnamo`,
    description: writing.summary,
  };
}

export default async function WritingPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const writing = getWriting(slug);
  if (!writing) notFound();

  return (
    <main className="mx-auto max-w-xl">
      <div className="p-4 sm:p-8">
        <header className="px-3">
          <p>
            <Wordmark />
          </p>
          <Link
            className="font-medium text-grayscale-10 text-sm transition-colors hover:text-grayscale-11"
            href="/"
          >
            Writing
          </Link>
        </header>

        <article className="mt-12 px-3">
          <h1 className="text-balance font-medium text-grayscale-12 text-xl">
            {writing.title}
          </h1>

          <div className="mt-6 flex flex-col gap-5">
            {writing.blocks.map((block) =>
              block.type === "heading" ? (
                <h2
                  className="mt-4 font-medium text-grayscale-12 text-base"
                  key={block.text}
                >
                  {block.text}
                </h2>
              ) : (
                <p
                  className="text-pretty text-[15px] text-grayscale-11 leading-7"
                  key={block.text}
                >
                  {block.text}
                </p>
              ),
            )}
          </div>
        </article>
      </div>
    </main>
  );
}
