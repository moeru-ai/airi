import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
  },
  dts: true,
  platform: 'browser',
  treeshake: true,
})
