import { Buffer } from 'node:buffer'
import { copyFile, cp, mkdir, readFile, writeFile } from 'node:fs/promises'
import path, { join, resolve } from 'node:path'

import VueI18n from '@intlify/unplugin-vue-i18n/vite'
import { templateCompilerOptions } from '@tresjs/core'
import Vue from '@vitejs/plugin-vue'
import { LFS, SpaceCard } from 'hfsup/vite'
import { ofetch } from 'ofetch'
import Unocss from 'unocss/vite'
import Components from 'unplugin-vue-components/vite'
import VueMacros from 'unplugin-vue-macros/vite'
import VueRouter from 'unplugin-vue-router/vite'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import VueDevTools from 'vite-plugin-vue-devtools'
import Layouts from 'vite-plugin-vue-layouts'

import { exists } from './scripts/fs'
import { unzip } from './scripts/unzip'
import { appName } from './src/constants'

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
    VitePWA({
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
    }),

    // https://github.com/intlify/bundle-tools/tree/main/packages/unplugin-vue-i18n
    VueI18n({
      runtimeOnly: true,
      compositionOnly: true,
      fullInstall: true,
      include: [path.resolve(__dirname, 'locales/**')],
    }),

    // https://github.com/feat-agency/vite-plugin-webfont-dl
    // WebfontDownload(),

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
            await mkdir(join(publicDir, 'assets/js/CubismSdkForWeb-5-r.1/Core'), { recursive: true }).catch(() => {})
            await copyFile(join(cacheDir, 'assets/js/CubismSdkForWeb-5-r.1/Core/live2dcubismcore.min.js'), join(publicDir, 'assets/js/CubismSdkForWeb-5-r.1/Core/live2dcubismcore.min.js'))
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
            await mkdir(join(publicDir, 'assets/live2d/models'), { recursive: true }).catch(() => { })
            await cp(join(cacheDir, 'assets/live2d/models/hiyori_free_zh'), join(publicDir, 'assets/live2d/models/hiyori_free_zh'), { recursive: true })
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
            await mkdir(join(publicDir, 'assets/live2d/models'), { recursive: true }).catch(() => { })
            await cp(join(cacheDir, 'assets/live2d/models/hiyori_pro_zh'), join(publicDir, 'assets/live2d/models/hiyori_pro_zh'), { recursive: true })
          }

          const hiyoriEmotions = {
            EmotionHappy: [{ File: 'motion/hiyori_m08.motion3.json' }],
            EmotionSad: [{ File: 'motion/hiyori_m10.motion3.json' }],
            EmotionAngry: [{ File: 'motion/hiyori_m09.motion3.json' }],
            EmotionAwkward: [{ File: 'motion/hiyori_m04.motion3.json' }],
            EmotionThink: [{ File: 'motion/hiyori_m03.motion3.json' }],
            EmotionSurprise: [{ File: 'motion/hiyori_m03.motion3.json' }],
            EmotionQuestion: [{ File: 'motion/hiyori_m10.motion3.json' }],
          }

          const read = await readFile(join(publicDir, 'assets/live2d/models/hiyori_pro_zh/runtime/hiyori_pro_t11.model3.json'), 'utf-8')
          const model = JSON.parse(read.toString()) as { FileReferences: { Motions: Record<string, { File: string }[]> } }
          Object.assign(model.FileReferences.Motions, hiyoriEmotions)
          await writeFile(join(publicDir, 'assets/live2d/models/hiyori_pro_zh/runtime/hiyori_pro_t11.model3.json'), JSON.stringify(model, null, 4), 'utf-8')
        }
        catch (err) {
          console.error(err)
          throw err
        }
      },
    },
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
      emoji: '🌙',
      colorFrom: 'pink',
      colorTo: 'yellow',
      sdk: 'static',
      pinned: false,
      license: 'mit',
      models: ['onnx-community/whisper-base'],
      short_description: 'アイリ VTuber. LLM powered Live2D/VRM living character.',
      custom_headers: {
        'cross-origin-embedder-policy': 'require-corp',
        'cross-origin-opener-policy': 'same-origin',
        'cross-origin-resource-policy': 'cross-origin',
      },
    }),
  ],
})
