import type { UserConfig } from 'tsdown'

import { defineConfig } from 'tsdown'

const sharedConfig: UserConfig = {
  format: 'esm',
  external: [
    'electron',
    'vue',
  ],
  exports: true,
}

export default defineConfig([
  {
    ...sharedConfig,
    platform: 'node',
    entry: {
      main: 'src/main/index.ts',
    },
    inlineOnly: false,
  },
  {
    ...sharedConfig,
    unbundle: true,
    platform: 'browser',
    // `renderer` and `vue` import `src/index.ts`, so this build also writes `dist/index.js`.
    // tsdown runs the builds at the same time. If a second build also wrote `dist/index.js`, the last
    // build to finish would win, and the renderer bundle of stage-tamagotchi would change between two builds.
    entry: {
      index: 'src/index.ts',
      vue: 'src/vue/index.ts',
      renderer: 'src/renderer.ts',
    },
    inlineOnly: false,
  },
])
