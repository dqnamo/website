import type { Metadata } from "next";
import { ExperimentPage } from "@/app/experiments/_components/ExperimentPage";
import { SourcePanel } from "@/app/experiments/_components/SourcePanel";
import { buildSourceTabs, readSourceFile } from "@/app/experiments/_lib/source";
import { TearOffCalendarShowcase } from "./tear-off-calendar-showcase";

const title = "Tear-Off Calendar | dqnamo";
const description =
  "A desk calendar whose pages tear along the perforations, hole by hole.";

export const metadata: Metadata = {
  title,
  description,
  openGraph: {
    title,
    description,
    siteName: "dqnamo",
    type: "website",
    url: "/experiments/tear-off-calendar",
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
  },
};

export default async function TearOffCalendarPage() {
  const [calendarSource, showcaseSource] = await Promise.all([
    readSourceFile("components/TearOffCalendar.tsx"),
    readSourceFile(
      "app/experiments/tear-off-calendar/tear-off-calendar-showcase.tsx",
    ),
  ]);
  const tabs = await buildSourceTabs([
    {
      label: "TearOffCalendar.tsx",
      source: calendarSource,
      value: "calendar",
    },
    {
      label: "Example.tsx",
      source: showcaseSource,
      value: "example",
    },
  ]);

  return (
    <ExperimentPage
      description="A desk calendar whose pages tear along the perforations, hole by hole. Pull a page down to rip it off, stop halfway and it hangs there, or press Enter."
      slug="tear-off-calendar"
      title="Tear-Off Calendar"
    >
      <TearOffCalendarShowcase />
      <div className="w-full overflow-hidden rounded-[13px] border border-grayscale-3 bg-grayscale-1 small-shadow dark:border-grayscale-4 dark:bg-grayscale-3 dark:shadow-none">
        <SourcePanel tabs={tabs} />
      </div>
    </ExperimentPage>
  );
}
