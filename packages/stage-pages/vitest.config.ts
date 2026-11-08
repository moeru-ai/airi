import { resolve } from 'node:path'

import Vue from '@vitejs/plugin-vue'
import UnoCSS from 'unocss/vite'
import Info from 'unplugin-info/vite'
import VueRouter from 'vue-router/vite'

import { Cubism2Core } from '@proj-airi/unplugin-live2d-sdk/vite'
import { playwright } from '@vitest/browser-playwright'
import { normalizePath } from 'vite'
import { defineConfig } from 'vitest/config'

import { sharedUnoConfig } from '../../uno.config'

export default defineConfig({
  root: import.meta.dirname,
  plugins: [
    Info(),
    // Pages and shared stage-ui stores import `@proj-airi/stage-ui-live2d`, whose
    // runtime imports `virtual:live2d-sdk/cores`. Without this provider, the cold
    // dependency scan fails and Vite reloads tests while they run. Without sources,
    // the plugin reports an unavailable Cubism 2 capability.
    Cubism2Core(),
    Vue(),
    VueRouter({
      extensions: ['.vue'],
      dts: false,
      routesFolder: resolve(import.meta.dirname, 'src', 'pages'),
      exclude: ['**/components/**', '**/*.test.ts'],
    }),
    UnoCSS({
      ...sharedUnoConfig(),
      configFile: false,
      content: {
        filesystem: [
          `${normalizePath(import.meta.dirname)}/src/**/*.vue`,
          `${normalizePath(import.meta.dirname)}/../stage-ui/src/**/*.vue`,
          `${normalizePath(import.meta.dirname)}/../ui/src/**/*.vue`,
        ],
      },
    }),
  ],
  test: {
    include: ['src/**/*.browser.test.ts'],
    browser: {
      enabled: true,
      headless: true,
      // The Voiceprint page records from the microphone. Chromium then uses a fake device without a permission prompt.
      provider: playwright({ launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] } }),
      instances: [
        { browser: 'chromium' },
      ],
    },
  },
})
