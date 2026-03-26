import { resolve } from 'node:path'

import Unocss from 'unocss/vite'
import VueRouter from 'unplugin-vue-router/vite'
import Vue from 'unplugin-vue/vite'

import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    // https://github.com/posva/unplugin-vue-router
    VueRouter({
      extensions: ['.vue', '.md'],
      dts: resolve(import.meta.dirname, 'src', 'typed-router.d.ts'),
    }),
    Vue(),
    // https://github.com/antfu/unocss
    // see uno.config.ts for config
    Unocss(),
  ],
})
