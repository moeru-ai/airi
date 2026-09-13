import { join, resolve } from 'node:path'

import Vue from '@vitejs/plugin-vue'

import { Download } from '@proj-airi/unplugin-fetch'
import { defineConfig } from 'vite'

const stageAssetRoot = resolve(import.meta.dirname)
const sharedCacheDir = resolve(join(import.meta.dirname, '..', '..', '.cache', 'live2d'))
console.info({
  stageAssetRoot,
  sharedCacheDir,
})

export default defineConfig({
  plugins: [
    Vue(),
    Download('https://dist.ayaka.moe/live2d-models/hiyori_free_zh.zip', 'hiyori_free_zh.zip', 'models/hiyori', { parentDir: stageAssetRoot, cacheDir: sharedCacheDir }),
    Download('https://dist.ayaka.moe/live2d-models/hiyori_pro_zh.zip', 'hiyori_pro_zh.zip', 'models/hiyori', { parentDir: stageAssetRoot, cacheDir: sharedCacheDir }),
  ],
  base: './',
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  build: {
    sourcemap: true,
    write: false,
    rollupOptions: {
      external: [
        './models',
      ],
    },
    lib: {
      entry: 'src/index.ts',
      formats: ['es'],
    },
  },
})
