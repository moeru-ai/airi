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
    './src/contracts/server-channel.ts',
    './src/contracts/stage-windows.ts',
    './src/contracts/plugins.ts',
    './src/contracts/mcp.ts',
  ],
  dts: true,
  format: 'esm',
})
