import Vue from '@vitejs/plugin-vue'
import { LFS, SpaceCard } from 'hfsup/vite'
import Unocss from 'unocss/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    Vue(),
    // https://github.com/antfu/unocss
    // see uno.config.ts for config
    Unocss(),

    // HuggingFace Spaces
    LFS(),
    SpaceCard({
      title: 'Real-time Whisper WebGPU (Vue)',
      emoji: '🎤',
      colorFrom: 'gray',
      colorTo: 'green',
      sdk: 'static',
      pinned: false,
      license: 'mit',
      models: ['onnx-community/whisper-base'],
      short_description: 'Yet another Real-time Whisper with WebGPU, written in Vue',
      thumbnail: 'https://raw.githubusercontent.com/moeru-ai/airi/refs/heads/main/packages/whisper-webgpu/public/banner.png',
    }),
  ],
})
