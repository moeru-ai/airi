# Tauri Plugin Capability Map — AIRI Electron → Tauri Equivalents

Each row is rated **✓** (official plugin / first-class API), **△** (community plugin / partial / platform-specific), or **✗** (no equivalent). Notes include platform caveats and links.

---

## 1. Core Plugin Map

| AIRI Feature | Electron / current API | Tauri Equivalent | Notes & links |
|---|---|---|---|
| Open URL / programmatic shell | `shell.openExternal()`, `child_process` | ✓ **tauri-plugin-shell** (--<https://v2.tauri.app/plugin/shell/>)<br>✓ **tauri-plugin-opener** (--<https://crates.io/crates/tauri-plugin-opener>) — dedicated file/URL opener in the system default app | Replaces both `shell.openExternal` and `child_process.spawn`. Sidecar support covers long-running binaries. |
| Global shortcut (hotkey) | `globalShortcut.register()` | ✓ **tauri-plugin-global-shortcut** (--<https://v2.tauri.app/plugin/global-shortcut/>) — API exists, lists Linux as supported | ⚠️ **Does NOT work on modern Wayland compositors** (COSMIC, Sway, Hyprland, etc.) ([Issue #949](https://github.com/cjpais/Handy/issues/949), [Issue #3578](https://github.com/tauri-apps/tauri/issues/3578)). X11-only on Linux. On macOS and Windows it works. |
| Push-to-talk (key-up event) | Listening on key release of a global shortcut | △ **global-shortcut** `ShortcutState::Released` exists in Rust API ([docs.rs](https://docs.rs/tauri-plugin-global-shortcut)) | Feature was originally requested in [Issue #4364](https://github.com/tauri-apps/tauri/issues/4364), closed as implemented in v2. **Only works on Windows/macOS**; on Linux even X11 has flaky release tracking. Workaround: an **evdev-based daemon** reading `/dev/input/event*` (bypasses Wayland entirely) — see [Handy#949](https://github.com/cjpais/Handy/issues/949). Requires `input` group membership. |
| Single-instance lock | `app.requestSingleInstanceLock()` | ✓ **tauri-plugin-single-instance** (--<https://v2.tauri.app/plugin/single-instance/>) | |
| Auto-update (in-app) | `autoUpdater` (electron-updater) | ✓ **tauri-plugin-updater** (--<https://v2.tauri.app/plugin/updater/>) — pulls from update server or static JSON | Known bug: `update.install()` returning never ([Issue #2558](https://github.com/tauri-apps/plugins-workspace/issues/2558)) — verify in target version. |
| Persistent KV store | `electron-store` / NSUserDefaults / registry | ✓ **tauri-plugin-store** (--<https://v2.tauri.app/plugin/store/>) — lazy loaded file-backed store | Custom path, JSON blob store. |
| Persistent state (scoped) | — | ✓ **tauri-plugin-persisted-scope** (--<https://v2.tauri.app/plugin/persisted-scope/>) — filesystem scopes persisted across restarts | |
| Native notifications | `new Notification()` / ` Notification` API | ✓ **tauri-plugin-notification** (--<https://v2.tauri.app/plugin/notification/>) | |
| Autostart / login item | `app.setLoginItemSettings()` | ✓ **tauri-plugin-autostart** (--<https://github.com/tauri-apps/tauri-plugin-autostart>) | Flatpak has a known bug in Exec line ([Issue #3166](https://github.com/tauri-apps/plugins-workspace/issues/3166)). |
| System dialogs (file, folder, message) | `dialog.showOpenDialog()`, `showMessageBox()`, etc. | ✓ **tauri-plugin-dialog** (--<https://v2.tauri.app/plugin/dialog/>) | |
| File system access | `fs`, `fs/promises` | ✓ **tauri-plugin-fs** (--<https://v2.tauri.app/plugin/fs/>) — scoped FS via capabilities | Scoped-capability security model. Users must declare allowed paths. |
| HTTP client | `net.fetch`, `BrowserWindow.webContents.session`, Axios | ✓ **tauri-plugin-http** (--<https://v2.tauri.app/plugin/http/>) — Rust HTTP client exposed to JS | Replaces Electron `net` module — reads headers, supports streams. |
| WebSocket / WS server | `ws`, `uWebSockets.js`, built-in HTTP+WS server | ✓ **tauri-plugin-websocket** (--<https://v2.tauri.app/plugin/websocket/>) — Rust client exposed to JS | No built-in WS server; runs client only. Server must be built with `axum`/`tokio-tungstenite` or a sidecar. |
| SQL / ORM | `better-sqlite3`, `sequelize`, `prisma`, `drizzle` | ✓ **tauri-plugin-sql** (--<https://v2.tauri.app/plugin/sql/>) — sqlx under the hood, supports SQLite, MySQL, PostgreSQL<br>△ **@type32/tauri-sqlite-orm** — Drizzle-like TS wrapper ([npm](https://www.npmjs.com/package/@type32/tauri-sqlite-orm))<br>△ **tauri-plugin-libsql**: libsql + encryption ([GitHub](https://github.com/HuakunShen/tauri-plugin-libsql)) | Supports Rust-defined migrations. Community Drizzle bridge available but less mature. |
| MCP client integration | `@modelcontextprotocol/sdk` (stdio/SSE) | ✓ **tauri-plugin-mcp** (community, by P3GLEG — [crates.io](https://crates.io/crates/tauri-plugin-mcp), [GitHub](https://github.com/P3GLEG/tauri-plugin-mcp)) — TCP + auth-token MCP server/client bridge<br>✓ **rust-mcp-sdk** (official MCP rust SDK — [crates.io](https://crates.io/crates/rust-mcp-sdk))<br>✓ **rmcp** (async MCP in Rust — [crates.io](https://crates.io/crates/rmcp))<br>✓ **async-mcp** (alternative) | No official Tauri MCP plugin yet, but multiple Rust libraries officially implement the protocol. |
| MCP server (expose AI tools) | Custom stdio JSON-RPC server | △ Build your own with `rust-mcp-sdk` or `rmcp` from inside a Tauri command — or any sidecar. | No one-click "MCP server plugin"; composes from libs. |

---

## 2. Critical Gaps (Features with No Tauri Equivalent)

| AIRI Feature | Electron API | Tauri Status | Notes |
|---|---|---|---|
| Silent screen capture with source enumeration | `desktopCapturer.getSources()` | ✗ No equivalent | Tauri uses OS WebView. Silent capture not possible by design — would need **xdg-desktop-portal** ScreenCast interaction (requires user pick each session on Wayland). On X11, `xdotool` / `xrandr` hacks possible. On PipeWire/Wayland, only `org.freedesktop.portal.ScreenCast` works. |
| Click-through with forward-to-app | `win.setIgnoreMouseEvents({ forward: true })` | ✗ Missing `forward` option | Tauri has `set_ignore_cursor_events(ignore: bool)` but **[no `forward` option](https://github.com/tauri-apps/tauri/issues/6164)**; issue open since 2023 ([Issue #6164](https://github.com/tauri-apps/tauri/issues/6164), [#13070](https://github.com/tauri-apps/tauri/issues/13070)). |
| Vibrancy / acrylic / hud | `vibrancy: 'under-window'`, BrowserWindow `backgroundMaterial` | △ **window-vibrancy** crate — macOS + Windows only ([crates.io](https://crates.io/crates/window-vibrancy)); Linux **unsupported** (compositor-controlled) | |
| Power events (suspend/resume/shutdown) | `powerMonitor.on('suspend')`, `on('resume')`, `on('shutdown')` | ✗ No official plugin | Third-party `tauri-plugin-power-manager` exists ([GitHub](https://github.com/cijiugechu/tauri-plugin-power-manager)) but only supports shut down/reboot/logout commands — **no suspend/resume event monitoring**. |
| Media access status checks | `systemPreferences.getMediaAccessStatus('camera')` on macOS | ✗ No equivalent | On macOS/iOS, Tauri uses WKWebView; camera/mic access relies on WebView prompt — frequently broken, users must workaround via Safari localhost (Issue [#11951](https://github.com/tauri-apps/tauri/issues/11951)). macOS telephony `askForMediaAccess` not available. |

---

## 3. Godot Sidecar Bundling

| Question | Status | Notes & links |
|---|---|---|
| Does Tauri support bundling a Godot binary? | ✓ Yes | Tauri's **sidecar** mechanism is purpose-built for this. Configure in `tauri.conf.json`: `bundle.externalBin: ["binaries/godot"]`. Provide platform-specific binaries at `src-tauri/binaries/godot-x86_64-unknown-linux-gnu`, `-aarch64-apple-darwin`, etc. Each binary is embedded in the final bundle under `resources/`. Spawn via `app.shell().sidecar("godot").spawn()`. See <https://v2.tauri.app/develop/sidecar/> and <https://v2.tauri.app/learn/sidecar-nodejs/>. |

---

## 4. Multi-Window and WebView Architecture

| Question | Notes |
|---|---|
| Multi-webview / multi-window? | ✓ **Full multi-window support.** Declare windows statically in `tauri.conf.json` or create at runtime with `WebviewWindowBuilder`. |
| Transparent floating panel? | ✓ `WindowBuilder::transparent(true)` + `always_on_top(true)` + `decorations(false)` → floating panel works on X11. Wayland: transparency has known issues (white flashes on first draw, [#14515](https://github.com/tauri-apps/tauri/issues/14515); inconsistent transparent render, [#13070](https://github.com/tauri-apps/tauri/issues/13070)). |
| Background window + floating panel? | ✓ Works on Windows/macOS and generally on X11 Linux. Compositor-dependent on Wayland. |
| Mobile multi-window? | ✓ Android uses `Activity` per window; iOS uses `UIScene`. See <https://v2.tauri.app/learn/mobile-multiwindow/>. |
| `iframe` / separated web contents? | WKWebView / WebView2 inherit platform iframe restrictions — same-origin policy, CORS. No special easing compared to Electron. |

---

## 5. Wayland Support

| Topic | Status | Notes |
|---|---|---|
| General Wayland support | △ Partial | Global shortcuts don't work on most Wayland compositors (COSMIC, Sway, Hyprland). Screen capture requires user-interaction with xdg-desktop-portal. Transparent windows have bugs. |
| Global shortcuts | ✗ Broken on default Wayland compositors | Compositor must mediate shortcuts. Workaround: an **evdev** daemon or ** compositor-level shortcut** invoking a CLI. |
| Click-through | △ Partial | `set_ignore_cursor_events(true)` works but **no forward option** to pass events to the underlying app. |
| Transparent windows | △ Render bugs | White flashes on first show; certain WM configs produce opaque background. |
| Vibrancy / blur | ✗ Linux unsupported | Compositor-controlled; cannot be set from user code. |
| Screen capture | △ PipeWire/XDP only | Must go through xdg-desktop-portal — silent/background enumeration not possible. |
| Notifications | ✓ Works via Freedesktop notification portal | |

---

## 6. Mobile Platform Readiness (Android / iOS)

| Requirement | Status | Notes |
|---|---|---|
| Scaffolding | ✓ Native | `tauri init` with `tauri android init` / `tauri android dev` / `tauri ios init` / `tauri ios dev`. Stable since Tauri 2.0 ([blog](https://v2.tauri.app/blog/tauri20/)). |
| Prerequisites | ✓ Documented | Android: NDK, JDK 17+, Android Studio. iOS: Xcode 15+, `cargo-xcode` plugin. |
| Tauri Android SDK | ✓ WKWebView on iOS; WebView (Chromium) on Android | Both fit within Apple/Google embedded-webview rules because system WebView is used (not bundled Chromium). |
| Mobile-specific libs | ✓ Existing | `tauri-plugin-barcode-scanner`, `tauri-plugin-haptics`, `tauri-plugin-biometric`, etc. |
| Multi-window on mobile | ✓ Supported | Separate from desktop. |
| Known gaps | △ Rough edges | iOS safe-area workarounds needed ([blog post](https://engineering.mobalab.net/2026/05/13/tauri-2-on-ios-a-simple-fix-for-wkwebview-safe-area-inset/)); Reddit thread "[Tauri is unsuitable for mobile](/r/tauri/comments/1maezph/tauri_is_unsuitable/)" lists developer pain points (2025/07). |
| Background execution | △ `tauri-plugin-background-service` ([crates.io](https://crates.io/crates/tauri-plugin-background-service)) for Android, iOS, desktop | Created to address background tasks. |

---

## 7. Channel Server / WebSocket Server / Built-in HTTP+WS

| Question | Status | Notes |
|---|---|---|
| Run a Rust HTTP server inside Tauri (axum/h3/hyper)? | ✓ Yes | Run inside a Tauri command or at app startup. Example: `axum::Server::bind(...)` in a separate async task. Known quirk: WebSocket servers conflict with Tauri's own event loop on macOS (need to use threads properly). |
| Tauri mobile can run an HTTP+WS server | △ Possible but inconvenient | iOS background mode restricts long-running network daemons. Android can run a foreground service (see `tauri-plugin-background-service`). Many apps just rely on the WebView fetch + Rust commands instead of embedded HTTP. |
| Whether a custom HTTP+WS server will survive mobile lifecycle | △ Platform-dependent | iOS aggressively suspends apps; Android may kill the process. WebSocket apps on mobile should reconnect from the client side. |

---

## 8. Dynamic JS Plugin Host

| Question | Status | Notes |
|---|---|---|
| Host dynamic JS plugins at runtime? | △ Community solutions only | ✗ No first-class dynamic plugin host inside Tauri itself. ✓ Several community projects: <br>• **tauri-plugin-deno** ([GitHub](https://github.com/marcomq/tauri-plugin-deno)) — embeds Deno Core to run JS/TS | <br>• **tauri-plugin-js** ([GitHub](https://github.com/HuakunShen/tauri-plugin-js)) — Electron-like backend JS runtime | <br>• Custom TS engines (e.g., screenpipe) | <br>• Bun as a sidecar | <br>Bundle a Node.js sidecar compiled with `pkg` or Bun's `compile`. |
| Web Worker / sandbox | ✓ Yes | Tauri WebView supports native Web Workers (off the main thread). Rust-side isolation is lower-level — must implement manually. Deno/Bun runtimes provide their own sandboxing. |

---

## 9. Build Tool / DX equivalent to `electron-vite`

| Question | Status | Notes |
|---|---|---|
| Build tool equivalent? | ✓ Vite + Tauri CLI | Tauri v2 documents **Vite integration** directly: <https://v2.tauri.app/start/frontend/vite/>. The Tauri CLI supports hot-reload, dev server proxy, and asset bundling. No separate `electron-vite`-style wrapper is needed — Tauri IS the build tool when using Vite. |
| HMR | ✓ Native | `tauri dev` runs Vite dev server + Rust build, proxies WS between them. |

---

## 10. Spawning a Node.js Child Process

| Question | Status | Notes |
|---|---|---|
| Can a Tauri app spawn a Node.js child process? | ✓ Yes | Tauri's **sidecar** mechanism is purpose-built for this. Also `tauri-plugin-shell` exposes a generic `Command::new("node")`. |
| For MCP stdio | ✓ Yes | Spawn the MCP server binary as a sidecar; pipe stdout/stdin through Tauri events. |
| For Godot | ✓ Yes | Godot headless/embedded exported binary can be the sidecar. |
| For plugin host | ✓ Yes (with bundling) | Node.js must be compiled to a self-contained executable (either via `pkg` ([npm](https://www.npmjs.com/package/pkg)) or `bun build --compile`) and bundled, since the user cannot be expected to have Node installed. |
| Bypasses stdio receiver | ∆ Known bug | `[bug] Receiver coming from Command::spawn() never gets stdout if ...` ([Issue #3508](https://github.com/tauri-apps/tauri/issues/3508)) — verify if fixed in the target Tauri version. |
| Permissions needed | ✓ Capability-based | Requires `shell:allow-execute` permission in `capabilities/default.json` with the sidecar name. |

---

## 11. Quick-Reference Summary

| Plugin / API | Tauri / status | AIRI use |
|---|---|---|
| `@tauri-apps/plugin-shell` | ✓ Official | Spawn sidecars, open URLs |
| `@tauri-apps/plugin-opener` | ✓ Official | Open files/URLs in system default |
| `@tauri-apps/plugin-global-shortcut` | ✓ Official (broken on Wayland) | Push-to-talk, hotkeys |
| `@tauri-apps/plugin-single-instance` | ✓ Official | Single-instance lock |
| `@tauri-apps/plugin-updater` | ✓ Official | In-app auto-update |
| `@tauri-apps/plugin-store` | ✓ Official | Persistent KV |
| `@tauri-apps/plugin-persisted-scope` | ✓ Official | Scoped persistent FS |
| `@tauri-apps/plugin-notification` | ✓ Official | Native notifications |
| `@tauri-apps/plugin-autostart` | ✓ Official | Login-item autostart |
| `@tauri-apps/plugin-dialog` | ✓ Official | Native dialogs |
| `@tauri-apps/plugin-fs` | ✓ Official | Scoped filesystem |
| `@tauri-apps/plugin-http` | ✓ Official | HTTP net client |
| `@tauri-apps/plugin-websocket` | ✓ Official | WebSocket client |
| `@tauri-apps/plugin-sql` | ✓ Official | SQLite/MySQL/PostgreSQL |
| `tauri-plugin-mcp` | ✓ Community | MCP server/client bridge |
| `rust-mcp-sdk` / `rmcp` / `async-mcp` | ✓ Official libs | Build MCP servers in Rust |
| `tauri-plugin-power-manager` | ✓ Community | Only control operations — no suspend events |
| `tauri-plugin-background-service` | ✓ Community | Background lifecycle on mobile+desktop |
| `tauri-plugin-deno` | ✓ Community | Run JS/TS plugins via Deno |
| `tauri-plugin-js` | ✓ Community | Electron-like backend JS runtime |
| `window-vibrancy` | ✓ (macOS+Windows only) | Vibrancy/acrylic/hud |
| `tauri-plugin-libsql` | ✓ Community | LibSQL + encryption |
| Wayland screen capture | ✗ No silent equivalent | PipeWire + xdg-desktop-portal only, requires user |
| `win.setIgnoreMouseEvents({forward:true})` | ✗ No forward option | Issue open; track [#6164](https://github.com/tauri-apps/tauri/issues/6164) |
| macOS `getMediaAccessStatus` | ✗ No equivalent | Use `AVCaptureDevice.authorizationStatus` via native plugin or permission workaround |
| Linux vibrancy | ✗ Unsupported | Compositor-controlled |

---

## 12. Wayland Workarounds and Patterns

| Gap | Approach | Caveats |
|---|---|---|
| Global shortcuts (push-to-talk) | **evdev daemon** — read `/dev/input/event*` via Rust `evdev` crate; auto-selected when WAYLAND_DISPLAY is set and user is in `input` group | Requires `input` group; returns key-up/press reliably; does not work on every input device |
| Global shortcuts (toggle) | Register via **compositor shortcut** (COSMIC `~/.config/cosmic/com.system76.CosmicSettings.Shortcuts/v1/custom`, Sway `bindsym`, Hyprland `bind`) that invokes a CLI flag | Works because Wayland compositors are required to mediate shortcuts |
| Click-through (overlay) | `set_ignore_cursor_events(true)` + per-pixel alpha channel in the page — **forward option still missing**; users click through transparent areas but the window itself loses those pixels — different behavior from Electron's `forward: true` | Workarounds: transparent window per-region via alpha mask; or composite each clickable widget separately |
| Screen capture | PipeWire via xdg-desktop-portal — triggers user choice dialog every session; silent/background enumeration not possible | No silent `desktopCapturer` equivalent — AI assistant screen observation will interrupt the user |
| Vibrancy | Drop the feature on Linux, fall back to composited blur via CSS | Look for `KWindowSystem` / `x11` blur via qtified CSS as workaround |
| Power events | Poll systemd-logind via `zbus` or watch `/sys/power/state` | No in-tree equivalent |

---

## 13. Electron → Tauri Migration Notes for AIRI

- Replace `electron-store` with **tauri-plugin-store** (API is similar).
- Replace `globalShortcut.register()` + push-to-talk via **evdev daemon** or **compositor shortcuts** when on Wayland.
- Replace `dialog.showOpenDialog` etc. with **tauri-plugin-dialog**.
- Replace `net.fetch` with **tauri-plugin-http**.
- Replace `better-sqlite3` with **tauri-plugin-sql** + Drizzle migration port.
- Replace `electron-updater` with **tauri-plugin-updater**.
- Replace IPC bridge — Tauri's **Commands** are directly callable from frontend via `invoke('cmd', args)`. Either side can register Rust commands; no separate IPC layer.
- Replace sidecar pattern — Node.js for MCP stdio is bundled via `pkg` or Bun's `compile`. Godot binary is just another `externalBin`.
- **Replace `electron-vite` with plain Vite + Tauri CLI** — no wrapper needed.
- Replace dynamic JS plugin host: adopt **tauri-plugin-deno** (Deno Core) or a **Node.js sidecar** compiled to self-contained binary.
- For macOS media access: write a small **Rust + Tauri plugin** that calls `AVCaptureDevice.authorizationStatus(for: .audio/.video)` and exposes to JS.

---

## 14. Key Source Links

- Official plugins portal: <https://v2.tauri.app/plugin/>
- Sidecar guide: <https://v2.tauri.app/develop/sidecar/>
- Node.js as a sidecar: <https://v2.tauri.app/learn/sidecar-nodejs/>
- Window customization: <https://v2.tauri.app/learn/window-customization/>
- Mobile multi-window: <https://v2.tauri.app/learn/mobile-multiwindow/>
- Mobile plugin development: <https://v2.tauri.app/develop/plugins/develop-mobile/>
- Global shortcut: <https://v2.tauri.app/plugin/global-shortcut/>
- Global shortcut Wayland issues: [#3578](https://github.com/tauri-apps/tauri/issues/3578), [#949 (Handy)](https://github.com/cjpais/Handy/issues/949)
- Click-through forward missing: [#6164](https://github.com/tauri-apps/tauri/issues/6164)
- Transparent window white flash: [#14515](https://github.com/tauri-apps/tauri/issues/14515)
- Global shortcut feature request for key-up: [#4364](https://github.com/tauri-apps/tauri/issues/4364)
- Tauri v2 multiwindow guide: <https://www.oflight.co.jp/en/columns/tauri-v2-multi-window-system-tray>
- Rust + Tauri + Axum: <https://users.rust-lang.org/t/error-using-tauri-and-axum-in-the-main-function/118479>
- MCP client crates: <https://crates.io/crates/rust-mcp-sdk>, <https://crates.io/crates/rmcp>
- tauri-plugin-deno: <https://github.com/marcomq/tauri-plugin-deno>
- Window vibrancy: <https://github.com/tauri-apps/window-vibracity>
- Wayland transparent issue list: see [#4881](https://github.com/tauri-apps/tauri/issues/4881), [#8308](https://github.com/tauri-apps/tauri/issues/8308), [#12450](https://github.com/tauri-apps/tauri/issues/12450)
