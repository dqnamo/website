"use client";

import {
  ArrowClockwiseIcon,
  CheckIcon,
  ClipboardTextIcon,
  CommandIcon,
  CopyIcon,
  FloppyDiskIcon,
  type Icon,
  SpinnerGapIcon,
  UsersIcon,
} from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { DynamicButton } from "@/components/DynamicButton";
import Button from "@/components/public/Button";

type ButtonState = {
  icon: Icon;
  iconClassName?: string;
  iconKey: string;
  label: string;
};

type ButtonAction = ButtonState & {
  success?: ButtonState;
};

const buttonActions: readonly ButtonAction[] = [
  {
    icon: FloppyDiskIcon,
    iconKey: "save",
    label: "Save",
    success: {
      icon: CheckIcon,
      iconKey: "saved",
      label: "Saved",
    },
  },
  {
    icon: CopyIcon,
    iconKey: "copy",
    label: "Copy",
    success: {
      icon: ClipboardTextIcon,
      iconKey: "copied",
      label: "Copied",
    },
  },
  {
    icon: UsersIcon,
    iconKey: "invite",
    label: "Invite teammates",
  },
  {
    icon: CommandIcon,
    iconKey: "command",
    label: "Open command palette",
  },
  {
    icon: SpinnerGapIcon,
    iconClassName: "animate-spin",
    iconKey: "processing",
    label: "Processing",
    success: {
      icon: CheckIcon,
      iconKey: "done",
      label: "Done",
    },
  },
] as const;

const feedbackDurationMs = 1200;

export function DynamicButtonShowcase() {
  const [actionIndex, setActionIndex] = useState(0);
  const [customText, setCustomText] = useState("");
  const [feedback, setFeedback] = useState<ButtonState | null>(null);
  const [variant, setVariant] = useState<"primary" | "secondary">("primary");
  const feedbackTimerRef = useRef<number | null>(null);

  const currentAction = buttonActions[actionIndex];
  const currentSuccess = currentAction.success;
  const visibleState = feedback ?? {
    ...currentAction,
    label: customText.trim() || currentAction.label,
  };
  const VisibleIcon = visibleState.icon;

  useEffect(() => {
    return () => {
      if (feedbackTimerRef.current !== null) {
        window.clearTimeout(feedbackTimerRef.current);
      }
    };
  }, []);

  function clearFeedback() {
    if (feedbackTimerRef.current !== null) {
      window.clearTimeout(feedbackTimerRef.current);
      feedbackTimerRef.current = null;
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

  function handleCycle() {
    clearFeedback();
    setCustomText("");
    setActionIndex((currentIndex) => (currentIndex + 1) % buttonActions.length);
  }

  function handleActionClick() {
    if (currentSuccess) {
      showFeedback(currentSuccess);
      return;
    }

    handleCycle();
  }

  function selectAction(nextIndex: number) {
    clearFeedback();
    setCustomText("");
    setActionIndex(nextIndex);
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
              weight="bold"
            />
          }
          iconKey={visibleState.iconKey}
          onClick={handleActionClick}
          variant={variant}
        >
          {visibleState.label}
        </DynamicButton>
      </div>

      <div className="grid gap-4 border-grayscale-3 border-t p-4 dark:border-grayscale-4 sm:grid-cols-[1fr_auto]">
        <label className="flex min-w-0 flex-col gap-2">
          <span className="font-mono font-semibold text-[10px] text-grayscale-10 uppercase leading-none">
            Button text
          </span>
          <input
            className="h-9 min-w-0 rounded-lg border border-grayscale-3 bg-white px-3 text-grayscale-12 text-sm outline-none transition-colors placeholder:text-grayscale-9 focus:border-grayscale-7 dark:border-grayscale-5 dark:bg-grayscale-2"
            onChange={(event) => {
              clearFeedback();
              setCustomText(event.target.value);
            }}
            value={customText || currentAction.label}
          />
        </label>

        <div className="flex flex-col gap-2">
          <span className="font-mono font-semibold text-[10px] text-grayscale-10 uppercase leading-none">
            Variant
          </span>
          <div className="flex rounded-lg border border-grayscale-3 bg-grayscale-2 p-1 dark:border-grayscale-5 dark:bg-grayscale-2">
            {(["primary", "secondary"] as const).map((nextVariant) => (
              <button
                className="h-7 rounded-md px-2 font-medium text-grayscale-11 text-xs transition-colors data-[active=true]:bg-white data-[active=true]:text-grayscale-12 data-[active=true]:small-shadow dark:data-[active=true]:bg-grayscale-4"
                data-active={variant === nextVariant}
                key={nextVariant}
                onClick={() => setVariant(nextVariant)}
                type="button"
              >
                {nextVariant}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5 sm:col-span-2">
          {buttonActions.map((action, index) => {
            const ActionIcon = action.icon;

            return (
              <Button
                className="text-xs"
                key={action.iconKey}
                onClick={() => selectAction(index)}
                type="button"
                variant="secondary"
              >
                <ActionIcon aria-hidden="true" size={15} weight="bold" />
                {action.label}
              </Button>
            );
          })}
          {currentSuccess ? (
            <Button
              className="text-xs"
              onClick={() => showFeedback(currentSuccess)}
              type="button"
              variant="secondary"
            >
              <CheckIcon aria-hidden="true" size={15} weight="bold" />
              Show {currentSuccess.label}
            </Button>
          ) : null}
          <Button
            aria-label="Cycle button text"
            className="text-xs"
            onClick={handleCycle}
            type="button"
            variant="secondary"
          >
            <ArrowClockwiseIcon aria-hidden="true" size={15} weight="bold" />
            Cycle
          </Button>
        </div>
      </div>
    </div>
  );
}
