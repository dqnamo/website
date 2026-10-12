import type { Metadata } from "next";
import { ExperimentPage } from "@/app/experiments/_components/ExperimentPage";
import ConfettiLab from "./confetti-lab";

const title = "Confetti | dqnamo";
const description =
  "Paper, foil and holographic confetti that tumbles, flutters and catches the light.";

export const metadata: Metadata = {
  title,
  description,
  openGraph: {
    title,
    description,
    siteName: "dqnamo",
    type: "website",
    url: "/lab/confetti",
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
  },
};

export default function ConfettiPage() {
  return (
    <ExperimentPage
      description={description}
      sectionClassName="lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-stretch"
      title="Confetti"
    >
      <ConfettiLab />
    </ExperimentPage>
  );
}
