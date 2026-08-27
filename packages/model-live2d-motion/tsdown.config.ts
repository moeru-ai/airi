import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: {
    'index': 'src/index.ts',
    'var': 'src/var.ts',
    'ar-hmm': 'src/ar-hmm.ts',
  },
  dts: true,
  platform: 'browser',
  treeshake: true,
})
