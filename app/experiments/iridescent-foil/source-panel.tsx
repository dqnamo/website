"use client";

import { CheckCircleIcon, CopyIcon } from "@phosphor-icons/react/dist/ssr";
import { useState } from "react";
import CodeBlock from "@/components/CodeBlock";
import Button from "@/components/public/Button";
import { Tabs } from "@/components/public/Tabs";
import type { CodeLine } from "@/helpers/syntax";

type SourcePanelProps = {
  tsxSource: string;
  cssSource: string;
  tsxLines: CodeLine[];
  cssLines: CodeLine[];
};

export function SourcePanel({
  tsxSource,
  cssSource,
  tsxLines,
  cssLines,
}: SourcePanelProps) {
  const [activeTab, setActiveTab] = useState<"tsx" | "css">("tsx");
  const [copied, setCopied] = useState(false);

  const sources = {
    tsx: tsxSource,
    css: cssSource,
  } as const;

  async function handleCopy() {
    await navigator.clipboard.writeText(sources[activeTab]);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }

  function handleTabChange(value: string) {
    setActiveTab(value as "tsx" | "css");
    setCopied(false);
  }

  return (
    <Tabs.Root
      className="flex flex-col"
      defaultValue="tsx"
      onValueChange={handleTabChange}
    >
      <div className="flex items-center justify-between gap-4 border-grayscale-3 border-b p-2">
        <Tabs.List>
          <Tabs.Tab className="font-mono font-semibold" value="tsx">
            IridescentFoil.tsx
          </Tabs.Tab>
          <Tabs.Tab className="font-mono font-semibold" value="css">
            IridescentFoil.module.css
          </Tabs.Tab>
          <Tabs.Indicator />
        </Tabs.List>
        <Button
          aria-label="Copy code"
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
          Copy
        </Button>
      </div>
      <Tabs.Panel
        className="mt-0 flex max-h-96 min-h-0 flex-col overflow-hidden"
        value="tsx"
      >
        <CodeBlock lines={tsxLines} />
      </Tabs.Panel>
      <Tabs.Panel
        className="mt-0 flex max-h-96 min-h-0 flex-col overflow-hidden"
        value="css"
      >
        <CodeBlock lines={cssLines} />
      </Tabs.Panel>
    </Tabs.Root>
  );
}
