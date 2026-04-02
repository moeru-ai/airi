# DevTool - Capture Stage Tamagotchi

Capture screenshots from the built `stage-tamagotchi` Electron app with TypeScript scenarios.

## Purpose

This package now provides three things:

- a runtime surface in `src/index.ts`
- the `capture` CLI in `src/cli/capture.ts`
- the `defineScenario()` authoring helper for scenario modules

Legacy POC-only files are gone from the package surface. The package is now focused on capture/runtime behavior rather than Playwright test-runner scaffolding or docs generation.

## Usage

```bash
pnpm -F @proj-airi/stage-tamagotchi build
pnpm -F @proj-airi/devtool-capture-stage-tamagotchi capture -- src/scenarios/settings-connection.ts --output-dir ./artifacts/manual-run
```

## Demo Walkthrough

This package also ships a demo scenario that captures these states in order:

- `00-controls-island-expanded`
- `01-settings-window`
- `02-chat-window`
- `03-websocket-settings`

Run it from the repo root:

```bash
pnpm -F @proj-airi/stage-tamagotchi build
pnpm -F @proj-airi/devtool-capture-stage-tamagotchi capture -- src/scenarios/demo-controls-settings-chat-websocket.ts --output-dir ./artifacts/demo-run
```

Expected files:

- `packages/devtool-capture-stage-tamagotchi/artifacts/demo-run/00-controls-island-expanded.png`
- `packages/devtool-capture-stage-tamagotchi/artifacts/demo-run/01-settings-window.png`
- `packages/devtool-capture-stage-tamagotchi/artifacts/demo-run/02-chat-window.png`
- `packages/devtool-capture-stage-tamagotchi/artifacts/demo-run/03-websocket-settings.png`

To verify the controls-island hearing button specifically:

```bash
pnpm -F @proj-airi/stage-tamagotchi build
pnpm -F @proj-airi/devtool-capture-stage-tamagotchi capture -- src/scenarios/demo-hearing-dialog.ts --output-dir ./artifacts/hearing-demo
```

Expected file:

- `packages/devtool-capture-stage-tamagotchi/artifacts/hearing-demo/hearing-dialog.png`

## Scenario Authoring

```ts
import { defineScenario } from '@proj-airi/devtool-capture-stage-tamagotchi'

export default defineScenario({
  id: 'settings-connection',
  async run({ controlsIsland, settingsWindow, stageWindows, capture }) {
    const main = await stageWindows.waitFor('main')
    await controlsIsland.expand(main.page)
    const settings = await controlsIsland.openSettings(main.page)
    const page = await settingsWindow.goToConnection(settings.page)
    await capture('connection-settings', page)
  },
})
```

For the controls-island hearing trigger, the runtime also provides:

- `controlsIsland.openHearing(page)`

## Dialog And Drawer Helpers

For surfaces built with `DialogRoot` or `DrawerRoot`, the runtime now exposes:

- `dialogs.dismiss(page)`
- `drawers.swipeDown(page)`
- `drawers.dismiss(page)`

Example:

```ts
import { defineScenario } from '@proj-airi/devtool-capture-stage-tamagotchi'

export default defineScenario({
  id: 'dismiss-helpers',
  async run({ dialogs, drawers, stageWindows }) {
    const main = await stageWindows.waitFor('main')

    await dialogs.dismiss(main.page)
    await drawers.swipeDown(main.page)
    await drawers.dismiss(main.page)
  },
})
```

These are best-effort automation helpers. The current behavior is:

- dialog dismiss: `Escape`, then overlay-corner click fallback
- drawer dismiss: swipe down, then `Escape`, then overlay-corner click fallback

They are intended for scenarios where you already opened the dialog or drawer and need a reusable close step.

## Settings Window Helpers

The `settingsWindow` surface is navigation-only:

- `settingsWindow.waitFor(timeout?)`
- `settingsWindow.goToConnection(page)`

It does not open the settings window from the main window for you. The intended flow is:

1. `stageWindows.waitFor('main')`
2. `controlsIsland.expand(main.page)`
3. `controlsIsland.openSettings(main.page)`
4. `settingsWindow.goToConnection(settings.page)`

## Notes

- Importing `@proj-airi/devtool-capture-stage-tamagotchi` now resolves to `src/index.ts` via the package export surface.
- The package is no longer a Playwright test suite package.
