# Vishot Runner Browser

Browser-side capture tooling for Vishot scene rendering entrypoints.

## Purpose

This package is the browser capture engine used by scene packages such as `@proj-airi/scenarios-stage-tamagotchi-browser`. It provides:

- the package export surface in `src/index.ts`
- the `captureBrowserRoots()` programmatic API
- the `capture` CLI entry in `src/cli/capture.ts`
- Vite dev-server startup for scene packages
- Playwright-driven export of each `data-scenario-capture-root` element as its own PNG
- an optional `imageTransformers` pipeline for converting emitted PNG files into other final image artifacts such as AVIF

## Usage

```bash
pnpm -F @proj-airi/vishot-runner-browser capture -- ../scenarios-stage-tamagotchi-browser --output-dir ../scenarios-stage-tamagotchi-browser/artifacts/final
pnpm -F @proj-airi/scenarios-stage-tamagotchi-browser capture
```

The browser capture package can run directly against a scene package root, or indirectly through the consumer package's own `capture` script. In both cases it starts the scene package's Vite app, opens it in Chromium, waits for the frontend ready signal, and exports each capture root into `packages/scenarios-stage-tamagotchi-browser/artifacts/final`.

Programmatic usage from a scene package looks like this:

```ts
import path from 'node:path'

import { captureBrowserRoots } from '@proj-airi/vishot-runner-browser'

const sceneAppRoot = path.resolve(process.cwd())
const requestedFormat = 'avif'

await captureBrowserRoots({
  sceneAppRoot,
  routePath: '/docs/setup-and-use',
  outputDir: path.resolve(sceneAppRoot, 'artifacts', 'final'),
  imageTransformers: requestedFormat === 'avif'
    ? [avifTransformer]
    : undefined,
})
```

The capture primitive is still PNG because Playwright screenshots write PNG files. If you want AVIF, WebP, or optimized PNG outputs, add an `imageTransformers` pipeline that rewrites the emitted files after capture.

## Notes

- `captureBrowserRoots()` accepts either `sceneAppRoot` or `baseUrl`.
- Use `routePath` to target a specific page when a scene app has multiple routes.
- Scene packages mark readiness through `window.__SCENARIO_CAPTURE_READY__`.
- The CLI treats `<render-entry>` as the scene package root and captures the default `/` route.
- The parser accepts repeated `--root` flags for named capture roots.
- If an image transformer returns a different output file, Vishot treats that derived file as authoritative and removes the intermediate PNG only after the full batch validates successfully.
