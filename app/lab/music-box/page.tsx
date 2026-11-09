import type { Metadata } from "next";
import { ExperimentPage } from "@/app/experiments/_components/ExperimentPage";
import MusicBoxLab from "./music-box-lab";

const title = "Music Box | dqnamo";
const description =
  "A fifteen-note paper-strip music box: punch a tune into the strip, turn the handle and set it down on something that sings.";

export const metadata: Metadata = {
  title,
  description,
  openGraph: {
    title,
    description,
    siteName: "dqnamo",
    type: "website",
    url: "/lab/music-box",
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
  },
};

export default function MusicBoxPage() {
  return (
    <ExperimentPage
      description={description}
      sectionClassName="lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-stretch"
      title="Music Box"
    >
      <MusicBoxLab />
    </ExperimentPage>
  );
}
