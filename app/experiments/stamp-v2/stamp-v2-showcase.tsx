"use client";

import type { ReactNode } from "react";
import { Tabs } from "@/components/public/Tabs";
import { StampSheet, StampV2 } from "@/components/StampV2";
import { StampArtwork, stampDesigns } from "./stamp-artwork";
import styles from "./stamp-v2-showcase.module.css";

const layouts = [
  { label: "Single", value: "single", columns: 1, count: 1 },
  { label: "2x1 sheet", value: "strip", columns: 2, count: 2 },
  { label: "2x2 sheet", value: "sheet", columns: 2, count: 4 },
] as const;

export function StampV2Showcase({ children }: { children: ReactNode }) {
  return (
    <Tabs.Root className="flex w-full flex-col gap-1.5" defaultValue="sheet">
      <div className={styles.stage}>
        <div aria-hidden="true" className={styles.stageGrid} />
        {layouts.map((layout) => (
          <Tabs.Panel
            className={styles.specimen}
            key={layout.value}
            value={layout.value}
          >
            {layout.value === "single" ? (
              <StampV2 aria-label="Single postage stamp">
                <StampArtwork design={stampDesigns[0]} />
              </StampV2>
            ) : (
              <StampSheet
                aria-label={`${layout.columns} by ${layout.count / layout.columns} stamp sheet`}
                columns={layout.columns}
              >
                {stampDesigns.slice(0, layout.count).map((design) => (
                  <StampArtwork design={design} key={design.id} />
                ))}
              </StampSheet>
            )}
          </Tabs.Panel>
        ))}
      </div>
      <div className="w-full overflow-hidden rounded-[13px] border border-grayscale-3 bg-grayscale-1 small-shadow dark:border-grayscale-4 dark:bg-grayscale-3 dark:shadow-none">
        <div className="border-grayscale-3 border-b p-2 dark:border-grayscale-4">
          <Tabs.List aria-label="Stamp layout">
            {layouts.map((option) => (
              <Tabs.Tab
                className="font-sans font-semibold"
                key={option.value}
                value={option.value}
              >
                {option.label}
              </Tabs.Tab>
            ))}
            <Tabs.Indicator />
          </Tabs.List>
        </div>
        {children}
      </div>
    </Tabs.Root>
  );
}
