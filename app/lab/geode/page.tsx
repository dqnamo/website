import type { Metadata } from "next";
import { ExperimentPage } from "@/app/experiments/_components/ExperimentPage";
import GeodeLab from "./geode-lab";

const title = "Geode | dqnamo";
const description =
  "Turn a rough nodule under the saw's laser, cut it, and open it like a book: agate bands, level layers, crystals and all.";

export const metadata: Metadata = {
  title,
  description,
  openGraph: {
    title,
    description,
    siteName: "dqnamo",
    type: "website",
    url: "/lab/geode",
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
  },
};

export default function GeodePage() {
  return (
    <ExperimentPage
      description={description}
      sectionClassName="lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-stretch"
      title="Geode"
    >
      <GeodeLab />
    </ExperimentPage>
  );
}
