import type { Metadata } from "next";
import { ExperimentPage } from "@/app/experiments/_components/ExperimentPage";
import MarblingLab from "./marbling-lab";

const title = "Marbling | dqnamo";
const description =
  "Float inks on a bath of size, comb them into patterns and lift a print, the way ebru and old endpapers are made.";

export const metadata: Metadata = {
  title,
  description,
  openGraph: {
    title,
    description,
    siteName: "dqnamo",
    type: "website",
    url: "/lab/marbling",
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
  },
};

export default function MarblingPage() {
  return (
    <ExperimentPage
      description={description}
      sectionClassName="lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-stretch"
      title="Marbling"
    >
      <MarblingLab />
    </ExperimentPage>
  );
}
