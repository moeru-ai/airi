# AIRI Agent Handoff: Cubism 2 Core Provisioning

The Cubism 2 Core SDK integration has been implemented and tested. You can safely remove AIRI's internal provisioning and adopt the new plugin interface.

## Installation

*   **Commit SHA:** `f22d777ba4474dc86a7e3f37dfdcc5609cc6f0e5` (head of [proj-airi/unplugin-live2d-sdk#2](https://github.com/proj-airi/unplugin-live2d-sdk/pull/2))
*   **Package artifact:** The tarball `proj-airi-unplugin-live2d-sdk-0.1.7.tgz` at the AIRI repository root is packed from that commit. AIRI resolves it through the `@proj-airi/unplugin-live2d-sdk` entry under `overrides:` in `pnpm-workspace.yaml`; the `catalog:` range stays at `^0.1.7` because pnpm catalogs reject the `file:` protocol. Registry 0.1.7 predates this work and does not export `Cubism2Core`, so the override is what makes every stage app's Vite config loadable. Refresh it by re-running `pnpm run build && pnpm pack` in a checkout of the SDK, replacing the root tarball, then `pnpm install`.

    Relative to `74437e3` this revision also fixes the download timeout: the abort timer now stays armed through `response.arrayBuffer()` instead of being cleared once response headers resolve, body-read failures participate in optional-source fallthrough, and the timer is cleared in a `finally`. SHA-256 mismatches remain fatal rather than falling through as ordinary optional network failures.

## Vite Configuration

Here is a complete example of configuring the SDK. Notice that URL sources strictly require a SHA-256 digest:

```typescript
import { Cubism2Core } from '@proj-airi/unplugin-live2d-sdk/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    Cubism2Core({
      cacheDir: './node_modules/.cache/cubism2-core',
      timeout: 10000,
      distribution: process.env.NODE_ENV === 'production' ? 'bundle' : 'development-only',
      sources: [
        { path: './private/live2d.min.js', optional: true },
        {
          url: 'https://example.com/permitted-cores/live2d.min.js',
          sha256: '39d084fff4e481748bc316a3ab6229933544e1dce25bea3318c342e88e2f33e4',
          optional: true
        }
      ],
    }),
  ],
})
```

## Runtime Consumption

The browser capability state cleanly abstracts all file-and-URL provisioning. It does not leak filesystem or cache paths:

```typescript
import { cubism2Core } from 'virtual:live2d-sdk/cores'

if (cubism2Core.available) {
  console.info('Core is available at:', cubism2Core.url)
  console.info('SRI Hash:', cubism2Core.sri)
  console.info('Expected Global:', cubism2Core.expectedGlobal) // Usually 'Live2D'

  // Script loading logic
  const script = document.createElement('script')
  script.src = cubism2Core.url
  script.integrity = cubism2Core.sri
  script.crossOrigin = 'anonymous'
  document.head.appendChild(script)
}
else {
  console.warn('Core is not available. Reason:', cubism2Core.reason)
  // Handle states: 'not-configured', 'not-found', 'build-emission-disabled', 'provisioning-failed'
}
```

## Behavior Table

| Scenario | Behavior |
| :--- | :--- |
| **Development server** | Serves Core from a content-addressed URL (e.g., `/@live2d-sdk/core/cubism2/<sha256>.js`) without emitting assets. |
| **Production bundle** | Emits exactly one `live2d-cubism2-core.js` asset in the build output and references it correctly. Disabled by default unless `distribution: 'bundle'` is explicit. |
| **Relative base** | Properly resolves references (e.g., `base: './'`) for Electron compatibility without hardcoded `/assets/` prefixes. |
| **No source** | If optional, reports `not-configured`. If required, throws `CORE_NOT_CONFIGURED`. |
| **Optional source exhaustion** | Falls through to next source. If all fail, runtime state becomes `not-found`. |
| **Required failure** | Throws an actionable configuration error during build/startup (e.g. `SOURCE_NOT_FOUND`). |
| **Cache hit** | Keys off the SHA-256 digest. Verified against digest. Successful hit prevents network request. |
| **Cache corruption** | Treated as cache miss; falls back to network request. |
| **URL timeout** | Halts the fetch *and the body read* and throws `SOURCE_TIMEOUT` (which degrades to next source if optional). |
| **Duplicate plugin instance** | Guarded by Rollup/Vite plugin singleton behavior and virtual module identifiers. |

> **Note**: An ambient typescript declaration (`virtual:live2d-sdk/cores`) is natively shipped and will work automatically when the package is imported. No manual types workaround is necessary.
