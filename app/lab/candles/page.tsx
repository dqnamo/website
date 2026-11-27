import type { Metadata } from "next";
import { ExperimentPage } from "@/app/experiments/_components/ExperimentPage";
import CandlesLab from "./candles-lab";

const title = "Candles | dqnamo";
const description =
  "Candle flames that flicker, fall into step with each other or go still, blow out in a breath and light again from their own smoke.";

export const metadata: Metadata = {
  title,
  description,
  openGraph: {
    title,
    description,
    siteName: "dqnamo",
    type: "website",
    url: "/lab/candles",
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
  },
};

export default function CandlesPage() {
  return (
    <ExperimentPage
      description={description}
      sectionClassName="lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-stretch"
      title="Candles"
    >
      <CandlesLab />
    </ExperimentPage>
  );
}
