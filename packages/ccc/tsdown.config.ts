import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: [
    './src/index.ts',
  ],
  sourcemap: true,
  unused: true,
  fixedExtension: true,
})
