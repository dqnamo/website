"use client";

import { CheckCircleIcon, CopyIcon } from "@phosphor-icons/react/dist/ssr";
import { useState } from "react";
import Button from "@/components/public/Button";

type CopyActionsProps = {
  agentPrompt: string;
  markdown: string;
};

type CopiedState = "agent" | "markdown" | null;

export function CopyActions({ agentPrompt, markdown }: CopyActionsProps) {
  const [copied, setCopied] = useState<CopiedState>(null);

  async function handleCopy(type: Exclude<CopiedState, null>, text: string) {
    await navigator.clipboard.writeText(text);
    setCopied(type);
    window.setTimeout(() => setCopied(null), 1200);
  }

  return (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      <Button
        aria-label="Copy prompt for coding agent"
        className="text-xs"
        onClick={() => handleCopy("agent", agentPrompt)}
        type="button"
        variant="secondary"
      >
        {copied === "agent" ? (
          <CheckCircleIcon className="text-green-9" size={15} weight="fill" />
        ) : (
          <CopyIcon size={15} weight="bold" />
        )}
        Copy prompt for coding agent
      </Button>
      <Button
        aria-label="Copy as markdown"
        className="text-xs"
        onClick={() => handleCopy("markdown", markdown)}
        type="button"
        variant="secondary"
      >
        {copied === "markdown" ? (
          <CheckCircleIcon className="text-green-9" size={15} weight="fill" />
        ) : (
          <CopyIcon size={15} weight="bold" />
        )}
        Copy as markdown
      </Button>
    </div>
  );
}
