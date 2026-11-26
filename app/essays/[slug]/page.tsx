import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
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
      <div className="p-4 pt-12 sm:p-8 sm:pt-20">
        <PageHeader badge="Essays" />

        <article className="mt-12 px-3 max-sm:pr-12">
          <h1 className="text-balance font-medium text-grayscale-12 text-sm leading-6">
            {writing.title}
          </h1>

          <div className="mt-4 flex flex-col gap-4">
            {writing.blocks.map((block) =>
              block.type === "heading" ? (
                <h2
                  className="mt-4 font-medium text-grayscale-12 text-sm leading-6"
                  key={block.text}
                >
                  {block.text}
                </h2>
              ) : (
                <p
                  className="text-pretty text-grayscale-11 text-sm leading-6"
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
