import { resolve } from 'node:path'

import Vue from '@vitejs/plugin-vue'
import UnoCSS from 'unocss/vite'
import Info from 'unplugin-info/vite'
import VueRouter from 'vue-router/vite'

import { playwright } from '@vitest/browser-playwright'
import { defineConfig } from 'vitest/config'

import { sharedUnoConfig } from '../../uno.config'

export default defineConfig({
  root: import.meta.dirname,
  plugins: [
    Info(),
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
