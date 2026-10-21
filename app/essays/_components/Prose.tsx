import Link from "next/link";
import type { ReactNode } from "react";
import type { BundledLanguage } from "shiki";
import CodeBlock from "@/components/CodeBlock";
import { tokenize } from "@/helpers/syntax";

// The pieces a post is written with. Each sets its own space above, and the article drops it from
// whichever comes first.

export function P({ children }: { children: ReactNode }) {
  return <p className="mt-5 text-pretty">{children}</p>;
}

export function H2({ children }: { children: ReactNode }) {
  return (
    <h2 className="mt-12 text-balance font-medium text-base text-grayscale-12">
      {children}
    </h2>
  );
}

const linkClassName =
  "text-grayscale-12 underline decoration-grayscale-6 underline-offset-[3px] transition-colors hover:decoration-grayscale-9";

export function A({ children, href }: { children: ReactNode; href: string }) {
  if (href.startsWith("/")) {
    return (
      <Link className={linkClassName} href={href}>
        {children}
      </Link>
    );
  }

  return (
    <a
      className={linkClassName}
      href={href}
      rel="noopener noreferrer"
      target="_blank"
    >
      {children}
    </a>
  );
}

export function Code({ children }: { children: ReactNode }) {
  return (
    <code className="rounded-md bg-grayscale-3 px-1 py-0.5 font-mono text-[0.85em] text-grayscale-12 dark:bg-grayscale-4">
      {children}
    </code>
  );
}

export function List({ children }: { children: ReactNode }) {
  return (
    <ul className="mt-5 flex list-disc flex-col gap-2 pl-5 marker:text-grayscale-8">
      {children}
    </ul>
  );
}

export function Li({ children }: { children: ReactNode }) {
  return <li className="pl-1">{children}</li>;
}

export function Quote({ children }: { children: ReactNode }) {
  return (
    <blockquote className="mt-8 mb-8 border-grayscale-5 border-l-2 pl-5 text-pretty text-grayscale-12">
      {children}
    </blockquote>
  );
}

export async function CodeSample({
  caption,
  code,
  lang = "tsx",
}: {
  caption?: string;
  code: string;
  lang?: BundledLanguage;
}) {
  const lines = await tokenize(code.trim(), lang);

  return (
    <figure className="mt-8 mb-8">
      <div className="rounded-[16px] border border-grayscale-3 bg-grayscale-2 p-1.5">
        <div className="flex overflow-hidden rounded-[13px] border border-grayscale-4 border-b-2 bg-white dark:bg-grayscale-3">
          <CodeBlock lines={lines} />
        </div>
      </div>
      {caption && (
        <figcaption className="mt-3 px-3 text-grayscale-9 text-xs leading-5">
          {caption}
        </figcaption>
      )}
    </figure>
  );
}
