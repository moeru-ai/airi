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

## Agent SOP — The Delegate-Verify Loop

This is the **critical workflow** for any code-change task. Follow it **every time**. Never skip verification.

### Step 1: Analyze & Plan
1. Use jcodemunch to explore:
   - `plan_turn(repo="airi", query="<task>")` — opening move; surfaces target symbols.
   - `search_symbols` / `get_file_outline` — locate exact symbols.
   - `get_blast_radius(symbol="...", depth=2)` — understand downstream impact.
   - `get_call_hierarchy` / `find_references` — map callers and dependents.
   - `get_hotspots` / `find_dead_code` — identify risk areas.
2. Break the task into **smallest possible steps**. Do not bundle.

### Step 2: Delegate ONE Step
- Use `spawn_agent` for code modifications.
- Every prompt MUST include:
  - Repo identifier: `"airi"`
  - Exact `symbol_ids` (use `get_file_outline`/
    `search_symbols` to find them).
  - jcodemunch mandate: "Use jcodemunch tools (`get_file_outline`, `search_symbols`, `get_symbol_source`, `get_ranked_context`) for **all** code lookup. Batch with `symbol_ids[]` instead of repeated calls."
  - Full context — the subagent is **stateless**.

**Template:**
```
You are working in repo "airi" (indexed via jcodemunch-mcp).
Mandatory: use jcodemunch tools for ALL code lookup.
- get_file_outline → get_symbol_source
- search_symbols → get_ranked_context
- Batch with symbol_ids[]

Target symbols: [<list symbol_ids>]
Task: <description>
```

### Step 3: ❗ Verify the Result (Critical)
**Never trust a subagent's report.** Subagents frequently claim success while leaving code unmodified.
After every delegated task:
1. **Read the actual file** with `grep`/`read_file` — confirm the expected code is present.
2. Check blast radius: `find_references(identifier="...")` — verify no call site is broken.
3. Trace upstream: `get_call_hierarchy(symbol_id="...", direction="callers")`.
4. Confirm indexed source: `get_symbol_source(symbol_id="...", verify=true)`.
5. Register edits: `register_edit(file_paths=[...], reindex=true)`.
6. Run targeted tests: `pnpm exec vitest run <changed-file>`.

**If missing or wrong, re-delegate with corrective feedback — never fix yourself.**

### Lesson Learned — Missing Blast Radius Verification
The subagent for ["Extract persistence logic from Electron main thread"](https://github.com/animaios/airi/pull/142) reported success, but the `AppDataManager` class was **never moved** out of `main.ts`. Only a stub file was created. The missing move was discovered when verifying blast radius — `find_references(identifier="AppDataManager")` still showed all IPC call sites inside the Electron main thread. **Always verify blast radius and references with jcodemunch after a delegated task.**

## Commands Recap
- Build/test: `pnpm typecheck`, `pnpm -F @proj-airi/<pkg> exec vitest run`
- Run: `pnpm dev:tamagotchi`
- Lint: `pnpm lint` / `pnpm lint:fix`

## Rules

### Git
- Rebase pulls: `git pull --rebase`.
- Branch naming: `username/feat/short-name`.
- Conventional Commits: `feat(<scope>): message`. No Gitmoji.
- Commit messages: summarise changes, **test commands used**, follow-ups.

### Testing
- Reproduce bugs with a test **before** changing production code.
- Include tracker identifiers: `Issue #<number>` or Linear key.
- Add the report URL as a comment above the test.
- Run targeted tests: `pnpm exec vitest run <changed-file>`.

### Architecture Landmines
- Module boundaries: prefer **deep modules** (hide a meaningful decision: policy, persistence, lifecycle). Avoid shallow splits (by execution order only).
- DI: use only at **external boundaries** (database, model runtime, Redis). Do not create `Dependencies` objects for internal helpers.
- Circular imports: treat as a **design problem**. Reconsider ownership/boundaries.
- TypeScript: import types from the **owning module**. Never redeclare external types.
- IPC: centralise Eventa contracts; use `@moeru/eventa` for all events.

### Dependencies
- **Never add a dependency without searching for existing internal implementations.**
- For `node:*`, DOM, or Vue composables, research existing libraries first and **ask the user to confirm choices**.

### Styling & Components
- Use UnoCSS shortcuts/rules (extend in `uno.config.ts`). Prefer UnoCSS over Tailwind.
- Build on `@proj-airi/ui` primitives (reka-ui). Update `docs/ai/context/ui-components.md` when adding/updating components.
- Use Iconify icon sets; **no bespoke SVGs**.

### Credentials/Secrets
- **Never commit secrets or API keys.** Use `.env.example` patterns.

### Observability
- **Prometheus-compatible `/metrics` endpoint** is exposed by the AIRI core HTTP server (see `core/telemetry/`). Instrument new subsystems by importing `Counter` / `Gauge` / `Histogram` from `core/telemetry/index.js` and registering them against the daemon's `MetricRegistry` (via `core/index.ts` re-export). Snapshot any registry by calling `.expose()` (Prometheus text) or `.snapshot()` (JSON).
- Instrumentation follows OpenTelemetry naming conventions (`snake_total` for counters, underscore units like `_ms` for durations). Each daemon-owned metric is prefixed `airi_` to avoid clashes.

### Environment Variables
- `SENTRY_DSN` — DSN for Sentry error tracking on the Electron app. Optional on dev/contributor machines; the SDK gracefully no-ops when absent. Required in production builds to capture crashes.
  - Scope: only `airi-tamagotchi@<version>` release events.
  - Auth/identity: set post-login inside `services/airi/auth.ts` (OIDC does not expose email).

## jcodemunch Recap

Repo: `airi` (indexed). Symbol ID: `{file_path}::{qualified_name}#{kind}`

- `plan_turn(repo="airi", query="...")` → before any task
- `get_file_outline` → `get_symbol_source` / `get_context_bundle` — **never** read full files
- `search_symbols(repo="airi", query="...")` — find symbols
- `get_blast_radius(symbol="...", include_source=true)` — check impact before changes
- `find_references` / `get_call_hierarchy` — trace who uses a symbol

## jcodemunch

Repo: `airi` (indexed). Symbol ID: `{file_path}::{qualified_name}#{kind}`

- `plan_turn(repo="airi", query="...")` before any task
- `get_file_outline` → `get_symbol_source` / `get_context_bundle` — targeted retrieval, never full files
- `search_symbols(repo="airi", query="...")` — find by name, signature, summary
- `get_blast_radius(symbol="...", include_source=true)` — check impact before changes
- `find_references` / `get_call_hierarchy` — trace who uses a symbol
