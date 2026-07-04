---
name: renderer-migration-worker
description: Migrates Vue 3 renderer files from Electron (`apps/stage-tamagotchi/src/renderer/`) to Tauri (`apps/stage-tauri/src/renderer/`), replacing Electron-specific IPC, lifecycle, screen-capture, and composable patterns with their Tauri equivalents while preserving the shared package APIs under `packages/stage-ui/`, `packages/stage-ui-{three,live2d,spine,mmd}/`, and `packages/`.
---

# Renderer Migration Worker

## Scope

Port a single renderer file (or a tightly-coupled group of files) from the Electron renderer tree to the Tauri renderer tree. One file per work unit. Never bundle unrelated files into a single step.

Source root: `apps/stage-tamagotchi/src/renderer/`
Target root: `apps/stage-tauri/src/renderer/`

Shared packages that remain common to both renderers (no porting needed, only import-path verification when a package was renamed):

- `packages/stage-ui/`
- `packages/stage-ui-{three,live2d,spine,mmd}/`
- `packages/stage-shared/`
- `packages/stage-pages/`
- `packages/ui/`

## Background

The old Electron-based renderer relied on `window.electron.ipcRenderer` exposed by `@electron-toolkit/preload` via `contextBridge`. The new Tauri renderer uses `window.__TAURI_INTERNALS__.ipc` and the `@tauri-apps/api/window` global.

The migration replaces Electron-specific patterns with their Tauri equivalents. The shared package public APIs are intentionally preserved so that components and composables continue to work without business-logic changes; only the import sources and the low-level transport change.

## Required Skills

- `using-superpowers` — establish skill discovery before any other action.
- `verification-before-completion` — run verification commands and confirm output before claiming a file is migrated.
- `test-driven-development` — when a ported unit has existing tests, reproduce behavior against the Tauri transport before editing production code.

## Required Tools

Workers MUST use the MCP tools listed in `AGENTS.md` for all code lookup and edits. Native tools (`Read`, `Edit`, `Grep`, `Glob`, `Create`) are emergency fallback only and must be logged inline as `// FALLBACK: MCP <tool> failed with <error>; using native <tool> for <path>`.

### Opening move (before any file work)

1. `serena___list_memories()` — list recorded memories; auto-read any whose `memory_name` overlaps tokens in the current file path task.
2. `serena___activate_project("/home/vi/anima")`.
3. `jcodemunch___resolve_repo("/home/vi/anima")` — assert repo id is `"airi"`.
4. `jcodemunch___assemble_task_context(repo="airi", task="Migrate <source file path> from Electron renderer to Tauri renderer")` for auto-classification and anchor extraction.

### Locate target symbols

- `serena___get_symbols_overview(relative_path="<target file>")` — file outline.
- `serena___find_symbol(name_path_pattern="<symbol>", relative_path="<target file>", include_body=true)` — exact symbol source.
- `jcodemunch___search_units(repo="airi", query="<symbol>", file_pattern="<target glob>")` — index-backed symbol search.

### Understand impact

- `jcodemunch___get_blast_radius(repo="airi", symbol="<symbol_id>", depth=2, include_source=true)` — confirm no dangling references remain after a port.
- `jcodemunch___get_call_hierarchy(repo="airi", symbol_id="<symbol_id>", direction="both", depth=3)` — confirm callers and callees are intact.
- `jcodemunch___get_dependency_graph(repo="airi", file="<target file>", direction="both", depth=2)` — confirm import graph is consistent.
- `jcodemunch___find_references(repo="airi", mode="importers", file_path="<target file>")` — confirm importers still resolve.

### Apply edit

- `serena___replace_symbol_body(name_path="<qualified name>", relative_path="<target file>", body="<new body>")` — replace a single symbol body.
- `serena___replace_content(relative_path="<target file>", needle="<pattern>", repl="<replacement>", mode="literal" | "regex")` — replace import statements and small snippets.
- `serena___replace_in_files(needle="<pattern>", repl="<replacement>", mode="literal" | "regex", relative_path="<target file or dir>")` — bulk replace across a ported file group.
- `serena___insert_after_symbol` / `serena___insert_before_symbol` — insert new helpers around existing symbols.
- `serena___safe_delete_symbol` — remove dead electron-only symbols after confirming no references.

### Verify and reindex

