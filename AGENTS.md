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

## Tools — Mandatory Binding Table

**Primary rules:**
1. ALWAYS attempt the PRIMARY columns first for any code operation on repo files (`.ts`, `.tsx`, `.vue`, `.js`, `.mts`, `.mjs`, `.json`, `.yaml`, configs).
2. Native tools (`Read`, `Edit`, `Grep`, `Glob`, `Create`, `ApplyPatch`) are **emergency fallback only**.
3. If native must be used, log inline: `// FALLBACK: MCP <tool> failed with <error>; using native <tool> for <path>`.
4. Any fallback usage MUST be listed in the task summary delivered to the user.

---

### Symbol & Declaration Operations

| Operation | PRIMARY (jcodemunch) | PRIMARY (serena) | Fallback (native) |
|---|---|---|---|
| Find symbol / declaration | `jcodemunch___search_units` | `serena___find_symbol` | Grep |
| Find references | `jcodemunch___find_references` | `serena___find_referencing_symbols` | Grep |
| Find implementations | `jcodemunch___find_implementations` | `serena___find_implementations` | Grep |
| Find declaration location | — | `serena___find_declaration` | Grep |
| File symbol overview | `jcodemunch___get_outline` / `jcodemunch___get_repo_map` | `serena___get_symbols_overview` | Read+Grep |
| Rename symbol globally | — | `serena___rename_symbol` | Manual Edit loop |
| Safe symbol deletion | `jcodemunch___check_safe` (mode=delete) | `serena___safe_delete_symbol` | Grep+Edit |
| Replace single symbol body | — | `serena___replace_symbol_body` | Edit |
| Insert after / before symbol | — | `serena___insert_after_symbol` / `_before_symbol` | Edit |
| Replace content (anywhere) | — | `serena___replace_content` | Edit |
| Bulk replace (multi-file) | — | `serena___replace_in_files` | Multi-Edit |
| Lint & diagnostics window | — | `serena___get_diagnostics_for_file` | Grep |

### Search & Code Intelligence

| Operation | PRIMARY (jcodemunch) | Fallback (native) |
|---|---|---|
| Symbol search (index) | `jcodemunch___search_units` | Grep |
| Free-text search (index) | `jcodemunch___search_text` | Grep |
| Column search (dbt-like) | `jcodemunch___search_columns` | Grep |
| AST pattern scan | `jcodemunch___search_ast` | Grep |
| Similar/duplicate funcs | `jcodemunch___find_similar_symbols` | — |
| File read (cache) | `jcodemunch___get_file` | Read |
| Full symbol + context | `jcodemunch___get_unit` / `get_unit_context` | Read |

### Call Hierarchy & Class Hierarchy

| Operation | PRIMARY (jcodemunch) | PRIMARY (serena) | Fallback (native) |
|---|---|---|---|
| Caller trace (who calls me) | `jcodemunch___get_call_hierarchy` (callers) | `serena___find_referencing_symbols` | Grep |
| Callee trace (what I call) | `jcodemunch___get_call_hierarchy` (callees) | — | Grep |
| Full inheritance tree | `jcodemunch___get_class_hierarchy` | — | Grep |
| Blast radius (impact) | `jcodemunch___get_blast_radius` | — | Grep |
| Dependency graph (file) | `jcodemunch___get_dependency_graph` | — | Grep |

### Git & Change Intelligence

| Operation | PRIMARY (jcodemunch) | Fallback (native) |
|---|---|---|
| Changed symbols between refs | `jcodemunch___get_changed_symbols` | git diff |
| PR risk profile | `jcodemunch___get_pr_risk_profile` | — |
| Symbol authorship/provenance | `jcodemunch___get_symbol_provenance` | git log |
| Repo health snapshot | `jcodemunch___get_repo_health` | — |
| Cyclomatic complexity | `jcodemunch___get_symbol_complexity` | — |
| Dead-code detection | `jcodemunch___get_dead_code_v2` | — |
| Refactor edit plan | `jcodemunch___plan_refactoring` | Manual Edit |
| Pre-change safety check | `jcodemunch___check_safe` | Grep |

