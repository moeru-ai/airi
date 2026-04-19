import type { Plugin } from 'vite'

import process, { cwd, env } from 'node:process'

import { execSync } from 'node:child_process'
import { createReadStream, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

import VueI18n from '@intlify/unplugin-vue-i18n/vite'
import templateCompilerOptions from '@tresjs/core/template-compiler-options'
import Vue from '@vitejs/plugin-vue'
import Unocss from 'unocss/vite'
import Info from 'unplugin-info/vite'
import VueRouter from 'unplugin-vue-router/vite'
import Yaml from 'unplugin-yaml/vite'
import Mkcert from 'vite-plugin-mkcert'
import VueDevTools from 'vite-plugin-vue-devtools'
import Layouts from 'vite-plugin-vue-layouts'
import VueMacros from 'vue-macros/vite'

import { tryCatch } from '@moeru/std'
import { Download } from '@proj-airi/unplugin-fetch/vite'
import { DownloadLive2DSDK } from '@proj-airi/unplugin-live2d-sdk/vite'
import { createS3Provider, WarpDrivePlugin } from '@proj-airi/vite-plugin-warpdrive'
import { LFS, SpaceCard } from 'hfup/vite'
import { defineConfig, loadEnv } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

import { buildPepTutorVoiceEnvDefines } from './src/peptutor-voice-env-defines'
import { serveDoubaoRealtimeAsrProxy } from './src/server/doubao-realtime-asr-proxy'
import { serveDoubaoTtsProxy } from './src/server/doubao-tts-proxy'

const stageUIRoot = resolve(join(import.meta.dirname, '..', '..', 'packages', 'stage-ui'))
const stageUIAssetsRoot = resolve(join(import.meta.dirname, '..', '..', 'packages', 'stage-ui', 'src', 'assets'))
const repoRoot = resolve(join(import.meta.dirname, '..', '..', '..'))
const sharedCacheDir = resolve(join(import.meta.dirname, '..', '..', '.cache'))
const presetLive2dAssetRoutes = {
  '/__airi/live2d/preset/hiyori_free_zh': resolve(stageUIAssetsRoot, 'live2d', 'models', 'hiyori_free_zh.zip'),
  '/__airi/live2d/preset/hiyori_pro_zh': resolve(stageUIAssetsRoot, 'live2d', 'models', 'hiyori_pro_zh.zip'),
} as const
function hasFlagEnableMkcert(): boolean {
  if (process.argv.includes('--mkcert')) {
    return true
  }
  if (env.STAGE_WEB_ENABLE_MKCERT === 'true') {
    return true
  }

  return false
}

function servePresetLive2dAssets(): Plugin {
  return {
    name: 'peptutor-preset-live2d-assets',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const pathname = req.url ? req.url.split('?')[0] : ''
        const filePath = presetLive2dAssetRoutes[pathname as keyof typeof presetLive2dAssetRoutes]

        if (!filePath) {
          next()
          return
        }

        try {
          const fileStat = statSync(filePath)
          res.statusCode = 200
          res.setHeader('Cache-Control', 'no-cache')
          res.setHeader('Content-Length', fileStat.size)
          res.setHeader('Content-Type', 'application/octet-stream')

          if (req.method === 'HEAD') {
            res.end()
            return
          }

          createReadStream(filePath).pipe(res)
        }
        catch (error) {
          next(error as Error)
        }
      })
    },
    generateBundle() {
      for (const [routePath, filePath] of Object.entries(presetLive2dAssetRoutes)) {
        this.emitFile({
          type: 'asset',
          fileName: routePath.slice(1),
          source: readFileSync(filePath),
        })
      }
    },
  }
}

