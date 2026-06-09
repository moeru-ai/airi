import { join, resolve } from 'node:path'

import Vue from '@vitejs/plugin-vue'
import Unocss from 'unocss/vite'
import VueMacros from 'vue-macros/vite'

import { defineConfig } from 'vite'

export default defineConfig({
  base: '/',
  resolve: {
    alias: {
      '@proj-airi/stage-shared': resolve(join(import.meta.dirname, '..', '..', 'packages', 'stage-shared', 'src')),
    },
  },
  server: {
    fs: {
      strict: false,
    },
  },
  build: {
    emptyOutDir: true,
    outDir: resolve(join(import.meta.dirname, 'dist')),
    sourcemap: true,
  },
  plugins: [
    VueMacros({
      plugins: {
        vue: Vue({
          include: [/\.vue$/, /\.md$/],
        }),
        vueJsx: false,
      },
      betterDefine: false,
    }),
    Unocss(),
  ],
})
