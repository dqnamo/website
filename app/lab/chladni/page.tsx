import type { Metadata } from "next";
import { ExperimentPage } from "@/app/experiments/_components/ExperimentPage";
import ChladniLab from "./chladni-lab";

const title = "Chladni Plate | dqnamo";
const description =
  "Sand on a ringing metal plate. Tune the driver or bow the edge, and the sand runs to the places where the plate keeps still.";

export const metadata: Metadata = {
  title,
  description,
  openGraph: {
    title,
    description,
    siteName: "dqnamo",
    type: "website",
    url: "/lab/chladni",
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
  },
};

export default function ChladniPage() {
  return (
    <ExperimentPage
      description={description}
      sectionClassName="lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-stretch"
      title="Chladni Plate"
    >
      <ChladniLab />
    </ExperimentPage>
  );
}
