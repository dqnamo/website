"use client";

import { useState } from "react";
import type { CodeLine } from "@/helpers/syntax";
import { SignatureCreator } from "./signature-creator";
import { SourcePanel } from "./source-panel";

type SignatureLabProps = {
  componentLines: CodeLine[];
  componentSource: string;
  usageLines: CodeLine[];
  usageSource: string;
};

export function SignatureLab({
  componentLines,
  componentSource,
  usageLines,
  usageSource,
}: SignatureLabProps) {
  const [signaturePath, setSignaturePath] = useState("");

  return (
    <>
      <SignatureCreator onPathChange={setSignaturePath} />
      <div className="w-full overflow-hidden rounded-[13px] border border-grayscale-3 bg-grayscale-1 small-shadow dark:border-grayscale-4 dark:bg-grayscale-3 dark:shadow-none">
        <SourcePanel
          componentLines={componentLines}
          componentSource={componentSource}
          signaturePath={signaturePath}
          usageLines={usageLines}
          usageSource={usageSource}
        />
      </div>
    </>
  );
}
