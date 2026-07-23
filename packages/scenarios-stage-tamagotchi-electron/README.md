# Scenarios - Stage Tamagotchi Electron

Own the Electron capture scenarios used to generate tamagotchi docs screenshots.

## Purpose

This package owns product-specific Electron scenario definitions and AIRI window/navigation helpers only. It depends on `@vishot/source-electron` for:

- the generic `defineScenario()` helper
- the generic Electron capture context surface
- raw screenshot capture and scenario loading

It does not launch Electron itself and it does not own browser-scene composition or shared screenshot staging.

## Workflow

This package is step 1 of the docs screenshot pipeline.

1. Build `@proj-airi/stage-tamagotchi`.
2. Run this scenario through `@vishot/cli`.
3. Write raw outputs to `packages/scenarios-stage-tamagotchi-browser/artifacts/raw`.
4. Then run the browser package capture (step 2, documented in that package README).

## Agent Quickstart

From repo root, run:

```bash
pnpm -F @proj-airi/stage-tamagotchi build
pnpm exec vishot capture --target electron ./packages/scenarios-stage-tamagotchi-electron/src/scenarios/demo-controls-settings-chat-websocket/index.ts --app-entrypoint ./apps/stage-tamagotchi/out/main/index.js --cwd . --output-dir ./packages/scenarios-stage-tamagotchi-browser/artifacts/raw --format avif
```

Expected result:

- `27` raw files in `packages/scenarios-stage-tamagotchi-browser/artifacts/raw`
- names like `00-stage-tamagotchi.avif` ... `26-devtools-vision-capture.avif`

## Scenario Authoring

```ts
import { defineStageTamagotchiScenario } from '../context'

export default defineStageTamagotchiScenario({
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

- `--output-dir` for `vishot capture` should point to `packages/scenarios-stage-tamagotchi-browser/artifacts/raw`.
- This package does not publish docs assets directly; it only prepares raw assets for browser-scene composition.

## Notes

- Raw scenario modules live under `src/scenarios`.
- Scenario entrypoints should point at `index.ts` when the workflow is organized as a section folder.
- Keep this package focused on Electron capture flows for docs screenshots.
- Paths in these examples are resolved from the repository root.

## Electron Profile Note (Plugin Discovery)

When running scenarios through Vishot's generic Electron source capture, the built Electron app can use a different `userData` profile than `dev:tamagotchi`.

- `dev:tamagotchi` plugin root commonly resolves to:
  - `~/Library/Application Support/@proj-airi/stage-tamagotchi/plugins/v1`
- Vishot/Electron capture runs can resolve plugin root to:
  - `~/Library/Application Support/Electron/plugins/v1`

If the chess plugin appears in dev but not in Vishot (`Discovered 0` or `Plugin manifest not found`), link the plugin `dist` directory into the Electron profile plugins root too:

```bash
mkdir -p "$HOME/Library/Application Support/Electron/plugins/v1"
ln -sfn "/absolute/path/to/airi-plugin-game-chess/dist" "$HOME/Library/Application Support/Electron/plugins/v1/airi-plugin-game-chess"
```
