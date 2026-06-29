"use client";

import { PreviewCard } from "@base-ui/react/preview-card";
import {
  BrainIcon,
  CaretDownIcon,
  LightningIcon,
  MagnifyingGlassIcon,
  PaperPlaneTiltIcon,
} from "@phosphor-icons/react";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import Button from "@/components/public/Button";
import { Combobox } from "@/components/public/Combobox";
import { MetricBar } from "@/components/public/MetricBar";
import { Radio } from "@/components/public/Radio";
import { Tooltip } from "@/components/public/Tooltip";
import { cn } from "@/helpers/classname-helper";

export type LlmModel = {
  value: string;
  label: string;
  provider: string;
  description: string;
  contextWindow: string;
  inputPrice: string;
  outputPrice: string;
  hasSpeedConfiguration?: boolean;
  metrics: {
    intelligence: number;
    speed: number;
    context: number;
    cost: number;
  };
};

export const DEFAULT_LLM_MODELS: LlmModel[] = [
  {
    value: "claude-fable-5",
    label: "Claude Fable 5",
    provider: "Anthropic",
    description:
      "Anthropic's newest frontier model with Opus fallback for difficult reasoning tasks.",
    contextWindow: "1M tokens",
    inputPrice: "$12.50 / 1M",
    outputPrice: "$50.00 / 1M",
    metrics: { intelligence: 10, speed: 5, context: 10, cost: 10 },
  },
  {
    value: "claude-opus-4.8",
    label: "Claude Opus 4.8",
    provider: "Anthropic",
    description:
      "Flagship Claude model for long-horizon coding, analysis, and agentic work.",
    contextWindow: "1M tokens",
    inputPrice: "$5.00 / 1M",
    outputPrice: "$25.00 / 1M",
    metrics: { intelligence: 9, speed: 5, context: 10, cost: 5 },
  },
  {
    value: "gpt-5.5-xhigh",
    label: "GPT-5.5",
    provider: "OpenAI",
    description:
      "OpenAI's strongest GPT-5.5 reasoning configuration for frontier coding and agentic workflows.",
    contextWindow: "920K tokens",
    inputPrice: "$5.00 / 1M",
    outputPrice: "$30.00 / 1M",
    hasSpeedConfiguration: true,
    metrics: { intelligence: 9, speed: 5, context: 9, cost: 5 },
  },
  {
    value: "gemini-3.1-pro-preview",
    label: "Gemini 3.1 Pro Preview",
    provider: "Gemini",
    description:
      "Google DeepMind's latest Gemini flagship with leading reasoning, coding, and multimodal input.",
    contextWindow: "1M tokens",
    inputPrice: "$2.00 / 1M",
    outputPrice: "$12.00 / 1M",
    metrics: { intelligence: 9, speed: 10, context: 10, cost: 2 },
  },
];

const DEFAULT_MODEL =
  DEFAULT_LLM_MODELS.find((model) => model.value === "claude-fable-5") ??
  DEFAULT_LLM_MODELS[0];

const PROVIDER_LOGOS: Record<
  string,
  {
    src: string;
    className?: string;
  }
> = {
  Anthropic: {
    src: "/logos/model-selector/anthropic.png",
  },
  Gemini: {
    src: "/logos/model-selector/gemini.png",
  },
  OpenAI: {
    src: "/logos/model-selector/openai.png",
    className: "dark:invert",
  },
};

export type ReasoningLevel = "low" | "medium" | "high";
export type SpeedLevel = "standard" | "fast";

export type ModelConfiguration = {
  reasoning: ReasoningLevel;
  speed: SpeedLevel;
};

export type ModelSelectorSubmitPayload = {
  configuration: ModelConfiguration;
  configurations: Record<string, ModelConfiguration>;
  model: LlmModel;
  prompt: string;
};

export type ModelSelectorPromptProps = {
  className?: string;
  configurations?: Record<string, ModelConfiguration>;
  defaultConfigurations?: Record<string, ModelConfiguration>;
  defaultPrompt?: string;
  defaultValue?: string;
  disabled?: boolean;
  models?: readonly LlmModel[];
  onConfigurationChange?: (
    modelValue: string,
    configuration: ModelConfiguration,
    configurations: Record<string, ModelConfiguration>,
  ) => void;
  onModelChange?: (model: LlmModel) => void;
  onPromptChange?: (prompt: string) => void;
  onSubmit?: (payload: ModelSelectorSubmitPayload) => void | Promise<void>;
  placeholder?: string;
  prompt?: string;
  value?: string;
};

