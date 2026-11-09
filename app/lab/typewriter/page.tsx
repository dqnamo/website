import type { Metadata } from "next";
import { Courier_Prime } from "next/font/google";
import { ExperimentPage } from "@/app/experiments/_components/ExperimentPage";
import TypewriterLab from "./typewriter-lab";

// The face on the machine's type: a Courier drawn for text spaced ten letters to the inch.
const courierPrime = Courier_Prime({
  variable: "--font-courier-prime",
  subsets: ["latin"],
  weight: ["400"],
});

const title = "Typewriter | dqnamo";
const description =
  "A manual typewriter where every letter is a blow: little fingers print pale, full stops go through thin paper, and two keys at once jam.";

export const metadata: Metadata = {
  title,
  description,
  openGraph: {
    title,
    description,
    siteName: "dqnamo",
    type: "website",
    url: "/lab/typewriter",
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
  },
};

export default function TypewriterPage() {
  return (
    <ExperimentPage
      description={description}
      sectionClassName="lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-stretch"
      title="Typewriter"
    >
      <TypewriterLab fontClassName={courierPrime.variable} />
    </ExperimentPage>
  );
}
