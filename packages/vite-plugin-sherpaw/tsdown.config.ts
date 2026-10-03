import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    assets: 'src/assets.ts',
  },
  deps: {
    neverBundle: ['vite'],
  },
  target: 'node18',
  dts: true,
})
