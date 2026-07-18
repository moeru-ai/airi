import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: [
    './src/index.ts',
    './src/electron/index.ts',
    './src/electron-updater/index.ts',
  ],
  dts: true,
  format: 'esm',
})
