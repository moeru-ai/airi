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
          name: 'unit',
          environment: 'jsdom',
          include: ['src/**/*.test.ts'],
          exclude: ['src/**/*.browser.test.ts'],
        },
      },
      mergeConfig(stageWebConfig, defineConfig({
        test: {
          name: 'browser',
          include: ['src/**/*.browser.test.ts'],
          setupFiles: ['./src/test/setup-live2d.browser.ts'],
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [
              { browser: 'chromium' },
            ],
          },
        },
      })),
    ],
  },
})