- `jcodemunch___get_unit(repo="airi", unit_id="<id>", verify=true, verify_against="cache")` — confirm source actually changed.
- `jcodemunch___register_edit(repo="airi", file_paths=["<target file>"], reindex=true)` — invalidate cache.
- `serena___get_diagnostics_for_file(relative_path="<target file>", min_severity=2)` — confirm no new warnings/errors.
- `pnpm -F @proj-airi/<pkg> exec vitest run <changed-file>` — run targeted tests.
- `pnpm -F @proj-airi/<pkg> typecheck` — typecheck the affected package.

## Work Procedure

Execute each file port as a discrete work unit. Do not start the next file until verification passes for the current one.

### Step 0 — Read the contract

Re-read the relevant sections of `AGENTS.md` (Tool Binding Table, Delegated Code-Change Loop) and `architecture.md` for the renderer tree boundaries before touching any file.

### Step 1 — Identify the source file and its Tauri target

- Source file: `apps/stage-tamagotchi/src/renderer/<relative path>`.
- Target file: `apps/stage-tauri/src/renderer/<same relative path>`.
- If the target file already exists, diff it against the source to scope the remaining changes; never overwrite existing Tauri-specific logic.
- If the target file does not exist, create it by porting the source: `serena___get_symbols_overview` on the source file, then `Create` the target with the ported content. Use `Create` (native) only after `jcodemunch___get_file` or `serena___find_symbol(include_body=true)` has returned the authoritative source body.

### Step 2 — Build the substitution plan

For each symbol in the target file, classify it against the migration patterns below and prepare a single `{old_text, new_text}` block per change. One substitution per step; never bundle unrelated edits.

### Step 3 — Apply the migration patterns

Apply the patterns in the order listed. Each pattern is a literal → literal (or single regex) replacement via `serena___replace_content` or `serena___replace_in_files`.

#### Pattern 1 — Eventa IPC shim

Before:

```ts
import { createContext } from '@moeru/eventa/adapters/electron/renderer'
// ...
const ctx = createContext(window.electron.ipcRenderer)
```

After:

```ts
import { createContext } from '@moeru/eventa/adapters/tauri/renderer'
// ...
const ctx = createContext(window.__TAURI_INTERNALS__.ipc)
```

If a module re-exports or wraps `createContext`, update the re-export source and the call site in the same step.

#### Pattern 2 — electron-vueuse composables

Before:

```ts
import { useElectronWindowBounds, useElectronMouse } from '@proj-airi/electron-vueuse'
```

After:

```ts
import { useElectronWindowBounds, useElectronMouse } from '@proj-airi/tauri-vueuse'
```

The composable names and return shapes are identical; only the package source changes. Do not rename the composables — downstream consumers depend on the stable API.

#### Pattern 3 — Screen capture

Before (Electron silent capture with source enumeration):

```ts
const stream = useElectronScreenCapture(ipcRenderer, { ... })
```

After (Web `getDisplayMedia`, no silent capture, no source enumeration):

```ts
const stream = await navigator.mediaDevices.getDisplayMedia({ video: true })
```

Camera access:

```ts
const stream = await navigator.mediaDevices.getUserMedia({ video: true })
```

URL-based sources are persisted via `tauri-plugin-store` under `selectedDisplayMediaLabel`. Do not introduce any silent-capture path; the user must consent via the browser prompt.

#### Pattern 4 — SystemPreferences (elect)

Removed on Tauri. Delete any `systemPreferences` import and usage. The `getMediaAccessStatus` invoke always returns `"granted"` on Linux — replace any gating logic with a constant `"granted"` branch or remove the gate entirely if the only effect was short-circuiting on macOS checks. Camera access on Linux uses `navigator.mediaDevices.getUserMedia()` directly (see Pattern 3).

#### Pattern 5 — electron.runtime

Before:

```ts
import electron from '@proj-airi/electron-eventa'
// ...
electron.runtime.someWindowMethod()
```

After: drop the import. Use `getCurrentWebviewWindow()` from `@tauri-apps/api/window` for window methods:

```ts
import { getCurrentWebviewWindow } from '@tauri-apps/api/window'
// ...
const win = getCurrentWebviewWindow()
await win.someMethod()
```

#### Pattern 6 — Window lifecycle

Before:

```ts
import { useElectronWindowLifecycle } from '@proj-airi/electron-vueuse'
const lifecycle = useElectronWindowLifecycle()
```

After:

```ts
import { useTauriWindowLifecycle } from '@proj-airi/tauri-vueuse'
const lifecycle = useTauriWindowLifecycle()
```

