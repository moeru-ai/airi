# @proj-airi/electron-window-dock

Early scaffolding for AIRI Dock Mode. Provides:

- Main-side dock controller with visibility contract (frontmost + non-fullscreen).
- Platform tracker abstraction (currently Electron-window fallback stubs).
- Renderer/Vue IPC helpers for devtools and feature UI.

Usage:

1. Call `initWindowDockForMain()` in Electron main before creating windows.
2. Call `initWindowDockForWindow(mainWindow)` after creating the AIRI window to register IPC handlers and start the controller.
3. From renderer, use `useElectronWindowDock(ipcRenderer)` to list targets, start/stop dock, and read debug state.

Platform-native probes (Core Graphics/AX on macOS, Win32 on Windows) are intentionally stubbed; see `docs/dock-mode.md` for the plan and references.
