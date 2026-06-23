export const LOGO_TRACE_LOADER_PROMPT = `Add a reusable SVG logo trace loading spinner to my app.

This is for use anywhere the app needs a branded loading indicator. Do not build a demo page unless one already exists and needs updating.

Implement a client component:

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

Use my logo SVG paths. If they are not already available in the repo, ask me for the SVG or extract these values from an existing SVG file:

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
- Prefer one continuous path for TRACE_PATH. It should be the route the animated stroke follows, not necessarily every filled shape in the logo.
- If the SVG only contains filled shapes, choose or derive a clean outer contour for TRACE_PATH and keep the original filled shapes in FILL_PATHS.
- Flatten transforms before copying path data when the SVG uses transformed groups or paths.
- Preserve holes and compound shapes in FILL_PATHS so the final filled logo matches the original.
- If a clean trace path cannot be confidently extracted, ask me for a simplified outline/trace path instead of guessing.

Behavior:
- While loading is true, animate a short stroke segment around TRACE_PATH.
- When isComplete is true, or loading becomes false, close the trace into the full outline.
- After the trace closes, fade in FILL_PATHS so the spinner resolves into the filled logo.
- Call onDone once after the filled logo is visible.
- Use currentColor so the loader can be styled by className.
- Respect prefers-reduced-motion by showing the filled logo immediately and calling onDone.
- Include timeout fallbacks so the component does not rely only on SVG animation callbacks.

Suggested internal phases:

\`\`\`ts
type LoaderPhase = "loop" | "closingOutline" | "fadingFill" | "done";
\`\`\`

Suggested SVG shape:

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

Add the CSS keyframe globally or next to the component:

\`\`\`css
@keyframes logo-trace-loader-loop {
  to {
    stroke-dashoffset: -1;
  }
}
\`\`\`

Example usage in a loading screen:

\`\`\`tsx
import { LogoTraceLoader } from "@/components/LogoTraceLoader";

export function LoadingState() {
  return (
    <div className="flex min-h-64 items-center justify-center">
      <LogoTraceLoader
        ariaLabel="Loading"
        className="text-blue-9"
        loading
        size={40}
        strokeWidth={12}
      />
    </div>
  );
}
\`\`\`

Example usage when resolving async work:

\`\`\`tsx
<LogoTraceLoader
  ariaLabel="Loading workspace"
  className="text-blue-9"
  isComplete={isReady}
  loading={!isReady}
  onDone={() => setCanShowContent(true)}
  size={40}
  strokeWidth={12}
/>
\`\`\`

Implementation notes:
- Keep the component self-contained and typed.
- Do not hardcode page-specific text, buttons, or demo controls into the loader.
- Do not include app-specific business logic.
- Avoid layout shift by keeping the SVG width and height stable.
- Run the project formatter, typecheck, and build after implementation.`;
