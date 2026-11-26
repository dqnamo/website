export const PACKAGE_NAME = "game-of-life-animation";

export const installCommand = `npm install ${PACKAGE_NAME}`;

export const usageSource = `"use client";

import { GameOfLifeLoader } from "${PACKAGE_NAME}";

export function LoadingState() {
  return (
    <div className="relative h-80 overflow-hidden rounded-xl border">
      <GameOfLifeLoader
        cellColor="rgb(100 116 139)"
        cellRadius={3}
        cellSize={14}
        density={0.28}
        fadeDuration={920}
        maxOpacity={0.22}
        stepInterval={620}
      />
    </div>
  );
}`;

export function buildMarkdown(packageSource: string) {
  return `# ${PACKAGE_NAME}

A tiny React canvas component for Game of Life loading states.

\`\`\`bash
${installCommand}
\`\`\`

\`\`\`tsx
${usageSource}
\`\`\`

## Source

\`\`\`tsx
${packageSource}
\`\`\`
`;
}
