import type { Metadata } from "next";
import { ExperimentPage } from "@/app/experiments/_components/ExperimentPage";
import { EnhancedColorPicker } from "@/components/EnhancedColorPicker";

export const metadata: Metadata = {
  title: "Smart Color Picker | dqnamo",
  description:
    "A flexible color picker with CSS parsing and Jev-powered semantic color interpretation.",
};

export default function SmartColorPickerPage() {
  return (
    <ExperimentPage
      description="A color picker that parses CSS locally and automatically interprets freeform descriptions with a two-pass Jev comparison."
      slug="enchanced-color-picker"
      title="Smart Color Picker"
    >
      <div className="flex min-h-[600px] w-full items-center justify-center rounded-[13px] border border-grayscale-3 bg-grayscale-1 px-4 py-10 sm:px-6 dark:border-grayscale-4 dark:bg-grayscale-3">
        <EnhancedColorPicker />
      </div>
    </ExperimentPage>
  );
}
