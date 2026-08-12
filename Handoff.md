# AIRI Agent Handoff: Cubism 2 Core Provisioning

The Cubism 2 Core SDK integration has been implemented and tested. You can safely remove AIRI's internal provisioning and adopt the new plugin interface.

### Installation

*   **Commit SHA:** `74437e3` (on branch `feat/cubism2-core-provisioning` in fork `starryark`)
*   **Package artifact:** Use the produced tarball `proj-airi-unplugin-live2d-sdk-0.1.7.tgz` which you can install locally via `npm install /path/to/proj-airi-unplugin-live2d-sdk-0.1.7.tgz` or similar repository-standard approach.

### Vite Configuration

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

### Runtime Consumption

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
} else {
  console.warn('Core is not available. Reason:', cubism2Core.reason)
  // Handle states: 'not-configured', 'not-found', 'build-emission-disabled', 'provisioning-failed'
}
```

### Behavior Table

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
| **URL timeout** | Halts fetch and throws `SOURCE_TIMEOUT` (which degrades to next source if optional). |
| **Duplicate plugin instance** | Guarded by Rollup/Vite plugin singleton behavior and virtual module identifiers. |

> **Note**: An ambient typescript declaration (`virtual:live2d-sdk/cores`) is natively shipped and will work automatically when the package is imported. No manual types workaround is necessary.
