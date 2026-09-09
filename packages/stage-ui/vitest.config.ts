import { cwd } from 'node:process'

import Vue from '@vitejs/plugin-vue'
import UnoCSS from 'unocss/vite'
import Info from 'unplugin-info/vite'
import VueRouter from 'vue-router/vite'

import { playwright } from '@vitest/browser-playwright'
import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'

import { sharedUnoConfig } from '../../uno.config'

export default defineConfig({
  root: import.meta.dirname,
  // Shared settings pages import these optional UI dependencies through the
  // component barrel. Bundle them before a browser test starts to avoid HMR.
  optimizeDeps: {
    include: ['embla-carousel-vue', 'html2canvas', 'node-vibrant/browser'],
  },
  plugins: [
    Info(),
    // Use the app's route-block transform when browser tests mount shared pages.
    VueRouter({ routesFolder: [], dts: false }),
    Vue(),
    UnoCSS({
      // Browser tests use product styles, not Histoire's hover-preview variants.
      ...sharedUnoConfig(),
      configFile: false,
      // Vitest loads components after the stylesheet. Scan their source before
      // the initial CSS response instead of relying on Vite's HMR updates.
      content: {
        filesystem: [
          `${import.meta.dirname}/src/**/*.vue`,
          `${import.meta.dirname}/../ui/src/**/*.vue`,
        ],
      },
    }),
  ],
  test: {
    env: loadEnv('test', cwd(), ''),
    projects: [
      {
        extends: true,
        test: {
          name: 'node',
          include: ['src/**/*.test.ts'],
          exclude: ['src/**/*.browser.test.ts'],
          fileParallelism: false,
          hookTimeout: 20_000,
          maxWorkers: 1,
          testTimeout: 20_000,
        },
      },
      {
        extends: true,
        test: {
          name: 'browser',
          include: ['src/**/*.browser.test.ts'],
          exclude: ['**/node_modules/**'],
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [
              { browser: 'chromium' },
            ],
          },
        },
      },
    ],
  },
})
