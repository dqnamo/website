import type { Metadata } from "next";
import { ExperimentPage } from "@/app/experiments/_components/ExperimentPage";
import MosaicsLab from "./mosaics-lab";

const title = "Mosaics | dqnamo";
const description =
  "Any picture, re-laid as a 3D Roman mosaic in stone, glass and gold.";

export const metadata: Metadata = {
  title,
  description,
  openGraph: {
    title,
    description,
    siteName: "dqnamo",
    type: "website",
    url: "/lab/mosaics",
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
  },
};

export default function MosaicsPage() {
  return (
    <ExperimentPage
      description={description}
      sectionClassName="lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-stretch"
      title="Mosaics"
    >
      <MosaicsLab />
    </ExperimentPage>
  );
}
