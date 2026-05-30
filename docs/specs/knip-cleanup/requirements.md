# Requirements: Knip Cleanup

## Overview

Continue the Knip dead-code analysis cleanup across the `airiOS` monorepo. After an initial round of configuration changes reduced unused file detections from 243 to 172, further progress requires resolving configuration hints, fixing unlisted dependencies, pruning confirmed-unused packages, and cleaning up the shared workspace catalog.

## Problem Statement

Knip is still unable to fully trace imports across the workspace due to:

1. **Misconfigured entry points** — Knip cannot resolve entry files for `packages/stage-ui`, causing it to miss entire import chains and falsely flag files as unused.
2. **Redundant entry patterns** — `packages/ui-transitions` has manually specified entry patterns that Knip already auto-detects, creating noise.
3. **Invalid package entry in `packages/stage-layouts`** — A glob pattern in `package.json` `exports` is being interpreted as a package entry file, which Knip cannot resolve.
4. **Unlisted dependencies** — `jsdom` and `unocss` are imported in test/story files but not declared in the relevant `package.json` files. Additionally, `uno.css` is a virtual module provided by the `unocss` Vite plugin that Knip cannot trace as a regular dependency.
5. **Confirmed-unused dependencies** — Several packages are declared in `package.json` but have no imports anywhere in the consuming workspace.
6. **Unused catalog entries** — The `pnpm-workspace.yaml` catalog contains 41 entries that are never referenced by any workspace package, creating unnecessary metadata overhead.

## Requirements

### R1: Fix `packages/stage-ui` Entry Point in Knip Config

- **Current state:** `knip.json` references `src/index.ts!` for `packages/stage-ui`, but no `src/index.ts` file exists in that package.
- **Expected state:** The entry pattern must point to an existing file. The package's actual barrel export is `src/components/index.ts` (as defined in `package.json` `exports`), but Knip should be configured to trace all meaningful entry points including story files.
- **Acceptance:** Knip no longer emits the hint `Refine entry pattern (no matches)` for `packages/stage-ui`.

### R2: Remove Redundant Entry Patterns in `packages/ui-transitions`

- **Current state:** `knip.json` explicitly lists `src/index.ts!` and `playground/src/main.ts` as entries for `ui-transitions`.
- **Expected state:** Remove these entries since Knip auto-detects them. The workspace config should rely on auto-detection.
- **Acceptance:** Knip no longer emits `Remove redundant entry pattern` hints for `ui-transitions`.

### R3: Fix Package Entry in `packages/stage-layouts`

- **Current state:** `package.json` `exports` contains `"./components/ViewControls/*": "./src/components/Layouts/ViewControls/*.vue"` — the `ViewControls/**/*.vue` glob pattern is flagged by Knip as an unresolvable package entry.
- **Expected state:** Verify all `exports` fields point to concrete files or correct glob patterns. The export key uses `ViewControls/*` mapping to `ViewControls/*.vue` files — this is valid for Knip, but the hint suggests Knip is having trouble. Investigate and resolve the mismatch.
- **Acceptance:** Knip no longer emits `Package entry file not found` for `stage-layouts`.

### R4: Resolve Unlisted Dependencies

- **R4.1:** Add `jsdom` to `devDependencies` in `apps/stage-tamagotchi` and `packages/stage-ui` (both have test files using `@vitest-environment jsdom`).
- **R4.2:** Add `unocss` to `devDependencies` in `packages/stage-ui` and `packages/ui-transitions` (both import `uno.css` in story/playground setup files).
- **R4.3:** Add `uno.css` to `ignoreDependencies` in root `knip.json` — `uno.css` is a virtual module provided by the `unocss` Vite plugin, not a physical package, and cannot be resolved by Knip's dependency tracer.
- **Acceptance:** Knip no longer reports `jsdom`, `unocss`, or `uno.css` as unlisted dependencies.

### R5: Prune Unused Catalog Entries from `pnpm-workspace.yaml`

The `pnpm-workspace.yaml` catalog defines 41 dependencies that are never used by any package in the monorepo. Remove the following unused catalog entries:

`@ax-llm/ax`, `@better-auth/oauth-provider`, `@capacitor/android`, `@capacitor/app`, `@capacitor/barcode-scanner`, `@capacitor/cli`, `@capacitor/core`, `@capacitor/ios`, `@capacitor/local-notifications`, `@electric-sql/pglite`, `@hono/node-ws`, `@iconify-json/line-md`, `@iconify-json/logos`, `@iconify-json/material-symbols`, `@iconify-json/mdi`, `@iconify-json/ph`, `@iconify-json/tabler`, `@napi-rs/image`, `@proj-airi/unplugin-drizzle-orm-migrations`, `@takumi-rs/image-response`, `@types/ws`, `cac`, `capacitor-native-settings`, `crossws`, `date-fns`, `drizzle-kit`, `drizzle-valibot`, `hono-rate-limiter`, `isolated-vm`, `jose`, `meow`, `node-pty`, `ofetch`, `posthog-node`, `reka-ui`, `stockfish`, `tinyexec`, `tsx`, `uncrypto`, `vue-router`, `yaml`

- **Acceptance:** After removal, `pnpm install` succeeds and the catalog only contains entries that are actually referenced by at least one workspace package.

### R6: Remove Confirmed-Unused Dependencies

Remove the following unused dependencies from their respective `package.json` files:

| Package | Workspace |
|---------|-----------|
| `@date-fns/utc` | `apps/stage-tamagotchi` |
| `@formkit/auto-animate` | `apps/stage-tamagotchi` |
| `replicate` | `apps/stage-tamagotchi` |
| `nprogress` | `apps/stage-tamagotchi` |
| `posthog-js` | `apps/stage-tamagotchi` |
| `animejs` | `packages/stage-layouts` |
| `posthog-js` | `packages/stage-layouts` |
| `dompurify` | `packages/stage-layouts` |
| `posthog-js` | `packages/stage-pages` |
| `d3` | `packages/stage-pages` |

- **Acceptance:** After removal, `pnpm install` succeeds and `pnpm knip` no longer flags these as unused dependencies.

### R7: Verify Improvement

- After all changes, run `pnpm knip` and confirm the unused file count has decreased from the current 172.
- No new Knip errors or warnings should be introduced.
- All existing tests and typechecks should continue to pass.

## Out of Scope

- Removing unused files or exports (this cleanup focuses on configuration and dependency fixes only).
- Modifying application logic or component code.
- Changes to the root `knip.json` workspaces that are not listed above.
- Note: `pnpm-workspace.yaml` catalog pruning IS in scope (R5) as it directly reduces Knip configuration noise.
