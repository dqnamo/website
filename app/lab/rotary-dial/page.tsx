import type { Metadata } from "next";
import { ExperimentPage } from "@/app/experiments/_components/ExperimentPage";
import RotaryDialLab from "./rotary-dial-lab";

const title = "Rotary Dial | dqnamo";
const description =
  "A telephone dial that clicks each digit down the line as it spins home, with British line tones and a speaking clock on 123.";

export const metadata: Metadata = {
  title,
  description,
  openGraph: {
    title,
    description,
    siteName: "dqnamo",
    type: "website",
    url: "/lab/rotary-dial",
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
  },
};

export default function RotaryDialPage() {
  return (
    <ExperimentPage
      description={description}
      sectionClassName="lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-stretch"
      title="Rotary Dial"
    >
      <RotaryDialLab />
    </ExperimentPage>
  );
}
