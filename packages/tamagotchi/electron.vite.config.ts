import { join, resolve } from 'node:path'
import vue from '@vitejs/plugin-vue'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import unocss from 'unocss/vite'
import { fileDownloader } from '../../vite-plugins/file-downloader'
import { live2dSdkDownloader } from '../../vite-plugins/live2d-sdk-downloader'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
  },
  renderer: {
    optimizeDeps: {
      exclude: [
        '@proj-airi/ui/*',
      ],
    },
    resolve: {
      alias: {
        '@renderer': resolve(join('src', 'renderer', 'src')),
        '@proj-airi/ui': resolve(join(import.meta.dirname, '..', 'ui', 'dist')),
        '@proj-airi/ui/stores': resolve(join(import.meta.dirname, '..', 'ui', 'dist', 'stores')),
      },
    },
    plugins: [
      vue(),
      unocss(),
      live2dSdkDownloader(),
      fileDownloader('https://dist.ayaka.moe/live2d-models/hiyori_free_zh.zip', 'hiyori_free_zh.zip', 'assets/live2d/models'),
      fileDownloader('https://dist.ayaka.moe/live2d-models/hiyori_pro_zh.zip', 'hiyori_pro_zh.zip', 'assets/live2d/models'),
    ],
  },
})
