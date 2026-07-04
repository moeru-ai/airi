# User Testing

Manual and automated validation of the Tauri port.

## Validation Surface

**Primary surface:** Linux desktop running **Wayland only** (no X11, no XWayland). The user is on CachyOS with KDE/GNOME. Tests must exercise:
- Wayland-native transparent windows
- `xdg-desktop-portal`-backed screen capture
- Wayland global shortcuts via D-Bus portals
- `wlr-data-control` or wlr-protocol-equivalent clipboard

**Secondary surface:** agent-browser (configured to attach to the Tauri native window via the system compositor, not HTTP). Screenshot capture via `agent-browser` screenshot capability.

**Tertiary surfaces (milestone-gated):**
- `cargo test --workspace` — unit tests in Rust workers
- `pnpm exec vitest run --run` — renderer unit tests
- Manual UI walkthrough of Tauri-driven pages

## Validation Prerequisites

**Verified toolchain present in this environment:**
- cargo + tauri-cli — mission's `init.sh` installs if missing
- rust target `wasm32-unknown-unknown` (for tauri-webview)
- Node.js 20+ / pnpm 10+ (existing)
- **Wayland compositor** (KDE Plasma, GNOME) for native window validation
- `xdg-desktop-portal` + a backend (`xdesktop-portal-kde` / `xdesktop-portal-gtl`) installed

**Ports claimed by the Tauri dev server:**
- `1420` — Vite dev server HMR (Tauri default)

**Environment:**
- `AIRI_DESKTOP_OVERLAY=1` — gate the overlay window off by default; tests can opt-in via env
- `AIRI_APP_DEBUG=1` — extra debug logging (optional)
- `XDG_SESSION_TYPE=wayland` — must be Wayland; tests fail if X11 detected

## Resource Cost Classification

Surface: `agent-browser` (Tauri desktop app)

Per-validator cost:
- Tauri app RAM: ~100 MB (shared Rust process + renderer)
- agent-browser overhead: ~200 MB
- Total per validator: ~300 MB

Machine memory: 18 GB total, ~6 GB baseline. Usable headroom: 12 GB * 0.7 = 8.4 GB.
Concurrent fit: 8.4 GB / 0.3 GB = ~28. Conservative: **5** concurrent validators.

Rationale: Tauri is lightweight; but CDP port contention (each validator needs its own WebSocket attachment to the app) and Rust process parallelization cap the practical count.

## Test Assertions (mapped from `validation-contract.md`)

Each validation surface annotation in the contract maps to a specific testing procedure here.

| Assertion ID Pattern | Testing Procedure | Tool |
|---------------------|-------------------|------|
| `VAL-TAURI-SYS-*` | Invoke Rust command from UI and verify state change | agent-browser |
| `VAL-TAURI-WIN-*` | Verify window transparency/visibility via screenshot | agent-browser screenshot |
| `VAL-TAURI-IPC-*` | Verify event contract emits expected payload | agent-browser console log capture |
| `VAL-TAURI-OVRL-*` | Screenshot overlay window and verify click-through by checking what's visible beneath | agent-browser |
| `VAL-TAURI-SRV-*` | Hit channel server healthcheck endpoint | curl |
| `VAL-TAURI-PLGN-*` | Verify plugin list appears and activates | agent-browser |
| `VAL-TAURI-GOD-*` | Verify Godot sidecar spawns and reports status | agent-browser + log capture |
| `VAL-TAURI-AUTH-*` | Verify OIDC login opens system browser, returns to app | agent-browser |
| `VAL-TA-UPD-*` | Verify auto-updater surfaces current version | agent-browser |
| `VAL-CROSS-XXX` | Verify cross-window behaviors (main window → settings → back → main) | agent-browser |

## Agent-Browser Setup

Attach to the Tauri window on Linux:
1. Launch `cargo tauri dev` in background.
2. Wait for the main window title (`"AIRI"` — set in `tauri.conf.json`).
3. Use `agent-browser` to navigate/a screenshot via the native window handle (title match).

Troubleshooting:
- If `agent-browser` can't find the window, use `xdotool` to list WINDOW_ID: `xdotool search --name "AIRI"`.
- If the Vite dev server hasn't bound `1420` yet, wait (timeout 30 sec).
- If the Rust app crashes on launch, use `RUST_BACKTRACE=1 cargo tauri dev` and send stderr to a log file.
