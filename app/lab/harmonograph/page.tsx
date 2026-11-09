import type { Metadata } from "next";
import { ExperimentPage } from "@/app/experiments/_components/ExperimentPage";
import HarmonographLab from "./harmonograph-lab";

const title = "Harmonograph | dqnamo";
const description =
  "Three pendulums, two arms and a pen. Set them swinging and they draw a figure in real ink that slowly closes in on itself.";

export const metadata: Metadata = {
  title,
  description,
  openGraph: {
    title,
    description,
    siteName: "dqnamo",
    type: "website",
    url: "/lab/harmonograph",
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
  },
};

export default function HarmonographPage() {
  return (
    <ExperimentPage
      description={description}
      sectionClassName="lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-stretch"
      title="Harmonograph"
    >
      <HarmonographLab />
    </ExperimentPage>
  );
}