### Indexing, Embedding, Topology

| Operation | PRIMARY |
|---|---|
| Single-file re-index | `jcodemunch___index_file` |
| Full repo index | `jcodemunch___index_content` / `summarize_repo` |
| Cache invalidate (register edit) | `jcodemunch___register_edit` |
| Embeddings/semantic warm | `jcodemunch___embed_repo` |
| Module topology (tectonic map) | `jcodemunch___get_tectonic_map` |
| Project intel (Docker/CI) | `jcodemunch___get_project_intel` |
| Monorepo workspaces | `jcodemunch___list_workspaces` |
| Runtime trace ingest | `jcodemunch___import_runtime_signal` |
| Task-context assembly | `jcodemunch___assemble_task_context` |

### Serena Project Memory

| Operation | Tool |
|---|---|
| List all memories | `serena___list_memories` |
| Read a memory | `serena___read_memory` |
| Write a memory | `serena___write_memory` |
| Edit a memory | `serena___edit_memory` |
| Delete a memory | `serena___delete_memory` |
| Rename/move memory | `serena___rename_memory` |
| Activate project | `serena___activate_project("/home/vi/anima")` |
| Diagnostics window | `serena___get_diagnostics_for_file` |
| Config dump | `serena___get_current_config` |

---

## Session Startup Protocol (MANDATORY — run BEFORE any other work)

1. `serena___list_memories()` — list all recorded memories.
2. Auto-read every memory whose `memory_name` contains a substring matching any token in the user's current task prompt (case-insensitive keyword overlap). Do NOT ask — just load.
3. `serena___activate_project("/home/vi/anima")`.
4. `jcodemunch___resolve_repo("/home/vi/anima")` → assert repo id is `"airi"`.

This protocol applies to **every** session — no matter how trivial the task appears. Skip is NOT permitted.

---

## The Delegated Code-Change Loop

### Step 1: Analyze & Plan
1. Call `jcodemunch___assemble_task_context(repo="airi", task="<user request>")` for auto-classification.
2. Use `serena___get_symbols_overview` + `serena___find_symbol` (or `jcodemunch___search_units`) to locate exact symbol IDs.
3. Run `jcodemunch___get_blast_radius(symbol=<id>, depth=2, include_source=true)`.
4. Run `jcodemunch___get_call_hierarchy(symbol_id=<id>, direction="both", depth=3)`.
5. Optionally: `jcodemunch___find_similar_symbols`, `jcodemunch___get_dead_code_v2`, `jcodemunch___search_ast`, `jcodemunch___check_safe`.
6. Break into **smallest possible steps**. One symbol/mutation per step. Never bundle.
7. For planned multi-file refactors: `jcodemunch___plan_refactoring(symbol=<>, refactor_type=...)` → returns ready-to-apply `{old_text, new_text}` blocks.

### Step 2: Delegate ONE Step
- Use `spawn_agent` for execution.
- Subagent prompt MUST contain:
  - Repo identifier: `"airi"`.
  - Exact `symbol_ids` (use outlines to find them).
  - Full tool-binding mandate (see template below).
  - Blast-radius context so the subagent knows the dependent surface.

**Subagent Prompt Template:**
```
You are working in repo "airi" (indexed via jcodemunch-mcp + serena).

TOOL MANDATORY — use MCP for ALL code lookup and edits. Native tools are emergency fallback ONLY.
- jcodemunch: search_units, get_unit, get_unit_context, get_file_outline, get_blast_radius,
  get_call_hierarchy, get_class_hierarchy, get_dependency_graph, find_references,
  find_implementations, check_safe, plan_refactoring, register_edit
- serena: find_symbol, find_referencing_symbols, find_implementations, find_declaration,
  get_symbols_overview, replace_symbol_body, insert_after_symbol, insert_before_symbol,
  replace_content, replace_in_files, rename_symbol, safe_delete_symbol, get_diagnostics_for_file

Primary flow: serena___get_symbols_overview -> serena___find_symbol -> jcodemunch___get_unit
-> jcodemunch___get_blast_radius -> apply edit via serena -> jcodemunch___register_edit

Target symbols: [<symbol_ids>]
Task: <description>
Context: <blast radius notes, call chain, lessons learned>
```

