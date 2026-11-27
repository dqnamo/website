import type { Metadata } from "next";
import { ExperimentPage } from "@/app/experiments/_components/ExperimentPage";
import DryTransferLab from "./dry-transfer-lab";

const title = "Dry Transfer | dqnamo";
const description =
  "A sheet of rub-down lettering: burnish a letter until it turns grey, lift the sheet, and see what took.";

export const metadata: Metadata = {
  title,
  description,
  openGraph: {
    title,
    description,
    siteName: "dqnamo",
    type: "website",
    url: "/lab/dry-transfer",
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
  },
};

export default function DryTransferPage() {
  return (
    <ExperimentPage
      description={description}
      sectionClassName="lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-stretch"
      title="Dry Transfer"
    >
      <DryTransferLab />
    </ExperimentPage>
  );
}
