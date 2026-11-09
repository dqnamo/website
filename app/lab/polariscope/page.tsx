import type { Metadata } from "next";
import { ExperimentPage } from "@/app/experiments/_components/ExperimentPage";
import PolariscopeLab from "./polariscope-lab";

const title = "Polariscope | dqnamo";
const description =
  "Clear tape and a squeezed plastic disc on a light box, and the colours a polarising filter finds hidden in them.";

export const metadata: Metadata = {
  title,
  description,
  openGraph: {
    title,
    description,
    siteName: "dqnamo",
    type: "website",
    url: "/lab/polariscope",
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
  },
};

export default function PolariscopePage() {
  return (
    <ExperimentPage
      description={description}
      sectionClassName="lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-stretch"
      title="Polariscope"
    >
      <PolariscopeLab />
    </ExperimentPage>
  );
}
