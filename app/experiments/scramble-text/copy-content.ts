export const usageSource = `"use client";

import { ArrowClockwiseIcon } from "@phosphor-icons/react";
import { useState } from "react";
import Button from "@/components/public/Button";
import { ScrambleText } from "@/components/ScrambleText";

const inviteCodes = [
  "7K4F2Q9M-X8NV",
  "H3Q89V2C-M7KA",
  "R6PF4L9T-Q2VX",
  "W9ND7B4H-K5TZ",
];

export function InviteCodeExample() {
  const [index, setIndex] = useState(0);

  return (
    <div className="flex items-center gap-3">
      <code>
        invite/<ScrambleText>{inviteCodes[index]}</ScrambleText>
      </code>
      <Button
        aria-label="Regenerate invite code"
        onClick={() => setIndex((value) => (value + 1) % inviteCodes.length)}
        type="button"
      >
        <ArrowClockwiseIcon aria-hidden="true" size={15} weight="bold" />
        Regenerate
      </Button>
    </div>
  );
}
`;
