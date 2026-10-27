"use client";

import dynamic from "next/dynamic";
import { cn } from "@/helpers/classname-helper";
import { mapFont } from "./_lib/fonts";
import "./underground-map.css";

// The map keeps the drawing in localStorage, so it only ever renders in the browser.
const UndergroundMap = dynamic(() => import("./_components/UndergroundMap"), {
  ssr: false,
});

export function UndergroundMapLoader() {
  return (
    <div
      className={cn(
        // Fills the screen; the dock's tab floats over the bottom of the map.
        "underground-map fixed inset-0 bg-grayscale-1 font-sans text-grayscale-12",
        mapFont.variable,
      )}
    >
      <UndergroundMap />
    </div>
  );
}
