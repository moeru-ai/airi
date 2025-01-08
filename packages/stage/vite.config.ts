import { Buffer } from 'node:buffer'
import { cp, mkdir, writeFile } from 'node:fs/promises'
import path, { join, resolve } from 'node:path'
import { env } from 'node:process'

import VueI18n from '@intlify/unplugin-vue-i18n/vite'
import { appName } from '@proj-airi/ui/constants'
import { templateCompilerOptions } from '@tresjs/core'
import Vue from '@vitejs/plugin-vue'
import { LFS, SpaceCard } from 'hfup/vite'
import { ofetch } from 'ofetch'
import Unocss from 'unocss/vite'
import Components from 'unplugin-vue-components/vite'
import VueMacros from 'unplugin-vue-macros/vite'
import VueRouter from 'unplugin-vue-router/vite'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

import VueDevTools from 'vite-plugin-vue-devtools'
import Layouts from 'vite-plugin-vue-layouts'

import { exists } from '../../scripts/fs'

import { live2dModelDownloader } from '../../vite-plugins/live2d-model-downloader'
import { live2dSdkDownloader } from '../../vite-plugins/live2d-sdk-downloader'

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

  build: {
    rollupOptions: {
      external: [
        'virtual:pwa-register',
      ],
    },
  },

  resolve: {
    alias: {
      '@proj-airi/ui': resolve(join(__dirname, '..', 'ui', 'dist')),
      '@proj-airi/ui/stores': resolve(join(__dirname, '..', 'ui', 'dist', 'stores')),
    },
  },

  plugins: [
    VueMacros({
      plugins: {
        vue: Vue({
          include: [/\.vue$/, /\.md$/],
          ...templateCompilerOptions,
        }),
      },
    }),

    // https://github.com/posva/unplugin-vue-router
    VueRouter({
      extensions: ['.vue', '.md'],
      dts: path.resolve(__dirname, 'src/typed-router.d.ts'),
    }),

    // https://github.com/JohnCampionJr/vite-plugin-vue-layouts
    Layouts(),

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
    ...(env.TARGET_HUGGINGFACE_SPACE
      ? []
      : [VitePWA({
          registerType: 'autoUpdate',
          includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
          manifest: {
            name: appName,
            short_name: appName,
            theme_color: '#ffffff',
            icons: [
              {
                src: '/web-app-manifest-192x192.png',
                sizes: '192x192',
                type: 'image/png',
              },
              {
                src: '/web-app-manifest-512x512.png',
                sizes: '512x512',
                type: 'image/png',
              },
            ],
          },
        })]),

    // https://github.com/intlify/bundle-tools/tree/main/packages/unplugin-vue-i18n
    VueI18n({
      runtimeOnly: true,
      compositionOnly: true,
      fullInstall: true,
      include: [path.resolve(__dirname, 'locales/**')],
    }),

    // https://github.com/webfansplz/vite-plugin-vue-devtools
    VueDevTools(),

    live2dSdkDownloader(),

    live2dModelDownloader('hiyori_free_zh'),
    live2dModelDownloader('hiyori_pro_zh'),

    {
      name: 'vrm-models-sample-a',
      async configResolved(config) {
        const cacheDir = resolve(join(config.root, '.cache'))
        const publicDir = resolve(join(config.root, 'public'))

        try {
          if (!(await exists(resolve(join(cacheDir, 'assets/vrm/models/AvatarSample-A'))))) {
            await mkdir(join(cacheDir, 'assets/vrm/models/AvatarSample-A'), { recursive: true })

            console.log('Downloading VRM Model - Avatar Sample A...')
            const res = await ofetch('https://dist.ayaka.moe/vrm-models/VRoid-Hub/AvatarSample-A/AvatarSample_A.vrm', { responseType: 'arrayBuffer' })

            console.log('Saving VRM Model - Avatar Sample A...')
            await writeFile(join(cacheDir, 'assets/vrm/models/AvatarSample-A/AvatarSample_A.vrm'), Buffer.from(res))

            console.log('VRM Model - Avatar Sample A downloaded and saved.')
          }

          if (!(await exists(resolve(join(publicDir, 'assets/vrm/models/AvatarSample-A'))))) {
            await mkdir(join(publicDir, 'assets/vrm/models/AvatarSample-A'), { recursive: true }).catch(() => { })
            await cp(join(cacheDir, 'assets/vrm/models/AvatarSample-A'), join(publicDir, 'assets/vrm/models/AvatarSample-A'), { recursive: true })
          }
        }
        catch (err) {
          console.error(err)
          throw err
        }
      },
    },
    {
      name: 'vrm-models-sample-b',
      async configResolved(config) {
        const cacheDir = resolve(join(config.root, '.cache'))
        const publicDir = resolve(join(config.root, 'public'))

        try {
          if (!(await exists(resolve(join(cacheDir, 'assets/vrm/models/AvatarSample-B'))))) {
            await mkdir(join(cacheDir, 'assets/vrm/models/AvatarSample-B'), { recursive: true })

            console.log('Downloading VRM Model - Avatar Sample B...')
            const res = await ofetch('https://dist.ayaka.moe/vrm-models/VRoid-Hub/AvatarSample-B/AvatarSample_B.vrm', { responseType: 'arrayBuffer' })

            console.log('Saving VRM Model - Avatar Sample B...')
            await writeFile(join(cacheDir, 'assets/vrm/models/AvatarSample-B/AvatarSample_B.vrm'), Buffer.from(res))
          }

          if (!(await exists(resolve(join(publicDir, 'assets/vrm/models/AvatarSample-B'))))) {
            await mkdir(join(publicDir, 'assets/vrm/models/AvatarSample-B'), { recursive: true }).catch(() => { })
            await cp(join(cacheDir, 'assets/vrm/models/AvatarSample-B'), join(publicDir, 'assets/vrm/models/AvatarSample-B'), { recursive: true })
          }
        }
        catch (err) {
          console.error(err)
          throw err
        }
      },
    },

    // HuggingFace Spaces
    LFS({
      extraGlobs: [
        '*.vrm',
        '*.cmo3',
        '*.png',
        '*.jpg',
        '*.jpeg',
        '*.gif',
        '*.webp',
        '*.bmp',
      ],
    }),
    SpaceCard({
      title: 'アイリ VTuber',
      emoji: '🧸',
      colorFrom: 'pink',
      colorTo: 'pink',
      sdk: 'static',
      pinned: false,
      license: 'mit',
      models: ['onnx-community/whisper-base'],
      short_description: 'アイリ VTuber. LLM powered Live2D/VRM living character.',
    }),
  ],
})
