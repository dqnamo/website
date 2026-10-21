import type { ComponentType } from "react";

export type Essay = {
  Body: ComponentType;
  description: string;
  // An ISO date, read as UTC.
  publishedAt: string;
  slug: string;
  title: string;
};

const dateFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
  year: "numeric",
});

export function formatEssayDate(publishedAt: string) {
  return dateFormat.format(new Date(publishedAt));
}
