import { defineConfig } from 'tsdown'

export default defineConfig({
  dts: true,
  entry: [
    './src/index.ts',
    './src/electron/index.ts',
    './src/electron-updater/index.ts',
  ],
  format: 'esm',
})
