# Scenarios - Stage Tamagotchi Electron

Own the Electron capture scenarios used to generate tamagotchi docs screenshots.

## Purpose

This package owns product-specific Electron scenario definitions only. It depends on `@proj-airi/vishot-runner-electron` for:

- the `defineScenario()` helper
- the capture context surface
- Electron window and screenshot helpers exposed by the runner package

It does not launch Electron itself and it does not own browser-scene composition or shared screenshot staging.

## Workflow

1. Build the Electron app.
2. Run the Electron runner against a section-based scenario entrypoint under `src/scenarios/demo-controls-settings-chat-websocket/index.ts`.
3. Write the scenario's raw working outputs into the scenario-local working directory.
4. Publish the final docs screenshots directly into `docs/content/en/docs/manual/tamagotchi/setup-and-use/assets`.
5. Skip any separate final staging directory for this docs workflow.

```bash
pnpm -F @proj-airi/stage-tamagotchi build
pnpm -F @proj-airi/vishot-runner-electron capture --format avif -- packages/scenarios-stage-tamagotchi-electron/src/scenarios/demo-controls-settings-chat-websocket/index.ts --output-dir /tmp/tamagotchi-docs-capture
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

## Scenario Layout

The docs workflow is organized as one section-based scenario module under `src/scenarios/demo-controls-settings-chat-websocket/`. The top-level `index.ts` orchestrates section manifests and writes working outputs into the scenario-local raw directory, so the capture flow stays close to the scenario being authored.

## Notes

- Raw scenario modules live under `src/scenarios`.
- Scenario entrypoints should point at `index.ts` when the workflow is organized as a section folder.
- Keep this package focused on Electron capture flows for docs screenshots.
