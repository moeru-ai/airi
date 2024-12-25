import { templateCompilerOptions } from '@tresjs/core'
import Vue from '@vitejs/plugin-vue'
import Unocss from 'unocss/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    Vue({
      // Other config
      ...templateCompilerOptions,
    }),
    // https://github.com/antfu/unocss
    // see uno.config.ts for config
    Unocss(),
  ],
  worker: { format: 'es' },
})
