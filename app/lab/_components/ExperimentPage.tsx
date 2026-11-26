import type { ReactNode } from "react";
import { PageHeader } from "@/components/PageHeader";
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
      <div className="p-4 pt-12 pb-16 sm:p-8 sm:pt-20 sm:pb-16">
        <PageHeader badge="Lab" href="/lab" />
        <div className="mt-12 px-3">
          <h1 className="font-medium text-grayscale-12 text-sm leading-6">
            {title}
          </h1>
          <p className="max-w-md text-pretty text-grayscale-11 text-sm leading-6">
            {description}
          </p>
          {headerExtra}
        </div>
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
