import type { Metadata } from "next";
import { Barlow, Inter, JetBrains_Mono, Pirata_One } from "next/font/google";
import "../styles/globals.css";
import { BottomDock } from "@/components/BottomDock";
import { RecordingMode } from "@/components/RecordingMode";
import { ThemeProvider } from "@/components/ThemeProvider";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["100", "200", "300", "400", "500", "600", "700", "800"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["100", "200", "300", "400", "500", "600", "700", "800"],
});

const pirataOne = Pirata_One({
  variable: "--font-pirata-one",
  subsets: ["latin"],
  weight: ["400"],
});

const barlow = Barlow({
  variable: "--font-barlow",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://dqnamo.com"),
  title: "dqnamo",
  description: "The personal website of dqnamo.",
  openGraph: {
    title: "dqnamo",
    description: "The personal website of dqnamo.",
    siteName: "dqnamo",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "dqnamo",
    description: "The personal website of dqnamo.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${jetbrainsMono.variable} ${pirataOne.variable} ${barlow.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full bg-grayscale-1 text-grayscale-12">
        <ThemeProvider>
          <RecordingMode />
          <div className="root">{children}</div>
          <BottomDock />
        </ThemeProvider>
      </body>
    </html>
  );
}
