import { join, resolve } from 'node:path'
import VueI18n from '@intlify/unplugin-vue-i18n/vite'
import { Download } from '@proj-airi/unplugin-fetch'
import { DownloadLive2DSDK } from '@proj-airi/unplugin-live2d-sdk'
import { templateCompilerOptions } from '@tresjs/core'
import Vue from '@vitejs/plugin-vue'
import UnoCss from 'unocss/vite'
import VueMacros from 'unplugin-vue-macros/vite'
import VueRouter from 'unplugin-vue-router/vite'
import { defineConfig } from 'vite'
import Layouts from 'vite-plugin-vue-layouts'

export default defineConfig({
  optimizeDeps: {
    exclude: [
      '@proj-airi/stage-ui/*',
    ],
  },
  resolve: {
    alias: {
      '@proj-airi/stage-ui': resolve(join(import.meta.dirname, '..', '..', 'packages', 'stage-ui', 'dist')),
      '@proj-airi/stage-ui/stores': resolve(join(import.meta.dirname, '..', '..', 'packages', 'stage-ui', 'dist', 'stores')),
    },
  },
  plugins: [
    VueMacros({
      plugins: {
        vue: Vue({
          include: [/\.vue$/, /\.md$/],
          ...templateCompilerOptions,
        }),
        vueJsx: false,
      },
    }),

    VueRouter({
      dts: resolve(import.meta.dirname, 'src/typed-router.d.ts'),
      routesFolder: 'src/pages',
    }),

    // https://github.com/JohnCampionJr/vite-plugin-vue-layouts
    Layouts(),

    UnoCss(),

    // https://github.com/intlify/bundle-tools/tree/main/packages/unplugin-vue-i18n
    VueI18n({
      runtimeOnly: true,
      compositionOnly: true,
      fullInstall: true,
      include: [resolve(import.meta.dirname, 'locales/**')],
    }),

    DownloadLive2DSDK(),
    Download('https://dist.ayaka.moe/live2d-models/hiyori_free_zh.zip', 'hiyori_free_zh.zip', 'assets/live2d/models'),
    Download('https://dist.ayaka.moe/live2d-models/hiyori_pro_zh.zip', 'hiyori_pro_zh.zip', 'assets/live2d/models'),
  ],
})
