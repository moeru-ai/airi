import Vue from '@vitejs/plugin-vue'

import { playwright } from '@vitest/browser-playwright'
import { defineConfig, mergeConfig } from 'vitest/config'

import stageWebConfig from './vite.config'

export default defineConfig({
  plugins: [Vue()],
  test: {
    projects: [
      {
        extends: true,
        test: {
          environment: 'jsdom',
          exclude: ['src/**/*.browser.test.ts'],
          include: ['src/**/*.test.ts'],
          name: 'unit',
        },
      },
      mergeConfig(stageWebConfig, defineConfig({
        test: {
          browser: {
            enabled: true,
            headless: true,
            instances: [
              { browser: 'chromium' },
            ],
            provider: playwright(),
          },
          include: ['src/**/*.browser.test.ts'],
          name: 'browser',
          setupFiles: ['./src/test/setup-live2d.browser.ts'],
        },
      })),
    ],
  },
})
