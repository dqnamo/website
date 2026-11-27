import type { Metadata } from "next";
import { ExperimentPage } from "@/app/experiments/_components/ExperimentPage";
import SpinningCoinLab from "./spinning-coin-lab";

const title = "Spinning Coin | dqnamo";
const description =
  "Flick a coin into a spin and watch it settle: a ghostly ball upright, then a wobble that whirrs faster and faster until it stops dead.";

export const metadata: Metadata = {
  title,
  description,
  openGraph: {
    title,
    description,
    siteName: "dqnamo",
    type: "website",
    url: "/lab/spinning-coin",
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
  },
};

export default function SpinningCoinPage() {
  return (
    <ExperimentPage
      description={description}
      sectionClassName="lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-stretch"
      title="Spinning Coin"
    >
      <SpinningCoinLab />
    </ExperimentPage>
  );
}
