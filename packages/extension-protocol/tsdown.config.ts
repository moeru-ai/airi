import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
  },
  sourcemap: true,
  unused: true,
})
