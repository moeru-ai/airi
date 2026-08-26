import { join } from 'node:path'
import { cwd } from 'node:process'

import Vue from '@vitejs/plugin-vue'
import Info from 'unplugin-info/vite'

import { playwright } from '@vitest/browser-playwright'
import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'

export default defineConfig(({ mode }) => {
  return {
    plugins: [
      Info(),
    ],
    root: import.meta.dirname,
    test: {
      projects: [
        {
          extends: true,
          test: {
            env: loadEnv(mode, join(cwd(), 'packages', 'stage-ui'), ''),
            exclude: ['src/**/*.browser.test.ts'],
            fileParallelism: false,
            hookTimeout: 20_000,
            include: ['src/**/*.test.ts'],
            maxWorkers: 1,
            name: 'node',
            testTimeout: 20_000,
          },
        },
        {
          extends: true,
          plugins: [
            Vue(),
          ],
          test: {
            browser: {
              enabled: true,
              headless: true,
              instances: [
                { browser: 'chromium' },
              ],
              provider: playwright(),
            },
            exclude: ['**/node_modules/**'],
            include: ['**/*.browser.{spec,test}.ts'],
            name: 'browser',
          },
        },
      ],
    },
  }
})
