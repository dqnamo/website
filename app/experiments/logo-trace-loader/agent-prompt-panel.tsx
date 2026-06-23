"use client";

import { CheckCircleIcon, CopyIcon } from "@phosphor-icons/react";
import { useState } from "react";
import Button from "@/components/public/Button";

type AgentPromptPanelProps = {
  prompt: string;
};

export function AgentPromptPanel({ prompt }: AgentPromptPanelProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(prompt);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = prompt;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.top = "-9999px";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }

    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between gap-4 border-grayscale-3 border-b p-2 dark:border-grayscale-4">
        <span className="rounded-md bg-grayscale-3 px-2 py-1 font-semibold text-grayscale-11 text-xs">
          Agent prompt
        </span>
        <Button
          aria-label="Copy prompt for coding agent"
          className="shrink-0 text-xs"
          onClick={handleCopy}
          type="button"
          variant="secondary"
        >
          {copied ? (
            <CheckCircleIcon className="text-green-9" size={15} weight="fill" />
          ) : (
            <CopyIcon size={15} weight="bold" />
          )}
          {copied ? "Copied" : "Copy prompt"}
        </Button>
      </div>

      <pre className="max-h-[34rem] overflow-auto whitespace-pre-wrap p-5 font-mono text-grayscale-11 text-xs leading-6">
        {prompt}
      </pre>
    </div>
  );
}
