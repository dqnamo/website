import type { Metadata } from "next";
import { ExperimentPage } from "@/app/experiments/_components/ExperimentPage";
import NeonLab from "./neon-lab";

const title = "Neon | dqnamo";
const description =
  "Draw on the wall and it's bent into glass tube, filled with neon or argon, and lit.";

export const metadata: Metadata = {
  title,
  description,
  openGraph: {
    title,
    description,
    siteName: "dqnamo",
    type: "website",
    url: "/lab/neon",
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
  },
};

export default function NeonPage() {
  return (
    <ExperimentPage
      description={description}
      sectionClassName="lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-stretch"
      title="Neon"
    >
      <NeonLab />
    </ExperimentPage>
  );
}
