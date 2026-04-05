# Scenarios - Stage Tamagotchi Browser

Compose final browser-scene exports for stage-tamagotchi from raw Electron screenshots.

## Purpose

This package is the tamagotchi browser composition layer. It contains:

- the Vite/Vue scene app
- the scene composition components and capture roots
- the `capture` script that exports final browser captures through `@proj-airi/vishot-runner-browser`

It expects raw business screenshots to exist in `artifacts/raw` before final export runs.

## Workflow

1. Build the Electron app.
2. Capture raw screenshots into this package's `artifacts/raw` directory.
3. Run this package's `capture` script to export the composed scene roots into `artifacts/final`.

```bash
pnpm -F @proj-airi/stage-tamagotchi build
pnpm -F @proj-airi/vishot-runner-electron capture -- ../../packages/scenarios-stage-tamagotchi-electron/src/scenarios/demo-controls-settings-chat-websocket.ts --output-dir ../../packages/scenarios-stage-tamagotchi-browser/artifacts/raw
pnpm -F @proj-airi/scenarios-stage-tamagotchi-browser capture
```

Expected raw inputs:

- `artifacts/raw/00-stage-tamagotchi.png`
- `artifacts/raw/04-websocket-settings.png`

Current composed outputs:

- `artifacts/final/intro-chat-window.png`
- `artifacts/final/intro-websocket-settings.png`

Optional AVIF export:

```bash
pnpm -F @proj-airi/scenarios-stage-tamagotchi-browser capture -- --format avif
```

The browser capture flow still starts from PNG because that is the Playwright screenshot format. The package's `capture` script can opt into an AVIF post-processing step through Vishot's `imageTransformers` hook.

## Notes

- The current scene app renders `src/scenes/intro-manual-scene.vue`.
- Final export depends on the browser scene reaching the `__SCENARIO_CAPTURE_READY__` flag after its raw images load.
- If raw capture is missing or stale, final export will fail or render outdated assets.
- If you enable AVIF output, the final artifact filenames switch from `.png` to `.avif` because the transformer replaces the emitted PNG files after capture.
