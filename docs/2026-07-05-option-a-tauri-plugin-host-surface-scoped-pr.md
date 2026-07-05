## Tauri Plugin-Host Surface (Option A) — Scoped PR

**Goal**: Land the plugin-host *surface* in the Tauri port without building the Node sidecar binary. Implement the manifest/config flow in Rust, wire the Stage Tauri bridge, and render `/settings/plugins` with a clear degraded status when the sidecar binary is missing.

### Worktree
Create isolated worktree from current `main` at `~/.worktrees/plugin-host-sidecar`.

### Files touched (in order)

1. **`apps/stage-tauri/Cargo.toml`** — Add `tauri-plugin-shell`, `tauri-plugin-store`, `uuid`.
2. **`apps/stage-tauri/tauri.conf.json`** — Set `bundle.externalBin: ["sidecars/plugin-host"]` (no binary exists yet; Rust reports degraded).
3. **`apps/stage-tauri/src/commands/plugins.rs`** — Replace placeholder bodies with real Rust implementations:
   - `electron_plugins_list()` — read manifests from `<app_data_dir>/plugins/` using `plugin.airi.json` schema.
   - `electron_plugins_set_enabled()` / `set_auto_reload()` — persist to store.
   - `electron_plugins_load_enabled()` / `load()` / `unload()` — report `degraded` (sidecar absent).
   - `electron_plugins_inspect()` — return real registry + degraded session state.
4. **`apps/stage-tauri/src/stores/plugin_config.rs`** (new) — `tauri-plugin-store` wrapper for `{ enabled, autoReload, known }`.
5. **`apps/stage-tauri/src/stores/plugin_manifests.rs`** (new) — Mirror the manifest-loading logic from `apps/stage-tamagotchi/src/main/services/airi/plugins/host/registry.ts` in Rust.
6. **`packages/tauri-eventa/src/contracts/plugins.ts`** (new) — Re-declare plugin Eventa contracts inline (same pattern as `server-channel.ts` / `electron-updater.ts` to avoid the `rolldown-plugin-dts` transitive re-export bug documented in previous handoff).
7. **`packages/tauri-eventa/src/contracts/index.ts`** — Re-export plugin contracts.
8. **`apps/stage-tauri/src/main.rs`** — Manage plugin state via `app.manage(PluginHostState)`; register new commands.
9. **`apps/stage-tauri/src/App.vue`** — Wire `usePluginHostInspectorStore.setBridge(...)` for plugin `list/setEnabled/setAutoReload/loadEnabled/load/unload/inspect` operations.
10. **`apps/stage-tauri/src/window-routes.ts`** — Add `plugins` to the route label map.
11. **Tests** — Rust unit tests for manifest discovery + config round-trip; Vitest test for eventa contract shape.

### TDD order

1. **Write failing Rust tests first**:
   - Load manifests from a temp dir containing `plugin.airi.json` files (including a symlink and a schema-invalid file).
   - Config persistence round-trip (`enabled` / `autoReload` / `known`) via `tauri-plugin-store`.
   - Sidecar binary missing → `electron_plugins_inspect` reports `degraded` status.
2. **Write failing eventa contract tests** in `@proj-airi/tauri-eventa`.
3. **Implement Rust commands + state** to satisfy tests.
4. **Wire Stage Tauri bridge** in `App.vue`.

### Verification before handoff
- `cargo build --manifest-path apps/stage-tauri/Cargo.toml` succeeds.
- `cargo test --manifest-path apps/stage-tauri/Cargo.toml` passes new Rust unit tests.
- `pnpm -F @proj-airi/tauri-eventa exec vitest run` passes.
- `pnpm -F @proj-airi/stage-tauri typecheck` passes.
- `cargo tauri dev` launches; `/settings/plugins` renders without errors, toggles persist across reload.
- `VAL-TAURI-PLGN-001`, `VAL-TAURI-PLGN-002`, `VAL-TAURI-SRV-003` green in validation state.

### What we explicitly defer to follow-up features
- Building the `pkg`-compiled Node sidecar binary (the `plugin-host` binary at `apps/stage-tauri/sidecars/`).
- Implementing the WebSocket transport branch in `packages/plugin-sdk/src/plugin-host/runtimes/node/index.ts`.
- Renderer-migration worker updates (router) to add `/settings/plugins` as a primary settings entry.
