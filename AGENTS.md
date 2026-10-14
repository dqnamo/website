<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Cursor Cloud specific instructions

This repo is a single product: a Next.js 16 personal website/portfolio. The homepage plus interactive demos live under `app/` (routes like `/experiments/*`, `/clip-demo`, `/sign-test`). `packages/game-of-life-animation` is a standalone library, not required to run the site. No databases, backends, or other runtime services are needed, and no environment variables are required (`.env.example` is empty).

- **Node version**: The project requires Node 24 (`.nvmrc`/`.node-version`/`mise.toml`). The startup update script installs it via `nvm` and sets it as the default. Non-obvious gotcha: the VM injects `/exec-daemon/node` (Node 22) early in `PATH`, which can shadow nvm's Node in some non-login shells. Interactive login shells (`bash -lc ...`) already resolve to Node 24; if `node -v` shows 22, run `nvm use 24` (or run commands via a login shell) before building/running.
- **Package manager**: Use `npm` (matches the committed `package-lock.json` and `README.md`). A `pnpm-lock.yaml`/`pnpm-workspace.yaml` also exist, but `pnpm-workspace.yaml` contains a placeholder value that breaks a strict pnpm install — prefer npm.
- **Commands** are in `package.json`: dev = `npm run dev` (`next dev --webpack`, serves http://localhost:3000), build = `npm run build`, lint = `npm run lint` (Biome). There is no test script/framework in this repo.
- `npm install` prints `allow-scripts` warnings for `core-js`/`sharp`/`unrs-resolver` (npm 11 skips their install scripts). This is safe: build and dev (including image optimization) work because `sharp` ships prebuilt binaries.
