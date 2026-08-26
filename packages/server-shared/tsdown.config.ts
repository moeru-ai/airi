import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: {
    'index': 'src/index.ts',
    'types/index': 'src/types/index.ts',
  },
  inlineOnly: false,
  sourcemap: true,
  unused: true,
})
