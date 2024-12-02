import { Buffer } from 'node:buffer'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { ofetch } from 'ofetch'

import { appDescription } from './constants/index'
import { exists } from './scripts/fs'
import { unzip } from './scripts/unzip'

export default defineNuxtConfig({
  modules: [
    '@vueuse/nuxt',
    '@unocss/nuxt',
    '@pinia/nuxt',
    '@nuxtjs/color-mode',
    '@nuxt/eslint',
  ],

  ssr: false,

  experimental: {
    // when using generate, payload js assets included in sw pre-cache manifest
    // but missing on offline, disabling extraction it until fixed
    payloadExtraction: false,
    renderJsonPayloads: true,
    typedPages: true,
  },

  css: [
    '@unocss/reset/tailwind.css',
  ],

  colorMode: {
    classSuffix: '',
  },

  nitro: {
    esbuild: {
      options: {
        target: 'esnext',
      },
    },
    prerender: {
      crawlLinks: false,
      routes: ['/'],
      ignore: ['/hi'],
    },
    experimental: {
      websocket: true,
    },
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
        { src: './assets/js/CubismSdkForWeb-5-r.1/Core/live2dcubismcore.min.js' },
      ],
    },
  },

  devtools: {
    enabled: true,
  },

  features: {
    // For UnoCSS
    inlineStyles: false,
  },

  vite: {
    plugins: [
      {
        name: 'live2d-cubism',
        async configResolved(config) {
          if (await exists(join(config.root, 'public/assets/js/CubismSdkForWeb-5-r.1'))) {
            return
          }

          console.log('Downloading Cubism SDK...')
          const stream = await ofetch('https://dist.ayaka.moe/npm/live2d-cubism/CubismSdkForWeb-5-r.1.zip', { responseType: 'arrayBuffer' })

          console.log('Unzipping Cubism SDK...')
          await mkdir(join(config.root, 'public/assets/js'), { recursive: true })
          await unzip(Buffer.from(stream), join(config.root, 'public/assets/js'))

          console.log('Cubism SDK downloaded and unzipped.')
        },
      },
    ],
  },

  eslint: {
    config: {
      standalone: false,
    },
  },

  compatibilityDate: '2024-12-02',
})
