import { Buffer } from 'node:buffer'
import { mkdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { ofetch } from 'ofetch'

import { pwa } from './app/config/pwa'
import { appDescription } from './app/constants/index'
import { exists } from './scripts/fs'
import { unzip } from './scripts/unzip'

export default defineNuxtConfig({
  modules: [
    '@vueuse/nuxt',
    '@unocss/nuxt',
    '@pinia/nuxt',
    '@nuxtjs/color-mode',
    '@vite-pwa/nuxt',
    '@nuxt/eslint',
  ],

  devtools: {
    enabled: true,
  },

  app: {
    head: {
      viewport: 'width=device-width,initial-scale=1',
      link: [
        { rel: 'icon', href: '/favicon.ico', sizes: 'any' },
        { rel: 'icon', type: 'image/svg+xml', href: '/nuxt.svg' },
        { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
      ],
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'description', content: appDescription },
        { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' },
        { name: 'theme-color', media: '(prefers-color-scheme: light)', content: 'white' },
        { name: 'theme-color', media: '(prefers-color-scheme: dark)', content: '#222222' },
      ],
      script: [
        { src: '/assets/js/CubismSdkForWeb-5-r.1/Core/live2dcubismcore.min.js' },
      ],
    },
  },

  css: [
    '@unocss/reset/tailwind.css',
  ],

  colorMode: {
    classSuffix: '',
  },

  future: {
    compatibilityVersion: 4,
  },

  experimental: {
    // when using generate, payload js assets included in sw precache manifest
    // but missing on offline, disabling extraction it until fixed
    payloadExtraction: false,
    renderJsonPayloads: true,
    typedPages: true,
  },

  compatibilityDate: '2024-08-14',

  nitro: {
    esbuild: {
      options: {
        target: 'esnext',
      },
    },
    routeRules: {
      '/assets/**': { static: true },
      '/assets/js/**': { static: true },
      '/assets/live2d/models/**': { static: true },
    },
  },

  vite: {
    plugins: [
      {
        name: 'live2d-cubism-sdk',
        async configResolved(config) {
          const publicDir = resolve(join(config.root, '../public'))

          try {
            if (await exists(resolve(join(publicDir, 'assets/js/CubismSdkForWeb-5-r.1')))) {
              return
            }

            console.log('Downloading Cubism SDK...')
            const stream = await ofetch('https://dist.ayaka.moe/npm/live2d-cubism/CubismSdkForWeb-5-r.1.zip', { responseType: 'arrayBuffer' })

            console.log('Unzipping Cubism SDK...')
            await mkdir(join(publicDir, 'assets/js'), { recursive: true })
            await unzip(Buffer.from(stream), join(publicDir, 'assets/js'))

            console.log('Cubism SDK downloaded and unzipped.')
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
          const publicDir = resolve(join(config.root, '../public'))

          try {
            if (await exists(resolve(join(publicDir, 'assets/live2d/models/hiyori_free_zh')))) {
              return
            }

            console.log('Downloading Demo Live2D Model - Hiyori Free...')
            const stream = await ofetch('https://dist.ayaka.moe/live2d-models/hiyori_free_zh.zip', { responseType: 'arrayBuffer' })

            console.log('Unzipping Demo Live2D Model - Hiyori Free...')
            await mkdir(join(publicDir, 'assets/live2d/models'), { recursive: true })
            await unzip(Buffer.from(stream), join(publicDir, 'assets/live2d/models'))

            console.log('Demo Live2D Model - Hiyori Free downloaded and unzipped.')
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
          const publicDir = resolve(join(config.root, '../public'))

          try {
            if (await exists(resolve(join(publicDir, 'assets/live2d/models/hiyori_pro_zh')))) {
              return
            }

            console.log('Downloading Demo Live2D Model - Hiyori Pro...')
            const stream = await ofetch('https://dist.ayaka.moe/live2d-models/hiyori_pro_zh.zip', { responseType: 'arrayBuffer' })

            console.log('Unzipping Demo Live2D Model - Hiyori Pro...')
            await mkdir(join(publicDir, 'assets/live2d/models'), { recursive: true })
            await unzip(Buffer.from(stream), join(publicDir, 'assets/live2d/models'))

            console.log('Demo Live2D Model - Hiyori Pro downloaded and unzipped.')
          }
          catch (err) {
            console.error(err)
            throw err
          }
        },
      },
    ],
  },

  eslint: {
    config: {
      standalone: false,
      nuxt: {
        sortConfigKeys: true,
      },
    },
  },

  pwa,
})
