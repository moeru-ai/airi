# Storage Architecture

This document explains how data, state, and settings are managed in AIRI, and how to troubleshoot issues related to "disappearing" settings during development.

## Overview
AIRI uses a multi-layered storage strategy to handle different types of data:
1.  **Global App Configuration**: Managed by the Electron main process.
2.  **Renderer State & Settings**: Managed by Pinia stores in the renderer process.
3.  **Large Assets/Blobs**: Managed via IndexedDB and the File System Access API (OPFS).

## Storage Locations (Windows)
All local data is stored in the Electron `userData` directory:
- **Path**: `%APPDATA%\@proj-airi\stage-tamagotchi` (assuming default production `appId`).
- **Global Config**: `app-config.json` (window bounds, language, etc.).
- **Browser-level Storage**:
    - **LocalStorage**: `Local Storage/leveldb`
    - **IndexedDB**: `IndexedDB/*.indexeddb.leveldb`

## Critical Concept: Origin-Based Isolation
In development mode, the app runs on a local web server (Vite). Web storage (LocalStorage and IndexedDB) is isolated by **Origin**, which is the combination of `protocol + domain + port`.

### The "Port Switch" Problem
If the dev server starts on port `5173` one day and port `5174` the next, the app will:
1.  Successfully load the same `app-config.json` (shared by Electron).
2.  **Create a fresh, empty storage bucket** for the new port's origin.
3.  Appear as if all your settings, models, and backgrounds have been "lost" or reset.

### Troubleshooting
If your settings seem to have disappeared after a restart:
1.  Open DevTools (`Ctrl+Shift+I`).
2.  Check the current port in the Console: `window.location.port`.
3.  Compare this with the folders in your `IndexedDB` directory on disk. If you see folders for multiple ports (e.g., `5173`, `5174`, `5175`), your "missing" data is likely in one of the other port's folders.

## Managing the Dev Port
To ensure consistency across restarts, you can force the dev server to use a specific port.

### Option 1: Temporary (Command Line)
In Windows CMD, you must use `&&` to chain the set command:
```cmd
set PORT=5174 && pnpm run build && pnpm run dev:tamagotchi
```

### Option 2: Convenience Script (Recommended)
Run the `start_airi.bat` file in the root directory. It will prompt you for a port and handle the build/start sequence for you.

### Option 3: Force Port Override (Advanced)
If the renderer refuses to move from 5173, you can create a local config shim.
1. Create `apps/stage-tamagotchi/electron.vite.config.local.ts`.
2. Add a port override (contact architecture team for snippet).
3. Run with: `electron-vite dev --config electron.vite.config.local.ts`

## State Persistence Logic
- **Pinia**: Stores marked for persistence typically use `localStorage` under keys like `settings/*`.
- **LocalForage**: Used for IndexedDB interactions (e.g., storing imported models and backgrounds).
- **InjecA**: Used for dependency injection and service orchestration in the main process.
