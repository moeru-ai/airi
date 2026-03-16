# Selective Upstream Sync Current Report

## Comparison Basis

This report compares:

- fork base: `dasilva333/airi:main`
- upstream source: `moeru-ai/airi:main`

Current comparison at time of writing:

- fork head: `a13e3479` (feat: update sync with upstream head 4671cea)
- upstream head: `4671ceaaae92f5d780319394512bf63ed01a85f1`
- status: **Synced up to Upstream Head 4671cea**

## Sync Summary: March 17, 2026

The following improvements have been selectively integrated from the upstream 30-commit drift:

- **LLM Provider Compatibility**: Integrated `llm.ts` flattening logic to fix string-only message content requirements (e.g., DeepSeek).
- **Build Stability**: Updated `vite.config.ts`, `electron.vite.config.ts`, and `apps/stage-pocket/vite.config.ts` to disable `server.fs.strict` and remove unused TresJS imports.
- **ESLint Hygiene**: Added `CLAUDE.md` to ignore list to prevent linting of symbolic links.

## Audit of Hand-Merge Candidates

### `providers.ts`
- **Result**: **Preserved Fork State**
- **Reasoning**: Upstream recently simplified `getProviderConfig` and removed `providerRuntimeState`. However, our fork contains ~1000 lines of additional provider logic (Chatterbox, Aliyun, App-Local, etc.) that depend on the fork's more comprehensive metadata and configuration merging. Merging upstream would cause significant regressions in provider availability.

### `Model.vue`
- **Result**: **Preserved Fork State**
- **Reasoning**: Upstream currently matches the baseline `65faf3f` for this file (following a revert of a previous flickering fix). Our fork contains advanced parsing logic for Live2D Alpha features (CDI/EXP) and a more efficient deep-watching system for model parameters.

## Classification for Future Syncs

1.  **Import (Safe)**: Non-conflicting logic fixes, Vite/Build system improvements.
2.  **Inspect**: Layout/UI changes that may clash with fork-specific styling.
3.  **Hand-Merge**: Core stores (`providers.ts`) and main components (`Model.vue`).

## Workspace Status

- `airi-rebase-scratch` is currently synced with the intent of `4671cea`.
- Baseline for next sync: `4671cea`.
