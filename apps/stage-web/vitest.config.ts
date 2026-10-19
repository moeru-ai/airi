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
            // CI model-ready checks time out when these WebGL-heavy test files run in parallel.
            // Live2D Polaroid and VRM rendering compete for Chromium GPU resources.
            fileParallelism: false,
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
