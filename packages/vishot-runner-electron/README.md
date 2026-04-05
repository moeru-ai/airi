# Vishot Runner - Electron

Capture raw screenshots from the built `stage-tamagotchi` Electron app with TypeScript scenarios.

## Purpose

This package is the Electron capture runner. It provides:

- a runtime surface in `src/index.ts`
- the `capture` CLI in `src/cli/capture.ts`
- the `defineScenario()` authoring helper for scenario modules
- a typed raw-artifact surface for screenshot outputs
- reusable helpers for the controls island, settings window, dialogs, drawers, and stage windows

This package stops at raw business screenshots. It does not own the scenario modules themselves; those live in `@proj-airi/scenarios-stage-tamagotchi-electron`.

## Workflow

```bash
pnpm -F @proj-airi/stage-tamagotchi build
pnpm -F @proj-airi/vishot-runner-electron capture -- ../../packages/scenarios-stage-tamagotchi-electron/src/scenarios/demo-controls-settings-chat-websocket.ts --output-dir ../../packages/scenarios-stage-tamagotchi-browser/artifacts/raw
```

To emit AVIF files instead of PNG files:

```bash
pnpm -F @proj-airi/vishot-runner-electron capture -- ../../packages/scenarios-stage-tamagotchi-electron/src/scenarios/demo-controls-settings-chat-websocket.ts --output-dir ../../packages/scenarios-stage-tamagotchi-browser/artifacts/raw --format avif
```

This writes the raw inputs consumed by the browser scene package:

- `packages/scenarios-stage-tamagotchi-browser/artifacts/raw/00-stage-tamagotchi.png`
- `packages/scenarios-stage-tamagotchi-browser/artifacts/raw/01-controls-island-expanded.png`
- `packages/scenarios-stage-tamagotchi-browser/artifacts/raw/02-settings-window.png`
- `packages/scenarios-stage-tamagotchi-browser/artifacts/raw/03-websocket-settings.png`

If you pass `--format avif`, the same capture names are emitted as `.avif` files instead.

Then export the composed browser assets:

```bash
pnpm -F @proj-airi/scenarios-stage-tamagotchi-browser capture
```

In this environment, the raw capture command worked end-to-end after running outside the sandbox because `tsx` pipe creation was denied inside the sandbox (`listen EPERM` on the temporary `tsx` IPC pipe).

## Additional Examples

To verify the controls-island hearing button specifically:

```bash
pnpm -F @proj-airi/stage-tamagotchi build
pnpm -F @proj-airi/vishot-runner-electron capture -- ../../packages/scenarios-stage-tamagotchi-electron/src/scenarios/demo-hearing-dialog.ts --output-dir ./artifacts/hearing-demo
```

Expected file:

- `packages/vishot-runner-electron/artifacts/hearing-demo/hearing-dialog.png`

## Scenario Authoring

```ts
import { defineScenario } from '@proj-airi/vishot-runner-electron'

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
import { defineScenario } from '@proj-airi/vishot-runner-electron'

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

- Importing `@proj-airi/vishot-runner-electron` resolves to `src/index.ts` via the package export surface.
- The package is no longer a Playwright test suite package.
- Final composed exports live in `packages/scenarios-stage-tamagotchi-browser/artifacts/final`, not this package.
- Screenshot capture now returns typed `image` artifacts and can run transformer hooks before those raw files are handed to downstream consumers.
- The CLI supports `--format png|avif`; AVIF remains an opt-in post-processing step on top of the raw PNG screenshot primitive.
