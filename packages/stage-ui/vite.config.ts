import type { Plugin } from 'vite'

import { join, resolve } from 'node:path'
import { env } from 'node:process'

import Vue from '@vitejs/plugin-vue'
import Unocss from 'unocss/vite'
import Yaml from 'unplugin-yaml/vite'
import Inspect from 'vite-plugin-inspect'

import { createS3Provider, WarpDrivePlugin } from '@proj-airi/vite-plugin-warpdrive'
import { defineConfig } from 'vite'

// For Histoire
export default defineConfig({
  resolve: {
    alias: {
      '@proj-airi/i18n': resolve(join(import.meta.dirname, '..', '..', 'packages', 'i18n', 'src')),
      '@proj-airi/stage-shared': resolve(join(import.meta.dirname, '..', '..', 'packages', 'stage-shared', 'src')),
    },
  },
  server: {
    fs: {
      allow: [join('..', '..')],
    },
  },
  optimizeDeps: {
    include: [
      // <MarkdownRenderer /> will be problematic in Histoire without these
      '@shikijs/rehype',
      'rehype-stringify',
      'remark-math',
      'remark-parse',
      'unified',
      // Histoire dependencies (Copied from Histoire's vite.ts)
      'flexsearch',
      'shiki',
      // Shiki dependencies
      'vscode-oniguruma',
      'vscode-textmate',
    ],
  },
  plugins: [
    // TODO: Type wrong for `unplugin-yaml` in Histoire required
    // Vite version, wait until Histoire updates to support Vite 7
    Yaml() as Plugin,
    Vue(),
    Unocss(),
    // TODO: Type wrong for `unplugin-yaml` in Histoire required
    // Vite version, wait until Histoire updates to support Vite 7
    Inspect() as Plugin,

    // For the following example assets:
    //
    // dist/assets/ort-wasm-simd-threaded.jsep-B0T3yYHD.wasm                21,596.01 kB │ gzip: 5,121.95 kB
    // dist/assets/XiaolaiSC-Regular-SNWuh554.ttf                           22,183.94 kB
    // dist/assets/cjkFonts_allseto_v1.11-ByBdljxl.ttf                      31,337.14 kB
    //
    // they are too large to be able to put into deployments like Cloudflare Workers or Pages,
    // we need to upload them to external storage and use renderBuiltUrl to rewrite their URLs.
    ...((!env.S3_ENDPOINT || !env.S3_ACCESS_KEY_ID || !env.S3_SECRET_ACCESS_KEY)
      ? []
      : [
          WarpDrivePlugin({
            prefix: env.STAGE_UI_WARP_DRIVE_PREFIX || 'proj-airi/stage-ui/main/',
            include: [/\.wasm$/i, /\.ttf$/i, /\.vrm$/i, /\.zip$/i], // in existing assets, wasm, ttf, vrm files are the largest ones
            manifest: true,
            contentTypeBy: (filename: string) => {
              if (filename.endsWith('.wasm')) {
                return 'application/wasm'
              }
              if (filename.endsWith('.ttf')) {
                return 'font/ttf'
              }
              if (filename.endsWith('.vrm')) {
                return 'application/octet-stream'
              }
              if (filename.endsWith('.zip')) {
                return 'application/zip'
              }
            },
            provider: createS3Provider({
              endpoint: env.S3_ENDPOINT,
              accessKeyId: env.S3_ACCESS_KEY_ID,
              secretAccessKey: env.S3_SECRET_ACCESS_KEY,
              region: env.S3_REGION,
              publicBaseUrl: env.WARP_DRIVE_PUBLIC_BASE ?? env.S3_ENDPOINT,
            }),
          }),
        ]),
  ],
})
