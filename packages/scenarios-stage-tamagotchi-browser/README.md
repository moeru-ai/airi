# Scenarios - Stage Tamagotchi Browser

Compose final browser-scene exports for stage-tamagotchi from raw Electron screenshots.

## Purpose

This package is the tamagotchi browser composition layer. It contains:

- the Vite/Vue scene app
- the scene composition components and capture roots
- file-based scene routing from `src/scenes/**` via `unplugin-vue-router`
- the `capture` script that exports final browser captures through `@vishot/renderer-browser`

It expects raw business screenshots to exist in `artifacts/raw` before final export runs.

Current docs capture target route:

- `/docs/setup-and-use` -> `src/scenes/docs/setup-and-use/index.vue`
- `/docs/setup-and-use/intro-chat` -> `src/scenes/docs/setup-and-use/intro-chat.vue`
- `/docs/setup-and-use/intro-websocket` -> `src/scenes/docs/setup-and-use/intro-websocket.vue`
- `/docs/setup-and-use/main-window` -> `src/scenes/docs/setup-and-use/main-window.vue`
- `/docs/setup-and-use/settings` -> `src/scenes/docs/setup-and-use/settings.vue`

## Release Areas

Each release has a scene at `/releases/<version>`, for example `/releases/v0-13` -> `src/scenes/releases/v0-13/index.vue`. The scene shows the feature areas of that release. Each area is a 1600x640 (2.5:1) capture root, so each one exports as one shareable image.

| Route | Areas |
| --- | --- |
| `/releases/v0-12` | Cover, avatars, Live2D, tool calls, voice, desktop, web and mobile, stickers |
| `/releases/v0-13` | Cover, settings search, needs attention, desktop updates, fixes |

- Each area renders in a dark and a light theme. Vishot exports `<area>-dark.png` and `<area>-light.png`.
- The raw screenshots are in `artifacts/raw/releases/<version>`. A `-light` file is the same state in the light app theme. `<version>/components/release-shots.ts` lists them with the CSS width of the screen that took each one.
- The text of the areas of a release is in `<version>/components/release-copy.ts`.
- `src/scenes/releases/components` has the parts that all releases share: the area frame, `ReleaseReveal`, `ShotCrop`, the theme, and the timeline.
- Each layer is a `ReleaseReveal` with an entry time `at`. `?play` plays the entry timeline with the AIRI blur fade, so a screen recorder can record an area as a video.
- `?area=<name>` shows one area, for example `?area=release-v0-13-needs-attention`.
- `?theme=dark` or `?theme=light` shows one theme.

Export all areas of a release in both themes, 3200x1280 each:

```bash
pnpm -F @proj-airi/scenarios-stage-tamagotchi-browser capture --route /releases/v0-13 --output-dir artifacts/final/releases/v0-13 --settle-ms 1000
```

## Workflow

1. Run Electron capture first and populate `artifacts/raw` (see electron package README).
2. Run browser capture and output final composed files to docs assets.

## Agent Quickstart

From repo root, run:

```bash
pnpm exec vishot capture --target electron ./packages/scenarios-stage-tamagotchi-electron/src/scenarios/demo-controls-settings-chat-websocket/index.ts --app-entrypoint ./apps/stage-tamagotchi --cwd . --output-dir ./packages/scenarios-stage-tamagotchi-browser/artifacts/raw --format avif
pnpm -F @proj-airi/scenarios-stage-tamagotchi-browser capture --format avif --route '/docs/setup-and-use/intro-chat' --output-dir ../../airi-docs/content/en/docs/manual/tamagotchi/setup-and-use/assets --settle-ms 800
pnpm -F @proj-airi/scenarios-stage-tamagotchi-browser capture --format avif --route '/docs/setup-and-use/intro-websocket' --output-dir ../../airi-docs/content/en/docs/manual/tamagotchi/setup-and-use/assets --settle-ms 800
pnpm -F @proj-airi/scenarios-stage-tamagotchi-browser capture --format avif --route '/docs/setup-and-use/main-window' --output-dir ../../airi-docs/content/en/docs/manual/tamagotchi/setup-and-use/assets --settle-ms 800
pnpm -F @proj-airi/scenarios-stage-tamagotchi-browser capture --format avif --route '/docs/setup-and-use/settings' --output-dir ../../airi-docs/content/en/docs/manual/tamagotchi/setup-and-use/assets --settle-ms 800
```

Expected results:

- Raw: `27` files under `packages/scenarios-stage-tamagotchi-browser/artifacts/raw`
- Final docs assets: `manual-*.avif` and `intro-chat-window.avif` under `airi-docs/content/en/docs/manual/tamagotchi/setup-and-use/assets`

The documentation lives in [moeru-ai/airi-docs](https://github.com/moeru-ai/airi-docs). Clone it to `airi-docs/` at the repository root (ignored by Git) before capturing.

## Capture Flags

The browser capture script supports:

- `--format <png|avif>` (default: `png`)
- `--route </path>` (default: `/docs/setup-and-use`)
- `--output-dir <path>` (default: `artifacts/final`)
- `--settle-ms <number>` (default: `500`) extra delay after scene ready before screenshot

Examples:

```bash
pnpm -F @proj-airi/scenarios-stage-tamagotchi-browser capture --format avif --settle-ms 800
pnpm -F @proj-airi/scenarios-stage-tamagotchi-browser capture --route /docs/setup-and-use --settle-ms 800
pnpm -F @proj-airi/scenarios-stage-tamagotchi-browser capture --route /docs/setup-and-use/settings --settle-ms 800
pnpm -F @proj-airi/scenarios-stage-tamagotchi-browser capture --format avif --route /docs/setup-and-use --output-dir ../../airi-docs/content/en/docs/manual/tamagotchi/setup-and-use/assets --settle-ms 800
```

The browser capture flow starts from Playwright PNG screenshots, then optionally transforms to AVIF via Vishot `imageTransformers`.

## Notes

- This package can host multiple scene pages. Add Vue SFC routes under `src/scenes/**` (for example `src/scenes/docs/setup-and-use/index.vue`).
- The default capture route is `/docs/setup-and-use`. Override it with `--route /your/path`.
- Captures are produced only for roots mounted by the exact route you pass. For full setup manual assets, run captures for `/docs/setup-and-use/intro-chat`, `/docs/setup-and-use/intro-websocket`, `/docs/setup-and-use/main-window`, and `/docs/setup-and-use/settings`.
- Final export depends on the browser scene reaching the `__SCENARIO_CAPTURE_READY__` flag after its raw images load.
- If raw capture is missing or stale, final export will fail or render outdated assets.
- If you enable AVIF output, the final artifact filenames switch from `.png` to `.avif` because the transformer replaces the emitted PNG files after capture.
- Paths in these `pnpm -F` examples are resolved from the filtered package working directory.
