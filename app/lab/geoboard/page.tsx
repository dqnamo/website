import type { Metadata } from "next";
import { ExperimentPage } from "@/app/experiments/_components/ExperimentPage";
import GeoboardLab from "./geoboard-lab";

const title = "Geoboard | dqnamo";
const description =
  "A pegboard and a tin of rubber bands: stretch them into shapes, count their area in pegs, and pluck them.";

export const metadata: Metadata = {
  title,
  description,
  openGraph: {
    title,
    description,
    siteName: "dqnamo",
    type: "website",
    url: "/lab/geoboard",
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
  },
};

export default function GeoboardPage() {
  return (
    <ExperimentPage
      description={description}
      sectionClassName="lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-stretch"
      title="Geoboard"
    >
      <GeoboardLab />
    </ExperimentPage>
  );
}
