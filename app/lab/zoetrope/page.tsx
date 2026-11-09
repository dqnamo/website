import type { Metadata } from "next";
import { ExperimentPage } from "@/app/experiments/_components/ExperimentPage";
import ZoetropeLab from "./zoetrope-lab";

const title = "Zoetrope | dqnamo";
const description =
  "A Victorian slotted drum: spin it and look through the slits, and the pictures inside come alive.";

export const metadata: Metadata = {
  title,
  description,
  openGraph: {
    title,
    description,
    siteName: "dqnamo",
    type: "website",
    url: "/lab/zoetrope",
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
  },
};

export default function ZoetropePage() {
  return (
    <ExperimentPage
      description={description}
      sectionClassName="lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-stretch"
      title="Zoetrope"
    >
      <ZoetropeLab />
    </ExperimentPage>
  );
}
