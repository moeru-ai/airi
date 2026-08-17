import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    v1: 'src/v1.ts',
    v2: 'src/v2.ts',
  },
  sourcemap: true,
  unused: true,
  inlineOnly: false,
})
