import { execFileSync } from 'node:child_process'
import { join, resolve } from 'node:path'
import { env } from 'node:process'

import ErgosphereMain from '@ergosphere-it/electron/vite/main'
import ErgospherePreload from '@ergosphere-it/electron/vite/preload'
import ErgosphereRenderer from '@ergosphere-it/electron/vite/renderer'
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

import { paraformerBilingualZhEn, xAsrBilingualZhEnInt8, zipformerMultilingual } from '@proj-airi/provider-inference/sherpaw-transcription/models'
import { createSettingsSearch } from '@proj-airi/stage-pages/vite/settings-search'
import { speakerModel } from '@proj-airi/stage-shared/speaker-model'
import { kwsModel } from '@proj-airi/stage-ui/libs/voice/kws-model-info'
import { Download } from '@proj-airi/unplugin-fetch'
import { DownloadLive2DSDK } from '@proj-airi/unplugin-live2d-sdk'
import { resolveModelEndpoint, Sherpaw } from '@proj-airi/vite-plugin-sherpaw'
import { defineConfig } from 'electron-vite'

const stageUIAssetsRoot = resolve(join(import.meta.dirname, '..', '..', 'packages', 'stage-ui', 'src', 'assets'))
const sharedCacheDir = resolve(join(import.meta.dirname, '..', '..', '.cache'))
const settingsSearch = createSettingsSearch()
const sherpawModels = [paraformerBilingualZhEn, zipformerMultilingual, xAsrBilingualZhEnInt8]
/** Main downloads remote Sherpaw models. It must use the endpoint that the renderer plugin uses. */
const sherpawModelEndpoint = resolveModelEndpoint()

/**
 * The time that `~build/time` reports.
 *
 * Two builds of one commit must give the same bytes in `out/`, so this value is not the wall clock.
 * A packager can set `SOURCE_DATE_EPOCH` (https://reproducible-builds.org/specs/source-date-epoch/).
 * Otherwise, the build uses the committer time of `HEAD`.
 * If git cannot read the commit, `unplugin-info` uses the wall clock and the build is not reproducible.
 */
function resolveBuildTime() {
  const sourceDateEpoch = env.SOURCE_DATE_EPOCH?.trim()
  if (sourceDateEpoch)
    return new Date(Number(sourceDateEpoch) * 1000)

  try {
    const committedAt = execFileSync('git', ['log', '-1', '--format=%ct'], { cwd: import.meta.dirname, encoding: 'utf8' })
    return new Date(Number(committedAt.trim()) * 1000)
  }
  catch {
    return undefined
  }
}

const buildTime = resolveBuildTime()

/** The renderer chunk that holds the `unplugin-info` modules. Its file name has no hash. */
const buildInfoChunkName = 'build-info'

