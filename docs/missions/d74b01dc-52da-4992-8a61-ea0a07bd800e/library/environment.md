# Environment

Factual environment details for the Tauri port.

## Toolchain

- Node.js >= 20.14.0 / pnpm 10.33.0 (existing)
- Rust toolchain (to be installed by user)
- `cargo tauri` CLI v2
- `pkg` for Node plugin-host sidecar (when the sidecar feature lands)

## Platform Status (today)

| Platform | WebView | WebGL2 | WebGPU | Silent Capture | Transparent Win | Click-through | Global Shortcut |
|----------|---------|--------|--------|----------------|-----------------|---------------|-----------------|
| Linux Wayland | WebKitGTK | ✅ | ❌ | ❌ (portal picker) | ⚠️ compositor | ⚠️ hitbox+evdev | ⚠️ D-Bus portal |
| macOS | WKWebView | ✅ | ✅ (12+) | ❌ (OS picker) | ✅ | ⚠️ hitbox | ✅ |
| Windows | WebView2 (Chromium) | ✅ | ✅ | ❌ (OS picker) | ✅ | ⚠️ hitbox | ✅ |
| Android | System WebView | ✅ | ✅ (newer) | ❌ | N/A | N/A | N/A |
| iOS | WKWebView | ✅ | ✅ (17+) | ❌ | N/A | N/A | N/A |

Legend: ✅ supported natively, ⚠️ workaround in place (see architecture.md), ❌ not available (dropped)

### Linux Wayland — Compositor-Specific

| Compositor | Transparency | Always-on-top | Global Shortcut | Screen Capture | Notes |
|------------|--------------|---------------|-----------------|----------------|-------|
| KDE Plasma | ✅ | ✅ | ✅ (portal) | ✅ (PipeWire) | Best-supported Wayland compositor for Tauri |
| GNOME | ⚠️ | ⚠️ | ✅ (portal) | ✅ (PipeWire) | Transparency limited, extensions may interfere |
| COSMIC | ⚠️ | ⚠️ | ⚠️ | ⚠️ | New compositor, limited portal support |
| Sway/Hyprland | ⚠️ | ❌ | ❌ | ⚠️ (wlr) | wlroots-based, limited global shortcut portal |

**Required portal backends:** `xdg-desktop-portal` + ONE of `xdesktop-portal-kde`, `xdesktop-portal-gtk`, `xdesktop-portal-wlr`.

## PCI / Library Status (in-repo, verified)

- `packages/electron-eventa` — drop; replace with new `packages/tauri-eventa`
- `packages/electron-vueuse` — drop; replace with new `packages/tauri-vueuse`
- `packages/electron-screen-capture` — drop; use `navigator.mediaDevices.getDisplayMedia` directly
- `packages/stage-shared` — keep (with screen-capture shim replaced)
- `packages/stage-ui*` — keep (with small HEAVY-file rewrites)
- `packages/plugin-*` — keep
- `packages/server-runtime` — keep (now runs as Tauri async task)

## Tauri Plugin Ecosystem (verified)

| Plugin | Crate | Status |
|--------|-------|--------|
| shell | `tauri-plugin-shell` 2.x | ✅ Stable |
| opener | `tauri-plugin-opener` 2.x | ✅ Stable (replaces shell.openExternal) |
| single-instance | `tauri-plugin-single-instance` 2.x | ✅ Stable |
| window-state | `tauri-plugin-window-state` 2.x | ✅ Stable |
| updater | `tauri-plugin-updater` 2.x | ✅ Stable |
| store | `tauri-plugin-store` 2.x | ✅ Stable |
| notification | `tauri-plugin-notification` 2.x | ✅ Stable |
| autostart | `tauri-plugin-autostart` 2.x | ✅ Stable |
| dialog | `tauri-plugin-dialog` 2.x | ✅ Stable |
| fs | `tauri-plugin-fs` 2.x | ✅ Stable |
| http | `tauri-plugin-http` 2.x | ✅ Stable |
| websocket | `tauri-plugin-websocket` 2.x | ✅ Stable |
| sql | `tauri-plugin-sql` 2.x | ✅ Stable |
| clipboard | `tauri-plugin-clipboard-manager` 2.x | ✅ Stable |
| global-shortcut | `tauri-plugin-global-shortcut` 2.x | ✅ Stable (key-up: macOS/Windows only) |
| deep-linking | `tauri-plugin-deep-link` 2.x | ✅ Stable |

## Cross-references

For the per-window transparency workaround, see:
- `Xinyu-Li-123/tauri-clickthrough-demo` on GitHub
- Tauri issue #6164 (feature request for `forward` option — closed, won't be implemented)
- Tauri issue #13070 (duplicate of #6164)
