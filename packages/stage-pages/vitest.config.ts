import { resolve } from 'node:path'

import Vue from '@vitejs/plugin-vue'
import UnoCSS from 'unocss/vite'
import Info from 'unplugin-info/vite'
import VueRouter from 'vue-router/vite'

import { Cubism2Core } from '@proj-airi/unplugin-live2d-sdk/vite'
import { playwright } from '@vitest/browser-playwright'
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
          `${import.meta.dirname}/src/**/*.vue`,
          `${import.meta.dirname}/../stage-ui/src/**/*.vue`,
          `${import.meta.dirname}/../ui/src/**/*.vue`,
        ],
      },
    }),
  ],
  test: {
    include: ['src/**/*.browser.test.ts'],
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      instances: [
        { browser: 'chromium' },
      ],
    },
  },
})
