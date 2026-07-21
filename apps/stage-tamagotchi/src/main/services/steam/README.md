# Steam client (main process)

Wraps [`steamworks-ffi-node`](https://github.com/ArtyProf/steamworks-ffi-node) for silent sign-in when AIRI runs from the Steam client (App ID `3885340`).

## Local verification

### 1. Steamworks redistributables (required for `SteamAPI_Init`)

Pack `steam_appid.txt` and the platform API library into the tamagotchi package root (gitignored output):

```bash
pnpm -F @proj-airi/stage-tamagotchi exec tsx scripts/pack-steam-redistributables.ts macos .
```

Use `windows` or `linux` instead of `macos` on other platforms. CI uses the same script for `steam-content` (mirror via `STEAMWORKS_SDK_MIRROR_*` in `.github/workflows/release-tamagotchi.yml`). Replace the mirror with an org-private SDK bundle before long-term production use. GitHub Release builds do not bundle these files.

### 2. Server

```bash
# apps/server/.env
STEAM_PUBLISHER_KEY=<your publisher key>
```

Run the API server and ensure `POST /api/auth/steam/desktop-sign-in` is reachable from the desktop app (`VITE_SERVER_URL`).

### 3. Full desktop flow

1. Run `pnpm -F @proj-airi/stage-tamagotchi exec tsx scripts/pack-steam-redistributables.ts <windows|macos|linux> .` before `pnpm dev:tamagotchi`.
2. Launch from Steam (or dev: Steam running + `steam_appid.txt` in the executable directory).
3. On startup, main calls `trySteamSignIn` silently (no loading UI).
4. Success: session syncs like OIDC. Failure: toast via `electronAuthCallbackError`; use **Login** for OIDC.

### 4. Release / Steam depot

Steam CI sets `VITE_DISTRIBUTION=steam` so electron-builder `afterPack` injects
redistributables **before** codesign/notarize. On macOS they are placed **next
to** the `.app` (not under `Contents/MacOS`, which breaks Developer ID signing).
At runtime `initSteam` resolves that folder (via `steamSdkPath`) and calls
`setSdkPath` before `SteamAPI_Init`, because packaged Electron cwd is not the
depot root. Depot packaging copies the signed `.app` plus those sibling files.

Local / manual:

```bash
pnpm -F @proj-airi/stage-tamagotchi exec tsx scripts/pack-steam-redistributables.ts <windows|macos|linux> <destDir>
```

See `.github/workflows/release-tamagotchi.yml` (`STEAMWORKS_SDK_MIRROR_*` env).
