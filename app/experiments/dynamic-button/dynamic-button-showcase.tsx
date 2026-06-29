"use client";

import {
  CheckCircleIcon,
  CheckIcon,
  CommandIcon,
  CopyIcon,
  FloppyDiskIcon,
  type Icon,
  SpinnerGapIcon,
  UsersIcon,
} from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { DynamicButton } from "@/components/DynamicButton";
import { Tabs } from "@/components/public/Tabs";

type ButtonState = {
  icon: Icon;
  iconClassName?: string;
  iconWeight?: "bold" | "duotone" | "fill" | "light" | "regular" | "thin";
  label: string;
  stateKey: string;
};

type ButtonAction = ButtonState & {
  success?: ButtonState;
  successDelayMs?: number;
};

const buttonActions: readonly ButtonAction[] = [
  {
    icon: FloppyDiskIcon,
    label: "Save",
    stateKey: "save",
    success: {
      icon: CheckCircleIcon,
      iconClassName: "text-green-9",
      iconWeight: "fill",
      label: "Save",
      stateKey: "saved",
    },
  },
  {
    icon: CopyIcon,
    label: "Copy",
    stateKey: "copy",
    success: {
      icon: CheckCircleIcon,
      iconClassName: "text-green-9",
      iconWeight: "fill",
      label: "Copy",
      stateKey: "copied",
    },
  },
  {
    icon: UsersIcon,
    label: "Invite teammates",
    stateKey: "invite",
  },
  {
    icon: CommandIcon,
    label: "Open command palette",
    stateKey: "command",
  },
  {
    icon: SpinnerGapIcon,
    iconClassName: "animate-spin",
    label: "Processing",
    stateKey: "processing",
    successDelayMs: 3000,
    success: {
      icon: CheckIcon,
      label: "Done",
      stateKey: "done",
    },
  },
] as const;

const feedbackDurationMs = 1200;

export function DynamicButtonShowcase() {
  const [actionIndex, setActionIndex] = useState(0);
  const [feedback, setFeedback] = useState<ButtonState | null>(null);
  const [variant, setVariant] = useState<"primary" | "secondary">("primary");
  const feedbackTimerRef = useRef<number | null>(null);
  const successTimerRef = useRef<number | null>(null);

  const currentAction = buttonActions[actionIndex];
  const currentSuccess = currentAction.success;
  const visibleState = feedback ?? currentAction;
  const VisibleIcon = visibleState.icon;

  useEffect(() => {
    return () => {
      if (feedbackTimerRef.current !== null) {
        window.clearTimeout(feedbackTimerRef.current);
      }

      if (successTimerRef.current !== null) {
        window.clearTimeout(successTimerRef.current);
      }
    };
  }, []);

  function clearFeedback() {
    if (feedbackTimerRef.current !== null) {
      window.clearTimeout(feedbackTimerRef.current);
      feedbackTimerRef.current = null;
    }

    if (successTimerRef.current !== null) {
      window.clearTimeout(successTimerRef.current);
      successTimerRef.current = null;
    }

    setFeedback(null);
  }

  function showFeedback(nextFeedback: ButtonState) {
    clearFeedback();
    setFeedback(nextFeedback);
    feedbackTimerRef.current = window.setTimeout(() => {
      setFeedback(null);
      feedbackTimerRef.current = null;
    }, feedbackDurationMs);
  }

  function handleActionClick() {
    if (!currentSuccess) {
      return;
    }

    if (currentAction.successDelayMs) {
      return;
    }

    showFeedback(currentSuccess);
  }

  function selectAction(nextStateKey: string) {
    const nextIndex = buttonActions.findIndex(
      (action) => action.stateKey === nextStateKey,
    );

    if (nextIndex === -1) {
      return;
    }

    const nextAction = buttonActions[nextIndex];

    clearFeedback();
    setActionIndex(nextIndex);

    const delayedSuccess = nextAction.success;
    const delayMs = nextAction.successDelayMs;

    if (delayedSuccess && delayMs) {
      successTimerRef.current = window.setTimeout(() => {
        showFeedback(delayedSuccess);
        successTimerRef.current = null;
      }, delayMs);
    }
  }

  return (
    <div className="w-full overflow-hidden rounded-[13px] border border-grayscale-3 bg-grayscale-1 small-shadow dark:border-grayscale-4 dark:bg-grayscale-3 dark:shadow-none">
      <div className="flex min-h-72 items-center justify-center bg-white p-8 dark:bg-grayscale-2">
        <DynamicButton
          className="h-9 px-3 text-sm"
          icon={
            <VisibleIcon
              aria-hidden="true"
              className={visibleState.iconClassName}
              size={15}
              weight={visibleState.iconWeight ?? "bold"}
            />
          }
          onClick={handleActionClick}
          stateKey={`${visibleState.stateKey}:${visibleState.label}`}
          variant={variant}
        >
          {visibleState.label}
        </DynamicButton>
      </div>

      <div className="grid gap-4 border-grayscale-3 border-t p-4 dark:border-grayscale-4">
        <div className="flex min-w-0 flex-col gap-2">
          <span className="font-mono font-semibold text-[10px] text-grayscale-10 uppercase leading-none">
            Demo
          </span>
          <Tabs.Root
            onValueChange={selectAction}
            value={currentAction.stateKey}
          >
            <Tabs.List
              aria-label="Dynamic button demo"
              className="flex-wrap gap-1.5"
            >
              {buttonActions.map((action) => {
                const ActionIcon = action.icon;

                return (
                  <Tabs.Tab
                    className="flex h-7 items-center gap-1.5 rounded-md px-2 font-medium text-grayscale-11 text-xs transition-colors data-active:bg-grayscale-3 data-active:text-grayscale-12 data-active:small-shadow dark:data-active:bg-grayscale-4"
                    key={action.stateKey}
                    value={action.stateKey}
                  >
                    <ActionIcon aria-hidden="true" size={15} weight="bold" />
                    {action.label}
                  </Tabs.Tab>
                );
              })}
            </Tabs.List>
          </Tabs.Root>
        </div>
        <div className="flex flex-col gap-2">
          <span className="font-mono font-semibold text-[10px] text-grayscale-10 uppercase leading-none">
            Variant
          </span>
          <div className="flex flex-wrap gap-1.5">
            {(["primary", "secondary"] as const).map((nextVariant) => (
              <button
                className="h-7 rounded-md px-2 font-medium text-grayscale-11 text-xs transition-colors data-[active=true]:bg-grayscale-3 data-[active=true]:text-grayscale-12 data-[active=true]:small-shadow dark:data-[active=true]:bg-grayscale-4"
                data-active={variant === nextVariant}
                key={nextVariant}
                onClick={() => setVariant(nextVariant)}
                type="button"
              >
                {nextVariant === "primary" ? "Primary" : "Secondary"}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
