import { resolve } from 'node:path'

import Vue from '@vitejs/plugin-vue'
import Unocss from 'unocss/vite'
import VueRouter from 'unplugin-vue-router/vite'

import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    VueRouter({
      dts: resolve(import.meta.dirname, 'src/typed-router.d.ts'),
      exclude: ['**/components/**'],
      extensions: ['.vue'],
      importMode: 'async',
      routesFolder: [
        resolve(import.meta.dirname, 'src', 'scenes'),
      ],
    }),

    Vue(),

    // https://github.com/antfu/unocss
    // see uno.config.ts for config
    Unocss(),
  ],
})
