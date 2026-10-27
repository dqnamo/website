import type { Metadata } from "next";
import { UndergroundMapLoader } from "./underground-map-loader";

const title = "Underground map | dqnamo";
const description =
  "Draw your own Underground map: drop stations, drag lines between them, and the map lays itself out in the London house style.";

export const metadata: Metadata = {
  title,
  description,
  openGraph: {
    title,
    description,
    siteName: "dqnamo",
    type: "website",
    url: "/underground-map",
  },
  twitter: {
    card: "summary",
    title,
    description,
  },
};

export default function UndergroundMapPage() {
  return <UndergroundMapLoader />;
}
