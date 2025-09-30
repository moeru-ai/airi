# たまごっち アイリ

A desktop application for たまごっち アイリ.

## Project Setup

### Install

```bash
$ pnpm install
```

### Development

Run from the project root:

```bash
$ pnpm dev:tamagotchi
```

This automatically starts both the WebSocket server and the Tamagotchi app.

> **Note:** The Tamagotchi app requires the WebSocket server (`@proj-airi/server-runtime`) running on port 6121. The `dev:tamagotchi` command handles this automatically. If you need to run components separately for debugging, use `pnpm dev:server` and `pnpm dev:tamagotchi:app-only`.

### Build

```bash
# For windows
$ pnpm build:win

# For macOS
$ pnpm build:mac

# For Linux
$ pnpm build:linux
```

## TODO List

- [x] Window control: Move, resize, hide, show
- [ ] Motions follow the cursor
- [x] System tray
- [ ] tauri i18n
- [ ] Multi-DPI
- [x] CI/CD
- [ ] Multi monitor
- [ ] Send message via macOS Spotlight
- [ ] Steam
- [ ] CSP settings
- [ ] MCP Client
