import { join, resolve } from 'node:path'
import vue from '@vitejs/plugin-vue'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import unocss from 'unocss/vite'
import { live2dSdkDownloader } from '../../vite-plugins/live2d-sdk-downloader'

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
    plugins: [
      vue(),
      unocss(),
      live2dSdkDownloader(),
    ],
  },
})
