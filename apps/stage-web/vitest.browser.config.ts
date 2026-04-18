import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import Vue from '@vitejs/plugin-vue'

import { defineConfig } from 'vitest/config'

import { playwrightBrowserProvider } from './src/testing/vitest-playwright-provider'

const root = dirname(fileURLToPath(import.meta.url))

const browserOptimizeDeps = [
  'vue',
  'pinia',
  'vue-router',
]

const lessonBrowserAliases = [
  { find: 'expect-type', replacement: resolve(root, 'src/testing/lesson-browser-stubs/expect-type.ts') },
  { find: '@proj-airi/stage-layouts/components/Layouts/Header.vue', replacement: resolve(root, 'src/testing/lesson-browser-stubs/Header.ts') },
  { find: '@proj-airi/stage-layouts/components/Layouts/MobileHeader.vue', replacement: resolve(root, 'src/testing/lesson-browser-stubs/MobileHeader.ts') },
  { find: '@proj-airi/stage-layouts/components/Backgrounds', replacement: resolve(root, 'src/testing/lesson-browser-stubs/Backgrounds.ts') },
  { find: '@proj-airi/stage-layouts/composables/theme-color', replacement: resolve(root, 'src/testing/lesson-browser-stubs/theme-color.ts') },
  { find: '@proj-airi/stage-layouts/stores/background', replacement: resolve(root, 'src/testing/lesson-browser-stubs/background-store.ts') },
  { find: '@proj-airi/stage-ui/components/scenes', replacement: resolve(root, 'src/testing/lesson-browser-stubs/scenes.ts') },
  { find: '@proj-airi/stage-ui/stores/provider-env-bootstrap', replacement: resolve(root, 'src/testing/lesson-browser-stubs/provider-env-bootstrap.ts') },
  { find: '@proj-airi/stage-ui/stores/lesson-voice-hearing-fallback', replacement: resolve(root, 'src/testing/lesson-browser-stubs/lesson-voice-hearing-fallback.ts') },
  { find: '@proj-airi/stage-ui/stores/lesson-voice-speech-fallback', replacement: resolve(root, 'src/testing/lesson-browser-stubs/lesson-voice-speech-fallback.ts') },
  { find: '@proj-airi/stage-ui/stores/settings', replacement: resolve(root, 'src/testing/lesson-browser-stubs/settings.ts') },
  { find: '@proj-airi/stage-ui/stores/modules/hearing', replacement: resolve(root, 'src/testing/lesson-browser-stubs/hearing.ts') },
  { find: '@proj-airi/stage-ui/stores/modules/speech', replacement: resolve(root, 'src/testing/lesson-browser-stubs/speech.ts') },
  { find: '@proj-airi/stage-ui/stores/speech-runtime', replacement: resolve(root, 'src/testing/lesson-browser-stubs/speech-runtime.ts') },
  { find: '@proj-airi/ui', replacement: resolve(root, 'src/testing/lesson-browser-stubs/ui.ts') },
  { find: '~build/time', replacement: resolve(root, 'src/testing/lesson-browser-stubs/build-time.ts') },
  { find: '~build/git', replacement: resolve(root, 'src/testing/lesson-browser-stubs/build-git.ts') },
  { find: '~build/package', replacement: resolve(root, 'src/testing/lesson-browser-stubs/build-package.ts') },
  { find: '@proj-airi/server-sdk', replacement: resolve(root, '../../packages/server-sdk/src') },
  { find: '@proj-airi/i18n', replacement: resolve(root, '../../packages/i18n/src') },
  { find: '@proj-airi/stage-ui', replacement: resolve(root, '../../packages/stage-ui/src') },
  { find: '@proj-airi/stage-pages', replacement: resolve(root, '../../packages/stage-pages/src') },
  { find: '@proj-airi/stage-shared', replacement: resolve(root, '../../packages/stage-shared/src') },
  { find: '@proj-airi/stage-layouts', replacement: resolve(root, '../../packages/stage-layouts/src') },
] as const

export default defineConfig({
  plugins: [Vue() as any],
  resolve: {
    alias: lessonBrowserAliases,
  },
  optimizeDeps: {
    include: browserOptimizeDeps,
  },
  test: {
    name: 'stage-web-browser',
    include: ['src/**/*.browser.{spec,test}.ts'],
    exclude: ['**/node_modules/**', '**/.git/**'],
    browser: {
      provider: playwrightBrowserProvider(),
      enabled: true,
      headless: true,
      instances: [
        { browser: 'chromium' },
      ],
    },
  },
})
