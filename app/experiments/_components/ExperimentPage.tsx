import Link from "next/link";
import type { ReactNode } from "react";
import { WorkWithMeCta } from "@/components/WorkWithMeCta";
import { cn } from "@/helpers/classname-helper";

type ExperimentLayoutProps = {
  children: ReactNode;
  description: string;
  headerExtra?: ReactNode;
  title: string;
};

type ExperimentPageProps = ExperimentLayoutProps & {
  sectionClassName?: string;
  slug?: string;
};

export function ExperimentLayout({
  children,
  description,
  headerExtra,
  title,
}: ExperimentLayoutProps) {
  return (
    <main className="mx-auto max-w-4xl">
      <div className="p-8 pb-16">
        <header className="px-3">
          <p className="font-pirata font-bold text-4xl" data-recording-hide="">
            <Link className="text-grayscale-12" href="/">
              dqnamo&apos;s
            </Link>
          </p>
          <p
            className="font-medium font-sans text-sm text-grayscale-10"
            data-recording-hide=""
          >
            <Link
              className="transition-colors hover:text-grayscale-11"
              href="/kitchen"
            >
              Kitchen
            </Link>
          </p>
          <h1 className="mt-8 font-medium text-grayscale-12 text-sm">
            {title}
          </h1>
          <p className="mt-px max-w-md text-pretty text-grayscale-10 text-sm leading-5">
            {description}
          </p>
          {headerExtra}
        </header>
        {children}
      </div>
    </main>
  );
}

export function ExperimentPage({
  children,
  description,
  headerExtra,
  sectionClassName,
  title,
}: ExperimentPageProps) {
  return (
    <ExperimentLayout
      description={description}
      headerExtra={headerExtra}
      title={title}
    >
      <section
        className={cn(
          "mt-12 flex flex-col items-center justify-center gap-1.5 rounded-[16px] border border-grayscale-3 bg-grayscale-2 p-1.5 dark:border-grayscale-4",
          sectionClassName,
        )}
      >
        {children}
      </section>

      <WorkWithMeCta className="my-16" />
    </ExperimentLayout>
  );
}
