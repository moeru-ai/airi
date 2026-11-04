import { resolve } from 'node:path'

import Vue from '@vitejs/plugin-vue'
import UnoCss from 'unocss/vite'
import Info from 'unplugin-info/vite'
import VueRouter from 'vue-router/vite'

import { playwright } from '@vitest/browser-playwright'
import { defineConfig } from 'vitest/config'

const sourceRoot = resolve(import.meta.dirname, 'src-web', 'src')

export default defineConfig({
  root: import.meta.dirname,
  plugins: [
    Info(),
    Vue(),
    UnoCss(),
  ],
  resolve: {
    alias: {
      '@proj-airi/stage-host-context': resolve(sourceRoot, 'host-context', 'index.ts'),
    },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'node',
          include: ['src-web/src/**/*.test.ts'],
          exclude: ['src-web/src/**/*.browser.test.ts'],
        },
      },
      {
        extends: true,
        plugins: [
          // Pages carry a `<route>` block. This plugin turns the block into a module.
          VueRouter({ dts: false, routesFolder: [resolve(sourceRoot, 'pages')] }),
        ],
        test: {
          name: 'browser',
          include: ['src-web/src/**/*.browser.test.ts'],
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
