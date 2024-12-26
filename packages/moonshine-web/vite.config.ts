import { templateCompilerOptions } from '@tresjs/core'
import Vue from '@vitejs/plugin-vue'
import { LFS, SpaceCard } from 'hfsup/vite'
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

    // HuggingFace Spaces
    LFS(),
    SpaceCard({
      title: 'Moonshine Web (Vue)',
      emoji: '🌙',
      colorFrom: 'blue',
      colorTo: 'pink',
      sdk: 'static',
      pinned: false,
      license: 'mit',
      models: ['onnx-community/moonshine-base-ONNX'],
      short_description: 'Yet another Real-time in-browser STT, re-implemented in Vue',
      thumbnail: 'https://raw.githubusercontent.com/moeru-ai/airi/refs/heads/main/packages/moonshine-web/public/banner.png',
    }),
  ],
  worker: { format: 'es' },
})
