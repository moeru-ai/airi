import { resolve } from 'node:path'

import Vue from '@vitejs/plugin-vue'
import Unocss from 'unocss/vite'
import VueRouter from 'unplugin-vue-router/vite'

import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    VueRouter({
      extensions: ['.vue'],
      dts: resolve(import.meta.dirname, 'src/typed-router.d.ts'),
      importMode: 'async',
      routesFolder: [
        resolve(import.meta.dirname, 'src', 'scenes'),
      ],
      exclude: ['**/components/**'],
    }),

    Vue(),

    // https://github.com/antfu/unocss
    // see uno.config.ts for config
    Unocss(),
  ],
})
