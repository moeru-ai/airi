# Steam client (main process)

Wraps [`steamworks-ffi-node`](https://github.com/ArtyProf/steamworks-ffi-node) for optional ticket sign-in when AIRI runs from the Steam client.

## Steamworks redistributables

The platform Steam API library and `steam_appid.txt` are committed at the tamagotchi package root under `steamworks_sdk/`:

- `steamworks_sdk/redistributable_bin/win64/steam_api64.dll`
- `steamworks_sdk/redistributable_bin/osx/libsteam_api.dylib`
- `steamworks_sdk/redistributable_bin/linux64/libsteam_api.so`
- `steam_appid.txt`

`steam_appid.txt` at the package root is the dev default; `services/steam/client.ts`
reads it at runtime next to the SDK root. `pack-steam-redistributables.ts` writes a
fresh `steam_appid.txt` from `STEAM_APP_ID` and copies the current platform files
into a depot folder; electron-builder `afterPack` invokes it during Steam builds.
Local dev needs no extra step.

### 1. Server

```bash
# apps/server/.env
STEAM_PUBLISHER_KEY=<your publisher key>
STEAM_APP_ID=3885340
```

Run the API server and ensure `POST /api/auth/steam/desktop-sign-in` is reachable from the desktop app (`VITE_SERVER_URL`).

### 2. Full desktop flow

1. Launch from Steam (or dev: Steam running + `steam_appid.txt` in the executable directory) with `VITE_DISTRIBUTION=steam`. Startup runs silent ticket sign-in; failures stay quiet and **Login** still opens browser OIDC (`ui-server-auth`).
2. Linking Steam to an existing AIRI account stays on web OpenID (`POST /link/steam`), not the ticket path.

### 3. Release / Steam depot

Steam CI sets `VITE_DISTRIBUTION=steam` and `STEAM_APP_ID` so electron-builder
`afterPack` writes `steam_appid.txt` and copies the committed redistributables
**before** codesign/notarize. On macOS they are placed **next to** the `.app`
(not under `Contents/MacOS`, which breaks Developer ID signing). Depot packaging
copies the signed `.app` plus those sibling files.

Local / manual depot assembly:

```bash
pnpm -F @proj-airi/stage-tamagotchi exec tsx scripts/pack-steam-redistributables.ts <windows|macos|linux> <destDir>
```
