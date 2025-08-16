import { join, resolve } from 'node:path'
import { cwd, env } from 'node:process'

import VueI18n from '@intlify/unplugin-vue-i18n/vite'
import Vue from '@vitejs/plugin-vue'
import Unocss from 'unocss/vite'
import Info from 'unplugin-info/vite'
import VueMacros from 'unplugin-vue-macros/vite'
import VueRouter from 'unplugin-vue-router/vite'
import Yaml from 'unplugin-yaml/vite'
import VueDevTools from 'vite-plugin-vue-devtools'
import Layouts from 'vite-plugin-vue-layouts'

import { Download } from '@proj-airi/unplugin-fetch/vite'
import { DownloadLive2DSDK } from '@proj-airi/unplugin-live2d-sdk/vite'
import { templateCompilerOptions } from '@tresjs/core'
import { LFS, SpaceCard } from 'hfup/vite'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  optimizeDeps: {
    exclude: [
      // Internal Packages
      '@proj-airi/stage-ui/*',
      '@proj-airi/drizzle-duckdb-wasm',
      '@proj-airi/drizzle-duckdb-wasm/*',

      // Static Assets: Models, Images, etc.
      'public/assets/*',

      // Live2D SDK
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
      '@proj-airi/stage-ui/components/scenarios/settings/model-settings': resolve(join(import.meta.dirname, '..', '..', 'packages', 'stage-ui', 'src', 'components', 'Scenarios', 'Settings', 'ModelSettings')),
      '@proj-airi/stage-ui/components/scenes': resolve(join(import.meta.dirname, '..', '..', 'packages', 'stage-ui', 'src', 'components', 'Scenes')),
      '@proj-airi/stage-ui/stores': resolve(join(import.meta.dirname, '..', '..', 'packages', 'stage-ui', 'src', 'stores')),
      '@proj-airi/stage-ui': resolve(join(import.meta.dirname, '..', '..', 'packages', 'stage-ui', 'src')),
      '@proj-airi/i18n': resolve(join(import.meta.dirname, '..', '..', 'packages', 'i18n', 'src')),
    },
  },

  plugins: [
    Info(),

    Yaml(),

    VueMacros({
      plugins: {
        vue: Vue({
          include: [/\.vue$/, /\.md$/],
          ...templateCompilerOptions,
        }),
        vueJsx: false,
      },
      betterDefine: false,
    }),

    // https://github.com/posva/unplugin-vue-router
    VueRouter({
      extensions: ['.vue', '.md'],
      dts: resolve(import.meta.dirname, 'src/typed-router.d.ts'),
      importMode: 'async',
    }),

    // https://github.com/JohnCampionJr/vite-plugin-vue-layouts
    Layouts(),

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
            name: 'AIRI',
            short_name: 'AIRI',
            icons: [
              {
                purpose: 'maskable',
                sizes: '192x192',
                src: '/maskable_icon_x192.png',
                type: 'image/png',
              },
              {
                purpose: 'maskable',
                sizes: '512x512',
                src: '/maskable_icon_x512.png',
                type: 'image/png',
              },
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
          workbox: {
            maximumFileSizeToCacheInBytes: 64 * 1024 * 1024,
            navigateFallbackDenylist: [
              /^\/docs\//,
              /^\/ui\//,
              /^\/remote-assets\//,
              /^\/api\//,
            ],
          },
        })]),

    // https://github.com/intlify/bundle-tools/tree/main/packages/unplugin-vue-i18n
    VueI18n({
      runtimeOnly: true,
      compositionOnly: true,
      fullInstall: true,
    }),

    // https://github.com/webfansplz/vite-plugin-vue-devtools
    VueDevTools(),

    DownloadLive2DSDK(),
    Download('https://dist.ayaka.moe/live2d-models/hiyori_free_zh.zip', 'hiyori_free_zh.zip', 'assets/live2d/models'),
    Download('https://dist.ayaka.moe/live2d-models/hiyori_pro_zh.zip', 'hiyori_pro_zh.zip', 'assets/live2d/models'),
    Download('https://dist.ayaka.moe/vrm-models/VRoid-Hub/AvatarSample-A/AvatarSample_A.vrm', 'AvatarSample_A.vrm', 'assets/vrm/models/AvatarSample-A'),
    Download('https://dist.ayaka.moe/vrm-models/VRoid-Hub/AvatarSample-B/AvatarSample_B.vrm', 'AvatarSample_B.vrm', 'assets/vrm/models/AvatarSample-B'),

    // HuggingFace Spaces
    LFS({ root: cwd(), extraGlobs: ['*.vrm', '*.vrma', '*.hdr', '*.cmo3', '*.png', '*.jpg', '*.jpeg', '*.gif', '*.webp', '*.bmp', '*.ttf'] }),
    SpaceCard({
      root: cwd(),
      title: 'AIRI: Virtual Companion',
      emoji: '🧸',
      colorFrom: 'pink',
      colorTo: 'pink',
      sdk: 'static',
      pinned: false,
      license: 'mit',
      models: [
        'onnx-community/whisper-base',
        'onnx-community/silero-vad',
      ],
      short_description: 'AI driven VTuber & Companion, supports Live2D and VRM.',
    }),
  ],
})
