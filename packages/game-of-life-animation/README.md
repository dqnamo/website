# game-of-life-animation

A tiny React canvas component for Game of Life loading states.

```bash
npm install game-of-life-animation
```

```tsx
"use client";

import { GameOfLifeLoader } from "game-of-life-animation";

export function LoadingState() {
  return (
    <div style={{ position: "relative", height: 320, overflow: "hidden" }}>
      <GameOfLifeLoader
        cellColor="rgb(100 116 139)"
        cellRadius={3}
        cellSize={14}
        density={0.28}
        fadeDuration={920}
        maxOpacity={0.22}
        stepInterval={620}
        style={{
          height: "100%",
          width: "100%",
        }}
      />
    </div>
  );
}
```

## Props

`GameOfLifeLoader` accepts standard canvas props plus:

- `cellColor`: canvas fill color. Falls back to `--game-of-life-color`, then `currentColor`.
- `cellRadius`: rounded cell radius in CSS pixels.
- `cellSize`: grid cell size in CSS pixels.
- `density`: initial live cell density from `0` to `1`.
- `fadeDuration`: live/dead opacity transition duration in milliseconds.
- `gap`: spacing between cells in CSS pixels.
- `maxDevicePixelRatio`: pixel ratio cap for canvas rendering.
- `maxOpacity`: peak live cell opacity from `0` to `1`.
- `pauseWhenHidden`: stop animation when the tab is hidden.
- `respectReducedMotion`: render a still frame when reduced motion is enabled.
- `seed`: deterministic initial state seed.
- `stepInterval`: Game of Life simulation step interval in milliseconds.
