# Channel Server QR Design

## Context

Mission feature `channel-server-qr` completes `VAL-TAURI-SRV-002`: the Tauri settings connection page must render a QR code from `electron:server-channel:get-qr-payload`, and the encoded payload must contain a valid URL to the active channel server.

The preceding `channel-server-health` feature starts a Tauri-owned channel server on a dynamic non-reserved port and exposes HTTP `/health`. It also added a Rust command for QR payloads, but that command currently returns `{ url, token }`. The existing Electron renderer and shared QR contract use a different payload shape:

```ts
{
  type: 'airi:server-channel',
  version: 1,
  urls: ['ws://<host>:<port>/ws'],
  authToken: '<token>'
}
```

This feature keeps that shared contract. The QR is for connecting remote AIRI clients to the channel server websocket endpoint. The HTTP health URL remains a separate validation surface for `VAL-TAURI-SRV-001`.

## Approach

Implement the narrow Tauri QR path rather than migrating the full Electron settings router now.

1. Update the Rust QR command response to match the shared contract exactly: `type`, `version`, `urls`, and `authToken`.
2. Generate websocket URLs as `ws://<host>:<port>/ws`, preferring a LAN host when one is known and falling back to localhost only when no LAN host is available.
3. Add a Tauri-local settings connection QR view for the `/settings/connection` route. The existing Tauri secondary-window shell remains for other routes.
4. Reuse the repo's existing `uqr` dependency for QR SVG generation. Add it to `apps/stage-tauri` dependencies instead of introducing a new QR package.

## Components

- `apps/stage-tauri/src/commands/server_channel.rs`
  - Owns the Tauri command payload and URL generation helpers.
  - Returns a command error when the channel server has no known port yet, because the shared QR schema requires at least one URL.

- `apps/stage-tauri/src/components/ServerChannelQrCard.vue`
  - Invokes `electron:server-channel:get-qr-payload` through `@proj-airi/tauri-eventa` / `@proj-airi/tauri-vueuse`.
  - Renders a stable white-background QR image from `JSON.stringify(payload)`.
  - Shows the candidate websocket URL text for validation and manual entry.
  - Provides loading, refresh, and error states.

- `apps/stage-tauri/src/settings-connection.ts`
  - Contains small pure helpers for payload validation, QR text creation, and SVG data URL creation so Vitest can cover the behavior without mounting the whole Live2D app.

- `apps/stage-tauri/src/App.vue`
  - Detects `/settings/connection` and renders the app-local QR view inside the secondary window content area.
  - Leaves stage, notice, widgets, and generic secondary route behavior unchanged.

## Data Flow

1. Tauri setup starts the channel server and records a `ChannelServerSnapshot` with hostname, dynamic port, LAN hosts, and auth token.
2. The settings QR view invokes `electron:server-channel:get-qr-payload`.
3. The Tauri Eventa adapter maps the Eventa invoke ID to `electron_server_channel_get_qr_payload`.
4. Rust reads the current snapshot and returns the shared QR payload.
5. The Vue view serializes that payload to JSON and passes it to `uqr.renderSVG`.
6. The generated SVG data URL is displayed as an `<img>` on the settings connection page.

## Error Handling

- If the channel server port is not known yet, the Rust command returns an error. The renderer shows a compact unavailable state with a refresh action.
- If the invoke rejects, the renderer shows the error message and does not render a stale QR.
- If QR generation receives an invalid or empty payload, it returns an empty source and the view stays in the unavailable state.

## Testing

Use TDD for production changes.

Rust tests:
- `qr_payload_matches_shared_contract`
- `qr_payload_uses_websocket_path`
- `qr_payload_prefers_lan_host_when_server_is_started`
- `qr_payload_errors_until_server_port_is_known`

Vitest tests:
- helper serializes the exact shared payload JSON used by the QR.
- helper builds a white-background SVG data URL for a valid payload.
- helper returns an empty QR source for an unavailable payload.
- route test covers `/settings/connection` selecting the connection QR view.

Verification commands:
- `cargo fmt --manifest-path apps/stage-tauri/Cargo.toml --check`
- `cargo test --manifest-path apps/stage-tauri/Cargo.toml server_channel`
- `pnpm -F @proj-airi/stage-tauri exec vitest run <new helper test> src/window-routes.test.ts`
- `pnpm -F @proj-airi/stage-tauri typecheck`
- `pnpm -F @proj-airi/stage-tauri build` when the existing Live2D SDK asset path is available.
- `git diff --check`

## Runtime Evidence

Preferred runtime validation is a screenshot of the Tauri settings connection page showing the QR card and a visible `ws://.../ws` candidate URL. If the desktop runtime cannot be launched in the CLI session, record that runtime screenshot evidence remains pending and keep automated tests as implementation evidence.

## Known Baseline Issues

- The mandatory Serena and jcodemunch MCP tools from `AGENTS.md` are unavailable in this tool surface, so native CLI fallback is used.
- Fresh worktree `pnpm install --frozen-lockfile` populates dependencies but the repo postinstall currently fails on `@proj-airi/core-terminal` declaration output: `Export 'NormalizedToolError' is not defined`.
- A pre-change stage-tauri Vitest route test can stall while the Vite plugin downloads or materializes the Cubism SDK. New QR helper tests should avoid loading the full app plugin path where possible.
