"use client";

import { CheckCircleIcon, CopyIcon } from "@phosphor-icons/react/dist/ssr";
import { useMemo, useState } from "react";
import CodeBlock from "@/components/CodeBlock";
import Button from "@/components/public/Button";
import { Tabs } from "@/components/public/Tabs";
import type { CodeLine } from "@/helpers/syntax";

export type SourcePanelTab = {
  label: string;
  lines: CodeLine[];
  source: string;
  value: string;
};

type SourcePanelProps = {
  defaultValue?: string;
  tabs: SourcePanelTab[];
};

export function SourcePanel({ defaultValue, tabs }: SourcePanelProps) {
  const initialValue = defaultValue ?? tabs[0]?.value ?? "";
  const [activeTab, setActiveTab] = useState(initialValue);
  const [copied, setCopied] = useState(false);
  const activeSource = useMemo(
    () =>
      tabs.find((tab) => tab.value === activeTab)?.source ??
      tabs[0]?.source ??
      "",
    [activeTab, tabs],
  );

  async function handleCopy() {
    await navigator.clipboard.writeText(activeSource);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }

  function handleTabChange(value: string) {
    setActiveTab(value);
    setCopied(false);
  }

  return (
    <Tabs.Root
      className="flex flex-col"
      defaultValue={initialValue}
      onValueChange={handleTabChange}
    >
      <div className="flex flex-col items-start justify-between gap-2 border-grayscale-3 border-b p-2 dark:border-grayscale-4 sm:flex-row sm:items-center sm:gap-4">
        <div className="min-w-0 max-w-full overflow-x-auto">
          <Tabs.List className="min-w-max">
            {tabs.map((tab) => (
              <Tabs.Tab
                className="font-mono font-semibold"
                key={tab.value}
                value={tab.value}
              >
                {tab.label}
              </Tabs.Tab>
            ))}
            <Tabs.Indicator />
          </Tabs.List>
        </div>
        <Button
          aria-label="Copy active source"
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
      {tabs.map((tab) => (
        <Tabs.Panel
          className="mt-0 flex max-h-96 min-h-0 flex-col overflow-hidden"
          key={tab.value}
          value={tab.value}
        >
          <CodeBlock lines={tab.lines} />
        </Tabs.Panel>
      ))}
    </Tabs.Root>
  );
}
