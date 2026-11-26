"use client";

import dynamic from "next/dynamic";
import { ExperimentPreviewSlot } from "@/components/ExperimentPreviewSlot";
import type { experiments } from "@/components/experiment-catalog";

// The previews pull in motion and every lab component, so they load in their
// own chunk the first time one scrolls near the screen.
const ExperimentPreview = dynamic(() =>
  import("@/components/NewExperimentCta").then(
    (module) => module.ExperimentPreview,
  ),
);

export function LazyExperimentPreview({
  type,
}: {
  type: (typeof experiments)[number]["preview"];
}) {
  return (
    <ExperimentPreviewSlot>
      <ExperimentPreview type={type} />
    </ExperimentPreviewSlot>
  );
}
