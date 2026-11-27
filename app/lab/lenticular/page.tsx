import type { Metadata } from "next";
import { ExperimentPage } from "@/app/experiments/_components/ExperimentPage";
import LenticularLab from "./lenticular-lab";

const title = "Lenticular | dqnamo";
const description =
  "A ridged plastic card that changes picture as you tilt it, ray traced lens by lens: put a drop of water on it and the trick comes undone.";

export const metadata: Metadata = {
  title,
  description,
  openGraph: {
    title,
    description,
    siteName: "dqnamo",
    type: "website",
    url: "/lab/lenticular",
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
  },
};

export default function LenticularPage() {
  return (
    <ExperimentPage
      description={description}
      sectionClassName="lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-stretch"
      title="Lenticular"
    >
      <LenticularLab />
    </ExperimentPage>
  );
}
