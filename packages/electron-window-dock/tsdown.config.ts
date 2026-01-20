import type { UserConfig } from 'tsdown'

import { defineConfig } from 'tsdown'

const sharedConfig: UserConfig = {
  format: 'esm',
  external: [
    'electron',
    'vue',
    '@proj-airi/win32-window-bindings',
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
  },
  {
    ...sharedConfig,
    platform: 'neutral',
    entry: {
      index: 'src/index.ts',
    },
  },
  {
    ...sharedConfig,
    unbundle: true,
    platform: 'browser',
    entry: {
      vue: 'src/vue/index.ts',
      renderer: 'src/renderer.ts',
    },
  },
])
