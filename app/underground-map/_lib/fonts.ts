import { Hammersmith_One } from "next/font/google";

/** The map's lettering: a free face in the spirit of Johnston. */
export const mapFont = Hammersmith_One({
  subsets: ["latin"],
  variable: "--font-hammersmith-one",
  weight: "400",
});

/** The family name the browser knows the loaded face by, without its fallbacks. */
export const mapFontFamily = mapFont.style.fontFamily.split(",")[0].trim();
