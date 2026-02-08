import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: {
    'types/index': 'src/types/index.ts',
  },
  sourcemap: true,
  unused: true,
})
