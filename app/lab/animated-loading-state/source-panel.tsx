"use client";

import { CheckCircleIcon, CopyIcon } from "@phosphor-icons/react/dist/ssr";
import { useState } from "react";
import CodeBlock from "@/components/CodeBlock";
import Button from "@/components/public/Button";
import { Tabs } from "@/components/public/Tabs";
import type { CodeLine } from "@/helpers/syntax";

type SourcePanelProps = {
  packageJsonLines: CodeLine[];
  packageJsonSource: string;
  packageSource: string;
  packageSourceLines: CodeLine[];
  readmeLines: CodeLine[];
  readmeSource: string;
  usageLines: CodeLine[];
  usageSource: string;
};

type ActiveTab = "usage" | "source" | "readme" | "package";

export function SourcePanel({
  packageJsonLines,
  packageJsonSource,
  packageSource,
  packageSourceLines,
  readmeLines,
  readmeSource,
  usageLines,
  usageSource,
}: SourcePanelProps) {
  const [activeTab, setActiveTab] = useState<ActiveTab>("usage");
  const [copied, setCopied] = useState(false);

  const sources = {
    usage: usageSource,
    source: packageSource,
    readme: readmeSource,
    package: packageJsonSource,
  } satisfies Record<ActiveTab, string>;

  async function handleCopy() {
    await navigator.clipboard.writeText(sources[activeTab]);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }

  function handleTabChange(value: string) {
    setActiveTab(value as ActiveTab);
    setCopied(false);
  }

  return (
    <Tabs.Root
      className="flex flex-col"
      defaultValue="usage"
      onValueChange={handleTabChange}
    >
      <div className="flex flex-col items-start justify-between gap-2 border-grayscale-3 border-b p-2 sm:flex-row sm:items-center sm:gap-4">
        <div className="min-w-0 max-w-full overflow-x-auto">
          <Tabs.List className="min-w-max">
            <Tabs.Tab className="font-mono font-semibold" value="usage">
              usage
            </Tabs.Tab>
            <Tabs.Tab className="font-mono font-semibold" value="source">
              source
            </Tabs.Tab>
            <Tabs.Tab className="font-mono font-semibold" value="readme">
              readme
            </Tabs.Tab>
            <Tabs.Tab className="font-mono font-semibold" value="package">
              package
            </Tabs.Tab>
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
      <Tabs.Panel
        className="mt-0 flex max-h-96 min-h-0 flex-col overflow-hidden"
        value="usage"
      >
        <CodeBlock lines={usageLines} />
      </Tabs.Panel>
      <Tabs.Panel
        className="mt-0 flex max-h-96 min-h-0 flex-col overflow-hidden"
        value="source"
      >
        <CodeBlock lines={packageSourceLines} />
      </Tabs.Panel>
      <Tabs.Panel
        className="mt-0 flex max-h-96 min-h-0 flex-col overflow-hidden"
        value="readme"
      >
        <CodeBlock lines={readmeLines} />
      </Tabs.Panel>
      <Tabs.Panel
        className="mt-0 flex max-h-96 min-h-0 flex-col overflow-hidden"
        value="package"
      >
        <CodeBlock lines={packageJsonLines} />
      </Tabs.Panel>
    </Tabs.Root>
  );
}
