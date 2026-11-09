import type { Metadata } from "next";
import { ExperimentPage } from "@/app/experiments/_components/ExperimentPage";
import FerrofluidLab from "./ferrofluid-lab";

const title = "Ferrofluid | dqnamo";
const description =
  "A glass dish of ferrofluid with a magnet underneath: drag it about and the fluid crawls after it and stands up in spikes.";

export const metadata: Metadata = {
  title,
  description,
  openGraph: {
    title,
    description,
    siteName: "dqnamo",
    type: "website",
    url: "/lab/ferrofluid",
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
  },
};

export default function FerrofluidPage() {
  return (
    <ExperimentPage
      description={description}
      sectionClassName="lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-stretch"
      title="Ferrofluid"
    >
      <FerrofluidLab />
    </ExperimentPage>
  );
}