export default defineConfig(({ mode }) => {
  const repoEnv = loadEnv(mode, repoRoot, '')
  const appEnv = loadEnv(mode, import.meta.dirname, '')
  const stageUIEnv = loadEnv(mode, stageUIRoot, '')
  const mergedEnv = {
    ...repoEnv,
    ...stageUIEnv,
    ...appEnv,
    ...env,
  }
  const skipPepTutorRemoteAssetDownloads = ['1', 'true', 'yes'].includes(
    (mergedEnv.VITE_PEPTUTOR_SKIP_REMOTE_ASSET_DOWNLOADS || '').toLowerCase(),
  )

  return {
    define: buildPepTutorVoiceEnvDefines(mergedEnv),
    optimizeDeps: {
      include: [
        '@moeru/eventa',
        '@moeru/eventa/adapters/broadcast-channel',
        'clustr',
        'es-toolkit',
        'nanoid',
        'vue-router',
      ],
      exclude: [
        '@proj-airi/stage-ui/*',
        '@proj-airi/drizzle-duckdb-wasm',
        '@proj-airi/drizzle-duckdb-wasm/*',
        'public/assets/*',
        '@framework/live2dcubismframework',
        '@framework/math/cubismmatrix44',
        '@framework/type/csmvector',
        '@framework/math/cubismviewmatrix',
        '@framework/cubismdefaultparameterid',
        '@framework/cubismmodelsettingjson',
        '@framework/effect/cubismbreath',
        '@framework/effect/cubismeyeblink',
        '@framework/model/cubismusermodel',
        '@framework/motion/acubismmotion',
        '@framework/motion/cubismmotionqueuemanager',
        '@framework/type/csmmap',
        '@framework/utils/cubismdebug',
        '@framework/model/cubismmoc',
      ],
    },
    resolve: {
      alias: {
        '@proj-airi/server-sdk': resolve(join(import.meta.dirname, '..', '..', 'packages', 'server-sdk', 'src')),
        '@proj-airi/i18n': resolve(join(import.meta.dirname, '..', '..', 'packages', 'i18n', 'src')),
        '@proj-airi/stage-ui': resolve(join(import.meta.dirname, '..', '..', 'packages', 'stage-ui', 'src')),
        '@proj-airi/stage-pages': resolve(join(import.meta.dirname, '..', '..', 'packages', 'stage-pages', 'src')),
        '@proj-airi/stage-shared': resolve(join(import.meta.dirname, '..', '..', 'packages', 'stage-shared', 'src')),
        '@proj-airi/stage-layouts': resolve(join(import.meta.dirname, '..', '..', 'packages', 'stage-layouts', 'src')),
      },
    },
    server: {
      fs: {
        strict: false,
      },
      warmup: {
        clientFiles: [
          `${resolve(join(import.meta.dirname, '..', '..', 'packages', 'stage-ui', 'src'))}/*.vue`,
          `${resolve(join(import.meta.dirname, '..', '..', 'packages', 'stage-pages', 'src'))}/*.vue`,
        ],
      },
    },
    build: {
      sourcemap: true,
    },
    worker: {
      format: 'es',
      rollupOptions: {
        output: {
          inlineDynamicImports: false,
        },
      },
    },
    plugins: [
      ...(
        hasFlagEnableMkcert()
          ? [Mkcert((() => {
              const command = process.platform === 'win32' ? 'where' : 'which'
              const { data } = tryCatch(() => ({ mkcertPath: execSync(`${command} mkcert`, { stdio: 'pipe' }).toString().trim().split(/\r?\n/)[0] }))
              return data
            })())]
          : []
      ),
      Info(),
      servePresetLive2dAssets(),
      serveDoubaoRealtimeAsrProxy(mergedEnv),
      serveDoubaoTtsProxy(mergedEnv),
      Yaml(),
      VueMacros({
        plugins: {
          vue: Vue({
            include: [/\.vue$/, /\.md$/],
            ...templateCompilerOptions,
          }),
          vueJsx: false,
        },
        betterDefine: false,
      }),
      VueRouter({
        extensions: ['.vue', '.md'],
        dts: resolve(import.meta.dirname, 'src/typed-router.d.ts'),
        importMode: 'async',
        routesFolder: [
          resolve(import.meta.dirname, 'src', 'pages'),
          resolve(import.meta.dirname, '..', '..', 'packages', 'stage-pages', 'src', 'pages'),
        ],
        exclude: ['**/components/**'],
      }),
      Layouts({
        layoutsDirs: [
          resolve(import.meta.dirname, 'src', 'layouts'),
          resolve(import.meta.dirname, '..', '..', 'packages', 'stage-layouts', 'src', 'layouts'),
        ],
      }),
      Unocss(),
      ...(mergedEnv.TARGET_HUGGINGFACE_SPACE
        ? []
        : [VitePWA({
            registerType: 'autoUpdate',
            includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
            manifest: {
              name: 'AIRI',
              short_name: 'AIRI',
              icons: [
                {
                  src: '/web-app-manifest-192x192.png',
                  sizes: '192x192',
                  type: 'image/png',
                },
                {
                  src: '/web-app-manifest-512x512.png',
                  sizes: '512x512',
                  type: 'image/png',
                },
                {
                  purpose: 'maskable',
                  sizes: '192x192',
                  src: '/maskable_icon_x192.png',
                  type: 'image/png',
                },
                {
                  purpose: 'maskable',
                  sizes: '512x512',
                  src: '/maskable_icon_x512.png',
                  type: 'image/png',
                },
              ],
            },
            workbox: {
              maximumFileSizeToCacheInBytes: 64 * 1024 * 1024,
              navigateFallbackDenylist: [
                /^\/docs\//,
                /^\/ui\//,
                /^\/remote-assets\//,
                /^\/api\//,
              ],
            },
          })]),
      VueI18n({
        runtimeOnly: true,
        compositionOnly: true,
        fullInstall: true,
      }),
      VueDevTools(),
      ...(skipPepTutorRemoteAssetDownloads
        ? []
        : [
            DownloadLive2DSDK(),
            Download('https://dist.ayaka.moe/live2d-models/hiyori_free_zh.zip', 'hiyori_free_zh.zip', 'live2d/models', { parentDir: stageUIAssetsRoot, cacheDir: sharedCacheDir }),
            Download('https://dist.ayaka.moe/live2d-models/hiyori_pro_zh.zip', 'hiyori_pro_zh.zip', 'live2d/models', { parentDir: stageUIAssetsRoot, cacheDir: sharedCacheDir }),
            Download('https://dist.ayaka.moe/vrm-models/VRoid-Hub/AvatarSample-A/AvatarSample_A.vrm', 'AvatarSample_A.vrm', 'vrm/models/AvatarSample-A', { parentDir: stageUIAssetsRoot, cacheDir: sharedCacheDir }),
            Download('https://dist.ayaka.moe/vrm-models/VRoid-Hub/AvatarSample-B/AvatarSample_B.vrm', 'AvatarSample_B.vrm', 'vrm/models/AvatarSample-B', { parentDir: stageUIAssetsRoot, cacheDir: sharedCacheDir }),
          ]),
      LFS({ root: cwd(), extraGlobs: [
        '*.vrm',
        '*.vrma',
        '*.hdr',
        '*.cmo3',
        '*.png',
        '*.jpg',
        '*.jpeg',
        '*.gif',
        '*.webp',
        '*.bmp',
        '*.ttf',
        '*.avif',
        '*.task',
      ] }),
      SpaceCard({
        root: cwd(),
        title: 'AIRI: Virtual Companion',
        emoji: '🧸',
        colorFrom: 'pink',
        colorTo: 'pink',
        sdk: 'static',
        pinned: false,
        license: 'mit',
        models: [
          'onnx-community/whisper-base',
          'onnx-community/silero-vad',
        ],
        short_description: 'AI driven VTuber & Companion, supports Live2D and VRM.',
      }),
      ...((!mergedEnv.S3_ENDPOINT || !mergedEnv.S3_ACCESS_KEY_ID || !mergedEnv.S3_SECRET_ACCESS_KEY)
        ? []
        : [
            WarpDrivePlugin({
              prefix: mergedEnv.STAGE_WEB_WARP_DRIVE_PREFIX || 'proj-airi/stage-web/main/',
              include: [/\.wasm$/i, /\.ttf$/i, /\.vrm$/i, /\.zip$/i],
              manifest: true,
              clean: false,
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
                endpoint: mergedEnv.S3_ENDPOINT,
                accessKeyId: mergedEnv.S3_ACCESS_KEY_ID,
                secretAccessKey: mergedEnv.S3_SECRET_ACCESS_KEY,
                region: mergedEnv.S3_REGION,
                publicBaseUrl: mergedEnv.WARP_DRIVE_PUBLIC_BASE ?? mergedEnv.S3_ENDPOINT,
              }),
            }),
          ]),
    ],
  }
})
