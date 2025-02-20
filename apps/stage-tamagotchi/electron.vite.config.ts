import { defineConfig, externalizeDepsPlugin } from 'electron-vite'

import rendererConfig from './renderer.vite.config'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
  },
  renderer: rendererConfig,
})
