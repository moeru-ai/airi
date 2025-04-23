# たまごっち アイリ

A desktop application for たまごっち アイリ.

## Project Setup

### Install

```bash
$ pnpm install
```

### Development

```bash
$ cd /apps/stage
$ pnpm dev:tamagotchi
```

Then open another terminal and run:

```bash
$ cd /apps/tamagotchi
$ pnpm dev:tamagotchi
```

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