`useTauriWindowLifecycle()` subscribes to Tauri window events via the same eventa contract names, so downstream consumers of the reactive store are unchanged.

#### Pattern 7 — Type-only imports

- Remove `import type { ... } from 'electron'` statements entirely.
- Replace the `Display` type (from `electron`) with `Monitor` from `@tauri-apps/api/window`:

```ts
import type { Monitor } from '@tauri-apps/api/window'
```

- Replace `SourcesOptions` with `DisplayMediaStreamConstraints` from the TS `lib.dom` declarations (no import needed; it is a global DOM type).

#### Pattern 8 — Path verification for shared packages

For imports from `packages/stage-ui/`, `packages/stage-ui-{three,live2d,spine,mmd}/`, `packages/stage-shared/`, and `packages/`, verify with `jcodemunch___find_references(mode="importers", file_path="<package source>")` that the import path still resolves from the Tauri renderer tree. If a package was renamed for the Tauri migration, update the import specifier; otherwise leave it untouched.

### Step 4 — Verify the migration (mandatory, never skip)

Run the following in order for every ported file:

1. `jcodemunch___get_unit(repo="airi", unit_id="<id>", verify=true, verify_against="cache")` — confirm source actually changed.
2. `jcodemunch___get_blast_radius(repo="airi", symbol="<id>", include_source=true)` — confirm no dangling electron references remain.
3. `jcodemunch___get_call_hierarchy(repo="airi", symbol_id="<id>", direction="callers")` — confirm callers intact.
4. `jcodemunch___register_edit(repo="airi", file_paths=["<target file>"], reindex=true)` — invalidate cache.
5. `serena___get_diagnostics_for_file(relative_path="<target file>", min_severity=2)` — confirm no new warnings or errors.
6. `pnpm -F @proj-airi/<pkg> typecheck` — typecheck the affected package.
7. `pnpm -F @proj-airi/<pkg> exec vitest run <target file>` — run targeted tests, if any exist for the file.

If any verification step fails, re-issue the failing substitution with corrective feedback. Do not proceed to the next file until all steps pass.

### Step 5 — Report

Return the structured report described in "When to Return to the Orchestrator" below.

## Components Known to Be Affected

Stores:

- `packages/stage-ui/stores/mcp-tools.ts`
- `packages/stage-ui/stores/plugin-tools.ts`
- `packages/stage-ui/stores/stage-window-lifecycle.ts`
- `packages/stage-ui/stores/settings/server-channel.ts`

Pages:

- `packages/stage-ui/pages/devtools/global-shortcut.vue`
- `packages/stage-ui/pages/devtools/use-window-mouse.vue`
- `packages/stage-ui/pages/widgets.vue`
- `packages/stage-ui/pages/notice/fade-on-hover.vue`
- `packages/stage-ui/pages/settings/account/index.vue`

This list is non-exhaustive. When handed a file, classify it against Patterns 1–7 regardless of whether it appears above.

## Example Handoff

The orchestrator hands off a single file port as a JSON object. The worker returns the same shape with `status`, `verifications`, and `notes` filled in.

Request (from orchestrator):

```json
{
  "work_unit_id": "renderer-port-007",
  "source_file": "apps/stage-tamagotchi/src/renderer/stores/window-bounds.ts",
  "target_file": "apps/stage-tauri/src/renderer/stores/window-bounds.ts",
  "patterns_expected": ["pattern-1-eventa-ipc", "pattern-2-electron-vueuse", "pattern-7-type-only-imports"],
  "context": {
    "blast_radius_notes": "Imported by widgets.vue and use-window-mouse.vue. No cross-package importers.",
    "call_chain": "useElectronWindowBounds -> window.electron.ipcRenderer.invoke('window:getBounds')",
    "lessons_learned": "electron-vueuse and tauri-vueuse share the same composable signatures; only the import source changes."
  }
}
```

Response (from worker):

