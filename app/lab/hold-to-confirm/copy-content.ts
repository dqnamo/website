export const usageSource = `import { TrashIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { HoldToConfirmButton } from "@/components/HoldToConfirmButton";
import { UndoNotice } from "@/components/UndoNotice";

export function DeleteAction() {
  const [stage, setStage] = useState<"closed" | "idle" | "undo">("idle");

  if (stage === "closed") {
    return null;
  }

  if (stage === "undo") {
    return (
      <UndoNotice
        onExpire={() => setStage("closed")}
        onUndo={() => setStage("idle")}
      />
    );
  }

  return (
    <HoldToConfirmButton
      duration={1600}
      onConfirm={() => setStage("undo")}
      resetAfter={0}
    >
      <TrashIcon aria-hidden="true" size={15} weight="bold" />
      Hold to delete
    </HoldToConfirmButton>
  );
}`;
