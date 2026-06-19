# AnimAIOS / AIRI

AI companion desktop OS — Electron + Vue 3 + TypeScript pnpm monorepo. Your character lives on-screen, observes desktop activity, and acts as an agentic center of your Linux desktop.

## Structure

- `apps/stage-tamagotchi/` — Electron desktop app (main entry, `pnpm dev:tamagotchi`)
- `apps/worker/` — Background worker process
- `core/` — AIRI runtime kernel: EventBus, ModuleRegistry, TaskManager, Planner, Cognition, Persistence, Workers, Capabilities, Semantic Memory, Workspace isolation
- `packages/stage-ui/` — Core business components, composables, stores (providers, modules, character)
- `packages/stage-ui-{three,live2d,spine,mmd}/` — 3D/VRM, Live2D, Spine, MMD Vue bindings
- `packages/stage-shared/` · `packages/stage-pages/` — Shared logic and page bases across stage packages
- `packages/ui/` — UI primitives built on reka-ui (no business logic)
- `packages/i18n/` — Central translations (all locales live here)
- `packages/core-agent/` — Core agent runtime orchestration
- `packages/core-character/` — Character pipeline (segmentation, emotion, TTS)
- `packages/audio/` · `packages/pipelines-audio/` — Audio processing and pipeline orchestration
- `packages/model-driver-lipsync/` — Lip-sync drivers (Live2D, wLipSync)
- `packages/server-runtime/` · `packages/server-sdk/` — Server runtime and client SDK
- `packages/plugin-sdk/` · `packages/plugin-protocol/` — Plugin SDK and protocol events
- `packages/electron-{eventa,vueuse,screen-capture}/` — Electron IPC, VueUse, screen capture
- `packages/stream-kit/` · `packages/ccc/` · `packages/vishot-runtime/` — Stream utils, PNG metadata, visual regression
- `packages/ui-transitions/` · `packages/stage-layouts/` — Shared transitions and stage layouts
- `docs/architecture/` — Architecture decision docs (bootstrap, modules, planner, memory, etc.)

## Commands

- `pnpm dev:tamagotchi` — Desktop app dev server
- `pnpm -F @proj-airi/<pkg> typecheck` — Typecheck one package
- `pnpm typecheck` — Typecheck all
- `pnpm exec vitest run <path>` — Test a specific file
- `pnpm -F @proj-airi/<pkg> exec vitest run` — Test one workspace
- `pnpm test:run` — Run all tests
- `pnpm lint` / `pnpm lint:fix` — ESLint + formatting
- `pnpm -F @proj-airi/<pkg> build` — Build one package

## Rules

- Use pnpm (never npm/yarn). Filter with `-F @proj-airi/<name>`.
- Shared logic → `packages/`. Keep app entrypoints thin.
- Translations → `packages/i18n` only.
- `@moeru/eventa` for IPC, `injeca` for DI, `@moeru/std` for errors (`errorMessageFrom`), Valibot for schemas.
- UnoCSS (not Tailwind). Extend shortcuts in `uno.config.ts`.
- `@proj-airi/ui` primitives (reka-ui) instead of raw DOM.
- Iconify icon sets; no bespoke SVGs.
- Never commit secrets or API keys.
- Search for existing internal implementations before adding dependencies.

## Delegation

Spawned agents are stateless — include repo id, target symbol_ids, jcodemunch mandate, and all context in every prompt. See RULES.md §0 for SOP.

## Further Reference

- `RULES.md §0` — Agent SOP: plan → delegate → review workflow
- `RULES.md §1–§9` — TypeScript, testing, naming, modules, git, styling, deps, i18n, dev practices
- `docs/architecture/` — Bootstrap flow, module system, cognition, planner, memory, workers, workspace isolation

## jcodemunch

Repo: `airi` (indexed). Symbol ID: `{file_path}::{qualified_name}#{kind}`

- `plan_turn(repo="airi", query="...")` before any task
- `get_file_outline` → `get_symbol_source` / `get_context_bundle` — targeted retrieval, never full files
- `search_symbols(repo="airi", query="...")` — find by name, signature, summary
- `get_blast_radius(symbol="...", include_source=true)` — check impact before changes
- `find_references` / `get_call_hierarchy` — trace who uses a symbol
