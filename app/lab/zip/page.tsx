import type { Metadata } from "next";
import { ExperimentPage } from "@/app/experiments/_components/ExperimentPage";
import ZipLab from "./zip-lab";

const title = "Zip | dqnamo";
const description =
  "A zip close up: teeth that lock in the slider, a pull that flips and clinks, fabric you can tug, and a buzz that is just the teeth going by.";

export const metadata: Metadata = {
  title,
  description,
  openGraph: {
    title,
    description,
    siteName: "dqnamo",
    type: "website",
    url: "/lab/zip",
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
  },
};

export default function ZipPage() {
  return (
    <ExperimentPage
      description={description}
      sectionClassName="lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-stretch"
      title="Zip"
    >
      <ZipLab />
    </ExperimentPage>
  );
}