const DEFAULT_MODEL_CONFIGURATION: ModelConfiguration = {
  reasoning: "medium",
  speed: "standard",
};

function getModelConfiguration(
  configurations: Record<string, ModelConfiguration>,
  modelValue: string,
): ModelConfiguration {
  return configurations[modelValue] ?? DEFAULT_MODEL_CONFIGURATION;
}

const REASONING_INTELLIGENCE_DELTA: Record<ReasoningLevel, number> = {
  low: -2,
  medium: 0,
  high: 2,
};

const SPEED_METRIC_DELTA: Record<SpeedLevel, number> = {
  standard: 0,
  fast: 2,
};

function clampMetric(value: number) {
  return Math.min(10, Math.max(1, Math.round(value)));
}

function ProviderIcon({
  provider,
  className,
}: {
  provider: string;
  className?: string;
}) {
  const logo = PROVIDER_LOGOS[provider];

  if (!logo) {
    return null;
  }

  return (
    <Image
      alt=""
      aria-hidden="true"
      className={cn(
        "size-3 shrink-0 object-contain",
        logo.className,
        className,
      )}
      height={16}
      src={logo.src}
      width={16}
    />
  );
}

function ProviderLabel({
  provider,
  className,
}: {
  provider: string;
  className?: string;
}) {
  return (
    <span className={cn("flex min-w-0 items-center gap-1.5", className)}>
      <ProviderIcon provider={provider} />
      <span className="truncate">{provider}</span>
    </span>
  );
}

const REASONING_LABELS: Record<ReasoningLevel, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

function ModelConfigurationBadge({
  model,
  configuration,
}: {
  model: LlmModel;
  configuration: ModelConfiguration;
}) {
  const showReasoning = configuration.reasoning !== "medium";
  const showFast =
    model.hasSpeedConfiguration && configuration.speed === "fast";

  if (!showReasoning && !showFast) {
    return null;
  }

  const badgeClassName =
    "inline-flex items-center gap-0.5 rounded-md bg-grayscale-3 px-1 py-0.5 text-grayscale-11 text-tiny group-data-[selected]:bg-grayscale-5 dark:bg-grayscale-6 dark:text-grayscale-11 dark:group-data-[selected]:bg-grayscale-5";

  return (
    <div className="flex shrink-0 items-center gap-1">
      {showReasoning ? (
        <span className={badgeClassName}>
          <BrainIcon className="text-grayscale-11" size={11} weight="fill" />
          {REASONING_LABELS[configuration.reasoning]}
        </span>
      ) : null}
      {showFast ? (
        <span className={badgeClassName}>
          <LightningIcon className="text-amber-9" size={11} weight="fill" />
          Fast
        </span>
      ) : null}
    </div>
  );
}

