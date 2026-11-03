import Vue from '@vitejs/plugin-vue'
import UnoCSS from 'unocss/vite'

import { playwright } from '@vitest/browser-playwright'
import { normalizePath } from 'vite'
import { defineConfig } from 'vitest/config'

import { sharedUnoConfig } from '../../uno.config'

export default defineConfig({
  root: import.meta.dirname,
  plugins: [
    Vue(),
    UnoCSS({
      ...sharedUnoConfig(),
      configFile: false,
      // Vitest loads components after the stylesheet. Scan their source before the first CSS response.
      content: {
        filesystem: [
          `${normalizePath(import.meta.dirname)}/src/**/*.vue`,
        ],
      },
    }),
  ],
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'node',
          environment: 'node',
          include: ['src/**/*.test.ts'],
          exclude: ['src/**/*.browser.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'browser',
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
      },
    ],
  },
})
