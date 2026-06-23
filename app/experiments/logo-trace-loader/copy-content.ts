export const LOGO_TRACE_LOADER_PROMPT = `Build a reusable SVG logo trace loader component.

Goal:
Create one self-contained client component that traces a logo while work is in progress, then resolves into the filled logo mark when loading completes.

Component contract:

\`\`\`tsx
// components/LogoTraceLoader.tsx
type LogoTraceLoaderProps = {
  loading?: boolean;
  isComplete?: boolean;
  size?: number;
  strokeWidth?: number;
  loopDurationSeconds?: number;
  fillFadeSeconds?: number;
  className?: string;
  ariaLabel?: string;
  onDone?: () => void;
};
\`\`\`

Logo data:
Use my actual logo SVG paths. If they are not already available in the repo, ask me for the SVG file or extract these values from an existing logo asset:

\`\`\`ts
const LOGO_VIEW_BOX = "PASTE_VIEW_BOX";

const TRACE_PATH =
  "PASTE_SINGLE_CLEAN_PATH_FOR_THE_ANIMATED_TRACE";

const FILL_PATHS = [
  "PASTE_FILLED_LOGO_PATH_1",
  "PASTE_FILLED_LOGO_PATH_2",
] as const;
\`\`\`

SVG preparation:
- Prefer one continuous path for TRACE_PATH. It is the route followed by the animated stroke, not necessarily every filled shape in the logo.
- If the source SVG only contains filled shapes, derive a clean outer contour for TRACE_PATH and keep the original filled shapes in FILL_PATHS.
- Flatten transforms before copying path data when the SVG uses transformed groups or paths.
- Preserve holes and compound shapes in FILL_PATHS so the final filled logo matches the original.
- If a clean trace path cannot be confidently extracted, ask me for a simplified outline/trace path instead of guessing.

Behavior:
- While loading is true, animate a short stroke segment around TRACE_PATH.
- When isComplete is true, or loading becomes false, transition from the looping trace to the full outline.
- After the trace closes, fade in FILL_PATHS so the spinner resolves into the filled logo.
- Call onDone exactly once after the filled logo is visible.
- Use currentColor for both stroke and fill so the loader can be styled through className.
- Respect prefers-reduced-motion by showing the filled logo immediately and calling onDone.
- Include timeout fallbacks so the component does not rely only on SVG animation callbacks.
- Keep width and height stable from the first render to avoid layout shift.

Internal state:

\`\`\`ts
type LoaderPhase = "loop" | "closingOutline" | "fadingFill" | "done";
\`\`\`

Rendering outline:

\`\`\`tsx
<svg
  role="status"
  aria-label={ariaLabel}
  viewBox={LOGO_VIEW_BOX}
  width={size}
  height={size}
  className={className}
>
  <g opacity="0.18">
    <path
      d={TRACE_PATH}
      fill="none"
      stroke="currentColor"
      strokeWidth={Math.max(1, strokeWidth / 2)}
      strokeLinejoin="round"
    />
  </g>

  {phase === "loop" ? (
    <path
      d={TRACE_PATH}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      pathLength={1}
      strokeDasharray="0.16 0.84"
      style={{
        animation: \`logo-trace-loader-loop \${loopDurationSeconds}s linear infinite\`,
      }}
    />
  ) : null}

  {phase === "fadingFill" || phase === "done"
    ? FILL_PATHS.map((path) => <path key={path} d={path} fill="currentColor" />)
    : null}
</svg>
\`\`\`

Animation CSS:

\`\`\`css
@keyframes logo-trace-loader-loop {
  to {
    stroke-dashoffset: -1;
  }
}
\`\`\`

Scope:
- Implement the component and any required CSS only.
- Do not add unrelated UI, product copy, routes, screens, buttons, or business logic.
- Keep the component typed and reusable.
- Run the project formatter, typecheck, and build after implementation.`;
