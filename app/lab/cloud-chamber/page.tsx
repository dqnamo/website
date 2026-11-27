import type { Metadata } from "next";
import { ExperimentPage } from "@/app/experiments/_components/ExperimentPage";
import CloudChamberLab from "./cloud-chamber-lab";

const title = "Cloud Chamber | dqnamo";
const description =
  "A tank of alcohol vapour on dry ice, where cosmic rays and the things on its floor leave trails of mist.";

export const metadata: Metadata = {
  title,
  description,
  openGraph: {
    title,
    description,
    siteName: "dqnamo",
    type: "website",
    url: "/lab/cloud-chamber",
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
  },
};

export default function CloudChamberPage() {
  return (
    <ExperimentPage
      description={description}
      sectionClassName="lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-stretch"
      title="Cloud Chamber"
    >
      <CloudChamberLab />
    </ExperimentPage>
  );
}
