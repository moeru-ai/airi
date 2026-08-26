import type { UserConfig } from 'tsdown'

import { defineConfig } from 'tsdown'

const sharedConfig: UserConfig = {
  exports: true,
  external: [
    'electron',
    'vue',
  ],
  format: 'esm',
}

export default defineConfig([
  {
    ...sharedConfig,
    entry: {
      main: 'src/main/index.ts',
    },
    inlineOnly: false,
    platform: 'node',
  },
  {
    ...sharedConfig,
    entry: {
      index: 'src/index.ts',
    },
    inlineOnly: false,
    platform: 'neutral',
  },
  {
    ...sharedConfig,
    entry: {
      renderer: 'src/renderer.ts',
      vue: 'src/vue/index.ts',
    },
    inlineOnly: false,
    platform: 'browser',
    unbundle: true,
  },
])
