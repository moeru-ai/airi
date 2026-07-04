# Mission Directives & Operational Rules

## Mission Boundaries (NEVER VIOLATE)

**Port Range:** 3100-3199 reserved for existing services (postgres, existing channel-server). New Tauri dev server uses port 1420 (Tauri default).

**Off-limits:**
- `apps/stage-tamagotchi/` main process source during Tauri rewrite — don't delete until Tauri windows are verified working.
- Production credentials — `.env` files with real tokens.
- `/data` directory at repo root.
- `node_modules/` — always use pnpm for package operations.

**Isolation:** Each worker session is isolated. Environment variable changes, port bindings, and shell state do NOT persist between worker sessions. Start services fresh in `init.sh` each time.

## Tools — Mandatory Binding Table

### MCP Tools (Preferred for all code operations on repo files)

| Tool | Use |
|------|-----|
| `jcodemunch___search_units` | Symbol search |
| `jcodemunch___get_file` | Read source |
| `jcodemunch___get_unit_context` | Get symbol code with blast radius |
| `jcodemunch___get_blast_radius` | Impact scope of edits |
| `jcodemunch___get_call_hierarchy` | Caller/callee trace |
| `jcodemunch___get_class_hierarchy` | Inheritance trace |
| `serena___find_symbol` | Find symbol in workspace |
| `serena___replace_symbol_body` | Safe body replace |
| `serena___replace_content` | Replace arbitrary content |
| `serena___get_diagnostics_for_file` | Lint/type diagnostics |
| `serena___insert_after_symbol` / `_before_symbol` | Code insertion |

### Native Tools (Emergency fallback only)

`Read`, `Edit`, `Grep`, `Glob`, `LS`, `Create` — only when MCP fails; log `// FALLBACK: ...` inline.

### Shell Commands (Allowed)

- `pnpm install`, `pnpm -F <pkg> exec <cmd>`, `pnpm add <pkg>`
- `cargo`, `cargo-tauri` (Rust toolchain)
- `node`, `tsx`, `tsdown`
- `xcopy`, `xargs` etc. for shell work (Linux)

## Session Startup Protocol (MANDATORY — run BEFORE any work)

1. `serena___list_memories()` — list all memories.
2. Auto-read every memory whose name contains a substring matching tokens in the worker's task prompt.
3. `serena___activate_project("/home/vi/anima")`.
4. `jcodemunch___resolve_repo("/home/vi/anima")` — assert repo id is `"airi"`.

Skip is NOT permitted.

## Mission Directives

### Tools

- **Primary**: `cargo tauri dev` and `Vite` for building the renderer (replaces `electron-vite`).
- **Tauri SDK**: `@tauri-apps/api` (v2), `@tauri-apps/plugin-*` crate equivalents.
- **Rust async**: `tokio::spawn` for channel-server/http-server; `tauri::async_runtime` for plugin mounts.
- **Cert gen**: `rcgen` crate (no Go/mkcert).
- **Sidecar execution**: `tauri-plugin-shell` `Command::new_sidecar()`.
- **Global mouse**: `rd-ev` (Rust crate) background thread when hitbox click-through is needed.

### Dependencies

- **KEEP**: `@moeru/eventa` (transport-agnostic contract layer), `vue`, `vue-router`, `pinia`, `@vueuse/core`, `three`, `@pixiv/three-vrm`, `pixi-live2d-display`, `@esotericsoftware/spine-webgl`, `h3`, `crossws`, `@modelcontextprotocol/sdk`, `uuid`, `valibot`, `zod`, `destr`.
- **ADD**: `rcgen` (Rust), `rustls` / `tokio-rustls` (Rust), `tauri-plugin-*` crates, `deno_core` or `pkg` for plugin sidecar.
- **DROP**: `electron`, `electron-builder`, `electron-vite`, `electron-updater`, `@electron-toolkit/*`, `@proj-airi/electron-eventa`, `@proj-airi/electron-vueuse`, `@proj-airi/electron-screen-capture`, `electron-click-drag-plugin`, `uiohook-napi`, `@huggingface/transformers`, `onnxruntime-web`, `@xsai-transformers/*`, `@ricky0123/vad-web`, `kokoro-js`, `libsamplerate-js`, `mediabunny`, `@xsai/stream-transcription`, `@xsai/generate-speech`.

### Skills

- **`tauri-ipc-worker`** — for features writing Rust Tauri command handlers or eventa adapter code.
- **`tauri-window-worker`** — for features implementing multi-window management, transparency, or overlay workarounds.
- **`tauri-sidecar-worker`** — for features implementing Godot, MCP, and Node plugin-host sidecars.
- **`renderer-migration-worker`** — for features porting Vue renderer code (composables, stores, pages).

### Other Rules

1. **Idempotent setup** — `init.sh` must be safe to run multiple times. It installs deps, starts services.
2. **Run typecheck before handoff** — `pnpm -F <pkg> typecheck` for touched packages.
3. **Run tests before handoff** — `pnpm exec vitest run --run` scoped to touched packages.
4. **No uncommitted implementation changes** — all code changes must be linked to a feature's commit.
5. **No secrets in commits** — use `.env.example` pattern; never commit real tokens.
6. **Drop local inference** — when replacing imports, do NOT re-add `@huggingface/transformers`, `onnxruntime-web`, or related packages.
7. **Preserve eventa contracts** — the eventa contract names (`electron:window:get-bounds`, etc.) are interface IDs for the renderer. The Rust side must handle commands with these names. Changing them requires coordinated Tauri adapter + Rust update.
8. **Screenshot evidence for window behavior** — capture static images of transparency and click-through states for handoff.

## Known Pre-Existing Issues

- **Pure Wayland only** — X11 support is intentionally not provided. Do not write X11-specific code paths. If a feature requires X11, treat it as a feature gap to solve via Wayland protocols (xdg-desktop-portal, wlr-foreign-toplevel-management, etc.) or document as unsupported on non-compositors.
- Wayland transparency is compositor-dependent (KDE/GNOME best-supported; wlroots compositors have limitations). Workers must test on KDE or GNOME for visual verification.
- Vitest browser mode (Playwright) exists only for `packages/stage-ui/*.browser.test.ts`. Don't add new browser tests unless specifically asked.
- `packages/stage-shared/src/beat-sync/detector.ts`: currently uses `@proj-airi/electron-screen-capture`. Test this package specifically when replacing.

## Validation Config

```
commands:
  install: pnpm install
  typecheck: pnpm typecheck
  build: pnpm build
  test: pnpm exec vitest run --run --reporter=default
  lint: pnpm lint
```

Workers should scope these to `-F @proj-airi/<pkg>` for the packages they touch rather than whole-repo invocations.

## Testing & Validation Guidance

For validators:
1. Launch the Tauri app via `cargo tauri dev` and wait for the main window.
2. Use `agent-browser` configured to attach to the Tauri window (CDP port is `1420` for the dev server, native window attachment varies by desktop session).
3. Screenshot all pages reachable from the main menu.
4. Verify click-through by attempting to interact with the desktop behind the overlay window.
5. The desktop-overlay window is gated behind `AIRI_DESKTOP_OVERLAY=1` env var.
6. Channel server config page will generate a QR code — must render correctly.
7. Auto-updater page must show current version (no real feed configured by default).
8. Godot and MCP sidecars will not start unless the user has those binaries installed locally; validators should note "skipped, binary not available" rather than "failed".
