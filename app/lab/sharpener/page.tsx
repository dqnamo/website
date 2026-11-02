import type { Metadata } from "next";
import { ExperimentPage } from "@/app/experiments/_components/ExperimentPage";
import SharpenerLab from "./sharpener-lab";

const title = "Sharpener | dqnamo";
const description =
  "Turn a pencil in a sharpener and watch the shaving unroll into a frilly ring, painted edge, glue line and all.";

export const metadata: Metadata = {
  title,
  description,
  openGraph: {
    title,
    description,
    siteName: "dqnamo",
    type: "website",
    url: "/lab/sharpener",
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
  },
};

export default function SharpenerPage() {
  return (
    <ExperimentPage
      description={description}
      sectionClassName="lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-stretch"
      title="Sharpener"
    >
      <SharpenerLab />
    </ExperimentPage>
  );
}
