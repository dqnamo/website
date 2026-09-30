"use client";

import posthog from "posthog-js";
import type { ComponentProps } from "react";
import Button from "@/components/public/Button";

type BookCallButtonProps = Omit<
  Extract<ComponentProps<typeof Button>, { href: string }>,
  "href" | "onClick"
> & {
  location: string;
};

export function BookCallButton({ location, ...props }: BookCallButtonProps) {
  return (
    <Button
      {...props}
      href="https://cal.com/interface.london/20min"
      rel="noopener noreferrer"
      target="_blank"
      onClick={() => posthog.capture("work_with_me_cta_clicked", { location })}
    />
  );
}
