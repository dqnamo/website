"use client";

import { CheckCircleIcon, CopyIcon } from "@phosphor-icons/react/dist/ssr";
import { useState } from "react";
import Button from "@/components/public/Button";

type PackageActionsProps = {
  installCommand: string;
  markdown: string;
  usageSource: string;
};

type CopiedState = "install" | "usage" | "markdown" | null;

export function PackageActions({
  installCommand,
  markdown,
  usageSource,
}: PackageActionsProps) {
  const [copied, setCopied] = useState<CopiedState>(null);

  async function handleCopy(type: Exclude<CopiedState, null>, text: string) {
    await navigator.clipboard.writeText(text);
    setCopied(type);
    window.setTimeout(() => setCopied(null), 1200);
  }

  function iconFor(type: Exclude<CopiedState, null>) {
    if (copied === type) {
      return (
        <CheckCircleIcon className="text-green-9" size={15} weight="fill" />
      );
    }

    return <CopyIcon size={15} weight="bold" />;
  }

  return (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      <Button
        aria-label="Copy install command"
        className="font-mono text-xs"
        onClick={() => handleCopy("install", installCommand)}
        type="button"
        variant="secondary"
      >
        {iconFor("install")}
        npm install
      </Button>
      <Button
        aria-label="Copy usage example"
        className="text-xs"
        onClick={() => handleCopy("usage", usageSource)}
        type="button"
        variant="secondary"
      >
        {iconFor("usage")}
        Copy usage
      </Button>
      <Button
        aria-label="Copy package markdown"
        className="text-xs"
        onClick={() => handleCopy("markdown", markdown)}
        type="button"
        variant="secondary"
      >
        {iconFor("markdown")}
        Copy markdown
      </Button>
    </div>
  );
}
