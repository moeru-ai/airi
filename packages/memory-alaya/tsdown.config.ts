import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: [
    './src/index.ts',
    './src/contracts/v1.ts',
  ],
  sourcemap: true,
  unused: true,
  inlineOnly: false,
})
