"use client";

import {
  ArrowClockwiseIcon,
  CaretRightIcon,
  CheckCircleIcon,
  CheckIcon,
  CopyIcon,
  FloppyDiskIcon,
  type Icon,
  type IconWeight,
  RocketLaunchIcon,
  SpinnerGapIcon,
  UserCheckIcon,
  UserPlusIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import { LayoutGroup, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { DynamicButton } from "@/components/DynamicButtonV2";
import { Tabs } from "@/components/public/Tabs";
import { cn } from "@/helpers/classname-helper";

type FrameState = "active" | "error" | "idle" | "pending" | "success";

type Frame = {
  // Automatically move to another frame after a pause.
  after?: { frame: string; ms: number };
  icon: Icon;
  iconClassName?: string;
  iconWeight?: IconWeight;
  id: string;
  label: string;
  // The frame a click on the button moves to.
  press?: string;
  state: FrameState;
  tone?: "danger" | "default" | "success";
};

type Scenario = {
  frames: readonly Frame[];
  icon: Icon;
  id: string;
  label: string;
};

const spinner = {
  icon: SpinnerGapIcon,
  iconClassName: "animate-spin",
  state: "pending",
} as const;

const success = {
  icon: CheckIcon,
  state: "success",
  tone: "success",
} as const;

const scenarios: readonly Scenario[] = [
  {
    frames: [
      {
        icon: CopyIcon,
        id: "idle",
        label: "Copy link",
        press: "copied",
        state: "idle",
      },
      {
        after: { frame: "idle", ms: 1600 },
        icon: CheckCircleIcon,
        iconClassName: "text-green-9",
        iconWeight: "fill",
        id: "copied",
        label: "Copied",
        press: "copied",
        state: "success",
      },
    ],
    icon: CopyIcon,
    id: "copy",
    label: "Copy",
  },
  {
    frames: [
      {
        icon: FloppyDiskIcon,
        id: "idle",
        label: "Save changes",
        press: "saving",
        state: "idle",
      },
      {
        ...spinner,
        after: { frame: "saved", ms: 1400 },
        id: "saving",
        label: "Saving changes",
      },
      {
        ...success,
        after: { frame: "idle", ms: 1600 },
        id: "saved",
        label: "Saved",
      },
    ],
    icon: FloppyDiskIcon,
    id: "save",
    label: "Save",
  },
  {
    frames: [
      {
        icon: UserPlusIcon,
        id: "idle",
        label: "Follow",
        press: "following",
        state: "idle",
      },
      {
        icon: UserCheckIcon,
        id: "following",
        label: "Following",
        press: "idle",
        state: "active",
      },
    ],
    icon: UserPlusIcon,
    id: "follow",
    label: "Follow",
  },
  {
    frames: [
      {
        icon: RocketLaunchIcon,
        id: "idle",
        label: "Deploy",
        press: "deploying",
        state: "idle",
      },
      {
        ...spinner,
        after: { frame: "failed", ms: 1600 },
        id: "deploying",
        label: "Deploying",
      },
      {
        after: { frame: "retry", ms: 1200 },
        icon: WarningCircleIcon,
        iconWeight: "fill",
        id: "failed",
        label: "Failed",
        state: "error",
        tone: "danger",
      },
      {
        icon: ArrowClockwiseIcon,
        id: "retry",
        label: "Retry",
        press: "redeploying",
        state: "error",
        tone: "danger",
      },
      {
        ...spinner,
        after: { frame: "deployed", ms: 1600 },
        id: "redeploying",
        label: "Deploying",
      },
      {
        ...success,
        after: { frame: "idle", ms: 1800 },
        id: "deployed",
        label: "Deployed",
      },
    ],
    icon: RocketLaunchIcon,
    id: "deploy",
    label: "Deploy",
  },
];

const variants = ["primary", "secondary"] as const;

type Variant = (typeof variants)[number];

const stateDotClassNames: Record<FrameState, string> = {
  active: "bg-accent-9",
  error: "bg-red-9",
  idle: "bg-grayscale-8",
  pending: "bg-amber-9",
  success: "bg-green-9",
};

const segmentedListClassName =
  "rounded-[10px] border border-grayscale-3 bg-grayscale-2 dark:border-grayscale-4 dark:bg-grayscale-3";

const segmentedTabClassName =
  "flex h-7 items-center gap-1.5 rounded-[9px] px-2.5 font-medium text-grayscale-10 text-xs transition-colors hover:text-grayscale-11 data-active:text-grayscale-12";

const segmentedIndicatorClassName =
  "rounded-[9px] border border-grayscale-3 bg-white dark:border-grayscale-6 dark:bg-grayscale-5";

export function DynamicButtonV2Showcase() {
  const [scenarioId, setScenarioId] = useState(scenarios[0].id);
  const [frameId, setFrameId] = useState(scenarios[0].frames[0].id);
  const [variant, setVariant] = useState<Variant>("primary");
  const timerRef = useRef<number | null>(null);
  const shouldReduceMotion = useReducedMotion();

  const scenario =
    scenarios.find((candidate) => candidate.id === scenarioId) ?? scenarios[0];
  const frame =
    scenario.frames.find((candidate) => candidate.id === frameId) ??
    scenario.frames[0];
  const FrameIcon = frame.icon;

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, []);

  function goTo(nextScenario: Scenario, nextFrameId: string) {
    const nextFrame = nextScenario.frames.find(
      (candidate) => candidate.id === nextFrameId,
    );

    if (!nextFrame) {
      return;
    }

    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    setFrameId(nextFrame.id);

    const { after } = nextFrame;

    if (after) {
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        goTo(nextScenario, after.frame);
      }, after.ms);
    }
  }

  function handlePress() {
    if (frame.press) {
      goTo(scenario, frame.press);
    }
  }

  function selectScenario(nextId: string) {
    const nextScenario = scenarios.find((candidate) => candidate.id === nextId);

    if (!nextScenario) {
      return;
    }

    setScenarioId(nextScenario.id);
    goTo(nextScenario, nextScenario.frames[0].id);
  }

  return (
    <div className="relative flex min-h-96 w-full flex-col overflow-hidden rounded-[13px] border border-grayscale-3 bg-white small-shadow dark:border-grayscale-4 dark:bg-grayscale-2 dark:shadow-none">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle,var(--color-grayscale-5)_1px,transparent_1.5px)] bg-size-[14px_14px] opacity-60 [mask-image:radial-gradient(ellipse_at_center,black_10%,transparent_65%)] dark:opacity-40"
      />

      <div className="relative flex flex-wrap items-center justify-between gap-2 p-3">
        <Tabs.Root onValueChange={selectScenario} value={scenario.id}>
          <Tabs.List aria-label="Scenario" className={segmentedListClassName}>
            {scenarios.map((option) => {
              const OptionIcon = option.icon;

              return (
                <Tabs.Tab
                  className={segmentedTabClassName}
                  key={option.id}
                  value={option.id}
                >
                  <OptionIcon
                    aria-hidden="true"
                    className="hidden sm:block"
                    size={13}
                    weight="bold"
                  />
                  {option.label}
                </Tabs.Tab>
              );
            })}
            <Tabs.Indicator className={segmentedIndicatorClassName} />
          </Tabs.List>
        </Tabs.Root>

        <Tabs.Root
          onValueChange={(value: Variant) => setVariant(value)}
          value={variant}
        >
          <Tabs.List aria-label="Variant" className={segmentedListClassName}>
            {variants.map((option) => (
              <Tabs.Tab
                className={segmentedTabClassName}
                key={option}
                value={option}
              >
                {option === "primary" ? "Primary" : "Secondary"}
              </Tabs.Tab>
            ))}
            <Tabs.Indicator className={segmentedIndicatorClassName} />
          </Tabs.List>
        </Tabs.Root>
      </div>

      <div className="relative flex flex-1 items-center justify-center px-4 py-12">
        <DynamicButton
          aria-busy={frame.state === "pending"}
          icon={
            <FrameIcon
              aria-hidden="true"
              className={frame.iconClassName}
              size={15}
              weight={frame.iconWeight ?? "bold"}
            />
          }
          iconKey={`${scenario.id}:${frame.id}`}
          onClick={handlePress}
          tone={frame.tone}
          variant={variant}
        >
          {frame.label}
        </DynamicButton>
      </div>

      <LayoutGroup id="dynamic-button-states">
        <ol
          aria-label="Button states"
          className="relative flex flex-wrap items-center justify-center gap-x-0.5 gap-y-1 p-3"
        >
          {scenario.frames.map((option, index) => {
            const isActive = option.id === frame.id;

            return (
              <li className="flex items-center gap-0.5" key={option.id}>
                {index > 0 ? (
                  <CaretRightIcon
                    aria-hidden="true"
                    className="text-grayscale-7"
                    size={10}
                    weight="bold"
                  />
                ) : null}
                <button
                  aria-current={isActive ? "step" : undefined}
                  className={cn(
                    "relative flex h-6 cursor-pointer items-center gap-1.5 rounded-md px-2 font-mono font-semibold text-[10px] uppercase leading-none transition-colors",
                    isActive
                      ? "text-grayscale-12"
                      : "text-grayscale-9 hover:text-grayscale-11",
                  )}
                  onClick={() => goTo(scenario, option.id)}
                  type="button"
                >
                  {isActive ? (
                    <motion.span
                      className="absolute inset-0 rounded-md bg-grayscale-3 dark:bg-grayscale-4"
                      layoutId="active-state"
                      transition={
                        shouldReduceMotion
                          ? { duration: 0 }
                          : { bounce: 0, duration: 0.3, type: "spring" }
                      }
                    />
                  ) : null}
                  <span
                    className={cn(
                      "relative size-1.5 rounded-full transition-[background-color,opacity] duration-200",
                      stateDotClassNames[option.state],
                      isActive ? "opacity-100" : "opacity-50",
                    )}
                  />
                  <span className="relative">{option.label}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </LayoutGroup>
    </div>
  );
}
