"use client";

import { ArrowClockwiseIcon, CheckCircleIcon } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { DynamicButton } from "@/components/DynamicButton";
import { getButtonClassName } from "@/components/public/Button";
import { ScrambleText } from "@/components/ScrambleText";
import { cn } from "@/helpers/classname-helper";

type ScrambleTextShowcaseProps = {
  className?: string;
  interactive?: boolean;
};

const invitePath = "dqnamo.com/invite/";
const inviteCodes = [
  "7K4F2Q9M-X8NV",
  "H3Q89V2C-M7KA",
  "R6PF4L9T-Q2VX",
  "W9ND7B4H-K5TZ",
];

export function ScrambleTextShowcase({
  className,
  interactive = true,
}: ScrambleTextShowcaseProps) {
  const [index, setIndex] = useState(0);
  const [regenerated, setRegenerated] = useState(false);
  const feedbackTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (feedbackTimerRef.current !== null) {
        window.clearTimeout(feedbackTimerRef.current);
      }
    };
  }, []);

  function handleRegenerate() {
    setIndex((value) => (value + 1) % inviteCodes.length);
    setRegenerated(true);

    if (feedbackTimerRef.current !== null) {
      window.clearTimeout(feedbackTimerRef.current);
    }

    feedbackTimerRef.current = window.setTimeout(() => {
      setRegenerated(false);
      feedbackTimerRef.current = null;
    }, 1000);
  }

  const RegenerateIcon = regenerated ? CheckCircleIcon : ArrowClockwiseIcon;

  return (
    <div
      className={cn(
        "flex w-full items-center max-w-sm mx-auto justify-between gap-3 rounded-[13px] border border-grayscale-3 bg-white p-1.5 small-shadow dark:border-grayscale-4 dark:bg-grayscale-3",
        className,
      )}
    >
      <div className="min-w-0 flex-1 overflow-hidden rounded-lg  border-grayscale-3 bg-grayscale-2 p-1.5 font-mono text-[9px] text-grayscale-11 whitespace-nowrap dark:border-grayscale-5 dark:bg-grayscale-4 sm:text-xs">
        <span>{invitePath}</span>
        <ScrambleText>{inviteCodes[index]}</ScrambleText>
      </div>
      {interactive ? (
        <DynamicButton
          aria-label="Regenerate invite code"
          icon={
            <RegenerateIcon
              aria-hidden="true"
              className={regenerated ? "text-green-9" : undefined}
              size={15}
              weight={regenerated ? "fill" : "bold"}
            />
          }
          iconKey={regenerated ? "regenerated" : "regenerate"}
          className="shrink-0 text-xs"
          onClick={handleRegenerate}
          type="button"
          variant="primary"
        >
          Regenerate
        </DynamicButton>
      ) : (
        <span
          className={getButtonClassName({
            className: "shrink-0 text-xs whitespace-nowrap",
            variant: "primary",
          })}
        >
          <ArrowClockwiseIcon aria-hidden="true" size={15} weight="bold" />
          Regenerate
        </span>
      )}
    </div>
  );
}
