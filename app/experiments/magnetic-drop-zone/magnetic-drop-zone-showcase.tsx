import { MagneticDropZone } from "@/components/MagneticDropZone";

export function MagneticDropZoneShowcase() {
  return (
    <div
      className="flex min-h-[34rem] w-full items-center justify-center overflow-hidden rounded-[13px] border border-grayscale-3 bg-grayscale-1 px-4 py-20 small-shadow dark:border-grayscale-4 dark:bg-grayscale-2 dark:shadow-none sm:px-8"
      style={{
        backgroundImage:
          "radial-gradient(circle, color-mix(in srgb, var(--sand-6) 52%, transparent) 0.8px, transparent 0.8px)",
        backgroundSize: "16px 16px",
      }}
    >
      <MagneticDropZone />
    </div>
  );
}
