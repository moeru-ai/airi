import { join, resolve } from 'node:path'

import VueI18n from '@intlify/unplugin-vue-i18n/vite'
import Vue from '@vitejs/plugin-vue'
import Unocss from 'unocss/vite'
import Info from 'unplugin-info/vite'
import Yaml from 'unplugin-yaml/vite'
import VueDevTools from 'vite-plugin-vue-devtools'
import Layouts from 'vite-plugin-vue-layouts'
import VueMacros from 'vue-macros/vite'
import VueRouter from 'vue-router/vite'

import { defineConfig } from 'vite'

// NOTICE:
// Keep this namespace distinct from `/assets/`, where an earlier Pages SPA
// fallback allowed missing JavaScript URLs to cache index.html as immutable.
// Root cause: the old asset cache policy outlived the deployment that restored
// those files, so affected browsers cannot observe corrected response headers.
// Source/context: `apps/ui-server-auth/public/_headers` and `public/404.html`.
// Removal condition: keep the namespace permanently; reusing `/assets/` can
// reactivate poisoned browser entries that remain fresh for up to one year.
const assetsDirectory = 'assets-v2'

export default defineConfig({
  base: '/',
  optimizeDeps: {
    exclude: [
      // Internal Packages
      '@proj-airi/stage-ui/*',
    ],
  },

  resolve: {
    alias: {
      '@proj-airi/i18n': resolve(join(import.meta.dirname, '..', '..', 'packages', 'i18n', 'src')),
      '@proj-airi/stage-ui': resolve(join(import.meta.dirname, '..', '..', 'packages', 'stage-ui', 'src')),
      '@proj-airi/stage-shared': resolve(join(import.meta.dirname, '..', '..', 'packages', 'stage-shared', 'src')),
      '@proj-airi/stage-layouts': resolve(join(import.meta.dirname, '..', '..', 'packages', 'stage-layouts', 'src')),
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
      ],
    },
  },
  build: {
    assetsDir: assetsDirectory,
    emptyOutDir: true,
    manifest: true,
    outDir: resolve(join(import.meta.dirname, 'dist')),
    rolldownOptions: {
      output: {
        chunkFileNames: (chunkInfo) => {
          const containsAnalyticsModule = chunkInfo.moduleIds.some((moduleId) => {
            const normalizedModuleId = moduleId.replaceAll('\\', '/').toLowerCase()
            return normalizedModuleId.includes('analytics') || normalizedModuleId.includes('posthog')
          })

          // Keep analytics as the source-domain name, but explicitly map its
          // public URL to a neutral chunk name that filter lists cannot infer.
          return containsAnalyticsModule
            ? `${assetsDirectory}/chunk-[hash].js`
            : `${assetsDirectory}/[name]-[hash].js`
        },
      },
    },
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
    Info(),

    Yaml(),

    VueMacros({
      plugins: {
        vue: Vue({
          include: [/\.vue$/, /\.md$/],
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
      ],
      exclude: ['**/components/**'],
    }),

    // https://github.com/JohnCampionJr/vite-plugin-vue-layouts
    Layouts({
      layoutsDirs: [
        resolve(import.meta.dirname, '..', '..', 'packages', 'stage-layouts', 'src', 'layouts'),
      ],
      // Auth routes use only the plain layout. Loading other shared layouts
      // pulls the stage renderer, model assets, and local inference runtime
      // into the auth deployment.
      exclude: [
        '**/default.vue',
        '**/home.vue',
        '**/settings.vue',
        '**/stage.vue',
      ],
    }),

    // https://github.com/antfu/unocss
    // see uno.config.ts for config
    Unocss(),

    // https://github.com/intlify/bundle-tools/tree/main/packages/unplugin-vue-i18n
    VueI18n({
      runtimeOnly: true,
      compositionOnly: true,
      fullInstall: true,
    }),

    // https://github.com/webfansplz/vite-plugin-vue-devtools
    VueDevTools(),
  ],
})