function ModelPreviewPanel({
  model,
  configuration,
  onConfigurationChange,
}: {
  model: LlmModel;
  configuration: ModelConfiguration;
  onConfigurationChange: (update: Partial<ModelConfiguration>) => void;
}) {
  const { reasoning, speed } = configuration;

  const adjustedMetrics = useMemo(
    () => ({
      intelligence: clampMetric(
        model.metrics.intelligence + REASONING_INTELLIGENCE_DELTA[reasoning],
      ),
      speed: clampMetric(
        model.metrics.speed +
          (model.hasSpeedConfiguration ? SPEED_METRIC_DELTA[speed] : 0),
      ),
      context: model.metrics.context,
      cost: model.metrics.cost,
    }),
    [model.hasSpeedConfiguration, model.metrics, reasoning, speed],
  );

  return (
    <Tooltip.Provider>
      <div className="flex w-56 flex-col divide-y divide-grayscale-4 dark:divide-grayscale-6">
        <div className="flex flex-col gap-3 p-3">
          <div className="flex flex-col gap-1">
            <p className="font-medium text-grayscale-12 text-sm">
              {model.label}
            </p>
            <ProviderLabel
              className="text-grayscale-11/80 text-xs"
              provider={model.provider}
            />
          </div>
          <p className="text-pretty text-grayscale-11 text-xs leading-4">
            {model.description}
          </p>
          <div className="mt-2 grid grid-cols-2 gap-4 text-xs">
            <MetricBar
              animationKey={model.value}
              label="Intelligence"
              value={adjustedMetrics.intelligence}
            />
            <MetricBar
              animationKey={model.value}
              label="Speed"
              value={adjustedMetrics.speed}
            />
            <MetricBar
              animationKey={model.value}
              info={`${model.contextWindow} context window`}
              label="Context"
              value={adjustedMetrics.context}
            />
            <MetricBar
              animationKey={model.value}
              info={`${model.inputPrice} input · ${model.outputPrice} output`}
              invert
              label="Cost"
              value={adjustedMetrics.cost}
            />
          </div>
        </div>

        <div className="flex flex-col gap-3 p-3">
          <p className="text-grayscale-11 text-tiny font-semibold font-mono uppercase leading-none">
            Configuration
          </p>

          <div className="flex flex-col gap-2">
            <p className="text-grayscale-11/80 text-xs leading-none">
              Reasoning
            </p>
            <Radio.Group
              aria-label="Reasoning level"
              onValueChange={(value) =>
                onConfigurationChange({ reasoning: value as ReasoningLevel })
              }
              value={reasoning}
            >
              <Radio.Root
                className="dark:bg-grayscale-6 dark:text-grayscale-11 dark:hover:bg-grayscale-7 dark:hover:text-grayscale-12 dark:data-[checked]:bg-grayscale-7 dark:data-[checked]:text-grayscale-12"
                value="low"
              >
                Low
              </Radio.Root>
              <Radio.Root
                className="dark:bg-grayscale-6 dark:text-grayscale-11 dark:hover:bg-grayscale-7 dark:hover:text-grayscale-12 dark:data-[checked]:bg-grayscale-7 dark:data-[checked]:text-grayscale-12"
                value="medium"
              >
                Medium
              </Radio.Root>
              <Radio.Root
                className="dark:bg-grayscale-6 dark:text-grayscale-11 dark:hover:bg-grayscale-7 dark:hover:text-grayscale-12 dark:data-[checked]:bg-grayscale-7 dark:data-[checked]:text-grayscale-12"
                value="high"
              >
                High
              </Radio.Root>
            </Radio.Group>
          </div>

          {model.hasSpeedConfiguration ? (
            <div className="flex flex-col gap-2">
              <p className="text-grayscale-11/80 text-xs leading-none">Speed</p>
              <Radio.Group
                aria-label="Speed"
                onValueChange={(value) =>
                  onConfigurationChange({ speed: value as SpeedLevel })
                }
                value={speed}
              >
                <Radio.Root
                  className="dark:bg-grayscale-6 dark:text-grayscale-11 dark:hover:bg-grayscale-7 dark:hover:text-grayscale-12 dark:data-[checked]:bg-grayscale-7 dark:data-[checked]:text-grayscale-12"
                  value="standard"
                >
                  Standard
                </Radio.Root>
                <Radio.Root
                  className="dark:bg-grayscale-6 dark:text-grayscale-11 dark:hover:bg-grayscale-7 dark:hover:text-grayscale-12 dark:data-[checked]:bg-grayscale-7 dark:data-[checked]:text-grayscale-12"
                  value="fast"
                >
                  Fast
                </Radio.Root>
              </Radio.Group>
            </div>
          ) : null}
        </div>
      </div>
    </Tooltip.Provider>
  );
}

function ModelListWithScrollFade({
  children,
}: {
  children: React.ComponentProps<typeof Combobox.List>["children"];
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const [showBottomFade, setShowBottomFade] = useState(false);

  useEffect(() => {
    const list = listRef.current;
    if (!list) {
      return;
    }

    function updateBottomFade() {
      const el = listRef.current;
      if (!el) {
        return;
      }

      const { scrollTop, scrollHeight, clientHeight } = el;
      setShowBottomFade(scrollHeight - scrollTop - clientHeight > 4);
    }

    updateBottomFade();

    list.addEventListener("scroll", updateBottomFade, { passive: true });
    const resizeObserver = new ResizeObserver(updateBottomFade);
    resizeObserver.observe(list);

    return () => {
      list.removeEventListener("scroll", updateBottomFade);
      resizeObserver.disconnect();
    };
  }, []);

  return (
    <div className="relative">
      <Combobox.List ref={listRef}>{children}</Combobox.List>
      <div
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-x-0 bottom-0 z-10 h-8 bg-gradient-to-t from-white to-transparent transition-opacity duration-150 dark:from-grayscale-4",
          showBottomFade ? "opacity-100" : "opacity-0",
        )}
      />
    </div>
  );
}

