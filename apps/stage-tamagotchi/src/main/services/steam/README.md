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

### 3. Ticket spike (optional)

With the Steam client running (or `steam_appid.txt` next to the process cwd):

```bash
pnpm -F @proj-airi/stage-tamagotchi exec tsx scripts/steam-ticket-spike.ts
```

Prints a hex ticket on success.

### 4. Full desktop flow

1. Run `pnpm -F @proj-airi/stage-tamagotchi exec tsx scripts/pack-steam-redistributables.ts <windows|macos|linux> .` before `pnpm dev:tamagotchi`.
2. Launch from Steam (or dev: Steam running + `steam_appid.txt` in the executable directory).
3. On startup, main calls `trySteamSignIn` silently (no loading UI).
4. Success: session syncs like OIDC. Failure: toast via `electronAuthCallbackError`; use **Login** for OIDC.

### 5. Release / Steam depot

CI restores redistributables, then copies them into each `steam-content` tree:

```bash
pnpm -F @proj-airi/stage-tamagotchi exec tsx scripts/pack-steam-redistributables.ts <windows|macos|linux> <destDir>
```

See `.github/workflows/release-tamagotchi.yml` (`STEAMWORKS_SDK_MIRROR_*` env).
