export const usageSource = `import {
  CheckIcon,
  FloppyDiskIcon,
  SpinnerGapIcon,
} from "@phosphor-icons/react";
import { useState } from "react";
import { DynamicButton } from "./DynamicButton";

const states = {
  idle: { icon: FloppyDiskIcon, label: "Save changes", tone: "default" },
  saving: { icon: SpinnerGapIcon, label: "Saving changes", tone: "default" },
  saved: { icon: CheckIcon, label: "Saved", tone: "success" },
} as const;

type SaveStatus = keyof typeof states;

export function SaveButton({ onSave }: { onSave: () => Promise<void> }) {
  const [status, setStatus] = useState<SaveStatus>("idle");
  const { icon: Icon, label, tone } = states[status];

  async function handleClick() {
    if (status !== "idle") {
      return;
    }

    setStatus("saving");
    await onSave();
    setStatus("saved");
    window.setTimeout(() => setStatus("idle"), 1600);
  }

  return (
    <DynamicButton
      aria-busy={status === "saving"}
      icon={
        <Icon
          aria-hidden="true"
          className={status === "saving" ? "animate-spin" : undefined}
          size={15}
          weight="bold"
        />
      }
      iconKey={status}
      onClick={handleClick}
      tone={tone}
    >
      {label}
    </DynamicButton>
  );
}
`;
