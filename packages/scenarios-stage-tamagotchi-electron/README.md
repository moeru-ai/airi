# Scenarios - Stage Tamagotchi Electron

Own the raw Electron capture scenarios for stage-tamagotchi.

## Purpose

This package owns the product-specific scenario definitions only. It depends on `@proj-airi/vishot-runner-electron` for:

- the `defineScenario()` helper
- the capture context surface
- Electron window and screenshot helpers exposed by the runner package

It does not launch Electron itself and it does not compose final browser-scene exports.

## Workflow

1. Build the Electron app.
2. Run the runner package against one of the scenario modules in this package.
3. Write raw screenshots into `packages/scenarios-stage-tamagotchi-browser/artifacts/raw`.
4. Let the browser scene package consume those raw screenshots for final composition.

```bash
pnpm -F @proj-airi/stage-tamagotchi build
pnpm -F @proj-airi/vishot-runner-electron capture -- packages/scenarios-stage-tamagotchi-electron/src/scenarios/demo-controls-settings-chat-websocket.ts --output-dir packages/scenarios-stage-tamagotchi-browser/artifacts/raw
```

## Scenario Authoring

```ts
import { defineScenario } from '@proj-airi/vishot-runner-electron'

export default defineScenario({
  id: 'settings-connection',
  async run({ capture, stageWindows, controlsIsland, settingsWindow }) {
    const mainWindow = await stageWindows.waitFor('main')

    await controlsIsland.expand(mainWindow.page)
    const settings = await controlsIsland.openSettings(mainWindow.page)
    const page = await settingsWindow.goToConnection(settings.page)
    await page.waitForTimeout(1000)

    await page.getByText('WebSocket Server Address').waitFor({ state: 'visible' })
    await capture('connection-settings', page)
  },
})
```

## Notes

- Raw scenario modules live under `src/scenarios`.
- Scenario modules are consumed by the runner package, not by the browser composition package.
- The package stays focused on business capture flows and avoids browser-scene composition concerns.
