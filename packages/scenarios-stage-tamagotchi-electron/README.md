# Scenarios - Stage Tamagotchi Electron

Own the Electron capture scenarios used to generate tamagotchi docs screenshots.

## Purpose

This package owns product-specific Electron scenario definitions only. It depends on `@proj-airi/vishot-runner-electron` for:

- the `defineScenario()` helper
- the capture context surface
- Electron window and screenshot helpers exposed by the runner package

It does not launch Electron itself and it does not own browser-scene composition or shared screenshot staging.

## Workflow

This package is step 1 of the docs screenshot pipeline.

1. Build `@proj-airi/stage-tamagotchi`.
2. Run this scenario through `@proj-airi/vishot-runner-electron`.
3. Write raw outputs to `packages/scenarios-stage-tamagotchi-browser/artifacts/raw`.
4. Then run the browser package capture (step 2, documented in that package README).

## Agent Quickstart

From repo root, run:

```bash
pnpm -F @proj-airi/stage-tamagotchi build
pnpm -F @proj-airi/vishot-runner-electron capture ../../packages/scenarios-stage-tamagotchi-electron/src/scenarios/demo-controls-settings-chat-websocket/index.ts --output-dir ../../packages/scenarios-stage-tamagotchi-browser/artifacts/raw --format avif
```

Expected result:

- `27` raw files in `packages/scenarios-stage-tamagotchi-browser/artifacts/raw`
- names like `00-stage-tamagotchi.avif` ... `26-devtools-vision-capture.avif`

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

The docs workflow is organized as one section-based scenario module under `src/scenarios/demo-controls-settings-chat-websocket/`. The top-level `index.ts` orchestrates section manifests.

Important:

- `--output-dir` for the runner should point to `packages/scenarios-stage-tamagotchi-browser/artifacts/raw`.
- This package does not publish docs assets directly; it only prepares raw assets for browser-scene composition.

## Notes

- Raw scenario modules live under `src/scenarios`.
- Scenario entrypoints should point at `index.ts` when the workflow is organized as a section folder.
- Keep this package focused on Electron capture flows for docs screenshots.
- Paths in these `pnpm -F` examples are resolved from the filtered package working directory.
