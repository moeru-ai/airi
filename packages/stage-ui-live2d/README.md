# @proj-airi/stage-ui-live2d

Live2D scene components, stores, model loaders, and previews for AIRI Vue applications.

## Usage

Use this package for Live2D model rendering, expressions, and motions. Import the scene through its component entry:

```ts
import Live2D from '@proj-airi/stage-ui-live2d/components/scenes/Live2D.vue'
```

Load the Cubism SDK before the application imports Live2D consumers. AIRI applications use `DownloadLive2DSDK` and load its script from their HTML entry.

For VRM, MMD, Spine, or Tachie models, use the package for that model format. Use `@proj-airi/ui` for general interface components.

## Browser tests

Use the shared setup for browser tests that import Live2D consumers:

```ts
import { DownloadLive2DSDK } from '@proj-airi/unplugin-live2d-sdk'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [DownloadLive2DSDK()],
  test: {
    setupFiles: ['@proj-airi/stage-ui-live2d/testing/setup-browser'],
  },
})
```

Add these settings to the browser project in the application's Vitest configuration. The setup loads the same SDK script as the application.

Node tests do not use this setup because the Cubism runtime requires a browser.
