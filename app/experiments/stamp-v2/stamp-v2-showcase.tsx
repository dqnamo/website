"use client";

import { useId, useState } from "react";
import { StampSheet, StampV2 } from "@/components/StampV2";
import { StampArtwork, stampDesigns } from "./stamp-artwork";
import styles from "./stamp-v2-showcase.module.css";

const layouts = [
  { label: "Single", value: "single", columns: 1, count: 1 },
  { label: "2 × 1", value: "strip", columns: 2, count: 2 },
  { label: "2 × 2", value: "sheet", columns: 2, count: 4 },
] as const;

export function StampV2Showcase() {
  const [layout, setLayout] = useState<(typeof layouts)[number]>(layouts[2]);
  const layoutName = useId();

  return (
    <div className={styles.stage}>
      <div aria-hidden="true" className={styles.stageGrid} />
      <div className={styles.specimen}>
        {layout.value === "single" ? (
          <StampV2 aria-label="Single postage stamp">
            <StampArtwork design={stampDesigns[0]} />
          </StampV2>
        ) : (
          <StampSheet
            aria-label={`${layout.label} stamp sheet`}
            columns={layout.columns}
          >
            {stampDesigns.slice(0, layout.count).map((design) => (
              <StampArtwork design={design} key={design.id} />
            ))}
          </StampSheet>
        )}
      </div>
      <fieldset className={styles.layouts}>
        <legend className="sr-only">Stamp layout</legend>
        {layouts.map((option) => (
          <label className={styles.layoutOption} key={option.value}>
            <input
              checked={layout.value === option.value}
              className="sr-only"
              name={layoutName}
              onChange={() => setLayout(option)}
              type="radio"
              value={option.value}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </fieldset>
    </div>
  );
}
