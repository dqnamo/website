import type { Metadata } from "next";
import { ExperimentPage } from "@/app/experiments/_components/ExperimentPage";
import LabelMakerLab from "./label-maker-lab";

const title = "Label Maker | dqnamo";
const description =
  "A tape embosser that punches letters into glossy vinyl, where the white is the plastic itself, stretched until it crazes.";

export const metadata: Metadata = {
  title,
  description,
  openGraph: {
    title,
    description,
    siteName: "dqnamo",
    type: "website",
    url: "/lab/label-maker",
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
  },
};

export default function LabelMakerPage() {
  return (
    <ExperimentPage
      description={description}
      sectionClassName="lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-stretch"
      title="Label Maker"
    >
      <LabelMakerLab />
    </ExperimentPage>
  );
}