export default defineConfig({
  main: {
    define: {
      'import.meta.env.SHERPAW_MODEL_ENDPOINT': JSON.stringify(sherpawModelEndpoint),
    },
    build: {
      // electron-vite externalizes exactly the `dependencies` of package.json.
      // electron-builder copies only `dependencies` into app.asar.
      // Keep only native modules there: they use `__dirname` or load `.node` and binary files at runtime.
      // Put every pure JS package in `devDependencies`, so main bundles it and app.asar does not copy it again.
      externalizeDeps: true,
    },
    plugins: [
      ErgosphereMain({ launcher: 'src/launcher/index.ts' }),

      {
        // To replace `build.rolldownOptions`, as electron-vite still uses the deprecated
        // `rollupOptions`, using `rollupOptions` and `rolldownOptions` at the same
        // time may lead to unexpected merge results. Using `rollupOptions` to manipulate
        // `manualChunks` also did not work. Therefore, it was transformed into a plugin
        // declaration with the recommended `codeSplitting` option.
        name: 'manual-chunks',
        outputOptions(options) {
          options.codeSplitting = {
            groups: [
              {
                name(moduleId) {
                  // https://github.com/lobehub/lobehub/blob/6ecba929b738e1259e15d17e7643941e015324ee/apps/desktop/electron.vite.config.ts#L54
                  // Prevent debug package from being bundled into index.js to avoid side-effect pollution
                  if (moduleId.includes('node_modules/debug')) {
                    return 'vendor-debug'
                  }
                },
              },
              {
                name(moduleId) {
                  // https://github.com/lobehub/lobehub/blob/6ecba929b738e1259e15d17e7643941e015324ee/apps/desktop/electron.vite.config.ts#L54
                  // Prevent debug package from being bundled into index.js to avoid side-effect pollution
                  if (moduleId.includes('node_modules/h3')) {
                    return 'vendor-h3'
                  }
                },
              },
            ],
          }

          return options
        },
      },
      Info({ time: buildTime }),
      // Main bundles `@proj-airi/i18n/locales`, and its locale sources are YAML files.
      Yaml(),
    ],

    resolve: {
      alias: {
        '@proj-airi/i18n': resolve(join(import.meta.dirname, '..', '..', 'packages', 'i18n', 'src')),
        '@proj-airi/server-runtime/server': resolve(join(import.meta.dirname, '..', '..', 'packages', 'server-runtime', 'src', 'server', 'index.ts')),
        '@proj-airi/server-runtime': resolve(join(import.meta.dirname, '..', '..', 'packages', 'server-runtime', 'src', 'index.ts')),
      },
    },
  },

  preload: {
    build: {
      lib: {
        entry: {
          'index': resolve(join(import.meta.dirname, 'src', 'preload', 'index.ts')),
          'beat-sync': resolve(join(import.meta.dirname, 'src', 'preload', 'beat-sync.ts')),
        },
      },
    },

    plugins: [
      ErgospherePreload(),
    ],
  },

  renderer: {
    // Thanks to [@Maqsyo](https://github.com/Maqsyo)
    // https://github.com/alex8088/electron-vite/issues/99#issuecomment-1862671727
    base: './',

    experimental: {
      renderBuiltUrl(filename, { type }) {
        if (type === 'asset' && /^assets\/preload(?:\.js)?-[\w-]+\.(?:data|metadata)$/.test(filename))
          return `airi-sherpaw://assets/${filename.slice('assets/'.length)}`
      },
    },

    build: {
      rolldownOptions: {
        input: {
          'main': resolve(join(import.meta.dirname, 'src', 'renderer', 'index.html')),
          'beat-sync': resolve(join(import.meta.dirname, 'src', 'renderer', 'beat-sync.html')),
        },
        output: {
          // `~build/git` and `~build/time` change with each commit. An update downloads each file whose hash changed.
          // The build info goes into a small chunk with a fixed name. Then the names of the chunks that import it
          // do not change, and a new commit does not rename the other chunks.
          codeSplitting: {
            groups: [{ name: buildInfoChunkName, test: /^\0~build\// }],
          },
          chunkFileNames: chunk => chunk.name === buildInfoChunkName ? `assets/${buildInfoChunkName}.js` : 'assets/[name]-[hash].js',
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
        // stores/ root (e.g. mcp-tool-bridge.ts) are not found.  Add explicit aliases
        // for each such file that the renderer imports from @proj-airi/stage-ui.
        '@proj-airi/stage-ui/stores/mcp-tool-bridge': resolve(join(import.meta.dirname, '..', '..', 'packages', 'stage-ui', 'src', 'stores', 'mcp-tool-bridge.ts')),
        '@proj-airi/stage-ui': resolve(join(import.meta.dirname, '..', '..', 'packages', 'stage-ui', 'src')),
        '@proj-airi/stage-pages': resolve(join(import.meta.dirname, '..', '..', 'packages', 'stage-pages', 'src')),
        '@proj-airi/stage-shared': resolve(join(import.meta.dirname, '..', '..', 'packages', 'stage-shared', 'src')),
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
      Info({ time: buildTime }),
      ErgosphereRenderer(),

      {
        name: 'proj-airi:defines',
        config(ctx) {
          const define: Record<string, any> = {
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

      settingsSearch.plugin,

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
        dts: resolve(import.meta.dirname, 'src/renderer/typed-router.d.ts'),
        routesFolder: [
          {
            src: resolve(import.meta.dirname, '..', '..', 'packages', 'stage-pages', 'src', 'pages'),
            exclude: base => [
              ...base,
              '**/settings/account/index.vue',
              '**/settings/connection/index.vue',
              '**/settings/data/index.vue',
              '**/settings/models/index.vue',
              '**/settings/system/general.vue',
              '**/settings/modules/home-assistant.vue',
              '**/settings/modules/mcp.vue',
              '**/devtools/index.vue',
              '**/settings/index.vue',
            ],
          },
          resolve(import.meta.dirname, 'src', 'renderer', 'pages'),
        ],
        exclude: ['**/components/**'],
        extendRoute: settingsSearch.extendRoute,
      }),

      VitePluginVueDevTools(),

      // https://github.com/JohnCampionJr/vite-plugin-vue-layouts
      Layouts({
        layoutsDirs: [
          resolve(import.meta.dirname, 'src', 'renderer', 'layouts'),
          resolve(import.meta.dirname, '..', '..', 'packages', 'stage-layouts', 'src', 'layouts'),
        ],
        pagesDirs: [resolve(import.meta.dirname, 'src', 'renderer', 'pages')],
      }),
      {
        // NOTICE:
        // Checkouts at different paths must build the same chunks.
        // The layouts virtual id looks absolute, so its `//#region` comment gets one `../` per parent directory.
        // Source: MODULE_ID_VIRTUAL in node_modules/vite-plugin-vue-layouts/dist/index.mjs (0.11.0).
        // Remove when the plugin uses a `\0` virtual id.
        name: 'proj-airi:layouts-region-comment',
        apply: 'build',
        renderChunk(code) {
          const stable = code.replace(/(\/\/#region )(?:\.\.\/)+(@vite-plugin-vue-layouts\/)/g, '$1$2')
          return stable === code ? undefined : { code: stable, map: null }
        },
      },

      UnoCss(),

      // https://github.com/intlify/bundle-tools/tree/main/packages/unplugin-vue-i18n
      VueI18n({
        runtimeOnly: true,
        compositionOnly: true,
        fullInstall: true,
      }),

      // Main downloads remote transcription models. Every build bundles the wake word and voiceprint models,
      // and development serves them from the cache, because main's model asset service does not serve them.
      // The voiceprint model adds about 28 MB, but users then enroll without a download that can fail.
      Sherpaw({
        models: [...sherpawModels, kwsModel, speakerModel],
        developmentModels: [kwsModel, speakerModel],
        bundledModels: env.SHERPAW_BUNDLE_MODELS === 'true' ? [xAsrBilingualZhEnInt8, kwsModel, speakerModel] : [kwsModel, speakerModel],
        cacheDir: sharedCacheDir,
        endpoint: sherpawModelEndpoint,
      }),
      DownloadLive2DSDK(),
      Download('https://dist.ayaka.moe/live2d-models/hiyori_free_zh.zip', 'hiyori_free_zh.zip', 'live2d/models', { parentDir: stageUIAssetsRoot, cacheDir: sharedCacheDir }),
      Download('https://dist.ayaka.moe/live2d-models/hiyori_pro_zh.zip', 'hiyori_pro_zh.zip', 'live2d/models', { parentDir: stageUIAssetsRoot, cacheDir: sharedCacheDir }),
      Download('https://dist.ayaka.moe/vrm-models/VRoid-Hub/AvatarSample-A/AvatarSample_A.vrm', 'AvatarSample_A.vrm', 'vrm/models/AvatarSample-A', { parentDir: stageUIAssetsRoot, cacheDir: sharedCacheDir }),
      Download('https://dist.ayaka.moe/vrm-models/VRoid-Hub/AvatarSample-B/AvatarSample_B.vrm', 'AvatarSample_B.vrm', 'vrm/models/AvatarSample-B', { parentDir: stageUIAssetsRoot, cacheDir: sharedCacheDir }),
    ],
  },
})
