import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: [
    './src/',
  ],
  sourcemap: true,
  unused: true,
  fixedExtension: true,
})
