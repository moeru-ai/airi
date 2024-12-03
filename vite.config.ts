import { Buffer } from 'node:buffer'
import { cp, mkdir } from 'node:fs/promises'
import path, { join, resolve } from 'node:path'

import VueI18n from '@intlify/unplugin-vue-i18n/vite'
import Vue from '@vitejs/plugin-vue'
import { ofetch } from 'ofetch'
import Unocss from 'unocss/vite'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import VueMacros from 'unplugin-vue-macros/vite'
import { VueRouterAutoImports } from 'unplugin-vue-router'
import VueRouter from 'unplugin-vue-router/vite'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import VueDevTools from 'vite-plugin-vue-devtools'
import Layouts from 'vite-plugin-vue-layouts'
import WebfontDownload from 'vite-plugin-webfont-dl'

import { exists } from './scripts/fs'
import { unzip } from './scripts/unzip'

export default defineConfig({
  optimizeDeps: {
    exclude: [
      'public/assets/*',
      '@framework/live2dcubismframework',
      '@framework/math/cubismmatrix44',
      '@framework/type/csmvector',
      '@framework/math/cubismviewmatrix',
      '@framework/cubismdefaultparameterid',
      '@framework/cubismmodelsettingjson',
      '@framework/effect/cubismbreath',
      '@framework/effect/cubismeyeblink',
      '@framework/model/cubismusermodel',
      '@framework/motion/acubismmotion',
      '@framework/motion/cubismmotionqueuemanager',
      '@framework/type/csmmap',
      '@framework/utils/cubismdebug',
      '@framework/model/cubismmoc',
    ],
  },

  resolve: {
    alias: {
      '~/': `${path.resolve(__dirname, 'src')}/`,
    },
  },

  plugins: [
    VueMacros({
      plugins: {
        vue: Vue({
          include: [/\.vue$/, /\.md$/],
        }),
      },
    }),

    // https://github.com/posva/unplugin-vue-router
    VueRouter({
      extensions: ['.vue', '.md'],
      dts: 'src/typed-router.d.ts',
    }),

    // https://github.com/JohnCampionJr/vite-plugin-vue-layouts
    Layouts(),

    // https://github.com/antfu/unplugin-auto-import
    AutoImport({
      imports: [
        'vue',
        'vue-i18n',
        '@vueuse/head',
        '@vueuse/core',
        VueRouterAutoImports,
        {
          // add any other imports you were relying on
          'vue-router/auto': ['useLink'],
        },
      ],
      dts: 'src/auto-imports.d.ts',
      dirs: [
        'src/composables',
        'src/stores',
      ],
      vueTemplate: true,
    }),

    // https://github.com/antfu/unplugin-vue-components
    Components({
      // allow auto load markdown components under `./src/components/`
      extensions: ['vue', 'md'],
      // allow auto import and register components used in markdown
      include: [/\.vue$/, /\.vue\?vue/, /\.md$/],
      dts: 'src/components.d.ts',
    }),

    // https://github.com/antfu/unocss
    // see uno.config.ts for config
    Unocss(),

    // https://github.com/antfu/vite-plugin-pwa
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'safari-pinned-tab.svg'],
      manifest: {
        name: 'Vitesse',
        short_name: 'Vitesse',
        theme_color: '#ffffff',
        icons: [
          {
            src: '/pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: '/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
    }),

    // https://github.com/intlify/bundle-tools/tree/main/packages/unplugin-vue-i18n
    VueI18n({
      runtimeOnly: true,
      compositionOnly: true,
      fullInstall: true,
      include: [path.resolve(__dirname, 'locales/**')],
    }),

    // https://github.com/feat-agency/vite-plugin-webfont-dl
    WebfontDownload(),

    // https://github.com/webfansplz/vite-plugin-vue-devtools
    VueDevTools(),

    {
      name: 'live2d-cubism-sdk',
      async configResolved(config) {
        const cacheDir = resolve(join(config.root, '.cache'))
        const publicDir = resolve(join(config.root, 'public'))

        try {
          if (!(await exists(resolve(join(cacheDir, 'assets/js/CubismSdkForWeb-5-r.1'))))) {
            console.log('Downloading Cubism SDK...')
            const stream = await ofetch('https://dist.ayaka.moe/npm/live2d-cubism/CubismSdkForWeb-5-r.1.zip', { responseType: 'arrayBuffer' })

            console.log('Unzipping Cubism SDK...')
            await mkdir(join(cacheDir, 'assets/js'), { recursive: true })
            await unzip(Buffer.from(stream), join(cacheDir, 'assets/js'))

            console.log('Cubism SDK downloaded and unzipped.')
          }

          if (!(await exists(resolve(join(publicDir, 'assets/js/CubismSdkForWeb-5-r.1'))))) {
            await mkdir(join(publicDir, 'assets/js/CubismSdkForWeb-5-r.1'), { recursive: true }).catch(() => {})
            await cp(join(cacheDir, 'assets/js/CubismSdkForWeb-5-r.1/Core/live2dcubismcore.min.js'), join(publicDir, 'assets/js/CubismSdkForWeb-5-r.1/Core/live2dcubismcore.min.js'), { recursive: true })
          }
        }
        catch (err) {
          console.error(err)
          throw err
        }
      },
    },
    {
      name: 'live2d-models-hiyori-free',
      async configResolved(config) {
        const cacheDir = resolve(join(config.root, '.cache'))
        const publicDir = resolve(join(config.root, 'public'))

        try {
          if (!(await exists(resolve(join(cacheDir, 'assets/live2d/models/hiyori_free_zh'))))) {
            console.log('Downloading Demo Live2D Model - Hiyori Free...')
            const stream = await ofetch('https://dist.ayaka.moe/live2d-models/hiyori_free_zh.zip', { responseType: 'arrayBuffer' })

            console.log('Unzipping Demo Live2D Model - Hiyori Free...')
            await mkdir(join(cacheDir, 'assets/live2d/models'), { recursive: true })
            await unzip(Buffer.from(stream), join(cacheDir, 'assets/live2d/models'))

            console.log('Demo Live2D Model - Hiyori Free downloaded and unzipped.')
          }

          if (!(await exists(resolve(join(publicDir, 'assets/live2d/models/hiyori_free_zh'))))) {
            await mkdir(join(publicDir, 'assets/live2d/models/hiyori_free_zh'), { recursive: true }).catch(() => { })
            await cp(join(cacheDir, 'assets/live2d/models/hiyori_free_zh/'), join(publicDir, 'assets/live2d/models/hiyori_free_zh/'), { recursive: true })
          }
        }
        catch (err) {
          console.error(err)
          throw err
        }
      },
    },
    {
      name: 'live2d-models-hiyori-pro',
      async configResolved(config) {
        const cacheDir = resolve(join(config.root, '.cache'))
        const publicDir = resolve(join(config.root, 'public'))

        try {
          if (!(await exists(resolve(join(cacheDir, 'assets/live2d/models/hiyori_pro_zh'))))) {
            console.log('Downloading Demo Live2D Model - Hiyori Pro...')
            const stream = await ofetch('https://dist.ayaka.moe/live2d-models/hiyori_pro_zh.zip', { responseType: 'arrayBuffer' })

            console.log('Unzipping Demo Live2D Model - Hiyori Pro...')
            await mkdir(join(cacheDir, 'assets/live2d/models'), { recursive: true })
            await unzip(Buffer.from(stream), join(cacheDir, 'assets/live2d/models'))

            console.log('Demo Live2D Model - Hiyori Pro downloaded and unzipped.')
          }

          if (!(await exists(resolve(join(publicDir, 'assets/live2d/models/hiyori_pro_zh'))))) {
            await mkdir(join(publicDir, 'assets/live2d/models/hiyori_pro_zh'), { recursive: true }).catch(() => { })
            await cp(join(cacheDir, 'assets/live2d/models/hiyori_pro_zh/'), join(publicDir, 'assets/live2d/models/hiyori_pro_zh/'), { recursive: true })
          }
        }
        catch (err) {
          console.error(err)
          throw err
        }
      },
    },
  ],

  // // https://github.com/vitest-dev/vitest
  // test: {
  //   include: ['test/**/*.test.ts'],
  //   environment: 'jsdom',
  // },

  // // https://github.com/antfu/vite-ssg
  // ssgOptions: {
  //   script: 'async',
  //   formatting: 'minify',
  //   crittersOptions: {
  //     reduceInlineStyles: false,
  //   },
  //   onFinished() {
  //     generateSitemap()
  //   },
  // },
})
