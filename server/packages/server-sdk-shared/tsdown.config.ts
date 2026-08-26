import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    v2: 'src/v2.ts',
  },
  inlineOnly: false,
  sourcemap: true,
  unused: true,
})
