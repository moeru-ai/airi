import { join, resolve } from 'node:path'
import vue from '@vitejs/plugin-vue'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve(join('src', 'renderer', 'src')),
      },
    },
    plugins: [vue()],
  },
})
