import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: [
    './src/index.ts',
    './src/utils/node/index.ts',
  ],
  sourcemap: true,
  unused: true,
  fixedExtension: true,
})
