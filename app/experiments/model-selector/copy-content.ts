export const MODEL_SELECTOR_USAGE = `import { useState } from "react";
import {
  DEFAULT_LLM_MODELS,
  ModelSelectorPrompt,
  type ModelConfiguration,
} from "./model-selector-prompt";

export function PromptComposer() {
  const [modelValue, setModelValue] = useState("claude-fable-5");
  const [configurations, setConfigurations] = useState<
    Record<string, ModelConfiguration>
  >({});
  const [prompt, setPrompt] = useState("");

  return (
    <ModelSelectorPrompt
      configurations={configurations}
      models={DEFAULT_LLM_MODELS}
      onConfigurationChange={(_, __, nextConfigurations) => {
        setConfigurations(nextConfigurations);
      }}
      onModelChange={(model) => {
        setModelValue(model.value);
      }}
      onPromptChange={setPrompt}
      onSubmit={({ model, configuration, prompt }) => {
        submitPrompt({ model, configuration, prompt });
      }}
      prompt={prompt}
      value={modelValue}
    />
  );
}
`;

export const MODEL_SELECTOR_PROMPT = `Build an advanced model selector for an AI prompt composer.

## Goal

Create a compact, reusable model picker embedded in a prompt composer. Users should be able to open a combobox, search models, hover a model to inspect a preview card, tune supported configuration options, and see the selected model reflected in the trigger.

## Stack

Use React, TypeScript, Tailwind CSS, and Base UI primitives. Implement this as a client component you can drop into any Next.js App Router or React app.

## Model data

Include current flagship models from OpenAI, Anthropic, and Google Gemini. Use Artificial Analysis (or equivalent benchmark data) for model names, context windows, pricing, output speed, and intelligence scores. Normalize those source values onto 10-segment comparison bars. Do not use arbitrary or hand-waved values.

## UI building blocks

- Base UI Combobox for model search, selection, popup positioning, keyboard navigation, and item rendering.
- Base UI Preview Card for hover previews. Use \`PreviewCard.createHandle\`, \`PreviewCard.Root\`, \`PreviewCard.Trigger\`, \`PreviewCard.Portal\`, \`PreviewCard.Positioner\`, and \`PreviewCard.Popup\`.
- Small segmented radio controls for reasoning level and speed.
- 10-segment metric bars for intelligence, speed, context, and cost, with tooltips that expose the underlying source values.
- Provider logos in the list and preview (Next.js \`Image\` or an equivalent optimized image component).

## Data model

Use a typed model list. Keep display values separate from normalized 10-segment bar values.

\`\`\`ts
type LlmModel = {
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
\`\`\`

## Metric rules

- Bars must remain 10 segmented bars.
- Intelligence should reflect Artificial Analysis Intelligence Index, normalized against the top model in your set.
- Speed should reflect Artificial Analysis output tokens per second, normalized against the fastest model in your set.
- Context should reflect context window size, normalized against the largest context in your set.
- Cost should reflect effective blended or input/output pricing. Lower cost should appear better on the bar (invert the visual scale if needed).
- Tooltips should expose human-readable source values such as "1M tokens context window" and "$5.00 / 1M input, $30.00 / 1M output".

## Configuration behavior

- Every model can expose a reasoning control (low / medium / high) if your product treats reasoning as a user preference.
- Only render a speed control for models that support a fast tier. Set \`hasSpeedConfiguration: true\` on those models and hide the speed radio group for models that do not support it.
- Show configuration badges on the trigger and list rows when non-default settings are active (for example high reasoning or fast speed).
- Do not apply speed metric deltas to models that do not support speed configuration.

## Core preview logic

\`\`\`ts
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
\`\`\`

## Base UI preview card wiring

\`\`\`tsx
const previewHandle = useMemo(() => PreviewCard.createHandle<LlmModel>(), []);

<PreviewCard.Root<LlmModel> handle={previewHandle}>
  {({ payload }) => (
    <>
      <Combobox.List>{items}</Combobox.List>
      <PreviewCard.Portal keepMounted>
        <PreviewCard.Positioner align="start" side="right" sideOffset={8}>
          <PreviewCard.Popup>
            {payload ? <ModelPreviewPanel model={payload} /> : null}
          </PreviewCard.Popup>
        </PreviewCard.Positioner>
      </PreviewCard.Portal>
    </>
  )}
</PreviewCard.Root>
\`\`\`

## Combobox item pattern

\`\`\`tsx
<Combobox.Item value={model}>
  <PreviewCard.Trigger
    closeDelay={180}
    delay={80}
    handle={previewHandle}
    payload={model}
    render={<div />}
  >
    <span>{model.label}</span>
    <ProviderLabel provider={model.provider} />
    <ModelConfigurationBadge model={model} configuration={configuration} />
  </PreviewCard.Trigger>
</Combobox.Item>
\`\`\`

## Interaction requirements

- Close the hover preview when the search input changes or receives focus.
- Store configuration per model value so each model remembers its own settings.
- Preserve accessibility labels on the combobox trigger, search input, radio groups, and send action.
- Keep the layout compact: a textarea above, model selector and send button in a footer row.`;
