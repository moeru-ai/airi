import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    flux: 'src/flux.ts',
    v2: 'src/v2.ts',
  },
  sourcemap: true,
  unused: true,
  inlineOnly: false,
})
