## Plan: fan out one subagent per Gemini finding (6 parallel)

Spec mode forces read-only, so this plan only describes the work. After approval, I will dispatch 6 `worker` subagents in parallel, each scoped to one finding. None of the findings overlap files except #2/#3/#4 (all touch Rust window code), so I'll route #2/#3/#4 to a SINGLE Rust subagent to avoid edit conflicts on `window.rs`/`main.rs`. That gives 4 parallel subagents total.

### Subagent A — IPC shim memory leaks (finding #1)
File: `packages/tauri-eventa/src/tauri/index.ts` (`buildIpcRendererLike`)
- `post()`: replace per-call `transformCallback(() => {}, true)` pair with a single lazily-created, reused dummy callback (no `true` once flag).
- `on()`: bridge unregister is already wired via `subscriptionById`/`offFn` — verify it actually calls `internals.unregisterCallback(bridge)` and that `offFn` runs when the bucket empties; if the bucket-empty path is missing, add it.
- `removeListener()`: when the bucket becomes empty, delete the channel entry AND call `offFn` (which calls `internals.unregisterCallback(bridge)`).
- `removeAllListeners(channel)`: look up the bridge in `subscriptionById` via the channel, call its `offFn` (unregister native callback), then delete the channel entry.
- Keep `once()` working with the new shape.
- Add/extend a vitest case in `packages/tauri-eventa/src/tauri/index.test.ts` that:
  - asserts `post()` calls `transformCallback` exactly once total across many sends (spy on a fake `internals`),
  - asserts `removeAllListeners` invokes `internals.unregisterCallback`,
  - asserts `removeListener` triggering bucket-empty also unregisters the bridge.
- Verify: `pnpm -F @proj-airi/tauri-eventa exec vitest run src/tauri/index.test.ts` and `pnpm -F @proj-airi/tauri-eventa typecheck`.

### Subagent B — Rust physical->logical px (#2 + #3 + #4, single Rust agent)
Files: `apps/stage-tauri/src/commands/window.rs` and `apps/stage-tauri/src/main.rs`
- `electron_window_get_bounds`: query `window.scale_factor()`, convert `outer_position()` and `outer_size()` via `.to_logical::<f64>(scale_factor)`, round to i32.
- `electron_window_resize`: convert `outer_size()` to logical px first, apply delta to the logical values, then `set_size(tauri::LogicalSize::new(...))`.
- `main.rs` bounds emitter loop: convert `pos` and `size` to logical px (same `to_logical` pattern) before emitting on `WINDOW_BOUNDS_EVENT`. Update the `last_bounds` cache to compare logical values so the dedup still works.
- Keep all existing warnings/behavior otherwise unchanged.
- Verify: `cd apps/stage-tauri && cargo build` (only pre-existing placeholder dead-code warnings allowed) and `bash init.sh`.

### Subagent C — bounds tracking reset bug (finding #5)
File: `packages/tauri-vueuse/src/composables/use-electron-window-bounds.ts`
- Replace `let initialized = false` with `let lastContext: any = null`.
- In `initializeWindowBoundsTracking()`, resolve `const context = getElectronEventaContext()` first; if `lastContext === context` return early; else set `lastContext = context` and register the listener on this context instance.
- This mirrors Gemini's suggested fix and makes `resetElectronEventaContextForTesting()` re-register correctly.
- Add a vitest that calls `resetElectronEventaContextForTesting()` and asserts a new bounds event reaches the composable ref.
- Files to inspect first: `packages/tauri-vueuse/src/composables/use-electron-eventa-context.ts` (for the reset helper signature), the existing tauri-vueuse tests if any.
- Verify: `pnpm -F @proj-airi/tauri-vueuse typecheck` and `pnpm -F @proj-airi/tauri-vueuse exec vitest run`.

### Subagent D — lifecycle store reset bug (finding #6)
File: `apps/stage-tauri/src/stores/stage-window-lifecycle.ts`
- Replace `let initialized = false` with `let lastContext: ReturnType<typeof getElectronEventaContext> | null = null` (or `any` to match the bounds fix).
- In `initializeWindowLifecycleBridge()`, resolve `const context = getElectronEventaContext()` first; bail if `lastContext === context`; else `lastContext = context` and register listeners + fetch initial state.
- Add a vitest in a new `apps/stage-tauri/src/stores/stage-window-lifecycle.test.ts` (or extend existing) that resets the context and asserts the store re-registers.
- Verify: `pnpm -F @proj-airi/stage-tauri typecheck` and (if a vitest config exists) `pnpm -F @proj-airi/stage-tauri exec vitest run <new-test>`. If no vitest config in stage-tauri, typecheck-only + note in the report.

### Post-subagent verification (after all 4 return)
Once all 4 subagents report done, I will run a single sequential verification pass (not parallel) to avoid the tsdown dist-clean race the prior session hit:
1. `pnpm -F @proj-airi/tauri-eventa build`
2. `pnpm -F @proj-airi/tauri-vueuse build`
3. `pnpm -F @proj-airi/tauri-eventa exec vitest run src/tauri/index.test.ts`
4. `pnpm -F @proj-airi/tauri-vueuse typecheck`
5. `pnpm -F @proj-airi/stage-tauri typecheck` (sequential after the two builds)
6. `cd apps/stage-tauri && cargo build`
7. `git diff --check`
Any failure -> re-delegate the responsible subagent with corrective feedback.

### Then
- Commit as `fix(tauri): address Gemini review (ipc leaks, dpi scaling, context reset)`.
- Push to the existing PR branch `vi70x4/feat/tauri-window-lifecycle` (no new PR).

### Notes
- AGENTS.md mandates Serena/jcodemunch MCP tools, but those are not exposed in this session. I'll instruct subagents to use native `Edit`/`Read`/`Grep` and record the fallback, matching how the prior handoff documented it.
- `removeListener` currently calls `delete()` on the bucket but never unregisters the bridge; Subagent A must handle this.
- I will NOT touch the unrelated untracked files (`docs/2026-07-03-resolve-merge-fix...md`, `tauri-plugin-cap-map-research.md`).