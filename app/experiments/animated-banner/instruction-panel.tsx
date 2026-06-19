"use client";

import { CheckCircleIcon, CopyIcon } from "@phosphor-icons/react/dist/ssr";
import { useState } from "react";
import Button from "@/components/public/Button";

type InstructionPanelProps = {
  copyText: string;
  instructions: readonly {
    title: string;
    text: string;
  }[];
};

export function InstructionPanel({
  copyText,
  instructions,
}: InstructionPanelProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(copyText);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = copyText;
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
      <div className="flex items-center justify-between gap-4 border-grayscale-3 border-b p-2">
        <span className="rounded-md bg-grayscale-3 px-2 py-1 font-semibold text-grayscale-11 text-xs">
          Instructions
        </span>
        <Button
          aria-label="Copy prompt"
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
      <ol className="flex min-h-0 list-decimal flex-col gap-5 px-7 py-5 text-grayscale-11 text-sm leading-6">
        {instructions.map((instruction) => (
          <li key={instruction.title} className="pl-1">
            <h2 className="font-medium text-grayscale-12 text-sm">
              {instruction.title}
            </h2>
            <p className="mt-1 text-grayscale-10">{instruction.text}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}
