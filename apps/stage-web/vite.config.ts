import { join, resolve } from 'node:path'
import { cwd, env } from 'node:process'

import VueI18n from '@intlify/unplugin-vue-i18n/vite'
import Vue from '@vitejs/plugin-vue'
import Unocss from 'unocss/vite'
import Info from 'unplugin-info/vite'
import VueMacros from 'unplugin-vue-macros/vite'
import VueRouter from 'unplugin-vue-router/vite'
import Yaml from 'unplugin-yaml/vite'
import VueDevTools from 'vite-plugin-vue-devtools'
import Layouts from 'vite-plugin-vue-layouts'

import { Download } from '@proj-airi/unplugin-fetch/vite'
import { DownloadLive2DSDK } from '@proj-airi/unplugin-live2d-sdk/vite'
import { templateCompilerOptions } from '@tresjs/core'
import { LFS, SpaceCard } from 'hfup/vite'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

const providerEnvKeys = [
  'OPENAI_API_KEY',
  'OPENAI_BASE_URL',
  'OPENAI_MODEL',
  'OPENAI_COMPATIBLE_API_KEY',
  'OPENAI_COMPATIBLE_BASE_URL',
  'OPENAI_COMPATIBLE_MODEL',
  'OPENAI_SPEECH_MODEL',
  'OPENAI_COMPATIBLE_SPEECH_MODEL',
  'OPENAI_TRANSCRIPTION_MODEL',
  'OPENAI_COMPATIBLE_TRANSCRIPTION_MODEL',
  'OPENROUTER_API_KEY',
  'OPENROUTER_BASE_URL',
  'OPENROUTER_MODEL',
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_BASE_URL',
  'ANTHROPIC_MODEL',
  'GOOGLE_GENERATIVE_AI_API_KEY',
  'GOOGLE_GENERATIVE_AI_BASE_URL',
  'GOOGLE_GENERATIVE_AI_MODEL',
  'DEEPSEEK_API_KEY',
  'DEEPSEEK_BASE_URL',
  'DEEPSEEK_MODEL',
  'AI302_API_KEY',
  'AI302_BASE_URL',
  'AI302_MODEL',
  'TOGETHER_API_KEY',
  'TOGETHER_BASE_URL',
  'TOGETHER_MODEL',
  'XAI_API_KEY',
  'XAI_BASE_URL',
  'XAI_MODEL',
  'NOVITA_API_KEY',
  'NOVITA_BASE_URL',
  'NOVITA_MODEL',
  'FIREWORKS_API_KEY',
  'FIREWORKS_BASE_URL',
  'FIREWORKS_MODEL',
  'FEATHERLESS_API_KEY',
  'FEATHERLESS_BASE_URL',
  'FEATHERLESS_MODEL',
  'PERPLEXITY_API_KEY',
  'PERPLEXITY_BASE_URL',
  'PERPLEXITY_MODEL',
  'MISTRAL_API_KEY',
  'MISTRAL_BASE_URL',
  'MISTRAL_MODEL',
  'MOONSHOT_API_KEY',
  'MOONSHOT_BASE_URL',
  'MOONSHOT_MODEL',
  'MODELSCOPE_API_KEY',
  'MODELSCOPE_BASE_URL',
  'MODELSCOPE_MODEL',
  'CLOUDFLARE_WORKERS_AI_API_KEY',
  'CLOUDFLARE_WORKERS_AI_MODEL',
  'CLOUDFLARE_ACCOUNT_ID',
  'CLOUDFLARE_API_TOKEN',
  'OLLAMA_MODEL',
  'OLLAMA_EMBEDDING_MODEL',
  'LM_STUDIO_MODEL',
  'PLAYER2_MODEL',
  'PLAYER2_SPEECH_MODEL',
  'VLLM_MODEL',
  'VITE_AIRI_WS_URL',
  'DEFAULT_CHAT_PROVIDER',
  'DEFAULT_SPEECH_PROVIDER',
  'DEFAULT_TRANSCRIPTION_PROVIDER',
  'MEMORY_PROVIDER',
  'SHORT_TERM_MEMORY_PROVIDER',
  'SHORT_TERM_MEMORY_MAX_MESSAGES',
  'SHORT_TERM_MEMORY_TTL_SECONDS',
  'MEMORY_NAMESPACE',
  'LONG_TERM_MEMORY_PROVIDER',
  'MEMORY_LONG_TERM_PROVIDER',
  'MEMORY_EMBEDDING_PROVIDER',
  'MEMORY_EMBEDDING_API_KEY',
  'MEMORY_EMBEDDING_BASE_URL',
  'MEMORY_EMBEDDING_ACCOUNT_ID',
  'MEMORY_EMBEDDING_API_TOKEN',
  'MEMORY_EMBEDDING_MODEL',
  'DATABASE_URL',
  'POSTGRES_URL',
  'MEMORY_LONG_TERM_CONNECTION_STRING',
  'POSTGRES_HOST',
  'POSTGRES_PORT',
  'POSTGRES_DATABASE',
  'POSTGRES_DB',
  'POSTGRES_USER',
  'POSTGRES_PASSWORD',
  'MEMORY_LONG_TERM_ENABLED',
  'MEMORY_LONG_TERM_PROVIDER',
  'UPSTASH_KV_REST_API_URL',
  'UPSTASH_KV_REST_API_TOKEN',
  'UPSTASH_KV_REST_URL',
  'UPSTASH_KV_REST_TOKEN',
  'UPSTASH_KV_URL',
  'UPSTASH_REDIS_URL',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
]

