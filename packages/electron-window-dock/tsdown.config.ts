import type { UserConfig } from 'tsdown'

import { defineConfig } from 'tsdown'

const sharedConfig: UserConfig = {
  format: 'esm',
  external: [
    'electron',
    '@proj-airi/native-window-win32',
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
])
