import type { Metadata } from "next";
import { NewExperimentCta } from "@/components/NewExperimentCta";
import { PageHeader } from "@/components/PageHeader";

export const metadata: Metadata = {
  title: "Lab | dqnamo",
  description: "Component experiments and interface studies by dqnamo.",
};

export default function LabPage() {
  return (
    <main className="mx-auto max-w-4xl">
      <div className="p-4 pt-12 sm:p-8 sm:pt-20">
        <PageHeader badge="Lab" />
        <p className="mt-12 max-w-md px-3 text-pretty text-grayscale-11 text-sm leading-6">
          Components, interface studies, and small experiments made in the lab.
        </p>

        <NewExperimentCta className="mt-12 [&>div:first-child]:hidden" />
      </div>
    </main>
  );
}
