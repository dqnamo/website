import type { Essay } from "../_lib/essays";
import { post as motionShouldExplain } from "./motion-should-explain";
import { post as notesFromTheKitchen } from "./notes-from-the-kitchen";
import { post as theBottomBorder } from "./the-bottom-border";

// Placeholder posts for now. To add one, write it alongside these and list it here.
export const essays: readonly Essay[] = [
  motionShouldExplain,
  notesFromTheKitchen,
  theBottomBorder,
].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));

export function getEssay(slug: string) {
  return essays.find((essay) => essay.slug === slug);
}