```json
{
  "work_unit_id": "renderer-port-007",
  "source_file": "apps/stage-tamagotchi/src/renderer/stores/window-bounds.ts",
  "target_file": "apps/stage-tauri/src/renderer/stores/window-bounds.ts",
  "status": "completed",
  "patterns_applied": ["pattern-1-eventa-ipc", "pattern-2-electron-vueuse", "pattern-7-type-only-imports"],
  "substitutions": [
    {
      "symbol": "createContext import",
      "before": "import { createContext } from '@moeru/eventa/adapters/electron/renderer'",
      "after": "import { createContext } from '@moeru/eventa/adapters/tauri/renderer'"
    },
    {
      "symbol": "createContext call",
      "before": "createContext(window.electron.ipcRenderer)",
      "after": "createContext(window.__TAURI_INTERNALS__.ipc)"
    },
    {
      "symbol": "useElectronWindowBounds import",
      "before": "import { useElectronWindowBounds } from '@proj-airi/electron-vueuse'",
      "after": "import { useElectronWindowBounds } from '@proj-airi/tauri-vueuse'"
    },
    {
      "symbol": "Display type",
      "before": "import type { Display } from 'electron'",
      "after": "import type { Monitor } from '@tauri-apps/api/window'"
    }
  ],
  "verifications": {
    "get_unit_verify": "ok",
    "blast_radius": "no dangling electron references",
    "call_hierarchy_callers": "widgets.vue, use-window-mouse.vue intact",
    "register_edit": "ok",
    "diagnostics": "no new warnings",
    "typecheck": "passed",
    "vitest": "no tests for this file"
  },
  "notes": [
    "useElectronMouse was not used in this file; only useElectronWindowBounds was imported.",
    "Pattern 6 (window lifecycle) not applicable to this store; handled in stage-window-lifecycle.ts."
  ],
  "follow_ups": []
}
```

A realistic example of a fully-ported composable body is shown below. Before (Electron):

```ts
import { createContext } from '@moeru/eventa/adapters/electron/renderer'
import { useElectronWindowBounds, useElectronMouse } from '@proj-airi/electron-vueuse'
import type { Display } from 'electron'

const ctx = createContext(window.electron.ipcRenderer)

export function useWindowBoundsStore() {
  const { bounds, restore } = useElectronWindowBounds(ctx)
  const { x, y } = useElectronMouse(ctx)
  return { bounds, restore, x, y }
}
```

After (Tauri):

```ts
import { createContext } from '@moeru/eventa/adapters/tauri/renderer'
import { useElectronWindowBounds, useElectronMouse } from '@proj-airi/tauri-vueuse'
import type { Monitor } from '@tauri-apps/api/window'

const ctx = createContext(window.__TAURI_INTERNALS__.ipc)

export function useWindowBoundsStore() {
  const { bounds, restore } = useElectronWindowBounds(ctx)
  const { x, y } = useElectronMouse(ctx)
  return { bounds, restore, x, y }
}
```

## When to Return to the Orchestrator

Return control to the orchestrator and stop work immediately in any of the following cases:

1. **Work unit complete.** All patterns have been applied, all verification steps pass, and the structured report (see "Example Handoff") has been produced. Hand back the report JSON.

2. **Pattern mismatch.** The source file contains an Electron-specific pattern not covered by Patterns 1–7, and there is no obvious Tauri equivalent. Do not improvise a substitute; return the file with `status: "blocked"`, `notes` describing the unrecognized pattern, and `follow_ups` requesting an orchestrator decision.

3. **Verification failure that cannot be self-corrected.** A substitution was applied, but one of the mandatory verification steps fails and a second corrective attempt also fails. Return `status: "blocked"`, attach the failing verification output to `notes`, and list the failing step in `follow_ups`.

4. **Cross-file dependency discovered.** Applying a pattern requires a coordinated edit to another file outside the current work unit (e.g., a shared package was renamed and every importer must be updated atomically). Do not touch the other file. Return `status: "needs-coordination"`, name the dependent file in `follow_ups`, and let the orchestrator schedule the dependent port.

5. **Missing source or target.** The source file does not exist under `apps/stage-tamagotchi/src/renderer/`, or the target path under `apps/stage-tauri/src/renderer/` is not writable. Return `status: "blocked"` with the reason in `notes`.

6. **Ambiguous ownership.** The file is owned by a shared package (`packages/stage-ui/`, etc.) rather than a renderer tree, and the edit would affect both renderers. Return `status: "needs-coordination"` and name the owning package in `follow_ups`; the orchestrator decides whether to fork the file into the Tauri renderer tree or update the shared package for both consumers.

In all return cases, the worker MUST:

- Stop editing immediately after producing the report.
- Not begin work on the next file in the queue.
- Not modify files outside the current work unit.
- Include the full structured report JSON in the response so the orchestrator can record it.
