# Steam client (main process)

Wraps [`steamworks-ffi-node`](https://github.com/ArtyProf/steamworks-ffi-node) for silent sign-in when AIRI runs from the Steam client (App ID `3885340`).

## Local verification

### 1. Steamworks SDK (required for `SteamAPI_Init`)

Download the Steamworks SDK from the [Steamworks partner site](https://partner.steamgames.com/) and extract redistributables:

```text
apps/stage-tamagotchi/steamworks_sdk/redistributable_bin/
  win64/steam_api64.dll
  osx/libsteam_api.dylib
  linux64/libsteam_api.so
```

This directory is gitignored. CI and `electron-builder` copy these files when present; otherwise only `steam_appid.txt` is shipped.

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

1. Build or run tamagotchi with SDK redistributables beside `airi` / inside the `.app` bundle (`electron-builder` `afterPack` or `pnpm -F @proj-airi/stage-tamagotchi exec tsx scripts/copy-steam-redistributables.ts`).
2. Launch from Steam (or dev: Steam running + `steam_appid.txt` in the executable directory).
3. On startup, main calls `trySteamSignIn`; the controls island shows **Signing in with Steam…** / **正在通过 Steam 登录…**.
4. Success: session syncs like browser OIDC. Failure: one toast (`steam-sign-in-failed`); use **Login** for OIDC.

### 5. Release / Steam depot

After `electron-builder`, CI runs:

```bash
pnpm -F @proj-airi/stage-tamagotchi exec tsx scripts/copy-steam-redistributables.ts <windows|macos|linux> <destDir>
```

on each `steam-content-*` artifact (see `.github/workflows/release-tamagotchi.yml`).

---

## 本地验证（中文）

1. 从 Steamworks 合作伙伴站点下载 SDK，放到上文 `steamworks_sdk/redistributable_bin/` 结构。
2. 配置服务端 `STEAM_PUBLISHER_KEY`，启动 API。
3. 可选：运行 `steam-ticket-spike.ts` 确认能拿到 ticket。
4. 从 Steam 启动桌面端（或开发时 Steam 在线 + 可执行文件旁有 `steam_appid.txt`），观察静默登录；失败时弹出「Steam 登录失败」Toast，可点「登录」走 OIDC。
5. 发版流水线会在 `steam-content` 目录中写入 `steam_appid.txt` 与各平台 `steam_api` 库（SDK 需在构建机或缓存中提供）。