const providerEnvDefine = providerEnvKeys.reduce<Record<string, string>>((acc, key) => {
  acc[`import.meta.env.${key}`] = JSON.stringify(env[key] ?? '')
  return acc
}, {})

export default defineConfig({
  define: providerEnvDefine,
  optimizeDeps: {
    exclude: [
      // Internal Packages
      '@proj-airi/stage-ui/*',
      '@proj-airi/drizzle-duckdb-wasm',
      '@proj-airi/drizzle-duckdb-wasm/*',

      // Static Assets: Models, Images, etc.
      'public/assets/*',

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
      '@proj-airi/stage-ui': resolve(join(import.meta.dirname, '..', '..', 'packages', 'stage-ui', 'src')),
      '@proj-airi/stage-pages': resolve(join(import.meta.dirname, '..', '..', 'packages', 'stage-pages', 'src')),
      'onnxruntime-node': 'onnxruntime-web',
    },
  },
  server: {
    warmup: {
      clientFiles: [
        `${resolve(join(import.meta.dirname, '..', '..', 'packages', 'stage-ui', 'src'))}/*.vue`,
        `${resolve(join(import.meta.dirname, '..', '..', 'packages', 'stage-pages', 'src'))}/*.vue`,
      ],
    },
  },
  plugins: [
    Info(),

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

    // https://github.com/posva/unplugin-vue-router
    VueRouter({
      extensions: ['.vue', '.md'],
      dts: resolve(import.meta.dirname, 'src/typed-router.d.ts'),
      importMode: 'async',
      routesFolder: [
        resolve(import.meta.dirname, 'src', 'pages'),
        resolve(import.meta.dirname, '..', '..', 'packages', 'stage-pages', 'src', 'pages'),
      ],
    }),

    // https://github.com/JohnCampionJr/vite-plugin-vue-layouts
    Layouts(),

    // https://github.com/antfu/unocss
    // see uno.config.ts for config
    Unocss(),

    // https://github.com/antfu/vite-plugin-pwa
    ...(env.TARGET_HUGGINGFACE_SPACE
      ? []
      : [VitePWA({
          registerType: 'autoUpdate',
          includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
          manifest: {
            name: 'AIRI',
            short_name: 'AIRI',
            icons: [
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
            ],
          },
          workbox: {
            maximumFileSizeToCacheInBytes: 64 * 1024 * 1024,
            clientsClaim: true,
            skipWaiting: true,
            cleanupOutdatedCaches: true,
            navigateFallbackDenylist: [
              /^\/docs\//,
              /^\/ui\//,
              /^\/remote-assets\//,
              /^\/api\//,
            ],
          },
        })]),

    // https://github.com/intlify/bundle-tools/tree/main/packages/unplugin-vue-i18n
    VueI18n({
      runtimeOnly: true,
      compositionOnly: true,
      fullInstall: true,
    }),

    // https://github.com/webfansplz/vite-plugin-vue-devtools
    VueDevTools(),

    DownloadLive2DSDK(),
    Download('https://dist.ayaka.moe/live2d-models/hiyori_free_zh.zip', 'hiyori_free_zh.zip', 'assets/live2d/models'),
    Download('https://dist.ayaka.moe/live2d-models/hiyori_pro_zh.zip', 'hiyori_pro_zh.zip', 'assets/live2d/models'),
    Download('https://dist.ayaka.moe/vrm-models/VRoid-Hub/AvatarSample-A/AvatarSample_A.vrm', 'AvatarSample_A.vrm', 'assets/vrm/models/AvatarSample-A'),
    Download('https://dist.ayaka.moe/vrm-models/VRoid-Hub/AvatarSample-B/AvatarSample_B.vrm', 'AvatarSample_B.vrm', 'assets/vrm/models/AvatarSample-B'),

    // HuggingFace Spaces
    LFS({ root: cwd(), extraGlobs: ['*.vrm', '*.vrma', '*.hdr', '*.cmo3', '*.png', '*.jpg', '*.jpeg', '*.gif', '*.webp', '*.bmp', '*.ttf'] }),
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
  ],
})
