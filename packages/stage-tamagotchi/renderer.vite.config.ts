import { join, resolve } from 'node:path'
import { Download } from '@proj-airi/unplugin-download'
import { DownloadLive2DSDK } from '@proj-airi/unplugin-live2d-sdk'
import Vue from '@vitejs/plugin-vue'
import UnoCss from 'unocss/vite'
import VueRouter from 'unplugin-vue-router/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  optimizeDeps: {
    exclude: [
      '@proj-airi/stage-ui/*',
    ],
  },
  resolve: {
    alias: {
      '@renderer': resolve(join('src', 'renderer', 'src')),
      '@proj-airi/stage-ui': resolve(join(import.meta.dirname, '..', 'stage-ui', 'dist')),
      '@proj-airi/stage-ui/stores': resolve(join(import.meta.dirname, '..', 'stage-ui', 'dist', 'stores')),
    },
  },
  plugins: [
    Vue(),
    UnoCss(),
    VueRouter({
      dts: resolve(import.meta.dirname, 'src/typed-router.d.ts'),
      routesFolder: 'src/renderer/src/pages',
    }),
    DownloadLive2DSDK(),
    Download('https://dist.ayaka.moe/live2d-models/hiyori_free_zh.zip', 'hiyori_free_zh.zip', 'assets/live2d/models'),
    Download('https://dist.ayaka.moe/live2d-models/hiyori_pro_zh.zip', 'hiyori_pro_zh.zip', 'assets/live2d/models'),
  ],
})