function ModelComboboxItem({
  model,
  configuration,
  previewHandle,
}: {
  model: LlmModel;
  configuration: ModelConfiguration;
  previewHandle: PreviewCard.Handle<LlmModel>;
}) {
  return (
    <Combobox.Item
      className="group w-full p-0 data-[selected]:text-grayscale-12"
      key={model.value}
      value={model}
    >
      <PreviewCard.Trigger
        className="flex w-full items-start gap-2 rounded-md px-1.5 py-1.5 dark:hover:bg-grayscale-5 group-data-[selected]:bg-grayscale-3 group-data-[selected]:hover:bg-grayscale-3 dark:group-data-[selected]:bg-grayscale-6 dark:group-data-[selected]:hover:bg-grayscale-6"
        closeDelay={180}
        delay={80}
        handle={previewHandle}
        payload={model}
        render={<div />}
      >
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate">{model.label}</span>
          <ProviderLabel
            className="text-grayscale-11/80 text-xs"
            provider={model.provider}
          />
        </div>
        <ModelConfigurationBadge configuration={configuration} model={model} />
      </PreviewCard.Trigger>
    </Combobox.Item>
  );
}

export function ModelSelectorPrompt({
  className,
  configurations,
  defaultConfigurations = {},
  defaultPrompt = "",
  defaultValue,
  disabled = false,
  models = DEFAULT_LLM_MODELS,
  onConfigurationChange,
  onModelChange,
  onPromptChange,
  onSubmit,
  placeholder = "What do you want to do?",
  prompt,
  value,
}: ModelSelectorPromptProps = {}) {
  const fallbackModel = models[0] ?? DEFAULT_MODEL;
  const [uncontrolledModelValue, setUncontrolledModelValue] = useState(
    defaultValue ?? fallbackModel.value,
  );
  const [uncontrolledConfigurations, setUncontrolledConfigurations] = useState<
    Record<string, ModelConfiguration>
  >(defaultConfigurations);
  const [uncontrolledPrompt, setUncontrolledPrompt] = useState(defaultPrompt);
  const selectedModelValue = value ?? uncontrolledModelValue;
  const selectedModel =
    models.find((model) => model.value === selectedModelValue) ?? fallbackModel;
  const modelConfigurations = configurations ?? uncontrolledConfigurations;
  const promptValue = prompt ?? uncontrolledPrompt;
  const previewHandle = useMemo(() => PreviewCard.createHandle<LlmModel>(), []);

  function updateModelConfiguration(
    modelValue: string,
    update: Partial<ModelConfiguration>,
  ) {
    const previous = modelConfigurations;
    const nextConfiguration = {
      ...getModelConfiguration(previous, modelValue),
      ...update,
    };
    const nextConfigurations = {
      ...previous,
      [modelValue]: nextConfiguration,
    };

    if (!configurations) {
      setUncontrolledConfigurations(nextConfigurations);
    }

    onConfigurationChange?.(modelValue, nextConfiguration, nextConfigurations);
  }

  function updateSelectedModel(model: LlmModel) {
    if (!value) {
      setUncontrolledModelValue(model.value);
    }

    onModelChange?.(model);
  }

  function updatePrompt(nextPrompt: string) {
    if (prompt === undefined) {
      setUncontrolledPrompt(nextPrompt);
    }

    onPromptChange?.(nextPrompt);
  }

  async function handleSubmit() {
    await onSubmit?.({
      configuration: getModelConfiguration(
        modelConfigurations,
        selectedModel.value,
      ),
      configurations: modelConfigurations,
      model: selectedModel,
      prompt: promptValue,
    });
  }

  function closeModelPreview() {
    previewHandle.close();
  }

  return (
    <div
      className={cn(
        "mx-auto flex w-full max-w-md flex-col rounded-xl border border-grayscale-3 bg-white dark:bg-grayscale-3",
        className,
      )}
    >
      <textarea
        className="h-full w-full resize-none bg-transparent p-3 font-medium text-grayscale-12 text-sm outline-none disabled:cursor-not-allowed disabled:opacity-60"
        disabled={disabled}
        onChange={(event) => updatePrompt(event.target.value)}
        placeholder={placeholder}
        value={promptValue}
      />
      <div className="flex w-full flex-row items-center justify-between gap-2 p-2">
        <Combobox.Root<LlmModel>
          autoHighlight
          isItemEqualToValue={(item, nextValue) =>
            item.value === nextValue.value
          }
          items={models}
          onInputValueChange={closeModelPreview}
          onValueChange={(nextModel) => {
            if (nextModel) {
              updateSelectedModel(nextModel);
            }
          }}
          value={selectedModel}
        >
          <Combobox.Trigger
            aria-label="Select model"
            className="dark:bg-grayscale-4 dark:hover:bg-grayscale-5 dark:border-grayscale-5 dark:hover:border-grayscale-6 dark:data-[open]:bg-grayscale-5 dark:data-[open]:border-grayscale-6"
            disabled={disabled}
          >
            <Combobox.Value>
              {(model) =>
                model ? (
                  <span className="flex min-w-0 flex-1 items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <ProviderIcon
                        className="size-3.5"
                        provider={model.provider}
                      />
                      <span className="truncate">{model.label}</span>
                    </span>
                    <ModelConfigurationBadge
                      configuration={getModelConfiguration(
                        modelConfigurations,
                        model.value,
                      )}
                      model={model}
                    />
                  </span>
                ) : (
                  <span>Select model</span>
                )
              }
            </Combobox.Value>
            <Combobox.Icon>
              <CaretDownIcon size={14} weight="bold" />
            </Combobox.Icon>
          </Combobox.Trigger>

          <Combobox.Portal>
            <Combobox.Positioner align="start" sideOffset={4}>
              <Combobox.Popup
                className="dark:bg-grayscale-4 dark:border-grayscale-5 w-60"
                aria-label="Select model"
              >
                <PreviewCard.Root<LlmModel> handle={previewHandle}>
                  {({ payload }) => (
                    <>
                      <Combobox.InputGroup className="rounded-none border-0 border-b border-grayscale-3 bg-transparent px-2 dark:border-grayscale-5 dark:bg-transparent">
                        <Combobox.Input
                          className="px-0"
                          onFocus={closeModelPreview}
                          placeholder="Search models..."
                        />
                        <MagnifyingGlassIcon
                          aria-hidden="true"
                          className="shrink-0 text-grayscale-11/80"
                          size={14}
                          weight="bold"
                        />
                      </Combobox.InputGroup>
                      <Combobox.Empty>
                        <div className="text-center text-grayscale-11 text-xs font-medium gap-1 flex flex-col py-2 px-2">
                          No models found
                          <div className="text-center text-grayscale-9 text-xs text-pretty">
                            Maybe try a different search.
                          </div>
                        </div>
                      </Combobox.Empty>
                      <ModelListWithScrollFade>
                        {(model: LlmModel) => (
                          <ModelComboboxItem
                            key={model.value}
                            configuration={getModelConfiguration(
                              modelConfigurations,
                              model.value,
                            )}
                            model={model}
                            previewHandle={previewHandle}
                          />
                        )}
                      </ModelListWithScrollFade>

                      <PreviewCard.Portal keepMounted>
                        <PreviewCard.Positioner
                          align="center"
                          className="z-[60]"
                          side="right"
                          sideOffset={8}
                        >
                          <PreviewCard.Popup
                            className={cn(
                              "overflow-hidden rounded-lg border border-grayscale-3 bg-white small-shadow outline-none dark:border-grayscale-6 dark:bg-grayscale-5",
                            )}
                          >
                            {payload ? (
                              <ModelPreviewPanel
                                configuration={getModelConfiguration(
                                  modelConfigurations,
                                  payload.value,
                                )}
                                model={payload}
                                onConfigurationChange={(update) =>
                                  updateModelConfiguration(
                                    payload.value,
                                    update,
                                  )
                                }
                              />
                            ) : null}
                          </PreviewCard.Popup>
                        </PreviewCard.Positioner>
                      </PreviewCard.Portal>
                    </>
                  )}
                </PreviewCard.Root>
              </Combobox.Popup>
            </Combobox.Positioner>
          </Combobox.Portal>
        </Combobox.Root>

        <Button
          disabled={disabled}
          onClick={() => void handleSubmit()}
          type="button"
          variant="primary"
        >
          <PaperPlaneTiltIcon size={14} weight="fill" />
          Send
        </Button>
      </div>
    </div>
  );
}