### Step 3: Verify the Result (MANDATORY — NEVER skip)
After every delegated task, in this order:
1. `jcodemunch___get_unit(unit_id=<id>, verify=true, verify_against="cache")` — confirm source actually changed.
2. `jcodemunch___get_blast_radius(symbol=<id>, include_source=true)` — confirm no dangling references remain.
3. `jcodemunch___get_call_hierarchy(symbol_id=<id>, direction="callers")` — confirm callers intact.
4. `jcodemunch___register_edit(file_paths=[...], reindex=true)` — invalidate cache.
5. `pnpm -F @proj-airi/<pkg> exec vitest run <changed-file>` — run targeted tests.

**If any verification step fails, re-delegate with corrective feedback — never fix yourself.**

---

## Memory Write Policy

After completing a task or discovering a reusable fact, persist to Serena memory:
```
serena___write_memory(
  memory_name="tasks/<topic>",
  content="<decision>\n<rationale>\n<symbol_ids>\n<commit_sha>"
)
```
Useful keys: `tasks/`, `bugs/`, `patterns/`, `decisions/`, `blast-radius/`.

---

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
- **Prometheus-compatible `/metrics` endpoint** is exposed by the AIRI core HTTP server. Instrument new subsystems by importing `Counter` / `Gauge` / `Histogram` from `core/telemetry/index.js` and registering them against the daemon's `MetricRegistry`. Snapshot via `.expose()` (Prometheus text) or `.snapshot()` (JSON).
- Instrumentation follows OpenTelemetry naming conventions (`snake_total` for counters, underscore units like `_ms` for durations). Each daemon-owned metric is prefixed `airi_`.

### Environment Variables
- `SENTRY_DSN` — DSN for Sentry error tracking on the Electron app. Optional on dev/contributor machines; SDK gracefully no-ops when absent. Required in production builds to capture crashes.
  - Scope: only `airi-tamagotchi@<version>` release events.
  - Auth/identity: set post-login inside `services/airi/auth.ts` (OIDC does not expose email).

---

## Lessons Learned

### Missing Blast Radius Verification
The subagent for ["Extract persistence logic from Electron main thread"](https://github.com/animaios/airi/pull/142) reported success, but the `AppDataManager` class was **never moved** out of `main.ts`. Only a stub file was created. The missing move was discovered when verifying blast radius — `find_references(identifier="AppDataManager")` still showed all IPC call sites inside the Electron main thread. **Always verify blast radius and references with jcodemunch after a delegated task.**

---

## Tool Selection Cheat-Sheet

Repo: `airi` (indexed). Symbol ID: `{file_path}::{qualified_name}#{kind}`

### Opening move (before ANY task)
`jcodemunch___assemble_task_context` · `serena___list_memories` · `jcodemunch___get_repo_map(token_budget=2048)`

### Locate target
`serena___find_symbol` · `serena___get_symbols_overview` · `jcodemunch___search_units`

### Understand impact
`jcodemunch___get_blast_radius(include_source=true)` · `jcodemunch___get_call_hierarchy(direction="both")` · `jcodemunch___get_class_hierarchy` · `jcodemunch___get_dependency_graph`

### Apply edit
`serena___replace_symbol_body` · `serena___replace_content` · `serena___replace_in_files` · `serena___insert_after_symbol` · `serena___insert_before_symbol` · `serena___rename_symbol` · `serena___safe_delete_symbol`

### Verify & reindex
`jcodemunch___get_unit(unit_id, verify=true)` · `jcodemunch___register_edit(file_paths, reindex=true)` · `serena___get_diagnostics_for_file`
