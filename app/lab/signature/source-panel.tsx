"use client";

import { CheckCircleIcon, CopyIcon } from "@phosphor-icons/react/dist/ssr";
import { useMemo, useState } from "react";
import CodeBlock from "@/components/CodeBlock";
import Button from "@/components/public/Button";
import { Tabs } from "@/components/public/Tabs";
import type { CodeLine } from "@/helpers/syntax";
import { SIGNATURE_FALLBACK_PATH, SIGNATURE_PATH_PLACEHOLDER } from "./copy-content";

type SourcePanelProps = {
  componentLines: CodeLine[];
  componentSource: string;
  usageLines: CodeLine[];
  usageSource: string;
  signaturePath?: string;
};

function applyPathToLines(lines: CodeLine[], path: string): CodeLine[] {
  return lines.map((line) => ({
    ...line,
    tokens: line.tokens.map((token) =>
      token.content.includes(SIGNATURE_PATH_PLACEHOLDER)
        ? {
            ...token,
            content: token.content.replaceAll(
              SIGNATURE_PATH_PLACEHOLDER,
              path,
            ),
          }
        : token,
    ),
  }));
}

export function SourcePanel({
  componentLines,
  componentSource,
  usageLines,
  usageSource,
  signaturePath,
}: SourcePanelProps) {
  const [activeTab, setActiveTab] = useState<"component" | "usage">(
    "component",
  );
  const [copied, setCopied] = useState(false);

  const effectivePath = signaturePath || SIGNATURE_FALLBACK_PATH;

  const resolvedUsageLines = useMemo(
    () => applyPathToLines(usageLines, effectivePath),
    [usageLines, effectivePath],
  );
  const resolvedUsageSource = useMemo(
    () => usageSource.replaceAll(SIGNATURE_PATH_PLACEHOLDER, effectivePath),
    [usageSource, effectivePath],
  );

  const sources = {
    component: componentSource,
    usage: resolvedUsageSource,
  } as const;

  async function handleCopy() {
    await navigator.clipboard.writeText(sources[activeTab]);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }

  function handleTabChange(value: string) {
    setActiveTab(value as "component" | "usage");
    setCopied(false);
  }

  return (
    <Tabs.Root
      className="flex flex-col"
      defaultValue="component"
      onValueChange={handleTabChange}
    >
      <div className="flex items-center justify-between gap-4 border-grayscale-3 border-b p-2 dark:border-grayscale-4">
        <Tabs.List>
          <Tabs.Tab className="font-mono font-semibold" value="component">
            Signature.tsx
          </Tabs.Tab>
          <Tabs.Tab className="font-mono font-semibold" value="usage">
            Usage.tsx
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
        value="component"
      >
        <CodeBlock lines={componentLines} />
      </Tabs.Panel>
      <Tabs.Panel
        className="mt-0 flex max-h-96 min-h-0 flex-col overflow-hidden"
        value="usage"
      >
        <CodeBlock lines={resolvedUsageLines} />
      </Tabs.Panel>
    </Tabs.Root>
  );
}
