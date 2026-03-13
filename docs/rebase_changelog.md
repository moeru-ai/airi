# Rebase Changelog — What You Gained

> Everything from upstream `moeru-ai/airi` main that your fork now picks up (alpha.6 → alpha.14).

---

## 🚀 New Features

### Electron Desktop (`stage-tamagotchi`)
- **Connection status indicator** — shows live server-channel connectivity state (#1311)
- **"Pin on top" toggle** in controls island (#1183)
- **Window lifecycle management** — proper pause/resume when minimized/backgrounded
- **Top drag area** to move the window (added, reverted, then fixed differently) (#1231)
- **File logger hook** for Electron main process (#1247)
- **Onboarding dialog** — brought back, refactored steps, crash fixes (#1104, #1224, #1246)
- **Caption overlay** — tray menu can now close it (#1316)

### Mobile (`stage-pocket`)
- **Permissions onboarding flow** (#1292)

### VRM / 3D Scene
- **VRM expression panel** with word-salad toggle buttons
- **Emotions sub-menu** and quick-toggle favorite in ControlsIsland
- **Default persona on boot**, ACT emotion mapping modal, long-press interaction
- **VRM performance tracing** and better lifecycle management (#1194)
- **Drag bar re-enabled** and `alwaysOnTop` fixed

### Speech / Hearing
- **ComfyUI widget** — GPU optimizations, mic-toggle sync, speech validation logging
- **Stabilized 3D scene** and expression synchronization

### UI / UX
- **Optimized card many-select component** layout styles (#1096)
- **Deduplicated provider models** by ID (#1282)
- **Lightweight fetch** for connectivity checks (#1238)

### Server / Backend
- **Server channel** accepts plain JSON from external WebSocket clients (#1234)
- **Multiple module health check events** in server-runtime
- **NixOS FHS devShell** for running Electron on NixOS (#1245)

---

## 🐛 Bug Fixes

### Critical Fixes
- **VRM "Megazord" bug** — fixed all expressions activating simultaneously
- **Model selector static preview** — no more megazord artifacts in preview rendering
- **Additive expression engine** — removed material hacks, fixed render order/transparency for Sitali (eyes) and Morinatsu (butterfly)
- **Transcription network hangs** — resolved VAD audio quality issues and tool calling in voice chat
- **IPC crash prevention** — fixed selection reset, silenced noisy logs
- **App exit handling** — made `handleAppExit` more robust, fixed double-close crash (#1243, #1319, #1321)

### Desktop Fixes
- **Hearing dialog** no longer causes controls island to collapse
- **Onboarding crash** on save — fixed by bumping Electron to v40.8.0 (#1246)
- **Config directory** now ensured to exist before writes
- **`@intlify/core`** moved from devDeps to deps (#1291)
- **Missing `h3` dependency** (#1265)
- **Disabled hoverable content** of control button (#1240)
- **Hearing drawer height** — no longer percentage-based

### Plugin System
- **Plugin SDK** — trim negotiated compatibility versions (#1305)
- **Plugin loading deadlock** — resolved via opacity-based visibility refactoring

### Server
- **`EADDRINUSE` handling** in server channel, robust restart with injeca fixes
- **Lint issues** in services (#1261)

### Mobile
- **`mkcert`** — uses system mkcert to avoid feaxios download crash (#1220)

### Live2D
- **Model file validation** — requires `.model.json` or `.model3.json` (#1156)
- **Temp file usage** prevents config loss and handles more load failures (#1233)

### Canvas / UI
- **Flipped canvas pixel reads** on Y axis (#1309)
- **Skip optimistic updates** before apply (#1304)
- **SSML support removed** for Volcengine speech provider (#1232)

---

## 🔧 Refactors & Infrastructure
- **VRM performance tracing** overhaul with better lifecycle management (#1194)
- **`cap-vite`** refactored to use plugin API instead of `createServer`, forwarded options to Capacitor CLI
- **pnpm** bumped to v10.32.1 (#1252)
- **`@moeru/eventa`** dependency bump
- **Nix** pnpmDeps hash updates (multiple)
- **README** — comprehensive contributor guide, download buttons, platform cards, release artifact URLs

---

## 🌐 i18n
- Translation updates across multiple rounds (#1226, #1251, #1301, #1325)

---

## 📦 Releases Included
| Release | Key Theme |
|---|---|
| **alpha.6** | Onboarding redesign, hearing drawer fixes |
| **alpha.7** | Window dragging, Live2D stability |
| **alpha.8** | Config safety, onboarding prompts |
| **alpha.9** | NixOS support, eventa bump |
| **alpha.10** | cap-vite refactor, file logger |
| **alpha.11** | Server channel robustness |
| **alpha.12** | Electron bump, onboarding crash fix |
| **alpha.13** | Provider dedup, SSML removal |
| **alpha.14** | VRM tracing, connection status, plugin SDK fixes |
