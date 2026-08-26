import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: [
    './src/index.ts',
    './src/utils/node/index.ts',
  ],
  inlineOnly: false,
  sourcemap: true,
  unused: true,
})
