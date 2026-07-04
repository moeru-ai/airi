import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: [
    './src/index.ts',
    './src/tauri/index.ts',
    './src/tauri/pubsub.ts',
    './src/contracts/index.ts',
    './src/contracts/window.ts',
    './src/contracts/screen.ts',
    './src/contracts/app.ts',
    './src/contracts/system-preferences.ts',
    './src/contracts/power-monitor.ts',
    './src/contracts/electron-updater.ts',
    './src/contracts/stage-windows.ts',
  ],
  dts: true,
  format: 'esm',
})
