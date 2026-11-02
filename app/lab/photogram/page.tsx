import type { Metadata } from "next";
import { ExperimentPage } from "@/app/experiments/_components/ExperimentPage";
import PhotogramLab from "./photogram-lab";

const title = "Photogram | dqnamo";
const description =
  "A darkroom under a red safelight: lay things on photographic paper, expose it under the enlarger, and watch their shadows come up in the developer.";

export const metadata: Metadata = {
  title,
  description,
  openGraph: {
    title,
    description,
    siteName: "dqnamo",
    type: "website",
    url: "/lab/photogram",
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
  },
};

export default function PhotogramPage() {
  return (
    <ExperimentPage
      description={description}
      sectionClassName="lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-stretch"
      title="Photogram"
    >
      <PhotogramLab />
    </ExperimentPage>
  );
}
