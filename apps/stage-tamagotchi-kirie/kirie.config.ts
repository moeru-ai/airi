import { join, resolve } from 'node:path'

import VueI18n from '@intlify/unplugin-vue-i18n/vite'
import templateCompilerOptions from '@tresjs/core/template-compiler-options'
import Vue from '@vitejs/plugin-vue'
import UnoCss from 'unocss/vite'
import Info from 'unplugin-info/vite'
import Yaml from 'unplugin-yaml/vite'
import Inspect from 'vite-plugin-inspect'
import VitePluginVueDevTools from 'vite-plugin-vue-devtools'
import Layouts from 'vite-plugin-vue-layouts'
import VueMacros from 'vue-macros/vite'
import VueRouter from 'vue-router/vite'

import { Download } from '@proj-airi/unplugin-fetch'
import { DownloadLive2DSDK } from '@proj-airi/unplugin-live2d-sdk'
import { defineKirieConfig } from 'kirie'

const stageUIAssetsRoot = resolve(join(import.meta.dirname, '..', '..', 'packages', 'stage-ui', 'src', 'assets'))
const sharedCacheDir = resolve(join(import.meta.dirname, '..', '..', '.cache'))
const rendererRoot = resolve(join(import.meta.dirname, 'src-web', 'src', 'renderer'))

export default defineKirieConfig({
  web: {
    vite: {
      build: {
        rolldownOptions: {
          input: {
            'main': resolve(join(import.meta.dirname, 'src-web', 'index.html')),
            'beat-sync': resolve(join(import.meta.dirname, 'src-web', 'beat-sync.html')),
          },
        },
      },

      optimizeDeps: {
        exclude: [
          // Internal Packages
          '@proj-airi/stage-ui/*',
          '@proj-airi/drizzle-duckdb-wasm',
          '@proj-airi/drizzle-duckdb-wasm/*',
          '@proj-airi/electron-screen-capture',

          // Static Assets: Models, Images, etc.
          'src/renderer/public/assets/*',

          // Live2D SDK
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
          // NOTICE: the @proj-airi/stage-ui alias resolves to a directory; rolldown
          // concatenates sub-paths without a file extension, so bare .ts files at the
          // stores/ root (e.g. mcp-tool-bridge.ts) are not found. Add explicit aliases
          // for each such file that the renderer imports from @proj-airi/stage-ui.
          '@proj-airi/stage-ui/stores/mcp-tool-bridge': resolve(join(import.meta.dirname, '..', '..', 'packages', 'stage-ui', 'src', 'stores', 'mcp-tool-bridge.ts')),
          '@proj-airi/stage-ui': resolve(join(import.meta.dirname, '..', '..', 'packages', 'stage-ui', 'src')),
          '@proj-airi/stage-pages': resolve(join(import.meta.dirname, '..', '..', 'packages', 'stage-pages', 'src')),
          '@proj-airi/stage-shared': resolve(join(import.meta.dirname, '..', '..', 'packages', 'stage-shared', 'src')),
          '@proj-airi/stage-host-context': resolve(rendererRoot, 'host-context', 'index.ts'),
        },
      },

      server: {
        fs: {
          // To mute errors like:
          //   The request id ".../node_modules/@fontsource/sniglet/files/sniglet-latin-400-normal.woff" is outside of Vite serving allow list.
          //
          // See: https://vite.dev/config/server-options#server-fs-strict
          strict: false,
        },
        warmup: {
          clientFiles: [
            `${resolve(join(import.meta.dirname, '..', '..', 'packages', 'stage-ui', 'src'))}/*.vue`,
            `${resolve(join(import.meta.dirname, '..', '..', 'packages', 'stage-pages', 'src'))}/*.vue`,
          ],
        },
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
        Info(),

        {
          name: 'proj-airi:defines',
          config(ctx) {
            const define: Record<string, string> = {
              'import.meta.env.RUNTIME_ENVIRONMENT': '\'electron\'',
            }
            if (ctx.mode === 'development') {
              define['import.meta.env.URL_MODE'] = '\'server\''
            }
            if (ctx.mode === 'production') {
              define['import.meta.env.URL_MODE'] = '\'file\''
            }

            return { define }
          },
        },

        Inspect(),

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
          dts: resolve(rendererRoot, 'typed-router.d.ts'),
          routesFolder: [
            {
              src: resolve(join(import.meta.dirname, '..', '..', 'packages', 'stage-pages', 'src', 'pages')),
              exclude: base => [
                ...base,
                '**/settings/account/index.vue',
                '**/settings/connection/index.vue',
                '**/settings/data/index.vue',
                '**/settings/models/index.vue',
                '**/settings/system/general.vue',
                '**/settings/modules/mcp.vue',
                '**/devtools/index.vue',
                '**/settings/index.vue',
              ],
            },
            resolve(rendererRoot, 'pages'),
          ],
          exclude: ['**/components/**'],
        }),

        VitePluginVueDevTools(),

        // https://github.com/JohnCampionJr/vite-plugin-vue-layouts
        Layouts({
          layoutsDirs: [
            resolve(rendererRoot, 'layouts'),
            resolve(join(import.meta.dirname, '..', '..', 'packages', 'stage-layouts', 'src', 'layouts')),
          ],
          pagesDirs: [resolve(rendererRoot, 'pages')],
        }),

        UnoCss(),

        // https://github.com/intlify/bundle-tools/tree/main/packages/unplugin-vue-i18n
        VueI18n({
          runtimeOnly: true,
          compositionOnly: true,
          fullInstall: true,
        }),

        DownloadLive2DSDK(),
        Download('https://dist.ayaka.moe/live2d-models/hiyori_free_zh.zip', 'hiyori_free_zh.zip', 'live2d/models', { parentDir: stageUIAssetsRoot, cacheDir: sharedCacheDir }),
        Download('https://dist.ayaka.moe/live2d-models/hiyori_pro_zh.zip', 'hiyori_pro_zh.zip', 'live2d/models', { parentDir: stageUIAssetsRoot, cacheDir: sharedCacheDir }),
        Download('https://dist.ayaka.moe/vrm-models/VRoid-Hub/AvatarSample-A/AvatarSample_A.vrm', 'AvatarSample_A.vrm', 'vrm/models/AvatarSample-A', { parentDir: stageUIAssetsRoot, cacheDir: sharedCacheDir }),
        Download('https://dist.ayaka.moe/vrm-models/VRoid-Hub/AvatarSample-B/AvatarSample_B.vrm', 'AvatarSample_B.vrm', 'vrm/models/AvatarSample-B', { parentDir: stageUIAssetsRoot, cacheDir: sharedCacheDir }),
      ],
    },
  },
})
